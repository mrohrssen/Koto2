#!/usr/bin/env python3
"""Trim deadspace from creature sprites and resize to 3x Retina target.

For each creature:
1. Computes the union bounding box of non-transparent pixels across ALL frames
   (so animated sprites never get clipped mid-motion)
2. Crops every frame to that box
3. Resizes to fit within MAX_SIZE (longest edge), preserving aspect ratio

Sprites display at 110x110 CSS pixels. iPhones are 3x DPR, so 330px is the
pixel-perfect target. Anything larger wastes bandwidth.
"""

import glob
import os
import sys
from PIL import Image
import numpy as np
from collections import defaultdict

SPRITE_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites', 'robots')
MAX_SIZE = 330  # 110 CSS px × 3x DPR


def get_union_bbox(img):
    """Get the union bounding box of non-transparent content across all frames."""
    rmin, cmin = img.size[1], img.size[0]  # start at max
    rmax, cmax = 0, 0

    for i in range(img.n_frames):
        img.seek(i)
        frame = img.convert('RGBA')
        arr = np.array(frame)
        alpha = arr[:, :, 3]
        rows = np.any(alpha > 0, axis=1)
        cols = np.any(alpha > 0, axis=0)
        if not np.any(rows):
            continue
        r0, r1 = np.where(rows)[0][[0, -1]]
        c0, c1 = np.where(cols)[0][[0, -1]]
        rmin = min(rmin, int(r0))
        rmax = max(rmax, int(r1))
        cmin = min(cmin, int(c0))
        cmax = max(cmax, int(c1))

    if rmax == 0 and cmax == 0:
        return None  # fully transparent
    return (cmin, rmin, cmax + 1, rmax + 1)  # PIL crop box (left, upper, right, lower)


def resize_to_fit(img, max_size):
    """Resize image so longest edge = max_size, preserving aspect ratio. Returns None if already <= max_size."""
    w, h = img.size
    if w <= max_size and h <= max_size:
        return None
    scale = max_size / max(w, h)
    new_w = round(w * scale)
    new_h = round(h * scale)
    return img.resize((new_w, new_h), Image.LANCZOS)


def trim_and_resize_static(filepath, bbox):
    """Trim and resize a single-frame webp."""
    img = Image.open(filepath).convert('RGBA')
    old_size = img.size
    cropped = img.crop(bbox)
    resized = resize_to_fit(cropped, MAX_SIZE)
    final = resized if resized else cropped
    final.save(filepath, 'WEBP', quality=90, method=6)
    return old_size, cropped.size, final.size


def trim_and_resize_animated(filepath, bbox):
    """Trim and resize an animated webp, preserving all frames and timing."""
    img = Image.open(filepath)
    old_size = img.size
    n_frames = img.n_frames

    # Extract and crop all frames
    frames = []
    durations = []
    for i in range(n_frames):
        img.seek(i)
        frame = img.convert('RGBA')
        cropped = frame.crop(bbox)
        frames.append(cropped)
        durations.append(img.info.get('duration', 80))

    cropped_size = frames[0].size

    # Resize all frames if needed
    test = resize_to_fit(frames[0], MAX_SIZE)
    if test:
        w, h = test.size
        frames = [f.resize((w, h), Image.LANCZOS) for f in frames]

    final_size = frames[0].size

    # Save animated webp
    frames[0].save(
        filepath,
        'WEBP',
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=90,
        method=6,
    )
    return old_size, cropped_size, final_size


def main():
    files = sorted(glob.glob(os.path.join(SPRITE_DIR, '*.webp')))
    if not files:
        print("No webp files found!")
        return

    # Group by creature name (foo.webp + foo-idle.webp)
    creatures = defaultdict(list)
    for f in files:
        name = os.path.basename(f)
        # Strip -idle suffix to group
        creature_name = name.replace('-idle.webp', '').replace('.webp', '')
        creatures[creature_name].append(f)

    print(f"Found {len(creatures)} creatures, {len(files)} files total")
    print(f"Target: {MAX_SIZE}px longest edge (110 CSS px × 3x Retina)\n")

    for creature_name, paths in sorted(creatures.items()):
        for filepath in sorted(paths):
            basename = os.path.basename(filepath)
            try:
                img = Image.open(filepath)
            except Exception as e:
                print(f"  ERROR {basename}: {e}")
                continue
            n_frames = img.n_frames
            bbox = get_union_bbox(img)

            if bbox is None:
                print(f"  SKIP {basename} (fully transparent)")
                continue

            w, h = img.size
            bw = bbox[2] - bbox[0]
            bh = bbox[3] - bbox[1]

            # Skip if less than 5% total savings (trim + resize combined)
            final_longest = min(max(bw, bh), MAX_SIZE)
            scale = final_longest / max(bw, bh)
            final_w = round(bw * scale)
            final_h = round(bh * scale)
            savings = 1.0 - (final_w * final_h) / (w * h)
            if savings < 0.05:
                print(f"  SKIP {basename} {w}x{h} -> {final_w}x{final_h} (only {savings*100:.0f}% savings)")
                continue

            if n_frames > 1:
                old_size, cropped_size, final_size = trim_and_resize_animated(filepath, bbox)
            else:
                old_size, cropped_size, final_size = trim_and_resize_static(filepath, bbox)

            print(f"  {basename:35s} {old_size[0]}x{old_size[1]} -> {cropped_size[0]}x{cropped_size[1]} -> {final_size[0]}x{final_size[1]}  ({savings*100:.0f}% reduced)")


if __name__ == '__main__':
    main()
