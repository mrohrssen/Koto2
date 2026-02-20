#!/usr/bin/env python3
"""
Remove backgrounds from sliced item icons using ComfyUI RMBG-2.0.

Uploads each 128×128 icon, runs RMBG, downloads transparent result,
and saves as PNG + WebP to public/assets/sprites/items/.

Usage:
    python3 scripts/rembg-item-icons.py
    python3 scripts/rembg-item-icons.py --ids beer,sake,egg
"""

import argparse
import json
import os
import sys
import time
import tempfile
import urllib.request
import urllib.parse
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SLICED_DIR = PROJECT_ROOT / "data" / "item-staging-images" / "sliced"
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "sprites" / "items"
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://10.5.0.2:8188")


def upload_image(png_path):
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


def build_rmbg_workflow(server_filename, item_id):
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
                    "filename_prefix": f"rembg_items/{item_id}",
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


def wait_for_completion(prompt_id, timeout=60):
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


def process_item(item_id):
    input_path = SLICED_DIR / f"{item_id}.png"
    if not input_path.exists():
        print(f"    ✗ Not found: {input_path}")
        return False

    # Upload
    server_name = upload_image(str(input_path))

    # Queue RMBG
    workflow = build_rmbg_workflow(server_name, item_id)
    prompt_id = queue_prompt(workflow)

    # Wait
    success, history = wait_for_completion(prompt_id)
    if not success:
        print(f"    ✗ RMBG failed")
        return False

    # Download
    result_path = download_result(history)
    if not result_path:
        print(f"    ✗ Download failed")
        return False

    # Load and save as PNG + WebP
    result_img = Image.open(result_path).convert("RGBA")
    os.unlink(result_path)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    result_img.save(OUTPUT_DIR / f"{item_id}.png", "PNG")
    result_img.save(OUTPUT_DIR / f"{item_id}.webp", "WEBP", quality=90)

    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", help="Comma-separated item IDs")
    args = parser.parse_args()

    if args.ids:
        item_ids = args.ids.split(",")
    else:
        item_ids = sorted([p.stem for p in SLICED_DIR.glob("*.png")])

    print(f"RMBG Item Icons — {len(item_ids)} items")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Input:   {SLICED_DIR}")
    print(f"Output:  {OUTPUT_DIR}")
    print("=" * 50)

    success = 0
    failed = []

    for i, item_id in enumerate(item_ids, 1):
        print(f"  [{i}/{len(item_ids)}] {item_id}...", end=" ", flush=True)
        if process_item(item_id):
            print("✓")
            success += 1
        else:
            failed.append(item_id)

    print(f"\n{'=' * 50}")
    print(f"Done: {success}/{len(item_ids)} backgrounds removed")
    if failed:
        print(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
