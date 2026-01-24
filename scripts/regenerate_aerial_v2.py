#!/usr/bin/env python3
"""
Second round: regenerate the 10 backgrounds that are STILL aerial despite negative prompts.
This time, prompts are completely rewritten to force street-level POV composition.
Key changes: describe ground-level elements (sidewalks, storefronts, looking UP at buildings).
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = "anime illustration, bright colorful cityscape, clean lines, warm sunlight, blue sky with white clouds, slightly futuristic, holographic signs, sleek modern architecture, vibrant saturated colors, no people, game background art, detailed, high quality, anime game environment, first person view standing on ground, eye level camera, vanishing point at horizon, ground visible at bottom of frame"

NEGATIVE = "dark, gritty, cyberpunk, neon, rain, night, people, characters, person, text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, pokeballs, poke ball, aerial view, birds eye view, from above, top down, overhead, satellite view, flying, floating, floating island, floating castle, clouds below, sky castle, bird perspective, drone shot, helicopter view, looking down, rooftop view, elevated view, high angle, isometric, map view, miniature, tilt shift"

BACKGROUNDS = {
    "floor1": "quiet Nerima residential sidewalk, walking path between low-rise houses with small gardens, cherry blossom petals falling on pavement, holographic mailbox glowing on left, bicycle parked against fence, traditional rooftops visible above hedges, morning golden light on concrete path, eye level perspective down a peaceful street",

    "floor2_4": "Nakano apartment complex entrance at ground level, modern glass lobby doors with holographic intercom panel, potted plants flanking entrance, bike parking rack with colorful bicycles, apartment tower rising up into sky above, bulletin board with holographic community notices, clean sidewalk with trees",

    "floor3": "Shinjuku street canyon, standing on wide sidewalk looking up at towering glass skyscrapers on both sides, holographic corporate logos on building facades above, pedestrian crossing ahead, street lamps and benches at eye level, dramatic perspective of buildings converging toward blue sky above",

    "floor3_3": "Shinjuku Chuo park entrance at ground level, stone pathway leading into green park, park bench on left side, tall skyscrapers visible rising behind the trees in background, holographic park map sign, flower beds along the path, pond visible ahead with small bridge, peaceful urban oasis",

    "floor4_2": "Shibuya stream riverside walkway, modern glass buildings on both sides of narrow urban canal, walking path along water at ground level, holographic art panels on building walls, small bridges crossing stream ahead, green planters and modern benches, reflections in water below, contemporary architecture",

    "floor4_3": "Shibuya Miyashita park ground level, modern playground with futuristic climbing structure, holographic game displays, skate ramp in middle distance, glass tower buildings rising above park in background, park benches and vending machines, green lawn area, urban recreation space",

    "floor5_3": "Akihabara narrow back alley at ground level, tiny electronic component shops on both sides with open storefronts, bins of cables and circuit boards displayed at waist height, holographic price tags on shelves, cramped passage with goods spilling onto sidewalk, warm interior lighting mixing with daylight, treasure hunt atmosphere",

    "floor5_4": "Akihabara UDX plaza at ground level, standing in wide open square looking at modern glass building facade, holographic event banners hanging from building, escalator entrance visible, potted trees in plaza, colorful anime posters at eye level on pillars, other buildings framing the scene",

    "floor6": "Chiyoda wide government boulevard at ground level, impressive neoclassical building facade with tall columns ahead, holographic national emblems floating above entrance, perfectly trimmed hedges lining the sidewalk, wide stone steps leading up to building, manicured trees on both sides, institutional grandeur from pedestrian perspective",

    "floor7": "Imperial Palace main gate at ground level, massive traditional wooden gate with ornate roof directly ahead, holographic barrier shimmering across the entrance, ancient stone walls on both sides, gravel path underfoot, pine trees framing the gate, moat water visible to the side, dramatic sky above, sacred threshold feeling",
}


def create_workflow(bg_id, description):
    full_prompt = f"{STYLE}, {description}"
    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_prompt, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1536, "height": 1024, "batch_size": 1}
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
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"regen_backgrounds_v2/{bg_id}"
            }
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
                        print(f"  Error details: {msgs}")
                        return False
                    if history[prompt_id].get("outputs"):
                        return True
        except:
            pass
        time.sleep(3)
    return False


def main():
    total = len(BACKGROUNDS)
    print("=" * 60)
    print(f"REGENERATING {total} AERIAL BACKGROUNDS (v2 - rewritten prompts)")
    print("Forcing street-level POV with ground-level composition")
    print("=" * 60)

    success = 0
    failed = []

    for i, (bg_id, desc) in enumerate(BACKGROUNDS.items(), 1):
        print(f"\n[{i}/{total}] {bg_id}")
        print(f"  {desc[:70]}...")

        workflow = create_workflow(bg_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(bg_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(bg_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} backgrounds regenerated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: regen_backgrounds_v2/ on ComfyUI machine")
    print("=" * 60)


if __name__ == "__main__":
    main()
