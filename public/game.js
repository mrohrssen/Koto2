/**
 * @file game.js - Main Frontend Coordinator
 *
 * PURPOSE:
 * Central orchestrator for the game's frontend. Initializes all UI modules,
 * manages global game state, and coordinates interactions between subsystems.
 * This is the entry point loaded by game.html.
 *
 * KEY EXPORTS: None (entry point module)
 *
 * KEY FUNCTIONS:
 * - updateUI(): Refreshes all UI components based on current game state
 * - updateGameState(newState): Updates local state and syncs to store
 * - showVictoryModal/showGameOverModal: Display combat results
 * - showEnemyDialogue: Display AI-generated enemy dialogue
 *
 * DEPENDENCIES:
 * - js/store.js: Global state store
 * - js/api.js: Server API communication
 * - js/ui/*: UI modules (actions, scene, combat-loop, etc.)
 * - js/settings.js, js/tts.js, js/audio.js: Configuration and audio
 *
 * ARCHITECTURE:
 * On load, checks authentication, fetches game state from server, then
 * initializes all UI modules with dependency injection callbacks. The main
 * loop responds to user actions via UI callbacks and API responses.
 */

import { PLATFORM } from './js/platform.js';

// Register service worker for asset caching (skip in native Capacitor app)
const isLocalDevHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if ('serviceWorker' in navigator && !PLATFORM.isNative && !isLocalDevHost) {
  navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none'  // Always fetch sw.js from network, never cache
  }).then((registration) => {
    // Check for updates immediately
    registration.update();

    // Auto-reload when new SW takes over
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          // New SW activated, reload to get fresh code
          window.location.reload();
        }
      });
    });
  });

  // Listen for cache cleared message
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === 'CACHES_CLEARED') {
      window.location.reload();
    }
  });

  // Reload when controller changes (new SW took over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// Global function to force refresh (can be called from console: forceRefresh())
window.forceRefresh = async function() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('CLEAR_ALL_CACHES');
  } else {
    // No service worker, just clear caches directly and reload
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    window.location.reload(true);
  }
};

// ============ IMPORTS ============
import { store } from './js/store.js';
import * as tts from './js/tts.js';
import * as settings from './js/settings.js';
import * as explorationUI from './js/ui/exploration.js';
import { getExploreSession } from './js/ui/explore-session.js';
import * as economyUI from './js/ui/economy.js';
import * as characterUI from './js/ui/character.js';
import * as modalsUI from './js/ui/modals.js';
import * as combatLoopUI from './js/ui/combat-loop.js';
import { recoil, pop } from './js/ui/dom-effects.js';
import { itemGained } from './js/ui/event-popup.js';
import { dom } from './js/dom.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as creatureRow from './js/ui/creature-row.js';
import * as postCombatShop from './js/ui/post-combat-shop.js';
import * as combatDom from './js/ui/combat-dom.js';
import * as explorationDom from './js/ui/exploration-dom.js';
const scene = { ...combatDom, ...explorationDom };
import * as audio from './js/audio.js';
import * as auth from './js/ui/auth.js';
import * as narrationBox from './js/ui/narration-box.js';
import * as leaderboard from './js/ui/leaderboard.js';
import * as lookup from './js/ui/lookup.js';
import * as bugReport from './js/ui/bug-report.js';
import * as dialogueLookup from './js/ui/dialogue-word-lookup.js';
import * as diagnostics from './js/diagnostics.js';
import * as pvpLobbyUI from './js/ui/pvp-lobby.js';
import * as pvpBattleUI from './js/ui/pvp-battle.js';
import { isPvpBattleActive } from './js/ui/pvp-battle.js';
import * as speedReview from './js/ui/speed-review.js';
import * as kanjiKombatUI from './js/ui/kanji-kombat.js';
import * as chestsUI from './js/ui/chests.js';
import * as fusionLabUI from './js/ui/fusion-lab.js';
import { renderAdventureReport } from './js/ui/adventure-report.js';
import * as crestsEquipUI from './js/ui/crests-equip.js';
import { playChestAnimation } from './js/pixi/chest-animation.js';
import { configureCreatureImg } from './js/ui/sprite-utils.js';
import { combatEvents } from './js/ui/combat-events.js';
import { getHpColor } from './js/ui/combat-ui-utils.js';
import * as speechBubble from './js/ui/speech-bubble.js';
import { init as initExposureBuffer } from './js/ui/exposure-buffer.js';
import { renderButtonsAsync } from './js/ui/ui-components.js';
import { setLang, t, isJapanified } from './js/ui/i18n.js';
import { setKnownWords, addKnownWord, removeKnownWord, renderEnFirst, renderJpSentence, getKnownWords } from './js/ui/bootstrap-client.js';
import { getBattleRewardAnchor, showWordLevelUp } from './js/ui/word-level-up.js';
import { resetClientSessionState } from './js/ui/session-reset.js';
import { playNpcBattleIntro, playTutorialBossInterjection } from './js/ui/room-transition.js';
import { updateCrystalBalance, showDailyCrystalBonusModal } from './js/ui/crystals.js';
import { initNative, onAppLifecycle } from './js/native/index.js';
import { showOffline, showOnline } from './js/ui/connection-banner.js';
import {
  createPendingRunAction,
  correctPendingRunAction,
  confirmPendingRunAction,
  isMatchingRunActionResponse,
} from './js/ui/optimistic-run-action.js';
import { getCurrentRoom } from './js/ui/room-reveal-buffer.js';
import {
  initAnalytics,
  setAnalyticsUser,
  updateCurrentUserProperties,
  setCrashContext,
  trackMilestone,
} from './js/analytics.js';
import { extractGameContext, extractRunEndContext } from './js/analytics-core.js';

// PixiJS battle stage imports
import { initApp, getApp } from './js/pixi/app.js';
import { loadParallax, setScrollState, updateParallax } from './js/pixi/parallax.js';
import { updateParticles, isFrozen } from './js/pixi/effects.js';
import { SceneManager, setSceneManager, isSceneManagerInitialized, getSceneManager } from './js/scenes/scene-manager.js';
import { BattleScene } from './js/scenes/battle-scene.js';
import { ExplorationScene } from './js/scenes/exploration-scene.js';
import { HubScene } from './js/scenes/hub-scene.js';
import { sceneKindForPhase } from './js/scenes/phase-scene-map.js';
import { backgroundImageUrl, creatureStaticUrl, npcSpriteUrl } from './js/assets/asset-urls.js';
import { startAssetManifestLoad } from './js/assets/asset-manifest.js';
import { assetPreloader } from './js/assets/asset-preloader.js';
import { startBackgroundAssetWarmup } from './js/assets/asset-warmup.js';
import { startCreatureAnimationManifestLoad } from './js/pixi/creature-animation-manifest.js';

// API imports - these are the server communication functions
import {
  getGameState as apiGetGameState,
  claimDailyCrystals as apiClaimDailyCrystals,
  setJapaneseDisplayMode as apiSetJapaneseDisplayMode,
  createPlayer as apiCreatePlayer,
  startRun as apiStartRun,
  confirmCreatures as apiConfirmCreatures,
  forfeitRun as apiForfeitRun,
  getAreaOptions as apiGetAreaOptions,
  selectArea as apiSelectArea,
  proceed as apiProceed,
  roomEncounter as apiRoomEncounter,
  getCampfire as apiGetCampfire,
  cookAtCampfire as apiCookAtCampfire,
  feedCampfireDish as apiFeedCampfireDish,
  skipCampfire as apiSkipCampfire,
  startEncounter as apiStartEncounter,
  shopSkip as apiShopSkip,
  getDueWords as apiGetDueWords,
  getVocabDueWords,
  getVocabDueCount,
  reviewVocabWord,
  getAuthHeaders,
  apiUrl,
  getShrineOffers as apiGetShrineOffers,
  chooseShrineReward as apiChooseShrineReward,
  shrineUpgrade as apiShrineUpgrade,
  quizReward as apiQuizReward,
  getQuizQuestion as apiGetQuizQuestion,
  submitQuizAnswer as apiSubmitQuizAnswer,
  getDiscoveryWords as apiGetDiscoveryWords,
  getDiscoveryStatus as apiGetDiscoveryStatus,
  completeDiscovery as apiCompleteDiscovery,
  startSpeedReviewRoom as apiStartSpeedReviewRoom,
  progressSpeedReviewRoom as apiProgressSpeedReviewRoom,
  completeSpeedReviewRoom as apiCompleteSpeedReviewRoom,
  parseLocalText,
  lookupLocalWord,
  getDealerState as apiGetDealerState,
  dealerSell as apiDealerSell,
  dealerBuy as apiDealerBuy,
  dealerLeave as apiDealerLeave,
  startCreatureEncounter as apiStartCreatureEncounter,
  creatureCombatCycle as apiCreatureCombatCycle,
  verifyCreatureCombatCycle as apiVerifyCreatureCombatCycle,
  getKanjiKombatAvailability as apiGetKanjiKombatAvailability,
  startKanjiKombat as apiStartKanjiKombat,
  submitKanjiKombatOnboarding as apiSubmitKanjiKombatOnboarding,
  submitKanjiKombatAnswer as apiSubmitKanjiKombatAnswer,
  refillKanjiKombatPromptBuffer as apiRefillKanjiKombatPromptBuffer,
  syncKanjiKombatSession as apiSyncKanjiKombatSession,
  syncExploreSession as apiSyncExploreSession,
  getCreatureCollection as apiGetCreatureCollection,
  getFusionState as apiGetFusionState,
  startFusion as apiStartFusion,
  claimTutorialFusionCore as apiClaimTutorialFusionCore,
  completeTutorialFusion as apiCompleteTutorialFusion,
  markTutorialPostFusionSeen as apiMarkTutorialPostFusionSeen,
  rollPostCombatShop as apiRollPostCombatShop,
  selectShopItem as apiSelectShopItem,
  swapCreature as apiSwapCreature,
  rearrangeCreatures as apiRearrangeCreatures,
  swapCreatureEquip as apiSwapCreatureEquip,
  befriendReplace as apiBefriendReplace,
  getBefriendConversation as apiGetBefriendConversation,
  submitBefriendAnswer as apiSubmitBefriendAnswer,
  startNpcDialogue,
  respondNpcDialogue,
  getWhackAMolePool as apiGetWhackAMolePool,
  completeWhackAMole as apiCompleteWhackAMole,
  getWhackAMoleDialogue as apiGetWhackAMoleDialogue,
  skipWhackAMole as apiSkipWhackAMole,
  skillMasterOffers as apiSkillMasterOffers,
  skillMasterChoose as apiSkillMasterChoose,
  getFriendlyNpcOffers as apiGetFriendlyNpcOffers,
  chooseFriendlyNpcItem as apiChooseFriendlyNpcItem,
  npcBattleSkillOffers as apiNpcBattleSkillOffers,
  npcBattleSkillChoose as apiNpcBattleSkillChoose,
  isTransientGameStateFailure,
  setConnectionCallbacks,
} from './js/api.js';

const API_BASE = PLATFORM.apiBase;

const assetManifestPromise = startAssetManifestLoad();
startCreatureAnimationManifestLoad();
startBackgroundAssetWarmup({ manifestPromise: assetManifestPromise });

// ============ STATE ============
let gameState = {
  player: null,
  run: null,
  combat: null,
  phase: 'no_save'
};

store.set('gameState', gameState);

function updateGameState(newState) {
  console.log('[DEBUG] updateGameState called. phase:', newState.phase, 'pendingBranch:', newState.run?.pendingBranch, 'currentRoom:', newState.run?.currentRoom);
  gameState = newState;
  store.set('gameState', gameState);
  setCrashContext(gameState);
  updateCurrentUserProperties(gameState);
}

// Enemy dialogue state
let enemyDialogueActive = false;
let dialogueDismissResolve = null;
let dialogueDismissPromise = null;

// Combat animation state
let combatAnimationActive = false;

// Flash card state
let currentFlashCardWord = null;


// ============ UTILITY ============

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ UI UPDATES ============

// Pixi parallax: reload when run area or PvP mode changes (centralized via updateUI).
let lastParallaxAreaKey = undefined;
let lastPhaseForParallax = null;

function mapRunAreaToParallaxId(currentArea) {
  if (currentArea && typeof currentArea === 'object') {
    const pid = currentArea.parallaxId;
    if (typeof pid === 'string' && pid.length > 0) return pid;
    const aid = currentArea.id;
    if (typeof aid === 'string' && aid.length > 0) return aid;
  }
  return 'starter_meadow';
}

function syncParallaxScrollWithPhase() {
  // Walking wobble is toggled on the active scene's formation ctx
  // (ExplorationScene sets walkingEnabled=true; BattleScene leaves it false).
  // The legacy setWalking() calls here targeted the removed _defaultCtx
  // whose updater was never ticked, so they were no-ops — dropped in Task 18.
  if (isPvpBattleActive()) {
    setScrollState('encounter');
    lastPhaseForParallax = gameState.phase;
    return;
  }

  if (gameState.run?.mode === 'kanjiKombat' && combatLoopUI.isKanjiKombatOpeningRevealActive?.()) {
    lastPhaseForParallax = gameState.phase;
    return;
  }

  const p = gameState.phase;
  const prev = lastPhaseForParallax;
  lastPhaseForParallax = p;

  const stoppedPhases = ['combat', 'room_encounter', 'friendlyNpc', 'npc_dialogue', 'dealer', 'skillMaster', 'whackAMole', 'campfire', 'speedReviewRoom'];
  if ((p === 'room' || p === 'exploring') && stoppedPhases.includes(prev)) {
    setScrollState('accelerating');
    return;
  }

  switch (p) {
    case 'exploring':
    case 'room':
    case 'wordDiscovery':
      setScrollState('scrolling');
      break;
    case 'friendlyNpc':
    case 'npc_dialogue':
    case 'dealer':
    case 'skillMaster':
    case 'whackAMole':
    case 'campfire':
    case 'speedReviewRoom':
    case 'room_encounter':
      setScrollState('decelerating');
      break;
    case 'combat':
      setScrollState('encounter');
      break;
    default:
      setScrollState('encounter');
  }
}

async function syncBattleStageParallax() {
  let desiredKey;
  if (isPvpBattleActive()) {
    desiredKey = 'pvp_arena';
  } else if (
    !gameState.run?.active ||
    gameState.phase === 'hub' ||
    gameState.phase === 'no_save' ||
    gameState.phase === 'area_selection' ||
    gameState.phase === 'pvp_lobby' ||
    gameState.phase === 'pvp_team_select'
  ) {
    desiredKey = null;
  } else {
    desiredKey = mapRunAreaToParallaxId(gameState.run?.currentArea);
  }

  if (desiredKey !== lastParallaxAreaKey) {
    lastParallaxAreaKey = desiredKey;
    try {
      await loadParallax(desiredKey);
    } catch (err) {
      console.warn('[Parallax] load failed:', err);
    }
  }

  syncParallaxScrollWithPhase();
}

/**
 * Guarantees every visible phase has an active scene. Called from
 * updateScene() on every updateUI(). Idempotent — skips the transition if
 * the correct scene class is already mounted. Throws are caught and logged
 * so a transient scene bug can't hang UI updates.
 *
 * Phase → scene mapping:
 *   no_save, hub, area_selection, whackAMole, shrine, quiz,
 *   wordDiscovery, speedReviewRoom, dealer, friendlyNpc, npc_skill_selection,
 *   npc_dialogue                → HubScene (or the existing ExplorationScene
 *                                 if we're mid-room). HubScene is used when
 *                                 no run is active; ExplorationScene takes
 *                                 over once rooms begin.
 *   skillMaster                 → ExplorationScene (run-area staging before room entry)
 *   exploring, room, room_encounter, post_combat_shop → ExplorationScene (mounted by room-transition.js)
 *   combat                      → BattleScene (mounted by combat-loop.js / startEncounter)
 */
async function ensureSceneForPhase(phase) {
  const mgr = getSceneManager();
  if (!mgr || mgr.transitioning) return;

  const current = mgr.currentScene;
  const sceneKind = sceneKindForPhase(phase);

  if (sceneKind === 'hub' && !(current instanceof HubScene)) {
    try {
      const allies = gameState.run?.creatureParty?.active ?? [];
      await mgr.transition(HubScene, { allies });
    } catch (err) {
      console.error('[ensureSceneForPhase] HubScene transition failed', err);
    }
    return;
  }

  if (sceneKind === 'exploration' && !(current instanceof ExplorationScene)) {
    try {
      const roomId = gameState.run?.currentRoom ?? null;
      const allies = gameState.run?.creatureParty?.active ?? [];
      await mgr.transition(ExplorationScene, { roomId, allies });
    } catch (err) {
      console.error('[ensureSceneForPhase] ExplorationScene transition failed', err);
    }
    return;
  }

  // For external phases, the relevant scene transition is owned by the code path
  // that drives the phase (e.g. combat-loop.startCombatLoop, room-transition).
  // If a user somehow lands in one of these phases with no scene mounted
  // (e.g. page refresh into a stale friendlyNpc state), fall back to HubScene
  // so at minimum the scene-routed calls don't silently bail.
  if (sceneKind === 'external' && !current) {
    try {
      const allies = gameState.run?.creatureParty?.active ?? [];
      await mgr.transition(HubScene, { allies });
    } catch (err) {
      console.error('[ensureSceneForPhase] fallback HubScene transition failed', err);
    }
  }
}

// Guard flag: when true, updateUI() will NOT call narrationBox.forceHide().
// Set during NPC battle intro so the greeting narration isn't killed by stray updateUI() calls.
let sceneTransitionActive = false;
let lastNarrationHidePhase = null;

function updateUI() {
  // Clear narration on phase transitions, but preserve active dialogue during
  // same-phase refreshes such as skill offer loading in the opening tutorial.
  const phaseChangedForNarration = lastNarrationHidePhase !== gameState.phase;
  if (phaseChangedForNarration && !sceneTransitionActive) {
    narrationBox.forceHide();
  }
  lastNarrationHidePhase = gameState.phase;

  updateStatusBar();

  updateScene();
  updateCreatureRow();
  updatePlayerHP();
  updateGameContent();

  // Update BGM based on current phase
  audio.updateBGMForPhase(gameState.phase);

  // Centralized parallax management
  void syncBattleStageParallax();
}

function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    const currentRoom = getCurrentRoom(gameState);
    const activeRoom = Array.isArray(currentRoom) ? currentRoom[0] : currentRoom;
    const subAreaNameEn = activeRoom?.subArea?.nameEn;
    dom.floorIndicator.textContent = subAreaNameEn || `Area ${(run.areasCompleted || 0) + 1}`;
  } else {
    dom.floorIndicator.textContent = 'Hub';
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;
  updateCrystalBalance(dom.crystalBalance, gameState.meta?.crystals || 0);

  // Room X / total in current area (fixed 30-room layout)
  const rpb = dom.roomProgressBadge;
  if (rpb) {
    const r = gameState.run;
    if (r?.active && r.mode === 'kanjiKombat') {
      rpb.textContent = String(r.kanjiKombat?.wave || 1);
    } else if (r?.active && Number.isInteger(r.totalRooms) && r.totalRooms > 0) {
      const total = r.totalRooms;
      const idx = Number.isInteger(r.currentRoom) ? r.currentRoom : 0;
      const current = Math.min(idx + 1, total);
      rpb.textContent = `${current}/${total}`;
    } else {
      rpb.textContent = '';
    }
  }
}

let npcDialogueRecoveryDone = false;
let combatRecoveryDone = false;
let postCombatShopRecoveryDone = false;

function clearClientSessionState() {
  const nextState = resetClientSessionState(gameState, {
    cleanupCombat: () => combatLoopUI.cleanupCombat(),
    clearActions: () => actions.clear(),
    hideNarration: () => narrationBox.forceHide(),
    hideEnemies: () => scene.hideEnemies(),
    hidePlayerFormation: () => scene.hideFormation('player'),
    resetFlags: () => {
      npcDialogueRecoveryDone = false;
      combatRecoveryDone = false;
      postCombatShopRecoveryDone = false;
      sceneTransitionActive = false;
      lastNarrationHidePhase = null;
      encounterStarting = false;
    }
  });
  updateGameState(nextState);
}

function updateScene() {
  if (gameState.phase !== 'npc_dialogue') npcDialogueRecoveryDone = false;
  if (gameState.phase !== 'combat') combatRecoveryDone = false;
  if (gameState.phase !== 'post_combat_shop') postCombatShopRecoveryDone = false;

  // Guarantee an active scene exists for the current phase. Fire-and-forget:
  // the transition resolves on its own; subsequent updateScene calls are
  // idempotent so the eventual consistency is fine for DOM-side work.
  void ensureSceneForPhase(gameState.phase);

  if (gameState.phase === 'combat') {
    const hideOpeningKanjiKombatEnemies = gameState.run?.mode === 'kanjiKombat'
      && combatLoopUI.isKanjiKombatOpeningRevealActive?.();
    if (hideOpeningKanjiKombatEnemies) {
      scene.hideFormation('enemy');
    } else {
      // Creature combat uses enemies[] array; legacy uses single enemy
      const enemies = gameState.combat?.enemies;
      const isBoss = !!gameState.combat?.isBoss;
      if (enemies?.length > 1) {
        scene.showEnemies(enemies, { isBoss });
      } else {
        const enemy = enemies?.[0] || gameState.combat?.enemy;
        if (enemy) scene.showEnemy(enemy, { isBoss });
      }
    }
    // Show NPC skill bar if this encounter has an NPC
    const npcSkills = gameState.combat?.npcData?.skills;
    if (npcSkills?.length) {
      scene.showNpcSkills(npcSkills);
    }
    // Player formation sprites are spawned by BattleScene.syncCreatures on
    // transition; no legacy pixiShowFormation call needed here.
  } else if (gameState.phase === 'shrine') {
    // Shrine transition/renderShrine own the fox sprite; keep the parallax scene intact.
  } else if (gameState.phase === 'quiz') {
    scene.showQuizMaster();
  } else if (gameState.phase === 'wordDiscovery' || gameState.phase === 'speedReviewRoom') {
    scene.showWordDiscoveryNpc();
  } else if (gameState.phase === 'dealer') {
    scene.showDealer();
  } else if (gameState.phase === 'friendlyNpc' || gameState.phase === 'campfire') {
    // Room transition and room renderers own these sprites; updateScene must not
    // remove and respawn them during the immediate post-travel updateUI pass.
  } else if (gameState.phase === 'whackAMole') {
    scene.showNpcInDisplay('Game Master', npcSpriteUrl('game-master'));
  } else if (gameState.phase === 'npc_skill_selection') {
    // NPC sprite stays visible during skill selection — don't hideEnemies().
    // On page reload the pixi sprite is lost, so recreate it.
    const activeScene = getSceneManager()?.currentScene;
    if (!activeScene?.npcSprite) {
      const room = getCurrentRoom(gameState);
      const npc = room?.npcBattle?.npc || room?.npc;
      if (npc) {
        scene.showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      }
    }
  } else {
    scene.hideEnemies();
  }
  if (gameState.phase === 'quiz') {
    scene.setBackground(backgroundImageUrl('quiz_master_background'));
  } else if (gameState.phase === 'wordDiscovery' || gameState.phase === 'speedReviewRoom') {
    scene.setBackground(backgroundImageUrl('word_discovery_background'));
  } else if (gameState.phase === 'dealer') {
    scene.setBackground(backgroundImageUrl('dealer_background'));
  } else if (gameState.run?.background) {
    // If PixiJS parallax is available for this area, clear the DOM background
    // so it doesn't cover the pixi canvas; otherwise use the old DOM background
    const areaId = gameState.run?.currentArea?.id;
    if (areaId) {
      scene.setBackground(null); // Clear DOM background — PixiJS parallax handles it
      // Parallax loading handled centrally by syncBattleStageParallax() in updateUI()
    } else {
      scene.setBackground(backgroundImageUrl(gameState.run.background.replace(/\.webp$/i, '')));
    }
  } else if (!gameState.run) {
    scene.setBackground(backgroundImageUrl('hub'));
  }
}

function updateCreatureRow() {
  // Hide row on hub, no-save, and area selection (bare run has no creatures yet)
  const hidePhases = ['hub', 'no_save', 'area_selection'];
  if (hidePhases.includes(gameState.phase)) {
    scene.hideFormation('player');
    return;
  }

  if (gameState.run?.creatureParty?.active?.length > 0) {
    // Creature party active: render creature slots
    creatureRow.setReserves(gameState.run.creatureParty.reserves || []);
    creatureRow.render(gameState.run.creatureParty.active);
    return;
  }

  // No creatures - clear the row
  scene.hideFormation('player');
}

function updatePlayerHP() {
  // Player HP display is now handled by individual creature HP bars
}

function updateGameContent() {
  switch (gameState.phase) {
    case 'no_save':
      actions.clear();
      break;
    case 'hub':
      explorationUI.renderHub();
      break;
    case 'fusion_lab':
      fusionLabUI.show();
      break;
    case 'area_selection':
      explorationUI.renderAreaSelection();
      break;
    case 'exploring':
      explorationUI.renderExploring();
      break;
    case 'room_encounter':
      // Auto-start combat — skip the "Fight" button
      startEncounter();
      break;
    case 'room':
      // Auto-advance past completed rooms — skip the "Proceed" dead state
      autoProceed();
      break;
    case 'shrine':
      explorationUI.renderShrine();
      break;
    case 'quiz':
      explorationUI.renderQuiz();
      break;
    case 'wordDiscovery':
      explorationUI.renderWordDiscovery();
      break;
    case 'speedReviewRoom':
      explorationUI.renderSpeedReviewRoom();
      break;
    case 'dealer':
      economyUI.renderDealerRoom(actions);
      break;
    case 'whackAMole':
      explorationUI.renderWhackAMole();
      break;
    case 'campfire':
      explorationUI.renderCampfire();
      break;
    case 'skillMaster':
      explorationUI.renderSkillMaster();
      break;
    case 'friendlyNpc':
      explorationUI.renderFriendlyNpc();
      break;
    case 'npc_skill_selection':
      explorationUI.renderNpcBattleSkillSelection({
        onSkillChosen: async (skillId, options = {}) => {
          const result = await apiNpcBattleSkillChoose(skillId, options);
          if (result?.status === 'corrected') {
            if (result.authoritativeState) {
              updateGameState(result.authoritativeState);
            }
            return result;
          }
          if (!result?.state) {
            throw new Error(result?.error || 'No game state from server');
          }
          // Slide NPC out via the active scene (BattleScene after NPC win,
          // or ExplorationScene on page-reload recovery) before transitioning.
          const npcHostScene = getSceneManager()?.currentScene;
          if (npcHostScene && !npcHostScene.disposed && !npcHostScene._exiting && npcHostScene.npcSprite) {
            await npcHostScene.hideNpcSprite({ slideOut: true });
          }
          scene.hideNpcTrainer();
          updateGameState(result.state);
          if (npcHostScene instanceof BattleScene) {
            const roomId = result.state?.run?.currentRoom ?? null;
            const allies = result.state?.run?.creatureParty?.active ?? [];
            await getSceneManager()?.transition(ExplorationScene, { roomId, allies });
          }
          updateUI();
          return result;
        },
        fetchOffers: apiNpcBattleSkillOffers
      });
      break;
    case 'combat':
      // On page reload, the combat loop isn't running. Re-initialize it
      // so the player sees their current combat state and can pick moves.
      if (!combatLoopUI.isCombatActive() && !combatRecoveryDone) {
        combatRecoveryDone = true;
        combatLoopUI.startCombatLoop({ recovery: true });
      }
      break;
    case 'npc_dialogue':
      // Normally handled inline by combat-loop's handleCombatEnd().
      // On page reload, the combat flow isn't running, so we must restart
      // the dialogue here to prevent the player from getting stuck.
      if (!combatLoopUI.isNpcDialogueActive() && !npcDialogueRecoveryDone) {
        npcDialogueRecoveryDone = true;
        combatLoopUI.runNpcDialogue().then(() => updateUI());
      }
      break;
    case 'post_combat_shop':
      // On page reload, the shop flow isn't running. Re-trigger it so the
      // player can complete their item selection. rollPostCombatShop returns
      // the saved items when postCombatShop is already active on the server.
      if (!postCombatShopRecoveryDone) {
        postCombatShopRecoveryDone = true;
        showPostCombatShopFlow().then(() => {
          loadGameState().then(state => {
            if (state) {
              updateGameState(state);
              updateUI();
            }
          });
        });
      }
      break;
    case 'area_complete':
      explorationUI.renderAreaComplete();
      break;
    case 'run_complete':
      explorationUI.renderRunComplete();
      break;
    case 'run_ended':
      explorationUI.renderRunEnded();
      break;
    case 'pvp_lobby':
      pvpLobbyUI.renderPvpLobby();
      break;
    case 'pvp_team_select':
      pvpLobbyUI.renderPvpTeamSelect();
      break;
  }
}

// ============ AUTO-PROCEED ============
let autoProceedInFlight = false;
async function autoProceed() {
  if (autoProceedInFlight) return;
  autoProceedInFlight = true;
  try {
    await explorationUI.proceedWithRevealBuffer();
  } catch (error) {
    console.warn('[autoProceed] Failed to proceed:', error);
  } finally {
    autoProceedInFlight = false;
  }
}

// ============ ENEMY DIALOGUE ============
function showEnemyDialogue(text, type = 'possessed') {
  if (!text) return Promise.resolve();
  enemyDialogueActive = true;

  const speaker = gameState.combat?.enemy?.name || gameState.combat?.enemy?.nameEn;

  // Speak dialogue via TTS if enabled
  if (settings.isTtsEnabled()) {
    tts.speakText(text);
  }

  dialogueDismissPromise = narrationBox.show(text, { speaker }).then(() => {
    enemyDialogueActive = false;
    dialogueDismissResolve = null;
    dialogueDismissPromise = null;
    // Resume combat after mid-combat dialogue (e.g., glitching at 30% HP)
    if (combatLoopUI.isCombatActive() && !combatLoopUI.isCombatPausedForVocab()) {
      combatLoopUI.executeEnemyAttackThenPause();
    }
  });
  dialogueDismissResolve = () => narrationBox.forceHide();
  return dialogueDismissPromise;
}

// ============ API CALLS ============
async function loadKnownWords() {
  const token = localStorage.getItem('authToken');
  try {
    const resp = await fetch(apiUrl('/api/game/known-words'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      const data = await resp.json();
      setKnownWords(data.words);
    }
  } catch (e) {
    console.warn('Failed to load known words:', e);
  }

  // Bark pool is now provided per-round in combat cycle responses (data.barks).
  // No client-side fetch needed.
}

async function drainExploreSessionBeforeStateFetch(reason = 'stateFetch') {
  const session = getExploreSession?.();
  if (!session || session.pendingCount?.() === 0) return;
  try {
    await session.syncNow({ reason });
  } catch (error) {
    console.warn('[ExploreSession] state fetch drain failed:', error?.message || error);
  }
}

async function apiGetGameStateAfterExploreDrain(reason = 'stateFetch') {
  await drainExploreSessionBeforeStateFetch(reason);
  return apiGetGameState();
}

async function loadGameState() {
  const data = await apiGetGameStateAfterExploreDrain();
  if (isTransientGameStateFailure(data)) {
    scene.showToast?.('Connection is slow. Retrying...', 3000);
    return null;
  }

  if (data.player) {
    updateGameState(data);
    const allCreatureIds = [
      ...(data.creatureParty?.active || []),
      ...(data.creatureParty?.reserves || []),
    ].filter(Boolean).map(r => r.id);
    assetPreloader.enqueue(
      allCreatureIds.map(id => creatureStaticUrl(id)),
      { priority: 'immediate' }
    );
  } else {
    // Preserve server meta for fresh accounts (e.g., prologueComplete flag).
    updateGameState({
      ...data,
      player: null,
      run: null,
      combat: null,
      phase: data.phase || 'no_save'
    });
  }
  return data;
}

async function claimDailyCrystalBonus() {
  const result = await apiClaimDailyCrystals();
  if (!result?.ok) return;

  updateGameState({
    ...gameState,
    meta: {
      ...(gameState.meta || {}),
      crystals: result.balance,
      lastCrystalLoginDate: result.today
    }
  });
  updateCrystalBalance(dom.crystalBalance, result.balance);

  if (result.awarded) {
    showDailyCrystalBonusModal({ amount: result.amount, balance: result.balance });
  }
}


// ============ PROLOGUE ============
let _prologueCache = null;

async function playPrologue() {
  if (!_prologueCache) {
    const resp = await fetch(apiUrl('/api/game/prologue'), { headers: getAuthHeaders() });
    if (!resp.ok) return;
    _prologueCache = await resp.json();
  }

  actions.clear();

  // Guardrail: prologue assumes an active scene with an npcs layer.
  // The boot-time sceneManager.transition(HubScene, ...) in initGame() should
  // have mounted HubScene already; this is a fast-fail check so a regression
  // in the boot wire-up surfaces as a console error instead of an invisible
  // Cid. (playPrologue runs without a preceding updateUI() call.)
  const activeScene = getSceneManager()?.currentScene;
  if (!activeScene || activeScene.disposed || !activeScene.layers?.npcs) {
    console.error('[playPrologue] no scene with npcs layer mounted — Cid will be invisible');
  }

  scene.setBackground(backgroundImageUrl('areas/hajimari-no-hiroba/hajimari-no-hiroba_01'));

  let lastChoiceId = null;

  for (const prologueScene of _prologueCache) {
    if (prologueScene.conditional && prologueScene.conditional !== lastChoiceId) {
      continue;
    }

    // Show/hide Cid sprite based on speaker
    if (prologueScene.speaker === 'Cid') {
      scene.showCid();
    } else {
      scene.hideCid();
    }

    // jpDemo: render Japanese tokens with ruby romaji above + stacked English below.
    // Tokens are resolved server-side (see /api/game/prologue). Narration-box
    // attaches dialogueLookup click handlers automatically when html: true.
    if (prologueScene.type === 'jpDemo' && prologueScene.tokens) {
      actions.showPrologueContinueHint();
      const html = renderJpSentence(prologueScene.tokens, getKnownWords(), null, {}, false);
      await narrationBox.show(html, {
        html: true,
        speaker: prologueScene.speaker || undefined
      });
      continue;
    }

    // Garbled lines: show raw text, no bootstrap rendering
    if (prologueScene.type === 'garbled') {
      actions.showPrologueContinueHint();
      await narrationBox.show(prologueScene.narration, {
        speaker: prologueScene.speaker || undefined,
        garbled: true
      });
      continue;
    }

    const showOpts = {
      html: true,
      speaker: prologueScene.speaker || undefined
    };

    const html = prologueScene.narration ? renderEnFirst(prologueScene.narration) : '';
    let result = undefined;

    if (prologueScene.choices?.length > 0) {
      actions.clear();
      await narrationBox.show(html, { ...showOpts, persistent: true });
      const choiceIdx = await renderButtonsAsync(
        prologueScene.choices.map(c => ({
          label: renderEnFirst(typeof c === 'string' ? c : c.text),
        }))
      );
      actions.clear();
      narrationBox.forceHide();
      const chosen = prologueScene.choices[choiceIdx];
      result = chosen.id ?? chosen.text;
      lastChoiceId = result;
      if (chosen.displayMode) {
        const displayResult = await apiSetJapaneseDisplayMode(chosen.displayMode);
        if (displayResult?.state) {
          updateGameState(displayResult.state);
        }
      }
    } else {
      actions.showPrologueContinueHint();
      await narrationBox.show(html, showOpts);
    }

  }

  actions.clear();
  scene.hideCid();

  // Auto-select fire starter
  await fetch(apiUrl('/api/game/select-starter'), {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ starterId: 'starter-fire' })
  });

  // Mark prologue as complete on server
  await fetch(apiUrl('/api/game/prologue-complete'), {
    method: 'POST',
    headers: getAuthHeaders()
  });

  // First run ever: skip hub/area/team selection — go straight to Starting Meadow
  const isFirstRun = (gameState.meta?.lifetimeStats?.totalRuns ?? 0) === 0 && !gameState.run;
  if (isFirstRun) {
    const runResult = await apiStartRun({});
    if (runResult?.error === 'insufficient_crystals') {
      scene.showToast('Come back tomorrow for more crystals.', 3000);
      return;
    }
    if (runResult?.state) updateGameState(runResult.state);
    if (runResult?.state) {
      await trackMilestone('koto_first_run_started', extractGameContext(runResult.state), 'first_run_started');
    }
    const areaResult = await apiSelectArea('hajimari-no-hiroba');
    if (areaResult?.state) {
      updateGameState(areaResult.state);
      await trackMilestone('koto_area_selected', extractGameContext(areaResult.state), 'area_selected');
    }
    const confirmResult = await apiConfirmCreatures(['hi']);
    if (confirmResult?.state) {
      updateGameState(confirmResult.state);
      await trackMilestone('koto_party_confirmed', {
        ...extractGameContext(confirmResult.state),
        party_size: confirmResult.state.run?.creatureParty?.active?.length || 0
      }, 'party_confirmed');
    }
  } else {
    // Replaying prologue — just update meta and return to hub
    updateGameState({
      ...gameState,
      meta: {
        ...(gameState.meta || {}),
        prologueComplete: true
      }
    });
  }
}

// ============ GAME ACTIONS ============
async function createCharacter() {
  const result = await apiCreatePlayer('Hacker', {}, 0);
  if (result?.state) {
    updateGameState(result.state);
    await trackMilestone('koto_player_created', extractGameContext(result.state), 'player_created');
    await trackMilestone('koto_prologue_started', extractGameContext(result.state), 'prologue_started');
    await playPrologue();
    await trackMilestone('koto_prologue_completed', extractGameContext(gameState), 'prologue_completed');
    updateUI();
  }
}

function removeCollectionOverlay() {
  const gameApp = document.querySelector('.game-app');
  gameApp?.querySelector('.collection-select')?.remove();
}

async function startNewRun() {
  diagnostics.logAction('start_run');

  const result = await apiStartRun({});
  if (result?.error === 'insufficient_crystals') {
    scene.showToast('Come back tomorrow for more crystals.', 3000);
    return;
  }

  if (result?.state) {
    updateGameState(result.state);
    await trackMilestone('koto_first_run_started', extractGameContext(result.state), 'first_run_started');
    updateUI();

    // Tutorial: advance step 5→6 (tutorial complete)
    if (gameState?.meta?.tutorialStep === 5) {
      try {
        await fetch(apiUrl('/api/game/tutorial-advance'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedStep: 5 })
        });
      } catch (e) { console.warn('[Tutorial] advance failed:', e); }
    }
  }
}

async function triggerCreatureSelect() {
  const collectionResult = await apiGetCreatureCollection();
  const catalog = collectionResult?.catalog;
  const collection = collectionResult?.collection;

  if (!catalog || catalog.length === 0) return;

  const starterIds = await showCollectionSelect(catalog, collection);
  if (!starterIds || starterIds.length === 0) {
    removeCollectionOverlay();
    // Player cancelled — forfeit the bare run and return to hub
    await apiForfeitRun();
    const state = await apiGetGameStateAfterExploreDrain('creatureSelectCancel');
    if (state) {
      updateGameState(state);
      updateUI();
    }
    return;
  }

  removeCollectionOverlay();

  const result = await apiConfirmCreatures(starterIds);
  if (result?.state) {
    updateGameState(result.state);
    await trackMilestone('koto_party_confirmed', {
      ...extractGameContext(result.state),
      party_size: starterIds.length
    }, 'party_confirmed');
    updateUI();
  }
}

async function showKanjiKombatCidSprite() {
  const activeScene = getSceneManager()?.currentScene;
  const cidSprite = npcSpriteUrl('cid');
  scene.showNpcInDisplay('Cid', cidSprite, { skipPixi: true });
  if (activeScene && !activeScene.disposed && !activeScene._exiting && activeScene.layers?.npcs) {
    await activeScene.pauseForNpcInterjection?.({ fadeEnemies: true });
    await activeScene.showNpcSprite(cidSprite, { slideIn: true });
  }
}

function restoreKanjiKombatEnemyFormation() {
  if (gameState?.phase !== 'combat') return;
  if (gameState?.run?.mode !== 'kanjiKombat') return;
  const enemies = gameState?.combat?.enemies || [];
  if (enemies.length === 0) return;
  scene.showFormation?.('enemy', enemies, { force: true });
}

async function hideKanjiKombatCidSprite() {
  const activeScene = getSceneManager()?.currentScene;
  if (activeScene && !activeScene.disposed && !activeScene._exiting) {
    if (activeScene.npcSprite) await activeScene.hideNpcSprite({ slideOut: true });
    await activeScene.resumeFromNpcInterjection?.();
  }
  scene.hideEnemy();
  restoreKanjiKombatEnemyFormation();
}

function isKanjiKombatCombatState(state) {
  return state?.phase === 'combat'
    && state?.run?.mode === 'kanjiKombat'
    && !!state?.combat;
}

async function enterKanjiKombatCombat(state) {
  updateGameState(state);
  actions.clear();
  await combatLoopUI.startCombatLoop({ kanjiKombatOpening: true });
}

async function recoverKanjiKombatStartState() {
  let recoveredState = null;
  try {
    recoveredState = await apiGetGameStateAfterExploreDrain('kanjiKombatStartRecovery');
  } catch (error) {
    console.warn('[KanjiKombat] start state recovery failed:', error?.message || error);
    return false;
  }

  if (!isKanjiKombatCombatState(recoveredState)) return false;
  await enterKanjiKombatCombat(recoveredState);
  return true;
}

async function startKanjiKombatSetup() {
  const collection = gameState.meta?.creatureCollection || [];
  if (collection.length === 0) {
    narrationBox.show('Befriend a creature before entering Kanji Kombat.', { autoDismiss: 2000 });
    return;
  }

  const collectionResult = await apiGetCreatureCollection();
  const catalog = collectionResult?.catalog;
  const ownedCollection = collectionResult?.collection;
  if (!catalog || catalog.length === 0) return;

  const starterIds = await showCollectionSelect(catalog, ownedCollection || collection, {
    title: 'Choose One Creature',
    confirmLabel: 'Start Kanji Kombat',
    confirmBusyLabel: 'Starting Kanji Kombat...',
    maxSelections: 1,
    usePointBudget: false,
  });
  const creatureId = starterIds?.[0];
  if (!creatureId) {
    removeCollectionOverlay();
    return;
  }

  try {
    const result = await apiStartKanjiKombat(creatureId);
    if (isKanjiKombatCombatState(result?.state)) {
      await enterKanjiKombatCombat(result.state);
    } else if (!result?.state) {
      await recoverKanjiKombatStartState();
    }
  } finally {
    removeCollectionOverlay();
    updateUI();
  }
}

function showCollectionSelect(catalog, collection, options = {}) {
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const MAX_POINTS = options.maxPoints ?? 10;
  const maxSelections = options.maxSelections ?? Infinity;
  const usePointBudget = options.usePointBudget !== false;
  const title = options.title || t('selectTeam');
  const confirmLabel = options.confirmLabel || null;
  const confirmBusyLabel = options.confirmBusyLabel || null;

  return new Promise((resolve) => {
    const selected = new Set();
    let usedPoints = 0;
    let inspectedId = null;
    let confirming = false;

    // Element emoji map
    const ELEMENT_EMOJI = { water: '\u{1F4A7}', fire: '\u{1F525}', earth: '\u{1F30D}', metal: '\u2699\uFE0F', wood: '\u{1F33F}' };

    // Rarity display names
    const RARITY_LABELS = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

    // Build full display name: "Kamedor the Ancient Turtle"
    function fullName(r) {
      const meaning = r.meaning;
      if (r.modifier && meaning) {
        return `${r.nameEn} the ${r.modifier.meaning} ${meaning.charAt(0).toUpperCase() + meaning.slice(1)}`;
      }
      return r.nameEn;
    }

    function ownedCount(r) {
      return Number.isFinite(r?.ownedCount) ? r.ownedCount : 0;
    }

    function isAvailable(r) {
      return collection.includes(r.id) && ownedCount(r) > 0;
    }

    // Render the owned creature card HTML
    function renderOwnedCard(r) {
      const el = ELEMENT_EMOJI[r.element] || '';
      const movesHtml = (r.learnset || []).slice(0, 4).map(entry => {
        const lvl = entry.level || '?';
        const name = entry.nameEn || entry.moveId || '';
        return `<span class="cc-move-tag">Lv${lvl} ${name}</span>`;
      }).join('');
      return `
        <div class="creature-card" data-element="${r.element}">
          <div class="cc-hero">
            <div class="cc-sprite"><img data-creature-id="${r.id}" alt="${r.nameEn}" /></div>
            <div class="cc-meta">
              <div class="cc-name">${fullName(r)}</div>
              <div class="cc-sub">${el} ${r.element.charAt(0).toUpperCase() + r.element.slice(1)} · ${r.archetype || ''}</div>
              <div class="cc-creature-stats">
                <span class="cc-stat"><span class="cc-stat-val">${r.baseHp}</span>&nbsp;<span class="cc-stat-lbl">HP</span></span>
                <span class="cc-stat"><span class="cc-stat-val">${r.baseAttack}</span>&nbsp;<span class="cc-stat-lbl">ATK</span></span>
                <span class="cc-stat"><span class="cc-stat-val">${r.baseDefense ?? 5}</span>&nbsp;<span class="cc-stat-lbl">DEF</span></span>
                <span class="cc-stat"><span class="cc-stat-val">${r.baseMp || '?'}</span>&nbsp;<span class="cc-stat-lbl">MP</span></span>
                <span class="cc-stat"><span class="cc-stat-lbl">${RARITY_LABELS[r.rarity] || r.rarity}</span></span>
                <span class="cc-stat"><span class="cc-stat-lbl">${r.pointCost} pts</span></span>
              </div>
            </div>
          </div>
          <div class="cc-skills">
            <div class="cc-sk">
              <div class="cc-sk-head"><span class="cc-sk-tag atk">MOVES</span></div>
              <div class="cc-sk-meta cc-moves-list">${movesHtml || 'None'}</div>
            </div>
          </div>
          <div class="cc-foot">
            <span>${r.pointCost} pts</span>
            <span>Owned x${ownedCount(r)}</span>
            <span>Befriended ${r.befriendCount || 0}x</span>
          </div>
        </div>`;
    }

    // Render redacted card for unowned creatures
    function renderRedactedCard(r) {
      const el = ELEMENT_EMOJI[r.element] || '';
      return `
        <div class="creature-card cc-redacted" data-element="${r.element}">
          <div class="cc-qmarks">???</div>
          <div class="cc-unknown">Unknown Creature</div>
          <div class="cc-tags">
            <span class="cc-tag">${el} ${r.element.charAt(0).toUpperCase() + r.element.slice(1)}</span>
            <span class="cc-tag">${RARITY_LABELS[r.rarity] || r.rarity}</span>
          </div>
          <div class="cc-hint">Befriend this creature to unlock its details</div>
        </div>`;
    }

    // Sort: common first, then by element within rarity
    const sorted = [...catalog].sort((a, b) => {
      const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      if (ri !== 0) return ri;
      return a.element.localeCompare(b.element);
    });

    let overlayBuilt = false;

    function render() {
      const remaining = usePointBudget ? MAX_POINTS - usedPoints : Infinity;
      const budgetClass = usePointBudget
        ? (remaining <= 0 ? 'budget-full' : remaining <= 3 ? 'budget-tight' : 'budget-ok')
        : 'budget-ok';

      const gameApp = document.querySelector('.game-app');
      let overlay = gameApp.querySelector('.collection-select');

      // --- First render: build entire overlay, bind handlers ---
      if (!overlay || !overlayBuilt) {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'collection-select';
          gameApp.appendChild(overlay);
        }

        const cellsHtml = sorted.map(r => {
          const owned = isAvailable(r);
          const discovered = collection.includes(r.id);
          return `
            <div class="collection-cell${!owned ? ' unowned' : ''}" data-id="${r.id}" data-rarity="${r.rarity}" data-element="${r.element}">
              <img data-creature-id="${r.id}" alt="${r.nameEn}" />
              ${owned ? `<span class="point-badge">${r.pointCost}</span>` : ''}
              ${discovered ? `<span class="owned-count-badge">x${ownedCount(r)}</span>` : ''}
              <span class="creature-name">${discovered ? r.nameEn : '???'}</span>
            </div>
          `;
        }).join('');

        overlay.innerHTML = `
          <div class="collection-header">
            <span class="collection-title">${title}</span>
            <div class="top-hud-right">
              ${usePointBudget ? `<span class="collection-points ${budgetClass}">${usedPoints} / ${MAX_POINTS} pts</span>` : ''}
              <button class="hud-chip hud-btn" id="collection-menu-btn" type="button" aria-label="Menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="collection-card-area">
            <div class="creature-card-prompt">Tap a creature to view its stats</div>
          </div>
          <div class="collection-grid">${cellsHtml}</div>
          <button class="action-btn action-btn-primary" id="collection-confirm-btn" disabled>
            ${t('startRun', 0, 's')}
          </button>
        `;

        // Configure all creature sprites once
        overlay.querySelectorAll('img[data-creature-id]').forEach(img => {
          const cid = img.dataset.creatureId;
          const row = sorted.find(r => r.id === cid);
          configureCreatureImg(img, cid, el => { el.style.display = 'none'; }, row);
        });

        scene.setBackground(backgroundImageUrl('hub'));

        // Bind click handlers once
        overlay.querySelectorAll('.collection-cell').forEach(cell => {
          cell.addEventListener('click', () => {
            if (confirming) return;
            const id = cell.dataset.id;
            const creature = sorted.find(r => r.id === id);
            if (!creature) return;

            inspectedId = id;

            const owned = isAvailable(creature);
            if (owned) {
              if (selected.has(id)) {
                selected.delete(id);
                if (usePointBudget) usedPoints -= creature.pointCost;
              } else {
                if (selected.size >= maxSelections) {
                  selected.clear();
                  usedPoints = 0;
                }
                if (usePointBudget && creature.pointCost > MAX_POINTS - usedPoints) {
                  render();
                  return;
                }
                selected.add(id);
                if (usePointBudget) usedPoints += creature.pointCost;
              }
            }
            render();
          });
        });

        document.getElementById('collection-confirm-btn')?.addEventListener('click', () => {
          if (confirming) return;
          if (selected.size > 0) {
            confirming = true;
            overlay.classList.add('collection-select--pending');
            render();
            resolve([...selected]);
          }
        });

        document.getElementById('collection-menu-btn')?.addEventListener('click', () => {
          if (confirming) return;
          modalsUI.toggleMenu();
        });

        overlayBuilt = true;
      }

      // --- Update pass: touch only what changed (no innerHTML rebuild) ---

      // Update cell classes
      overlay.querySelectorAll('.collection-cell').forEach(cell => {
        const id = cell.dataset.id;
        const row = sorted.find(r => r.id === id);
        const owned = row ? isAvailable(row) : false;
        const isSelected = selected.has(id);
        const tooExpensive = usePointBudget && owned && !isSelected && (row?.pointCost || 0) > remaining;
        cell.classList.toggle('selected', isSelected);
        cell.classList.toggle('too-expensive', tooExpensive);
      });

      // Update budget
      const pointsEl = overlay.querySelector('.collection-points');
      if (pointsEl && usePointBudget) {
        pointsEl.textContent = `${usedPoints} / ${MAX_POINTS} pts`;
        pointsEl.className = `collection-points ${budgetClass}`;
      }

      // Update inspection card area (only part that needs innerHTML)
      const cardArea = overlay.querySelector('.collection-card-area');
      if (cardArea) {
        if (!inspectedId) {
          cardArea.innerHTML = '<div class="creature-card-prompt">Tap a creature to view its stats</div>';
        } else {
          const inspected = sorted.find(r => r.id === inspectedId);
          if (inspected) {
            const owned = isAvailable(inspected);
            const discovered = collection.includes(inspected.id);
            cardArea.innerHTML = owned || discovered ? renderOwnedCard(inspected) : renderRedactedCard(inspected);
            // Configure sprites in the card
            cardArea.querySelectorAll('img[data-creature-id]').forEach(img => {
              const cid = img.dataset.creatureId;
              const row = sorted.find(r => r.id === cid);
              configureCreatureImg(img, cid, el => { el.style.display = 'none'; }, row);
            });
          }
        }
      }

      // Update confirm button
      const confirmBtn = document.getElementById('collection-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = confirming || selected.size === 0;
        confirmBtn.toggleAttribute('aria-busy', confirming);
        confirmBtn.innerHTML = confirming
          ? (confirmBusyLabel || confirmLabel || t('startRun', selected.size, selected.size !== 1 ? 's' : ''))
          : (confirmLabel || t('startRun', selected.size, selected.size !== 1 ? 's' : ''));
      }

      const menuBtn = document.getElementById('collection-menu-btn');
      if (menuBtn) {
        menuBtn.disabled = confirming;
      }
    }

    render();
  });
}

function showCollectionToast(additions) {
  for (const creature of additions) {
    const toast = document.createElement('div');
    toast.className = 'collection-toast';
    toast.innerHTML = `
      <img />
      <span class="toast-text">${t('newCreature', creature.nameEn)}</span>
    `;
    configureCreatureImg(
      toast.querySelector('img'),
      creature.id,
      null,
      { id: creature.id, name: creature.name, nameEn: creature.nameEn, element: creature.element }
    );
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

let encounterStarting = false;
async function startEncounter() {
  if (encounterStarting) return;
  encounterStarting = true;
  try {
    diagnostics.logAction('start_encounter', { floor: gameState.run?.floor });
    const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
    const exploreSession = getExploreSession?.();
    if (exploreSession?.pendingCount?.() > 0) {
      await exploreSession.syncNow({ reason: 'combatStart' });
      if (exploreSession.pendingCount() > 0) {
        narrationBox.show('Connection is spotty. Combat will start when your progress syncs.', { autoDismiss: 1800 });
        return;
      }
    }

    let result;
    if (hasCreatures) {
      result = await apiStartCreatureEncounter();
    } else if (gameState.phase === 'room_encounter') {
      result = await apiRoomEncounter();
    } else {
      result = await apiStartEncounter();
    }

    if (!result?.state) {
      return;
    }

    updateGameState(result.state);

    // Store bootstrap NPC dialogue for use after combat (defeatLine)
    if (result.npcDialogue) {
      gameState._npcDialogue = result.npcDialogue;
    }

    // For NPC battles: play NPC intro before rendering combat.
    // Lock scene transition so updateUI() won't kill the greeting narration.
    if (result?.npc && hasCreatures) {
      sceneTransitionActive = true;
      try {
        // Bug #9 fix: mount BattleScene with the allies seeded but NO enemies.
        // The enemies are held off-stage while the NPC slides in, speaks, and
        // slides out; playNpcBattleIntro then reveals them via syncCreatures
        // so the player sees NPC-alone → NPC-leaves → enemies-appear. Prior
        // behaviour seeded enemies immediately, so they rendered at full alpha
        // overlapping the speaking NPC.
        const combatAllies  = gameState.combat?.allies  ?? [];
        const combatEnemies = gameState.combat?.enemies ?? [];
        try {
          const mgr = getSceneManager();
          await mgr.transition(BattleScene, {
            allies:  combatAllies,
            enemies: [],
            isBoss: !!gameState.combat?.isBoss,
          });
        } catch (sceneErr) {
          console.error('[StartEncounter] BattleScene transition before NPC intro failed', sceneErr);
        }
        await playNpcBattleIntro(
          result.npc,
          (name, id, npc, opts) => scene.showNpcTrainer(name, id, npc, opts),
          () => scene.hideNpcTrainer(),
          result.npcDialogue,
          { enemies: combatEnemies, allies: combatAllies, isBoss: !!gameState.combat?.isBoss },
        );
      } finally {
        sceneTransitionActive = false;
      }
    }

    // Hide enemy formation before updateUI to prevent visual flash.
    // Set opacity:0 (not visibility:hidden) so layout is computed but nothing paints.
    const ef = document.getElementById('enemy-formation');
    if (hasCreatures && gameState.combat?.enemies?.length && ef) {
      ef.style.opacity = '0';
    }

    updateUI();

    // Non-creature encounters: show possessed dialogue (legacy path)
    if (!hasCreatures) {
      const enemy = gameState.combat?.enemy;
      if (result?.dialogue || enemy?.dialogue?.possessed) {
        const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
          ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
          : enemy.dialogue.possessed);
        await showEnemyDialogue(text, 'possessed');
      }
    }

    // Creature encounters: make enemy formation visible (PixiJS handles entrance animation)
    if (hasCreatures && gameState.combat?.enemies?.length) {
      const freshEf = document.getElementById('enemy-formation');
      if (freshEf) freshEf.style.opacity = '1';
    }

    if (result?.tutorialBossIntro?.lines?.length) {
      await playTutorialBossInterjection(
        result.tutorialBossIntro.lines,
        (name, id, npc, opts) => scene.showNpcTrainer(name, id, npc, opts),
        () => scene.hideNpcTrainer(),
        (line, opts) => narrationBox.show(line, opts),
        gameState.combat?.enemies || [],
        { waitFn: delay },
      );
    }

    await delay(300);
    startCombatLoop();
  } catch (error) {
    console.warn('[StartEncounter] Failed to start encounter:', error?.message || error);
    narrationBox.show('Connection is spotty. Combat will start when your progress syncs.', { autoDismiss: 1800 });
  } finally {
    encounterStarting = false;
    sceneTransitionActive = false;
  }
}


async function returnToHub() {
  diagnostics.logAction('return_to_hub');
  if (combatLoopUI.isCombatActive()) {
    combatLoopUI.cleanupCombat();
  }
  const endingState = gameState;
  await apiForfeitRun();
  await trackMilestone('koto_first_run_ended', extractRunEndContext({
    ...endingState,
    run: {
      ...(endingState.run || {}),
      stats: {
        ...(endingState.run?.stats || {}),
        endTime: Date.now()
      }
    }
  }, 'forfeit'), 'first_run_ended');
  await loadGameState();
  updateUI();
}

// ============ COMBAT ============
function startCombatLoop() { combatLoopUI.startCombatLoop(); }
function resumeCombatAfterVocab() { combatLoopUI.resumeCombatAfterVocab(); }

// Returns a Promise that resolves once loadGameState + updateUI have run.
// combat-loop.stopCombatLoop awaits this before transitioning
// BattleScene → ExplorationScene so player sprites stay visible through
// the victory window (ghost-formation fix).
function showVictoryModal(result) {
  audio.stopBGM();
  actions.clear();

  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }

  for (const reward of result.tutorialRewards || []) {
    if (reward.type === 'fusionData') {
      const anchor = getBattleRewardAnchor();
      showWordLevelUp(anchor, '', { message: reward.message || 'Obtained Hineko Fusion Data!' });
    }
  }

  return (async () => {
    try {
      await loadGameState();
      updateUI();
    } catch (err) {
      console.error('[showVictoryModal] state reload failed', err);
    }
  })();
}

// Returns a Promise that resolves when the player dismisses the report via
// "return to hub" (returnToHubCb fires loadGameState + updateUI). Awaited by
// stopCombatLoop so BattleScene stays up through the defeat screen.
async function showAdventureReport(isVictory, outcome = isVictory ? 'victory' : 'defeat') {
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const endingState = gameState;
  const response = await apiForfeitRun(isVictory);
  const summary = response?.runSummary || {};
  await trackMilestone('koto_first_run_ended', {
    ...extractRunEndContext({
      ...endingState,
      run: {
        ...(endingState.run || {}),
        stats: {
          ...(endingState.run?.stats || {}),
          endTime: Date.now()
        }
      }
    }, outcome),
    ...(summary.durationMs ? { duration_sec: Math.round(summary.durationMs / 1000) } : {})
  }, 'first_run_ended');
  return new Promise((resolve) => {
    const returnToHubCb = async () => {
      takeover.close('gameover');
      try {
        await loadGameState();
        updateUI();
      } finally {
        resolve();
      }
    };
    renderAdventureReport(content, summary, isVictory, returnToHubCb);
  });
}

function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');
  actions.clear();

  updateCreatureRow();
  return showAdventureReport(false);
}

// ============ FLASH CARD HANDLERS ============
function handleCardFlip() {
  if (currentFlashCardWord?.word) {
    tts.speakText(currentFlashCardWord.word);
  }
}

// ============ CREATURE COMBAT HANDLERS ============
function canRetryPostCombatShop(state) {
  return state?.phase === 'post_combat_shop' || state?.run?.postCombatShop?.active === true;
}

async function showPostCombatShopFlow() {
  try {
    const shopResult = await apiRollPostCombatShop();
    if (!shopResult?.items?.length) return;

    return new Promise((resolve) => {
      postCombatShop.init({
        itemSelectedCallback: async (itemIdx) => {
          const selectedItem = shopResult.items[itemIdx];
          const isPartyWide = selectedItem?.effect?.healAllPercent || selectedItem?.effect?.mpRestorePercent;
          const active = gameState.run?.creatureParty?.active?.filter(Boolean) || [];

          const finalize = async (targetIdx) => {
            const pending = createPendingRunAction({
              state: gameState,
              actionType: 'postCombatShop.select',
              applyLocal: draft => {
                if (draft.run) {
                  draft.run.pendingPostCombatShopSelection = { itemIndex: itemIdx, targetIndex: targetIdx };
                }
              },
            });
            updateGameState(pending.state);
            const verification = apiSelectShopItem(itemIdx, targetIdx, { actionId: pending.actionId })
              .then(result => ({ result }), error => ({ error }));

            const selectedCard = document.querySelector('.shop-item-card.selected');
            if (selectedCard) {
              const itemName = selectedCard.querySelector('.shop-item-name')?.textContent || 'Item';
              pop(selectedCard, 1.15);
              itemGained(selectedCard, `+${itemName}`);
              await new Promise(r => setTimeout(r, 600));
            }
            postCombatShop.hide();
            const { result, error } = await verification;
            if (error || !result) {
              updateGameState(pending.originalState);
              scene.showToast('Item choice did not save. Please choose again.', 2500);
              if (canRetryPostCombatShop(pending.originalState)) {
                postCombatShop.show(shopResult.items);
                return;
              }
              resolve();
              return;
            }
            if (result.status === 'corrected') {
              const correctedState = correctPendingRunAction(pending, result);
              updateGameState(correctedState);
              scene.showToast('Item choice did not save. Please choose again.', 2500);
              if (canRetryPostCombatShop(correctedState)) {
                postCombatShop.show(shopResult.items);
                return;
              }
              resolve();
              return;
            }
            updateGameState(confirmPendingRunAction(pending, result));
            resolve();
          };

          if (isPartyWide || active.length <= 1) {
            await finalize(0);
          } else {
            postCombatShop.showTargetPicker(active, finalize);
          }
        }
      });
      postCombatShop.show(shopResult.items);
    });
  } catch (e) {
    console.error('Post-combat shop error:', e);
  }
}

// ============ CREATURE EQUIP UI ============
async function openCreatureEquipView() {
  const party = gameState.run?.creatureParty;
  if (!party) return;

  takeover.open('creatureEquip');
  const content = takeover.getContent('creatureEquip');

  function renderCreatureEquipContent() {
    const active = party.active || [];
    const reserves = party.reserves || [];
    /** Match combat + creature-row: item food/equipment attackMult */
    const atkMult = Number(gameState.run?.itemBuffs?.attackMult) || 1;
    const displayAtk = (base) => {
      const n = Math.max(1, Math.floor(Number(base) || 0));
      const raw = n * atkMult;
      if (atkMult <= 1) return Math.max(1, Math.floor(raw));
      let o = Math.floor(raw);
      if (o === n && raw > n + 1e-9) o = n + 1;
      return Math.max(1, o);
    };

    const ELEMENT_ICONS = creatureRow.ELEMENT_ICONS || { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };
    const ELEMENT_COLORS = creatureRow.ELEMENT_COLORS || { wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3' };
    const rarityStars = (rarity) => { const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity]; return n ? `<span style="color:#FFD700">${n}★</span>` : ''; };

    const activeHtml = active.map((creature, i) => {
      if (!creature) return `<div class="creature-equip-slot empty" data-type="active" data-index="${i}"><span style="opacity:0.4">${t('emptySlot')}</span></div>`;
      const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
      return `
        <div class="creature-equip-slot" data-type="active" data-index="${i}" data-creature-id="${creature.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[creature.element] || '#666'}">
          <img class="creature-equip-sprite" data-creature-id="${creature.id}" alt="">
          <div class="creature-equip-info">
            <div class="creature-equip-name">${ELEMENT_ICONS[creature.element] || ''} ${creature.nameEn} ${rarityStars(creature.rarity)} <span style="opacity:0.6">Lv${creature.level}</span></div>
            <div class="creature-equip-stats">HP: ${creature.hp}/${creature.maxHp} | ATK: ${displayAtk(creature.attack)}</div>
            <div class="creature-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="creature-hp-fill" style="width:${hpPct}%;background-color:${getHpColor(hpPct)}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const reservesHtml = reserves.length > 0 ? reserves.map((creature, i) => {
      if (!creature) return '';
      const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
      return `
        <div class="creature-equip-slot" data-type="reserve" data-index="${i}" data-creature-id="${creature.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[creature.element] || '#666'}">
          <img class="creature-equip-sprite" data-creature-id="${creature.id}" alt="">
          <div class="creature-equip-info">
            <div class="creature-equip-name">${ELEMENT_ICONS[creature.element] || ''} ${creature.nameEn} ${rarityStars(creature.rarity)} <span style="opacity:0.6">Lv${creature.level}</span></div>
            <div class="creature-equip-stats">HP: ${creature.hp}/${creature.maxHp} | ATK: ${displayAtk(creature.attack)}</div>
            <div class="creature-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="creature-hp-fill" style="width:${hpPct}%;background-color:${getHpColor(hpPct)}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<p style="padding:16px;opacity:0.6;text-align:center">${t('noReserves')}</p>`;

    content.innerHTML = `
      <h3 style="margin:16px">${t('equippedCreatures')}</h3>
      <div class="creature-equip-list">${activeHtml}</div>
      <h3 style="margin:16px">${t('reserveCreatures')}</h3>
      <div class="creature-equip-list">${reservesHtml}</div>
      <p style="padding:8px 16px;opacity:0.5;font-size:0.8em;text-align:center">${t('swapInstruction')}</p>
    `;

    const partyById = new Map();
    for (const c of [...active, ...reserves]) {
      if (c?.id) partyById.set(c.id, c);
    }
    content.querySelectorAll('.creature-equip-sprite[data-creature-id]').forEach(img => {
      const cid = img.dataset.creatureId;
      configureCreatureImg(img, cid, el => { el.style.display = 'none'; }, partyById.get(cid));
    });

    // Selection logic: tap active then reserve to swap
    let selectedActive = null;
    let selectedReserve = null;

    content.querySelectorAll('.creature-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('click', async () => {
        // Clear previous selections
        content.querySelectorAll('.creature-equip-slot').forEach(s => s.classList.remove('selected'));
        selectedActive = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedReserve !== null) {
          // Both selected: perform swap
          const result = await apiSwapCreatureEquip(selectedActive, selectedReserve);
          if (result?.creatureParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.creatureParty.active;
            party.reserves = result.creatureParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderCreatureEquipContent(); // Re-render with updated data
          updateCreatureRow(); // Update main UI creature row
        }
      });
    });

    content.querySelectorAll('.creature-equip-slot[data-type="reserve"]').forEach(el => {
      el.addEventListener('click', async () => {
        content.querySelectorAll('.creature-equip-slot[data-type="reserve"]').forEach(s => s.classList.remove('selected'));
        selectedReserve = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedActive !== null) {
          // Both selected: perform swap
          const result = await apiSwapCreatureEquip(selectedActive, selectedReserve);
          if (result?.creatureParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.creatureParty.active;
            party.reserves = result.creatureParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderCreatureEquipContent(); // Re-render with updated data
          updateCreatureRow(); // Update main UI creature row
        }
      });
    });

    // Also support rearranging: tap two active slots to swap positions
    let firstActiveClick = null;
    content.querySelectorAll('.creature-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('dblclick', async () => {
        // Double-click to initiate rearrange mode (deselect reserve selection)
        selectedReserve = null;
        content.querySelectorAll('.creature-equip-slot').forEach(s => s.classList.remove('selected'));
      });
    });
  }

  renderCreatureEquipContent();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Menu sheet toggle
  modalsUI.initMenu();
  dom.menuBtn?.addEventListener('click', () => modalsUI.toggleMenu());

  // Bots button opens creature equip view
  dom.botsBtn?.addEventListener('click', () => {
    if (gameState.run?.creatureParty?.active?.length > 0) {
      openCreatureEquipView();
    }
  });

  // Menu items (menu auto-closes via delegation in modals.initMenu)
  dom.settingsBtn.addEventListener('click', () => modalsUI.openSettings());
  dom.resetRunBtn.addEventListener('click', async () => {
    if (gameState.run) {
      if (confirm('Forfeit current run and view report?')) {
        if (combatLoopUI.isCombatActive()) {
          combatLoopUI.cleanupCombat();
        }
        await showAdventureReport(false, 'forfeit');
      }
      return;
    }

    await returnToHub();
  });
}

// ============ CLICK DIAGNOSTIC ============
// Temporary: capture-phase listener registered before all others.
// Logs click target + element stack so we can identify what blocks clicks.
// Remove once the "clicks stop working" regression is diagnosed.
let _clickDiagBubbled = false;
document.addEventListener('click', (e) => {
  _clickDiagBubbled = false;
  const stack = document.elementsFromPoint(e.clientX, e.clientY)
    .slice(0, 8)
    .map(el => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? '#' + el.id : '';
      const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '';
      const pe = getComputedStyle(el).pointerEvents;
      return tag + id + cls + (pe === 'none' ? '[pe:none]' : '');
    });
  // Check known blocker states
  const blockers = [];
  if (document.querySelector('.move-help-backdrop')) blockers.push('move-help-backdrop');
  if (document.querySelector('#chest-anim-overlay')) blockers.push('chest-overlay');
  if (document.querySelector('.menu-backdrop.visible')) blockers.push('menu-backdrop');
  if (document.querySelector('.narration-box.visible')) blockers.push('narration-visible');
  console.log('[click-diag] target:', e.target.tagName + (e.target.id ? '#' + e.target.id : ''),
    '| stack:', stack.join(' > '),
    '| prevented:', e.defaultPrevented,
    blockers.length ? '| BLOCKERS: ' + blockers.join(', ') : '');
  // Check if event actually reaches bubble phase (logged after all handlers run)
  requestAnimationFrame(() => {
    if (!_clickDiagBubbled) console.warn('[click-diag] EVENT SWALLOWED — did not reach bubble phase');
  });
}, true);
document.addEventListener('click', () => { _clickDiagBubbled = true; });

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Capacitor native plugins (no-op on web)
  await initNative();
  await initAnalytics();
  onAppLifecycle({
    onPause: () => audio.pauseBGM?.(),
    onResume: () => audio.resumeBGM?.(),
  });

  // Lock to portrait orientation (PWA + mobile browsers)
  if (screen.orientation?.lock) {
    screen.orientation.lock('portrait-primary').catch(() => {});
  }

  // Initialize auth UI
  auth.init({
    onAuthenticated: async (user) => {
      await setAnalyticsUser(user);
      await initGame();
    }
  });

  // Check auth status
  const isAuth = await auth.checkAuth();
  if (isAuth) {
    auth.hideAuthScreen();
    await initGame();
  } else {
    auth.showAuthScreen();
  }
});

async function initGame() {
  // Must be first — captures console/fetch before other code runs
  diagnostics.init();

  // Initialize i18n language from settings
  setLang(settings.isJapanifyUIEnabled() ? 'ja' : 'en');

  // Initialize PixiJS battle stage (canvas overlay for combat animations)
  await initApp();

  // Wire the SceneManager after PIXI is up. It owns the central ticker —
  // updateParallax receives ticker dt (deltaTime in frame-units); updateParticles
  // receives deltaMS. isFrozen() gates parallax only (matches pre-Task-6 semantics
  // where hitStop() freezes scroll motion but particles keep ticking). Formation
  // freeze will return in Task 9 via BattleScene.update.
  const { app: pixiApp } = getApp();
  if (!pixiApp) {
    console.error('[boot] PIXI init returned null app; SceneManager will not be wired');
  } else if (!isSceneManagerInitialized()) {
    const sceneManager = new SceneManager(pixiApp);
    sceneManager.configure({
      parallax: {
        update: (dt, deltaMS) => {
          if (!isFrozen()) updateParallax(dt);
          updateParticles(deltaMS);
        },
      },
    });
    sceneManager.init();
    setSceneManager(sceneManager);

    // Mount HubScene at boot so phases with no run (no_save, hub) render
    // correctly from the first frame. Later phases re-use this scene or
    // transition to ExplorationScene / BattleScene as they activate.
    try {
      await sceneManager.transition(HubScene, { allies: [] });
    } catch (err) {
      console.error('[boot] HubScene initial transition failed', err);
    }
  }
  // If already initialized (e.g., logout→login), intentionally do nothing.

  // A fresh auth session should never inherit transient combat UI from the
  // previous user/session (e.g. stale combatActive or room transition flags).
  clearClientSessionState();

  takeover.init();
  leaderboard.init();
  bugReport.init();
  speedReview.init({
    sendReview: async (vid, sid, grade, wordText) => {
      const internalGrade = grade >= 3 ? 'good' : 'again';
      const result = await reviewVocabWord(wordText, internalGrade);
      if (result?.state) updateGameState(result.state);
      if (result?.mastered) addKnownWord(wordText);
      else if (result && !result.mastered) removeKnownWord(wordText);
      if (result?.fusionCoreDrop?.awarded) {
        const anchor = document.getElementById('speed-review-content')
          || document.getElementById('speed-review-modal')
          || document.body;
        showWordLevelUp(anchor, '', {
          message: result.fusionCoreDrop.message || 'Obtained 1x Fusion Core!'
        });
      }
      return result;
    },
    playTTS: (word) => tts.playWord(word),
    prefetchTTS: (word) => tts.prefetchWord(word),
    refreshQueue: async () => {
      const result = await getVocabDueWords();
      return result?.words || [];
    },
    startRoomSession: async ({ roomId }) => {
      const result = await apiStartSpeedReviewRoom(roomId);
      if (result?.state) updateGameState(result.state);
      return result;
    },
    commitRoomReview: async ({ roomId, word, commitIndex }) => {
      const result = await apiProgressSpeedReviewRoom(roomId, word.word, commitIndex);
      if (result?.state) updateGameState(result.state);
      return result;
    },
    completeRoomSession: async ({ roomId }) => {
      const result = await apiCompleteSpeedReviewRoom(roomId);
      if (result?.state) updateGameState(result.state);
      return result;
    }
  });

  // Initialize lookup mode
  lookup.init({
    parseText: parseLocalText,
    lookupWord: lookupLocalWord,
    showToast: (msg) => scene.showToast(msg, 3000)
  });

  actions.init({
    equipBots: () => {
      if (gameState.run?.creatureParty?.active?.length > 0) {
        openCreatureEquipView();
      }
    },
    contextAction: null,
    cardSwipe: (direction) => {
      diagnostics.logAction('card_swipe', { direction });

      // Word discovery mode uses its own handler via custom event
      if (gameState.phase === 'wordDiscovery') {
        document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: direction }));
        return;
      }
    },
    cardFlip: handleCardFlip,
  });

  creatureRow.init({
    getItemBuffs: () => gameState.run?.itemBuffs,
    getEquippedItems: () => gameState.run?.equippedItems || [],
    swapCreatureCallback: async (activeIndex, reserveIndex) => {
      diagnostics.logAction('swap_creature', { activeIndex, reserveIndex });
      const result = await apiSwapCreature(activeIndex, reserveIndex);
      if (result.error) {
        console.error('Swap failed:', result.error);
        return;
      }
      // Update game state with new party
      if (result.state) {
        updateGameState(result.state);
      }
      // Re-render creature row with updated active roster
      creatureRow.setReserves(result.creatureParty?.reserves || []);
      creatureRow.render(result.creatureParty?.active || []);
      // If paid swap triggered enemy attacks, show them
      if (result.enemyAttacks?.length > 0) {
        for (const atk of result.enemyAttacks) {
          const actionArea = document.getElementById('action-area');
          if (actionArea) {
            actionArea.innerHTML = `<div class="combat-creature-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong></div>`;
          }
        }
      }
      if (result.combatEnded) {
        combatLoopUI.stopCombatLoop(result);
      }
      updateUI();
    },
    rearrangeCreatureCallback: async (indexA, indexB) => {
      const result = await apiRearrangeCreatures(indexA, indexB);
      if (result?.error) {
        console.error('Rearrange failed:', result.error);
        return;
      }
      if (result?.state) {
        updateGameState(result.state);
      }
      creatureRow.setReserves(result?.creatureParty?.reserves || []);
      creatureRow.render(result?.creatureParty?.active || []);
    },
  });

  kanjiKombatUI.initKanjiKombatUI({
    submitAnswer: (answerId, promptRef) => combatLoopUI.submitKanjiKombatAnswer(answerId, promptRef),
    submitOnboarding: apiSubmitKanjiKombatOnboarding,
    refillPromptBuffer: apiRefillKanjiKombatPromptBuffer,
    finishCombatResult: result => combatLoopUI.stopCombatLoop(result),
    updateGameState,
    getGameState: () => gameState,
    fetchGameState: apiGetGameState,
    updateUI,
    refreshAction: () => combatLoopUI.startMoveSelection(),
    showCidSprite: showKanjiKombatCidSprite,
    hideCidSprite: hideKanjiKombatCidSprite,
    showNarration: (text, opts) => narrationBox.show(text, opts),
    forceHideNarration: () => narrationBox.forceHide(),
    syncSession: apiSyncKanjiKombatSession,
    isCombatAnimationActive: () => combatAnimationActive,
    showXpEvents: xpEvents => combatLoopUI.showXpEvents(xpEvents),
    processPendingMoveLearn: list => combatLoopUI.processPendingMoveLearn(list),
    syncKanjiKombatStreakRewardVisuals: result => combatLoopUI.syncKanjiKombatStreakRewardVisuals(result),
    playKanjiKombatNextWaveTransition: result => combatLoopUI.playKanjiKombatNextWaveTransition(result),
    getLastLocallyPlayedKanjiKombatWave: () => combatLoopUI.getLastLocallyPlayedKanjiKombatWave(),
    setLastLocallyPlayedKanjiKombatWave: wave => combatLoopUI.setLastLocallyPlayedKanjiKombatWave(wave),
  });

  explorationUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    actions,
    scene: { ...scene, showNarration: (text, opts) => narrationBox.show(text, opts), forceHideNarration: () => narrationBox.forceHide() },
    startEncounter,
    startNewRun,
    returnToHub,
    apiGetAreaOptions,
    apiSelectArea: async (areaId) => {
      const result = await apiSelectArea(areaId);
      if (result?.state) {
        await trackMilestone('koto_area_selected', extractGameContext(result.state), 'area_selected');
      }
      return result;
    },
    triggerCreatureSelect,
    apiGetKanjiKombatAvailability,
    startKanjiKombatSetup,
    apiReturnToHub: returnToHub,
    apiProceed,
    apiSyncExploreSession,
    apiRoomEncounter,
    apiGetCampfire,
    apiCookAtCampfire,
    apiFeedCampfireDish,
    apiSkipCampfire,
    playTTS: (word) => tts.playWord(word),
    prefetchTTS: (word) => tts.prefetchWord(word),
    apiGetShrineOffers,
    apiChooseShrineReward,
    apiShrineUpgrade,
    apiQuizReward,
    apiGetQuizQuestion,
    apiSubmitQuizAnswer,
    apiGetDiscoveryWords,
    apiGetDiscoveryStatus,
    apiCompleteDiscovery,
    apiSwipeWord: (word, grade, isDiscovery, options = {}) => reviewVocabWord(word, grade, isDiscovery, options),
    apiPostCombatRefresh: (words) => fetch(apiUrl('/api/game/post-combat-refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ words })
    }),
    apiGetDueWords: async () => getVocabDueWords(),
    apiGetVocabDueCount: async () => getVocabDueCount(),
    apiStartSpeedReviewRoom,
    apiProgressSpeedReviewRoom,
    apiCompleteSpeedReviewRoom,
    apiClaimTutorialFusionCore,
    apiCompleteTutorialFusion,
    apiMarkTutorialPostFusionSeen,
    apiGetCreatureCollection,
    showCollectionSelect,
    apiGetWhackAMolePool,
    apiCompleteWhackAMole,
    apiGetWhackAMoleDialogue,
    apiSkipWhackAMole,
    apiSkillMasterOffers,
    apiSkillMasterChoose,
    apiGetFriendlyNpcOffers,
    apiChooseFriendlyNpcItem,
    apiTutorialAdvance: async (expectedStep) => {
      try {
        const res = await fetch(apiUrl('/api/game/tutorial-advance'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedStep })
        });
        const data = await res.json();
        if (data.tutorialStep !== undefined && gameState?.meta) {
          gameState.meta.tutorialStep = data.tutorialStep;
        }
      } catch (e) { console.warn('[Tutorial] advance failed:', e); }
    },
    showAdventureReport,
  });

  pvpLobbyUI.init({
    getGameState: () => gameState,
    updateUI,
    actions,
    scene,
  });

  pvpBattleUI.init({
    getGameState: () => gameState,
    updateUI,
    actions,
    scene,
    onPvpBattleStart: async () => {
      try {
        await loadParallax('pvp_arena');
      } catch (err) {
        console.warn('[Parallax] PvP load failed:', err);
      }
      setScrollState('encounter');
      lastParallaxAreaKey = 'pvp_arena';
    },
  });

  chestsUI.init({
    getAuthHeaders,
    apiUrl,
    onChestOpened: async (element, crest) => {
      await playChestAnimation(element, crest);
    },
    showNarration: (text, opts) => narrationBox.show(text, opts),
    getTutorialStep: () => gameState?.meta?.tutorialStep ?? 6,
    onBack: () => {
      scene.setBackground(backgroundImageUrl('hub'));
      explorationUI.renderHub();
    },
  });

  crestsEquipUI.init({
    getAuthHeaders,
    apiUrl,
    showNarration: (text, opts) => narrationBox.show(text, opts),
    getTutorialStep: () => gameState?.meta?.tutorialStep ?? 6,
    onBack: () => {
      scene.setBackground(backgroundImageUrl('hub'));
      explorationUI.renderHub();
    },
  });

  fusionLabUI.init({
    getGameState: () => gameState,
    apiGetFusionState,
    apiStartFusion,
    apiCompleteTutorialFusion,
    apiGetCreatureCollection,
    updateGameState,
    showTutorialNarration: (pages, opts) => explorationUI.showTutorialNarration(pages, opts),
    showToast: (text, duration) => scene.showToast(text, duration),
    onBack: () => {
      const nextState = { ...gameState, phase: 'hub' };
      updateGameState(nextState);
      scene.setBackground(backgroundImageUrl('hub'));
      updateUI();
    },
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    getExploreSession,
    apiShopSkip,
    apiDealerSell,
    apiDealerBuy,
    apiDealerLeave,
    apiGetDealerState,
  });

  modalsUI.init({
    takeover,
    scene,
    settings,
    getGameState: () => gameState,
    updateGameState,
    updateUI,
  });

  characterUI.init({
    getGameState: () => gameState,
    scene,
  });

  combatLoopUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    settings,
    narration: { showNarration: (text, opts) => narrationBox.show(text, opts), forceHideNarration: () => narrationBox.forceHide() },
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => {
      const formation = isPlayer ? dom.playerFormation : dom.enemyFormation;
      const targetEl = formation.querySelector('.formation-slot') || formation;
      scene.showDamageNumber(dmg, { isCrit, isHeal, tierClass, targetEl });
    },
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    animateEnemyHurt: () => {},
    animatePlayerHurt: (targetIndex) => {
      const formation = document.getElementById('player-formation');
      if (!formation) return;
      const slots = formation.querySelectorAll('.formation-slot');
      const slot = slots[targetIndex ?? 0] || slots[0];
      if (slot) {
        recoil(slot, 4, 'left');
        combatEvents.emit('creatureHit', { slotEl: slot, side: 'player' });
      }
    },
    animateEnemyDefeat: () => scene.hideEnemies(),
    updateActionPanel: () => {},
    playNarrationAudio: (audioData) => {
      if (!audioData) return;
      tts.playAudioBuffer(audioData).catch(e => console.warn('[TTS] Narration audio playback failed:', e.message));
    },
    showVictoryModal,
    showGameOverModal,
    showEnemyDialogue,
    getEnemyDialogueActive: () => enemyDialogueActive,
    getDialogueDismissPromise: () => dialogueDismissPromise,
    delay,
    showFlashCards: (words, options) => {
      currentFlashCardWord = words.length === 1 ? words[0] : null;
      actions.showFlashCards(words, options);
    },
    setCombatAnimationActive: (active) => { combatAnimationActive = active; },
    apiCreatureCombatCycle,
    apiVerifyCreatureCombatCycle,
    apiSubmitKanjiKombatAnswer,
    apiGetGameState,
    apiSubmitKanjiKombatAnswer,
    showPostCombatShop: showPostCombatShopFlow,
    apiBefriendReplace: (releaseCreatureId) => apiBefriendReplace(releaseCreatureId),
    apiGetBefriendConversation,
    apiSubmitBefriendAnswer,
    apiStartNpcDialogue: startNpcDialogue,
    apiRespondNpcDialogue: respondNpcDialogue,
    showNpcSprite: (name, id, npc, opts) => scene.showNpcTrainer(name, id, npc, opts),
    hideNpcSprite: () => scene.hideNpcTrainer(),
    updateCreatureRowData: (creatures) => creatureRow.updateData(creatures),
  });

  // Initialize move/target selection UI for Pokemon-style combat
  combatLoopUI.initMoveUI();

  // Initialize creature speech bubble system
  speechBubble.init();

  // Exposure tracking is render-driven, so the buffer must be ready before the
  // first UI pass that calls renderJpSentence().
  initExposureBuffer();

  // Connection status banner — shows on API failures, dismisses on recovery
  setConnectionCallbacks({ onOffline: showOffline, onOnline: showOnline });
  window.addEventListener('online', showOnline);
  window.addEventListener('offline', showOffline);

  setupEventListeners();

  // Wire logout button (in menu sheet — menu auto-closes via delegation)
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      clearClientSessionState();
      auth.logout();
      auth.showAuthScreen();
    }
  });

  const currentUser = await auth.getCurrentUser();
  if (currentUser) await setAnalyticsUser(currentUser);
  await loadKnownWords();
  dialogueLookup.init({
    showToast: (msg) => scene.showToast(msg, 3000),
    pauseAutoDismiss: narrationBox.pauseAutoDismiss,
    getKanaMode: () => (gameState.meta?.japaneseDisplayMode || 'hiragana') === 'hiragana',
    onStateUpdate: updateGameState,
  });
  const loadedState = await loadGameState();
  if (loadedState === null) {
    scene.showToast?.('Connection is slow. Check your connection and reload.', 5000);
    return;
  }
  await claimDailyCrystalBonus();

  // Freshly registered users should enter prologue immediately without
  // an extra manual "New Game" click.
  if (!gameState.player && gameState.meta && gameState.meta.prologueComplete === false) {
    await createCharacter();
  }

  // Show prologue for returning players who haven't completed it
  if (gameState.player && !gameState.meta?.prologueComplete) {
    await playPrologue();
  }

  updateUI();

  // Initialize TTS from server settings
  const serverSettings = await settings.loadServerSettings();
  tts.initSettings(serverSettings);

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  async function ensureAudio() {
    if (audioInitialized) return;
    audioInitialized = true;
    await audio.initAudio();
    document.removeEventListener('click', ensureAudio);
    document.removeEventListener('touchstart', ensureAudio);
  }
  document.addEventListener('click', ensureAudio);
  document.addEventListener('touchstart', ensureAudio);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.pauseBGM();
    } else {
      audio.resumeBGM();
    }
  });

  if (gameState.phase === 'combat' && gameState.combat?.enemy?.hp > 0) {
    startCombatLoop();
  }
}
