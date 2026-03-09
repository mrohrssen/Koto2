#!/usr/bin/env python3
"""
Remove white backgrounds from action icons using ComfyUI BiRefNetRMBG.

Reads webp files from public/assets/sprites/actions/, runs BiRefNet background
removal, and overwrites with transparent versions (PNG + WebP).

Usage:
    python3 scripts/birefnet-action-icons.py                          # all dirty (git modified + untracked)
    python3 scripts/birefnet-action-icons.py --ids blanket,chomp,cut  # specific icons
    python3 scripts/birefnet-action-icons.py --all                    # every webp in the directory
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ACTIONS_DIR = PROJECT_ROOT / "public" / "assets" / "sprites" / "actions"
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")


def get_dirty_icons():
    """Get action icon IDs that are modified or untracked in git."""
    result = subprocess.run(
        ["git", "status", "--short", "public/assets/sprites/actions/"],
        capture_output=True, text=True, cwd=PROJECT_ROOT
    )
    ids = set()
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        filepath = line[3:].strip().strip('"')
        if filepath.endswith(".webp"):
            ids.add(Path(filepath).stem)
    return sorted(ids)


def upload_image(png_path):
    boundary = "----PythonBiRefNetBoundary"
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


def build_birefnet_workflow(server_filename, icon_id):
    return {
        "prompt": {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": server_filename},
            },
            "2": {
                "class_type": "BiRefNetRMBG",
                "inputs": {
                    "image": ["1", 0],
                    "model": "BiRefNet_toonout",
                    "mask_blur": 0,
                    "mask_offset": 0,
                    "invert_output": False,
                    "refine_foreground": True,
                    "background": "Alpha",
                },
            },
            "3": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["2", 0],
                    "filename_prefix": f"birefnet_actions/{icon_id}",
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
        time.sleep(0.5)
    return False, None


def download_result(history_entry):
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

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    urllib.request.urlretrieve(url, tmp.name)
    return tmp.name


def process_icon(icon_id):
    webp_path = ACTIONS_DIR / f"{icon_id}.webp"
    if not webp_path.exists():
        print(f"✗ Not found: {webp_path}")
        return False

    # Convert webp to PNG for upload
    tmp_png = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_png.close()
    img = Image.open(webp_path).convert("RGBA")
    # Flatten to RGB on white bg for cleaner BiRefNet input
    bg = Image.new("RGB", img.size, (255, 255, 255))
    if img.mode == "RGBA":
        bg.paste(img, mask=img.split()[3])
    else:
        bg.paste(img)
    bg.save(tmp_png.name, "PNG")

    try:
        server_name = upload_image(tmp_png.name)
        workflow = build_birefnet_workflow(server_name, icon_id)
        prompt_id = queue_prompt(workflow)
        success, history = wait_for_completion(prompt_id)
        if not success:
            print("✗ BiRefNet failed")
            return False

        result_path = download_result(history)
        if not result_path:
            print("✗ Download failed")
            return False

        result_img = Image.open(result_path).convert("RGBA")
        os.unlink(result_path)

        result_img.save(ACTIONS_DIR / f"{icon_id}.png", "PNG")
        result_img.save(ACTIONS_DIR / f"{icon_id}.webp", "WEBP", quality=90)
        return True
    finally:
        os.unlink(tmp_png.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", help="Comma-separated icon IDs")
    parser.add_argument("--all", action="store_true", help="Process all webps")
    args = parser.parse_args()

    if args.ids:
        icon_ids = [x.strip() for x in args.ids.split(",")]
    elif args.all:
        icon_ids = sorted([p.stem for p in ACTIONS_DIR.glob("*.webp")])
    else:
        icon_ids = get_dirty_icons()

    if not icon_ids:
        print("No action icons to process.")
        return

    print(f"BiRefNet Action Icons — {len(icon_ids)} icons")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Dir:     {ACTIONS_DIR}")
    print("=" * 50)

    success = 0
    failed = []

    for i, icon_id in enumerate(icon_ids, 1):
        print(f"  [{i}/{len(icon_ids)}] {icon_id}... ", end="", flush=True)
        if process_icon(icon_id):
            print("✓")
            success += 1
        else:
            failed.append(icon_id)

    print(f"\n{'=' * 50}")
    print(f"Done: {success}/{len(icon_ids)} backgrounds removed")
    if failed:
        print(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
