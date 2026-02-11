#!/usr/bin/env python3
"""
Generate 25 robot combat sprites for NEO TOKYO: System Liberation
Elemental combat robots - gacha chibi mecha style with element-themed designs.
5 elements (wood, fire, earth, metal, water) x 5 rarities (common -> legendary).
1024x1024 with transparent background via RMBG-2.0.

Run from Mac with ComfyUI already running on 192.168.1.222:8188.
Output: robot_sprites/ folder in ComfyUI output on the remote machine.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = "solo, chibi character, gacha game art style, mobile game character icon, white background, bright vivid colors, high quality, clean, cute mecha robot"

NEGATIVE = "dark, gritty, realistic, horror, text, watermark, blurry, low quality, multiple characters, complex background, human, humanoid, pokeball, monochrome, silhouette"

# Rarity visual escalation:
#   common    = simple, small, round, cute
#   uncommon  = slightly more detailed, small accent features
#   rare      = noticeable glow effects, more complex design
#   epic      = dramatic aura, ornate armor plating, imposing
#   legendary = mythical creature fusion, godlike aura, maximum detail

ROBOT_DESCRIPTIONS = {
    # ===== WOOD =====
    "wood-common": (
        "a cute small chibi wood robot, the body is a round wooden log stump with tree bark texture, "
        "tiny green leaf sprouts growing from its head, simple round eyes carved into the wood, "
        "stubby wooden peg arms and legs, cheerful nature spirit vibe, soft green glow"
    ),
    "wood-uncommon": (
        "a cute chibi mushroom-wood robot, the body is a thick tree trunk torso with bracket mushroom "
        "shoulder pads, mossy texture, small vine arms with leaf-shaped hands, acorn-cap helmet, "
        "bright green eyes, tiny roots for feet, forest fairy companion vibe"
    ),
    "wood-rare": (
        "a chibi thorny vine robot, the body is woven from thick green vines with sharp thorns, "
        "rose blossom on its chest glowing pink, leaf-blade arms, flowering crown on head, "
        "swirling petal aura around it, elegant forest knight, glowing green energy lines on vines"
    ),
    "wood-epic": (
        "a chibi ancient treant mecha robot, massive gnarled tree trunk body with ornate bark armor plating, "
        "glowing amber sap veins running through the body, thick branch arms with leafy energy blades, "
        "crown of golden autumn leaves, wise ancient eyes, dramatic swirling leaf storm aura, imposing stance"
    ),
    "wood-legendary": (
        "a chibi mythical world-tree dragon robot, a majestic fusion of sacred tree and dragon, "
        "body of luminous white bark with golden runes, massive flowering sakura branch wings, "
        "cascading waterfall of green energy from its core, divine halo of spinning golden leaves, "
        "celestial forest spirit, godlike radiance, maximum ornate detail, prismatic nature aura"
    ),

    # ===== FIRE =====
    "fire-common": (
        "a cute small chibi fire robot, the body is a round red-orange furnace orb, "
        "small flickering flame on top of its head like hair, warm glowing ember eyes, "
        "tiny stubby metal arms and legs with orange heat glow, cheerful and warm"
    ),
    "fire-uncommon": (
        "a cute chibi campfire robot, the body is a squat iron fire pit with dancing flames inside, "
        "flame-shaped ears, glowing orange visor eyes, short armored arms with flame gauntlets, "
        "coal-black legs with ember cracks, smoky wisps trailing behind"
    ),
    "fire-rare": (
        "a chibi magma knight robot, sleek red and black armored body with glowing lava cracks, "
        "flame mohawk crest on the helmet, wielding a blazing fire sword, "
        "molten core visible through chest plate window, dramatic fire wing aura trailing from back"
    ),
    "fire-epic": (
        "a chibi volcanic dragon mecha robot, heavy dark obsidian armor with pulsing magma veins, "
        "dragon-horned helmet with internal flame glow, massive gauntlets dripping with lava, "
        "erupting fire jets from back vents, dramatic orange-red inferno aura, imposing battle stance, "
        "molten core reactor in chest glowing white-hot"
    ),
    "fire-legendary": (
        "a chibi mythical phoenix god robot, a majestic fusion of phoenix and divine mecha, "
        "body of gleaming gold and crimson armor with sacred flame runes, "
        "magnificent blazing phoenix wing spread wide with rainbow fire feathers, "
        "solar halo crown of white-hot plasma, celestial rebirth flames cascading around body, "
        "divine fire spirit, godlike radiance, maximum ornate detail, prismatic flame aura"
    ),

    # ===== EARTH =====
    "earth-common": (
        "a cute small chibi earth robot, the body is a round boulder with a friendly face, "
        "pebble eyebrows, tiny crystal geode sparkle on forehead, "
        "stubby stone arms and legs, cracks showing warm orange mineral glow inside, cheerful and sturdy"
    ),
    "earth-uncommon": (
        "a cute chibi sandstone golem robot, blocky sandstone body with layered sediment stripes, "
        "small amethyst crystal cluster growing from one shoulder, gem-like purple eyes, "
        "rocky gauntlet hands, flat stone-slab feet, desert dust swirling at its base"
    ),
    "earth-rare": (
        "a chibi crystal knight robot, sleek body made of polished granite with embedded gemstones, "
        "large emerald crystal sword arm, diamond-faceted shoulder armor, "
        "glowing quartz core in chest, crystalline crown, shimmering prismatic light refracting around it"
    ),
    "earth-epic": (
        "a chibi mountain titan mecha robot, massive body of layered obsidian and marble armor, "
        "enormous crystal formations growing from shoulders and back, "
        "glowing golden ore veins pulsing through body, seismic energy crackling around fists, "
        "diamond-core reactor visible in chest, dramatic tectonic aura, imposing earthquake stance"
    ),
    "earth-legendary": (
        "a chibi mythical continental beast robot, a majestic fusion of mountain god and ancient golem, "
        "body of luminous jade and diamond armor with golden tectonic rune patterns, "
        "massive floating crystal formation wings orbiting its body, "
        "core of pure compressed diamond radiating prismatic light, divine earth halo of orbiting gemstones, "
        "celestial titan spirit, godlike radiance, maximum ornate detail, prismatic mineral aura"
    ),

    # ===== METAL =====
    "metal-common": (
        "a cute small chibi metal robot, the body is a round polished steel sphere with rivets, "
        "simple LED dot eyes, small antenna on head, tiny tin can arms and legs, "
        "shiny chrome finish, a few spinning gear decorations, cheerful classic robot vibe"
    ),
    "metal-uncommon": (
        "a cute chibi clockwork robot, brass and copper steampunk body with visible spinning gears, "
        "monocle-style lens eye, top-hat shaped head with steam vent, "
        "articulated mechanical arms with wrench-hands, spring-loaded legs, ticking clock core in chest"
    ),
    "metal-rare": (
        "a chibi blade dancer robot, sleek silver and blue mecha body with sharp angular armor, "
        "dual retractable blade arms, visor-style glowing blue eyes, "
        "spinning blade ring floating behind like a halo, electromagnetic sparks, "
        "aerodynamic speed lines, swift ninja-mech vibe"
    ),
    "metal-epic": (
        "a chibi heavy artillery mecha robot, massive dark steel and titanium body with layered armor plates, "
        "rail-cannon arm weapon crackling with electric charge, missile pod on opposite shoulder, "
        "glowing plasma reactor core in chest, heavy magnetic field aura with floating metal shards, "
        "imposing fortress stance, dramatic electric-blue energy surges"
    ),
    "metal-legendary": (
        "a chibi mythical platinum god robot, a majestic fusion of divine knight and ultimate mecha, "
        "body of gleaming platinum and orichalcum with sacred circuit-rune engravings, "
        "magnificent energy wings made of floating holographic blade feathers, "
        "halo crown of spinning platinum rings with electric arcs, divine electromagnetic aura, "
        "celestial machine spirit, godlike radiance, maximum ornate detail, prismatic metallic aura"
    ),

    # ===== WATER =====
    "water-common": (
        "a cute small chibi water robot, the body is a round blue water droplet shape with a face, "
        "tiny bubble crown on head, simple happy dot eyes, translucent blue gel-like body, "
        "stubby flipper arms and legs, small splashing water effects around feet, cheerful and bubbly"
    ),
    "water-uncommon": (
        "a cute chibi submarine robot, compact torpedo-shaped blue body with porthole window eyes, "
        "small periscope on head, propeller tail, finned arms, "
        "bubble trail rising from vents, coral and barnacle accent decorations, deep sea explorer vibe"
    ),
    "water-rare": (
        "a chibi ice knight robot, sleek body of frozen blue crystal armor with frost vapor, "
        "ice blade arm weapon with snowflake guard, frozen crown with icicle spikes, "
        "swirling blizzard aura, glowing cyan core, "
        "floating ice shards orbiting around it, elegant winter warrior"
    ),
    "water-epic": (
        "a chibi abyssal mecha robot, heavy deep-ocean blue and black armored body, "
        "bioluminescent glowing teal lines running through armor like deep sea creature, "
        "massive pressure cannon arm, tentacle-like cable appendages from back, "
        "whirlpool energy vortex around body, glowing abyssal core, "
        "imposing deep sea predator stance, dramatic tidal wave aura"
    ),
    "water-legendary": (
        "a chibi mythical leviathan god robot, a majestic fusion of sea dragon and divine mecha, "
        "body of luminous pearl-white and deep sapphire armor with sacred wave-rune patterns, "
        "magnificent water-dragon wings made of flowing crystalline water and ice, "
        "divine halo of spinning water rings with aurora light, celestial ocean aura cascading, "
        "ancient sea spirit, godlike radiance, maximum ornate detail, prismatic aquatic aura"
    ),
}


def create_workflow(robot_id, description):
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
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
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
        },
        "8": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["7", 0],
                "filename_prefix": f"robot_sprites/{robot_id}"
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
    total = len(ROBOT_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} ROBOT COMBAT SPRITES")
    print("1024x1024 gacha chibi mecha with transparent backgrounds")
    print("=" * 60)

    success = 0
    failed = []

    for i, (robot_id, desc) in enumerate(ROBOT_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {robot_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(robot_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(robot_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(robot_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} robot sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("Output: robot_sprites/ in ComfyUI output on remote machine")
    print("=" * 60)


if __name__ == "__main__":
    main()
