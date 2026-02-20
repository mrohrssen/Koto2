# NEO TOKYO: System Liberation — Art Style Guide

## Game Identity

Near-future Tokyo. Citizens possessed by SYSTEM AI need liberation. Turn-based dungeon crawling across 7 Tokyo wards converging on the Imperial Palace.

**Tone**: Bright, optimistic, energetic. The world is threatened but feels alive and vibrant — not dystopian or grimdark. Think Saturday morning anime, not Blade Runner.

**Visual references**:
- Pokemon Z-A — futuristic urban setting, clean colorful design
- Xenoblade Chronicles — dramatic character poses, bold costume design, epic bosses
- Genshin Impact — gacha-quality character art, vibrant saturated palette, anime movie backgrounds
- Fire Emblem Heroes — full-body character illustrations, dynamic stances
- Makoto Shinkai films — background lighting, sky quality, urban atmosphere

**Color philosophy**: Saturated and warm. Varied palette per character (no monochrome). Liberation (player side) = orange, pink, gold. SYSTEM (enemy side) = cyan, blue. But enemies themselves are colorful people, not blue-tinted robots.

## Asset Categories

### Enemy Sprites

Everyday Tokyo citizens and dramatic bosses rendered as gacha-quality character art.

**Style keywords**: solo, single character, anime character illustration, full body, dynamic pose, anime game character, vibrant saturated colors, warm lighting, natural skin tones, clean lines, sharp details

**Subject range**:
- Regular enemies: Japanese civilians (students, office workers, chefs, nurses, shoppers, etc.) in recognizable modern clothing
- Bosses: Dramatic fantasy-anime rulers (capes, armor, halos, rainbow effects, royal regalia)

**Must have**: Transparent background, bold readable silhouette, distinct color identity per character

**Must avoid**: Monochrome/silhouette, dark/horror, realistic proportions, furry/non-human (for regular enemies), multiple characters, complex backgrounds

**Technical**: 1024x1024, RMBG-2.0 background removal

### Chip Icons

Everyday objects personified as cute chibi creature-robots. The object IS the character's body.

**Style keywords**: chibi character, gacha game art style, mobile game character icon, bright vivid colors, clean, simple background, cute

**Subject range**: Onigiri with a face, scissors as a robot, speakers with limbs, books with wings. The object's function inspires its personality (scissors = sharp/precise, drum = energetic).

**Must have**: Transparent background, immediately recognizable source object, cute/appealing personality

**Must avoid**: Realistic objects, human/humanoid characters, dark or gritty, text/writing on the image, complex backgrounds

**Technical**: 1024x1024, RMBG-2.0 background removal

### Backgrounds

Anime-style Tokyo cityscapes and themed locations viewed at street level.

**Style keywords**: anime background, cityscape, street level perspective, eye level camera, vibrant, colorful signage, modern Tokyo architecture, blue sky, detailed

**Subject range**:
- Floor backgrounds: Tokyo ward streets with distinct character (residential quiet, neon nightlife, corporate towers, government buildings, imperial grandeur)
- Location backgrounds: Specific places (convenience store, school, hospital, station, restaurant, etc.)
- Hub: Futuristic command center overlooking city at sunset

**Must have**: Street-level perspective (ground visible, looking forward/up at buildings), bright lighting, ward-appropriate atmosphere

**Must avoid**: Aerial/bird's-eye views, floating islands, top-down perspective, dark/night-only scenes, empty featureless spaces

**Technical**: Landscape resolution (e.g., 1344x768), no background removal

## CivitAI Research Keywords

Broad search terms for discovering relevant models:

**General**: game, game art, rpg, gacha, mobile game, anime, illustrious
**Characters**: anime character, game sprite, full body, dynamic pose, character design, character sheet
**Chibi/Icons**: chibi, mascot, cute creature, game icon, kawaii, super deformed
**Backgrounds**: anime background, visual novel, cityscape, tokyo, urban, game background, scenery
**Style**: clean lines, vibrant colors, cel shading, digital art, illustration

## Current Technical Baseline

- **Checkpoint**: waiIllustriousSDXL_v160
- **Sampler**: DPM++ 2M
- **Scheduler**: Karras
- **Steps**: 30
- **CFG**: 7.5
- **Resolution**: 1024x1024 (sprites/chips), landscape (backgrounds)
- **Post-processing**: RMBG-2.0
- **Embeddings**: None currently
- **ComfyUI host**: 10.5.0.2 (SSH user: michia)

## Lessons Learned

From previous regeneration rounds (see `docs/plans/2026-01-24-image-regeneration-report.md`):

1. Negative prompts alone don't fix composition — if positive prompt implies height ("panorama", "skyline"), the model produces aerial views regardless
2. Describe ground-level elements explicitly — sidewalks, storefronts at eye level, looking UP at buildings
3. Non-human outputs need aggressive human anchoring — "human male, japanese man, realistic human proportions" plus extensive fantasy negatives
4. RMBG-2.0 background removal works reliably across all sprite types
5. The word "cyberpunk" in prompts tends to produce dark/monochrome results — avoid it, describe the futuristic elements directly instead
