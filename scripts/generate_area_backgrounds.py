#!/usr/bin/env python3
"""
Generate 100 area background images (5 areas × 20 rooms each).
Bright anime game art style — Pokemon / Genshin Impact feel.
1536x1024, no background removal.

Run on Windows PC with ComfyUI at http://10.5.0.2:8188
Output: ComfyUI/output/area_backgrounds/{area_id}/{area_id}_{nn}_00001_.png
"""

import json
import urllib.request
import time
import random
import os
import sys

COMFYUI_URL = "http://10.5.0.2:8188"

STYLE = (
    "anime game background art, bright vibrant colors, warm sunlight, "
    "soft cel-shaded lighting, painterly detail, lush and inviting atmosphere, "
    "fantasy adventure game environment, no people, no characters, no text, "
    "slightly magical, gentle bloom lighting, rich saturated palette, "
    "high quality, detailed, clean composition, wide landscape shot"
)

NEGATIVE = (
    "neon lights, cyberpunk, dark gritty, rain, night, people, characters, person, "
    "text, watermark, UI, HUD, blurry, low quality, desaturated, gloomy, horror, "
    "scary, pokeball, poke ball, realistic photo, 3D render, chibi, logo, frame, "
    "border, vignette, split screen"
)

# ──────────────────────────────────────────────
# AREA PROMPTS: 5 areas × 20 rooms each
# Each prompt should evoke ONE specific room/scene within the area.
# All 20 prompts for an area share the same palette and world-feel.
# ──────────────────────────────────────────────

AREAS = {
    "okunomori": {
        "nameEn": "Deep Forest",
        "palette": "emerald greens, honey-gold sunshafts, warm amber bark, soft teal bioluminescence, mossy earth tones",
        "rooms": [
            # 01 – Mossy Clearing
            "sun-dappled forest clearing, thick carpet of emerald moss and tiny white star flowers, golden light pouring through a break in the dense canopy overhead, massive silver-barked tree trunks framing the edges, floating spores catching the light like tiny lanterns",
            # 02 – Ancient Hollow Tree
            "enormous ancient tree with a wide hollow opening at its base, warm amber light glowing inside the hollow from bioluminescent moss, thick gnarled roots spreading across the forest floor, shelf fungi in apricot and cream climbing the trunk",
            # 03 – Stream Crossing
            "clear forest stream flowing over smooth tea-colored stones, mossy stepping stones crossing the water, tall fern fronds lining both banks, dappled golden light filtering through overhead canopy, tiny white flowers along the water's edge",
            # 04 – Mushroom Grove
            "cluster of large colorful mushrooms growing among tree roots, shelf fungi in warm apricot and peach tones, soft teal bioluminescent glow from caps in the shade, thick moss carpet, fallen leaves scattered on the ground, warm diffused forest light",
            # 05 – Fern Valley
            "narrow forest valley filled with towering fern fronds taller than a person, soft green light filtering through the fronds, a narrow dirt path winding between them, tiny golden spores floating in the air, moss-covered boulders",
            # 06 – Fallen Log Bridge
            "massive fallen tree spanning a misty forest ravine, its bark covered in thick emerald moss and tiny shelf mushrooms, roots exposed at one end reaching skyward, faint mist rising from below, warm light at the far end",
            # 07 – Spider Silk Glade
            "forest glade with elaborate spider webs strung between branches, each strand beaded with morning dew catching prismatic light, soft golden backlight, delicate and beautiful rather than spooky, tiny white flowers on the ground",
            # 08 – Root Cave Entrance
            "cave entrance formed by massive interwoven tree roots, soft teal and peach bioluminescent moss lining the interior, warm light spilling in from above, thick green vines hanging like curtains around the opening",
            # 09 – Wildflower Meadow
            "small meadow deep within the forest ringed by tall trees, wild purple and white flowers swaying gently, butterflies and floating golden spores, warm honey sunlight flooding the open space, clover carpet",
            # 10 – Lily Pad Pond
            "still forest pond reflecting the canopy above, floating lily pads with pale pink blooms, smooth stones visible through crystal-clear water, soft moss bank, weeping willow trailing its branches into the water, warm dappled light",
            # 11 – Canopy Bridges
            "view high up in the forest canopy, natural bridges formed by intertwining branches between massive trees, golden sunlight breaking through leaves, birds-eye glimpse of the green forest floor far below, warm and airy",
            # 12 – Stone Circle
            "ancient moss-covered standing stones in a forest clearing, each stone draped with flowering vines, soft warm light between the stones, clover and tiny white flowers growing in the gaps, serene and mystical atmosphere",
            # 13 – Waterfall Grotto
            "gentle waterfall cascading over mossy rocks into a shallow pool, mist creating tiny rainbows in the sunlight, lush ferns and flowering vines framing the falls, smooth wet stones, warm golden light overhead",
            # 14 – Bamboo Thicket
            "dense grove of tall green bamboo at the forest edge, light filtering through slender stalks in vertical stripes, a narrow path through the middle, bamboo leaves scattered on the ground, peaceful and geometric",
            # 15 – Berry Thicket Trail
            "winding forest trail lined with bushes heavy with ripe colorful berries in red and purple, dappled warm light, soft moss underfoot, small birds perched on branches, inviting and cozy forest path",
            # 16 – Overgrown Shrine Marker
            "small weathered stone marker half-swallowed by tree roots and flowering vines, offerings of tiny flowers placed at its base, warm shaft of golden light illuminating the marker, surrounding forest respectfully parted around it",
            # 17 – Firefly Twilight Grove
            "forest grove at golden hour with hundreds of warm golden firefly-like motes drifting between the trees, amber sunset light streaming horizontally through the trunks, long gentle shadows, magical twilight atmosphere",
            # 18 – Seed-Drift Clearing
            "open forest clearing with thousands of fluffy white seeds drifting upward on warm thermals, honey-gold afternoon light, a single ancient tree in the center shedding its seeds, peaceful uplifting feeling",
            # 19 – Forest Spring
            "natural spring bubbling up from between mossy rocks, crystal clear water pooling before flowing away as a tiny stream, delicate flowers growing around the spring's edge, warm dappled canopy light, serene and pure",
            # 20 – Heart of the Forest
            "the deepest part of the ancient forest, one impossibly large silver-barked tree dominating the scene, its roots covering the entire ground, canopy so high it vanishes into golden haze, bioluminescent moss glowing warmly on every surface, reverent cathedral-like space",
        ],
    },

    "shizukana-kouen": {
        "nameEn": "Peaceful Park",
        "palette": "soft pinks and whites of cherry blossoms, lush lawn green, warm wood browns, sky blue, golden afternoon light",
        "rooms": [
            # 01 – Entrance Trellis
            "park entrance through a wooden trellis arch draped with climbing roses in soft pink and white, gravel path leading inward, mature trees visible beyond, warm morning light, welcoming atmosphere",
            # 02 – Koi Pond Bridge
            "graceful arched wooden bridge over a koi pond, orange and white koi visible in clear water, lily pads with pink blooms, weeping willow on the far bank, warm golden afternoon light reflecting off the water",
            # 03 – Cherry Blossom Avenue
            "wide gravel path lined with cherry blossom trees in full bloom, petals drifting gently through the air like pink snow, dappled sunlight, green lawn on both sides, park benches beneath the trees",
            # 04 – Wisteria Tunnel
            "long garden tunnel formed by a wooden pergola draped in cascading wisteria in lavender and soft purple, filtered purple-pink light inside, gravel path running through the center, dreamy and romantic",
            # 05 – Stone Lantern Garden
            "collection of weathered stone lanterns of various sizes along a curving path, each softened by years of lichen and moss, low hedges and manicured shrubs, warm afternoon light casting long gentle shadows",
            # 06 – Bamboo Fountain Courtyard
            "quiet courtyard with a traditional bamboo water fountain (shishi-odoshi), water trickling into a stone basin, raked gravel, carefully placed rocks, Japanese maple in autumn colors overhead, meditative calm",
            # 07 – Hydrangea Walk
            "winding path through masses of hydrangea bushes in every shade from powder blue to deep violet to soft pink, bushes taller than head height, dappled shade, a few stepping stones through the flowers",
            # 08 – Lakeside Gazebo
            "white-painted wooden gazebo on the edge of a still lake, climbing ivy on its posts, a view across calm water to distant trees, warm golden hour light, a pair of ducks on the water, peaceful and idyllic",
            # 09 – Flower Clock Garden
            "ornamental flower bed arranged in a circular clock pattern with different colored blooms marking each hour, viewed from a slight elevation, manicured lawn surrounding it, bright cheerful colors",
            # 10 – Maple Grove
            "grove of Japanese maple trees with leaves in warm reds and oranges, dappled shade on moss-covered ground, a small wooden bench, warm autumnal light filtering through the canopy",
            # 11 – Iris Garden Stepping Stones
            "flat stepping stones winding through shallow water filled with blooming iris flowers in purple and white, reflections in the still water, small wooden railings on the sides, bright clean daylight",
            # 12 – Rose Pergola
            "long wooden pergola covered in climbing roses in cream, peach, and soft coral, petals scattered on the path below, warm fragrant atmosphere, lattice shadows on the ground, blue sky visible between blooms",
            # 13 – Duck Pond Shore
            "gentle grassy slope leading to a small pond with reeds, lily pads, and a few ducks, willow tree trailing into the water, scattered wildflowers in the grass, warm lazy afternoon light",
            # 14 – Zen Rock Corner
            "small zen garden corner within the park, carefully raked white gravel with placed stones, low bamboo fence border, moss accents, a single small pine tree, contemplative and minimal",
            # 15 – Moss Garden Path
            "path of flat natural stones through a lush moss garden, many shades of green, small stone basin and bamboo ladle, gentle filtered light through overhead branches, soft and tranquil",
            # 16 – Lavender Field Path
            "path winding through low rows of blooming lavender, purple-blue flowers stretching to both sides, warm afternoon sun, bees and butterflies, distant park trees on the horizon, fragrant and bright",
            # 17 – Small Waterfall Stream
            "gentle cascade of water over arranged natural stones into a stream, ferns and hostas along the banks, smooth river pebbles visible through clear water, the sound of trickling water, warm green shade",
            # 18 – Magnolia Canopy
            "grove of mature magnolia trees heavy with large creamy-white blossoms, petals scattered on the grass like fallen snow, dappled warm light, a worn green park bench underneath, peaceful solitude",
            # 19 – Sunset Meadow
            "wide open park meadow bathed in golden sunset light, long shadows from distant trees, dandelion seeds floating upward in warm thermals, the sky shifting from gold to soft pink, expansive and calming",
            # 20 – Spirit Wisp Garden
            "secluded corner of the park at golden hour, tiny motes of warm pale-gold light drifting among flower beds, spirit wisps floating gently like luminous pollen, wisteria and evening primrose blooming, magical and serene",
        ],
    },

    "himitsuno-toshokan": {
        "nameEn": "Secret Library",
        "palette": "warm honey wood, burgundy and forest green leather, amber lantern glow, stained glass jewel tones, golden dust motes",
        "rooms": [
            # 01 – Oak Door Entrance
            "narrow oak door set into ivy-covered stone wall, brass handle gleaming warmly, mysterious warm light spilling through the crack, flowering vines framing the doorway, a sense of invitation",
            # 02 – Central Spiral Tower
            "vast circular library tower interior, honey-colored wooden shelves spiraling upward along curved walls into golden haze far above, thousands of colorful book spines, dozens of floating paper lanterns drifting gently, warm amber light throughout",
            # 03 – Reading Nook
            "cozy ground-floor reading corner with plush coral and cream cushions on terracotta tile, low dark wood table with open illustrated book, floating lantern overhead, bookshelves rising on all sides, intimate and warm",
            # 04 – Floating Lantern Corridor
            "long corridor between towering bookshelves, dozens of glowing paper lanterns drifting along the ceiling at walking pace, warm pools of amber light on the wooden floor, book spines in burgundy and green on both sides",
            # 05 – Map Room
            "circular room with a large table covered in open atlases and nautical charts, pages turning slowly on their own, brass instruments and compasses, warm amber globe lights, maritime and scholarly atmosphere",
            # 06 – Stained Glass Alcove
            "reading alcove beneath a tall stained glass window casting pools of rose, amber, and sage-green light onto the floor, a single armchair, small side table with tea, books stacked nearby, jewel-toned and peaceful",
            # 07 – Restricted Whisper Section
            "dimly lit library aisle with velvet rope barriers, older and larger leather-bound books that seem to vibrate slightly, faint golden whisper-trails in the air, warm but mysterious, not frightening",
            # 08 – Top of the Spiral
            "view from the highest accessible balcony looking down the spiraling shelves of the library tower, floating lanterns visible at many levels below, golden haze, sense of vast depth and accumulated knowledge",
            # 09 – Star Chart Observatory
            "small domed room at the library's peak, brass telescope and celestial charts on the walls, a glass ceiling showing blue sky and clouds, constellation diagrams that shimmer with faint gold light, scholarly wonder",
            # 10 – Herbarium Wing
            "library wing dedicated to botanical illustrations and pressed flower collections, glass display cases with preserved specimens, warm wood shelves with green-spined volumes, dried flower garlands hanging from the ceiling",
            # 11 – Picture Book Alcove
            "cheerful low-ceilinged nook with colorful oversized picture books on low shelves, soft cushions on the floor, illustrations seeming to move slightly on open pages, warm and childlike wonder, storybook atmosphere",
            # 12 – Ancient Scroll Vault
            "stone-walled chamber lined with wooden cubbyholes holding rolled scrolls, a central reading podium with brass lamp, warm sandstone walls, scholarly and ancient feeling, parchment and cedar scent implied by warm tones",
            # 13 – Balcony Reading Spot
            "small wooden balcony jutting from the spiral shelves, single plush armchair and brass reading lamp, open book resting on the arm, view into the vast central shaft of the tower, warm and solitary",
            # 14 – Paper Butterfly Atrium
            "open central shaft of the library where loose pages flutter freely like paper butterflies, caught in warm updrafts, spinning slowly through golden lantern light, books on shelves on every side, magical and whimsical",
            # 15 – Music Manuscript Room
            "small warm room with musical scores displayed on stands, pages with notation that shimmers faintly, a cello resting in the corner, rich wood paneling, warm amber lighting, cultured and melodic atmosphere",
            # 16 – Clockwork Catalog Room
            "room with an elaborate brass mechanical catalog system, gears and pulleys connecting to card drawers, warm wood and polished brass, steampunk-light aesthetic, functional and beautiful mechanical design",
            # 17 – Illuminated Manuscript Gallery
            "gallery corridor with glass cases displaying gorgeous illuminated manuscripts, gold leaf and jewel-colored inks visible on the pages, warm indirect lighting, museum-quality presentation, awe-inspiring craftsmanship",
            # 18 – Hidden Passage Between Shelves
            "bookshelf swung open to reveal a narrow passage behind it, warm light from the other side, stone steps leading down, a few books fallen on the floor near the entrance, exciting and secretive",
            # 19 – Rooftop Reading Garden
            "small garden terrace on top of the library tower, potted plants and climbing roses, a wooden bench with cushion, open sky above, bookshelves visible through glass doors behind, fresh air meets warm knowledge",
            # 20 – Founding Archive
            "deepest chamber of the library, oldest and most precious books on stone shelves, a single ornate reading desk in the center, warm golden light from an unknown source above, dust motes drifting like gold leaf, reverent and ancient",
        ],
    },

    "kakureta-hama": {
        "nameEn": "Hidden Beach",
        "palette": "pale gold sand, turquoise to sapphire water, warm sea-cliff stone, soft coral and jade tide pool colors, sun-bleached driftwood silver",
        "rooms": [
            # 01 – Cliff Passage Entrance
            "narrow cleft in sea-smoothed basalt cliff just wide enough to pass through, warm light visible at the far end, wet stone walls, blue sky visible as a thin strip above, sense of discovery",
            # 02 – Crescent Cove Panorama
            "wide view of a hidden crescent-shaped beach with pale gold sand, turquoise shallows deepening to sapphire, tall cliff walls on both sides, blue sky overhead, sea glass and shells scattered on the sand",
            # 03 – Tidal Pool Shelf
            "rocky shelf at the edge of the beach dotted with shallow tidal pools, pink anemones and jade-green algae visible in the clear water, smooth polished stones, warm afternoon sun on the rocks",
            # 04 – Turquoise Lagoon Shallows
            "shallow turquoise lagoon with crystal-clear water over pale sand, gentle ripples catching sunlight, caustic light patterns dancing on the sandy bottom, warm and inviting, perfect stillness",
            # 05 – Driftwood Beach
            "section of beach scattered with sun-bleached driftwood in sculptural silver-white tangles, tide line treasures, sea glass in soft greens and blues, warm golden sand, gentle waves lapping",
            # 06 – Bioluminescent Sea Cave
            "sea cave with walls covered in soft aquamarine and warm peach bioluminescent growth, gentle waves lapping at the entrance, natural stone arch, the cave glowing warmly from within, magical and safe",
            # 07 – Rocky Promontory Lookout
            "flat-topped rocky promontory extending into the ocean, wide view of the open sea beyond the cove, warm wind-bent coastal grasses, spray catching sunlight in prismatic flashes, expansive horizon",
            # 08 – Cliff Waterfall
            "thin waterfall cascading down the cliff face into the beach below, mist creating rainbows where it catches sunlight, trailing vines and white star flowers on the cliff beside it, fresh water meeting salt",
            # 09 – Coral Garden Shallows
            "shallow clear water over a vibrant coral garden, colorful soft corals in pink and orange visible through the surface, small tropical fish, sunlight penetrating to the sandy bottom, warm and teeming with life",
            # 10 – Seashell Grotto
            "small grotto in the cliff wall whose floor is covered with accumulated seashells of every shape and color, smooth from the tide, warm light entering from above through a crack, a natural treasure chest",
            # 11 – Coastal Flower Path
            "sandy path along the cliff base lined with hardy coastal flowers, trailing vines with small white star blossoms, succulents in dusty rose and sage clinging to rock ledges, warm sea breeze implied by gentle motion",
            # 12 – Sea Arch
            "natural stone arch carved by the sea, framing a view of sparkling open ocean beyond, smooth wave-polished rock, spray misting in the sunlight, dramatic but warm natural formation",
            # 13 – Inner Hidden Cove
            "tiny secret cove within the larger cove, accessible through a low gap in the rocks, even more sheltered, perfectly still water reflecting the cliffs, intimate and private, sun-warmed",
            # 14 – Sunning Rock Shelf
            "broad flat rock shelf extending into shallow warm water, sun-heated stone, a few tidal pools at its edges, clear view of the cove, perfect for resting, warm and drowsy afternoon feel",
            # 15 – Kelp Forest Shallows
            "shallow water thick with gently swaying kelp fronds in warm brown and gold, clear enough to see the sandy bottom, sunlight filtering through the kelp creating shifting green-gold patterns",
            # 16 – Cliff-Top Overlook
            "view from the top of the cliff looking down into the hidden cove below, the crescent of golden beach and turquoise water laid out like a jewel, wind-bent grasses, wide blue sky, breathtaking perspective",
            # 17 – Moon Pool Cave
            "natural cave with a circular opening in the ceiling letting in a column of bright sunlight, illuminating a perfectly round pool of still turquoise water on the cave floor, natural spotlight effect",
            # 18 – Wind-Bent Tree Grove
            "small grove of trees on the cliff edge permanently shaped by sea wind, leaning dramatically inland, roots gripping exposed rock, tough coastal flowers growing between the trunks, resilient beauty",
            # 19 – Sandy Boulder Clearing
            "sheltered clearing among large smooth boulders on the beach, warm sand between them, sea glass and shells collected in the corners by the tide, natural walls providing shelter from wind, cozy",
            # 20 – Deep Channel View
            "view from the beach edge where the cove drops off into deep sapphire water, the underwater channel to the open ocean visible as a dark stripe through the clear shallows, sense of vast depth meeting shore",
        ],
    },

    "mahouno-gakkou": {
        "nameEn": "Magic School",
        "palette": "warm sandstone and polished timber, wisteria purple and gold, chalkboard green, cherry blossom pink, soft amber enchantment glow",
        "rooms": [
            # 01 – Wisteria Entrance Arch
            "wide stone arch entrance draped in blooming wisteria in gold, rose, and silver, gravel path leading up the hill, the warm sandstone school building visible beyond, morning light, welcoming and magical",
            # 02 – Main Hallway
            "wide sun-flooded school hallway with polished wooden floors, floating paper lanterns drifting along the ceiling casting warm amber pools of light, classroom doors open on both sides, warm and inviting",
            # 03 – Enchanted Classroom
            "school classroom with neat rows of wooden desks, a chalkboard at the front where yesterday's equations still glow and rotate slowly, floating chalk dust, warm sunlight through tall windows, scholarly magic",
            # 04 – Enchanted School Garden
            "overgrown school garden behind the main building, sunflowers turning to face the viewer, morning glories opening in sequence, spiraling clover patterns, weathered equipment shed, warm afternoon light",
            # 05 – Gymnasium
            "school gymnasium with polished wooden floor, high windows letting in shafts of warm light, equipment neatly stored along walls, volleyball nets that shimmer slightly with enchantment, clean and bright",
            # 06 – Rooftop Sky View
            "school rooftop enclosed by low stone wall, wide open sky, distant landscape visible, tiny golden motes of light rising from the stairwell, warm afternoon breeze implied by gently moving objects, peaceful height",
            # 07 – Music Room
            "warm school music room with a grand piano, golden motes of light rising from the keys, sheet music stands, instruments on wall hooks, sunlight streaming through windows, melodic and enchanted",
            # 08 – Science Laboratory
            "school science lab with wooden benches, glass beakers containing softly glowing colored liquids, botanical specimens under glass, brass instruments, warm natural light, scholarly and slightly magical",
            # 09 – School Library Corner
            "cozy corner of the school library, bookshelves with a few volumes hovering slightly off the shelf, a reading table with warm lamp, comfortable chairs, filtered light through paper screens",
            # 10 – Shoe Cubby Entrance Hall
            "school entrance hall with rows of wooden shoe cubbies, some glowing faintly where a charm was left behind, polished floors, morning light streaming through the entrance, first-day-of-school warmth",
            # 11 – Sundial Courtyard
            "inner courtyard with a decorative sundial on a stone pedestal, manicured shrubs, warm sandstone walls of the school on all sides, clear blue sky above, quiet between-classes calm",
            # 12 – Enchanted Pool
            "outdoor school pool with impossibly clear water that shifts colors in the sunlight, mosaic tile bottom with magical patterns, diving platforms, warm sandstone deck, blue sky reflected in the water",
            # 13 – Art Room
            "bright school art room with easels, paintings that seem to move slightly within their frames, splashes of vibrant color on every surface, warm light, creative energy, brushes and palettes arranged neatly",
            # 14 – Dining Hall
            "warm school dining hall with long wooden tables, large windows, floating candle-lanterns above, kitchen warmth visible through a serving window, trays and cups arranged neatly, communal and cozy",
            # 15 – Nurse's Office
            "clean bright school nurse's office, a bed with crisp white sheets, glass cabinet with jars of dried herbs and colorful healing tonics, warm sunlight, a vase of fresh flowers on the desk, comforting",
            # 16 – Lantern Stairwell
            "wide school stairwell between floors, warm wood banisters, floating lanterns drifting gently at each landing, sunlight from a skylight above, spirit wisps in pale amber and green floating lazily upward",
            # 17 – Faculty Room
            "school faculty room with large wooden desks covered in papers, a blackboard with schedules, comfortable chairs, tea set on a side table, warm afternoon light, organized and lived-in",
            # 18 – Supply Storage Room
            "school storage room with shelves of neatly organized supplies that occasionally shift positions on their own, warm dusty light from a single window, brooms and boxes, ordinary objects with subtle magic",
            # 19 – Bell Tower
            "school bell tower viewed from the base looking up, large bronze bell hanging above, wooden beams and spiral stair, warm golden light filtering through slat windows, the sky visible through gaps",
            # 20 – Underground Passage
            "stone-walled passage beneath the school, warm lanterns in iron brackets along the walls, faint magical sigils glowing on the floor, arched ceiling, old but well-maintained, a sense of school history and secrets",
        ],
    },
}


def create_workflow(area_id, room_index, description, palette):
    """Build a ComfyUI workflow for one background image."""
    full_prompt = f"{STYLE}, color palette: {palette}, {description}"

    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "waiIllustriousSDXL_v160.safetensors"},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": full_prompt, "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1536, "height": 1024, "batch_size": 1},
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
                "latent_image": ["4", 0],
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"area_backgrounds/{area_id}/{area_id}_{room_index:02d}",
            },
        },
    }
    return workflow


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        COMFYUI_URL + "/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
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
        except Exception:
            pass
        time.sleep(3)
    return False


def main():
    # Allow filtering to a single area via CLI arg
    filter_area = sys.argv[1] if len(sys.argv) > 1 else None
    if filter_area and filter_area not in AREAS:
        print(f"Unknown area '{filter_area}'. Available: {', '.join(AREAS.keys())}")
        sys.exit(1)

    areas_to_run = {filter_area: AREAS[filter_area]} if filter_area else AREAS
    total = sum(len(a["rooms"]) for a in areas_to_run.values())

    print("=" * 60)
    print(f"GENERATING {total} AREA BACKGROUNDS")
    print(f"Areas: {', '.join(areas_to_run.keys())}")
    print("1536x1024  |  waiIllustrious SDXL  |  bright anime game art")
    print("=" * 60)

    success = 0
    failed = []
    current = 0

    for area_id, area in areas_to_run.items():
        palette = area["palette"]
        rooms = area["rooms"]
        print(f"\n{'─' * 60}")
        print(f"  {area_id} — {area['nameEn']}  ({len(rooms)} rooms)")
        print(f"  Palette: {palette}")
        print(f"{'─' * 60}")

        for i, desc in enumerate(rooms, 1):
            current += 1
            tag = f"{area_id}_{i:02d}"
            print(f"\n[{current}/{total}] {tag}")
            print(f"  {desc[:70]}...")

            workflow = create_workflow(area_id, i, desc, palette)
            prompt_id = queue_prompt(workflow)

            if prompt_id:
                if wait_for_completion(prompt_id):
                    print("  [OK]")
                    success += 1
                else:
                    print("  [FAILED]")
                    failed.append(tag)
            else:
                print("  [QUEUE ERROR]")
                failed.append(tag)

            time.sleep(1)

    print("\n" + "=" * 60)
    print(f"COMPLETE: {success}/{total} area backgrounds generated")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}")
    print(f"Output: ComfyUI/output/area_backgrounds/")
    print("=" * 60)


if __name__ == "__main__":
    main()
