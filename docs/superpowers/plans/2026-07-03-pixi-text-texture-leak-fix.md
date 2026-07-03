# PIXI Text Texture Leak Fix + On-Device Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the progressive gameplay lag by freeing GPU textures when floating text is destroyed, and add telemetry to every bug report that proves (or disproves) the fix on a real iPhone session.

**Architecture:** A `destroyText` helper in `public/js/pixi/text.js` centralizes texture-freeing teardown for all generated Text VFX; container-based Text holders (pills, stun stars) get texture options inline. A new pure module `public/js/perf-telemetry.js` provides frame-bucket and texture-sampler factories that `public/js/diagnostics.js` wires into its existing rAF tick and `snapshot()`, so every bug report carries a degradation curve. `runSafely` in `public/js/analytics.js` gains a warn-once gate so Firebase-iOS failure spam stops flooding the console buffer.

**Tech Stack:** PIXI v8, ES6 modules, node:test + `mock.module` (Tier-1 unit tests with c8 coverage), Playwright MCP (WebKit) for live verification.

**Spec:** `docs/superpowers/specs/2026-07-03-pixi-text-texture-leak-fix-design.md`

## Global Constraints

- **NEVER add `texture: true` to sprite/shadow destroys.** Creature sprites share cached asset textures. Off-limits: `formation.js` `sprite.destroy({ children: true })` (~line 995), `sprite.destroy({ children: true, texture: false })` (~line 674), `prior.destroy({ children: true, texture: false })` (~line 630), `sprite._shadow.destroy({ children: true })` (~line 166). The existing explicit `texture: false` options there are intentional — do not "clean them up".
- Keep existing `performance.slowFrames` / `performance.totalFrames` snapshot fields unchanged (continuity with old bug reports).
- ES6 modules; tests use node:test, `assert/strict`, and `await mock.module(...)` **before** dynamically importing the module under test (see `tests/unit/pixi/formation-scene.test.js` for the pattern).
- After editing any JS file run `node --check <file> && echo OK`.
- `npm test` (Tier 1 + Tier 2) must pass before merge; c8 coverage has a ratcheting floor.
- Use `/usr/bin/git` (never Homebrew git).
- **Ask the user before launching Playwright** (CLAUDE.md rule). Dev server is `npm run dev`, navigate to `http://localhost:5173` (Vite), test account `devtester` / `test1234`.
- PvE/PvP parity: all changes are in shared pixi primitives (`text.js`, `banners.js`, `status-vfx.js`, `formation.js`) used by both battle modes — do not fork per-mode code paths.
- Line numbers cited below are as of dev @ `42331279`; match on code content, not line position.
- Execution happens in a worktree branch `fix/pixi-text-texture-leak` off `dev` (create via superpowers:using-git-worktrees; `npm install` in the worktree).

---

### Task 1: `destroyText` helper + text.js call sites

**Files:**
- Modify: `public/js/pixi/text.js` (add helper; swap 2 destroy calls at ~66, ~103)
- Test: `tests/unit/pixi/destroy-text.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function destroyText(t)` from `public/js/pixi/text.js` — destroys a PIXI Text with `{ texture: true, textureSource: true }`. Tasks 2 imports it in `banners.js` and `status-vfx.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pixi/destroy-text.test.js`:

```js
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Fake PIXI Text that records destroy options ---
class FakeText {
  constructor(opts = {}) {
    this.text = opts.text ?? '';
    this.style = opts.style ?? {};
    this.x = 0;
    this.y = 0;
    this.alpha = 1;
    this.anchor = { set: () => {} };
    this.scale = { x: 1, y: 1, set(sx, sy) { this.x = sx; this.y = sy ?? sx; } };
    this.destroyed = false;
    this.destroyArgs = undefined;
    FakeText.instances.push(this);
  }
  destroy(opts) {
    this.destroyed = true;
    this.destroyArgs = opts;
  }
}
FakeText.instances = [];

await mock.module('pixi.js', {
  namedExports: { Text: FakeText },
});
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({
      app: { screen: { width: 400, height: 800 } },
      layers: { overlay: { addChild: () => {}, removeChild: () => {} } },
    }),
  },
});
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: { tween: async () => {}, wait: async () => {} },
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: { screenShake: () => {}, screenFlash: () => {} },
});
await mock.module('../../../public/js/pixi/combat-effects-util.js', {
  namedExports: { TIER_FONT_SIZES: [12, 16, 20, 26, 32] },
});

const { destroyText, showDamageNumber, showEventPopup } =
  await import('../../../public/js/pixi/text.js');

const TEXTURE_OPTS = { texture: true, textureSource: true };

describe('destroyText', () => {
  it('destroys with texture and textureSource so GPU memory is reclaimed', () => {
    const t = new FakeText({ text: 'x' });
    destroyText(t);
    assert.equal(t.destroyed, true);
    assert.deepEqual(t.destroyArgs, TEXTURE_OPTS);
  });
});

describe('floating text teardown frees GPU textures', () => {
  beforeEach(() => {
    FakeText.instances.length = 0;
  });

  it('showDamageNumber destroys its Text with texture options', async () => {
    await showDamageNumber(12, { x: 100, y: 200 });
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });

  it('showEventPopup destroys its Text with texture options', async () => {
    await showEventPopup('Guard up!', { x: 100, y: 200 });
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/pixi/destroy-text.test.js`
Expected: FAIL — `destroyText` is not exported (TypeError: destroyText is not a function), and/or `destroyArgs` is `undefined` for the show* tests.

- [ ] **Step 3: Write minimal implementation**

In `public/js/pixi/text.js`, add after the `DAMAGE_COLORS` block (before the `showDamageNumber` JSDoc):

```js
// ============ TEXT TEARDOWN ============

/**
 * Destroy a uniquely-generated Text object AND its GPU texture.
 *
 * PIXI v8 Text auto-generates a texture per instance; a bare destroy()
 * leaves that texture in GPU memory forever — invisible to JS-heap
 * metrics and never reclaimed by textureGC. Every floating-text teardown
 * must go through this helper (or pass the same options explicitly).
 * Do NOT use for Sprites — creature/shadow sprites share cached textures
 * that must survive.
 */
export function destroyText(t) {
  t.destroy({ texture: true, textureSource: true });
}
```

Then swap both call sites in the same file:

At the end of `showDamageNumber` (~line 66):
```js
  destroyText(text);
```
(replacing `text.destroy();`)

At the end of `showEventPopup` (~line 103):
```js
  destroyText(text);
```
(replacing `text.destroy();`)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check public/js/pixi/text.js && node --experimental-test-module-mocks --test tests/unit/pixi/destroy-text.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/pixi/text.js tests/unit/pixi/destroy-text.test.js
/usr/bin/git commit -m "fix(pixi): free GPU textures when destroying floating text"
```

---

### Task 2: Banner, status-VFX, and status-pill teardown sites

**Files:**
- Modify: `public/js/pixi/banners.js` (~line 75)
- Modify: `public/js/pixi/status-vfx.js` (~lines 63, 209, 427)
- Modify: `public/js/pixi/formation.js` (~lines 272, 669, 866)
- Test: `tests/unit/pixi/destroy-text.test.js` (extend with showBanner case)

**Interfaces:**
- Consumes: `destroyText(t)` from `public/js/pixi/text.js` (Task 1).
- Produces: nothing new — all remaining leaking teardown paths now free textures.

**Why only the banner path gets a unit test:** the container option swaps (`{ children: true }` → `{ children: true, texture: true, textureSource: true }`) have no JS-observable behavior difference in a mocked environment — texture reclamation only exists in a real WebGL renderer. Task 7 verifies them live. The existing suites (`formation-scene.test.js` etc.) must still pass to catch structural regressions.

**Safety note (verified 2026-07-03):** pills are `Container(Graphics + Text)` (`createPill`, formation.js:114–139); sleep containers hold only `Z` Text particles (status-vfx.js:186–235); stun containers hold only ★ Text (status-vfx.js:239–256). No Sprite children anywhere, so texture-freeing destroys cannot touch shared cached textures. Graphics children ignore the texture flags.

- [ ] **Step 1: Extend the test with the banner case (failing)**

In `tests/unit/pixi/destroy-text.test.js`, add to the import block (after the `text.js` import line):

```js
const { showBanner } = await import('../../../public/js/pixi/banners.js');
```

and add inside the `describe('floating text teardown frees GPU textures', ...)` block:

```js
  it('showBanner destroys its Text with texture options', async () => {
    await showBanner('Correct!', 'weak');
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/pixi/destroy-text.test.js`
Expected: FAIL — showBanner's `destroyArgs` is `undefined` (bare destroy).

- [ ] **Step 3: Implement the swaps**

**`public/js/pixi/banners.js`** — add import after the existing imports (line 4):

```js
import { destroyText } from './text.js';
```

and at the end of `showBanner` (~line 75) replace `text.destroy();` with:

```js
  destroyText(text);
```

**`public/js/pixi/status-vfx.js`** — extend the existing text.js import (line 5):

```js
import { showEventPopup, destroyText } from './text.js';
```

In `_stopOngoingForDeadTarget` (~line 63), replace
`try { container.destroy({ children: true }); } catch { /* already destroyed */ }` with:

```js
    try { container.destroy({ children: true, texture: true, textureSource: true }); } catch { /* already destroyed */ }
```

In the sleep updater (~line 209), replace `z.destroy();` with:

```js
        destroyText(z);
```

In `_teardownEntry` (~line 427), replace
`try { entry.container.destroy({ children: true }); } catch { /* already destroyed */ }` with:

```js
    try { entry.container.destroy({ children: true, texture: true, textureSource: true }); } catch { /* already destroyed */ }
```

**`public/js/pixi/formation.js`** — three pill teardown sites. In `_syncPixiStatusLabels` (~line 272), replace `pill.destroy({ children: true });` with:

```js
      pill.destroy({ children: true, texture: true, textureSource: true });
```

In `removeFormationSprite` (~line 669), replace `pill.destroy({ children: true });` with:

```js
      pill.destroy({ children: true, texture: true, textureSource: true });
```

In `destroyAllStatusLabels` (~line 866), replace
`try { pill.destroy({ children: true }); } catch { /* already gone */ }` with:

```js
        try { pill.destroy({ children: true, texture: true, textureSource: true }); } catch { /* already gone */ }
```

**Do NOT touch** the sprite destroys at ~630, ~674, ~995 or the shadow destroy at ~166 (see Global Constraints).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --check public/js/pixi/banners.js && node --check public/js/pixi/status-vfx.js && node --check public/js/pixi/formation.js && echo OK
node --experimental-test-module-mocks --test tests/unit/pixi/destroy-text.test.js
npm run test:unit
```
Expected: syntax OK; 4 tests pass in destroy-text; full unit suite green (existing formation/status suites unaffected).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/pixi/banners.js public/js/pixi/status-vfx.js public/js/pixi/formation.js tests/unit/pixi/destroy-text.test.js
/usr/bin/git commit -m "fix(pixi): free text textures in banners, status VFX, and status pills"
```

---

### Task 3: perf-telemetry factories (frame buckets + texture sampler)

**Files:**
- Create: `public/js/perf-telemetry.js`
- Test: `tests/unit/perf-telemetry.test.js` (create)

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces:
  - `createFrameStats({ maxMinutes = 45 } = {})` → `{ onFrame(deltaMs, nowMs), toArray() }`. `toArray()` returns `[{ m, f, b17, b25, b33, b50, over }]` — per-minute records, `m` = minute index since page load, `f` = counted frames.
  - `createTextureSampler({ getCount, intervalMs = 30000, maxSamples = 90 } = {})` → `{ maybeSample(nowMs), toArray() }`. `toArray()` returns `[{ t, n }]` — `t` = seconds since load, `n` = texture count.
  - Task 4 imports both into `diagnostics.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/perf-telemetry.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createFrameStats, createTextureSampler } =
  await import('../../public/js/perf-telemetry.js');

describe('createFrameStats', () => {
  it('buckets frame deltas by threshold', () => {
    const stats = createFrameStats();
    const nowMs = 30_000; // all within minute 0
    stats.onFrame(10, nowMs);
    stats.onFrame(17, nowMs); // boundary: healthy
    stats.onFrame(18, nowMs); // 17–25
    stats.onFrame(25, nowMs);
    stats.onFrame(26, nowMs); // 25–33
    stats.onFrame(33, nowMs);
    stats.onFrame(34, nowMs); // 33–50
    stats.onFrame(50, nowMs);
    stats.onFrame(51, nowMs); // over
    assert.deepEqual(stats.toArray(), [
      { m: 0, f: 9, b17: 2, b25: 2, b33: 2, b50: 2, over: 1 },
    ]);
  });

  it('rolls over to a new record each minute', () => {
    const stats = createFrameStats();
    stats.onFrame(16, 59_000);
    stats.onFrame(16, 61_000);
    const arr = stats.toArray();
    assert.equal(arr.length, 2);
    assert.equal(arr[0].m, 0);
    assert.equal(arr[1].m, 1);
  });

  it('evicts oldest minutes beyond maxMinutes', () => {
    const stats = createFrameStats({ maxMinutes: 2 });
    stats.onFrame(16, 0);
    stats.onFrame(16, 60_000);
    stats.onFrame(16, 120_000);
    assert.deepEqual(stats.toArray().map((r) => r.m), [1, 2]);
  });

  it('ignores app-suspend gaps entirely', () => {
    const stats = createFrameStats();
    stats.onFrame(16, 1_000);
    stats.onFrame(2_500, 3_500); // resumed from background
    assert.deepEqual(stats.toArray(), [
      { m: 0, f: 1, b17: 1, b25: 0, b33: 0, b50: 0, over: 0 },
    ]);
  });
});

describe('createTextureSampler', () => {
  it('samples at most once per interval', () => {
    let count = 10;
    const s = createTextureSampler({ getCount: () => count, intervalMs: 30_000 });
    s.maybeSample(0);
    count = 20;
    s.maybeSample(15_000); // too soon — skipped
    s.maybeSample(30_000);
    assert.deepEqual(s.toArray(), [{ t: 0, n: 10 }, { t: 30, n: 20 }]);
  });

  it('skips samples when PIXI is not booted', () => {
    const s = createTextureSampler({ getCount: () => null, intervalMs: 30_000 });
    s.maybeSample(0);
    assert.deepEqual(s.toArray(), []);
  });

  it('survives a throwing getCount', () => {
    const s = createTextureSampler({
      getCount: () => { throw new Error('no renderer'); },
    });
    s.maybeSample(0);
    assert.deepEqual(s.toArray(), []);
  });

  it('evicts oldest samples beyond maxSamples', () => {
    const s = createTextureSampler({ getCount: () => 1, intervalMs: 10, maxSamples: 2 });
    s.maybeSample(0);
    s.maybeSample(1_000);
    s.maybeSample(2_000);
    assert.deepEqual(s.toArray().map((x) => x.t), [1, 2]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-test-module-mocks --test tests/unit/perf-telemetry.test.js`
Expected: FAIL — `Cannot find module .../public/js/perf-telemetry.js`.

- [ ] **Step 3: Write the implementation**

Create `public/js/perf-telemetry.js`:

```js
// Pure telemetry factories wired into diagnostics.js. No imports — the
// texture-count reader is injected so this stays trivially unit-testable.

// A frame delta > SUSPEND_GAP_MS is an app-suspend/background artifact
// (rAF pauses when the app is backgrounded), not a slow frame.
const SUSPEND_GAP_MS = 2000;

/**
 * Per-minute frame-time bucket counters in a bounded ring.
 * Buckets: ≤17ms (healthy 60fps), 17–25, 25–33, 33–50, >50ms.
 */
export function createFrameStats({ maxMinutes = 45 } = {}) {
  const minutes = [];
  let current = null;

  function onFrame(deltaMs, nowMs) {
    if (deltaMs > SUSPEND_GAP_MS) return;
    const m = Math.floor(nowMs / 60_000);
    if (!current || current.m !== m) {
      current = { m, f: 0, b17: 0, b25: 0, b33: 0, b50: 0, over: 0 };
      minutes.push(current);
      if (minutes.length > maxMinutes) minutes.shift();
    }
    current.f++;
    if (deltaMs <= 17) current.b17++;
    else if (deltaMs <= 25) current.b25++;
    else if (deltaMs <= 33) current.b33++;
    else if (deltaMs <= 50) current.b50++;
    else current.over++;
  }

  return {
    onFrame,
    toArray: () => minutes.map((r) => ({ ...r })),
  };
}

/**
 * Periodic sampler for the GPU-managed texture count. getCount is injected
 * (diagnostics reads the PIXI renderer); null/throwing reads are skipped so
 * sampling is a no-op until PIXI boots.
 */
export function createTextureSampler({ getCount, intervalMs = 30_000, maxSamples = 90 } = {}) {
  const samples = [];
  let lastSampleAt = -Infinity;

  function maybeSample(nowMs) {
    if (nowMs - lastSampleAt < intervalMs) return;
    lastSampleAt = nowMs;
    let n = null;
    try { n = getCount(); } catch { n = null; }
    if (typeof n !== 'number') return;
    samples.push({ t: Math.round(nowMs / 1000), n });
    if (samples.length > maxSamples) samples.shift();
  }

  return {
    maybeSample,
    toArray: () => samples.map((s) => ({ ...s })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --check public/js/perf-telemetry.js && node --experimental-test-module-mocks --test tests/unit/perf-telemetry.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/perf-telemetry.js tests/unit/perf-telemetry.test.js
/usr/bin/git commit -m "feat(telemetry): frame-bucket and texture-timeline factories"
```

---

### Task 4: Wire telemetry into diagnostics snapshot

**Files:**
- Modify: `public/js/diagnostics.js` (performance section ~lines 164–199)
- Test: `tests/unit/diagnostics-performance.test.js` (create)

**Interfaces:**
- Consumes: `createFrameStats`, `createTextureSampler` from `public/js/perf-telemetry.js` (Task 3).
- Produces: `snapshot().performance.frameBuckets` (array of `{ m, f, b17, b25, b33, b50, over }`) and `snapshot().performance.textureTimeline` (array of `{ t, n }`) — consumed by the bug-report payload (already spreads `snapshot()`) and read in Tasks 6–7 verification.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/diagnostics-performance.test.js` (fresh file = fresh process, so `init()` here doesn't collide with `diagnostics.test.js`):

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../public/js/analytics.js', {
  namedExports: {
    setCrashContext: () => {},
    trackMilestone: () => {},
    recordNonFatal: () => {},
  },
});

await mock.module('../../public/js/analytics-core.js', {
  namedExports: {
    extractGameContext: () => ({}),
  },
});

const diagnostics = await import('../../public/js/diagnostics.js');

describe('snapshot performance telemetry', () => {
  it('reports frame buckets and texture timeline from the rAF tick', () => {
    let rafCb = null;
    global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
    global.window = {
      fetch: async () => ({ status: 200 }),
      addEventListener: () => {},
      __pixiApp: () => ({
        app: { renderer: { texture: { managedTextures: { length: 42 } } } },
      }),
    };

    let fakeNow = 0;
    const realPerformance = globalThis.performance;
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => fakeNow },
      configurable: true,
    });

    try {
      diagnostics.init();

      fakeNow = 16;  // healthy frame (delta 16ms); sampler takes baseline
      rafCb();
      fakeNow = 56;  // jank frame (delta 40ms)
      rafCb();

      const perf = diagnostics.snapshot().performance;
      assert.equal(perf.frameBuckets.length, 1);
      assert.deepEqual(perf.frameBuckets[0], {
        m: 0, f: 2, b17: 1, b25: 0, b33: 0, b50: 1, over: 0,
      });
      assert.deepEqual(perf.textureTimeline, [{ t: 0, n: 42 }]);
      // Continuity: legacy fields still present
      assert.equal(perf.totalFrames, 2);
      assert.equal(perf.slowFrames, 1);
    } finally {
      Object.defineProperty(globalThis, 'performance', {
        value: realPerformance,
        configurable: true,
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/diagnostics-performance.test.js`
Expected: FAIL — `perf.frameBuckets` is `undefined`.

- [ ] **Step 3: Implement the wiring**

In `public/js/diagnostics.js`, add to the imports at the top (after line 3):

```js
import { createFrameStats, createTextureSampler } from './perf-telemetry.js';
```

Replace the whole `// ============ PERFORMANCE TRACKING ============` section (the `frameCount`/`slowFrameCount`/`lastFrameTime` lets and `initPerformanceTracking`, ~lines 164–180) with:

```js
// ============ PERFORMANCE TRACKING ============

let frameCount = 0;
let slowFrameCount = 0;
let lastFrameTime = 0;
let frameStats = null;
let textureSampler = null;

function initPerformanceTracking() {
  lastFrameTime = performance.now();
  frameStats = createFrameStats();
  textureSampler = createTextureSampler({
    getCount: () =>
      window.__pixiApp?.()?.app?.renderer?.texture?.managedTextures?.length ?? null,
  });
  function tick() {
    const now = performance.now();
    frameCount++;
    const delta = now - lastFrameTime;
    if (delta > 33) slowFrameCount++;
    frameStats.onFrame(delta, now);
    textureSampler.maybeSample(now);
    lastFrameTime = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
```

In `snapshot()` (~line 184), replace the `performance:` object with:

```js
    performance: {
      timeSinceLoad: Math.round(performance.now()),
      memoryUsage: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize
      } : null,
      slowFrames: slowFrameCount,
      totalFrames: frameCount,
      frameBuckets: frameStats ? frameStats.toArray() : [],
      textureTimeline: textureSampler ? textureSampler.toArray() : []
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --check public/js/diagnostics.js && echo OK
node --experimental-test-module-mocks --test tests/unit/diagnostics-performance.test.js tests/unit/diagnostics.test.js
```
Expected: PASS — new test green, existing diagnostics tests still green.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/diagnostics.js tests/unit/diagnostics-performance.test.js
/usr/bin/git commit -m "feat(telemetry): frame buckets + GPU texture timeline in bug reports"
```

---

### Task 5: Analytics warn-once gate

**Files:**
- Modify: `public/js/analytics.js` (`runSafely`, ~lines 79–86)
- Test: `tests/unit/analytics-warn-once.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — `runSafely` behavior only (first failure per label warns; repeats are silent).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/analytics-warn-once.test.js`:

```js
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../public/js/platform.js', {
  namedExports: { PLATFORM: { isNative: false } },
});

await mock.module('../../public/js/analytics-core.js', {
  namedExports: {
    buildFirebaseConfig: () => ({ apiKey: 'test' }),
    extractGameContext: () => ({}),
    sanitizeParams: (p) => p,
    createMilestoneStore: () => ({ has: () => false, mark: () => {} }),
    nextFurthestStep: () => null,
  },
});

const { createAnalyticsClient } = await import('../../public/js/analytics.js');

function makeFailingClient() {
  return createAnalyticsClient({
    env: {},
    storage: null,
    transportFactory: async () => ({
      init: async () => {},
      logEvent: async () => { throw new Error('plugin is not implemented on ios'); },
      setUserProperty: async () => { throw new Error('plugin is not implemented on ios'); },
    }),
  });
}

describe('analytics warn-once', () => {
  let warnings;
  let origWarn;

  beforeEach(() => {
    warnings = [];
    origWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.join(' ')); };
  });

  afterEach(() => {
    console.warn = origWarn;
  });

  it('warns only once per failing operation label', async () => {
    const client = makeFailingClient();
    await client.trackEvent('a');
    await client.trackEvent('b');
    await client.trackEvent('c');
    assert.equal(warnings.filter((w) => w.includes('logEvent failed')).length, 1);
  });

  it('distinct labels each warn once', async () => {
    const client = makeFailingClient();
    await client.trackEvent('a');
    await client.setUserProperty('k', 'v');
    await client.trackEvent('b');
    await client.setUserProperty('k2', 'v2');
    assert.equal(warnings.filter((w) => w.includes('logEvent failed')).length, 1);
    assert.equal(warnings.filter((w) => w.includes('setUserProperty failed')).length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --test tests/unit/analytics-warn-once.test.js`
Expected: FAIL — 3 `logEvent failed` warnings counted instead of 1.

- [ ] **Step 3: Implement the gate**

In `public/js/analytics.js`, inside `createAnalyticsClient` (the closure state block, next to `let furthestStep = null;` ~line 77), add:

```js
  const warnedLabels = new Set();
```

and replace `runSafely` (~lines 79–86) with:

```js
  async function runSafely(label, fn) {
    try {
      return await fn();
    } catch (err) {
      // Firebase plugins are unimplemented on iOS; without this gate their
      // failure warnings fill the entire diagnostics console buffer within
      // seconds and blind bug reports to real errors.
      if (!warnedLabels.has(label)) {
        warnedLabels.add(label);
        console.warn(`[Analytics] ${label} failed:`, err?.message || err);
      }
      return null;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --check public/js/analytics.js && echo OK
node --experimental-test-module-mocks --test tests/unit/analytics-warn-once.test.js
npm run test:unit
```
Expected: warn-once tests PASS; full unit suite green (diagnostics tests mock analytics, unaffected).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add public/js/analytics.js tests/unit/analytics-warn-once.test.js
/usr/bin/git commit -m "fix(analytics): warn once per failed operation to keep bug reports readable"
```

---

### Task 6: Full suite + desktop WebKit live verification

**Files:** none modified (verification only; fix regressions if found).

**Interfaces:**
- Consumes: everything from Tasks 1–5 running together in a real renderer.
- Produces: recorded before/after texture counts proving the leak is gone in desktop WebKit — the pre-merge gate.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: Tier 1 + Tier 2 green.

- [ ] **Step 2: Ask the user for permission to launch Playwright**

CLAUDE.md rule — never launch Playwright unannounced (Chrome session conflicts). Wait for approval before Step 3.

- [ ] **Step 3: Start the dev server and open the game**

```bash
npm run dev   # background; wait ~5s
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173   # expect 200
```

In Playwright (WebKit per `.mcp.json`): navigate to `http://localhost:5173`, log in as `devtester` / `test1234`. Read `docs/playtest-guide.md` first.

- [ ] **Step 4: Burst-harness texture measurement**

In the page (via `browser_evaluate` / console):

```js
const app = window.__pixiApp().app;
const count = () => app.renderer.texture.managedTextures.length;
const { showEventPopup } = await import('/js/pixi/text.js');
const n0 = count();
for (let i = 0; i < 30; i++) showEventPopup('T' + i, { x: 180, y: 300 }, { duration: 80 });
await new Promise((r) => setTimeout(r, 2500));
({ n0, n1: count(), growth: count() - n0 });
```

Expected: `growth` ≤ 2 (June unpatched baseline: monotonic growth, never reclaimed). Run the burst **3×** — growth must not compound across bursts.

- [ ] **Step 5: Real combat measurement**

Enter Wild Plains combat with devtester, play several turns (flip + swipe vocab cards — see playtest guide), triggering damage numbers, banners, and status pills. Sample `count()` between turns. Expected: count rises while texts are on screen, returns to a stable plateau after they despawn — no monotonic climb across turns (June baseline: 9 → 28 → 38 → 61, never dropping).

- [ ] **Step 6: Snapshot telemetry sanity check**

In the page:

```js
const d = await import('/js/diagnostics.js');
const p = d.snapshot().performance;
({ buckets: p.frameBuckets.length, lastBucket: p.frameBuckets.at(-1), timeline: p.textureTimeline });
```

Expected: at least one bucket record with plausible `f`; `textureTimeline` non-empty with `n` matching the measured counts.

- [ ] **Step 7: Record results**

Append the measured numbers (burst growth ×3, combat plateau values, timeline sample) to the PR/merge commit message in Task 7. If any measurement fails, STOP — debug with superpowers:systematic-debugging before merging.

---

### Task 7: Merge, deploy, and the on-device gate

**Files:** none (git + deploy + protocol).

**Interfaces:**
- Consumes: verified branch from Task 6.
- Produces: fix live on prod; instructions + read-back commands for the iPhone session gate.

- [ ] **Step 1: Finish the branch**

Use superpowers:finishing-a-development-branch. Flow per CLAUDE.md:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge fix/pixi-text-texture-leak
/usr/bin/git push origin dev
/usr/bin/git push origin dev:master   # also ships areas 5–12 content on dev — standard flow
/usr/bin/git worktree remove ../koto-wt-pixi-text-texture-leak
/usr/bin/git branch -d fix/pixi-text-texture-leak
```

- [ ] **Step 2: Verify prod deploy**

```bash
curl -s -o /dev/null -w "%{http_code}" https://jrpg-production.up.railway.app   # expect 200 after Railway deploy completes
```

Check the Railway dashboard/MCP if the deploy hasn't gone green within a few minutes.

- [ ] **Step 3: On-device gate (user plays)**

Tell the user: play a real 20–30 min iPhone session (explore combat and/or Kanji Kombat — both leak paths are fixed), then submit an in-app bug report at the end, note e.g. "post-fix perf check". The report needs no bug — it's the telemetry carrier.

- [ ] **Step 4: Read the report and judge against the success criteria**

```bash
curl -s "https://jrpg-production.up.railway.app/api/bug-reports" | jq '.reports[0] | {note, timestamp, performance: {timeSinceLoad: .performance.timeSinceLoad, slowFrames: .performance.slowFrames, totalFrames: .performance.totalFrames, firstMinutes: .performance.frameBuckets[:5], lastMinutes: .performance.frameBuckets[-5:], textureStart: .performance.textureTimeline[:3], textureEnd: .performance.textureTimeline[-3:]}}'
```

Success (from the spec, vs the 2026-07-03 baseline ticket: ~48fps avg at 14 min):
1. `textureTimeline` plateaus — no monotonic growth,
2. last-5-min buckets ≈ first-5-min buckets (compare `b17/f` healthy ratio and `b33+b50+over` jank share),
3. user says it subjectively feels fixed.

- [ ] **Step 5: Contingency**

If the device session still degrades: textures climbing → a missed destroy site (find it — the timeline localizes when it grows); textures flat but frames degrading → different accumulator (thermal, DOM, other GPU growth) → new brainstorm with the new data. Either way the telemetry from Step 4 is the starting evidence.
