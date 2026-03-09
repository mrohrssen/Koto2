#!/usr/bin/env python3
"""
Slice 3×3 item icon grids into individual 128×128 PNGs.

Auto-detects background color and actual grid gaps (not even thirds),
finds content within each cell, and centers it on a 128×128 canvas.

Usage:
    python3 scripts/slice-item-grid.py                  # Process all grids
    python3 scripts/slice-item-grid.py --batch 0        # Process specific batch
    python3 scripts/slice-item-grid.py --size 128       # Custom icon size (default 128)
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
MIN_GAP_WIDTH = 5  # Minimum pixels of empty space to count as a gap


def detect_bg_color(img: Image.Image) -> np.ndarray:
    """Detect background color by sampling corner regions."""
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    patches = [arr[:10, :10], arr[:10, w-10:], arr[h-10:, :10], arr[h-10:, w-10:]]
    all_pixels = np.concatenate([p.reshape(-1, 3) for p in patches])
    return all_pixels.mean(axis=0)


def content_mask(img: Image.Image, bg: np.ndarray) -> np.ndarray:
    """Return boolean mask of non-background pixels."""
    arr = np.array(img.convert("RGB")).astype(float)
    dist = np.sqrt(np.sum((arr - bg) ** 2, axis=2))
    return dist > BG_TOLERANCE


def find_gap_splits(profile: np.ndarray, n_splits: int) -> list[int]:
    """Find n_splits gap positions in a 1D content profile.

    Scans for low-content valleys between content peaks and returns
    the midpoint of each gap.
    """
    length = len(profile)
    # Smooth the profile to reduce noise
    kernel = np.ones(5) / 5
    smoothed = np.convolve(profile, kernel, mode='same')

    # Threshold: anything below 5% of max is "empty"
    threshold = max(smoothed.max() * 0.05, 1)
    is_empty = smoothed < threshold

    # Find contiguous empty regions (gaps)
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
            # Skip edge margins (first/last 10% of image)
            mid = (gap_start + gap_end) // 2
            if 0.1 * length < mid < 0.9 * length and (gap_end - gap_start) >= MIN_GAP_WIDTH:
                gaps.append((gap_start, gap_end, mid))

    # Sort by gap width (widest first) and pick the n_splits widest
    gaps.sort(key=lambda g: g[1] - g[0], reverse=True)
    splits = sorted([g[2] for g in gaps[:n_splits]])

    # Fallback to even division if we didn't find enough gaps
    if len(splits) < n_splits:
        step = length // (n_splits + 1)
        splits = [step * (i + 1) for i in range(n_splits)]

    return splits


def process_batch(batch_idx: int, icon_size: int, prefix: str = ""):
    grid_path = STAGING_DIR / f"grid-{prefix}batch-{batch_idx}.png"
    manifest_path = STAGING_DIR / f"grid-{prefix}batch-{batch_idx}-manifest.json"

    if not grid_path.exists():
        print(f"  ✗ Grid not found: {grid_path}")
        return False
    if not manifest_path.exists():
        print(f"  ✗ Manifest not found: {manifest_path}")
        return False

    with open(manifest_path) as f:
        manifest = json.load(f)

    img = Image.open(grid_path)
    w, h = img.size
    bg = detect_bg_color(img)
    mask = content_mask(img, bg)

    # Content profiles — total content pixels per row/column
    row_profile = np.sum(mask, axis=1)
    col_profile = np.sum(mask, axis=0)

    # Find the 2 column gaps and 2 row gaps
    col_splits = find_gap_splits(col_profile, 2)
    row_splits = find_gap_splits(row_profile, 2)

    # Build cell boundaries: [0, split1, split2, w/h]
    col_bounds = [0] + col_splits + [w]
    row_bounds = [0] + row_splits + [h]

    bg_tuple = tuple(int(x) for x in bg)
    print(f"  Grid: {w}×{h}, bg: RGB{bg_tuple}")
    print(f"  Col splits: {col_splits} → regions {list(zip(col_bounds, col_bounds[1:]))}")
    print(f"  Row splits: {row_splits} → regions {list(zip(row_bounds, row_bounds[1:]))}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for entry in manifest:
        if entry.get("filler"):
            print(f"    — {entry['id']} (filler, skipped)")
            continue

        idx = entry["index"]
        item_id = entry["id"]
        r = idx // 3
        c = idx % 3

        # Crop the detected cell region
        x1 = col_bounds[c]
        y1 = row_bounds[r]
        x2 = col_bounds[c + 1]
        y2 = row_bounds[r + 1]
        cell = img.crop((x1, y1, x2, y2))

        # Find content bbox within cell
        cell_mask = content_mask(cell, bg)
        if not cell_mask.any():
            print(f"    ✗ {item_id} — no content!")
            continue

        rows_any = np.any(cell_mask, axis=1)
        cols_any = np.any(cell_mask, axis=0)
        by1 = int(np.argmax(rows_any))
        by2 = int(len(rows_any) - np.argmax(rows_any[::-1]))
        bx1 = int(np.argmax(cols_any))
        bx2 = int(len(cols_any) - np.argmax(cols_any[::-1]))

        content_crop = cell.crop((bx1, by1, bx2, by2))
        cw, ch = content_crop.size

        # Scale to fit with padding (88% fill)
        max_dim = icon_size * 0.88
        scale = min(max_dim / cw, max_dim / ch)
        new_w = max(1, int(cw * scale))
        new_h = max(1, int(ch * scale))
        content_crop = content_crop.resize((new_w, new_h), Image.LANCZOS)

        # Center on background canvas
        canvas = Image.new("RGB", (icon_size, icon_size), bg_tuple)
        paste_x = (icon_size - new_w) // 2
        paste_y = (icon_size - new_h) // 2
        canvas.paste(content_crop, (paste_x, paste_y))

        out_path = OUTPUT_DIR / f"{item_id}.png"
        canvas.save(out_path, "PNG")
        print(f"    ✓ {item_id} — cell ({x1},{y1})→({x2},{y2}), content {cw}×{ch}")

    return True


def main():
    parser = argparse.ArgumentParser(description="Slice item icon grids")
    parser.add_argument("--batch", type=int, default=None)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--prefix", type=str, default="",
                        help="Grid filename prefix, e.g. 'keepsake-' for grid-keepsake-batch-*.png")
    args = parser.parse_args()

    if args.batch is not None:
        print(f"=== Batch {args.batch} ===")
        process_batch(args.batch, args.size, args.prefix)
    else:
        pattern = f"grid-{args.prefix}batch-*.png"
        grid_files = sorted(STAGING_DIR.glob(pattern))
        if not grid_files:
            print(f"No grid files matching '{pattern}' in {STAGING_DIR}")
            return
        for gf in grid_files:
            idx = int(gf.stem.split("-")[-1])
            print(f"=== Batch {idx} ===")
            process_batch(idx, args.size, args.prefix)

    print(f"\nDone! Sliced icons in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
