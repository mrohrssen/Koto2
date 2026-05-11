# Scene-Area Creature Idle/Walk Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and wire idle/walk sprite-sheet animations for `neko`, `hi`, and `ishi` in Pixi scene-area creature rendering, with static sprite fallback for every creature without animation assets.

**Architecture:** Build a pilot asset pipeline that uses Scenario Seedance 2.0 videos, converts them into verified transparent 24-frame sheets, and promotes only successful assets into `public/assets/sprites/creatures-animated/`. Add a manifest-driven Pixi runtime layer that swaps between `idle` and `walk` based on the existing `formation.walkingEnabled` signal, applies a global `1.85` render scale for animated sheets, and leaves all non-scene UI sprite rendering unchanged.

**Tech Stack:** Scenario MCP (`model_bytedance-seedance-2-0`, `model_photoroom-background-removal`), `ffmpeg-static`, Python/Pillow, PixiJS, ES modules, Node test runner.

---

## File Structure

### Runtime Assets

- Create: `public/assets/sprites/creatures-animated/manifest.json`
- Create: `public/assets/sprites/creatures-animated/neko/idle.png`
- Create: `public/assets/sprites/creatures-animated/neko/walk.png`
- Create: `public/assets/sprites/creatures-animated/neko/metadata.json`
- Create: `public/assets/sprites/creatures-animated/hi/idle.png`
- Create: `public/assets/sprites/creatures-animated/hi/walk.png`
- Create: `public/assets/sprites/creatures-animated/hi/metadata.json`
- Create: `public/assets/sprites/creatures-animated/ishi/idle.png`
- Create: `public/assets/sprites/creatures-animated/ishi/walk.png`
- Create: `public/assets/sprites/creatures-animated/ishi/metadata.json`

### Generated Intermediates

- Create under gitignored `output/creature-animations/`.
- Store raw Scenario videos, decoded frames, RGB source sheets, cleaned sheets, per-creature reports, and a batch summary there.
- Do not store intermediate generation artifacts under `public/assets`.

### Runtime Code

- Create: `public/js/pixi/creature-animation-manifest.js`
- Create: `public/js/pixi/animated-creature-sprite.js`
- Modify: `public/js/pixi/formation.js`
- Modify: `public/js/scenes/hub-scene.js`

### Tests

- Create: `tests/unit/pixi/creature-animation-manifest.test.js`
- Create: `tests/unit/pixi/animated-creature-sprite.test.js`
- Modify or add formation tests if an existing Pixi formation test file is present.

## Task 1: Generate Pilot Animation Assets

**Files:**
- Read: `/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures/neko.png`
- Read: `/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures/hi.png`
- Read: `/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures/ishi.png`
- Create: `output/creature-animations/<id>/<kind>/source-video.mp4`
- Create: `output/creature-animations/<id>/<kind>/sheet-256.png`
- Create: `output/creature-animations/<id>/metadata.json`

- [ ] **Step 1: Verify pilot white-background sources**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image

root = Path("/Users/michiarohrssen/Documents/Claude/koto-wt-sprite-white-bg/output/sprite-white-bg/creatures")
for creature_id in ["neko", "hi", "ishi"]:
    path = root / f"{creature_id}.png"
    if not path.exists():
        raise SystemExit(f"missing {path}")
    image = Image.open(path)
    if image.size != (480, 480):
        raise SystemExit(f"{path} expected 480x480, got {image.size}")
    print(creature_id, image.mode, image.size)
PY
```

Expected: all three source images exist and are `480x480`.

- [ ] **Step 2: Generate two Seedance videos per creature**

Use Scenario MCP with model `model_bytedance-seedance-2-0`. First upload each white-background source with `upload_asset`. For each creature and animation kind, call `run_model`:

```json
{
  "model_id": "model_bytedance-seedance-2-0",
  "parameters": {
    "prompt": "<idle or walk prompt>",
    "image": "<uploaded source asset id>",
    "lastFrameImage": "<same uploaded source asset id>",
    "duration": 4,
    "resolution": "480p",
    "aspectRatio": "adaptive",
    "generateAudio": false
  },
  "wait": true
}
```

Idle prompt:

```text
idle animation for a monster collector game on a plain white background - no shadows or additional details
```

Walk prompt:

```text
walking animation for a monster collector game on a plain white background - no shadows or additional details
```

Download each resulting video to:

```text
output/creature-animations/<id>/<kind>/source-video.mp4
```

Expected: six MP4 files, two per pilot creature.

- [ ] **Step 3: Convert each video to a verified transparent sheet**

For each `<id>/<kind>/source-video.mp4`:

1. Decode frames with `ffmpeg`.
2. Drop the final duplicate loop endpoint.
3. Sample every fourth frame from the 96-frame source loop.
4. Use the full `640x640` or decoded square source frame as the shared source cell for that creature's `idle` and `walk`.
5. Pack a `6x4` sheet as an `RGB` PNG.
6. Run Scenario `model_photoroom-background-removal`.
7. Verify `transparentPct > 50` and `opaqueWhitePct < 1`.
8. Slice the cleaned sheet proportionally if Scenario resized it.
9. Build a final `1536x1024` sheet with `256x256` cells.

Use this local processing shape:

```python
from pathlib import Path
from PIL import Image
import numpy as np

def verify_alpha(path):
    image = Image.open(path).convert("RGBA")
    arr = np.array(image)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    transparent_pct = 100 * (alpha < 10).sum() / alpha.size
    opaque_white_pct = 100 * (((rgb > 245).all(axis=2)) & (alpha > 245)).sum() / alpha.size
    if transparent_pct <= 50 or opaque_white_pct >= 1:
        raise ValueError(f"{path} failed alpha verification: transparent={transparent_pct}, white={opaque_white_pct}")
    return {"transparentPct": round(transparent_pct, 2), "opaqueWhitePct": round(opaque_white_pct, 2)}
```

Expected: six final sheets with real transparency and no opaque white cells.

## Task 2: Promote Pilot Assets To Public Runtime Folder

**Files:**
- Create: `public/assets/sprites/creatures-animated/manifest.json`
- Create: `public/assets/sprites/creatures-animated/<id>/idle.png`
- Create: `public/assets/sprites/creatures-animated/<id>/walk.png`
- Create: `public/assets/sprites/creatures-animated/<id>/metadata.json`

- [ ] **Step 1: Copy verified final sheets**

Copy:

```text
output/creature-animations/neko/idle/sheet-256.png -> public/assets/sprites/creatures-animated/neko/idle.png
output/creature-animations/neko/walk/sheet-256.png -> public/assets/sprites/creatures-animated/neko/walk.png
output/creature-animations/hi/idle/sheet-256.png -> public/assets/sprites/creatures-animated/hi/idle.png
output/creature-animations/hi/walk/sheet-256.png -> public/assets/sprites/creatures-animated/hi/walk.png
output/creature-animations/ishi/idle/sheet-256.png -> public/assets/sprites/creatures-animated/ishi/idle.png
output/creature-animations/ishi/walk/sheet-256.png -> public/assets/sprites/creatures-animated/ishi/walk.png
```

Expected: all six runtime sheets exist.

- [ ] **Step 2: Write runtime manifest**

Create `public/assets/sprites/creatures-animated/manifest.json`:

```json
{
  "version": "20260511",
  "frameWidth": 256,
  "frameHeight": 256,
  "columns": 6,
  "frames": 24,
  "fps": 12,
  "renderScale": 1.85,
  "animations": {
    "neko": {
      "idle": "/assets/sprites/creatures-animated/neko/idle.png?v=20260511",
      "walk": "/assets/sprites/creatures-animated/neko/walk.png?v=20260511"
    },
    "hi": {
      "idle": "/assets/sprites/creatures-animated/hi/idle.png?v=20260511",
      "walk": "/assets/sprites/creatures-animated/hi/walk.png?v=20260511"
    },
    "ishi": {
      "idle": "/assets/sprites/creatures-animated/ishi/idle.png?v=20260511",
      "walk": "/assets/sprites/creatures-animated/ishi/walk.png?v=20260511"
    }
  }
}
```

Expected: only verified pilot creatures appear in the manifest.

## Task 3: Add Runtime Manifest Loader

**Files:**
- Create: `public/js/pixi/creature-animation-manifest.js`
- Test: `tests/unit/pixi/creature-animation-manifest.test.js`

- [ ] **Step 1: Write manifest unit tests**

Create tests that verify:

- missing manifest returns no animation
- manifest entry lookup returns `idle`, `walk`, and global metadata
- missing creature id returns null

Test shape:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAnimatedCreatureEntry,
  normalizeAnimationManifest,
} from '../../../public/js/pixi/creature-animation-manifest.js';

test('getAnimatedCreatureEntry returns null when creature is absent', () => {
  const manifest = normalizeAnimationManifest({
    version: 'test',
    frameWidth: 256,
    frameHeight: 256,
    columns: 6,
    frames: 24,
    fps: 12,
    renderScale: 1.85,
    animations: {},
  });

  assert.equal(getAnimatedCreatureEntry(manifest, 'missing'), null);
});
```

- [ ] **Step 2: Implement loader**

Create `public/js/pixi/creature-animation-manifest.js`:

```js
const MANIFEST_PATH = '/assets/sprites/creatures-animated/manifest.json';

let manifestPromise = null;

export function normalizeAnimationManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    version: raw.version || '',
    frameWidth: Number(raw.frameWidth) || 256,
    frameHeight: Number(raw.frameHeight) || 256,
    columns: Number(raw.columns) || 6,
    frames: Number(raw.frames) || 24,
    fps: Number(raw.fps) || 12,
    renderScale: Number(raw.renderScale) || 1,
    animations: raw.animations && typeof raw.animations === 'object' ? raw.animations : {},
  };
}

export async function loadCreatureAnimationManifest(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAnimationManifest)
      .catch(() => null);
  }
  return manifestPromise;
}

export function resetCreatureAnimationManifestForTests() {
  manifestPromise = null;
}

export function getAnimatedCreatureEntry(manifest, creatureId) {
  if (!manifest?.animations || !creatureId) return null;
  const entry = manifest.animations[creatureId];
  if (!entry?.idle && !entry?.walk) return null;
  return {
    ...entry,
    frameWidth: manifest.frameWidth,
    frameHeight: manifest.frameHeight,
    columns: manifest.columns,
    frames: manifest.frames,
    fps: manifest.fps,
    renderScale: manifest.renderScale,
  };
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test:unit -- tests/unit/pixi/creature-animation-manifest.test.js
```

Expected: tests pass.

## Task 4: Add Animated Pixi Sprite Sheet Support

**Files:**
- Create: `public/js/pixi/animated-creature-sprite.js`
- Test: `tests/unit/pixi/animated-creature-sprite.test.js`

- [ ] **Step 1: Write pure helper tests**

Test frame math without requiring Pixi rendering:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frameRectForIndex,
  nextAnimationFrame,
  chooseAnimationKind,
} from '../../../public/js/pixi/animated-creature-sprite.js';

test('frameRectForIndex maps frame index into 6-column sheet', () => {
  assert.deepEqual(frameRectForIndex(7, { frameWidth: 256, frameHeight: 256, columns: 6 }), {
    x: 256,
    y: 256,
    width: 256,
    height: 256,
  });
});

test('chooseAnimationKind walks only when walking is enabled and walk exists', () => {
  assert.equal(chooseAnimationKind({ idle: 'idle.png', walk: 'walk.png' }, true), 'walk');
  assert.equal(chooseAnimationKind({ idle: 'idle.png' }, true), 'idle');
  assert.equal(chooseAnimationKind({ idle: 'idle.png', walk: 'walk.png' }, false), 'idle');
});
```

- [ ] **Step 2: Implement helper and Pixi runtime API**

Create `public/js/pixi/animated-creature-sprite.js` with pure helpers plus Pixi-specific functions:

```js
import { Rectangle, Texture } from 'pixi.js';
import { loadImageTexture } from './image-loader.js';

export function frameRectForIndex(index, { frameWidth, frameHeight, columns }) {
  return {
    x: (index % columns) * frameWidth,
    y: Math.floor(index / columns) * frameHeight,
    width: frameWidth,
    height: frameHeight,
  };
}

export function nextAnimationFrame(state, deltaMS) {
  const frameDuration = 1000 / state.fps;
  state.elapsedMs = (state.elapsedMs || 0) + deltaMS;
  while (state.elapsedMs >= frameDuration) {
    state.elapsedMs -= frameDuration;
    state.frameIndex = (state.frameIndex + 1) % state.frames;
  }
  return state.frameIndex;
}

export function chooseAnimationKind(entry, walkingEnabled) {
  if (walkingEnabled && entry?.walk) return 'walk';
  if (entry?.idle) return 'idle';
  if (entry?.walk) return 'walk';
  return null;
}

export async function createAnimatedCreatureState(entry) {
  const textures = {};
  for (const kind of ['idle', 'walk']) {
    if (!entry[kind]) continue;
    const sheetTexture = await loadImageTexture(entry[kind]);
    textures[kind] = Array.from({ length: entry.frames }, (_, index) => {
      const rect = frameRectForIndex(index, entry);
      return new Texture({
        source: sheetTexture.source,
        frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
      });
    });
  }

  return {
    entry,
    textures,
    kind: null,
    frameIndex: 0,
    elapsedMs: 0,
    fps: entry.fps,
    frames: entry.frames,
  };
}

export function applyAnimationKind(sprite, state, kind) {
  if (!kind || state.kind === kind || !state.textures[kind]?.length) return;
  state.kind = kind;
  state.frameIndex = 0;
  state.elapsedMs = 0;
  sprite.texture = state.textures[kind][0];
}

export function tickAnimatedCreatureSprite(sprite, state, deltaMS, walkingEnabled) {
  const kind = chooseAnimationKind(state.entry, walkingEnabled);
  applyAnimationKind(sprite, state, kind);
  if (!state.kind) return;
  const frameIndex = nextAnimationFrame(state, deltaMS);
  sprite.texture = state.textures[state.kind][frameIndex];
}
```

- [ ] **Step 3: Run tests and syntax check**

Run:

```bash
node --check public/js/pixi/animated-creature-sprite.js
npm run test:unit -- tests/unit/pixi/animated-creature-sprite.test.js
```

Expected: syntax and tests pass.

## Task 5: Wire Animated Sheets Into Formation Rendering

**Files:**
- Modify: `public/js/pixi/formation.js`
- Test: formation test if present; otherwise rely on helper tests plus focused syntax.

- [ ] **Step 1: Import animation helpers**

Modify imports in `public/js/pixi/formation.js`:

```js
import {
  getAnimatedCreatureEntry,
  loadCreatureAnimationManifest,
} from './creature-animation-manifest.js';
import {
  createAnimatedCreatureState,
  tickAnimatedCreatureSprite,
} from './animated-creature-sprite.js';
```

- [ ] **Step 2: Add animated state on spawn**

Inside `spawnFormationSprite`, after creating the `Sprite` and before applying scale, attempt:

```js
let animatedState = null;
try {
  const manifest = await loadCreatureAnimationManifest();
  const entry = getAnimatedCreatureEntry(manifest, creature.id);
  if (entry) {
    animatedState = await createAnimatedCreatureState(entry);
    if (animatedState.textures.idle?.[0] || animatedState.textures.walk?.[0]) {
      sprite.texture = animatedState.textures.idle?.[0] || animatedState.textures.walk[0];
      sprite._animatedCreature = animatedState;
      sprite._animatedRenderScale = entry.renderScale || 1;
    }
  }
} catch (err) {
  console.warn('[formation] animated creature setup failed; using static sprite', creature.id, err);
}
```

Keep the current static texture fallback intact.

- [ ] **Step 3: Apply global animated render scale**

When computing scale, multiply only animated sprites:

```js
const animationScale = sprite._animatedRenderScale || 1;
sprite.scale.set(getBattlefieldSpriteScale(slotI) * animationScale * (spriteSize / sprite.texture.width));
```

Apply the same scale formula in `updateFormationSprite`.

- [ ] **Step 4: Replace wobble for animated sprites**

In `_updateFormations(ctx, delta)`, use `deltaMS` if available or approximate from `delta`:

```js
const deltaMS = typeof delta === 'number' ? delta * 16.6667 : 16.6667;
```

For each sprite:

```js
if (sprite._animatedCreature) {
  tickAnimatedCreatureSprite(sprite, sprite._animatedCreature, deltaMS, !!ctx.walkingEnabled);
  sprite.y = sprite.baseY;
  sprite.rotation = 0;
  continue;
}
```

Only static sprites should use the old sine wobble.

- [ ] **Step 5: Run syntax and tests**

Run:

```bash
node --check public/js/pixi/formation.js
npm run test:unit -- tests/unit/pixi/creature-animation-manifest.test.js tests/unit/pixi/animated-creature-sprite.test.js
```

Expected: syntax and tests pass.

## Task 6: Make HubScene Idle-Only

**Files:**
- Modify: `public/js/scenes/hub-scene.js`

- [ ] **Step 1: Stop forcing walking in HubScene**

Change:

```js
this.formation.walkingEnabled = true;
```

to:

```js
this.formation.walkingEnabled = false;
```

Keep `_updateFormations(this.formation, dt)` so idle animation frames still advance.

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check public/js/scenes/hub-scene.js
```

Expected: syntax passes.

## Task 7: Visual Verification

**Files:**
- Read: `docs/playtest-guide.md`
- Use existing game UI through Vite dev server.

- [ ] **Step 1: Start or reuse dev server**

Run:

```bash
npm run dev
```

Then verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 2: Ask before opening browser**

Because project rules say not to launch Playwright without asking, ask the user before browser MCP verification.

- [ ] **Step 3: Verify in game**

After user approval:

- Enter a scene with `neko`, `hi`, or `ishi` in active party.
- Confirm standing/exploration idle uses the idle sheet.
- Trigger room transition.
- Confirm room travel uses the walk sheet.
- Enter combat.
- Confirm creature idles while normal combat VFX/particles/movement still work.
- Confirm non-pilot creatures render static.
- Temporarily remove one pilot entry from manifest and confirm static fallback.

Expected: visual screenshots show correct idle/walk behavior in real scene-area scale.

## Self-Review

- Spec coverage: pilot IDs, idle/walk only, Scenario model/settings, RGB pre-removal rule, static fallback, global `1.85` scale, HubScene idle behavior, and Pixi-only runtime are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: manifest fields match runtime helper names; frame dimensions and FPS match generated asset requirements.
