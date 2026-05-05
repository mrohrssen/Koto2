# Scenario Battlefield Asset Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Scenario MCP driven workflow that generates, assembles, reviews, scores, and exports layered PixiJS battlefield assets for the new `moonlit_ruins` area.

**Architecture:** Scenario MCP owns asset generation and background removal. Local repo scripts own deterministic run directories, prompt manifests, layer compositing, browser review pages, scorecard templates, and approved WebP export. The generation loop is agent-driven because Cursor MCP tools are not directly callable from plain Node scripts.

**Tech Stack:** Scenario MCP, `model_openai-gpt-image-2`, `model_photoroom-background-removal`, Node ES modules, `sharp`, static HTML review pages, WebP battlefield assets.

---

## File Structure

- Create `scripts/battlefield-generation/config.mjs`
  - Central constants for Scenario IDs, model IDs, target dimensions, fallback widths, area IDs, layer names, and scoring thresholds.
- Create `scripts/battlefield-generation/prompt-recipe.mjs`
  - Reusable prompt recipe builder for `battleground`, `background`, and `sky`.
- Create `scripts/battlefield-generation/create-run.mjs`
  - Creates `tmp/battlefield-generation/<area>/run-###/` and writes initial `prompts.json`, `scenario-assets.json`, and `scorecard.json`.
- Create `scripts/battlefield-generation/assemble-run.mjs`
  - Uses `sharp` to composite `sky.png`, `background.png`, and `battleground.png` into `assembled.png`.
- Create `scripts/battlefield-generation/generate-review.mjs`
  - Creates `review.html` showing reference, assembled output, layers, scorecard, critique, and next prompt delta.
- Create `scripts/battlefield-generation/export-approved.mjs`
  - Converts an approved run to WebP files under `public/assets/backgrounds/<area>/`.
- Create `tests/unit/scripts/battlefield-generation-config.test.js`
  - Verifies dimensions, fallback ordering, layer order, and approval thresholds.
- Create `tests/unit/scripts/battlefield-generation-prompts.test.js`
  - Verifies prompt contracts: no reference-image dependency for battleground, bottom `62%` floor wording, no literal `3x2 grid` in default prompts.
- Create `tests/unit/scripts/battlefield-generation-assemble.test.js`
  - Verifies layer order and output dimensions using generated fixture images.
- Modify `.gitignore`
  - Already ignores `tmp/`; no change expected unless implementation discovers a new local output path.
- Final assets, after approval only:
  - `public/assets/backgrounds/moonlit_ruins/sky.webp`
  - `public/assets/backgrounds/moonlit_ruins/background.webp`
  - `public/assets/backgrounds/moonlit_ruins/battleground.webp`

---

### Task 1: Add Generation Constants

**Files:**
- Create: `scripts/battlefield-generation/config.mjs`
- Create: `tests/unit/scripts/battlefield-generation-config.test.js`

- [ ] **Step 1: Write the failing config tests**

Create `tests/unit/scripts/battlefield-generation-config.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  SCENARIO_TEAM_ID,
  SCENARIO_PROJECT_ID,
  SCENARIO_MODELS,
  TARGET_SIZE,
  FALLBACK_WIDTHS,
  LAYER_ORDER,
  SCORE_THRESHOLDS,
} = await import('../../../scripts/battlefield-generation/config.mjs');

describe('battlefield generation config', () => {
  it('uses the Scenario project selected during setup', () => {
    assert.equal(SCENARIO_TEAM_ID, 'team_g8yJ6jYJtWj44Um1NrmzYiLC');
    assert.equal(SCENARIO_PROJECT_ID, 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ');
  });

  it('uses GPT Image 2 and Photoroom background removal', () => {
    assert.equal(SCENARIO_MODELS.generation, 'model_openai-gpt-image-2');
    assert.equal(SCENARIO_MODELS.backgroundRemoval, 'model_photoroom-background-removal');
  });

  it('starts at the maximum useful scrollable size', () => {
    assert.deepEqual(TARGET_SIZE, { width: 3840, height: 1024 });
    assert.deepEqual(FALLBACK_WIDTHS, [3584, 3328, 3072, 2816, 2560, 2304, 2048]);
  });

  it('keeps game render layer order explicit', () => {
    assert.deepEqual(LAYER_ORDER, ['sky', 'background', 'battleground']);
  });

  it('requires score gates before export', () => {
    assert.deepEqual(SCORE_THRESHOLDS, {
      overall: 90,
      composition: 25,
      layerValidity: 18,
      gameplayFit: 12,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/scripts/battlefield-generation-config.test.js
```

Expected: FAIL because `scripts/battlefield-generation/config.mjs` does not exist.

- [ ] **Step 3: Create the config module**

Create `scripts/battlefield-generation/config.mjs`:

```js
export const SCENARIO_TEAM_ID = 'team_g8yJ6jYJtWj44Um1NrmzYiLC';
export const SCENARIO_PROJECT_ID = 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ';

export const SCENARIO_MODELS = {
  generation: 'model_openai-gpt-image-2',
  backgroundRemoval: 'model_photoroom-background-removal',
};

export const TARGET_SIZE = {
  width: 3840,
  height: 1024,
};

export const FALLBACK_WIDTHS = [3584, 3328, 3072, 2816, 2560, 2304, 2048];

export const LAYER_ORDER = ['sky', 'background', 'battleground'];

export const LAYERS = {
  sky: 'sky',
  background: 'background',
  battleground: 'battleground',
};

export const DEFAULT_AREA_ID = 'moonlit_ruins';

export const FLOOR_BAND = {
  topRatio: 0.38,
  heightRatio: 0.62,
  topPx: Math.round(TARGET_SIZE.height * 0.38),
  bottomPx: TARGET_SIZE.height,
};

export const SCORE_THRESHOLDS = {
  overall: 90,
  composition: 25,
  layerValidity: 18,
  gameplayFit: 12,
};

export const SCORE_MAX = {
  composition: 30,
  style: 20,
  layerValidity: 20,
  lightingMood: 15,
  gameplayFit: 15,
};
```

- [ ] **Step 4: Run syntax and tests**

Run:

```bash
node --check scripts/battlefield-generation/config.mjs
npm run test:unit -- tests/unit/scripts/battlefield-generation-config.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/battlefield-generation/config.mjs tests/unit/scripts/battlefield-generation-config.test.js
git commit -m "chore(assets): add battlefield generation config"
```

---

### Task 2: Add Prompt Recipe Builder

**Files:**
- Create: `scripts/battlefield-generation/prompt-recipe.mjs`
- Create: `tests/unit/scripts/battlefield-generation-prompts.test.js`

- [ ] **Step 1: Write the failing prompt tests**

Create `tests/unit/scripts/battlefield-generation-prompts.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildBattlegroundPrompt,
  buildBackgroundPrompt,
  buildSkyPrompt,
  createPromptManifest,
} = await import('../../../scripts/battlefield-generation/prompt-recipe.mjs');

describe('battlefield prompt recipe', () => {
  it('builds a text-only battleground prompt with the bottom 62 percent contract', () => {
    const prompt = buildBattlegroundPrompt({
      areaName: 'moonlit ruins',
      runDelta: 'first attempt',
    });

    assert.match(prompt, /bottom 62%/);
    assert.match(prompt, /3840x1024/);
    assert.match(prompt, /No characters/);
    assert.doesNotMatch(prompt, /3x2 grid/i);
    assert.doesNotMatch(prompt, /use the attached reference/i);
  });

  it('builds background prompts that respect the generated battleground', () => {
    const prompt = buildBackgroundPrompt({
      areaName: 'moonlit ruins',
      runDelta: 'add clearer arches',
    });

    assert.match(prompt, /generated battleground reference/i);
    assert.match(prompt, /upper 38%/);
    assert.match(prompt, /transparent scenery layer/i);
    assert.match(prompt, /lower 62% combat floor/i);
  });

  it('builds sky prompts from generated layers, not the original reference', () => {
    const prompt = buildSkyPrompt({
      areaName: 'moonlit ruins',
      runDelta: 'quieter sky',
    });

    assert.match(prompt, /generated background and battleground/i);
    assert.match(prompt, /sky only/i);
    assert.doesNotMatch(prompt, /exact moon position/i);
  });

  it('creates a manifest with all layer prompts', () => {
    const manifest = createPromptManifest({
      areaId: 'moonlit_ruins',
      areaName: 'moonlit ruins',
      runId: 'run-001',
      runDelta: 'first attempt',
      width: 3840,
      height: 1024,
    });

    assert.equal(manifest.areaId, 'moonlit_ruins');
    assert.equal(manifest.runId, 'run-001');
    assert.equal(manifest.modelId, 'model_openai-gpt-image-2');
    assert.equal(manifest.size.width, 3840);
    assert.equal(manifest.prompts.battleground.includes('bottom 62%'), true);
    assert.equal(manifest.prompts.background.includes('upper 38%'), true);
    assert.equal(manifest.prompts.sky.includes('sky only'), true);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/scripts/battlefield-generation-prompts.test.js
```

Expected: FAIL because `prompt-recipe.mjs` does not exist.

- [ ] **Step 3: Create the prompt recipe module**

Create `scripts/battlefield-generation/prompt-recipe.mjs`:

```js
import { SCENARIO_MODELS, TARGET_SIZE } from './config.mjs';

const STYLE_BIBLE = [
  'painterly mobile JRPG battlefield background',
  'hand-painted fantasy environment art',
  'soft textured stone surfaces',
  'bright sci-fi fantasy clarity with cool moonlit ambience',
  'not photorealistic',
  'not generic anime character art',
  'no sharp AI clutter',
].join(', ');

const NEGATIVE_PROMPT = [
  'No characters',
  'no creatures',
  'no people',
  'no UI',
  'no text',
  'no labels',
  'no logos',
  'no watermarks',
  'no HP bars',
  'no baked creature shadows',
].join(', ');

function normalizeAreaName(areaName) {
  return areaName || 'moonlit ruins';
}

function appendRunDelta(lines, runDelta) {
  if (runDelta) {
    lines.push(`Current iteration focus: ${runDelta}.`);
  }
  return lines;
}

export function buildBattlegroundPrompt({ areaName, runDelta, width = TARGET_SIZE.width, height = TARGET_SIZE.height } = {}) {
  const lines = [
    `Generate the battleground layer for a ${normalizeAreaName(areaName)} battlefield.`,
    `Canvas: ${width}x${height}, wide horizontal side-scrolling strip.`,
    `Style: ${STYLE_BIBLE}.`,
    'This is the floor layer only.',
    'The open combat floor must occupy the bottom 62% of the image, starting around 38% from the top.',
    'The top 38% should not contain important architecture, sky, horizon, walls, or moon; keep attention on the floor surface.',
    'Create ancient cracked stone floor with readable depth, soft moss, subtle low debris, and an open central aisle.',
    'Keep left and right standing areas readable for small creature sprites without literal pads, board-game spaces, or formation diagrams.',
    `${NEGATIVE_PROMPT}.`,
  ];
  return appendRunDelta(lines, runDelta).join('\n');
}

export function buildBackgroundPrompt({ areaName, runDelta, width = TARGET_SIZE.width, height = TARGET_SIZE.height } = {}) {
  const lines = [
    `Generate the transparent background scenery layer for a ${normalizeAreaName(areaName)} battlefield.`,
    `Canvas: ${width}x${height}, matching the generated battleground reference.`,
    `Style: ${STYLE_BIBLE}.`,
    'Use the generated battleground reference for perspective, camera height, palette, and floor boundary.',
    'The upper 38% should contain arches, columns, broken stone walls, distant ruins, silhouettes, and depth.',
    'Leave the lower 62% combat floor to the battleground layer; do not cover creature standing space.',
    'This layer should become transparent scenery after background removal, with openings where sky can show through.',
    `${NEGATIVE_PROMPT}.`,
  ];
  return appendRunDelta(lines, runDelta).join('\n');
}

export function buildSkyPrompt({ areaName, runDelta, width = TARGET_SIZE.width, height = TARGET_SIZE.height } = {}) {
  const lines = [
    `Generate the sky only layer for a ${normalizeAreaName(areaName)} battlefield.`,
    `Canvas: ${width}x${height}, matching the generated background and battleground reference.`,
    `Style: ${STYLE_BIBLE}.`,
    'Use the generated background and battleground as reference for palette and nighttime ambience.',
    'Create a scroll-safe deep blue night sky with stars and a soft atmospheric gradient.',
    'Do not rely on exact moon position or exact shafts of light.',
    'No architecture, no ground, no columns, no walls, no characters, no creatures, no UI, no text, no logos.',
  ];
  return appendRunDelta(lines, runDelta).join('\n');
}

export function createPromptManifest({
  areaId,
  areaName,
  runId,
  runDelta,
  width = TARGET_SIZE.width,
  height = TARGET_SIZE.height,
} = {}) {
  return {
    areaId,
    areaName: normalizeAreaName(areaName),
    runId,
    runDelta: runDelta || '',
    modelId: SCENARIO_MODELS.generation,
    size: { width, height },
    prompts: {
      battleground: buildBattlegroundPrompt({ areaName, runDelta, width, height }),
      background: buildBackgroundPrompt({ areaName, runDelta, width, height }),
      sky: buildSkyPrompt({ areaName, runDelta, width, height }),
    },
  };
}
```

- [ ] **Step 4: Run syntax and tests**

Run:

```bash
node --check scripts/battlefield-generation/prompt-recipe.mjs
npm run test:unit -- tests/unit/scripts/battlefield-generation-prompts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/battlefield-generation/prompt-recipe.mjs tests/unit/scripts/battlefield-generation-prompts.test.js
git commit -m "chore(assets): add battlefield prompt recipe"
```

---

### Task 3: Add Run Directory Bootstrap

**Files:**
- Create: `scripts/battlefield-generation/create-run.mjs`

- [ ] **Step 1: Create the run bootstrap script**

Create `scripts/battlefield-generation/create-run.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_AREA_ID, SCORE_MAX, SCORE_THRESHOLDS, TARGET_SIZE } from './config.mjs';
import { createPromptManifest } from './prompt-recipe.mjs';

function parseArgs(argv) {
  const args = {
    area: DEFAULT_AREA_ID,
    areaName: 'moonlit ruins',
    run: '',
    delta: 'first attempt',
    width: TARGET_SIZE.width,
    height: TARGET_SIZE.height,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--area') args.area = value;
    if (key === '--area-name') args.areaName = value;
    if (key === '--run') args.run = value;
    if (key === '--delta') args.delta = value;
    if (key === '--width') args.width = Number(value);
    if (key === '--height') args.height = Number(value);
    if (key.startsWith('--')) i += 1;
  }
  return args;
}

async function nextRunId(areaDir) {
  await fs.mkdir(areaDir, { recursive: true });
  const entries = await fs.readdir(areaDir, { withFileTypes: true });
  const max = entries
    .filter(entry => entry.isDirectory() && /^run-\d+$/.test(entry.name))
    .map(entry => Number(entry.name.slice(4)))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `run-${String(max + 1).padStart(3, '0')}`;
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
const areaDir = path.resolve('tmp/battlefield-generation', args.area);
const runId = args.run || await nextRunId(areaDir);
const runDir = path.join(areaDir, runId);

await fs.mkdir(runDir, { recursive: true });

await writeJson(path.join(runDir, 'prompts.json'), createPromptManifest({
  areaId: args.area,
  areaName: args.areaName,
  runId,
  runDelta: args.delta,
  width: args.width,
  height: args.height,
}));

await writeJson(path.join(runDir, 'scenario-assets.json'), {
  areaId: args.area,
  runId,
  jobs: {},
  assets: {},
  notes: [],
});

await writeJson(path.join(runDir, 'scorecard.json'), {
  areaId: args.area,
  runId,
  scores: {
    composition: 0,
    style: 0,
    layerValidity: 0,
    lightingMood: 0,
    gameplayFit: 0,
    overall: 0,
  },
  max: SCORE_MAX,
  thresholds: SCORE_THRESHOLDS,
  critique: '',
  weakestLayer: '',
  nextPromptDelta: args.delta,
  approved: false,
});

console.log(JSON.stringify({ runDir, runId }, null, 2));
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check scripts/battlefield-generation/create-run.mjs
```

Expected: PASS.

- [ ] **Step 3: Smoke-test run creation**

Run:

```bash
node scripts/battlefield-generation/create-run.mjs --area moonlit_ruins --area-name "moonlit ruins" --delta "first attempt"
```

Expected: prints a `tmp/battlefield-generation/moonlit_ruins/run-###` path and creates `prompts.json`, `scenario-assets.json`, and `scorecard.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/battlefield-generation/create-run.mjs
git commit -m "chore(assets): add battlefield run bootstrap"
```

---

### Task 4: Add Layer Assembly Script

**Files:**
- Create: `scripts/battlefield-generation/assemble-run.mjs`
- Create: `tests/unit/scripts/battlefield-generation-assemble.test.js`

- [ ] **Step 1: Write the failing assembly test**

Create `tests/unit/scripts/battlefield-generation-assemble.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const { assembleRun } = await import('../../../scripts/battlefield-generation/assemble-run.mjs');

describe('assembleRun', () => {
  it('composites sky, background, and battleground at the target size', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-assemble-'));
    await sharp({ create: { width: 64, height: 32, channels: 4, background: '#0000ff' } }).png().toFile(path.join(dir, 'sky.png'));
    await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toFile(path.join(dir, 'background.png'));
    await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.5 } } }).png().toFile(path.join(dir, 'battleground.png'));

    const outputPath = await assembleRun({ runDir: dir, width: 64, height: 32 });
    const metadata = await sharp(outputPath).metadata();

    assert.equal(path.basename(outputPath), 'assembled.png');
    assert.equal(metadata.width, 64);
    assert.equal(metadata.height, 32);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/scripts/battlefield-generation-assemble.test.js
```

Expected: FAIL because `assemble-run.mjs` does not exist.

- [ ] **Step 3: Create the assembly script**

Create `scripts/battlefield-generation/assemble-run.mjs`:

```js
import path from 'node:path';
import sharp from 'sharp';
import { TARGET_SIZE } from './config.mjs';

async function normalizedPng(inputPath, width, height) {
  return sharp(inputPath)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

export async function assembleRun({ runDir, width = TARGET_SIZE.width, height = TARGET_SIZE.height }) {
  const skyPath = path.join(runDir, 'sky.png');
  const backgroundPath = path.join(runDir, 'background.png');
  const battlegroundPath = path.join(runDir, 'battleground.png');
  const outputPath = path.join(runDir, 'assembled.png');

  const background = await normalizedPng(backgroundPath, width, height);
  const battleground = await normalizedPng(battlegroundPath, width, height);

  await sharp(skyPath)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .composite([
      { input: background, blend: 'over' },
      { input: battleground, blend: 'over' },
    ])
    .png()
    .toFile(outputPath);

  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/battlefield-generation/assemble-run.mjs <run-dir>');
    process.exit(1);
  }
  const outputPath = await assembleRun({ runDir });
  console.log(JSON.stringify({ outputPath }, null, 2));
}
```

- [ ] **Step 4: Run syntax and tests**

Run:

```bash
node --check scripts/battlefield-generation/assemble-run.mjs
npm run test:unit -- tests/unit/scripts/battlefield-generation-assemble.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/battlefield-generation/assemble-run.mjs tests/unit/scripts/battlefield-generation-assemble.test.js
git commit -m "chore(assets): add battlefield layer assembly"
```

---

### Task 5: Add Browser Review Generator

**Files:**
- Create: `scripts/battlefield-generation/generate-review.mjs`

- [ ] **Step 1: Create the review generator**

Create `scripts/battlefield-generation/generate-review.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function generateReview({ runDir, referencePath }) {
  const scorecard = await readJson(path.join(runDir, 'scorecard.json'));
  const prompts = await readJson(path.join(runDir, 'prompts.json'));
  const referenceSrc = referencePath ? path.relative(runDir, path.resolve(referencePath)) : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(prompts.areaId)} ${esc(prompts.runId)} review</title>
  <style>
    body { margin: 0; padding: 24px; background: #111827; color: #e5e7eb; font-family: system-ui, sans-serif; }
    h1, h2 { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
    .panel { background: #1f2937; border: 1px solid #374151; border-radius: 14px; padding: 14px; }
    img { width: 100%; border-radius: 10px; background: #0b1020; }
    .layers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
    .score { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin: 18px 0; }
    .score div { background: #0f172a; border-radius: 10px; padding: 10px; text-align: center; }
    pre { white-space: pre-wrap; background: #0f172a; padding: 12px; border-radius: 10px; }
    .muted { color: #9ca3af; }
  </style>
</head>
<body>
  <h1>${esc(prompts.areaId)} ${esc(prompts.runId)}</h1>
  <p class="muted">Only the assembled image is scored against the reference. Layers are shown to diagnose the next regeneration target.</p>
  <div class="grid">
    <div class="panel">
      <h2>Reference</h2>
      ${referenceSrc ? `<img src="${esc(referenceSrc)}" alt="Reference">` : '<p>No reference path supplied.</p>'}
    </div>
    <div class="panel">
      <h2>Assembled</h2>
      <img src="assembled.png" alt="Assembled generated battlefield">
    </div>
  </div>
  <div class="score">
    <div><strong>${scorecard.scores.overall}</strong><br>Overall</div>
    <div><strong>${scorecard.scores.composition}</strong><br>Composition</div>
    <div><strong>${scorecard.scores.style}</strong><br>Style</div>
    <div><strong>${scorecard.scores.layerValidity}</strong><br>Layer</div>
    <div><strong>${scorecard.scores.lightingMood}</strong><br>Mood</div>
    <div><strong>${scorecard.scores.gameplayFit}</strong><br>Gameplay</div>
  </div>
  <div class="layers">
    <div class="panel"><h2>Sky</h2><img src="sky.png" alt="Sky layer"></div>
    <div class="panel"><h2>Background</h2><img src="background.png" alt="Background layer"></div>
    <div class="panel"><h2>Battleground</h2><img src="battleground.png" alt="Battleground layer"></div>
  </div>
  <div class="panel" style="margin-top: 18px;">
    <h2>Critique</h2>
    <pre>${esc(scorecard.critique)}</pre>
    <h2>Weakest Layer</h2>
    <pre>${esc(scorecard.weakestLayer)}</pre>
    <h2>Next Prompt Delta</h2>
    <pre>${esc(scorecard.nextPromptDelta)}</pre>
  </div>
</body>
</html>`;

  const reviewPath = path.join(runDir, 'review.html');
  await fs.writeFile(reviewPath, html);
  return reviewPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  const referencePath = process.argv[3];
  if (!runDir) {
    console.error('Usage: node scripts/battlefield-generation/generate-review.mjs <run-dir> [reference-path]');
    process.exit(1);
  }
  const reviewPath = await generateReview({ runDir, referencePath });
  console.log(JSON.stringify({ reviewPath }, null, 2));
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check scripts/battlefield-generation/generate-review.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/battlefield-generation/generate-review.mjs
git commit -m "chore(assets): add battlefield review page generator"
```

---

### Task 6: Add Approved Asset Export

**Files:**
- Create: `scripts/battlefield-generation/export-approved.mjs`

- [ ] **Step 1: Create the export script**

Create `scripts/battlefield-generation/export-approved.mjs`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LAYER_ORDER, SCORE_THRESHOLDS } from './config.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function assertApproved(scorecard) {
  const scores = scorecard.scores;
  const approved =
    scorecard.approved === true &&
    scores.overall >= SCORE_THRESHOLDS.overall &&
    scores.composition >= SCORE_THRESHOLDS.composition &&
    scores.layerValidity >= SCORE_THRESHOLDS.layerValidity &&
    scores.gameplayFit >= SCORE_THRESHOLDS.gameplayFit;

  if (!approved) {
    throw new Error('Run is not approved or does not meet score thresholds.');
  }
}

export async function exportApproved({ runDir, areaId }) {
  const scorecard = await readJson(path.join(runDir, 'scorecard.json'));
  assertApproved(scorecard);

  const outDir = path.resolve('public/assets/backgrounds', areaId);
  await fs.mkdir(outDir, { recursive: true });

  for (const layer of LAYER_ORDER) {
    await sharp(path.join(runDir, `${layer}.png`))
      .webp({ quality: 90 })
      .toFile(path.join(outDir, `${layer}.webp`));
  }

  return outDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  const areaId = process.argv[3];
  if (!runDir || !areaId) {
    console.error('Usage: node scripts/battlefield-generation/export-approved.mjs <run-dir> <area-id>');
    process.exit(1);
  }
  const outDir = await exportApproved({ runDir, areaId });
  console.log(JSON.stringify({ outDir }, null, 2));
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check scripts/battlefield-generation/export-approved.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/battlefield-generation/export-approved.mjs
git commit -m "chore(assets): add approved battlefield export"
```

---

### Task 7: Execute One Scenario Generation Run

**Files:**
- Uses: `tmp/battlefield-generation/moonlit_ruins/run-###/`
- Uses MCP server: `project-0-koto-dev-scenario`

- [ ] **Step 1: Create run directory**

Run:

```bash
node scripts/battlefield-generation/create-run.mjs --area moonlit_ruins --area-name "moonlit ruins" --delta "first text-only battleground attempt using bottom 62 percent combat floor"
```

Expected: creates a new run directory and prints its path.

- [ ] **Step 2: Read the prompts**

Read the generated `prompts.json`. Use the `prompts.battleground` value for the first Scenario generation call.

- [ ] **Step 3: Generate text-only battleground with Scenario MCP**

Call `run_model` on `project-0-koto-dev-scenario`:

```json
{
  "server": "project-0-koto-dev-scenario",
  "toolName": "run_model",
  "arguments": {
    "model_id": "model_openai-gpt-image-2",
    "parameters": {
      "prompt": "<prompts.battleground>",
      "width": 3840,
      "height": 1024,
      "quality": "high",
      "background": "opaque",
      "numOutputs": 1
    },
    "wait": true,
    "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
    "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
    "response_format": "json"
  }
}
```

Expected: returns a Scenario asset ID. If `3840x1024` is rejected, retry the same prompt with fallback widths in order: `3584`, `3328`, `3072`, `2816`, `2560`, `2304`, `2048`, keeping height `1024`.

- [ ] **Step 4: Display and evaluate battleground**

Call `display_asset` with the battleground asset ID. Reject it if it contains sky, arches, tall walls, characters, text, literal grid markers, or if the usable floor does not occupy roughly the bottom `62%`.

- [ ] **Step 5: Generate background using battleground reference**

Call `run_model` with:

```json
{
  "model_id": "model_openai-gpt-image-2",
  "parameters": {
    "prompt": "<prompts.background>",
    "referenceImages": ["<battleground_asset_id>"],
    "width": 3840,
    "height": 1024,
    "quality": "high",
    "background": "opaque",
    "numOutputs": 1
  },
  "wait": true,
  "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "response_format": "json"
}
```

Expected: returns an opaque background scenery asset.

- [ ] **Step 6: Remove background scenery alpha with Photoroom**

Call `run_model` with:

```json
{
  "model_id": "model_photoroom-background-removal",
  "parameters": {
    "image": "<background_opaque_asset_id>"
  },
  "wait": true,
  "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "response_format": "json"
}
```

Expected: returns a transparent background asset.

- [ ] **Step 7: Build a generated layer reference for sky**

Download or display the current battleground and transparent background assets. Persist them locally as `battleground.png` and `background.png`, then run:

```bash
node scripts/battlefield-generation/assemble-run.mjs <run-dir>
```

Upload the assembled or `background + battleground` image back to Scenario with `upload_asset` multipart flow if it is above `100KB`.

- [ ] **Step 8: Generate sky using generated layer reference**

Call `run_model` with:

```json
{
  "model_id": "model_openai-gpt-image-2",
  "parameters": {
    "prompt": "<prompts.sky>",
    "referenceImages": ["<generated_layer_reference_asset_id>"],
    "width": 3840,
    "height": 1024,
    "quality": "high",
    "background": "opaque",
    "numOutputs": 1
  },
  "wait": true,
  "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "response_format": "json"
}
```

Expected: returns a sky-only asset with no architecture or ground.

- [ ] **Step 9: Persist Scenario metadata**

Update `scenario-assets.json` with every job ID, asset ID, model ID, dimensions, and app URL returned during the run.

- [ ] **Step 10: Persist local layer PNGs**

Use Scenario asset download tooling to write:

```text
<run-dir>/battleground.png
<run-dir>/background-opaque.png
<run-dir>/background.png
<run-dir>/sky.png
```

Expected: all four files exist locally.

---

### Task 8: Assemble, Review, Score, And Iterate

**Files:**
- Uses: `scripts/battlefield-generation/assemble-run.mjs`
- Uses: `scripts/battlefield-generation/generate-review.mjs`
- Modify per run: `<run-dir>/scorecard.json`

- [ ] **Step 1: Assemble the run**

Run:

```bash
node scripts/battlefield-generation/assemble-run.mjs <run-dir>
```

Expected: writes `<run-dir>/assembled.png`.

- [ ] **Step 2: Generate browser review page**

Run:

```bash
node scripts/battlefield-generation/generate-review.mjs <run-dir> "/Users/michiarohrssen/.cursor/projects/Users-michiarohrssen-Documents-Claude-koto-dev/assets/asset_vtsjmPLX3xGMrNLHTkKDgxGT-99cbc267-c157-4db3-b52a-d398d2fc9b76.png"
```

Expected: writes `<run-dir>/review.html`.

- [ ] **Step 3: Open the review page in the browser**

Start a local static server from the repo root:

```bash
python3 -m http.server 8765
```

Open:

```text
http://localhost:8765/tmp/battlefield-generation/moonlit_ruins/<run-id>/review.html
```

Expected: browser shows reference left, assembled output right, layer thumbnails below, and scorecard text.

- [ ] **Step 4: Score the assembled output**

Edit `<run-dir>/scorecard.json` using this rubric:

```json
{
  "scores": {
    "composition": 0,
    "style": 0,
    "layerValidity": 0,
    "lightingMood": 0,
    "gameplayFit": 0,
    "overall": 0
  },
  "critique": "Describe the visible mismatch against the reference.",
  "weakestLayer": "battleground | background | sky | prompt-recipe",
  "nextPromptDelta": "Specific prompt change to test next.",
  "approved": false
}
```

Expected: score reflects the assembled result, not the attractiveness of individual layers.

- [ ] **Step 5: Iterate targeted layer**

If overall score is below `90`, regenerate only the weakest layer unless the style recipe is fundamentally wrong.

Examples:

```text
Weak battleground: create next run with delta "floor starts too high; increase open combat floor to bottom 62 percent and remove wall-like foreground shapes"
Weak background: create next run with delta "arches too small and not enough ruined hall silhouette in upper 38 percent"
Weak sky: create next run with delta "sky too bright and distracts behind labels; make quieter deep blue night gradient"
Weak prompt recipe: create next run with delta "style too photoreal; emphasize hand-painted mobile JRPG background art"
```

Expected: each new run has a clear prompt delta traceable to the previous scorecard.

- [ ] **Step 6: Stop only after approval gate passes**

Approval requires:

```text
overall >= 90
composition >= 25
layerValidity >= 18
gameplayFit >= 12
approved = true
```

Expected: no final WebP export before these gates pass.

---

### Task 9: Export Approved Assets

**Files:**
- Create final assets under: `public/assets/backgrounds/moonlit_ruins/`

- [ ] **Step 1: Export approved run**

Run:

```bash
node scripts/battlefield-generation/export-approved.mjs <approved-run-dir> moonlit_ruins
```

Expected: creates:

```text
public/assets/backgrounds/moonlit_ruins/sky.webp
public/assets/backgrounds/moonlit_ruins/background.webp
public/assets/backgrounds/moonlit_ruins/battleground.webp
```

- [ ] **Step 2: Verify final files exist**

Run:

```bash
ls -lh public/assets/backgrounds/moonlit_ruins
```

Expected: all three WebP files are present and non-empty.

- [ ] **Step 3: Commit final approved assets and scripts**

```bash
git add scripts/battlefield-generation tests/unit/scripts public/assets/backgrounds/moonlit_ruins docs/superpowers/specs/2026-05-03-scenario-battlefield-asset-workflow-design.md docs/superpowers/plans/2026-05-03-scenario-battlefield-asset-workflow.md .cursor/mcp.json
git commit -m "chore(assets): add scenario battlefield workflow"
```

---

## Final Verification

Run:

```bash
node --check scripts/battlefield-generation/config.mjs
node --check scripts/battlefield-generation/prompt-recipe.mjs
node --check scripts/battlefield-generation/create-run.mjs
node --check scripts/battlefield-generation/assemble-run.mjs
node --check scripts/battlefield-generation/generate-review.mjs
node --check scripts/battlefield-generation/export-approved.mjs
npm run test:unit -- tests/unit/scripts/battlefield-generation-config.test.js tests/unit/scripts/battlefield-generation-prompts.test.js tests/unit/scripts/battlefield-generation-assemble.test.js
```

Expected: all syntax checks and unit tests pass.

Then open the approved run's `review.html` in the browser and confirm:

- reference and assembled output are side by side,
- `sky -> background -> battleground` is visibly the source of the assembled result,
- final score is at least `90`,
- no category gate fails,
- final WebP files exist under `public/assets/backgrounds/moonlit_ruins/`.

