// tests/unit/game/action-ledger-slim.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActionLedgerEntry,
  normalizeActionLedger,
  rememberActionLedgerResult,
} from '../../../src/game/services/action-ledger-service.js';

const actionId = suffix => `act_test_${suffix}`;

describe('action ledger slimming', () => {
  it('strips state fields when remembering', () => {
    const id = actionId('remember');
    const owner = {};
    rememberActionLedgerResult(owner, {
      actionId: id,
      actionType: 'kanjiKombat.intro',
      response: { status: 'accepted', next: 'quiz', state: { huge: true }, authoritativeState: { huge: true } },
    });
    const entry = getActionLedgerEntry(owner, id);
    assert.equal(entry.response.status, 'accepted');
    assert.equal(entry.response.next, 'quiz');
    assert.equal('state' in entry.response, false);
    assert.equal('authoritativeState' in entry.response, false);
  });

  it('strips state fields from previously persisted entries on normalize', () => {
    const id = actionId('persisted');
    const owner = {
      actionLedger: {
        entries: {
          [id]: {
            actionId: id,
            actionType: 'kanjiKombat.intro',
            response: { status: 'accepted', state: { legacy: 'blob' }, authoritativeState: null },
            recordedAt: 1,
          },
        },
        order: [id],
      },
    };
    normalizeActionLedger(owner);
    assert.equal('state' in owner.actionLedger.entries[id].response, false);
    assert.equal('authoritativeState' in owner.actionLedger.entries[id].response, false);
  });
});
