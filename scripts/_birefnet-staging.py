#!/usr/bin/env python3
"""
Remove white backgrounds from staging action icons using ComfyUI BiRefNetRMBG.

Reads PNGs from data/sprite-staging/actions/, runs BiRefNet, saves transparent
PNGs back to the same directory (overwriting originals).

Usage:
    python3 scripts/_birefnet-staging.py
"""

import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STAGING_DIR = PROJECT_ROOT / "data" / "sprite-staging" / "actions"
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")


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
                    "filename_prefix": f"birefnet_staging/{icon_id}",
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
    png_path = STAGING_DIR / f"{icon_id}.png"
    if not png_path.exists():
        print(f"Not found: {png_path}")
        return False

    # Flatten to RGB on white bg for cleaner BiRefNet input
    img = Image.open(png_path).convert("RGBA")
    tmp_png = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_png.close()
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
            print("BiRefNet failed")
            return False

        result_path = download_result(history)
        if not result_path:
            print("Download failed")
            return False

        result_img = Image.open(result_path).convert("RGBA")
        os.unlink(result_path)

        # Overwrite the staging PNG with the transparent version
        result_img.save(png_path, "PNG")
        return True
    finally:
        os.unlink(tmp_png.name)


def main():
    icon_ids = sorted([p.stem for p in STAGING_DIR.glob("*.png")])

    if not icon_ids:
        print("No PNGs found in staging.")
        return

    print(f"BiRefNet Staging — {len(icon_ids)} icons")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Dir:     {STAGING_DIR}")
    print("=" * 50)

    success = 0
    failed = []

    for i, icon_id in enumerate(icon_ids, 1):
        print(f"  [{i}/{len(icon_ids)}] {icon_id}... ", end="", flush=True)
        if process_icon(icon_id):
            print("ok")
            success += 1
        else:
            failed.append(icon_id)

    print(f"\n{'=' * 50}")
    print(f"Done: {success}/{len(icon_ids)} backgrounds removed")
    if failed:
        print(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
