# Optimistic Speed Review Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete roadmap Task 2.3 by making Speed Review room completion use the optimistic run-action contract after all card review commits have settled.

**Architecture:** The existing Speed Review room already serializes card review commits and waits for in-flight commits before calling `onComplete`. This slice keeps that guard, wraps only `/speed-review-room/complete` with the shared optimistic action runner, sends an `actionId` from the client, applies a local completed room draft, and reconciles accepted/corrected server responses through the existing pending run-action helpers.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, existing optimistic action ledger and route helper.

---

## Roadmap Reference

Source roadmap: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`

Next task selected:

- Phase 2: Medium-Risk Room And Minigame Actions
- Task 2.3: Speed Review Room Completion Optimistic Commit
- Branch: `feature/optimistic-speed-review-room`
- Worktree: `.worktrees/optimistic-speed-review-room`

Required behavior from roadmap:

- Speed Review room completion uses optimistic commit.
- All in-flight card commits must be confirmed or retried successfully before the room is marked complete locally.
- Failure copy: `Speed review did not save. Please try again.`

## File Map

Modify:

- `src/routes/game/run.js` - wrap `/speed-review-room/complete` with `runOptimisticAction`.
- `public/js/api.js` - add optional `{ actionId }` support to `completeSpeedReviewRoom()`.
- `public/js/ui/exploration.js` - create a pending `speedReview.complete` run action in `renderSpeedReviewRoom()` after card commits settle.
- `tests/unit/routes/optimistic-run-routes.test.js` - route accepted, duplicate, legacy, and corrected coverage.
- `tests/unit/ui/optimistic-run-integration.test.js` - source-level client/API contract coverage.

No production change is needed in `public/js/ui/speed-review.js` unless tests expose a gap; it already waits for `state.reviewPromises` before invoking room-mode `onComplete`.

## Task 1: Route And API Contract

**Files:**

- Modify: `src/routes/game/run.js`
- Modify: `public/js/api.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Write failing route tests**

Add these tests near the existing Word Discovery optimistic route tests in `tests/unit/routes/optimistic-run-routes.test.js`:

```js
  it('wraps speed-review room completion with accepted optimistic status when actionId is present', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('speedcomplete'), roomId: 'speed-room-1' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: ({ roomId }) => ({ roomId, completed: true }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({
        phase: 'room',
        run: {
          currentRoom: 2,
          revealedRooms: [{ id: 'speed-room-1', speedReviewRoom: { completed: true } }],
        },
      }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.actionId, actionId('speedcomplete'));
    assert.equal(res.body.actionType, 'speedReview.complete');
    assert.equal(res.body.roomId, 'speed-room-1');
    assert.equal(res.body.completed, true);
    assert.deepEqual(res.body.state, {
      phase: 'room',
      run: {
        currentRoom: 2,
        revealedRooms: [{ id: 'speed-room-1', speedReviewRoom: { completed: true } }],
      },
    });
  });

  it('duplicate speed-review completion actionId does not complete the room twice', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    let completeCount = 0;
    const req = {
      body: { actionId: actionId('speedcompletedupe'), roomId: 'speed-room-2' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: ({ roomId }) => {
          completeCount += 1;
          return { roomId, completed: true, completeCount };
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { completeCount } }),
    };

    await handler(req, makeRes());
    const duplicateRes = makeRes();
    await handler(req, duplicateRes);

    assert.equal(duplicateRes.statusCode, 200);
    assert.equal(duplicateRes.body.status, 'accepted');
    assert.equal(duplicateRes.body.actionId, actionId('speedcompletedupe'));
    assert.equal(duplicateRes.body.actionType, 'speedReview.complete');
    assert.equal(completeCount, 1);
    assert.equal(duplicateRes.body.completeCount, 1);
    assert.deepEqual(duplicateRes.body.state, { phase: 'room', run: { completeCount: 1 } });
  });

  it('keeps legacy speed-review completion responses unchanged when actionId is absent', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { roomId: 'speed-room-3' },
      gameManager: {
        completeSpeedReviewRoom: ({ roomId }) => ({ roomId, completed: true }),
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' }),
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, undefined);
    assert.equal(res.body.actionId, undefined);
    assert.equal(res.body.actionType, undefined);
    assert.deepEqual(res.body, {
      roomId: 'speed-room-3',
      completed: true,
      state: { phase: 'room' },
    });
  });

  it('optimistic speed-review completion errors return corrected authoritative state', async () => {
    const handler = getHandler(createRunRouter(), 'post', '/speed-review-room/complete');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('speedcompletebad'), roomId: 'speed-room-4' },
      gameManager: {
        meta: { actionLedger: { entries: {}, order: [] } },
        completeSpeedReviewRoom: () => {
          throw new Error('Speed review room is not ready to complete');
        },
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'speedReviewRoom', run: { currentRoom: 4 } }),
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.status, 'corrected');
    assert.equal(res.body.actionId, actionId('speedcompletebad'));
    assert.equal(res.body.reason, 'Speed review room is not ready to complete');
    assert.deepEqual(res.body.authoritativeState, { phase: 'speedReviewRoom', run: { currentRoom: 4 } });
  });
```

- [ ] **Step 2: Write failing source contract tests**

Add one test to `tests/unit/ui/optimistic-run-integration.test.js`:

```js
  it('sends action ids for speed review room completion after commit settling', () => {
    assert.match(apiSource, /completeSpeedReviewRoom\(roomId, options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/speed-review-room\/complete', \{ roomId, actionId: options\.actionId \}\)/);

    const speedReviewRoomSource = sourceBetween(
      explorationSource,
      'export async function renderSpeedReviewRoom()',
      '// ============ WHACK-A-MOLE MINI GAME ============'
    );

    assert.match(speedReviewRoomSource, /actionType: 'speedReview\.complete'/);
    assert.match(speedReviewRoomSource, /apiCompleteSpeedReviewRoom\(room\.id, \{ actionId: pending\.actionId \}\)/);
    assert.match(speedReviewRoomSource, /correctPendingRunAction\(pending, completeResult\)/);
    assert.match(speedReviewRoomSource, /Speed review did not save\. Please try again\./);
  });
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because `/speed-review-room/complete` still returns the legacy shape and the API/client do not pass `actionId`.

- [ ] **Step 4: Implement route optimism**

In `src/routes/game/run.js`, replace the current `/speed-review-room/complete` handler with:

```js
  router.post('/speed-review-room/complete', (req, res) => {
    const { roomId } = req.body || {};
    if (!roomId) {
      const error = new Error('roomId is required');
      if (req.body?.actionId) {
        return sendOptimisticActionError(req, res, error, 400);
      }
      return res.status(400).json({ error: error.message });
    }

    return runOptimisticAction(req, res, {
      actionType: 'speedReview.complete',
      errorStatusCode: 409,
      legacyErrorStatusCode: 500,
      perform: () => req.gameManager.completeSpeedReviewRoom({ roomId }),
    });
  });
```

This preserves the no-`actionId` legacy success shape through `withOptimisticActionStatus()` and moves duplicate handling into the shared ledger runner.

- [ ] **Step 5: Implement API option support**

In `public/js/api.js`, replace `completeSpeedReviewRoom(roomId)` with:

```js
async function completeSpeedReviewRoom(roomId, options = {}) {
  if (options?.actionId) {
    return verifiedRunAction('/speed-review-room/complete', { roomId, actionId: options.actionId });
  }
  return apiCall('/speed-review-room/complete', 'POST', { roomId });
}
```

- [ ] **Step 6: Run route/API tests and verify GREEN**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

## Task 2: Client Completion Reconciliation

**Files:**

- Modify: `public/js/ui/exploration.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`
- Test: `tests/unit/ui/speed-review.test.js`

- [ ] **Step 1: Confirm Speed Review waits for committed review promises**

No production code should be required for this rule because `public/js/ui/speed-review.js` already runs:

```js
flushPendingReview();
if (state.reviewPromises.length > 0) {
  await Promise.all(state.reviewPromises);
}
```

before invoking `state.session.onComplete(...)`. Keep this behavior intact.

- [ ] **Step 2: Implement optimistic completion reconciliation**

In `public/js/ui/exploration.js`, add this constant near `WORD_DISCOVERY_SAVE_FAILURE_COPY`:

```js
const SPEED_REVIEW_SAVE_FAILURE_COPY = 'Speed review did not save. Please try again.';
```

Then replace the `onComplete` callback inside `renderSpeedReviewRoom()` with:

```js
      onComplete: async () => {
        const pending = beginPendingRunAction({
          actionType: 'speedReview.complete',
          applyLocal: draft => {
            const draftRoom = getCurrentBufferedRoom(draft);
            if (draftRoom?.speedReviewRoom) {
              draftRoom.speedReviewRoom.completed = true;
              draftRoom.speedReviewRoom.reviewedCards = Math.max(
                draftRoom.speedReviewRoom.reviewedCards || 0,
                draftRoom.speedReviewRoom.targetCards || 0
              );
            }
            if (draftRoom) draftRoom.interacted = true;
            draft.phase = 'room';
          },
        });
        if (!pending) {
          throw new Error(SPEED_REVIEW_SAVE_FAILURE_COPY);
        }

        let completeResult = null;
        try {
          completeResult = await apiCompleteSpeedReviewRoom(room.id, { actionId: pending.actionId });
        } catch (error) {
          console.warn('[SpeedReviewRoom] Completion failed:', error);
        }

        if (completeResult?.status === 'corrected') {
          updateGameState(correctPendingRunAction(pending, completeResult));
          updateUI();
          clearPendingRunAction(pending);
          throw new Error(SPEED_REVIEW_SAVE_FAILURE_COPY);
        }

        if (completeResult?.state) {
          reconcilePendingRunAction(pending, completeResult, { refreshUi: false });
          speedReviewRoomLaunchState.roomId = null;
          updateUI();
          return;
        }

        rollbackPendingRunAction(pending);
        throw new Error(SPEED_REVIEW_SAVE_FAILURE_COPY);
      }
```

This callback is invoked only after `speed-review.js` settles all review commits, satisfying the roadmap special rule.

- [ ] **Step 3: Run focused client tests**

Run:

```bash
node --test tests/unit/ui/speed-review.test.js tests/unit/ui/optimistic-run-integration.test.js
```

Expected: PASS.

## Task 3: Verification, Roadmap Update, And Commit

**Files:**

- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-speed-review-room.md`

- [ ] **Step 1: Run roadmap-required focused gate**

Run:

```bash
npm run test:unit -- tests/unit/game/speed-review-room.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/speed-review.test.js
node --check public/js/ui/speed-review.js && node --check public/js/ui/exploration.js && node --check public/js/api.js
npm test
```

Expected: all commands PASS.

- [ ] **Step 2: Update roadmap progress**

In `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`, set Task 2.3 to:

```markdown
Status: complete
Owner: Codex
Started: 2026-06-04 19:58 JST
Completed: YYYY-MM-DD HH:MM JST
Commit: `COMMIT_SHA`
Evidence: `node --experimental-test-module-mocks --test tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `node --test tests/unit/ui/speed-review.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `npm run test:unit -- tests/unit/game/speed-review-room.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/speed-review.test.js` PASS; `node --check public/js/ui/speed-review.js && node --check public/js/ui/exploration.js && node --check public/js/api.js` PASS; `npm test` PASS. No browser session was launched because this task changed route/API/action commit behavior and source-covered retry copy, not CSS, animation, or rendering.
```

Add a Progress Log row for completion.

- [ ] **Step 3: Commit**

Run:

```bash
/usr/bin/git add src/routes/game/run.js public/js/api.js public/js/ui/exploration.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-speed-review-room.md
/usr/bin/git commit -m "feat: add optimistic speed review completion"
```
