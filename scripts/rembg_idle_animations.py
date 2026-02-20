#!/usr/bin/env python3
"""
Remove backgrounds from idle animation webps using ComfyUI's RMBG node.

Pipeline per animation:
1. Extract all frames from animated webp
2. Upload each frame to ComfyUI
3. Queue RMBG background removal per frame
4. Download transparent frames
5. Reassemble into animated webp with transparency
6. Save to public/assets/sprites/robots/{id}-idle.webp

Usage:
  python scripts/rembg_idle_animations.py                          # all available
  python scripts/rembg_idle_animations.py --ids petalia,timbark    # specific
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
INPUT_DIR = os.path.join(PROJECT_ROOT, "output", "animated-sprites")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "sprites", "robots")
TMP_DIR = os.path.join(PROJECT_ROOT, "tmp", "rembg-frames")
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://10.5.0.2:8188")


def extract_frames(webp_path):
    """Extract all frames from an animated webp. Returns list of PIL Images and frame durations."""
    from PIL import Image
    img = Image.open(webp_path)
    frames = []
    durations = []
    try:
        while True:
            frame = img.copy().convert("RGBA")
            frames.append(frame)
            durations.append(img.info.get("duration", 42))  # ~24fps default
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    return frames, durations


def upload_image(png_path):
    """Upload image to ComfyUI. Returns server-side filename."""
    boundary = "----PythonRembgBoundary"
    filename = os.path.basename(png_path)
    with open(png_path, "rb") as f:
        file_data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read())
    return result.get("name", filename)


def build_rmbg_workflow(server_filename, creature_id, frame_idx):
    """Build a simple RMBG workflow for a single frame."""
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


def queue_prompt(workflow):
    data = json.dumps(workflow).encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read())
    return result.get("prompt_id")


def wait_for_completion(prompt_id, timeout=120):
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


def download_frame(history_entry):
    """Download the RMBG output frame."""
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

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=TMP_DIR)
    tmp.close()
    urllib.request.urlretrieve(url, tmp.name)
    return tmp.name


def process_creature(creature_id):
    """Full pipeline: extract frames, RMBG each, reassemble."""
    from PIL import Image

    input_path = os.path.join(INPUT_DIR, creature_id, "idle.webp")
    if not os.path.exists(input_path):
        print(f"  No idle animation found at {input_path}")
        return False

    print(f"  Extracting frames...")
    frames, durations = extract_frames(input_path)
    print(f"  {len(frames)} frames extracted (duration: {durations[0]}ms each)")

    os.makedirs(TMP_DIR, exist_ok=True)

    # Upload all frames and queue RMBG
    print(f"  Uploading and queueing RMBG for {len(frames)} frames...")
    jobs = []  # (frame_idx, prompt_id)

    for i, frame in enumerate(frames):
        # Save frame as PNG
        frame_path = os.path.join(TMP_DIR, f"{creature_id}_frame_{i:04d}.png")
        # Convert RGBA to RGB with white bg for upload
        rgb_frame = Image.new("RGB", frame.size, (255, 255, 255))
        if frame.mode == "RGBA":
            rgb_frame.paste(frame, mask=frame.split()[3])
        else:
            rgb_frame.paste(frame)
        rgb_frame.save(frame_path, "PNG")

        # Upload
        server_name = upload_image(frame_path)

        # Queue RMBG
        workflow = build_rmbg_workflow(server_name, creature_id, i)
        prompt_id = queue_prompt(workflow)
        jobs.append((i, prompt_id))

        # Clean up local temp
        os.unlink(frame_path)

        if (i + 1) % 10 == 0:
            print(f"    Queued {i + 1}/{len(frames)}...")

    print(f"  All {len(frames)} frames queued. Waiting for RMBG...")

    # Wait for all jobs and download results
    transparent_frames = [None] * len(frames)
    for i, (frame_idx, prompt_id) in enumerate(jobs):
        success, history = wait_for_completion(prompt_id, timeout=120)
        if success and history:
            frame_path = download_frame(history)
            if frame_path:
                transparent_frames[frame_idx] = Image.open(frame_path).convert("RGBA")
                os.unlink(frame_path)
            else:
                print(f"    Frame {frame_idx} download failed")
                return False
        else:
            print(f"    Frame {frame_idx} RMBG failed")
            return False

        if (i + 1) % 10 == 0:
            print(f"    Completed {i + 1}/{len(frames)}...")

    # Reassemble into animated webp
    print(f"  Reassembling {len(transparent_frames)} transparent frames...")
    output_path = os.path.join(OUTPUT_DIR, f"{creature_id}-idle.webp")

    transparent_frames[0].save(
        output_path,
        "WEBP",
        save_all=True,
        append_images=transparent_frames[1:],
        duration=durations[0] if durations else 42,
        loop=0,
        quality=90,
        allow_mixed=True,
    )

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Saved: {output_path} ({size_kb:.0f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(description="Remove backgrounds from idle animations via ComfyUI RMBG")
    parser.add_argument("--ids", help="Comma-separated creature IDs (default: all available)")
    args = parser.parse_args()

    # Find available idle animations
    if args.ids:
        creature_ids = args.ids.split(",")
    else:
        creature_ids = []
        if os.path.isdir(INPUT_DIR):
            for d in sorted(os.listdir(INPUT_DIR)):
                if os.path.isfile(os.path.join(INPUT_DIR, d, "idle.webp")):
                    creature_ids.append(d)

    if not creature_ids:
        print("No idle animations found to process.")
        sys.exit(1)

    print("=" * 60)
    print(f"REMBG IDLE ANIMATIONS — {len(creature_ids)} creatures")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Input:   output/animated-sprites/*/idle.webp")
    print(f"Output:  public/assets/sprites/robots/*-idle.webp")
    print("=" * 60)

    success = 0
    failed = []

    for i, cid in enumerate(creature_ids, 1):
        print(f"\n[{i}/{len(creature_ids)}] {cid}")
        if process_creature(cid):
            success += 1
        else:
            failed.append(cid)

    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {success}/{len(creature_ids)} backgrounds removed")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: public/assets/sprites/robots/*-idle.webp")
    print("=" * 60)


if __name__ == "__main__":
    main()
