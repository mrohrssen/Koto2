import * as speedReview from './speed-review.js';
import { WhackAMoleGame } from './whack-a-mole.js';
import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';
import { creatureBgUrl, itemSpriteHtml, creatureStaticPath } from './sprite-utils.js';
import { hideEnemy } from './combat-dom.js';
import { showNpcInDisplay } from './exploration-dom.js';
import { npcSpriteUrl, spriteUrl } from '../assets/asset-urls.js';
import { t, isJapanified } from './i18n.js';
import * as chestsUI from './chests.js';
import * as crestsEquipUI from './crests-equip.js';
import * as campfireUI from './campfire.js';
import { buildItemEffectPills } from './item-effect-pills.js';
import { playRoomTransition } from './room-transition.js';
import { renderButtons, renderChoices } from './ui-components.js';
import { escapeHtml } from './html-utils.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';
import { preparedPayloadHasSkillOffers } from './combat-ui-utils.js';
import { buff, itemGained } from './event-popup.js';
import { pop, flashElement } from './dom-effects.js';
import { savePvpTeam, getPvpTeams } from '../api.js';
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import {
  getTutorialNarration,
  getFormationNarration,
  getPostHinonekoReviewNarration,
  getFusionCoreNarration,
  getPostFusionNarration
} from './tutorial-copy.js';
import { showIngredientDropPopups, showWordLevelUp } from './word-level-up.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import {
  advanceStateToBufferedNextRoom,
  getCurrentRoom as getCurrentBufferedRoom,
  getNextRoom,
} from './room-reveal-buffer.js';
import { configureExploreSession, getExploreSession } from './explore-session.js';
import {
  applyPartySkillChoice,
  syncPartySkillHpBonuses,
} from '../../../src/game/party-skills.js';

/**
 * Resolve any active scene that owns an `npcs` layer. Every gameplay scene
 * (HubScene, ExplorationScene, BattleScene) provides this layer, so NPC
 * sprite operations should succeed across all non-combat phases that can
 * host a dialogue.
 *
 * The earlier `getExplorationScene` helper required `instanceof ExplorationScene`
 * and silently returned null when HubScene was active (prologue, hub,
 * area_selection, skillMaster) — which is exactly the state the returning
 * player hits at session start, causing Cid's Pixi sprite to never render.
 * Broadening the contract to "any scene with an npcs layer" is the
 * structural fix. See Bug #8 in docs/pr2-bulletproof-rendering-smoke-test.md.
 */
export function getSceneWithNpcs() {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || scene._exiting || !scene.layers?.npcs) return null;
  return scene;
}

async function waitForSceneWithNpcs({ timeoutMs = 1000 } = {}) {
  const mgr = getSceneManager();
  const deadline = Date.now() + timeoutMs;
  let scene = getSceneWithNpcs();
  while (!scene && mgr?.transitioning && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 16));
    scene = getSceneWithNpcs();
  }
  return scene;
}

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startNewRun = null;
let returnToHub = null;
let showAdventureReport = null;
let finishCombatLoop = null;
let resumeSessionCombatBefriendQuiz = null;
let waitForCombatPlaybackIdle = async () => {};
let exploreSessionOnlineDrainTarget = null;
let exploreSessionVisibilityDrainTarget = null;
// Injected in init(): pulls a rebuilt runway server-side (loadGameState with
// adoptSession → /state?adoptSession=1, epoch preserved) to recover an online
// stall.
let refreshRunwayState = null;
const RUNWAY_RECOVERY_REASONS = new Set([
  'noPreparedRoom',
  'currentRoomNotReady',
  'nextRoomNotReady',
  'runwayExhausted',
  'missingPayload',
  'actionNotAccepted',
]);
const RUNWAY_RECOVERY_RETRY_MS = [500, 1000, 2000, 4000, 8000, 15000];
let runwayRecoveryPromise = null;
let runwayRecoveryTimer = null;
let runwayRecoveryAttempt = 0;

function isInitialSkillPickState(state = getGameState?.()) {
  const room = state?.room || getActiveRoomFromRun(state?.run);
  const initialPick = state?.run?.initialSkillPick;
  return Boolean(
    (initialPick && !initialPick.chosenId)
    || (state?.phase === 'skillMaster' && (!room || room.type !== 'skillMaster'))
  );
}

async function resetSceneForInitialRoomEntry(state) {
  const mgr = getSceneManager();
  if (mgr?.transitioning && typeof mgr.waitForIdle === 'function') {
    await mgr.waitForIdle();
  }
  const scene = mgr?.currentScene;
  const allies = state?.run?.creatureParty?.active ?? [];
  const roomId = state?.run?.currentRoom ?? null;
  if (scene && !scene.disposed && !scene._exiting && typeof scene.resetForRoom === 'function') {
    await scene.resetForRoom({ roomId, allies });
  } else if (scene && !scene.disposed && !scene._exiting && scene.npcSprite && typeof scene.hideNpcSprite === 'function') {
    await scene.hideNpcSprite({ slideOut: true });
  }
  hideEnemy();
}
const EXPLORE_SPOTTY_COPY = 'Connection is spotty. Your progress will sync when you reconnect.';

function applyExploreSessionRunway(response) {
  if (!response || !Object.hasOwn(response, 'exploreRunway')) return;
  const state = getGameState?.();
  if (!state?.run) return;
  if (response.exploreRunway == null) {
    state.run.exploreRunway = null;
    return;
  }
  const runway = cloneStateForExploreSession(response.exploreRunway);
  runway.currentRoom = state.run.currentRoom;
  const preparedRoom = preparedRoomForRunwayCursor(runway, state.run.currentRoom);
  if (Number.isInteger(preparedRoom?.actionSeq)) {
    runway.roomActionSeq = preparedRoom.actionSeq;
  }
  state.run.exploreRunway = runway;
}

function findLastUnconsumedSessionResult(results, predicate) {
  const session = getExploreSession?.();
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (!predicate(result)) continue;
    if (
      !result?.actionId
      || !session?.consumeResultOnce
      || session.consumeResultOnce(result.actionId)
    ) {
      return result;
    }
  }
  return null;
}

// Scan a checkpoint's committed results for a combat.cycle turn that ended the
// fight, and hand it to the combat-loop finish path (the same one a live victory/
// defeat uses). The replayed combat.cycle result IS the committed
// creatureCombatCycle result (combatEnded/victory/rewards ride along) plus seq/
// actionId, so finishCombatLoop consumes it directly.
function finishSessionCombatFromResults(response) {
  const results = Array.isArray(response?.results) ? response.results : [];

  // The client optimistically predicts a plain terminal victory (pendingCombatEnd
  // shell). The server may divert that terminal turn to a befriend quiz on replay
  // (25% roll, server-only). Such a result carries befriendQuizTriggered but NOT
  // combatEnded, so it would never match the finish scan below — the client would
  // freeze on the victory shell. Reconcile it first: resume combat into the
  // Fight/Talk befriend quiz from the authoritative state.
  if (typeof resumeSessionCombatBefriendQuiz === 'function') {
    const befriendResult = findLastUnconsumedSessionResult(
      results,
      result => result?.befriendQuizTriggered,
    );
    if (befriendResult) {
      void resumeSessionCombatBefriendQuiz({ ...befriendResult, state: response.state });
      return true;
    }
  }

  if (typeof finishCombatLoop !== 'function') return false;
  const finalResult = findLastUnconsumedSessionResult(
    results,
    result => result?.combatEnded === true,
  );
  if (!finalResult) return false;
  finishCombatLoop({ ...finalResult, state: response.state });
  return true;
}

function onExploreSessionCheckpoint(response, { logEmpty = true } = {}) {
  if (logEmpty === false) {
    applyExploreSessionRunway(response);
    finishSessionCombatFromResults(response);
    return;
  }
  if (response?.state) updateGameState(response.state);
  applyExploreSessionRunway(response);
  const finished = finishSessionCombatFromResults(response);
  // Re-drive the phase after a fully-drained checkpoint (mirrors the correction
  // path's updateUI and KK's refreshKanjiKombatAction). Without this, a combat
  // start that soft-paused via startEncounter's pending-entries guard ("Combat
  // will start when your progress syncs") is stranded in `room_encounter`: the
  // reconnect drain lands here and updates state, but updateGameState does NOT
  // render, so updateGameContent's `case 'room_encounter'` never re-fires
  // startEncounter and the fight never begins.
  //
  // Guards — skip when:
  //  • the checkpoint already finished/advanced combat (finishSessionCombatFromResults
  //    owns that transition);
  //  • a healthy fight is active (the per-turn checkpoint stream must not re-render
  //    mid-combat);
  //  • the SESSION IS PAUSED — a session enterPause (dependency / nextRoomNotReady /
  //    runwayExhausted) resumes through onResume, which the drain fires AFTER this
  //    checkpoint and AFTER adoptRunwayInternal. Re-driving here would run against
  //    the not-yet-adopted (stale) runway AND set autoProceedInFlight, blocking the
  //    resume's own autoProceed → the run stalls at the paused room (observed: a
  //    friendlyNpc→combat partyStats pause never advanced past room 0). onResume
  //    owns the paused re-drive; leave it to run post-adoption.
  const state = getGameState?.();
  const combatActive = state?.phase === 'combat' && state?.combat?.active !== false && !!state?.combat;
  const sessionPaused = getExploreSession?.()?.isPaused?.() === true;
  if (!finished && !combatActive && !sessionPaused) updateUI();
}

function onExploreSessionCorrection(response) {
  const authoritativeState = response?.state || response?.authoritativeState;
  if (authoritativeState) updateGameState(authoritativeState);
  applyExploreSessionRunway(response);
  updateUI();
}

function showExploreSoftPause({ reason, missingPayloadReasons = [] } = {}) {
  const session = getExploreSession?.();
  if (session?.isPaused?.() !== true) {
    session?.pause?.(reason || 'missingPayload');
  }
  const missingDetails = Array.isArray(missingPayloadReasons)
    ? missingPayloadReasons.filter(Boolean)
    : [];
  const detail = missingDetails.length > 0
    ? ` Waiting for ${missingDetails.join(', ')}.`
    : '';
  sceneModule?.showNarration?.(
    `${EXPLORE_SPOTTY_COPY}${detail}`,
    { autoDismiss: 1800 }
  );
  void triggerExploreSessionRecovery(reason);
}

async function runExploreSessionRecovery(reason) {
  const session = getExploreSession?.();
  if (
    !session
    || globalThis.navigator?.onLine === false
  ) {
    return { recovered: false, retryable: false };
  }

  if ((session.pendingCount?.() ?? 0) > 0) {
    await session.syncNow({ reason: 'onlineRecovery' });
  }
  if (session.getPauseReason?.() === 'syncRejected') {
    return { recovered: false, retryable: false };
  }
  if ((session.pendingCount?.() ?? 0) > 0) {
    session.pause?.('syncPending');
    return { recovered: false, retryable: true };
  }

  const pausedFor = reason || session.getPauseReason?.();
  if (!RUNWAY_RECOVERY_REASONS.has(pausedFor)) {
    return {
      recovered: session.isPaused?.() !== true,
      retryable: false,
    };
  }
  if (typeof refreshRunwayState !== 'function') {
    return { recovered: false, retryable: false };
  }

  const revision = session.getLocalRevision?.() ?? 0;
  await refreshRunwayState();
  const recovered = (session.getLocalRevision?.() ?? revision) === revision
    && (session.pendingCount?.() ?? 0) === 0
    && session.isPaused?.() !== true;
  return { recovered, retryable: !recovered };
}

function scheduleExploreSessionRecovery() {
  if (runwayRecoveryTimer) return;
  const index = Math.min(
    runwayRecoveryAttempt,
    RUNWAY_RECOVERY_RETRY_MS.length - 1,
  );
  const delay = RUNWAY_RECOVERY_RETRY_MS[index];
  runwayRecoveryAttempt += 1;
  runwayRecoveryTimer = setTimeout(() => {
    runwayRecoveryTimer = null;
    void triggerExploreSessionRecovery();
  }, delay);
}

export function triggerExploreSessionRecovery(reason) {
  if (runwayRecoveryPromise) return runwayRecoveryPromise;
  runwayRecoveryPromise = Promise.resolve()
    .then(() => runExploreSessionRecovery(reason))
    .catch(() => ({ recovered: false, retryable: true }))
    .then(outcome => {
      if (outcome.recovered) {
        runwayRecoveryAttempt = 0;
        if (runwayRecoveryTimer) clearTimeout(runwayRecoveryTimer);
        runwayRecoveryTimer = null;
        updateUI?.();
      } else if (outcome.retryable) {
        scheduleExploreSessionRecovery();
      } else {
        if (runwayRecoveryTimer) clearTimeout(runwayRecoveryTimer);
        runwayRecoveryTimer = null;
      }
      return outcome;
    })
    .finally(() => { runwayRecoveryPromise = null; });
  return runwayRecoveryPromise;
}

function hideExploreSoftPause() {
  updateUI?.();
}

export function wireExploreSessionRecoveryDrains({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
} = {}) {
  if (
    windowTarget
    && exploreSessionOnlineDrainTarget !== windowTarget
    && typeof windowTarget.addEventListener === 'function'
  ) {
    exploreSessionOnlineDrainTarget = windowTarget;
    windowTarget.addEventListener('online', () => {
      void triggerExploreSessionRecovery();
    });
  }

  if (
    documentTarget
    && exploreSessionVisibilityDrainTarget !== documentTarget
    && typeof documentTarget.addEventListener === 'function'
  ) {
    exploreSessionVisibilityDrainTarget = documentTarget;
    documentTarget.addEventListener('visibilitychange', () => {
      if (documentTarget.visibilityState !== 'hidden') {
        void triggerExploreSessionRecovery();
      }
    });
  }
}

function uniqueObjects(values) {
  return values.filter((value, index, list) => (
    value && list.findIndex(candidate => candidate === value) === index
  ));
}

function activeRoomDrafts(draft) {
  const run = draft?.run;
  const currentRoom = run?.currentRoom;
  const preparedRoom = preparedRoomForRunwayCursor(run?.exploreRunway, currentRoom);
  return uniqueObjects([
    draft?.room,
    Number.isInteger(currentRoom) && Array.isArray(run?.rooms)
      ? run.rooms[currentRoom]
      : null,
    preparedRoom?.room,
  ]);
}

function updateSupportRoomDraft(
  mutateRoom,
  { phase = 'room', advance = false, mutateDraft = null } = {},
) {
  const currentState = getGameState?.();
  if (!currentState) return null;
  const draft = cloneStateForExploreSession(currentState);
  if (typeof mutateDraft === 'function') mutateDraft(draft);
  activeRoomDrafts(draft).forEach(room => mutateRoom(room, draft));
  if (advance) {
    advanceStateToBufferedNextRoom(draft);
    alignExploreRunwayCursor(draft);
  } else if (phase) {
    draft.phase = phase;
  }
  updateGameState(draft);
  return draft;
}

function applyPartySkillChoiceToDraft(draft, skillId) {
  draft.run.partySkills = applyPartySkillChoice(draft.run.partySkills || [], skillId);
  syncPartySkillHpBonuses(draft.run.creatureParty, draft.run.partySkills);
}

async function completeWordDiscoveryOptimistically({ learnedWords = [] } = {}) {
  const queued = getExploreSession()?.recordRoomAction('wordDiscovery.complete', { learnedWords });
  if (!queued?.accepted) {
    showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
    return null;
  }

  updateSupportRoomDraft(room => {
    if (room?.wordDiscovery) room.wordDiscovery.completed = true;
    if (room) room.interacted = true;
  }, { phase: 'room' });

  if (learnedWords.length > 0) {
    apiPostCombatRefresh?.(learnedWords).catch(() => {});
  }
  updateUI();
  return queued;
}

function clearActionArea() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('action-area');
  if (el) el.innerHTML = '';
}

// Discovery / shrine guards now live on ExplorationScene (scene-owned state).
// Moving them off the module scope means they reset naturally when we
// transition to a new ExplorationScene on room entry — the prior issue
// where `discoveryState.roomId !== roomId` comparison was needed is now
// structural (fresh scene = fresh state). See ExplorationScene constructor.

/** Show multi-page Cid tutorial narration. Optionally slides her sprite in/out. */
export async function showTutorialNarration(pages, { showSprite = false } = {}) {
  // Any scene with an npcs layer owns the Pixi slide (HubScene during
  // prologue/skillMaster/hub, ExplorationScene inside rooms, BattleScene
  // during combat interjections). See getSceneWithNpcs() above.
  const scene = showSprite ? await waitForSceneWithNpcs() : null;
  const cidSprite = npcSpriteUrl('cid');
  if (showSprite) {
    showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
    if (scene) {
      await scene.showNpcSprite(cidSprite, { slideIn: true });
    }
  }

  for (const page of pages) {
    await sceneModule.showNarration(page, { speaker: 'Cid' });
  }

  if (showSprite) {
    const exitScene = getSceneWithNpcs();
    if (exitScene && exitScene.npcSprite) {
      await exitScene.hideNpcSprite({ slideOut: true });
    }
    hideEnemy();
  }
}

// API functions
let apiGetAreaOptions = null;
let apiSelectArea = null;
let apiReturnToHub = null;
let apiProceed = null;
let apiRoomEncounter = null;
let apiShrineUpgrade = null;
let apiQuizReward = null;
let apiGetQuizQuestion = null;
let apiSubmitQuizAnswer = null;
// Word discovery API functions
let apiGetDiscoveryWords = null;
let apiGetDiscoveryStatus = null;
let apiCompleteDiscovery = null;
let apiSwipeWord = null;
let apiPostCombatRefresh = null;

// Whack-a-Mole API
let apiGetWhackAMolePool = null;
let apiCompleteWhackAMole = null;
let apiGetWhackAMoleDialogue = null;
let apiSkipWhackAMole = null;

// Speed review API
let apiGetDueWords = null;
let apiGetVocabDueCount = null;
let apiStartSpeedReviewRoom = null;
let apiProgressSpeedReviewRoom = null;
let apiCompleteSpeedReviewRoom = null;
let apiClaimTutorialFusionCore = null;
let apiCompleteTutorialFusion = null;
let apiMarkTutorialPostFusionSeen = null;

let apiGetCreatureCollection = null;
let showCollectionSelect = null;
let triggerCreatureSelect = null;
let apiGetKanjiKombatAvailability = null;
let startKanjiKombatSetup = null;

let speedReviewRoomLaunchState = {
  roomId: null,
  starting: false
};
let speedReviewRoomCommitChain = Promise.resolve();
// Skill Master API
let apiSkillMasterOffers = null;
let apiSkillMasterChoose = null;

// Friendly NPC API
let apiGetFriendlyNpcOffers = null;
let apiChooseFriendlyNpcItem = null;

// Shrine API
let apiGetShrineOffers = null;
let apiChooseShrineReward = null;
let apiGetCampfire = null;
let apiCookAtCampfire = null;
let apiFeedCampfireDish = null;
let apiSkipCampfire = null;

// Track whether CID's item-shop tutorial has already been shown this session
let cidItemShopTutorialShown = false;
let postHinonekoReviewNarrationShown = false;
let fusionCoreNarrationShown = false;
let postFusionNarrationShown = false;

// Tutorial API
let apiTutorialAdvance = null;

export function isKanjiModeEnabled(gameState) {
  const meta = gameState?.meta || {};
  if (meta.japaneseDisplayMode === 'natural') return true;
  if (meta.japaneseDisplayMode === 'hiragana') return false;
  if (typeof meta.kanjiMode === 'boolean') return meta.kanjiMode;
  if (meta.kanaMode === true) return false;
  return Number(gameState?.run?.currentArea?.stage || 0) >= 4;
}

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startNewRun = callbacks.startNewRun;
  returnToHub = callbacks.returnToHub;
  finishCombatLoop = callbacks.finishCombatLoop;
  resumeSessionCombatBefriendQuiz = callbacks.resumeSessionCombatBefriendQuiz;
  waitForCombatPlaybackIdle = callbacks.waitForCombatPlaybackIdle || (async () => {});
  refreshRunwayState = callbacks.refreshRunwayState;
  apiGetAreaOptions = callbacks.apiGetAreaOptions;
  apiSelectArea = callbacks.apiSelectArea;
  apiReturnToHub = callbacks.apiReturnToHub;
  apiProceed = callbacks.apiProceed;
  apiRoomEncounter = callbacks.apiRoomEncounter;
  apiShrineUpgrade = callbacks.apiShrineUpgrade;
  apiQuizReward = callbacks.apiQuizReward;
  apiGetQuizQuestion = callbacks.apiGetQuizQuestion;
  apiSubmitQuizAnswer = callbacks.apiSubmitQuizAnswer;
  apiGetDiscoveryWords = callbacks.apiGetDiscoveryWords;
  apiGetDiscoveryStatus = callbacks.apiGetDiscoveryStatus;
  apiCompleteDiscovery = callbacks.apiCompleteDiscovery;
  apiSwipeWord = callbacks.apiSwipeWord;
  apiPostCombatRefresh = callbacks.apiPostCombatRefresh;
  apiGetDueWords = callbacks.apiGetDueWords;
  apiGetVocabDueCount = callbacks.apiGetVocabDueCount;
  apiStartSpeedReviewRoom = callbacks.apiStartSpeedReviewRoom;
  apiProgressSpeedReviewRoom = callbacks.apiProgressSpeedReviewRoom;
  apiCompleteSpeedReviewRoom = callbacks.apiCompleteSpeedReviewRoom;
  apiClaimTutorialFusionCore = callbacks.apiClaimTutorialFusionCore;
  apiCompleteTutorialFusion = callbacks.apiCompleteTutorialFusion;
  apiMarkTutorialPostFusionSeen = callbacks.apiMarkTutorialPostFusionSeen;
  apiGetCreatureCollection = callbacks.apiGetCreatureCollection;
  showCollectionSelect = callbacks.showCollectionSelect;
  triggerCreatureSelect = callbacks.triggerCreatureSelect;
  apiGetKanjiKombatAvailability = callbacks.apiGetKanjiKombatAvailability;
  startKanjiKombatSetup = callbacks.startKanjiKombatSetup;
  apiGetWhackAMolePool = callbacks.apiGetWhackAMolePool;
  apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;
  apiGetWhackAMoleDialogue = callbacks.apiGetWhackAMoleDialogue;
  apiSkipWhackAMole = callbacks.apiSkipWhackAMole;
  apiSkillMasterOffers = callbacks.apiSkillMasterOffers;
  apiSkillMasterChoose = callbacks.apiSkillMasterChoose;
  apiGetFriendlyNpcOffers = callbacks.apiGetFriendlyNpcOffers;
  apiChooseFriendlyNpcItem = callbacks.apiChooseFriendlyNpcItem;
  apiGetShrineOffers = callbacks.apiGetShrineOffers;
  apiChooseShrineReward = callbacks.apiChooseShrineReward;
  apiGetCampfire = callbacks.apiGetCampfire;
  apiCookAtCampfire = callbacks.apiCookAtCampfire;
  apiFeedCampfireDish = callbacks.apiFeedCampfireDish;
  apiSkipCampfire = callbacks.apiSkipCampfire;
  apiTutorialAdvance = callbacks.apiTutorialAdvance;
  showAdventureReport = callbacks.showAdventureReport;
  if (typeof callbacks.apiSyncExploreSession === 'function') {
    configureExploreSession({
      syncRequest: callbacks.apiSyncExploreSession,
      beforeResponseAdoption: () => waitForCombatPlaybackIdle(),
      onCheckpoint: onExploreSessionCheckpoint,
      onCorrection: onExploreSessionCorrection,
      onPause: showExploreSoftPause,
      onResume: hideExploreSoftPause,
    });
    wireExploreSessionRecoveryDrains();
  }
  campfireUI.init({
    apiGetCampfire,
    apiCookAtCampfire,
    apiFeedCampfireDish,
    apiSkipCampfire,
    getExploreSession,
    playTTS: callbacks.playTTS,
    prefetchTTS: callbacks.prefetchTTS,
    getGameState,
    updateGameState,
    updateUI,
    completeCampfireAndProceed: async (completedState) => {
      updateGameState(completedState);
      await proceedToNextRoom();
    },
  });
}

function hasHinonekoFusionData(state = getGameState()) {
  return !!state?.meta?.tutorialFusionDataUnlocked?.includes('hinoneko');
}

function needsPostHinonekoReview(state, dueCount) {
  return hasHinonekoFusionData(state)
    && !state?.meta?.tutorialFusionCoreAwarded
    && dueCount > 0;
}

function needsFusionLabTutorial(state) {
  const collection = state?.meta?.creatureCollection || [];
  return hasHinonekoFusionData(state)
    && state?.meta?.tutorialFusionCoreAwarded
    && !state?.meta?.tutorialFusionComplete
    && !collection.includes('hinoneko');
}

function needsPostFusionMessage(state) {
  const collection = state?.meta?.creatureCollection || [];
  return state?.meta?.tutorialFusionComplete
    && collection.includes('hinoneko')
    && !state?.meta?.tutorialPostFusionNarrationShown
    && !postFusionNarrationShown;
}

function highlightActionButton(labelMatcher) {
  const buttons = document.querySelectorAll('.action-btn, .ui-btn');
  buttons.forEach(btn => {
    if (labelMatcher(btn.textContent || '')) {
      btn.classList.add('tutorial-highlight');
    } else {
      btn.classList.add('tutorial-dimmed');
    }
  });
}

// ============ INVENTORY OVERLAY ============

/** Buff metadata: maps itemBuffs fields to display info */
const BUFF_DISPLAY = {
  attackMult:        { name: '攻撃強化',     nameEn: 'ATK Boost',       icon: '⚔️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  hpMult:            { name: '体力強化',     nameEn: 'HP Boost',        icon: '❤️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  elementEdge:       { name: '属性強化',     nameEn: 'Element Edge',    icon: '🔷', default: 0,   format: v => `+${v.toFixed(2)}` },
  flatDamageReduction: { name: '装甲強化',   nameEn: 'Thick Armor',     icon: '🛡️', default: 0,   format: v => `-${v} dmg` }
};

const PARTY_SKILL_CATALOG_FALLBACK = {
  superEffectiveMend: {
    name: 'Super-Effective Mend',
    desc: 'Strong hits can heal the whole party.'
  },
  hasteSpark: {
    name: 'Haste Spark',
    desc: 'Strong hits can grant the attacker haste.'
  },
  guardPulse: {
    name: 'Guard Pulse',
    desc: 'Strong hits can shield the whole party.'
  },
  battleRhythm: {
    name: 'Battle Rhythm',
    desc: 'Every 5th party attack deals bonus damage.'
  },
  finisherFeast: {
    name: 'Finisher Feast',
    desc: 'Defeating an enemy can heal the whole party.'
  }
};

const PARTY_SKILL_TREE_DISPLAY_FALLBACK = {
  arcStrike: {
    name: 'Arc Strike',
    levels: [
      { desc: 'Your attacks arc to another enemy for 30% damage.' },
      { desc: 'Arc strikes have a 50% chance to bounce one more time.' },
      { desc: 'Arc strike bounces deal 50% more damage per bounce.' },
      { desc: 'Arc strikes always bounce twice when possible.' },
      { desc: 'After the second bounce, arc strikes have a 25% chance to keep bouncing.' }
    ]
  },
  hpMaster: {
    name: 'HP Master',
    levels: [
      { desc: "All ally creatures' max HP increases by 25%." },
      { desc: 'After combat, ally creatures restore 100% more HP.' },
      { desc: 'Healing actions restore 50% more HP.' },
      { desc: 'Healing actions give the healed creature a random buff.' },
      { desc: "All ally creatures' max HP increases by another 100%." }
    ]
  },
  counterMaster: {
    name: 'Counter Master',
    levels: [
      { desc: 'When hit, ally creatures have a 50% chance to counterattack with 7 power.' },
      { desc: 'When hit, ally creatures have a 75% chance to counterattack.' },
      { desc: 'Ally creatures always counterattack when hit.' },
      { desc: 'Counterattacks deal double damage while the countering creature is below 50% HP.' },
      { desc: 'All counterattack damage is doubled.' }
    ]
  },
  buffMaster: {
    name: 'Buff Master',
    levels: [
      { desc: 'Each turn, ally creatures have a 25% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 50% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 75% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures gain a random buff.' },
      { desc: 'When an ally creature acts, it has a 25% chance to give a random ally a random buff.' }
    ]
  },
  expMaster: {
    name: 'Exp Master',
    levels: [
      { desc: 'Ally creatures gain 25% more XP.' },
      { desc: 'Ally creatures gain 50% more XP.' },
      { desc: 'Ally creatures gain 75% more XP.' },
      { desc: 'Ally creatures gain 100% more XP.' },
      { desc: 'When an ally creature levels up, it has a 10% chance to level up again.' }
    ]
  },
  debuffMaster: {
    name: 'Debuff Master',
    levels: [
      { desc: 'Enemies hit by your attacks have a 20% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 40% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 60% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have an 80% chance to receive a random debuff.' },
      { desc: 'When an enemy acts, it has a 50% chance to give one of its own allies a random debuff.' }
    ]
  }
};

// Skill master local cache (for inventory display + to avoid refetch loops)
let skillMasterState = {
  cacheKey: null,
  roomId: null,
  fetched: false,
  offered: null,
  chosenId: null,
  catalogById: { ...PARTY_SKILL_CATALOG_FALLBACK },
  promptTokens: null,
  promptShown: false,
  cidShown: false,
  tutorialNarrationStarted: false
};

function clampPartySkillDisplayLevel(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, n);
}

function getPartySkillInventoryDisplay(skill) {
  const skillId = typeof skill === 'string' ? skill : (skill?.id || skill?.skillId);
  const level = typeof skill === 'object' && skill?.level != null
    ? clampPartySkillDisplayLevel(skill.level)
    : null;
  const meta = skillMasterState.catalogById?.[skillId] || PARTY_SKILL_CATALOG_FALLBACK?.[skillId];
  const tree = PARTY_SKILL_TREE_DISPLAY_FALLBACK[skillId];
  const treeTitle = level && tree ? `${tree.name} - Lvl. ${level}` : null;
  const fallbackName = skill?.name || meta?.name || tree?.name || skillId || '';
  return {
    title: skill?.title || treeTitle || meta?.title || `${fallbackName}${level ? ` Lvl. ${level}` : ''}`,
    desc: skill?.desc || (level && tree?.levels?.[level - 1]?.desc) || meta?.desc || ''
  };
}

function getActiveRoomFromRun(run) {
  const room = getCurrentBufferedRoom({ run });
  return Array.isArray(room) ? room[0] : room;
}

/** Show inventory overlay listing all active persistent item buffs */
function showInventory() {
  // Remove existing overlay if any
  document.getElementById('inventory-overlay')?.remove();

  const gameState = getGameState();
  const itemBuffs = gameState.run?.itemBuffs;
  const partySkills = gameState.run?.partySkills || [];

  // Build list of active buffs (only those that differ from defaults)
  const activeBuffs = [];
  if (itemBuffs) {
    for (const [field, info] of Object.entries(BUFF_DISPLAY)) {
      const value = itemBuffs[field];
      if (value !== undefined && value !== info.default) {
        activeBuffs.push({
          icon: info.icon,
          name: info.name,
          nameEn: info.nameEn,
          value: info.format(value)
        });
      }
    }
  }

  // Collect temp effects from active creatures
  const tempEffects = [];
  const creatures = gameState.creatureParty?.active || [];
  for (const creature of creatures) {
    if (!creature?.activeEffects) continue;
    for (const eff of creature.activeEffects) {
      if (eff.type === 'temp_attack_flat') {
        tempEffects.push({
          icon: '⚔️',
          name: `${creature.nameEn || creature.name} ATK +${eff.value}`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'poison') {
        tempEffects.push({
          icon: '☠️',
          name: `${creature.nameEn || creature.name} Poison`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'attack_buff') {
        tempEffects.push({
          icon: '🔥',
          name: `${creature.nameEn || creature.name} ATK +${eff.percent}%`,
          turns: eff.remainingTurns
        });
      } else if (eff.type === 'shield' || eff.type === 'team_shield') {
        tempEffects.push({
          icon: '🛡️',
          name: `${creature.nameEn || creature.name} Shield`,
          turns: eff.remainingTurns
        });
      }
    }
  }

  const tempHtml = tempEffects.length > 0
    ? `<div class="inventory-section-label" style="font-size:11px;color:var(--text-secondary);margin:12px 0 4px;padding:0 4px">Active Effects</div>` +
      tempEffects.map(e => `
        <div class="inventory-item">
          <span class="inventory-item-icon">${e.icon}</span>
          <div class="inventory-item-info">
            <span class="inventory-item-name">${e.name}</span>
          </div>
          <span class="inventory-item-value" style="font-size:11px">${e.turns != null ? `${e.turns}t` : ''}</span>
        </div>
      `).join('')
    : '';

  const hasAnything = activeBuffs.length > 0 || tempEffects.length > 0 || partySkills.length > 0;

  const buffsHtml = activeBuffs.length > 0
    ? activeBuffs.map(b => `
        <div class="inventory-item">
          <span class="inventory-item-icon">${b.icon}</span>
          <div class="inventory-item-info">
            <span class="inventory-item-name">${isJapanified() ? b.name : b.nameEn}</span>
            <span class="inventory-item-name-ja">${b.name}</span>
          </div>
          <span class="inventory-item-value">${b.value}</span>
        </div>
      `).join('')
    : '';

  const partySkillsHtml = partySkills.length > 0
    ? `<div class="inventory-section-label" style="font-size:11px;color:var(--text-secondary);margin:12px 0 4px;padding:0 4px">Party Skills</div>` +
      partySkills.map(s => {
        const { title, desc } = getPartySkillInventoryDisplay(s);
        return `
          <div class="inventory-item">
            <span class="inventory-item-icon">✨</span>
            <div class="inventory-item-info">
              <span class="inventory-item-name">${escapeHtml(title)}</span>
              ${desc ? `<span class="inventory-item-name-ja" style="opacity:0.7">${escapeHtml(desc)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')
    : '';

  const emptyHtml = !hasAnything
    ? '<div class="inventory-empty">アイテムなし<br><small>No active buffs</small></div>'
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'inventory-overlay';
  overlay.className = 'inventory-overlay';
  overlay.innerHTML = `
    <div class="inventory-backdrop"></div>
    <div class="inventory-panel">
      <div class="inventory-header">
        <span class="inventory-title">インベントリ</span>
        <button class="inventory-close" id="inventory-close-btn">&times;</button>
      </div>
      <div class="inventory-list">${buffsHtml}${tempHtml}${partySkillsHtml}${emptyHtml}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('.inventory-backdrop').addEventListener('click', closeInventory);
  document.getElementById('inventory-close-btn').addEventListener('click', closeInventory);
  playSFX('button-tap');
}

/** Close the inventory overlay */
function closeInventory() {
  const overlay = document.getElementById('inventory-overlay');
  if (overlay) {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  }
}

/** Hub phase — show Speed Review + PvP + Explore buttons */
export async function renderHub() {
  const gameState = getGameState();

  const pvpTeams = gameState.meta?.pvpTeams || [null, null, null];
  const hasPvpTeams = pvpTeams.some(t => t !== null);

  const dueCount = apiGetVocabDueCount ? (await apiGetVocabDueCount().catch(() => ({ count: 0 }))).count : 0;
  const fusionLabDisabled = !hasHinonekoFusionData(gameState);
  const guideFusionLab = needsFusionLabTutorial(gameState);
  const kanjiKombat = (apiGetKanjiKombatAvailability
    ? await apiGetKanjiKombatAvailability().catch(() => ({ available: false }))
    : { available: false }) || { available: false };
  const kanjiKombatDueCount = Math.max(0, Number(kanjiKombat.dueCount) || 0);

  if (getGameState().phase !== 'hub') return;

  renderButtons([
    { label: `📚 Knowledge Review${dueCount > 0 ? ` (${dueCount})` : ''}`, onClick: async () => {
      // Tutorial step 4→5: advance when player clicks speed review
      const isSpeedReviewTutorial = getGameState().meta?.tutorialStep === 4;
      if (isSpeedReviewTutorial) {
        await apiTutorialAdvance?.(4);
      }
      const result = await apiGetDueWords();
      if (result?.words?.length > 0) {
        const shouldAwardFusionCore = hasHinonekoFusionData(getGameState())
          && !getGameState().meta?.tutorialFusionCoreAwarded;
        let fusionCoreAwardedThisReview = false;
        const reviewOptions = {
          showRomaji: true,
          canCloseEarly: !isSpeedReviewTutorial,
          onExit: async () => {
            if (fusionCoreAwardedThisReview && !fusionCoreNarrationShown) {
              fusionCoreNarrationShown = true;
              await showTutorialNarration(getFusionCoreNarration(), { showSprite: true });
            }
            updateUI();
          }
        };
        if (shouldAwardFusionCore) {
          reviewOptions.onComplete = async () => {
            const reward = await apiClaimTutorialFusionCore?.();
            if (reward?.state) updateGameState(reward.state);
            fusionCoreAwardedThisReview = true;
            const anchor = document.getElementById('speed-review-empty') || document.body;
            showWordLevelUp(anchor, '', { message: reward?.message || 'Obtained 1x Fusion Core!' });
          };
        }
        speedReview.start(result.words, reviewOptions);
      } else {
        sceneModule.showNarration('No words to review', { autoDismiss: 2000 });
        updateUI();
      }
    }},
    { label: `Kanji Kombat${kanjiKombatDueCount > 0 ? ` (${kanjiKombatDueCount})` : ''}`, onClick: () => startKanjiKombatSetup?.(), disabled: kanjiKombat.available === false },
    { label: '⚔️ Multiplayer Battle', onClick: () => {
      const gs = getGameState();
      gs.phase = 'pvp_lobby';
      updateUI();
    }, disabled: !hasPvpTeams },
    { label: 'Fusion Lab', disabled: fusionLabDisabled, onClick: () => {
      const gs = getGameState();
      gs.phase = 'fusion_lab';
      updateUI();
    }},
    { label: '⚡ Explore', onClick: () => startNewRun(), primary: true },
  ]);

  let tutorialStep = gameState.meta?.tutorialStep;

  // Tutorial step 3: encourage after first death, then auto-advance to 4
  if (tutorialStep === 3) {
    await showTutorialNarration(getTutorialNarration(3), { showSprite: true });
    await apiTutorialAdvance?.(3);
    tutorialStep = getGameState().meta?.tutorialStep;
  }

  if (guideFusionLab) {
    highlightActionButton(text => text.includes('Fusion Lab'));
  } else {
    // Tutorial step 4: introduce speed review (condition-gated on dueCount > 0)
    if (tutorialStep === 4 && dueCount > 0) {
      const pages = needsPostHinonekoReview(gameState, dueCount)
        ? getPostHinonekoReviewNarration(dueCount)
        : getTutorialNarration(4, { dueCount });
      if (!needsPostHinonekoReview(gameState, dueCount) || !postHinonekoReviewNarrationShown) {
        postHinonekoReviewNarrationShown = true;
        await showTutorialNarration(pages, { showSprite: true });
      }
      highlightActionButton(text => text.includes('Knowledge Review'));
    }

    // Tutorial step 5: guide to formation and re-enter
    if (tutorialStep === 5) {
      const creatureCount = Math.min((gameState.meta?.creatureCollection || []).length, 3);
      await showTutorialNarration(getFormationNarration(creatureCount), { showSprite: true });
      highlightActionButton(text => text.includes('Explore'));
    }
  }

  if (needsPostFusionMessage(gameState)) {
    postFusionNarrationShown = true;
    await showTutorialNarration(getPostFusionNarration(), { showSprite: true });
    const result = await apiMarkTutorialPostFusionSeen?.();
    if (result?.state) updateGameState(result.state);
  }
}

/** Area selection — show area cards, proceed button */
export async function renderAreaSelection() {
  const gameState = getGameState();

  if (gameState.run?.startingCreatureShop?.active) return;

  const areas = await apiGetAreaOptions();
  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Areas Unlocked
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const choiceContainer = document.createElement('div');
  actionArea.appendChild(choiceContainer);

  renderChoices({
    heading: 'Choose an area',
    cards: areas.map(a => ({
      title: `<strong>${a.nameEn || a.name}</strong>`,
      subtitle: a.theme || '',
    })),
    onSelect: async (index) => {
      const result = await apiSelectArea(areas[index].id);
      if (result?.state) {
        updateGameState(result.state);
        // Don't call updateUI() — trigger creature selection first.
        // The area selection UI stays visible underneath the modal overlay.
        await triggerCreatureSelect();
      }
    },
    container: choiceContainer,
  });
}

/** Exploring phase — show Proceed or Fight button */
function cloneStateForExploreSession(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON cloning for plain game-state snapshots.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function preparedRoomForRunwayCursor(runway, currentRoom) {
  if (!Number.isInteger(currentRoom)) return null;
  const preparedRooms = Array.isArray(runway?.preparedRooms) ? runway.preparedRooms : [];
  return preparedRooms.find(preparedRoom => preparedRoom?.index === currentRoom) || null;
}

function nextPreparedRoomAfterRunwayCursor(runway, currentRoom) {
  if (!Number.isInteger(currentRoom)) return null;
  const preparedRooms = Array.isArray(runway?.preparedRooms) ? runway.preparedRooms : [];
  return preparedRooms.find(preparedRoom => preparedRoom?.index === currentRoom + 1) || null;
}

function isCanonicalFinalExploreRoom(state) {
  const run = state?.run;
  const currentRoom = run?.currentRoom;
  const room = state?.room || getActiveRoomFromRun(run);
  const totalRooms = Number.isInteger(run?.totalRooms)
    ? run.totalRooms
    : room?.totalRooms;
  if (!Number.isInteger(currentRoom)
    || !Number.isInteger(totalRooms)
    || totalRooms <= 0
    || currentRoom !== totalRooms - 1) {
    return false;
  }
  // Room metadata is present in canonical browser state. If supplied, require it
  // to agree with the 0-based run cursor so a truncated mid-area runway cannot be
  // mistaken for the terminal room.
  return !Number.isInteger(room?.roomNumber) || room.roomNumber === totalRooms;
}

function isExploreRunwaySessionCapable(runway, run) {
  if (!runway?.sessionEpoch) return false;
  const currentRoom = run?.currentRoom;
  const currentPreparedRoom = preparedRoomForRunwayCursor(runway, currentRoom);
  if (!currentPreparedRoom) return false;
  // Only rooms whose runway grants `proceed` advance through the session — combat
  // rooms (encounter/boss/npcBattle) do NOT, so they still take the legacy path.
  // The server grants `proceed` to every SUPPORT room (Task 8 rider), so a
  // completed support room reaches here and routes through the session.
  //
  // Readiness of the NEXT room is deliberately NOT gated here: the session's own
  // `recordRoomAction('proceed')` owns those semantics — it queues the proceed
  // when the next room is ready, or enters a RESUMABLE pause (nextRoomNotReady /
  // dependency / runwayExhausted) that auto-resumes on the reconnect drain. Gating
  // it here instead dropped support-room advances to the legacy apiProceed, which
  // offline throws → a bare (un-retried) soft pause → the run hangs at the support
  // room forever (Blocker 1, the "shrine soft-pause hang").
  return Array.isArray(currentPreparedRoom.acceptedActions)
    && currentPreparedRoom.acceptedActions.includes('proceed');
}

function alignExploreRunwayCursor(draft) {
  const runway = draft?.run?.exploreRunway;
  if (!runway) return;
  const currentRoom = draft?.run?.currentRoom;
  runway.currentRoom = currentRoom;
  const preparedRoom = preparedRoomForRunwayCursor(runway, currentRoom);
  if (Number.isInteger(preparedRoom?.actionSeq)) {
    runway.roomActionSeq = preparedRoom.actionSeq;
    draft.run.roomActionSeq = preparedRoom.actionSeq;
  }
}

export function applyExploreSessionProceedResult(result) {
  if (!result?.accepted) return null;
  const currentState = getGameState?.();
  if (!currentState) return null;
  const draft = cloneStateForExploreSession(currentState);
  advanceStateToBufferedNextRoom(draft);
  alignExploreRunwayCursor(draft);
  updateGameState(draft);
  return draft;
}

/**
 * Before a LEGACY /api/game/proceed, require a stable, fully drained session.
 * This prevents the legacy cursor from racing ahead of pending support-room
 * choices or actions appended while their drain is in flight.
 */
async function flushPendingSessionBeforeLegacyProceed(session) {
  if (!session) return true;
  const revision = session.getLocalRevision?.() ?? 0;
  try {
    if ((session.pendingCount?.() ?? 0) > 0) {
      await session.syncNow({ reason: 'legacyProceed' });
    }
  } catch {
    return false;
  }
  return (session.pendingCount?.() ?? 0) === 0
    && session.isPaused?.() !== true
    && (session.getLocalRevision?.() ?? revision) === revision;
}

export async function proceedWithRevealBuffer({ refreshUi = true } = {}) {
  const state = getGameState();
  const nextRoom = getNextRoom(state);
  const session = getExploreSession();
  const runway = state.run?.exploreRunway || null;
  // A resolved final room still advertises `proceed`, but there can be no next
  // prepared runway entry. Recording that action in the session yields an
  // empty-log `runwayExhausted` pause forever. The authoritative legacy proceed
  // is the endpoint that performs area completion, so use it only when the run's
  // canonical cursor and total prove this is truly the last room.
  const canUseExploreSession = !isCanonicalFinalExploreRoom(state)
    && isExploreRunwaySessionCapable(runway, state.run);
  if (nextRoom || canUseExploreSession) {
    if (canUseExploreSession) session?.adoptRunway(runway);
    const sessionResult = canUseExploreSession
      ? session?.recordRoomAction('proceed', {})
      : null;
    if (sessionResult?.accepted) {
      const draft = applyExploreSessionProceedResult(sessionResult);
      clearActionArea();
      if (draft) {
        await playRoomTransition(draft, { ingredientDrops: [] });
        if (refreshUi) updateUI();
      }
      return { status: 'queued', actionId: sessionResult.entry.actionId };
    }
    if (sessionResult && !sessionResult.accepted) {
      showExploreSoftPause({ reason: sessionResult.reason });
      return null;
    }

    try {
      if (!await flushPendingSessionBeforeLegacyProceed(session)) {
        showExploreSoftPause({
          reason: session?.getPauseReason?.() || 'syncPending',
        });
        return null;
      }
      const result = await apiProceed();
      if (!result?.state) return result || null;
      updateGameState(result.state);
      // The legacy proceed rebuilds the runway for the NEW room (currentRoom
      // bumped, epoch preserved). Adopt it into the live session BEFORE updateUI
      // so the session cursor advances — otherwise the next room's combat records
      // `encounter.start` with the stale roomIndex and the sync rejects it as
      // room_index_mismatch (a corrected sync). Combat rooms are not
      // session-proceed-capable, so this legacy branch is the only cursor update.
      session?.adoptRunway(result.state.run?.exploreRunway || null);
      clearActionArea();
      const ingredientDrops = result?.ingredientDrops || result?.room?.ingredientDrops || [];
      await playRoomTransition(result.state, { ingredientDrops });
      if (refreshUi) updateUI();
      if (ingredientDrops.length > 0) {
        showIngredientDropPopups(ingredientDrops);
      }
      return result || null;
    } catch {
      showExploreSoftPause();
      return null;
    }
  }

  if (!await flushPendingSessionBeforeLegacyProceed(session)) {
    showExploreSoftPause({
      reason: session?.getPauseReason?.() || 'syncPending',
    });
    return null;
  }
  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    // Adopt the refreshed runway so the session cursor tracks the advanced room
    // before updateUI (mirrors the primary legacy-proceed branch above).
    session?.adoptRunway(result.state.run?.exploreRunway || null);
    clearActionArea();
    await playRoomTransition(result.state, {
      ingredientDrops: result.ingredientDrops || result.room?.ingredientDrops || [],
    });
    if (refreshUi) updateUI();
  }
  return result || null;
}

async function proceedToNextRoom() {
  return proceedWithRevealBuffer();
}

export function renderExploring() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    renderButtons([
      { label: '📦 インベントリ', onClick: showInventory },
      { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
      { label: '⚔️ 戦う', onClick: () => startEncounter(), primary: true },
    ]);
    return;
  }

  renderButtons([
    { label: '📦 インベントリ', onClick: showInventory },
    { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
    { label: '➡️ 進む', onClick: proceedToNextRoom, primary: true },
  ]);
}

/** Area complete — proceed to area selection */
export function renderAreaComplete() {
  const gameState = getGameState();
  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      Area ${areasCompleted} / ${areasToWin} cleared!
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const btnContainer = document.createElement('div');
  actionArea.appendChild(btnContainer);
  renderButtons([
    { label: '次のエリアへ', onClick: () => updateUI(), primary: true },
  ], { container: btnContainer });
}

export async function renderCampfire() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  return campfireUI.show();
}

/** Run complete (game victory) — offer PvP save, then show adventure report */
export function renderRunComplete() {
  if (!showAdventureReport) return;
  // Offer PvP team save before forfeit destroys run data
  renderButtons([
    { label: 'Save Team for PvP', onClick: () => showPvpTeamSaveSlots() },
    { label: 'View Report', onClick: () => showAdventureReport(true), primary: true },
  ]);
}

async function showPvpTeamSaveSlots() {
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];
  const setSaveStatus = (message, color = 'var(--text-primary)') => {
    actions.setContent(`
      <p style="text-align:center;color:${color};margin:0.5rem 0">
        ${message}
      </p>
    `);
  };

  const slots = teams.map((team, i) => {
    const label = team
      ? team.creatureParty.active.map(c => c?.nameEn || '?').join(', ')
      : 'Empty';
    const levelInfo = team
      ? ` — Lv ${team.creatureParty.active.map(c => c?.level || '?').join('/')}`
      : '';
    return {
      label: `Team ${i + 1}${levelInfo}: ${label}`,
      onClick: async () => {
        if (team && !confirm(`Overwrite Team ${i + 1}?`)) return;
        setSaveStatus('Saving team...');
        try {
          const saveResult = await savePvpTeam(i);
          if (saveResult === null || saveResult?.ok === false) {
            throw new Error('PvP team save was not confirmed');
          }
          setSaveStatus('Team saved!', 'var(--accent-primary)');
          await new Promise(resolve => setTimeout(resolve, 700));
          renderRunComplete();
        } catch (error) {
          console.warn('[PvP] Team save failed', error);
          setSaveStatus('Team was not saved. Your draft is still here.', 'var(--danger, #e05252)');
          renderButtons([
            { label: 'Try Again', onClick: () => showPvpTeamSaveSlots(), primary: true },
            { label: 'Cancel', onClick: () => renderRunComplete() },
          ], { append: true });
        }
      }
    };
  });

  slots.push({ label: 'Cancel', onClick: () => renderRunComplete() });
  renderButtons(slots);
}

/** Run ended — show adventure report (or fallback to simple button) */
export function renderRunEnded() {
  if (showAdventureReport) {
    const state = getGameState?.();
    const isKanjiKombatDailyComplete = state?.run?.mode === 'kanjiKombat'
      && state.run?.kanjiKombat?.report?.completedDaily === true;
    showAdventureReport(isKanjiKombatDailyComplete);
  } else {
    renderButtons([
      { label: 'ハブに戻る', onClick: () => returnToHub(), primary: true },
    ]);
  }
}

let shrineState = {
  roomId: null,
  fetched: false,
  rewards: null,
  greeting: null,
  choosing: false,
  greetingShown: false,
};

function shrineCreatureKey(creature) {
  return creature?.uid || creature?.instanceId || creature?.id || '';
}

function shrineCreatures(creatureParty) {
  return [
    ...(creatureParty?.active || []),
    ...(creatureParty?.reserves || [])
  ].filter(Boolean);
}

async function showShrineSprite() {
  const spritePath = spriteUrl('shrine_fox');
  showNpcInDisplay('Shrine Fox', spritePath, { skipPixi: true });
  const scene = await waitForSceneWithNpcs();
  if (scene && !scene.npcSprite) {
    await scene.showNpcSprite(spritePath, { slideIn: true });
  }
}

/** Shrine phase - modern NPC-style reward room */
export async function renderShrine() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  const roomId = room?.id || room?.type || 'unknown';

  if (shrineState.roomId !== roomId) {
    shrineState = {
      roomId,
      fetched: false,
      rewards: null,
      greeting: null,
      choosing: false,
      greetingShown: false,
    };
  }

  if (room?.interacted || room?.shrine?.completed || room?.shrine?.used) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;">Shrine blessing received.</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">The path opens ahead.</div>
      </div>
    `);
    return;
  }

  actions.clear();

  if (!shrineState.fetched) {
    shrineState.fetched = true;
    const fetchRoomId = roomId;
    try {
      const resp = payload || await apiGetShrineOffers?.();
      if (shrineState.roomId !== fetchRoomId) return;
      shrineState.rewards = Array.isArray(resp?.rewards) ? resp.rewards : [
        { id: 'heal_all', title: 'Heal all creatures', description: 'Restore 50% HP to living creatures.' },
        { id: 'restore_mp_all', title: 'Restore MP', description: 'Restore MP for all creatures to full.' },
        { id: 'level_up', title: 'Level up one creature', description: 'Choose one living creature.' }
      ];
      shrineState.greeting = resp?.greeting || null;
      if (resp?.state) updateGameState(resp.state);
    } catch {
      shrineState.fetched = false;
      shrineState.rewards = null;
      shrineState.greeting = null;
      shrineState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { shrineState.fetched = false; renderShrine(); }, primary: true },
      ]);
      return;
    }
  }

  if (!shrineState.greetingShown) {
    shrineState.greetingShown = true;
    await showShrineSprite();
    const greetingTokens = shrineState.greeting?.tokens;
    await showNpcDialogueCard({
      speaker: 'Shrine Fox',
      speakerId: 'shrine_fox',
      ...(greetingTokens?.length
        ? {
            tokens: greetingTokens,
            overrides: shrineState.greeting?.overrides || {},
            useKanji: false,
            audio: shrineState.greeting?.audio,
          }
        : { text: 'こんにちは！' }),
    });
  }

  const rewards = shrineState.rewards || [];
  renderChoices({
    heading: 'Choose shrine blessing',
    cards: rewards.map(reward => ({
      title: reward.title,
      subtitle: reward.description,
    })),
    onSelect: async (index) => {
      if (shrineState.choosing) return;
      const reward = rewards[index];
      if (!reward) return;
      if (reward.id === 'level_up') {
        renderShrineLevelTargets(reward.id);
        return;
      }
      await chooseShrineReward(reward.id, null);
    },
  });
}

function renderShrineLevelTargets(rewardType) {
  const gameState = getGameState();
  const livingCreatures = shrineCreatures(gameState.run?.creatureParty)
    .filter(creature => (creature.hp || 0) > 0);

  if (livingCreatures.length === 0) {
    sceneModule?.showNarration?.('No living creatures can receive this blessing.', { autoDismiss: 2200 });
    renderShrine();
    return;
  }

  renderChoices({
    heading: 'Choose creature to level up',
    cards: livingCreatures.map(creature => ({
      sprite: `<img src="${creatureStaticPath(creature.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
      title: `${creature.nameEn || creature.name || creature.id} Lv.${creature.level} -> Lv.${creature.level + 1}`,
      subtitle: `HP: ${creature.hp}/${creature.maxHp} · MP: ${creature.mp || 0}/${creature.maxMp || 0}`,
    })),
    onSelect: async (index) => {
      const creature = livingCreatures[index];
      if (creature) await chooseShrineReward(rewardType, shrineCreatureKey(creature));
    },
  });
}

async function chooseShrineReward(rewardType, creatureKey) {
  if (shrineState.choosing) return;
  shrineState.choosing = true;
  try {
    playSFX('creature-equip');
    const queued = getExploreSession()?.recordRoomAction('shrine.choose', { rewardType, creatureKey });
    if (!queued?.accepted) {
      shrineState.choosing = false;
      showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
      renderShrine();
      return;
    }
    updateSupportRoomDraft(room => {
      room.shrine ||= {};
      room.shrine.completed = true;
      room.shrine.used = true;
      room.shrine.chosenReward = { rewardType, creatureKey };
      room.interacted = true;
    });
    shrineState.choosing = false;
    actions.clear();
    updateUI();
  } catch {
    shrineState.choosing = false;
    actions.clear();
    showExploreSoftPause();
    renderShrine();
  }
}

/** Quiz phase - stubbed out (quiz rooms removed from bootstrap MVP) */
export async function renderQuiz() {
  // Quiz rooms are not in the room pool for the bootstrap language MVP.
  // If somehow reached, auto-proceed.
  await proceedWithRevealBuffer();
}

/** Word Discovery phase - show flash cards for new words */
export async function renderWordDiscovery() {
  const gameState = getGameState();
  const room = gameState.room;

  // Clear stale content immediately before any async operations
  actions.setContent('');

  if (!room) return;

  // Discovery state is scene-owned now (ExplorationScene.discoveryState),
  // so walking into a new room naturally gets a fresh scene + fresh state.
  // The fallback object is used if we're somehow outside an ExplorationScene
  // (the tutorial path can drive renderWordDiscovery before the scene catches
  // up during a transition window).
  const scene = getSceneWithNpcs();
  const fallback = {
    fetched: false,
    words: [],
    wordsLearned: 0,
    roomId: null,
    statusChecked: false,
    atLimit: false,
    todayCount: 0,
    dailyLimit: 10,
  };
  const discoveryState = scene?.discoveryState ?? fallback;

  // Belt-and-suspenders: if an old ExplorationScene survived (shouldn't, but
  // defensive) and its roomId lags behind the current room, snap it forward.
  const roomId = room.id || room.type || 'unknown';
  if (discoveryState.roomId !== roomId) {
    discoveryState.fetched = false;
    discoveryState.words = [];
    discoveryState.wordsLearned = 0;
    discoveryState.roomId = roomId;
    discoveryState.statusChecked = false;
    discoveryState.atLimit = false;
    discoveryState.todayCount = 0;
    discoveryState.dailyLimit = 10;
  }

  // Stage tracking from server state
  const discovery = room.wordDiscovery || {
    wordsToLearn: 2,
    wordsLearned: 0,
    wordIds: [],
    completed: false
  };

  // If completed on server, show proceed
  if (discovery.completed) {
    renderButtons([
      { label: '続ける', onClick: async () => {
        await proceedWithRevealBuffer();
      }, primary: true },
    ]);
    return;
  }

  // Check discovery status first (only once per room)
  if (!discoveryState.statusChecked) {
    discoveryState.statusChecked = true;
    const status = await apiGetDiscoveryStatus();
    discoveryState.todayCount = status.todayCount;
    discoveryState.dailyLimit = status.dailyLimit;
    discoveryState.atLimit = status.atLimit;

    // If at limit, skip room silently
    if (status.atLimit) {
      await completeWordDiscoveryOptimistically();
      return;
    }
  }

  // If we hit the limit mid-room, stop
  if (discoveryState.atLimit) {
    await completeWordDiscoveryOptimistically();
    return;
  }

  // Fetch words if not already fetched (use module-level state, not room object)
  if (!discoveryState.fetched) {
    discoveryState.fetched = true;

    const result = await apiGetDiscoveryWords(discovery.wordsToLearn);

    if (!result.available || result.words.length === 0) {
      // No new words available - mark complete on server first
      await completeWordDiscoveryOptimistically();
      return;
    }

    // Store words in module-level state (survives gameState updates)
    discoveryState.words = result.words;
  }

  const words = discoveryState.words;
  const currentIndex = discoveryState.wordsLearned;

  if (currentIndex >= words.length) {
    // All words learned - mark complete on server first
    const learnedWords = words.map(w => w.word);
    await completeWordDiscoveryOptimistically({ learnedWords });
    return;
  }

  // Show current word's flash card
  const currentWord = words[currentIndex];

  actions.showFlashCards([currentWord], { discoveryMode: true });

  // Set up swipe handler - we need to use the actions module's init callback mechanism
  // The actions module was initialized with cardSwipe callback, but we need discovery-specific behavior
  // Store original and override temporarily
  const handleDiscoverySwipe = async (rawDetail) => {
    const detail = typeof rawDetail === 'object' && rawDetail !== null
      ? { word: currentWord.word, knew: rawDetail.direction === 'right', ...rawDetail }
      : { word: currentWord.word, knew: rawDetail === 'right' };
    const grade = detail.knew ? 'good' : 'again';
    console.log(`[Discovery] Swiped ${rawDetail} on "${currentWord.word}"`);
    const queued = getExploreSession()?.recordRoomAction('wordDiscovery.review', {
      word: detail.word,
      grade,
    });
    if (!queued?.accepted) {
      showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
      return;
    }

    const nextWordsLearned = Math.min(discoveryState.wordsLearned + 1, discoveryState.words.length);
    updateSupportRoomDraft(room => {
      const draftDiscovery = room?.wordDiscovery;
      if (draftDiscovery) {
        draftDiscovery.wordsLearned = nextWordsLearned;
      }
    }, { phase: 'wordDiscovery' });

    discoveryState.wordsLearned = nextWordsLearned;
    console.log(`[Discovery] Progress: ${discoveryState.wordsLearned}/${discoveryState.words.length} words learned`);

    renderWordDiscovery();
  };

  // The actions module has a test-swipe event listener, but we need to hook into the actual swipe
  // We'll use a custom event approach - dispatch from here when flash card completes
  document.addEventListener('discovery-card-swiped', async function handler(e) {
    document.removeEventListener('discovery-card-swiped', handler);
    await handleDiscoverySwipe(e.detail);
  }, { once: true });

  // Monkey-patch the test-swipe for discovery mode
  const testSwipeHandler = async (e) => {
    document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: e.detail }));
  };
  document.addEventListener('test-swipe', testSwipeHandler, { once: true });
}

function getActiveSpeedReviewRoom(gameState) {
  if (gameState.room?.type === 'speedReviewRoom') {
    return gameState.room;
  }

  const fromRun = getCurrentBufferedRoom(gameState);
  if (fromRun?.type === 'speedReviewRoom') {
    return fromRun;
  }

  return null;
}

async function completeSpeedReviewRoomOptimistically(room, { throwOnFailure = false } = {}) {
  const queued = getExploreSession()?.recordRoomAction('speedReview.complete', { roomId: room?.id });
  if (!queued?.accepted) {
    showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
    if (throwOnFailure) throw new Error(EXPLORE_SPOTTY_COPY);
    return null;
  }

  updateSupportRoomDraft(draftRoom => {
    if (draftRoom?.speedReviewRoom) {
      draftRoom.speedReviewRoom.completed = true;
      draftRoom.speedReviewRoom.reviewedCards = Math.max(
        draftRoom.speedReviewRoom.reviewedCards || 0,
        draftRoom.speedReviewRoom.targetCards || 0
      );
    }
    if (draftRoom) draftRoom.interacted = true;
  }, { phase: 'room' });

  speedReviewRoomLaunchState.roomId = null;
  updateUI();
  return queued;
}

export async function renderSpeedReviewRoom() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = getActiveSpeedReviewRoom(gameState);
  if (!room?.id) {
    return;
  }

  if (speedReview.isActive() && speedReviewRoomLaunchState.roomId === room.id) {
    return;
  }

  if (speedReviewRoomLaunchState.starting) {
    return;
  }

  speedReviewRoomLaunchState.starting = true;
  speedReviewRoomLaunchState.roomId = room.id;
  speedReviewRoomCommitChain = Promise.resolve();
  actions.setContent('');

  try {
    const startResult = await apiStartSpeedReviewRoom(room.id);
    const hasValidSnapshot = Array.isArray(startResult?.snapshotWords);
    const startSucceeded = !!startResult && !startResult.error && hasValidSnapshot;
    if (startResult?.state) {
      updateGameState(startResult.state);
    }

    if (!startSucceeded) {
      console.warn('[SpeedReviewRoom] Start failed or returned invalid payload; skipping auto-complete');
      speedReviewRoomLaunchState.roomId = null;
      return;
    }

    const snapshotWords = startResult.snapshotWords;
    if (snapshotWords.length === 0) {
      await completeSpeedReviewRoomOptimistically(room);
      return;
    }

    speedReview.start(snapshotWords, {
      mode: 'room',
      maxCards: 10,
      canCloseEarly: false,
      showRomaji: true,
      onCommittedReview: async ({ word, commitIndex }) => {
        speedReviewRoomCommitChain = speedReviewRoomCommitChain.then(async () => {
          let lastError = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const progressResult = await apiProgressSpeedReviewRoom(room.id, word.word, commitIndex);
              if (!progressResult || progressResult.error) {
                throw new Error(progressResult?.error || 'No response from speed review room progress API');
              }
              if (progressResult?.state) {
                updateGameState(progressResult.state);
              }
              return progressResult;
            } catch (error) {
              lastError = error;
              if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 250 * attempt));
              }
            }
          }
          throw lastError || new Error('Failed to commit speed review room progress');
        });
        try {
          return await speedReviewRoomCommitChain;
        } catch (error) {
          console.error('[SpeedReviewRoom] Commit failed after retries:', error);
          throw error;
        }
      },
      onComplete: async () => {
        await completeSpeedReviewRoomOptimistically(room, { throwOnFailure: true });
      }
    });
  } finally {
    speedReviewRoomLaunchState.starting = false;
  }
}

// ============ WHACK-A-MOLE MINI GAME ============

let whackAMoleState = {
  roomId: null,
  fetched: false,
  dialogue: null,
  yesLabel: 'Yes',
  noLabel: 'No',
  introShown: false
};
let activeWhackAMoleGame = null;
let activeWhackAMoleRoomId = null;

function getCurrentWhackAMoleRoomId() {
  const state = getGameState();
  const room = getCurrentBufferedRoom(state);
  return room?.id || room?.type || 'whackAMole';
}

function cancelActiveWhackAMoleGame() {
  if (activeWhackAMoleGame && typeof activeWhackAMoleGame.cancel === 'function') {
    activeWhackAMoleGame.cancel();
  }
  activeWhackAMoleGame = null;
  activeWhackAMoleRoomId = null;
}

function markWhackAMoleRoomComplete(room, { score = null, skipped = false } = {}) {
  if (!room) return;
  room.whackAMole ||= {};
  if (score !== null) {
    room.whackAMole.score = Math.max(0, Math.floor(score || 0));
  }
  room.whackAMole.completed = true;
  room.whackAMole.skipped = skipped;
  room.interacted = true;
}

async function completeWhackAMoleOptimistically(score) {
  const session = getExploreSession();
  const queued = session?.recordRoomAction('whackAMole.complete', { score });
  if (!queued?.accepted) {
    if (session?.isPaused?.() !== true) {
      showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
    }
    return null;
  }

  updateSupportRoomDraft(room => {
    markWhackAMoleRoomComplete(room, { score });
  }, { advance: false, phase: 'room' });
  return queued;
}

async function skipWhackAMoleOptimistically() {
  const session = getExploreSession();
  const queued = session?.recordRoomAction('whackAMole.skip', {});
  if (!queued?.accepted) {
    if (session?.isPaused?.() !== true) {
      showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
    }
    return null;
  }

  updateSupportRoomDraft(room => {
    markWhackAMoleRoomComplete(room, { skipped: true });
  }, { advance: false });
  return queued;
}

/** Whack-a-Mole mini game — match Japanese words to creature/item sprites */
export async function renderWhackAMole() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = getCurrentBufferedRoom(gameState);
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  const roomId = room?.id || room?.type || 'whackAMole';

  if (whackAMoleState.roomId !== roomId) {
    if (activeWhackAMoleRoomId && activeWhackAMoleRoomId !== roomId) {
      cancelActiveWhackAMoleGame();
    }
    whackAMoleState = {
      roomId,
      fetched: false,
      dialogue: null,
      yesLabel: 'Yes',
      noLabel: 'No',
      pool: null,
      introShown: false
    };
  }

  // Already completed — auto-proceed (matches renderQuiz pattern).
  if (room?.interacted) {
    try {
      await proceedWithRevealBuffer();
    } catch (err) {
      // The proceed owner normally refreshes. If it throws before it can do so,
      // render a fallback state instead of leaving the completed room visible.
      updateUI();
    }
    return;
  }

  if (!whackAMoleState.fetched) {
    try {
      const hasPayloadDetails = Boolean(
        payload?.dialogue || payload?.labels || payload?.yesTokens || payload?.noTokens || payload?.pool
      );
      const resp = hasPayloadDetails ? payload : await apiGetWhackAMoleDialogue();
      if (resp) {
        whackAMoleState.fetched = true;
        whackAMoleState.dialogue = resp.dialogue || null;
        const yesTokens = resp.yesTokens || resp.labels?.yesTokens || resp.labels?.yes;
        const noTokens = resp.noTokens || resp.labels?.noTokens || resp.labels?.no;
        whackAMoleState.yesLabel = yesTokens?.tokens?.length
          ? renderJpSentence(yesTokens.tokens, getKnownWords(), null, yesTokens.overrides || {}, false)
          : (resp.labels?.yesLabel || resp.yesLabel || 'Yes');
        whackAMoleState.noLabel = noTokens?.tokens?.length
          ? renderJpSentence(noTokens.tokens, getKnownWords(), null, noTokens.overrides || {}, false)
          : (resp.labels?.noLabel || resp.noLabel || 'No');
        whackAMoleState.pool = Array.isArray(resp.pool) ? resp.pool : null;
      }
    } catch (err) {
      // Leave fetched=false so a later rerender can retry.
    }
  }

  if (payload?.pool && !whackAMoleState.pool) {
    whackAMoleState.pool = payload.pool;
  }

  if (!whackAMoleState.introShown && whackAMoleState.dialogue?.tokens?.length) {
    whackAMoleState.introShown = true;
    await showNpcDialogueCard({
      speaker: 'Game Master',
      speakerId: 'game-master',
      tokens: whackAMoleState.dialogue.tokens,
      overrides: whackAMoleState.dialogue.overrides || {},
      useKanji: false,
      audio: whackAMoleState.dialogue.audio,
    });
  }

  renderButtons([
    {
      label: whackAMoleState.yesLabel,
      onClick: async () => {
        // Fetch pool and start game directly (no intermediate start screen)
        let pool;
        if (Array.isArray(whackAMoleState.pool)) {
          pool = whackAMoleState.pool;
        } else {
          try {
            const resp = await apiGetWhackAMolePool();
            pool = resp.pool;
            whackAMoleState.pool = Array.isArray(pool) ? pool : null;
          } catch (err) {
            actions.setContent('<div class="wam-error">Failed to load game data</div>');
            return;
          }
        }

        if (!pool || pool.length < 9) {
          actions.setContent('<div class="wam-error">Not enough creatures/items for game</div>');
          return;
        }

        startWhackAMoleGame(pool);
      }
    },
    {
      label: whackAMoleState.noLabel,
      onClick: async () => {
        cancelActiveWhackAMoleGame();
        actions.clear?.();
        if (!actions.clear) actions.setContent('');
        const scene = getSceneWithNpcs();
        if (scene && !scene.disposed && scene.npcSprite) {
          await scene.hideNpcSprite({ slideOut: true });
        }
        const result = await skipWhackAMoleOptimistically();
        if (result) {
          await proceedWithRevealBuffer();
        }
      }
    }
  ]);
}

/**
 * Slide the defeated NPC's sprite into the active scene before the skill-select
 * prompt. Mirrors showCidForSkillMaster — the defeated challenger is the one
 * offering the skill reward, so the player should see them on screen while
 * the `どの能力？` question is attributed to them.
 */
async function showDefeatedNpcForSkillSelect(npc) {
  if (!npc?.id) return;
  const scene = getSceneWithNpcs();
  const spritePath = npcSpriteUrl(npc.id);
  const displayName = npc.nameEn || npc.name || '';
  showNpcInDisplay(displayName, spritePath, { skipPixi: true });
  if (scene && !scene.npcSprite) {
    await scene.showNpcSprite(spritePath, { slideIn: true });
  }
}

/**
 * Slide Cid's sprite into the active scene for the non-tutorial skillMaster
 * path. Mirrors showTutorialNarration's sprite-show side but without the
 * multi-page narration loop — Cid just appears so the player has a visible
 * speaker for the `どの能力？` prompt.
 */
async function showCidForSkillMaster() {
  const scene = getSceneWithNpcs();
  const cidSprite = npcSpriteUrl('cid');
  if (skillMasterState.cidShown) return;
  skillMasterState.cidShown = true;
  showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
  if (scene) {
    await scene.showNpcSprite(cidSprite, { slideIn: true });
  }
}

/** Skill Master room — placeholder UI (to be expanded in later task) */
export async function renderSkillMaster() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const run = gameState.run;
  const isInitialPick = run?.initialSkillPick && !run.initialSkillPick.chosenId;
  const room = isInitialPick ? null : (gameState.room || getActiveRoomFromRun(run));
  // Detect initial pick on the server side: phase is skillMaster but the
  // current room is NOT a skillMaster room (initialSkillPick is not sent
  // to the frontend, so we infer it).
  const isServerInitialPick = !isInitialPick
    && gameState.phase === 'skillMaster'
    && (!room || room.type !== 'skillMaster');
  // The initial pick is not a room — the runway cursor points at room 0, so
  // its prepared payload belongs to a different room type (a friendlyNpc
  // payload's item `offered` would render as skills; a combat payload would
  // dead-end "Failed to load offers."). Only consume the prepared payload
  // when it belongs to an actual skillMaster room.
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = (!isInitialPick && !isServerInitialPick && prepared?.room?.type === 'skillMaster')
    ? prepared.interactionPayload
    : null;
  const roomId = (isInitialPick || isServerInitialPick)
    ? 'initialSkillPick'
    : (room?.id || room?.type || 'unknown');
  const cacheKey = (isInitialPick || isServerInitialPick)
    ? `${roomId}:${run?.stats?.startTime ?? ''}`
    : roomId;

  // Reset per-room cache
  // For the initial skill pick, include the run start time so same-phase
  // rerenders don't restart Cid narration, but a fresh run won't reuse offers.
  if (skillMasterState.cacheKey !== cacheKey) {
    skillMasterState.cacheKey = cacheKey;
    skillMasterState.roomId = roomId;
    skillMasterState.fetched = false;
    skillMasterState.offered = null;
    skillMasterState.chosenId = null;
    skillMasterState.promptShown = false;
    skillMasterState.cidShown = false;
    skillMasterState.tutorialNarrationStarted = false;
  }

  // If already completed, don't render choices
  const alreadyDone = isInitialPick
    ? run.initialSkillPick.chosenId
    : (room?.interacted || room?.skillMaster?.completed);
  if (alreadyDone) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
          Skill acquired.
        </div>
      </div>
    `);
    return;
  }

  // Tutorial step 0: start Cid narration early so it runs while offers load
  const tutorialStep = getGameState()?.meta?.tutorialStep;
  if (tutorialStep === 0 && !skillMasterState.tutorialNarrationStarted) {
    skillMasterState.tutorialNarrationStarted = true;
    showTutorialNarration(getTutorialNarration(0), { showSprite: true });
  }

  // Render loading state immediately to avoid flashing old buttons
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose one skill.
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading offers…</div>
    </div>
  `);

  // Fetch offers once per room
  if (!skillMasterState.fetched) {
    skillMasterState.fetched = true;
    const fetchCacheKey = cacheKey;
    let resp;
    try {
      resp = payload || await apiSkillMasterOffers?.();
    } catch (err) {
      // Allow retry on next render and avoid caching a bad state
      skillMasterState.fetched = false;
      skillMasterState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { skillMasterState.fetched = false; skillMasterState.offered = null; renderSkillMaster(); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    // Stale async guard: room changed while awaiting offers
    if (skillMasterState.cacheKey !== fetchCacheKey) return;

    const offered = resp?.offered || resp?.offers || resp?.skills || room?.skillMaster?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      skillMasterState.fetched = false;
      skillMasterState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { skillMasterState.fetched = false; skillMasterState.offered = null; renderSkillMaster(); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    skillMasterState.offered = offered;
    skillMasterState.promptTokens = resp?.skillSelectPrompt || null;
    for (const s of offered) {
      if (!s?.id) continue;
      skillMasterState.catalogById[s.id] = {
        title: s.title || s.name || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.name || s.id,
        name: s.name || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.name || s.id,
        desc: s.desc || PARTY_SKILL_CATALOG_FALLBACK?.[s.id]?.desc || ''
      };
    }
  }

  const offers = skillMasterState.offered || room?.skillMaster?.offered || [];

  // Don't wait for Cid narration — render skills immediately so the player
  // can see them while Cid is still talking.
  if (tutorialStep === 0) {
    renderTutorialSkillMaster(offers);
  } else {
    // Slide Cid in so the player sees who's offering them skills. Intentionally
    // not awaited — the choices render in parallel with the slide-in so UI
    // doesn't feel gated on animation.
    showCidForSkillMaster();
    if (!skillMasterState.promptShown && skillMasterState.promptTokens?.tokens?.length) {
      skillMasterState.promptShown = true;
      await showNpcDialogueCard({
        speaker: 'Cid',
        speakerId: 'cid',
        tokens: skillMasterState.promptTokens.tokens,
        overrides: skillMasterState.promptTokens.overrides || {},
        useKanji: false,
        audio: skillMasterState.promptTokens.audio,
      });
    }

    renderChoices({
      heading: 'Choose a skill',
      cards: offers.slice(0, 3).map(s => ({
        title: s.title || skillMasterState.catalogById?.[s.id]?.title || s.name || skillMasterState.catalogById?.[s.id]?.name || s.id,
        subtitle: s.desc || skillMasterState.catalogById?.[s.id]?.desc || '',
      })),
      onSelect: async (index) => {
        const skillId = offers[index]?.id;
        if (skillId) await chooseSkillMasterSkill(skillId);
      },
    });
  }
}

async function chooseSkillMasterSkill(skillId) {
  if (isInitialSkillPickState()) {
    return chooseInitialSkillMasterSkill(skillId);
  }

  const queued = getExploreSession()?.recordRoomAction('skillMaster.choose', { skillId });
  if (!queued?.accepted) {
    showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
    renderSkillMaster();
    return false;
  }

  updateSupportRoomDraft((room, draft) => {
    if (draft.run?.initialSkillPick && !draft.run.initialSkillPick.chosenId) {
      draft.run.initialSkillPick.chosenId = skillId;
    }
    if (room?.skillMaster) {
      room.skillMaster.chosenId = skillId;
      room.skillMaster.completed = true;
      room.interacted = true;
    }
  }, {
    mutateDraft: draft => applyPartySkillChoiceToDraft(draft, skillId),
  });
  skillMasterState.chosenId = skillId;
  actions.clear();
  updateUI();
  return true;
}

async function chooseInitialSkillMasterSkill(skillId) {
  let result;
  try {
    result = await apiSkillMasterChoose?.(skillId);
  } catch (err) {
    console.error('[SkillMaster] Failed to choose initial skill:', err);
    showExploreSoftPause();
    renderSkillMaster();
    return false;
  }

  const nextState = result?.authoritativeState || result?.state;
  if (nextState) {
    updateGameState(nextState);
    getExploreSession()?.adoptRunway(nextState.run?.exploreRunway || null);
    if (nextState.phase !== 'skillMaster') {
      await resetSceneForInitialRoomEntry(nextState);
    }
    updateUI();
    return true;
  }

  showExploreSoftPause();
  renderSkillMaster();
  return false;
}

/** Tutorial step 0: show all 3 skills but only the first is clickable (glows). */
function renderTutorialSkillMaster(offers) {
  const el = document.getElementById('action-area');
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'ui-choice-list';

  offers.slice(0, 3).forEach((s, i) => {
    const btn = document.createElement('div');
    btn.className = 'ui-choice';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;

    if (i === 0) {
      btn.classList.add('tutorial-highlight');
    } else {
      btn.classList.add('tutorial-dimmed');
    }

    const name = s.title || skillMasterState.catalogById?.[s.id]?.title || s.name || skillMasterState.catalogById?.[s.id]?.name || s.id;
    const desc = s.desc || skillMasterState.catalogById?.[s.id]?.desc || '';
    btn.innerHTML = `
      <div class="ui-choice__info">
        <div class="ui-choice__title">${name}</div>
        <div class="ui-choice__subtitle">${desc}</div>
      </div>
    `;

    if (i === 0) {
      let clicked = false;
      btn.addEventListener('click', async () => {
        if (clicked) return;
        clicked = true;
        playSFX('button-tap');
        hapticLight();
        btn.classList.remove('tutorial-highlight');
        btn.classList.add('ui-choice--selected');
        list.querySelectorAll('.ui-choice').forEach(c => {
          c.style.pointerEvents = 'none';
        });

        await chooseSkillMasterSkill(s.id);
      });
    }

    list.appendChild(btn);
  });

  el.appendChild(list);
}

// ============ FRIENDLY NPC ROOM ============

/** Module-level state to avoid refetch across re-renders */
let friendlyNpcState = {
  roomId: null,
  fetched: false,
  offered: null,
  greeting: null,
  choosing: false,
  greetingShown: false,
  renderedCards: null
};

async function showFriendlyNpcSprite(npc) {
  if (!npc) return;
  const spritePath = npc.id
    ? npcSpriteUrl(npc.id)
    : spriteUrl(['enemies', 'systemExecutive']);
  showNpcInDisplay(npc.nameEn || npc.name, spritePath, { skipPixi: true });
  const scene = await waitForSceneWithNpcs();
  if (scene && !scene.npcSprite) {
    await scene.showNpcSprite(spritePath, { slideIn: true });
  }
}

async function showPlayerItemRequest(item) {
  if (item.tokens?.length) {
    await showNpcDialogueCard({
      speaker: 'You',
      tokens: item.tokens,
      overrides: item.overrides || {},
      useKanji: false,
      audio: item.requestAudio,
    });
    return;
  }
  if (item.shopTokens?.length) {
    await showNpcDialogueCard({
      speaker: 'You',
      tokens: item.shopTokens,
      overrides: item.shopOverrides || {},
      useKanji: false,
      audio: item.shopAudio || item.requestAudio,
    });
    return;
  }
  if (item.word) {
    await showNpcDialogueCard({
      speaker: 'You',
      text: `${item.word}、ください`,
    });
  }
}

/**
 * Friendly NPC room — shows 3 item cards (food=heal or weapon=boost).
 * Player picks one; item is applied immediately.
 */
export async function renderFriendlyNpc() {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  const roomId = room?.id || room?.type || 'unknown';
  const roomCacheKey = `${roomId}:${gameState.run?.stats?.startTime ?? ''}`;

  // Reset per-room state when entering a new room
  if (friendlyNpcState.roomId !== roomCacheKey) {
    friendlyNpcState = {
      roomId: roomCacheKey,
      fetched: false,
      offered: null,
      greeting: null,
      choosing: false,
      greetingShown: false,
      renderedCards: null
    };
  }

  // If room already completed (e.g., after reload), show proceed
  if (room?.interacted || room?.friendlyNpc?.completed) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;">アイテムをもらった！</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Item received.</div>
      </div>
    `);
    return;
  }

  actions.clear();

  // Fetch offers once per room
  if (!friendlyNpcState.fetched) {
    friendlyNpcState.fetched = true;
    const fetchRoomId = roomCacheKey;
    let resp;
    try {
      resp = payload || await apiGetFriendlyNpcOffers?.();
    } catch (err) {
      friendlyNpcState.fetched = false;
      friendlyNpcState.offered = null;
      friendlyNpcState.greeting = null;
      friendlyNpcState.renderedCards = null;
      friendlyNpcState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { friendlyNpcState.fetched = false; friendlyNpcState.offered = null; renderFriendlyNpc(); }, primary: true },
      ]);
      return;
    }

    // Stale async guard: room changed while awaiting
    if (friendlyNpcState.roomId !== fetchRoomId) return;

    const offered = resp?.offered || room?.friendlyNpc?.offered;
    if (!Array.isArray(offered) || offered.length === 0) {
      friendlyNpcState.fetched = false;
      friendlyNpcState.offered = null;
      friendlyNpcState.greeting = null;
      friendlyNpcState.renderedCards = null;
      friendlyNpcState.greetingShown = false;
      actions.setContent('');
      renderButtons([
        { label: 'Retry', onClick: () => { friendlyNpcState.fetched = false; friendlyNpcState.offered = null; renderFriendlyNpc(); }, primary: true },
      ]);
      return;
    }

    friendlyNpcState.offered = offered;
    friendlyNpcState.greeting = resp?.greeting || null;
    friendlyNpcState.renderedCards = offered.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: item.nameToken
        ? renderJpSentence([item.nameToken], getKnownWords(), null, {}, false)
        : `${item.word} (${item.reading})`,
      pills: buildItemEffectPills(item),
    }));
    if (resp?.state) {
      updateGameState(resp.state);
    }
  }

  const offers = friendlyNpcState.offered || [];
  const npc = room?.npc;
  const tutorialStep = getGameState()?.meta?.tutorialStep;

  // Show the NPC greeting once; the item cards below carry the choice context.
  if (npc && !friendlyNpcState.greetingShown) {
    friendlyNpcState.greetingShown = true;
    await showFriendlyNpcSprite(npc);
    const greetingTokens = friendlyNpcState.greeting?.tokens;
    await showNpcDialogueCard({
      speaker: npc.nameEn || npc.name,
      ...(npc.id ? { speakerId: npc.id } : {}),
      ...(greetingTokens?.length
        ? {
            tokens: greetingTokens,
            overrides: friendlyNpcState.greeting?.overrides || {},
            useKanji: false,
            audio: friendlyNpcState.greeting?.audio,
          }
        : { text: 'こんにちは！' }),
    });

    // Tutorial step 2: Cid explains items after the shopkeeper's greeting,
    // then the shopkeeper returns before item choices render.
    if (tutorialStep === 2 && !cidItemShopTutorialShown) {
      cidItemShopTutorialShown = true;
      const cidSprite = npcSpriteUrl('cid');
      showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
      const scene = await waitForSceneWithNpcs();
      if (scene) {
        await scene.showNpcSprite(cidSprite, { slideIn: true });
      }

      const [itemShopCidLine] = getTutorialNarration(2);
      if (itemShopCidLine) {
        await sceneModule.showNarration(itemShopCidLine, { speaker: 'Cid' });
      }

      const afterScene = getSceneWithNpcs();
      if (afterScene && !afterScene.disposed && afterScene.npcSprite) {
        await afterScene.hideNpcSprite({ slideOut: true });
      }

      await showFriendlyNpcSprite(npc);
    }
  }

  // Render item cards so they're visible
  renderChoices({
    heading: 'Choose an item',
    cards: friendlyNpcState.renderedCards || offers.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: item.nameToken
        ? renderJpSentence([item.nameToken], getKnownWords(), null, {}, false)
        : `${item.word} (${item.reading})`,
      pills: buildItemEffectPills(item),
    })),
    onSelect: async (index) => {
      if (friendlyNpcState.choosing) return;
      friendlyNpcState.choosing = true;
      const item = offers[index];
      playSFX('creature-equip');

      await showPlayerItemRequest(item);

      const gameState = getGameState();
      const party = gameState.run?.creatureParty?.active || [];
      const isPartyWide = item.effect?.healAllPercent || item.effect?.mpRestorePercent;

      const applyItem = async (creatureIndex) => {
        const queued = getExploreSession()?.recordRoomAction('friendlyNpc.choose', {
          itemId: item.id,
          targetCreatureIndex: creatureIndex,
        });
        if (!queued?.accepted) {
          friendlyNpcState.choosing = false;
          showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
          renderFriendlyNpc();
          return;
        }
        updateSupportRoomDraft(room => {
          room.friendlyNpc ||= {};
          room.friendlyNpc.completed = true;
          room.friendlyNpc.chosenItem = { itemId: item.id, targetCreatureIndex: creatureIndex };
          room.interacted = true;
        });
        friendlyNpcState.choosing = false;
        actions.clear();
        updateUI();
      };

      if (isPartyWide || party.filter(Boolean).length <= 1) {
        await applyItem(0);
      } else {
        renderChoices({
          heading: 'Choose target',
          cards: party.filter(Boolean).map(creature => ({
            sprite: `<img src="${creatureStaticPath(creature.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
            title: `${creature.name} (${creature.nameEn})`,
            subtitle: `Lv.${creature.level} · HP: ${creature.hp}/${creature.maxHp}`,
          })),
          onSelect: (creatureIndex) => applyItem(creatureIndex),
        });
      }
    },
  });
}

function startWhackAMoleGame(pool) {
  cancelActiveWhackAMoleGame();
  activeWhackAMoleRoomId = whackAMoleState.roomId;
  activeWhackAMoleGame = new WhackAMoleGame(pool, {
    actions,
    apiCompleteWhackAMole: completeWhackAMoleOptimistically,
    apiProceed: proceedWithRevealBuffer,
    updateGameState,
    updateUI,
    playSFX,
    isActive: () => getGameState()?.phase === 'whackAMole'
      && getCurrentWhackAMoleRoomId() === activeWhackAMoleRoomId
  });
  activeWhackAMoleGame.start();
}

// ============ NPC BATTLE SKILL REWARD ============

/** Module-level state for npc battle skill selection to avoid refetch loops */
let npcBattleSkillState = {
  roomId: null,
  fetched: false,
  offered: null,
  choosing: false,
  promptTokens: null,
  promptShown: false
};

/**
 * NPC Battle skill reward — shown after NPC dialogue completes.
 * Player picks 1 of 3 party skills as a reward for winning the NPC battle.
 * @param {object} opts - { onSkillChosen(skillId), fetchOffers() }
 */
export async function renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers } = {}) {
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
  const gameState = getGameState();
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  const roomId = room?.id || room?.type || 'unknown-npcbattle';

  // Reset per-room cache when room changes
  if (npcBattleSkillState.roomId !== roomId) {
    npcBattleSkillState = {
      roomId,
      fetched: false,
      offered: null,
      choosing: false,
      promptTokens: null,
      promptShown: false
    };
  }

  // If already completed (e.g. reload after choosing), just show confirmation
  if (!room?.npcBattle?.skillSelectionPending && room?.interacted) {
    actions.setContent(`
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:360px;">
        <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle</div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
          Skill acquired.
        </div>
      </div>
    `);
    return;
  }

  // Show loading state immediately
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
      <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;">
        Choose one skill.
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px;">Loading offers…</div>
    </div>
  `);

  // Fetch offers once per room
  if (!npcBattleSkillState.fetched) {
    npcBattleSkillState.fetched = true;
    const fetchRoomId = roomId;
    const fetchCursor = {
      currentRoom: gameState.run?.currentRoom,
      roomActionSeq: gameState.run?.roomActionSeq,
      sessionEpoch: gameState.run?.exploreRunway?.sessionEpoch,
    };
    let resp;
    try {
      // The npcBattle prepared payload is the combat-start payload (enemies /
      // seedChain), NOT the skill offers — only reuse it when it actually carries
      // offers, otherwise fetch the reward offers from the server. Treating the
      // combat payload as offers reads zero offers and silently auto-proceeds.
      resp = preparedPayloadHasSkillOffers(payload) ? payload : await fetchOffers?.();
    } catch (err) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { npcBattleSkillState.fetched = false; npcBattleSkillState.offered = null; renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers }); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    // Stale async guard: canonical state can advance before the next render has
    // reset this module cache, so verify both the cache and the live run cursor.
    const latestState = getGameState();
    const latestRoom = getActiveRoomFromRun(latestState?.run) || latestState?.room;
    const latestRoomId = latestRoom?.id || latestRoom?.type || 'unknown-npcbattle';
    if (
      npcBattleSkillState.roomId !== fetchRoomId
      || latestRoomId !== fetchRoomId
      || latestState?.run?.currentRoom !== fetchCursor.currentRoom
      || latestState?.run?.roomActionSeq !== fetchCursor.roomActionSeq
      || latestState?.run?.exploreRunway?.sessionEpoch !== fetchCursor.sessionEpoch
    ) return;

    // If fetch returned null (dedup or network), show retry instead of using stale
    // room fallback. room.npcBattle.offered contains raw IDs, not display objects.
    if (!resp) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">NPC Battle Reward</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Loading offers…</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { npcBattleSkillState.fetched = false; npcBattleSkillState.offered = null; renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers }); }, primary: true },
      ], { container: retryContainer });
      return;
    }

    if (resp.state) {
      updateGameState(resp.state);
      getExploreSession()?.adoptRunway(resp.state.run?.exploreRunway || null);
    }
    if (resp.rewardResolved === true) {
      if (!resp.state) {
        npcBattleSkillState.fetched = false;
        npcBattleSkillState.offered = null;
        showExploreSoftPause({ reason: 'missingPayload' });
        return;
      }
      npcBattleSkillState.choosing = true;
      try {
        await proceedWithRevealBuffer();
      } catch {
        // Fall through to updateUI — canonical state may already have advanced.
      }
      updateUI();
      return;
    }

    let offered = resp?.offered || resp?.offers || resp?.skills;
    if (!Array.isArray(offered) || offered.length === 0) {
      npcBattleSkillState.fetched = false;
      npcBattleSkillState.offered = null;
      showExploreSoftPause({ reason: 'missingPayload' });
      return;
    }

    npcBattleSkillState.offered = offered;
    npcBattleSkillState.promptTokens = resp?.skillSelectPrompt || null;
  }

  const offers = npcBattleSkillState.offered || [];

  // The defeated NPC offers the skill reward — resolve them from combat state
  // (available during the immediate post-combat flow) or the room record (for
  // page-reload recovery). Fall back to Cid so the prompt always has a speaker.
  const defeatedNpc = gameState.combat?.npcData || room?.npcBattle?.npc || room?.npc || null;
  const speakerName = defeatedNpc?.nameEn || defeatedNpc?.name || 'Cid';

  // Slide the defeated NPC sprite in (no-op if already on stage) so the
  // player can see who's asking the question. Intentionally not awaited.
  showDefeatedNpcForSkillSelect(defeatedNpc);

  if (!npcBattleSkillState.promptShown && npcBattleSkillState.promptTokens?.tokens?.length) {
    npcBattleSkillState.promptShown = true;
    await showNpcDialogueCard({
      speaker: speakerName,
      ...(defeatedNpc?.id ? { speakerId: defeatedNpc.id } : {}),
      tokens: npcBattleSkillState.promptTokens.tokens,
      overrides: npcBattleSkillState.promptTokens.overrides || {},
      useKanji: false,
      audio: npcBattleSkillState.promptTokens.audio,
    });
  }

  renderChoices({
    heading: 'Choose a skill',
    cards: offers.slice(0, 3).map(s => ({
      title: s.title || s.name || s.id,
      subtitle: s.desc || '',
    })),
    onSelect: async (index) => {
      if (npcBattleSkillState.choosing) return;
      npcBattleSkillState.choosing = true;
      const skillId = offers[index]?.id;
      if (!skillId) {
        npcBattleSkillState.choosing = false;
        return;
      }
      const queued = getExploreSession()?.recordRoomAction('npcBattleSkill.choose', { skillId });
      if (!queued?.accepted) {
        npcBattleSkillState.choosing = false;
        showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
        renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers });
        return;
      }

      updateSupportRoomDraft(room => {
        room.npcBattle ||= {};
        room.npcBattle.chosenSkillId = skillId;
        room.npcBattle.skillSelectionPending = false;
        room.interacted = true;
      }, {
        mutateDraft: draft => applyPartySkillChoiceToDraft(draft, skillId),
      });
      npcBattleSkillState.choosing = false;
      actions.clear();
      updateUI();
    },
  });
}
