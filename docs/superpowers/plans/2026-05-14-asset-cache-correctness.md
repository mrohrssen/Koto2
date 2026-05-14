# Asset Cache Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Koto asset loading use canonical versioned URLs, share image load identity across DOM/Pixi consumers, and add measured, conservative warmup behavior for Capacitor iOS.

**Architecture:** Add a small asset subsystem under `public/js/assets/` plus a runtime-neutral version source under `src/shared/`. Migrate existing callers from inline `/assets/...?...` strings to canonical helpers, then add manifest-backed discovery, a shared image/texture loader, diagnostics, and a capped preload scheduler.

**Tech Stack:** ES modules, Vite root `public/`, Express static assets, PixiJS v8, Node test runner with `node:test` and module mocks.

---

## Spec

Implement `docs/superpowers/specs/2026-05-14-asset-cache-correctness-design.md`.

## File Structure

- Create `src/shared/asset-versions.js`: runtime-neutral asset version constants used by server and client modules.
- Create `public/js/assets/asset-urls.js`: canonical URL and slug helpers for sprites, backgrounds, and audio.
- Create `public/js/assets/asset-loader.js`: decoded image promise cache plus Pixi texture cache.
- Create `public/js/assets/asset-manifest.js`: client loader/cache for `public/assets/asset-manifest.json`.
- Create `public/js/assets/asset-preloader.js`: priority queue and concurrency control for background warmup.
- Create `public/js/assets/asset-diagnostics.js`: debug-only stats collection behind `__ASSET_DIAGNOSTICS__`.
- Create `scripts/generate-asset-manifest.js`: scans checked-in asset files and writes `public/assets/asset-manifest.json`.
- Modify asset consumers in `public/js/ui/`, `public/js/pixi/`, `public/js/audio.js`, `public/game.js`, and `src/routes/game/run.js`.
- Add focused tests under `tests/unit/assets/`, plus targeted updates to existing Pixi/UI tests.

## Task 1: Canonical Asset URL Helpers

**Files:**
- Create: `src/shared/asset-versions.js`
- Create: `public/js/assets/asset-urls.js`
- Create: `tests/unit/assets/asset-urls.test.js`

- [ ] **Step 1: Write the failing URL-helper tests**

Create `tests/unit/assets/asset-urls.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPRITE_VERSION,
  BACKGROUND_VERSION,
  AUDIO_VERSION,
} from '../../../src/shared/asset-versions.js';
import {
  actionIconSlug,
  actionIconUrl,
  backgroundLayerUrl,
  bgmUrl,
  creatureIdleUrl,
  creatureStaticUrl,
  itemSpriteUrl,
  npcSpriteUrl,
  sfxUrl,
} from '../../../public/js/assets/asset-urls.js';

describe('asset URL helpers', () => {
  it('builds canonical creature, npc, and item sprite URLs', () => {
    assert.equal(creatureStaticUrl('inu'), `/assets/sprites/creatures/inu.webp?v=${SPRITE_VERSION}`);
    assert.equal(creatureIdleUrl('inu'), `/assets/sprites/creatures/inu-idle.webp?v=${SPRITE_VERSION}`);
    assert.equal(npcSpriteUrl('cid'), `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`);
    assert.equal(itemSpriteUrl('rice-ball'), `/assets/sprites/items/rice-ball.webp?v=${SPRITE_VERSION}`);
  });

  it('keeps action icon slugging consistent across callers', () => {
    assert.equal(actionIconSlug('Fire Slash; 火の斬り'), 'fire-slash');
    assert.equal(actionIconUrl('Fire Slash; 火の斬り'), `/assets/sprites/actions/fire-slash.webp?v=${SPRITE_VERSION}`);
  });

  it('uses background and audio versions for those domains', () => {
    assert.equal(backgroundLayerUrl('starter_meadow', 'sky'), `/assets/backgrounds/starter_meadow/sky.webp?v=${BACKGROUND_VERSION}`);
    assert.equal(sfxUrl('attack'), `/assets/audio/sfx/attack.mp3?v=${AUDIO_VERSION}`);
    assert.equal(bgmUrl('battle'), `/assets/audio/bgm/battle.mp3?v=${AUDIO_VERSION}`);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/unit/assets/asset-urls.test.js
```

Expected: FAIL with module-not-found errors for `asset-versions.js` and `asset-urls.js`.

- [ ] **Step 3: Add the runtime-neutral version source**

Create `src/shared/asset-versions.js`:

```js
export const SPRITE_VERSION = '20260508-campfire-entry-npc';
export const BACKGROUND_VERSION = '20260508';
export const AUDIO_VERSION = '20260212';
```

- [ ] **Step 4: Add the canonical URL helpers**

Create `public/js/assets/asset-urls.js`:

```js
import {
  SPRITE_VERSION,
  BACKGROUND_VERSION,
  AUDIO_VERSION,
} from '../../../src/shared/asset-versions.js';

export { SPRITE_VERSION, BACKGROUND_VERSION, AUDIO_VERSION };

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

export function withVersion(path, version) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}v=${version}`;
}

export function actionIconSlug(nameEn = '') {
  return String(nameEn)
    .split(';')[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function creatureStaticUrl(id) {
  return withVersion(`/assets/sprites/creatures/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function creatureIdleUrl(id) {
  return withVersion(`/assets/sprites/creatures/${encodePathSegment(id)}-idle.webp`, SPRITE_VERSION);
}

export function npcSpriteUrl(id) {
  return withVersion(`/assets/sprites/npcs/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function itemSpriteUrl(id) {
  return withVersion(`/assets/sprites/items/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function actionIconUrl(nameEn) {
  const slug = actionIconSlug(nameEn);
  return slug ? withVersion(`/assets/sprites/actions/${slug}.webp`, SPRITE_VERSION) : '';
}

export function backgroundLayerUrl(areaId, layerName) {
  return withVersion(`/assets/backgrounds/${encodePathSegment(areaId)}/${encodePathSegment(layerName)}.webp`, BACKGROUND_VERSION);
}

export function sfxUrl(name) {
  return withVersion(`/assets/audio/sfx/${encodePathSegment(name)}.mp3`, AUDIO_VERSION);
}

export function bgmUrl(track) {
  return withVersion(`/assets/audio/bgm/${encodePathSegment(track)}.mp3`, AUDIO_VERSION);
}
```

- [ ] **Step 5: Verify the helper tests pass**

Run:

```bash
node --test tests/unit/assets/asset-urls.test.js
```

Expected: PASS.

- [ ] **Step 6: Verify Vite can import the shared version module**

Run:

```bash
npm run build
```

Expected: PASS. If Vite blocks imports outside `public/`, add this to `vite.config.js` and rerun:

```js
server: {
  fs: { allow: ['..'] },
  host: true,
  port: 5173,
  proxy: {
    '/api': 'http://localhost:3000',
    '/assets': 'http://localhost:3000',
    '/sw.js': 'http://localhost:3000',
    '/manifest.json': 'http://localhost:3000',
    '/dev-safe-area.css': 'http://localhost:3000'
  }
}
```

- [ ] **Step 7: Commit Task 1**

```bash
git add src/shared/asset-versions.js public/js/assets/asset-urls.js tests/unit/assets/asset-urls.test.js vite.config.js
git commit -m "Add canonical asset URL helpers"
```

If `vite.config.js` was not changed, omit it from `git add`.

## Task 2: Migrate Existing URL Construction

**Files:**
- Modify: `public/js/ui/sprite-utils.js`
- Modify: `public/js/pixi/parallax.js`
- Modify: `public/js/audio.js`
- Modify: `public/js/ui/attack-card.js`
- Modify: `public/js/ui/move-select.js`
- Modify: `public/js/ui/combat-dom.js`
- Modify: `public/js/ui/room-transition.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/exploration-dom.js`
- Modify: `public/js/ui/befriend.js`
- Modify: `public/js/ui/campfire.js`
- Test: `tests/unit/assets/asset-urls.test.js`
- Test: existing affected tests

- [ ] **Step 1: Extend URL helper tests for legacy inline values**

Add this test to `tests/unit/assets/asset-urls.test.js`:

```js
it('does not expose the retired hard-coded action icon version', () => {
  assert.equal(actionIconUrl('Slash').includes('20260322'), false);
});
```

- [ ] **Step 2: Run the helper test**

Run:

```bash
node --test tests/unit/assets/asset-urls.test.js
```

Expected: PASS. This guards the helper; the source migration is verified by grep in the following source-check step.

- [ ] **Step 3: Migrate `sprite-utils.js`**

Replace its local `SPRITE_VERSION` and path concatenation with imports:

```js
import {
  SPRITE_VERSION,
  creatureIdleUrl,
  creatureStaticUrl,
  itemSpriteUrl,
} from '../assets/asset-urls.js';

export { SPRITE_VERSION };
```

Then update:

```js
export function creatureSpritePath(id) {
  if (_noIdle.has(id)) return creatureStaticUrl(id);
  return creatureIdleUrl(id);
}

export function creatureStaticPath(id) {
  return creatureStaticUrl(id);
}

export function itemSpriteHtml(id, word) {
  const src = itemSpriteUrl(id);
  const fallbackWord = (word || '？').replace(/"/g, '&quot;');
  return `<img class="shop-item-sprite-img" src="${src}" alt="${fallbackWord}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML='<div class=\\'text-sprite shop-item-sprite\\'>${fallbackWord}</div>'">`;
}
```

Keep `probeIdleSprites()` behavior unchanged in this task, but change its URL to `creatureIdleUrl(id)`.

- [ ] **Step 4: Migrate Pixi/background/audio modules**

In `public/js/pixi/parallax.js`, replace the local `BACKGROUND_VERSION` with:

```js
import { backgroundLayerUrl, BACKGROUND_VERSION } from '../assets/asset-urls.js';
export { BACKGROUND_VERSION };
```

Use:

```js
const path = backgroundLayerUrl(areaId, name);
```

In `public/js/audio.js`, import:

```js
import { sfxUrl, bgmUrl } from './assets/asset-urls.js';
```

Use:

```js
const response = await fetch(sfxUrl(name));
const src = bgmUrl(track);
```

- [ ] **Step 5: Migrate action icon callers**

In `public/js/ui/attack-card.js`, import `actionIconUrl` and remove the private versioned path builder:

```js
import { actionIconUrl, npcSpriteUrl } from '../assets/asset-urls.js';
```

Use:

```js
const moveIcon = actionIconUrl(atk.attackerSkillEn || atk.moveNameEn);
```

Replace `npcSpritePath()` body with:

```js
function npcSpritePath(npcId) {
  return npcSpriteUrl(npcId);
}
```

In `public/js/ui/move-select.js`, import `actionIconUrl` and replace the `<img>` source:

```js
import { actionIconUrl } from '../assets/asset-urls.js';
```

```js
const iconUrl = actionIconUrl(move.nameEn);
```

```js
<img src="${iconUrl}"
     onerror="this.parentElement.textContent='${iconFallback}'; this.remove();"
     alt="">
```

- [ ] **Step 6: Migrate NPC/item/object inline sprite callers**

Use the helpers below:

```js
import {
  npcSpriteUrl,
  itemSpriteUrl,
  spriteUrl,
} from '../assets/asset-urls.js';
```

If `spriteUrl()` does not exist yet, add it to `asset-urls.js`:

```js
export function spriteUrl(pathParts) {
  const parts = Array.isArray(pathParts) ? pathParts : [pathParts];
  return withVersion(`/assets/sprites/${parts.map(encodePathSegment).join('/')}.webp`, SPRITE_VERSION);
}
```

Use `npcSpriteUrl(id)` for `/assets/sprites/npcs/${id}.webp`.

Use `spriteUrl('shrine_fox')`, `spriteUrl('traveling_merchant')`, `spriteUrl('quiz_master')`, `spriteUrl('word_discovery_npc')`, `spriteUrl('chippy')`, and `spriteUrl(['enemies', 'systemExecutive'])` for non-NPC sprite roots.

Use `itemSpriteUrl(id)` in `campfire.js`.

- [ ] **Step 7: Migrate DOM background contract**

In `public/js/ui/combat-dom.js`, replace `setBackground(imagePath)` with a canonical URL version:

```js
let _lastBgUrl = null;

export function setBackgroundUrl(backgroundUrl) {
  if (backgroundUrl === _lastBgUrl) return;
  _lastBgUrl = backgroundUrl;
  dom.sceneBackground.style.backgroundImage = backgroundUrl ? `url('${backgroundUrl}')` : 'none';
}

export function setBackground(backgroundUrl) {
  setBackgroundUrl(backgroundUrl);
}
```

Then update callers in `public/game.js` and `public/js/ui/pvp-lobby.js` to pass canonical background URLs from `asset-urls.js`. For one-off hub-style backgrounds, add this helper:

```js
export function backgroundImageUrl(fileName) {
  return withVersion(`/assets/backgrounds/${encodePathSegment(fileName)}.webp`, BACKGROUND_VERSION);
}
```

- [ ] **Step 8: Run source grep checks**

Run:

```bash
rg "\\?v=20260322|/assets/sprites/actions/.*\\?v=|/assets/backgrounds/.*\\?v=" public/js src/routes
```

Expected: no matches except canonical helper definitions in `public/js/assets/asset-urls.js`.

Run:

```bash
rg "SPRITE_VERSION" public/js src/routes
```

Expected: remaining matches are re-exports/imports during migration, not inline URL construction. If an inline URL still uses `SPRITE_VERSION`, migrate it through `asset-urls.js`.

- [ ] **Step 9: Run targeted syntax and unit tests**

Run:

```bash
node --check public/js/assets/asset-urls.js
node --check public/js/ui/sprite-utils.js
node --check public/js/ui/attack-card.js
node --check public/js/ui/move-select.js
node --check public/js/ui/combat-dom.js
node --check public/js/audio.js
node --check public/js/pixi/parallax.js
node --test tests/unit/assets/asset-urls.test.js tests/unit/pixi/parallax-background.test.js
```

Expected: all commands pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add public/js src/shared tests/unit/assets
git commit -m "Use canonical asset URLs in client modules"
```

## Task 3: Server Logical IDs and Whack-a-Mole Compatibility

**Files:**
- Modify: `src/routes/game/run.js`
- Modify: `public/js/ui/whack-a-mole.js`
- Test: `tests/unit/ui/whack-a-mole-client.test.js`

- [ ] **Step 1: Add failing whack-a-mole client test for logical asset fields**

In `tests/unit/ui/whack-a-mole-client.test.js`, add a test that constructs a pool item with logical fields and asserts the tile image resolves through the canonical URL. Use the existing test setup style in that file. The core assertion should be:

```js
assert.match(img.src, /\/assets\/sprites\/creatures\/a\.webp\?v=/);
```

Add representative pool rows:

```js
{ id: 'a', type: 'creature', creatureId: 'a', word: 'あ', reading: 'あ' }
{ id: 'rice', type: 'item', itemId: 'rice', word: '米', reading: 'こめ' }
{ id: 'move-slash', type: 'skill', actionSlug: 'slash', word: '切る', reading: 'きる' }
```

- [ ] **Step 2: Run the failing whack-a-mole test**

Run:

```bash
node --test tests/unit/ui/whack-a-mole-client.test.js
```

Expected: FAIL because `whack-a-mole.js` only reads `item.sprite`.

- [ ] **Step 3: Add logical fields to the server pool**

In `src/routes/game/run.js`, keep `sprite` for compatibility and add logical fields:

```js
const creaturePool = filteredCreatures.map(c => ({
  id: c.id,
  type: 'creature',
  creatureId: c.id,
  word: c.name,
  reading: c.reading || c.name,
  meaning: c.meaning || c.nameEn,
  element: c.element || '',
  sprite: versionedSpriteUrl(`creatures/${c.id}`)
}));
```

Use server-safe URL helpers or import `SPRITE_VERSION` from `src/shared/asset-versions.js` and keep server-local helper functions:

```js
import { SPRITE_VERSION } from '../../shared/asset-versions.js';

function versionedSpriteUrl(path) {
  return `/assets/sprites/${path}.webp?v=${SPRITE_VERSION}`;
}
```

For items:

```js
itemId: i.id,
sprite: versionedSpriteUrl(`items/${i.id}`)
```

For skills:

```js
const actionSlug = (m.nameEn || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
return {
  id: `move-${m.id}`,
  type: 'skill',
  actionSlug,
  word: m.name,
  reading: m.reading,
  meaning: m.nameEn || m.name,
  sprite: versionedSpriteUrl(`actions/${actionSlug}`)
};
```

- [ ] **Step 4: Resolve whack-a-mole sprite URLs on the client**

In `public/js/ui/whack-a-mole.js`, import helpers:

```js
import {
  actionIconUrlFromSlug,
  creatureStaticUrl,
  itemSpriteUrl,
} from '../assets/asset-urls.js';
```

Add `actionIconUrlFromSlug(slug)` to `asset-urls.js`:

```js
export function actionIconUrlFromSlug(slug) {
  return slug ? withVersion(`/assets/sprites/actions/${encodePathSegment(slug)}.webp`, SPRITE_VERSION) : '';
}
```

Add a local resolver:

```js
function spriteUrlForPoolItem(item) {
  if (item?.type === 'creature' && item.creatureId) return creatureStaticUrl(item.creatureId);
  if (item?.type === 'item' && item.itemId) return itemSpriteUrl(item.itemId);
  if (item?.type === 'skill' && item.actionSlug) return actionIconUrlFromSlug(item.actionSlug);
  return item?.sprite || '';
}
```

Use:

```js
img.src = spriteUrlForPoolItem(item);
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/unit/ui/whack-a-mole-client.test.js tests/unit/assets/asset-urls.test.js
node --check src/routes/game/run.js
node --check public/js/ui/whack-a-mole.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/routes/game/run.js public/js/ui/whack-a-mole.js public/js/assets/asset-urls.js tests/unit/ui/whack-a-mole-client.test.js tests/unit/assets/asset-urls.test.js
git commit -m "Resolve whack-a-mole assets from logical ids"
```

## Task 4: Asset Manifest Generation and Client Manifest Cache

**Files:**
- Create: `scripts/generate-asset-manifest.js`
- Create: `public/js/assets/asset-manifest.js`
- Create: `tests/unit/assets/asset-manifest.test.js`
- Modify: `package.json`
- Generate: `public/assets/asset-manifest.json`

- [ ] **Step 1: Write manifest tests**

Create `tests/unit/assets/asset-manifest.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAssetManifestSnapshot,
  hasCreatureIdle,
  resetAssetManifestForTests,
  startAssetManifestLoad,
} from '../../../public/js/assets/asset-manifest.js';

describe('asset manifest client cache', () => {
  beforeEach(() => resetAssetManifestForTests());

  it('loads once and exposes creature idle availability', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          version: 'test',
          creatures: {
            inu: { static: true, idle: true },
            neko: { static: true, idle: false },
          },
        }),
      };
    };

    await startAssetManifestLoad(fetchImpl);
    await startAssetManifestLoad(fetchImpl);

    assert.equal(calls, 1);
    assert.equal(hasCreatureIdle('inu'), true);
    assert.equal(hasCreatureIdle('neko'), false);
    assert.equal(getAssetManifestSnapshot().version, 'test');
  });

  it('returns safe static-oriented answers before manifest load', () => {
    assert.equal(getAssetManifestSnapshot(), null);
    assert.equal(hasCreatureIdle('inu'), false);
  });
});
```

- [ ] **Step 2: Run the failing manifest test**

Run:

```bash
node --test tests/unit/assets/asset-manifest.test.js
```

Expected: FAIL because `asset-manifest.js` does not exist.

- [ ] **Step 3: Implement the client manifest cache**

Create `public/js/assets/asset-manifest.js`:

```js
const MANIFEST_PATH = '/assets/asset-manifest.json';

let manifestPromise = null;
let manifestValue = null;

export function normalizeAssetManifest(raw) {
  if (!raw || typeof raw !== 'object') return { version: '', creatures: {}, backgrounds: {}, actions: [] };
  return {
    version: raw.version || '',
    creatures: raw.creatures && typeof raw.creatures === 'object' ? raw.creatures : {},
    backgrounds: raw.backgrounds && typeof raw.backgrounds === 'object' ? raw.backgrounds : {},
    actions: Array.isArray(raw.actions) ? raw.actions : [],
  };
}

export function startAssetManifestLoad(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAssetManifest)
      .then(manifest => {
        manifestValue = manifest;
        return manifest;
      })
      .catch(() => {
        manifestValue = normalizeAssetManifest(null);
        return manifestValue;
      });
  }
  return manifestPromise;
}

export function getAssetManifestSnapshot() {
  return manifestValue;
}

export function hasCreatureIdle(id) {
  return !!manifestValue?.creatures?.[id]?.idle;
}

export function resetAssetManifestForTests() {
  manifestPromise = null;
  manifestValue = null;
}
```

- [ ] **Step 4: Add the manifest generator script**

Create `scripts/generate-asset-manifest.js`:

```js
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SPRITE_VERSION } from '../src/shared/asset-versions.js';

const ROOT = process.cwd();
const SPRITE_DIR = join(ROOT, 'public/assets/sprites');
const BG_DIR = join(ROOT, 'public/assets/backgrounds');
const OUT = join(ROOT, 'public/assets/asset-manifest.json');

function stripWebp(name) {
  return name.replace(/\.webp$/i, '');
}

function listWebp(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.webp'));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function buildCreatureEntries() {
  const creatureDir = join(SPRITE_DIR, 'creatures');
  const animatedManifestPath = join(SPRITE_DIR, 'creatures-animated/manifest.json');
  const animated = existsSync(animatedManifestPath) ? readJson(animatedManifestPath).animations || {} : {};
  const creatures = {};

  for (const file of listWebp(creatureDir)) {
    const id = stripWebp(file).replace(/-idle$/, '');
    creatures[id] ||= { static: false, idle: false };
    if (file.endsWith('-idle.webp')) creatures[id].idle = true;
    else creatures[id].static = true;
  }

  for (const [id, entry] of Object.entries(animated)) {
    creatures[id] ||= { static: false, idle: false };
    creatures[id].animated = entry;
  }

  return creatures;
}

function buildBackgroundEntries() {
  const backgrounds = {};
  if (!existsSync(BG_DIR)) return backgrounds;
  for (const areaId of readdirSync(BG_DIR)) {
    const areaPath = join(BG_DIR, areaId);
    if (!existsSync(areaPath) || !statSync(areaPath).isDirectory()) continue;
    const layers = listWebp(areaPath).map(stripWebp).sort();
    if (layers.length) backgrounds[areaId] = layers;
  }
  return backgrounds;
}

function buildActionEntries() {
  return listWebp(join(SPRITE_DIR, 'actions')).map(stripWebp).sort();
}

const manifest = {
  version: SPRITE_VERSION,
  creatures: buildCreatureEntries(),
  backgrounds: buildBackgroundEntries(),
  actions: buildActionEntries(),
};

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
```

- [ ] **Step 5: Wire manifest generation into build**

In `package.json`, change the build script to:

```json
"build": "node scripts/tokenize-static.js && node scripts/generate-asset-manifest.js && vite build"
```

- [ ] **Step 6: Generate the manifest and run tests**

Run:

```bash
node scripts/generate-asset-manifest.js
node --test tests/unit/assets/asset-manifest.test.js tests/unit/pixi/animated-sprite-runtime-assets.test.js
```

Expected: PASS and `public/assets/asset-manifest.json` exists.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/generate-asset-manifest.js public/js/assets/asset-manifest.js public/assets/asset-manifest.json package.json tests/unit/assets/asset-manifest.test.js
git commit -m "Add generated asset manifest"
```

## Task 5: Shared Image Loader and Diagnostics

**Files:**
- Create: `public/js/assets/asset-loader.js`
- Create: `public/js/assets/asset-diagnostics.js`
- Create: `tests/unit/assets/asset-loader.test.js`
- Modify: `public/js/pixi/image-loader.js`
- Modify: `vite.config.js`

- [ ] **Step 1: Write asset loader tests**

Create `tests/unit/assets/asset-loader.test.js`:

```js
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeImage {
  static instances = [];
  constructor() {
    this.decode = mock.fn(async () => {});
    FakeImage.instances.push(this);
  }
}

globalThis.Image = FakeImage;

await mock.module('pixi.js', {
  namedExports: {
    Texture: {
      from: (img) => ({ img, texture: true }),
    },
  },
});

const {
  loadImageElement,
  loadTexture,
  resetAssetLoaderForTests,
} = await import('../../../public/js/assets/asset-loader.js');

describe('asset loader', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    resetAssetLoaderForTests();
  });

  it('dedupes concurrent image loads by URL and leaves crossOrigin unset', async () => {
    const first = loadImageElement('/assets/sprites/creatures/inu.webp?v=test');
    const second = loadImageElement('/assets/sprites/creatures/inu.webp?v=test');

    assert.equal(first, second);
    const image = await first;

    assert.equal(FakeImage.instances.length, 1);
    assert.equal(image.crossOrigin, undefined);
    assert.equal(image.src, '/assets/sprites/creatures/inu.webp?v=test');
  });

  it('reuses the decoded image when creating textures', async () => {
    const image = await loadImageElement('/assets/sprites/creatures/inu.webp?v=test');
    const texture = await loadTexture('/assets/sprites/creatures/inu.webp?v=test');

    assert.equal(texture.img, image);
    assert.equal(FakeImage.instances.length, 1);
  });
});
```

- [ ] **Step 2: Run the failing asset loader test**

Run:

```bash
node --test tests/unit/assets/asset-loader.test.js
```

Expected: FAIL because `asset-loader.js` does not exist.

- [ ] **Step 3: Implement diagnostics as no-op by default**

Create `public/js/assets/asset-diagnostics.js`:

```js
const enabled = typeof __ASSET_DIAGNOSTICS__ !== 'undefined' && __ASSET_DIAGNOSTICS__;
const events = [];

export function recordAssetEvent(event) {
  if (!enabled) return;
  events.push({ ...event, timestamp: Date.now() });
}

export function getAssetLoadStats() {
  return events.slice();
}

export function resetAssetDiagnosticsForTests() {
  events.length = 0;
}

if (enabled && typeof window !== 'undefined') {
  window.__assetStats = getAssetLoadStats;
}
```

- [ ] **Step 4: Implement shared image and texture caches**

Create `public/js/assets/asset-loader.js`:

```js
import { Texture } from 'pixi.js';
import { recordAssetEvent } from './asset-diagnostics.js';

const imagePromises = new Map();
const texturePromises = new Map();

export function loadImageElement(url, { consumer = 'image' } = {}) {
  const existing = imagePromises.get(url);
  if (existing) return existing;

  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = now();
  const promise = (async () => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const endedAt = now();
    recordAssetEvent({ url, consumer, durationMs: endedAt - startedAt, cache: 'loaded' });
    return img;
  })();

  promise.catch(() => {
    imagePromises.delete(url);
    texturePromises.delete(url);
  });
  imagePromises.set(url, promise);
  return promise;
}

export function preloadImage(url, options = {}) {
  return loadImageElement(url, { ...options, consumer: options.consumer || 'dom-warmup' });
}

export function loadTexture(url, options = {}) {
  const existing = texturePromises.get(url);
  if (existing) return existing;

  const promise = loadImageElement(url, { ...options, consumer: options.consumer || 'pixi' })
    .then(img => Texture.from(img));
  promise.catch(() => texturePromises.delete(url));
  texturePromises.set(url, promise);
  return promise;
}

export function resetAssetLoaderForTests() {
  imagePromises.clear();
  texturePromises.clear();
}
```

- [ ] **Step 5: Delegate Pixi image loading to the shared loader**

Replace `public/js/pixi/image-loader.js` with:

```js
import { loadTexture } from '../assets/asset-loader.js';

/**
 * Load an image via HTMLImageElement + decode() and wrap it in a Pixi Texture.
 *
 * iOS WKWebView rejects Pixi v8's Assets.load() for our bundled webp sprites
 * (ImageIO surfaces err=-50/-39 and Pixi falls back to Texture.WHITE), even
 * though the same bytes decode fine via a plain <img>. Use this helper instead
 * of Assets.load() for single-image textures so sprites render on device.
 */
export function loadImageTexture(url) {
  return loadTexture(url, { consumer: 'pixi' });
}
```

- [ ] **Step 6: Add explicit diagnostics build flag**

In `vite.config.js`, add a `define` block:

```js
define: {
  __ASSET_DIAGNOSTICS__: JSON.stringify(process.env.ASSET_DIAGNOSTICS === '1'),
},
```

- [ ] **Step 7: Run tests and syntax checks**

Run:

```bash
node --test tests/unit/assets/asset-loader.test.js tests/unit/pixi/parallax-background.test.js tests/unit/pixi/formation-scene.test.js
node --check public/js/assets/asset-loader.js
node --check public/js/assets/asset-diagnostics.js
node --check public/js/pixi/image-loader.js
```

Expected: PASS.

- [ ] **Step 8: Verify normal production bundle excludes stats helper**

Run:

```bash
npm run build && rg "__assetStats" dist || true
```

Expected: no `__assetStats` match in `dist`.

- [ ] **Step 9: Commit Task 5**

```bash
git add public/js/assets/asset-loader.js public/js/assets/asset-diagnostics.js public/js/pixi/image-loader.js tests/unit/assets/asset-loader.test.js vite.config.js
git commit -m "Share image loads across Pixi and DOM warmups"
```

## Task 6: Manifest-Backed Creature Loading

**Files:**
- Modify: `public/js/pixi/creature-animation-manifest.js`
- Modify: `public/js/pixi/formation.js`
- Modify: `public/js/ui/sprite-utils.js`
- Modify: `public/game.js`
- Test: `tests/unit/pixi/formation-scene.test.js`
- Test: `tests/unit/assets/asset-manifest.test.js`

- [ ] **Step 1: Extend animation manifest API tests through formation tests**

In `tests/unit/pixi/formation-scene.test.js`, add assertions in existing spawn tests that collect `loadImageTexture` paths:

```js
assert.deepEqual(loadedPaths, [
  '/assets/sprites/creatures-animated/inu/idle.webp?v=test'
]);
```

Also add a manifest-pending test where the manifest promise does not resolve before `spawnFormationSprite()` loads the static/idle fallback. The expected path should be:

```js
assert.equal(loadedPaths[0], '/assets/sprites/creatures/inu-idle.webp?v=20260508-campfire-entry-npc');
```

- [ ] **Step 2: Run the failing formation tests**

Run:

```bash
node --test tests/unit/pixi/formation-scene.test.js
```

Expected: FAIL because formation still always tries idle/static before animated sheets.

- [ ] **Step 3: Add snapshot access to `creature-animation-manifest.js`**

Add:

```js
let manifestValue = null;
let manifestPending = false;

export function startCreatureAnimationManifestLoad(fetchImpl = fetch) {
  if (!manifestPromise) {
    manifestPending = true;
    manifestPromise = fetchImpl(MANIFEST_PATH)
      .then(response => response.ok ? response.json() : null)
      .then(normalizeAnimationManifest)
      .then(manifest => {
        manifestValue = manifest;
        manifestPending = false;
        return manifest;
      })
      .catch(() => {
        manifestValue = null;
        manifestPending = false;
        return null;
      });
  }
  return manifestPromise;
}

export async function loadCreatureAnimationManifest(fetchImpl = fetch) {
  return startCreatureAnimationManifestLoad(fetchImpl);
}

export function getCreatureAnimationManifestSnapshot() {
  return manifestValue;
}

export function isCreatureAnimationManifestPending() {
  return manifestPending;
}
```

Update `resetCreatureAnimationManifestForTests()` to reset all four module variables.

- [ ] **Step 4: Start manifests early in `public/game.js`**

Import:

```js
import { startAssetManifestLoad } from './js/assets/asset-manifest.js';
import { startCreatureAnimationManifestLoad } from './js/pixi/creature-animation-manifest.js';
```

After imports and before the first game-state load starts, kick off:

```js
startAssetManifestLoad();
startCreatureAnimationManifestLoad();
```

Do not `await` these calls.

- [ ] **Step 5: Replace probe-driven idle lookup**

In `sprite-utils.js`, import:

```js
import { hasCreatureIdle } from '../assets/asset-manifest.js';
```

Change:

```js
export function creatureBgUrl(id) {
  return `url('${hasCreatureIdle(id) ? creatureIdleUrl(id) : creatureStaticUrl(id)}')`;
}

export function probeIdleSprites(_creatureIds) {
  return Promise.resolve();
}
```

Leave deletion of `probeIdleSprites()` for a cleanup commit after call sites are migrated.

- [ ] **Step 6: Implement manifest-first formation load when snapshot is ready**

In `formation.js`, import:

```js
import { creatureIdleUrl, creatureStaticUrl } from '../assets/asset-urls.js';
import {
  getCreatureAnimationManifestSnapshot,
  loadCreatureAnimationManifest,
} from './creature-animation-manifest.js';
```

Add helper:

```js
async function loadCreatureBaseTexture(creature) {
  try {
    return await loadImageTexture(creature.spriteImg || creatureIdleUrl(creature.id));
  } catch {
    try {
      return await loadImageTexture(creatureStaticUrl(creature.id));
    } catch {
      return Texture.WHITE;
    }
  }
}
```

Move the existing `shouldEnterWithWalk` calculation so it happens before texture selection, then use this structure near the start of `spawnFormationSprite()`:

```js
const manifestSnapshot = getCreatureAnimationManifestSnapshot();
const manifestEntry = getAnimatedCreatureEntry(manifestSnapshot, creature.id);
let animatedState = null;
let texture = null;

if (manifestEntry) {
  animatedState = await createAnimatedCreatureState(manifestEntry);
  texture = (shouldEnterWithWalk ? animatedState.textures.walk?.[0] : null)
    || animatedState.textures.idle?.[0]
    || animatedState.textures.walk?.[0]
    || null;
}

if (!texture) {
  texture = await loadCreatureBaseTexture(creature);
}
```

After creating the sprite, if `animatedState` exists, attach it immediately. Remove the old post-`new Sprite(texture)` block that always awaits `loadCreatureAnimationManifest()` so animated creatures do not double-load. If no snapshot exists, keep current fallback texture and start an upgrade:

```js
if (!manifestSnapshot) {
  loadCreatureAnimationManifest().then(async manifest => {
    if (!sprite.parent) return;
    const entry = getAnimatedCreatureEntry(manifest, creature.id);
    if (!entry || sprite._animatedCreature) return;
    const state = await createAnimatedCreatureState(entry);
    if (!sprite.parent) return;
    const initialTexture = state.textures.idle?.[0] || state.textures.walk?.[0];
    if (initialTexture) {
      sprite.texture = initialTexture;
      sprite._animatedCreature = state;
      sprite._animatedRenderScale = entry.renderScale || 1;
    }
  }).catch(() => {});
}
```

- [ ] **Step 7: Run formation and manifest tests**

Run:

```bash
node --test tests/unit/pixi/formation-scene.test.js tests/unit/pixi/formation-npc-scene.test.js tests/unit/assets/asset-manifest.test.js
node --check public/js/pixi/formation.js
node --check public/js/pixi/creature-animation-manifest.js
node --check public/js/ui/sprite-utils.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add public/js/pixi/creature-animation-manifest.js public/js/pixi/formation.js public/js/ui/sprite-utils.js public/game.js tests/unit/pixi/formation-scene.test.js tests/unit/assets/asset-manifest.test.js
git commit -m "Use manifests for creature asset discovery"
```

## Task 7: Conservative Asset Preload Scheduler

**Files:**
- Create: `public/js/assets/asset-preloader.js`
- Create: `tests/unit/assets/asset-preloader.test.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/target-select.js`
- Modify: `public/js/ui/attack-card.js`
- Modify: `public/js/ui/move-select.js`

- [ ] **Step 1: Write scheduler tests**

Create `tests/unit/assets/asset-preloader.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetPreloader,
} from '../../../public/js/assets/asset-preloader.js';

describe('asset preloader', () => {
  it('dedupes URLs and respects concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const loaded = [];
    const preloader = createAssetPreloader({
      concurrency: 2,
      loadImage: async (url) => {
        active++;
        maxActive = Math.max(maxActive, active);
        loaded.push(url);
        await Promise.resolve();
        active--;
      },
      scheduleIdle: (fn) => fn(),
    });

    preloader.enqueue(['/a.webp', '/b.webp', '/a.webp', '/c.webp']);
    await preloader.flushForTests();

    assert.deepEqual(loaded.sort(), ['/a.webp', '/b.webp', '/c.webp']);
    assert.equal(maxActive <= 2, true);
  });
});
```

- [ ] **Step 2: Run the failing scheduler test**

Run:

```bash
node --test tests/unit/assets/asset-preloader.test.js
```

Expected: FAIL because `asset-preloader.js` does not exist.

- [ ] **Step 3: Implement the scheduler**

Create `public/js/assets/asset-preloader.js`:

```js
import { preloadImage } from './asset-loader.js';

function defaultScheduleIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, 0);
  }
}

export function createAssetPreloader({
  concurrency = 2,
  loadImage = preloadImage,
  scheduleIdle = defaultScheduleIdle,
} = {}) {
  const queued = [];
  const seen = new Set();
  const inFlight = new Set();
  let pumping = false;

  function enqueue(urls, { priority = 'normal' } = {}) {
    for (const url of urls.filter(Boolean)) {
      if (seen.has(url)) continue;
      seen.add(url);
      if (priority === 'immediate') queued.unshift(url);
      else queued.push(url);
    }
    pump();
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    scheduleIdle(async () => {
      pumping = false;
      while (inFlight.size < concurrency && queued.length) {
        const url = queued.shift();
        const promise = loadImage(url).catch(() => {}).finally(() => {
          inFlight.delete(promise);
          pump();
        });
        inFlight.add(promise);
      }
    });
  }

  async function flushForTests() {
    while (queued.length || inFlight.size || pumping) {
      await Promise.resolve();
      await Promise.allSettled([...inFlight]);
    }
  }

  return { enqueue, flushForTests };
}

export const assetPreloader = createAssetPreloader();
```

- [ ] **Step 4: Wire immediate warmup**

In `public/game.js`, after game state loads and active/reserve creature IDs are known, enqueue current party static and idle URLs:

```js
import { assetPreloader } from './js/assets/asset-preloader.js';
import { creatureIdleUrl, creatureStaticUrl } from './js/assets/asset-urls.js';
```

```js
assetPreloader.enqueue(
  allCreatureIds.flatMap(id => [creatureStaticUrl(id), creatureIdleUrl(id)]),
  { priority: 'immediate' }
);
```

Do not await this.

- [ ] **Step 5: Wire near-future UI warmups**

In `target-select.js`, before `renderChoices()`, enqueue target static URLs:

```js
import { assetPreloader } from '../assets/asset-preloader.js';
```

```js
assetPreloader.enqueue(validTargets.map(target => creatureStaticPath(target.id)), { priority: 'immediate' });
```

In `attack-card.js`, import `creatureStaticUrl` and enqueue attacker, target, and move icon URLs before returning the card HTML:

```js
const attackerUrl = creatureStaticUrl(atk.attackerId);
const targetUrl = creatureStaticUrl(atk.targetId);
assetPreloader.enqueue([attackerUrl, targetUrl, moveIcon].filter(Boolean), { priority: 'immediate' });
```

In `move-select.js`, enqueue action icons for the visible move list before rendering cells:

```js
assetPreloader.enqueue(moves.map(move => actionIconUrl(move.nameEn)).filter(Boolean), { priority: 'normal' });
```

- [ ] **Step 6: Run scheduler and UI tests**

Run:

```bash
node --test tests/unit/assets/asset-preloader.test.js tests/unit/ui/whack-a-mole-client.test.js
node --check public/js/assets/asset-preloader.js
node --check public/game.js
node --check public/js/ui/target-select.js
node --check public/js/ui/attack-card.js
node --check public/js/ui/move-select.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add public/js/assets/asset-preloader.js public/game.js public/js/ui/target-select.js public/js/ui/attack-card.js public/js/ui/move-select.js tests/unit/assets/asset-preloader.test.js
git commit -m "Warm likely next assets in the background"
```

## Task 8: Final Verification

**Files:**
- Modify: `docs/playtest-guide.md` only if a new manual asset diagnostic workflow should be preserved.

- [ ] **Step 1: Run source hygiene checks**

Run:

```bash
rg "\\?v=20260322" public/js src/routes
rg "new Image\\(|crossOrigin|/assets/sprites/.+\\?v=|/assets/backgrounds/.+\\?v=" public/js src/routes
```

Expected:

- No `?v=20260322` matches.
- `new Image()` appears only in `public/js/assets/asset-loader.js` and any test/dev-only files.
- Versioned `/assets/sprites` and `/assets/backgrounds` construction is centralized in `public/js/assets/asset-urls.js` and server compatibility helpers.
- `crossOrigin` is not set by production image loading code.

- [ ] **Step 2: Run full automated tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
rg "__assetStats" dist || true
```

Expected: build passes and normal `dist` does not contain `__assetStats`.

- [ ] **Step 4: Optional diagnostic build smoke check**

Run:

```bash
ASSET_DIAGNOSTICS=1 npm run build
rg "__assetStats" dist
```

Expected: diagnostic build contains `__assetStats`.

- [ ] **Step 5: Manual Capacitor iOS verification**

On device:

1. Open the app cold.
2. Load creature display, enter combat, open target select, and view an attack card.
3. If using a diagnostic build, run `window.__assetStats()` from Safari Web Inspector and capture the result outside the repo.
4. Swipe the app closed.
5. Reopen and repeat the same path.
6. Compare whether stable immutable URLs show non-zero `transferSize` on the second run.

Expected: no visual regressions, and the diagnostics distinguish runtime warm hits from post-restart network transfers.

- [ ] **Step 6: Commit final docs if changed**

If `docs/playtest-guide.md` was updated:

```bash
git add docs/playtest-guide.md
git commit -m "Document asset diagnostics playtest flow"
```

If no docs changed, skip this commit.

## Handoff Notes

- Keep each task as its own commit.
- Do not remove compatibility `sprite` response fields from `src/routes/game/run.js` in this implementation. The client can stop consuming them, but removal waits for deployed older clients to roll off.
- Do not add a durable native cache in this implementation. The diagnostics decide whether that follow-up is warranted.
- Do not block first UI render on manifest fetches. Manifest priming starts early and formation keeps the cold-open fallback path.
- Any visual/rendering changes must be verified with screenshots before reporting completion.
