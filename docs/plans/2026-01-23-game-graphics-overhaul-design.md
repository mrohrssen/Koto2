# Game Graphics Overhaul: Pokemon/Monster Collector Aesthetic

## Summary

Replace all game graphics (backgrounds, enemy sprites, boss sprites, chip images) with a cohesive Pokemon-inspired anime style. Generated via ComfyUI on local PC (192.168.1.222, RTX 3090).

---

## Scope

| Asset Type | Count | Resolution | Style |
|-----------|-------|-----------|-------|
| Backgrounds | 53 | 1536x1024 | Clean anime cityscape, bright, futuristic Tokyo |
| Enemy sprites | 48 | 1024x1024 transparent | Pokemon NPC style, enhanced descriptions |
| Boss sprites | 7 | 1024x1024 transparent | Pokemon rival/gym leader style |
| Chip robots | 20 | 1024x1024 transparent | Gacha chibi, personified objects |

**Total: 128 images**

---

## Approved Styles

### Backgrounds
Bright, clean anime cityscapes of Tokyo wards with subtle futuristic touches. Inspired by Pokemon Legends Z-A city art.

```
Style: "anime illustration, bright colorful cityscape, clean lines, warm sunlight,
blue sky with white clouds, slightly futuristic, holographic signs, sleek modern
architecture, lush green trees, vibrant saturated colors, no people, game background
art, detailed, high quality, anime game environment"

Negative: "dark, gritty, cyberpunk, neon, rain, night, people, characters, person,
text, watermark, blurry, low quality, desaturated, gloomy, horror, scary, pokeball,
pokeballs, poke ball"
```

Each background gets an **enhanced description** with vivid detail language (e.g., "breathtaking panorama", "pristine street bathed in golden afternoon light", "intricate hand-painted signage"). This produces sharper, more detailed output.

### Enemies (Tokyo Citizens)
Pokemon NPC trainer style. Same base as bosses with enhanced character descriptions.

```
Style: "solo, single character, anime character illustration, full body dynamic pose,
white background, clean lines, anime game rival character style, dramatic confident
stance, elaborate detailed clothing, slight aura glow, imposing presence, vibrant
colors, game character art, high quality, sharp details, bold linework, high contrast"

Negative: "dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark,
blurry, low quality, chibi, super deformed, multiple characters, multiple people,
crowd, group, duo, blood, plain clothing, pokeball, pokeballs, poke ball"
```

Each enemy gets **enhanced descriptions** with visually strong language (e.g., "battle-worn japanese salaryman, sharp navy blue tailored suit, intense exhausted eyes, striking silhouette").

### Bosses
Same style as enemies but with more dramatic poses and elaborate clothing.

### Chips (Robot Creatures)
Gacha chibi style — personified objects where the object IS the body with a cute face and tiny limbs.

```
Style: "solo, chibi character, gacha game art style, mobile game character icon,
white background, bright vivid colors, high quality, clean"

Negative: "dark, gritty, realistic, horror, text, watermark, blurry, low quality,
multiple characters, complex background, pokeball, human, humanoid"
```

Each chip described as the actual object with a face (e.g., "a cute chibi battery robot, the body is a AA battery with an adorable face, oversized head-to-body ratio, tiny stubby limbs, sparking energy").

---

## Technical Pipeline

### Infrastructure
- **Remote PC**: 192.168.1.222 (Windows, user `michi`)
- **SSH key**: `~/.ssh/id_ed25519_remote_pc`
- **ComfyUI**: `C:\Users\michi\ComfyUI\` on port 8188
- **Model**: `waiIllustriousSDXL_v160.safetensors`
- **Background removal**: RMBG-2.0 node (for sprites/chips only)
- **GPU**: NVIDIA RTX 3090 (24GB VRAM)

### Generation Parameters
| Parameter | Value |
|-----------|-------|
| Steps | 30 |
| CFG | 7.5 |
| Sampler | dpmpp_2m |
| Scheduler | karras |
| Denoise | 1.0 |

### Workflow
1. Generate Python script with all prompts for a batch
2. SCP script to remote PC
3. Run via SSH — script queues images through ComfyUI API
4. RMBG-2.0 removes backgrounds for sprites/chips inline
5. SCP results back to Mac
6. Copy into `public/assets/` directories with correct naming

### Output Naming Convention
Files must match existing asset references:
- Backgrounds: `public/assets/backgrounds/floor{N}.png`, `floor{N}_{V}.png`
- Enemies: `public/assets/sprites/enemies/{camelCaseName}.png`
- Bosses: `public/assets/sprites/enemies/boss_{name}.png`
- Chips: `public/assets/icons/chips/{chipId}.png`

---

## Background Variants

Each floor needs 6 images (1 main + 5 variants). Variants show different angles/areas of the same ward:

| Floor | Ward | Variant Themes |
|-------|------|---------------|
| 1 | Nerima | Residential streets, parks, small shops |
| 2 | Nakano | Shopping arcades, Broadway, trendy stores |
| 3 | Shinjuku | Skyscrapers, business district, transit hubs |
| 4 | Shibuya | Crossing, screens, glass architecture |
| 5 | Akihabara | Electronics, colorful facades, LED streets |
| 6 | Chiyoda | Government buildings, Imperial gardens, traditional |
| 7 | Imperial Palace | Palace grounds, final area, most futuristic |

Plus: `hub.png`, `dungeon.png`, 9 location backgrounds (hospital, school, shopping, restaurant, office, convenience, government, station, residential).

---

## Enemy Sprite List (48)

All Tokyo citizens with enhanced descriptions. Full list from `data/enemy-mappings.json`:

angryCitizen, boredCivilServant, busyHousewife, calmPharmacist, chattyOfficeLady, coldDoctor, coldReceptionist, complainerCustomer, confusedApplicant, confusedOldMan, cryingChild, deliveryPerson, drunkGroup, eagerNewEmployee, energeticManager, friendlyWaiter, gymTeacher, indecisiveShopper, irritatedCustomer, itSupport, kindGrandmother, kindlyWindowStaff, kindNurse, lostTourist, loudDelinquent, neighborhoodKid, nightShiftWorker, partTimerStudent, platformPusher, preciseStationStaff, pushySalesperson, quietLibrarian, regularCustomer, runningStudent, rushingOfficeWorker, schoolNurse, silentChef, sleepingManager, stockingWorker, strictSectionChief, studentCouncilPresident, tiredSalaryman, trainOtaku, veteranCashier, worriedPatient

---

## Boss Sprite List (7)

| Floor | ID | Character | Description Focus |
|-------|-----|-----------|-------------------|
| 1 | boss_goblin_king | Anime Director | Dramatic coat, megaphone, storyboards |
| 2 | boss_wolf_alpha | Host Club King | Flashy white suit, champagne, roses |
| 3 | boss_lich | Mega Influencer | Trendy streetwear, floating phones, ring light |
| 4 | boss_ogre | Electronics Emperor | Lab coat, circuit patterns, holographic displays |
| 5 | boss_demon_lord | Foreign Corp CEO | Expensive tailored suit, imposing presence |
| 6 | boss_dragon_elder | Minister of Control | Government formal wear, authoritative |
| Final | boss_shadow_monarch | AI Emperor | Digital/holographic appearance, ultimate power |

---

## Chip Robot List (20)

| Chip ID | Object | Gacha Chibi Description Focus |
|---------|--------|-------------------------------|
| battery | AA Battery | Yellow cylinder, spark antennae, electric energy |
| speaker | Speaker | Speaker box body, cone face, sound waves |
| glasses | Glasses | Glasses-shaped body, lens eyes |
| lightbulb | Light Bulb | Bulb-shaped body, glowing filament |
| scissors | Scissors | Scissors body, blade arms |
| clock | Clock | Round clock body, hands as features |
| charcoal | Charcoal | Dark chunky charcoal body, ember glow |
| book | Book | Open book body, page details |
| eraser | Eraser | Rectangular eraser body, clean white |
| onigiri | Rice Ball | Triangular rice body, nori belt |
| wallet | Wallet | Folded wallet body, leather texture |
| straw | Straw | Long straw body, bendy middle |
| key | Key | Key-shaped body, tooth details |
| egg | Egg | Oval egg body, shell texture |
| fireworks | Firework | Rocket tube body, sparking fuse |
| mirror | Mirror | Round mirror body, reflective surface |
| feather | Feather | Feather-shaped body, fluffy texture |
| drum | Drum | Taiko drum body, drumstick arms |
| magnifyingGlass | Magnifying Glass | Lens body, handle leg |
| toolbox | Toolbox | Box body, tool accents |

---

## Cleanup Tasks (Separate from generation)

- Delete unused fantasy enemy sprites: `boss_demon_lord.png`, `boss_dragon_elder.png`, `boss_goblin_king.png`, `boss_lich.png`, `boss_ogre.png`, `boss_shadow_monarch.png`, `boss_wolf_alpha.png`, `demon.png`, `dragon.png`, `goblin.png`, `golem.png`, `knight.png`, `mage.png`, `orc.png`, `skeleton.png`, `shadow.png`, `slime.png`, `wolf.png`, `enemy.png`
- Delete old 169 chip icon files from `public/assets/icons/chips/`
- Add 2 new chips (magnifyingGlass, toolbox) to `data/chips.json`

---

## Implementation Order

1. Generate all 20 chip robots (gacha chibi style)
2. Generate all 48 enemy sprites (enhanced descriptions)
3. Generate all 7 boss sprites (enhanced descriptions)
4. Generate all 53 backgrounds (enhanced descriptions)
5. Copy all assets into correct directories with proper naming
6. Run cleanup (delete old/unused assets)
7. Run e2e tests to verify nothing broke
