# Animated Sprite Generation Scripts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two Python scripts that generate real Wan 2.2 animated sprite sheets for all 25 robots — `generate_animated_sprites.py` (sends I2V jobs to ComfyUI) and `extract_sprite_sheets.py` (extracts frames into WebP sprite strips).

**Architecture:** Script 1 uploads each robot's static sprite to ComfyUI, patches an external Wan 2.2 I2V workflow JSON with per-robot motion prompts, queues the job, polls for completion, and downloads the resulting MP4. Script 2 uses ffmpeg to extract frames, rembg for background removal, Pillow for resizing/assembly into horizontal WebP strips, and auto-updates the manifest.json with actual frame counts. Both scripts support single-robot and batch modes with resume (skip existing outputs).

**Tech Stack:** Python 3.10+, Pillow, rembg, ffmpeg (CLI), requests, ComfyUI REST API at `http://192.168.1.222:8188`

**Existing infrastructure:**
- 25 static robot sprites: `public/assets/sprites/robots/{id}.webp`
- ComfyUI API pattern: `queue_prompt()` → `wait_for_completion()` (see `scripts/generate_robots.py`)
- Robot IDs: `{fire,water,wood,earth,metal}-{common,uncommon,rare,epic,legendary}`
- Frontend `RobotAnimator` reads `manifest.json` dynamically — no frontend changes needed

---

## Task 1: Create animation motion prompts

**Files:**
- Create: `scripts/animation-prompts.json`

**Step 1: Write the prompts file**

Create `scripts/animation-prompts.json` with 15 prompts (5 elements × 3 states). These describe motion only — the identity image carries the robot's appearance.

```json
{
  "fire": {
    "idle": "gentle hovering, flame vents pulsing softly, subtle bobbing, warm ember glow flickering",
    "attack": "lunging forward aggressively, flames erupting from vents, fire burst from hands",
    "hit": "recoiling backward, sparks flying from impact point, brief stagger"
  },
  "water": {
    "idle": "gentle floating, water ripples emanating from body, subtle swaying side to side",
    "attack": "thrusting forward, water jet blast from hands, splashing wave burst",
    "hit": "knocked back, water splashing from impact, wobbling recovery"
  },
  "wood": {
    "idle": "gentle breathing, leaves rustling softly, subtle root tendrils swaying",
    "attack": "slamming forward, vine whip lashing out, leaf burst explosion",
    "hit": "flinching backward, bark chips flying from impact, branches shaking"
  },
  "earth": {
    "idle": "solid stance with subtle ground vibration, crystals pulsing with inner glow",
    "attack": "heavy punch forward, rock shards erupting, seismic impact slam",
    "hit": "staggering back, stone fragments cracking off, dust cloud burst"
  },
  "metal": {
    "idle": "standing alert, gears spinning slowly, LED lights pulsing, subtle electromagnetic hum",
    "attack": "dashing forward, blade slash arc, electric spark discharge",
    "hit": "knocked back, metal plates denting, sparks and bolts flying"
  },
  "_negative": "text, watermark, logo, words, letters, background scenery, ground, floor, multiple characters, camera movement, zooming, panning, morphing, melting, distortion"
}
```

**Step 2: Verify JSON is valid**

Run: `python3 -c "import json; d=json.load(open('scripts/animation-prompts.json')); print(f'{len(d)-1} elements, keys: {list(d.keys())}')" `
Expected: `5 elements, keys: ['fire', 'water', 'wood', 'earth', 'metal', '_negative']`

**Step 3: Commit**

```bash
git add scripts/animation-prompts.json
git commit -m "feat: add Wan 2.2 motion prompts for robot animations"
```

---

## Task 2: Create workflow directory and README

The user must manually export their Wan 2.2 workflows from ComfyUI and save them here. This task creates the directory and documents the required node IDs.

**Files:**
- Create: `scripts/workflows/README.md`

**Step 1: Create directory and README**

```bash
mkdir -p scripts/workflows
```

Create `scripts/workflows/README.md`:

```markdown
# ComfyUI Workflow Files

## Required Files

- `wan-i2v.json` — Standard Wan 2.2 Image-to-Video workflow (for attack, hit, idle)
- `wan-i2v-loop.json` — Looping variant (for seamless idle loops, optional)

## How to Export

1. Build your Wan 2.2 I2V workflow in ComfyUI UI
2. Test it manually with one robot sprite
3. Click "Save (API Format)" → save as JSON here
4. Note the node IDs for the fields listed below

## Required Node IDs

After exporting, find and record these node IDs in your workflow JSON:

| Field | Description | Example Node ID |
|-------|-------------|-----------------|
| `image_input` | LoadImage node — receives the static robot sprite | TBD |
| `positive_prompt` | CLIPTextEncode — receives the motion prompt | TBD |
| `negative_prompt` | CLIPTextEncode — receives the negative prompt | TBD |
| `seed` | KSampler or equivalent — randomized per run | TBD |
| `save_output` | SaveAnimatedWEBP or VHS_VideoCombine — where output is saved | TBD |

Update this README with your actual node IDs after exporting.

## Configuration

The generation script reads `workflow-config.json` for node ID mappings:

```json
{
  "wan-i2v": {
    "workflow_file": "wan-i2v.json",
    "nodes": {
      "image_input": "10",
      "positive_prompt": "6",
      "negative_prompt": "7",
      "seed": "3",
      "save_output": "15"
    }
  },
  "wan-i2v-loop": {
    "workflow_file": "wan-i2v-loop.json",
    "nodes": {
      "image_input": "10",
      "positive_prompt": "6",
      "negative_prompt": "7",
      "seed": "3",
      "save_output": "15"
    }
  }
}
```
```

**Step 2: Create the config template**

Create `scripts/workflows/workflow-config.json`:

```json
{
  "wan-i2v": {
    "workflow_file": "wan-i2v.json",
    "nodes": {
      "image_input": "FILL_IN_NODE_ID",
      "positive_prompt": "FILL_IN_NODE_ID",
      "negative_prompt": "FILL_IN_NODE_ID",
      "seed": "FILL_IN_NODE_ID",
      "save_output": "FILL_IN_NODE_ID"
    },
    "image_input_key": "image",
    "prompt_key": "text",
    "seed_key": "seed"
  },
  "wan-i2v-loop": {
    "workflow_file": "wan-i2v-loop.json",
    "nodes": {
      "image_input": "FILL_IN_NODE_ID",
      "positive_prompt": "FILL_IN_NODE_ID",
      "negative_prompt": "FILL_IN_NODE_ID",
      "seed": "FILL_IN_NODE_ID",
      "save_output": "FILL_IN_NODE_ID"
    },
    "image_input_key": "image",
    "prompt_key": "text",
    "seed_key": "seed"
  }
}
```

**Step 3: Commit**

```bash
git add scripts/workflows/README.md scripts/workflows/workflow-config.json
git commit -m "feat: add workflow directory and config template for Wan 2.2"
```

---

## Task 3: Write generate_animated_sprites.py — core ComfyUI client

This script uploads a static sprite, patches the Wan 2.2 workflow, queues the job, polls for completion, and downloads the output video.

**Files:**
- Create: `scripts/generate_animated_sprites.py`

**Step 1: Write the script**

Create `scripts/generate_animated_sprites.py`:

```python
#!/usr/bin/env python3
"""
Generate Wan 2.2 animated sprite videos for NEO TOKYO robots.

Sends Image-to-Video jobs to ComfyUI. Each robot gets up to 4 videos:
idle, idle-loop, attack, hit.

Prerequisites:
- ComfyUI running with Wan 2.2 model at COMFYUI_URL
- Workflow JSON exported and node IDs configured in workflows/workflow-config.json
- Static robot sprites in public/assets/sprites/robots/{id}.webp

Usage:
  python scripts/generate_animated_sprites.py fire-common
  python scripts/generate_animated_sprites.py --batch all
  python scripts/generate_animated_sprites.py --batch starters
  python scripts/generate_animated_sprites.py --batch fire
  python scripts/generate_animated_sprites.py fire-common --idle-mode both
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.request
import urllib.error
import shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
COMFYUI_URL = "http://192.168.1.222:8188"
SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output", "animated-sprites")
PROMPTS_FILE = os.path.join(SCRIPT_DIR, "animation-prompts.json")
WORKFLOW_CONFIG_FILE = os.path.join(SCRIPT_DIR, "workflows", "workflow-config.json")

ALL_ELEMENTS = ["fire", "water", "wood", "earth", "metal"]
ALL_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"]
ALL_ROBOTS = [f"{e}-{r}" for e in ALL_ELEMENTS for r in ALL_RARITIES]
STARTERS = ["fire-common", "water-common", "wood-common"]


def load_prompts():
    with open(PROMPTS_FILE) as f:
        return json.load(f)


def load_workflow_config():
    with open(WORKFLOW_CONFIG_FILE) as f:
        return json.load(f)


def load_workflow(config_entry):
    workflow_path = os.path.join(SCRIPT_DIR, "workflows", config_entry["workflow_file"])
    if not os.path.exists(workflow_path):
        print(f"  ERROR: Workflow file not found: {workflow_path}")
        print(f"  Export your Wan 2.2 workflow from ComfyUI and save it there.")
        sys.exit(1)
    with open(workflow_path) as f:
        return json.load(f)


def upload_image(filepath):
    """Upload an image to ComfyUI's input directory. Returns the filename on the server."""
    filename = os.path.basename(filepath)
    # Read file bytes
    with open(filepath, "rb") as f:
        file_data = f.read()

    # Build multipart form data manually (no requests dependency)
    boundary = f"----PythonBoundary{random.randint(100000, 999999)}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/webp\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return result.get("name", filename)
    except Exception as e:
        print(f"  Upload error: {e}")
        return None


def patch_workflow(workflow, config_entry, uploaded_filename, motion_prompt, negative_prompt, seed):
    """Patch the workflow JSON with per-robot values at the configured node IDs."""
    nodes = config_entry["nodes"]
    wf = json.loads(json.dumps(workflow))  # deep copy

    # Patch image input
    node_id = nodes["image_input"]
    key = config_entry.get("image_input_key", "image")
    wf[node_id]["inputs"][key] = uploaded_filename

    # Patch positive prompt
    node_id = nodes["positive_prompt"]
    key = config_entry.get("prompt_key", "text")
    wf[node_id]["inputs"][key] = motion_prompt

    # Patch negative prompt
    node_id = nodes["negative_prompt"]
    key = config_entry.get("prompt_key", "text")
    wf[node_id]["inputs"][key] = negative_prompt

    # Patch seed
    node_id = nodes["seed"]
    key = config_entry.get("seed_key", "seed")
    wf[node_id]["inputs"][key] = seed

    return wf


def queue_prompt(workflow):
    """Queue a workflow on ComfyUI. Returns prompt_id or None."""
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return result.get("prompt_id")
    except Exception as e:
        print(f"  Queue error: {e}")
        return None


def wait_for_completion(prompt_id, timeout=600):
    """Poll ComfyUI /history until the prompt completes or errors. Returns True on success."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
            with urllib.request.urlopen(req, timeout=10) as resp:
                history = json.loads(resp.read().decode())
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        msgs = status.get("messages", [])
                        print(f"  ComfyUI error: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except Exception:
            pass
        time.sleep(5)
    print(f"  Timeout after {timeout}s")
    return False


def download_output(prompt_id, robot_id, state):
    """Download the output video from ComfyUI history. Returns local path or None."""
    try:
        req = urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            history = json.loads(resp.read().decode())

        outputs = history[prompt_id].get("outputs", {})
        # Find the save node output — look for gifs or videos
        for node_id, node_out in outputs.items():
            for key in ("gifs", "videos", "images"):
                items = node_out.get(key, [])
                for item in items:
                    filename = item.get("filename")
                    subfolder = item.get("subfolder", "")
                    filetype = item.get("type", "output")
                    if not filename:
                        continue

                    # Download via /view endpoint
                    params = urllib.parse.urlencode({
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": filetype,
                    })
                    url = f"{COMFYUI_URL}/view?{params}"
                    out_dir = os.path.join(OUTPUT_DIR, robot_id)
                    os.makedirs(out_dir, exist_ok=True)

                    ext = os.path.splitext(filename)[1] or ".mp4"
                    out_path = os.path.join(out_dir, f"{state}{ext}")
                    urllib.request.urlretrieve(url, out_path)
                    return out_path

        print(f"  No output file found in history")
        return None
    except Exception as e:
        print(f"  Download error: {e}")
        return None


# Need urllib.parse for download_output
import urllib.parse


def resolve_robots(args):
    """Resolve CLI args into a list of robot IDs."""
    if args.batch:
        batch = args.batch.lower()
        if batch == "all":
            return ALL_ROBOTS
        elif batch == "starters":
            return STARTERS
        elif batch in ALL_ELEMENTS:
            return [r for r in ALL_ROBOTS if r.startswith(batch + "-")]
        else:
            print(f"Unknown batch: {batch}. Use: all, starters, fire, water, wood, earth, metal")
            sys.exit(1)
    elif args.robot_id:
        if args.robot_id not in ALL_ROBOTS:
            print(f"Unknown robot: {args.robot_id}. Valid IDs: {', '.join(ALL_ROBOTS)}")
            sys.exit(1)
        return [args.robot_id]
    else:
        print("Specify a robot ID or --batch. Run with -h for help.")
        sys.exit(1)


def get_states(idle_mode):
    """Return list of (state_name, workflow_key) tuples to generate."""
    states = [
        ("attack", "wan-i2v"),
        ("hit", "wan-i2v"),
    ]
    if idle_mode == "both":
        states.insert(0, ("idle", "wan-i2v"))
        states.insert(1, ("idle-loop", "wan-i2v-loop"))
    elif idle_mode == "loop":
        states.insert(0, ("idle-loop", "wan-i2v-loop"))
    else:
        states.insert(0, ("idle", "wan-i2v"))
    return states


def main():
    parser = argparse.ArgumentParser(description="Generate Wan 2.2 animated sprites for robots")
    parser.add_argument("robot_id", nargs="?", help="Single robot ID (e.g. fire-common)")
    parser.add_argument("--batch", help="Batch mode: all, starters, fire, water, wood, earth, metal")
    parser.add_argument("--idle-mode", default="standard", choices=["standard", "loop", "both"],
                        help="Idle generation mode (default: standard)")
    parser.add_argument("--comfyui-url", default=COMFYUI_URL, help="ComfyUI server URL")
    parser.add_argument("--timeout", type=int, default=600, help="Per-job timeout in seconds")
    parser.add_argument("--force", action="store_true", help="Re-generate even if output exists")
    args = parser.parse_args()

    global COMFYUI_URL
    COMFYUI_URL = args.comfyui_url

    robots = resolve_robots(args)
    prompts = load_prompts()
    wf_config = load_workflow_config()
    negative = prompts.get("_negative", "")
    states = get_states(args.idle_mode)

    # Validate workflow files exist
    for _, wf_key in states:
        if wf_key not in wf_config:
            print(f"ERROR: Workflow '{wf_key}' not in workflow-config.json")
            sys.exit(1)

    # Pre-load workflows
    workflows = {}
    for _, wf_key in states:
        if wf_key not in workflows:
            workflows[wf_key] = load_workflow(wf_config[wf_key])

    total_jobs = len(robots) * len(states)
    print("=" * 60)
    print(f"GENERATING ANIMATED SPRITES — {len(robots)} robots × {len(states)} states = {total_jobs} jobs")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Idle mode: {args.idle_mode}")
    print("=" * 60)

    success = 0
    skipped = 0
    failed = []

    for ri, robot_id in enumerate(robots, 1):
        element = robot_id.split("-")[0]
        element_prompts = prompts.get(element, {})

        sprite_path = os.path.join(SPRITE_DIR, f"{robot_id}.webp")
        if not os.path.exists(sprite_path):
            print(f"\n[{ri}/{len(robots)}] {robot_id} — SKIP (no static sprite)")
            continue

        print(f"\n[{ri}/{len(robots)}] {robot_id}")

        # Upload static sprite once per robot
        uploaded_name = upload_image(sprite_path)
        if not uploaded_name:
            print(f"  SKIP — upload failed")
            failed.append(robot_id)
            continue

        for state_name, wf_key in states:
            # Check for existing output
            out_dir = os.path.join(OUTPUT_DIR, robot_id)
            existing = [f for f in os.listdir(out_dir) if f.startswith(state_name)] if os.path.isdir(out_dir) else []
            if existing and not args.force:
                print(f"  {state_name}: SKIP (exists: {existing[0]})")
                skipped += 1
                continue

            # Get motion prompt — idle-loop uses the idle prompt
            prompt_key = "idle" if state_name == "idle-loop" else state_name
            motion = element_prompts.get(prompt_key, "")
            if not motion:
                print(f"  {state_name}: SKIP (no prompt for {element}/{prompt_key})")
                continue

            print(f"  {state_name}: queuing...", end="", flush=True)

            seed = random.randint(1, 999999999)
            wf = patch_workflow(
                workflows[wf_key], wf_config[wf_key],
                uploaded_name, motion, negative, seed
            )

            prompt_id = queue_prompt(wf)
            if not prompt_id:
                print(" QUEUE ERROR")
                failed.append(f"{robot_id}/{state_name}")
                continue

            print(f" waiting (seed={seed})...", end="", flush=True)
            if wait_for_completion(prompt_id, timeout=args.timeout):
                out_path = download_output(prompt_id, robot_id, state_name)
                if out_path:
                    print(f" OK → {os.path.relpath(out_path, PROJECT_ROOT)}")
                    success += 1
                else:
                    print(" DOWNLOAD FAILED")
                    failed.append(f"{robot_id}/{state_name}")
            else:
                print(" FAILED")
                failed.append(f"{robot_id}/{state_name}")

            time.sleep(1)

    print("\n" + "=" * 60)
    print(f"DONE: {success} generated, {skipped} skipped, {len(failed)} failed")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: {os.path.relpath(OUTPUT_DIR, PROJECT_ROOT)}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

**Step 2: Syntax check**

Run: `python3 -c "import py_compile; py_compile.compile('scripts/generate_animated_sprites.py', doraise=True); print('OK')"`
Expected: `OK`

**Step 3: Verify CLI help works**

Run: `python3 scripts/generate_animated_sprites.py -h`
Expected: Help text showing robot_id, --batch, --idle-mode, --comfyui-url, --timeout, --force options.

**Step 4: Commit**

```bash
git add scripts/generate_animated_sprites.py
git commit -m "feat: add Wan 2.2 animated sprite generation script"
```

---

## Task 4: Write extract_sprite_sheets.py — frame extraction and assembly

This script takes the raw video outputs from Task 3, extracts frames, removes backgrounds, resizes to 192×192, assembles horizontal WebP strips, and updates the manifest.

**Files:**
- Create: `scripts/extract_sprite_sheets.py`

**Step 1: Write the script**

Create `scripts/extract_sprite_sheets.py`:

```python
#!/usr/bin/env python3
"""
Extract frames from Wan 2.2 videos and assemble WebP sprite sheets.

Pipeline per video:
1. Extract frames with ffmpeg at native fps
2. Remove background with rembg (RMBG-2.0)
3. Resize to 192x192 with Pillow
4. For idle with ping-pong: duplicate frames in reverse (1→N, N-1→2)
5. Assemble horizontal WebP strip
6. Save to public/assets/sprites/robots/{robotId}/{state}.webp
7. Update manifest.json with frame count and duration

Usage:
  python scripts/extract_sprite_sheets.py fire-common
  python scripts/extract_sprite_sheets.py --batch all
  python scripts/extract_sprite_sheets.py fire-common --idle-mode pingpong
  python scripts/extract_sprite_sheets.py fire-common --idle-mode loop
  python scripts/extract_sprite_sheets.py fire-common --no-rembg
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
VIDEO_DIR = os.path.join(PROJECT_ROOT, "output", "animated-sprites")
SPRITE_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
MANIFEST_PATH = os.path.join(SPRITE_DIR, "manifest.json")
FRAME_SIZE = 192

ALL_ELEMENTS = ["fire", "water", "wood", "earth", "metal"]
ALL_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"]
ALL_ROBOTS = [f"{e}-{r}" for e in ALL_ELEMENTS for r in ALL_RARITIES]
STARTERS = ["fire-common", "water-common", "wood-common"]

# States to extract and their manifest metadata
STATE_META = {
    "idle":      {"loop": True},
    "idle-loop": {"loop": True,  "output_name": "idle"},
    "attack":    {"loop": False},
    "hit":       {"loop": False},
}


def get_video_fps(video_path):
    """Get the frame rate of a video using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            capture_output=True, text=True
        )
        fps_str = result.stdout.strip()
        if "/" in fps_str:
            num, den = fps_str.split("/")
            return float(num) / float(den)
        return float(fps_str)
    except Exception:
        return 24.0  # fallback


def extract_frames(video_path, out_dir):
    """Extract all frames from a video at native fps. Returns frame count."""
    os.makedirs(out_dir, exist_ok=True)
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vsync", "0",
         os.path.join(out_dir, "frame_%04d.png")],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"    ffmpeg error: {result.stderr[:200]}")
        return 0
    frames = sorted(f for f in os.listdir(out_dir) if f.startswith("frame_") and f.endswith(".png"))
    return len(frames)


def remove_backgrounds(frame_dir):
    """Remove backgrounds from all frames using rembg."""
    try:
        from rembg import remove
        from PIL import Image
    except ImportError:
        print("    ERROR: rembg not installed. Run: pip install rembg")
        sys.exit(1)

    frames = sorted(f for f in os.listdir(frame_dir) if f.startswith("frame_") and f.endswith(".png"))
    for fname in frames:
        path = os.path.join(frame_dir, fname)
        img = Image.open(path)
        result = remove(img)
        result.save(path)


def assemble_strip(frame_dir, output_path, frame_size, pingpong=False):
    """Assemble frames into a horizontal WebP strip. Returns frame count."""
    from PIL import Image

    frames = sorted(f for f in os.listdir(frame_dir) if f.startswith("frame_") and f.endswith(".png"))
    if not frames:
        return 0

    images = []
    for fname in frames:
        img = Image.open(os.path.join(frame_dir, fname)).convert("RGBA")
        img = img.resize((frame_size, frame_size), Image.LANCZOS)
        images.append(img)

    if pingpong and len(images) > 2:
        # Duplicate in reverse: 1→N, N-1→2 (exclude first and last to avoid stutter)
        images = images + images[-2:0:-1]

    strip = Image.new("RGBA", (frame_size * len(images), frame_size), (0, 0, 0, 0))
    for i, img in enumerate(images):
        strip.paste(img, (i * frame_size, 0))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    strip.save(output_path, "WEBP", quality=90)
    return len(images)


def update_manifest(robot_id, state_name, frame_count, fps, loop):
    """Update manifest.json with animation metadata for one state."""
    manifest = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as f:
            manifest = json.load(f)

    if robot_id not in manifest:
        manifest[robot_id] = {"frameSize": FRAME_SIZE, "animations": {}}

    duration = round((frame_count / fps) * 1000)
    manifest[robot_id]["animations"][state_name] = {
        "frames": frame_count,
        "duration": duration,
        "loop": loop,
    }

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)


def resolve_robots(args):
    """Resolve CLI args into a list of robot IDs."""
    if args.batch:
        batch = args.batch.lower()
        if batch == "all":
            return ALL_ROBOTS
        elif batch == "starters":
            return STARTERS
        elif batch in ALL_ELEMENTS:
            return [r for r in ALL_ROBOTS if r.startswith(batch + "-")]
        else:
            print(f"Unknown batch: {batch}")
            sys.exit(1)
    elif args.robot_id:
        if args.robot_id not in ALL_ROBOTS:
            print(f"Unknown robot: {args.robot_id}")
            sys.exit(1)
        return [args.robot_id]
    else:
        print("Specify a robot ID or --batch. Run with -h for help.")
        sys.exit(1)


def find_video(robot_dir, state_name):
    """Find the video file for a state. Checks common extensions."""
    for ext in (".mp4", ".webm", ".webp", ".gif"):
        path = os.path.join(robot_dir, f"{state_name}{ext}")
        if os.path.exists(path):
            return path
    return None


def main():
    parser = argparse.ArgumentParser(description="Extract sprite sheets from Wan 2.2 videos")
    parser.add_argument("robot_id", nargs="?", help="Single robot ID (e.g. fire-common)")
    parser.add_argument("--batch", help="Batch mode: all, starters, fire, water, wood, earth, metal")
    parser.add_argument("--idle-mode", default="pingpong", choices=["pingpong", "loop", "raw"],
                        help="How to handle idle frames (default: pingpong)")
    parser.add_argument("--no-rembg", action="store_true",
                        help="Skip background removal (if already removed in ComfyUI)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing sprite sheets")
    args = parser.parse_args()

    # Verify ffmpeg available
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("ERROR: ffmpeg and ffprobe must be on PATH")
        sys.exit(1)

    robots = resolve_robots(args)

    # Determine which video states to process based on idle mode
    if args.idle_mode == "loop":
        video_states = ["idle-loop", "attack", "hit"]
    else:
        video_states = ["idle", "attack", "hit"]

    total = len(robots)
    success = 0
    skipped = 0
    failed = []

    print("=" * 60)
    print(f"EXTRACTING SPRITE SHEETS — {total} robots")
    print(f"Idle mode: {args.idle_mode} | Background removal: {'OFF' if args.no_rembg else 'ON'}")
    print("=" * 60)

    for ri, robot_id in enumerate(robots, 1):
        robot_video_dir = os.path.join(VIDEO_DIR, robot_id)
        if not os.path.isdir(robot_video_dir):
            print(f"\n[{ri}/{total}] {robot_id} — SKIP (no video directory)")
            continue

        print(f"\n[{ri}/{total}] {robot_id}")

        for video_state in video_states:
            video_path = find_video(robot_video_dir, video_state)
            if not video_path:
                print(f"  {video_state}: SKIP (no video found)")
                continue

            meta = STATE_META.get(video_state, {})
            output_name = meta.get("output_name", video_state)
            loop = meta.get("loop", False)
            pingpong = (args.idle_mode == "pingpong" and video_state == "idle")

            # Check if output already exists
            out_path = os.path.join(SPRITE_DIR, robot_id, f"{output_name}.webp")
            if os.path.exists(out_path) and not args.force:
                print(f"  {video_state}: SKIP (sprite sheet exists)")
                skipped += 1
                continue

            print(f"  {video_state}: extracting...", end="", flush=True)

            # Work in temp directory
            with tempfile.TemporaryDirectory() as tmpdir:
                frame_count = extract_frames(video_path, tmpdir)
                if frame_count == 0:
                    print(" FAILED (no frames)")
                    failed.append(f"{robot_id}/{video_state}")
                    continue

                fps = get_video_fps(video_path)
                print(f" {frame_count} frames @ {fps:.1f}fps", end="", flush=True)

                if not args.no_rembg:
                    print(" → rembg", end="", flush=True)
                    remove_backgrounds(tmpdir)

                print(" → assembling", end="", flush=True)
                final_count = assemble_strip(tmpdir, out_path, FRAME_SIZE, pingpong=pingpong)

                if final_count == 0:
                    print(" FAILED")
                    failed.append(f"{robot_id}/{video_state}")
                    continue

                update_manifest(robot_id, output_name, final_count, fps, loop)
                size_kb = os.path.getsize(out_path) / 1024
                print(f" → {final_count} frames, {size_kb:.0f}KB — OK")
                success += 1

    print("\n" + "=" * 60)
    print(f"DONE: {success} sprite sheets created, {skipped} skipped, {len(failed)} failed")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Sprite sheets: public/assets/sprites/robots/*/")
    print(f"Manifest: {os.path.relpath(MANIFEST_PATH, PROJECT_ROOT)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

**Step 2: Syntax check**

Run: `python3 -c "import py_compile; py_compile.compile('scripts/extract_sprite_sheets.py', doraise=True); print('OK')"`
Expected: `OK`

**Step 3: Verify CLI help works**

Run: `python3 scripts/extract_sprite_sheets.py -h`
Expected: Help text showing robot_id, --batch, --idle-mode, --no-rembg, --force options.

**Step 4: Commit**

```bash
git add scripts/extract_sprite_sheets.py
git commit -m "feat: add sprite sheet extraction script for Wan 2.2 videos"
```

---

## Task 5: Dry-run test with a synthetic video

Verify the extraction pipeline works end-to-end without needing ComfyUI. Create a short test video with ffmpeg, then run extract_sprite_sheets.py on it.

**Files:**
- No new files — uses scripts from Task 4

**Step 1: Create a synthetic test video**

```bash
mkdir -p output/animated-sprites/fire-common
ffmpeg -y -f lavfi -i "color=c=red:s=256x256:d=1,format=rgba" \
  -vf "drawtext=text='%{frame_num}':x=10:y=10:fontsize=40:fontcolor=white" \
  -r 24 -pix_fmt yuva420p output/animated-sprites/fire-common/idle.mp4
ffmpeg -y -f lavfi -i "color=c=orange:s=256x256:d=0.6,format=rgba" \
  -vf "drawtext=text='%{frame_num}':x=10:y=10:fontsize=40:fontcolor=white" \
  -r 24 -pix_fmt yuva420p output/animated-sprites/fire-common/attack.mp4
ffmpeg -y -f lavfi -i "color=c=yellow:s=256x256:d=0.4,format=rgba" \
  -vf "drawtext=text='%{frame_num}':x=10:y=10:fontsize=40:fontcolor=white" \
  -r 24 -pix_fmt yuva420p output/animated-sprites/fire-common/hit.mp4
```

Expected: Three short MP4 files with colored rectangles and frame numbers.

**Step 2: Run the extraction script (skip rembg for test)**

```bash
python3 scripts/extract_sprite_sheets.py fire-common --no-rembg --force
```

Expected output:
```
============================================================
EXTRACTING SPRITE SHEETS — 1 robots
Idle mode: pingpong | Background removal: OFF
============================================================

[1/1] fire-common
  idle: extracting... 24 frames @ 24.0fps → assembling → 46 frames, XXkb — OK
  attack: extracting... 14 frames @ 24.0fps → assembling → 14 frames, XXkb — OK
  hit: extracting... 10 frames @ 24.0fps → assembling → 10 frames, XXkb — OK

============================================================
DONE: 3 sprite sheets created, 0 skipped, 0 failed
```

**Step 3: Verify output files and manifest**

```bash
ls -la public/assets/sprites/robots/fire-common/
python3 -c "import json; m=json.load(open('public/assets/sprites/robots/manifest.json')); print(json.dumps(m.get('fire-common'), indent=2))"
```

Expected: Three `.webp` files in the directory, and a manifest entry with correct frame counts and durations.

**Step 4: Verify sprite dimensions**

```bash
python3 -c "
from PIL import Image
for state in ['idle', 'attack', 'hit']:
    img = Image.open(f'public/assets/sprites/robots/fire-common/{state}.webp')
    print(f'{state}: {img.size[0]}x{img.size[1]} ({img.size[0]//192} frames)')
"
```

Expected: Each strip should be (N×192)×192 pixels.

**Step 5: Clean up test artifacts**

```bash
rm -rf output/animated-sprites/fire-common
rm -rf public/assets/sprites/robots/fire-common
# Remove the test manifest entry if it was the only one
python3 -c "
import json, os
path = 'public/assets/sprites/robots/manifest.json'
if os.path.exists(path):
    m = json.load(open(path))
    m.pop('fire-common', None)
    if m:
        json.dump(m, open(path, 'w'), indent=2)
    else:
        os.remove(path)
    print('Cleaned up')
"
```

**Step 6: Commit (no file changes — this was a verification step)**

No commit needed. The dry run verified the pipeline works.

---

## Task 6: Generate starter robot videos (requires ComfyUI)

**Prerequisites:** ComfyUI running at `192.168.1.222:8188` with Wan 2.2 model loaded. Workflow JSONs exported and node IDs configured in `scripts/workflows/workflow-config.json`.

This task cannot be run by an automated agent — it requires:
1. The user to export their ComfyUI workflow and fill in `workflow-config.json` node IDs
2. The ComfyUI server to be running with Wan 2.2

**Files:**
- Modify: `scripts/workflows/workflow-config.json` (user fills in node IDs)
- Creates: `output/animated-sprites/{fire,water,wood}-common/{idle,attack,hit}.mp4`

**Step 1: Export workflow from ComfyUI**

In the ComfyUI UI:
1. Build your Wan 2.2 I2V workflow
2. Test it manually with one robot (upload `fire-common.webp`, add a motion prompt)
3. Click "Save (API Format)" → save as `scripts/workflows/wan-i2v.json`
4. Note the node IDs for image input, positive prompt, negative prompt, seed, and save output
5. Update `scripts/workflows/workflow-config.json` with actual node IDs

**Step 2: Generate starters**

```bash
python3 scripts/generate_animated_sprites.py --batch starters --idle-mode both
```

Expected: 12 video files (3 robots × 4 states: idle, idle-loop, attack, hit).

**Step 3: Verify outputs**

```bash
ls -la output/animated-sprites/fire-common/
ls -la output/animated-sprites/water-common/
ls -la output/animated-sprites/wood-common/
```

Each should have `idle.mp4`, `idle-loop.mp4`, `attack.mp4`, `hit.mp4`.

**Step 4: Commit raw videos (optional — these are large, may prefer .gitignore)**

```bash
echo "output/animated-sprites/" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore raw animated sprite videos"
```

---

## Task 7: Extract starter sprite sheets

**Files:**
- Creates: `public/assets/sprites/robots/{fire,water,wood}-common/{idle,attack,hit}.webp`
- Creates/Updates: `public/assets/sprites/robots/manifest.json`

**Step 1: Extract with ping-pong idle**

```bash
python3 scripts/extract_sprite_sheets.py --batch starters --idle-mode pingpong
```

**Step 2: Compare with loop idle (for starters that have idle-loop videos)**

```bash
python3 scripts/extract_sprite_sheets.py --batch starters --idle-mode loop --force
```

Compare the two by opening each sprite sheet in an image viewer — ping-pong should smoothly reverse, loop should seamlessly wrap.

**Step 3: Pick the better idle mode and re-extract if needed**

If loop looks better:
```bash
python3 scripts/extract_sprite_sheets.py --batch starters --idle-mode loop --force
```

If pingpong looks better:
```bash
python3 scripts/extract_sprite_sheets.py --batch starters --idle-mode pingpong --force
```

**Step 4: Verify manifest**

```bash
python3 -c "import json; print(json.dumps(json.load(open('public/assets/sprites/robots/manifest.json')), indent=2))"
```

Expected: Entries for fire-common, water-common, wood-common with frame counts and durations.

**Step 5: Commit sprite sheets and manifest**

```bash
git add public/assets/sprites/robots/fire-common/
git add public/assets/sprites/robots/water-common/
git add public/assets/sprites/robots/wood-common/
git add public/assets/sprites/robots/manifest.json
git commit -m "feat: add animated sprite sheets for 3 starter robots"
```

---

## Task 8: Verify starters in-game with Playwright MCP

Start the game and visually verify the animated sprites render correctly in combat.

**Step 1: Start the dev server**

```bash
pkill -f "node server.js" 2>/dev/null
npm start &
sleep 3
curl -s http://localhost:3000 | head -5
```

**Step 2: Open game and enter combat**

Use Playwright MCP to:
1. Navigate to `http://localhost:3000`
2. Log in / create account
3. Start a new run (starters are the default team)
4. Enter an encounter room

**Step 3: Screenshot combat screen**

Take `browser_take_screenshot` — verify:
- Player robot slots show animated idle (sprite strips cycling, not static)
- Enemy shows animated idle if it's a starter robot
- No visual glitches (sizing, clipping, overlapping)

**Step 4: Verify attack/hit triggers**

Play a combat turn by swiping a vocab card. Screenshot after:
- Player attack animation fires
- Enemy hit animation fires
- Enemy attack animation fires
- Player hit animation fires

**Step 5: Stop dev server**

```bash
pkill -f "node server.js"
```

---

## Task 9: Batch generate remaining 22 robots

Once starters look good, generate the rest in element batches.

**Step 1: Generate by element**

```bash
python3 scripts/generate_animated_sprites.py --batch fire
python3 scripts/generate_animated_sprites.py --batch water
python3 scripts/generate_animated_sprites.py --batch wood
python3 scripts/generate_animated_sprites.py --batch earth
python3 scripts/generate_animated_sprites.py --batch metal
```

Resume support means already-generated starters are skipped automatically.

**Step 2: Extract all sprite sheets**

```bash
python3 scripts/extract_sprite_sheets.py --batch all
```

**Step 3: Verify manifest covers all 25 robots**

```bash
python3 -c "
import json
m = json.load(open('public/assets/sprites/robots/manifest.json'))
print(f'{len(m)} robots in manifest')
for rid in sorted(m.keys()):
    states = list(m[rid]['animations'].keys())
    print(f'  {rid}: {states}')
"
```

Expected: 25 robots, each with idle, attack, hit.

**Step 4: Commit all sprite sheets**

```bash
git add public/assets/sprites/robots/*/
git add public/assets/sprites/robots/manifest.json
git commit -m "feat: add animated sprite sheets for all 25 robots"
```

---

## Task 10: Run E2E tests and final verification

**Step 1: Run the full E2E test suite**

```bash
./scripts/e2e-test.sh
```

**Step 2: Evaluate results**

- 66/66 = ideal
- 60+/66 = acceptable (known flakiness)
- <60/66 = investigate and fix

**Step 3: Final playtest with non-starter robots**

Use Playwright MCP to play through a run far enough to encounter uncommon/rare/epic robots in combat. Screenshot each to verify all 25 robots animate correctly.

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address sprite animation issues found during playtest"
```
