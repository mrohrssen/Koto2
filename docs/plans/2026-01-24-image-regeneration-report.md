# Image Regeneration Report - 2026-01-24

## Summary

Visual review of all game assets identified 30 problematic images (19 backgrounds + 11 enemy sprites). All 30 were successfully regenerated using ComfyUI on the Windows PC (192.168.1.222) with the waiIllustriousSDXL_v160 checkpoint.

## Issues Found

### Floor Backgrounds (19 images) - Aerial/Floating Perspective

The original generation produced bird's-eye views, floating castles, or drone-shot perspectives instead of street-level scenes.

| Image | Original Issue |
|-------|---------------|
| floor1.png | Bird's eye view of city |
| floor1_3.png | Aerial city with rivers |
| floor2_1.png | Looking down at shopping complex |
| floor2_4.png | Looking at rooftops from above |
| floor3.png | Skyline from clouds |
| floor3_1.png | Buildings from above |
| floor3_3.png | Island city from very high |
| floor3_4.png | Rooftops from above |
| floor4_2.png | City from above with rainbow ring |
| floor4_3.png | Helicopter view of city |
| floor5_1.png | Looking down at colorful streets |
| floor5_3.png | Rooftops with sun glare |
| floor5_4.png | Building rooftops |
| floor6.png | Floating fantasy castle in clouds |
| floor6_1.png | Floating castle in clouds |
| floor6_3.png | Floating castle in clouds |
| floor7.png | Floating palace in clouds |
| floor7_3.png | Floating palace island |
| floor7_4.png | Floating palace tower in clouds |

### Enemy Sprites (11 images) - Wrong Concept or Background Issues

| Image | Original Issue |
|-------|---------------|
| boredCivilServant.png | Yellow melting alien creature |
| calmPharmacist.png | Warrior monk with fire weapons |
| confusedApplicant.png | Power ranger/sentai character |
| itSupport.png | Fighter with fire effects |
| loudDelinquent.png | Historical warrior + background not removed |
| nightShiftWorker.png | Colorful dancer/alien |
| preciseStationStaff.png | Fantasy RPG character with staff |
| stockingWorker.png | Person with wrestling mask |
| veteranCashier.png | Young sporty woman (wrong age/concept) |
| worriedPatient.png | Background not removed (ornamental frame) |
| boss_dragon_elder.png | Background not removed (ornamental frame) |

## Fix Strategy

### Round 1: Initial Regeneration (30 images)

**Script:** `scripts/regenerate_bad_images.py`

**Background fixes:**
- Added to positive style: `"street level perspective, ground level view, eye level camera angle"`
- Added to negative: `"aerial view, birds eye view, from above, top down, overhead, satellite view, flying, floating, floating island, floating castle, clouds below, sky castle, bird perspective, drone shot, helicopter view, looking down"`
- Used same scene description prompts as original

**Enemy fixes:**
- Added to negative: `"ornamental frame, decorative border, picture frame, background scenery, fantasy warrior, medieval armor, sword, magic staff, RPG character"`
- Used same character description prompts as original

**Result:** 9/19 backgrounds fixed, 9/11 enemies fixed. 10 backgrounds still aerial, 2 enemies still wrong concept.

### Round 2: Rewritten Background Prompts (10 images)

**Script:** `scripts/regenerate_aerial_v2.py`

The negative prompt alone wasn't sufficient - the model interprets words like "panorama", "skyline", "tower district" as requiring elevated viewpoints. Prompts were completely rewritten to describe ground-level compositions:
- Removed abstract/overview words (panorama, skyline, breathtaking)
- Added explicit ground elements (sidewalk, pavement, storefronts at eye level)
- Described composition from pedestrian POV (looking up at buildings, path underfoot)
- Added to positive style: `"first person view standing on ground, eye level camera, vanishing point at horizon, ground visible at bottom of frame"`
- Added to negative: `"isometric, map view, miniature, tilt shift"`

**Result:** 10/10 backgrounds fixed.

### Round 3: Stronger Human Anchoring (2 sprites)

**Script:** `scripts/regenerate_enemies_v3.py`

nightShiftWorker and preciseStationStaff kept generating non-human/fantasy characters. Fixes:
- Rewrote style to strongly emphasize: `"human male, japanese man, realistic human proportions, normal human skin, modern clothing, everyday clothes"`
- Rewrote prompts with very specific clothing descriptions (exact colors, materials, garment types)
- Added extensive anti-fantasy negatives: `"alien, robot, monster, creature, fantasy, medieval, armor, sword, magic staff, scepter, RPG character, warrior, knight, wizard, mage, cape, wings, horns, tail, elf ears, green skin, blue skin, unusual skin color"`

**Result:** 2/2 sprites fixed.

## Final Result

All 30 images successfully regenerated and copied to the correct locations:
- `public/assets/backgrounds/` (19 floor backgrounds)
- `public/assets/sprites/enemies/` (11 enemy sprites)

## Scripts Location

All generation scripts are in `scripts/`:
- `regenerate_bad_images.py` - Round 1 (30 images, initial fix attempt)
- `regenerate_aerial_v2.py` - Round 2 (10 backgrounds, rewritten prompts)
- `regenerate_enemies_v3.py` - Round 3 (2 sprites, strong human anchoring)
- `generate_floor_backgrounds.py` - Original background generation script
- `generate_enemies_v2.py` - Original enemy generation script

## Lessons Learned

1. **Negative prompts alone don't fix composition** - If the positive prompt implies height/overview (panorama, skyline), the model will produce aerial views regardless of negative prompts.
2. **Describe ground-level elements explicitly** - Mentioning sidewalks, pavement, storefronts at eye level, looking UP at buildings forces street-level composition.
3. **Non-human outputs need aggressive human anchoring** - Some prompts need "human male, japanese man, realistic human proportions, normal human skin" in the style plus extensive fantasy/non-human negatives.
4. **RMBG-2.0 works reliably** - Background removal was consistent across all regenerated sprites.
