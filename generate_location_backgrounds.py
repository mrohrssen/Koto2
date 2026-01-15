#!/usr/bin/env python3
"""
Generate 9 location-specific backgrounds for NEO TOKYO: System Liberation
Each background is 1920x1080 for combat scenes based on enemy location type.

Run this on the Windows PC with ComfyUI running at http://127.0.0.1:8188
Output will be saved to ComfyUI's output/location_backgrounds/ folder
Then copy to: public/assets/backgrounds/locations/
"""

import json
import urllib.request
import urllib.error
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

# Negative prompt for all backgrounds
NEGATIVE_PROMPT = "people, characters, person, human, face, body, hands, text, words, letters, watermark, signature, blurry, low quality, deformed, ugly, daytime, bright sunlight, oversaturated"

# Location background prompts - detailed cyberpunk Tokyo style
LOCATION_BACKGROUNDS = {
    "residential": """cyberpunk tokyo residential neighborhood at night, narrow alley between apartment buildings,
glowing vending machines, laundry hanging from balconies, cat sitting on air conditioner unit,
rain-slicked pavement reflecting neon signs, small izakaya lanterns, SYSTEM surveillance cameras,
bicycle parked against wall, warm yellow apartment windows contrasting cold cyan street lights,
Zenless Zone Zero art style, semi-realistic anime, atmospheric, cinematic lighting, no characters,
1920x1080, detailed background art, wide shot, establishing shot""",

    "school": """cyberpunk japanese high school classroom at night, rows of desks with holographic displays,
chalkboard with SYSTEM propaganda, cherry blossom tree visible through window,
digital clock showing late hour, student lockers with cyan glow, scattered papers and notebooks,
moonlight through windows mixing with fluorescent lights, shoe lockers in hallway visible,
oppressive academic atmosphere, Persona 5 aesthetic, semi-realistic anime style,
atmospheric lighting, no characters, 1920x1080, detailed background art, wide shot""",

    "convenience": """cyberpunk japanese convenience store interior at night, konbini shelves stocked with products,
glowing refrigerator cases with drinks, hot food counter with nikuman steamer,
magazine rack, cashier counter with holographic register, SYSTEM logo on employee uniform poster,
fluorescent lighting with slight flicker, rain visible through automatic glass doors,
24-hour store atmosphere, urban tokyo cyberpunk, semi-realistic anime style,
no characters, 1920x1080, detailed background art, interior wide shot""",

    "shopping": """cyberpunk japanese department store floor at night, escalators with neon lights,
clothing displays with holographic mannequins, cosmetics counter with glowing products,
digital price tags, SYSTEM advertisement screens, luxury brand logos with cyan corruption,
marble floors reflecting lights, shopping bags scattered, after-hours empty mall feeling,
ikebukuro sunshine city aesthetic, Zenless Zone Zero style, semi-realistic anime,
no characters, 1920x1080, detailed background art, wide interior shot""",

    "restaurant": """cyberpunk japanese izakaya interior at night, wooden counter with sake bottles,
paper lanterns glowing warm orange, menu boards with handwritten specials,
kitchen pass with stainless steel, beer taps and glasses, small TV showing news,
cigarette smoke haze, red noren curtain at entrance, tatami seating area,
intimate japanese bar atmosphere with subtle SYSTEM surveillance, warm lighting,
semi-realistic anime style, no characters, 1920x1080, detailed background art, cozy interior""",

    "station": """cyberpunk tokyo train station platform at night, JR yamanote line aesthetic,
digital departure boards with SYSTEM messages, yellow safety line on platform edge,
vending machines row, benches with waiting area, train tracks stretching into darkness,
overhead signs in japanese, ticket gates visible in background, station staff booth,
fluorescent lighting mixing with advertisement screens, Persona 5 aesthetic,
semi-realistic anime style, no characters, 1920x1080, detailed background art, wide platform shot""",

    "office": """cyberpunk japanese corporate office at night, open floor plan with cubicles,
computer monitors showing SYSTEM software, ergonomic chairs, filing cabinets,
water cooler, whiteboard with project deadlines, motivational SYSTEM posters,
fluorescent panel lighting casting harsh shadows, tokyo skyline visible through windows,
overtime work atmosphere, scattered documents and coffee cups, corporate dystopia aesthetic,
semi-realistic anime style, no characters, 1920x1080, detailed background art, wide office shot""",

    "government": """cyberpunk japanese government office at night, city hall interior aesthetic,
service counter windows with number displays, waiting area with plastic chairs,
bureaucratic forms and stamp stations, SYSTEM citizenship posters, japanese flags,
document filing systems floor to ceiling, cold institutional lighting,
mix of traditional wood paneling and digital displays, oppressive bureaucracy atmosphere,
chiyoda ward aesthetic, semi-realistic anime style, no characters, 1920x1080, detailed background art""",

    "hospital": """cyberpunk japanese hospital corridor at night, white walls with cyan SYSTEM monitors,
gurney against wall, nurse station with holographic patient charts, medicine cabinet,
hand sanitizer dispensers, room number signs in japanese, wheelchair parking,
sterile fluorescent lighting, emergency exit signs, faint medical equipment beeping aesthetic,
clinical and cold atmosphere with digital health monitoring, semi-realistic anime style,
no characters, 1920x1080, detailed background art, long corridor perspective"""
}


def create_background_workflow(location_id, prompt, seed=None):
    """Create ComfyUI workflow for a 1920x1080 background."""

    if seed is None:
        seed = random.randint(1, 999999999)

    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt.strip(), "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE_PROMPT, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1920, "height": 1080, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 30,  # More steps for larger image
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
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"location_backgrounds/{location_id}"
            }
        }
    }
    return workflow, seed


def queue_prompt(workflow):
    """Queue a prompt and return the prompt ID."""
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
    """Wait for a prompt to complete (longer timeout for large images)."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
            with urllib.request.urlopen(req, timeout=10) as response:
                history = json.loads(response.read().decode("utf-8"))
                if prompt_id in history:
                    status = history[prompt_id].get("status", {})
                    if status.get("status_str") == "error":
                        return False, "error"
                    if history[prompt_id].get("outputs"):
                        return True, "success"
        except:
            pass
        time.sleep(3)
    return False, "timeout"


def get_output_filename(prompt_id):
    """Get the output filename from completed prompt."""
    try:
        req = urllib.request.Request(COMFYUI_URL + "/history/" + prompt_id)
        with urllib.request.urlopen(req, timeout=10) as response:
            history = json.loads(response.read().decode("utf-8"))
            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                for node_id, node_output in outputs.items():
                    if "images" in node_output:
                        return node_output["images"][0].get("filename", "")
    except:
        pass
    return ""


def main():
    # Create output directory
    output_dir = r"C:\Users\michi\ComfyUI\output\location_backgrounds"
    os.makedirs(output_dir, exist_ok=True)

    total = len(LOCATION_BACKGROUNDS)
    print("=" * 70)
    print(f"GENERATING {total} LOCATION BACKGROUNDS")
    print("1920x1080 cyberpunk Tokyo backgrounds for NEO TOKYO")
    print("=" * 70)

    generation_log = {}

    for i, (location_id, prompt) in enumerate(LOCATION_BACKGROUNDS.items(), 1):
        print(f"\n[{i}/{total}] {location_id}")
        print(f"  Setting: {prompt[:60]}...")

        generation_log[location_id] = {
            "attempts": 0,
            "seeds": [],
            "status": "pending"
        }

        # Generate the image
        workflow, seed = create_background_workflow(location_id, prompt)
        generation_log[location_id]["seeds"].append(seed)
        generation_log[location_id]["attempts"] += 1

        prompt_id = queue_prompt(workflow)

        if prompt_id:
            print(f"  Queued with seed {seed}, waiting...")
            success, status = wait_for_completion(prompt_id)

            if success:
                filename = get_output_filename(prompt_id)
                print(f"  [OK] Generated: {filename}")
                generation_log[location_id]["status"] = "generated"
                generation_log[location_id]["filename"] = filename
            else:
                print(f"  [FAILED] Status: {status}")
                generation_log[location_id]["status"] = "failed"
        else:
            print(f"  [QUEUE ERROR]")
            generation_log[location_id]["status"] = "queue_error"

        # Small delay between generations
        time.sleep(1)

    # Summary
    print("\n" + "=" * 70)
    print("GENERATION COMPLETE")
    print("=" * 70)

    success_count = sum(1 for v in generation_log.values() if v["status"] == "generated")
    print(f"\nSuccess: {success_count}/{total}")

    print("\nGeneration Log:")
    for location_id, log in generation_log.items():
        status_icon = "✓" if log["status"] == "generated" else "✗"
        print(f"  {status_icon} {location_id}: {log['status']} (seed: {log['seeds'][0] if log['seeds'] else 'N/A'})")

    # Save log
    log_path = os.path.join(output_dir, "generation_log.json")
    with open(log_path, "w") as f:
        json.dump(generation_log, f, indent=2)
    print(f"\nLog saved to: {log_path}")

    print("\n" + "=" * 70)
    print("NEXT STEPS:")
    print("1. Review generated images in:", output_dir)
    print("2. Regenerate any that need fixes")
    print("3. Copy approved images to: public/assets/backgrounds/locations/")
    print("=" * 70)


if __name__ == "__main__":
    main()
