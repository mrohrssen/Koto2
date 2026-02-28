#!/usr/bin/env python3
"""
Slice 3×3 action icon grids into individual 128×128 PNGs.

Same algorithm as slice-item-grid.py but for action icons.
Uses 'slug' from manifest as filename.

Usage:
    python3 scripts/slice-action-icons.py              # Process all grids
    python3 scripts/slice-action-icons.py --batch 0    # Process specific batch
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STAGING_DIR = PROJECT_ROOT / "data" / "action-icon-staging"
OUTPUT_DIR = STAGING_DIR / "sliced"

BG_TOLERANCE = 35
MIN_GAP_WIDTH = 5


def detect_bg_color(img):
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    patches = [arr[:10, :10], arr[:10, w-10:], arr[h-10:, :10], arr[h-10:, w-10:]]
    all_pixels = np.concatenate([p.reshape(-1, 3) for p in patches])
    return all_pixels.mean(axis=0)


def content_mask(img, bg):
    arr = np.array(img.convert("RGB")).astype(float)
    dist = np.sqrt(np.sum((arr - bg) ** 2, axis=2))
    return dist > BG_TOLERANCE


def find_gap_splits(profile, n_splits):
    length = len(profile)
    kernel = np.ones(5) / 5
    smoothed = np.convolve(profile, kernel, mode='same')
    threshold = max(smoothed.max() * 0.05, 1)
    is_empty = smoothed < threshold

    gaps = []
    in_gap = False
    gap_start = 0
    for i in range(length):
        if is_empty[i] and not in_gap:
            in_gap = True
            gap_start = i
        elif not is_empty[i] and in_gap:
            in_gap = False
            gap_end = i
            mid = (gap_start + gap_end) // 2
            if 0.1 * length < mid < 0.9 * length and (gap_end - gap_start) >= MIN_GAP_WIDTH:
                gaps.append((gap_start, gap_end, mid))

    gaps.sort(key=lambda g: g[1] - g[0], reverse=True)
    splits = sorted([g[2] for g in gaps[:n_splits]])

    if len(splits) < n_splits:
        step = length // (n_splits + 1)
        splits = [step * (i + 1) for i in range(n_splits)]

    return splits


def process_batch(batch_idx, icon_size, prefix="grid-batch"):
    grid_path = STAGING_DIR / f"{prefix}-{batch_idx}.png"
    manifest_path = STAGING_DIR / f"{prefix}-{batch_idx}-manifest.json"

    if not grid_path.exists():
        print(f"  Grid not found: {grid_path}")
        return False
    if not manifest_path.exists():
        print(f"  Manifest not found: {manifest_path}")
        return False

    with open(manifest_path) as f:
        manifest = json.load(f)

    img = Image.open(grid_path)
    w, h = img.size
    bg = detect_bg_color(img)
    mask = content_mask(img, bg)

    row_profile = np.sum(mask, axis=1)
    col_profile = np.sum(mask, axis=0)

    col_splits = find_gap_splits(col_profile, 2)
    row_splits = find_gap_splits(row_profile, 2)

    col_bounds = [0] + col_splits + [w]
    row_bounds = [0] + row_splits + [h]

    bg_tuple = tuple(int(x) for x in bg)
    print(f"  Grid: {w}x{h}, bg: RGB{bg_tuple}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for entry in manifest:
        if entry.get("filler"):
            continue

        idx = entry["index"]
        slug = entry["slug"]
        r = idx // 3
        c = idx % 3

        x1 = col_bounds[c]
        y1 = row_bounds[r]
        x2 = col_bounds[c + 1]
        y2 = row_bounds[r + 1]
        cell = img.crop((x1, y1, x2, y2))

        cell_mask = content_mask(cell, bg)
        if not cell_mask.any():
            print(f"    EMPTY {slug}")
            continue

        rows_any = np.any(cell_mask, axis=1)
        cols_any = np.any(cell_mask, axis=0)
        by1 = int(np.argmax(rows_any))
        by2 = int(len(rows_any) - np.argmax(rows_any[::-1]))
        bx1 = int(np.argmax(cols_any))
        bx2 = int(len(cols_any) - np.argmax(cols_any[::-1]))

        content_crop = cell.crop((bx1, by1, bx2, by2))
        cw, ch = content_crop.size

        max_dim = icon_size * 0.88
        scale = min(max_dim / cw, max_dim / ch)
        new_w = max(1, int(cw * scale))
        new_h = max(1, int(ch * scale))
        content_crop = content_crop.resize((new_w, new_h), Image.LANCZOS)

        canvas = Image.new("RGB", (icon_size, icon_size), bg_tuple)
        paste_x = (icon_size - new_w) // 2
        paste_y = (icon_size - new_h) // 2
        canvas.paste(content_crop, (paste_x, paste_y))

        out_path = OUTPUT_DIR / f"{slug}.png"
        canvas.save(out_path, "PNG")
        print(f"    OK {slug} ({cw}x{ch})")

    return True


def build_gallery():
    """Build an HTML gallery of all sliced icons with labels."""
    sliced = sorted(OUTPUT_DIR.glob("*.png"))
    if not sliced:
        print("No sliced icons to gallery.")
        return

    # Collect all manifest data for word info
    word_info = {}
    for mf in sorted(STAGING_DIR.glob("grid-batch-*-manifest.json")):
        with open(mf) as f:
            for entry in json.load(f):
                if not entry.get("filler"):
                    word_info[entry["slug"]] = entry

    rows_html = []
    for i, p in enumerate(sliced):
        slug = p.stem
        info = word_info.get(slug, {})
        word = info.get("word", "")
        english = info.get("english", slug)
        category = info.get("category", "")
        cat_color = {"base": "#4fc3f7", "auto": "#81c784", "ultimate": "#ffb74d"}.get(category, "#ccc")

        rows_html.append(f"""
        <div class="icon-card">
          <img src="sliced/{slug}.png" alt="{slug}">
          <div class="label">{slug}</div>
          <div class="word">{word}</div>
          <div class="english">{english}</div>
          <div class="cat" style="background:{cat_color}">{category}</div>
        </div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Action Icons Review</title>
<style>
body {{ background: #1a1a2e; color: #eee; font-family: sans-serif; padding: 20px; }}
h1 {{ text-align: center; color: #e94560; }}
.stats {{ text-align: center; margin-bottom: 20px; color: #888; }}
.grid {{ display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }}
.icon-card {{
  background: #16213e; border-radius: 8px; padding: 8px;
  width: 140px; text-align: center; border: 1px solid #333;
}}
.icon-card img {{ width: 128px; height: 128px; image-rendering: auto; }}
.label {{ font-size: 11px; color: #aaa; margin-top: 4px; }}
.word {{ font-size: 16px; margin-top: 2px; }}
.english {{ font-size: 12px; color: #ccc; }}
.cat {{ display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px;
  margin-top: 4px; color: #000; font-weight: bold; }}
</style></head><body>
<h1>Action Icons Review</h1>
<div class="stats">{len(sliced)} icons &mdash;
  <span style="color:#4fc3f7">base</span> |
  <span style="color:#81c784">auto</span> |
  <span style="color:#ffb74d">ultimate</span>
</div>
<div class="grid">{"".join(rows_html)}</div>
</body></html>"""

    gallery_path = STAGING_DIR / "gallery.html"
    gallery_path.write_text(html)
    print(f"\nGallery -> {gallery_path}")


def main():
    parser = argparse.ArgumentParser(description="Slice action icon grids")
    parser.add_argument("--batch", type=int, default=None)
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()

    # Support multiple prefixes: grid-batch, move-batch, regen-batch
    prefixes = ["grid-batch", "move-batch", "regen-batch"]

    if args.batch is not None:
        # Try each prefix for the specified batch
        found = False
        for pfx in prefixes:
            grid_path = STAGING_DIR / f"{pfx}-{args.batch}.png"
            if grid_path.exists():
                print(f"=== {pfx} {args.batch} ===")
                process_batch(args.batch, args.size, prefix=pfx)
                found = True
        if not found:
            print(f"No batch {args.batch} found for any prefix")
    else:
        all_grids = []
        for pfx in prefixes:
            for gf in sorted(STAGING_DIR.glob(f"{pfx}-*.png")):
                idx = int(gf.stem.split("-")[-1])
                all_grids.append((pfx, idx))
        if not all_grids:
            print("No grid files found in", STAGING_DIR)
            return
        for pfx, idx in all_grids:
            print(f"=== {pfx} {idx} ===")
            process_batch(idx, args.size, prefix=pfx)

    build_gallery()
    print(f"\nDone! Sliced icons in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
