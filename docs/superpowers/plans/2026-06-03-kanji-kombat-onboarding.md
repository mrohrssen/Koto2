# Kanji Kombat Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-entry Cid onboarding interrupt to Kanji Kombat that stores reversible hiragana/katakana preferences without changing script SRS card progress.

**Architecture:** Add normalized onboarding preferences to meta progression, use those preferences inside script deck selection, and gate new Kanji Kombat runs with `run.kanjiKombat.onboardingPending` until the two answers are submitted. The frontend starts the run and battlefield normally, then a small Kanji Kombat UI orchestrator reuses existing Cid sprite, narration-box, and action-area button helpers before refreshing the normal Kanji Kombat action flow.

**Tech Stack:** Node.js ES modules, Express routes, `node:test`, Supertest, browser ES modules, existing Pixi scene NPC helpers, existing narration/action UI helpers.

---

## File Structure

- Modify `src/game/state.js`
  - Add `createKanjiKombatOnboardingState()` and `ensureKanjiKombatOnboardingState()`.
  - Add `kanjiKombatOnboarding` to `createMetaProgression()`.
- Modify `src/game/manager-registry.js`
  - Normalize missing/old onboarding state when loading existing saves and mark saves dirty when it changes.
- Modify `src/game/loop.js`
  - Normalize meta during `initMeta()`.
  - Expose `meta.kanjiKombatOnboarding` to the frontend state.
- Modify `src/game/script-srs.js`
  - Make active script selection preference-aware without mutating cards.
- Modify `src/game/services/kanji-kombat-service.js`
  - Set `onboardingPending` on first Kanji Kombat start when preferences are incomplete.
  - Add `submitOnboarding()`.
  - Queue prompts only after onboarding is complete.
- Modify `src/routes/game/kanji-kombat.js`
  - Add `POST /onboarding`.
- Modify `public/js/api.js`
  - Add `submitKanjiKombatOnboarding()`.
- Modify `public/js/ui/kanji-kombat.js`
  - Add the Cid onboarding orchestrator using existing narration/buttons callbacks.
  - Keep regular quiz/intro/completion rendering blocked while onboarding is pending.
- Modify `public/js/ui/combat-loop.js`
  - Call the onboarding orchestrator before rendering Kanji Kombat quiz actions.
- Modify `public/game.js`
  - Import and inject the onboarding API plus existing Cid/narration/scene helpers.
- Tests:
  - `tests/unit/game/kanji-kombat-onboarding-state.test.js`
  - `tests/unit/game/script-srs.test.js`
  - `tests/unit/game/kanji-kombat-run.test.js`
  - `tests/unit/routes/kanji-kombat-routes.test.js`
  - `tests/unit/ui/kanji-kombat-ui.test.js`
  - `tests/integration/flows/kanji-kombat.test.js`

---

### Task 1: Add Reversible Onboarding State And Preference-Aware Script Selection

**Files:**
- Create: `tests/unit/game/kanji-kombat-onboarding-state.test.js`
- Modify: `tests/unit/game/script-srs.test.js`
- Modify: `src/game/state.js`
- Modify: `src/game/manager-registry.js`
- Modify: `src/game/loop.js`
- Modify: `src/game/script-srs.js`

- [ ] **Step 1: Write state normalization tests**

Create `tests/unit/game/kanji-kombat-onboarding-state.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createKanjiKombatOnboardingState,
  createMetaProgression,
  ensureKanjiKombatOnboardingState,
} from '../../../src/game/state.js';

describe('Kanji Kombat onboarding meta state', () => {
  it('defaults to incomplete for new meta progression', () => {
    const meta = createMetaProgression();

    assert.deepEqual(meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
  });

  it('adds incomplete onboarding state to existing account meta', () => {
    const meta = { creatureCollection: ['hi'] };

    const normalized = ensureKanjiKombatOnboardingState(meta);

    assert.deepEqual(normalized, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
    assert.equal(meta.kanjiKombatOnboarding, normalized);
  });

  it('normalizes malformed values without treating strings as booleans', () => {
    const meta = {
      kanjiKombatOnboarding: {
        completed: 'yes',
        knowsHiragana: 'true',
        knowsKatakana: false,
      },
    };

    const normalized = ensureKanjiKombatOnboardingState(meta);

    assert.deepEqual(normalized, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: false,
    });
  });

  it('preserves explicit boolean choices', () => {
    const state = createKanjiKombatOnboardingState({
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    });

    assert.deepEqual(state, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    });
  });
});
```

- [ ] **Step 2: Write script selection preference tests**

Append these tests inside the existing `script-srs` describe block in `tests/unit/game/script-srs.test.js`:

```javascript
  it('skips hiragana by reversible onboarding preference without editing cards', () => {
    ensureScriptDeckSeeded(userId);
    const before = loadSrsData(userId).script.cards.find(card => card.id === 'hiragana:あ');

    assert.equal(getActiveScriptType(userId, { knowsHiragana: true, knowsKatakana: false }), 'katakana');

    const after = loadSrsData(userId).script.cards.find(card => card.id === 'hiragana:あ');
    assert.deepEqual(
      {
        reps: after.reps,
        state: after.state,
        due: after.due,
        last_review: after.last_review,
      },
      {
        reps: before.reps,
        state: before.state,
        due: before.due,
        last_review: before.last_review,
      }
    );
  });

  it('skips hiragana and katakana by preference and starts kanji', () => {
    ensureScriptDeckSeeded(userId);

    assert.equal(getActiveScriptType(userId, { knowsHiragana: true, knowsKatakana: true }), 'kanji');
  });

  it('does not restart hiragana progress when preference says to teach hiragana', () => {
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    const reviewed = data.script.cards.find(card => card.id === 'hiragana:あ');
    reviewed.reps = 4;
    reviewed.state = State.Learning;
    reviewed.due = new Date('2026-05-30T00:00:00Z');
    saveSrsData(userId, data);

    assert.equal(getActiveScriptType(userId, { knowsHiragana: false, knowsKatakana: false }), 'hiragana');

    const after = loadSrsData(userId).script.cards.find(card => card.id === 'hiragana:あ');
    assert.equal(after.reps, 4);
    assert.equal(after.state, State.Learning);
    assert.deepEqual(after.due, new Date('2026-05-30T00:00:00Z'));
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/game/kanji-kombat-onboarding-state.test.js tests/unit/game/script-srs.test.js
```

Expected: FAIL because `createKanjiKombatOnboardingState` and `ensureKanjiKombatOnboardingState` are not exported, and `getActiveScriptType()` does not accept preferences yet.

- [ ] **Step 4: Implement onboarding state helpers**

In `src/game/state.js`, add these exports after the import:

```javascript
export function createKanjiKombatOnboardingState(overrides = {}) {
  return {
    completed: false,
    knowsHiragana: null,
    knowsKatakana: null,
    ...overrides,
  };
}

function normalizeNullableBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

export function ensureKanjiKombatOnboardingState(meta) {
  if (!meta) return createKanjiKombatOnboardingState();
  const raw = meta.kanjiKombatOnboarding;
  const normalized = createKanjiKombatOnboardingState({
    completed: raw?.completed === true,
    knowsHiragana: normalizeNullableBoolean(raw?.knowsHiragana),
    knowsKatakana: normalizeNullableBoolean(raw?.knowsKatakana),
  });
  meta.kanjiKombatOnboarding = normalized;
  return normalized;
}
```

In `createMetaProgression()`, add this field after `japaneseDisplayMode: 'hiragana',`:

```javascript
    // First Kanji Kombat script placement questionnaire. Existing accounts
    // intentionally default to incomplete so everyone sees it once.
    kanjiKombatOnboarding: createKanjiKombatOnboardingState(),
```

- [ ] **Step 5: Normalize loaded meta and expose it in state**

In `src/game/loop.js`, update the import from `./state.js` to include `ensureKanjiKombatOnboardingState`:

```javascript
import {
  createNewPlayer,
  createNewRun,
  createMetaProgression,
  ensureKanjiKombatOnboardingState,
  ACHIEVEMENTS,
  BASE_STARTING_CREDITS
} from './state.js';
```

In `initMeta(metaData = null)`, add this before `return this.meta;`:

```javascript
    ensureKanjiKombatOnboardingState(this.meta);
```

In `getState()`, add this to the returned `meta` object after `japaneseDisplayMode`:

```javascript
        kanjiKombatOnboarding: ensureKanjiKombatOnboardingState(this.meta),
```

In `src/game/manager-registry.js`, update the import:

```javascript
import { GameManager, cleanupDebugSuperAttack } from './loop.js';
import { ensureKanjiKombatOnboardingState } from './state.js';
```

After the tutorial fusion normalization block, add:

```javascript
          const beforeKanjiKombatOnboarding = JSON.stringify(data.meta.kanjiKombatOnboarding || null);
          ensureKanjiKombatOnboardingState(data.meta);
          if (JSON.stringify(data.meta.kanjiKombatOnboarding) !== beforeKanjiKombatOnboarding) {
            needsSave = true;
          }
```

- [ ] **Step 6: Make script selection preference-aware**

In `src/game/script-srs.js`, replace `getActiveScriptType()` with:

```javascript
export function getActiveScriptType(userId, onboarding = {}) {
  for (const type of SCRIPT_CARD_TYPES) {
    if (type === 'hiragana' && onboarding?.knowsHiragana === true) continue;
    if (type === 'katakana' && onboarding?.knowsKatakana === true) continue;
    if (!isScriptTypeGraduated(userId, type)) return type;
  }
  return 'kanji';
}
```

Leave `getDueScriptCards(userId, type = getActiveScriptType(userId), now = new Date())` and `getNewScriptCards(userId, type = getActiveScriptType(userId))` signatures unchanged. Kanji Kombat service will pass the chosen type explicitly when preferences are needed.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-onboarding-state.test.js tests/unit/game/script-srs.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
/usr/bin/git add src/game/state.js src/game/manager-registry.js src/game/loop.js src/game/script-srs.js tests/unit/game/kanji-kombat-onboarding-state.test.js tests/unit/game/script-srs.test.js
/usr/bin/git commit -m "feat: add kanji kombat onboarding preferences"
```

---

### Task 2: Gate Kanji Kombat Runs Until Onboarding Is Submitted

**Files:**
- Modify: `tests/unit/game/kanji-kombat-run.test.js`
- Modify: `tests/integration/flows/kanji-kombat.test.js`
- Modify: `src/game/services/kanji-kombat-service.js`

- [ ] **Step 1: Write run lifecycle tests for pending onboarding**

In `tests/unit/game/kanji-kombat-run.test.js`, update `buildGm()` so `meta` includes incomplete onboarding:

```javascript
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'neko', 'inu'],
      creatureCounts: { hi: 1, neko: 1, inu: 1 },
      kanjiKombatOnboarding: { completed: false, knowsHiragana: null, knowsKatakana: null },
    },
```

Add these tests inside the existing `KanjiKombatService run lifecycle helpers` describe block:

```javascript
  it('starts an onboarding-pending run without queueing a prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    service.startRunWithCreature(fakeCreature('hi'));

    assert.equal(gm.run.kanjiKombat.onboardingPending, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.combat.mode, 'kanjiKombat');
  });

  it('submits onboarding, saves reversible preferences, and queues first prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    const result = service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: true,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.ok(gm.run.kanjiKombat.currentQuiz || gm.run.kanjiKombat.pendingIntro);
    assert.equal(gm.run.kanjiKombat.report.scriptDeck, 'kanji');
    assert.equal(result.onboarding.completed, true);
    assert.equal(result.kanjiKombat, gm.run.kanjiKombat);
  });

  it('rejects onboarding submit outside a pending Kanji Kombat run', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    assert.throws(
      () => service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true }),
      /No pending Kanji Kombat onboarding/
    );
  });
```

- [ ] **Step 2: Update existing lifecycle tests that expect immediate prompts**

In `tests/unit/game/kanji-kombat-run.test.js`, for tests that need normal prompt behavior immediately, set onboarding complete before starting:

```javascript
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
```

Apply that line before the existing service start call in each of these tests:

- `marks a run as Kanji Kombat and starts with one selected creature`
- `applies streak thresholds and resets after 20`
- `records wave completion without room fields`
- `starts with a run-scoped creature that has normal combat fields`

- [ ] **Step 3: Write integration tests for SRS safety**

In `tests/integration/flows/kanji-kombat.test.js`, add this import at the top:

```javascript
import { State } from 'ts-fsrs';
```

Add this test inside the existing `Kanji Kombat integration flow` describe block:

```javascript
  it('onboarding false answers preserve existing script SRS progress', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    const target = data[SCRIPT_DECK].cards.find(card => card.id === 'hiragana:あ');
    target.reps = 7;
    target.state = State.Learning;
    target.due = new Date('2026-05-30T00:00:00Z');
    target.last_review = new Date('2026-05-29T00:00:00Z');
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
      kanjiKombatOnboarding: { completed: false, knowsHiragana: null, knowsKatakana: null },
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    assert.equal(gm.run.kanjiKombat.onboardingPending, true);

    gm.kanjiKombatService.submitOnboarding({ knowsHiragana: false, knowsKatakana: false });

    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === 'hiragana:あ');
    assert.equal(after.reps, 7);
    assert.equal(after.state, State.Learning);
    assert.deepEqual(after.due, new Date('2026-05-30T00:00:00Z'));
    assert.deepEqual(after.last_review, new Date('2026-05-29T00:00:00Z'));
    assert.equal(gm.run.kanjiKombat.report.scriptDeck, 'hiragana');
  });
```

For existing integration tests that expect immediate prompt availability, add this field to each `gm.meta` object before start:

```javascript
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: FAIL because `submitOnboarding()` and `onboardingPending` behavior do not exist yet.

- [ ] **Step 5: Implement service-side onboarding gate**

In `src/game/services/kanji-kombat-service.js`, update the state import:

```javascript
import { createCombatState, createNewRun, ensureKanjiKombatOnboardingState } from '../state.js';
```

Verify the import from `../script-srs.js` still includes `getActiveScriptType`:

```javascript
  getActiveScriptType,
```

In `createInitialKanjiKombatState()`, add `onboardingPending: false,` after `endlessMode: false,`.

In `chooseNextScriptWork(userId, state, opts = {})`, replace:

```javascript
  const activeType = getActiveScriptType(userId);
```

with:

```javascript
  const activeType = opts.activeType || getActiveScriptType(userId, opts.onboarding);
```

Inside the `KanjiKombatService` class, add this helper method before `startRunWithCreature(creature)`:

```javascript
  chooseNextWork(state, opts = {}) {
    return chooseNextScriptWork(this.gm.userId, state, {
      ...opts,
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
  }
```

Replace the prompt-queueing part of `startRunWithCreature(creature)` with:

```javascript
    this.gm.run.kanjiKombat = createInitialKanjiKombatState();
    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    this.gm.run.kanjiKombat.onboardingPending = onboarding.completed !== true;

    if (!this.gm.run.kanjiKombat.onboardingPending) {
      const work = this.chooseNextWork(this.gm.run.kanjiKombat);
      if (work.kind === 'complete') {
        throw new Error('Kanji Kombat is complete for the day');
      }
      this.gm.run.kanjiKombat.currentQuiz = work.quiz || null;
      this.gm.run.kanjiKombat.pendingIntro = work.kind === 'intro'
        ? { cardId: work.card.id, card: work.card, source: work.source }
        : null;
    }

    this.spawnNextWave();
```

Add this method after `startRunWithCreatureId(creatureId)`:

```javascript
  submitOnboarding({ knowsHiragana, knowsKatakana } = {}) {
    const kk = this.gm.run?.kanjiKombat;
    if (this.gm.run?.mode !== 'kanjiKombat' || !kk?.onboardingPending) {
      throw new Error('No pending Kanji Kombat onboarding');
    }
    if (typeof knowsHiragana !== 'boolean' || typeof knowsKatakana !== 'boolean') {
      throw new Error('knowsHiragana and knowsKatakana booleans required');
    }

    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    onboarding.completed = true;
    onboarding.knowsHiragana = knowsHiragana;
    onboarding.knowsKatakana = knowsKatakana;

    kk.onboardingPending = false;
    kk.currentQuiz = null;
    kk.pendingIntro = null;
    const work = this.chooseNextWork(kk);
    if (work.kind === 'complete') {
      throw new Error('Kanji Kombat is complete for the day');
    }
    kk.currentQuiz = work.quiz || null;
    kk.pendingIntro = work.kind === 'intro'
      ? { cardId: work.card.id, card: work.card, source: work.source }
      : null;

    this.gm.emitState();
    return {
      onboarding,
      next: work.kind,
      kanjiKombat: kk,
      allies: this.gm.combat?.allies || [],
      enemies: this.gm.combat?.enemies || [],
      creatureParty: this.gm.run.creatureParty,
    };
  }
```

In `queueNextPrompt(opts = {})`, change the guard to:

```javascript
    if (!state || state.onboardingPending || state.currentQuiz || state.pendingIntro) return null;
    const work = this.chooseNextWork(state, opts);
```

In `getAvailability()`, add this after the collection check:

```javascript
    const onboarding = ensureKanjiKombatOnboardingState(this.gm.meta);
    if (onboarding.completed !== true) {
      return { available: true, next: 'onboarding', scriptDeck: null };
    }
```

Replace remaining direct `chooseNextScriptWork(this.gm.userId, this.gm.run.kanjiKombat)` calls in this service with:

```javascript
this.chooseNextWork(this.gm.run.kanjiKombat)
```

Replace the `chooseNextScriptWork(this.gm.userId, state, opts)` call in `resolveCompletionChoice()`/`queueNextPrompt()` paths with `this.chooseNextWork(state, opts)`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-run.test.js tests/integration/flows/kanji-kombat.test.js
/usr/bin/git commit -m "feat: gate kanji kombat start with onboarding"
```

---

### Task 3: Add Onboarding Route And Client API

**Files:**
- Modify: `tests/unit/routes/kanji-kombat-routes.test.js`
- Modify: `src/routes/game/kanji-kombat.js`
- Modify: `public/js/api.js`

- [ ] **Step 1: Write route tests**

Append these tests inside the `Kanji Kombat routes` describe block in `tests/unit/routes/kanji-kombat-routes.test.js`:

```javascript
  it('submits onboarding answers and saves game state', async () => {
    const manager = {
      kanjiKombatService: {
        submitOnboarding: answers => ({ onboarding: { completed: true, ...answers } }),
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/onboarding')
      .send({ knowsHiragana: true, knowsKatakana: false });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.onboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    });
    assert.equal(manager.saved, true);
  });

  it('rejects onboarding answers unless both values are booleans', async () => {
    const manager = {
      kanjiKombatService: {
        submitOnboarding: () => {
          throw new Error('should not be called');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/onboarding')
      .send({ knowsHiragana: 'true', knowsKatakana: false });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'knowsHiragana and knowsKatakana booleans required');
    assert.equal(manager.saved, undefined);
  });
```

- [ ] **Step 2: Run route test to verify it fails**

Run:

```bash
node --test tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: FAIL with 404 for `/kanji-kombat/onboarding`.

- [ ] **Step 3: Implement the route**

In `src/routes/game/kanji-kombat.js`, add this route before `/intro`:

```javascript
  router.post('/onboarding', (req, res) => {
    try {
      const { knowsHiragana, knowsKatakana } = req.body || {};
      if (typeof knowsHiragana !== 'boolean' || typeof knowsKatakana !== 'boolean') {
        return res.status(400).json({ error: 'knowsHiragana and knowsKatakana booleans required' });
      }
      const result = req.gameManager.kanjiKombatService.submitOnboarding({
        knowsHiragana,
        knowsKatakana,
      });
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

- [ ] **Step 4: Add client API function**

In `public/js/api.js`, add this after `startKanjiKombat(creatureId)`:

```javascript
async function submitKanjiKombatOnboarding(knowsHiragana, knowsKatakana) {
  return apiCall('/kanji-kombat/onboarding', 'POST', { knowsHiragana, knowsKatakana }, null, {
    bypassLoadingGate: true,
  });
}
```

In the default export object near existing Kanji Kombat functions, add:

```javascript
  submitKanjiKombatOnboarding,
```

- [ ] **Step 5: Run syntax and route tests**

Run:

```bash
node --check public/js/api.js
node --test tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
/usr/bin/git add src/routes/game/kanji-kombat.js public/js/api.js tests/unit/routes/kanji-kombat-routes.test.js
/usr/bin/git commit -m "feat: add kanji kombat onboarding endpoint"
```

---

### Task 4: Add Frontend Cid Onboarding Orchestrator

**Files:**
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/game.js`

- [ ] **Step 1: Expand the fake DOM enough for action-area buttons**

In `tests/unit/ui/kanji-kombat-ui.test.js`, update `FakeActionArea` with append/clear support:

```javascript
  appendChild(node) {
    this.children = this.children || [];
    this.children.push(node);
    if (node?.buttons) this.buttons.push(...node.buttons);
  }

  replaceChildren() {
    this.children = [];
    this.buttons = [];
    this._innerHTML = '';
  }
```

Update the `global.document.createElement` fake in `beforeEach()` so button lists created by `renderButtonsAsync()` work:

```javascript
      createElement: tagName => {
        const element = {
          tagName,
          className: '',
          children: [],
          buttons: [],
          _text: '',
          appendChild(child) {
            this.children.push(child);
            if (child instanceof FakeButton) this.buttons.push(child);
            if (child?.buttons) this.buttons.push(...child.buttons);
          },
          setAttribute() {},
          addEventListener(type, handler) {
            this.listeners = this.listeners || new Map();
            this.listeners.set(type, handler);
          },
        };
        Object.defineProperty(element, 'textContent', {
          set(value) { element._text = String(value ?? ''); },
          get() { return element._text; },
        });
        Object.defineProperty(element, 'innerHTML', {
          set(value) { element._text = String(value ?? ''); },
          get() {
            return element._text
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;');
          },
        });
        if (tagName === 'button') {
          const button = new FakeButton();
          button.classList = new FakeClassList(button);
          return button;
        }
        return element;
      },
```

- [ ] **Step 2: Write UI orchestration tests**

Update the import in `tests/unit/ui/kanji-kombat-ui.test.js`:

```javascript
  startKanjiKombatOnboardingIfNeeded,
```

Add these tests inside the `kanji-kombat ui` describe block:

```javascript
  it('starts onboarding when pending and blocks quiz rendering', async () => {
    const calls = [];
    initKanjiKombatUI({
      showCidSprite: async () => calls.push('showCidSprite'),
      hideCidSprite: async () => calls.push('hideCidSprite'),
      showNarration: async (text, opts = {}) => {
        calls.push(['narration', text, opts.persistent === true]);
      },
      forceHideNarration: () => calls.push('forceHideNarration'),
      submitOnboarding: async (knowsHiragana, knowsKatakana) => {
        calls.push(['submitOnboarding', knowsHiragana, knowsKatakana]);
        return { state: { phase: 'combat' } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      refreshAction: () => calls.push('refreshAction'),
      playCorrectAnswerAudio: () => {},
    });

    const started = startKanjiKombatOnboardingIfNeeded({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          onboardingPending: true,
          currentQuiz: {
            prompt: 'あ',
            choices: [{ id: 'a', answer: 'a', correct: true }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(started, true);
    await Promise.resolve();
    actionArea.buttons[0].click();
    await Promise.resolve();
    actionArea.buttons[0].click();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(calls[0], 'showCidSprite');
    assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'submitOnboarding'), [
      'submitOnboarding',
      true,
      true,
    ]);
    assert.equal(calls.includes('hideCidSprite'), true);
    assert.equal(calls.includes('refreshAction'), true);
  });

  it('does not start onboarding when the gate is absent', () => {
    const started = startKanjiKombatOnboardingIfNeeded({
      run: { mode: 'kanjiKombat', kanjiKombat: { onboardingPending: false } },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(started, false);
  });
```

- [ ] **Step 3: Run UI test to verify it fails**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because `startKanjiKombatOnboardingIfNeeded` does not exist.

- [ ] **Step 4: Implement the orchestrator with existing UI helpers**

In `public/js/ui/kanji-kombat.js`, add this import:

```javascript
import { renderButtonsAsync } from './ui-components.js';
```

Extend the `api` object:

```javascript
  submitOnboarding: null,
  showCidSprite: null,
  hideCidSprite: null,
  showNarration: null,
  forceHideNarration: null,
```

Add these constants after `actionArea()`:

```javascript
const ONBOARDING_COPY = {
  welcome: 'Hey, welcome to Kanji Kombat. Here, you can practice your hiragana, katakana, and kanji all the way up to full fluency.',
  hiraganaQuestion: 'First things first. Do you already know all hiragana?',
  hiraganaKnown: "Great, we won't spend time teaching you hiragana.",
  hiraganaUnknown: "Great, we'll teach you hiragana.",
  katakanaQuestion: 'Do you already know all katakana?',
  katakanaKnown: "Great, we won't spend time teaching you katakana.",
  katakanaUnknown: "Great, we'll teach you katakana.",
  finalHiragana: "Great, we'll start by teaching you hiragana and go from there.",
  finalKatakana: "Great, we'll start by teaching you katakana and go from there.",
  finalKanji: "Okay, great, we'll start by teaching you kanji. Let's jump right into it.",
};

let onboardingInProgress = false;
```

Add these functions before `renderKanjiKombatQuiz()`:

```javascript
function shouldRunOnboarding(gameState) {
  return gameState?.run?.mode === 'kanjiKombat'
    && gameState.run?.kanjiKombat?.onboardingPending === true
    && gameState?.combat?.actionCursor?.side === 'ally';
}

async function askOnboardingBoolean(question) {
  await api.showNarration?.(question, { speaker: 'Cid', persistent: true });
  const choice = await renderButtonsAsync([
    { label: 'Yes, I know all of them' },
    { label: 'No, please teach me' },
  ]);
  api.forceHideNarration?.();
  return choice === 0;
}

function finalOnboardingLine(knowsHiragana, knowsKatakana) {
  if (!knowsHiragana) return ONBOARDING_COPY.finalHiragana;
  if (!knowsKatakana) return ONBOARDING_COPY.finalKatakana;
  return ONBOARDING_COPY.finalKanji;
}

async function runKanjiKombatOnboarding() {
  const root = actionArea();
  if (root) root.innerHTML = '';
  try {
    await api.showCidSprite?.();
    await api.showNarration?.(ONBOARDING_COPY.welcome, { speaker: 'Cid' });
    const knowsHiragana = await askOnboardingBoolean(ONBOARDING_COPY.hiraganaQuestion);
    await api.showNarration?.(
      knowsHiragana ? ONBOARDING_COPY.hiraganaKnown : ONBOARDING_COPY.hiraganaUnknown,
      { speaker: 'Cid' }
    );
    const knowsKatakana = await askOnboardingBoolean(ONBOARDING_COPY.katakanaQuestion);
    await api.showNarration?.(
      knowsKatakana ? ONBOARDING_COPY.katakanaKnown : ONBOARDING_COPY.katakanaUnknown,
      { speaker: 'Cid' }
    );
    await api.showNarration?.(finalOnboardingLine(knowsHiragana, knowsKatakana), { speaker: 'Cid' });

    const result = await api.submitOnboarding?.(knowsHiragana, knowsKatakana);
    if (result?.state) api.updateGameState?.(result.state);
    await api.hideCidSprite?.();
    api.refreshAction?.();
  } catch (error) {
    console.error('[KanjiKombat] Onboarding failed:', error);
    await api.hideCidSprite?.();
    await api.showNarration?.('Kanji Kombat setup hit a snag. Please try again.', {
      speaker: 'Cid',
      autoDismiss: 2000,
    });
    api.updateUI?.();
  } finally {
    onboardingInProgress = false;
  }
}

export function startKanjiKombatOnboardingIfNeeded(gameState) {
  if (!shouldRunOnboarding(gameState)) return false;
  if (onboardingInProgress) return true;
  onboardingInProgress = true;
  runKanjiKombatOnboarding();
  return true;
}
```

At the top of `renderKanjiKombatAction(gameState)`, after the existing line `const cursor = gameState.combat?.actionCursor;`, add:

```javascript
  if (kk?.onboardingPending) return true;
```

- [ ] **Step 5: Call onboarding before regular Kanji Kombat action rendering**

In `public/js/ui/combat-loop.js`, inside `promptNextCreature()`, replace:

```javascript
  if (state.run?.mode === 'kanjiKombat' && kanjiKombatUI.renderKanjiKombatAction(state)) {
    return;
  }
```

with:

```javascript
  if (state.run?.mode === 'kanjiKombat') {
    if (kanjiKombatUI.startKanjiKombatOnboardingIfNeeded(state)) return;
    if (kanjiKombatUI.renderKanjiKombatAction(state)) return;
  }
```

- [ ] **Step 6: Wire API and existing Cid scene helpers from `game.js`**

In `public/game.js`, update the API import block to include:

```javascript
  submitKanjiKombatOnboarding as apiSubmitKanjiKombatOnboarding,
```

Add these helpers before `startKanjiKombatSetup()`:

```javascript
async function showKanjiKombatCidSprite() {
  const activeScene = getSceneManager()?.currentScene;
  const cidSprite = npcSpriteUrl('cid');
  scene.showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
  if (activeScene && !activeScene.disposed && !activeScene._exiting && activeScene.layers?.npcs) {
    await activeScene.pauseForNpcInterjection?.({ fadeEnemies: true });
    await activeScene.showNpcSprite(cidSprite, { slideIn: true });
  }
}

async function hideKanjiKombatCidSprite() {
  const activeScene = getSceneManager()?.currentScene;
  if (activeScene && !activeScene.disposed && !activeScene._exiting) {
    if (activeScene.npcSprite) {
      await activeScene.hideNpcSprite({ slideOut: true });
    }
    await activeScene.resumeFromNpcInterjection?.();
  }
  scene.hideEnemy();
}
```

In the existing `kanjiKombatUI.initKanjiKombatUI` dependency object in `public/game.js`, add these properties alongside `submitIntro`, `submitAnswer`, and `submitCompletionChoice`:

```javascript
    submitOnboarding: apiSubmitKanjiKombatOnboarding,
    showCidSprite: showKanjiKombatCidSprite,
    hideCidSprite: hideKanjiKombatCidSprite,
    showNarration: (text, opts) => narrationBox.show(text, opts),
    forceHideNarration: () => narrationBox.forceHide(),
```

- [ ] **Step 7: Run frontend syntax and UI tests**

Run:

```bash
node --check public/js/ui/kanji-kombat.js
node --check public/js/ui/combat-loop.js
node --check public/game.js
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js public/js/ui/combat-loop.js public/game.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "feat: show cid kanji kombat onboarding"
```

---

### Task 5: Full Verification And Visual Check

**Files:**
- Modify only if verification finds a concrete defect in files from earlier tasks.

- [ ] **Step 1: Run backend and frontend syntax checks**

Run:

```bash
node --check src/game/state.js
node --check src/game/script-srs.js
node --check src/game/services/kanji-kombat-service.js
node --check src/routes/game/kanji-kombat.js
node --check public/js/api.js
node --check public/js/ui/kanji-kombat.js
node --check public/js/ui/combat-loop.js
node --check public/game.js
```

Expected: every command exits 0 with no syntax errors.

- [ ] **Step 2: Run focused automated tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-onboarding-state.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 3: Run the project gate**

Run:

```bash
npm test
```

Expected: PASS for unit and integration suites.

- [ ] **Step 4: Read the playtest guide before browser work**

Run:

```bash
sed -n '1,240p' docs/playtest-guide.md
```

Expected: guide opens; follow Kanji Kombat/hub/combat interaction notes from the guide.

- [ ] **Step 5: Start the dev server**

Run:

```bash
npm run dev
```

Expected: server remains running and Vite reports a localhost URL, usually `http://localhost:5173`.

- [ ] **Step 6: Verify the dev URL responds before sharing or using it**

In a second terminal:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 7: Ask before launching browser visual verification**

Ask the user:

```text
May I open the Playwright/browser session to visually verify the Kanji Kombat onboarding flow?
```

Expected: user approves before opening browser tooling.

- [ ] **Step 8: Visual verification script**

After approval, use the Browser/Playwright MCP flow from `docs/playtest-guide.md`:

1. Navigate to `http://localhost:5173`.
2. Log in as `devtester` / `test1234`.
3. If the account has an active run, return to hub or reset the dev user with `npm run seed:dev-user` and reload.
4. Click `Kanji Kombat`.
5. Pick one creature in the existing collection picker.
6. Confirm the battlefield appears.
7. Confirm Cid slides in on the battlefield before a Kanji Kombat card is actionable.
8. Answer `Yes, I know all of them` for hiragana.
9. Answer `Yes, I know all of them` for katakana.
10. Confirm Cid says the kanji-start final line.
11. Dismiss the final line.
12. Confirm Cid slides out.
13. Confirm the first visible Kanji Kombat prompt is kanji.
14. Take a screenshot showing the battlefield with Cid during onboarding.
15. Take a screenshot showing normal Kanji Kombat prompt after Cid exits.
16. Delete any screenshot files created during the session in the same cleanup pass.

Expected: Cid uses the existing battlefield sprite slide, narration box, and action-area buttons. No duplicate dialogue panel appears. No quiz/intro answer can be clicked before onboarding finishes.

- [ ] **Step 9: Verify stored preferences and SRS safety manually**

In the browser console after completing onboarding:

```javascript
window.__gameState.meta.kanjiKombatOnboarding
```

Expected for the yes/yes path:

```javascript
{ completed: true, knowsHiragana: true, knowsKatakana: true }
```

Then inspect current deck from game state:

```javascript
window.__gameState.run.kanjiKombat.report.scriptDeck
```

Expected:

```javascript
"kanji"
```

- [ ] **Step 10: Commit any verification fixes**

If verification required code changes, run the relevant focused tests again, then commit:

```bash
/usr/bin/git add src/game/state.js src/game/manager-registry.js src/game/loop.js src/game/script-srs.js src/game/services/kanji-kombat-service.js src/routes/game/kanji-kombat.js public/js/api.js public/js/ui/kanji-kombat.js public/js/ui/combat-loop.js public/game.js tests/unit/game/kanji-kombat-onboarding-state.test.js tests/unit/game/script-srs.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/integration/flows/kanji-kombat.test.js
/usr/bin/git commit -m "fix: stabilize kanji kombat onboarding"
```

Expected: no commit is made if verification found no defects.
