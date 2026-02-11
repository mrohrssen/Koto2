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
