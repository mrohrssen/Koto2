# Sprite Quality Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a three-gate quality pipeline that auto-rejects bad sprites and presents survivors for human selection in the dev dashboard.

**Architecture:** Generate 2-3 candidates per sprite on white backgrounds → Gate 1 (Python/Pillow technical validation) → Gate 2 (multimodal AI vision judge) → "Needs Review" dashboard tab for human pick. A rigid Claude Code skill enforces the workflow.

**Tech Stack:** Python 3 + Pillow (Gate 1), Node.js + Gemini API (Gate 2), Express + vanilla JS (dashboard), Node.js native test runner (tests)

**Design doc:** `docs/plans/2026-03-01-sprite-quality-pipeline-design.md`

---

## Task 1: Directory Structure & Data Files

**Files:**
- Create: `data/quality-refs/.gitkeep`
- Create: `data/quality-refs/actions/.gitkeep`
- Create: `data/quality-refs/creatures/.gitkeep`
- Create: `data/quality-refs/items/.gitkeep`
- Create: `data/quality-refs/bosses/.gitkeep`
- Create: `data/quality-refs/npcs/.gitkeep`
- Create: `data/quality-refs/backgrounds/.gitkeep`
- Create: `data/sprite-staging/.gitkeep`
- Modify: `.gitignore`

**Step 1: Create directory structure**

```bash
mkdir -p data/quality-refs/{actions,creatures,items,bosses,npcs,backgrounds}
mkdir -p data/sprite-staging/{actions,creatures,items,bosses,npcs,backgrounds}
touch data/quality-refs/{actions,creatures,items,bosses,npcs,backgrounds}/.gitkeep
touch data/sprite-staging/.gitkeep
```

**Step 2: Update .gitignore**

Add these lines to `/root/Koto/.gitignore`:

```
# Sprite quality pipeline
data/sprite-staging/**/*.png
data/sprite-staging/**/*.webp
data/sprite-staging/**/rejected/
data/sprite-review-queue.json
!data/quality-refs/
!data/quality-refs/**/.gitkeep
```

**Step 3: Commit**

```bash
git add data/quality-refs/ data/sprite-staging/.gitkeep .gitignore
git commit -m "chore: scaffold sprite quality pipeline directories"
```

---

## Task 2: Gate 1 — Technical Validation (Core Logic)

**Files:**
- Create: `scripts/sprite-gate1.py`
- Test: `tests/unit/sprites/gate1.test.js` (we'll generate test images with Sharp in JS tests)

**Step 1: Write failing tests for Gate 1 checks**

Create `tests/unit/sprites/gate1.test.js`. These tests generate synthetic test images using Sharp (already a dev dependency), run the Gate 1 Python script against them, and verify the JSON output.

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const exec = promisify(execFile);
const GATE1 = join(import.meta.dirname, '../../../scripts/sprite-gate1.py');

async function runGate1(inputDir, type = 'action') {
  const { stdout } = await exec('python3', [GATE1, '--input', inputDir, '--type', type, '--json']);
  return JSON.parse(stdout);
}

// Helper: create a solid-color PNG
async function createTestImage(path, { width = 128, height = 128, bg = '#ffffff', contentPercent = 30 } = {}) {
  // White background with a centered colored square
  const contentSize = Math.floor(Math.min(width, height) * Math.sqrt(contentPercent / 100));
  const left = Math.floor((width - contentSize) / 2);
  const top = Math.floor((height - contentSize) / 2);

  const img = sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
  });

  // Composite a red square as "content"
  const contentBuf = await sharp({
    create: { width: contentSize, height: contentSize, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 255 } }
  }).png().toBuffer();

  await img.composite([{ input: contentBuf, left, top }]).png().toFile(path);
}

describe('Gate 1: Technical Validation', () => {
  let tmpDir;

  before(async () => {
    tmpDir = join(import.meta.dirname, '../../tmp-gate1-test-' + Date.now());
    await mkdir(tmpDir, { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('passes a valid 128x128 action icon on white background', async () => {
    const imgPath = join(tmpDir, 'valid.png');
    await createTestImage(imgPath);
    const result = await runGate1(tmpDir, 'action');
    const report = result.find(r => r.file === 'valid.png');
    assert.ok(report, 'should have report for valid.png');
    assert.strictEqual(report.passed, true);
  });

  it('rejects an image with wrong dimensions', async () => {
    const imgPath = join(tmpDir, 'wrongsize.png');
    await createTestImage(imgPath, { width: 256, height: 256 });
    const result = await runGate1(tmpDir, 'action');
    const report = result.find(r => r.file === 'wrongsize.png');
    assert.strictEqual(report.passed, false);
    const dimCheck = report.checks.find(c => c.name === 'dimensions');
    assert.strictEqual(dimCheck.passed, false);
  });

  it('rejects an image with almost no content', async () => {
    const imgPath = join(tmpDir, 'empty.png');
    await createTestImage(imgPath, { contentPercent: 1 });
    const result = await runGate1(tmpDir, 'action');
    const report = result.find(r => r.file === 'empty.png');
    assert.strictEqual(report.passed, false);
    const contentCheck = report.checks.find(c => c.name === 'content_presence');
    assert.strictEqual(contentCheck.passed, false);
  });

  it('rejects an image with semi-transparent pixels', async () => {
    const imgPath = join(tmpDir, 'semitrans.png');
    // Create image with semi-transparent content
    const width = 128, height = 128;
    const raw = Buffer.alloc(width * height * 4, 255); // all white opaque
    // Add a semi-transparent pixel in the center
    const cx = 64 * 4 + 64 * width * 4;
    raw[cx] = 200; raw[cx + 1] = 50; raw[cx + 2] = 50; raw[cx + 3] = 128; // alpha=128
    await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(imgPath);
    const result = await runGate1(tmpDir, 'action');
    const report = result.find(r => r.file === 'semitrans.png');
    assert.strictEqual(report.passed, false);
    const transCheck = report.checks.find(c => c.name === 'fake_transparency');
    assert.strictEqual(transCheck.passed, false);
  });

  it('accepts a valid 1024x1024 creature', async () => {
    const subDir = join(tmpDir, 'creatures');
    await mkdir(subDir, { recursive: true });
    const imgPath = join(subDir, 'creature.png');
    await createTestImage(imgPath, { width: 1024, height: 1024 });
    const result = await runGate1(subDir, 'creature');
    const report = result.find(r => r.file === 'creature.png');
    assert.strictEqual(report.passed, true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/unit/sprites/gate1.test.js
```

Expected: FAIL — `sprite-gate1.py` does not exist yet.

**Step 3: Implement Gate 1 Python script**

Create `scripts/sprite-gate1.py`:

```python
#!/usr/bin/env python3
"""Gate 1: Technical validation for sprite candidates.

Usage:
  python3 scripts/sprite-gate1.py --input <dir> --type <action|creature|item|boss|npc|background> [--json]

Reads all PNG files from <dir>, runs technical checks, outputs JSON report.
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow required. Install with: pip3 install Pillow", file=sys.stderr)
    sys.exit(1)

# Expected dimensions per sprite type
EXPECTED_DIMS = {
    'action': (128, 128),
    'item': (128, 128),
    'creature': (1024, 1024),
    'boss': (1024, 1024),
    'npc': (1024, 1024),
    'background': (1536, 1024),
}

# Complexity thresholds per size tier
COMPLEXITY = {
    'small': {'min': 8, 'max': 200},       # 128x128
    'large': {'min': 30, 'max': 2000},      # 1024x1024
    'xlarge': {'min': 50, 'max': 5000},     # 1536x1024
}

BG_TOLERANCE = 30  # Max color distance from white to count as background
BORDER_MARGIN = 2  # Pixels from edge that must be empty
MIN_CONTENT_RATIO = 0.05  # At least 5% of canvas must be content


def color_distance(c1, c2):
    """Euclidean distance between two RGB tuples."""
    return sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])) ** 0.5


def is_background_pixel(pixel, tolerance=BG_TOLERANCE):
    """Check if a pixel is close to white."""
    return color_distance(pixel[:3], (255, 255, 255)) <= tolerance


def get_size_tier(sprite_type):
    w, h = EXPECTED_DIMS.get(sprite_type, (128, 128))
    if w <= 256:
        return 'small'
    elif w <= 1100:
        return 'large'
    return 'xlarge'


def check_dimensions(img, sprite_type):
    expected = EXPECTED_DIMS.get(sprite_type)
    if not expected:
        return {'name': 'dimensions', 'passed': True, 'detail': f'No dimension rule for {sprite_type}'}
    passed = img.size == expected
    return {
        'name': 'dimensions',
        'passed': passed,
        'detail': f'Expected {expected[0]}x{expected[1]}, got {img.size[0]}x{img.size[1]}'
    }


def check_background_purity(img):
    """Sample corners and edges to verify white background."""
    pixels = img.load()
    w, h = img.size
    # Sample 4 corners + midpoints of each edge
    sample_points = [
        (0, 0), (w-1, 0), (0, h-1), (w-1, h-1),  # corners
        (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2),  # edge midpoints
    ]
    bad_pixels = []
    for x, y in sample_points:
        px = pixels[x, y]
        if not is_background_pixel(px):
            bad_pixels.append((x, y, px[:3]))

    passed = len(bad_pixels) == 0
    detail = 'All sample points are white' if passed else f'{len(bad_pixels)} non-white sample points: {bad_pixels[:3]}'
    return {'name': 'background_purity', 'passed': passed, 'detail': detail}


def check_content_presence(img):
    """At least MIN_CONTENT_RATIO of pixels must be non-background."""
    pixels = img.load()
    w, h = img.size
    total = w * h
    content_count = 0
    for y in range(h):
        for x in range(w):
            if not is_background_pixel(pixels[x, y]):
                content_count += 1
    ratio = content_count / total
    passed = ratio >= MIN_CONTENT_RATIO
    return {
        'name': 'content_presence',
        'passed': passed,
        'detail': f'{ratio:.1%} content ({content_count}/{total} pixels), min {MIN_CONTENT_RATIO:.0%}'
    }


def check_content_overflow(img):
    """No content pixels within BORDER_MARGIN px of canvas edge."""
    pixels = img.load()
    w, h = img.size
    overflow_count = 0
    for y in range(h):
        for x in range(w):
            if (x < BORDER_MARGIN or x >= w - BORDER_MARGIN or
                y < BORDER_MARGIN or y >= h - BORDER_MARGIN):
                if not is_background_pixel(pixels[x, y]):
                    overflow_count += 1
    passed = overflow_count == 0
    return {
        'name': 'content_overflow',
        'passed': passed,
        'detail': f'{overflow_count} content pixels in border margin' if not passed else 'No overflow'
    }


def check_fake_transparency(img):
    """After conceptual BG removal, reject any pixel with alpha 1-254.

    We check for semi-transparent pixels that pretend to be transparent on white.
    In practice: any pixel that is NOT fully opaque (alpha=255) and NOT fully
    transparent (alpha=0) is a fake transparency pixel.
    For images without alpha channel, check for near-white pixels that aren't
    quite background but aren't clearly content either.
    """
    if img.mode != 'RGBA':
        # No alpha channel — check for near-white non-background pixels
        # These are the "pretending to be transparent" pixels
        pixels = img.load()
        w, h = img.size
        suspect_count = 0
        for y in range(h):
            for x in range(w):
                px = pixels[x, y]
                dist = color_distance(px[:3], (255, 255, 255))
                # Not background (>tolerance) but suspiciously close to white
                if BG_TOLERANCE < dist <= BG_TOLERANCE * 2:
                    suspect_count += 1
        passed = suspect_count == 0
        return {
            'name': 'fake_transparency',
            'passed': passed,
            'detail': f'{suspect_count} near-white pixels detected (fake transparency)' if not passed else 'No fake transparency'
        }

    pixels = img.load()
    w, h = img.size
    bad_count = 0
    for y in range(h):
        for x in range(w):
            alpha = pixels[x, y][3]
            if 1 <= alpha <= 254:
                bad_count += 1
    passed = bad_count == 0
    return {
        'name': 'fake_transparency',
        'passed': passed,
        'detail': f'{bad_count} semi-transparent pixels (alpha 1-254)' if not passed else 'All pixels fully opaque or transparent'
    }


def check_visual_complexity(img, sprite_type):
    """Count unique color clusters. Reject if too few or too many."""
    pixels = img.load()
    w, h = img.size
    # Quantize colors to reduce noise: bucket by groups of 16
    buckets = set()
    for y in range(0, h, 2):  # Sample every other pixel for speed
        for x in range(0, w, 2):
            px = pixels[x, y]
            if not is_background_pixel(px):
                bucket = (px[0] // 16, px[1] // 16, px[2] // 16)
                buckets.add(bucket)

    tier = get_size_tier(sprite_type)
    limits = COMPLEXITY.get(tier, COMPLEXITY['small'])
    count = len(buckets)
    passed = limits['min'] <= count <= limits['max']
    return {
        'name': 'visual_complexity',
        'passed': passed,
        'detail': f'{count} color clusters (range: {limits["min"]}-{limits["max"]} for {tier})'
    }


def check_centering(img):
    """Check that content is roughly centered (for creatures/bosses/NPCs)."""
    pixels = img.load()
    w, h = img.size
    # Find content bounding box
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if not is_background_pixel(pixels[x, y]):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < min_x:  # No content found
        return {'name': 'centering', 'passed': True, 'detail': 'No content to check'}

    content_cx = (min_x + max_x) / 2
    canvas_cx = w / 2
    offset_ratio = abs(content_cx - canvas_cx) / w
    passed = offset_ratio < 0.15  # Content center within 15% of canvas center
    return {
        'name': 'centering',
        'passed': passed,
        'detail': f'Center offset: {offset_ratio:.1%} (max 15%)'
    }


def check_single_silhouette(img):
    """Check that item has one main connected region (flood fill from content pixel)."""
    pixels = img.load()
    w, h = img.size
    # Build content mask
    content = set()
    for y in range(h):
        for x in range(w):
            if not is_background_pixel(pixels[x, y]):
                content.add((x, y))

    if not content:
        return {'name': 'single_silhouette', 'passed': True, 'detail': 'No content'}

    # Flood fill from first content pixel
    start = next(iter(content))
    visited = set()
    stack = [start]
    while stack:
        px = stack.pop()
        if px in visited:
            continue
        visited.add(px)
        x, y = px
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            neighbor = (x + dx, y + dy)
            if neighbor in content and neighbor not in visited:
                stack.append(neighbor)

    # Check what fraction of content is in the main region
    coverage = len(visited) / len(content)
    passed = coverage >= 0.7  # At least 70% of content in one connected region
    return {
        'name': 'single_silhouette',
        'passed': passed,
        'detail': f'Main region covers {coverage:.0%} of content (min 70%)'
    }


def validate_image(filepath, sprite_type):
    """Run all checks on a single image. Returns report dict."""
    img = Image.open(filepath).convert('RGBA')
    checks = []

    # Universal checks
    checks.append(check_dimensions(img, sprite_type))
    checks.append(check_background_purity(img))
    checks.append(check_content_presence(img))
    checks.append(check_content_overflow(img))
    checks.append(check_fake_transparency(img))
    checks.append(check_visual_complexity(img, sprite_type))

    # Type-specific checks
    if sprite_type in ('creature', 'boss', 'npc'):
        checks.append(check_centering(img))
    if sprite_type == 'item':
        checks.append(check_single_silhouette(img))

    passed = all(c['passed'] for c in checks)
    return {
        'file': os.path.basename(filepath),
        'passed': passed,
        'checks': checks,
    }


def main():
    parser = argparse.ArgumentParser(description='Gate 1: Technical sprite validation')
    parser.add_argument('--input', required=True, help='Directory containing candidate PNGs')
    parser.add_argument('--type', required=True, choices=list(EXPECTED_DIMS.keys()),
                        help='Sprite type')
    parser.add_argument('--json', action='store_true', help='Output JSON to stdout')
    parser.add_argument('--move-rejected', action='store_true',
                        help='Move rejected files to rejected/ subdirectory')
    args = parser.parse_args()

    input_dir = Path(args.input)
    if not input_dir.is_dir():
        print(f"ERROR: {input_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    png_files = sorted(input_dir.glob('*.png'))
    if not png_files:
        print(f"No PNG files found in {input_dir}", file=sys.stderr)
        sys.exit(1)

    reports = []
    for f in png_files:
        report = validate_image(str(f), args.type)
        reports.append(report)

    if args.move_rejected:
        rejected_dir = input_dir / 'rejected'
        rejected_dir.mkdir(exist_ok=True)
        for report in reports:
            if not report['passed']:
                src = input_dir / report['file']
                dst = rejected_dir / report['file']
                src.rename(dst)
                # Save rejection report alongside
                report_path = rejected_dir / (report['file'] + '.report.json')
                report_path.write_text(json.dumps(report, indent=2))

    if args.json:
        print(json.dumps(reports, indent=2))
    else:
        for r in reports:
            status = 'PASS' if r['passed'] else 'FAIL'
            print(f"[{status}] {r['file']}")
            for c in r['checks']:
                mark = '  ✓' if c['passed'] else '  ✗'
                print(f"  {mark} {c['name']}: {c['detail']}")
            print()

    # Exit with error if any failed
    if any(not r['passed'] for r in reports):
        sys.exit(1)


if __name__ == '__main__':
    main()
```

**Step 4: Run tests to verify they pass**

```bash
node --test tests/unit/sprites/gate1.test.js
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add scripts/sprite-gate1.py tests/unit/sprites/gate1.test.js
git commit -m "feat: add Gate 1 technical validation for sprite pipeline"
```

---

## Task 3: Gate 2 — AI Vision Judge

**Files:**
- Create: `scripts/sprite-gate2.mjs`
- Test: `tests/unit/sprites/gate2.test.js`

**Step 1: Write failing tests**

Create `tests/unit/sprites/gate2.test.js`. Mock the Gemini API to return canned scoring responses.

```javascript
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// We test the judge module's exported functions, not the CLI
// Mock the AI call to return predictable scores

describe('Gate 2: AI Vision Judge', () => {
  let tmpDir, refsDir, candidatesDir;

  before(async () => {
    tmpDir = join(import.meta.dirname, '../../tmp-gate2-test-' + Date.now());
    refsDir = join(tmpDir, 'refs');
    candidatesDir = join(tmpDir, 'candidates');
    await mkdir(refsDir, { recursive: true });
    await mkdir(candidatesDir, { recursive: true });

    // Create a dummy reference image
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 100, g: 100, b: 200, alpha: 255 } } })
      .png().toFile(join(refsDir, 'ref1.png'));

    // Create candidate images
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 255 } } })
      .png().toFile(join(candidatesDir, 'dash-a.png'));
    await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 50, g: 200, b: 50, alpha: 255 } } })
      .png().toFile(join(candidatesDir, 'dash-b.png'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('parses a well-formed AI scoring response', async () => {
    // Import the parser function (we'll export it for testing)
    const { parseJudgeResponse } = await import('../../../scripts/sprite-gate2-lib.mjs');

    const aiResponse = JSON.stringify({
      concept: 5,
      style: 4,
      readability: 4,
      reasoning: 'Clear running figure, matches style refs, readable at small size'
    });

    const result = parseJudgeResponse(aiResponse);
    assert.strictEqual(result.concept, 5);
    assert.strictEqual(result.style, 4);
    assert.strictEqual(result.readability, 4);
    assert.strictEqual(result.total, 13);
    assert.strictEqual(result.passed, true);
  });

  it('fails a candidate with low concept score', async () => {
    const { parseJudgeResponse } = await import('../../../scripts/sprite-gate2-lib.mjs');

    const aiResponse = JSON.stringify({
      concept: 2,
      style: 4,
      readability: 4,
      reasoning: 'Abstract shapes, cannot guess the meaning'
    });

    const result = parseJudgeResponse(aiResponse);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.total, 10);
  });

  it('fails if any single score is below 3', async () => {
    const { parseJudgeResponse } = await import('../../../scripts/sprite-gate2-lib.mjs');

    const aiResponse = JSON.stringify({
      concept: 5,
      style: 5,
      readability: 2,
      reasoning: 'Great concept but unreadable at target size'
    });

    const result = parseJudgeResponse(aiResponse);
    assert.strictEqual(result.passed, false);
  });

  it('builds correct prompt for action type', async () => {
    const { buildJudgePrompt } = await import('../../../scripts/sprite-gate2-lib.mjs');

    const prompt = buildJudgePrompt({
      type: 'action',
      wordEn: 'Dash',
      word: '走る',
    });

    assert.ok(prompt.includes('language learner'));
    assert.ok(prompt.includes('Dash'));
    assert.ok(prompt.includes('128'));
  });

  it('builds correct prompt for creature type', async () => {
    const { buildJudgePrompt } = await import('../../../scripts/sprite-gate2-lib.mjs');

    const prompt = buildJudgePrompt({
      type: 'creature',
      wordEn: 'Timbark',
      word: 'ティンバーク',
    });

    assert.ok(prompt.includes('distinct, memorable creature'));
    assert.ok(!prompt.includes('guess the meaning'));
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/unit/sprites/gate2.test.js
```

Expected: FAIL — module not found.

**Step 3: Implement Gate 2 library (testable logic)**

Create `scripts/sprite-gate2-lib.mjs`:

```javascript
/**
 * Gate 2: AI Vision Judge — shared library.
 * Exports functions for building prompts, parsing responses, and running evaluation.
 */

const MIN_SCORE = 3;  // Minimum per-criterion score to pass

const SIZE_LABELS = {
  action: '128×128 pixels on a mobile screen',
  item: '128×128 pixels on a mobile screen',
  creature: '1024×1024 full character art',
  boss: '1024×1024 full character art',
  npc: '1024×1024 full character art',
  background: '1536×1024 landscape scene',
};

/**
 * Build the judge prompt for evaluating a sprite candidate.
 */
export function buildJudgePrompt({ type, wordEn, word }) {
  const sizeLabel = SIZE_LABELS[type] || SIZE_LABELS.action;

  const conceptInstructions = type === 'creature'
    ? `CONCEPT CLARITY: Does this look like a distinct, memorable creature? Is the design unique and recognizable? Would a player remember this creature after seeing it once?`
    : type === 'background'
      ? `CONCEPT CLARITY: Does this look like the described environment "${wordEn}"? Is the scene clear and atmospheric?`
      : `CONCEPT CLARITY: You are helping a language learner who does NOT know the word "${wordEn}". They will see only this icon and the word "${word}" in a foreign script they are learning. Can they guess the meaning from the icon alone? A running figure for "dash" = 5. Abstract swirl for "dash" = 1.`;

  return `You are a quality judge for game sprite art. Evaluate this candidate image on three criteria. Score each 1-5.

1. ${conceptInstructions}

2. STYLE CONSISTENCY: Compare this candidate against the reference images provided. Does it look like it belongs in the same game? Same palette, linework quality, and detail level?

3. READABILITY AT TARGET SIZE: This sprite will be displayed at ${sizeLabel}. At that size, can you clearly tell what the image depicts? Is it readable or an unreadable blob?

Respond with ONLY a JSON object, no other text:
{
  "concept": <1-5>,
  "style": <1-5>,
  "readability": <1-5>,
  "reasoning": "<one sentence explaining your scores>"
}`;
}

/**
 * Parse the AI judge's response into a structured result.
 */
export function parseJudgeResponse(responseText) {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = responseText.trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  const data = JSON.parse(jsonStr);
  const concept = Number(data.concept);
  const style = Number(data.style);
  const readability = Number(data.readability);
  const total = concept + style + readability;
  const passed = concept >= MIN_SCORE && style >= MIN_SCORE && readability >= MIN_SCORE;

  return {
    concept,
    style,
    readability,
    total,
    passed,
    reasoning: data.reasoning || '',
  };
}

/**
 * Build critique feedback for regeneration when all candidates fail.
 */
export function buildCritiqueFeedback(bestResult, wordEn) {
  const parts = [];
  if (bestResult.concept < MIN_SCORE) {
    parts.push(`Previous attempt was not recognizable as "${wordEn}". Make the visual concept much more literal and obvious.`);
  }
  if (bestResult.style < MIN_SCORE) {
    parts.push('Previous attempt did not match the art style of the reference images. Match the linework, color palette, and detail level more closely.');
  }
  if (bestResult.readability < MIN_SCORE) {
    parts.push('Previous attempt was unreadable at display size. Simplify the design and use bolder shapes.');
  }
  return parts.join(' ');
}
```

**Step 4: Implement Gate 2 CLI script**

Create `scripts/sprite-gate2.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Gate 2: AI Vision Judge CLI.
 *
 * Usage:
 *   node scripts/sprite-gate2.mjs --input <dir> --type <type> --refs <refs-dir> --manifest <manifest.json>
 *
 * Reads candidate PNGs from <dir>, evaluates each against reference images,
 * outputs scored JSON report.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildJudgePrompt, parseJudgeResponse } from './sprite-gate2-lib.mjs';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadImages(dir) {
  const files = (await readdir(dir)).filter(f => IMAGE_EXTS.has(extname(f).toLowerCase())).sort();
  const images = [];
  for (const f of files) {
    const data = await readFile(join(dir, f));
    const ext = extname(f).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    images.push({ file: f, inlineData: { mimeType, data: data.toString('base64') } });
  }
  return images;
}

async function judgeCandidate(model, candidate, refParts, promptText) {
  const parts = [
    ...refParts.map(r => ({ inlineData: r.inlineData })),
    { inlineData: candidate.inlineData },
    { text: promptText },
  ];

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
  });

  const responseText = result.response.text();
  return parseJudgeResponse(responseText);
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      type: { type: 'string' },
      refs: { type: 'string' },
      manifest: { type: 'string' },
      output: { type: 'string' },
    },
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable required');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Load reference images
  const refs = await loadImages(values.refs);
  if (refs.length === 0) {
    console.error(`ERROR: No reference images found in ${values.refs}`);
    console.error('Curate 4-6 gold-standard sprites in this directory first.');
    process.exit(1);
  }
  console.log(`Loaded ${refs.length} reference images from ${values.refs}`);

  // Load manifest (maps filename to word/wordEn)
  const manifest = JSON.parse(await readFile(values.manifest, 'utf-8'));

  // Load candidates
  const candidates = await loadImages(values.input);
  console.log(`Evaluating ${candidates.length} candidates...`);

  const results = [];
  for (const candidate of candidates) {
    // Find manifest entry for this candidate
    const baseName = candidate.file.replace(/(-[a-z])?\.png$/, '');
    const entry = manifest.find(e => e.id === baseName || e.slug === baseName) || { wordEn: baseName, word: baseName };

    const prompt = buildJudgePrompt({
      type: values.type,
      wordEn: entry.wordEn || entry.nameEn || baseName,
      word: entry.word || entry.name || baseName,
    });

    try {
      const scores = await judgeCandidate(model, candidate, refs, prompt);
      results.push({ file: candidate.file, ...scores });
      const status = scores.passed ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${candidate.file}: ${scores.total}/15 — ${scores.reasoning}`);
    } catch (err) {
      console.error(`  [ERROR] ${candidate.file}: ${err.message}`);
      results.push({ file: candidate.file, passed: false, concept: 0, style: 0, readability: 0, total: 0, reasoning: `Error: ${err.message}` });
    }

    // Rate limiting delay
    await new Promise(r => setTimeout(r, 1000));
  }

  const outputPath = values.output || join(values.input, 'gate2-results.json');
  await writeFile(outputPath, JSON.stringify(results, indent=2));
  console.log(`\nResults written to ${outputPath}`);

  const passed = results.filter(r => r.passed).length;
  console.log(`${passed}/${results.length} candidates passed Gate 2`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 5: Run tests to verify they pass**

```bash
node --test tests/unit/sprites/gate2.test.js
```

Expected: All 5 tests PASS.

**Step 6: Commit**

```bash
git add scripts/sprite-gate2-lib.mjs scripts/sprite-gate2.mjs tests/unit/sprites/gate2.test.js
git commit -m "feat: add Gate 2 AI vision judge for sprite pipeline"
```

---

## Task 4: Review Queue Manager

**Files:**
- Create: `scripts/sprite-queue-review.mjs`
- Test: `tests/unit/sprites/queue.test.js`

**Step 1: Write failing tests**

Create `tests/unit/sprites/queue.test.js`:

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

describe('Review Queue Manager', () => {
  let tmpDir;

  before(async () => {
    tmpDir = join(import.meta.dirname, '../../tmp-queue-test-' + Date.now());
    await mkdir(tmpDir, { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('builds queue entry from gate1 + gate2 results', async () => {
    const { buildQueueEntry } = await import('../../../scripts/sprite-queue-review-lib.mjs');

    const gate1Results = [
      { file: 'dash-a.png', passed: true, checks: [] },
      { file: 'dash-b.png', passed: true, checks: [] },
      { file: 'dash-c.png', passed: false, checks: [{ name: 'fake_transparency', passed: false, detail: '847 bad pixels' }] },
    ];

    const gate2Results = [
      { file: 'dash-a.png', passed: true, concept: 5, style: 4, readability: 4, total: 13, reasoning: 'Good' },
      { file: 'dash-b.png', passed: true, concept: 4, style: 3, readability: 4, total: 11, reasoning: 'OK' },
    ];

    const entry = buildQueueEntry({
      id: 'dash',
      type: 'action',
      word: '走る',
      wordEn: 'Dash',
      gate1Results,
      gate2Results,
    });

    assert.strictEqual(entry.id, 'dash');
    assert.strictEqual(entry.candidates.length, 2);
    assert.strictEqual(entry.rejected.length, 1);
    assert.strictEqual(entry.candidates[0].file, 'dash-a.png'); // highest score first
    assert.strictEqual(entry.rejected[0].reason, 'Gate 1: fake_transparency — 847 bad pixels');
  });

  it('merges new entries into existing queue', async () => {
    const { mergeIntoQueue } = await import('../../../scripts/sprite-queue-review-lib.mjs');

    const existingQueue = {
      pending: [
        { id: 'heal', type: 'action', candidates: [], rejected: [] },
      ],
    };

    const newEntries = [
      { id: 'dash', type: 'action', candidates: [{ file: 'dash-a.png' }], rejected: [] },
      { id: 'heal', type: 'action', candidates: [{ file: 'heal-a.png' }], rejected: [] }, // replaces existing
    ];

    const merged = mergeIntoQueue(existingQueue, newEntries);
    assert.strictEqual(merged.pending.length, 2);
    // heal should be updated, not duplicated
    const healEntry = merged.pending.find(e => e.id === 'heal');
    assert.strictEqual(healEntry.candidates[0].file, 'heal-a.png');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/unit/sprites/queue.test.js
```

**Step 3: Implement queue library**

Create `scripts/sprite-queue-review-lib.mjs`:

```javascript
/**
 * Review queue manager — shared library.
 */

/**
 * Build a queue entry from Gate 1 + Gate 2 results for a single sprite.
 */
export function buildQueueEntry({ id, type, word, wordEn, gate1Results, gate2Results }) {
  const candidates = [];
  const rejected = [];

  for (const g1 of gate1Results) {
    if (!g1.passed) {
      // Find the first failing check for the reason
      const failedCheck = g1.checks.find(c => !c.passed);
      rejected.push({
        file: g1.file,
        gate: 'gate1',
        reason: failedCheck ? `Gate 1: ${failedCheck.name} — ${failedCheck.detail}` : 'Gate 1: unknown failure',
      });
      continue;
    }

    // Check Gate 2 result
    const g2 = gate2Results.find(r => r.file === g1.file);
    if (!g2 || !g2.passed) {
      rejected.push({
        file: g1.file,
        gate: 'gate2',
        reason: g2 ? `Gate 2: ${g2.reasoning} (scores: concept=${g2.concept}, style=${g2.style}, readability=${g2.readability})` : 'Gate 2: not evaluated',
      });
      continue;
    }

    candidates.push({
      file: g1.file,
      gate1: 'pass',
      gate2: { concept: g2.concept, style: g2.style, readability: g2.readability },
      total: g2.total,
      reasoning: g2.reasoning,
    });
  }

  // Sort candidates by total score descending
  candidates.sort((a, b) => b.total - a.total);

  return {
    id,
    type,
    word,
    wordEn,
    candidates,
    rejected,
    generatedAt: new Date().toISOString(),
    attempt: 1,
  };
}

/**
 * Merge new entries into existing queue. Replaces entries with matching id+type.
 */
export function mergeIntoQueue(existingQueue, newEntries) {
  const pending = [...existingQueue.pending];

  for (const entry of newEntries) {
    const idx = pending.findIndex(e => e.id === entry.id && e.type === entry.type);
    if (idx >= 0) {
      pending[idx] = entry;
    } else {
      pending.push(entry);
    }
  }

  return { pending };
}
```

**Step 4: Run tests**

```bash
node --test tests/unit/sprites/queue.test.js
```

Expected: PASS.

**Step 5: Implement CLI script**

Create `scripts/sprite-queue-review.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Populate the sprite review queue from Gate 1 + Gate 2 results.
 *
 * Usage:
 *   node scripts/sprite-queue-review.mjs --type <type> --staging <dir>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildQueueEntry, mergeIntoQueue } from './sprite-queue-review-lib.mjs';

const QUEUE_PATH = join(import.meta.dirname, '../data/sprite-review-queue.json');

async function main() {
  const { values } = parseArgs({
    options: {
      type: { type: 'string' },
      staging: { type: 'string' },
    },
  });

  const stagingDir = values.staging;

  // Load gate results
  const gate1Results = JSON.parse(await readFile(join(stagingDir, 'gate1-results.json'), 'utf-8'));
  const gate2Results = JSON.parse(await readFile(join(stagingDir, 'gate2-results.json'), 'utf-8'));

  // Group results by sprite ID (strip -a, -b, -c suffix)
  const byId = new Map();
  for (const r of [...gate1Results, ...gate2Results]) {
    const id = r.file.replace(/(-[a-z])?\.\w+$/, '');
    if (!byId.has(id)) byId.set(id, { gate1: [], gate2: [] });
    if (r.checks) byId.get(id).gate1.push(r);
    else byId.get(id).gate2.push(r);
  }

  // Build queue entries
  const newEntries = [];
  for (const [id, results] of byId) {
    const entry = buildQueueEntry({
      id,
      type: values.type,
      word: id, // Will be enriched by manifest if available
      wordEn: id,
      gate1Results: results.gate1,
      gate2Results: results.gate2,
    });
    newEntries.push(entry);
  }

  // Load existing queue or create new
  let existingQueue = { pending: [] };
  try {
    existingQueue = JSON.parse(await readFile(QUEUE_PATH, 'utf-8'));
  } catch { /* file doesn't exist yet */ }

  const merged = mergeIntoQueue(existingQueue, newEntries);
  await writeFile(QUEUE_PATH, JSON.stringify(merged, null, 2));

  console.log(`Added ${newEntries.length} sprites to review queue (${merged.pending.length} total pending)`);
  console.log(`Review at: /dev/sprites → Needs Review tab`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 6: Commit**

```bash
git add scripts/sprite-queue-review-lib.mjs scripts/sprite-queue-review.mjs tests/unit/sprites/queue.test.js
git commit -m "feat: add review queue manager for sprite pipeline"
```

---

## Task 5: Dashboard — "Needs Review" Tab (Backend)

**Files:**
- Modify: `src/routes/dev.js`

**Step 1: Add review queue API endpoints to `src/routes/dev.js`**

Add after the existing feedback endpoints (around line 500):

```javascript
// ── Review Queue endpoints ──────────────────────────────────────

const REVIEW_QUEUE_PATH = path.join(__dirname, '../../data/sprite-review-queue.json');

// GET /dev/api/review-queue — load the review queue
router.get('/api/review-queue', requireDevAuth, async (req, res) => {
  try {
    const data = await fs.readFile(REVIEW_QUEUE_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json({ pending: [] });
  }
});

// POST /dev/api/review-queue/pick — accept a candidate as the winner
router.post('/api/review-queue/pick', requireDevAuth, async (req, res) => {
  const { id, type, file } = req.body;
  if (!id || !type || !file) return res.status(400).json({ error: 'id, type, file required' });

  try {
    const queue = JSON.parse(await fs.readFile(REVIEW_QUEUE_PATH, 'utf-8'));
    const idx = queue.pending.findIndex(e => e.id === id && e.type === type);
    if (idx < 0) return res.status(404).json({ error: 'Entry not found in queue' });

    // Copy selected file to production sprite directory
    const typeDir = type === 'action' ? 'actions' : type === 'background' ? 'backgrounds' : `${type}s`;
    const stagingPath = path.join(__dirname, '../../data/sprite-staging', typeDir, file);
    const prodPath = path.join(__dirname, '../../public/assets/sprites', typeDir, id + '.webp');

    // Convert to webp if needed (source is PNG)
    const sharp = (await import('sharp')).default;
    await sharp(stagingPath).webp({ quality: 80 }).toFile(prodPath);

    // Remove from queue
    queue.pending.splice(idx, 1);
    await fs.writeFile(REVIEW_QUEUE_PATH, JSON.stringify(queue, null, 2));

    res.json({ ok: true, deployed: prodPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /dev/api/review-queue/reject — reject all candidates, queue for regen
router.post('/api/review-queue/reject', requireDevAuth, async (req, res) => {
  const { id, type, note } = req.body;
  if (!id || !type) return res.status(400).json({ error: 'id, type required' });

  try {
    const queue = JSON.parse(await fs.readFile(REVIEW_QUEUE_PATH, 'utf-8'));
    const entry = queue.pending.find(e => e.id === id && e.type === type);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    entry.rejectedByUser = true;
    entry.regenNote = note || '';
    entry.attempt = (entry.attempt || 1) + 1;
    // Move all candidates to rejected
    entry.rejected.push(...entry.candidates.map(c => ({
      ...c,
      gate: 'human',
      reason: `Rejected by reviewer: ${note || 'no note'}`,
    })));
    entry.candidates = [];

    await fs.writeFile(REVIEW_QUEUE_PATH, JSON.stringify(queue, null, 2));
    res.json({ ok: true, queuedForRegen: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /dev/api/review-queue/batch-accept — accept top-scored for multiple entries
router.post('/api/review-queue/batch-accept', requireDevAuth, async (req, res) => {
  const { ids } = req.body; // Array of { id, type }
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  const sharp = (await import('sharp')).default;
  const queue = JSON.parse(await fs.readFile(REVIEW_QUEUE_PATH, 'utf-8'));
  const results = [];

  for (const { id, type } of ids) {
    const idx = queue.pending.findIndex(e => e.id === id && e.type === type);
    if (idx < 0) { results.push({ id, type, ok: false, error: 'not found' }); continue; }

    const entry = queue.pending[idx];
    if (entry.candidates.length === 0) { results.push({ id, type, ok: false, error: 'no candidates' }); continue; }

    const best = entry.candidates[0]; // Already sorted by score
    const typeDir = type === 'action' ? 'actions' : type === 'background' ? 'backgrounds' : `${type}s`;
    const stagingPath = path.join(__dirname, '../../data/sprite-staging', typeDir, best.file);
    const prodPath = path.join(__dirname, '../../public/assets/sprites', typeDir, id + '.webp');

    try {
      await sharp(stagingPath).webp({ quality: 80 }).toFile(prodPath);
      queue.pending.splice(idx, 1);
      results.push({ id, type, ok: true });
    } catch (err) {
      results.push({ id, type, ok: false, error: err.message });
    }
  }

  await fs.writeFile(REVIEW_QUEUE_PATH, JSON.stringify(queue, null, 2));
  res.json({ results, remaining: queue.pending.length });
});
```

**Step 2: Verify server starts**

```bash
node --check src/routes/dev.js && echo "OK"
```

**Step 3: Commit**

```bash
git add src/routes/dev.js
git commit -m "feat: add review queue API endpoints for sprite dashboard"
```

---

## Task 6: Dashboard — "Needs Review" Tab (Frontend)

**Files:**
- Modify: `public/dev-sprites.html`

**Step 1: Add the "Needs Review" tab and rendering logic**

This is a significant frontend change. Add to the existing tabs in `dev-sprites.html`:

1. Add a new tab button: `<button class="tab" data-cat="review">Needs Review (<span id="review-count">0</span>)</button>`
2. When the "review" tab is active, fetch `/dev/api/review-queue` instead of `/dev/api/manifest`
3. Render each pending entry as a card group showing all candidates side-by-side with scores
4. Add Pick / Reject buttons per entry
5. Add "Accept all top-scored" batch button

The frontend additions should include:
- Review queue state management (fetch, render, pick, reject)
- Candidate comparison view (side-by-side images with score overlays)
- Reject modal with optional note input
- Batch accept confirmation dialog
- Real-time count badge updates

**Implementation details:** Since `dev-sprites.html` is already 445 lines, add the review tab logic as a new section at the bottom of the `<script>` block. The new tab shares the existing grid layout but with a custom card renderer for comparison views.

Key UI elements per review entry:
- Sprite ID + Japanese word + English word as header
- Candidates shown as 128×128 (or appropriate size) images with score badges
- Rejected candidates shown smaller with strikethrough and reason tooltip
- "Pick" button under each candidate
- "Reject All" button with note input
- Score breakdown: concept/style/readability as colored dots (green ≥4, yellow =3, red <3)

**Step 2: Verify with syntax check**

Open in browser manually or:
```bash
# Syntax check isn't available for HTML, but we can verify the JS parts
node -e "/* quick parse check */"
```

**Step 3: Commit**

```bash
git add public/dev-sprites.html
git commit -m "feat: add Needs Review tab to sprite dashboard"
```

---

## Task 7: Claude Code Skill

**Files:**
- Create: `.claude/skills/sprite-quality-pipeline.md`

**Step 1: Create the skill file**

```markdown
---
name: sprite-quality-pipeline
description: Use when generating or regenerating any sprites (actions, creatures, items, bosses, NPCs, backgrounds). Enforces the three-gate quality pipeline.
---

# Sprite Quality Pipeline

**Type:** Rigid — follow exactly, no shortcuts.

## When to Use

Any time you are generating or regenerating sprites of any type.

## Pre-flight Checks

Before generating, verify:

1. Reference images exist in `data/quality-refs/<type>/` (at least 4 images)
2. If no refs exist, STOP and tell the user: "No reference images found for <type>. Please add 4-6 gold-standard sprites to data/quality-refs/<type>/ before generating."
3. Confirm which sprites to generate and how many candidates (default: 3)

## Workflow

### Step 1: Generate Candidates

- Generate 2-3 candidates per sprite on **white backgrounds** (#FFFFFF)
- Use the type-specific generation script
- Save all candidates to `data/sprite-staging/<type>/`
- Name candidates with suffix: `<id>-a.png`, `<id>-b.png`, `<id>-c.png`

### Step 2: Gate 1 — Technical Validation

```bash
python3 scripts/sprite-gate1.py --input data/sprite-staging/<type> --type <type> --json --move-rejected
```

- Review the output. If all candidates for a sprite fail, regenerate (max 2 rounds).
- After max retries, the sprite goes to the review queue as "generation failed".

### Step 3: Gate 2 — AI Vision Judge

```bash
node scripts/sprite-gate2.mjs \
  --input data/sprite-staging/<type> \
  --type <type> \
  --refs data/quality-refs/<type> \
  --manifest <path-to-manifest>
```

- If all candidates for a sprite fail, regenerate with critique feedback from the judge (max 2 rounds).
- The judge's critique for the highest-scoring reject is fed back into the generation prompt.

### Step 4: Queue for Review

```bash
node scripts/sprite-queue-review.mjs --type <type> --staging data/sprite-staging/<type>
```

Tell the user: **"N icons ready for review at /dev/sprites → Needs Review tab."**

## Rules

- **NEVER auto-deploy to production.** Only the user picks winners from the dashboard.
- **NEVER skip gates.** Every candidate goes through Gate 1 → Gate 2 → Review.
- **NEVER generate without reference images.** The style target must be intentional.
- **NEVER copy files directly to `public/assets/sprites/`.** The dashboard handles deployment.

## Sprite Type Reference

| Type | Size | Gate 1 extras | Gate 2 concept prompt |
|------|------|--------------|----------------------|
| action | 128×128 | Loose complexity | "Can a language learner guess the meaning?" |
| item | 128×128 | Single silhouette check | "Can a language learner guess the meaning?" |
| creature | 1024×1024 | Centering check | "Distinct, memorable creature?" |
| boss | 1024×1024 | Centering check | "Distinct, memorable creature?" |
| npc | 1024×1024 | Centering check | "Distinct, memorable character?" |
| background | 1536×1024 | Scaled thresholds | "Does this look like the described environment?" |
```

**Step 2: Commit**

```bash
git add .claude/skills/sprite-quality-pipeline.md
git commit -m "feat: add sprite-quality-pipeline Claude Code skill"
```

---

## Task 8: Update .gitignore & Final Wiring

**Files:**
- Modify: `.gitignore`
- Verify: all new files are properly tracked/ignored

**Step 1: Verify gitignore covers new files**

```bash
# These should be ignored:
echo "test" > data/sprite-review-queue.json && git status data/sprite-review-queue.json
echo "test" > data/sprite-staging/actions/test.png && git status data/sprite-staging/actions/test.png

# These should be tracked:
git status data/quality-refs/
git status scripts/sprite-gate1.py
git status scripts/sprite-gate2.mjs
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: All existing tests pass + new Gate 1, Gate 2, and Queue tests pass.

**Step 3: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore: finalize sprite quality pipeline wiring"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Directory structure | `.gitignore`, `data/quality-refs/`, `data/sprite-staging/` | — |
| 2 | Gate 1: Technical validation | `scripts/sprite-gate1.py` | `tests/unit/sprites/gate1.test.js` |
| 3 | Gate 2: AI vision judge | `scripts/sprite-gate2.mjs`, `scripts/sprite-gate2-lib.mjs` | `tests/unit/sprites/gate2.test.js` |
| 4 | Review queue manager | `scripts/sprite-queue-review.mjs`, `scripts/sprite-queue-review-lib.mjs` | `tests/unit/sprites/queue.test.js` |
| 5 | Dashboard backend | `src/routes/dev.js` (modify) | — |
| 6 | Dashboard frontend | `public/dev-sprites.html` (modify) | — |
| 7 | Claude Code skill | `.claude/skills/sprite-quality-pipeline.md` | — |
| 8 | Final wiring + test run | `.gitignore`, verification | Full suite |
