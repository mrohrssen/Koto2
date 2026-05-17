# Scenario Move Sprite Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Scenario MCP based pipeline that generates missing move icons in white 3x3 grids, removes backgrounds with Scenario Photoroom, and slices transparent grids into final action WebPs.

**Architecture:** Add a focused `scripts/scenario-move-sprites/` workflow that plans jobs locally and leaves MCP calls agent-driven. Local scripts handle deterministic manifests, prompt construction, missing sprite discovery, and alpha-channel slicing; Scenario owns image generation and background removal. The workflow copies the ingredient icon process and explicitly excludes local RMBG or color-key fallback.

**Tech Stack:** Node ES modules, `node:test`, `sharp`, Scenario MCP (`project-0-koto-dev-scenario`, `model_openai-gpt-image-2`, `model_photoroom-background-removal`), existing `data/moves.json`, existing `public/assets/sprites/actions/`.

---

## File Structure

- Create: `scripts/scenario-move-sprites/prompts.mjs`
  - Owns move visual hints and prompt construction for white-background 3x3 Scenario grids.
- Create: `scripts/scenario-move-sprites/build-jobs.mjs`
  - CLI entry point for missing move discovery, selected slug batching, manifest writing, and dry-run validation.
- Create: `scripts/scenario-move-sprites/slice-transparent-grid.mjs`
  - CLI entry point for turning a Scenario transparent grid plus manifest batch into transparent PNG intermediates and WebP action sprites.
- Create: `scripts/scenario-move-sprites/README.md`
  - Documents the exact ingredient-derived Scenario workflow and the MCP loop.
- Create: `tests/unit/scripts/scenario-move-sprites.test.js`
  - Covers prompt requirements, missing move discovery, manifest generation, missing hint failures, and alpha-channel slicing.
- Reference only: `docs/superpowers/specs/2026-05-17-scenario-move-sprite-generation-design.md`
  - Approved design. Do not modify unless implementation discovers a contradiction.
- Reference only: `scripts/generate-move-icons.mjs`
  - Existing `VISUAL_HINTS` source. Copy hints into the new prompt module rather than importing from an executable script.
- Reference only: [Ingredient icon Scenario workflow](abf15895-14cf-4bdd-a84f-88d75a2b8650)
  - Source workflow for upload, Photoroom, download, alpha slicing, and no local fallback.

## Task 1: Prompt Module And Visual Hints

**Files:**
- Create: `scripts/scenario-move-sprites/prompts.mjs`
- Test: `tests/unit/scripts/scenario-move-sprites.test.js`

- [ ] **Step 1: Create the test file with prompt contract tests**

Create `tests/unit/scripts/scenario-move-sprites.test.js` with these initial tests:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  VISUAL_HINTS,
  buildMoveGridPrompt,
  getMoveVisualHint,
} from '../../../scripts/scenario-move-sprites/prompts.mjs';

describe('scenario move sprite prompts', () => {
  it('provides existing visual hints by slug', () => {
    assert.equal(
      getMoveVisualHint('encircle'),
      'arrows circling inward from all directions, surrounding a center point',
    );
    assert.equal(
      getMoveVisualHint('wash-away'),
      'a rushing wave sweeping things away with foam and spray',
    );
  });

  it('returns null for missing visual hints', () => {
    assert.equal(getMoveVisualHint('not-a-real-move'), null);
  });

  it('builds a white-background 3x3 prompt that bans text and frames', () => {
    const prompt = buildMoveGridPrompt([
      { slug: 'encircle', hint: VISUAL_HINTS.encircle },
      { slug: 'throw-away', hint: VISUAL_HINTS['throw-away'] },
      { slug: 'topple', hint: VISUAL_HINTS.topple },
      { slug: 'fire', hint: VISUAL_HINTS.fire },
      { slug: 'pull', hint: VISUAL_HINTS.pull },
      { slug: 'wash-away', hint: VISUAL_HINTS['wash-away'] },
      { slug: 'step-on', hint: VISUAL_HINTS['step-on'] },
      { slug: 'wound', hint: VISUAL_HINTS.wound },
      { slug: 'tear', hint: VISUAL_HINTS.tear },
    ]);

    assert.match(prompt, /Draw EXACTLY 9 compact RPG ability icons/);
    assert.match(prompt, /3x3 layout/);
    assert.match(prompt, /flat white background/i);
    assert.match(prompt, /#FFFFFF/);
    assert.match(prompt, /No text, no labels, no letters, no kana, no numbers, no UI frames/);
    assert.match(prompt, /Row 1: \(1\) arrows circling inward/);
    assert.match(prompt, /Row 3: \(7\) a foot stomping down/);
    assert.doesNotMatch(prompt, /magenta/i);
  });
});
```

- [ ] **Step 2: Run the prompt tests and verify they fail**

Run:

```bash
node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: fails with `Cannot find module` for `scripts/scenario-move-sprites/prompts.mjs`.

- [ ] **Step 3: Create `prompts.mjs`**

Create `scripts/scenario-move-sprites/prompts.mjs`:

```js
// Prompt source for Scenario move sprite grids.
// Keep this data-only; do not import executable generator scripts.

export const VISUAL_HINTS = {
  // Existing hints copied from scripts/generate-move-icons.mjs.
  encircle: 'arrows circling inward from all directions, surrounding a center point',
  'throw-away': 'a hand flinging something away with a careless toss arc',
  topple: 'a figure being knocked sideways with impact lines and dust',
  fire: 'a cute cartoon cannon firing a cannonball with a puff of smoke',
  pull: 'a hand pulling with a rope, taut motion lines',
  'wash-away': 'a rushing wave sweeping things away with foam and spray',
  'step-on': 'a foot stomping down hard with a ground-crack impact star',
  wound: 'a red scratch wound mark with small drops',
  tear: 'fabric or paper being torn apart with ragged edges',
  launch: 'a rocket projectile launching upward with exhaust flames',
  wash: 'water splashing in a cleaning swirl',
  bury: 'a mound of dirt with something half-buried, shovel marks',
  demolish: 'crumbling brick wall breaking apart with debris flying',
  pour: 'liquid pouring down from a tilted vessel',
  thrust: 'a spear thrusting forward with a sharp impact point',
  overflow: 'water overflowing from a cup or container, splashing out',
  shoot: 'a bow releasing an arrow with speed lines',
  assault: 'multiple rapid strike impacts in a burst pattern',
  roast: 'flames licking upward around a spit, cooking fire',
  beat: 'a drum being struck with drumsticks, impact rings',
  penetrate: 'an arrow piercing clean through a wooden target',
  slice: 'a clean diagonal blade cut with a bright energy trail',
  snap: 'sharp jaws snapping shut quickly with a click effect',
  ruin: 'ancient crumbling ruins with dust clouds rising',
  rip: 'something being ripped apart with force, pieces flying',
  spin: 'a spinning vortex motion with circular speed lines',
  'swallow-up': 'a whirlpool vortex sucking things inward, spiral',
  grasp: 'a fist clenching tight with grip pressure lines',
  sting: 'a sharp bee stinger needle piercing downward with a bright impact star and speed lines',
  dig: 'a small shovel biting into a mound of dirt with soil chunks flying outward',
  dash: 'horizontal speed lines with a motion blur swoosh',
  persevere: 'a raised fist glowing with determination, small sparkle',
  call: 'a megaphone projecting bold sound waves outward',
  teach: 'a pointer wand tapping a glowing star, knowledge sparkle',
  approach: 'footprint trail with forward-pointing arrows',
  hurry: 'a clock face with spinning hands and speed lines',
  'stand-up': 'an upward arrow figure rising with bold upward energy',
  'jump-out': 'bursting outward from a surface with radial speed lines',
  exceed: 'an upward arrow smashing through a ceiling barrier, shards flying',
  fly: 'spread feathered wings with wind gusts beneath',
  leap: 'an upward arc trajectory with spring coil lines at the base',
  sparkle: 'brilliant multi-pointed sparkle burst with star shapes radiating',
  challenge: 'two crossed swords with a spark at the intersection',
  extend: 'an arm or beam extending outward with reach arrows stretching forward',
  pray: 'two hands clasped together in prayer with a soft halo glow above',
  stretch: 'an elastic shape stretching outward with extension arrows',
  stack: 'glowing blocks stacking upward, three layers high',
  chirp: 'a musical note with a small cute bird beak beside it',
  speak: 'a speech bubble with small sound wave lines',
  rage: 'an angry red aura burst with comic fury vein marks',
  suffer: 'a pained swirl of dark purple energy, anguished',
  shake: 'zigzag vibration lines shaking back and forth',
  doubt: 'a large question mark with a narrowed suspicious eye',
  stare: 'two intense glowing eyes staring forward with focus lines',
  tremble: 'a shivering shape outline with rapid vibration marks',
  touch: 'a fingertip touching a surface with a soft ripple ring',
  cry: 'large teardrops falling from sad eyes',
  shout: 'a wide-open mouth shouting with bold concentric sound rings',
  trick: 'a magician top hat with sneaky sparkles and a hidden card',
  tie: 'thick ropes tied in a tight restricting knot',
  abandon: 'a broken chain link falling apart with pieces scattering',
  restrict: 'a padlock snapping shut with a metallic gleam',
  extinguish: 'a candle flame being blown out, wisps of smoke curling up',
  freeze: 'ice crystals forming with cold mist spreading outward',
  'pin-down': 'a hand pressing firmly downward with an impact star beneath',
  catch: 'a swooping net closing around something',
  melt: 'something dripping and melting with wavy heat lines rising',
  cure: 'a glowing green cross symbol with gentle sparkles around it',
  support: 'open palms cradling upward with a soft warm glow between them',
  'hand-over': 'two hands passing a small glowing orb between them',
  drink: 'a potion bottle being tilted with liquid pouring out',
  help: 'a helping hand reaching out with a warm golden glow',
  heal: 'a heart shape with green healing sparkles and soft light',
  rest: 'a peaceful cloud with Zzz letters floating above',
  sleep: 'a crescent moon with Zzz and tiny stars',
  warm: 'a warm orange glow orb with gentle heat waves rising upward',
  recover: 'a circular refresh arrow symbol with sparkles around it',
  sprout: 'a bright green sprout with two leaves unfurling from soil',
  sit: 'a soft round cushion compressing downward with settling motion lines',
  hide: 'a figure silhouette ducking behind a bush, half-hidden',
  protect: 'a glowing energy shield dome with protective light',
  enlarge: 'expanding outward arrows radiating from a center point',
  guard: 'a sturdy metal shield with a defensive cross emblem',
  cover: 'a protective dome or canopy sheltering from above',
  submerge: 'something sinking below a water surface line with bubbles rising',
  revolve: 'an orbiting ring spinning around a central point',
  stance: 'two firmly planted feet in a wide grounded stance, solid base',
  preserve: 'a glass jar or protective bubble containing a glowing object',
  dodge: 'a swift sidestep motion with a fading afterimage trail',
  endure: 'a solid rock standing firm against crashing waves',
  conceal: 'a cloak fading into invisibility with shimmering sparkle edges',
  float: 'a feather floating gently upward with small air bubbles',
  steal: 'a sneaky shadowy hand swiping with a quick-grab motion line',
  pluck: 'fingers plucking a feather or string with a twang effect',
  inhale: 'a swirling vortex of air being breathed inward, suction spiral',
  performance: 'musical notes swirling around instruments, a lively concert effect',

  // Missing move hints curated for the 2026-05-17 missing-action-sprite pass.
  gnaw: 'sharp teeth gnawing into a small branch, with tiny wood chips',
  'finishing-blow': 'a decisive final impact burst striking a cracked target',
  twist: 'two curved arrows twisting a flexible band into a spiral',
  impact: 'a heavy collision starburst against a stone surface',
  'heavy-punch': 'a large fist punching forward with dense impact lines',
  'coil-around': 'a vine or rope coiling around a simple target shape',
  'knock-down': 'a blocky target falling backward from a strong hit',
  'cut-down': 'a downward blade slash cutting through a simple target',
  rend: 'two crossing claw slashes tearing through cloth',
  restrain: 'glowing bands tightening around a simple target shape',
  mince: 'many small chopping cuts scattering tiny fragments',
  split: 'a cracked object splitting cleanly into two halves',
  envelop: 'soft green energy wrapping around a center point like a cocoon',
  parry: 'a small shield deflecting a blade with a bright spark',
  slam: 'a heavy object slamming down with dust and shock lines',
  'crush-flat': 'a massive weight flattening a target with ground cracks',
  spew: 'a burst of liquid or energy spraying outward from a mouth-like shape',
  'spit-out': 'a small projectile being spat out with sharp speed lines',
  spit: 'a quick droplet projectile flying forward with motion lines',
  absorb: 'green energy streams being drawn into a central orb',
  gust: 'a strong wind gust curling forward with leaves swept along',
  summon: 'a glowing magic circle calling forth a small light shape',
  growl: 'jagged sound waves from a fierce mouth silhouette',
  erupt: 'fire and smoke erupting upward from a cracked ground vent',
  flank: 'curved arrows moving around the side of a target',
  break: 'a cracked wall block breaking into chunks',
  seal: 'a glowing lock sigil closing over a simple target silhouette',
  extract: 'a hand pulling a glowing shard out from stone',
  'rip-apart': 'two hands pulling torn fabric apart with fragments flying',
  'pull-apart': 'two arrows pulling connected pieces away from each other',
  rebound: 'a ball bouncing off a surface with return arrows',
  yell: 'bold jagged sound waves bursting from an open mouth',
  smack: 'an open palm impact with a comic burst shape',
  'throw-down': 'a hand throwing an object downward into the ground',
  'hold-down': 'a hand pressing a target down with downward arrows',
  surge: 'a rising wave rushing forward in a powerful swell',
  squash: 'a heavy downward press squashing a soft target shape',
  pinch: 'two pincers closing inward on a small target',
  'overhead-swing': 'a weapon swinging down from above in a bright arc',
  'shake-off': 'a target shaking loose with broken bands flying away',
  'shake-away': 'a sweeping shake motion pushing particles outward',
  grab: 'a hand grabbing a small object with pressure lines',
  clench: 'a fist clenching tightly with small pressure sparks',
  jolt: 'a target jolted by zigzag shock lines',
  sway: 'a wavy silhouette leaning side to side with motion trails',
  fling: 'an object flung in a high arc from a hand',
  hurl: 'a heavy object thrown forward with strong speed lines',
  scatter: 'small leaves or shards scattering outward in many directions',
  'cut-apart': 'a clean blade cut separating a cord into two pieces',
  sever: 'a single sharp slash cutting through a rope',
  sing: 'musical notes and sound rings radiating from a small mouth',
  sink: 'a shape sinking below a water line with bubbles rising',
  drench: 'water pouring over a target with splashes',
  'wipe-away': 'a sweeping cloth or wave erasing a dark mark',
  whirl: 'a water vortex spinning in a tight spiral',
  char: 'a darkened burnt mark with small orange embers',
  blaze: 'a tall roaring flame with bright orange core',
  ignite: 'a spark lighting a small flame on kindling',
  'take-aim': 'a crosshair locking onto a simple target',
  pilfer: 'a sneaky hand lifting a small coin with motion lines',
  'shatter-apart': 'a crystal bursting into many sharp fragments',
  stab: 'a dagger point striking forward with a small impact star',
  'pierce-through': 'a spear passing completely through a target',
  skewer: 'a pointed spear pinning several small shapes in a line',
  shove: 'two hands pushing a target away with force lines',
  poke: 'a fingertip or stick poking a small target with a tiny spark',
  charge: 'a rushing arrow-shaped impact driving forward',
  'tie-up': 'rope loops tying a target into a tight bundle',
  unleash: 'a burst of stored energy shooting out from a hand',
  threaten: 'a dark warning aura with sharp triangular danger marks',
  pounce: 'a leaping claw silhouette arcing toward a target',
  run: 'fast feet with horizontal speed lines',
  trample: 'multiple heavy footprints stomping across cracked ground',
  stomp: 'one foot stomping down with a strong impact burst',
  'stand-firm': 'two planted feet braced against incoming wind',
  'guard-stance': 'a shield and planted feet in a defensive pose',
  'roll-over': 'a round boulder rolling over with curved motion arrows',
  reverberate: 'concentric sound waves shaking the ground',
  chase: 'footprints and forward arrows pursuing a small target',
  'drive-off': 'a sweeping hand and arrows pushing a target away',
  corner: 'arrows pressing a target into a corner shape',
  flee: 'small feet sprinting away with dust puffs',
  escape: 'a figure slipping through an opening with motion lines',
  interrupt: 'a barrier line cutting across incoming motion lines',
  flash: 'a sudden bright starburst with sharp light rays',
  imprison: 'a glowing cage closing around a simple target',
  fight: 'two crossed weapons colliding with a central spark',
  obstruct: 'a blocky barrier stopping forward arrows',
  'rain-down': 'many droplets or arrows falling from above',
  'take-flight': 'wings launching upward with wind beneath',
  'jump-down': 'a downward leap arc landing with a dust burst',
  'bite-into': 'sharp teeth biting deep into a simple target edge',
};

export function getMoveVisualHint(slug) {
  return VISUAL_HINTS[slug] || null;
}

export function buildMoveGridPrompt(batch) {
  if (!Array.isArray(batch) || batch.length !== 9) {
    throw new Error('buildMoveGridPrompt requires exactly 9 batch entries');
  }

  const layoutLines = [];
  for (let r = 0; r < 3; r++) {
    const rowItems = batch.slice(r * 3, (r + 1) * 3);
    const descriptions = rowItems.map((item, i) => `(${i + 1}) ${item.hint}`);
    layoutLines.push(`Row ${r + 1}: ${descriptions.join(', ')}`);
  }

  return [
    'Use the same art style as the reference images. These icons are for the same game.',
    '',
    'Draw EXACTLY 9 compact RPG ability icons arranged in a 3x3 layout on a flat white background (#FFFFFF).',
    'These are NOT characters or creatures. They are symbolic skill icons and vocabulary flashcard icons for an RPG.',
    'Each icon should communicate the action visually to a new language learner.',
    '',
    'IMAGE FORMAT:',
    '- Square image, 1024x1024',
    '- EXACTLY 3 columns and EXACTLY 3 rows',
    '- EXACTLY one icon in each cell',
    '- Do not add extra items, extra columns, extra rows, props, plates, bowls, background objects, borders, or dividers',
    '',
    'Layout (3 rows, 3 columns):',
    ...layoutLines,
    '',
    'LAYOUT:',
    '- Place each icon in an evenly-spaced 3x3 arrangement',
    '- DO NOT draw any grid lines, borders, dividers, or frames',
    '- The entire background must be solid flat white (#FFFFFF) with nothing else on it',
    '- Each icon must be fully contained in its area, not overlapping neighbors',
    '',
    'ART STYLE:',
    '- Fully opaque icon pixels with crisp boundaries for Scenario Photoroom background removal',
    '- No semi-transparent pixels, no soft feathered edges against the background',
    '- No text, no labels, no letters, no kana, no numbers, no UI frames',
    '- Each icon should be instantly recognizable as the concept it represents',
    '- Front-facing, centered in each cell',
    '- Small, compact designs that read well at 128x128 pixels',
  ].join('\n');
}
```

- [ ] **Step 4: Run the prompt tests and syntax check**

Run:

```bash
node --check scripts/scenario-move-sprites/prompts.mjs && node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: `prompts.mjs` syntax passes and all prompt tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/scenario-move-sprites/prompts.mjs tests/unit/scripts/scenario-move-sprites.test.js
git commit -m "$(cat <<'EOF'
Add Scenario move sprite prompt hints

EOF
)"
```

## Task 2: Manifest Builder

**Files:**
- Create: `scripts/scenario-move-sprites/build-jobs.mjs`
- Modify: `tests/unit/scripts/scenario-move-sprites.test.js`

- [ ] **Step 1: Add manifest builder tests**

Append these tests to `tests/unit/scripts/scenario-move-sprites.test.js`:

```js
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = resolve(process.cwd());
const BUILD_SCRIPT = resolve(PROJECT_ROOT, 'scripts/scenario-move-sprites/build-jobs.mjs');

describe('scenario move sprite manifest builder', () => {
  it('lists missing move sprites without generating a manifest', () => {
    const result = spawnSync('node', [BUILD_SCRIPT, '--list'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^slug,nameEn,name,reading,element,category,tier$/m);
    assert.match(result.stdout, /^gnaw,Gnaw,かじる,かじる,wood,damage,1$/m);
  });

  it('writes a Scenario manifest for selected move slugs', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--ids', 'gnaw,impact,seal',
      '--run', 'unit-run',
      '--out', outRoot,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const manifestPath = join(outRoot, 'unit-run', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(manifest.runId, 'unit-run');
    assert.equal(manifest.modelId, 'model_openai-gpt-image-2');
    assert.equal(manifest.backgroundRemovalModelId, 'model_photoroom-background-removal');
    assert.equal(manifest.teamId, 'team_g8yJ6jYJtWj44Um1NrmzYiLC');
    assert.equal(manifest.projectId, 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ');
    assert.equal(manifest.jobs.length, 1);
    assert.equal(manifest.jobs[0].moves.length, 9);
    assert.deepEqual(
      manifest.jobs[0].moves.filter(move => !move.filler).map(move => move.slug),
      ['gnaw', 'impact', 'seal'],
    );
    assert.equal(manifest.jobs[0].parameters.width, 1024);
    assert.equal(manifest.jobs[0].parameters.height, 1024);
    assert.equal(manifest.jobs[0].parameters.numOutputs, 1);
    assert.equal(manifest.jobs[0].parameters.background, 'opaque');
    assert.match(manifest.jobs[0].prompt, /flat white background/);
  });

  it('fails before writing a manifest when selected moves lack hints', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const fakeMovesPath = join(outRoot, 'moves.json');
    await writeFile(fakeMovesPath, JSON.stringify([
      {
        id: 'fake',
        name: '偽',
        nameEn: 'Unhinted Move',
        reading: 'にせ',
        element: 'neutral',
        category: 'damage',
        tier: 1,
      },
    ]));

    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--ids', 'unhinted-move',
      '--moves', fakeMovesPath,
      '--out', outRoot,
      '--run', 'missing-hint',
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing visual hints for selected moves: unhinted-move/);
  });

  it('supports a temp action sprite directory for missing discovery', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const actionsDir = join(outRoot, 'actions');
    await mkdir(actionsDir);
    await writeFile(join(actionsDir, 'gnaw.webp'), 'fake');

    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--list',
      '--actions-dir', actionsDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^gnaw,/m);
  });
});
```

- [ ] **Step 2: Run manifest tests and verify they fail**

Run:

```bash
node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: tests fail with `Cannot find module` or missing `build-jobs.mjs`.

- [ ] **Step 3: Create `build-jobs.mjs`**

Create `scripts/scenario-move-sprites/build-jobs.mjs`:

```js
#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { buildMoveGridPrompt, getMoveVisualHint } from './prompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');

const BATCH_SIZE = 9;
const SCENARIO_MODEL_ID = 'model_openai-gpt-image-2';
const BACKGROUND_REMOVAL_MODEL_ID = 'model_photoroom-background-removal';
const TEAM_ID = 'team_g8yJ6jYJtWj44Um1NrmzYiLC';
const PROJECT_ID = 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ';

function parseCli() {
  const { values } = parseArgs({
    options: {
      ids: { type: 'string' },
      list: { type: 'boolean' },
      run: { type: 'string' },
      out: { type: 'string' },
      moves: { type: 'string' },
      'actions-dir': { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      quality: { type: 'string' },
    },
    strict: true,
  });

  return {
    ids: values.ids ? values.ids.split(',').map(s => s.trim()).filter(Boolean) : null,
    list: values.list || false,
    runId: values.run || defaultRunId(),
    outRoot: values.out ? resolve(values.out) : resolve(PROJECT_ROOT, 'tmp/move-sprites-scenario'),
    movesPath: values.moves ? resolve(values.moves) : resolve(PROJECT_ROOT, 'data/moves.json'),
    actionsDir: values['actions-dir'] ? resolve(values['actions-dir']) : resolve(PROJECT_ROOT, 'public/assets/sprites/actions'),
    width: values.width ? Number(values.width) : 1024,
    height: values.height ? Number(values.height) : 1024,
    quality: values.quality || 'high',
  };
}

function defaultRunId() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}

function slugify(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function loadMoves(movesPath) {
  const moves = JSON.parse(await readFile(movesPath, 'utf8'));
  if (!Array.isArray(moves)) throw new Error(`Expected move array in ${movesPath}`);

  const bySlug = new Map();
  for (const move of moves) {
    if (!move.nameEn) continue;
    const slug = slugify(move.nameEn);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { ...move, slug });
    }
  }
  return [...bySlug.values()];
}

async function loadExistingActionSlugs(actionsDir) {
  let files = [];
  try {
    files = await readdir(actionsDir);
  } catch {
    return new Set();
  }
  return new Set(files.filter(file => file.endsWith('.webp')).map(file => file.replace(/\.webp$/, '')));
}

async function discoverMoves({ movesPath, actionsDir, ids }) {
  const moves = await loadMoves(movesPath);
  const existing = await loadExistingActionSlugs(actionsDir);
  const selected = ids
    ? ids.map(id => {
        const move = moves.find(item => item.slug === id);
        if (!move) throw new Error(`Unknown move slug: ${id}`);
        return move;
      })
    : moves.filter(move => !existing.has(move.slug));

  return selected.map(move => ({
    slug: move.slug,
    id: move.id,
    nameEn: move.nameEn,
    name: move.name,
    reading: move.reading,
    element: move.element,
    category: move.category,
    tier: move.tier,
    hint: getMoveVisualHint(move.slug),
  }));
}

function validateHints(moves) {
  const missing = moves.filter(move => !move.hint).map(move => move.slug);
  if (missing.length) {
    throw new Error(`Missing visual hints for selected moves: ${missing.join(', ')}`);
  }
}

function padBatches(moves) {
  const batches = [];
  for (let i = 0; i < moves.length; i += BATCH_SIZE) {
    const batch = moves.slice(i, i + BATCH_SIZE).map((move, index) => ({
      ...move,
      index,
      filler: false,
    }));

    while (batch.length < BATCH_SIZE) {
      const source = moves[batch.length % moves.length] || moves[0];
      batch.push({
        ...source,
        index: batch.length,
        filler: true,
      });
    }
    batches.push(batch);
  }
  return batches;
}

function buildJob({ batch, batchIndex, runDir, width, height, quality }) {
  const prompt = buildMoveGridPrompt(batch);
  return {
    batchIndex,
    prompt,
    parameters: {
      prompt,
      numOutputs: 1,
      width,
      height,
      quality,
      background: 'opaque',
    },
    moves: batch,
    outputs: {
      whiteGrid: `${runDir}/batch-${batchIndex}-white.png`,
      transparentGrid: `${runDir}/batch-${batchIndex}-transparent.png`,
      slicedDir: `${runDir}/sliced`,
    },
    scenario: {
      generationJobId: null,
      whiteGridAssetId: null,
      backgroundRemovalJobId: null,
      transparentGridAssetId: null,
    },
    results: {
      savedAt: null,
      sliced: [],
    },
  };
}

async function main() {
  const opts = parseCli();
  const selected = await discoverMoves(opts);
  validateHints(selected);

  if (opts.list) {
    console.log('slug,nameEn,name,reading,element,category,tier');
    for (const move of selected) {
      console.log(`${move.slug},${move.nameEn},${move.name},${move.reading},${move.element},${move.category},${move.tier}`);
    }
    return;
  }

  if (selected.length === 0) {
    console.error('No moves selected.');
    return;
  }

  const runDir = `${opts.outRoot}/${opts.runId}`;
  await mkdir(runDir, { recursive: true });

  const batches = padBatches(selected);
  const manifest = {
    runId: opts.runId,
    createdAt: new Date().toISOString(),
    modelId: SCENARIO_MODEL_ID,
    backgroundRemovalModelId: BACKGROUND_REMOVAL_MODEL_ID,
    teamId: TEAM_ID,
    projectId: PROJECT_ID,
    runDir,
    defaults: {
      width: opts.width,
      height: opts.height,
      quality: opts.quality,
      background: 'opaque',
    },
    jobs: batches.map((batch, batchIndex) => buildJob({
      batch,
      batchIndex,
      runDir,
      width: opts.width,
      height: opts.height,
      quality: opts.quality,
    })),
  };

  const manifestPath = `${runDir}/manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.jobs.length} job(s) -> ${manifestPath}`);
  console.log(`Selected moves: ${selected.length}`);
  console.log(`Model: ${SCENARIO_MODEL_ID}`);
  console.log(`Background removal: ${BACKGROUND_REMOVAL_MODEL_ID}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run tests and syntax checks**

Run:

```bash
node --check scripts/scenario-move-sprites/build-jobs.mjs && node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Smoke-check real missing list**

Run:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --list
```

Expected: prints CSV headed `slug,nameEn,name,reading,element,category,tier` and includes missing moves such as `gnaw` and `impact`.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/scenario-move-sprites/build-jobs.mjs tests/unit/scripts/scenario-move-sprites.test.js
git commit -m "$(cat <<'EOF'
Add Scenario move sprite manifest builder

EOF
)"
```

## Task 3: Transparent Grid Slicer

**Files:**
- Create: `scripts/scenario-move-sprites/slice-transparent-grid.mjs`
- Modify: `tests/unit/scripts/scenario-move-sprites.test.js`

- [ ] **Step 1: Add alpha-channel slicer tests**

Append these tests to `tests/unit/scripts/scenario-move-sprites.test.js`:

```js
describe('scenario move transparent grid slicer', () => {
  it('slices a transparent 3x3 grid into PNG and WebP icons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'grid.png');
    const manifestPath = join(root, 'manifest.json');
    const outputDir = join(root, 'actions');
    const slicedDir = join(root, 'sliced');

    const sharp = (await import('sharp')).default;
    const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      ${Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) * 100 + 30;
        const y = Math.floor(i / 3) * 100 + 30;
        return `<rect x="${x}" y="${y}" width="40" height="40" fill="rgba(${20 + i * 20},80,180,1)"/>`;
      }).join('')}
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(gridPath);

    const moves = Array.from({ length: 9 }, (_, index) => ({
      index,
      slug: `move-${index}`,
      filler: false,
    }));
    await writeFile(manifestPath, JSON.stringify({ jobs: [{ batchIndex: 0, moves }] }));

    const result = spawnSync('node', [
      'scripts/scenario-move-sprites/slice-transparent-grid.mjs',
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', outputDir,
      '--sliced', slicedDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    for (let i = 0; i < 9; i++) {
      const pngMeta = await sharp(join(slicedDir, `move-${i}.png`)).metadata();
      const webpMeta = await sharp(join(outputDir, `move-${i}.webp`)).metadata();
      assert.equal(pngMeta.width, 128);
      assert.equal(pngMeta.height, 128);
      assert.equal(pngMeta.hasAlpha, true);
      assert.equal(webpMeta.width, 128);
      assert.equal(webpMeta.height, 128);
      assert.equal(webpMeta.hasAlpha, true);
    }
  });

  it('refuses to slice an opaque grid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'opaque.png');
    const manifestPath = join(root, 'manifest.json');
    const sharp = (await import('sharp')).default;

    await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toFile(gridPath);
    await writeFile(manifestPath, JSON.stringify({
      jobs: [{ batchIndex: 0, moves: [{ index: 0, slug: 'opaque', filler: false }] }],
    }));

    const result = spawnSync('node', [
      'scripts/scenario-move-sprites/slice-transparent-grid.mjs',
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', join(root, 'actions'),
      '--sliced', join(root, 'sliced'),
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /grid has no transparent pixels/i);
  });

  it('refuses to overwrite existing action sprites without --overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'grid.png');
    const manifestPath = join(root, 'manifest.json');
    const outputDir = join(root, 'actions');
    const slicedDir = join(root, 'sliced');
    await mkdir(outputDir);
    await writeFile(join(outputDir, 'move-0.webp'), 'existing');

    const sharp = (await import('sharp')).default;
    const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="30" width="40" height="40" fill="red"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(gridPath);
    await writeFile(manifestPath, JSON.stringify({
      jobs: [{ batchIndex: 0, moves: [{ index: 0, slug: 'move-0', filler: false }] }],
    }));

    const result = spawnSync('node', [
      'scripts/scenario-move-sprites/slice-transparent-grid.mjs',
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', outputDir,
      '--sliced', slicedDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to overwrite existing action sprite: move-0/);
  });
});
```

- [ ] **Step 2: Run slicer tests and verify they fail**

Run:

```bash
node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: slicer tests fail because `slice-transparent-grid.mjs` does not exist.

- [ ] **Step 3: Create `slice-transparent-grid.mjs`**

Create `scripts/scenario-move-sprites/slice-transparent-grid.mjs`:

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ICON_SIZE = 128;
const MIN_GAP_WIDTH = 5;

function parseCli() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      batch: { type: 'string' },
      grid: { type: 'string' },
      out: { type: 'string' },
      sliced: { type: 'string' },
      overwrite: { type: 'boolean' },
    },
    strict: true,
  });

  for (const key of ['manifest', 'batch', 'grid', 'out', 'sliced']) {
    if (!values[key]) throw new Error(`Missing required --${key}`);
  }

  return {
    manifestPath: values.manifest,
    batchIndex: Number(values.batch),
    gridPath: values.grid,
    outDir: values.out,
    slicedDir: values.sliced,
    overwrite: values.overwrite || false,
  };
}

function alphaAt(alpha, width, x, y) {
  return alpha[y * width + x];
}

function rowProfile(alpha, width, height) {
  return Array.from({ length: height }, (_, y) => {
    let total = 0;
    for (let x = 0; x < width; x++) {
      if (alphaAt(alpha, width, x, y) > 0) total++;
    }
    return total;
  });
}

function colProfile(alpha, width, height) {
  return Array.from({ length: width }, (_, x) => {
    let total = 0;
    for (let y = 0; y < height; y++) {
      if (alphaAt(alpha, width, x, y) > 0) total++;
    }
    return total;
  });
}

function smooth(profile) {
  return profile.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const i = index + offset;
      if (i >= 0 && i < profile.length) {
        sum += profile[i];
        count++;
      }
    }
    return sum / count;
  });
}

function findGapSplits(profile, nSplits) {
  const smoothed = smooth(profile);
  const max = Math.max(...smoothed);
  const threshold = Math.max(max * 0.05, 1);
  const gaps = [];
  let inGap = false;
  let gapStart = 0;

  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < threshold && !inGap) {
      inGap = true;
      gapStart = i;
    } else if (smoothed[i] >= threshold && inGap) {
      inGap = false;
      const gapEnd = i;
      const mid = Math.floor((gapStart + gapEnd) / 2);
      if (mid > smoothed.length * 0.1 && mid < smoothed.length * 0.9 && gapEnd - gapStart >= MIN_GAP_WIDTH) {
        gaps.push({ start: gapStart, end: gapEnd, mid });
      }
    }
  }

  if (inGap) {
    const gapEnd = smoothed.length;
    const mid = Math.floor((gapStart + gapEnd) / 2);
    if (mid > smoothed.length * 0.1 && mid < smoothed.length * 0.9 && gapEnd - gapStart >= MIN_GAP_WIDTH) {
      gaps.push({ start: gapStart, end: gapEnd, mid });
    }
  }

  gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const splits = gaps.slice(0, nSplits).map(gap => gap.mid).sort((a, b) => a - b);
  if (splits.length < nSplits) {
    const step = Math.floor(smoothed.length / (nSplits + 1));
    return Array.from({ length: nSplits }, (_, i) => step * (i + 1));
  }
  return splits;
}

function findContentBounds(alpha, width, x1, y1, x2, y2) {
  let left = x2;
  let right = x1;
  let top = y2;
  let bottom = y1;

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      if (alphaAt(alpha, width, x, y) > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }

  if (left >= right || top >= bottom) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function getBatch(manifest, batchIndex) {
  const job = manifest.jobs?.find(item => item.batchIndex === batchIndex);
  if (!job) throw new Error(`Batch ${batchIndex} not found in manifest`);
  return job.moves || [];
}

async function main() {
  const opts = parseCli();
  const manifest = JSON.parse(await readFile(opts.manifestPath, 'utf8'));
  const moves = getBatch(manifest, opts.batchIndex).filter(move => !move.filler);

  const { data, info } = await sharp(opts.gridPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += info.channels, p++) {
    alpha[p] = data[i + 3];
  }

  const minAlpha = Math.min(...alpha);
  const maxAlpha = Math.max(...alpha);
  if (minAlpha === 255 || maxAlpha === 0) {
    throw new Error('Scenario transparent grid has no transparent pixels; refusing to slice');
  }

  const colSplits = findGapSplits(colProfile(alpha, info.width, info.height), 2);
  const rowSplits = findGapSplits(rowProfile(alpha, info.width, info.height), 2);
  const colBounds = [0, ...colSplits, info.width];
  const rowBounds = [0, ...rowSplits, info.height];

  await mkdir(opts.outDir, { recursive: true });
  await mkdir(opts.slicedDir, { recursive: true });

  const sliced = [];
  for (const move of moves) {
    const outWebp = `${opts.outDir}/${move.slug}.webp`;
    if (existsSync(outWebp) && !opts.overwrite) {
      throw new Error(`Refusing to overwrite existing action sprite: ${move.slug}`);
    }

    const r = Math.floor(move.index / 3);
    const c = move.index % 3;
    const bounds = findContentBounds(alpha, info.width, colBounds[c], rowBounds[r], colBounds[c + 1], rowBounds[r + 1]);
    if (!bounds) throw new Error(`${move.slug}: no alpha content found in cell`);

    const scale = Math.min((ICON_SIZE * 0.88) / bounds.width, (ICON_SIZE * 0.88) / bounds.height);
    const resizedWidth = Math.max(1, Math.round(bounds.width * scale));
    const resizedHeight = Math.max(1, Math.round(bounds.height * scale));
    const left = Math.floor((ICON_SIZE - resizedWidth) / 2);
    const top = Math.floor((ICON_SIZE - resizedHeight) / 2);

    const iconPng = await sharp(opts.gridPath)
      .ensureAlpha()
      .extract(bounds)
      .resize(resizedWidth, resizedHeight, { kernel: 'lanczos3' })
      .toBuffer();

    const pngBuffer = await sharp({
      create: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: iconPng, left, top }])
      .png()
      .toBuffer();

    const slicedPng = `${opts.slicedDir}/${move.slug}.png`;
    await writeFile(slicedPng, pngBuffer);
    await sharp(pngBuffer).webp({ quality: 90 }).toFile(outWebp);
    sliced.push({ slug: move.slug, png: slicedPng, webp: outWebp });
    console.log(`Wrote ${move.slug} -> ${outWebp}`);
  }

  manifest.jobs.find(item => item.batchIndex === opts.batchIndex).results.sliced = sliced;
  manifest.jobs.find(item => item.batchIndex === opts.batchIndex).results.savedAt = new Date().toISOString();
  await writeFile(opts.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run slicer tests and syntax checks**

Run:

```bash
node --check scripts/scenario-move-sprites/slice-transparent-grid.mjs && node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/scenario-move-sprites/slice-transparent-grid.mjs tests/unit/scripts/scenario-move-sprites.test.js
git commit -m "$(cat <<'EOF'
Add transparent Scenario grid slicer for move sprites

EOF
)"
```

## Task 4: Workflow Documentation

**Files:**
- Create: `scripts/scenario-move-sprites/README.md`

- [ ] **Step 1: Write the workflow README**

Create `scripts/scenario-move-sprites/README.md`:

```md
# Scenario move sprite workflow

Generate missing move sprites with Scenario MCP, using the same background-removal pattern as the ingredient icon workflow.

## Rules

- Generate 3x3 white-background grids.
- Use Scenario MCP for background removal with `model_photoroom-background-removal`.
- Do not use local RMBG, ComfyUI RMBG, BiRefNet, white color-keying, or magenta color-keying as a fallback.
- If any Scenario step fails, stop and report the exact tool error.
- Slice only transparent Scenario outputs by alpha channel.

## Build a manifest

List currently missing move sprites:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --list
```

Build a manifest for all missing move sprites:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs
```

Build a small pilot manifest:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --ids gnaw,impact,seal --run pilot
```

Manifests are written to:

```text
tmp/move-sprites-scenario/<runId>/manifest.json
```

## Agent MCP loop

For each job in the manifest:

1. Call `run_model` on `project-0-koto-dev-scenario`.
2. Use model `model_openai-gpt-image-2`.
3. Pass `job.parameters`.
4. Pass:

```json
{
  "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
  "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
  "wait": true
}
```

5. Save the white generated grid to `job.outputs.whiteGrid`.
6. Run `model_photoroom-background-removal` with only:

```json
{
  "image": "<white_grid_asset_id>"
}
```

Do not pass `backgroundColor`.

7. Download the transparent result to `job.outputs.transparentGrid`.
8. Update `manifest.json` with each Scenario job and asset ID as soon as it is known.

If the grid was generated outside Scenario, upload it first with `upload_asset`, PUT the file bytes to the presigned URL, then call `complete_upload`. This is the same path used by the ingredient icon workflow.

## Slice a transparent grid

```bash
node scripts/scenario-move-sprites/slice-transparent-grid.mjs \
  --manifest tmp/move-sprites-scenario/<runId>/manifest.json \
  --batch 0 \
  --grid tmp/move-sprites-scenario/<runId>/batch-0-transparent.png \
  --out public/assets/sprites/actions \
  --sliced tmp/move-sprites-scenario/<runId>/sliced
```

Use `--overwrite` only when intentionally regenerating existing action sprites.

## Verify

```bash
node --check scripts/scenario-move-sprites/prompts.mjs
node --check scripts/scenario-move-sprites/build-jobs.mjs
node --check scripts/scenario-move-sprites/slice-transparent-grid.mjs
node --test tests/unit/scripts/scenario-move-sprites.test.js
```
```

- [ ] **Step 2: Verify README has no local fallback instructions**

Run:

```bash
rg "RMBG|BiRefNet|color-key|fallback" scripts/scenario-move-sprites/README.md
```

Expected: matches only the prohibition lines, not any instruction to run local background removal.

- [ ] **Step 3: Commit Task 4**

```bash
git add scripts/scenario-move-sprites/README.md
git commit -m "$(cat <<'EOF'
Document Scenario move sprite workflow

EOF
)"
```

## Task 5: Pilot Dry Run And Verification

**Files:**
- Runtime output only under `tmp/move-sprites-scenario/`
- Final action sprites only if the user explicitly approves running Scenario and promoting pilot outputs.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
node --check scripts/scenario-move-sprites/prompts.mjs && \
node --check scripts/scenario-move-sprites/build-jobs.mjs && \
node --check scripts/scenario-move-sprites/slice-transparent-grid.mjs && \
node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: syntax checks pass and the unit test file passes.

- [ ] **Step 2: Build a pilot manifest**

Run:

```bash
node scripts/scenario-move-sprites/build-jobs.mjs --ids gnaw,impact,seal --run pilot
```

Expected: writes `tmp/move-sprites-scenario/pilot/manifest.json` with one job and three non-filler moves.

- [ ] **Step 3: Review the pilot manifest**

Run:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('tmp/move-sprites-scenario/pilot/manifest.json', 'utf8'));
console.log(JSON.stringify({
  runId: manifest.runId,
  jobs: manifest.jobs.length,
  realMoves: manifest.jobs[0].moves.filter(move => !move.filler).map(move => move.slug),
  modelId: manifest.modelId,
  backgroundRemovalModelId: manifest.backgroundRemovalModelId,
}, null, 2));
NODE
```

Expected: prints `gnaw`, `impact`, and `seal`, plus the two Scenario model IDs.

- [ ] **Step 4: Stop for Scenario execution approval**

Before calling Scenario MCP, ask the user:

```text
Pilot manifest is ready. Do you want me to run the Scenario MCP generation and Photoroom removal for this pilot batch now?
```

Expected: no MCP calls happen until the user approves.

- [ ] **Step 5: If approved, run Scenario MCP generation**

Before every MCP call, read the current tool descriptor files for the Scenario server. Then call `run_model` with the manifest's first job:

```json
{
  "server": "project-0-koto-dev-scenario",
  "toolName": "run_model",
  "arguments": {
    "model_id": "model_openai-gpt-image-2",
    "parameters": "<manifest.jobs[0].parameters>",
    "wait": true,
    "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
    "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
    "response_format": "json"
  }
}
```

Expected: Scenario returns one generated white grid asset. Save it to `tmp/move-sprites-scenario/pilot/batch-0-white.png` and update the manifest with the generation job and asset ID.

- [ ] **Step 6: If approved, run Scenario Photoroom**

Call `run_model`:

```json
{
  "server": "project-0-koto-dev-scenario",
  "toolName": "run_model",
  "arguments": {
    "model_id": "model_photoroom-background-removal",
    "parameters": {
      "image": "<white_grid_asset_id>"
    },
    "wait": true,
    "team_id": "team_g8yJ6jYJtWj44Um1NrmzYiLC",
    "project_id": "proj_ZjnKxmdyxtHXaF13xPGsXjWZ",
    "response_format": "json"
  }
}
```

Expected: Scenario returns a transparent grid asset. Download it to `tmp/move-sprites-scenario/pilot/batch-0-transparent.png` and update the manifest.

- [ ] **Step 7: Verify transparent grid alpha**

Run:

```bash
node --input-type=module - <<'NODE'
import sharp from 'sharp';
const meta = await sharp('tmp/move-sprites-scenario/pilot/batch-0-transparent.png').metadata();
console.log(JSON.stringify({ format: meta.format, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha }, null, 2));
if (!meta.hasAlpha) process.exit(1);
NODE
```

Expected: `hasAlpha` is `true`.

- [ ] **Step 8: Slice pilot outputs only after visual approval**

Ask the user to review the transparent grid first. If approved, run:

```bash
node scripts/scenario-move-sprites/slice-transparent-grid.mjs \
  --manifest tmp/move-sprites-scenario/pilot/manifest.json \
  --batch 0 \
  --grid tmp/move-sprites-scenario/pilot/batch-0-transparent.png \
  --out public/assets/sprites/actions \
  --sliced tmp/move-sprites-scenario/pilot/sliced
```

Expected: writes WebPs for the non-filler pilot moves and transparent PNG intermediates.

- [ ] **Step 9: Verify final pilot WebPs**

Run:

```bash
node --input-type=module - <<'NODE'
import sharp from 'sharp';
for (const slug of ['gnaw', 'impact', 'seal']) {
  const meta = await sharp(`public/assets/sprites/actions/${slug}.webp`).metadata();
  console.log(JSON.stringify({ slug, format: meta.format, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha }));
  if (meta.width !== 128 || meta.height !== 128 || !meta.hasAlpha) process.exit(1);
}
NODE
```

Expected: each icon is `webp`, `128x128`, and has alpha.

- [ ] **Step 10: Commit Task 5 only if pilot assets are intentionally promoted**

If the user approves keeping pilot assets:

```bash
git add tmp/move-sprites-scenario/pilot/manifest.json public/assets/sprites/actions/gnaw.webp public/assets/sprites/actions/impact.webp public/assets/sprites/actions/seal.webp
git commit -m "$(cat <<'EOF'
Add pilot Scenario move sprites

EOF
)"
```

If `tmp/` is gitignored, do not force-add it. Instead commit only approved runtime assets and leave the manifest as a local audit artifact unless the user asks to preserve it elsewhere.

## Final Verification

- [ ] **Step 1: Run all new tests**

```bash
node --test tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax checks**

```bash
node --check scripts/scenario-move-sprites/prompts.mjs && \
node --check scripts/scenario-move-sprites/build-jobs.mjs && \
node --check scripts/scenario-move-sprites/slice-transparent-grid.mjs
```

Expected: all syntax checks pass.

- [ ] **Step 3: Check lints for edited files**

Use Cursor `ReadLints` for:

```text
scripts/scenario-move-sprites/prompts.mjs
scripts/scenario-move-sprites/build-jobs.mjs
scripts/scenario-move-sprites/slice-transparent-grid.mjs
tests/unit/scripts/scenario-move-sprites.test.js
```

Expected: no new linter errors.

- [ ] **Step 4: Review git status**

```bash
git status --short
```

Expected: only intended files are modified or untracked.

## Self-Review Notes

- Spec coverage: The plan covers manifest building, white-grid prompts, Scenario Photoroom-only background removal, alpha slicing, overwrite safety, metadata preservation, tests, README, and pilot execution.
- Placeholder scan: No placeholder markers or vague implementation steps are present.
- Type consistency: The manifest fields used by `build-jobs.mjs` and `slice-transparent-grid.mjs` match: `jobs[].batchIndex`, `jobs[].moves[]`, `moves[].index`, `moves[].slug`, `moves[].filler`, `jobs[].outputs`, `jobs[].scenario`, and `jobs[].results`.
