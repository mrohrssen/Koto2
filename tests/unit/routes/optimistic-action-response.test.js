import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getActionLedgerEntry } from '../../../src/game/services/action-ledger-service.js';
import {
  createOptimisticActionRunner,
  sendOptimisticActionError,
  withOptimisticActionStatus,
} from '../../../src/routes/game/optimistic-action-response.js';

const actionId = suffix => `act_test_${suffix}`;

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
      body: { actionId: actionId('one') },
      getEnrichedGameState: () => ({ phase: 'combat' }),
    };

    const response = withOptimisticActionStatus(req, { damage: 7 }, 'combat.attack');

    assert.deepEqual(response, {
      damage: 7,
      status: 'accepted',
      actionId: actionId('one'),
      actionType: 'combat.attack',
      state: { phase: 'combat' },
    });
  });

  it('sends corrected errors with authoritative state', () => {
    const req = {
      body: { actionId: actionId('bad') },
      getEnrichedGameState: () => ({ phase: 'run', hp: 3 }),
    };
    const res = makeRes();

    sendOptimisticActionError(req, res, new Error('not your turn'), 422);

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.body, {
      status: 'corrected',
      actionId: actionId('bad'),
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

  it('treats malformed action ids as legacy requests and does not record them', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    const res = makeRes();

    await runOptimisticAction({
      body: { actionId: '__proto__' },
      getEnrichedGameState: () => ({ phase: 'after' }),
      saveGame: async () => {},
    }, res, {
      actionType: 'combat.attack',
      perform: async () => ({ damage: 2 }),
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      damage: 2,
    });
    assert.equal(owner.actionLedger, undefined);
    assert.equal(getActionLedgerEntry(owner, '__proto__'), null);
  });

  it('runs a new optimistic action, records its response, and saveGame sees the ledger entry already present', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    const res = makeRes();
    let performCalls = 0;
    let saveCalls = 0;
    let savedEntry = null;
    const req = {
      body: { actionId: actionId('new') },
      getEnrichedGameState: () => ({ phase: 'after-mutation' }),
      saveGame: async () => {
        saveCalls += 1;
        savedEntry = getActionLedgerEntry(owner, actionId('new'));
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
      actionId: actionId('new'),
      actionType: 'combat.attack',
      state: { phase: 'after-mutation' },
    });
    // Stored ledger entries are slimmed: state/authoritativeState are stripped at remember-time.
    const { state: _state, ...expectedStoredResponse } = res.body;
    assert.deepEqual(savedEntry.response, expectedStoredResponse);
    assert.equal(savedEntry.actionType, 'combat.attack');
  });

  it('returns duplicate action response without running mutation again or calling saveGame, with state null when fresh enrichment is unavailable', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    const initialReq = {
      body: { actionId: actionId('repeat') },
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
      body: { actionId: actionId('repeat') },
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
    // Ledger entries are stored slimmed (no state); replay tries fresh enrichment first,
    // and falls back to null (not a stored snapshot) when that's unavailable.
    assert.deepEqual(res.body, {
      damage: 9,
      status: 'accepted',
      actionId: actionId('repeat'),
      actionType: 'combat.attack',
      state: null,
    });
  });

  it('returns corrected response for duplicate actionId with a different actionType without mutating or saving', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });

    await runOptimisticAction({
      body: { actionId: actionId('mismatch') },
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
      body: { actionId: actionId('mismatch') },
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
      actionId: actionId('mismatch'),
      reason: 'Action ID already used for another action',
      authoritativeState: { phase: 'current' },
    });
  });

  it('duplicate response refreshes state from current enriched state when available', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner: () => owner });

    await runOptimisticAction({
      body: { actionId: actionId('refresh') },
      getEnrichedGameState: () => ({ phase: 'stored' }),
      saveGame: async () => {},
    }, makeRes(), {
      actionType: 'run.proceed',
      perform: async () => ({ roomId: 'old-room' }),
    });

    const res = makeRes();
    await runOptimisticAction({
      body: { actionId: actionId('refresh') },
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
      actionId: actionId('refresh'),
      actionType: 'run.proceed',
      state: { phase: 'current' },
    });
  });

  it('removes the recorded ledger entry when saveGame fails and lets a later retry perform again', async () => {
    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    let performCalls = 0;
    const failedRes = makeRes();

    await runOptimisticAction({
      body: { actionId: actionId('savefails') },
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
      actionId: actionId('savefails'),
      reason: 'save failed',
      authoritativeState: { phase: 'after-failed-save' },
    });
    assert.equal(getActionLedgerEntry(owner, actionId('savefails')), null);

    const retryRes = makeRes();
    await runOptimisticAction({
      body: { actionId: actionId('savefails') },
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
      actionId: actionId('savefails'),
      actionType: 'combat.attack',
      state: { phase: 'after-retry-save' },
    });
  });

  it('restores game manager state when saveGame fails after a mutation', async () => {
    const runOptimisticAction = createOptimisticActionRunner({ owner: req => req.gameManager.meta });
    const res = makeRes();
    const req = {
      body: { actionId: actionId('rollback') },
      gameManager: {
        run: { currentRoom: 1, partySkills: [] },
        meta: { itemsDiscovered: [] },
        combat: { actionCount: 0 },
      },
      getEnrichedGameState() {
        return {
          run: { currentRoom: this.gameManager.run.currentRoom, partySkills: [...this.gameManager.run.partySkills] },
          meta: { itemsDiscovered: [...this.gameManager.meta.itemsDiscovered] },
          combat: { actionCount: this.gameManager.combat.actionCount },
        };
      },
      saveGame: async () => {
        throw new Error('disk unavailable');
      },
    };

    await runOptimisticAction(req, res, {
      actionType: 'test.mutate',
      perform: async () => {
        req.gameManager.run.currentRoom = 2;
        req.gameManager.run.partySkills.push({ id: 'buffMaster', level: 1 });
        req.gameManager.meta.itemsDiscovered.push('sword');
        req.gameManager.combat.actionCount = 1;
        return { ok: true };
      },
    });

    assert.equal(res.statusCode, 409);
    assert.deepEqual(req.gameManager.run, { currentRoom: 1, partySkills: [] });
    assert.deepEqual(req.gameManager.meta.itemsDiscovered, []);
    assert.deepEqual(req.gameManager.combat, { actionCount: 0 });
    assert.equal(getActionLedgerEntry(req.gameManager.meta, actionId('rollback')), null);
    assert.deepEqual(res.body, {
      status: 'corrected',
      actionId: actionId('rollback'),
      reason: 'disk unavailable',
      authoritativeState: {
        run: { currentRoom: 1, partySkills: [] },
        meta: { itemsDiscovered: [] },
        combat: { actionCount: 0 },
      },
    });
  });

  it('if getEnrichedGameState throws, accepted/corrected state fields are null, and a duplicate replay also gets null state (no stored-state fallback)', async () => {
    const req = {
      body: { actionId: actionId('throws') },
      getEnrichedGameState: () => {
        throw new Error('state unavailable');
      },
    };

    assert.deepEqual(withOptimisticActionStatus(req, { ok: true }), {
      ok: true,
      status: 'accepted',
      actionId: actionId('throws'),
      state: null,
    });

    const errorRes = makeRes();
    sendOptimisticActionError(req, errorRes, new Error('failed'));
    assert.deepEqual(errorRes.body, {
      status: 'corrected',
      actionId: actionId('throws'),
      reason: 'failed',
      authoritativeState: null,
    });

    const owner = {};
    const runOptimisticAction = createOptimisticActionRunner({ owner });
    await runOptimisticAction({
      body: { actionId: actionId('throws') },
      getEnrichedGameState: () => ({ phase: 'stored-before-throw' }),
      saveGame: async () => {},
    }, makeRes(), {
      actionType: 'test.action',
      perform: async () => ({ ok: true }),
    });

    const duplicateRes = makeRes();
    await runOptimisticAction({
      body: { actionId: actionId('throws') },
      getEnrichedGameState: () => {
        throw new Error('state unavailable');
      },
    }, duplicateRes, {
      actionType: 'test.action',
      perform: async () => {
        throw new Error('duplicate should not perform');
      },
    });

    // Stored ledger entries no longer carry state (slimmed at remember-time), so when
    // fresh enrichment also fails on replay, state is null rather than a stored snapshot.
    assert.deepEqual(duplicateRes.body, {
      ok: true,
      status: 'accepted',
      actionId: actionId('throws'),
      actionType: 'test.action',
      state: null,
    });
  });
});
