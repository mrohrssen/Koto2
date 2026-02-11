#!/usr/bin/env python3
"""
Generate 46 item sprites for NEO TOKYO: System Liberation
Beautiful anime-style item icons — simple, clean, evocative.
512x512 with transparent background via RMBG-2.0.
(Items display at ~48-64px in-game, 512 is plenty even for 3x Retina.)

Run from Mac with ComfyUI already running on 192.168.1.222:8188.
Output: item_sprites/ folder in ComfyUI output on the remote machine.
"""

import json
import urllib.request
import time
import random

COMFYUI_URL = "http://192.168.1.222:8188"

STYLE = (
    "solo object, anime item icon, JRPG inventory art, beautiful illustration, "
    "soft lighting, delicate shading, white background, clean linework, "
    "high quality, detailed, centered composition"
)

NEGATIVE = (
    "dark, gritty, realistic, horror, text, letters, writing, watermark, signature, "
    "blurry, low quality, multiple objects, complex background, human, person, character, "
    "chibi, robot, mecha, pokeball, monochrome, photo, 3d render"
)

# Descriptions: simple anime item art. Physical items are straightforward,
# abstract concepts get a poetic visual object to represent them.
ITEM_DESCRIPTIONS = {
    # ===== Enchanted Wilderness =====
    "water": (
        "a beautiful clear glass bottle of water, crystal blue liquid inside, "
        "condensation droplets on glass, soft blue glow, delicate and refreshing"
    ),
    "mountain": (
        "a smooth river stone with a tiny snow-capped mountain painted on it, "
        "earthy brown and white tones, sturdy and grounding, faint misty aura"
    ),
    "sky": (
        "a luminous glass orb containing a miniature sky with fluffy white clouds, "
        "soft blue gradient, golden sunlight peeking through, ethereal and dreamy"
    ),
    "nature": (
        "a lush green wreath of intertwined leaves and wildflowers, "
        "soft pink blossoms and emerald foliage, morning dew droplets glistening, "
        "gentle healing glow"
    ),
    "sea": (
        "a beautiful seashell with iridescent pearl interior, ocean blue and pink tones, "
        "tiny wave of sparkling water curling around it, sea foam accents"
    ),
    "summer": (
        "a bright sunflower in full bloom with golden petals, "
        "warm orange sunlight radiating behind it, a few floating dandelion seeds, "
        "vibrant summer energy"
    ),
    "smell": (
        "an elegant incense stick in a small ceramic holder, "
        "delicate wisps of purple and lavender smoke curling upward, "
        "tiny flower petals floating in the smoke trail"
    ),
    "spring": (
        "a cherry blossom branch with soft pink sakura flowers in bloom, "
        "a few petals drifting gently downward, fresh green buds, "
        "warm spring breeze feeling"
    ),
    "winter": (
        "a perfect hexagonal snowflake crystal, intricate ice patterns, "
        "pale blue and white with a soft frost glow, "
        "tiny ice sparkles floating around it"
    ),
    "autumn": (
        "a beautiful red and gold maple leaf, vivid gradient from crimson to amber, "
        "warm golden light behind it, a few smaller leaves drifting nearby"
    ),

    # ===== School District =====
    "time": (
        "an ornate golden pocket watch with its cover open, "
        "elegant roman numeral face, delicate gold chain, "
        "faint clockwork gears visible, shimmering golden aura, precious and timeless"
    ),
    "words": (
        "an open scroll with beautiful calligraphy brush strokes, "
        "flowing black ink characters, a calligraphy brush resting beside it, "
        "ink droplets suspended mid-air, scholarly elegance"
    ),
    "photograph": (
        "a vintage polaroid photograph with soft faded edges, "
        "showing a beautiful sunset scene inside the frame, "
        "nostalgic warm color tones, slightly curled corners"
    ),
    "senior": (
        "an elegant school badge pin with a gold star emblem, "
        "polished metal finish, red and navy enamel details, "
        "a small ribbon underneath, distinguished and respected"
    ),
    "paper": (
        "a sheet of fine Japanese washi paper with subtle fiber texture, "
        "a single red brushstroke across it, elegant simplicity, "
        "soft cream color with delicate edges"
    ),
    "clock": (
        "a cute round alarm clock with twin bells on top, "
        "pastel blue body, white face with simple numbers, "
        "the hour and minute hands pointing cheerfully, small ticking motion lines"
    ),
    "letter": (
        "a sealed letter envelope with a red wax seal stamp, "
        "cream-colored fine paper, a small pressed flower tucked under the flap, "
        "warm heartfelt feeling, soft golden light"
    ),
    "story": (
        "an antique leather-bound storybook slightly open, "
        "golden light and tiny stars spilling out from between the pages, "
        "ornate gold lettering on the spine, magical and enchanting"
    ),
    "music": (
        "a pair of delicate crystal music notes floating together, "
        "soft rainbow light refracting through them, "
        "tiny sparkle particles trailing behind, melodic and serene"
    ),

    # ===== Market District =====
    "money": (
        "a small pouch of coins spilling golden coins, "
        "shiny gold and silver coins with embossed designs, "
        "the cloth pouch is deep purple velvet with a gold drawstring"
    ),
    "cooking": (
        "a steaming clay pot with a wooden lid slightly ajar, "
        "delicious warm steam rising with sparkles, "
        "rich brown pot with a ladle resting on the side, homey and inviting"
    ),
    "meal": (
        "a beautiful Japanese bento box with compartments showing colorful food, "
        "rice, tamagoyaki, pickled vegetables, everything neatly arranged, "
        "warm and appetizing, wrapped with a cloth furoshiki"
    ),
    "flavor": (
        "a small ceramic dish of rich amber sauce with a wooden spoon, "
        "aromatic steam curling upward with tiny flavor sparkles, "
        "warm golden-brown tones, savory and inviting"
    ),
    "medicine": (
        "an elegant apothecary bottle of emerald green liquid, "
        "glass bottle with a cork stopper, a small label with a cross symbol, "
        "soft green healing glow emanating from the liquid"
    ),
    "sake": (
        "a traditional ceramic sake bottle tokkuri with a small cup ochoko, "
        "white and blue ceramic with painted wave patterns, "
        "a warm amber glow from the sake inside, refined and elegant"
    ),
    "tea": (
        "a delicate porcelain teacup on a saucer filled with green matcha tea, "
        "soft steam wisps rising, a small bamboo whisk beside it, "
        "calming sage green color, peaceful and soothing"
    ),
    "rice": (
        "a warm bowl of freshly cooked white rice with steam rising, "
        "a pair of wooden chopsticks resting on the rim, "
        "fluffy glistening rice grains, simple and comforting"
    ),

    # ===== Family Village =====
    "feeling": (
        "a softly glowing pink and lavender crystal heart, "
        "translucent with warm light pulsing inside, "
        "tiny sparkle motes floating around it, gentle emotional warmth"
    ),
    "heart": (
        "a radiant red heart-shaped gemstone, faceted like a ruby, "
        "deep crimson with an inner golden glow, "
        "warm light rays emanating outward, precious and powerful"
    ),
    "family": (
        "a small wooden house ornament with a warm glowing window, "
        "cozy miniature home with a tiny chimney puff of smoke, "
        "warm amber light from inside, safe and welcoming"
    ),
    "friend": (
        "two small friendship bracelets intertwined, "
        "woven with colorful threads in blue and orange, "
        "a tiny star charm hanging from each, warm and cheerful"
    ),
    "ally": (
        "a round wooden shield with a painted handshake emblem, "
        "sturdy oak with iron rim, warm brown tones, "
        "a soft protective golden aura around it"
    ),
    "parents": (
        "a pair of matching silver rings on a small silk cushion, "
        "elegant simple bands with tiny engraved patterns, "
        "soft warm light between them, enduring and protective"
    ),
    "lover": (
        "a beautiful red rose in full bloom with a single dewdrop, "
        "rich velvety crimson petals, soft pink light radiating outward, "
        "a few floating rose petals, romantic and reviving"
    ),
    "siblings": (
        "two matching paper cranes side by side, one blue and one red, "
        "delicate origami folds, tiny sparkles between them, "
        "companionship and teamwork feeling"
    ),

    # ===== Crossroads Inn =====
    "name": (
        "an elegant name stamp hanko in red ink on a small ink pad, "
        "carved wooden stamp with a red seal impression beside it, "
        "traditional Japanese identity seal, crisp and personal"
    ),
    "book": (
        "a thick hardcover book with a deep blue cover and gold trim, "
        "a ribbon bookmark peeking out, slightly worn leather spine, "
        "warm scholarly glow, knowledge and wisdom feeling"
    ),
    "thing": (
        "a mysterious wrapped gift box with a large question mark on it, "
        "colorful wrapping paper with a sparkly ribbon bow, "
        "faint rainbow shimmer, playful mystery aura"
    ),
    "promise": (
        "a small red daruma doll with one eye painted in, "
        "traditional round shape with bold brushstroke details, "
        "determined expression, a wish waiting to be fulfilled"
    ),
    "clothes": (
        "a neatly folded kimono in deep indigo blue with white wave patterns, "
        "tied with a golden obi sash, elegant fabric texture, "
        "protective and dignified"
    ),
    "key": (
        "an ornate golden skeleton key with intricate scrollwork handle, "
        "antique brass finish with a faint magical blue glow at the tip, "
        "mysterious and important, unlocking potential"
    ),
    "riddle": (
        "a sealed puzzle box made of dark polished wood with gold inlay patterns, "
        "geometric interlocking design, faint glow from the seams, "
        "mysterious and rewarding"
    ),
    "travel": (
        "a worn leather travel journal with a compass rose on the cover, "
        "a small brass compass resting on top, map edges peeking out, "
        "adventure and discovery feeling"
    ),
    "map": (
        "an unfurled treasure map on aged parchment with burned edges, "
        "drawn pathways and a red X marking a destination, "
        "compass rose in the corner, detailed ink illustrations"
    ),
    "tool": (
        "a sturdy leather tool belt with a wrench and small hammer, "
        "well-worn brown leather with brass buckles, "
        "practical and reliable, craftsman quality"
    ),
    "present": (
        "a luxurious gift box wrapped in shimmering gold paper, "
        "topped with an elaborate red satin ribbon bow, "
        "magical sparkles floating upward from it, generous and exciting"
    ),
}


def create_workflow(item_id, description):
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
            "inputs": {"width": 512, "height": 512, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(1, 999999999),
                "steps": 20,
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
                "process_res": 512,
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
                "filename_prefix": f"item_sprites/{item_id}"
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
    total = len(ITEM_DESCRIPTIONS)
    print("=" * 60)
    print(f"GENERATING {total} ITEM SPRITES")
    print("512x512 anime item icons with transparent backgrounds")
    print(f"ComfyUI: {COMFYUI_URL}")
    print("=" * 60)

    success = 0
    failed = []

    for i, (item_id, desc) in enumerate(ITEM_DESCRIPTIONS.items(), 1):
        print(f"\n[{i}/{total}] {item_id}")
        print(f"  {desc[:80]}...")

        workflow = create_workflow(item_id, desc)
        prompt_id = queue_prompt(workflow)

        if prompt_id:
            if wait_for_completion(prompt_id):
                print(f"  [OK]")
                success += 1
            else:
                print(f"  [FAILED]")
                failed.append(item_id)
        else:
            print(f"  [QUEUE ERROR]")
            failed.append(item_id)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} item sprites generated")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    print("Output: item_sprites/ in ComfyUI output on remote machine")
    print("=" * 60)


if __name__ == "__main__":
    main()
