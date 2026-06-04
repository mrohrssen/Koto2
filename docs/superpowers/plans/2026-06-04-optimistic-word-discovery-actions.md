# Optimistic Word Discovery Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement Phase 2 Task 2.2 from the optimistic actions roadmap: Word Discovery review/progress and room completion should use optimistic commit with server-authoritative correction and duplicate `actionId` idempotency.

**Architecture:** Reuse Koto's existing optimistic action ledger and `createPendingRunAction` client helpers. Completion stays on the run route because it mutates room/reward state; discovery card review/progress is handled by `/api/game/known-words/review`, so that route must also accept `actionId` to avoid duplicate daily-count/SRS commits. The UI advances silently on accepted success and restores authoritative retry state with the approved copy on corrected or network failures.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, Supertest, Koto optimistic action ledger.

---

## Roadmap Reference

Source roadmap: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`, Phase 2 Task 2.2.

## Completion Status

Status: complete
Started: 2026-06-04 17:52 JST
Completed: 2026-06-04 18:07 JST
Evidence: RED route and UI tests failed before implementation; GREEN route and UI tests passed after implementation; `npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js tests/unit/known-words-review.test.js` PASS; `node --check public/js/ui/exploration.js && node --check public/js/api.js && node --check public/game.js && node --check src/routes/game/run.js && node --check src/routes/game/known-words.js` PASS; `npm test` PASS.

Required actions:

- Word review/progress commit.
- Word Discovery completion.
- Completed-room proceed must keep using the reveal-buffer proceed helper from Task 1.3.

Approved failure copy:

- `Word discovery did not save. Please try again.`

## File Map

- Modify: `src/routes/game/known-words.js` - add optimistic action support for discovery review/progress.
- Modify: `src/routes/game/run.js` - wrap `/complete-discovery` with optimistic accepted/corrected status and duplicate replay.
- Modify: `public/js/api.js` - add optional `actionId` to `reviewVocabWord(...)` and `completeDiscovery(...)`.
- Modify: `public/game.js` - pass review options through the `apiSwipeWord` injection.
- Modify: `public/js/ui/exploration.js` - create pending discovery review/completion drafts, reconcile accepted/corrected responses, and show approved retry copy.
- Modify: `tests/unit/known-words-review.test.js` - cover optimistic review/progress duplicate idempotency.
- Modify: `tests/unit/routes/optimistic-run-routes.test.js` - cover `/complete-discovery` optimistic status, duplicate replay, and correction.
- Create: `tests/unit/ui/word-discovery-room.test.js` - cover UI action ID plumbing and corrected retry behavior.
- Modify: `tests/unit/ui/optimistic-run-integration.test.js` - add source-level guard coverage for API and UI wiring.
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md` - update Task 2.2 progress and evidence.

---

## Task 1: Route Idempotency Tests

**Files:**

- Modify: `tests/unit/known-words-review.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`

- [x] **Step 1: Add RED tests for optimistic discovery review/progress**

Append to `tests/unit/known-words-review.test.js`:

```js
describe('known-words review - optimistic discovery progress', () => {
  let tempDir;
  const userId = 'test-user-review-optimistic-discovery';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'srs-optimistic-discovery-'));
    configureSrs({ dataDir: tempDir });
  });

  it('wraps discovery reviews with accepted optimistic status and action type', async () => {
    const { app, meta } = buildKnownWordsApp({ userId, meta: { actionLedger: { entries: {}, order: [] } } });

    const res = await request(app)
      .post('/known-words/review')
      .send({ actionId: 'run_word_review_accept', word: '発見', grade: 'again', isDiscovery: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, 'run_word_review_accept');
    assert.equal(res.body.actionType, 'wordDiscovery.review');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.todayCount, 1);
    assert.equal(meta.actionLedger.order.includes('run_word_review_accept'), true);
  });

  it('does not increment discovery count twice for duplicate optimistic reviews', async () => {
    const { app, getSaveCalls } = buildKnownWordsApp({
      userId,
      meta: { actionLedger: { entries: {}, order: [] } },
    });

    await request(app)
      .post('/known-words/review')
      .send({ actionId: 'run_word_review_dupe', word: '発見', grade: 'again', isDiscovery: true });
    const duplicate = await request(app)
      .post('/known-words/review')
      .send({ actionId: 'run_word_review_dupe', word: '発見', grade: 'again', isDiscovery: true });

    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.status, 'accepted');
    assert.equal(duplicate.body.todayCount, 1);
    assert.equal(getSaveCalls(), 1);
  });
});
```

- [x] **Step 2: Add RED tests for optimistic Word Discovery completion**

Append to `tests/unit/routes/optimistic-run-routes.test.js`:

```js
  it('wraps complete-discovery with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('discoverycomplete') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => ({ type: 'word_discovery_complete', xpGrants: [] }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', room: { type: 'wordDiscovery', interacted: true } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('discoverycomplete'));
    assert.equal(res.body.actionType, 'wordDiscovery.complete');
    assert.deepEqual(res.body.state, { phase: 'room', room: { type: 'wordDiscovery', interacted: true } });
  });

  it('duplicate complete-discovery actionId does not complete the room twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    let completeCalls = 0;
    let saveCalls = 0;
    const req = {
      body: { actionId: actionId('discoverycompletedupe') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => {
          completeCalls += 1;
          return { type: 'word_discovery_complete', xpGrants: [{ creatureId: 'hi', xp: 2 }] };
        },
      },
      saveGame: () => { saveCalls += 1; },
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 2 } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(completeCalls, 1);
    assert.equal(saveCalls, 1);
  });

  it('optimistic complete-discovery errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/complete-discovery');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('discoverybad') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWordDiscovery: () => {
          throw new Error('No word discovery room here');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'wordDiscovery', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('discoverybad'));
    assert.equal(res.body.reason, 'No word discovery room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'wordDiscovery', run: { currentRoom: 4 } });
  });
```

- [x] **Step 3: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/known-words-review.test.js tests/unit/routes/optimistic-run-routes.test.js
```

Expected: FAIL because review and completion routes do not yet return accepted/corrected optimistic envelopes or duplicate replay.

## Task 2: API And UI Tests

**Files:**

- Create: `tests/unit/ui/word-discovery-room.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [x] **Step 1: Add RED source-level integration guards**

In `tests/unit/ui/optimistic-run-integration.test.js`, add assertions that:

```js
assert.match(apiSource, /reviewVocabWord\(word, grade, isDiscovery = false, options = \{\}\)/);
assert.match(apiSource, /actionId: options\.actionId/);
assert.match(apiSource, /verifiedRunAction\('\/complete-discovery', \{ actionId: options\.actionId \}\)/);
assert.match(gameSource, /apiSwipeWord: \(word, grade, isDiscovery, options = \{\}\) => reviewVocabWord\(word, grade, isDiscovery, options\)/);
assert.match(explorationSource, /actionType: 'wordDiscovery\.review'/);
assert.match(explorationSource, /actionType: 'wordDiscovery\.complete'/);
assert.match(explorationSource, /Word discovery did not save\. Please try again\./);
```

- [x] **Step 2: Create RED UI behavior tests**

Create `tests/unit/ui/word-discovery-room.test.js` with mocked `exploration.js` dependencies following the pattern in `tests/unit/ui/exploration-shrine.test.js`. Cover:

- Card swipe calls `apiSwipeWord(word, 'again', true, { actionId })`.
- Review success increments `discoveryState.wordsLearned` immediately and calls `renderWordDiscovery()` again.
- Corrected review response restores authoritative state through `updateGameState(...)`, calls `updateUI()`, and shows `Word discovery did not save. Please try again.`
- Completion calls `apiCompleteDiscovery({ actionId })` and applies accepted `state`.
- Corrected completion response restores authoritative state and shows the same approved copy.

- [x] **Step 3: Verify RED**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js
```

Expected: FAIL because API/UI action ID plumbing and retry copy are not implemented.

## Task 3: Implement Minimal Route Changes

**Files:**

- Modify: `src/routes/game/known-words.js`
- Modify: `src/routes/game/run.js`

- [x] **Step 1: Add optimistic review runner to known words**

In `src/routes/game/known-words.js`, import:

```js
import {
  createOptimisticActionRunner,
  getOptimisticActionLedgerOwner,
} from './optimistic-action-response.js';
```

Create a `runKnownWordReviewAction` inside `createKnownWordsRoutes(...)`:

```js
  const runKnownWordReviewAction = createOptimisticActionRunner({
    owner: getOptimisticActionLedgerOwner,
  });
```

Refactor the existing `/review` route so its current mutation logic lives in a local `performReview()` function. If `isDiscovery && req.body?.actionId`, call:

```js
    return runKnownWordReviewAction(req, res, {
      actionType: 'wordDiscovery.review',
      errorStatusCode: 409,
      perform: performReview,
    });
```

For non-discovery or no-`actionId` requests, keep the existing legacy response shape.

- [x] **Step 2: Wrap complete-discovery**

In `src/routes/game/run.js`, replace the `/complete-discovery` handler body with:

```js
  router.post('/complete-discovery', (req, res) => {
    return runOptimisticAction(req, res, {
      actionType: 'wordDiscovery.complete',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => req.gameManager.completeWordDiscovery(),
    });
  });
```

The runner preserves the legacy shape without `actionId` and returns accepted/corrected envelopes with `actionId`.

- [x] **Step 3: Verify GREEN for route tests**

Run:

```bash
npm run test:unit -- tests/unit/known-words-review.test.js tests/unit/routes/optimistic-run-routes.test.js
```

Expected: PASS.

## Task 4: Implement Minimal API And UI Changes

**Files:**

- Modify: `public/js/api.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`

- [x] **Step 1: Add API options**

Change `reviewVocabWord` to:

```js
export async function reviewVocabWord(word, grade, isDiscovery = false, options = {}) {
  try {
    const body = { word, grade };
    if (isDiscovery) body.isDiscovery = true;
    if (options?.actionId) body.actionId = options.actionId;
    const response = await fetch(apiUrl('/api/game/known-words/review'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to review vocab word:', error);
    return null;
  }
}
```

Change `completeDiscovery` to:

```js
async function completeDiscovery(options = {}) {
  if (options?.actionId) {
    return verifiedRunAction('/complete-discovery', { actionId: options.actionId });
  }
  return apiCall('/complete-discovery', 'POST');
}
```

Change the `public/game.js` injection to:

```js
apiSwipeWord: (word, grade, isDiscovery, options = {}) => reviewVocabWord(word, grade, isDiscovery, options),
```

- [x] **Step 2: Add Word Discovery pending helpers**

In `public/js/ui/exploration.js`, add helpers near the existing pending run helpers:

```js
function showWordDiscoverySaveFailure(pending) {
  rollbackPendingRunAction(pending);
  sceneModule?.showNarration?.('Word discovery did not save. Please try again.', { autoDismiss: 1800 });
}
```

In the review swipe handler, create:

```js
const pending = beginPendingRunAction({
  actionType: 'wordDiscovery.review',
  applyLocal: draft => {
    const draftScene = getSceneWithNpcs();
    if (draftScene?.discoveryState) draftScene.discoveryState.wordsLearned += 1;
  },
});
```

Because `discoveryState` is scene-owned and not part of `gameState`, update it directly only after creating a pending `actionId`; do not fabricate server rewards locally.

Call:

```js
const reviewResult = await apiSwipeWord(currentWord.word, 'again', true, { actionId: pending.actionId });
```

If `reviewResult?.status === 'corrected'` or the request fails, restore the authoritative/original state and show the approved copy. On accepted success, clear the pending action, update discovery counters from the response, and render the next card.

- [x] **Step 3: Add optimistic completion**

Create a small local helper in `renderWordDiscovery()`:

```js
const completeDiscoveryOptimistically = async () => {
  const pending = beginPendingRunAction({
    actionType: 'wordDiscovery.complete',
    applyLocal: draft => {
      const draftRoom = draft.room;
      if (draftRoom?.wordDiscovery) draftRoom.wordDiscovery.completed = true;
      if (draftRoom) draftRoom.interacted = true;
      draft.phase = 'room';
    },
  });
  if (!pending) return null;

  const result = await apiCompleteDiscovery({ actionId: pending.actionId });
  if (result?.status === 'corrected') {
    applyPendingRunCorrection(pending, result);
    sceneModule?.showNarration?.('Word discovery did not save. Please try again.', { autoDismiss: 1800 });
    return null;
  }
  if (result?.state) {
    reconcilePendingRunAction(pending, result, { refreshUi: false });
    return result;
  }
  showWordDiscoverySaveFailure(pending);
  return null;
};
```

Use it for at-limit, no-words, and all-words-learned completion branches. Preserve `apiPostCombatRefresh?.(learnedWords).catch(() => {})` after accepted completion.

- [x] **Step 4: Verify GREEN for UI/API tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js
```

Expected: PASS.

## Task 5: Final Verification And Roadmap Update

**Files:**

- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-word-discovery-actions.md`

- [x] **Step 1: Run required focused verification**

Run:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js tests/unit/known-words-review.test.js
node --check public/js/ui/exploration.js && node --check public/js/api.js && node --check public/game.js && node --check src/routes/game/run.js && node --check src/routes/game/known-words.js
npm test
```

- [x] **Step 2: Update roadmap completion evidence**

Set Task 2.2 in the roadmap to:

```markdown
Status: complete
Owner: Codex
Started: 2026-06-04 17:52 JST
Completed: YYYY-MM-DD HH:MM JST
Commit: `SHA`
Evidence: focused route/UI gate PASS; syntax gate PASS; `npm test` PASS. Manual browser verification not required because no visual/CSS/animation/rendering changes were made; UI failure copy is covered by unit tests.
```

Add a Progress Log row for completion.

- [x] **Step 3: Commit**

Run:

```bash
/usr/bin/git add src/routes/game/known-words.js src/routes/game/run.js public/js/api.js public/game.js public/js/ui/exploration.js tests/unit/known-words-review.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/word-discovery-room.test.js tests/unit/ui/optimistic-run-integration.test.js docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-word-discovery-actions.md
/usr/bin/git commit -m "feat: add optimistic word discovery actions"
```

- [x] **Step 4: Merge and push local dev**

From `/Users/michiarohrssen/Documents/Claude/koto-dev`, merge into `dev` and push `origin/dev`:

```bash
/usr/bin/git merge feature/optimistic-word-discovery-actions
/usr/bin/git push origin dev
```

Do not push `dev:master` unless the user explicitly asks for production release alignment.
