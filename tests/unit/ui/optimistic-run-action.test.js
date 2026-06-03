import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPendingRunAction,
  confirmPendingRunAction,
  correctPendingRunAction,
  isMatchingRunActionResponse,
} from '../../../public/js/ui/optimistic-run-action.js';

describe('optimistic run action helper', () => {
  it('applies pending local state and then confirms server state', () => {
    const state = { phase: 'skillMaster', run: { skillMaster: { chosen: null } } };
    const pending = createPendingRunAction({
      state,
      actionType: 'skillMaster.choose',
      applyLocal: draft => {
        draft.run.skillMaster.chosen = 'honoo';
      },
    });

    assert.equal(pending.state.run.skillMaster.chosen, 'honoo');
    assert.equal(state.run.skillMaster.chosen, null);

    const confirmed = confirmPendingRunAction(pending, {
      status: 'accepted',
      actionId: pending.actionId,
      state: { phase: 'room', run: { skillMaster: { chosen: 'honoo' } } },
    });

    assert.equal(confirmed.phase, 'room');
  });

  it('replaces pending local state with corrected server state', () => {
    const pending = createPendingRunAction({
      state: { phase: 'skillMaster', run: { skillMaster: { chosen: null } } },
      actionType: 'skillMaster.choose',
      applyLocal: draft => {
        draft.run.skillMaster.chosen = 'bad';
      },
    });

    const corrected = correctPendingRunAction(pending, {
      status: 'corrected',
      actionId: pending.actionId,
      authoritativeState: { phase: 'skillMaster', run: { skillMaster: { chosen: null } } },
    });

    assert.equal(corrected.run.skillMaster.chosen, null);
  });

  it('rejects stale responses with mismatched or missing action ids', () => {
    const pending = createPendingRunAction({
      state: { phase: 'dealer', run: { pendingDealerPurchase: null } },
      actionType: 'dealer.buy',
      applyLocal: draft => {
        draft.run.pendingDealerPurchase = 'hinoneko';
      },
      actionId: 'run_expected',
    });

    assert.equal(isMatchingRunActionResponse(pending, { actionId: 'run_expected' }), true);
    assert.equal(isMatchingRunActionResponse(pending, { actionId: 'run_other' }), false);
    assert.equal(isMatchingRunActionResponse(pending, { status: 'accepted' }), false);

    const staleConfirmed = confirmPendingRunAction(pending, {
      status: 'accepted',
      actionId: 'run_other',
      state: { phase: 'room', run: { pendingDealerPurchase: null } },
    });
    const staleCorrected = correctPendingRunAction(pending, {
      status: 'corrected',
      actionId: 'run_other',
      authoritativeState: { phase: 'room', run: { pendingDealerPurchase: null } },
    });

    assert.equal(staleConfirmed.run.pendingDealerPurchase, 'hinoneko');
    assert.equal(staleCorrected.run.pendingDealerPurchase, null);
  });
});
