#!/usr/bin/env python3
"""
Slice regen item icon grids into individual PNGs, replacing existing sliced icons.

Reads regen-batch-*.png grids + their manifests from data/item-staging-images/,
slices into 128×128 icons, and overwrites the corresponding files in sliced/.

Usage:
    python3 scripts/slice-regen-item-icons.py              # Process all regen grids
    python3 scripts/slice-regen-item-icons.py --batch 0    # Process specific batch
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STAGING_DIR = PROJECT_ROOT / "data" / "item-staging-images"
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


def process_batch(batch_idx, icon_size):
    grid_path = STAGING_DIR / f"regen-batch-{batch_idx}.png"
    manifest_path = STAGING_DIR / f"regen-batch-{batch_idx}-manifest.json"

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

    replaced = 0
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
        existed = out_path.exists()
        canvas.save(out_path, "PNG")
        status = "REPLACED" if existed else "NEW"
        print(f"    {status} {slug} ({cw}x{ch})")
        replaced += 1

    print(f"  {replaced} icons replaced")
    return True


def main():
    parser = argparse.ArgumentParser(description="Slice regen item icon grids")
    parser.add_argument("--batch", type=int, default=None)
    parser.add_argument("--size", type=int, default=128)
    args = parser.parse_args()

    if args.batch is not None:
        print(f"=== Regen Batch {args.batch} ===")
        process_batch(args.batch, args.size)
    else:
        grid_files = sorted(STAGING_DIR.glob("regen-batch-*.png"))
        if not grid_files:
            print("No regen grid files found in", STAGING_DIR)
            return
        for gf in grid_files:
            idx = int(gf.stem.replace("regen-batch-", ""))
            print(f"=== Regen Batch {idx} ===")
            process_batch(idx, args.size)

    print(f"\nDone! Replaced icons in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
