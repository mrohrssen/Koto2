import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { createCombatRecoveryGate } from '../../../public/js/ui/combat-recovery-gate.js';

globalThis.window = {
  location: { hostname: 'localhost' },
  addEventListener: () => {},
};
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    getContext: () => ({}),
    style: {},
    classList: { add() {}, remove() {} },
  }),
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'navigator', {
  value: {},
  configurable: true,
});

let combatActive = false;
let playbackRecoveryState = 'none';
let moveSelectionRendered = false;
let consumeCalls = 0;
let startCalls = 0;
await mock.module('../../../public/js/ui/combat-loop.js', {
  namedExports: {
    getCurrentBarks: () => [],
    showAttackDisplay: () => {},
    isCombatActive: () => combatActive,
    getExploreCombatPlaybackRecoveryState: () => playbackRecoveryState,
    consumeExploreCombatPlaybackRecovery: () => {
      consumeCalls += 1;
      playbackRecoveryState = 'none';
      return true;
    },
    startCombatLoop: ({ recovery }) => {
      assert.equal(recovery, true);
      combatActive = true;
      moveSelectionRendered = true;
      startCalls += 1;
    },
  },
});

const game = await import('../../../public/game.js');

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

  it('renders move selection through the game combat phase after reload recovery was consumed', () => {
    const state = combatState('cmb_a');
    combatActive = false;
    playbackRecoveryState = 'none';
    moveSelectionRendered = false;
    consumeCalls = 0;
    startCalls = 0;
    game.updateGameState(state);

    game.updateGameContent();
    assert.equal(startCalls, 1, 'ordinary page-reload recovery should consume the owner gate');

    combatActive = false;
    playbackRecoveryState = 'ready';
    moveSelectionRendered = false;
    game.updateGameContent();

    assert.equal(consumeCalls, 1);
    assert.equal(startCalls, 2,
      'the owner-checked permit must bypass the already-consumed ordinary gate');
    assert.equal(moveSelectionRendered, true);
  });

  it('resets outside combat and treats a later combat as a fresh owner', () => {
    const gate = createCombatRecoveryGate();
    gate.markDone(combatState('cmb_a'));
    assert.equal(gate.sync(combatState('cmb_a')), true);

    assert.equal(gate.sync({ phase: 'room' }), false);
    assert.equal(gate.sync(combatState('cmb_a')), false);
  });
});
