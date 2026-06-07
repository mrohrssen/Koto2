# Kanji Kombat Prompt Buffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-prepared, fully built Kanji Kombat prompt buffer so the browser can consume the next prompt instantly while commits sync in the background.

**Architecture:** The server owns a canonical `run.kanjiKombat.promptBuffer`, validates prompt-consuming commits against the buffer head, and refills to five prompts with a conservative preview planner. The browser renders from the buffer before legacy fields, consumes intro/completion prompts locally, sends prompt metadata with all commits, and keeps quiz combat turns gated by the existing one-seed/one-state-version optimistic verification path.

**Tech Stack:** Node.js, Express, ES modules, `node:test`, Supertest, browser JS modules, existing optimistic action ledger, existing deterministic Kanji Kombat combat prediction.

---

## Source Spec

Design document: `docs/superpowers/specs/2026-06-06-kanji-kombat-prompt-buffer-design.md`

## File Structure

- Modify `src/game/services/kanji-kombat-service.js`: owns prompt buffer constants, prompt creation, preview filling, head validation, head consumption, legacy field sync, and service integration.
- Modify `src/routes/game/kanji-kombat.js`: accepts prompt metadata on answer/intro/completion routes and adds `POST /kanji-kombat/prompt-buffer/refill`.
- Modify `public/js/api.js`: sends prompt metadata for answer/intro/completion commits and exposes `refillKanjiKombatPromptBuffer()`.
- Modify `public/js/ui/kanji-kombat.js`: renders from `promptBuffer`, consumes intro/completion heads locally, triggers single-flight refill below three prompts, and passes prompt metadata through handlers.
- Modify `public/js/ui/optimistic-combat-turn.js`: includes prompt metadata in the optimistic answer envelope payload.
- Modify `public/js/ui/combat-loop.js`: accepts prompt metadata in Kanji Kombat answer submission and keeps quiz answer control gated by server verification.
- Modify tests:
  - `tests/unit/game/kanji-kombat-deck.test.js`
  - `tests/unit/game/kanji-kombat-run.test.js`
  - `tests/unit/game/kanji-kombat-optimistic.test.js`
  - `tests/unit/routes/kanji-kombat-routes.test.js`
  - `tests/unit/ui/kanji-kombat-ui.test.js`
  - `tests/unit/ui/optimistic-combat-turn.test.js`
  - `tests/unit/ui/combat-network-hardening.test.js`
  - `tests/unit/ui/optimistic-run-integration.test.js`

## Task 1: Server Prompt Buffer Core

**Files:**

- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/game/kanji-kombat-deck.test.js`

- [ ] **Step 1: Write failing buffer helper tests**

Add these imports in `tests/unit/game/kanji-kombat-deck.test.js`:

```js
import {
  buildQuizForCard,
  chooseNextScriptWork,
  consumeKanjiKombatPromptHead,
  createInitialKanjiKombatState,
  fillKanjiKombatPromptBuffer,
  getKanjiKombatActivePrompt,
  getLocalDateKey,
  NO_DUE_DISCOVERY_CHAIN_LIMIT,
  PROMPT_BUFFER_REFILL_THRESHOLD,
  PROMPT_BUFFER_TARGET,
  resolveIntroChoice,
  validateKanjiKombatPromptHead,
} from '../../../src/game/services/kanji-kombat-service.js';
```

Replace the existing grouped import from `kanji-kombat-service.js` with the block above, then append these tests before the final `});`:

```js
  it('fills a five-prompt server runway without mutating persistent daily completion', () => {
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

    assert.equal(PROMPT_BUFFER_TARGET, 5);
    assert.equal(PROMPT_BUFFER_REFILL_THRESHOLD, 3);
    assert.equal(prompts.length, 5);
    assert.equal(state.promptBuffer.length, 5);
    assert.equal(state.currentQuiz.cardId, state.promptBuffer[0].cardId);
    assert.equal(state.pendingIntro, null);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.promptId)).size, 5);
    assert.equal(new Set(state.promptBuffer.map(prompt => prompt.cardId).filter(Boolean)).size, 5);
    assert.equal(getScriptDailyState(userId, '2026-05-31').completed, false);
  });

  it('builds intro prompts in the buffer without recording daily intro counts', () => {
    const data = loadSrsData(userId);
    for (const card of data.script.cards.filter(c => c.type === 'hiragana')) {
      card.due = new Date('2099-01-01T00:00:00Z');
    }
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    const prompts = fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    assert.equal(prompts[0].kind, 'intro');
    assert.equal(prompts[0].intro.card.id, prompts[0].cardId);
    assert.equal(prompts[0].source, 'noDueBatch');
    assert.equal(getScriptDailyState(userId, '2026-05-31').introducedCount, 0);
    assert.equal(state.pendingIntro.cardId, prompts[0].cardId);
  });

  it('validates and consumes only the canonical prompt head', () => {
    const data = loadSrsData(userId);
    const dueCard = data.script.cards.find(c => c.id === 'hiragana:あ');
    dueCard.due = new Date('2026-05-30T00:00:00Z');
    dueCard.reps = 1;
    saveSrsData(userId, data);

    const state = createInitialKanjiKombatState({ localDate: '2026-05-31', random: () => 0 });
    fillKanjiKombatPromptBuffer(userId, state, {
      random: () => 0,
      now: new Date('2026-05-31T00:00:00Z'),
    });

    const head = getKanjiKombatActivePrompt(state);
    assert.equal(validateKanjiKombatPromptHead(state, {
      promptId: head.promptId,
      sequence: head.sequence,
      cardId: head.cardId,
      kind: head.kind,
    }), head);
    assert.throws(
      () => validateKanjiKombatPromptHead(state, {
        promptId: 'kkp_wrong',
        sequence: head.sequence,
        cardId: head.cardId,
        kind: head.kind,
      }),
      /Kanji Kombat prompt mismatch/
    );

    const consumed = consumeKanjiKombatPromptHead(state, head);
    assert.equal(consumed.promptId, head.promptId);
    assert.notEqual(getKanjiKombatActivePrompt(state)?.promptId, head.promptId);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-deck.test.js
```

Expected: FAIL with missing exports such as `fillKanjiKombatPromptBuffer`.

- [ ] **Step 3: Add prompt buffer constants and helpers**

In `src/game/services/kanji-kombat-service.js`, add these constants near the existing Kanji Kombat constants:

```js
export const PROMPT_BUFFER_TARGET = 5;
export const PROMPT_BUFFER_REFILL_THRESHOLD = 3;
const PROMPT_ID_PREFIX = 'kkp';
```

Add these fields to `createInitialKanjiKombatState()`:

```js
    promptBuffer: [],
    promptBufferSeq: 0,
```

Update `promptForDailyCompletion()` so preview planning does not persist daily completion:

```js
function promptForDailyCompletion(userId, state, opts = {}) {
  if (opts.preview !== true) {
    markScriptDailyComplete(userId, state.localDate);
  }
  state.currentQuiz = null;
  state.pendingIntro = null;
  state.completionChoicePending = true;
  state.report.completedDaily = true;
  return { kind: 'completePrompt' };
}
```

Update the call at the end of `chooseNextScriptWork()`:

```js
  return promptForDailyCompletion(userId, state, opts);
```

Add these helper functions before `resolveIntroChoice()`:

```js
function createPromptId(sequence) {
  return `${PROMPT_ID_PREFIX}_${sequence}_${randomBytes(6).toString('hex')}`;
}

function clonePlanningState(state) {
  return JSON.parse(JSON.stringify({
    ...state,
    currentQuiz: null,
    pendingIntro: null,
    completionChoicePending: false,
    promptBuffer: [],
  }));
}

function ensurePromptBufferState(state) {
  if (!Array.isArray(state.promptBuffer)) state.promptBuffer = [];
  if (!Number.isInteger(state.promptBufferSeq)) state.promptBufferSeq = 0;
  return state.promptBuffer;
}

function nextPromptSequence(state) {
  state.promptBufferSeq = (state.promptBufferSeq || 0) + 1;
  return state.promptBufferSeq;
}

function promptFromWork(state, work) {
  const sequence = nextPromptSequence(state);
  const base = {
    promptId: createPromptId(sequence),
    sequence,
    kind: work.kind,
    cardId: work.card?.id || work.quiz?.cardId || null,
    source: work.source || null,
  };
  if (work.kind === 'quiz') {
    return { ...base, quiz: work.quiz };
  }
  if (work.kind === 'intro') {
    return {
      ...base,
      intro: {
        cardId: work.card.id,
        card: work.card,
        source: work.source || null,
      },
    };
  }
  if (work.kind === 'completePrompt') {
    return { ...base, cardId: null, source: 'dailyComplete' };
  }
  return null;
}

function syncKanjiKombatLegacyPromptFields(state) {
  const head = getKanjiKombatActivePrompt(state);
  state.currentQuiz = head?.kind === 'quiz' ? head.quiz : null;
  state.pendingIntro = head?.kind === 'intro'
    ? {
        cardId: head.cardId,
        card: head.intro.card,
        source: head.source || head.intro.source || null,
        promptId: head.promptId,
        sequence: head.sequence,
      }
    : null;
  state.completionChoicePending = head?.kind === 'completePrompt';
  return head || null;
}

function advancePlanningStateAfterPrompt(planningState, prompt, random = Math.random) {
  planningState.currentQuiz = null;
  planningState.pendingIntro = null;
  if (prompt.kind === 'quiz') {
    planningState.reviewsSinceIntro = (planningState.reviewsSinceIntro || 0) + 1;
    return;
  }
  if (prompt.kind === 'intro') {
    planningState.reviewsSinceIntro = 0;
    planningState.nextIntroAfter = rollIntroInterval(random);
    if (prompt.source === 'noDueBatch') {
      if (!Array.isArray(planningState.noDuePracticeQueue)) planningState.noDuePracticeQueue = [];
      if (!planningState.noDuePracticeQueue.includes(prompt.cardId)) {
        planningState.noDuePracticeQueue.push(prompt.cardId);
      }
      planningState.noDueDiscoveryChainCount = Math.max(
        planningState.noDueDiscoveryChainCount || 0,
        planningState.noDuePracticeQueue.length
      );
    }
    return;
  }
  if (prompt.kind === 'completePrompt') {
    planningState.completionChoicePending = true;
  }
}

export function getKanjiKombatActivePrompt(state) {
  return Array.isArray(state?.promptBuffer) ? state.promptBuffer[0] || null : null;
}

export function validateKanjiKombatPromptHead(state, ref = {}) {
  const head = getKanjiKombatActivePrompt(state);
  if (!head) throw new Error('No active Kanji Kombat prompt');
  if (ref.promptId && head.promptId !== ref.promptId) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (Number.isInteger(ref.sequence) && head.sequence !== ref.sequence) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (ref.kind && head.kind !== ref.kind) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  if (ref.cardId && head.cardId !== ref.cardId) {
    throw new Error('Kanji Kombat prompt mismatch');
  }
  return head;
}

export function consumeKanjiKombatPromptHead(state, ref = {}) {
  const head = validateKanjiKombatPromptHead(state, ref);
  state.promptBuffer.shift();
  syncKanjiKombatLegacyPromptFields(state);
  return head;
}

export function fillKanjiKombatPromptBuffer(userId, state, opts = {}) {
  const buffer = ensurePromptBufferState(state);
  const target = Number.isInteger(opts.target) && opts.target > 0
    ? opts.target
    : PROMPT_BUFFER_TARGET;
  if (buffer.length >= target) {
    syncKanjiKombatLegacyPromptFields(state);
    return buffer;
  }

  const random = opts.random || Math.random;
  const planningState = clonePlanningState(state);
  planningState.promptBuffer = [];
  const excludedIds = new Set([
    ...(opts.excludeCardIds || []),
    ...buffer.map(prompt => prompt.cardId).filter(Boolean),
  ]);

  while (buffer.length < target) {
    const work = chooseNextScriptWork(userId, planningState, {
      ...opts,
      random,
      preview: true,
      excludeCardIds: [...excludedIds],
    });
    if (work.kind === 'complete') break;
    const prompt = promptFromWork(state, work);
    if (!prompt) break;
    buffer.push(prompt);
    if (prompt.cardId) excludedIds.add(prompt.cardId);
    advancePlanningStateAfterPrompt(planningState, prompt, random);
    if (prompt.kind === 'completePrompt') break;
  }

  syncKanjiKombatLegacyPromptFields(state);
  return buffer;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-deck.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-deck.test.js
/usr/bin/git commit -m "Add Kanji Kombat prompt buffer core"
```

## Task 2: Server Lifecycle Integration

**Files:**

- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/game/kanji-kombat-run.test.js`
- Modify: `tests/unit/game/kanji-kombat-optimistic.test.js`
- Modify: `tests/unit/game/kanji-kombat-wave.test.js`

- [ ] **Step 1: Write failing service lifecycle tests**

In `tests/unit/game/kanji-kombat-run.test.js`, add assertions to the existing `submits onboarding, saves reversible preferences, and queues first prompt` test:

```js
    assert.ok(gm.run.kanjiKombat.promptBuffer.length > 0);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0].kind, gm.run.kanjiKombat.currentQuiz ? 'quiz' : 'intro');
```

Append these tests before the closing `});`:

```js
  it('starts an onboarding-complete run with a prompt buffer and legacy head mirror', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);

    service.startRunWithCreature(fakeCreature('hi'));

    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.ok(gm.run.kanjiKombat.promptBuffer.length > 0);
    assert.equal(gm.run.kanjiKombat.promptBuffer.length <= 5, true);
    assert.equal(gm.run.kanjiKombat.pendingIntro.cardId, gm.run.kanjiKombat.promptBuffer[0].cardId);
  });

  it('intro prompt commits consume one prompt and refill the server buffer', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    const result = service.submitIntroChoice(head.cardId, 'unknown', {
      promptId: head.promptId,
      sequence: head.sequence,
    });

    assert.equal(result.graded.id, head.cardId);
    assert.notEqual(gm.run.kanjiKombat.promptBuffer[0]?.promptId, head.promptId);
    assert.equal(gm.run.kanjiKombat.promptBuffer.length <= 5, true);
    assert.equal(gm.run.kanjiKombat.pendingIntro?.promptId, gm.run.kanjiKombat.promptBuffer[0]?.promptId);
  });

  it('rejects stale buffered intro prompt commits without grading', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    assert.throws(
      () => service.submitIntroChoice(head.cardId, 'known', {
        promptId: 'kkp_stale',
        sequence: head.sequence,
      }),
      /Kanji Kombat prompt mismatch/
    );

    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === head.cardId);
    assert.equal(savedCard.reps || 0, 0);
  });
```

In `tests/unit/game/kanji-kombat-optimistic.test.js`, add this test inside the `describe` block:

```js
  it('optimistic buffered answers validate and consume the prompt head', () => {
    const gm = createTestKanjiKombatGameManager();
    const service = gm.kanjiKombatService;
    const prompt = {
      promptId: 'kkp_answer_1',
      sequence: 1,
      kind: 'quiz',
      cardId: 'hiragana:あ',
      quiz: gm.run.kanjiKombat.currentQuiz,
    };
    gm.run.kanjiKombat.promptBuffer = [prompt];
    gm.run.kanjiKombat.promptBufferSeq = 1;
    const predicted = buildOptimisticKanjiKombatAnswer({
      state: { combat: gm.combat, run: gm.run },
      answerId: 'choice-correct',
      actionId: 'act_buffered_kanji',
      promptRef: { promptId: prompt.promptId, sequence: prompt.sequence, cardId: prompt.cardId },
    });

    const result = service.verifyAndCommitOptimisticAnswer(predicted.envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.kanjiAnswerCorrect, true);
    assert.equal(gm.run.kanjiKombat.promptBuffer.some(entry => entry.promptId === prompt.promptId), false);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js
```

Expected: FAIL because service methods do not yet accept prompt metadata or initialize/refill buffers.

- [ ] **Step 3: Wire buffer initialization and prompt commits**

In `src/game/services/kanji-kombat-service.js`, add this instance method inside `KanjiKombatService`:

```js
  refillPromptBuffer(opts = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state || state.onboardingPending) return [];
    const prompts = fillKanjiKombatPromptBuffer(this.gm.userId, state, {
      ...opts,
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
    return prompts;
  }
```

In `startRunWithCreature()`, replace the direct `chooseNextWork` block with:

```js
    if (!kk.onboardingPending) {
      this.refillPromptBuffer();
      const head = getKanjiKombatActivePrompt(kk);
      if (!head) {
        throw new Error('Kanji Kombat is complete for the day');
      }
      if (head.kind === 'completePrompt') {
        throw new Error('Kanji Kombat is complete for the day');
      }
    }
```

In `submitOnboarding()`, replace the direct `chooseNextWork` block with:

```js
    this.refillPromptBuffer();
    const head = getKanjiKombatActivePrompt(kk);
    let next = head?.kind || 'completePrompt';
    if (!head) {
      kk.completionChoicePending = true;
      kk.report.completedDaily = true;
      next = 'completePrompt';
    }
```

Keep the returned object shape and remove the old assignments that overwrote `kk.currentQuiz` and `kk.pendingIntro`.

Update `submitIntroChoice()` signature and validation:

```js
  submitIntroChoice(cardId, choice, promptRef = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state) throw new Error('No active Kanji Kombat run');
    this.assertOnboardingComplete();
    const prompt = promptRef?.promptId
      ? validateKanjiKombatPromptHead(state, {
          ...promptRef,
          cardId,
          kind: 'intro',
        })
      : null;
    const pending = prompt
      ? { cardId: prompt.cardId, card: prompt.intro.card, source: prompt.source || prompt.intro.source || null }
      : state.pendingIntro;
    if (!pending?.cardId) throw new Error('No pending Kanji Kombat intro');
    if (pending.cardId !== cardId) throw new Error('Kanji Kombat intro card mismatch');
    state.pendingIntro = pending;
    const result = resolveIntroChoice(this.gm.userId, state, cardId, choice, {
      onboarding: ensureKanjiKombatOnboardingState(this.gm.meta),
    });
    if (prompt) consumeKanjiKombatPromptHead(state, prompt);
    this.refillPromptBuffer({ excludeCardIds: [cardId] });
    return result;
  }
```

Update `submitAnswer()` signature and head consumption:

```js
  submitAnswer(answerId, opts = {}) {
    const kk = this.gm.run?.kanjiKombat;
    this.assertOnboardingComplete();
    const prompt = opts.promptRef?.promptId
      ? validateKanjiKombatPromptHead(kk, {
          ...opts.promptRef,
          kind: 'quiz',
        })
      : null;
    const quiz = prompt?.quiz || kk?.currentQuiz;
    if (!quiz) throw new Error('No active Kanji Kombat quiz');
    const choice = quiz.choices.find(option => option.id === answerId);
    if (!choice) throw new Error('Invalid Kanji Kombat answer');

    gradeScriptCard(this.gm.userId, quiz.cardId, choice.correct ? 'good' : 'again');
    if (choice.correct) this.recordCorrectAnswer({ applyReward: false });
    if (!choice.correct) this.recordWrongAnswer();

    if (prompt) consumeKanjiKombatPromptHead(kk, prompt);
    else kk.currentQuiz = null;
    this.refillPromptBuffer({ excludeCardIds: [quiz.cardId] });
    const result = this.gm.combatCycleService.resolveKanjiKombatCursorAction({
      correct: choice.correct,
      targetIndex: 0,
      rng: opts.rng,
      xpRng: opts.xpRng,
      deferXpAwards: opts.deferXpAwards === true,
    });
    const streakReward = choice.correct ? this.applyCurrentStreakReward() : null;
    result.kanjiAnswerCorrect = choice.correct;
    if (streakReward) result.kanjiStreakReward = streakReward;
    return result;
  }
```

In `verifyAndCommitOptimisticAnswer()`, extract prompt metadata:

```js
    const promptRef = envelope.payload?.promptRef || {
      promptId: envelope.payload?.promptId,
      sequence: envelope.payload?.promptSequence,
      cardId: envelope.payload?.cardId,
    };
```

Use the prompt quiz before looking up the choice:

```js
    const prompt = promptRef?.promptId
      ? validateKanjiKombatPromptHead(kk, {
          promptId: promptRef.promptId,
          sequence: promptRef.sequence,
          cardId: promptRef.cardId,
          kind: 'quiz',
        })
      : null;
    const quiz = prompt?.quiz || kk?.currentQuiz;
```

Pass prompt metadata into `submitAnswer()`:

```js
    const committed = this.submitAnswer(answerId, {
      promptRef: prompt ? {
        promptId: prompt.promptId,
        sequence: prompt.sequence,
        cardId: prompt.cardId,
      } : null,
      rng: createSeededRng(envelope.seed),
      xpRng: createSeededRng(`${envelope.seed}:xp`),
      deferXpAwards: true,
    });
```

Update `queueNextPrompt()` to sync/refill from the buffer:

```js
  queueNextPrompt(opts = {}) {
    const state = this.gm.run?.kanjiKombat;
    if (!state || state.onboardingPending) return null;
    this.refillPromptBuffer(opts);
    const head = getKanjiKombatActivePrompt(state);
    if (!head) return null;
    if (head.kind === 'quiz') return { kind: 'quiz', quiz: head.quiz, card: { id: head.cardId }, buffered: true };
    if (head.kind === 'intro') return { kind: 'intro', card: head.intro.card, source: head.source, buffered: true };
    if (head.kind === 'completePrompt') return { kind: 'completePrompt' };
    return null;
  }
```

In `completeWaveAndMaybeStartNext()`, replace direct `chooseNextWork(...)` with:

```js
    const work = this.queueNextPrompt({ target: PROMPT_BUFFER_TARGET });
    if (!work) {
      return this.finalizeDailyComplete({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals,
        enemies: clearedEnemies
      });
    }
```

Keep the existing `complete` and `completePrompt` handling after this guard.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave.test.js
/usr/bin/git commit -m "Wire Kanji Kombat prompt buffer lifecycle"
```

## Task 3: Routes And API Contract

**Files:**

- Modify: `src/routes/game/kanji-kombat.js`
- Modify: `public/js/api.js`
- Modify: `tests/unit/routes/kanji-kombat-routes.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Write failing route/API tests**

Append these route tests before the leaderboard tests in `tests/unit/routes/kanji-kombat-routes.test.js`:

```js
  it('refills the Kanji Kombat prompt buffer', async () => {
    const manager = {
      run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        refillPromptBuffer: () => [{ promptId: 'kkp_1', sequence: 1, kind: 'quiz' }],
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/prompt-buffer/refill')
      .send({});

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.promptBuffer, [{ promptId: 'kkp_1', sequence: 1, kind: 'quiz' }]);
    assert.deepEqual(res.body.state, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saved, true);
  });

  it('passes buffered intro prompt metadata into the service', async () => {
    const calls = [];
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat' },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice, promptRef) => {
          calls.push({ cardId, choice, promptRef });
          return { cardId, choice };
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({
        actionId: actionId('introbuf'),
        cardId: 'hiragana:a',
        choice: 'known',
        promptId: 'kkp_intro',
        sequence: 7,
      });

    assert.equal(res.status, 200);
    assert.deepEqual(calls, [{
      cardId: 'hiragana:a',
      choice: 'known',
      promptRef: { promptId: 'kkp_intro', sequence: 7, cardId: 'hiragana:a' },
    }]);
  });
```

In `tests/unit/ui/optimistic-run-integration.test.js`, add source guards:

```js
  it('wires Kanji Kombat prompt buffer API calls', () => {
    const apiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/api.js'), 'utf8');
    const kanjiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');

    assert.match(apiSource, /refillKanjiKombatPromptBuffer/);
    assert.match(apiSource, /\/kanji-kombat\/prompt-buffer\/refill/);
    assert.match(apiSource, /promptId/);
    assert.match(apiSource, /promptSequence/);
    assert.match(kanjiSource, /refillPromptBuffer/);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because the refill route and API functions do not exist.

- [ ] **Step 3: Implement route prompt metadata and refill endpoint**

In `src/routes/game/kanji-kombat.js`, add helper:

```js
function promptRefFromBody(body = {}) {
  if (!body.promptId && !body.payload?.promptId && !body.payload?.promptRef) return null;
  const ref = body.payload?.promptRef || {
    promptId: body.promptId || body.payload?.promptId,
    sequence: body.sequence ?? body.promptSequence ?? body.payload?.promptSequence,
    cardId: body.cardId || body.payload?.cardId,
  };
  return {
    promptId: ref.promptId,
    sequence: Number.isInteger(ref.sequence) ? ref.sequence : Number(ref.sequence),
    cardId: ref.cardId || null,
  };
}
```

Add the refill route before `/leaderboard`:

```js
  router.post('/prompt-buffer/refill', (req, res) => {
    try {
      const promptBuffer = req.gameManager.kanjiKombatService.refillPromptBuffer();
      req.saveGame();
      res.json({ promptBuffer, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

In the intro route, create `const promptRef = promptRefFromBody(req.body || {});` and call:

```js
          : req.gameManager.kanjiKombatService.submitIntroChoice(cardId, choice, promptRef ? {
              ...promptRef,
              cardId,
            } : {});
```

In the completion route, create `const promptRef = promptRefFromBody(req.body || {});` and call:

```js
        const result = req.gameManager.kanjiKombatService.resolveCompletionChoice(keepGoing, promptRef || {});
```

Leave answer route envelope handling intact; buffered answer metadata lives in the optimistic envelope payload.

- [ ] **Step 4: Implement API prompt metadata**

In `public/js/api.js`, update `submitKanjiKombatIntro()`:

```js
async function submitKanjiKombatIntro(cardId, choice, options = {}) {
  const body = { cardId, choice };
  if (options?.actionId) body.actionId = options.actionId;
  if (options?.promptId) body.promptId = options.promptId;
  if (Number.isInteger(options?.sequence)) body.sequence = options.sequence;
  return apiCall('/kanji-kombat/intro', 'POST', body, null, {
    bypassLoadingGate: true,
    returnErrorBody: true,
  });
}
```

Replace `submitKanjiKombatCompletionChoice()` with:

```js
async function submitKanjiKombatCompletionChoice(keepGoing, options = {}) {
  const body = { keepGoing };
  if (options?.actionId) body.actionId = options.actionId;
  if (options?.promptId) body.promptId = options.promptId;
  if (Number.isInteger(options?.sequence)) body.sequence = options.sequence;
  return apiCall('/kanji-kombat/completion-choice', 'POST', body, null, {
    bypassLoadingGate: true,
    timeoutMs: COMBAT_CYCLE_TIMEOUT_MS,
    returnErrorBody: true,
  });
}
```

Add refill API near the other Kanji Kombat APIs:

```js
async function refillKanjiKombatPromptBuffer() {
  return apiCall('/kanji-kombat/prompt-buffer/refill', 'POST', {}, null, {
    bypassLoadingGate: true,
    returnErrorBody: true,
  });
}
```

Export it with the existing API exports at the bottom of `public/js/api.js`.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/routes/game/kanji-kombat.js public/js/api.js tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "Add Kanji Kombat prompt buffer API"
```

## Task 4: Client Buffer Rendering And Local Consumption

**Files:**

- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `public/game.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`

- [ ] **Step 1: Write failing UI tests**

Append these tests to `tests/unit/ui/kanji-kombat-ui.test.js` before the closing `});`:

```js
  it('renders a buffered quiz before legacy quiz fields', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitAnswer: async (answerId, promptRef) => calls.push(['submitAnswer', answerId, promptRef.promptId]),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_quiz',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:か',
            quiz: {
              cardId: 'hiragana:か',
              prompt: 'か',
              reading: 'か',
              choices: [
                { id: 'ka', answer: 'ka', correct: true },
                { id: 'ki', answer: 'ki', correct: false },
              ],
            },
          }],
          currentQuiz: {
            cardId: 'hiragana:あ',
            prompt: 'あ',
            choices: [{ id: 'a', answer: 'a', correct: true }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt').textContent, 'か');
    await actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    assert.deepEqual(calls, ['submitAnswer', 'ka', 'kkp_quiz']);
  });

  it('locally consumes buffered intro prompts and renders the next prompt before submit resolves', async () => {
    const calls = [];
    let resolveSubmit;
    const submitPromise = new Promise(resolve => { resolveSubmit = resolve; });
    initKanjiKombatUI({
      submitIntro: async (cardId, choice, options = {}) => {
        calls.push(['submitIntro', cardId, choice, options.promptId, options.sequence]);
        return submitPromise;
      },
      updateGameState: state => calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              source: 'noDueBatch',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next',
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
    });

    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', 'kkp_next'],
      ['submitIntro', 'hiragana:か', 'unknown', 'kkp_intro', 1],
    ]);

    resolveSubmit({ status: 'accepted', state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } } });
    await flushPromises(2);
  });

  it('requests a single-flight refill when the local prompt buffer drops below three', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (_cardId, _choice, options = {}) => ({ status: 'accepted', actionId: options.actionId, state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } } }),
      refillPromptBuffer: async () => {
        calls.push(['refill']);
        return { state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } } };
      },
      updateGameState: () => calls.push(['updateGameState']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => {},
    });

    const gameState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_intro',
            sequence: 1,
            kind: 'intro',
            cardId: 'hiragana:か',
            intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(gameState);
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(4);

    assert.equal(calls.filter(call => call[0] === 'refill').length, 1);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because the UI does not render or consume `promptBuffer`.

- [ ] **Step 3: Add prompt buffer client helpers**

In `public/js/ui/kanji-kombat.js`, add `refillPromptBuffer` to the `api` object:

```js
  refillPromptBuffer: null,
```

Add constants and state:

```js
const PROMPT_BUFFER_REFILL_THRESHOLD = 3;
let promptBufferRefillPromise = null;
```

Add helpers before `renderKanjiKombatAction()`:

```js
function getActiveBufferedPrompt(kk) {
  return Array.isArray(kk?.promptBuffer) ? kk.promptBuffer[0] || null : null;
}

function promptRef(prompt) {
  if (!prompt) return {};
  return {
    promptId: prompt.promptId,
    sequence: prompt.sequence,
    cardId: prompt.cardId || prompt.quiz?.cardId || prompt.intro?.card?.id || null,
  };
}

function consumePromptHeadDraft(draft, prompt) {
  const kk = draft.run?.kanjiKombat;
  if (!kk || !prompt || !Array.isArray(kk.promptBuffer)) return;
  if (kk.promptBuffer[0]?.promptId === prompt.promptId) {
    kk.promptBuffer = kk.promptBuffer.slice(1);
  }
  const next = kk.promptBuffer[0] || null;
  kk.currentQuiz = next?.kind === 'quiz' ? next.quiz : null;
  kk.pendingIntro = next?.kind === 'intro'
    ? {
        cardId: next.cardId,
        card: next.intro.card,
        source: next.source || next.intro.source || null,
        promptId: next.promptId,
        sequence: next.sequence,
      }
    : null;
  kk.completionChoicePending = next?.kind === 'completePrompt';
}

function requestPromptBufferRefillIfLow(state) {
  const kk = state?.run?.kanjiKombat;
  if (!Array.isArray(kk?.promptBuffer)) return;
  if (kk.promptBuffer.length >= PROMPT_BUFFER_REFILL_THRESHOLD) return;
  if (promptBufferRefillPromise || typeof api.refillPromptBuffer !== 'function') return;
  promptBufferRefillPromise = Promise.resolve(api.refillPromptBuffer())
    .then(result => {
      if (result?.state) api.updateGameState?.(result.state);
      return result;
    })
    .catch(error => {
      console.warn('[KanjiKombat] prompt buffer refill failed:', error?.message || error);
      return null;
    })
    .finally(() => {
      promptBufferRefillPromise = null;
    });
}
```

Update `renderKanjiKombatAction()` to compute the active prompt:

```js
  const bufferedPrompt = getActiveBufferedPrompt(kk);
  const completionPrompt = bufferedPrompt?.kind === 'completePrompt';
  const introPrompt = bufferedPrompt?.kind === 'intro' ? bufferedPrompt : null;
  const quizPrompt = bufferedPrompt?.kind === 'quiz' ? bufferedPrompt : null;
```

Use `completionPrompt || kk.completionChoicePending`, `introPrompt || kk.pendingIntro?.card`, and `quizPrompt || kk.currentQuiz` in the three render branches.

In the intro branch, use:

```js
  const introCard = introPrompt?.intro?.card || kk.pendingIntro?.card;
```

Create pending local draft with prompt consumption:

```js
        const pending = createKanjiKombatPendingAction(gameState, 'kanjiKombat.intro', draft => {
          draft.run ||= {};
          draft.run.kanjiKombat ||= {};
          if (introPrompt) {
            consumePromptHeadDraft(draft, introPrompt);
          } else {
            draft.run.kanjiKombat.pendingIntro = null;
          }
        });
```

Submit with prompt metadata:

```js
          result = await api.submitIntro(introCard.id, choice, {
            actionId: pending.actionId,
            ...promptRef(introPrompt),
          });
```

After applying the pending state, call:

```js
        requestPromptBufferRefillIfLow(pending.state);
```

In the completion branch, create the pending local draft with explicit buffered consumption:

```js
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
```

Submit the completion choice with prompt metadata:

```js
          result = await api.submitCompletionChoice(keepGoing, {
            actionId: pending.actionId,
            ...promptRef(bufferedPrompt?.kind === 'completePrompt' ? bufferedPrompt : null),
          });
```

After applying the pending state, call:

```js
        requestPromptBufferRefillIfLow(pending.state);
```

In the quiz branch, render `quizPrompt?.quiz || kk.currentQuiz`, and call:

```js
        const result = await api.submitAnswer(answerId, promptRef(quizPrompt));
```

- [ ] **Step 4: Wire refill dependency from `public/game.js`**

In `public/game.js`, add the new API to the existing import list from `./js/api.js`:

```js
  refillKanjiKombatPromptBuffer as apiRefillKanjiKombatPromptBuffer,
```

In `kanjiKombatUI.initKanjiKombatUI({ ... })`, add:

```js
    refillPromptBuffer: apiRefillKanjiKombatPromptBuffer,
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js public/game.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "Render Kanji Kombat prompts from buffer"
```

## Task 5: Buffered Quiz Answer Metadata

**Files:**

- Modify: `public/js/ui/optimistic-combat-turn.js`
- Modify: `public/js/ui/combat-loop.js`
- Modify: `tests/unit/ui/optimistic-combat-turn.test.js`
- Modify: `tests/unit/ui/combat-network-hardening.test.js`

- [ ] **Step 1: Write failing optimistic quiz tests**

In `tests/unit/ui/optimistic-combat-turn.test.js`, add a test near the existing Kanji Kombat optimistic tests:

```js
  it('includes buffered prompt metadata in Kanji Kombat answer envelopes', () => {
    const kkState = kanjiKombatState();
    const result = buildOptimisticKanjiKombatAnswer({
      state: kkState,
      answerId: 'answer-correct',
      actionId: 'act_kanji_prompt',
      promptRef: { promptId: 'kkp_quiz', sequence: 4, cardId: 'hiragana:あ' },
    });

    assert.equal(result.envelope.payload.promptId, 'kkp_quiz');
    assert.equal(result.envelope.payload.promptSequence, 4);
    assert.equal(result.envelope.payload.cardId, 'hiragana:あ');
    assert.deepEqual(result.envelope.payload.promptRef, {
      promptId: 'kkp_quiz',
      sequence: 4,
      cardId: 'hiragana:あ',
    });
  });
```

In `tests/unit/ui/combat-network-hardening.test.js`, update the existing `builds optimistic Kanji Kombat answer envelopes through the combat-loop state seam` test state to include a `promptBuffer` head matching the current quiz:

```js
            promptBuffer: [{
              promptId: 'kkp_network',
              sequence: 9,
              kind: 'quiz',
              cardId: 'hiragana:あ',
              quiz: {
                cardId: 'hiragana:あ',
                choices: [
                  { id: 'answer-correct', answer: 'a', correct: true },
                  { id: 'answer-wrong', answer: 'i', correct: false },
                ],
              },
            }],
```

Add assertions:

```js
    assert.equal(result.envelope.payload.promptId, 'kkp_network');
    assert.equal(result.envelope.payload.promptSequence, 9);
    assert.equal(result.envelope.payload.cardId, 'hiragana:あ');
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js
```

Expected: FAIL because prompt metadata is not included in the envelope.

- [ ] **Step 3: Add prompt metadata to the optimistic builder**

In `public/js/ui/optimistic-combat-turn.js`, update `buildOptimisticKanjiKombatAnswer()` signature:

```js
export function buildOptimisticKanjiKombatAnswer({
  state,
  answerId,
  actionId = createActionId('kanji'),
  promptRef = null,
} = {}) {
```

Add prompt fields to the envelope payload:

```js
      ...(promptRef?.promptId ? {
        promptId: promptRef.promptId,
        promptSequence: promptRef.sequence,
        cardId: promptRef.cardId,
        promptRef: {
          promptId: promptRef.promptId,
          sequence: promptRef.sequence,
          cardId: promptRef.cardId,
        },
      } : {}),
```

- [ ] **Step 4: Pass prompt metadata through combat-loop answer submission**

In `public/js/ui/combat-loop.js`, update `buildOptimisticKanjiKombatRequest()`:

```js
function buildOptimisticKanjiKombatRequest(answerId, promptRef = null) {
  if (typeof apiSubmitKanjiKombatAnswer !== 'function') return null;
  return buildOptimisticKanjiKombatAnswer({ state: getGameState(), answerId, promptRef });
}
```

Update `runOptimisticKanjiKombatAnswer()` signature and call:

```js
  promptRef = null,
```

```js
  const optimistic = buildOptimisticKanjiKombatRequest(answerId, promptRef);
```

Update `submitKanjiKombatAnswer()`:

```js
export async function submitKanjiKombatAnswer(answerId, promptRef = null) {
```

Pass through the option:

```js
      promptRef,
```

Update `__combatNetworkTest.buildOptimisticKanjiKombatRequest` if the test helper wraps the old function so it accepts `promptRef`.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/optimistic-combat-turn.js public/js/ui/combat-loop.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "Attach prompt metadata to Kanji Kombat answers"
```

## Task 6: Completion Choice Prompt Validation

**Files:**

- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/game/kanji-kombat-run.test.js`
- Modify: `tests/unit/routes/kanji-kombat-routes.test.js`

- [ ] **Step 1: Write failing completion validation tests**

In `tests/unit/game/kanji-kombat-run.test.js`, append:

```js
  it('validates buffered completion prompt choices before resolving', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.promptBuffer = [{
      promptId: 'kkp_complete',
      sequence: 1,
      kind: 'completePrompt',
      cardId: null,
      source: 'dailyComplete',
    }];
    gm.run.kanjiKombat.completionChoicePending = true;

    assert.throws(
      () => service.resolveCompletionChoice(true, { promptId: 'kkp_wrong', sequence: 1 }),
      /Kanji Kombat prompt mismatch/
    );

    const result = service.resolveCompletionChoice(true, { promptId: 'kkp_complete', sequence: 1 });
    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(gm.run.kanjiKombat.endlessMode, true);
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-run.test.js
```

Expected: FAIL because `resolveCompletionChoice` does not accept prompt metadata.

- [ ] **Step 3: Implement completion prompt validation**

In `src/game/services/kanji-kombat-service.js`, update the method signature:

```js
  resolveCompletionChoice(keepGoing, promptRef = {}) {
```

After onboarding assertion, add:

```js
    const prompt = promptRef?.promptId
      ? validateKanjiKombatPromptHead(kk, {
          promptId: promptRef.promptId,
          sequence: promptRef.sequence,
          kind: 'completePrompt',
        })
      : null;
```

After `kk.completionChoicePending = false;`, consume the prompt:

```js
    if (prompt) consumeKanjiKombatPromptHead(kk, prompt);
```

Before returning the keep-going response, call:

```js
    this.refillPromptBuffer();
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-run.test.js tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-run.test.js tests/unit/routes/kanji-kombat-routes.test.js
/usr/bin/git commit -m "Validate Kanji Kombat completion prompts"
```

## Task 7: Regression And Syntax Verification

**Files:**

- Source files are edited in this task only when a verification command fails and the failure identifies a concrete defect.

- [ ] **Step 1: Run focused server tests**

Run:

```bash
npm run test:unit -- tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave.test.js tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: PASS.

- [ ] **Step 2: Run focused UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/speed-review.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check src/game/services/kanji-kombat-service.js
node --check src/routes/game/kanji-kombat.js
node --check public/js/api.js
node --check public/js/ui/kanji-kombat.js
node --check public/js/ui/optimistic-combat-turn.js
node --check public/js/ui/combat-loop.js
```

Expected: each command exits 0 with no syntax errors.

- [ ] **Step 4: Run full test gate**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit any verification fixes**

When verification identifies a concrete defect and the fix is applied, commit it:

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js src/routes/game/kanji-kombat.js public/js/api.js public/js/ui/kanji-kombat.js public/js/ui/optimistic-combat-turn.js public/js/ui/combat-loop.js tests/unit/game/kanji-kombat-deck.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js tests/unit/game/kanji-kombat-wave.test.js tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "Stabilize Kanji Kombat prompt buffer"
```

If no fixes were needed, do not create an empty commit.

## Task 8: Manual Kanji Kombat Smoke Verification

**Files:**

- Source files are edited in this task only when manual verification identifies a concrete defect.

- [ ] **Step 1: Ask before browser playtest**

Because repo instructions say not to launch Playwright without asking first, ask the user:

```text
Can I open a Playwright/browser session to smoke test Kanji Kombat prompt buffering locally?
```

Proceed only after approval.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite and Express start, and the app is available at `http://localhost:5173`.

If a server is already running on that port, reuse it after confirming it responds.

- [ ] **Step 3: Confirm the local app responds**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 4: Browser smoke test**

Using the approved browser session:

1. Navigate to `http://localhost:5173`.
2. Log in as `devtester` / `test1234`.
3. Start Kanji Kombat from the hub.
4. Answer at least three quiz prompts.
5. Choose at least one intro known/unknown prompt if one appears.
6. Confirm the next prompt appears at return-to-control without an extra prompt-selection wait.
7. Confirm no console errors appear for prompt mismatch, duplicate prompt commits, or refill failures.

Expected: Kanji Kombat stays playable, prompts advance from the local buffer, and server reconciliation is silent on the happy path.

- [ ] **Step 5: Capture screenshot evidence if UI rendering changed visibly**

If the rendered Kanji Kombat panel changed in a visible way, take a screenshot at the affected screen and delete the screenshot file immediately after sharing or recording the result, following repo cleanup rules.

- [ ] **Step 6: Final status commit**

If manual verification found and fixed issues, commit those fixes:

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js src/routes/game/kanji-kombat.js public/js/api.js public/js/ui/kanji-kombat.js public/js/ui/optimistic-combat-turn.js public/js/ui/combat-loop.js tests/unit
/usr/bin/git commit -m "Fix Kanji Kombat prompt buffer smoke issues"
```

If no fixes were needed, do not create an empty commit.
