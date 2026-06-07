import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { renderJpSentence, renderEnFirst, getKnownWords, entityToToken } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import {
  screenShake, screenFlash, hitStop, recoil as pixiRecoil,
  lunge as pixiLunge, burstParticles, flowParticles,
} from '../pixi/effects.js';
import {
  showDamageNumber as pixiDamageNumber, popupBuff, popupDebuff, popupSkillProc,
  showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup,
  showHealPopup, showPoisonTick
} from '../pixi/text.js';
import {
  getCreatureSpriteForScene,
  showActiveGlowForScene,
  clearActiveGlowForScene,
  animateKOForScene,
  animateLevelUpForScene,
} from '../pixi/formation.js';
import { showFormation } from './combat-dom.js';
import {
  setScrollState,
  startParallax,
  BATTLE_SKY_DRIFT_SPEED,
  ROOM_TRAVEL_DURATION_MS,
  ROOM_TRAVEL_SCROLL_SPEED,
} from '../pixi/parallax.js';
import { wait } from '../pixi/tween.js';
import { playAttackSound } from './combat-audio.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { SceneDisposedError } from '../scenes/scene-errors.js';
import { BattleScene } from '../scenes/battle-scene.js';
import { ExplorationScene } from '../scenes/exploration-scene.js';
import { trackMilestone } from '../analytics.js';
import { extractGameContext, normalizeCombatOutcome } from '../analytics-core.js';

import { combatEvents } from './combat-events.js';
import {
  collectExistingEnemyKoAnimationKeys,
  collectPendingEnemyKoAnimationIndices,
  enemyKoAnimationKey,
  SC_NAMES,
  shouldFreezePostCombatTravelForNpcReward,
  shouldKeepNpcBattleSceneForReward,
  shouldSkipAttackRecord
} from './combat-ui-utils.js';
import { mergeAuthoritativeCombatState } from './combat-state-sync.js';
import {
  buildOptimisticCombatTurn,
  buildOptimisticKanjiKombatAnswer,
} from './optimistic-combat-turn.js';
import { getTutorialNarration, getBefriendWrongNarration } from './tutorial-copy.js';
import { restoreBefriendQuizEnemyUi } from './befriend-quiz-state.js';

const KANJI_KOMBAT_STREAK_REWARD_MILESTONES = new Set([3, 6, 9, 12, 15]);

function willKanjiKombatAnswerTriggerStreakReward(state, correct) {
  if (correct !== true) return false;
  const streak = Number(state?.run?.kanjiKombat?.streak || 0);
  return KANJI_KOMBAT_STREAK_REWARD_MILESTONES.has(streak + 1);
}

// ============ INTENT LOG HELPER ============
function getLog() { return window.__intentLog; }

// ============ SERVER-PROVIDED BARKS ============
let _currentRoundBarks = [];

/** Get the barks returned by the latest combat cycle response. */
export function getCurrentBarks() { return _currentRoundBarks; }

export function isKanjiKombatOpeningRevealActive() {
  return kanjiKombatOpeningRevealActive;
}

import { playDialogueAudio } from '../tts.js';
import { init as initMoveSelect, showMoves, clear as clearMoveSelect, setActiveLabel } from './move-select.js';
import { init as initTargetSelect, showEnemies, showAllies, clear as clearTargetSelect } from './target-select.js';
import { showLearnPrompt } from './move-learn.js';
import { renderButtonsAsync } from './ui-components.js';
import { playNpcSkillAnimation } from './room-transition.js';
import * as befriend from './befriend.js';
import * as vfx from './combat-vfx.js';
import * as npcDialogueUI from './npc-dialogue-ui.js';
import * as kanjiKombatUI from './kanji-kombat.js';
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
  createAttackCardContinueControl,
  showAttackCardAndWait, ATTACK_CARD_TIMING, ELEMENT_THEME,
} from './attack-card.js';

// Re-export for barrel compatibility (index.js → combatLoop.insertAttackCard)
export { insertAttackCard, waitForCardTap } from './attack-card.js';

export async function showAttackDisplay(atk, { isEnemy, sourceEl, targetEl, targetMaxHp = 100, allies: overrideAllies, enemies: overrideEnemies, onImpact }) {
  const attackCard = insertAttackCard(atk, isEnemy);
  const continueControl = attackCard ? createAttackCardContinueControl(attackCard) : null;

  playSFX('attack');
  const element = atk.moveElement || atk.attackerElement || 'neutral';

  // Resolve indices for PixiJS effects (DOM elements are kept for legacy callers)
  const attackerIndex = atk.attackerIndex ?? 0;
  const targetIndex = atk.targetIndex ?? 0;
  const sourceSide = isEnemy ? 'enemy' : 'player';
  const targetSide = atk.targetSide || (isEnemy ? 'player' : 'enemy');

  const effectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';

  if (atk.damage > 0 && (sourceEl || getCreatureSpriteForScene(getSceneManager().currentScene, sourceSide, attackerIndex))) {
    playAttackSound(element);
    if (isEnemy) {
      await vfx.enemyCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    } else {
      await vfx.fireCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    }
  }

  // Damage number on the target (already rendered by vfx.impactEffect inside the attack effect functions)

  // Stat stage change popups
  if (atk.statChangesApplied) {

    for (const [stat, change] of Object.entries(atk.statChangesApplied)) {
      if (change === 0) continue;
      const dir = change > 0 ? `+${change}` : `${change}`;
      const text = `${SC_NAMES[stat] || stat} ${dir}`;
      const pos = vfx.spritePos(targetSide, targetIndex);
      if (change > 0) popupBuff(text, pos);
      else popupDebuff(text, pos);
    }
  }

  // Party skill procs (bonus damage, heals, haste, shields)
  const resolveAllies = () => overrideAllies || getGameState()?.combat?.allies || getGameState()?.run?.creatureParty?.active || [];
  const resolveEnemies = () => overrideEnemies || getGameState()?.combat?.enemies || [];
  await vfx.showAttackPartySkillProcs(atk, {
    sourceSide,
    attackerIndex,
    targetSide,
    targetIndex,
    element,
    resolveAllies,
    resolveEnemies
  });

  // Tap to continue
  if (continueControl) {
    await continueControl.wait();
  } else {
    await vfx.effectDelay(800);
  }

  return attackCard;
}

// ============ MODULE STATE ============

// Combat state
let combatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
let playerAttackTimer = null;
let enemyAttackTimer = null;
let animatedEnemyKoKeys = new Set();
let creatureCombatRequestInFlight = false;
let kanjiKombatOpeningRevealActive = false;

// Move-based combat state
let currentCreatureIndex = 0;
let pendingMove = null;

// Callback references (set during init)
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let settings = null;
let narration = null;
let characterUI = null;

// Combat UI functions
let showDamageNumber = null;
let animateEnemyHurt = null;
let animatePlayerHurt = null;
let animateEnemyDefeat = null;
let updateActionPanel = null;
let showVictoryModal = null;
let showGameOverModal = null;
let showEnemyDialogue = null;
let getEnemyDialogueActive = null;
let getDialogueDismissPromise = null;
let showFlashCards = null;
let setCombatAnimationActive = null;
let apiCreatureCombatCycle = null;
let apiVerifyCreatureCombatCycle = null;
let apiSubmitKanjiKombatAnswer = null;
let apiGetGameState = null;
let showPostCombatShop = null;

let apiStartNpcDialogue = null;
let apiRespondNpcDialogue = null;
let showNpcSprite = null;
let hideNpcSprite = null;
let updateCreatureRowData = null;

// Utility
let delay = null;

const API_BASE = PLATFORM.apiBase;
const DEFAULT_COMBAT_SYNC_INDICATOR_DELAY_MS = 500;
let combatSyncIndicatorDelayMs = DEFAULT_COMBAT_SYNC_INDICATOR_DELAY_MS;
let activeCombatSyncToken = null;
let combatSyncTokenCounter = 0;

async function requestCreatureCombatCycle(actionType, moveChoices = []) {
  if (typeof apiCreatureCombatCycle !== 'function') {
    throw new Error('Creature combat API is not configured');
  }
  return apiCreatureCombatCycle(actionType, moveChoices);
}

async function verifyCreatureCombatCycle(envelope) {
  if (typeof apiVerifyCreatureCombatCycle !== 'function') {
    throw new Error('Creature combat verification API is not configured');
  }
  return apiVerifyCreatureCombatCycle(envelope);
}

function getCombatSyncLabel() {
  const syncingLabel = tPlain('combat.syncingTurn');
  return syncingLabel === 'combat.syncingTurn' ? 'Syncing turn...' : syncingLabel;
}

function createCombatSyncToken() {
  combatSyncTokenCounter += 1;
  return {
    id: String(combatSyncTokenCounter),
    indicatorShown: false,
  };
}

function renderCombatSyncIndicator(token) {
  if (activeCombatSyncToken !== token) return;
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const node = document.createElement('div');
  node.className = 'combat-syncing-indicator';
  node.dataset.combatSyncToken = token.id;
  node.textContent = getCombatSyncLabel();
  actionArea.replaceChildren(node);
  token.indicatorShown = true;
}

function clearCombatSyncIndicator(token) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;
  const indicator = actionArea.querySelector?.(`.combat-syncing-indicator[data-combat-sync-token="${token.id}"]`)
    || actionArea.querySelector?.('.combat-syncing-indicator');
  if (!indicator) return;
  if (indicator.dataset?.combatSyncToken && indicator.dataset.combatSyncToken !== token.id) return;
  indicator.remove();
}

function shouldLogCombatTiming() {
  return true;
}

function logCombatRequestTiming({ actionType, requestMs, indicatorShown, failed = false }) {
  if (!shouldLogCombatTiming(requestMs, failed)) return;
  console.log('[Combat Timing] request', {
    actionType,
    requestMs,
    indicatorShown,
    failed,
  });
}

function createCombatTurnTiming(actionType) {
  return {
    actionType,
    startedAt: performance.now(),
    animationStartedAt: null,
    requestMs: null,
    logged: false,
  };
}

function markCombatAnimationStart(timing, requestStartedAt) {
  timing.requestMs = Math.round(performance.now() - requestStartedAt);
  timing.animationStartedAt = performance.now();
}

function logCombatTurnTiming(timing, result, outcome, failed = false) {
  if (timing.logged) return;
  const now = performance.now();
  const requestMs = timing.requestMs ?? Math.round(now - timing.startedAt);
  const animationMs = timing.animationStartedAt
    ? Math.round(now - timing.animationStartedAt)
    : 0;
  const totalMs = Math.round(now - timing.startedAt);
  if (!shouldLogCombatTiming(totalMs, failed)) return;

  console.log('[Combat Timing] turn', {
    actionType: timing.actionType,
    requestMs,
    animationMs,
    totalMs,
    actionSegments: Array.isArray(result?.actionSegments) ? result.actionSegments.length : 0,
    playerAttacks: Array.isArray(result?.playerAttacks) ? result.playerAttacks.length : 0,
    enemyAttacks: Array.isArray(result?.enemyAttacks) ? result.enemyAttacks.length : 0,
    combatEnded: result?.combatEnded === true,
    outcome,
    failed,
  });
  timing.logged = true;
}

async function waitBeforeMoveSelection(delayMs = 0) {
  const ms = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  if (ms > 0) {
    await delay(ms);
  }
}

async function runCreatureCombatRequest(actionType, moveChoices = []) {
  if (creatureCombatRequestInFlight) return null;
  creatureCombatRequestInFlight = true;

  const startedAt = performance.now();
  const token = createCombatSyncToken();
  activeCombatSyncToken = token;
  const timer = setTimeout(() => {
    renderCombatSyncIndicator(token);
  }, combatSyncIndicatorDelayMs);

  try {
    const result = await requestCreatureCombatCycle(actionType, moveChoices);
    logCombatRequestTiming({
      actionType,
      requestMs: Math.round(performance.now() - startedAt),
      indicatorShown: token.indicatorShown,
      failed: result == null || result?.error != null,
    });
    return result;
  } catch (error) {
    logCombatRequestTiming({
      actionType,
      requestMs: Math.round(performance.now() - startedAt),
      indicatorShown: token.indicatorShown,
      failed: true,
    });
    throw error;
  } finally {
    clearTimeout(timer);
    clearCombatSyncIndicator(token);
    if (activeCombatSyncToken === token) {
      activeCombatSyncToken = null;
    }
    creatureCombatRequestInFlight = false;
  }
}

function isUsableRecoveredState(state) {
  return !!state && state.transient !== true && !state.error;
}

function isRecoveredCombatActive(state) {
  return state?.phase === 'combat' && !!state?.combat && state.combat.active !== false;
}

function resetCombatRecoveryPendingFlag(actionType) {
  if (actionType === 'attack') {
    playerAttackPending = false;
  } else if (actionType === 'defend') {
    enemyAttackPending = false;
  }
}

function finishRecoveredCombatState(mergedState, actionType, outcome, options = {}) {
  resetCombatRecoveryPendingFlag(actionType);
  combatActive = isRecoveredCombatActive(mergedState);

  if (combatActive) {
    const restartSelection = options.restartSelection || startMoveSelection;
    restartSelection();
  } else {
    updateUI?.();
  }

  return {
    recovered: true,
    outcome,
    combatActive,
  };
}

function recoverFromCombatErrorState(result, actionType, options = {}) {
  if (!result?.state) {
    return { recovered: false, outcome: 'recovery_failed', combatActive };
  }

  const merged = mergeAuthoritativeCombatState(getGameState(), result);
  updateGameState(merged);
  return finishRecoveredCombatState(merged, actionType, 'stale_error_state_recovered', options);
}

async function recoverFromNullCombatPost(actionType, options = {}) {
  if (typeof apiGetGameState !== 'function') {
    return { recovered: false, outcome: 'recovery_failed', combatActive };
  }

  let fetchedState = null;
  try {
    fetchedState = await apiGetGameState();
  } catch (error) {
    console.warn('[CombatLoop] Combat recovery state fetch failed:', error?.message || error);
    return { recovered: false, outcome: 'recovery_failed', combatActive };
  }

  if (!isUsableRecoveredState(fetchedState)) {
    return { recovered: false, outcome: 'recovery_failed', combatActive };
  }

  const merged = mergeAuthoritativeCombatState(getGameState(), { state: fetchedState });
  updateGameState(merged);
  return finishRecoveredCombatState(merged, actionType, 'null_post_state_recovered', options);
}

async function handleOptimisticCombatVerification(verification, recoveryActionType = 'attack') {
  if (!verification) {
    return recoverFromNullCombatPost(recoveryActionType);
  }

  if (verification.status === 'accepted') {
    const state = getGameState();
    if (!state?.combat) return { recovered: true, outcome: 'optimistic_accepted', combatActive };
    const merged = mergeAuthoritativeCombatState(state, verification);
    updateGameState({
      ...merged,
      combat: {
        ...merged.combat,
        optimistic: {
          ...(merged.combat.optimistic || {}),
          stateVersion: verification.stateVersion,
          nextTurnSeed: verification.nextSeed,
        },
      },
    });
    return { recovered: true, outcome: 'optimistic_accepted', combatActive };
  }

  if (verification.status === 'corrected') {
    const authoritativeState = verification.authoritativeState || verification.state;
    if (authoritativeState) {
      updateGameState(authoritativeState);
      updateUI?.();
      return { recovered: true, outcome: verification.reason || 'optimistic_corrected', combatActive };
    }
    return recoverFromNullCombatPost(recoveryActionType);
  }

  return { recovered: false, outcome: 'unexpected_optimistic_status', combatActive };
}

function buildOptimisticCreatureCombatRequest(actionType, moveChoices = []) {
  if (typeof apiVerifyCreatureCombatCycle !== 'function') return null;
  return buildOptimisticCombatTurn({ state: getGameState(), actionType, moveChoices });
}

function hasKanjiKombatPromptRef(promptRef) {
  return !!promptRef && typeof promptRef === 'object' && Object.keys(promptRef).length > 0;
}

function matchesKanjiKombatPromptRef(prompt, promptRef = {}) {
  if (!prompt || prompt.kind !== 'quiz' || !hasKanjiKombatPromptRef(promptRef)) return false;
  if (Object.hasOwn(promptRef, 'promptId') && prompt.promptId !== promptRef.promptId) return false;
  if (Object.hasOwn(promptRef, 'sequence') && prompt.sequence !== promptRef.sequence) return false;
  const cardId = prompt.cardId || prompt.quiz?.cardId || null;
  if (Object.hasOwn(promptRef, 'cardId') && cardId !== promptRef.cardId) return false;
  return true;
}

function getBufferedKanjiKombatQuizPrompt(state, promptRef = {}) {
  const buffer = state?.run?.kanjiKombat?.promptBuffer;
  if (!Array.isArray(buffer)) return null;
  const prompt = buffer[0] || null;
  return matchesKanjiKombatPromptRef(prompt, promptRef) ? prompt : null;
}

function stateWithBufferedKanjiKombatQuiz(state, promptRef = {}) {
  const bufferedPrompt = getBufferedKanjiKombatQuizPrompt(state, promptRef);
  if (!bufferedPrompt?.quiz) return state;
  const run = state?.run || {};
  const kk = run.kanjiKombat || {};
  return {
    ...state,
    run: {
      ...run,
      kanjiKombat: {
        ...kk,
        currentQuiz: bufferedPrompt.quiz,
      },
    },
  };
}

function buildOptimisticKanjiKombatRequest(answerId, promptRef = {}) {
  if (typeof apiSubmitKanjiKombatAnswer !== 'function') return null;
  const state = stateWithBufferedKanjiKombatQuiz(getGameState(), promptRef);
  return buildOptimisticKanjiKombatAnswer({ state, answerId });
}

function withKanjiKombatPromptRef(request, promptRef = {}) {
  if (!hasKanjiKombatPromptRef(promptRef)) return request;
  if (request && typeof request === 'object') {
    return {
      ...request,
      payload: {
        ...(request.payload || {}),
        promptRef,
      },
    };
  }
  return { answerId: request, payload: { promptRef } };
}

async function runOptimisticCreatureCombatTurn({
  actionType,
  moveChoices = [],
  turnTiming,
  recoveryActionType = actionType,
  playback,
  pendingFlag = 'player',
  nextSelectionDelayMs = 0,
  startMoveSelection: restartMoveSelection = startMoveSelection,
  stopCombatLoop: finishCombatLoop = stopCombatLoop,
  getEnemyDialogueActive: isEnemyDialogueActive = getEnemyDialogueActive,
} = {}) {
  const optimistic = buildOptimisticCreatureCombatRequest(actionType, moveChoices);
  if (!optimistic) return false;

  const hasPendingCombatEnd = !!optimistic.localTranscript?.pendingCombatEnd;
  const requestStartedAt = performance.now();
  const verificationPromise = verifyCreatureCombatCycle(optimistic.envelope)
    .then(result => ({ result }), error => ({ error }));
  markCombatAnimationStart(turnTiming, requestStartedAt);
  await playback(optimistic.localTranscript);

  const verification = await verificationPromise;
  if (verification.error) throw verification.error;
  const result = verification.result;
  const recovery = await handleOptimisticCombatVerification(result, recoveryActionType);
  if (recovery && recovery.recovered === false) {
    throw new Error('Combat sync failed');
  }

  if (pendingFlag === 'enemy') {
    enemyAttackPending = false;
  } else {
    playerAttackPending = false;
  }
  combatActive = isRecoveredCombatActive(getGameState());

  if (result?.status === 'accepted' && result?.combatEnded === true) {
    const terminalOutcome = hasPendingCombatEnd
      ? (result.victory ? 'pending_optimistic_victory' : 'pending_optimistic_defeat')
      : (result.victory ? 'victory' : 'defeat');
    logCombatTurnTiming(turnTiming, result, terminalOutcome);
    await finishCombatLoop(result);
    return true;
  }

  logCombatTurnTiming(turnTiming, result, recovery?.outcome || 'optimistic_verified');
  const enemyDialogueActive = typeof isEnemyDialogueActive === 'function' && isEnemyDialogueActive();
  if (combatActive && isRecoveredCombatActive(getGameState()) && !enemyDialogueActive) {
    await waitBeforeMoveSelection(nextSelectionDelayMs);
    restartMoveSelection();
  }
  return true;
}

async function runOptimisticKanjiKombatAnswer({
  answerId,
  promptRef = {},
  turnTiming,
  recoveryActionType = 'attack',
  nextSelectionDelayMs = 0,
  playback = playCreatureCombatResult,
  startMoveSelection: restartMoveSelection = startMoveSelection,
  stopCombatLoop: finishCombatLoop = stopCombatLoop,
  getEnemyDialogueActive: isEnemyDialogueActive = getEnemyDialogueActive,
} = {}) {
  const optimistic = buildOptimisticKanjiKombatRequest(answerId, promptRef);
  if (!optimistic) return false;

  const requestStartedAt = performance.now();
  const verificationPromise = apiSubmitKanjiKombatAnswer(withKanjiKombatPromptRef(optimistic.envelope, promptRef))
    .then(result => ({ result }), error => ({ error }));
  markCombatAnimationStart(turnTiming, requestStartedAt);
  const waitForStreakRewardBanner = willKanjiKombatAnswerTriggerStreakReward(
    getGameState(),
    optimistic.localTranscript.kanjiAnswerCorrect
  );
  if (!waitForStreakRewardBanner) {
    void vfx.showKanjiKombatAnswerBanner(optimistic.localTranscript.kanjiAnswerCorrect);
  }
  await playback(optimistic.localTranscript, turnTiming, {
    choices: [],
    logMoveIntent: false,
    nextSelectionDelayMs,
    skipAttackCards: true,
    deferNextSelection: true,
  });

  const verification = await verificationPromise;
  if (verification.error) {
    const recovery = await recoverFromNullCombatPost(recoveryActionType, {
      restartSelection: restartMoveSelection,
    });
    logCombatTurnTiming(turnTiming, null, recovery.outcome, !recovery.recovered);
    if (recovery.recovered) return true;
    throw verification.error;
  }
  const result = verification.result;
  const recovery = await handleOptimisticCombatVerification(result, recoveryActionType);
  if (recovery && recovery.recovered === false) {
    throw new Error('Combat sync failed');
  }
  const pendingMoveLearn = showXpEvents(result?.xpEvents);
  if (pendingMoveLearn?.length) {
    await processPendingMoveLearn(pendingMoveLearn);
  }
  if (result?.kanjiStreakReward || waitForStreakRewardBanner) {
    await syncKanjiKombatStreakRewardVisuals(result);
    void vfx.showKanjiKombatAnswerBanner(result?.kanjiAnswerCorrect, result?.kanjiStreakReward || null);
  }

  playerAttackPending = false;
  combatActive = isRecoveredCombatActive(getGameState());
  if (result?.nextWave) {
    await playKanjiKombatNextWaveTransition(result);
    animatedEnemyKoKeys = collectExistingEnemyKoAnimationKeys(getGameState()?.combat?.enemies || []);
  }
  if (result?.combatEnded || !combatActive) {
    await finishCombatLoop(result || { combatEnded: true, victory: false });
    return true;
  }
  const enemyDialogueActive = typeof isEnemyDialogueActive === 'function' && isEnemyDialogueActive();
  if (combatActive && isRecoveredCombatActive(getGameState()) && !enemyDialogueActive) {
    await waitBeforeMoveSelection(nextSelectionDelayMs);
    restartMoveSelection();
  }
  return true;
}

export const __combatNetworkTest = {
  setCreatureCombatApi(fn) {
    apiCreatureCombatCycle = fn;
    apiVerifyCreatureCombatCycle = null;
    apiSubmitKanjiKombatAnswer = null;
    creatureCombatRequestInFlight = false;
    activeCombatSyncToken = null;
    apiGetGameState = null;
    playerAttackPending = false;
    enemyAttackPending = false;
  },
  setVerifyCreatureCombatApi(fn) {
    apiVerifyCreatureCombatCycle = fn;
  },
  setKanjiKombatAnswerApi(fn) {
    apiSubmitKanjiKombatAnswer = fn;
  },
  setStateAccessors({ get, update, fetchServerState } = {}) {
    getGameState = typeof get === 'function' ? get : getGameState;
    updateGameState = typeof update === 'function' ? update : updateGameState;
    apiGetGameState = typeof fetchServerState === 'function' ? fetchServerState : apiGetGameState;
  },
  resetPendingFlags() {
    playerAttackPending = false;
    enemyAttackPending = false;
  },
  setSyncIndicatorDelayMs(ms) {
    combatSyncIndicatorDelayMs = ms;
  },
  requestCreatureCombatCycle,
  verifyCreatureCombatCycle,
  buildOptimisticCreatureCombatRequest,
  buildOptimisticKanjiKombatRequest,
  runCreatureCombatRequest,
  recoverFromCombatErrorState,
  recoverFromNullCombatPost,
  handleOptimisticCombatVerification,
  runOptimisticCreatureCombatTurn,
  runOptimisticKanjiKombatAnswer,
  setCombatActive(value) {
    combatActive = value === true;
  },
  isCombatActive() {
    return combatActive;
  },
};

/** Wrap an async combat animation sequence with the animation-active guard. */
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    return await fn();
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
}

/** Get NPC data from current combat state */
function getCombatNpcData() {
  const state = getGameState();
  return state?.combat?.npcData || null;
}

/** Get current enemy creatures for re-rendering after NPC skill animation */
function getCombatEnemies() {
  const state = getGameState();
  return state?.combat?.enemies || [];
}

/**
 * Initialize the combat loop UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  settings = callbacks.settings;
  narration = callbacks.narration;
  characterUI = callbacks.characterUI;

  // Combat UI functions
  showDamageNumber = callbacks.showDamageNumber;
  animateEnemyHurt = callbacks.animateEnemyHurt;
  animatePlayerHurt = callbacks.animatePlayerHurt;
  animateEnemyDefeat = callbacks.animateEnemyDefeat;
  updateActionPanel = callbacks.updateActionPanel;
  showVictoryModal = callbacks.showVictoryModal;
  showGameOverModal = callbacks.showGameOverModal;
  showEnemyDialogue = callbacks.showEnemyDialogue;
  getEnemyDialogueActive = callbacks.getEnemyDialogueActive;
  getDialogueDismissPromise = callbacks.getDialogueDismissPromise;
  showFlashCards = callbacks.showFlashCards;

  // Utility
  delay = callbacks.delay;
  setCombatAnimationActive = callbacks.setCombatAnimationActive;
  apiCreatureCombatCycle = callbacks.apiCreatureCombatCycle;
  apiVerifyCreatureCombatCycle = callbacks.apiVerifyCreatureCombatCycle;
  apiSubmitKanjiKombatAnswer = callbacks.apiSubmitKanjiKombatAnswer;
  apiGetGameState = callbacks.apiGetGameState;
  showPostCombatShop = callbacks.showPostCombatShop;
  apiStartNpcDialogue = callbacks.apiStartNpcDialogue;
  apiRespondNpcDialogue = callbacks.apiRespondNpcDialogue;
  showNpcSprite = callbacks.showNpcSprite;
  hideNpcSprite = callbacks.hideNpcSprite;
  updateCreatureRowData = callbacks.updateCreatureRowData;

  // Initialize extracted befriend module with coordinator deps
  befriend.init({
    getGameState: () => getGameState(),
    updateGameState: (s) => updateGameState(s),
    updateUI: () => updateUI(),
    isCombatActive: () => combatActive,
    setCombatActive: (v) => { combatActive = v; },
    getCurrentCreatureIndex: () => currentCreatureIndex,
    setCurrentCreatureIndex: (i) => { currentCreatureIndex = i; },
    withAnimationActive,
    startMoveSelection,
    promptNextCreature,
    stopCombatLoop,
    narration,
    delay,
    characterUI,
    showGameOverModal,
    updateCreatureRowData,
    syncFinalState,
    showOneEnemyAttackAnimated: vfx.showOneEnemyAttackAnimated,
    buildAllyHpMap: vfx.buildAllyHpMap,
    updateCreatureHpBars: vfx.updateCreatureHpBars,
    spritePos: vfx.spritePos,
    apiBefriendReplace: callbacks.apiBefriendReplace,
    apiGetBefriendConversation: callbacks.apiGetBefriendConversation,
    apiSubmitBefriendAnswer: callbacks.apiSubmitBefriendAnswer,
  });

  vfx.init({
    getGameState: () => getGameState(),
    delay,
    characterUI,
    animatePlayerHurt,
    showDamageNumber,
  });

  npcDialogueUI.init({
    narration,
    delay,
    showNpcSprite,
    hideNpcSprite,
    updateUI: () => updateUI(),
    updateGameState: (s) => updateGameState(s),
    apiStartNpcDialogue,
    apiRespondNpcDialogue,
  });
}

// Re-export NPC dialogue for barrel compatibility
export const showNpcGreeting = (...args) => npcDialogueUI.showNpcGreeting(...args);
export const isNpcDialogueActive = () => npcDialogueUI.isNpcDialogueActive();
export const runNpcDialogue = (...args) => npcDialogueUI.runNpcDialogue(...args);

/**
 * Initialize move/target selection UI callbacks.
 * Called by game.js after combatLoop.init().
 */
export function initMoveUI() {
  initMoveSelect({
    onMoveSelectCb: handleMoveSelected,
    onItemsOpenCb: () => {
      console.log('[combat] Items button pressed — not yet implemented');
    },
    onMoveHelpCb: (move) => {
      // Remove existing popup
      document.querySelector('.move-help-backdrop')?.remove();
      document.querySelector('.move-help-popup')?.remove();

      const STATUS_LABELS = {
        poison: 'Poison', stun: 'Stun', confuse: 'Confuse',
        shield: 'Shield', team_shield: 'Team Shield',
        haste: 'Haste'
      };
      const CAT_LABELS = {
        damage: 'Attack', drain: 'Drain', heal: 'Heal',
        shield: 'Shield', buff: 'Buff', debuff: 'Debuff'
      };

      const TARGET_LABELS = {
        single_enemy: 'Single Target', all_enemies: 'All Targets',
        self: 'Self', single_ally: 'Single Ally', all_allies: 'All Allies',
        enemy: 'Single Target'
      };

      let statsHtml = '';
      statsHtml += `<span class="mhp-stat">${CAT_LABELS[move.category] || move.category}</span>`;
      if (move.power > 0) statsHtml += `<span class="mhp-stat">Power ${move.power}</span>`;
      statsHtml += `<span class="mhp-stat">${move.mpCost} MP</span>`;
      if (move.element) statsHtml += `<span class="mhp-stat">${move.element}</span>`;
      if (move.statChanges) {
        for (const [stat, amount] of Object.entries(move.statChanges)) {
          const dir = amount > 0 ? `+${amount}` : `${amount}`;
          statsHtml += `<span class="mhp-stat">${SC_NAMES[stat] || stat} ${dir}</span>`;
        }
      }
      if (move.statusEffect) {
        const label = STATUS_LABELS[move.statusEffect] || move.statusEffect;
        const dur = move.statusDuration ? ` ${move.statusDuration}T` : '';
        statsHtml += `<span class="mhp-stat">${label}${dur}</span>`;
      }
      if (move.target && move.target !== 'enemy') {
        statsHtml += `<span class="mhp-stat">${TARGET_LABELS[move.target] || move.target}</span>`;
      }

      const moveNameHtml = renderJpSentence([entityToToken(move)], getKnownWords(), new Map());
      const descHtml = move.descriptionTagged
        ? renderEnFirst(move.descriptionTagged)
        : (move.description || '');

      const backdrop = document.createElement('div');
      backdrop.className = 'move-help-backdrop';

      const popup = document.createElement('div');
      popup.className = 'move-help-popup';
      popup.innerHTML = `
        <div class="mhp-name">${moveNameHtml}</div>
        <div class="mhp-stats">${statsHtml}</div>
        ${descHtml ? `<div class="mhp-desc">${descHtml}</div>` : ''}
      `;

      const dismiss = () => {
        backdrop.remove();
        popup.remove();
      };
      backdrop.addEventListener('click', dismiss);
      popup.addEventListener('click', dismiss);

      document.body.appendChild(backdrop);
      document.body.appendChild(popup);
    }
  });
  initTargetSelect({
    onTargetSelectCb: handleTargetSelected,
    onCancelCb: handleTargetCancelled
  });
}

/**
 * Start move selection for a new turn.
 * Replaces the old pauseForNextVocab flow for creature combat.
 */
export function startMoveSelection() {
  const state = getGameState();
  const cursor = state.combat?.actionCursor;
  if (!cursor || cursor.side !== 'ally') {
    clearMoveSelect();
    clearTargetSelect();
    clearActiveGlowForScene(getSceneManager().currentScene);
    return;
  }
  currentCreatureIndex = cursor.index;
  promptNextCreature();
}

export function getFirstCombatMoveTutorialOpts(state, creature, currentCreatureIndex) {
  if (state?.phase !== 'combat') return {};
  if (state?.meta?.tutorialStep !== 1) return {};
  if (state?.run?.currentArea?.id !== 'hajimari-no-hiroba') return {};
  if ((state?.run?.currentRoom ?? -1) !== 0) return {};
  const cursor = state?.combat?.actionCursor;
  if ((state?.combat?.actionCount ?? 0) !== 0) return {};
  if (cursor?.side !== 'ally') return {};
  if (currentCreatureIndex !== 0) return {};
  if (cursor?.index !== currentCreatureIndex) return {};
  if (creature?.id !== 'hi') return {};
  if (!creature?.moves?.some(move => move?.id === 'honoo')) return {};

  return {
    tutorialMoveId: 'honoo',
    tutorialHintText: 'Tap here!',
    lockToTutorialMove: true
  };
}

function promptNextCreature() {
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];
  const cursor = state.combat?.actionCursor;
  if (!cursor || cursor.side !== 'ally') {
    clearMoveSelect();
    clearTargetSelect();
    clearActiveGlowForScene(getSceneManager().currentScene);
    return;
  }

  currentCreatureIndex = cursor.index;
  const creature = allies[currentCreatureIndex];
  if (!creature || creature.hp <= 0) {
    clearMoveSelect();
    clearTargetSelect();
    clearActiveGlowForScene(getSceneManager().currentScene);
    return;
  }

  clearTargetSelect();
  setActiveLabel(creature);
  showActiveGlowForScene(getSceneManager().currentScene, currentCreatureIndex);
  if (state.run?.mode === 'kanjiKombat') {
    if (kanjiKombatUI.startKanjiKombatOnboardingIfNeeded(state)) return;
    if (kanjiKombatUI.renderKanjiKombatAction(state)) return;
  }
  showMoves(creature, currentCreatureIndex, {
    ...befriend.getMoveSelectBefriendOpts(currentCreatureIndex),
    ...getFirstCombatMoveTutorialOpts(state, creature, currentCreatureIndex)
  });
}

function submitCursorAction(choice) {
  clearActiveGlowForScene(getSceneManager().currentScene);
  executeCreatureMovesTurn([choice]);
}

export async function submitKanjiKombatAnswer(answerId, promptRef = {}) {
  if (typeof apiSubmitKanjiKombatAnswer !== 'function') {
    throw new Error('Kanji Kombat answer API is not configured');
  }
  await executeCreatureMovesTurn([], {
    actionType: 'kanjiKombat',
    kanjiAnswerId: answerId,
    kanjiPromptRef: promptRef,
    request: () => apiSubmitKanjiKombatAnswer(withKanjiKombatPromptRef(answerId, promptRef)),
    describeIntent: () => `Kanji Kombat answer: ${answerId}`,
  });
  return { handledByCombatLoop: true };
}

function handleMoveSelected(move, creatureIndex) {
  clearActiveGlowForScene(getSceneManager().currentScene);

  // Rest pseudo-move: no target selection.
  if (move.isRest) {
    submitCursorAction({ creatureIndex: currentCreatureIndex, action: 'rest' });
    return;
  }

  pendingMove = move;
  const state = getGameState();

  if (move.target === 'single_enemy') {
    const enemies = state.combat?.enemies || [];
    const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
    if (alive.length === 0) {
      // No valid targets — submit with no target.
      submitCursorAction({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
      return;
    }
    if (alive.length === 1) {
      // Single target — auto-select, skip UI.
      const autoIdx = enemies.indexOf(alive[0]);
      submitCursorAction({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: autoIdx });
      return;
    }
    showEnemies(enemies, move);
  } else if (move.target === 'single_ally') {
    showAllies(state.combat?.allies || state.run?.creatureParty?.active || [], move);
  } else {
    // AoE or self -- no target needed, targetIndex -1
    submitCursorAction({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
  }
}

function handleTargetSelected(targetIndex) {
  const choice = { creatureIndex: currentCreatureIndex, moveId: pendingMove.id, targetIndex };
  pendingMove = null;
  submitCursorAction(choice);
}

function handleTargetCancelled() {
  // Go back to move selection for this creature
  pendingMove = null;
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];
  const creature = allies[currentCreatureIndex];
  if (creature) {
    clearTargetSelect();
    setActiveLabel(creature);
    showActiveGlowForScene(getSceneManager().currentScene, currentCreatureIndex);
    showMoves(creature, currentCreatureIndex, befriend.getMoveSelectBefriendOpts(currentCreatureIndex));
  }
}

function handleDefendSelected() {
  // Execute defend turn immediately (all creatures defend)
  executeCreatureDefendThenPause();
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Check if combat loop is active
 * @returns {boolean}
 */
export function isCombatActive() {
  return combatActive;
}

/**
 * Check if combat is paused for vocab review
 * @returns {boolean}
 */
export function isCombatPausedForVocab() {
  return combatPausedForVocab;
}

/**
 * Cleanup combat state without showing results (for returnToHub)
 */
export function cleanupCombat() {
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }
  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];
  animatedEnemyKoKeys = new Set();
  // PIXI status label cleanup is handled by BattleScene.beforeExit via
  // registry disposal when we transition to ExplorationScene.
}

/**
 * Pause combat and show next move selection (for use after external actions like swaps).
 * In move-based combat, this starts the move selection grid instead of flashcards.
 */
export function pauseForNextVocab() {
  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;
  if (isCreatureCombat) {
    startMoveSelection();
  }
}

/**
 * Find a creature slot element by creature ID (matches against game state).
 * Works for both allied creature slots (attacker) and targeted creature slots.
 * @param {string} creatureId - The creature's ID
 * @returns {Element|null} The .formation-slot DOM element, or null
 */
// ============ XP EVENT HANDLING ============

/**
 * Process xpEvents from the backend and show animated XP popups over creature slots.
 * Also handles level-up popups and updates the level badge in the DOM.
 * @param {Array} xpEvents - Array of { xpGrants: [...], levelUps: [...] }
 */
function showXpEvents(xpEvents) {
  const pendingMoveLearn = [];
  if (!xpEvents || xpEvents.length === 0) return pendingMoveLearn;

  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return pendingMoveLearn;

  const slots = document.querySelectorAll('#player-formation .formation-slot');

  for (const event of xpEvents) {
    // Show XP popups for each creature that gained XP
    if (event.xpGrants) {
      for (const grant of event.xpGrants) {
        const index = activeCreatures.findIndex(r => r && r.id === grant.creatureId);
        if (index >= 0 && slots[index]) {
          pixiXpPopup(grant.xp, vfx.spritePos('player', index));
        }
      }
    }

    // Show level-up popups
    if (event.levelUps) {
      for (const lu of event.levelUps) {
        const index = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
        if (index >= 0 && slots[index]) {
          // Slight delay so it appears after XP popup
          setTimeout(() => pixiLevelUpPopup(lu.newLevel, vfx.spritePos('player', index)), 400);
          // PixiJS level-up burst + flash
          setTimeout(() => animateLevelUpForScene(getSceneManager().currentScene, 'player', index), 400);
        }
        // Collect move learns for later processing
        if (lu.newMove) {
          const creature = activeCreatures.find(r => r && r.id === lu.creatureId);
          if (creature) {
            const creatureIdx = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
            pendingMoveLearn.push({ creature, creatureIndex: creatureIdx, newMove: lu.newMove });
          }
        }
      }
    }
  }

  return pendingMoveLearn;
}

/**
 * Process pending move-learn prompts after combat state sync.
 * For each pending item, checks if the move was auto-learned (already in moves array)
 * or needs replacement (creature has 4 moves). Shows UI prompt and calls backend API.
 * @param {Array} pendingList - Array of { creature, creatureIndex, newMove }
 */
async function processPendingMoveLearn(pendingList) {
  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return;

  for (const item of pendingList) {
    // Re-read creature from synced state (may have been updated by syncFinalState)
    const creature = activeCreatures.find(r => r && r.id === item.creature.id);
    if (!creature) continue;
    const creatureIndex = activeCreatures.findIndex(r => r && r.id === item.creature.id);

    // Check if move was auto-learned (already in creature's moves after state sync)
    const alreadyLearned = creature.moves?.some(m => m.id === item.newMove.id);

    // Pass alreadyLearned flag so the prompt shows the right UI
    // (after syncFinalState, auto-added moves make creature.moves.length == 3)
    const result = await showLearnPrompt(creature, creatureIndex, item.newMove, alreadyLearned);

    if (result.action === 'skip') {
      continue;
    }

    if (result.action === 'replace') {
      // Call backend to replace the move
      const response = await fetch(`${API_BASE}/api/game/learn-move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          creatureIndex: creatureIndex,
          newMoveId: item.newMove.id,
          replaceIndex: result.replaceIndex
        })
      });
      const data = await response.json();
      if (data.state) {
        updateGameState(data.state);
      }
    }
  }
}

// ============ COMBAT LOOP FUNCTIONS ============

/**
 * Start the combat loop (vocab-pause turn-based combat)
 */
export async function startCombatLoop(opts = {}) {
  if (combatActive) return;

  logger.info('[CombatLoop] Combat started', opts.recovery ? '(recovery)' : '');
  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];

  // Transition to BattleScene so PIXI sprites/status-vfx/formation ticker are
  // owned by the scene registry. parallaxSpeed=0: during combat,
  // syncBattleStageParallax sets setScrollState('encounter') which halts
  // layer scrolling (currentSpeed=0); BattleScene's scene-level parallax gate
  // likewise stays off (only the sky drift path runs via legacy updateParallax,
  // which is already gated off while no scene has startParallax()'d).
  //
  // Idempotency: Task 17 moved the BattleScene transition up into startEncounter
  // (before playNpcBattleIntro) so player + enemy sprites spawn alongside the
  // NPC intro. If BattleScene is already active when we get here, skip the
  // re-transition — tearing it down and respawning would destroy the sprites
  // the intro already placed. On recovery (page reload), BattleScene is NOT
  // active yet, so the transition still fires as expected.
  const mgr = getSceneManager();
  const gs = getGameState();
  const isKanjiKombatOpening = opts.kanjiKombatOpening === true && gs.run?.mode === 'kanjiKombat';
  animatedEnemyKoKeys = collectExistingEnemyKoAnimationKeys(gs.combat?.enemies || []);
  if (!(mgr.currentScene instanceof BattleScene)) {
    try {
      await mgr.transition(BattleScene, {
        allies:  gs.combat?.allies  ?? [],
        enemies: isKanjiKombatOpening ? [] : (gs.combat?.enemies ?? []),
        isBoss: !!gs.combat?.isBoss,
      });
    } catch (err) {
      combatActive = false;
      console.error('[CombatLoop] BattleScene transition failed, aborting combat start', err);
      return;
    }
  } else if (isKanjiKombatOpening) {
    try {
      await mgr.currentScene.syncCreatures({
        allies: gs.combat?.allies ?? [],
        enemies: [],
        initial: true,
      });
    } catch (err) {
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to clear opening Kanji Kombat enemies', err);
      }
    }
  }

  // On recovery (page reload), re-render the scene before showing moves.
  // updateScene() already rendered enemy sprites, just need the move UI.
  if (opts.recovery && updateUI) {
    updateUI();
  }

  if (isKanjiKombatOpening) {
    kanjiKombatOpeningRevealActive = true;
    void playKanjiKombatOpeningTransition({
      allies: gs.combat?.allies ?? [],
      enemies: gs.combat?.enemies ?? [],
      isBoss: !!gs.combat?.isBoss,
    }).catch(err => {
      console.error('[CombatLoop] Kanji Kombat opening transition failed', err);
    }).finally(() => {
      kanjiKombatOpeningRevealActive = false;
      if (combatActive && isRecoveredCombatActive(getGameState()) && !getEnemyDialogueActive()) {
        startMoveSelection();
      }
    });
    return;
  }

  // Start move selection for the first turn
  startMoveSelection();
}

/**
 * Execute a single player attack and schedule the next one
 */
export async function executePlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'player', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Player attack:', { damage: result.playerAttack?.damage, critical: result.playerAttack?.critical });

      if (result.error) {
        // "No active combat" means server state is out of sync - don't trigger false game over
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false; // Sync client state
          return;
        }
        console.error('Player attack error:', result.error);
        // Don't trigger defeat for errors - let player retry
        playerAttackPending = false;
        return;
      }

      // If dialogue appeared during fetch, don't process results
      if (getEnemyDialogueActive()) {
        playerAttackPending = false;
        return;
      }


      // Show player's attack result
      if (result.playerAttack) {
        const pa = result.playerAttack;
        if (pa.perfectDodge) {
          showDamageNumber(0, false, false, false, false, 'perfect');
        } else if (pa.dodged) {
          showDamageNumber(0, false, false, false, false, 'dodge');
        } else if (pa.miss) {
          showDamageNumber(0, false, false, false, false, 'miss');
        } else {
          // Play attack sound immediately
          playSFX('attack');

          // Calculate damage tier for visual feedback
          const state = getGameState();
          const enemyMaxHp = state.combat?.enemy?.maxHp || 100;

          animateEnemyHurt();
          const enemySlot = document.querySelector('#enemy-formation .formation-slot');
          if (enemySlot) combatEvents.emit('creatureHit', { slotEl: enemySlot, side: 'enemy' });

          // Visual effects for enemy damage (PixiJS impact with tier-based effects)
          await vfx.impactEffect(pa.damage, 'enemy', 0, enemyMaxHp, undefined, undefined, () => {
            characterUI.updateEnemyHPBar(result.enemyHp);
          });
        }
      }

      // Sync HP bars for dodge/miss (no vfx.impactEffect fires, but server state may have changed)
      if (!result.playerAttack?.damage) {
        characterUI.updateEnemyHPBar(result.enemyHp);
      }
      // Update player HP bar (player doesn't take damage during their own attack animation)
      characterUI.updatePlayerHPBar(result.playerHp);

      // Show glitching dialogue when enemy HP drops below 30%
      // Combat pauses until dialogue dismisses, then enemy attacks
      if (result.enemyGlitching && result.glitchingDialogue) {
        playerAttackPending = false;
        showEnemyDialogue(result.glitchingDialogue, 'glitching');
        return;
      }

      // Check if combat ended
      if (result.combatEnded) {
        // Show liberated dialogue on victory
        if (result.victory && result.liberatedDialogue) {
          showEnemyDialogue(result.liberatedDialogue, 'liberated');
        }
        // Let HP bar drain animation (300ms CSS transition) be visible before stopping
        if (result.victory) {
          await delay(500);
        }
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Combat pause mode: trigger enemy attack after player, then pause for vocab review
      if (combatActive && !getEnemyDialogueActive()) {
        // Small delay before enemy attacks back
        setTimeout(() => {
          executeEnemyAttackThenPause();
        }, 400);
      }

    } catch (error) {
      console.error('Player attack error:', error);
      // Don't trigger defeat for errors - recover by showing next flashcard
      playerAttackPending = false;

      // Recovery: restart move selection so player can continue
      if (combatActive) {
        logger.warn('[CombatLoop] Recovered from player attack error, restarting move selection');
      }
    }
  });
}

function syncFinalState(result) {
  const gs = getGameState();
  const updates = mergeAuthoritativeCombatState(gs, result);
  if (updates === gs) return;
  updateGameState(updates);

  // Keep formation popup data in sync with latest HP
  if (result.creatureParty?.active && updateCreatureRowData) {
    updateCreatureRowData(result.creatureParty.active);
  }
  // Set final HP bars without full DOM rebuild
  if (result.enemies?.length > 1) {
    result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
  } else if (result.enemies?.[0]) {
    characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
  }
  vfx.updateCreatureHpBars(result.creatureParty?.active, null);

  // No-op: PixiJS sprites don't leave stale inline transforms
}

async function syncKanjiKombatStreakRewardVisuals(result) {
  if (!result?.kanjiStreakReward) return;

  syncFinalState(result);

  const active = result.creatureParty?.active || result.allies || [];
  if (!Array.isArray(active) || active.length === 0) return;

  const slots = Array.from(document.querySelectorAll('#player-formation .formation-slot'));
  const renderedIds = slots.map(slot => slot.dataset.creatureId || '');
  const activeIds = active.map(creature => creature?.id || '');
  const rosterChanged = renderedIds.length !== activeIds.length
    || renderedIds.some((id, index) => id !== activeIds[index]);

  if (rosterChanged) {
    await showFormation('player', active, { force: true });
  } else {
    vfx.updateCreatureHpBars(active, null);
  }

  const mgr = getSceneManager();
  const scene = mgr.currentScene;
  if (!mgr.transitioning
    && scene instanceof BattleScene
    && !scene.disposed
    && !scene._exiting
    && typeof scene.syncCreatures === 'function') {
    try {
      await scene.syncCreatures({
        allies: active,
        enemies: getGameState()?.combat?.enemies || result.enemies || [],
      });
    } catch (err) {
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to sync Kanji Kombat streak reward visuals', err);
      }
    }
  }

  vfx.syncStatusIconsFromResult({ ...result, allies: active });
}

async function playKanjiKombatEnemyTravelReveal({ enemies = [], allies = [], isBoss = false } = {}) {
  if (!enemies.length) {
    return;
  }

  const mgr = getSceneManager();
  const battleScene = mgr.currentScene instanceof BattleScene && !mgr.currentScene.disposed && !mgr.currentScene._exiting
    ? mgr.currentScene
    : null;

  if (battleScene) {
    startParallax(ROOM_TRAVEL_SCROLL_SPEED);
    setScrollState('scrolling');
    battleScene.formation.walkingEnabled = true;
    await wait(ROOM_TRAVEL_DURATION_MS);
    if (!battleScene.disposed && !battleScene._exiting) {
      battleScene.formation.walkingEnabled = false;
    }
    setScrollState('encounter');
    startParallax(BATTLE_SKY_DRIFT_SPEED);
  }

  const state = getGameState();
  const revealAllies = allies.length > 0
    ? allies
    : state?.combat?.allies || state?.run?.creatureParty?.active || [];

  await showFormation('enemy', enemies, { isBoss, force: true });
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';
  const revealScene = getSceneManager().currentScene;
  if (revealScene instanceof BattleScene && !revealScene.disposed && !revealScene._exiting) {
    try {
      await revealScene.syncCreatures({ allies: revealAllies, enemies, initial: true });
    } catch (err) {
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to reveal Kanji Kombat enemies', err);
      }
    }
  }

  const freshEnemyFormation = document.getElementById('enemy-formation');
  if (freshEnemyFormation) freshEnemyFormation.style.opacity = '1';
}

async function playKanjiKombatOpeningTransition({ enemies = [], allies = [], isBoss = false } = {}) {
  await playKanjiKombatEnemyTravelReveal({ enemies, allies, isBoss });
}

async function playKanjiKombatNextWaveTransition(result) {
  const enemies = Array.isArray(result.nextWaveEnemies)
    ? result.nextWaveEnemies
    : getGameState()?.combat?.enemies || [];
  if (!enemies.length) {
    updateUI?.();
    return;
  }

  const state = getGameState();
  const allies = state?.combat?.allies || state?.run?.creatureParty?.active || result.allies || [];
  const isBoss = !!state?.combat?.isBoss;

  await playKanjiKombatEnemyTravelReveal({ enemies, allies, isBoss });
  updateUI?.();
}

// ============ CREATURE COMBAT ORCHESTRATORS ============

/**
 * One player-side attack line (move turn) — effects, HP, party skills, card tap.
 */
async function playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn, options = {}) {
  const { skipAttackCards = false } = options;
  let attackCard = null;
  let continueControl = null;
  if (!skipAttackCards) {
    const adaptedAtk = {
      ...atk,
      attackerSkillName: atk.moveName || atk.attackerSkillName,
      attackerSkillEn: atk.moveNameEn || atk.attackerSkillEn,
      attackerSkillReading: atk.moveReading || atk.attackerSkillReading || '',
      attackerElement: atk.moveElement || atk.attackerElement
    };
    attackCard = insertAttackCard(adaptedAtk, false);
    continueControl = attackCard ? createAttackCardContinueControl(attackCard) : null;
  }

  // Rest: update the attacker's MP bar immediately so the bar growth is visible
  // while the card is up. The full state sync happens after the turn.
  if (atk.category === 'rest') {
    const slot = vfx.findCreatureSlotByAttackerId(atk.attackerId);
    if (slot) {
      const mpFill = slot.querySelector('.formation-mp-fill');
      const mpText = slot.querySelector('.formation-mp-text');
      const maxMp = atk.attackerMaxMp || 0;
      if (mpFill && maxMp > 0) {
        const pct = Math.max(0, Math.min(100, (atk.attackerMp / maxMp) * 100));
        mpFill.style.width = `${pct}%`;
        if (mpText) mpText.textContent = `${atk.attackerMp}/${maxMp}`;
      }
    }
    if (continueControl) await continueControl.wait();
    else if (!skipAttackCards) await delay(800);
    return;
  }

  playSFX('attack');
  const creatureSlotEl = vfx.findCreatureSlotByAttackerId(atk.attackerId);
  const enemyEl = vfx.findEnemyTargetElement(atk.targetId, result.enemies, atk.targetIndex);

  const atkElement = atk.moveElement || atk.attackerElement || 'neutral';
  const atkState = getGameState();
  const atkActiveCreatures = atkState.run?.creatureParty?.active || [];
  const atkAttackerIdx = atk.attackerId ? atkActiveCreatures.findIndex(r => r && r.id === atk.attackerId) : 0;
  const atkTargetIdx = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;

  const atkEffectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';
  if (atk.damage > 0 && (creatureSlotEl || getCreatureSpriteForScene(getSceneManager().currentScene, 'player', Math.max(0, atkAttackerIdx)))) {
    playAttackSound(atkElement);
    const tIdx = atk.targetIndex;
    const targetMaxHp = (typeof tIdx === 'number' && enemyHpMap[tIdx]?.maxHp)
      ? enemyHpMap[tIdx].maxHp
      : (result.enemies?.[0]?.maxHp ?? 100);
    await vfx.fireCreatureAttackEffect(Math.max(0, atkAttackerIdx), atkTargetIdx, atkElement, atk.damage, targetMaxHp, atkEffectivenessType, () => {
      if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
        enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
        const entry = enemyHpMap[tIdx];
        if (result.enemies.length > 1) {
          characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
        } else {
          characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
        }
      }
    });
    if (enemyEl) combatEvents.emit('creatureHit', { slotEl: enemyEl, side: 'enemy' });
  } else if (atk.damage > 0) {
    animateEnemyHurt();
    const tIdx = atk.targetIndex;
    if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
      enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
      const entry = enemyHpMap[tIdx];
      if (result.enemies.length > 1) {
        characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
      } else {
        characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
      }
    }
  }

  if (atk.healAmount > 0) {
    const drainTargetPos = vfx.spritePos('enemy', atkTargetIdx);
    const drainAttackerPos = vfx.spritePos('player', Math.max(0, atkAttackerIdx));
    flowParticles(drainTargetPos, drainAttackerPos, { count: 8, color: 0x4CAF50, duration: 600 });
    await wait(600);
    showHealPopup(atk.healAmount, drainAttackerPos);
  }

  const defeatedTargetIndex = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;
  const killKey = enemyKoAnimationKey(result.enemies?.[defeatedTargetIndex], defeatedTargetIndex, atk.targetId);
  if (atk.targetDefeated && !killedEnemies.has(killKey) && !animatedEnemyKoKeys.has(killKey)) {
    // Skip KO animation if this creature is the befriend quiz target (it survived at 1 HP)
    const isBefriendTarget = result.befriendQuizTriggered
      && typeof result.befriendQuiz?.targetIndex === 'number'
      && result.befriendQuiz.targetIndex === atk.targetIndex;
    if (!isBefriendTarget) {
      killedEnemies.add(killKey);
      animatedEnemyKoKeys.add(killKey);
      // Await the 600ms alpha+scale fade so the next attack in playback can't
      // start against a half-faded sprite — prior fire-and-forget let the next
      // syncCreatures race the tween's final frame, leaving a ghost corpse.
      await animateKOForScene(getSceneManager().currentScene, 'enemy', defeatedTargetIndex);
    }
    if (result.xpEvents) {
      const xpEvent = result.xpEvents.find(ev =>
        (typeof atk.targetIndex === 'number' && ev.enemyIndex === atk.targetIndex)
        || (typeof atk.targetIndex !== 'number' && ev.enemyId === atk.targetId)
      );
      if (xpEvent) {
        const pending = showXpEvents([xpEvent]);
        if (pending?.length) allPendingMoveLearn.push(...pending);
      }
    }
  }

  // Real-time buff/debuff indicators — show immediately when a move applies effects
  if (atk.effectApplied || atk.statChangesApplied) {
    const targetSide = (atk.category === 'buff' || atk.category === 'shield') ? 'player' : 'enemy';
    await vfx.showMoveEffectsApplied(atk, targetSide, atkTargetIdx, result);
  }

  const partySkillKoIndices = await vfx.showPartySkillProcs(atk, enemyHpMap);
  for (const index of partySkillKoIndices || []) {
    const key = enemyKoAnimationKey(result.enemies?.[index], index);
    killedEnemies.add(key);
    animatedEnemyKoKeys.add(key);
  }

  if (continueControl) {
    await continueControl.wait();
  } else if (!skipAttackCards) {
    await delay(800);
  }
}

async function playCreatureCombatResult(result, turnTiming, options = {}) {
  const {
    choices = [],
    logMoveIntent = true,
    nextSelectionDelayMs = 0,
    skipAttackCards = false,
    deferNextSelection = false,
  } = options;
  const _log = getLog();

  if (result.state) {
    updateGameState(mergeAuthoritativeCombatState(getGameState(), result));
  }

  if (logMoveIntent && _log) {
    const gs = getGameState();
    const allies = gs?.combat?.allies || gs?.run?.creatureParty?.active || [];
    const enemies = gs?.combat?.enemies || [];
    const moveDesc = choices.map(c => {
      const creature = allies[c.creatureIndex];
      const moveName = creature?.moves?.find(m => m.id === c.moveId)?.nameEn || '?';
      const target = c.targetIndex >= 0 ? (enemies[c.targetIndex]?.nameEn || '?') : 'AoE/Self';
      return `${creature?.nameEn || '?'}→${moveName}→${target}`;
    }).join(', ');
    _log.act(`Attack: ${moveDesc}`);
  }

  if (_log) {
    const aliveEnemies = (result.enemies || []).filter(e => e.hp > 0 && !e.befriended).length;
    const aliveAllies = (result.allies || []).filter(a => a.hp > 0).length;
    _log.expect(`Enemies alive: ${aliveEnemies}/${(result.enemies || []).length}. Allies alive: ${aliveAllies}/${(result.allies || []).length}`);

    for (const atk of [...(result.playerAttacks || []), ...(result.enemyAttacks || [])]) {
      if (atk.targetDefeated) {
        const side = result.playerAttacks?.includes(atk) ? 'enemy' : 'ally';
        _log.expect(`KO: ${side}[${atk.targetIndex}] — sprite fade, HP bar zero`);
      }
    }
  }

  if (window.__inspector?.checkGameRules) {
    const ruleCheck = window.__inspector.checkGameRules(result);
    if (!ruleCheck.ok) {
      const log = getLog();
      for (const m of ruleCheck.mismatches) {
        if (log) log.expect(`RULE VIOLATION: ${m.detail}`);
        console.warn(`[RULE] ${m.type}: ${m.detail}`);
      }
    }
  }

  _currentRoundBarks = result.barks || [];

  await vfx.showRoundStartEvents(result);

  const enemyHpMap = vfx.buildEnemyHpMapForPlayerAttacks(result);
  const allyHpMap = vfx.buildAllyHpMap(result);
  const allPendingMoveLearn = [];
  const killedEnemies = new Set();

  const actionSegments = Array.isArray(result.actionSegments) ? result.actionSegments : [];
  let merged = [];
  if (actionSegments.length > 0) {
    for (const segment of actionSegments) {
      const side = segment.actor?.side === 'enemy' ? 'enemy' : 'player';
      let fallbackOrder = 0;
      const orderedSegmentItems = [];
      for (const atk of segment.attacks || []) {
        orderedSegmentItems.push({
          kind: 'attack',
          playbackIndex: typeof atk.playbackIndex === 'number' ? atk.playbackIndex : Number.MAX_SAFE_INTEGER + fallbackOrder++,
          atk
        });
      }
      for (const counter of segment.counterAttacks || []) {
        orderedSegmentItems.push({
          kind: 'counter',
          playbackIndex: typeof counter.playbackIndex === 'number' ? counter.playbackIndex : Number.MAX_SAFE_INTEGER + fallbackOrder++,
          counter
        });
      }
      const deferredEffectEvents = [];
      for (const event of segment.effectEvents || []) {
        if (typeof event.playbackIndex === 'number') {
          orderedSegmentItems.push({ kind: 'effect', playbackIndex: event.playbackIndex, event });
        } else {
          deferredEffectEvents.push(event);
        }
      }

      orderedSegmentItems.sort((a, b) => a.playbackIndex - b.playbackIndex);
      for (const item of orderedSegmentItems) {
        if (item.kind === 'attack') {
          if (shouldSkipAttackRecord(side, item.atk, enemyHpMap, allyHpMap, result)) continue;
          if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, item.atk, enemyHpMap, killedEnemies, allPendingMoveLearn, { skipAttackCards });
          } else {
            await vfx.showOneEnemyAttackAnimated(result, item.atk, allyHpMap, false, { skipAttackCards });
          }
        } else if (item.kind === 'counter') {
          await vfx.showOneCounterAttackAnimated(item.counter, enemyHpMap, result.enemies);
        } else if (item.kind === 'effect') {
          await vfx.showEffectEvents({
            ...result,
            effectEvents: [item.event],
            mpRegens: []
          });
        }
      }
      if (deferredEffectEvents.length > 0 || (segment.mpRegens || []).length > 0) {
        await vfx.showEffectEvents({
          ...result,
          effectEvents: deferredEffectEvents,
          mpRegens: segment.mpRegens || []
        });
      }
    }
  } else {
    await vfx.showEffectEvents(result);
    merged = vfx.buildMergedInitiativeAttacks(result);
  }

  if (merged.length > 0) {
    for (const { side, atk } of merged) {
      if (shouldSkipAttackRecord(side, atk, enemyHpMap, allyHpMap, result)) continue;
      if (side === 'player' && atk.type === 'counter') {
        await vfx.showOneCounterAttackAnimated(atk, enemyHpMap, result.enemies);
      } else if (side === 'player') {
        await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn, { skipAttackCards });
      } else {
        await vfx.showOneEnemyAttackAnimated(result, atk, allyHpMap, false, { skipAttackCards });
      }
    }
  }

  if (result.enemies) {
    const koPromises = [];
    const pendingKoIndices = collectPendingEnemyKoAnimationIndices(
      result.enemies,
      animatedEnemyKoKeys,
      killedEnemies
    );
    for (const i of pendingKoIndices) {
      koPromises.push(animateKOForScene(getSceneManager().currentScene, 'enemy', i));
    }
    if (koPromises.length) await Promise.all(koPromises);
  }

  vfx.syncStatusIconsFromResult(result);

  if (result.befriendQuizTriggered && result.befriendQuiz) {
    syncFinalState(result);
    playerAttackPending = false;
    await befriend.renderBefriendQuiz(result.befriendQuiz, result);
    logCombatTurnTiming(turnTiming, result, 'befriend_quiz');
    return;
  }

  if (result.npcSkillAttacks?.length > 0) {
    const npcData = getCombatNpcData();
    if (npcData) {
      await playNpcSkillAnimation(npcData, showNpcSprite, hideNpcSprite, async () => {
        await vfx.showNpcSkillAttacksAnimated(result, allyHpMap);
      }, result.enemies);
    } else {
      await delay(400);
      await vfx.showNpcSkillAttacksAnimated(result, allyHpMap);
    }
  }

  if (actionSegments.length === 0) {
    const enemyShownInMerge = merged.some(e => e.side === 'enemy');
    if (!enemyShownInMerge && result.enemyAttacks?.length > 0) {
      await delay(400);
      await vfx.showEnemyAttacksAnimated(result, allyHpMap, false, { skipAttackCards });
    }

    const countersShownInMerge = merged.some(e => e.side === 'player' && e.atk.type === 'counter');
    if (!countersShownInMerge) {
      await vfx.showCounterAttacks(result, enemyHpMap);
    }
  }

  await vfx.showKoSwapAnimations(result);

  syncFinalState(result);
  if (result.nextWave) {
    await playKanjiKombatNextWaveTransition(result);
    animatedEnemyKoKeys = collectExistingEnemyKoAnimationKeys(getGameState()?.combat?.enemies || []);
  }

  if (allPendingMoveLearn.length > 0) {
    await processPendingMoveLearn(allPendingMoveLearn);
  }

  if (window.__inspector) {
    const scanResult = window.__inspector.checkCreatures();
    const __log = getLog();
    if (__log) {
      if (scanResult.ok) {
        __log.check({ ok: true });
      } else {
        const first = scanResult.mismatches[0];
        __log.check({ ok: false, tag: first.type, detail: first.detail });
        for (const m of scanResult.mismatches.slice(1)) {
          console.warn(`[CHK] additional: ${m.type}: ${m.detail}`);
        }
      }
    }
  }

  if (result.combatEnded) {
    const __logEnd = getLog();
    if (__logEnd) {
      __logEnd.act(`Combat ended: ${result.victory ? 'VICTORY' : 'DEFEAT'}`);
      __logEnd.expect('All combat sprites cleared. Combat UI removed.');
    }
    if (result.victory) await delay(500);
    logCombatTurnTiming(turnTiming, result, result.victory ? 'victory' : 'defeat');
    stopCombatLoop(result);
    return;
  }

  if (deferNextSelection) {
    logCombatTurnTiming(turnTiming, result, 'awaiting_verification');
    return;
  }

  playerAttackPending = false;

  await waitBeforeMoveSelection(nextSelectionDelayMs);
  logCombatTurnTiming(turnTiming, result, 'next_selection');
  startMoveSelection();
}

/**
 * Execute a full turn of creature moves — calls /creature-combat-cycle with 'attack' + moveChoices.
 * @param {Array} choices - Array of { creatureIndex, moveId, targetIndex }
 */
async function executeCreatureMovesTurn(choices, options = {}) {
  if (!combatActive || playerAttackPending || getEnemyDialogueActive()) return;
  playerAttackPending = true;
  const actionType = options.actionType || 'attack';
  const recoveryActionType = options.recoveryActionType || 'attack';
  const turnTiming = createCombatTurnTiming(actionType);

  return withAnimationActive(async () => {
    try {
      // --- Intent Log: record the action about to be taken ---
      const _log = getLog();
      if (_log) {
        const gs = getGameState();
        const allies = gs?.combat?.allies || gs?.run?.creatureParty?.active || [];
        const enemies = gs?.combat?.enemies || [];
        const moveDesc = options.describeIntent?.() || choices.map(c => {
          const creature = allies[c.creatureIndex];
          const moveName = creature?.moves?.find(m => m.id === c.moveId)?.nameEn || '?';
          const target = c.targetIndex >= 0 ? (enemies[c.targetIndex]?.nameEn || '?') : 'AoE/Self';
          return `${creature?.nameEn || '?'}→${moveName}→${target}`;
        }).join(', ');
        _log.act(actionType === 'attack' ? `Attack: ${moveDesc}` : moveDesc);
      }

      const optimisticHandled = actionType === 'kanjiKombat' && options.kanjiAnswerId
        ? await runOptimisticKanjiKombatAnswer({
            answerId: options.kanjiAnswerId,
            promptRef: options.kanjiPromptRef,
            turnTiming,
            recoveryActionType,
          })
        : !options.request && await runOptimisticCreatureCombatTurn({
            actionType,
            moveChoices: choices,
            turnTiming,
            recoveryActionType,
            pendingFlag: 'player',
            playback: localTranscript => playCreatureCombatResult(localTranscript, turnTiming, {
              choices,
              logMoveIntent: false,
              deferNextSelection: true,
            }),
          });
      if (optimisticHandled) {
        return;
      }

      const requestStartedAt = performance.now();
      const result = options.request
        ? await options.request()
        : await runCreatureCombatRequest('attack', choices);
      markCombatAnimationStart(turnTiming, requestStartedAt);
      if (!result) {
        const recovery = await recoverFromNullCombatPost(recoveryActionType);
        logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
        if (recovery.recovered) return;
        throw new Error('Combat sync failed');
      }

      if (result.error) {
        if (result.state) {
          const recovery = recoverFromCombatErrorState(result, recoveryActionType);
          logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
          if (recovery.recovered) return;
        }
        if (result.error === 'No active combat') {
          combatActive = false;
          logCombatTurnTiming(turnTiming, result, 'no_active_combat', true);
          return;
        }
        console.error('Move turn error:', result.error);
        playerAttackPending = false;
        if (combatActive) {
          startMoveSelection();
        }
        logCombatTurnTiming(turnTiming, result, 'server_error', true);
        return;
      }

      if (actionType === 'kanjiKombat') {
        void vfx.showKanjiKombatAnswerBanner(result.kanjiAnswerCorrect, result.kanjiStreakReward || null);
      }

      await playCreatureCombatResult(result, turnTiming, {
        choices,
        logMoveIntent: false,
        skipAttackCards: actionType === 'kanjiKombat',
      });

    } catch (error) {
      console.error('Move turn error:', error);
      playerAttackPending = false;
      if (!turnTiming.logged) {
        logCombatTurnTiming(turnTiming, null, 'exception', true);
      }
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

async function playCreatureDefendResult(result, turnTiming, options = {}) {
  const { deferNextSelection = false } = options;

  // --- Game Rule Validation: check server result for logic invariants ---
  if (window.__inspector?.checkGameRules) {
    const ruleCheck = window.__inspector.checkGameRules(result);
    if (!ruleCheck.ok) {
      const log = getLog();
      for (const m of ruleCheck.mismatches) {
        if (log) log.expect(`RULE VIOLATION: ${m.detail}`);
        console.warn(`[RULE] ${m.type}: ${m.detail}`);
      }
    }
  }

  // Store server-provided barks for speech bubbles
  _currentRoundBarks = result.barks || [];

  // Show poison/effect ticks
  await vfx.showEffectEvents(result);

  // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
  await vfx.showRoundStartEvents(result);

  // Show defend indicator
  const actionArea = document.getElementById('action-area');
  if (actionArea) {
    actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defending')}</div>`;
  }

  // Update charge bars immediately for defend (BUG A fix)
  if (result.creatureParty?.active) {
    vfx.updateCreatureHpBars(result.creatureParty.active, null);
  }

  // Enemy attacks phase (50% damage already applied server-side)
  const allyHpMap = vfx.buildAllyHpMap(result);
  await vfx.showEnemyAttacksAnimated(result, allyHpMap, true);

  // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
  const enemyHpMap = {};
  (result.enemies || []).forEach((e, i) => {
    if (e) enemyHpMap[i] = { hp: e.hp, maxHp: e.maxHp, index: i };
  });
  await vfx.showCounterAttacks(result, enemyHpMap);

  // KO swap animations
  await vfx.showKoSwapAnimations(result);

  // Sync authoritative state from server
  syncFinalState(result);

  // --- Intent Log: check UI consistency after defend animations ---
  if (window.__inspector) {
    const scanResult = window.__inspector.checkCreatures();
    const log = getLog();
    if (log) {
      if (scanResult.ok) {
        log.check({ ok: true });
      } else {
        const first = scanResult.mismatches[0];
        log.check({ ok: false, tag: first.type, detail: first.detail });
      }
    }
  }

  // Check combat end
  if (result.combatEnded) {
    logCombatTurnTiming(turnTiming, result, result.victory ? 'victory' : 'defeat');
    stopCombatLoop(result);
    return;
  }

  if (deferNextSelection) {
    logCombatTurnTiming(turnTiming, result, 'awaiting_verification');
    return;
  }

  enemyAttackPending = false;

  // Start next turn's move selection
  logCombatTurnTiming(turnTiming, result, 'next_selection');
  startMoveSelection();
}

/**
 * Execute creature defend — calls /creature-combat-cycle with 'defend'
 * Defend: all creatures regen MP, enemies attack with 50% damage
 */
async function executeCreatureDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  const turnTiming = createCombatTurnTiming('defend');

  return withAnimationActive(async () => {
    try {
      // --- Intent Log: record the defend action ---
      const log = getLog();
      if (log) {
        log.act('Defend: all creatures defend this turn');
        log.expect('Enemy attacks only. No ally attacks this turn.');
      }

      const optimisticHandled = await runOptimisticCreatureCombatTurn({
        actionType: 'defend',
        moveChoices: [],
        turnTiming,
        recoveryActionType: 'defend',
        pendingFlag: 'enemy',
        playback: localTranscript => playCreatureDefendResult(localTranscript, turnTiming, {
          deferNextSelection: true,
        }),
      });
      if (optimisticHandled) {
        return;
      }

      const requestStartedAt = performance.now();
      const result = await runCreatureCombatRequest('defend', []);
      markCombatAnimationStart(turnTiming, requestStartedAt);
      if (!result) {
        const recovery = await recoverFromNullCombatPost('defend');
        logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
        if (recovery.recovered) return;
        throw new Error('Combat sync failed');
      }
      logger.info('[CombatLoop] Creature defend result:', { enemyAttacks: result.enemyAttacks?.length });

      if (result.error) {
        if (result.state) {
          const recovery = recoverFromCombatErrorState(result, 'defend');
          logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
          if (recovery.recovered) return;
        }
        if (result.error === 'No active combat') {
          combatActive = false;
          logCombatTurnTiming(turnTiming, result, 'no_active_combat', true);
          return;
        }
        console.error('Creature defend error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        logCombatTurnTiming(turnTiming, result, 'server_error', true);
        return;
      }

      await playCreatureDefendResult(result, turnTiming);

    } catch (error) {
      console.error('Creature defend error:', error);
      enemyAttackPending = false;
      if (!turnTiming.logged) {
        logCombatTurnTiming(turnTiming, null, 'exception', true);
      }
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
      });
      const result = await response.json();
      console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }


      // Show enemy's attack result
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        // Show enemy damage in action area (big red text)
        vfx.showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;

    } catch (error) {
      console.error('Enemy attack error:', error);
      enemyAttackPending = false;
    }
  });
}

/**
 * Resume combat after vocab review - triggers next attack cycle
 * @param {number} grade - Review grade (1-5)
 * @param {string} actionType - 'attack' or 'defend'
 */
export function resumeCombatAfterVocab(grade, actionType = 'attack') {
  if (!combatActive || !combatPausedForVocab) return;

  logger.info('[CombatLoop] Word reviewed, continuing:', { grade, actionType });
  combatPausedForVocab = false;

  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;

  // Old befriend action handler disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // if (actionType === 'befriend') {
  //   befriend.executeBefriendAction();
  // } else
  if (isCreatureCombat) {
    // Creature combat: use creature-specific functions
    if (actionType === 'defend') {
      executeCreatureDefendThenPause();
    } else {
      executeCreatureMovesTurn([]);
    }
  } else {
    // Legacy combat: use original functions
    if (actionType === 'defend') {
      executeDefendThenPause();
    } else {
      executePlayerAttack();
    }
  }
}

/**
 * Execute defend action: skip player attack, enemy attacks with reduced damage
 */
async function executeDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', actionType: 'defend', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[Combat] Defend - Enemy attack (50% damage):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defendingCreature')}</div>`;
      }

      // Show enemy's attack result (damage already halved by backend)
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        vfx.showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;

    } catch (error) {
      console.error('Defend action error:', error);
      enemyAttackPending = false;
    }
  });
}


/**
 * Stop combat loop and show results
 * @param {Object} result - Combat result data
 */
export async function stopCombatLoop(result) {
  logger.info('[CombatLoop] Combat ended:', { victory: result?.victory });
  const gameState = getGameState();
  trackMilestone('koto_first_combat_ended', {
    ...extractGameContext(gameState),
    outcome: normalizeCombatOutcome(result),
    turn_count: result?.turnCount || gameState?.combat?.turnCount
  }, 'first_combat_ended');
  const mgr = getSceneManager();

  // Clear both attack timers
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }

  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];
  animatedEnemyKoKeys = new Set();

  // Fix A: Immediately mark combat inactive on the client so derivePhase()
  // stops returning 'combat'. Any stray updateUI() during the victory window
  // will now hit the non-combat branch and call hideEnemies() instead of
  // re-rendering defeated enemies as live sprites.
  const gs = getGameState();
  if (gs.combat) {
    updateGameState({ ...gs, combat: { ...gs.combat, active: false } });
  }
  const freezePostCombatTravelForNpcReward = shouldFreezePostCombatTravelForNpcReward(gs, result);

  if (result?.victory) combatEvents.emit('victory');

  // PIXI status VFX + canvas status label cleanup is handled by
  // BattleScene.beforeExit via registry disposal when we transition to
  // ExplorationScene below (end of this function).

  // Resume parallax scroll and hide defeated enemy PixiJS sprites.
  // Player sprites are kept alive — they should remain visible through the
  // victory screen and into the next room. Destroying them here creates a
  // 1500ms+ gap where DOM info boxes (name/HP bars) float with no creature
  // image underneath (the "ghost formation" effect).
  //
  // Sprites live on the active BattleScene's formation ctx, so we remove
  // them via the scene's own diff. syncCreatures({ enemies: [] }) drops all
  // enemy sprites while leaving allies intact. Walking wobble will be
  // re-enabled by ExplorationScene on room entry.
  setScrollState(freezePostCombatTravelForNpcReward ? 'encounter' : 'accelerating');
  const battleSceneForCleanup = mgr.currentScene;
  if (battleSceneForCleanup instanceof BattleScene && !battleSceneForCleanup.disposed && !mgr.transitioning) {
    // Normal victories walk into the room transition immediately. NPC battle
    // rewards keep BattleScene mounted for skill selection, so stay idle until
    // the player chooses a skill and the scene actually transitions.
    battleSceneForCleanup.formation.walkingEnabled = !freezePostCombatTravelForNpcReward;
    try {
      await battleSceneForCleanup.syncCreatures({
        allies: getGameState()?.combat?.allies ?? getGameState()?.run?.creatureParty?.active ?? [],
        enemies: [],
      });
    } catch (err) {
      // Scene disposed mid-sync (e.g., rapid reload into post-combat): the
      // ExplorationScene transition below will re-seed sprites from the
      // updated ally roster, so there's nothing to recover.
      if (!(err instanceof SceneDisposedError)) {
        console.error('[CombatLoop] failed to clear enemy sprites via scene diff', err);
      }
    }
  }

  // Clear stale DOM enemy formation slots. Pixi enemy sprites were already
  // removed via syncCreatures above; this closes the window where leftover
  // DOM slots could trigger the showFormation() dedup path to recreate
  // ghost sprites.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';

  // --- Intent Log: post-combat cleanup check ---
  if (window.__inspector) {
    const postScan = window.__inspector.checkCreatures();
    const postLog = getLog();
    if (postLog) {
      if (postScan.ok) {
        postLog.check({ ok: true });
      } else {
        const first = postScan.mismatches[0];
        postLog.check({ ok: false, tag: first.type, detail: first.detail });
        for (const m of postScan.mismatches.slice(1)) {
          console.warn(`[CHK] post-combat: ${m.type}: ${m.detail}`);
        }
      }
    }
  }

  // Wait for enemy dialogue to be dismissed (e.g., liberated dialogue on victory)
  const dialogueDismissPromise = getDialogueDismissPromise();
  if (dialogueDismissPromise) {
    await dialogueDismissPromise;
  }

  // Animate enemy defeat
  if (result.victory) {
    animateEnemyDefeat();
    playSFX('enemy-defeat');
  }

  // Show victory or defeat modal. Both return Promises that resolve after
  // the modal's loadGameState + updateUI settles — we await them here so
  // BattleScene (and its sprites) remain visible through the modal window.
  // Transitioning while the modal animates would destroy player sprites
  // beneath the visible DOM info boxes (the "ghost formation" effect).
  let modalPromise;
  if (result.victory) {
    playSFX('victory');
    const gs = getGameState();
    const isCreatureCombat = gs?.combat?.isCreatureCombat;
    if (isCreatureCombat && gs?.combat?.npcId) {
      await npcDialogueUI.runNpcDialogue();
    }
    if (isCreatureCombat && showPostCombatShop) {
      await showPostCombatShop();
    }
    modalPromise = showVictoryModal(result);
  } else {
    modalPromise = showGameOverModal(result);
  }
  try {
    await modalPromise;
  } catch (err) {
    console.error('[CombatLoop] modal dismissal rejected — continuing to cleanup', err);
  }

  // Transition to ExplorationScene so BattleScene.beforeExit disposes of all
  // scene-owned PIXI resources (formation sprites, status VFX, HP pills,
  // formation ticker, creature-row listeners) via the registry. By the time
  // the modal promise above resolves, updateUI() has already fired with the
  // new phase — so the current scene should flip to ExplorationScene now.
  // Pass the updated ally party so ExplorationScene spawns player sprites
  // immediately on entry (fixes bug #6 — non-combat rooms previously had
  // HP bars but no PIXI sprites because _defaultCtx was unwired).
  const nextState = getGameState();
  if (shouldKeepNpcBattleSceneForReward(nextState)) {
    setScrollState('encounter');
    const currentBattleScene = mgr.currentScene;
    if (currentBattleScene instanceof BattleScene && !currentBattleScene.disposed) {
      currentBattleScene.formation.walkingEnabled = false;
    }
    return;
  }

  const roomId = nextState?.run?.currentRoom ?? null;
  const alliesForExplore = nextState?.run?.creatureParty?.active ?? [];
  try {
    await mgr.transition(ExplorationScene, { roomId, allies: alliesForExplore });
  } catch (err) {
    console.error('[CombatLoop] ExplorationScene transition failed — reload to recover', err);
  }

  // updateUI() removed: the phase is still 'combat' here, so updateScene()
  // would re-render defeated enemies as live sprites (ghost bug).
  // showVictoryModal's timer calls loadGameState() + updateUI() with
  // the correct new phase; showGameOverModal handles its own UI.
}

/**
 * Show NPC greeting before combat
 */
