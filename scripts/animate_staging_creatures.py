#!/usr/bin/env python3
"""
Animate staging creature images using Wan 2.2 via ComfyUI API.

Takes Gemini-generated staging PNGs from data/creature-staging-images/
and produces game-ready assets:
  - {id}-idle.webp  (transparent animated idle loop, 49 frames @ 24fps)
  - {id}.webp       (transparent static fallback)

Both are deployed to public/assets/sprites/robots/.

Pipeline per creature:
1. Upload staging PNG to ComfyUI, queue WAN 2.2 two-pass idle animation
2. Poll for completion, download raw animated webp (still has background)
3. Extract frames from animation, RMBG each via ComfyUI for clean transparency
4. Reassemble transparent frames into animated webp
5. RMBG the original staging PNG for static fallback
6. Deploy both to game sprites directory

Requirements:
  - ComfyUI running at COMFYUI_URL (default: http://192.168.1.222:8188)
  - Wan 2.2 models (high-noise + low-noise 14B Q4)
  - RMBG-2.0 model in ComfyUI
  - Pillow: pip install Pillow

Usage:
  python scripts/animate_staging_creatures.py                          # All staging creatures
  python scripts/animate_staging_creatures.py --ids kazenoko           # Specific creatures
  python scripts/animate_staging_creatures.py --skip-existing          # Skip already-done
  python scripts/animate_staging_creatures.py --rembg-only             # Re-run RMBG on existing raw animations
  python scripts/animate_staging_creatures.py --seed 42                # Custom base seed
  python scripts/animate_staging_creatures.py --dry-run                # Preview without sending
"""

import argparse
import json
import os
import random
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Import WAN animation functions from the existing script
sys.path.insert(0, SCRIPT_DIR)
from generate_idle_animations import (
    build_workflow,
    upload_image,
    queue_prompt,
    check_job_status,
    check_queue,
    download_output,
    verify_comfyui,
    extract_frames,
    build_idle_prompt,
    build_negative_prompt,
    COMFYUI_URL,
    OUTPUT_DIR,
    GAME_SPRITE_DIR,
)

STAGING_JSON = os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json")
STAGING_IMAGES_DIR = os.path.join(PROJECT_ROOT, "data", "creature-staging-images")
TMP_DIR = os.path.join(PROJECT_ROOT, "tmp", "staging-rembg")


def timestamp():
    """Current time as HH:MM:SS for progress logs."""
    return datetime.now().strftime("%H:%M:%S")


def load_staging_creatures():
    """Load creatures from staging JSON."""
    with open(STAGING_JSON) as f:
        return json.load(f)


def find_staging_image(creature_id):
    """Find the staging PNG for a creature. Returns path or None."""
    path = os.path.join(STAGING_IMAGES_DIR, f"{creature_id}.png")
    if os.path.exists(path):
        return path
    return None


# ── RMBG via ComfyUI ────────────────────────────────────────────────

def build_rmbg_workflow(server_filename, creature_id, frame_idx):
    """Build RMBG workflow for a single frame."""
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
                    "filename_prefix": f"rembg_staging/{creature_id}_frame_{frame_idx:04d}",
                },
            },
        }
    }


def wait_for_rmbg(prompt_id, timeout=120):
    """Wait for an RMBG job to complete. Returns (success, history_entry)."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10)
            data = json.loads(resp.read())
            if prompt_id in data:
                status = data[prompt_id].get("status", {}).get("status_str")
                if status == "error":
                    return False, data[prompt_id]
                if data[prompt_id].get("outputs"):
                    return True, data[prompt_id]
        except Exception:
            pass
        time.sleep(1)
    return False, None


def download_rmbg_frame(history_entry):
    """Download the RMBG output frame PNG."""
    outputs = history_entry.get("outputs", {})
    node_output = outputs.get("3", {})
    images = node_output.get("images", [])
    if not images:
        return None

    filename = images[0].get("filename")
    subfolder = images[0].get("subfolder", "")
    if not filename:
        return None

    params = urllib.parse.urlencode({
        "filename": filename,
        "subfolder": subfolder,
        "type": "output",
    })
    url = f"{COMFYUI_URL}/view?{params}"

    os.makedirs(TMP_DIR, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=TMP_DIR)
    tmp.close()
    urllib.request.urlretrieve(url, tmp.name)
    return tmp.name


def rmbg_single_image(image_path, output_webp, creature_id):
    """Remove background from a single image via ComfyUI RMBG. Save as webp."""
    from PIL import Image

    # Upload
    server_name = upload_image(image_path)

    # Queue RMBG
    workflow = build_rmbg_workflow(server_name, creature_id, 0)
    prompt_id = queue_prompt(workflow)

    # Wait
    success, history = wait_for_rmbg(prompt_id, timeout=120)
    if not success or not history:
        print(f"    [{timestamp()}] RMBG failed for static image")
        return False

    # Download and convert to webp
    frame_path = download_rmbg_frame(history)
    if not frame_path:
        print(f"    [{timestamp()}] RMBG download failed for static image")
        return False

    img = Image.open(frame_path).convert("RGBA")
    img.save(output_webp, "WEBP", quality=95)
    os.unlink(frame_path)

    size_kb = os.path.getsize(output_webp) / 1024
    print(f"    [{timestamp()}] Static sprite: {os.path.relpath(output_webp, PROJECT_ROOT)} ({size_kb:.0f} KB)")
    return True


def rmbg_animated_webp(input_webp, output_webp, creature_id):
    """Remove background from all frames of an animated webp via ComfyUI RMBG."""
    from PIL import Image

    frames, durations = extract_frames(input_webp)
    num_frames = len(frames)
    print(f"    [{timestamp()}] RMBG: {num_frames} frames to process")

    os.makedirs(TMP_DIR, exist_ok=True)

    # Upload all frames and queue RMBG
    jobs = []  # (frame_idx, prompt_id)
    for i, frame in enumerate(frames):
        # Save frame as PNG for upload
        frame_path = os.path.join(TMP_DIR, f"{creature_id}_frame_{i:04d}.png")
        frame.save(frame_path, "PNG")

        server_name = upload_image(frame_path)
        workflow = build_rmbg_workflow(server_name, creature_id, i)
        prompt_id = queue_prompt(workflow)
        jobs.append((i, prompt_id))

        os.unlink(frame_path)

        if (i + 1) % 10 == 0:
            print(f"    [{timestamp()}] RMBG queued: {i + 1}/{num_frames}")

    print(f"    [{timestamp()}] All {num_frames} RMBG jobs queued. Waiting...")

    # Wait for all and download results
    transparent_frames = [None] * num_frames
    for i, (frame_idx, prompt_id) in enumerate(jobs):
        success, history = wait_for_rmbg(prompt_id, timeout=120)
        if success and history:
            frame_path = download_rmbg_frame(history)
            if frame_path:
                transparent_frames[frame_idx] = Image.open(frame_path).convert("RGBA")
                os.unlink(frame_path)
            else:
                print(f"    [{timestamp()}] Frame {frame_idx} download failed")
                return False
        else:
            print(f"    [{timestamp()}] Frame {frame_idx} RMBG failed")
            return False

        if (i + 1) % 10 == 0:
            print(f"    [{timestamp()}] RMBG done: {i + 1}/{num_frames}")

    # Reassemble transparent animated webp
    print(f"    [{timestamp()}] Reassembling {num_frames} transparent frames...")
    os.makedirs(os.path.dirname(output_webp), exist_ok=True)
    transparent_frames[0].save(
        output_webp, "WEBP", save_all=True,
        append_images=transparent_frames[1:],
        duration=durations[0] if durations else 42,
        loop=0, quality=90, allow_mixed=True,
    )
    size_kb = os.path.getsize(output_webp) / 1024
    print(f"    [{timestamp()}] Saved: {os.path.relpath(output_webp, PROJECT_ROOT)} ({size_kb:.0f} KB)")
    return True


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Animate staging creature images via ComfyUI WAN 2.2 + RMBG"
    )
    parser.add_argument("--ids", help="Comma-separated creature IDs (default: all with staging images)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip creatures with existing idle sprites")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be queued without sending")
    parser.add_argument("--batch-size", type=int, default=1,
                        help="Queue this many WAN jobs then wait (default: 1)")
    parser.add_argument("--seed", type=int, default=None, help="Fixed seed (default: random)")
    parser.add_argument("--poll-interval", type=int, default=30,
                        help="Seconds between WAN status checks (default: 30)")
    parser.add_argument("--rembg-only", action="store_true",
                        help="Skip WAN generation, just re-run RMBG on existing raw animations")
    parser.add_argument("--no-static", action="store_true",
                        help="Skip generating static fallback webp")
    args = parser.parse_args()

    # Load staging data
    creatures = load_staging_creatures()

    # Filter to those with staging images
    available = []
    for c in creatures:
        img_path = find_staging_image(c["id"])
        if img_path:
            available.append((c, img_path))

    if args.ids:
        ids = set(args.ids.split(","))
        available = [(c, p) for c, p in available if c["id"] in ids]
        found = {c["id"] for c, _ in available}
        missing = ids - found
        if missing:
            print(f"WARNING: No staging images for: {', '.join(missing)}")
            staged_ids = {c["id"] for c in creatures}
            for m in missing:
                if m in staged_ids:
                    print(f"  {m}: in staging JSON but no image at data/creature-staging-images/{m}.png")
                else:
                    print(f"  {m}: not in data/new-creatures-staging.json either")

    if args.skip_existing:
        before = len(available)
        available = [
            (c, p) for c, p in available
            if not os.path.exists(os.path.join(GAME_SPRITE_DIR, f"{c['id']}-idle.webp"))
        ]
        skipped = before - len(available)
        if skipped:
            print(f"Skipping {skipped} creatures with existing idle sprites.")

    if not available:
        print("No staging creatures to process.")
        print(f"  Staging JSON: {STAGING_JSON}")
        print(f"  Staging images: {STAGING_IMAGES_DIR}/")
        sys.exit(1)

    total = len(available)
    print("=" * 64)
    print(f"[{timestamp()}] STAGING CREATURE ANIMATION — {total} creature(s)")
    print(f"  Source: data/creature-staging-images/*.png")
    print(f"  Output: public/assets/sprites/robots/{{id}}-idle.webp (animated)")
    print(f"          public/assets/sprites/robots/{{id}}.webp (static fallback)")
    print(f"  BG removal: RMBG-2.0 via ComfyUI (AI-based)")
    seed_label = str(args.seed) if args.seed is not None else "random"
    print(f"  Batch: {args.batch_size} | Seed: {seed_label}")
    print("=" * 64)

    for c, p in available:
        size_kb = os.path.getsize(p) / 1024
        print(f"  {c['id']} ({c.get('element', '?')}) — {os.path.basename(p)} ({size_kb:.0f} KB)")

    # --- RMBG-only mode: skip WAN, just re-process existing raw animations ---
    if args.rembg_only:
        print(f"\n[{timestamp()}] RMBG-ONLY MODE: Processing existing raw animations...\n")
        if not args.dry_run:
            if not verify_comfyui():
                print("\nStart ComfyUI first on 192.168.1.222")
                sys.exit(1)
        success = 0
        for c, staging_path in available:
            cid = c["id"]
            raw_path = os.path.join(OUTPUT_DIR, cid, "idle.webp")
            if not os.path.exists(raw_path):
                print(f"  {cid}: no raw animation at {os.path.relpath(raw_path, PROJECT_ROOT)}, skipping")
                continue
            if args.dry_run:
                print(f"  {cid}: [DRY RUN] would RMBG {raw_path}")
                continue
            game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
            print(f"  [{timestamp()}] {cid}: RMBG on animation...")
            if rmbg_animated_webp(raw_path, game_path, cid):
                success += 1
            if not args.no_static:
                print(f"  [{timestamp()}] {cid}: RMBG on static...")
                rmbg_single_image(staging_path, os.path.join(GAME_SPRITE_DIR, f"{cid}.webp"), cid)
        print(f"\n[{timestamp()}] RMBG complete: {success} animations processed")
        return

    # --- Full pipeline ---
    if not args.dry_run:
        print(f"\n[{timestamp()}] Verifying ComfyUI connection...")
        if not verify_comfyui():
            print("\nStart ComfyUI first on 192.168.1.222")
            sys.exit(1)
        print()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    batches = [available[i:i + args.batch_size] for i in range(0, total, args.batch_size)]
    completed = 0
    failed = []

    for bi, batch in enumerate(batches):
        print(f"\n{'─' * 64}")
        print(f"[{timestamp()}] Batch {bi + 1}/{len(batches)} ({len(batch)} creature(s))")
        print(f"{'─' * 64}")

        # Phase 1: Upload + Queue WAN animation
        jobs = {}  # prompt_id -> (creature, staging_path)
        for creature, staging_path in batch:
            cid = creature["id"]
            idx = completed + len(jobs) + 1

            positive = build_idle_prompt(creature)
            negative = build_negative_prompt(creature)
            seed = args.seed if args.seed is not None else random.randint(0, 2**31)

            print(f"\n  [{timestamp()}] [{idx}/{total}] {cid} ({creature.get('element', '?')})")
            print(f"    Staging: {os.path.relpath(staging_path, PROJECT_ROOT)}")
            print(f"    Prompt:  {positive[:80]}...")

            if args.dry_run:
                print(f"    [DRY RUN] Would queue WAN idle animation (seed={seed})")
                print(f"    [DRY RUN] Then RMBG 49 frames + 1 static")
                continue

            # Upload staging PNG
            try:
                server_name = upload_image(staging_path)
                print(f"    [{timestamp()}] Uploaded as: {server_name}")
            except Exception as e:
                print(f"    [{timestamp()}] UPLOAD FAILED: {e}")
                failed.append((cid, f"upload: {e}"))
                continue

            # Build + queue WAN workflow
            workflow = build_workflow(server_name, positive, negative, seed)
            workflow["prompt"]["11"]["inputs"]["filename_prefix"] = f"idle_animations/{cid}-idle"

            try:
                prompt_id = queue_prompt(workflow)
                print(f"    [{timestamp()}] WAN queued: {prompt_id} (seed={seed})")
                jobs[prompt_id] = (creature, staging_path)
            except Exception as e:
                print(f"    [{timestamp()}] QUEUE FAILED: {e}")
                failed.append((cid, f"queue: {e}"))
                continue

        if args.dry_run or not jobs:
            completed += len(batch)
            continue

        # Phase 2: Poll for WAN completion
        print(f"\n  [{timestamp()}] Waiting for {len(jobs)} WAN job(s)...")
        print(f"  Estimated: ~8-10 minutes per creature on RTX 3090")
        pending_jobs = dict(jobs)
        start_time = time.time()
        last_report = start_time

        while pending_jobs:
            time.sleep(args.poll_interval)
            elapsed = time.time() - start_time
            now = time.time()

            done_ids = []
            for pid, (creature, staging_path) in pending_jobs.items():
                cid = creature["id"]
                status, outputs = check_job_status(pid)
                if status == "success":
                    out_path = download_output(pid, cid)
                    if out_path:
                        size_kb = os.path.getsize(out_path) / 1024
                        print(f"\n  [{timestamp()}] WAN DONE: {cid} ({size_kb:.0f} KB raw)")

                        # Phase 3: RMBG on animation frames
                        game_idle = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
                        print(f"  [{timestamp()}] Starting RMBG on {cid} animation...")
                        if rmbg_animated_webp(out_path, game_idle, cid):
                            idle_kb = os.path.getsize(game_idle) / 1024
                            print(f"  [{timestamp()}] DEPLOYED: {cid}-idle.webp ({idle_kb:.0f} KB, transparent)")
                        else:
                            print(f"  [{timestamp()}] RMBG FAILED: {cid}")
                            failed.append((cid, "rmbg animation failed"))

                        # Phase 4: RMBG on static source
                        if not args.no_static:
                            game_static = os.path.join(GAME_SPRITE_DIR, f"{cid}.webp")
                            print(f"  [{timestamp()}] RMBG on {cid} static...")
                            rmbg_single_image(staging_path, game_static, cid)
                    else:
                        print(f"\n  [{timestamp()}] WAN DONE: {cid} (but download failed)")
                        failed.append((cid, "download failed"))
                    done_ids.append(pid)
                elif status == "error":
                    print(f"\n  [{timestamp()}] WAN FAILED: {cid} (ComfyUI error)")
                    failed.append((cid, "comfyui error"))
                    done_ids.append(pid)

            for pid in done_ids:
                del pending_jobs[pid]

            # Verbose progress every ~60 seconds
            if pending_jobs and (now - last_report >= 60 or args.poll_interval >= 60):
                running, queued = check_queue()
                mins = elapsed / 60
                remaining_names = [c["id"] for _, (c, _) in pending_jobs.items()]
                eta_min = max(0, 8 * len(pending_jobs) - mins)
                print(f"  [{timestamp()}] {mins:.1f}m elapsed | "
                      f"{len(pending_jobs)} remaining: {', '.join(remaining_names)} | "
                      f"Queue: {running} running, {queued} pending | "
                      f"ETA: ~{eta_min:.0f}m")
                last_report = now

        completed += len(batch)

    # Summary
    success_count = completed - len(failed)
    print(f"\n{'=' * 64}")
    print(f"[{timestamp()}] COMPLETE: {success_count}/{total} creatures animated")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for cid, reason in failed:
            print(f"  - {cid}: {reason}")
    print(f"\nGame sprites: public/assets/sprites/robots/")
    print(f"  Animated: *-idle.webp  |  Static: *.webp")
    print(f"\nReminder: bump SPRITE_VERSION in public/js/ui/sprite-utils.js")
    print("=" * 64)


if __name__ == "__main__":
    main()
