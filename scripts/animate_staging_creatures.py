#!/usr/bin/env python3
"""
Animate staging creature images using Wan 2.2 via ComfyUI API.

Takes Gemini-generated staging PNGs (magenta background) from
data/creature-staging-images/ and produces game-ready assets:
  - {id}-idle.webp  (transparent animated idle loop, 49 frames @ 24fps)
  - {id}.webp       (transparent static fallback)

Both are deployed to public/assets/sprites/robots/.

The staging PNG already has a magenta (#FF00FF) background, which is exactly
what WAN needs. After WAN generates the animation, local chroma-key removes
the magenta from both the animation and the static source.

Requirements:
  - ComfyUI running at COMFYUI_URL (default: http://192.168.1.222:8188)
  - Wan 2.2 models (high-noise + low-noise 14B Q4)
  - Pillow + numpy: pip install Pillow numpy

Usage:
  python scripts/animate_staging_creatures.py                          # All staging creatures
  python scripts/animate_staging_creatures.py --ids kazenoko           # Specific creatures
  python scripts/animate_staging_creatures.py --skip-existing          # Skip already-done
  python scripts/animate_staging_creatures.py --chroma-only            # Re-process chroma key only
  python scripts/animate_staging_creatures.py --seed 42                # Custom base seed
  python scripts/animate_staging_creatures.py --dry-run                # Preview without sending
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Import proven functions from the existing animation script
sys.path.insert(0, SCRIPT_DIR)
from generate_idle_animations import (
    build_workflow,
    upload_image,
    queue_prompt,
    check_job_status,
    check_queue,
    download_output,
    verify_comfyui,
    chroma_key_frame,
    chroma_key_animated_webp,
    build_idle_prompt,
    build_negative_prompt,
    COMFYUI_URL,
    OUTPUT_DIR,
    GAME_SPRITE_DIR,
)

STAGING_JSON = os.path.join(PROJECT_ROOT, "data", "new-creatures-staging.json")
STAGING_IMAGES_DIR = os.path.join(PROJECT_ROOT, "data", "creature-staging-images")


def timestamp():
    """Current time as HH:MM:SS for progress logs."""
    return datetime.now().strftime("%H:%M:%S")


def load_staging_creatures():
    """Load creatures from staging JSON."""
    with open(STAGING_JSON) as f:
        return json.load(f)


def find_staging_image(creature_id):
    """Find the staging PNG for a creature. Returns path or None."""
    path = os.path.join(STAGING_IMAGES_DIR, f"{creature_id}.png")
    if os.path.exists(path):
        return path
    return None


def chroma_key_static(input_png, output_webp):
    """Chroma-key a single static PNG and save as transparent webp."""
    from PIL import Image
    frame = Image.open(input_png).convert("RGBA")
    transparent = chroma_key_frame(frame)
    transparent.save(output_webp, "WEBP", quality=95)
    size_kb = os.path.getsize(output_webp) / 1024
    print(f"  [{timestamp()}] Static sprite: {os.path.relpath(output_webp, PROJECT_ROOT)} ({size_kb:.0f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Animate staging creature images via ComfyUI WAN 2.2"
    )
    parser.add_argument("--ids", help="Comma-separated creature IDs (default: all with staging images)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip creatures with existing idle sprites")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be queued without sending")
    parser.add_argument("--batch-size", type=int, default=1,
                        help="Queue this many jobs then wait (default: 1, safer for staging)")
    parser.add_argument("--seed", type=int, default=None, help="Fixed seed (default: random)")
    parser.add_argument("--poll-interval", type=int, default=30,
                        help="Seconds between status checks (default: 30)")
    parser.add_argument("--chroma-only", action="store_true",
                        help="Skip WAN generation, just re-run chroma key on existing outputs")
    parser.add_argument("--no-static", action="store_true",
                        help="Skip generating static fallback webp")
    args = parser.parse_args()

    # Load staging data
    creatures = load_staging_creatures()

    # Filter to those with staging images
    available = []
    for c in creatures:
        img_path = find_staging_image(c["id"])
        if img_path:
            available.append((c, img_path))

    if args.ids:
        ids = set(args.ids.split(","))
        available = [(c, p) for c, p in available if c["id"] in ids]
        found = {c["id"] for c, _ in available}
        missing = ids - found
        if missing:
            print(f"WARNING: No staging images for: {', '.join(missing)}")
            # Check if they're in staging JSON but missing images
            staged_ids = {c["id"] for c in creatures}
            for m in missing:
                if m in staged_ids:
                    print(f"  {m}: in staging JSON but no image at data/creature-staging-images/{m}.png")
                else:
                    print(f"  {m}: not in data/new-creatures-staging.json either")

    if args.skip_existing:
        before = len(available)
        available = [
            (c, p) for c, p in available
            if not os.path.exists(os.path.join(GAME_SPRITE_DIR, f"{c['id']}-idle.webp"))
        ]
        skipped = before - len(available)
        if skipped:
            print(f"Skipping {skipped} creatures with existing idle sprites.")

    if not available:
        print("No staging creatures to process.")
        print(f"  Staging JSON: {STAGING_JSON}")
        print(f"  Staging images: {STAGING_IMAGES_DIR}/")
        sys.exit(1)

    total = len(available)
    print("=" * 64)
    print(f"[{timestamp()}] STAGING CREATURE ANIMATION — {total} creature(s)")
    print(f"  Source: data/creature-staging-images/*.png (magenta BG)")
    print(f"  Output: public/assets/sprites/robots/{{id}}-idle.webp (animated)")
    print(f"          public/assets/sprites/robots/{{id}}.webp (static fallback)")
    seed_label = str(args.seed) if args.seed is not None else "random"
    print(f"  Batch: {args.batch_size} | Seed: {seed_label}")
    print("=" * 64)

    for c, p in available:
        size_kb = os.path.getsize(p) / 1024
        print(f"  {c['id']} ({c.get('element', '?')}) — {os.path.basename(p)} ({size_kb:.0f} KB)")

    # --- Chroma-only mode ---
    if args.chroma_only:
        print(f"\n[{timestamp()}] CHROMA KEY MODE: Processing existing animations...\n")
        success = 0
        for c, staging_path in available:
            cid = c["id"]
            raw_path = os.path.join(OUTPUT_DIR, cid, "idle.webp")
            if not os.path.exists(raw_path):
                print(f"  {cid}: no raw animation at {os.path.relpath(raw_path, PROJECT_ROOT)}, skipping")
                continue
            game_path = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
            print(f"  [{timestamp()}] {cid}: chroma keying animation...")
            if chroma_key_animated_webp(raw_path, game_path):
                success += 1
            # Also do static
            if not args.no_static:
                static_path = os.path.join(GAME_SPRITE_DIR, f"{cid}.webp")
                chroma_key_static(staging_path, static_path)
        print(f"\n[{timestamp()}] Chroma key complete: {success} animations processed")
        return

    # --- Full pipeline ---
    if not args.dry_run:
        print(f"\n[{timestamp()}] Verifying ComfyUI connection...")
        if not verify_comfyui():
            print("\nStart ComfyUI first on 192.168.1.222")
            sys.exit(1)
        print()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    batches = [available[i:i + args.batch_size] for i in range(0, total, args.batch_size)]
    completed = 0
    failed = []

    for bi, batch in enumerate(batches):
        print(f"\n{'─' * 64}")
        print(f"[{timestamp()}] Batch {bi + 1}/{len(batches)} ({len(batch)} creature(s))")
        print(f"{'─' * 64}")

        # Phase 1: Upload + Queue
        jobs = {}  # prompt_id -> (creature, staging_path)
        for creature, staging_path in batch:
            cid = creature["id"]
            idx = completed + len(jobs) + 1

            positive = build_idle_prompt(creature)
            negative = build_negative_prompt(creature)
            seed = args.seed if args.seed is not None else random.randint(0, 2**31)

            print(f"\n  [{timestamp()}] [{idx}/{total}] {cid} ({creature.get('element', '?')})")
            print(f"    Staging: {os.path.relpath(staging_path, PROJECT_ROOT)}")
            print(f"    Prompt:  {positive[:80]}...")

            if args.dry_run:
                print(f"    [DRY RUN] Would queue idle animation (seed={seed})")
                continue

            # Upload staging PNG directly (already has magenta BG)
            try:
                server_name = upload_image(staging_path)
                print(f"    [{timestamp()}] Uploaded as: {server_name}")
            except Exception as e:
                print(f"    [{timestamp()}] UPLOAD FAILED: {e}")
                failed.append((cid, f"upload: {e}"))
                continue

            # Build + queue workflow
            workflow = build_workflow(server_name, positive, negative, seed)
            workflow["prompt"]["11"]["inputs"]["filename_prefix"] = f"idle_animations/{cid}-idle"

            try:
                prompt_id = queue_prompt(workflow)
                print(f"    [{timestamp()}] Queued: {prompt_id} (seed={seed})")
                jobs[prompt_id] = (creature, staging_path)
            except Exception as e:
                print(f"    [{timestamp()}] QUEUE FAILED: {e}")
                failed.append((cid, f"queue: {e}"))
                continue

        if args.dry_run or not jobs:
            completed += len(batch)
            continue

        # Phase 2: Poll for completion with verbose progress
        print(f"\n  [{timestamp()}] Waiting for {len(jobs)} job(s)...")
        print(f"  Estimated: ~8-10 minutes per creature on RTX 3090")
        pending_jobs = dict(jobs)
        start_time = time.time()
        last_report = start_time

        while pending_jobs:
            time.sleep(args.poll_interval)
            elapsed = time.time() - start_time
            now = time.time()

            done_ids = []
            for pid, (creature, staging_path) in pending_jobs.items():
                cid = creature["id"]
                status, outputs = check_job_status(pid)
                if status == "success":
                    out_path = download_output(pid, cid)
                    if out_path:
                        size_kb = os.path.getsize(out_path) / 1024
                        print(f"\n  [{timestamp()}] DONE: {cid} ({size_kb:.0f} KB raw)")

                        # Chroma key animation
                        game_idle = os.path.join(GAME_SPRITE_DIR, f"{cid}-idle.webp")
                        if chroma_key_animated_webp(out_path, game_idle):
                            idle_kb = os.path.getsize(game_idle) / 1024
                            print(f"  [{timestamp()}] DEPLOYED: {cid}-idle.webp ({idle_kb:.0f} KB, transparent)")
                        else:
                            print(f"  [{timestamp()}] CHROMA KEY FAILED: {cid}")
                            failed.append((cid, "chroma key failed"))

                        # Static fallback
                        if not args.no_static:
                            game_static = os.path.join(GAME_SPRITE_DIR, f"{cid}.webp")
                            chroma_key_static(staging_path, game_static)
                    else:
                        print(f"\n  [{timestamp()}] DONE: {cid} (download failed)")
                        failed.append((cid, "download failed"))
                    done_ids.append(pid)
                elif status == "error":
                    print(f"\n  [{timestamp()}] FAILED: {cid} (ComfyUI error)")
                    failed.append((cid, "comfyui error"))
                    done_ids.append(pid)

            for pid in done_ids:
                del pending_jobs[pid]

            # Verbose progress every ~60 seconds (or every poll if interval >= 60)
            if pending_jobs and (now - last_report >= 60 or args.poll_interval >= 60):
                running, queued = check_queue()
                mins = elapsed / 60
                remaining_names = [c["id"] for _, (c, _) in pending_jobs.items()]
                eta_min = max(0, 8 * len(pending_jobs) - mins)  # ~8 min per creature on RTX 3090
                print(f"  [{timestamp()}] {mins:.1f}m elapsed | "
                      f"{len(pending_jobs)} remaining: {', '.join(remaining_names)} | "
                      f"Queue: {running} running, {queued} pending | "
                      f"ETA: ~{eta_min:.0f}m")
                last_report = now

        completed += len(batch)

    # Summary
    success_count = completed - len(failed)
    print(f"\n{'=' * 64}")
    print(f"[{timestamp()}] COMPLETE: {success_count}/{total} creatures animated")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for cid, reason in failed:
            print(f"  - {cid}: {reason}")
    print(f"\nGame sprites: public/assets/sprites/robots/")
    print(f"  Animated: *-idle.webp  |  Static: *.webp")
    print(f"\nReminder: bump SPRITE_VERSION in public/js/ui/sprite-utils.js")
    print("=" * 64)


if __name__ == "__main__":
    main()
