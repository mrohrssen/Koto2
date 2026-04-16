# Test Strategy Overhaul: Integration-Heavy Testing Trophy

**Date:** 2026-04-15
**Status:** Approved
**Problem:** Existing unit tests (~63% coverage) are mostly mock-wiring exercises that don't catch real bugs. No integration, visual regression, or e2e tests exist. The codebase feels fragile — bugs manifest as stale frontends (sprites in wrong state) and broken game states that only a refresh fixes. Most dev time goes to fixing bugs instead of building features.

## Philosophy

Follow the Testing Trophy model (Dodds/Google/Microsoft research): integration tests give the best bug-detection-per-maintenance-dollar. Unit tests that mock everything test the mocks, not the code. E2E tests catch the most but are expensive and flaky. The sweet spot is integration.

```
        /  E2E  \            few, critical path only
       / Integration \        most tests live here
      /  Unit (pure)   \      only pure logic, no mocks
     / Static Analysis   \    types, linting (free)
```

## Layer 1: Pure Unit Tests (Keep ~40% of Existing)

**Keep** tests for pure functions with no dependencies:
- Tokenizer, sentence renderer, word dictionary parsing
- Damage calculation, status effect math, SRS scheduling
- Bootstrap parser, kana state logic
- Any test where inputs go in, return value comes out, zero mocks

**Kill** tests that mostly validate their own mocks:
- Route tests that construct fake `req`/`res` — replaced by integration tests
- Narration generation tests that mock AI and assert the mock was called
- Vocab manager tests that inject `setTestCache()`
- Any test where >50% of setup is wiring mocks

**Triage rule:** If removing all mocks from a test leaves nothing to assert, the test dies.

## Layer 2: API Integration Tests (New, Bulk of Suite)

### Architecture

Boot a real Express app, hit real routes with HTTP requests, assert real responses. Mock only at the true external boundary.

**Real (not mocked):**
- Express app, middleware, route handlers
- Game state management (GameManager, state factories)
- Combat engine, creature services, item services
- Vocab manager, word dictionary, SRS logic
- File I/O (temp directories per test)

**Mocked (external boundaries only):**
- AI providers (Anthropic, OpenAI, Gemini) — return canned narration/dialogue
- VOICEVOX TTS — return fake audio buffers

JPDB API is no longer used and does not need mocking.

### Structure

```
tests/integration/
  helpers/
    test-app.js            ← factory: boots real Express with mocked externals
    api-client.js          ← thin wrapper: login, authenticated requests
  flows/
    exploration.test.js    ← enter area → navigate rooms → trigger events
    combat.test.js         ← start combat → execute turns → win/lose
    vocab-review.test.js   ← speed review room → answer words → state updates
    meta-progression.test.js ← level up → unlock areas → persist state
    pvp.test.js            ← matchmaking → combat → result
  api/
    auth.test.js           ← register → login → token refresh → invalid tokens
    game-state.test.js     ← new game → save → load → corrupt state recovery
    settings.test.js       ← read/write preferences
```

### Key file: test-app.js

Factory that creates a real Express app instance with external APIs stubbed at the boundary. Every test gets a fresh app and fresh temp data directory. No shared state between tests.

### Example test

```js
test('completing combat grants XP and updates creature state', async () => {
  const app = await createTestApp();
  const client = await app.loginAsNewUser();

  await client.post('/api/game/start-run', { areaId: 'test-area' });
  await client.post('/api/game/explore');

  const before = await client.get('/api/game/state');
  await client.post('/api/game/combat/move', { moveIndex: 0 });
  // ... execute turns until combat resolves

  const after = await client.get('/api/game/state');
  assert(after.player.xp > before.player.xp);
});
```

No mocked req/res. Real middleware. Real route handlers. Real game logic.

## Layer 3: Visual Regression (New)

Two sub-layers addressing different failure modes.

### 3a: State-Synchronized DOM Assertions

Playwright boots the app, navigates to key screens, reads game state from `window.__gameState`, and asserts the DOM matches. This catches stale frontends — the primary pain point.

**Examples:**
```js
// In combat: enemy sprites match game state
const enemySprites = page.locator('.creature-slot.enemy .creature-sprite:visible');
await expect(enemySprites).toHaveCount(state.enemies.length);

// In exploration: no combat UI present
await expect(page.locator('.combat-container')).not.toBeVisible();

// After combat ends: combat UI gone, exploration UI back
await expect(page.locator('.move-select')).not.toBeVisible();
await expect(page.locator('.scene-area')).toBeVisible();
```

**Key screens to assert:**

| Screen | Assertions |
|--------|------------|
| Area exploration | Background rendered, creature sprites in correct slots, no combat UI leaking |
| Combat (mid-turn) | Correct creatures visible, HP bars match state, status icons match effects, move UI present |
| Combat (ended) | Combat UI removed, exploration UI restored, no stale elements |
| Creature popup | Correct sprite, stats match state, move list matches creature |
| Speed review room | Cards rendered, vocab matches expected words |
| Party/collection | Creature grid matches collection state |
| Narration box | Text rendered, furigana present, word highlighting functional |

### 3b: Screenshot Baselines (Experimental)

Pixel-diff comparison against committed baseline PNGs (~500KB total for 6-8 screens). Detects visual regressions that DOM assertions can't catch (spacing, color, layout shifts).

**Status: experimental.** If baselines prove flaky or a maintenance burden, drop this sub-layer and rely entirely on DOM assertions. Update baselines with `npm run test:visual:update` when intentional visual changes ship.

## Layer 4: E2E Smoke Tests (New, Small)

5 tests covering the golden paths, including item/skill/equipment flows.

| Test | Path |
|------|------|
| New player flow | Register → first login → tutorial → enter first area |
| Exploration + loot | Enter area → navigate rooms → find items → equip equipment → use consumable → trigger combat |
| Combat + rewards | Start combat → select moves → execute turns → win → receive item/skill drop → creature learns skill → inventory updated |
| Speed review | Enter speed review room → answer vocab → complete → return to exploration |
| Meta-progression | Complete a run → gain XP → level up → unlock new content |

These are slow and serial (30-60s each). They boot the dev server, open Playwright, and play through flows by clicking and swiping like a real player.

**Tier 3 — not a CI gate.** Run on-demand (`npm run test:smoke`) or pre-ship. Too slow and timing-sensitive for CI.

## CI Integration

| Trigger | What runs | Time budget |
|---------|-----------|-------------|
| Every commit (CI) | Tier 1: pure unit tests | <15s |
| Every commit (CI) | Tier 2: API integration tests | <60s |
| Every commit (CI) | Tier 2: Visual regression (DOM assertions) | <60s |
| Pre-ship (manual) | Tier 3: E2E smoke tests | <5min |
| Pre-ship (manual) | Tier 3: Screenshot baselines (experimental) | <2min |

The existing ratcheting coverage floor stays, measured against the new suite. Coverage will drop temporarily when mock-heavy tests are killed — that's expected. The new integration tests cover real code paths.

## What This Catches

| Bug class | What catches it |
|-----------|----------------|
| API returns wrong shape / missing field | Integration tests (Layer 2) |
| Game stuck in bad state after action | Integration tests (Layer 2) |
| Combat turn logic produces wrong result | Integration tests (Layer 2) |
| Sprite visible when it shouldn't be | DOM assertions (Layer 3a) |
| UI from previous phase leaks through | DOM assertions (Layer 3a) |
| Visual layout/spacing regression | Screenshot baselines (Layer 3b, experimental) |
| Full game flow broken end-to-end | Smoke tests (Layer 4) |
| Item/skill/equipment drop doesn't persist | Smoke tests (Layer 4) |
| Pure math/parsing logic wrong | Unit tests (Layer 1) |

## What This Doesn't Catch

- Device-specific rendering (real mobile vs Playwright WebKit)
- AI response quality (narration coherence, vocab appropriateness)
- Performance regressions (load times, animation jank)
- Network failure handling (offline, timeouts)

These would require additional tooling (device farms, performance benchmarks, chaos testing) and are out of scope for this overhaul.
