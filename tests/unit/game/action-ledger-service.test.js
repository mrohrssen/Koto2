import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getActionLedgerEntry,
  normalizeActionLedger,
  rememberActionLedgerResult,
} from '../../../src/game/services/action-ledger-service.js';

const actionId = suffix => `act_test_${suffix}`;

describe('action ledger service', () => {
  it('normalizes missing ledgers', () => {
    const owner = {};

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(ledger.order, []);
    assert.deepEqual(Object.keys(ledger.entries), []);
    assert.strictEqual(owner.actionLedger, ledger);
  });

  it('normalizes malformed ledgers', () => {
    const keptId = actionId('kept');
    const owner = {
      actionLedger: {
        entries: {
          [keptId]: { actionId: keptId, actionType: 'test', response: { ok: true }, recordedAt: 1 },
        },
        order: ['missing', 42, keptId],
      },
    };

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(ledger.order, [keptId]);
    assert.deepEqual(Object.keys(ledger.entries), [keptId]);
  });

  it('removes entries outside the normalized order', () => {
    const keptId = actionId('kept');
    const orphanId = actionId('orphan');
    const owner = {
      actionLedger: {
        entries: {
          [keptId]: { actionId: keptId, actionType: 'test', response: { ok: true }, recordedAt: 1 },
          [orphanId]: { actionId: orphanId, actionType: 'test', response: { ok: false }, recordedAt: 2 },
        },
        order: [keptId],
      },
    };

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(Object.keys(ledger.entries), [keptId]);
    assert.equal(getActionLedgerEntry(owner, orphanId), null);
  });

  it('migrates the previous optimisticActionLedger property to actionLedger', () => {
    const keptId = actionId('migrated');
    const owner = {
      optimisticActionLedger: {
        entries: {
          [keptId]: { actionId: keptId, actionType: 'test', response: { ok: true }, recordedAt: 1 },
        },
        order: [keptId],
      },
    };

    const ledger = normalizeActionLedger(owner);

    assert.strictEqual(owner.actionLedger, ledger);
    assert.equal(owner.optimisticActionLedger, undefined);
    assert.equal(getActionLedgerEntry(owner, keptId).response.ok, true);
  });

  it('throws when normalizing without an owner', () => {
    assert.throws(() => normalizeActionLedger(null), /Action ledger owner is required/);
    assert.throws(() => normalizeActionLedger('owner'), /Action ledger owner is required/);
  });

  it('returns cloned ledger entries', () => {
    const owner = {};
    const response = { transcript: [{ text: 'first' }] };
    const id = actionId('clone');
    rememberActionLedgerResult(owner, {
      actionId: id,
      actionType: 'combat.attack',
      response,
    });

    const entry = getActionLedgerEntry(owner, id);
    entry.response.transcript[0].text = 'changed';

    assert.equal(getActionLedgerEntry(owner, id).response.transcript[0].text, 'first');
    assert.equal(getActionLedgerEntry(owner, ''), null);
    assert.equal(getActionLedgerEntry(owner, 'missing'), null);
  });

  it('stores cloned responses', () => {
    const owner = {};
    const response = { result: { hp: 10 }, events: ['hit'] };
    const id = actionId('store');

    rememberActionLedgerResult(owner, {
      actionId: id,
      actionType: '',
      response,
    });
    response.result.hp = 1;
    response.events.push('changed');

    const entry = getActionLedgerEntry(owner, id);
    assert.equal(entry.actionType, 'unknown');
    assert.equal(entry.response.result.hp, 10);
    assert.deepEqual(entry.response.events, ['hit']);
    assert.equal(typeof entry.recordedAt, 'number');
  });

  it('prunes to latest 100 entries', () => {
    const owner = {};
    const ids = Array.from({ length: 105 }, (_, i) => actionId(String(i).padStart(3, '0')));

    for (let i = 0; i < 105; i += 1) {
      rememberActionLedgerResult(owner, {
        actionId: ids[i],
        actionType: 'combat.attack',
        response: { index: i },
      });
    }

    const ledger = normalizeActionLedger(owner);
    assert.equal(ledger.order.length, 100);
    assert.equal(getActionLedgerEntry(owner, ids[0]), null);
    assert.equal(getActionLedgerEntry(owner, ids[4]), null);
    assert.equal(getActionLedgerEntry(owner, ids[5]).response.index, 5);
    assert.equal(getActionLedgerEntry(owner, ids[104]).response.index, 104);
  });

  it('updates existing action without duplicating order entries', () => {
    const owner = {};
    const id = actionId('update');

    rememberActionLedgerResult(owner, {
      actionId: id,
      actionType: 'combat.attack',
      response: { version: 1 },
    });
    rememberActionLedgerResult(owner, {
      actionId: id,
      actionType: 'combat.defend',
      response: { version: 2 },
    });

    const ledger = normalizeActionLedger(owner);
    assert.deepEqual(ledger.order, [id]);
    assert.equal(getActionLedgerEntry(owner, id).actionType, 'combat.defend');
    assert.equal(getActionLedgerEntry(owner, id).response.version, 2);
  });

  it('returns the response without mutating invalid owners or action ids', () => {
    const response = { ok: true };
    const owner = {};

    assert.strictEqual(rememberActionLedgerResult(null, { actionId: actionId('ignored'), response }), response);
    assert.strictEqual(rememberActionLedgerResult(owner, { actionId: '', response }), response);
    assert.strictEqual(rememberActionLedgerResult(owner, { actionId: '__proto__', response }), response);
    assert.strictEqual(rememberActionLedgerResult(owner, { actionId: `run_${'x'.repeat(120)}_a`, response }), response);
    assert.equal(owner.actionLedger, undefined);
  });
});
