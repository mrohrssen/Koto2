#!/usr/bin/env python3
"""
Gate 1 — Technical Validation for sprite candidates.

Reads PNG files from an input directory, runs technical quality checks
per sprite type, and outputs a report. Each check returns pass/fail with detail.

Usage:
    python3 scripts/sprite-gate1.py --input <dir> --type <action|creature|item|boss|npc|background> [--json] [--move-rejected]
"""

import argparse
import json
import math
import os
import shutil
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPECTED_DIMENSIONS = {
    "action":     (128, 128),
    "item":       (128, 128),
    "creature":   (1024, 1024),
    "boss":       (1024, 1024),
    "npc":        (1024, 1024),
    "background": (1536, 1024),
}

# Complexity thresholds keyed by (width, height)
COMPLEXITY_THRESHOLDS = {
    (128, 128):    (8, 200),
    (1024, 1024):  (30, 2000),
    (1536, 1024):  (50, 5000),
}

# Types that require centered content
CENTERED_TYPES = {"creature", "boss", "npc"}

# Types that require connected silhouette
SILHOUETTE_TYPES = {"item"}

# Types with looser complexity thresholds
LOOSE_COMPLEXITY_TYPES = {"action"}

# Background-white tolerance: color distance from (255, 255, 255)
BG_TOLERANCE = 30

# Content presence minimum fraction
CONTENT_MIN_FRACTION = 0.05

# Border margin for overflow check (pixels)
BORDER_MARGIN = 2

# Center offset tolerance (fraction of width)
CENTER_OFFSET_TOLERANCE = 0.15

# Connected silhouette coverage minimum
SILHOUETTE_COVERAGE_MIN = 0.70


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_rgb_array(img):
    """Convert PIL image to RGB numpy array (H, W, 3)."""
    return np.array(img.convert("RGB"), dtype=np.float32)


def get_content_mask(rgb_arr):
    """
    Return boolean mask where True = content pixel (not background).
    Background = color distance from white <= BG_TOLERANCE.
    """
    white = np.array([255.0, 255.0, 255.0])
    diff = rgb_arr - white
    dist = np.sqrt(np.sum(diff ** 2, axis=2))
    return dist > BG_TOLERANCE


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_dimensions(img, sprite_type):
    """Verify image dimensions match expected size for the sprite type."""
    expected = EXPECTED_DIMENSIONS[sprite_type]
    actual = (img.width, img.height)
    passed = actual == expected
    detail = f"Expected {expected[0]}x{expected[1]}, got {actual[0]}x{actual[1]}"
    return {"name": "dimensions", "passed": passed, "detail": detail}


def check_background_purity(rgb_arr, sprite_type):
    """Sample corners and edges to verify white background."""
    h, w = rgb_arr.shape[:2]

    # Sample points: corners + edge midpoints + quarter points
    sample_points = [
        # Corners (1px inset)
        (1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2),
        # Edge midpoints
        (w // 2, 1), (w // 2, h - 2),
        (1, h // 2), (w - 2, h // 2),
        # Quarter points along edges
        (w // 4, 1), (3 * w // 4, 1),
        (w // 4, h - 2), (3 * w // 4, h - 2),
        (1, h // 4), (1, 3 * h // 4),
        (w - 2, h // 4), (w - 2, 3 * h // 4),
    ]

    white = np.array([255.0, 255.0, 255.0])
    bad_points = []
    for x, y in sample_points:
        px = rgb_arr[y, x]
        dist = np.sqrt(np.sum((px - white) ** 2))
        if dist > BG_TOLERANCE:
            bad_points.append((x, y, tuple(int(c) for c in px)))

    if not bad_points:
        return {"name": "background_purity", "passed": True,
                "detail": "All sample points are white"}
    else:
        detail = (f"{len(bad_points)} of {len(sample_points)} sample points "
                  f"are not white (first: {bad_points[0]})")
        return {"name": "background_purity", "passed": False, "detail": detail}


def check_content_presence(content_mask, sprite_type):
    """Reject if less than 5% of canvas is content (non-background)."""
    total = content_mask.size
    content_count = int(np.sum(content_mask))
    fraction = content_count / total
    passed = fraction >= CONTENT_MIN_FRACTION
    detail = f"Content covers {fraction:.1%} of canvas (minimum {CONTENT_MIN_FRACTION:.0%})"
    return {"name": "content_presence", "passed": passed, "detail": detail}


def check_content_overflow(content_mask, sprite_type):
    """No content pixels within 2px of the border."""
    h, w = content_mask.shape
    m = BORDER_MARGIN

    overflow_count = 0
    # Top border
    overflow_count += int(np.sum(content_mask[:m, :]))
    # Bottom border
    overflow_count += int(np.sum(content_mask[h - m:, :]))
    # Left border (excluding top/bottom already counted)
    overflow_count += int(np.sum(content_mask[m:h - m, :m]))
    # Right border (excluding top/bottom already counted)
    overflow_count += int(np.sum(content_mask[m:h - m, w - m:]))

    passed = overflow_count == 0
    detail = ("No content pixels in border zone" if passed
              else f"{overflow_count} content pixels within {m}px of border")
    return {"name": "content_overflow", "passed": passed, "detail": detail}


def check_fake_transparency(img, sprite_type):
    """
    Reject semi-transparent pixels.
    - For RGBA images: reject any pixel with alpha 1-254
    - For RGB images: reject pixels with color distance from white between 30-60
    """
    if img.mode == "RGBA":
        arr = np.array(img)
        alpha = arr[:, :, 3]
        semi_mask = (alpha >= 1) & (alpha <= 254)
        semi_count = int(np.sum(semi_mask))
        passed = semi_count == 0
        detail = ("No semi-transparent pixels found" if passed
                  else f"{semi_count} pixels with alpha between 1-254")
        return {"name": "fake_transparency", "passed": passed, "detail": detail}
    else:
        rgb_arr = np.array(img.convert("RGB"), dtype=np.float32)
        white = np.array([255.0, 255.0, 255.0])
        diff = rgb_arr - white
        dist = np.sqrt(np.sum(diff ** 2, axis=2))
        suspect_mask = (dist > 30) & (dist < 60)
        suspect_count = int(np.sum(suspect_mask))
        passed = suspect_count == 0
        detail = ("No fake transparency detected" if passed
                  else f"{suspect_count} pixels with color distance 30-60 from white")
        return {"name": "fake_transparency", "passed": passed, "detail": detail}


def check_visual_complexity(rgb_arr, content_mask, sprite_type):
    """
    Count unique color clusters (quantized to groups of 16).
    Reject if too simple or too noisy.
    """
    # Get content pixels only
    content_pixels = rgb_arr[content_mask].astype(np.int32)

    if len(content_pixels) == 0:
        return {"name": "visual_complexity", "passed": False,
                "detail": "0 color clusters (no content pixels)"}

    # Quantize: integer divide by 16
    quantized = content_pixels // 16
    # Combine into unique keys
    keys = quantized[:, 0] * 10000 + quantized[:, 1] * 100 + quantized[:, 2]
    cluster_count = len(np.unique(keys))

    # Get thresholds for this size
    dims = EXPECTED_DIMENSIONS[sprite_type]
    min_clusters, max_clusters = COMPLEXITY_THRESHOLDS.get(dims, (8, 200))

    # Action type gets looser thresholds
    if sprite_type in LOOSE_COMPLEXITY_TYPES:
        min_clusters = max(1, min_clusters // 2)
        max_clusters = max_clusters * 2

    passed = min_clusters <= cluster_count <= max_clusters
    detail = (f"{cluster_count} color clusters "
              f"(range: {min_clusters}-{max_clusters})")
    return {"name": "visual_complexity", "passed": passed, "detail": detail}


def check_centering(content_mask, sprite_type):
    """Content should be roughly centered (center offset < 15% of width)."""
    h, w = content_mask.shape

    if not np.any(content_mask):
        return {"name": "centering", "passed": False,
                "detail": "No content found to check centering"}

    # Find bounding box of content via column/row projections
    col_has_content = np.any(content_mask, axis=0)
    row_has_content = np.any(content_mask, axis=1)

    cols = np.where(col_has_content)[0]
    min_x, max_x = cols[0], cols[-1]

    content_cx = (min_x + max_x) / 2.0
    image_cx = w / 2.0
    offset_frac = abs(content_cx - image_cx) / w

    passed = offset_frac <= CENTER_OFFSET_TOLERANCE
    detail = (f"Content center offset: {offset_frac:.1%} of width "
              f"(max {CENTER_OFFSET_TOLERANCE:.0%})")
    return {"name": "centering", "passed": passed, "detail": detail}


def check_connected_silhouette(content_mask, sprite_type):
    """
    Main flood-fill region should cover >= 70% of all content pixels.
    This ensures items have a single connected shape.
    """
    h, w = content_mask.shape
    content_count = int(np.sum(content_mask))

    if content_count == 0:
        return {"name": "connected_silhouette", "passed": False,
                "detail": "No content found"}

    # Label connected components using BFS
    visited = np.zeros((h, w), dtype=bool)
    largest_region = 0

    for sy in range(h):
        for sx in range(w):
            if content_mask[sy, sx] and not visited[sy, sx]:
                # BFS flood fill
                queue = deque([(sx, sy)])
                visited[sy, sx] = True
                region_size = 0
                while queue:
                    cx, cy = queue.popleft()
                    region_size += 1
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nx, ny = cx + dx, cy + dy
                        if (0 <= nx < w and 0 <= ny < h
                                and content_mask[ny, nx]
                                and not visited[ny, nx]):
                            visited[ny, nx] = True
                            queue.append((nx, ny))
                largest_region = max(largest_region, region_size)

    coverage = largest_region / content_count
    passed = coverage >= SILHOUETTE_COVERAGE_MIN
    detail = (f"Largest connected region covers {coverage:.0%} of content "
              f"(minimum {SILHOUETTE_COVERAGE_MIN:.0%})")
    return {"name": "connected_silhouette", "passed": passed, "detail": detail}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def validate_sprite(filepath, sprite_type):
    """Run all applicable checks on a single sprite file."""
    img = Image.open(filepath)
    filename = os.path.basename(filepath)

    # Precompute shared data
    rgb_arr = get_rgb_array(img)
    content_mask = get_content_mask(rgb_arr)

    checks = []

    # Universal checks
    checks.append(check_dimensions(img, sprite_type))
    checks.append(check_background_purity(rgb_arr, sprite_type))
    checks.append(check_content_presence(content_mask, sprite_type))
    checks.append(check_content_overflow(content_mask, sprite_type))
    checks.append(check_fake_transparency(img, sprite_type))
    checks.append(check_visual_complexity(rgb_arr, content_mask, sprite_type))

    # Type-specific checks
    if sprite_type in CENTERED_TYPES:
        checks.append(check_centering(content_mask, sprite_type))
    if sprite_type in SILHOUETTE_TYPES:
        checks.append(check_connected_silhouette(content_mask, sprite_type))

    passed = all(c["passed"] for c in checks)
    return {"file": filename, "passed": passed, "checks": checks}


def scan_directory(input_dir, sprite_type):
    """Scan input directory for PNG files and validate each."""
    input_path = Path(input_dir)
    if not input_path.is_dir():
        print(f"Error: {input_dir} is not a directory", file=sys.stderr)
        sys.exit(2)

    png_files = sorted(input_path.glob("*.png"))
    if not png_files:
        print(f"Warning: No PNG files found in {input_dir}", file=sys.stderr)
        return []

    results = []
    for png_file in png_files:
        result = validate_sprite(str(png_file), sprite_type)
        results.append(result)
    return results


def _json_default(obj):
    """Handle numpy types for JSON serialization."""
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def print_human_report(results):
    """Print human-readable report with pass/fail marks."""
    for r in results:
        status = "\u2713" if r["passed"] else "\u2717"
        print(f"\n{status} {r['file']}")
        for c in r["checks"]:
            mark = "\u2713" if c["passed"] else "\u2717"
            print(f"  {mark} {c['name']}: {c['detail']}")


def move_rejected(results, input_dir):
    """Move failed files to rejected/ subdirectory with report files."""
    rejected_dir = Path(input_dir) / "rejected"
    for r in results:
        if not r["passed"]:
            rejected_dir.mkdir(exist_ok=True)
            src = Path(input_dir) / r["file"]
            dst = rejected_dir / r["file"]
            shutil.move(str(src), str(dst))

            report_path = rejected_dir / f"{r['file']}.report.json"
            with open(report_path, "w") as f:
                json.dump(r, f, indent=2, default=_json_default)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Gate 1: Technical validation for sprite candidates")
    parser.add_argument("--input", required=True,
                        help="Directory containing PNG files to validate")
    parser.add_argument("--type", required=True,
                        choices=list(EXPECTED_DIMENSIONS.keys()),
                        help="Sprite type")
    parser.add_argument("--json", action="store_true",
                        help="Output JSON report to stdout")
    parser.add_argument("--move-rejected", action="store_true",
                        help="Move failed files to rejected/ subdirectory")
    args = parser.parse_args()

    results = scan_directory(args.input, args.type)

    if args.json:
        print(json.dumps(results, indent=2, default=_json_default))
    else:
        print_human_report(results)

    if args.move_rejected:
        move_rejected(results, args.input)

    # Exit code 1 if any file fails
    any_failed = any(not r["passed"] for r in results)
    sys.exit(1 if any_failed else 0)


if __name__ == "__main__":
    main()
