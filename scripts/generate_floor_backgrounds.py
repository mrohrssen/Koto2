#!/usr/bin/env python3
"""
Generate 42 floor background images for NEO TOKYO: System Liberation
Bright anime cityscape style - 7 floors x 6 images each (1 main + 5 variants).
1536x1024, no background removal.

Run on Windows PC with ComfyUI at http://127.0.0.1:8188
Output: ComfyUI/output/floor_backgrounds/{floorN}_00001_.png etc.
"""

import json
import urllib.request
import time
import random
import os

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = "anime illustration, bright colorful cityscape, clean lines, warm sunlight, blue sky with white clouds, slightly futuristic, holographic signs, sleek modern architecture, lush green trees, vibrant saturated colors, no people, game background art, detailed, high quality, anime game environment"

NEGATIVE = "dark, gritty, cyberpunk, neon, rain, night, people, characters, person, text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, pokeballs, poke ball"

# Each key is the output filename prefix (maps to floor{N}.png or floor{N}_{V}.png)
FLOOR_DESCRIPTIONS = {
    "floor1": "breathtaking panorama of Nerima ward, quiet residential Tokyo neighborhood, traditional low-rise houses with modern touches, cherry blossom trees lining a pristine sidewalk, futuristic mailboxes with holographic displays, morning golden light, peaceful suburban anime paradise",
    "floor1_1": "serene Nerima residential park, lush green playground with sleek benches, holographic information board, apartment buildings in background, childrens play equipment with subtle tech upgrades, afternoon sunlight filtering through maple trees",
    "floor1_2": "charming Nerima shopping street, small family-run shops with traditional noren curtains and holographic price signs, potted plants on sidewalk, bicycle parking area, warm inviting storefronts, golden hour light",
    "floor1_3": "peaceful Nerima canal path, walking trail alongside crystal-clear water, weeping willows with bioluminescent tips, small bridges with modern railings, residential towers in distance, spring afternoon",
    "floor1_4": "cozy Nerima side street, vending machines with holographic drink displays, narrow road between houses, potted flowers on window sills, utility poles with subtle tech upgrades, late afternoon shadows",
    "floor1_5": "quiet Nerima temple grounds, traditional shrine gate with holographic charms, stone lanterns mixed with floating light orbs, ancient trees in manicured garden, spiritual tranquility meets subtle technology",

    "floor2": "vibrant panorama of Nakano ward, famous Broadway shopping complex with futuristic glass facade, colorful anime billboards and holographic advertisements, bustling shopping arcade entrance, bright midday energy",
    "floor2_1": "Nakano Broadway interior atrium, multi-level shopping floors visible, manga and figure shops with glowing displays, escalators with holographic railings, otaku paradise with futuristic retail technology",
    "floor2_2": "trendy Nakano backstreet, vintage clothing stores with AR mirror displays, indie cafes with floating menu boards, artistic graffiti murals, hipster Tokyo neighborhood feel, warm afternoon colors",
    "floor2_3": "Nakano Sun Mall shopping arcade, covered pedestrian street, hanging holographic banners, traditional shops upgraded with digital signage, fruit stands and bakeries, lively market atmosphere",
    "floor2_4": "Nakano residential tower district, modern apartment complexes with rooftop gardens, community bulletin boards with holographic postings, bike-share stations, clean organized neighborhood, blue sky",
    "floor2_5": "Nakano station plaza, open area with futuristic bus stops, digital map kiosks, small park with holographic fountain, surrounding shops, gateway between old and new Tokyo",

    "floor3": "stunning Shinjuku skyline, towering glass skyscrapers reflecting sunlight, holographic corporate logos floating between buildings, elevated walkways connecting towers, blue sky with dramatic clouds, overwhelming urban grandeur",
    "floor3_1": "Shinjuku west exit plaza, massive open area with futuristic sculptures, government building in background, holographic wayfinding displays, elevated highways with sleek vehicles, metropolitan scale",
    "floor3_2": "Shinjuku golden street reimagined, narrow alley of tiny bars upgraded with holographic signs, lanterns mixing warm orange with cool blue tech, intimate urban atmosphere but bright and inviting",
    "floor3_3": "Shinjuku central park area, green oasis surrounded by skyscrapers, holographic art installations floating above pond, modern bridges, nature meeting technology in harmony, peaceful contrast to urban density",
    "floor3_4": "Shinjuku transit hub, massive modern station exterior, flowing crowds replaced by empty clean platforms, departure boards with holographic schedules, impressive architectural glass and steel canopy",
    "floor3_5": "Shinjuku department store district, luxury shopping towers with AR window displays, wide boulevards with holographic street art, fashion billboards, upscale urban sophistication, late afternoon golden light",

    "floor4": "iconic Shibuya crossing reimagined, massive intersection surrounded by screens and holographic billboards, futuristic Hachiko statue with AR elements, glass architecture reflecting sky, vibrant saturated Tokyo landmark",
    "floor4_1": "Shibuya center street, pedestrian shopping road with floating holographic advertisements, trendy fashion stores with AR displays, modern street lamps, youth culture meets futuristic design",
    "floor4_2": "Shibuya stream area, sleek modern development along urban river, glass walkways over water, holographic art on building facades, green terraces on rooftops, contemporary Tokyo architecture",
    "floor4_3": "Shibuya sky observation area, rooftop view looking over the ward, holographic information overlays on landmarks, helicopter pad with AR markers, breathtaking elevated cityscape panorama",
    "floor4_4": "Shibuya Miyashita park, elevated urban park with futuristic playground, holographic billboards visible from park, skate area with AR obstacles, modern green space surrounded by glass towers",
    "floor4_5": "Shibuya Mark City entrance, covered walkway with digital ceiling displays, modern escalators, luxury brand stores with holographic mannequins, dramatic architectural canopy design",

    "floor5": "dazzling Akihabara electric town, buildings covered floor-to-ceiling in colorful anime billboards and LED screens, holographic mascot characters floating above storefronts, electronics paradise, overwhelming vibrant sensory feast",
    "floor5_1": "Akihabara main street, famous electronics district with futuristic shop facades, holographic product demonstrations in mid-air, arcade entrances with AR effects, pure concentrated pop culture energy",
    "floor5_2": "Akihabara side alley, smaller specialty electronics shops, component stores with holographic schematics on display, cables and circuit boards aesthetic, hidden tech treasures, warm lighting",
    "floor5_3": "Akihabara radio center area, dense collection of tiny electronic component shops, holographic price tags floating, vintage meets futuristic, labyrinthine shopping complex, blue and warm mixed lighting",
    "floor5_4": "Akihabara UDX building area, modern architecture contrasting with classic electric town, large open plaza with holographic event displays, convention center aesthetic, impressive modern structure",
    "floor5_5": "Akihabara station area, transit hub surrounded by electronics mega-stores, massive holographic advertisements, digital billboards stacked stories high, anime character projections, electric energy everywhere",

    "floor6": "majestic Chiyoda ward, imposing government buildings with neoclassical architecture upgraded with holographic national emblems, wide pristine boulevards, meticulously manicured trees, institutional power and beauty",
    "floor6_1": "Imperial Palace outer gardens from Chiyoda, ancient stone walls meeting futuristic Tokyo skyline, moat with crystal-clear water, perfectly maintained pine trees, bridge with subtle tech railings, timeless beauty",
    "floor6_2": "Chiyoda Marunouchi business district, red-brick historic buildings with holographic facades, tree-lined boulevard, luxury car-free streets, European-Tokyo fusion architecture, golden afternoon light",
    "floor6_3": "National Diet Building area, impressive government architecture with subtle holographic security, wide ceremonial approach, cherry trees in bloom, institutional grandeur meeting subtle futurism",
    "floor6_4": "Chiyoda Yasukuni shrine approach, long tree-lined avenue with floating lanterns, traditional torii gate with AR spiritual energy, stone paths, autumn leaves mixed with holographic particles",
    "floor6_5": "Chiyoda Kitanomaru park, traditional Japanese garden with futuristic subtle touches, pond with holographic koi fish, maple trees, tea house with modern glass, serene contemplative atmosphere",

    "floor7": "breathtaking Imperial Palace main gate, ancient traditional architecture with otherworldly holographic barrier, most advanced technology guarding most traditional space, dramatic sky, ultimate fusion of old and new Japan",
    "floor7_1": "Imperial Palace east gardens, meticulously maintained traditional garden with hidden advanced technology, stone walls with holographic historical overlays, season flowers in perfect bloom, inner sanctum tranquility",
    "floor7_2": "Imperial Palace bridge Nijubashi, famous double-bridge with futuristic upgrades, holographic imperial crest above, reflection in still moat water, guard house with subtle tech, iconic view",
    "floor7_3": "Imperial Palace inner courtyard, most restricted area visible for first time, traditional architecture at its finest with ultimate technology hidden within, zen garden with AR elements, peak beauty",
    "floor7_4": "Imperial Palace tower tenshu-dai, stone foundation of ancient tower, holographic reconstruction of original castle tower visible above, historical and futuristic layers overlapping, dramatic clouds",
    "floor7_5": "Imperial Palace throne room approach, long ceremonial hallway, sliding doors with holographic imperial motifs, most ornate traditional architecture with invisible technology, ultimate power and tradition",
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
                "filename_prefix": f"floor_backgrounds/{bg_id}"
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
    os.makedirs(r"C:\Users\michi\ComfyUI\output\floor_backgrounds", exist_ok=True)

    total = len(FLOOR_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} FLOOR BACKGROUNDS")
    print("1536x1024 bright anime cityscape style")
    print("=" * 60)

    success = 0
    failed = []

    for i, (bg_id, desc) in enumerate(FLOOR_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {bg_id}")
        print(f"  {desc[:60]}...")

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
    print(f"COMPLETE: {success}/{total} floor backgrounds generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print(f"Output: C:\\Users\\michi\\ComfyUI\\output\\floor_backgrounds\\")
    print("=" * 60)


if __name__ == "__main__":
    main()
