# Kanji Kombat Session Log Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player on a subway with 1-2 minute connectivity gaps completes an entire Kanji Kombat session with every tap acknowledged within 250ms, by replacing the five overlapping client sync layers with one session model: server-issued runway (prompts + seed chain + pre-rolled wave) → client action log → batched checkpoint sync.

**Architecture:** Server pre-commits combat seeds (`combat.optimistic.turnSeeds`) and one pre-rolled wave so the client can simulate quiz turns ahead with full fidelity. The client appends every player action to an in-memory log and a single-flight syncer ships the log as one ordered batch to a new `POST /api/game/kanji-kombat/sync` endpoint, which replays entries deterministically, verifies transcript hashes, and returns one checkpoint. A Playwright "subway harness" is built first (red against current code) and is the acceptance gate.

**Tech Stack:** Node/Express, ES modules, `node --test` + c8, Playwright (WebKit/iPhone emulation), shared deterministic combat resolvers in `src/shared/`.

**Source spec:** `docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md`

---

## File Structure

- Create: `tests/smoke/kanji-kombat-subway.test.js` — Playwright subway harness (Phase 0 acceptance gate).
- Modify: `package.json` — add `test:subway` script.
- Modify: `src/game/services/kanji-kombat-service.js` — seed chain helpers, wave pre-roll, session epoch, `applySessionSync`.
- Modify: `src/game/loop.js:287-291` — expose `turnSeeds` in the `combat.optimistic` client whitelist.
- Modify: `src/routes/game/kanji-kombat.js` — add `POST /sync` route.
- Modify: `src/routes/game/state.js` — rotate session epoch on full state GET.
- Create: `public/js/ui/kanji-kombat-session.js` — client session module (log + syncer + pause/resume). Replaces `kanji-kombat-sync-queue.js`.
- Modify: `public/js/api.js` — add `syncKanjiKombatSession`.
- Modify: `public/js/ui/kanji-kombat.js` — render/consume via session module; delete consumed-prompt bookkeeping and null-response recovery.
- Modify: `public/js/ui/combat-loop.js` — quiz path simulates from seed chain, appends to log; delete `kanjiKombatQueuedVerificationPending`.
- Delete: `public/js/ui/kanji-kombat-sync-queue.js` and `tests/unit/ui/kanji-kombat-sync-queue.test.js`.
- Create: `tests/unit/game/kanji-kombat-seed-chain.test.js`, `tests/unit/game/kanji-kombat-wave-preroll.test.js`, `tests/unit/game/kanji-kombat-session-sync.test.js`, `tests/unit/ui/kanji-kombat-session.test.js`.
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`, `tests/unit/ui/combat-network-hardening.test.js`, `tests/unit/ui/optimistic-run-integration.test.js` — migrate to session model.

**Branch discipline:** Tasks 1-8 are additive and keep `npm test` green at every commit. Tasks 9-11 are the cutover and must land on the feature branch together — do not merge the branch to `dev` between Tasks 9 and 11.

---

## Task 0: Create Isolated Worktree

**Files:** none.

- [ ] **Step 1: Sync dev**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
```

Expected: fast-forward or up to date. If unrelated local changes block the pull, stop and report.

- [ ] **Step 2: Create the feature worktree**

```bash
/usr/bin/git worktree add ../koto-wt-kk-session-sync -b feature/kanji-kombat-session-sync
cd ../koto-wt-kk-session-sync
npm install
```

- [ ] **Step 3: Verify the spec and baseline tests**

```bash
test -f docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md && echo SPEC_OK
npm test
```

Expected: `SPEC_OK` and the full suite passes before any changes.

---

## Task 1: Subway Harness (Phase 0 — committed red)

The harness is an on-demand Playwright test (smoke tier — not part of `npm test`, so CI stays green while it is red). It plays a full Kanji Kombat session with the `devtester` account while toggling the browser context offline for 60s/75s windows, and asserts: every tap acknowledged ≤250ms, no prompt rendered twice, no blank action area, session reaches the daily report, and the server-side review count matches the cards answered.

**Files:**
- Create: `tests/smoke/kanji-kombat-subway.test.js`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Read the existing smoke conventions**

Read `tests/smoke/golden-path.test.js` and `tests/visual/playwright.config.js`. Note: baseURL `http://127.0.0.1:5173`, WebKit iPhone viewport, `webServer` auto-starts `npm run dev`, auth token seeded via `localStorage.authToken`, game state read through `window.__gameState` / `window.__gamePhase()`.

- [ ] **Step 2: Check devtester repeatability**

```bash
grep -n "kanjiKombat\|script" src/dev/dev-test-user.js | head -20
```

If `seed:dev-user` does not reset script-SRS daily state (see `getScriptDailyState` in `src/game/script-srs.js`), a second harness run on the same day would start at `complete_for_day`. If so, extend `src/dev/dev-test-user.js` to delete the devtester script-SRS store and kanji-kombat onboarding meta during seeding (follow how the script already resets run state), so each `npm run seed:dev-user` yields a fresh Kanji Kombat day. Commit that separately:

```bash
git add src/dev/dev-test-user.js
git commit -m "Reset Kanji Kombat daily state in dev seed"
```

- [ ] **Step 3: Write the harness**

Create `tests/smoke/kanji-kombat-subway.test.js`:

```js
import { test, expect } from '@playwright/test';

/**
 * Subway harness: plays a full Kanji Kombat session while the network
 * drops for 60-75s windows, the acceptance gate for the session-log-sync
 * rebuild (docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md).
 *
 * Run with: npm run test:subway   (seeds devtester first)
 *
 * EXPECTED RED before the rebuild lands: quiz answers block on per-turn
 * server verification, so taps during the offline window are ignored.
 */

const ACK_TIMEOUT_MS = 250;
const OFFLINE_WINDOWS = [
  { afterInteraction: 4, durationMs: 60_000 },
  { afterInteraction: 12, durationMs: 75_000 },
];
const MAX_INTERACTIONS = 120;

test.describe.serial('Kanji Kombat subway session', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser, request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { username: 'devtester', password: 'test1234' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { token } = await loginRes.json();

    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
    });
    page = await context.newPage();
    await page.addInitScript(authToken => {
      localStorage.setItem('authToken', authToken);
    }, token);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('completes a full session through two offline windows', async () => {
    test.setTimeout(600_000);

    // --- Start a Kanji Kombat run via API from inside the page ---
    const start = await page.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const stateRes = await fetch('/api/game/state', { headers });
      const state = await stateRes.json();
      const creatureId = state?.meta?.creatureCollection?.[0];
      const startRes = await fetch('/api/game/kanji-kombat/start', {
        method: 'POST',
        headers,
        body: JSON.stringify({ creatureId }),
      });
      const startBody = await startRes.json().catch(() => null);
      if (startBody?.state?.run?.kanjiKombat?.onboardingPending) {
        await fetch('/api/game/kanji-kombat/onboarding', {
          method: 'POST',
          headers,
          body: JSON.stringify({ knowsHiragana: false, knowsKatakana: false }),
        });
      }
      return { status: startRes.status };
    });
    expect(start.status).toBe(200);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => window.__gameState?.run?.mode === 'kanjiKombat',
      { timeout: 15_000 },
    );

    const seenPromptIds = [];
    let interactions = 0;
    let quizAnswers = 0;
    let introChoices = 0;
    let offlineIndex = 0;
    let sessionDone = false;

    const headPrompt = () => page.evaluate(() => {
      const kk = window.__gameState?.run?.kanjiKombat;
      const head = Array.isArray(kk?.promptBuffer) ? kk.promptBuffer[0] : null;
      return head
        ? { kind: head.kind, promptId: head.promptId }
        : (kk?.completionChoicePending ? { kind: 'completePrompt', promptId: null } : null);
    });

    while (!sessionDone && interactions < MAX_INTERACTIONS) {
      // Toggle scripted offline windows.
      const window_ = OFFLINE_WINDOWS[offlineIndex];
      if (window_ && interactions === window_.afterInteraction) {
        await context.setOffline(true);
        // Keep playing while offline; restoration is polled at the top of each loop pass.
        page.__restoreAt = Date.now() + window_.durationMs;
        offlineIndex += 1;
      }
      if (page.__restoreAt && Date.now() >= page.__restoreAt) {
        await context.setOffline(false);
        page.__restoreAt = null;
      }

      // Wait for an actionable prompt or buttons to be present.
      await page.waitForFunction(() => {
        const area = document.getElementById('action-area');
        return !!area && area.children.length > 0;
      }, { timeout: 30_000 });

      const prompt = await headPrompt();
      if (prompt?.promptId) {
        expect(seenPromptIds, `prompt ${prompt.promptId} rendered twice`)
          .not.toContain(prompt.promptId);
        seenPromptIds.push(prompt.promptId);
      }

      if (prompt?.kind === 'quiz') {
        const button = page.locator('.kanji-kombat-choice').first();
        await button.click();
        // Acknowledgment: feedback class within 250ms.
        await expect(button).toHaveClass(/correct-selected|wrong-selected/, {
          timeout: ACK_TIMEOUT_MS,
        });
        quizAnswers += 1;
        // Wait for combat playback to return control (next prompt rendered).
        await page.waitForFunction(
          () => document.querySelector('.kanji-kombat-choice, .kanji-kombat-intro-action, .kanji-kombat-completion-action'),
          { timeout: 30_000 },
        );
      } else if (prompt?.kind === 'intro') {
        const before = await page.evaluate(
          () => document.getElementById('action-area')?.innerHTML.length || 0,
        );
        await page.locator('.kanji-kombat-intro-action[data-choice="unknown"]').click();
        await page.waitForFunction(
          len => (document.getElementById('action-area')?.innerHTML.length || 0) !== len,
          before,
          { timeout: ACK_TIMEOUT_MS },
        );
        introChoices += 1;
      } else if (prompt?.kind === 'completePrompt') {
        // Make sure we end the session ONLINE so the final report can confirm.
        if (page.__restoreAt) {
          await page.waitForTimeout(page.__restoreAt - Date.now());
          await context.setOffline(false);
          page.__restoreAt = null;
        }
        await page.locator('.kanji-kombat-completion-action[data-keep-going="false"]').click();
        sessionDone = true;
        break;
      } else {
        // No actionable prompt: must be a soft pause or playback. Never a blank dead end.
        const hasContent = await page.evaluate(() => {
          const area = document.getElementById('action-area');
          const narration = document.querySelector('.narration-box, .narration');
          return (area && area.children.length > 0) || !!narration;
        });
        expect(hasContent, 'blank action area with no pause copy').toBeTruthy();
        await page.waitForTimeout(1000);
        continue;
      }
      interactions += 1;
    }

    expect(sessionDone, 'session never reached the completion prompt').toBeTruthy();

    // Final report must arrive once online.
    await page.waitForFunction(
      () => !!window.__gameState?.run?.kanjiKombat?.finalReport
        || !!window.__gameState?.run?.kanjiKombat?.report?.completedDaily,
      { timeout: 60_000 },
    );

    // Server truth must match what we played.
    const serverReport = await page.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const state = await res.json();
      return state?.run?.kanjiKombat?.report || null;
    });
    expect(serverReport).toBeTruthy();
    expect(serverReport.cardsReviewed).toBe(quizAnswers);
    expect(serverReport.newCardsIntroduced).toBe(introChoices);
  });
});
```

- [ ] **Step 4: Add the npm script**

In `package.json` scripts, after `"test:smoke:node"`:

```json
"test:subway": "npm run seed:dev-user && npx playwright test --config tests/visual/playwright.config.js tests/smoke/kanji-kombat-subway --workers=1",
```

- [ ] **Step 5: Run the harness and confirm it fails for the right reason**

```bash
npm run test:subway
```

Expected: FAIL. Failure mode should be a tap-acknowledgment timeout or a stalled prompt after the first offline answer (the `kanjiKombatQueuedVerificationPending` block), or the seenPromptIds/blank-area assertions. If it fails on setup (login, start, onboarding) instead, fix the harness until it fails on a *gameplay* assertion — that's the bug being reproduced. Iterate on selectors/timing here; the harness driver must be solid before the rebuild starts.

- [ ] **Step 6: Commit**

```bash
git add tests/smoke/kanji-kombat-subway.test.js package.json
git commit -m "Add Kanji Kombat subway harness (red)"
```

---

## Task 2: Server Seed Chain

`combat.optimistic` gains `turnSeeds` — an ordered array of pre-committed seeds with the invariant `turnSeeds[0] === nextTurnSeed`. Commits shift the chain instead of minting a fresh seed.

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `src/game/loop.js:287-291`
- Create: `tests/unit/game/kanji-kombat-seed-chain.test.js`

- [ ] **Step 1: Read the existing service test conventions**

Read the top 60 lines of `tests/unit/game/kanji-kombat-deck.test.js` and `tests/unit/game/kanji-kombat-run.test.js` to see how these tests import the service and construct game-manager fixtures. Mirror that style in the new test file.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/game/kanji-kombat-seed-chain.test.js` (adapt imports/fixtures to the conventions found in Step 1):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureKanjiKombatTurnSeeds,
  advanceKanjiKombatTurnSeeds,
  TURN_SEED_CHAIN_TARGET,
} from '../../../src/game/services/kanji-kombat-service.js';

function combatFixture() {
  return {
    optimistic: {
      combatId: 'cmb_test',
      stateVersion: 0,
      nextTurnSeed: 'seed0',
      acceptedActionIds: {},
    },
  };
}

test('ensureKanjiKombatTurnSeeds fills the chain to target with head === nextTurnSeed', () => {
  const combat = combatFixture();
  const seeds = ensureKanjiKombatTurnSeeds(combat);
  assert.equal(seeds.length, TURN_SEED_CHAIN_TARGET);
  assert.equal(seeds[0], 'seed0');
  assert.equal(combat.optimistic.nextTurnSeed, seeds[0]);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('ensureKanjiKombatTurnSeeds rebuilds when head diverges from nextTurnSeed', () => {
  const combat = combatFixture();
  combat.optimistic.turnSeeds = ['stale1', 'stale2'];
  const seeds = ensureKanjiKombatTurnSeeds(combat);
  assert.equal(seeds[0], 'seed0');
});

test('ensureKanjiKombatTurnSeeds is idempotent', () => {
  const combat = combatFixture();
  const first = ensureKanjiKombatTurnSeeds(combat).slice();
  const second = ensureKanjiKombatTurnSeeds(combat);
  assert.deepEqual(second, first);
});

test('advanceKanjiKombatTurnSeeds shifts the chain and bumps stateVersion', () => {
  const combat = combatFixture();
  const seeds = ensureKanjiKombatTurnSeeds(combat).slice();
  advanceKanjiKombatTurnSeeds(combat.optimistic);
  assert.equal(combat.optimistic.stateVersion, 1);
  assert.equal(combat.optimistic.nextTurnSeed, seeds[1]);
  assert.equal(combat.optimistic.turnSeeds[0], seeds[1]);
  assert.equal(combat.optimistic.turnSeeds.length, TURN_SEED_CHAIN_TARGET);
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
node --test tests/unit/game/kanji-kombat-seed-chain.test.js
```

Expected: FAIL — `ensureKanjiKombatTurnSeeds` is not exported.

- [ ] **Step 4: Implement the chain helpers**

In `src/game/services/kanji-kombat-service.js`, after the `createCombatId()` definition (~line 55), add:

```js
export const TURN_SEED_CHAIN_TARGET = 30;

export function ensureKanjiKombatTurnSeeds(combat, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  const optimistic = combat?.optimistic;
  if (!optimistic) return [];
  if (!Array.isArray(optimistic.turnSeeds)
    || optimistic.turnSeeds[0] !== optimistic.nextTurnSeed) {
    optimistic.turnSeeds = optimistic.nextTurnSeed ? [optimistic.nextTurnSeed] : [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  if (!optimistic.nextTurnSeed) optimistic.nextTurnSeed = optimistic.turnSeeds[0] || null;
  return optimistic.turnSeeds;
}

export function advanceKanjiKombatTurnSeeds(optimistic, { target = TURN_SEED_CHAIN_TARGET } = {}) {
  if (!optimistic) return;
  optimistic.stateVersion += 1;
  if (Array.isArray(optimistic.turnSeeds) && optimistic.turnSeeds[0] === optimistic.nextTurnSeed) {
    optimistic.turnSeeds.shift();
  } else {
    optimistic.turnSeeds = [];
  }
  while (optimistic.turnSeeds.length < target) {
    optimistic.turnSeeds.push(createServerSeed());
  }
  optimistic.nextTurnSeed = optimistic.turnSeeds[0];
}
```

- [ ] **Step 5: Use the chain in commits and wave spawns**

In `verifyAndCommitOptimisticAnswer` (~line 917-921), replace:

```js
    if (responseOptimistic === optimistic) {
      optimistic.stateVersion += 1;
      optimistic.nextTurnSeed = createServerSeed();
    }
```

with:

```js
    if (responseOptimistic === optimistic) {
      advanceKanjiKombatTurnSeeds(optimistic);
    } else {
      ensureKanjiKombatTurnSeeds(this.gm.combat);
    }
```

In `spawnNextWave()` (~line 1130-1135), after the `this.gm.combat.optimistic = { ... }` assignment, add:

```js
    ensureKanjiKombatTurnSeeds(this.gm.combat);
```

In `refillPromptBuffer(opts)` (~line 652), after the `fillKanjiKombatPromptBuffer` call and before `return prompts;`, add:

```js
    if (this.gm.combat?.mode === 'kanjiKombat') {
      ensureKanjiKombatTurnSeeds(this.gm.combat);
    }
```

Also check whether any other call site mints `nextTurnSeed` for kanji kombat:

```bash
grep -n "nextTurnSeed" src/game/services/*.js src/game/*.js | grep -v turnSeeds
```

For each kanji-kombat hit that assigns `nextTurnSeed = createServerSeed()` (e.g. inside `combat-cycle-service` wave handling, if present), follow the assignment with `ensureKanjiKombatTurnSeeds(...)` on the same combat object so the invariant holds. PvE creature combat call sites stay untouched.

- [ ] **Step 6: Expose `turnSeeds` to the client**

In `src/game/loop.js:287-291`, the optimistic whitelist:

```js
        optimistic: this.combat.optimistic ? {
          combatId: this.combat.optimistic.combatId,
          stateVersion: this.combat.optimistic.stateVersion,
          nextTurnSeed: this.combat.optimistic.nextTurnSeed,
          turnSeeds: this.combat.optimistic.turnSeeds || null
        } : null,
```

- [ ] **Step 7: Run tests**

```bash
node --test tests/unit/game/kanji-kombat-seed-chain.test.js && npm test
```

Expected: new tests PASS; full suite PASS (existing kanji tests must not regress — `nextTurnSeed` behavior is unchanged from their perspective).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Kanji Kombat turn seed chain"
```

---

## Task 3: Pre-Rolled Next Wave

The server rolls the next wave ahead of time and stores it on `kk.pendingNextWave`; `spawnNextWave()` consumes it when present. The client receives it via `run.kanjiKombat` (already passed through whole in `getState()`).

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Create: `tests/unit/game/kanji-kombat-wave-preroll.test.js`

- [ ] **Step 1: Find where waves spawn during answers**

```bash
grep -rn "spawnNextWave" src/game/ | grep -v test
```

Note every call site (expect: `startRunWithCreature`, `resolveCompletionChoice`, and the combat-cycle path that fires when all enemies die during an answer — likely in `src/game/services/combat-cycle-service.js` or via a callback). Each call site is a consumption point for the pre-roll.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/game/kanji-kombat-wave-preroll.test.js` (mirror the game-manager fixture conventions from `tests/unit/game/kanji-kombat-run.test.js` — the tests below express the required behavior; adapt construction to the existing fixture helper):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Adapt: import the same service/game-manager fixture used by kanji-kombat-run.test.js

test('prerollNextWave stores a complete pending wave', () => {
  const service = createKanjiKombatTestService(); // existing fixture helper
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  assert.ok(Array.isArray(pending.enemies) && pending.enemies.length > 0);
  assert.equal(pending.wave, service.gm.run.kanjiKombat.wave + 1);
  assert.ok(pending.combat.combatId.startsWith('cmb_'));
  assert.equal(pending.combat.stateVersion, 0);
  assert.ok(pending.combat.turnSeeds.length > 0);
  assert.equal(service.gm.run.kanjiKombat.pendingNextWave, pending);
});

test('prerollNextWave is idempotent for the same upcoming wave', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const first = service.prerollNextWave();
  const second = service.prerollNextWave();
  assert.equal(second, first);
});

test('spawnNextWave consumes a matching pre-rolled wave verbatim', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  service.gm.run.kanjiKombat.wave += 1; // simulate wave clear increment
  service.spawnNextWave();
  assert.equal(service.gm.combat.optimistic.combatId, pending.combat.combatId);
  assert.deepEqual(
    service.gm.combat.enemies.map(e => e.id),
    pending.enemies.map(e => e.id),
  );
  assert.equal(service.gm.run.kanjiKombat.pendingNextWave, null);
});

test('spawnNextWave discards a stale pre-roll for a different wave number', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  pending.wave = 999;
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.notEqual(service.gm.combat.optimistic.combatId, pending.combat.combatId);
});
```

Run: `node --test tests/unit/game/kanji-kombat-wave-preroll.test.js` — expected FAIL (`prerollNextWave` undefined).

- [ ] **Step 3: Implement**

In `KanjiKombatService`, refactor `spawnNextWave()` (~line 1091) by extracting the enemy roll into a helper, then add pre-roll support:

```js
  rollWaveEnemies(wave) {
    const isMiniboss = wave % 10 === 0;
    const highestLevel = Math.max(1, ...this.gm.run.creatureParty.active.map(c => c.level || 1));
    const areas = this.getUnlockedAreas();
    const stage = Math.max(1, ...areas.map(area => area.stage || 1));

    if (isMiniboss && this.buildBossPool().length > 0) {
      const bossIds = this.buildBossPool();
      const bossId = bossIds[Math.floor(Math.random() * bossIds.length)];
      const bossLevel = Math.round(getEnemyLevel({ totalEncounters: wave, enemyCount: 1 }) * 1.25);
      const boss = generateEnemyCreature(Math.max(highestLevel, bossLevel), [bossId], stage);
      boss.hp = boss.maxHp = Math.max(boss.maxHp * 2, boss.hp * 2);
      return { enemies: [boss], isMiniboss: true };
    }
    const maxEnemies = wave <= SOLO_OPENING_WAVES ? 1 : 3;
    const enemies = generateEnemyCreatures(highestLevel, {
      maxEnemies,
      creaturePool: this.buildEnemyPool(),
      stage,
      encounterIndex: wave - 1,
      totalEncounters: wave,
    });
    return { enemies, isMiniboss: false };
  }

  prerollNextWave() {
    const kk = this.gm.run?.kanjiKombat;
    if (!kk) return null;
    const upcomingWave = (kk.wave || 1) + 1;
    if (kk.pendingNextWave?.wave === upcomingWave) return kk.pendingNextWave;
    const rolled = this.rollWaveEnemies(upcomingWave);
    const turnSeeds = [];
    while (turnSeeds.length < TURN_SEED_CHAIN_TARGET) turnSeeds.push(createServerSeed());
    kk.pendingNextWave = {
      wave: upcomingWave,
      isMiniboss: rolled.isMiniboss,
      enemies: rolled.enemies,
      combat: {
        combatId: createCombatId(),
        stateVersion: 0,
        nextTurnSeed: turnSeeds[0],
        turnSeeds,
      },
    };
    return kk.pendingNextWave;
  }
```

Rewrite `spawnNextWave()` to consume the pre-roll:

```js
  spawnNextWave() {
    const kk = this.gm.run.kanjiKombat;
    const wave = kk.wave || 1;
    kk.waveReached = Math.max(kk.waveReached || 1, wave);

    const preroll = kk.pendingNextWave?.wave === wave ? kk.pendingNextWave : null;
    const rolled = preroll
      ? { enemies: preroll.enemies, isMiniboss: preroll.isMiniboss }
      : this.rollWaveEnemies(wave);
    kk.pendingNextWave = null;
    const enemies = rolled.enemies;
    kk.currentWaveIsMiniboss = rolled.isMiniboss;

    this.gm.combat = createCombatState(enemies[0]);
    this.gm.combat.mode = 'kanjiKombat';
    this.gm.combat.isCreatureCombat = true;
    this.gm.combat.isBoss = kk.currentWaveIsMiniboss;
    this.gm.combat.allies = this.gm.run.creatureParty.active;
    this.gm.combat.enemies = enemies;
    this.gm.combat.actionCursor = createPveOpeningCursor({ allies: this.gm.combat.allies, enemies });
    this.gm.combat.actionCount = 0;
    this.gm.combat.cycleCount = 0;
    this.gm.combat.optimistic = preroll
      ? { ...preroll.combat, acceptedActionIds: {} }
      : {
          combatId: createCombatId(),
          stateVersion: 0,
          nextTurnSeed: createServerSeed(),
          acceptedActionIds: {},
        };
    ensureKanjiKombatTurnSeeds(this.gm.combat);
    return enemies;
  }
```

Note the wave-number convention: today `spawnNextWave()` spawns for the *current* `kk.wave` value (wave increment happens at wave-clear, line ~1218 `kk.wave = (kk.wave || 1) + 1`). The pre-roll targets `kk.wave + 1` and is consumed after that increment. Verify against the call-site flow found in Step 1 — the test in Step 2 encodes this; if the increment order differs at a call site, align `prerollNextWave`'s `upcomingWave` with how `kk.wave` looks when `spawnNextWave()` actually runs, and fix the test to match reality.

Then make `refillPromptBuffer` keep the pre-roll fresh — append inside the `if (this.gm.combat?.mode === 'kanjiKombat')` block added in Task 2:

```js
      this.prerollNextWave();
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/unit/game/kanji-kombat-wave-preroll.test.js && npm test
```

Expected: PASS. Existing wave tests must still pass (fresh-roll path is byte-equivalent to the old behavior).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Pre-roll Kanji Kombat next wave"
```

---

## Task 4: Session Epoch

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `src/routes/game/state.js`
- Test: extend `tests/unit/game/kanji-kombat-seed-chain.test.js` (same fixture style)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game/kanji-kombat-seed-chain.test.js`:

```js
import { rotateKanjiKombatSessionEpoch } from '../../../src/game/services/kanji-kombat-service.js';

test('rotateKanjiKombatSessionEpoch mints and replaces the epoch', () => {
  const kk = { sessionEpoch: null };
  const first = rotateKanjiKombatSessionEpoch(kk);
  assert.match(first, /^kse_[0-9a-f]{16}$/);
  const second = rotateKanjiKombatSessionEpoch(kk);
  assert.notEqual(second, first);
  assert.equal(kk.sessionEpoch, second);
});
```

Run: `node --test tests/unit/game/kanji-kombat-seed-chain.test.js` — expected FAIL.

- [ ] **Step 2: Implement**

In `kanji-kombat-service.js` near `createServerSeed`:

```js
export function rotateKanjiKombatSessionEpoch(kk) {
  if (!kk) return null;
  kk.sessionEpoch = `kse_${randomBytes(8).toString('hex')}`;
  return kk.sessionEpoch;
}
```

Mint it at run start — in `startRunWithCreature`, right after `this.gm.run.kanjiKombat = createInitialKanjiKombatState();`:

```js
    rotateKanjiKombatSessionEpoch(this.gm.run.kanjiKombat);
```

Rotate on full state GET — read `src/routes/game/state.js` first, then in the `GET /state` handler before responding:

```js
    if (req.gameManager.run?.mode === 'kanjiKombat' && req.gameManager.run?.active) {
      rotateKanjiKombatSessionEpoch(req.gameManager.run.kanjiKombat);
      req.saveGame();
    }
```

(`sessionEpoch` reaches the client automatically because `getState()` passes `run.kanjiKombat` through whole.)

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/unit/game/kanji-kombat-seed-chain.test.js && npm test
git add -A
git commit -m "Add Kanji Kombat session epoch"
```

---

## Task 5: Batch Sync Service Method

`applySessionSync({ sessionEpoch, entries })` replays an ordered batch. Per entry: ledger replay → validate → commit → advance chain. First failure stops the batch with a correction.

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Create: `tests/unit/game/kanji-kombat-session-sync.test.js`

Entry shape (client → server):

```js
{ seq, actionId, kind: 'intro'|'quiz'|'completionChoice',
  promptId, sequence, cardId,
  choice?,        // intro: 'known'|'unknown'
  answerId?,      // quiz
  predictedHash?, // quiz
  keepGoing? }    // completionChoice
```

Return shape:

```js
{ status: 'ok'|'corrected', confirmedThroughSeq, results: [{ seq, actionId, replayed?, ...committedFields }],
  reason?, rejectedSeq?, sessionEpoch }
```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/game/kanji-kombat-session-sync.test.js` using the same service fixture as Tasks 2-3. Helper to build a valid quiz entry from the live buffer head:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
// Adapt: same fixture helper as kanji-kombat-wave-preroll.test.js

let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  return `run_sessiontest${String(actionCounter).padStart(8, '0')}`; // must satisfy isActionId
}

function quizEntryFromHead(service, seq, { correct = true } = {}) {
  const kk = service.gm.run.kanjiKombat;
  const head = kk.promptBuffer[0];
  assert.equal(head.kind, 'quiz');
  const choice = head.quiz.choices.find(c => c.correct === correct);
  const seed = service.gm.combat.optimistic.nextTurnSeed;
  const resolved = resolveKanjiKombatAnswerTurn(
    { combat: service.gm.combat, run: service.gm.run, answerCorrect: correct },
    { seed },
  );
  return {
    seq,
    actionId: nextActionId(),
    kind: 'quiz',
    promptId: head.promptId,
    sequence: head.sequence,
    cardId: head.cardId,
    answerId: choice.id,
    predictedHash: hashTranscript(resolved.transcript),
  };
}

test('applySessionSync commits an ordered quiz batch and confirms through the last seq', () => {
  const service = createKanjiKombatTestService();
  // Arrange a buffer whose first two heads are quizzes (advance through intros first if needed).
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  const entry1 = quizEntryFromHead(service, 1);
  // entry2 must be predicted from post-entry1 state; build it after a dry-run apply
  const result1 = service.applySessionSync({ sessionEpoch: epoch, entries: [entry1] });
  assert.equal(result1.status, 'ok');
  assert.equal(result1.confirmedThroughSeq, 1);
  const entry2 = quizEntryFromHead(service, 2);
  const result2 = service.applySessionSync({ sessionEpoch: epoch, entries: [entry2] });
  assert.equal(result2.status, 'ok');
  assert.equal(result2.confirmedThroughSeq, 2);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 2);
});

test('applySessionSync replays duplicate actionIds without double grading', () => {
  const service = createKanjiKombatTestService();
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  const entry = quizEntryFromHead(service, 1);
  service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  const reviewed = service.gm.run.kanjiKombat.report.cardsReviewed;
  const replay = service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  assert.equal(replay.status, 'ok');
  assert.equal(replay.confirmedThroughSeq, 1);
  assert.equal(replay.results[0].replayed, true);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, reviewed);
});

test('applySessionSync rejects a stale session epoch', () => {
  const service = createKanjiKombatTestService();
  const entry = quizEntryFromHead(service, 1);
  const result = service.applySessionSync({ sessionEpoch: 'kse_stale', entries: [entry] });
  assert.equal(result.status, 'corrected');
  assert.equal(result.reason, 'session_epoch_mismatch');
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 0);
});

test('applySessionSync stops at the first invalid entry and reports rejectedSeq', () => {
  const service = createKanjiKombatTestService();
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  const good = quizEntryFromHead(service, 1);
  const bad = { ...quizEntryFromHead(service, 2), promptId: 'kkp_wrong', seq: 2 };
  // bad is built from pre-good state on purpose: its promptId will not match after good commits
  const result = service.applySessionSync({ sessionEpoch: epoch, entries: [good, bad] });
  assert.equal(result.status, 'corrected');
  assert.equal(result.confirmedThroughSeq, 1);
  assert.equal(result.rejectedSeq, 2);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 1);
});

test('applySessionSync commits intro and completion entries', () => {
  const service = createKanjiKombatTestService();
  // Arrange the buffer so the head is an intro (fixture-dependent), then:
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  const head = service.gm.run.kanjiKombat.promptBuffer[0];
  assert.equal(head.kind, 'intro');
  const result = service.applySessionSync({
    sessionEpoch: epoch,
    entries: [{
      seq: 1,
      actionId: nextActionId(),
      kind: 'intro',
      promptId: head.promptId,
      sequence: head.sequence,
      cardId: head.cardId,
      choice: 'unknown',
    }],
  });
  assert.equal(result.status, 'ok');
  assert.equal(service.gm.run.kanjiKombat.report.newCardsIntroduced, 1);
});
```

Adapt fixture arrangement (quiz-first vs intro-first head) to what `createKanjiKombatTestService` actually produces — assert the head kind explicitly so the tests are self-diagnosing. Run: expected FAIL (`applySessionSync` undefined).

- [ ] **Step 2: Implement `applySessionSync`**

Add imports at the top of `kanji-kombat-service.js`:

```js
import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from './action-ledger-service.js';
```

(Verify the relative path: `ls src/game/services/action-ledger-service.js`.)

Add to `KanjiKombatService`:

```js
  applySessionEntry(entry) {
    const kk = this.gm.run?.kanjiKombat;
    if (!kk) throw new Error('no_active_kanji_kombat_run');
    const promptRef = {
      promptId: entry.promptId,
      sequence: entry.sequence,
      cardId: entry.cardId,
    };

    if (entry.kind === 'intro') {
      if (!entry.cardId || !['known', 'unknown'].includes(entry.choice)) {
        throw new Error('invalid_intro_entry');
      }
      return this.submitIntroChoice(entry.cardId, entry.choice, promptRef);
    }

    if (entry.kind === 'completionChoice') {
      if (typeof entry.keepGoing !== 'boolean') throw new Error('invalid_completion_entry');
      return this.resolveCompletionChoice(entry.keepGoing, promptRef);
    }

    if (entry.kind === 'quiz') {
      const optimistic = this.gm.combat?.optimistic;
      if (!optimistic) throw new Error('missing_optimistic_state');
      const prompt = validateKanjiKombatPromptHead(kk, { ...promptRef, kind: 'quiz' });
      const choice = prompt.quiz.choices.find(option => option.id === entry.answerId);
      if (!choice) throw new Error('invalid_kanji_answer');

      const seed = optimistic.nextTurnSeed;
      const resolvedCore = resolveKanjiKombatAnswerTurn(
        { combat: this.gm.combat, run: this.gm.run, answerCorrect: choice.correct === true },
        { seed },
      );
      const hashMatches = hashTranscript(resolvedCore.transcript) === entry.predictedHash;

      const committed = this.submitAnswer(entry.answerId, {
        promptRef: { promptId: prompt.promptId, sequence: prompt.sequence, cardId: prompt.cardId },
        rng: createSeededRng(seed),
        xpRng: createSeededRng(`${seed}:xp`),
        deferXpAwards: true,
      });
      const responseOptimistic = this.gm.combat?.optimistic || optimistic;
      if (responseOptimistic === optimistic) {
        advanceKanjiKombatTurnSeeds(optimistic);
      } else {
        ensureKanjiKombatTurnSeeds(this.gm.combat);
      }
      if (!hashMatches) {
        const error = new Error('transcript_mismatch');
        error.committed = committed;
        throw error;
      }
      return committed;
    }

    throw new Error(`unsupported_session_entry:${entry.kind}`);
  }

  applySessionSync({ sessionEpoch, entries = [] } = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    if (!kk) throw new Error('no_active_kanji_kombat_run');
    if (!sessionEpoch || sessionEpoch !== kk.sessionEpoch) {
      return {
        status: 'corrected',
        reason: 'session_epoch_mismatch',
        confirmedThroughSeq: null,
        rejectedSeq: entries[0]?.seq ?? null,
        results: [],
        sessionEpoch: kk.sessionEpoch,
      };
    }

    const ledgerOwner = this.gm.meta;
    const results = [];
    let confirmedThroughSeq = null;

    for (const entry of entries) {
      const existing = isActionId(entry.actionId)
        ? getActionLedgerEntry(ledgerOwner, entry.actionId)
        : null;
      if (existing?.response) {
        results.push({ seq: entry.seq, actionId: entry.actionId, replayed: true });
        confirmedThroughSeq = entry.seq;
        continue;
      }

      let committed;
      try {
        committed = this.applySessionEntry(entry);
      } catch (error) {
        // transcript_mismatch still committed the grade — confirm the entry,
        // but stop the batch so the client snaps to authoritative state.
        if (error?.committed) {
          confirmedThroughSeq = entry.seq;
          if (isActionId(entry.actionId)) {
            rememberActionLedgerResult(ledgerOwner, {
              actionId: entry.actionId,
              actionType: 'kanjiKombat.sessionEntry',
              response: { seq: entry.seq, corrected: true },
            });
          }
        }
        return {
          status: 'corrected',
          reason: error?.message || 'session_entry_failed',
          confirmedThroughSeq,
          rejectedSeq: entry.seq,
          results,
          sessionEpoch: kk.sessionEpoch,
        };
      }

      const result = { seq: entry.seq, actionId: entry.actionId, ...committed };
      results.push(result);
      confirmedThroughSeq = entry.seq;
      if (isActionId(entry.actionId)) {
        rememberActionLedgerResult(ledgerOwner, {
          actionId: entry.actionId,
          actionType: 'kanjiKombat.sessionEntry',
          response: { seq: entry.seq, accepted: true },
        });
      }
    }

    this.refillPromptBuffer();
    return {
      status: 'ok',
      confirmedThroughSeq,
      results,
      sessionEpoch: kk.sessionEpoch,
    };
  }
```

Note: `rememberActionLedgerResult` stores a minimal response (not the full committed payload) — the batch response carries the full per-entry results; replays only need to dedupe, and full responses would bloat the persisted ledger. Verify `rememberActionLedgerResult`/`getActionLedgerEntry` signatures in `src/game/services/action-ledger-service.js` and adapt if they differ.

- [ ] **Step 3: Run tests**

```bash
node --test tests/unit/game/kanji-kombat-session-sync.test.js && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add Kanji Kombat session batch sync"
```

---

## Task 6: Sync Route

**Files:**
- Modify: `src/routes/game/kanji-kombat.js`
- Create: `tests/integration/flows/kanji-kombat-sync.test.js`

- [ ] **Step 1: Add the route**

In `createKanjiKombatRoutes()`, after the `/prompt-buffer/refill` route:

```js
  router.post('/sync', (req, res) => {
    const { sessionEpoch, entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }
    const snapshot = snapshotGameManager(req.gameManager);
    try {
      const result = req.gameManager.kanjiKombatService.applySessionSync({ sessionEpoch, entries });
      req.saveGame();
      const state = req.getEnrichedGameState();
      if (result.status === 'corrected') {
        return res.json({ ...result, authoritativeState: state, state });
      }
      return res.json({ ...result, state });
    } catch (error) {
      restoreGameManager(req.gameManager, snapshot);
      return res.status(409).json({
        status: 'corrected',
        reason: error.message,
        confirmedThroughSeq: null,
        authoritativeState: req.getEnrichedGameState(),
      });
    }
  });
```

(`snapshotGameManager`/`restoreGameManager` are already imported in this file.)

- [ ] **Step 2: Write the integration test**

Read one existing test in `tests/integration/flows/` first and mirror its app/auth bootstrapping. The test must cover, against a real Express app:

```js
// 1. Start a kanji kombat run, complete onboarding, read state.
// 2. Build two valid quiz entries (using resolveKanjiKombatAnswerTurn + hashTranscript
//    against the state returned by the API, consuming turnSeeds[0] then turnSeeds[1]
//    with stateVersion advancing locally between them).
// 3. POST /api/game/kanji-kombat/sync with both entries in one batch:
//    expect status 'ok', confirmedThroughSeq === 2, state.run.kanjiKombat.report.cardsReviewed === 2.
// 4. POST the same batch again: expect 'ok', both results replayed, cardsReviewed still 2.
// 5. POST a batch with a stale sessionEpoch: expect 'corrected' with reason 'session_epoch_mismatch'.
```

Each numbered behavior is one `test(...)` with real assertions, modeled on the neighboring flow test's request helper.

- [ ] **Step 3: Run and commit**

```bash
npm run test:integration && npm test
git add -A
git commit -m "Add Kanji Kombat sync route"
```

---

## Task 7: Client Session Module

**Files:**
- Create: `public/js/ui/kanji-kombat-session.js`
- Create: `tests/unit/ui/kanji-kombat-session.test.js`

- [ ] **Step 1: Write the failing tests**

Mirror the style of `tests/unit/ui/kanji-kombat-sync-queue.test.js` (injectable `schedule`/`cancel`, fake `syncRequest`). Create `tests/unit/ui/kanji-kombat-session.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKanjiKombatSession,
  KK_SESSION_HARD_CAP,
  KK_SESSION_RESUME_AT,
  KK_SYNC_RETRY_DELAYS_MS,
} from '../../../public/js/ui/kanji-kombat-session.js';

function makeManualScheduler() {
  const timers = [];
  return {
    schedule: (fn, delay) => { timers.push({ fn, delay }); return timers.length - 1; },
    cancel: id => { if (timers[id]) timers[id].fn = null; },
    fire: async () => {
      const pending = timers.splice(0);
      for (const t of pending) if (t.fn) await t.fn();
    },
    delays: () => timers.map(t => t.delay),
  };
}

function okResponse(confirmedThroughSeq, overrides = {}) {
  return { status: 'ok', confirmedThroughSeq, results: [], ...overrides };
}

test('recordAction batches rapid entries into one sync request', async () => {
  const calls = [];
  const scheduler = makeManualScheduler();
  const session = createKanjiKombatSession({
    syncRequest: async payload => { calls.push(payload); return okResponse(payload.entries.at(-1).seq); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'intro', actionId: 'run_a1', cardId: 'hiragana:あ', choice: 'unknown' });
  session.recordAction({ kind: 'intro', actionId: 'run_a2', cardId: 'hiragana:い', choice: 'unknown' });
  await scheduler.fire(); // debounce fires once
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entries.length, 2);
  assert.deepEqual(calls[0].entries.map(e => e.seq), [1, 2]);
  assert.equal(session.pendingCount(), 0);
});

test('confirmed entries drop; unconfirmed remain and resync', async () => {
  const scheduler = makeManualScheduler();
  let respondWith = okResponse(1);
  const calls = [];
  const session = createKanjiKombatSession({
    syncRequest: async payload => { calls.push(payload); return respondWith; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'intro', actionId: 'run_a1' });
  session.recordAction({ kind: 'intro', actionId: 'run_a2' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 1); // seq 2 unconfirmed
  respondWith = okResponse(2);
  await scheduler.fire(); // immediate follow-up drain
  assert.equal(session.pendingCount(), 0);
});

test('network failure retries with backoff and keeps the log', async () => {
  const scheduler = makeManualScheduler();
  let failures = 0;
  const session = createKanjiKombatSession({
    syncRequest: async () => { failures += 1; throw new Error('offline'); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  await scheduler.fire(); // debounce → first attempt fails
  assert.equal(session.pendingCount(), 1);
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[0]);
  await scheduler.fire(); // retry 1 fails
  assert.equal(scheduler.delays()[0], KK_SYNC_RETRY_DELAYS_MS[1]);
  assert.ok(failures >= 2);
});

test('hard cap pauses and resumes after draining below the resume mark', async () => {
  const scheduler = makeManualScheduler();
  let paused = 0;
  let resumed = 0;
  let allowSync = false;
  const session = createKanjiKombatSession({
    syncRequest: async payload => {
      if (!allowSync) throw new Error('offline');
      return okResponse(payload.entries.at(-1).seq);
    },
    onPause: () => { paused += 1; },
    onResume: () => { resumed += 1; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  for (let i = 0; i < KK_SESSION_HARD_CAP; i++) {
    const result = session.recordAction({ kind: 'quiz', actionId: `run_q${i}` });
    assert.equal(result.accepted, true);
  }
  assert.equal(session.canConsumePrompt(), false);
  const rejected = session.recordAction({ kind: 'quiz', actionId: 'run_overflow' });
  assert.equal(rejected.accepted, false);
  assert.equal(paused, 1);
  allowSync = true;
  await scheduler.fire();
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0);
  assert.equal(resumed, 1);
});

test('corrected response clears the log and notifies', async () => {
  const scheduler = makeManualScheduler();
  let correction = null;
  const session = createKanjiKombatSession({
    syncRequest: async () => ({
      status: 'corrected',
      reason: 'transcript_mismatch',
      confirmedThroughSeq: 1,
      authoritativeState: { run: { kanjiKombat: { sessionEpoch: 'kse_new' } } },
    }),
    onCorrection: response => { correction = response; },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.adoptServerState({ run: { kanjiKombat: { sessionEpoch: 'kse_old' } } });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  session.recordAction({ kind: 'quiz', actionId: 'run_q2' });
  await scheduler.fire();
  assert.equal(session.pendingCount(), 0);
  assert.equal(correction.reason, 'transcript_mismatch');
});

test('reset abandons in-flight responses', async () => {
  const scheduler = makeManualScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const session = createKanjiKombatSession({
    syncRequest: async () => { await gate; return okResponse(1); },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  session.recordAction({ kind: 'quiz', actionId: 'run_q1' });
  const draining = scheduler.fire();
  session.reset();
  release();
  await draining;
  assert.equal(session.pendingCount(), 0); // reset cleared; stale response ignored
});
```

Run: `node --test tests/unit/ui/kanji-kombat-session.test.js` — expected FAIL (module missing).

- [ ] **Step 2: Implement the module**

Create `public/js/ui/kanji-kombat-session.js`:

```js
export const KK_SESSION_HARD_CAP = 50;
export const KK_SESSION_RESUME_AT = 40;
export const KK_SYNC_DEBOUNCE_MS = 300;
export const KK_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

function defaultSchedule(fn, delay) {
  const timer = setTimeout(fn, delay);
  timer?.unref?.();
  return timer;
}

function notify(callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    console.error('[KanjiKombat] session callback failed', error);
  }
}

export function createKanjiKombatSession({
  syncRequest,
  onCheckpoint = () => {},
  onCorrection = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = id => clearTimeout(id),
} = {}) {
  if (typeof syncRequest !== 'function') throw new Error('syncRequest function required');

  let log = [];
  let nextSeq = 1;
  let sessionEpoch = null;
  let syncing = false;
  let debounceTimer = null;
  let retryTimer = null;
  let attempts = 0;
  let paused = false;
  let generation = 0;

  function pendingCount() { return log.length; }
  function canConsumePrompt() { return log.length < KK_SESSION_HARD_CAP; }
  function isPaused() { return paused; }

  function adoptServerState(state) {
    const epoch = state?.run?.kanjiKombat?.sessionEpoch;
    if (epoch) sessionEpoch = epoch;
  }

  function clearTimers() {
    if (debounceTimer != null) { cancel(debounceTimer); debounceTimer = null; }
    if (retryTimer != null) { cancel(retryTimer); retryTimer = null; }
  }

  function maybeResume() {
    if (paused && log.length <= KK_SESSION_RESUME_AT) {
      paused = false;
      notify(onResume, { pendingCount: log.length });
    }
  }

  function enterPause(reason) {
    if (paused) return;
    paused = true;
    notify(onPause, { pendingCount: log.length, reason });
  }

  function scheduleDrain(delay) {
    if (debounceTimer != null) cancel(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      void drain();
    }, delay);
  }

  function scheduleRetry() {
    if (retryTimer != null) cancel(retryTimer);
    const index = Math.min(attempts, KK_SYNC_RETRY_DELAYS_MS.length - 1);
    attempts += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      void drain();
    }, KK_SYNC_RETRY_DELAYS_MS[index]);
  }

  async function drain() {
    if (syncing || log.length === 0) return;
    const myGeneration = generation;
    syncing = true;
    const entries = log.map(item => ({ ...item }));
    try {
      const response = await syncRequest({ sessionEpoch, entries });
      if (myGeneration !== generation) return;
      if (!response || (response.status !== 'ok' && response.status !== 'corrected')) {
        throw new Error(response?.error || 'kanji kombat sync failed');
      }
      attempts = 0;
      adoptServerState(response.state || response.authoritativeState);
      if (response.sessionEpoch) sessionEpoch = response.sessionEpoch;

      if (response.status === 'corrected') {
        log = [];
        notify(onCorrection, response);
      } else {
        const confirmed = Number.isInteger(response.confirmedThroughSeq)
          ? response.confirmedThroughSeq
          : -1;
        log = log.filter(item => item.seq > confirmed);
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
      }
      maybeResume();
      if (log.length > 0) scheduleDrain(0);
    } catch {
      if (myGeneration !== generation) return;
      scheduleRetry();
    } finally {
      if (myGeneration === generation) syncing = false;
    }
  }

  function recordAction(entry) {
    if (log.length >= KK_SESSION_HARD_CAP) {
      enterPause('hardCap');
      return { accepted: false, pendingCount: log.length };
    }
    log.push({ createdAt: Date.now(), ...entry, seq: nextSeq++ });
    if (log.length >= KK_SESSION_HARD_CAP) enterPause('hardCap');
    scheduleDrain(KK_SYNC_DEBOUNCE_MS);
    return { accepted: true, pendingCount: log.length };
  }

  function syncNow() {
    if (retryTimer != null) { cancel(retryTimer); retryTimer = null; }
    attempts = 0;
    scheduleDrain(0);
  }

  function reset() {
    generation += 1;
    clearTimers();
    log = [];
    nextSeq = 1;
    sessionEpoch = null;
    syncing = false;
    attempts = 0;
    paused = false;
  }

  return {
    adoptServerState,
    recordAction,
    syncNow,
    drain,
    pendingCount,
    canConsumePrompt,
    isPaused,
    reset,
    snapshot: () => log.map(item => ({ ...item })),
  };
}

let activeSession = null;

export function configureKanjiKombatSession(options = {}) {
  activeSession?.reset();
  activeSession = createKanjiKombatSession(options);
  return activeSession;
}

export function getKanjiKombatSession() {
  return activeSession;
}

export function resetKanjiKombatSession() {
  activeSession?.reset();
  activeSession = null;
}
```

- [ ] **Step 3: Run tests, syntax check, commit**

```bash
node --check public/js/ui/kanji-kombat-session.js && echo OK
node --test tests/unit/ui/kanji-kombat-session.test.js && npm test
git add -A
git commit -m "Add Kanji Kombat client session module"
```

---

## Task 8: Client API Function

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Find the existing kanji API helpers**

```bash
grep -n "kanji-kombat" public/js/api.js
```

- [ ] **Step 2: Add the sync call**

Next to the existing kanji-kombat API functions, following the exact fetch/auth pattern used by the prompt-buffer refill helper found in Step 1:

```js
export async function syncKanjiKombatSession({ sessionEpoch, entries }) {
  return apiPost('/api/game/kanji-kombat/sync', { sessionEpoch, entries });
}
```

(Adapt `apiPost` to whatever request helper the neighboring functions actually use — same error semantics: a non-2xx with a JSON body containing `status: 'corrected'` must resolve with that body, not throw, matching how `submitKanjiKombatAnswer` handles 409 corrections today. Check that handling with `grep -n "409\|corrected" public/js/api.js`.)

- [ ] **Step 3: Syntax check and commit**

```bash
node --check public/js/api.js && echo OK
git add public/js/api.js
git commit -m "Add Kanji Kombat session sync API"
```

---

## Task 9: Cutover — Intro/Completion/Render Through the Session (do not merge to dev until Task 11)

**Files:**
- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: wiring site that calls `initKanjiKombatUI` (find with `grep -rn "initKanjiKombatUI" public/js/`)

- [ ] **Step 1: Rewire init**

In `kanji-kombat.js`: replace the `kanji-kombat-sync-queue.js` import with:

```js
import {
  configureKanjiKombatSession,
  getKanjiKombatSession,
} from './kanji-kombat-session.js';
import { createActionId } from '../../../src/shared/action-protocol.js';
```

Replace `initKanjiKombatUI`'s queue construction (`reviewSyncQueue = createReviewSyncQueue()` and the `__testQueueSeed` block) with:

```js
  configureKanjiKombatSession({
    syncRequest: payload => api.syncSession(payload),
    onCheckpoint: handleSessionCheckpoint,
    onCorrection: handleSessionCorrection,
    onPause: () => { void showKanjiKombatSyncPause(); },
  });
  getKanjiKombatSession().adoptServerState(currentKanjiKombatState());
```

Add `syncSession: null` to `DEFAULT_API` and pass `syncKanjiKombatSession` from the wiring site found above. Keep the `online`/`visibilitychange` listeners but point them at `getKanjiKombatSession()?.syncNow()`.

Add the two handlers (replacing the old `onAccepted`/`onCorrected` queue callbacks):

```js
function handleSessionCheckpoint(response, { logEmpty } = {}) {
  if (response?.state && logEmpty) updateKanjiKombatGameState(response.state);
  const finalResult = (response?.results || []).findLast?.(result => result.combatEnded)
    || (response?.results || []).slice().reverse().find(result => result.combatEnded);
  if (finalResult) {
    api.finishCombatResult?.({ ...finalResult, state: response.state });
    return;
  }
  requestPromptBufferRefillIfLow(response?.state || currentKanjiKombatState());
}

function handleSessionCorrection(response) {
  const state = response?.authoritativeState || response?.state;
  if (state) updateKanjiKombatGameState(state);
  refreshKanjiKombatAction();
}
```

Spec rule — corrections must not snap mid-animation: before applying, wait for combat playback to finish. Find the existing animation-active accessor with `grep -n "combatAnimationActive\|getCombatAnimationActive" public/js/ui/combat-loop.js public/js/game.js`, expose it to kanji-kombat.js through the API deps (like `finishCombatResult`), and gate `handleSessionCorrection` on it:

```js
async function handleSessionCorrection(response) {
  while (api.isCombatAnimationActive?.()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = response?.authoritativeState || response?.state;
  if (state) updateKanjiKombatGameState(state);
  refreshKanjiKombatAction();
}
```

- [ ] **Step 2: Route intro/completion choices through the log**

In `renderKanjiKombatAction`, replace the completion `onChoice` body's queue usage. The draft logic stays; the enqueue becomes:

```js
        const session = getKanjiKombatSession();
        if (!session?.canConsumePrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const draft = structuredClone(gameState);
        if (bufferedPrompt?.kind === 'completePrompt') {
          consumePromptHeadDraft(draft, bufferedPrompt);
        } else {
          draft.run.kanjiKombat.completionChoicePending = false;
        }
        if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
        updateKanjiKombatGameState(draft);

        session.recordAction({
          actionId: createActionId('kk'),
          kind: 'completionChoice',
          promptId: bufferedPrompt?.promptId || null,
          sequence: bufferedPrompt?.sequence ?? null,
          cardId: null,
          keepGoing,
        });

        if (!keepGoing) {
          renderKanjiKombatPendingCompletion();
          session.syncNow();
          return true;
        }
        if (!renderKanjiKombatAction(draft)) clearActionArea();
        return true;
```

Add the pending-completion shell:

```js
function renderKanjiKombatPendingCompletion() {
  const root = actionArea();
  if (!root) return;
  root.innerHTML = `
    <div class="kanji-kombat-completion">
      <div class="kanji-kombat-completion-card">
        <div class="kanji-kombat-completion-title">Saving your session…</div>
      </div>
    </div>
  `;
}
```

The final report renders when the checkpoint arrives: in `handleSessionCheckpoint`, the `finalResult.combatEnded` branch covers it (the `stop` entry's committed result includes `kanjiKombatReport` from `finalizeDailyComplete`).

Same restructure for the intro `onChoice`: drop `createKanjiKombatPendingAction`, build the draft with `structuredClone(gameState)` + `consumePromptHeadDraft(draft, introPrompt)` (or `draft.run.kanjiKombat.pendingIntro = null` for the legacy-field case while it still exists), `updateKanjiKombatGameState(draft)`, then:

```js
        session.recordAction({
          actionId: createActionId('kk'),
          kind: 'intro',
          promptId: introPrompt?.promptId || null,
          sequence: introPrompt?.sequence ?? null,
          cardId: introCard.id,
          choice,
        });
        if (!renderKanjiKombatAction(draft)) clearActionArea();
        return true;
```

Delete from this file: `createKanjiKombatPendingAction`, the `createPendingRunAction` import, `settleImmediateReviewSync`, `createSeededReviewSyncQueue`, `createReviewSyncQueue`, `rememberConsumedPrompt`, `consumedPromptIds`, `stateWouldReplayConsumedPrompt`, `applyServerStateIfNotBehindLocalProgress` (replace its uses with direct `updateKanjiKombatGameState` inside the checkpoint/correction handlers, which already guard via `logEmpty`), `recoverFromNullKanjiKombatResponse`, and the no-prompt `reviewSyncQueue?.pendingCount()` tail block — replace that tail with:

```js
  if (!hasBufferedPrompt && getKanjiKombatSession()?.pendingCount() > 0) {
    clearActionArea();
    void showKanjiKombatSyncPause();
    return true;
  }
```

- [ ] **Step 3: Migrate `tests/unit/ui/kanji-kombat-ui.test.js`**

Read the file; it currently builds fake queues via `__testQueueSeed` and asserts queue semantics. Rewrite the affected groups:

- Tests asserting "intro choice enqueues a sync item" → assert `getKanjiKombatSession().snapshot()` contains an entry `{ kind: 'intro', cardId, choice }` and that the rendered prompt advanced.
- Tests asserting "consumed prompt does not replay on stale state" → now structural: assert that after `recordAction`, a checkpoint response with `logEmpty: false` does **not** call `updateGameState` (the `handleSessionCheckpoint` guard).
- Tests asserting queue hard-limit pause copy → seed the session by calling `recordAction` 50 times with a never-resolving `syncRequest`, then assert the intro/completion `onChoice` returns `false` and the pause narration fired.
- Delete tests of `settleImmediateReviewSync` timing and `__testQueueSeed`.

Tests must inject the session by calling `initKanjiKombatUI` with a `syncSession` stub — no module mocking of the session file needed.

- [ ] **Step 4: Run, check, commit**

```bash
node --check public/js/ui/kanji-kombat.js && echo OK
node --test tests/unit/ui/kanji-kombat-ui.test.js
git add -A
git commit -m "Route Kanji Kombat intro and completion through session log"
```

(`npm test` may still fail in `combat-network-hardening.test.js` until Task 10 — that's expected mid-cutover; note it in the commit if so.)

---

## Task 10: Cutover — Quiz Path Through the Session

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Modify: `tests/unit/ui/combat-network-hardening.test.js`, `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Map the current call graph**

```bash
grep -rn "runOptimisticKanjiKombatAnswer\|submitAnswer" public/js/game.js public/js/ui/*.js | grep -v test | head -20
grep -n "playKanjiKombatNextWaveTransition" public/js/ui/combat-loop.js
```

Confirm: where `api.submitAnswer` (used by `renderKanjiKombatQuiz`) is wired, and the exact signature of `playKanjiKombatNextWaveTransition(result)`.

- [ ] **Step 2: Rewrite `runOptimisticKanjiKombatAnswer`**

Replace the body (combat-loop.js:678-822) with the log-based flow. Key changes, in order:

1. **Delete the blocker.** Remove the `kanjiKombatQueuedVerificationPending` check (lines 689-693), the variable declaration (line 173), and every assignment to it (including `__combatNetworkTest`). The replacement gate is the session cap:

```js
  const session = getKanjiKombatSession();
  if (!session || !session.canConsumePrompt()) {
    playerAttackPending = false;
    return false; // renders the pause path via kanji-kombat.js
  }
```

(Import `getKanjiKombatSession` from `./kanji-kombat-session.js`, replacing the `getKanjiKombatSyncQueue` import.)

2. **Build and play the prediction** exactly as today (lines 695-723) — `buildOptimisticKanjiKombatRequest` already reads `optimistic.nextTurnSeed`, which is now the chain head.

3. **Advance the local chain** after `localStateAfterKanjiKombatPrediction`. Add this helper near it:

```js
function advanceLocalKanjiKombatChain(state) {
  const optimistic = state?.combat?.optimistic;
  if (!optimistic) return;
  const seeds = Array.isArray(optimistic.turnSeeds) ? optimistic.turnSeeds.slice(1) : [];
  optimistic.turnSeeds = seeds;
  optimistic.nextTurnSeed = seeds[0] || null;
  optimistic.stateVersion = (optimistic.stateVersion || 0) + 1;
}
```

and call it on `localState` right after it is computed.

4. **Apply a local wave transition** when the prediction ends the wave and a pre-roll exists:

```js
function applyLocalKanjiKombatWaveTransition(state) {
  const kk = state?.run?.kanjiKombat;
  const pending = kk?.pendingNextWave;
  if (!pending || !state.combat) return null;
  kk.wave = pending.wave;
  kk.pendingNextWave = null;
  state.combat = {
    ...state.combat,
    active: true,
    enemies: pending.enemies,
    isBoss: pending.isMiniboss === true,
    optimistic: { ...pending.combat },
  };
  return pending;
}
```

In the post-playback flow, where `hasLocalCombatEnd` is true with `allEnemiesDefeated` (victory prediction) and the run is not at daily completion: call `applyLocalKanjiKombatWaveTransition(localState)`; if it returns a wave, play `playKanjiKombatNextWaveTransition({ nextWave: true, nextWaveEnemies: pending.enemies })` (adapt to the signature confirmed in Step 1), then continue to move selection. If it returns `null` (no pre-roll — second offline wave boundary), leave combat inactive and let `renderKanjiKombatAction`'s no-prompt tail show the spotty pause; the checkpoint will deliver the real wave. The `allAlliesDefeated` (defeat) prediction keeps today's behavior: wait for server confirmation via the checkpoint before `finishCombatLoop`.

5. **Append to the log instead of enqueueing:**

```js
  session.recordAction({
    actionId: optimistic.envelope.actionId,
    kind: 'quiz',
    promptId: promptRef?.promptId || null,
    sequence: promptRef?.sequence ?? null,
    cardId: promptRef?.cardId || null,
    answerId,
    predictedHash: optimistic.envelope.predictedHash,
  });
```

Delete `sync`, `handleQueuedVerificationResult`, `handleAcceptedSync`, `handleCorrectedSync`, `handleSyncFailure`, and the whole `if (queue) {...} else {...}` block. Server-confirmed visuals (xpEvents, streak rewards from the server, next-wave from corrections, combat end) now arrive through `handleSessionCheckpoint`/`handleSessionCorrection` in kanji-kombat.js — move the reusable pieces (`showXpEvents`, `syncKanjiKombatStreakRewardVisuals`, `playKanjiKombatNextWaveTransition`, `finishCombatLoop` access) behind exported functions or the existing dependency-injection seams so kanji-kombat.js's checkpoint handler can call them; follow how `kanji-kombat.js` already receives `finishCombatResult` in its API deps.

Streak banners stay locally predicted: keep `willKanjiKombatAnswerTriggerStreakReward` + `vfx.showKanjiKombatAnswerBanner(...)` on the local prediction path, dropping the wait-for-server branch (`waitForStreakRewardBanner` logic) — the banner shows from local state; a checkpoint that disagrees arrives as a correction snap.

6. **Return to selection** — keep the existing tail (lines 815-821) minus the queue bookkeeping.

- [ ] **Step 3: Migrate the network-hardening tests**

`tests/unit/ui/combat-network-hardening.test.js` has large kanji sections built around `kanjiKombatQueuedVerificationPending` and queued verification callbacks. Rewrite them to the new contract:

- "queued answer verification pending blocks duplicate answer" → **inverted**: with a never-resolving `syncRequest`, three consecutive `runOptimisticKanjiKombatAnswer` calls (with a 3-deep `turnSeeds` chain and 3 buffered quiz prompts in the fixture state) all return `true`, and `getKanjiKombatSession().pendingCount() === 3`.
- "sync queue full uses server path" → with the session pre-loaded to `KK_SESSION_HARD_CAP` entries, `runOptimisticKanjiKombatAnswer` returns `false`.
- "accepted verification resumes selection" → checkpoint-driven: resolve the stubbed `syncRequest` with `{ status: 'ok', confirmedThroughSeq, state }` and assert the log drains.
- "corrected verification recovers" → respond `{ status: 'corrected', authoritativeState }` and assert the correction handler applied state.
- Delete tests for `recoverFromNullKanjiKombatResponse`-driven flows.

Fixture note: kanji fixtures in this file must now include `combat.optimistic.turnSeeds` (≥3 seeds) and `run.kanjiKombat.pendingNextWave` where wave-end predictions are exercised.

- [ ] **Step 4: Run, check, commit**

```bash
node --check public/js/ui/combat-loop.js && echo OK
node --test tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-run-integration.test.js
git add -A
git commit -m "Pipeline Kanji Kombat quiz answers through session log"
```

---

## Task 11: Delete the Old Layers

**Files:**
- Delete: `public/js/ui/kanji-kombat-sync-queue.js`, `tests/unit/ui/kanji-kombat-sync-queue.test.js`
- Modify: `public/js/ui/kanji-kombat.js`, `public/js/game.js`, any remaining importers

- [ ] **Step 1: Find all remaining references**

```bash
grep -rn "kanji-kombat-sync-queue\|KanjiKombatSyncQueue\|kanjiKombatQueuedVerificationPending\|consumedPromptIds\|recoverFromNullKanjiKombat" public/ tests/ | grep -v node_modules
```

Remove every hit: delete the module and its test file, drop dead imports, and excise the legacy-field render fallbacks in `renderKanjiKombatAction` (`!hasBufferedPrompt && kk.completionChoicePending`, `!hasBufferedPrompt ? kk.pendingIntro?.card : null`, `!hasBufferedPrompt ? kk.currentQuiz : null` — render only from `promptBuffer`). Check `public/game.js` for kanji recovery-state code added by commit `a1ef0996` (`/usr/bin/git show a1ef0996 -- public/game.js`) and remove what referenced the deleted paths.

```bash
git rm public/js/ui/kanji-kombat-sync-queue.js tests/unit/ui/kanji-kombat-sync-queue.test.js
```

- [ ] **Step 2: Full suite**

```bash
node --check public/js/ui/kanji-kombat.js && node --check public/game.js && npm test
```

Expected: PASS. Coverage must not drop below the ratchet (deleting tested dead code can move coverage — if the c8 floor trips, the remaining new tests need to cover the lines flagged in the report, not a floor adjustment).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Remove Kanji Kombat sync queue and legacy prompt fallbacks"
```

---

## Task 12: Harness Green + Verification

- [ ] **Step 1: Run the subway harness**

```bash
npm run test:subway
```

Expected: PASS. Debug failures with `npx playwright test ... --headed` and the browser console (`[KanjiKombat]` logs). Common failure causes to check in order: seed-chain head mismatch between client build and server replay (compare `predictedHash` reasons in the sync correction response), wave-number off-by-one in pre-roll consumption, debounce timer not firing under `context.setOffline`.

- [ ] **Step 2: Full suite + manual playtest**

```bash
npm test
```

Then a manual throttled playtest per `docs/playtest-guide.md` (ask the user before launching Playwright MCP): play Kanji Kombat with DevTools network set to offline for ~60s mid-session; confirm cards keep flowing, no card replays, sync drains quietly on reconnect, daily report appears.

- [ ] **Step 3: Commit any fixes, then report**

Report results to the user with the harness output before proceeding to Task 13.

---

## Task 13: Phase 4 Cleanup + Real-Device Validation

- [ ] **Step 1: Remove server-side legacy mirroring (only after Tasks 9-11 are fully landed)**

```bash
grep -n "currentQuiz\|pendingIntro\|completionChoicePending" src/game/services/kanji-kombat-service.js | head -30
```

Remove mirror writes that exist only for the deleted client fallbacks (e.g. `syncKanjiKombatPromptBufferState`'s mirroring, `hydratePendingIntroCard` if nothing reads it — verify with `grep -rn "hydratePendingIntroCard\|pendingIntro" src/ public/`). Keep `createInitialKanjiKombatState` fields if save migration would otherwise break old saves; mirrors may stay as dead-but-harmless state fields if removal risks save compatibility — the *writes* and *reads* are what must go. Remove the now-unused legacy promptless paths in `/intro`, `/answer`, `/completion-choice` routes only if nothing else calls them (`grep -rn "submitIntro\|submitAnswer\|submitCompletionChoice" public/js/`). The routes themselves stay (the session sync is the only client caller now, but old app-store builds may still hit them — leave the endpoints functional for one release; add a `// legacy client path — remove after next release` comment).

```bash
npm test
git add -A
git commit -m "Trim Kanji Kombat legacy prompt mirrors"
```

- [ ] **Step 2: Real-device mitmproxy pass (manual, with the user)**

The network-bench toolkit was reverted in `7dfa95bc`; restore it temporarily for the validation run:

```bash
/usr/bin/git restore --source 3ab111c9 -- scripts/network-bench scripts/__init__.py scripts/network_bench tests/network_bench
```

Follow `scripts/network-bench/README.md` to run the `unreliable-dev-ios` profile against the deployed dev build on the iOS simulator, playing a Kanji Kombat session. Success: session completes, no ignored taps, `awaiting_verification` turn totals stay near playback duration (not 42-91s). Afterwards discard the restored tooling (`git checkout -- .` / do not commit it) and report findings to the user.

- [ ] **Step 3: Update the playtest guide**

Add a short "Kanji Kombat offline behavior" section to `docs/playtest-guide.md`: what the spotty-connection pause looks like, that answers keep flowing offline, and how to simulate (DevTools offline toggle).

```bash
git add docs/playtest-guide.md
git commit -m "Document Kanji Kombat offline playtesting"
```

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch flow: merge `feature/kanji-kombat-session-sync` → `dev`, push, advance `master` (`git push origin dev:master`), remove the worktree.

---

## Self-Review Notes

- Spec coverage: runway/seed chain (Task 2), pre-rolled wave (Task 3), epoch (Task 4), batch sync + idempotency + correction truncation (Tasks 5-6), client log/syncer/pause/resume (Task 7), intro/completion/quiz consumption + deletions (Tasks 9-11), pending-completion shell (Task 9 Step 2), harness-first gate (Task 1, closed in Task 12), mitmproxy pass + legacy cleanup (Task 13).
- Known executor-adaptation points (deliberate, with discovery commands inline): service test fixture helper names (Tasks 2/3/5), `action-ledger-service` signatures (Task 5), `apiPost` helper shape (Task 8), `playKanjiKombatNextWaveTransition` signature and checkpoint-visuals seams (Task 10), wave-increment ordering (Task 3). Each has an explicit verify step before the dependent code is written.
- Mid-cutover test breakage is contained to the feature branch and resolved by Task 11 Step 2.
