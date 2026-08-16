import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCombatPhaseRecoveryCoordinator } from '../../../public/js/ui/combat-phase-recovery-coordinator.js';
import { createCombatRecoveryGate } from '../../../public/js/ui/combat-recovery-gate.js';
import { GameManager } from '../../../src/game/loop.js';
import { createCombatState } from '../../../src/game/state.js';

const STANDARD_EXPLORE_COMBAT_STATE = {
  phase: 'combat',
  run: { active: true, mode: 'standard' },
  combat: { active: true, optimistic: { combatId: 'combat-a' } },
};

function makePhaseDependencies(overrides = {}) {
  const calls = {
    getSession: 0,
    combatActive: 0,
    playbackState: 0,
    consume: 0,
    shouldRecover: [],
    markDone: 0,
    starts: 0,
    startOptions: [],
  };
  let playbackState = overrides.playbackState ?? 'none';
  const session = overrides.session === undefined ? { isPaused: () => false } : overrides.session;
  const gate = overrides.gate ?? {
    shouldRecover: (state, options) => {
      calls.shouldRecover.push({ state, options });
      return overrides.gateShouldRecover?.(options) ?? true;
    },
    markDone: () => { calls.markDone += 1; },
  };
  const dependencies = {
    getSession: () => {
      calls.getSession += 1;
      return session;
    },
    gate,
    isCombatActive: () => {
      calls.combatActive += 1;
      return overrides.combatActive ?? false;
    },
    getPlaybackRecoveryState: () => {
      calls.playbackState += 1;
      return playbackState;
    },
    consumePlaybackRecovery: () => {
      calls.consume += 1;
      const consumed = overrides.consumePlaybackRecovery?.() ?? playbackState === 'ready';
      if (consumed) playbackState = 'none';
      return consumed;
    },
    startCombat: options => {
      calls.starts += 1;
      calls.startOptions.push(options);
      overrides.startCombat?.(options);
    },
  };
  return { dependencies, calls };
}

describe('combat phase recovery coordinator', () => {
  it('starts recovery once for active standard Explore combat', () => {
    const { dependencies, calls } = makePhaseDependencies();
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(calls.starts, 1);
    assert.equal(calls.markDone, 1);
    assert.deepEqual(calls.startOptions, [{ recovery: true }]);
    assert.deepEqual(calls.shouldRecover[0].options, {
      combatActive: false,
      playbackRecovery: false,
      playbackRecoveryHeld: false,
    });
  });

  it('starts recovery for a serialized ordinary Explore run whose mode is null', () => {
    const { dependencies, calls } = makePhaseDependencies();
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);
    const game = new GameManager();
    game.initMeta();
    game.createPlayer('RecoveryTester');
    game.startRun();
    game.run.areaSelectionRequired = false;
    game.run.initialSkillPick.chosenId = 'recovery-skill';
    game.combat = createCombatState({ id: 'enemy', hp: 10, maxHp: 10 });
    const serializedState = game.getState();

    assert.equal(serializedState.phase, 'combat');
    assert.equal(serializedState.run.mode, null);
    coordinator.handle(serializedState);

    assert.equal(calls.starts, 1);
    assert.equal(calls.markDone, 1);
    assert.deepEqual(calls.startOptions, [{ recovery: true }]);
  });

  it('does not start or consume playback for ineligible states', () => {
    const { dependencies, calls } = makePhaseDependencies({ playbackState: 'ready' });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);
    const states = [
      { ...STANDARD_EXPLORE_COMBAT_STATE, run: { active: true, mode: 'kanjiKombat' } },
      { ...STANDARD_EXPLORE_COMBAT_STATE, run: { active: true, mode: 'future-mode' } },
      { ...STANDARD_EXPLORE_COMBAT_STATE, run: { active: true } },
      { ...STANDARD_EXPLORE_COMBAT_STATE, phase: 'pvp_battle' },
      { ...STANDARD_EXPLORE_COMBAT_STATE, run: { active: false, mode: 'standard' } },
      { ...STANDARD_EXPLORE_COMBAT_STATE, combat: { active: false } },
      { ...STANDARD_EXPLORE_COMBAT_STATE, combat: null },
      { ...STANDARD_EXPLORE_COMBAT_STATE, phase: 'exploring' },
    ];

    states.forEach(state => coordinator.handle(state));

    assert.equal(calls.combatActive, 0);
    assert.equal(calls.playbackState, 0);
    assert.equal(calls.consume, 0);
    assert.equal(calls.shouldRecover.length, 0);
    assert.equal(calls.starts, 0);
  });

  it('fails closed before playback work while the Explore session is missing or paused', () => {
    for (const session of [null, {}, { isPaused: () => true }]) {
      const { dependencies, calls } = makePhaseDependencies({ session, playbackState: 'ready' });
      const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

      coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

      assert.equal(calls.playbackState, 0);
      assert.equal(calls.consume, 0);
      assert.equal(calls.shouldRecover.length, 0);
      assert.equal(calls.starts, 0);
    }
  });

  it('fails closed when the captured Explore session is replaced before playback work', () => {
    const firstSession = { isPaused: () => false };
    const replacementSession = { isPaused: () => false };
    let reads = 0;
    let playbackReads = 0;
    const coordinator = createCombatPhaseRecoveryCoordinator({
      getSession: () => (reads++ === 0 ? firstSession : replacementSession),
      gate: { shouldRecover: () => { throw new Error('gate must not be called'); } },
      isCombatActive: () => { throw new Error('combat activity must not be read'); },
      getPlaybackRecoveryState: () => { playbackReads += 1; return 'ready'; },
      consumePlaybackRecovery: () => { throw new Error('permit must not be consumed'); },
      startCombat: () => { throw new Error('combat must not start'); },
    });

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(reads, 2);
    assert.equal(playbackReads, 0);
  });

  it('does not inspect or consume a ready playback permit while combat is already active', () => {
    const { dependencies, calls } = makePhaseDependencies({ combatActive: true, playbackState: 'ready' });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(calls.playbackState, 0);
    assert.equal(calls.consume, 0);
    assert.equal(calls.shouldRecover.length, 0);
    assert.equal(calls.starts, 0);
  });

  it('ready playback recovery bypasses the consumed reload gate once', () => {
    let playbackState = 'ready';
    const gate = createCombatRecoveryGate();
    const { dependencies, calls } = makePhaseDependencies({
      gate,
      get playbackState() { return playbackState; },
      consumePlaybackRecovery: () => {
        if (playbackState !== 'ready') return false;
        playbackState = 'none';
        return true;
      },
    });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(calls.consume, 1);
    assert.equal(calls.starts, 1);
  });

  it('does not reopen ordinary recovery when ready permit consumption fails', () => {
    const { dependencies, calls } = makePhaseDependencies({
      playbackState: 'ready',
      consumePlaybackRecovery: () => false,
      gateShouldRecover: ({ playbackRecoveryHeld }) => !playbackRecoveryHeld,
    });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(calls.consume, 1);
    assert.deepEqual(calls.shouldRecover[0].options, {
      combatActive: false,
      playbackRecovery: false,
      playbackRecoveryHeld: true,
    });
    assert.equal(calls.markDone, 0);
    assert.equal(calls.starts, 0);
  });

  it('holds ordinary recovery behind a pending playback permit', () => {
    const { dependencies, calls } = makePhaseDependencies({
      playbackState: 'pending',
      gateShouldRecover: ({ playbackRecoveryHeld }) => !playbackRecoveryHeld,
    });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(calls.consume, 0);
    assert.deepEqual(calls.shouldRecover[0].options, {
      combatActive: false,
      playbackRecovery: false,
      playbackRecoveryHeld: true,
    });
    assert.equal(calls.starts, 0);
  });

  it('re-arms recovery once when the authoritative combat owner changes from A to B', () => {
    const gate = createCombatRecoveryGate();
    const { dependencies, calls } = makePhaseDependencies({ gate });
    const coordinator = createCombatPhaseRecoveryCoordinator(dependencies);
    const combatB = {
      ...STANDARD_EXPLORE_COMBAT_STATE,
      combat: { active: true, optimistic: { combatId: 'combat-b' } },
    };

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);
    coordinator.handle(combatB);
    coordinator.handle(combatB);

    assert.equal(calls.starts, 2);
  });

  it('marks the owner before a synchronously re-entrant recovery start', () => {
    const realGate = createCombatRecoveryGate();
    let marks = 0;
    const gate = {
      shouldRecover: (...args) => realGate.shouldRecover(...args),
      markDone: (...args) => {
        marks += 1;
        realGate.markDone(...args);
      },
    };
    let coordinator;
    const { dependencies, calls } = makePhaseDependencies({
      gate,
      startCombat: () => coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE),
    });
    coordinator = createCombatPhaseRecoveryCoordinator(dependencies);

    coordinator.handle(STANDARD_EXPLORE_COMBAT_STATE);

    assert.equal(marks, 1);
    assert.equal(calls.starts, 1);
  });
});
