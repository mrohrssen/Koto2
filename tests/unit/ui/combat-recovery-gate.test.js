import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCombatRecoveryGate } from '../../../public/js/ui/combat-recovery-gate.js';

function combatState(combatId) {
  return {
    phase: 'combat',
    combat: { optimistic: { combatId } },
  };
}

describe('combat recovery gate', () => {
  it('re-arms once when an authoritative correction replaces combat A with combat B', () => {
    const gate = createCombatRecoveryGate();
    let recoveryStarts = 0;

    const recoverIfNeeded = (state) => {
      if (gate.shouldRecover(state, {
        combatActive: false,
        playbackRecovery: false,
        playbackRecoveryHeld: false,
      })) {
        gate.markDone(state);
        recoveryStarts += 1;
      }
    };

    // A was already recovered after a reload, consuming its one-shot gate.
    recoverIfNeeded(combatState('cmb_a'));
    recoverIfNeeded(combatState('cmb_a'));
    assert.equal(recoveryStarts, 1);

    // Accepted playback for A then fails while a ready correction adopts B.
    // B owns a fresh recovery gate even though the phase never left combat.
    recoverIfNeeded(combatState('cmb_b'));
    recoverIfNeeded(combatState('cmb_b'));

    assert.equal(recoveryStarts, 2, 'combat B should start exactly once');
  });

  it('holds ordinary recovery behind a pending playback permit', () => {
    const gate = createCombatRecoveryGate();

    assert.equal(gate.shouldRecover(combatState('cmb_a'), {
      combatActive: false,
      playbackRecovery: false,
      playbackRecoveryHeld: true,
    }), false);
    assert.equal(gate.shouldRecover(combatState('cmb_a'), {
      combatActive: false,
      playbackRecovery: true,
      playbackRecoveryHeld: true,
    }), true);
  });

  it('resets outside combat and treats a later combat as a fresh owner', () => {
    const gate = createCombatRecoveryGate();
    gate.markDone(combatState('cmb_a'));
    assert.equal(gate.sync(combatState('cmb_a')), true);

    assert.equal(gate.sync({ phase: 'room' }), false);
    assert.equal(gate.sync(combatState('cmb_a')), false);
  });
});
