import {
  buildActionEnvelope,
  createActionId,
  PVE_CORE_PREDICTION_MODE,
} from '../../../src/shared/action-protocol.js';
import { resolvePveTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import { hasPveServerOnlyFeedback } from '../../../src/shared/combat/pve-prediction-contract.js';

const OPTIMISTIC_PVE_ACTIONS = new Set(['attack', 'defend']);

export function canRunOptimisticPveTurn(state, actionType = 'attack') {
  const optimistic = state?.combat?.optimistic;
  return !!state?.combat?.active
    && OPTIMISTIC_PVE_ACTIONS.has(actionType)
    && !state?.combat?.actionCursor
    && !state?.combat?.npcId
    && !state?.combat?.npcData
    && !!optimistic?.combatId
    && !!optimistic?.nextTurnSeed
    && Number.isInteger(optimistic?.stateVersion)
    && state?.run?.mode !== 'kanjiKombat';
}

export function buildOptimisticCombatTurn({
  state,
  actionType = 'attack',
  moveChoices = [],
  actionId = createActionId('combat'),
} = {}) {
  if (!canRunOptimisticPveTurn(state, actionType)) return null;

  const combatId = state.combat.optimistic.combatId;
  const seed = state.combat.optimistic.nextTurnSeed;
  const stateVersion = state.combat.optimistic.stateVersion;
  const resolved = resolvePveTurn({
    snapshot: { combat: state.combat, run: state.run },
    actionType,
    moveChoices,
    seed,
  });
  if (hasPveServerOnlyFeedback(resolved.transcript)) return null;

  const envelope = buildActionEnvelope({
    actionId,
    combatId,
    stateVersion,
    actionType: `combat.${actionType}`,
    seed,
    payload: { actionType, moveChoices, predictionMode: PVE_CORE_PREDICTION_MODE },
    predictedTranscript: resolved.transcript,
  });
  const localTranscript = {
    ...resolved.transcript,
    allies: resolved.nextCombat?.allies || [],
    enemies: resolved.nextCombat?.enemies || [],
    creatureParty: state.run?.creatureParty
      ? {
          ...state.run.creatureParty,
          active: resolved.nextCombat?.allies || state.run.creatureParty.active || [],
        }
      : null,
  };

  return {
    localTranscript,
    localNextCombat: resolved.nextCombat,
    envelope,
  };
}
