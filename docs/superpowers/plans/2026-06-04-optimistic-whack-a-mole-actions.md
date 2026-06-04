# Optimistic Whack-a-Mole Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Whack-a-Mole completion and decline/skip to optimistic commit while keeping the server authoritative and retry-safe.

**Architecture:** `/whack-a-mole-complete` and `/whack-a-mole-skip` use the existing optimistic action ledger wrapper, preserving legacy response shapes when no `actionId` is supplied. The browser API sends `actionId` through `verifiedRunAction(...)`, and the exploration UI creates pending run actions for completion and skip, reconciles accepted responses, and restores authoritative state on corrections. Completion remains a two-step flow: save the minigame result first, then use the existing reveal-buffer proceed path after the finish dialogue and XP line.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, existing optimistic run-action helpers.

---

## File Structure

- Modify: `src/routes/game/run.js`
  - Wrap Whack-a-Mole completion and skip routes in `runOptimisticAction(...)`.
  - Use `actionType: 'whackAMole.complete'` and `actionType: 'whackAMole.skip'`.
  - Preserve legacy no-`actionId` responses.
- Modify: `public/js/api.js`
  - Add optional `{ actionId }` support to `completeWhackAMole(score, options)` and `skipWhackAMole(options)`.
- Modify: `public/js/ui/exploration.js`
  - Add optimistic completion and skip helpers.
  - Use approved failure copy: `Game Master choice did not save. Please try again.`
  - Pass an optimistic completion wrapper into `WhackAMoleGame`.
- Modify: `public/js/ui/whack-a-mole.js`
  - Stop proceeding when the completion save returns `null` after a correction or network failure.
  - Keep room transition delegated to the injected `apiProceed` callback.
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
  - Route idempotency, accepted/corrected envelopes, and legacy response shape.
- Test: `tests/unit/ui/optimistic-run-integration.test.js`
  - Source-level contract checks for API wrappers, action types, and failure copy.
- Test: `tests/unit/ui/whack-a-mole-client.test.js`
  - Completion sends action ids through the injected wrapper and does not proceed on failed/corrected save.
- Test: `tests/unit/ui/exploration-whack-a-mole.test.js`
  - Decline/skip sends an action id, applies correction rollback, and already-completed proceed stays on reveal-buffer behavior.

---

### Task 1: Server Route And API Contracts

**Files:**
- Modify: `src/routes/game/run.js`
- Modify: `public/js/api.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`

- [x] **Step 1: Write failing route tests**

Append tests to `tests/unit/routes/optimistic-run-routes.test.js` after the speed-review completion tests:

```js
  it('wraps whack-a-mole completion with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcomplete'), score: 4 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: score => ({ type: 'whack_a_mole_complete', score, creditsAwarded: score }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 2 } }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('wamcomplete'));
    assert.equal(res.body.actionType, 'whackAMole.complete');
    assert.equal(res.body.score, 4);
    assert.deepEqual(res.body.state, { phase: 'room', run: { currentRoom: 2 } });
  });

  it('duplicate whack-a-mole completion actionId does not award twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    let completeCount = 0;
    const req = {
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcompletedupe'), score: 3 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: score => {
          completeCount += 1;
          return { type: 'whack_a_mole_complete', score, creditsAwarded: score, completeCount };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { completeCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionType, 'whackAMole.complete');
    assert.equal(completeCount, 1);
    assert.equal(duplicateRes.body.completeCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { completeCount: 1 } });
  });

  it('keeps legacy whack-a-mole completion response unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { score: 2 },
      gameManager: {
        completeWhackAMole: score => ({ type: 'whack_a_mole_complete', score, creditsAwarded: score }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.equal(res.body.type, 'whack_a_mole_complete');
    assert.equal(res.body.score, 2);
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('optimistic whack-a-mole completion errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-complete');
    const res = makeRes();

    await handler({
      user: { id: 'wam-user' },
      body: { actionId: actionId('wamcompletebad'), score: 5 },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeWhackAMole: () => { throw new Error('No whack-a-mole room here'); },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'whackAMole', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('wamcompletebad'));
    assert.equal(res.body.reason, 'No whack-a-mole room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'whackAMole', run: { currentRoom: 4 } });
  });

  it('wraps whack-a-mole skip with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('wamskip') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => ({ type: 'whack_a_mole_skipped', room: { type: 'empty' } }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { currentRoom: 1 } }),
    }, res);

    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('wamskip'));
    assert.equal(res.body.actionType, 'whackAMole.skip');
    assert.equal(res.body.type, 'whack_a_mole_skipped');
    assert.deepEqual(res.body.state, { phase: 'room', run: { currentRoom: 1 } });
  });

  it('duplicate whack-a-mole skip actionId does not skip twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    let skipCount = 0;
    const req = {
      body: { actionId: actionId('wamskipdupe') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => {
          skipCount += 1;
          return { type: 'whack_a_mole_skipped', skipCount };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { skipCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionType, 'whackAMole.skip');
    assert.equal(skipCount, 1);
    assert.equal(duplicateRes.body.skipCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { skipCount: 1 } });
  });

  it('keeps legacy whack-a-mole skip response unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();

    await handler({
      body: {},
      gameManager: {
        skipWhackAMole: () => ({ type: 'whack_a_mole_skipped', room: { type: 'empty' } }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.equal(res.body.type, 'whack_a_mole_skipped');
    assert.deepEqual(res.body.state, { phase: 'room' });
  });

  it('optimistic whack-a-mole skip errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/whack-a-mole-skip');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('wamskipbad') },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        skipWhackAMole: () => { throw new Error('No whack-a-mole room here'); },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'whackAMole', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('wamskipbad'));
    assert.equal(res.body.reason, 'No whack-a-mole room here');
    assert.deepEqual(res.body.authoritativeState, { phase: 'whackAMole', run: { currentRoom: 4 } });
  });
```

- [x] **Step 2: Write failing source-contract tests**

Add these assertions to `tests/unit/ui/optimistic-run-integration.test.js`:

```js
  it('routes Whack-a-Mole completion and skip through verified run actions', () => {
    assert.match(apiSource, /async function completeWhackAMole\(score, options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/whack-a-mole-complete', \{ score, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /async function skipWhackAMole\(options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/whack-a-mole-skip', \{ actionId: options\.actionId \}\)/);
  });

  it('sends action ids and correction copy for Whack-a-Mole choices', () => {
    assert.match(explorationSource, /const WHACK_A_MOLE_SAVE_FAILURE_COPY = 'Game Master choice did not save\. Please try again\.'/);
    assert.match(explorationSource, /actionType: 'whackAMole\.complete'/);
    assert.match(explorationSource, /actionType: 'whackAMole\.skip'/);
    assert.match(explorationSource, /apiCompleteWhackAMole\(score, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /apiSkipWhackAMole\(\{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /correctPendingRunAction\(pending, result\)/);
  });
```

- [x] **Step 3: Run failing tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because Whack-a-Mole routes and API calls do not yet accept `actionId`.

- [x] **Step 4: Implement route wrappers and API options**

In `public/js/api.js`, replace the current functions with:

```js
async function completeWhackAMole(score, options = {}) {
  if (options?.actionId) {
    return verifiedRunAction('/whack-a-mole-complete', { score, actionId: options.actionId });
  }
  return apiCall('/whack-a-mole-complete', 'POST', { score });
}

async function skipWhackAMole(options = {}) {
  if (options?.actionId) {
    return verifiedRunAction('/whack-a-mole-skip', { actionId: options.actionId });
  }
  return apiCall('/whack-a-mole-skip', 'POST');
}
```

In `src/routes/game/run.js`, wrap completion:

```js
router.post('/whack-a-mole-complete', async (req, res) => {
  return runOptimisticAction(req, res, {
    actionType: 'whackAMole.complete',
    errorStatusCode: 409,
    legacyErrorStatusCode: 400,
    perform: async () => {
      const { score } = req.body || {};
      const result = req.gameManager.completeWhackAMole(score);

      const knownWords = getKnownWordsFromFsrs(req.user.id);
      const knownSet = new Set(knownWords);
      const finishFrames = getGameMasterFinishFrames();
      const candidates = finishFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
      const finishDialogue = selectBestFrame(candidates, knownSet, { dict: getWordDict() }) || { tokens: [], words: [] };
      const finishDialogueWithAudio = await attachAudio(finishDialogue, req, 'game-master');

      if (req.body?.actionId) {
        return { ...result, finishDialogue: finishDialogueWithAudio };
      }
      return { ...result, finishDialogue: finishDialogueWithAudio, state: req.getEnrichedGameState() };
    },
  });
});
```

Wrap skip:

```js
router.post('/whack-a-mole-skip', (req, res) => {
  return runOptimisticAction(req, res, {
    actionType: 'whackAMole.skip',
    errorStatusCode: 409,
    legacyErrorStatusCode: 400,
    perform: () => {
      const result = req.gameManager.skipWhackAMole();
      if (req.body?.actionId) return result;
      return { ...result, state: req.getEnrichedGameState() };
    },
  });
});
```

- [x] **Step 5: Run green tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

---

### Task 2: Optimistic Completion Client Flow

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/whack-a-mole.js`
- Test: `tests/unit/ui/whack-a-mole-client.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`

- [x] **Step 1: Write failing completion UI tests**

Add tests to `tests/unit/ui/whack-a-mole-client.test.js`:

```js
  it('does not proceed when completion save returns null after correction', async () => {
    let rendered = 'game visible';
    let proceedCalls = 0;
    let updateCalls = 0;
    const game = new WhackAMoleGame([
      { id: 'a', reading: 'あ', sprite: '/a.webp' },
      { id: 'b', reading: 'い', sprite: '/b.webp' },
      { id: 'c', reading: 'う', sprite: '/c.webp' },
      { id: 'd', reading: 'え', sprite: '/d.webp' },
      { id: 'e', reading: 'お', sprite: '/e.webp' },
      { id: 'f', reading: 'か', sprite: '/f.webp' },
      { id: 'g', reading: 'き', sprite: '/g.webp' },
      { id: 'h', reading: 'く', sprite: '/h.webp' },
      { id: 'i', reading: 'け', sprite: '/i.webp' },
    ], {
      actions: { setContent: html => { rendered = html; } },
      apiCompleteWhackAMole: async () => null,
      apiProceed: async () => {
        proceedCalls += 1;
        return {};
      },
      updateGameState: () => {},
      updateUI: () => { updateCalls += 1; },
      playSFX: () => {},
    });

    await game._endGame();

    assert.equal(rendered, '');
    assert.equal(proceedCalls, 0);
    assert.equal(updateCalls, 1);
  });
```

- [x] **Step 2: Run failing completion UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because `_endGame()` proceeds even when the save returns no result and the exploration source has no Whack-a-Mole optimistic completion helper.

- [x] **Step 3: Implement optimistic completion helper**

In `public/js/ui/exploration.js`, add:

```js
const WHACK_A_MOLE_SAVE_FAILURE_COPY = 'Game Master choice did not save. Please try again.';

function showWhackAMoleSaveFailure() {
  sceneModule?.showNarration?.(WHACK_A_MOLE_SAVE_FAILURE_COPY, { autoDismiss: 1800 });
}

function applyWhackAMoleRoomCompletionDraft(draft, { score = null } = {}) {
  const draftRoom = draft.room || getCurrentBufferedRoom(draft);
  if (draftRoom?.whackAMole && score !== null) {
    draftRoom.whackAMole.score = Math.max(0, Math.floor(score || 0));
    draftRoom.whackAMole.completed = true;
  }
  if (draftRoom) draftRoom.interacted = true;
  draft.phase = 'room';
}

async function completeWhackAMoleOptimistically(score) {
  const pending = beginPendingRunAction({
    actionType: 'whackAMole.complete',
    applyLocal: draft => applyWhackAMoleRoomCompletionDraft(draft, { score }),
  });
  if (!pending) {
    showWhackAMoleSaveFailure();
    return null;
  }

  let result = null;
  try {
    result = await apiCompleteWhackAMole(score, { actionId: pending.actionId });
  } catch (error) {
    console.warn('[WhackAMole] Completion failed:', error);
  }

  if (result?.status === 'corrected') {
    updateGameState(correctPendingRunAction(pending, result));
    updateUI();
    clearPendingRunAction(pending);
    showWhackAMoleSaveFailure();
    return null;
  }

  if (result?.state) {
    reconcilePendingRunAction(pending, result, { refreshUi: false });
    return result;
  }

  rollbackPendingRunAction(pending);
  showWhackAMoleSaveFailure();
  return null;
}
```

In `startWhackAMoleGame(pool)`, pass the helper:

```js
apiCompleteWhackAMole: completeWhackAMoleOptimistically,
```

In `public/js/ui/whack-a-mole.js`, after the completion save:

```js
const result = await this.apiCompleteWhackAMole(this.score);
if (!result) {
  this.actions.setContent('');
  this.updateUI();
  return;
}
```

- [x] **Step 4: Run green completion UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

---

### Task 3: Optimistic Skip/Decline Client Flow

**Files:**
- Modify: `public/js/ui/exploration.js`
- Test: `tests/unit/ui/exploration-whack-a-mole.test.js`

- [x] **Step 1: Write failing decline tests**

Add tests to `tests/unit/ui/exploration-whack-a-mole.test.js`:

```js
  it('decline sends an optimistic action id and advances from the accepted state', async () => {
    const nextRoom = { id: 'after-wam-skip', type: 'empty' };
    let currentState = {
      phase: 'whackAMole',
      room: { id: 'wam-skip', type: 'whackAMole', interacted: false },
      run: {
        currentRoom: 0,
        rooms: [{ type: 'whackAMole' }, nextRoom],
        revealedRooms: [
          { index: 0, room: { id: 'wam-skip', type: 'whackAMole', interacted: false } },
          { index: 1, room: nextRoom },
        ],
      },
    };
    const skipCalls = [];

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: async () => {} },
      apiGetWhackAMoleDialogue: async () => ({ dialogue: null, yesTokens: null, noTokens: null }),
      apiSkipWhackAMole: async options => {
        skipCalls.push(options);
        return {
          status: 'accepted',
          actionId: options.actionId,
          actionType: 'whackAMole.skip',
          state: { ...currentState, phase: 'room', room: nextRoom, run: { ...currentState.run, currentRoom: 1 } },
        };
      },
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.equal(skipCalls.length, 1);
    assert.match(skipCalls[0].actionId, /^run_/);
    assert.equal(currentState.run.currentRoom, 1);
    assert.equal(currentState.phase, 'room');
  });

  it('decline correction restores authoritative Whack-a-Mole state and shows retry copy', async () => {
    let currentState = makeWhackAMoleState({
      id: 'wam-skip-corrected',
      type: 'whackAMole',
      interacted: false,
    });
    const narration = [];

    init({
      getGameState: () => currentState,
      updateGameState: state => { currentState = state; },
      updateUI: () => {},
      actions: { setContent: () => {}, clear: () => {} },
      scene: { showNarration: text => { narration.push(text); } },
      apiGetWhackAMoleDialogue: async () => ({ dialogue: null, yesTokens: null, noTokens: null }),
      apiSkipWhackAMole: async options => ({
        status: 'corrected',
        actionId: options.actionId,
        reason: 'No whack-a-mole room here',
        authoritativeState: makeWhackAMoleState({
          id: 'wam-skip-corrected',
          type: 'whackAMole',
          interacted: false,
        }),
      }),
    });

    await renderWhackAMole();
    await renderedButtons[1].onClick();

    assert.equal(currentState.phase, 'whackAMole');
    assert.equal(currentState.room.interacted, false);
    assert.deepEqual(narration, ['Game Master choice did not save. Please try again.']);
  });
```

- [x] **Step 2: Run failing decline tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/exploration-whack-a-mole.test.js
```

Expected: FAIL because decline currently calls `apiSkipWhackAMole()` without an `actionId`.

- [x] **Step 3: Implement optimistic skip helper**

In `public/js/ui/exploration.js`, add:

```js
async function skipWhackAMoleOptimistically() {
  const pending = beginPendingRunAction({
    actionType: 'whackAMole.skip',
    applyLocal: draft => {
      applyWhackAMoleRoomCompletionDraft(draft);
      advanceStateToBufferedNextRoom(draft);
    },
  });
  if (!pending) {
    showWhackAMoleSaveFailure();
    return null;
  }

  let result = null;
  try {
    result = await apiSkipWhackAMole({ actionId: pending.actionId });
  } catch (error) {
    console.warn('[WhackAMole] Skip failed:', error);
  }

  if (result?.status === 'corrected') {
    updateGameState(correctPendingRunAction(pending, result));
    updateUI();
    clearPendingRunAction(pending);
    showWhackAMoleSaveFailure();
    return null;
  }

  if (result?.state) {
    reconcilePendingRunAction(pending, result, { refreshUi: false });
    return result;
  }

  rollbackPendingRunAction(pending);
  showWhackAMoleSaveFailure();
  return null;
}
```

Replace the decline route call with:

```js
const result = await skipWhackAMoleOptimistically();
if (result?.state) {
  updateGameState(result.state);
}
```

Keep `actions.clear?.()` and NPC sprite hide before the optimistic call so the buttons disappear immediately.

- [x] **Step 4: Run green decline tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/exploration-whack-a-mole.test.js
```

Expected: PASS.

---

### Task 4: Verification, Roadmap Update, And Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-whack-a-mole-actions.md`

- [x] **Step 1: Run required focused verification**

Run exactly:

```bash
npm run test:unit -- tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js
node --check public/js/ui/whack-a-mole.js && node --check public/js/ui/exploration.js && node --check public/js/api.js
npm test
```

Expected: PASS for each command.

- [ ] **Step 2: Run browser verification**

Manual browser verification is required by the roadmap because Whack-a-Mole UI behavior is visible.

Use the repo playtest guide. Start the dev server with:

```bash
npm run dev
```

Then verify `http://localhost:5173` returns `200` before opening a browser.

Required observations:

- Whack-a-Mole prompt still renders with Game Master yes/no controls.
- Decline clears buttons immediately and advances or restores retry copy on correction.
- Completion clears the minigame only after the save path starts, then proceeds through the standard XP line and reveal-buffer room advance.
- Browser console has no new errors or warnings from Whack-a-Mole.

- [ ] **Step 3: Update roadmap completion fields**

In `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`, set Task 2.4:

```markdown
Status: complete
Owner: Codex
Started: 2026-06-04 20:41 JST
Completed: 2026-06-04 HH:MM JST
Commit: final commit SHA
Evidence: focused route/UI gate PASS; syntax checks PASS; `npm test` PASS; browser verification PASS for Whack-a-Mole prompt, decline, completion, and console health.
Branch: `feature/optimistic-whack-a-mole-actions`
Worktree: `.worktrees/optimistic-whack-a-mole-actions`
```

Add a Progress Log row:

```markdown
| 2026-06-04 | Codex | Task 2.4 | Completed Whack-a-Mole complete/skip optimistic commit with route idempotency, client correction handling, focused unit gate, syntax check, `npm test`, and browser verification. |
```

- [ ] **Step 4: Mark this plan complete**

Change all checkboxes in this file to `[x]` after verification evidence exists.

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git status --short
/usr/bin/git add src/routes/game/run.js public/js/api.js public/js/ui/exploration.js public/js/ui/whack-a-mole.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-whack-a-mole.test.js docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-whack-a-mole-actions.md
/usr/bin/git commit -m "feat: add optimistic whack-a-mole actions"
```

Expected: one commit on `feature/optimistic-whack-a-mole-actions`.
