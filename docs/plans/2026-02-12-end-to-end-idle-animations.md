# End-to-End Idle Animation Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge `generate_idle_animations.py` and `rembg_idle_animations.py` into a single script that generates idle animations on the ComfyUI PC, removes backgrounds per-frame via RMBG on the same PC, downloads the transparent result to the Mac, and places it at the correct game path.

**Architecture:** The existing generation script (`generate_idle_animations.py`) already handles the full Wan 2.2 pipeline and batched polling. We extend it with a post-processing phase that runs after each creature's animation downloads: extract frames, queue per-frame RMBG jobs to ComfyUI, download transparent frames, reassemble, and copy to the game sprite directory. The RMBG script becomes inlined helper functions rather than a separate script.

**Tech Stack:** Python 3 (stdlib + Pillow), ComfyUI REST API at `http://10.5.0.2:8188`, RMBG-2.0 node, Wan 2.2 14B Q4 two-pass MoE models.

---

## Current State

### What exists
- `scripts/generate_idle_animations.py` — Generates animated webps via Wan 2.2 two-pass workflow, saves to `output/animated-sprites/{id}/idle.webp` (with white backgrounds).
- `scripts/rembg_idle_animations.py` — Standalone script that reads from `output/animated-sprites/`, extracts frames, runs per-frame RMBG on ComfyUI, reassembles transparent webp, saves to `public/assets/sprites/robots/{id}-idle.webp`.
- `public/js/ui/sprite-utils.js` — Game auto-detects `{id}-idle.webp` via `configureRobotImg()`. No changes needed here.

### What changes
- `generate_idle_animations.py` gains a `--rembg` flag (default: on) that runs background removal after each creature's animation downloads.
- `generate_idle_animations.py` gains a `--deploy` flag (default: on) that copies the final transparent webp to `public/assets/sprites/robots/{id}-idle.webp`.
- `rembg_idle_animations.py` is kept as-is for standalone use but is no longer the expected workflow.

### Known constraints
- RMBG queue overload: 49 frames per creature is fine; multiple creatures' frames queued simultaneously causes timeouts. Process one creature's RMBG at a time (already handled by the batch-then-wait loop).
- ComfyUI SaveImage uses `rembg_frames/` subfolder prefix — transparent frame PNGs land in ComfyUI's `output/rembg_frames/` directory.
- Frame download from ComfyUI uses `/view?filename=...&subfolder=...&type=output` endpoint.

---

## Task 1: Add RMBG helper functions to generation script

**Files:**
- Modify: `scripts/generate_idle_animations.py`

**Step 1: Add RMBG imports and constants**

Add after the existing constants block (after line 56):

```python
# --- RMBG post-processing settings ---
GAME_SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
RMBG_TMP_DIR = os.path.join(PROJECT_ROOT, "tmp", "rembg-frames")
```

**Step 2: Add `extract_frames()` function**

Add after `convert_rgba_to_rgb()` (after line 117):

```python
def extract_frames(webp_path):
    """Extract all frames from an animated webp. Returns (list[PIL.Image], list[int])."""
    from PIL import Image
    img = Image.open(webp_path)
    frames = []
    durations = []
    try:
        while True:
            frames.append(img.copy().convert("RGBA"))
            durations.append(img.info.get("duration", 42))
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames, durations
```

**Step 3: Add `build_rmbg_workflow()` function**

```python
def build_rmbg_workflow(server_filename, creature_id, frame_idx):
    """RMBG workflow for a single frame — runs on ComfyUI GPU."""
    return {
        "prompt": {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": server_filename},
            },
            "2": {
                "class_type": "RMBG",
                "inputs": {
                    "image": ["1", 0],
                    "model": "RMBG-2.0",
                    "sensitivity": 1.0,
                    "process_res": 1024,
                    "mask_blur": 0,
                    "mask_offset": 0,
                    "invert_output": False,
                    "background": "Alpha",
                },
            },
            "3": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["2", 0],
                    "filename_prefix": f"rembg_frames/{creature_id}_frame_{frame_idx:04d}",
                },
            },
        }
    }
```

**Step 4: Add `download_rmbg_frame()` function**

```python
def download_rmbg_frame(history_entry):
    """Download a single RMBG-processed frame PNG from ComfyUI."""
    outputs = history_entry.get("outputs", {})
    images = outputs.get("3", {}).get("images", [])
    if not images:
        return None
    filename = images[0].get("filename")
    subfolder = images[0].get("subfolder", "")
    if not filename:
        return None
    import urllib.parse
    params = urllib.parse.urlencode({
        "filename": filename, "subfolder": subfolder, "type": "output"
    })
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=RMBG_TMP_DIR)
    tmp.close()
    urllib.request.urlretrieve(f"{COMFYUI_URL}/view?{params}", tmp.name)
    return tmp.name
```

**Step 5: Add `rembg_animated_webp()` orchestrator**

This is the main RMBG function that processes one creature's idle animation end-to-end:

```python
def rembg_animated_webp(input_webp, output_webp, creature_id):
    """Extract frames from animated webp, RMBG each on ComfyUI, reassemble transparent."""
    from PIL import Image
    os.makedirs(RMBG_TMP_DIR, exist_ok=True)

    frames, durations = extract_frames(input_webp)
    print(f"    RMBG: {len(frames)} frames to process")

    # Upload + queue all frames
    jobs = []
    for i, frame in enumerate(frames):
        frame_path = os.path.join(RMBG_TMP_DIR, f"{creature_id}_frame_{i:04d}.png")
        rgb = Image.new("RGB", frame.size, (255, 255, 255))
        if frame.mode == "RGBA":
            rgb.paste(frame, mask=frame.split()[3])
        else:
            rgb.paste(frame)
        rgb.save(frame_path, "PNG")

        server_name = upload_image(frame_path)
        workflow = build_rmbg_workflow(server_name, creature_id, i)
        prompt_id = queue_prompt(workflow)
        jobs.append((i, prompt_id))
        os.unlink(frame_path)

    # Wait + download
    transparent = [None] * len(frames)
    for i, (idx, pid) in enumerate(jobs):
        start = time.time()
        while time.time() - start < 120:
            status, outputs = check_job_status(pid)
            if status == "success":
                history = {"outputs": outputs}
                path = download_rmbg_frame(history)
                if path:
                    transparent[idx] = Image.open(path).convert("RGBA")
                    os.unlink(path)
                break
            elif status == "error":
                break
            time.sleep(1)

        if transparent[idx] is None:
            print(f"    RMBG frame {idx} failed")
            return False

        if (i + 1) % 10 == 0:
            print(f"    RMBG: {i + 1}/{len(frames)} done")

    # Reassemble
    os.makedirs(os.path.dirname(output_webp), exist_ok=True)
    transparent[0].save(
        output_webp, "WEBP", save_all=True,
        append_images=transparent[1:],
        duration=durations[0] if durations else 42,
        loop=0, quality=90, allow_mixed=True,
    )
    size_kb = os.path.getsize(output_webp) / 1024
    print(f"    RMBG: saved {output_webp} ({size_kb:.0f} KB)")
    return True
```

**Step 6: Verify syntax**

Run: `python -c "import ast; ast.parse(open('scripts/generate_idle_animations.py').read()); print('OK')"`
Expected: `OK`

**Step 7: Commit**

```bash
git add scripts/generate_idle_animations.py
git commit -m "feat: add RMBG helper functions to idle animation script"
```

---

## Task 2: Wire RMBG + deploy into the main pipeline

**Files:**
- Modify: `scripts/generate_idle_animations.py` (main function and download flow)

**Step 1: Add CLI flags**

In the `argparse` section of `main()`, add two new arguments:

```python
parser.add_argument("--no-rembg", action="store_true",
                    help="Skip RMBG background removal (keep white background)")
parser.add_argument("--no-deploy", action="store_true",
                    help="Skip copying to game sprite directory")
```

**Step 2: Add post-download RMBG + deploy logic**

After the `download_output()` call succeeds (inside the batch completion loop), add RMBG processing and deployment. Replace the current success block:

```python
if out_path:
    size_kb = os.path.getsize(out_path) / 1024
    print(f"    DONE: {cid} -> {os.path.relpath(out_path, PROJECT_ROOT)} ({size_kb:.0f} KB)")

    # RMBG background removal
    if not args.no_rembg:
        game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
        ok = rembg_animated_webp(out_path, game_path, cid)
        if ok:
            print(f"    DEPLOYED: {os.path.relpath(game_path, PROJECT_ROOT)}")
        else:
            print(f"    RMBG FAILED for {cid} — raw animation kept at {os.path.relpath(out_path, PROJECT_ROOT)}")
            failed.append((cid, "rembg failed"))
    elif not args.no_deploy:
        # No RMBG but still deploy (copy raw animation to game dir)
        import shutil
        game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
        shutil.copy2(out_path, game_path)
        print(f"    DEPLOYED (no rembg): {os.path.relpath(game_path, PROJECT_ROOT)}")
```

**Step 3: Update the summary footer**

Update the final print statements to mention the deploy path:

```python
print(f"\nRaw outputs: {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/*/idle.webp")
if not args.no_rembg:
    print(f"Game sprites: public/assets/sprites/robots/*-idle.webp (transparent)")
```

**Step 4: Verify syntax**

Run: `python -c "import ast; ast.parse(open('scripts/generate_idle_animations.py').read()); print('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add scripts/generate_idle_animations.py
git commit -m "feat: wire RMBG + deploy into idle animation pipeline"
```

---

## Task 3: Add `--rembg-only` mode for reprocessing existing animations

**Files:**
- Modify: `scripts/generate_idle_animations.py`

Sometimes you have raw animations already generated (in `output/animated-sprites/`) and just want to rerun RMBG + deploy without regenerating. This replaces the need for `rembg_idle_animations.py` entirely.

**Step 1: Add `--rembg-only` CLI flag**

```python
parser.add_argument("--rembg-only", action="store_true",
                    help="Skip generation, just run RMBG on existing output/animated-sprites/*/idle.webp")
```

**Step 2: Add rembg-only code path in `main()`**

Before the batch processing loop, add an early return path:

```python
if args.rembg_only:
    print("\nRMBG-ONLY MODE: Processing existing animations...\n")
    success = 0
    for creature in creatures:
        cid = creature["id"]
        raw_path = os.path.join(OUTPUT_DIR, cid, "idle.webp")
        if not os.path.exists(raw_path):
            print(f"  {cid}: no raw animation, skipping")
            continue
        game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
        print(f"  {cid}: RMBG processing...")
        if rembg_animated_webp(raw_path, game_path, cid):
            success += 1
        else:
            failed.append((cid, "rembg failed"))
    print(f"\nRMBG complete: {success}/{success + len(failed)} deployed")
    if failed:
        print(f"Failed: {', '.join(f[0] for f in failed)}")
    return
```

**Step 3: Verify syntax**

Run: `python -c "import ast; ast.parse(open('scripts/generate_idle_animations.py').read()); print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add scripts/generate_idle_animations.py
git commit -m "feat: add --rembg-only mode for reprocessing existing animations"
```

---

## Task 4: Dry-run test (no ComfyUI needed)

**Files:** None (verification only)

**Step 1: Verify `--dry-run` still works**

Run: `PYTHONUNBUFFERED=1 python scripts/generate_idle_animations.py --ids petalia --dry-run`

Expected output shows the creature would be queued, no actual API calls made.

**Step 2: Verify `--rembg-only --dry-run` doesn't crash**

Run: `PYTHONUNBUFFERED=1 python scripts/generate_idle_animations.py --ids petalia --rembg-only`

Expected: Either processes petalia's existing `output/animated-sprites/petalia/idle.webp` (if it exists) or prints "no raw animation, skipping".

**Step 3: Verify `--help` shows all new flags**

Run: `python scripts/generate_idle_animations.py --help`

Expected: Shows `--no-rembg`, `--no-deploy`, `--rembg-only` in help text.

---

## Task 5: Update script docstring and cleanup

**Files:**
- Modify: `scripts/generate_idle_animations.py` (docstring at top)

**Step 1: Update the module docstring**

Replace the existing docstring with:

```python
"""
Generate idle animations for creatures using Wan 2.2 via ComfyUI API.

End-to-end pipeline per creature:
1. Convert RGBA sprite to RGB with white background
2. Upload to ComfyUI and queue Wan 2.2 two-pass idle animation
3. Poll for completion and download animated webp
4. Extract frames, run per-frame RMBG background removal on ComfyUI GPU
5. Reassemble transparent frames into animated webp
6. Deploy to public/assets/sprites/robots/{id}-idle.webp

The game auto-detects idle sprites via sprite-utils.js configureRobotImg().

Requirements:
  - ComfyUI running at COMFYUI_URL (default: http://10.5.0.2:8188)
  - Wan 2.2 models (high-noise + low-noise 14B Q4)
  - RMBG-2.0 node installed in ComfyUI
  - Pillow: pip install Pillow

Usage:
  python scripts/generate_idle_animations.py                          # All creatures, full pipeline
  python scripts/generate_idle_animations.py --ids petalia,timbark    # Specific creatures
  python scripts/generate_idle_animations.py --skip-existing          # Skip already-generated
  python scripts/generate_idle_animations.py --no-rembg               # Generate only, skip RMBG
  python scripts/generate_idle_animations.py --rembg-only             # RMBG existing animations only
  python scripts/generate_idle_animations.py --rembg-only --ids petalia  # RMBG one creature
"""
```

**Step 2: Commit**

```bash
git add scripts/generate_idle_animations.py
git commit -m "docs: update idle animation script docstring for end-to-end pipeline"
```

---

## Summary of CLI interface after all tasks

```
# Full pipeline (generate + RMBG + deploy)
python scripts/generate_idle_animations.py --ids petalia,timbark,drizzlet

# Generate all, skip ones that already have raw output
python scripts/generate_idle_animations.py --skip-existing

# Generate without background removal
python scripts/generate_idle_animations.py --ids petalia --no-rembg

# Rerun RMBG + deploy on existing raw animations
python scripts/generate_idle_animations.py --rembg-only
python scripts/generate_idle_animations.py --rembg-only --ids petalia

# Dry run (no API calls)
python scripts/generate_idle_animations.py --dry-run
```

Final files touched:
- `scripts/generate_idle_animations.py` — All changes go here
- `scripts/rembg_idle_animations.py` — Kept as-is for standalone/fallback use
- `public/js/ui/sprite-utils.js` — No changes needed (already supports `{id}-idle.webp`)
