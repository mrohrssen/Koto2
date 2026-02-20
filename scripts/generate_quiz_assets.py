#!/usr/bin/env python3
"""
Generate 4 quiz/shrine-themed assets:
1. Japanese shrine background (1344x768)
2. Shrine fox sprite (1024x1024, transparent)
3. Old man quiz master sprite (1024x1024, transparent)
4. Quiz master thematic background (1344x768)
"""

import json
import urllib.request
import time
import random
import os
import subprocess

COMFYUI_URL = "http://10.5.0.2:8188"
SSH_HOST = "michia@10.5.0.2"

# Output goes to ComfyUI output dir, we'll SCP it back after
OUTPUT_PREFIX = "quiz_assets"

ASSETS = {
    "shrine_background": {
        "prompt": "anime background, street level perspective, eye level camera, vibrant, detailed, high quality, traditional japanese shinto shrine, vermillion red torii gate, stone lanterns lining the path, shimenawa sacred rope, colorful ema prayer plaques, cherry blossom trees in bloom, stone steps leading up, blue sky with wispy clouds, warm golden sunlight, peaceful spiritual atmosphere, lush green surroundings",
        "negative": "aerial view, birds eye, top down, floating, dark, horror, text, watermark, blurry, low quality, people, characters, figures, night, rain, gloomy",
        "width": 1344,
        "height": 768,
        "use_rmbg": False,
    },
    "shrine_fox": {
        "prompt": "solo, single character, anime character illustration, white kitsune fox, shrine guardian fox, mystical elegant creature, glowing golden eyes, red sacred collar with golden bell, multiple flowing tails with ethereal blue fire wisps, sitting pose on stone pedestal, vibrant saturated colors, warm lighting, clean lines, sharp details, spiritual aura, game character art, high quality",
        "negative": "dark, gritty, realistic, horror, text, watermark, blurry, low quality, multiple characters, complex background, monochrome, silhouette, human, humanoid, ugly, deformed",
        "width": 1024,
        "height": 1024,
        "use_rmbg": True,
    },
    "quiz_master": {
        "prompt": "solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game character style, 1boy, wise elderly japanese man, long flowing white beard, traditional dark blue haori jacket over grey hakama, holding ornate wooden staff with glowing amber orb on top, knowing mysterious smile, round gold spectacles, wooden prayer beads around wrist, ancient scroll tucked in belt, dignified scholarly stance, vibrant saturated colors, warm lighting, game character art, high quality, sharp details",
        "negative": "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, monochrome, silhouette, cat ears, animal ears, furry, non-human, young, child",
        "width": 1024,
        "height": 1024,
        "use_rmbg": True,
    },
    "quiz_master_background": {
        "prompt": "anime background, interior, eye level camera, vibrant, detailed, high quality, traditional japanese study room, tatami floor, shoji sliding doors with soft light, hanging scroll with brush calligraphy on wall, low wooden table with steaming tea set, bookshelves filled with ancient scrolls and leather-bound books, warm paper lantern lighting, mystical floating golden kanji characters in the air, incense smoke wisps, cozy wisdom atmosphere, rich warm colors, orange and amber tones",
        "negative": "aerial view, birds eye, top down, dark, horror, text, watermark, blurry, low quality, people, characters, figures, modern, technology, computer, cold lighting",
        "width": 1344,
        "height": 768,
        "use_rmbg": False,
    },
}


def create_workflow(asset_id, asset):
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": asset["prompt"], "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": asset["negative"], "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": asset["width"], "height": asset["height"], "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 30,
                "cfg": 7.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
        },
    }

    if asset["use_rmbg"]:
        workflow["7"] = {
            "class_type": "RMBG",
            "inputs": {
                "image": ["6", 0],
                "model": "RMBG-2.0",
                "sensitivity": 1.0,
                "process_res": 1024,
                "mask_blur": 0,
                "mask_offset": 0,
                "invert_output": False,
                "background": "Alpha"
            }
        }
        workflow["8"] = {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["7", 0],
                "filename_prefix": f"{OUTPUT_PREFIX}/{asset_id}"
            }
        }
    else:
        workflow["8"] = {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"{OUTPUT_PREFIX}/{asset_id}"
            }
        }

    return workflow


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        COMFYUI_URL + "/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("prompt_id", "")
    except Exception as e:
        print(f"  Error queueing: {e}")
        return ""


def wait_for_completion(prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        msgs = status.get("messages", [])
                        print(f"  Error: {msgs}")
                        return None
                    outputs = history[prompt_id].get("outputs", {})
                    if outputs:
                        # Find the SaveImage node output
                        for node_id, node_output in outputs.items():
                            if "images" in node_output:
                                return node_output["images"]
                        return []
        except Exception:
            pass
        time.sleep(2)
    print("  Timeout waiting for generation")
    return None


def main():
    review_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "tmp", "quiz-review")
    os.makedirs(review_dir, exist_ok=True)

    print("=" * 60)
    print("GENERATING 4 QUIZ/SHRINE ASSETS")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Review folder: {review_dir}")
    print("=" * 60)

    generated_files = []

    for asset_id, asset in ASSETS.items():
        print(f"\n[{asset_id}] {asset['width']}x{asset['height']} "
              f"{'(transparent)' if asset['use_rmbg'] else '(background)'}")
        print(f"  Prompt: {asset['prompt'][:80]}...")

        workflow = create_workflow(asset_id, asset)
        prompt_id = queue_prompt(workflow)

        if not prompt_id:
            print("  FAILED to queue")
            continue

        print(f"  Queued: {prompt_id}")
        print(f"  Waiting for generation...")
        images = wait_for_completion(prompt_id)

        if images:
            for img in images:
                filename = img.get("filename", "")
                subfolder = img.get("subfolder", "")
                if filename:
                    generated_files.append((asset_id, filename, subfolder))
                    print(f"  Generated: {subfolder}/{filename}" if subfolder else f"  Generated: {filename}")
        else:
            print("  FAILED")

        time.sleep(1)

    # SCP generated files back to review folder
    if generated_files:
        print(f"\n{'='*60}")
        print("COPYING FILES TO REVIEW FOLDER...")
        for asset_id, filename, subfolder in generated_files:
            remote_path = f"ComfyUI/output/{subfolder}/{filename}" if subfolder else f"ComfyUI/output/{filename}"
            local_path = os.path.join(review_dir, f"{asset_id}.png")
            cmd = ["scp", f"{SSH_HOST}:{remote_path}", local_path]
            print(f"  {asset_id} -> {local_path}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                print(f"    SCP error: {result.stderr}")

    print(f"\n{'='*60}")
    print(f"DONE. Review images at: {review_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
