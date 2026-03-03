# Item Icon Pipeline

Generate, slice, and wire item icons into the game using Gemini 2.5 Flash (Nano Banana) + RMBG-2.0.

## Overview

1. **Generate** — Gemini creates 3×3 grids of food icons on pink background (3 API calls for 25 items)
2. **Slice** — Python script detects grid gaps, crops each icon, centers at 128×128
3. **RMBG** — ComfyUI on 10.5.0.2 removes backgrounds with AI (no color-key artifacts)
4. **Wire** — Output lands in `public/assets/sprites/items/{id}.webp`, already referenced by the shop

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate-item-icons.mjs` | Gemini 3×3 grid generation |
| `scripts/slice-item-grid.py` | Auto-detect gaps, crop & center icons |
| `scripts/rembg-item-icons.py` | RMBG background removal via ComfyUI |

## Step-by-Step

### 1. Generate grids

```bash
# Preview prompts without calling API
node scripts/generate-item-icons.mjs --dry-run

# Generate all batches (reads data/items.json, batches into groups of 9)
node scripts/generate-item-icons.mjs

# Or generate a specific batch
node scripts/generate-item-icons.mjs --batch 0
```

Output: `data/item-staging-images/grid-batch-{n}.png` + manifest JSON per batch.

Items are batched 9 at a time into 3×3 grids. The last batch is padded with filler items (marked in manifest, skipped by slicer). Style references from `data/creature-forge-style-refs/` are included automatically.

API key: `data/.creature-forge-gemini-key`

### 2. Slice into individual icons

```bash
# Slice all grids
python3 scripts/slice-item-grid.py

# Slice specific batch
python3 scripts/slice-item-grid.py --batch 0

# Custom size (default 128)
python3 scripts/slice-item-grid.py --size 256
```

Output: `data/item-staging-images/sliced/{id}.png`

The slicer auto-detects:
- **Background color** from corner pixels (Gemini drifts from pure magenta to ~RGB(221,48,143))
- **Grid gaps** by scanning content profiles for low-density valleys between items
- **Content bounding box** within each cell, then centers on the output canvas

### 3. Review

Serve the staging directory and open the gallery:

```bash
cd /path/to/jrpg
python3 -m http.server 8765 &
# Open http://localhost:8765/data/item-staging-images/gallery.html
```

### 4. Fix individual items

**Regenerate a single item** (when a specific icon looks bad):

```js
// In node — generate a single item with a custom prompt
// See the water-bottle example in the generation session
```

**Manually adjust centering** (e.g., shift down if steam makes it look top-heavy):

```python
# Re-slice with vertical offset
python3 -c "
from PIL import Image
img = Image.open('data/item-staging-images/sliced/rice-ball.png')
# ... crop content, shift paste_y += 5, save
"
```

**Fix overlapping items** (when Gemini places two items too close):

Analyze the grid to find actual gap positions, then re-crop with adjusted cell boundaries. The batch 1 bento/black-tea fix is a good example — the slicer's auto-detected split was wrong because the items overlapped.

### 5. Remove backgrounds with RMBG

Requires ComfyUI running on `10.5.0.2:8188` with the RMBG node installed.

```bash
# All items
python3 scripts/rembg-item-icons.py

# Specific items only
python3 scripts/rembg-item-icons.py --ids beer,sake,water-bottle
```

Output: `public/assets/sprites/items/{id}.png` + `.webp` (transparent, game-ready).

### 6. Adding new items

1. Add entries to `data/items.json`
2. Run `node scripts/generate-item-icons.mjs` — new items auto-batch from items.json
3. Slice: `python3 scripts/slice-item-grid.py`
4. Review in gallery, fix any centering/overlap issues
5. RMBG: `python3 scripts/rembg-item-icons.py --ids new-item-1,new-item-2`
6. Bump `SPRITE_VERSION` in `public/js/ui/sprite-utils.js` if redeploying

## Gotchas

- **Gemini drifts background color** — never pure #FF00FF, usually ~RGB(221,48,143). The slicer auto-detects from corners.
- **Gemini doesn't make even grids** — items are placed artistically, not on pixel-perfect boundaries. The slicer finds actual gaps.
- **Steam/particles cause bbox issues** — decorative elements above food push the visual center up. May need manual y-offset.
- **Adjacent items can overlap** — if two items are too close, the auto gap detection picks the wrong split. Fix by manually re-cropping those cells.
- **RMBG needs ComfyUI running** — check with `curl -s http://10.5.0.2:8188/system_stats`.
- **No text in prompts** — the prompt explicitly says no text/labels, but Gemini occasionally adds kanji (like 元福 on the sake bottle). Regenerate if it bothers you.

## File Layout

```
data/
  .creature-forge-gemini-key          # Gemini API key
  creature-forge-style-refs/          # Style reference images (shared with creature forge)
  item-staging-images/
    grid-batch-{n}.png                # Raw Gemini grids
    grid-batch-{n}-manifest.json      # Item order per grid
    sliced/                           # 128×128 icons with pink bg
    gallery.html                      # Review page (pink bg versions)
    gallery-transparent.html          # Review page (transparent versions)
public/assets/sprites/items/
    {id}.png                          # Game sprites (transparent)
    {id}.webp                         # Game sprites (transparent, served to browser)
```
