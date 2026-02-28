# Move Icons Generation — Status Report (2026-02-27)

## What Was Done

### 1. Created `scripts/generate-move-icons.mjs`
New script that reads `moves.json`, compares against existing icons in `public/assets/sprites/actions/`, and generates 3×3 grids via Gemini for the missing ones.

- Model: `gemini-3.1-flash-image-preview`
- Contains visual hints (descriptions) for all 93 missing move icons
- Outputs `move-batch-{N}.png` + manifest JSON to `data/action-icon-staging/`

### 2. Updated `scripts/slice-action-icons.py`
Modified the slicer to handle `move-batch-*` files in addition to `grid-batch-*` and `regen-batch-*`.

### 3. Generated all 11 batches
All 93 icons were generated, sliced to 128×128, and had backgrounds removed using local `rembg` (u2net).

### 4. Icons deployed to `public/assets/sprites/actions/`
93 new `.png` + `.webp` files now exist. All 150 moves in `moves.json` have matching icons.

## Current Problem: Quality Issues

**The icons look pixelated/pixel-art style.** The prompt inherited language from the old chroma-key pipeline that pushes Gemini toward pixel art:

```
- "read well at 128×128 pixels"
- "NO semi-transparent pixels, NO alpha blending"
- "fully opaque solid pixels"
- "Hard crisp edges"
```

This was needed when using magenta chroma-key for background removal (exact pixel color matching). Since we switched to **rembg** (AI-based background removal running locally), none of these constraints are needed anymore.

**Additionally, some icons are unclear/ambiguous:**
- `suffer` — abstract purple vortex, doesn't clearly communicate "suffering"
- `steal` — dark shadowy claw, reads more as "scratch" than "stealing"
- `extend` — came out very thin/narrow (96px wide in the grid), hard to read
- More icons likely need review — was interrupted during batch-by-batch review

## What Needs To Happen Next

### Fix 1: Rewrite the prompt (required)
Remove all pixel-art-inducing language. The prompt should ask for:
- Clean, smooth illustrated RPG skill icons (NOT pixel art)
- Vibrant colors, clear silhouettes
- Solid colored background (magenta is fine for slicing, rembg handles the rest)
- Drop all "no semi-transparent / no alpha / hard crisp edges" language

### Fix 2: Review and regen bad icons
After fixing the prompt, regenerate ALL 93 icons (or at minimum the bad ones). A full regen is safer since the style should be consistent.

### Fix 3: Re-run the pipeline
```bash
# 1. Regenerate grids with fixed prompt
node scripts/generate-move-icons.mjs

# 2. Slice into individual PNGs
python3 scripts/slice-action-icons.py

# 3. Remove backgrounds locally
python3 -c "
from rembg import remove
from PIL import Image
from pathlib import Path

SLICED = Path('data/action-icon-staging/sliced')
OUTPUT = Path('public/assets/sprites/actions')
for p in sorted(SLICED.glob('*.png')):
    img = Image.open(p)
    result = remove(img).convert('RGBA')
    result.save(OUTPUT / f'{p.stem}.png', 'PNG')
    result.save(OUTPUT / f'{p.stem}.webp', 'WEBP', quality=90)
    print(f'  {p.stem} OK')
"
```

## File Inventory

| File | Status |
|------|--------|
| `scripts/generate-move-icons.mjs` | New — needs prompt fix |
| `scripts/slice-action-icons.py` | Modified — multi-prefix support added |
| `data/action-icon-staging/move-batch-{0-10}.png` | Generated grids (pixelated quality) |
| `data/action-icon-staging/move-batch-{0-10}-manifest.json` | Batch manifests |
| `data/action-icon-staging/sliced/*.png` | Sliced 128×128 icons |
| `public/assets/sprites/actions/*.webp` | 93 new icons deployed (need regen) |

## The 93 Move Icons (for reference)

**Damage (28):** topple, fire, pull, wash-away, step-on, wound, tear, launch, wash, bury, demolish, pour, thrust, overflow, shoot, assault, roast, beat, penetrate, slice, snap, ruin, rip, spin, swallow-up, grasp, encircle, throw-away

**Buff (20):** dash, persevere, call, teach, approach, hurry, stand-up, jump-out, exceed, fly, leap, sparkle, challenge, stretch, stack, chirp, speak, extend, pray, performance

**Debuff (18):** rage, suffer, shake, doubt, stare, tremble, touch, cry, shout, trick, tie, abandon, restrict, extinguish, freeze, pin-down, catch, melt

**Heal (11):** cure, support, hand-over, drink, help, heal, rest, sleep, warm, recover, sprout

**Shield (13):** hide, protect, enlarge, guard, cover, submerge, revolve, stance, preserve, dodge, endure, conceal, float

**Drain (3):** steal, pluck, inhale
