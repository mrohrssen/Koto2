import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCombatRecoveryCoordinator } from '../../../public/js/ui/combat-recovery-coordinator.js';
import {
  configureExploreSession,
  getExploreSession,
  resetExploreSession,
} from '../../../public/js/ui/explore-session.js';

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function ownerFor(state) {
  const combat = state?.combat || {};
  const currentRoom = state?.run?.currentRoom;
  const room = state?.room ?? (Number.isInteger(currentRoom) ? state?.run?.rooms?.[currentRoom] : null);
  return {
    combatId: combat.id ?? combat.combatId ?? combat.optimistic?.combatId ?? null,
    roomIndex: Number.isInteger(currentRoom) ? currentRoom : (state?.run?.currentRoomIndex ?? null),
    roomId: room?.id ?? state?.run?.currentRoomId ?? (typeof currentRoom === 'string' ? currentRoom : null),
  };
}

function makeRecoveryHarness({
  capturedCombatId = 'combat-a',
  authoritativeCombatId = capturedCombatId,
  disposedScene = false,
} = {}) {
  const fetchGate = deferred();
  const sceneGate = deferred();
  let fetchStartedResolve;
  const fetchStarted = new Promise(resolve => { fetchStartedResolve = resolve; });
  let stateRevision = 0;
  let updateCount = 0;
  let sceneSyncCount = 0;
  let finalizeCount = 0;
  let attachedStaleSprites = 0;
  let sceneMode = disposedScene ? 'unavailable' : 'complete';
  let invalidateDuringScene = null;
  const attachedSprites = [];
  let state = {
    phase: 'combat',
    room: { id: 'room-0' },
    run: { active: true, currentRoom: 0, rooms: [{ id: 'room-0' }] },
    combat: { optimistic: { combatId: capturedCombatId }, active: true, actionCursor: { side: 'ally', index: 0 } },
  };
  const authoritativeState = {
    phase: 'combat',
    room: { id: 'room-0' },
    run: { active: true, currentRoom: 0, rooms: [{ id: 'room-0' }] },
    combat: { optimistic: { combatId: authoritativeCombatId }, active: true, actionCursor: { side: 'ally', index: 1 } },
  };
  const owner = ownerFor(state);

  configureExploreSession({ syncRequest: async () => ({}) });

  function captureGameStateLease() {
    let capturedState = state;
    let capturedRevision = stateRevision;
    const lease = {
      label: 'game state',
      isCurrent: () => state === capturedState && stateRevision === capturedRevision,
      expectReplacement(merged, { transitions = [] } = {}) {
        return {
          apply: () => {
            state = merged;
            stateRevision += 1;
            updateCount += 1;
          },
          transitions: [{
            lease,
            verify: () => state === merged && stateRevision === capturedRevision + 1,
            advance: () => {
              capturedState = state;
              capturedRevision = stateRevision;
            },
          }, ...transitions],
        };
      },
    };
    return lease;
  }

  function captureCombatOwnerLease(capturedOwner) {
    let expected = { ...capturedOwner };
    const sameOwner = (left, right) => (
      left.combatId === right.combatId
      && left.roomIndex === right.roomIndex
      && left.roomId === right.roomId
    );
    const lease = {
      label: 'combat owner',
      isCurrent: () => sameOwner(ownerFor(state), expected),
      expectTransition(nextOwner) {
        return {
          lease,
          verify: () => sameOwner(ownerFor(state), nextOwner),
          advance: () => { expected = { ...nextOwner }; },
        };
      },
      currentOwner: () => ({ ...expected }),
    };
    return lease;
  }

  const coordinator = createCombatRecoveryCoordinator({
    getExploreSession,
    getState: () => state,
    captureGameStateLease,
    captureCombatOwnerLease,
    mergeAuthoritativeCombatState: (_current, { state: authoritative }) => authoritative,
    fetchAuthoritativeState: async ({ adoptSession }) => {
      assert.deepEqual({ adoptSession }, { adoptSession: true });
      fetchStartedResolve();
      return fetchGate.promise;
    },
    syncScene: async (_merged, { isCurrent }) => {
      sceneSyncCount += 1;
      if (sceneMode === 'unavailable') return false;
      if (sceneMode === 'deferred') {
        const allySprite = { attached: false };
        if (isCurrent()) {
          allySprite.attached = true;
          attachedSprites.push(allySprite);
        }
        if (invalidateDuringScene != null) {
          state = {
            ...state,
            combat: {
              ...state.combat,
              optimistic: { ...state.combat.optimistic, combatId: invalidateDuringScene },
            },
          };
          stateRevision += 1;
          sceneGate.resolve();
        }
        await sceneGate.promise;
        if (!isCurrent()) {
          for (const sprite of attachedSprites) {
            if (sprite.attached) {
              sprite.attached = false;
            }
          }
          attachedStaleSprites = attachedSprites.filter(sprite => sprite.attached).length;
          return false;
        }
      }
      if (!isCurrent()) return false;
      return true;
    },
    finalizeRecoveredCombat: () => { finalizeCount += 1; },
    isUsableRecoveredState: candidate => candidate?.phase === 'combat' && !!candidate.combat,
    getCombatOwner: ownerFor,
  });

  return {
    coordinator,
    owner,
    authoritativeState,
    fetchStarted,
    resolveFetch: () => fetchGate.resolve(authoritativeState),
    replaceExternally(combatId) {
      state = {
        ...state,
        combat: { ...state.combat, optimistic: { ...state.combat.optimistic, combatId } },
      };
      stateRevision += 1;
    },
    invalidateDuringEnemyPhase(combatId) {
      sceneMode = 'deferred';
      invalidateDuringScene = combatId;
    },
    updateCount: () => updateCount,
    sceneSyncCount: () => sceneSyncCount,
    finalizeCount: () => finalizeCount,
    attachedStaleSprites: () => attachedStaleSprites,
  };
}

afterEach(() => resetExploreSession());

describe('combat recovery coordinator', () => {
  it('ownerless and same-owner replacement adopts, syncs, and finalizes once', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: null, authoritativeCombatId: 'combat-a' });
    const recovery = harness.coordinator.recover({ actionType: 'defend', capturedOwner: harness.owner });
    harness.resolveFetch();

    const result = await recovery;
    assert.equal(result.outcome, 'null_post_state_recovered');
    assert.equal(harness.updateCount(), 1);
    assert.equal(harness.sceneSyncCount(), 1);
    assert.equal(harness.finalizeCount(), 1);
  });

  it('error-state same-owner recovery adopts through the same coordinator', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a' });
    const result = await harness.coordinator.recover({
      actionType: 'attack',
      capturedOwner: harness.owner,
      authoritativeState: harness.authoritativeState,
    });

    assert.equal(result.outcome, 'stale_error_state_recovered');
    assert.equal(harness.updateCount(), 1);
    assert.equal(harness.sceneSyncCount(), 1);
    assert.equal(harness.finalizeCount(), 1);
  });

  it('successor-owner replacement adopts once and hands off before old input work', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-b' });
    const recovery = harness.coordinator.recover({ actionType: 'defend', capturedOwner: harness.owner });
    harness.resolveFetch();

    const result = await recovery;
    assert.equal(result.outcome, 'recovery_handoff');
    assert.equal(harness.updateCount(), 1);
    assert.equal(harness.sceneSyncCount(), 0);
    assert.equal(harness.finalizeCount(), 0);
  });

  it('external replacement before adoption performs no commit', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a' });
    const recovery = harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
    await harness.fetchStarted;
    harness.replaceExternally('combat-c');
    harness.resolveFetch();

    assert.equal((await recovery).outcome, 'recovery_superseded');
    assert.equal(harness.updateCount(), 0);
    assert.equal(harness.sceneSyncCount(), 0);
    assert.equal(harness.finalizeCount(), 0);
  });

  it('replacement during scene synchronization prevents stale sprite attachment and finalization', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a' });
    harness.invalidateDuringEnemyPhase('combat-c');
    const recovery = harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
    harness.resolveFetch();

    const result = await recovery;
    assert.equal(result.outcome, 'recovery_superseded');
    assert.equal(harness.attachedStaleSprites(), 0);
    assert.equal(harness.finalizeCount(), 0);
  });

  it('disposed or unavailable scene blocks finalization after adoption', async () => {
    const harness = makeRecoveryHarness({ capturedCombatId: 'combat-a', authoritativeCombatId: 'combat-a', disposedScene: true });
    const recovery = harness.coordinator.recover({ actionType: 'attack', capturedOwner: harness.owner });
    harness.resolveFetch();

    const result = await recovery;
    assert.equal(result.outcome, 'recovery_scene_unavailable');
    assert.equal(harness.updateCount(), 1);
    assert.equal(harness.finalizeCount(), 0);
  });
});
