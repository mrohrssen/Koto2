# Kanji Kombat Subway Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Kanji Kombat keep flowing through short dropped connections by consuming prompts locally, queueing review sync in memory, and reconciling with the server in the background.

**Architecture:** Keep the feature local to Kanji Kombat and the combat loop. Add one focused browser-side sync queue module, raise the server-prepared prompt runway to 30 prompts, make intro/completion choices enqueue instead of rollback on ordinary network ambiguity, and make quiz answers apply local deterministic combat state before queueing verification. Server responses still own durable SRS, rewards, daily completion, leaderboard data, and corrected combat state.

**Tech Stack:** Node.js ES modules, browser JS modules, Express routes already in place, deterministic combat resolver, `node:test`, existing Kanji Kombat prompt-buffer API, existing optimistic action protocol.

---

## Source Spec

Approved spec: `docs/superpowers/specs/2026-06-07-kanji-kombat-subway-sync-design.md`

## Execution Preflight

Implementation must happen in a feature worktree, not directly in `koto-dev`.

- [ ] **Step 1: Create an isolated worktree**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-kanji-kombat-subway-sync -b feature/kanji-kombat-subway-sync
cd ../koto-wt-kanji-kombat-subway-sync
```

Expected: new worktree on `feature/kanji-kombat-subway-sync`.

- [ ] **Step 2: Confirm clean feature worktree**

```bash
/usr/bin/git status --short --branch
```

Expected: branch is `feature/kanji-kombat-subway-sync`; no local changes.

## File Map

Create:

- `public/js/ui/kanji-kombat-sync-queue.js` - in-memory bounded queue, retry/backoff drain loop, queue status helpers, injected sync callbacks.
- `tests/unit/ui/kanji-kombat-sync-queue.test.js` - unit coverage for queue limits, ordering, retry delays, accepted/corrected handling, and reset behavior.

Modify:

- `src/game/services/kanji-kombat-service.js` - raise server prompt runway constants from 5/3 to 30/10.
- `public/js/ui/kanji-kombat.js` - configure sync queue, raise client refill threshold to 10, consume intro/completion prompts locally, show spotty-connection pause when hard cap or empty runway blocks progress, ignore stale accepted/refill states that would replay consumed prompts.
- `public/js/ui/combat-loop.js` - locally apply predicted Kanji Kombat answer state, enqueue verification instead of waiting for it inline, reconcile accepted/corrected verification later through the existing combat recovery helpers.
- `tests/unit/game/kanji-kombat-deck.test.js` - server runway constants, mixed prompt buffer, daily cap preview coverage.
- `tests/unit/game/kanji-kombat-run.test.js` - update prompt buffer size expectations from `<= 5` to `<= 30`.
- `tests/unit/ui/kanji-kombat-ui.test.js` - intro/completion queue behavior, hard-cap pause, stale response suppression, refill threshold 10.
- `tests/unit/ui/combat-network-hardening.test.js` - quiz answer local continuation and queued verification behavior.
- `tests/unit/ui/optimistic-run-integration.test.js` - source contract checks for prompt-buffer target/refill constants and no save-failure rollback in Kanji Kombat prompt paths.

Do not modify:

- `data/dictionary.json`
- Speed Review files
- PvP combat paths
- Server route contracts unless a test exposes an existing route bug

## Task 1: Raise Prompt Runway Constants

**Files:**

- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`
- Modify: `tests/unit/game/kanji-kombat-run.test.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`

- [ ] **Step 1: Update failing server prompt-buffer tests**

In `tests/unit/game/kanji-kombat-deck.test.js`, replace the existing five-prompt runway assertion test with:

```js
  it('fills a thirty-prompt server runway without mutating persistent daily completion', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2026-05-30T00:00:00Z');
      card.reps = 1;
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(PROMPT_BUFFER_TARGET, 30);
    assert.equal(PROMPT_BUFFER_REFILL_THRESHOLD, 10);
    assert.equal(prompts.length, 30);
    assert.equal(state.promptBuffer.length, 30);
    assert.equal(state.currentQuiz.cardId, state.promptBuffer[0].cardId);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.promptId)).size, 30);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.cardId).filter(Boolean)).size, 30);
  });
```

- [ ] **Step 2: Add mixed-runway daily-cap regression test**

Add this test after `reserves virtual daily intro budget while previewing prompts` in `tests/unit/game/kanji-kombat-deck.test.js`:

```js
  it('does not fill the larger runway with new-card intros beyond the daily cap', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    data.kanjiKombatDaily = {
      date: '2026-05-31',
      introducedCount: DAILY_NEW_LIMIT - 2,
      completed: false,
    };
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(PROMPT_BUFFER_TARGET, 30);
    assert.equal(prompts.filter(prompt => prompt.kind === 'intro').length, 2);
    assert.equal(prompts.at(-1).kind, 'completePrompt');
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, DAILY_NEW_LIMIT - 2);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  });
```

- [ ] **Step 3: Update run-service size assertions**

In `tests/unit/game/kanji-kombat-run.test.js`, replace both `<= 5` prompt-buffer size assertions with `<= 30`.

```js
assert.equal(gm.run.kanjiKombat.promptBuffer.length <= 30, true);
```

- [ ] **Step 4: Update UI refill-threshold test names and expected text**

In `tests/unit/ui/kanji-kombat-ui.test.js`, rename:

```js
it('requests a single-flight refill when the local prompt buffer drops below three', async () => {
```

to:

```js
it('requests a single-flight refill when the local prompt buffer drops below ten', async () => {
```

No behavior change is needed in that test because it uses a one-prompt buffer; it will fail until the code constant is changed.

- [ ] **Step 5: Run focused tests and verify RED**

```bash
node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL on `PROMPT_BUFFER_TARGET` and `PROMPT_BUFFER_REFILL_THRESHOLD` expected values.

- [ ] **Step 6: Update constants**

In `src/game/services/kanji-kombat-service.js`, replace:

```js
export const PROMPT_BUFFER_TARGET = 5;
export const PROMPT_BUFFER_REFILL_THRESHOLD = 3;
```

with:

```js
export const PROMPT_BUFFER_TARGET = 30;
export const PROMPT_BUFFER_REFILL_THRESHOLD = 10;
```

In `public/js/ui/kanji-kombat.js`, replace:

```js
const PROMPT_BUFFER_REFILL_THRESHOLD = 3;
```

with:

```js
const PROMPT_BUFFER_REFILL_THRESHOLD = 10;
```

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Syntax check changed browser/server files**

```bash
node --check src/game/services/kanji-kombat-service.js
node --check public/js/ui/kanji-kombat.js
```

Expected: both print no syntax errors.

- [ ] **Step 9: Commit Task 1**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js public/js/ui/kanji-kombat.js tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "Expand Kanji Kombat prompt runway"
```

## Task 2: Add In-Memory Sync Queue Module

**Files:**

- Create: `public/js/ui/kanji-kombat-sync-queue.js`
- Create: `tests/unit/ui/kanji-kombat-sync-queue.test.js`

- [ ] **Step 1: Write queue unit tests**

Create `tests/unit/ui/kanji-kombat-sync-queue.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureKanjiKombatSyncQueue,
  createKanjiKombatSyncQueue,
  getKanjiKombatSyncQueue,
  REVIEW_SYNC_QUEUE_HARD_LIMIT,
  REVIEW_SYNC_QUEUE_RESUME_LIMIT,
  REVIEW_SYNC_QUEUE_SOFT_LIMIT,
  REVIEW_SYNC_RETRY_DELAYS_MS,
  resetKanjiKombatSyncQueue,
} from '../../../public/js/ui/kanji-kombat-sync-queue.js';

function createManualScheduler() {
  const scheduled = [];
  return {
    scheduled,
    schedule(fn, delay) {
      scheduled.push({ fn, delay });
      return scheduled.length;
    },
    cancel() {},
    async runNext() {
      const next = scheduled.shift();
      assert.ok(next, 'expected a scheduled retry');
      next.fn();
      await Promise.resolve();
      await Promise.resolve();
      return next.delay;
    },
  };
}

describe('kanji-kombat sync queue', () => {
  it('tracks soft, hard, and resume limits', () => {
    const queue = createKanjiKombatSyncQueue({ syncItem: async () => ({ status: 'accepted' }) });

    assert.equal(REVIEW_SYNC_QUEUE_SOFT_LIMIT, 40);
    assert.equal(REVIEW_SYNC_QUEUE_HARD_LIMIT, 60);
    assert.equal(REVIEW_SYNC_QUEUE_RESUME_LIMIT, 30);

    for (let i = 0; i < REVIEW_SYNC_QUEUE_HARD_LIMIT; i++) {
      assert.equal(queue.enqueue({ actionId: `run_${i}`, kind: 'intro', promptId: `kkp_${i}` }).accepted, true);
    }

    assert.equal(queue.pendingCount(), REVIEW_SYNC_QUEUE_HARD_LIMIT);
    assert.equal(queue.isAtHardLimit(), true);
    assert.equal(queue.canConsumePrompt(), false);
    assert.equal(queue.enqueue({ actionId: 'run_blocked', kind: 'intro', promptId: 'kkp_blocked' }).accepted, false);
  });

  it('drains one head item at a time and immediately drains the next accepted item', async () => {
    const calls = [];
    const accepted = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => {
        calls.push(item.actionId);
        return { status: 'accepted', actionId: item.actionId };
      },
      onAccepted: (item, result) => accepted.push([item.actionId, result.status]),
    });

    queue.enqueue({ actionId: 'run_a', kind: 'intro', promptId: 'kkp_a' });
    queue.enqueue({ actionId: 'run_b', kind: 'intro', promptId: 'kkp_b' });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(calls, ['run_a', 'run_b']);
    assert.deepEqual(accepted, [['run_a', 'accepted'], ['run_b', 'accepted']]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('keeps a failed head item and retries with configured backoff', async () => {
    const scheduler = createManualScheduler();
    let attempts = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      syncItem: async item => {
        attempts += 1;
        if (attempts < 3) throw new Error(`network-${attempts}`);
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({ actionId: 'run_retry', kind: 'intro', promptId: 'kkp_retry' });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(queue.pendingCount(), 1);
    assert.equal(scheduler.scheduled[0].delay, REVIEW_SYNC_RETRY_DELAYS_MS[0]);

    const firstDelay = await scheduler.runNext();
    assert.equal(firstDelay, REVIEW_SYNC_RETRY_DELAYS_MS[0]);
    assert.equal(scheduler.scheduled[0].delay, REVIEW_SYNC_RETRY_DELAYS_MS[1]);

    const secondDelay = await scheduler.runNext();
    assert.equal(secondDelay, REVIEW_SYNC_RETRY_DELAYS_MS[1]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('treats corrected responses as resolved and calls onCorrected', async () => {
    const corrected = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => ({ status: 'corrected', actionId: item.actionId, reason: 'prompt_mismatch' }),
      onCorrected: (item, result) => corrected.push([item.actionId, result.reason]),
    });

    queue.enqueue({ actionId: 'run_corrected', kind: 'quiz', promptId: 'kkp_corrected' });
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(corrected, [['run_corrected', 'prompt_mismatch']]);
    assert.equal(queue.pendingCount(), 0);
  });

  it('exposes a shared configured queue for Kanji Kombat and combat-loop modules', () => {
    resetKanjiKombatSyncQueue();
    assert.equal(getKanjiKombatSyncQueue(), null);

    const queue = configureKanjiKombatSyncQueue({
      syncItem: async () => ({ status: 'accepted' }),
    });

    assert.equal(getKanjiKombatSyncQueue(), queue);
    resetKanjiKombatSyncQueue();
    assert.equal(getKanjiKombatSyncQueue(), null);
  });

  it('resets queued items and cancels retry state', async () => {
    const scheduler = createManualScheduler();
    let cancelCount = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: () => { cancelCount += 1; },
      syncItem: async () => {
        throw new Error('offline');
      },
    });

    queue.enqueue({ actionId: 'run_reset', kind: 'intro', promptId: 'kkp_reset' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 1);

    queue.reset();
    assert.equal(queue.pendingCount(), 0);
    assert.equal(cancelCount, 1);
  });
});
```

- [ ] **Step 2: Run queue test and verify RED**

```bash
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
```

Expected: FAIL because `public/js/ui/kanji-kombat-sync-queue.js` does not exist.

- [ ] **Step 3: Create sync queue module**

Create `public/js/ui/kanji-kombat-sync-queue.js`:

```js
export const REVIEW_SYNC_QUEUE_SOFT_LIMIT = 40;
export const REVIEW_SYNC_QUEUE_HARD_LIMIT = 60;
export const REVIEW_SYNC_QUEUE_RESUME_LIMIT = 30;
export const REVIEW_SYNC_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000, 15000];

function defaultSchedule(fn, delay) {
  return setTimeout(fn, delay);
}

function defaultCancel(timerId) {
  clearTimeout(timerId);
}

function isResolvedSyncResult(result) {
  return result?.status === 'accepted'
    || result?.status === 'corrected'
    || result?.alreadyCommitted === true;
}

export function createKanjiKombatSyncQueue({
  syncItem,
  onAccepted = () => {},
  onCorrected = () => {},
  onFailed = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = defaultCancel,
} = {}) {
  if (typeof syncItem !== 'function') {
    throw new Error('syncItem function required');
  }

  let items = [];
  let draining = false;
  let retryTimer = null;
  let pausedForHardLimit = false;

  function pendingCount() {
    return items.length;
  }

  function isAtSoftLimit() {
    return pendingCount() >= REVIEW_SYNC_QUEUE_SOFT_LIMIT;
  }

  function isAtHardLimit() {
    return pendingCount() >= REVIEW_SYNC_QUEUE_HARD_LIMIT;
  }

  function canConsumePrompt() {
    return !isAtHardLimit();
  }

  function clearRetryTimer() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(item) {
    clearRetryTimer();
    const index = Math.min(item.attempts || 0, REVIEW_SYNC_RETRY_DELAYS_MS.length - 1);
    const delay = REVIEW_SYNC_RETRY_DELAYS_MS[index];
    item.attempts = (item.attempts || 0) + 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      void drain();
    }, delay);
  }

  function checkResume() {
    if (pausedForHardLimit && pendingCount() <= REVIEW_SYNC_QUEUE_RESUME_LIMIT) {
      pausedForHardLimit = false;
      onResume({ pendingCount: pendingCount() });
    }
  }

  async function drain() {
    if (draining) return;
    if (items.length === 0) {
      checkResume();
      return;
    }
    if (retryTimer != null) return;

    draining = true;
    const item = items[0];
    item.status = 'syncing';

    try {
      const result = await syncItem(item);
      if (!isResolvedSyncResult(result)) {
        throw new Error(result?.error || 'Kanji Kombat sync did not return an accepted response');
      }

      items.shift();
      item.status = result.status === 'corrected' ? 'corrected' : 'accepted';
      item.attempts = 0;

      if (result.status === 'corrected') {
        onCorrected(item, result);
      } else {
        onAccepted(item, result);
      }
    } catch (error) {
      item.status = 'failed';
      onFailed(item, error);
      scheduleRetry(item);
    } finally {
      draining = false;
    }

    checkResume();
    if (retryTimer == null && items.length > 0) {
      void drain();
    }
  }

  function enqueue(item) {
    if (isAtHardLimit()) {
      pausedForHardLimit = true;
      onPause({ pendingCount: pendingCount(), reason: 'hardLimit' });
      return { accepted: false, pendingCount: pendingCount(), hardLimit: true };
    }

    items.push({
      ...item,
      attempts: Number.isInteger(item.attempts) ? item.attempts : 0,
      status: 'pending',
      createdAt: item.createdAt || Date.now(),
    });

    if (isAtHardLimit()) {
      pausedForHardLimit = true;
      onPause({ pendingCount: pendingCount(), reason: 'hardLimit' });
    }

    void drain();
    return { accepted: true, pendingCount: pendingCount(), hardLimit: isAtHardLimit() };
  }

  function reset() {
    clearRetryTimer();
    items = [];
    draining = false;
    pausedForHardLimit = false;
  }

  function drainNow() {
    clearRetryTimer();
    void drain();
  }

  return {
    enqueue,
    drain,
    drainNow,
    reset,
    pendingCount,
    isAtSoftLimit,
    isAtHardLimit,
    canConsumePrompt,
    snapshot: () => items.map(item => ({ ...item })),
  };
}

let activeKanjiKombatSyncQueue = null;

export function configureKanjiKombatSyncQueue(options = {}) {
  activeKanjiKombatSyncQueue = createKanjiKombatSyncQueue(options);
  return activeKanjiKombatSyncQueue;
}

export function getKanjiKombatSyncQueue() {
  return activeKanjiKombatSyncQueue;
}

export function resetKanjiKombatSyncQueue() {
  activeKanjiKombatSyncQueue?.reset();
  activeKanjiKombatSyncQueue = null;
}
```

- [ ] **Step 4: Run queue test and verify GREEN**

```bash
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
```

Expected: PASS.

- [ ] **Step 5: Syntax check queue module**

```bash
node --check public/js/ui/kanji-kombat-sync-queue.js
```

Expected: no syntax errors.

- [ ] **Step 6: Commit Task 2**

```bash
/usr/bin/git add public/js/ui/kanji-kombat-sync-queue.js tests/unit/ui/kanji-kombat-sync-queue.test.js
/usr/bin/git commit -m "Add Kanji Kombat sync queue"
```

## Task 3: Queue Intro And Completion Choices

**Files:**

- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Add intro queue UI tests**

Add these tests near the existing buffered intro prompt tests in `tests/unit/ui/kanji-kombat-ui.test.js`:

```js
  it('queues intro sync and keeps the next prompt visible when submit is delayed', async () => {
    const calls = [];
    let resolveSubmit;
    const submitPromise = new Promise(resolve => { resolveSubmit = resolve; });
    let currentState = null;

    initKanjiKombatUI({
      submitIntro: async (cardId, choice, options = {}) => {
        calls.push(['submitIntro', cardId, choice, options.promptId, options.sequence]);
        return submitPromise;
      },
      updateGameState: state => {
        currentState = state;
        calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]);
        renderKanjiKombatAction(state);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_queue',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next_queue',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(4);

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');
    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', 'kkp_next_queue'],
      ['submitIntro', 'hiragana:か', 'unknown', 'kkp_intro_queue', 1],
    ]);
    assert.equal(calls.some(call => call[0] === 'showNarration'), false);

    resolveSubmit({
      status: 'accepted',
      state: {
        phase: 'combat',
        run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      },
    });
    await flushPromises(4);
  });

  it('does not replay a consumed intro when the server response is null', async () => {
    const calls = [];
    let currentState = null;

    initKanjiKombatUI({
      submitIntro: async () => null,
      updateGameState: state => {
        currentState = state;
        calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]);
        renderKanjiKombatAction(state);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_null',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next_null',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(8);

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');
    assert.equal(calls.some(call => call[0] === 'showNarration' && /did not save/.test(call[1])), false);
  });
```

- [ ] **Step 2: Add hard-cap pause test**

Add this test in `tests/unit/ui/kanji-kombat-ui.test.js`:

```js
  it('pauses before consuming a prompt when the sync queue is at the hard limit', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async () => null,
      updateGameState: state => calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
      __testQueueSeed: Array.from({ length: 60 }, (_, index) => ({
        actionId: `run_seed_${index}`,
        kind: 'intro',
        promptId: `kkp_seed_${index}`,
      })),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_blocked_intro',
            sequence: 1,
            kind: 'intro',
            cardId: 'hiragana:か',
            intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const handled = await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(2);

    assert.equal(handled, false);
    assert.deepEqual(calls, [
      ['showNarration', 'Connection is spotty. Your reviews will sync when you reconnect.'],
    ]);
  });
```

- [ ] **Step 3: Add completion choice queue test**

Add this test in `tests/unit/ui/kanji-kombat-ui.test.js`:

```js
  it('queues keep-going completion choices and advances locally before submit resolves', async () => {
    const calls = [];
    let resolveSubmit;
    const submitPromise = new Promise(resolve => { resolveSubmit = resolve; });
    let currentState = null;

    initKanjiKombatUI({
      submitCompletionChoice: async (keepGoing, options = {}) => {
        calls.push(['submitCompletionChoice', keepGoing, options.promptId, options.sequence]);
        return submitPromise;
      },
      updateGameState: state => {
        currentState = state;
        calls.push([
          'updateGameState',
          state.run.kanjiKombat.completionChoicePending === true,
          state.run.kanjiKombat.endlessMode === true,
        ]);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          completionChoicePending: true,
          promptBuffer: [{
            promptId: 'kkp_complete_queue',
            sequence: 4,
            kind: 'completePrompt',
            cardId: null,
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].click();
    await flushPromises(4);

    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', false, true],
      ['submitCompletionChoice', true, 'kkp_complete_queue', 4],
    ]);

    resolveSubmit({
      status: 'accepted',
      state: {
        phase: 'combat',
        run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      },
    });
    await flushPromises(4);
  });
```

- [ ] **Step 4: Run UI tests and verify RED**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because Kanji Kombat still awaits submit and rolls back on null responses.

- [ ] **Step 5: Wire the queue into `kanji-kombat.js`**

At the top of `public/js/ui/kanji-kombat.js`, add:

```js
import {
  configureKanjiKombatSyncQueue,
  REVIEW_SYNC_QUEUE_HARD_LIMIT,
} from './kanji-kombat-sync-queue.js';
```

Replace the save-failure copy constant:

```js
const KANJI_KOMBAT_SAVE_FAILURE_COPY = 'Kanji Kombat choice did not save. Please try again.';
```

with:

```js
const KANJI_KOMBAT_SPOTTY_CONNECTION_COPY = 'Connection is spotty. Your reviews will sync when you reconnect.';
```

Add module state near `latestKanjiKombatState`:

```js
let reviewSyncQueue = null;
let consumedPromptIds = new Set();
```

Add these helpers after `updateKanjiKombatGameState`:

```js
function activePromptId(state) {
  return getActiveBufferedPrompt(state?.run?.kanjiKombat)?.promptId || null;
}

function rememberConsumedPrompt(prompt) {
  if (prompt?.promptId) consumedPromptIds.add(prompt.promptId);
}

function stateWouldReplayConsumedPrompt(state) {
  const promptId = activePromptId(state);
  return !!promptId && consumedPromptIds.has(promptId);
}

function applyServerStateIfNotBehindLocalProgress(state) {
  if (!state || stateWouldReplayConsumedPrompt(state)) return false;
  updateKanjiKombatGameState(state);
  return true;
}

async function showKanjiKombatSyncPause() {
  await api.showNarration?.(KANJI_KOMBAT_SPOTTY_CONNECTION_COPY, { speaker: 'Cid', autoDismiss: 1800 });
}

function canConsumeKanjiKombatPrompt() {
  return !reviewSyncQueue || reviewSyncQueue.canConsumePrompt();
}

function createReviewSyncQueue() {
  return configureKanjiKombatSyncQueue({
    syncItem: async item => {
      if (item.kind === 'intro') {
        return api.submitIntro(item.cardId, item.choice, item.options);
      }
      if (item.kind === 'completionChoice') {
        return api.submitCompletionChoice(item.keepGoing, item.options);
      }
      throw new Error(`Unsupported Kanji Kombat sync item: ${item.kind}`);
    },
    onAccepted: (_item, result) => {
      if (result?.state) applyServerStateIfNotBehindLocalProgress(result.state);
      if (!result?.combatEnded) requestPromptBufferRefillIfLow(result?.state || currentKanjiKombatState());
      if (result?.combatEnded) api.finishCombatResult?.(result);
    },
    onCorrected: (_item, result) => {
      const state = result?.authoritativeState || result?.state;
      if (state) applyServerStateIfNotBehindLocalProgress(state);
      refreshKanjiKombatAction();
    },
    onFailed: (_item, error) => {
      console.warn('[KanjiKombat] queued review sync failed:', error?.message || error);
    },
    onPause: () => {
      void showKanjiKombatSyncPause();
    },
  });
}
```

Update `initKanjiKombatUI(deps)`:

```js
export function initKanjiKombatUI(deps) {
  api = { ...DEFAULT_API, ...deps };
  latestKanjiKombatState = null;
  promptBufferRefillPromise = null;
  consumedPromptIds = new Set();
  reviewSyncQueue = createReviewSyncQueue();
  if (Array.isArray(deps?.__testQueueSeed)) {
    for (const item of deps.__testQueueSeed.slice(0, REVIEW_SYNC_QUEUE_HARD_LIMIT)) {
      reviewSyncQueue.enqueue({ ...item, createdAt: Date.now() });
    }
  }
}
```

- [ ] **Step 6: Replace intro submit awaiting with queue enqueue**

Inside the intro `onChoice` handler, after `const introCard = ...`, use this flow:

```js
      onChoice: async choice => {
        if (!canConsumeKanjiKombatPrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const pending = createKanjiKombatPendingAction(gameState, 'kanjiKombat.intro', draft => {
          draft.run ||= {};
          draft.run.kanjiKombat ||= {};
          if (introPrompt) {
            consumePromptHeadDraft(draft, introPrompt);
          } else {
            draft.run.kanjiKombat.pendingIntro = null;
          }
        });
        if (!pending) return false;

        rememberConsumedPrompt(introPrompt);
        updateKanjiKombatGameState(pending.state);
        if (!renderKanjiKombatAction(pending.state)) clearActionArea();

        reviewSyncQueue.enqueue({
          actionId: pending.actionId,
          kind: 'intro',
          promptId: introPrompt?.promptId || null,
          sequence: introPrompt?.sequence ?? null,
          cardId: introCard.id,
          choice,
          options: {
            actionId: pending.actionId,
            ...promptRef(introPrompt),
          },
        });

        requestPromptBufferRefillIfLow(pending.state);
        return true;
      },
```

Remove the old `try { result = await api.submitIntro(...) }`, rollback, save-failure narration, and accepted-state logic from that handler.

- [ ] **Step 7: Replace completion submit awaiting with queue enqueue**

Inside the completion `onChoice` handler, use the same pattern:

```js
      onChoice: async keepGoing => {
        if (!canConsumeKanjiKombatPrompt()) {
          await showKanjiKombatSyncPause();
          return false;
        }

        const pending = createKanjiKombatPendingAction(
          gameState,
          'kanjiKombat.completionChoice',
          draft => {
            draft.run ||= {};
            draft.run.kanjiKombat ||= {};
            if (bufferedPrompt?.kind === 'completePrompt') {
              consumePromptHeadDraft(draft, bufferedPrompt);
            } else {
              draft.run.kanjiKombat.completionChoicePending = false;
            }
            if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
          }
        );
        if (!pending) return false;

        rememberConsumedPrompt(bufferedPrompt);
        updateKanjiKombatGameState(pending.state);
        if (!renderKanjiKombatAction(pending.state)) clearActionArea();

        reviewSyncQueue.enqueue({
          actionId: pending.actionId,
          kind: 'completionChoice',
          promptId: bufferedPrompt?.promptId || null,
          sequence: bufferedPrompt?.sequence ?? null,
          cardId: null,
          keepGoing,
          options: {
            actionId: pending.actionId,
            ...promptRef(bufferedPrompt?.kind === 'completePrompt' ? bufferedPrompt : null),
          },
        });

        requestPromptBufferRefillIfLow(pending.state);
        return true;
      },
```

Remove the old awaited completion-choice submit block and save-failure rollback.

- [ ] **Step 8: Run UI tests and verify GREEN**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 9: Update source contract test**

In `tests/unit/ui/optimistic-run-integration.test.js`, add assertions that `kanji-kombat.js` no longer contains the old save-failure copy and imports the sync queue:

```js
  it('Kanji Kombat prompt choices use subway sync queue copy instead of save-failure rollback copy', () => {
    assert.match(kanjiInitSource, /configureKanjiKombatSyncQueue/);
    assert.match(kanjiInitSource, /Connection is spotty\. Your reviews will sync when you reconnect\./);
    assert.doesNotMatch(kanjiInitSource, /Kanji Kombat choice did not save\. Please try again\./);
  });
```

If `kanjiInitSource` is not defined in that file, define it beside the existing source reads:

```js
const kanjiInitSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');
```

- [ ] **Step 10: Run contract test**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

- [ ] **Step 11: Syntax check**

```bash
node --check public/js/ui/kanji-kombat.js
```

Expected: no syntax errors.

- [ ] **Step 12: Commit Task 3**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "Queue Kanji Kombat prompt choices"
```

## Task 4: Queue Quiz Answer Verification After Local Combat Prediction

**Files:**

- Modify: `public/js/ui/kanji-kombat-sync-queue.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `tests/unit/ui/combat-network-hardening.test.js`
- Modify: `tests/unit/ui/kanji-kombat-sync-queue.test.js`

- [ ] **Step 1: Add queue support for externally drained quiz items**

Extend `tests/unit/ui/kanji-kombat-sync-queue.test.js` with:

```js
  it('can drain externally enqueued quiz items through the same ordered queue', async () => {
    const calls = [];
    const queue = createKanjiKombatSyncQueue({
      syncItem: async item => {
        calls.push([item.kind, item.actionId, item.envelope?.actionType]);
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({
      actionId: 'run_quiz',
      kind: 'quiz',
      promptId: 'kkp_quiz',
      envelope: { actionType: 'kanjiKombat.answer' },
    });

    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(calls, [['quiz', 'run_quiz', 'kanjiKombat.answer']]);
    assert.equal(queue.pendingCount(), 0);
  });
```

- [ ] **Step 2: Add combat-loop quiz local-continuation test**

In `tests/unit/ui/combat-network-hardening.test.js`, add this test near the existing optimistic Kanji Kombat answer tests:

```js
  it('Kanji Kombat answer returns to local control before queued verification resolves', async () => {
    const calls = [];
    const updates = [];
    let resolveVerification;
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [],
    };
    const enemy = {
      ...ally,
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      hp: 20,
      maxHp: 20,
    };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_local', stateVersion: 2, nextTurnSeed: 'seed_kanji_local' },
        turnCount: 0,
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a', correct: true },
              { id: 'answer-wrong', answer: 'i', correct: false },
            ],
          },
          promptBuffer: [
            {
              promptId: 'kkp_answer_local',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            },
            {
              promptId: 'kkp_next_local',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: {
                cardId: 'hiragana:い',
                prompt: 'い',
                choices: [{ id: 'answer-i', answer: 'i', correct: true }],
              },
            },
          ],
        },
      },
    };

    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async () => new Promise(resolve => {
      resolveVerification = resolve;
    }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const handled = await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-correct',
      promptRef: { promptId: 'kkp_answer_local', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async localTranscript => calls.push(['playback', localTranscript.kanjiAnswerCorrect]),
      startMoveSelection: () => calls.push(['startMoveSelection']),
      getEnemyDialogueActive: () => false,
    });

    assert.equal(handled, true);
    assert.deepEqual(calls, [
      ['playback', true],
      ['startMoveSelection'],
    ]);
    assert.equal(updates.at(-1).run.kanjiKombat.promptBuffer[0].promptId, 'kkp_next_local');
    assert.equal(updates.at(-1).run.kanjiKombat.currentQuiz.cardId, 'hiragana:い');

    resolveVerification({
      status: 'accepted',
      stateVersion: 3,
      nextSeed: 'seed_after_local',
      allies: updates.at(-1).combat.allies,
      enemies: updates.at(-1).combat.enemies,
      creatureParty: updates.at(-1).run.creatureParty,
      turnCount: 1,
    });
    await Promise.resolve();
    await Promise.resolve();
  });
```

- [ ] **Step 3: Add combat-loop correction test**

Add this test in `tests/unit/ui/combat-network-hardening.test.js`:

```js
  it('queued Kanji Kombat correction patches combat state without replaying the answered prompt', async () => {
    const updates = [];
    const syncCalls = [];
    const ally = { id: 'hi', uid: 'ally-hi', hp: 100, maxHp: 100, element: 'fire', moves: [] };
    const localEnemy = { id: 'mizu', uid: 'enemy-local', hp: 5, maxHp: 20 };
    const authoritativeEnemy = { id: 'ishi', uid: 'enemy-server', hp: 20, maxHp: 20 };
    const currentState = {
      phase: 'combat',
      combat: {
        active: true,
        mode: 'kanjiKombat',
        allies: [ally],
        enemies: [localEnemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_kanji_corrected', stateVersion: 2, nextTurnSeed: 'seed_kanji_corrected' },
      },
      run: {
        mode: 'kanjiKombat',
        partySkills: [],
        creatureParty: { active: [ally], reserves: [] },
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [{ id: 'answer-correct', answer: 'a', correct: true }],
          },
          promptBuffer: [
            {
              promptId: 'kkp_answer_corrected',
              sequence: 1,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [{ id: 'answer-correct', answer: 'a', correct: true }],
              },
            },
            {
              promptId: 'kkp_after_corrected',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', prompt: 'い', choices: [{ id: 'answer-i', answer: 'i', correct: true }] },
            },
          ],
        },
      },
    };

    setSceneManager({
      transitioning: false,
      currentScene: {
        disposed: false,
        _exiting: false,
        syncCreatures: async args => syncCalls.push(args),
      },
    });
    combatLoop.__combatNetworkTest.setKanjiKombatAnswerApi(async (_envelope) => ({
      status: 'corrected',
      reason: 'transcript_mismatch',
      authoritativeState: {
        phase: 'combat',
        combat: {
          active: true,
          mode: 'kanjiKombat',
          allies: [ally],
          enemies: [authoritativeEnemy],
          actionCursor: { side: 'ally', index: 0, opening: false },
        },
        run: {
          mode: 'kanjiKombat',
          creatureParty: { active: [ally], reserves: [] },
          kanjiKombat: {
            promptBuffer: [{
              promptId: 'kkp_after_corrected',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:い',
              quiz: { cardId: 'hiragana:い', prompt: 'い', choices: [{ id: 'answer-i', answer: 'i', correct: true }] },
            }],
            currentQuiz: { cardId: 'hiragana:い', prompt: 'い', choices: [{ id: 'answer-i', answer: 'i', correct: true }] },
          },
        },
      },
    }));
    combatLoop.__combatNetworkTest.setStateAccessors({
      get: () => updates.at(-1) || currentState,
      update: state => updates.push(state),
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    await combatLoop.__combatNetworkTest.runOptimisticKanjiKombatAnswer({
      answerId: 'answer-correct',
      promptRef: { promptId: 'kkp_answer_corrected', sequence: 1, cardId: 'hiragana:あ' },
      turnTiming: {},
      playback: async () => {},
      startMoveSelection: () => {},
      getEnemyDialogueActive: () => false,
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(updates.at(-1).run.kanjiKombat.promptBuffer[0].promptId, 'kkp_after_corrected');
    assert.deepEqual(updates.at(-1).combat.enemies, [authoritativeEnemy]);
    assert.equal(syncCalls.length >= 1, true);
  });
```

- [ ] **Step 4: Run combat tests and verify RED**

```bash
node --experimental-test-module-mocks --test tests/unit/ui/combat-network-hardening.test.js
```

Expected: FAIL because `runOptimisticKanjiKombatAnswer()` currently awaits verification before returning.

- [ ] **Step 5: Confirm shared queue accessor**

The shared queue helpers were added in Task 2 and `public/js/ui/kanji-kombat.js` configured the queue in Task 3. Confirm `public/js/ui/kanji-kombat-sync-queue.js` contains this getter before updating the combat loop:

```js
export function getKanjiKombatSyncQueue() {
  return activeKanjiKombatSyncQueue;
}
```

Expected: the getter exists and returns the queue configured by `configureKanjiKombatSyncQueue(...)`.

- [ ] **Step 6: Add local Kanji Kombat predicted state helper**

In `public/js/ui/combat-loop.js`, import:

```js
import { getKanjiKombatSyncQueue } from './kanji-kombat-sync-queue.js';
```

Add this helper near `withKanjiKombatPromptRef()`:

```js
function localStateAfterKanjiKombatPrediction(state, optimistic, promptRef = {}) {
  const next = JSON.parse(JSON.stringify(state || {}));
  const kk = next.run?.kanjiKombat;
  if (kk && Array.isArray(kk.promptBuffer)) {
    const head = kk.promptBuffer[0] || null;
    const matchesPrompt =
      !promptRef?.promptId
      || (
        head?.promptId === promptRef.promptId
        && head?.sequence === promptRef.sequence
        && (!Object.hasOwn(promptRef, 'cardId') || head?.cardId === promptRef.cardId)
      );
    if (matchesPrompt) {
      kk.promptBuffer = kk.promptBuffer.slice(1);
      const nextPrompt = kk.promptBuffer[0] || null;
      kk.currentQuiz = nextPrompt?.kind === 'quiz' ? nextPrompt.quiz : null;
      kk.pendingIntro = nextPrompt?.kind === 'intro'
        ? {
            cardId: nextPrompt.cardId,
            card: nextPrompt.intro.card,
            source: nextPrompt.source || nextPrompt.intro.source || null,
            promptId: nextPrompt.promptId,
            sequence: nextPrompt.sequence,
          }
        : null;
      kk.completionChoicePending = nextPrompt?.kind === 'completePrompt';
    }
  }

  if (optimistic.localNextCombat && next.combat) {
    next.combat = { ...next.combat, ...optimistic.localNextCombat };
  }
  if (optimistic.localTranscript?.creatureParty && next.run) {
    next.run.creatureParty = optimistic.localTranscript.creatureParty;
  }
  return next;
}
```

- [ ] **Step 7: Change `runOptimisticKanjiKombatAnswer()` to queue verification**

In `runOptimisticKanjiKombatAnswer()`, replace the current `verificationPromise` / await verification block with this flow:

```js
  const requestStartedAt = performance.now();
  markCombatAnimationStart(turnTiming, requestStartedAt);
  const waitForStreakRewardBanner = willKanjiKombatAnswerTriggerStreakReward(
    getGameState(),
    optimistic.localTranscript.kanjiAnswerCorrect
  );
  if (!waitForStreakRewardBanner) {
    void vfx.showKanjiKombatAnswerBanner(optimistic.localTranscript.kanjiAnswerCorrect);
  }
  await playback(optimistic.localTranscript, turnTiming, {
    choices: [],
    logMoveIntent: false,
    nextSelectionDelayMs,
    skipAttackCards: true,
    deferNextSelection: true,
  });

  const localState = localStateAfterKanjiKombatPrediction(getGameState(), optimistic, promptRef);
  updateGameState(localState);
  playerAttackPending = false;
  combatActive = isRecoveredCombatActive(localState);

  const queue = getKanjiKombatSyncQueue();
  if (queue) {
    queue.enqueue({
      actionId: optimistic.envelope.actionId,
      kind: 'quiz',
      promptId: promptRef?.promptId || null,
      sequence: promptRef?.sequence ?? null,
      cardId: promptRef?.cardId || null,
      answerId,
      envelope: optimistic.envelope,
      sync: () => apiSubmitKanjiKombatAnswer(withKanjiKombatPromptRef(optimistic.envelope, promptRef)),
      onAccepted: async result => {
        const recovery = await handleOptimisticCombatVerification(result, recoveryActionType);
        if (recovery?.recovered === false) throw new Error('Combat sync failed');
        if (result?.kanjiStreakReward || waitForStreakRewardBanner) {
          await syncKanjiKombatStreakRewardVisuals(result);
          void vfx.showKanjiKombatAnswerBanner(result?.kanjiAnswerCorrect, result?.kanjiStreakReward || null);
        }
        if (result?.nextWave) {
          await playKanjiKombatNextWaveTransition(result);
          animatedEnemyKoKeys = collectExistingEnemyKoAnimationKeys(getGameState()?.combat?.enemies || []);
        }
        if (result?.combatEnded || !isRecoveredCombatActive(getGameState())) {
          await finishCombatLoop(result || { combatEnded: true, victory: false });
        }
      },
      onCorrected: async result => {
        const recovery = await handleOptimisticCombatVerification(result, recoveryActionType);
        if (recovery?.recovered === false) throw new Error('Combat sync failed');
      },
    });
  } else {
    void apiSubmitKanjiKombatAnswer(withKanjiKombatPromptRef(optimistic.envelope, promptRef))
      .then(result => handleOptimisticCombatVerification(result, recoveryActionType))
      .catch(error => console.warn('[KanjiKombat] queued answer sync failed:', error?.message || error));
  }

  logCombatTurnTiming(turnTiming, optimistic.localTranscript, 'optimistic_queued');
  const enemyDialogueActive = typeof isEnemyDialogueActive === 'function' && isEnemyDialogueActive();
  if (combatActive && isRecoveredCombatActive(getGameState()) && !enemyDialogueActive) {
    await waitBeforeMoveSelection(nextSelectionDelayMs);
    restartMoveSelection();
  }
  return true;
```

Then update the queue `syncItem` in `kanji-kombat.js`:

```js
      if (item.kind === 'quiz') {
        return item.sync();
      }
```

And update queue `onAccepted` / `onCorrected` in `kanji-kombat.js` so item-owned callbacks run first:

```js
    onAccepted: (item, result) => {
      if (typeof item.onAccepted === 'function') {
        void item.onAccepted(result);
        return;
      }
      if (result?.state) applyServerStateIfNotBehindLocalProgress(result.state);
      if (!result?.combatEnded) requestPromptBufferRefillIfLow(result?.state || currentKanjiKombatState());
      if (result?.combatEnded) api.finishCombatResult?.(result);
    },
    onCorrected: (item, result) => {
      if (typeof item.onCorrected === 'function') {
        void item.onCorrected(result);
        return;
      }
      const state = result?.authoritativeState || result?.state;
      if (state) applyServerStateIfNotBehindLocalProgress(state);
      refreshKanjiKombatAction();
    },
```

- [ ] **Step 8: Run queue and combat tests**

```bash
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
node --experimental-test-module-mocks --test tests/unit/ui/combat-network-hardening.test.js
```

Expected: PASS.

- [ ] **Step 9: Syntax check changed browser files**

```bash
node --check public/js/ui/kanji-kombat-sync-queue.js
node --check public/js/ui/combat-loop.js
node --check public/js/ui/kanji-kombat.js
```

Expected: no syntax errors.

- [ ] **Step 10: Commit Task 4**

```bash
/usr/bin/git add public/js/ui/kanji-kombat-sync-queue.js public/js/ui/combat-loop.js public/js/ui/kanji-kombat.js tests/unit/ui/kanji-kombat-sync-queue.test.js tests/unit/ui/combat-network-hardening.test.js
/usr/bin/git commit -m "Queue Kanji Kombat answer verification"
```

## Task 5: Connection Events, Empty-Runway Pause, And Source Contract Coverage

**Files:**

- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `public/js/ui/kanji-kombat-sync-queue.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: `tests/unit/ui/kanji-kombat-sync-queue.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Add drain trigger tests**

In `tests/unit/ui/kanji-kombat-sync-queue.test.js`, add:

```js
  it('drainNow clears retry delay and immediately attempts the head item', async () => {
    const scheduler = createManualScheduler();
    let attempts = 0;
    const queue = createKanjiKombatSyncQueue({
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      syncItem: async item => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return { status: 'accepted', actionId: item.actionId };
      },
    });

    queue.enqueue({ actionId: 'run_online', kind: 'intro', promptId: 'kkp_online' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 1);

    queue.drainNow();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(queue.pendingCount(), 0);
  });
```

- [ ] **Step 2: Add empty-runway pause UI test**

In `tests/unit/ui/kanji-kombat-ui.test.js`, add:

```js
  it('shows spotty connection copy when no prompt is available but sync is pending', async () => {
    const calls = [];
    initKanjiKombatUI({
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
      __testQueueSeed: [{
        actionId: 'run_pending_empty',
        kind: 'intro',
        promptId: 'kkp_pending_empty',
      }],
    });

    const handled = renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [],
          currentQuiz: null,
          pendingIntro: null,
          completionChoicePending: false,
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await flushPromises(2);

    assert.equal(handled, true);
    assert.deepEqual(calls, [
      ['showNarration', 'Connection is spotty. Your reviews will sync when you reconnect.'],
    ]);
  });
```

- [ ] **Step 3: Implement empty-runway pause in `renderKanjiKombatAction()`**

Near the end of `renderKanjiKombatAction(gameState)`, before `return false`, add:

```js
  if (!hasBufferedPrompt && reviewSyncQueue?.pendingCount() > 0) {
    void showKanjiKombatSyncPause();
    return true;
  }
```

- [ ] **Step 4: Wire online and visibility events**

In `initKanjiKombatUI(deps)`, after queue creation, add:

```js
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => reviewSyncQueue?.drainNow());
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') reviewSyncQueue?.drainNow();
    });
  }
```

Do not add removal handlers in this phase; `initKanjiKombatUI()` is called during app setup, not repeatedly during play.

- [ ] **Step 5: Add source contract assertions**

In `tests/unit/ui/optimistic-run-integration.test.js`, add:

```js
  it('Kanji Kombat subway sync uses bounded queue and no unbounded retry loop', () => {
    const queueSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat-sync-queue.js'), 'utf8');

    assert.match(queueSource, /REVIEW_SYNC_QUEUE_SOFT_LIMIT = 40/);
    assert.match(queueSource, /REVIEW_SYNC_QUEUE_HARD_LIMIT = 60/);
    assert.match(queueSource, /REVIEW_SYNC_QUEUE_RESUME_LIMIT = 30/);
    assert.match(queueSource, /REVIEW_SYNC_RETRY_DELAYS_MS = \[0, 500, 1000, 2000, 4000, 8000, 15000\]/);
    assert.doesNotMatch(queueSource, /while\s*\(\s*true\s*\)/);
  });
```

- [ ] **Step 6: Run focused UI tests**

```bash
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
node --experimental-test-module-mocks --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

- [ ] **Step 7: Syntax check**

```bash
node --check public/js/ui/kanji-kombat-sync-queue.js
node --check public/js/ui/kanji-kombat.js
```

Expected: no syntax errors.

- [ ] **Step 8: Commit Task 5**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js public/js/ui/kanji-kombat-sync-queue.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/kanji-kombat-sync-queue.test.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "Handle Kanji Kombat subway sync pauses"
```

## Task 6: Full Verification And Manual Playtest

**Files:**

- No planned source edits.
- Use `tmp/` for any playtest scripts or logs.

- [ ] **Step 1: Run focused Kanji Kombat test set**

```bash
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
node --experimental-test-module-mocks --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-run-integration.test.js
node --test tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js
```

Expected: all pass.

- [ ] **Step 2: Syntax check all changed JS files**

```bash
node --check public/js/ui/kanji-kombat-sync-queue.js
node --check public/js/ui/kanji-kombat.js
node --check public/js/ui/combat-loop.js
node --check src/game/services/kanji-kombat-service.js
```

Expected: no syntax errors.

- [ ] **Step 3: Run unit test gate**

```bash
npm run test:unit
```

Expected: unit suite passes.

- [ ] **Step 4: Run full Tier 1 + Tier 2 gate**

```bash
npm test
```

Expected: unit and integration tests pass.

- [ ] **Step 5: Manual playtest setup**

Run the dev server:

```bash
npm run dev
```

Expected: Vite dev server starts. After five seconds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 6: Manual playtest**

Use the Playwright MCP browser only after user permission if this is run interactively. Follow `docs/playtest-guide.md`.

Test flow:

1. Log in as `devtester` / `test1234`.
2. Enter Kanji Kombat from the hub.
3. Answer one normal quiz with network available.
4. Simulate slow/failed Kanji Kombat endpoints by temporarily intercepting `/api/game/kanji-kombat/intro`, `/api/game/kanji-kombat/answer`, and `/api/game/kanji-kombat/completion-choice` responses in the browser context.
5. Answer several buffered prompts.
6. Confirm visible prompt flow does not jump backward.
7. Let responses resolve.
8. Confirm queued sync drains and the prompt shown stays coherent.
9. Force the hard-cap test through unit coverage rather than manual clicking 60 cards.
10. Take screenshots at the normal prompt, delayed-sync prompt, and empty-runway pause if any visual CSS changed.

Expected:

- Cards already answered in the active session do not replay because a response is null or delayed.
- Sync failures show the spotty copy only when hard cap or empty runway blocks progress.
- Restored connectivity drains sync without a “saved” success toast.
- Battle sprites resync when a correction response arrives.

- [ ] **Step 7: Commit verification note if code changed during playtest**

If manual playtest revealed a bug and code changed, commit that fix with focused tests:

First inspect the modified files:

```bash
/usr/bin/git status --short
```

Then stage only the files touched by the playtest fix. The expected set is one or more of these files:

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js public/js/ui/combat-loop.js public/js/ui/kanji-kombat-sync-queue.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/kanji-kombat-sync-queue.test.js
/usr/bin/git commit -m "Fix Kanji Kombat subway sync playtest issue"
```

Expected: commit succeeds only if a real fix was made and verified.

If no code changed during playtest, do not create an empty commit.

## Final Handoff

- [ ] **Step 1: Confirm branch status**

```bash
/usr/bin/git status --short --branch
```

Expected: clean worktree on `feature/kanji-kombat-subway-sync`.

- [ ] **Step 2: Summarize verification evidence**

Record the exact commands and pass/fail status in the final response:

```text
node --test tests/unit/ui/kanji-kombat-sync-queue.test.js
node --experimental-test-module-mocks --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-run-integration.test.js
node --test tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js
npm run test:unit
npm test
```

Expected: every command either passes or the final response states the exact failing command and reason.

## Plan Self-Review Checklist

Spec coverage:

- In-memory bounded queue: Task 2.
- Queue caps 40/60/30: Task 2 and Task 5.
- Retry delays `[0, 500, 1000, 2000, 4000, 8000, 15000]`: Task 2 and Task 5.
- Prompt buffer target 30 / threshold 10: Task 1.
- Mixed due/new/completion runway without bypassing daily cap: Task 1.
- Intro and completion choices consume locally and sync later: Task 3.
- Quiz answers use local deterministic prediction and queued verification: Task 4.
- Server correction patches combat without replaying consumed prompt: Task 4.
- Empty runway and hard cap show spotty copy: Task 3 and Task 5.
- Reload drops in-memory queue: Task 2 reset coverage.
- No Speed Review changes: File map excludes Speed Review.

No unresolved product questions remain in this plan.
