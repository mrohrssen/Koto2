# Kanji Kombat Daily Boundary Runway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Kanji Kombat keep a server-prepared endless/early-review runway behind the daily-complete question so clicking **Yes** continues immediately without false spotty-connection copy.

**Architecture:** Convert the daily-complete prompt from a terminal `completePrompt` into a non-terminal `dailyCompletePrompt` boundary marker inside the existing `promptBuffer`. Server planning inserts the marker once, then continues filling the same runway with early-review prompts under endless-mode rules. The client consumes the marker locally like other prompt actions, records a `completionChoice`, and renders the next buffered prompt immediately when `keepGoing: true`.

**Tech Stack:** Node.js ES modules, `node:test`, Express route tests with Supertest, browser UI modules under `public/js/ui`, Kanji Kombat server logic in `src/game/services`.

---

## File Structure

- Modify `src/game/services/kanji-kombat-service.js`
  - Owns the prompt kind constants, server prompt planning, prompt head validation, prompt consumption, completion-choice commits, and run availability/lifecycle behavior.
- Modify `src/game/services/combat-cycle-service.js`
  - Treats `dailyCompletePrompt` as the wave/combat boundary prompt returned after a resolving answer.
- Modify `public/js/ui/kanji-kombat.js`
  - Renders and locally consumes `dailyCompletePrompt`, including the no-pause `Yes` path.
- Modify `public/js/ui/combat-loop.js`
  - Treats `dailyCompletePrompt` as the daily boundary after optimistic local quiz prediction.
- Modify `tests/unit/game/kanji-kombat-deck.test.js`
  - Covers buffer filling across the daily boundary, no marker duplication, and no persistent daily completion from preview buffering.
- Modify `tests/unit/game/kanji-kombat-run.test.js`
  - Covers service lifecycle, completion-choice validation, and legacy active-run behavior with the new marker kind.
- Modify `tests/unit/game/kanji-kombat-session-sync.test.js`
  - Covers session-log replay of `completionChoice` entries against `dailyCompletePrompt`.
- Modify `tests/unit/ui/kanji-kombat-ui.test.js`
  - Covers clicking **Yes** at the marker and immediately rendering the next buffered prompt with no spotty copy.
- Modify `tests/unit/ui/combat-network-hardening.test.js`
  - Keeps optimistic wave-boundary protection working with `dailyCompletePrompt`.
- Modify `tests/integration/flows/kanji-kombat.test.js`
  - Covers the end-to-end “normal daily complete → Yes → early review” flow with the next prompt already buffered.
- Modify `tests/smoke/kanji-kombat-subway.test.js`
  - Updates smoke helper prompt-kind handling so manual subway/offline tests still recognize the daily boundary.

---

### Task 1: Add Server Failing Tests For The Non-Terminal Daily Marker

**Files:**
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Add expected marker-kind constant near the imports**

Add this after the existing imports in `tests/unit/game/kanji-kombat-deck.test.js`:

```javascript
const DAILY_COMPLETE_PROMPT_KIND = 'dailyCompletePrompt';
```

- [ ] **Step 2: Update the direct daily-completion work test expectation**

In `tests/unit/game/kanji-kombat-deck.test.js`, change the assertion in `prompts for a completion choice when no due cards exist and daily cap is exhausted`:

```javascript
assert.equal(work.kind, DAILY_COMPLETE_PROMPT_KIND);
```

Keep these existing assertions unchanged in that same test:

```javascript
assert.equal(state.completionChoicePending, false);
assert.equal(state.report.completedDaily, true);
assert.equal(getScriptDailyState(userId, '2026-05-31').completed, true);
```

This direct `chooseNextScriptWork` call represents an active prompt request, not preview buffering, so durable completion can still be recorded here.

- [ ] **Step 3: Add a failing buffer runway test**

Add this test after `fills a thirty-prompt server runway without mutating persistent daily completion`:

```javascript
it('places one daily complete marker before endless early-review runway', () => {
  const data = loadSrsData(userId);
  const hiragana = data.script.cards.filter(c => c.type === 'hiragana');
  for (const card of hiragana) {
    card.due = new Date('2099-01-01T00:00:00Z');
    card.reps = 1;
  }
  hiragana[0].due = new Date('2000-01-01T00:00:00Z');
  data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: DAILY_NEW_LIMIT, completed: false };
  saveSrsData(userId, data);

  const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
  const prompts = fillKanjiKombatPromptBuffer(userId, state, {
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });

  const markerIndexes = prompts
    .map((prompt, index) => prompt.kind === DAILY_COMPLETE_PROMPT_KIND ? index : -1)
    .filter(index => index !== -1);

  assert.deepEqual(markerIndexes, [1]);
  assert.equal(prompts[0]?.kind, 'quiz');
  assert.equal(prompts[0]?.cardId, hiragana[0].id);
  assert.equal(prompts[2]?.kind, 'quiz');
  assert.equal(prompts[2]?.source, 'earlyReview');
  assert.notEqual(prompts[2]?.cardId, hiragana[0].id);
  assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  assert.equal(state.report.completedDaily, false);
});
```

- [ ] **Step 4: Add a failing no-duplicate refill test**

Add this test immediately after the new runway test:

```javascript
it('does not duplicate the daily complete marker when refilling after the boundary', () => {
  const data = loadSrsData(userId);
  const hiragana = data.script.cards.filter(c => c.type === 'hiragana');
  for (const card of hiragana) {
    card.due = new Date('2099-01-01T00:00:00Z');
    card.reps = 1;
  }
  hiragana[0].due = new Date('2000-01-01T00:00:00Z');
  data.kanjiKombatDaily = { date: '2026-05-31', introducedCount: DAILY_NEW_LIMIT, completed: false };
  saveSrsData(userId, data);

  const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
  fillKanjiKombatPromptBuffer(userId, state, {
    target: 5,
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });
  fillKanjiKombatPromptBuffer(userId, state, {
    target: 10,
    random: () => 0,
    now: new Date('2026-05-31T00:00:00Z'),
  });

  const markerCount = state.promptBuffer
    .filter(prompt => prompt.kind === DAILY_COMPLETE_PROMPT_KIND)
    .length;
  assert.equal(markerCount, 1);
  assert.equal(state.promptBuffer[1]?.kind, DAILY_COMPLETE_PROMPT_KIND);
  assert.equal(state.promptBuffer[2]?.kind, 'quiz');
  assert.equal(state.promptBuffer[2]?.source, 'earlyReview');
});
```

- [ ] **Step 5: Run the deck test and verify it fails**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: FAIL. The existing implementation still emits `completePrompt`, stops at the marker, or persists daily completion during preview buffering.

- [ ] **Step 6: Commit the failing tests**

```bash
/usr/bin/git add tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "test: cover Kanji Kombat daily boundary runway"
```

---

### Task 2: Implement Server Prompt Planning Across The Daily Boundary

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Test: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Add prompt-kind constants and helpers**

In `src/game/services/kanji-kombat-service.js`, add this after `const PROMPT_ID_PREFIX = 'kkp';`:

```javascript
export const DAILY_COMPLETE_PROMPT_KIND = 'dailyCompletePrompt';
export const LEGACY_COMPLETE_PROMPT_KIND = 'completePrompt';

export function isDailyCompletePromptKind(kind) {
  return kind === DAILY_COMPLETE_PROMPT_KIND || kind === LEGACY_COMPLETE_PROMPT_KIND;
}

export function isDailyCompletePrompt(prompt) {
  return isDailyCompletePromptKind(prompt?.kind);
}
```

The helper intentionally accepts legacy `completePrompt` so active saves from the previous release can still render and commit the completion choice. New prompts must use `dailyCompletePrompt`.

- [ ] **Step 2: Change daily completion work to the new kind**

Replace `promptForDailyCompletion` with:

```javascript
function promptForDailyCompletion(userId, state, opts = {}) {
  if (opts.preview !== true) {
    markScriptDailyComplete(userId, state.localDate);
  }
  state.report.completedDaily = true;
  return { kind: DAILY_COMPLETE_PROMPT_KIND };
}
```

- [ ] **Step 3: Update prompt creation for the new marker**

In `promptFromWork`, replace the `completePrompt` branch with:

```javascript
if (work.kind === DAILY_COMPLETE_PROMPT_KIND) {
  return { ...base, kind: DAILY_COMPLETE_PROMPT_KIND, cardId: null, source: 'dailyComplete' };
}
```

Keep the `base` object unchanged.

- [ ] **Step 4: Update head sync to recognize the marker**

Replace `syncKanjiKombatPromptBufferState` with:

```javascript
function syncKanjiKombatPromptBufferState(userId, state) {
  const head = getKanjiKombatActivePrompt(state);
  if (isDailyCompletePrompt(head)) {
    if (userId) markScriptDailyComplete(userId, state.localDate);
    state.report.completedDaily = true;
  }
  return head;
}
```

- [ ] **Step 5: Advance planning state through the marker**

In `advancePlanningStateAfterPrompt`, add this branch before the final `return`:

```javascript
if (isDailyCompletePrompt(prompt)) {
  planningState.endlessMode = true;
  planningState.report.completedDaily = true;
  return;
}
```

In `advancePreviewDailyStateAfterPrompt`, replace the `completePrompt` check with:

```javascript
if (isDailyCompletePrompt(prompt)) {
  previewDailyState.completed = true;
}
```

- [ ] **Step 6: Change buffer filling so the marker is non-terminal but unique**

In `fillKanjiKombatPromptBuffer`, remove the current terminal-index early return:

```javascript
const terminalIndex = buffer.findIndex(prompt => prompt.kind === 'completePrompt');
if (terminalIndex !== -1) {
  buffer.splice(terminalIndex + 1);
  syncKanjiKombatPromptBufferState(userId, state);
  return buffer;
}
```

Replace it with a local marker tracker near the `excludedPracticeIds` declaration:

```javascript
let dailyBoundaryQueued = buffer.some(isDailyCompletePrompt);
```

Then update the `while (buffer.length < target)` loop so the work handling starts like this:

```javascript
while (buffer.length < target) {
  const work = chooseNextScriptWork(userId, planningState, {
    ...opts,
    random,
    preview: true,
    previewDailyState,
    excludeCardIds: [...excludedIds],
    excludePracticeCardIds: excludedPracticeIds,
  });
  if (work.kind === 'complete') break;
  if (isDailyCompletePromptKind(work.kind)) {
    if (dailyBoundaryQueued) break;
    dailyBoundaryQueued = true;
  }
  const prompt = promptFromWork(state, work);
  if (!prompt) break;
  buffer.push(prompt);
  if (prompt.cardId) excludedIds.add(prompt.cardId);
  advancePlanningStateAfterPrompt(planningState, prompt, random);
  advancePreviewDailyStateAfterPrompt(previewDailyState, prompt);
}
```

Do not break after pushing the daily marker. The marker itself flips `planningState.endlessMode = true`, so the next iteration can plan early reviews.

- [ ] **Step 7: Update existing deck assertions from `completePrompt` to `dailyCompletePrompt`**

In `tests/unit/game/kanji-kombat-deck.test.js`, replace expected prompt-kind strings for newly generated daily markers:

```javascript
assert.deepEqual(prompts.map(prompt => prompt.kind), ['intro', 'quiz', DAILY_COMPLETE_PROMPT_KIND]);
assert.equal(prompts.at(-1).kind, DAILY_COMPLETE_PROMPT_KIND);
```

Rename `does not append after an existing completion prompt` to `does not duplicate an existing daily complete marker while appending endless review prompts`, and replace its final assertion with:

```javascript
const markerCount = state.promptBuffer
  .filter(prompt => prompt.kind === DAILY_COMPLETE_PROMPT_KIND)
  .length;
assert.equal(markerCount, 1);
assert.equal(state.promptBuffer[0]?.kind, DAILY_COMPLETE_PROMPT_KIND);
assert.equal(state.promptBuffer[1]?.kind, 'quiz');
assert.equal(state.promptBuffer[1]?.source, 'earlyReview');
```

Leave tests intentionally constructing legacy `completePrompt` objects unchanged until Task 3.

- [ ] **Step 8: Run the deck test and verify it passes**

Run:

```bash
node --test tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS for all tests in `kanji-kombat-deck.test.js`.

- [ ] **Step 9: Commit server planning**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "feat: fill Kanji Kombat runway after daily boundary"
```

---

### Task 3: Update Server Completion Choice And Run Lifecycle

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `tests/unit/game/kanji-kombat-run.test.js`
- Modify: `tests/unit/game/kanji-kombat-session-sync.test.js`

- [ ] **Step 1: Update run lifecycle tests to expect the new marker**

In `tests/unit/game/kanji-kombat-run.test.js`, import the kind constant:

```javascript
import {
  DAILY_COMPLETE_PROMPT_KIND,
  createInitialKanjiKombatState,
  getLocalDateKey,
  KanjiKombatService,
} from '../../../src/game/services/kanji-kombat-service.js';
```

Update generated marker assertions in onboarding/run tests:

```javascript
assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.kind, DAILY_COMPLETE_PROMPT_KIND);
assert.equal(result.next, DAILY_COMPLETE_PROMPT_KIND);
```

- [ ] **Step 2: Add a service test for keep-going using an already-buffered early review**

Replace the prompt buffer in `accepts a buffered completion prompt with keep-going and queues endless work` with:

```javascript
gm.run.kanjiKombat.promptBuffer = [
  { promptId: 'kkp_keep_going_complete', sequence: 1, kind: DAILY_COMPLETE_PROMPT_KIND, cardId: null, source: 'dailyComplete' },
  {
    promptId: 'kkp_keep_going_quiz',
    sequence: 2,
    kind: 'quiz',
    cardId: 'hiragana:あ',
    source: 'earlyReview',
    quiz: {
      cardId: 'hiragana:あ',
      prompt: 'あ',
      reading: 'あ',
      choices: [{ id: 'a', answer: 'a', correct: true }],
    },
  },
];
gm.run.kanjiKombat.promptBufferSeq = 2;
```

Keep the final assertions, and add:

```javascript
assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.promptId, 'kkp_keep_going_quiz');
assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.source, 'earlyReview');
```

- [ ] **Step 3: Add session-sync tests for the new kind**

In `tests/unit/game/kanji-kombat-session-sync.test.js`, import `DAILY_COMPLETE_PROMPT_KIND` from `kanji-kombat-service.js`.

Change manually constructed completion prompts in the two completion-choice tests:

```javascript
const completePrompt = {
  promptId: 'kkp_test_complete_kg',
  sequence: 98,
  kind: DAILY_COMPLETE_PROMPT_KIND,
  cardId: null,
  source: 'dailyComplete',
};
```

In the `keepGoing: true` test, add a buffered quiz behind the marker before applying sync:

```javascript
kk.promptBuffer.splice(1, 0, {
  promptId: 'kkp_sync_early_review',
  sequence: 99,
  kind: 'quiz',
  cardId: 'hiragana:あ',
  source: 'earlyReview',
  quiz: {
    cardId: 'hiragana:あ',
    prompt: 'あ',
    reading: 'あ',
    choices: [{ id: 'a', answer: 'a', correct: true }],
  },
});
```

Replace the loose `responded` assertion with:

```javascript
assert.equal(result.results[0].combatEnded, false);
assert.equal(gm.run.kanjiKombat.endlessMode, true);
assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.promptId, 'kkp_sync_early_review');
```

- [ ] **Step 4: Run server lifecycle tests and verify they fail before implementation**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-session-sync.test.js
```

Expected: FAIL because the service still validates `completePrompt` and queue handlers do not map `dailyCompletePrompt`.

- [ ] **Step 5: Update service validation and lifecycle branches**

In `src/game/services/kanji-kombat-service.js`, replace checks that compare directly to `completePrompt` for generated/current prompts.

Use this pattern in `startRunWithCreature`:

```javascript
if (isDailyCompletePrompt(head)) {
  throw new Error('Kanji Kombat is complete for the day');
}
```

Use this pattern in `submitOnboarding`:

```javascript
let next = head?.kind || DAILY_COMPLETE_PROMPT_KIND;
if (!head) {
  const completionPrompt = promptFromWork(kk, { kind: DAILY_COMPLETE_PROMPT_KIND });
  if (completionPrompt) ensurePromptBufferState(kk).push(completionPrompt);
  syncKanjiKombatPromptBufferState(this.gm.userId, kk);
  kk.report.completedDaily = true;
  next = DAILY_COMPLETE_PROMPT_KIND;
}
```

Use this pattern in `resolveCompletionChoice`:

```javascript
const prompt = hasPromptReference(promptRef)
  ? validateKanjiKombatPromptHead(kk, {
      ...promptRef,
      kind: getKanjiKombatActivePrompt(kk)?.kind,
    })
  : isDailyCompletePrompt(activePrompt)
    ? validateKanjiKombatPromptHead(kk, { kind: activePrompt.kind })
    : null;
if (!isDailyCompletePrompt(prompt)) {
  throw new Error('No Kanji Kombat completion choice is pending');
}
```

Keep the existing `consumeKanjiKombatPromptHead(kk, prompt, { userId: this.gm.userId });`.

After `kk.endlessMode = true;`, remove the old fallback block:

```javascript
if (!prompt && getKanjiKombatActivePrompt(kk)?.kind === 'completePrompt') {
  consumeKanjiKombatPromptHead(kk, { kind: 'completePrompt' }, { userId: this.gm.userId });
}
```

Then keep:

```javascript
const work = this.queueNextPrompt();
if (work?.kind === 'complete' || isDailyCompletePromptKind(work?.kind)) {
  return this.finalizeDailyComplete();
}
```

- [ ] **Step 6: Update queue and availability branches**

In `queueNextPrompt`, replace the completion branch with:

```javascript
if (isDailyCompletePrompt(head)) return { kind: DAILY_COMPLETE_PROMPT_KIND };
```

In `getAvailability`, use:

```javascript
if (work.kind === 'complete' || isDailyCompletePromptKind(work.kind)) {
  return {
    available: false,
    reason: 'complete_for_day',
    message: 'Come back later!',
    scriptDeck: state.report.scriptDeck
  };
}
```

In `completeWaveAndMaybeStartNext`, replace the daily prompt branch with:

```javascript
if (isDailyCompletePromptKind(work.kind)) {
  this.gm.emitState();
  return {
    actionType: 'kanjiKombat',
    actionSegments,
    playerAttacks: flatPlayerAttacks,
    enemyAttacks: flatEnemyAttacks,
    xpEvents,
    koSwaps,
    koRemovals,
    combatEnded: false,
    completionChoicePending: true,
    kanjiKombat: this.gm.run.kanjiKombat,
    allies: this.gm.combat.allies,
    enemies: clearedEnemies,
    creatureParty: this.gm.run.creatureParty,
  };
}
```

- [ ] **Step 7: Update `src/game/services/combat-cycle-service.js`**

Import the helper at the top:

```javascript
import { isDailyCompletePromptKind } from './kanji-kombat-service.js';
```

Replace:

```javascript
if (nextWork?.kind === 'completePrompt') {
```

with:

```javascript
if (isDailyCompletePromptKind(nextWork?.kind)) {
```

- [ ] **Step 8: Run server lifecycle tests and verify they pass**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-session-sync.test.js
```

Expected: PASS for both files.

- [ ] **Step 9: Commit service lifecycle changes**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js src/game/services/combat-cycle-service.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-session-sync.test.js
/usr/bin/git commit -m "feat: consume Kanji Kombat daily boundary marker"
```

---

### Task 4: Update Client Daily Marker Rendering And Local Yes Path

**Files:**
- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`

- [ ] **Step 1: Add UI constants and helper**

In `public/js/ui/kanji-kombat.js`, add this near `KANJI_KOMBAT_SPOTTY_CONNECTION_COPY`:

```javascript
const DAILY_COMPLETE_PROMPT_KIND = 'dailyCompletePrompt';
const LEGACY_COMPLETE_PROMPT_KIND = 'completePrompt';

function isDailyCompletePrompt(prompt) {
  return prompt?.kind === DAILY_COMPLETE_PROMPT_KIND
    || prompt?.kind === LEGACY_COMPLETE_PROMPT_KIND;
}
```

- [ ] **Step 2: Add a failing UI test for the no-pause Yes path**

In `tests/unit/ui/kanji-kombat-ui.test.js`, add this test before `shows spotty connection copy when no prompt is available but session is pending`:

```javascript
it('continues from daily complete marker to buffered early review without spotty copy', async () => {
  const calls = [];
  let currentState = null;

  initKanjiKombatUI({
    syncSession: async ({ entries }) => {
      calls.push(['syncSession', entries[0].kind, entries[0].keepGoing]);
      return new Promise(() => {});
    },
    __sessionSchedule: syncSchedule,
    updateGameState: state => {
      currentState = state;
      calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.kind || null]);
      renderKanjiKombatAction(state);
    },
    getGameState: () => currentState,
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
            promptId: 'kkp_daily_done',
            sequence: 10,
            kind: 'dailyCompletePrompt',
            cardId: null,
            source: 'dailyComplete',
          },
          {
            promptId: 'kkp_early_review',
            sequence: 11,
            kind: 'quiz',
            cardId: 'hiragana:あ',
            source: 'earlyReview',
            quiz: {
              cardId: 'hiragana:あ',
              prompt: 'あ',
              reading: 'あ',
              choices: [{ id: 'a', answer: 'a', correct: true }],
            },
          },
        ],
      },
    },
    combat: { actionCursor: { side: 'ally', index: 0 }, enemies: [{ id: 'enemy', hp: 10 }] },
  };

  renderKanjiKombatAction(currentState);
  assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action').length, 2);

  const yesButton = actionArea.querySelectorAll('.kanji-kombat-completion-action')
    .find(button => button.dataset.keepGoing === 'true');
  const handled = await yesButton.click();
  await flushPromises(4);

  assert.equal(handled, true);
  assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'あ');
  assert.equal(currentState.run.kanjiKombat.endlessMode, true);
  assert.equal(currentState.run.kanjiKombat.promptBuffer[0]?.promptId, 'kkp_early_review');
  assert.equal(calls.some(call => call[0] === 'showNarration'), false);
  assert.equal(getKanjiKombatSession().pendingCount(), 1);
});
```

- [ ] **Step 3: Run the UI test and verify it fails**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because `renderKanjiKombatAction` does not recognize `dailyCompletePrompt`.

- [ ] **Step 4: Update rendered prompt detection**

In `hasRenderedKanjiKombatPrompt`, no new selector is required because the marker renders the same `.kanji-kombat-completion-action` buttons. Leave that function unchanged.

In `consumePromptHeadDraft`, replace:

```javascript
kk.completionChoicePending = next?.kind === 'completePrompt';
```

with:

```javascript
kk.completionChoicePending = isDailyCompletePrompt(next);
```

In `renderKanjiKombatAction`, replace:

```javascript
const completionPrompt = bufferedPrompt?.kind === 'completePrompt';
```

with:

```javascript
const completionPrompt = isDailyCompletePrompt(bufferedPrompt);
```

- [ ] **Step 5: Keep the Yes path local-first**

In the completion prompt `onChoice` handler, keep this existing logic:

```javascript
const draft = structuredClone(gameState);
consumePromptHeadDraft(draft, bufferedPrompt);
if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
updateKanjiKombatGameState(draft);
```

Do not add a `session.syncNow()` call to the `keepGoing: true` path. The normal session scheduler can sync it; the key behavior is that the already-buffered prompt renders immediately.

- [ ] **Step 6: Update existing UI fixtures**

In `tests/unit/ui/kanji-kombat-ui.test.js`, replace generated daily-boundary fixtures that currently use:

```javascript
kind: 'completePrompt',
```

with:

```javascript
kind: 'dailyCompletePrompt',
```

Keep at least one legacy-specific fixture as `completePrompt` only if the test name states that it covers a legacy prompt. Add this small test if no legacy coverage remains:

```javascript
it('renders a legacy completePrompt marker for active saved runs', () => {
  const handled = renderKanjiKombatAction({
    phase: 'combat',
    run: {
      mode: 'kanjiKombat',
      kanjiKombat: {
        promptBuffer: [{ promptId: 'legacy_complete', sequence: 1, kind: 'completePrompt', cardId: null }],
      },
    },
    combat: { actionCursor: { side: 'ally', index: 0 } },
  });

  assert.equal(handled, true);
  assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action').length, 2);
});
```

- [ ] **Step 7: Run UI tests and verify they pass**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS for the UI file.

- [ ] **Step 8: Commit UI marker handling**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "feat: render Kanji Kombat daily boundary runway locally"
```

---

### Task 5: Update Optimistic Combat Boundary Handling

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Modify: `tests/unit/ui/combat-network-hardening.test.js`

- [ ] **Step 1: Add local helper in combat loop**

In `public/js/ui/combat-loop.js`, near `hasKanjiKombatPromptRef`, add:

```javascript
function isKanjiKombatDailyCompletePrompt(prompt) {
  return prompt?.kind === 'dailyCompletePrompt' || prompt?.kind === 'completePrompt';
}
```

- [ ] **Step 2: Update local prompt consumption**

In `localStateAfterKanjiKombatPrediction`, replace:

```javascript
kk.completionChoicePending = nextPrompt?.kind === 'completePrompt';
```

with:

```javascript
kk.completionChoicePending = isKanjiKombatDailyCompletePrompt(nextPrompt);
```

- [ ] **Step 3: Update combat-network boundary fixture**

In `tests/unit/ui/combat-network-hardening.test.js`, in the test named `does not consume the pre-rolled next wave when the post-answer state has completionChoicePending`, change the boundary prompt fixture to:

```javascript
{
  promptId: 'kkp_daily_complete',
  sequence: 2,
  kind: 'dailyCompletePrompt',
  cardId: null,
}
```

Update nearby comments from `completePrompt` to `dailyCompletePrompt` so the test documents the current marker kind.

- [ ] **Step 4: Run the focused combat UI test and verify it passes**

Run:

```bash
node --test tests/unit/ui/combat-network-hardening.test.js
```

Expected: PASS. The daily boundary still suppresses local pre-rolled wave consumption.

- [ ] **Step 5: Commit combat-loop boundary handling**

```bash
/usr/bin/git add public/js/ui/combat-loop.js tests/unit/ui/combat-network-hardening.test.js
/usr/bin/git commit -m "fix: recognize Kanji Kombat daily marker in combat prediction"
```

---

### Task 6: Update Integration And Smoke Coverage

**Files:**
- Modify: `tests/integration/flows/kanji-kombat.test.js`
- Modify: `tests/smoke/kanji-kombat-subway.test.js`
- Modify: `tests/unit/game/kanji-kombat-optimistic.test.js`
- Modify: `tests/unit/game/kanji-kombat-wave-preroll.test.js`

- [ ] **Step 1: Find remaining current-kind references**

Run:

```bash
rg -n "completePrompt|daily boundary|completionChoicePending" public/js src tests
```

Expected: output still includes references. Every generated daily-boundary prompt should move to `dailyCompletePrompt`; legacy compatibility tests may keep `completePrompt` if the test name says legacy.

- [ ] **Step 2: Update remaining unit fixtures**

In `tests/unit/game/kanji-kombat-optimistic.test.js`, replace:

```javascript
service.chooseNextWork = () => ({ kind: 'completePrompt' });
```

with:

```javascript
service.chooseNextWork = () => ({ kind: 'dailyCompletePrompt' });
```

In `tests/unit/game/kanji-kombat-wave-preroll.test.js`, replace the helper parameter and inserted prompt kind:

```javascript
function setPromptBuffer(service, { quiz = 0, intro = 0, dailyCompletePrompt = 0 } = {}) {
  const buffer = [];
  let seq = 1;
  for (let i = 0; i < quiz; i++) {
    buffer.push({ kind: 'quiz', promptId: `kkp_q${i}`, sequence: seq++, cardId: `card-${i}`, quiz: {} });
  }
  for (let i = 0; i < intro; i++) {
    buffer.push({ kind: 'intro', promptId: `kkp_i${i}`, sequence: seq++, cardId: `icard-${i}`, intro: { card: {} } });
  }
  for (let i = 0; i < dailyCompletePrompt; i++) {
    buffer.push({ kind: 'dailyCompletePrompt', promptId: `kkp_c${i}`, sequence: seq++, cardId: null });
  }
  service.gm.run.kanjiKombat.promptBuffer = buffer;
}
```

Update the call in `ensurePendingNextWaves tops the queue up to the quiz prompt count`:

```javascript
setPromptBuffer(service, { quiz: 5, intro: 2, dailyCompletePrompt: 1 });
```

- [ ] **Step 3: Update integration helper to accept both marker kinds**

In `tests/integration/flows/kanji-kombat.test.js`, add:

```javascript
function isDailyCompletePrompt(prompt) {
  return prompt?.kind === 'dailyCompletePrompt' || prompt?.kind === 'completePrompt';
}
```

Replace `resolveActiveCompletionChoice` with:

```javascript
function resolveActiveCompletionChoice(gm, keepGoing) {
  const prompt = activePrompt(gm);
  assert.equal(isDailyCompletePrompt(prompt), true);
  return gm.kanjiKombatService.resolveCompletionChoice(keepGoing, promptRef(prompt));
}
```

- [ ] **Step 4: Update integration assertions for the new marker and buffered tail**

In `prompts before ending when the script queue is exhausted mid-wave`, replace:

```javascript
assert.equal(activePrompt(gm)?.kind, 'completePrompt');
```

with:

```javascript
assert.equal(activePrompt(gm)?.kind, 'dailyCompletePrompt');
assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.kind, 'quiz');
assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.source, 'earlyReview');
```

In `continues with early FSRS reviews after the completion prompt is accepted`, replace:

```javascript
assert.equal(activePrompt(gm)?.kind, 'completePrompt');
```

with:

```javascript
assert.equal(activePrompt(gm)?.kind, 'dailyCompletePrompt');
assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.kind, 'quiz');
assert.equal(gm.run.kanjiKombat.promptBuffer[1]?.source, 'earlyReview');
```

- [ ] **Step 5: Update smoke helper boundary handling**

In `tests/smoke/kanji-kombat-subway.test.js`, replace prompt-kind checks like:

```javascript
prompt.kind !== 'completePrompt'
prompt.kind === 'completePrompt'
return { kind: 'completePrompt', promptId: null };
```

with:

```javascript
const isDailyCompletePrompt = prompt?.kind === 'dailyCompletePrompt' || prompt?.kind === 'completePrompt';
prompt.kind !== 'dailyCompletePrompt' && prompt.kind !== 'completePrompt'
isDailyCompletePrompt
return { kind: 'dailyCompletePrompt', promptId: null };
```

Keep legacy recognition in conditions so smoke tests can still observe active old saves.

- [ ] **Step 6: Run integration, unit cleanup, and smoke syntax checks**

Run:

```bash
node --test tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave-preroll.test.js
node --test tests/integration/flows/kanji-kombat.test.js
node --check tests/smoke/kanji-kombat-subway.test.js
```

Expected: listed unit and integration tests pass, smoke script syntax check prints no output and exits `0`.

- [ ] **Step 7: Run the search again and inspect every remaining `completePrompt`**

Run:

```bash
rg -n "completePrompt" public/js src tests
```

Expected remaining references are either:

- `LEGACY_COMPLETE_PROMPT_KIND`;
- compatibility helpers accepting legacy saved prompts;
- tests explicitly named as legacy coverage.

- [ ] **Step 8: Commit integration, smoke, and fixture updates**

```bash
/usr/bin/git add tests/integration/flows/kanji-kombat.test.js tests/smoke/kanji-kombat-subway.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave-preroll.test.js
/usr/bin/git commit -m "test: verify Kanji Kombat daily runway integration"
```

---

### Task 7: Full Verification And Cleanup

**Files:**
- Verify all modified files

- [ ] **Step 1: Run syntax checks for edited browser modules**

Run:

```bash
node --check public/js/ui/kanji-kombat.js
node --check public/js/ui/combat-loop.js
```

Expected: both commands print no output and exit `0`.

- [ ] **Step 2: Run focused unit and integration tests**

Run:

```bash
node --test \
  tests/unit/game/kanji-kombat-deck.test.js \
  tests/unit/game/kanji-kombat-run.test.js \
  tests/unit/game/kanji-kombat-session-sync.test.js \
  tests/unit/ui/kanji-kombat-ui.test.js \
  tests/unit/ui/combat-network-hardening.test.js \
  tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS for all listed test files.

- [ ] **Step 3: Run Tier 1 unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS. If unrelated dirty runtime files or external services make this fail, capture the failing test names and output before deciding whether to continue.

- [ ] **Step 4: Run full merge-gate test command**

Run:

```bash
npm test
```

Expected: PASS for Tier 1 and Tier 2 tests.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
/usr/bin/git status --short
/usr/bin/git diff --stat
/usr/bin/git diff --check
```

Expected:

- only intended source/test/docs files changed;
- no generated cache files staged;
- `git diff --check` exits `0`.

- [ ] **Step 6: Final commit if verification required fixups**

If Task 7 required any fixup edits, commit them:

```bash
/usr/bin/git add src public tests docs/superpowers/plans/2026-06-15-kanji-kombat-daily-boundary-runway.md
/usr/bin/git commit -m "fix: finish Kanji Kombat daily runway verification"
```

If Task 7 required no edits, do not create an empty commit.

---

## Implementation Notes

- Do not remove the true spotty pause. The existing no-prompt and hard-cap tests should continue to pass.
- New server-generated prompts should use `dailyCompletePrompt`.
- Existing active saves may still carry `completePrompt`; compatibility helpers must accept that kind for rendering and committing the completion choice.
- Do not make durable daily completion happen merely because a marker was pre-buffered behind other prompts. Preview buffering should not mutate SRS daily state.
- When `keepGoing: true`, the next prompt should already be in `promptBuffer`; if it is not, existing runway-exhaustion behavior remains correct.
