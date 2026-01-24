#!/usr/bin/env python3
"""Regenerate single enemy sprite."""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "solo, single character, 1boy, anime character illustration, full body, white background, clean lines, anime game character style, human male, japanese man, realistic human proportions, normal human skin, modern clothing, everyday clothes, vibrant saturated colors, colorful, warm lighting, natural skin tones, game character art, high quality, sharp details"

NEGATIVE = "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, super deformed, multiple characters, multiple people, crowd, group, duo, blood, pokeball, pokeballs, poke ball, monochrome, silhouette, blue theme, black and blue, tron, neon glow, blue fire, energy aura, limited palette, desaturated, grayscale, lineart only, sketch, cat ears, animal ears, furry, non-human, alien, robot, monster, creature, fantasy, medieval, armor, sword, magic staff, scepter, RPG character, warrior, knight, wizard, mage, cape, wings, horns, tail, elf ears, pointy ears, green skin, blue skin, unusual skin color, mask, helmet, crown, tiara"

ENEMY_ID = "powerHarassingBoss"
DESCRIPTION = "1boy, angry japanese middle-aged office boss yelling, wearing expensive dark navy suit with red striped tie, white dress shirt, pointing finger forward accusingly, mouth open shouting, deep frown angry eyebrows, short black hair with grey streaks, standing in aggressive wide stance, gold wristwatch, holding stack of papers in other hand, intimidating corporate bully"

def create_workflow():
    full_prompt = f"{STYLE}, {DESCRIPTION}"
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": full_prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"seed": random.randint(1, 999999999), "steps": 30, "cfg": 7.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0, "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "RMBG", "inputs": {"image": ["6", 0], "model": "RMBG-2.0", "sensitivity": 1.0, "process_res": 1024, "mask_blur": 0, "mask_offset": 0, "invert_output": False, "background": "Alpha"}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": f"regen_single/{ENEMY_ID}"}}
    }
    return workflow

def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(COMFYUI_URL + "/prompt", data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8")).get("prompt_id", "")
    except Exception as e:
        print(f"Error: {e}")
        return ""

def wait_for_completion(prompt_id, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history and history[prompt_id].get("outputs"):
                    return True
        except:
            pass
        time.sleep(2)
    return False

print(f"Generating {ENEMY_ID}...")
prompt_id = queue_prompt(create_workflow())
if prompt_id and wait_for_completion(prompt_id):
    print("[OK]")
else:
    print("[FAILED]")
