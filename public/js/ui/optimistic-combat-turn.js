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
import {
  hasUnsafeSharedPveOptimisticPrediction,
  SANITIZABLE_PVE_BLOCKERS,
} from '../../../src/shared/combat/pve-prediction-contract.js';

const OPTIMISTIC_PVE_ACTIONS = new Set(['attack', 'defend']);
const SERVER_OWNED_TRANSCRIPT_FIELDS = new Set([
  ...SANITIZABLE_PVE_BLOCKERS,
]);

function canPredictActionCursor(state, actionType) {
  const cursor = state?.combat?.actionCursor;
  if (!cursor) return true;
  if (actionType === 'defend') {
    return cursor.side === 'ally' && Number.isInteger(cursor.index);
  }
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

function getPredictableKanjiKombatAnswerChoice(state, answerId) {
  const choice = getKanjiKombatAnswerChoice(state, answerId);
  return typeof choice?.correct === 'boolean' ? choice : null;
}

function cloneVisualSafeTranscript(value) {
  if (Array.isArray(value)) return value.map(item => cloneVisualSafeTranscript(item));
  if (!value || typeof value !== 'object') return value;

  const clone = {};
  for (const [key, child] of Object.entries(value)) {
    if (SERVER_OWNED_TRANSCRIPT_FIELDS.has(key)) continue;
    clone[key] = cloneVisualSafeTranscript(child);
  }
  return clone;
}

function addPendingCombatEndShell(localTranscript, predictedTranscript) {
  const terminal =
    predictedTranscript?.combatEnded === true
    || predictedTranscript?.allEnemiesDefeated === true
    || predictedTranscript?.allAlliesDefeated === true;
  if (!terminal) return localTranscript;

  return {
    ...localTranscript,
    pendingCombatEnd: {
      victory: predictedTranscript?.victory === true || predictedTranscript?.allEnemiesDefeated === true,
      defeat: predictedTranscript?.victory === false || predictedTranscript?.allAlliesDefeated === true,
    },
    combatEnded: false,
    allEnemiesDefeated: false,
    allAlliesDefeated: false,
  };
}

export function buildVisualSafePveLocalTranscript({ predictedTranscript, nextCombat, run }) {
  const visualTranscript = cloneVisualSafeTranscript(predictedTranscript);
  return addPendingCombatEndShell({
    ...visualTranscript,
    allies: nextCombat?.allies || [],
    enemies: nextCombat?.enemies || [],
    creatureParty: run?.creatureParty
      ? {
          ...run.creatureParty,
          active: nextCombat?.allies || run.creatureParty.active || [],
        }
      : null,
  }, predictedTranscript);
}

export function canRunOptimisticKanjiKombatAnswer(state, answerId) {
  const optimistic = state?.combat?.optimistic;
  const cursor = state?.combat?.actionCursor;
  return !!state?.combat?.active
    && state?.run?.mode === 'kanjiKombat'
    && state?.combat?.mode === 'kanjiKombat'
    && cursor?.side === 'ally'
    && Number.isInteger(cursor?.index)
    && !!getPredictableKanjiKombatAnswerChoice(state, answerId)
    && !!optimistic?.combatId
    && !!optimistic?.nextTurnSeed
    && Number.isInteger(optimistic?.stateVersion);
}

export function buildOptimisticKanjiKombatAnswer({
  state,
  answerId,
  actionId = createActionId('kanji'),
  promptRef = null,
} = {}) {
  if (!canRunOptimisticKanjiKombatAnswer(state, answerId)) return null;

  const choice = getPredictableKanjiKombatAnswerChoice(state, answerId);
  const correct = choice.correct;
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
      ...(promptRef?.promptId ? {
        promptId: promptRef.promptId,
        promptSequence: promptRef.sequence,
        cardId: promptRef.cardId,
        promptRef: {
          promptId: promptRef.promptId,
          sequence: promptRef.sequence,
          cardId: promptRef.cardId,
        },
      } : {}),
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
    resolved = state.combat.actionCursor && actionType === 'attack'
      ? resolvePveCursorTurn(
          { combat: state.combat, run: state.run, moveChoices },
          { actionType, seed },
        )
      : resolvePveTurn({
          snapshot: { combat: state.combat, run: state.run },
          actionType,
          moveChoices,
          seed,
          processKoSwaps: true,
        });
  } catch {
    return null;
  }
  if (hasUnsafeSharedPveOptimisticPrediction({
    combat: state.combat,
    transcript: resolved.transcript,
  })) return null;

  const envelope = buildActionEnvelope({
    actionId,
    combatId,
    stateVersion,
    actionType: `combat.${actionType}`,
    seed,
    payload: { actionType, moveChoices, predictionMode: PVE_CORE_PREDICTION_MODE },
    predictedTranscript: resolved.transcript,
  });
  const localTranscript = buildVisualSafePveLocalTranscript({
    predictedTranscript: resolved.transcript,
    nextCombat: resolved.nextCombat,
    run: state.run,
  });

  return {
    localTranscript,
    localNextCombat: resolved.nextCombat,
    envelope,
  };
}
