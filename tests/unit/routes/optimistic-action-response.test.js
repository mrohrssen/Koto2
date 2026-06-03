import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getActionLedgerEntry } from '../../../src/game/services/action-ledger-service.js';
import {
  createOptimisticActionRunner,
  sendOptimisticActionError,
  withOptimisticActionStatus,
} from '../../../src/routes/game/optimistic-action-response.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

describe('optimistic action route response helpers', () => {
  it('leaves legacy payloads unchanged without actionId', () => {
    const payload = { result: 'ok', state: { phase: 'room' } };
    const req = {
      body: {},
      getEnrichedGameState: () => ({ phase: 'newer' }),
    };

    assert.strictEqual(withOptimisticActionStatus(req, payload), payload);
  });

  it('wraps accepted payloads when actionId is present', () => {
    const req = {
      body: { actionId: 'action-1' },
      getEnrichedGameState: () => ({ phase: 'combat' }),
    };

    const response = withOptimisticActionStatus(req, { damage: 7 });

    assert.deepEqual(response, {
      damage: 7,
      status: 'accepted',
      actionId: 'action-1',
      state: { phase: 'combat' },
    });
  });

  it('sends corrected errors with authoritative state', () => {
    const req = {
      body: { actionId: 'action-bad' },
      getEnrichedGameState: () => ({ phase: 'run', hp: 3 }),
    };
    const res = makeRes();

    sendOptimisticActionError(req, res, new Error('not your turn'), 422);

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.body, {
      status: 'corrected',
      actionId: 'action-bad',
      reason: 'not your turn',
      authoritativeState: { phase: 'run', hp: 3 },
    });
  });

  it('falls back to legacy error shape without actionId', () => {
    const req = { body: {} };
    const res = makeRes();

    sendOptimisticActionError(req, res, null);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'action_failed' });
  });

  it('runner legacy errors without actionId default to HTTP 400', async () => {
    const runOptimisticAction = createOptimisticActionRunner({ owner: {} });
    const res = makeRes();

    await runOptimisticAction({
      body: {},
      saveGame: async () => {
        throw new Error('should not save');
      },
    }, res, {
      actionType: 'legacy.action',
      perform: async () => {
        throw new Error('legacy failed');
      },
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'legacy failed' });
  });

  it('runs a new optimistic action, records its response, and saveGame sees the ledger entry already present', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    const res = makeRes();
    let performCalls = 0;
    let saveCalls = 0;
    let savedEntry = null;
    const req = {
      body: { actionId: 'action-new' },
      getEnrichedGameState: () => ({ phase: 'after-mutation' }),
      saveGame: async () => {
        saveCalls += 1;
        savedEntry = getActionLedgerEntry(owner, 'action-new');
      },
    };

    await runOptimisticAction(req, res, {
      actionType: 'combat.attack',
      perform: async () => {
        performCalls += 1;
        return { damage: 5 };
      },
      successStatusCode: 201,
    });

    assert.equal(res.statusCode, 201);
    assert.equal(performCalls, 1);
    assert.equal(saveCalls, 1);
    assert.deepEqual(res.body, {
      damage: 5,
      status: 'accepted',
      actionId: 'action-new',
      state: { phase: 'after-mutation' },
    });
    assert.deepEqual(savedEntry.response, res.body);
    assert.equal(savedEntry.actionType, 'combat.attack');
  });

  it('returns duplicate action response without running mutation again and without calling saveGame', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    const initialReq = {
      body: { actionId: 'action-repeat' },
      getEnrichedGameState: () => ({ phase: 'stored' }),
      saveGame: async () => {},
    };

    await runOptimisticAction(initialReq, makeRes(), {
      actionType: 'combat.attack',
      perform: async () => ({ damage: 9 }),
    });

    const res = makeRes();
    let performCalls = 0;
    let saveCalls = 0;
    await runOptimisticAction({
      body: { actionId: 'action-repeat' },
      getEnrichedGameState: () => null,
      saveGame: async () => { saveCalls += 1; },
    }, res, {
      actionType: 'combat.attack',
      perform: async () => {
        performCalls += 1;
        return { damage: 99 };
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(performCalls, 0);
    assert.equal(saveCalls, 0);
    assert.deepEqual(res.body, {
      damage: 9,
      status: 'accepted',
      actionId: 'action-repeat',
      state: { phase: 'stored' },
    });
  });

  it('returns corrected response for duplicate actionId with a different actionType without mutating or saving', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });

    await runOptimisticAction({
      body: { actionId: 'action-mismatch' },
      getEnrichedGameState: () => ({ phase: 'stored' }),
      saveGame: async () => {},
    }, makeRes(), {
      actionType: 'combat.attack',
      perform: async () => ({ damage: 3 }),
    });

    const res = makeRes();
    let performCalls = 0;
    let saveCalls = 0;
    await runOptimisticAction({
      body: { actionId: 'action-mismatch' },
      getEnrichedGameState: () => ({ phase: 'current' }),
      saveGame: async () => { saveCalls += 1; },
    }, res, {
      actionType: 'run.proceed',
      perform: async () => {
        performCalls += 1;
        return { roomId: 'bad-replay' };
      },
    });

    assert.equal(res.statusCode, 409);
    assert.equal(performCalls, 0);
    assert.equal(saveCalls, 0);
    assert.deepEqual(res.body, {
      status: 'corrected',
      actionId: 'action-mismatch',
      reason: 'Action ID already used for another action',
      authoritativeState: { phase: 'current' },
    });
  });

  it('duplicate response refreshes state from current enriched state when available', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner: () => owner });

    await runOptimisticAction({
      body: { actionId: 'action-refresh' },
      getEnrichedGameState: () => ({ phase: 'stored' }),
      saveGame: async () => {},
    }, makeRes(), {
      actionType: 'run.proceed',
      perform: async () => ({ roomId: 'old-room' }),
    });

    const res = makeRes();
    await runOptimisticAction({
      body: { actionId: 'action-refresh' },
      getEnrichedGameState: () => ({ phase: 'current' }),
      saveGame: async () => {
        throw new Error('duplicate should not save');
      },
    }, res, {
      actionType: 'run.proceed',
      perform: async () => {
        throw new Error('duplicate should not perform');
      },
    });

    assert.deepEqual(res.body, {
      roomId: 'old-room',
      status: 'accepted',
      actionId: 'action-refresh',
      state: { phase: 'current' },
    });
  });

  it('removes the recorded ledger entry when saveGame fails and lets a later retry perform again', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    let performCalls = 0;
    const failedRes = makeRes();

    await runOptimisticAction({
      body: { actionId: 'action-save-fails' },
      getEnrichedGameState: () => ({ phase: 'after-failed-save' }),
      saveGame: async () => {
        throw new Error('save failed');
      },
    }, failedRes, {
      actionType: 'combat.attack',
      perform: async () => {
        performCalls += 1;
        return { damage: 4 };
      },
    });

    assert.equal(failedRes.statusCode, 409);
    assert.deepEqual(failedRes.body, {
      status: 'corrected',
      actionId: 'action-save-fails',
      reason: 'save failed',
      authoritativeState: { phase: 'after-failed-save' },
    });
    assert.equal(getActionLedgerEntry(owner, 'action-save-fails'), null);

    const retryRes = makeRes();
    await runOptimisticAction({
      body: { actionId: 'action-save-fails' },
      getEnrichedGameState: () => ({ phase: 'after-retry-save' }),
      saveGame: async () => {},
    }, retryRes, {
      actionType: 'combat.attack',
      perform: async () => {
        performCalls += 1;
        return { damage: 8 };
      },
    });

    assert.equal(performCalls, 2);
    assert.deepEqual(retryRes.body, {
      damage: 8,
      status: 'accepted',
      actionId: 'action-save-fails',
      state: { phase: 'after-retry-save' },
    });
  });

  it('if getEnrichedGameState throws, accepted/corrected state fields are null and duplicate fallback can use stored state', async () => {
    const req = {
      body: { actionId: 'action-throws' },
      getEnrichedGameState: () => {
        throw new Error('state unavailable');
      },
    };

    assert.deepEqual(withOptimisticActionStatus(req, { ok: true }), {
      ok: true,
      status: 'accepted',
      actionId: 'action-throws',
      state: null,
    });

    const errorRes = makeRes();
    sendOptimisticActionError(req, errorRes, new Error('failed'));
    assert.deepEqual(errorRes.body, {
      status: 'corrected',
      actionId: 'action-throws',
      reason: 'failed',
      authoritativeState: null,
    });

    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    await runOptimisticAction({
      body: { actionId: 'action-throws' },
      getEnrichedGameState: () => ({ phase: 'stored-before-throw' }),
      saveGame: async () => {},
    }, makeRes(), {
      actionType: 'test.action',
      perform: async () => ({ ok: true }),
    });

    const duplicateRes = makeRes();
    await runOptimisticAction({
      body: { actionId: 'action-throws' },
      getEnrichedGameState: () => {
        throw new Error('state unavailable');
      },
    }, duplicateRes, {
      actionType: 'test.action',
      perform: async () => {
        throw new Error('duplicate should not perform');
      },
    });

    assert.deepEqual(duplicateRes.body, {
      ok: true,
      status: 'accepted',
      actionId: 'action-throws',
      state: { phase: 'stored-before-throw' },
    });
  });
});
