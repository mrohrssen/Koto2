import { FenceContractViolation, FenceSuperseded } from '../async-ownership-fence.js';

function combatOwnerFromState(state) {
  const combat = state?.combat || {};
  const room = state?.room;
  const currentRoom = state?.run?.currentRoom;
  return {
    combatId: combat.id ?? combat.combatId ?? combat.optimistic?.combatId ?? null,
    roomIndex: room?.index ?? (Number.isInteger(currentRoom) ? currentRoom : state?.run?.currentRoomIndex ?? null),
    roomId: room?.id ?? state?.run?.currentRoomId ?? (typeof currentRoom === 'string' ? currentRoom : null),
  };
}

function isKnownSuccessor(capturedOwner, nextOwner) {
  return capturedOwner?.combatId != null
    && nextOwner?.combatId != null
    && capturedOwner.combatId !== nextOwner.combatId;
}

function failed() {
  return { recovered: false, outcome: 'recovery_failed' };
}

function superseded() {
  return { recovered: false, outcome: 'recovery_superseded' };
}

/**
 * Coordinates the two standard Explore rejected-combat recovery entries.
 * `capture()` is deliberately separate: production captures before POST or
 * verification playback can suspend, while direct unit callers may let
 * `recover()` capture immediately for an otherwise synchronous setup.
 */
export function createCombatRecoveryCoordinator({
  getExploreSession,
  getState,
  captureGameStateLease,
  captureCombatOwnerLease,
  mergeAuthoritativeCombatState,
  fetchAuthoritativeState,
  syncScene,
  finalizeRecoveredCombat,
  isUsableRecoveredState,
  getCombatOwner = combatOwnerFromState,
}) {
  function capture(capturedOwner) {
    const session = getExploreSession?.();
    if (!session?.captureFence || typeof captureGameStateLease !== 'function') return null;

    const providerLease = {
      label: 'active Explore session',
      isCurrent: () => getExploreSession?.() === session,
    };
    const stateLease = captureGameStateLease();
    const combatLease = captureCombatOwnerLease(capturedOwner);
    const sessionCapture = session.captureFence({
      pending: 'preserve',
      leases: [providerLease, stateLease, combatLease],
    });
    return {
      capturedOwner: { ...capturedOwner },
      stateLease,
      combatLease,
      fence: sessionCapture.fence,
    };
  }

  async function recover({
    actionType,
    capturedOwner,
    authoritativeState = null,
    capture: recoveryCapture = null,
    finalizeOptions = null,
  } = {}) {
    const recovery = recoveryCapture || capture(capturedOwner);
    if (!recovery) return failed();

    const { fence, stateLease, combatLease } = recovery;
    try {
      const authoritative = await fence.step(
        authoritativeState == null ? 'fetch authoritative combat state' : 'read authoritative combat state',
        () => authoritativeState == null
          ? fetchAuthoritativeState({ adoptSession: true })
          : Promise.resolve(authoritativeState),
      );
      if (!isUsableRecoveredState(authoritative)) return failed();

      const merged = mergeAuthoritativeCombatState(getState(), { state: authoritative });
      const nextOwner = getCombatOwner(merged);
      fence.commit(
        'adopt authoritative combat state',
        stateLease.expectReplacement(merged, {
          transitions: [combatLease.expectTransition(nextOwner)],
        }),
      );

      if (isKnownSuccessor(recovery.capturedOwner, nextOwner)) {
        return { recovered: true, outcome: 'recovery_handoff' };
      }

      const synced = await fence.step('sync recovered combat scene', () => (
        syncScene(merged, { isCurrent: () => fence.isCurrent() })
      ));
      if (synced !== true) return { recovered: false, outcome: 'recovery_scene_unavailable' };

      const outcome = authoritativeState == null
        ? 'null_post_state_recovered'
        : 'stale_error_state_recovered';
      const finalized = await fence.step('finalize recovered combat', () => (
        finalizeRecoveredCombat(merged, actionType, outcome, finalizeOptions)
      ));
      return finalized && typeof finalized === 'object'
        ? finalized
        : { recovered: true, outcome };
    } catch (error) {
      if (error instanceof FenceSuperseded) return superseded();
      if (error instanceof FenceContractViolation) throw error;
      return failed();
    }
  }

  function commitLocalState(recovery, nextState) {
    if (!recovery?.fence || !recovery?.stateLease || !recovery?.combatLease) {
      throw new FenceContractViolation('optimistic combat state commit requires a recovery capture');
    }
    const nextOwner = getCombatOwner(nextState);
    return recovery.fence.commit(
      'commit optimistic local combat state',
      recovery.stateLease.expectReplacement(nextState, {
        transitions: [recovery.combatLease.expectTransition(nextOwner)],
      }),
    );
  }

  return { capture, recover, commitLocalState };
}
