# Optimistic Kanji Kombat Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete roadmap Phase 2 Task 2.5 by migrating Kanji Kombat intro known/unknown choices and completion keep-going/stop choices to the optimistic action contract.

**Architecture:** Keep predictive Kanji quiz answers unchanged. Add the shared optimistic action runner only to the non-answer Kanji Kombat choice routes, so duplicate `actionId` requests replay without re-grading script cards or resolving completion twice. The browser sends an `actionId`, clears the choice UI immediately, reconciles accepted state from the server, and restores authoritative state with approved retry copy on corrected or failed responses.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, Supertest, existing optimistic action ledger and Kanji Kombat service.

---

## Roadmap Reference

Source roadmap: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`

Selected task:

- Phase 2: Medium-Risk Room And Minigame Actions
- Task 2.5: Kanji Kombat Intro And Completion Choices Optimistic Commit
- Branch: `feature/optimistic-kanji-kombat-choices`
- Worktree: `.worktrees/optimistic-kanji-kombat-choices`

Required behavior from roadmap:

- Intro known/unknown choice uses optimistic commit.
- Completion keep-going/stop choice uses optimistic commit.
- Quiz answers remain predictive combat actions and must not be changed by this task.
- Hidden quiz answer correctness must not be exposed to the client by this work.
- Failure copy: `Kanji Kombat choice did not save. Please try again.`

## Completion Evidence

Status: complete
Completed: 2026-06-04 22:41 JST
Implementation commits: `536b0bf2`, `ef574178`, `d74fc560`
Review: server route spec and code-quality reviews found no remaining issues; UI/API spec review passed; UI/API code-quality re-review found no Critical or Important issues, and the Minor stale completion-response and thrown intro-response test gaps were patched.
Verification: `node --experimental-test-module-mocks --test tests/unit/routes/kanji-kombat-routes.test.js` PASS; `node --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js` PASS; `npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js` PASS; `node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js && node --check public/js/ui/kanji-kombat.js` PASS; `npm test` PASS.
Manual browser note: no browser session was launched because this task changed route/API/action commit behavior and source-covered retry copy, not CSS, animation, or rendering.

## File Map

Modify:

- `src/routes/game/kanji-kombat.js` - wrap `/intro` and `/completion-choice` with `createOptimisticActionRunner(...)`.
- `public/js/api.js` - add optional `{ actionId }` support to `submitKanjiKombatIntro(...)` and `submitKanjiKombatCompletionChoice(...)`.
- `public/js/ui/kanji-kombat.js` - create pending local drafts for intro and completion choices, reconcile accepted/corrected responses, and show approved retry copy.
- `tests/unit/routes/kanji-kombat-routes.test.js` - add accepted, duplicate, legacy, and corrected route coverage for both choice endpoints.
- `tests/unit/ui/kanji-kombat-ui.test.js` - add client behavior tests for action IDs, local pending drafts, correction rollback, and retry copy.
- `tests/unit/ui/optimistic-run-integration.test.js` - add source-level guard coverage for API/UI wiring.
- `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md` - update Task 2.5 progress and evidence.

No changes:

- `src/game/services/kanji-kombat-service.js` - route-level idempotency should be enough for intro and completion choices. Only touch this file if tests prove the service itself needs a small helper.
- `public/js/ui/optimistic-combat-turn.js` - predictive quiz answer optimism remains untouched.

---

## Task 1: Server Route Idempotency

**Files:**

- Modify: `src/routes/game/kanji-kombat.js`
- Modify: `tests/unit/routes/kanji-kombat-routes.test.js`

- [x] **Step 1: Write failing route tests**

In `tests/unit/routes/kanji-kombat-routes.test.js`, update `appWithManager(...)` so `req.saveGame` records a count:

```js
req.saveGame = () => {
  manager.saved = true;
  manager.saveCalls = (manager.saveCalls || 0) + 1;
};
```

Add this helper near `appWithManager(...)`:

```js
function actionId(suffix) {
  return `kkchoice_m0_${suffix}`;
}
```

Append route tests after the existing intro and completion tests:

```js
  it('wraps intro choices with accepted optimistic status when actionId is present', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => ({ cardId, choice, introResolved: true }),
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ actionId: actionId('introok'), cardId: 'hiragana:a', choice: 'known' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('introok'));
    assert.equal(res.body.actionType, 'kanjiKombat.intro');
    assert.equal(res.body.cardId, 'hiragana:a');
    assert.equal(res.body.choice, 'known');
    assert.equal(res.body.introResolved, true);
    assert.deepEqual(res.body.state, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saveCalls, 1);
  });

  it('duplicate intro actionId replays without re-submitting the intro choice', async () => {
    let submitCalls = 0;
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        submitIntroChoice: (cardId, choice) => {
          submitCalls += 1;
          return { cardId, choice, submitCalls };
        },
      },
    };
    const body = { actionId: actionId('introdupe'), cardId: 'katakana:ka', choice: 'unknown' };

    await request(appWithManager(manager)).post('/kanji-kombat/intro').send(body);
    const duplicate = await request(appWithManager(manager)).post('/kanji-kombat/intro').send(body);

    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.status, 'accepted');
    assert.equal(duplicate.body.actionType, 'kanjiKombat.intro');
    assert.equal(duplicate.body.submitCalls, 1);
    assert.equal(submitCalls, 1);
    assert.equal(manager.saveCalls, 1);
  });

  it('optimistic intro errors return corrected authoritative state', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat', kanjiKombat: { pendingIntro: { cardId: 'hiragana:a' } } },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        submitIntroChoice: () => {
          throw new Error('Kanji Kombat intro card mismatch');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/intro')
      .send({ actionId: actionId('introbad'), cardId: 'hiragana:i', choice: 'known' });

    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('introbad'));
    assert.equal(res.body.reason, 'Kanji Kombat intro card mismatch');
    assert.deepEqual(res.body.authoritativeState, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saved, undefined);
  });

  it('wraps completion choices with accepted optimistic status when actionId is present', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        resolveCompletionChoice: keepGoing => ({ keepGoing, actionType: 'kanjiKombat', completionChoicePending: false }),
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ actionId: actionId('finishok'), keepGoing: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('finishok'));
    assert.equal(res.body.actionType, 'kanjiKombat.completionChoice');
    assert.equal(res.body.keepGoing, true);
    assert.equal(res.body.completionChoicePending, false);
    assert.deepEqual(res.body.state, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saveCalls, 1);
  });

  it('duplicate completion-choice actionId replays without resolving twice', async () => {
    let resolveCalls = 0;
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      kanjiKombatService: {
        resolveCompletionChoice: keepGoing => {
          resolveCalls += 1;
          return { keepGoing, actionType: 'kanjiKombat', resolveCalls };
        },
      },
    };
    const body = { actionId: actionId('finishdupe'), keepGoing: false };

    await request(appWithManager(manager)).post('/kanji-kombat/completion-choice').send(body);
    const duplicate = await request(appWithManager(manager)).post('/kanji-kombat/completion-choice').send(body);

    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.status, 'accepted');
    assert.equal(duplicate.body.actionType, 'kanjiKombat.completionChoice');
    assert.equal(duplicate.body.resolveCalls, 1);
    assert.equal(resolveCalls, 1);
    assert.equal(manager.saveCalls, 1);
  });

  it('optimistic completion-choice errors return corrected authoritative state', async () => {
    const manager = {
      meta: { actionLedger: { entries: {}, order: [] } },
      run: { mode: 'kanjiKombat', kanjiKombat: { completionChoicePending: false } },
      combat: { mode: 'kanjiKombat' },
      kanjiKombatService: {
        resolveCompletionChoice: () => {
          throw new Error('No Kanji Kombat completion choice is pending');
        },
      },
    };

    const res = await request(appWithManager(manager))
      .post('/kanji-kombat/completion-choice')
      .send({ actionId: actionId('finishbad'), keepGoing: false });

    assert.equal(res.status, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('finishbad'));
    assert.equal(res.body.reason, 'No Kanji Kombat completion choice is pending');
    assert.deepEqual(res.body.authoritativeState, { run: manager.run, combat: manager.combat });
    assert.equal(manager.saved, undefined);
  });
```

- [x] **Step 2: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: FAIL because `/intro` and `/completion-choice` still return legacy shapes and do not replay duplicate `actionId`s.

- [x] **Step 3: Implement route wrappers**

In `src/routes/game/kanji-kombat.js`, add imports:

```js
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
} from './optimistic-action-response.js';
```

Inside `createKanjiKombatRoutes()`, create the runner:

```js
  const runOptimisticAction = createOptimisticActionRunner({ owner: getOptimisticActionLedgerOwner });
```

Replace the `/intro` route with:

```js
  router.post('/intro', (req, res) => {
    const { cardId, choice } = req.body || {};
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.intro',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (!cardId || !['known', 'unknown'].includes(choice)) {
          throw new Error('cardId and choice (known|unknown) required');
        }
        const result = req.gameManager.submitKanjiKombatIntro
          ? req.gameManager.submitKanjiKombatIntro(cardId, choice)
          : req.gameManager.kanjiKombatService.submitIntroChoice(cardId, choice);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });
```

Replace the `/completion-choice` route with:

```js
  router.post('/completion-choice', (req, res) => {
    const { keepGoing } = req.body || {};
    return runOptimisticAction(req, res, {
      actionType: 'kanjiKombat.completionChoice',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        if (typeof keepGoing !== 'boolean') {
          throw new Error('keepGoing boolean required');
        }
        const result = req.gameManager.kanjiKombatService.resolveCompletionChoice(keepGoing);
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js
```

Expected: PASS.

---

## Task 2: API And UI Optimistic Choice Flow

**Files:**

- Modify: `public/js/api.js`
- Modify: `public/js/ui/kanji-kombat.js`
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [x] **Step 1: Write failing API/source contract test**

Add this test to `tests/unit/ui/optimistic-run-integration.test.js`:

```js
  it('sends action ids for Kanji Kombat intro and completion choices without changing answer prediction', () => {
    const kanjiKombatSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');

    assert.match(apiSource, /submitKanjiKombatIntro\(cardId, choice, options = \{\}\)/);
    assert.match(apiSource, /actionId: options\.actionId/);
    assert.match(apiSource, /submitKanjiKombatCompletionChoice\(keepGoing, options = \{\}\)/);
    assert.match(kanjiKombatSource, /KANJI_KOMBAT_SAVE_FAILURE_COPY = 'Kanji Kombat choice did not save\. Please try again\.'/);
    assert.match(kanjiKombatSource, /actionType: 'kanjiKombat\.intro'/);
    assert.match(kanjiKombatSource, /actionType: 'kanjiKombat\.completionChoice'/);
    assert.match(kanjiKombatSource, /api\.submitIntro\(kk\.pendingIntro\.card\.id, choice, \{ actionId: pending\.actionId \}\)/);
    assert.match(kanjiKombatSource, /api\.submitCompletionChoice\(keepGoing, \{ actionId: pending\.actionId \}\)/);
    assert.match(kanjiKombatSource, /correctPendingRunAction\(pending, result\)/);
    assert.doesNotMatch(kanjiKombatSource, /correctAnswerId[\s\S]{0,400}submitIntro/);
  });
```

- [x] **Step 2: Write failing UI behavior tests**

In `tests/unit/ui/kanji-kombat-ui.test.js`, add tests after the existing intro/completion tests:

```js
  it('submits intro choices with an action id and clears the choice locally', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (cardId, choice, options = {}) => {
        calls.push(['submitIntro', cardId, choice, /^run_[a-z0-9]+_[a-z0-9]+$/i.test(options.actionId)]);
        return { status: 'accepted', actionId: options.actionId, state: { phase: 'combat', accepted: true } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase, state.accepted === true, state.run?.kanjiKombat?.pendingIntro ?? null]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async () => calls.push(['unexpected-narration']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          pendingIntro: { card: { id: 'hiragana:ka', prompt: 'か', reading: 'か', answer: 'ka' } },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false, null],
      ['submitIntro', 'hiragana:ka', 'known', true],
      ['updateGameState', 'combat', true, null],
      ['refreshAction'],
    ]);
    assert.equal(actionArea.innerHTML, '');
  });

  it('rolls back corrected intro choices and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (_cardId, _choice, options = {}) => ({
        status: 'corrected',
        actionId: options.actionId,
        authoritativeState: { phase: 'combat', run: { kanjiKombat: { pendingIntro: { card: { id: 'hiragana:ka' } } } } },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, !!state.run?.kanjiKombat?.pendingIntro]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          pendingIntro: { card: { id: 'hiragana:ka', prompt: 'か', reading: 'か', answer: 'ka' } },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('submits completion choices with an action id and waits for server finish handling', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (keepGoing, options = {}) => {
        calls.push(['submitCompletionChoice', keepGoing, /^run_[a-z0-9]+_[a-z0-9]+$/i.test(options.actionId)]);
        return { status: 'accepted', actionId: options.actionId, state: { phase: 'combat', accepted: true }, combatEnded: true, victory: true };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase, state.accepted === true, state.run?.kanjiKombat?.completionChoicePending ?? null]),
      finishCombatResult: result => calls.push(['finishCombatResult', result.victory]),
      refreshAction: () => calls.push(['unexpected-refresh']),
      updateUI: () => calls.push(['unexpected-update']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].click();

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false, false],
      ['submitCompletionChoice', false, true],
      ['updateGameState', 'combat', true, null],
      ['finishCombatResult', true],
    ]);
    assert.equal(actionArea.innerHTML, '');
  });

  it('rolls back corrected completion choices and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (_keepGoing, options = {}) => ({
        status: 'corrected',
        actionId: options.actionId,
        authoritativeState: { phase: 'combat', run: { kanjiKombat: { completionChoicePending: true } } },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, state.run?.kanjiKombat?.completionChoicePending === true]),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
      showNarration: async text => calls.push(['showNarration', text]),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].click();

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });
```

- [x] **Step 3: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because API wrappers and UI choices do not send `actionId`, apply pending drafts, or handle corrected retry copy yet.

- [x] **Step 4: Implement API options**

In `public/js/api.js`, replace the two choice wrappers with:

```js
async function submitKanjiKombatIntro(cardId, choice, options = {}) {
  const body = { cardId, choice };
  if (options?.actionId) body.actionId = options.actionId;
  return apiCall('/kanji-kombat/intro', 'POST', body, null, {
    bypassLoadingGate: true,
    returnErrorBody: true,
  });
}
```

```js
async function submitKanjiKombatCompletionChoice(keepGoing, options = {}) {
  const body = { keepGoing };
  if (options?.actionId) body.actionId = options.actionId;
  return apiCall('/kanji-kombat/completion-choice', 'POST', body, null, {
    bypassLoadingGate: true,
    timeoutMs: COMBAT_CYCLE_TIMEOUT_MS,
    returnErrorBody: true,
  });
}
```

- [x] **Step 5: Implement UI pending drafts and correction handling**

In `public/js/ui/kanji-kombat.js`, import:

```js
import {
  createPendingRunAction,
  correctPendingRunAction,
} from './optimistic-run-action.js';
```

Add constants/helpers near `onboardingInProgress`:

```js
const KANJI_KOMBAT_SAVE_FAILURE_COPY = 'Kanji Kombat choice did not save. Please try again.';

function createKanjiKombatPendingAction(gameState, actionType, applyLocal) {
  return createPendingRunAction({ state: gameState, actionType, applyLocal });
}

async function showKanjiKombatSaveFailure() {
  await api.showNarration?.(KANJI_KOMBAT_SAVE_FAILURE_COPY, { speaker: 'Cid', autoDismiss: 1800 });
}

function applyKanjiKombatCorrection(pending, result) {
  api.updateGameState?.(correctPendingRunAction(pending, result));
}
```

In the completion choice branch of `renderKanjiKombatAction(gameState)`, replace the current `onChoice` handler with:

```js
      onChoice: async keepGoing => {
        const pending = createKanjiKombatPendingAction(
          gameState,
          'kanjiKombat.completionChoice',
          draft => {
            if (draft.run?.kanjiKombat) {
              draft.run.kanjiKombat.completionChoicePending = false;
              if (keepGoing) draft.run.kanjiKombat.endlessMode = true;
            }
          },
        );
        api.updateGameState?.(pending.state);
        clearActionArea();

        const result = await api.submitCompletionChoice(keepGoing, { actionId: pending.actionId });
        if (result?.status === 'corrected' || !result) {
          applyKanjiKombatCorrection(pending, result);
          await showKanjiKombatSaveFailure();
          api.updateUI?.();
          return;
        }
        if (result?.state) api.updateGameState(result.state);
        if (result?.combatEnded) {
          api.finishCombatResult?.(result);
          return;
        }
        if (result?.state && typeof api.refreshAction === 'function') {
          api.refreshAction();
          return;
        }
        api.updateUI?.();
      },
```

In the intro branch, replace the current `onChoice` handler with:

```js
      onChoice: async choice => {
        const pending = createKanjiKombatPendingAction(
          gameState,
          'kanjiKombat.intro',
          draft => {
            if (draft.run?.kanjiKombat) {
              draft.run.kanjiKombat.pendingIntro = null;
            }
          },
        );
        api.updateGameState?.(pending.state);
        clearActionArea();

        const result = await api.submitIntro(kk.pendingIntro.card.id, choice, { actionId: pending.actionId });
        if (result?.status === 'corrected' || !result) {
          applyKanjiKombatCorrection(pending, result);
          await showKanjiKombatSaveFailure();
          api.updateUI?.();
          return;
        }
        if (result?.state) api.updateGameState(result.state);
        if (result?.state && typeof api.refreshAction === 'function') {
          api.refreshAction();
          return;
        }
        api.updateUI?.();
      },
```

Do not change the quiz-answer branch.

- [x] **Step 6: Verify GREEN**

Run:

```bash
npm run test:unit -- tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

---

## Task 3: Final Verification And Roadmap Update

**Files:**

- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-kanji-kombat-choices.md`

- [x] **Step 1: Run focused Kanji Kombat gate**

Run:

```bash
npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js
```

Expected: PASS.

- [x] **Step 2: Run syntax checks**

Run:

```bash
node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js && node --check public/js/ui/kanji-kombat.js
```

Expected: PASS.

- [x] **Step 3: Run full verification**

Run:

```bash
npm test
```

Expected: PASS.

- [x] **Step 4: Update roadmap completion evidence**

Set Task 2.5 in `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md` to:

```markdown
Status: complete
Owner: Codex
Started: 2026-06-04 22:12 JST
Completed: 2026-06-04 22:41 JST
Commit: `536b0bf2`, `ef574178`, `d74fc560`
Evidence: RED route/UI tests failed before implementation; GREEN route/UI tests passed after implementation; `npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js` PASS; `node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js && node --check public/js/ui/kanji-kombat.js` PASS; `npm test` PASS. No browser session was launched because this task changed route/API/action commit behavior and source-covered retry copy, not CSS, animation, or rendering.
```

Add a Progress Log completion row and set Phase 2 to complete. Leave Phase 3 blocked until the user explicitly requests the next task.

- [x] **Step 5: Commit**

Implementation source commits were created by the Task 1 and Task 2 workers:

- `536b0bf2` - route idempotency
- `ef574178` - API/UI optimistic choice flow
- `d74fc560` - thrown intro rollback regression coverage

Final roadmap evidence was committed after verification with:

```bash
/usr/bin/git add docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-kanji-kombat-choices.md
/usr/bin/git commit -m "docs: mark optimistic kanji kombat choices complete"
```

- [x] **Step 6: Merge and push local dev**

From `/Users/michiarohrssen/Documents/Claude/koto-dev`, merge into `dev` and push `origin/dev`:

```bash
/usr/bin/git merge feature/optimistic-kanji-kombat-choices
/usr/bin/git push origin dev
```

Do not push `dev:master` unless the user explicitly asks for production release alignment.
