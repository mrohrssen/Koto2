# Creature Sprite Quality Upgrade

## Problem

The 46 new creature sprites generated via ComfyUI SDXL are significantly lower quality than the original 25 element×rarity robot sprites. The old robots look like proper gacha game art — detailed, dynamic, exciting to collect. The new creatures look like simple emoji stickers.

## Root Cause: Prompt Quality Gap

The old robot prompts describe **5-6 layers of visual detail** per creature. The new creature prompts describe a "round cute blob with big eyes."

### Old Robot Prompt (metal-legendary) — GOOD
```
a chibi mythical platinum god robot, a majestic fusion of divine knight and ultimate mecha,
body of gleaming platinum and orichalcum with sacred circuit-rune engravings,
magnificent energy wings made of floating holographic blade feathers,
halo crown of spinning platinum rings with electric arcs,
divine electromagnetic aura, celestial machine spirit, godlike radiance,
maximum ornate detail, prismatic metallic aura
```

### New Creature Prompt (gilden, metal legendary) — BAD
```
ONE single chibi golden creature, small cute round body made of gleaming gold,
nugget-shaped paws, crown of gold crystals on head,
regal but friendly big eyes, brilliant metallic golden shine,
short stubby limbs, round body, chibi proportions
```

### What the Old Prompts Do Right

Each old prompt builds up **multiple visual layers**:

1. **Identity/concept** — "mythical platinum god robot", "fusion of phoenix and divine mecha"
2. **Body material** — "gleaming platinum and orichalcum", "polished granite with embedded gemstones"
3. **Surface detail** — "sacred circuit-rune engravings", "glowing lava cracks", "bark texture"
4. **Accessories/weapons** — "blazing fire sword", "dual retractable blade arms", "ice blade arm"
5. **Energy effects** — "swirling blizzard aura", "electromagnetic sparks", "cascading waterfall of green energy"
6. **Head/crown piece** — "halo crown of spinning platinum rings", "dragon-horned helmet"
7. **Dynamic elements** — "floating ice shards orbiting", "spinning gear decorations"
8. **Pose/stance** — "imposing battle stance", "swift ninja-mech vibe"

### What the New Prompts Do Wrong

- Describe only shape + color + face ("round pink body, big eyes, stubby arms")
- No surface texture or material quality
- No energy effects or auras (even for epics/legendaries)
- No accessories, weapons, or distinguishing features beyond basic shape
- No dynamic floating/orbiting elements
- Rarity boost is too weak — "simple design, round, cute" for commons kills all visual interest

## Solution: Rewrite All 46 Creature Descriptions

Rewrite the `description` field in `data/creatures.json` for all 46 creatures to match the old robot prompt quality. The creatures don't have to be robots/mecha, but they need the same **depth of visual description**.

### Prompt Structure Template

Every creature prompt should include (scaled by rarity):

```
[concept identity], [body material + texture], [surface detail/pattern],
[1-2 accessories or distinguishing features], [energy effect or aura],
[head piece or crown detail], [dynamic floating/orbiting elements],
[pose or action hint]
```

### Rarity Escalation

- **Common**: Still detailed! Specific materials, 1-2 accessories, subtle glow. NOT "simple round cute."
- **Uncommon**: More complex shapes, visible energy effects, 2-3 accessories
- **Rare**: Dramatic auras, weapons or special limbs, glowing cores, floating elements
- **Epic**: Fusion concepts, heavy detail, dramatic energy, imposing presence, multiple floating elements
- **Legendary**: Godlike, mythical fusion, maximum ornate detail, prismatic/divine auras, wings/halos

### Example Rewrites

**petalia (wood/common)** — Current: "A tiny flower creature with delicate petal wings..."

Better:
```
a cute chibi flower sprite creature, body made of soft layered flower petals in
pastel pink and white, delicate translucent petal wings with visible vein patterns,
tiny leaf-shaped feet, dew drops sparkling on petals, small golden pollen dust
floating around it, bright curious eyes peeking from between petals, gentle green glow
```

**gilden (metal/legendary)** — Current: golden blob

Better:
```
a chibi mythical golden idol creature, a majestic fusion of treasure dragon and
living gold, body of pure gleaming 24k gold with intricate filigree engravings,
magnificent golden energy wings made of floating coin-like scales,
divine halo crown of spinning golden rings with diamond sparks,
cascading shower of gold particles and light from its core,
celestial treasure spirit, godlike radiance, maximum ornate detail, prismatic golden aura
```

**statik (metal/rare)** — Current: TV robot

Better:
```
a chibi signal phantom robot, sleek chrome and teal body with CRT monitor head,
glowing pixel-art face displayed on screen with scan-line effects,
dual antenna ears crackling with electric arcs, floating static orbs orbiting body,
electromagnetic aura with visible lightning tendrils,
sharp angular armor plating with circuit-trace engravings, tech-knight stance
```

## Generation Pipeline

Scripts are ready in `scripts/`:
- `generate_creatures.py` — Main generation (reads creatures.json, queues to ComfyUI, downloads WebP)
- `retry_creatures.py` — Per-creature custom prompts for stubborn failures

ComfyUI workflow: CheckpointLoaderSimple (waiIllustriousSDXL_v160) → CLIPTextEncode(+/-) → EmptyLatentImage(1024×1024) → KSampler(30 steps, CFG 7.5, dpmpp_2m, karras) → VAEDecode → RMBG-2.0 → SaveImage

Output: `public/assets/sprites/robots/{creature_id}.webp`

### Negative Prompt (keep this — it works)
```
text, title, logo, watermark, username, signature, writing, letters, words,
japanese text, kanji, hiragana, katakana, alphabet, numbers, font, caption,
speech bubble, dialogue box, name plate, label, subtitle, credit,
game UI, icon, badge, HUD, frame, border, card frame, ornamental frame,
decorative border, thumbnail, small version,
duplicate, multiple copies, two characters, multiple characters,
reference sheet, character sheet, turnaround, model sheet,
size comparison, evolution chart,
blurry, low quality, complex background, human, humanoid, pokeball,
monochrome, silhouette, picture frame, vignette, circular frame,
ground, grass, floor, scenery, landscape, environment, scene,
pedestal, stand, platform, base, disc, coin, stage, podium,
dark, gritty, realistic, horror
```

### STYLE Prefix (keep this)
```
solo, ONE single chibi character only, cute monster creature, gacha game art style,
mobile game character icon, white background, bright vivid colors,
high quality, clean lineart, centered composition, single subject only,
full body, standing pose, collectible creature design,
large character filling the frame, close-up view
```

## Steps

1. Rewrite all 46 `description` fields in `data/creatures.json` using the template and rarity escalation above
2. Run `python scripts/generate_creatures.py --force` to regenerate all 46
3. Visual QA each sprite — retry failures with `scripts/retry_creatures.py`
4. Iterate until all 46 look as good as the old robots

## Gallery

Preview page at: `public/creatures-gallery.html` (shows all 46 in a grid with rarity borders)

## Lessons Learned from Generation Rounds 1-5

- The model struggles with "object IS the creature" concepts (table-creature, TV-creature). Reframe as animal-with-feature (turtle with flat shell, robot with screen head).
- Calligraphy/ink/kanji in prompts triggers Japanese text artifacts. Use "ink blob" or "paint creature" instead.
- "Multiple emotions" or "cycling faces" triggers multiple character generation. Describe ONE expression.
- The word "table", "stump", "tree" in creature prompts tends to generate scenery/environment. Use animal-body-with-texture instead.
- Strong anti-text negative prompt is essential. The current one works well.
- Per-creature custom prompts in retry_creatures.py are necessary for ~20% of creatures that fail with generic prompts.
