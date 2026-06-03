import {
  buildActionEnvelope,
  createActionId,
  KANJI_KOMBAT_PREDICTION_MODE,
  PVE_CORE_PREDICTION_MODE,
} from '../../../src/shared/action-protocol.js';
import {
  resolveKanjiKombatAnswerTurn,
  resolvePveCursorTurn,
  resolvePveTurn,
} from '../../../src/shared/combat/pve-turn-resolver.js';
import { hasPveServerOnlyFeedback } from '../../../src/shared/combat/pve-prediction-contract.js';

const OPTIMISTIC_PVE_ACTIONS = new Set(['attack', 'defend']);

function canPredictActionCursor(state, actionType) {
  const cursor = state?.combat?.actionCursor;
  if (!cursor) return true;
  return actionType === 'attack'
    && cursor.side === 'ally'
    && Number.isInteger(cursor.index);
}

function canPredictNpcState(state) {
  const combat = state?.combat;
  if (!combat?.npcId && !combat?.npcData) return true;
  return !!combat.actionCursor;
}

export function canRunOptimisticPveTurn(state, actionType = 'attack') {
  const optimistic = state?.combat?.optimistic;
  return !!state?.combat?.active
    && OPTIMISTIC_PVE_ACTIONS.has(actionType)
    && canPredictActionCursor(state, actionType)
    && canPredictNpcState(state)
    && !!optimistic?.combatId
    && !!optimistic?.nextTurnSeed
    && Number.isInteger(optimistic?.stateVersion)
    && state?.run?.mode !== 'kanjiKombat';
}

function getKanjiKombatAnswerChoice(state, answerId) {
  const choices = state?.run?.kanjiKombat?.currentQuiz?.choices;
  if (!Array.isArray(choices)) return null;
  return choices.find(choice => choice?.id === answerId) || null;
}

export function canRunOptimisticKanjiKombatAnswer(state, answerId) {
  const optimistic = state?.combat?.optimistic;
  const cursor = state?.combat?.actionCursor;
  return !!state?.combat?.active
    && state?.run?.mode === 'kanjiKombat'
    && state?.combat?.mode === 'kanjiKombat'
    && cursor?.side === 'ally'
    && Number.isInteger(cursor?.index)
    && !!getKanjiKombatAnswerChoice(state, answerId)
    && !!optimistic?.combatId
    && !!optimistic?.nextTurnSeed
    && Number.isInteger(optimistic?.stateVersion);
}

export function buildOptimisticKanjiKombatAnswer({
  state,
  answerId,
  actionId = createActionId('kanji'),
} = {}) {
  if (!canRunOptimisticKanjiKombatAnswer(state, answerId)) return null;

  const choice = getKanjiKombatAnswerChoice(state, answerId);
  const correct = choice?.correct === true;
  const combatId = state.combat.optimistic.combatId;
  const seed = state.combat.optimistic.nextTurnSeed;
  const stateVersion = state.combat.optimistic.stateVersion;
  let resolved;
  try {
    resolved = resolveKanjiKombatAnswerTurn(
      { combat: state.combat, run: state.run, answerCorrect: correct },
      { seed },
    );
  } catch {
    return null;
  }

  const envelope = buildActionEnvelope({
    actionId,
    combatId,
    stateVersion,
    actionType: 'kanjiKombat.answer',
    seed,
    payload: {
      answerId,
      correct,
      predictionMode: KANJI_KOMBAT_PREDICTION_MODE,
    },
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
  let resolved;
  try {
    resolved = state.combat.actionCursor
      ? resolvePveCursorTurn(
          { combat: state.combat, run: state.run, moveChoices },
          { actionType, seed },
        )
      : resolvePveTurn({
          snapshot: { combat: state.combat, run: state.run },
          actionType,
          moveChoices,
          seed,
        });
  } catch {
    return null;
  }
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
