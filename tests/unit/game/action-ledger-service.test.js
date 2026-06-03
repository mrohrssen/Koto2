import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getActionLedgerEntry,
  normalizeActionLedger,
  rememberActionLedgerResult,
} from '../../../src/game/services/action-ledger-service.js';

describe('action ledger service', () => {
  it('normalizes missing ledgers', () => {
    const owner = {};

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(ledger, { entries: {}, order: [] });
    assert.strictEqual(owner.optimisticActionLedger, ledger);
  });

  it('normalizes malformed ledgers', () => {
    const owner = {
      optimisticActionLedger: {
        entries: {
          kept: { actionId: 'kept', actionType: 'test', response: { ok: true }, recordedAt: 1 },
        },
        order: ['missing', 42, 'kept'],
      },
    };

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(ledger.order, ['kept']);
    assert.deepEqual(Object.keys(ledger.entries), ['kept']);
  });

  it('removes entries outside the normalized order', () => {
    const owner = {
      optimisticActionLedger: {
        entries: {
          kept: { actionId: 'kept', actionType: 'test', response: { ok: true }, recordedAt: 1 },
          orphan: { actionId: 'orphan', actionType: 'test', response: { ok: false }, recordedAt: 2 },
        },
        order: ['kept'],
      },
    };

    const ledger = normalizeActionLedger(owner);

    assert.deepEqual(Object.keys(ledger.entries), ['kept']);
    assert.equal(getActionLedgerEntry(owner, 'orphan'), null);
  });

  it('throws when normalizing without an owner', () => {
    assert.throws(() => normalizeActionLedger(null), /Action ledger owner is required/);
    assert.throws(() => normalizeActionLedger('owner'), /Action ledger owner is required/);
  });

  it('returns cloned ledger entries', () => {
    const owner = {};
    const response = { transcript: [{ text: 'first' }] };
    rememberActionLedgerResult(owner, {
      actionId: 'action-1',
      actionType: 'combat.attack',
      response,
    });

    const entry = getActionLedgerEntry(owner, 'action-1');
    entry.response.transcript[0].text = 'changed';

    assert.equal(getActionLedgerEntry(owner, 'action-1').response.transcript[0].text, 'first');
    assert.equal(getActionLedgerEntry(owner, ''), null);
    assert.equal(getActionLedgerEntry(owner, 'missing'), null);
  });

  it('stores cloned responses', () => {
    const owner = {};
    const response = { result: { hp: 10 }, events: ['hit'] };

    rememberActionLedgerResult(owner, {
      actionId: 'action-1',
      actionType: '',
      response,
    });
    response.result.hp = 1;
    response.events.push('changed');

    const entry = getActionLedgerEntry(owner, 'action-1');
    assert.equal(entry.actionType, 'unknown');
    assert.equal(entry.response.result.hp, 10);
    assert.deepEqual(entry.response.events, ['hit']);
    assert.equal(typeof entry.recordedAt, 'number');
  });

  it('prunes to latest 100 entries', () => {
    const owner = {};

    for (let i = 0; i < 105; i += 1) {
      rememberActionLedgerResult(owner, {
        actionId: `action-${i}`,
        actionType: 'combat.attack',
        response: { index: i },
      });
    }

    const ledger = normalizeActionLedger(owner);
    assert.equal(ledger.order.length, 100);
    assert.equal(getActionLedgerEntry(owner, 'action-0'), null);
    assert.equal(getActionLedgerEntry(owner, 'action-4'), null);
    assert.equal(getActionLedgerEntry(owner, 'action-5').response.index, 5);
    assert.equal(getActionLedgerEntry(owner, 'action-104').response.index, 104);
  });

  it('updates existing action without duplicating order entries', () => {
    const owner = {};

    rememberActionLedgerResult(owner, {
      actionId: 'action-1',
      actionType: 'combat.attack',
      response: { version: 1 },
    });
    rememberActionLedgerResult(owner, {
      actionId: 'action-1',
      actionType: 'combat.defend',
      response: { version: 2 },
    });

    const ledger = normalizeActionLedger(owner);
    assert.deepEqual(ledger.order, ['action-1']);
    assert.equal(getActionLedgerEntry(owner, 'action-1').actionType, 'combat.defend');
    assert.equal(getActionLedgerEntry(owner, 'action-1').response.version, 2);
  });

  it('returns the response without mutating invalid owners or action ids', () => {
    const response = { ok: true };
    const owner = {};

    assert.strictEqual(rememberActionLedgerResult(null, { actionId: 'action-1', response }), response);
    assert.strictEqual(rememberActionLedgerResult(owner, { actionId: '', response }), response);
    assert.equal(owner.optimisticActionLedger, undefined);
  });
});
