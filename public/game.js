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

// Register service worker for asset caching with forced update checking
if ('serviceWorker' in navigator) {
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
import * as wordPractice from './js/word-practice.js';
import * as explorationUI from './js/ui/exploration.js';
import * as economyUI from './js/ui/economy.js';
import * as characterUI from './js/ui/character.js';
import * as modalsUI from './js/ui/modals.js';
import * as combatLoopUI from './js/ui/combat-loop.js';
import { playAttackSound, playUltimateSound } from './js/ui/combat-audio.js';
import { playUltimateAnimation, screenShake, showXpPopup, showLevelUpPopup, healEffect, poisonApplyEffect } from './js/ui/combat-effects.js';
import { dom } from './js/dom.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as hpBar from './js/ui/hp-bar.js';
import * as robotRow from './js/ui/robot-row.js';
import * as postCombatShop from './js/ui/post-combat-shop.js';
import * as scene from './js/ui/scene.js';
import * as audio from './js/audio.js';
import * as auth from './js/ui/auth.js';
import * as narrationBox from './js/ui/narration-box.js';
import * as leaderboard from './js/ui/leaderboard.js';
import * as lookup from './js/ui/lookup.js';
import * as bugReport from './js/ui/bug-report.js';
import * as speedReview from './js/ui/speed-review.js';
import { configureRobotImg, robotSpritePath, probeIdleSprites } from './js/ui/sprite-utils.js';
import { setLang, t, isJapanified } from './js/ui/i18n.js';
import * as phaser from './js/phaser/index.js';
import { gameEvents } from './js/phaser/phaser-bridge.js';

// API imports - these are the server communication functions
import {
  getGameState as apiGetGameState,
  createPlayer as apiCreatePlayer,
  startRun as apiStartRun,
  forfeitRun as apiForfeitRun,
  getAreaOptions as apiGetAreaOptions,
  selectArea as apiSelectArea,
  proceed as apiProceed,
  roomEncounter as apiRoomEncounter,
  startEncounter as apiStartEncounter,
  shopSkip as apiShopSkip,
  sendJpdbReview as apiSendJpdbReview,
  getDueWords as apiGetDueWords,
  getAuthHeaders,
  shrineUpgrade as apiShrineUpgrade,
  quizReward as apiQuizReward,
  getQuizQuestion as apiGetQuizQuestion,
  submitQuizAnswer as apiSubmitQuizAnswer,
  getDiscoveryWords as apiGetDiscoveryWords,
  getDiscoveryStatus as apiGetDiscoveryStatus,
  completeDiscovery as apiCompleteDiscovery,
  getLevels as apiGetLevels,
  selectLevel as apiSelectLevel,
  selectBranch as apiSelectBranch,
  doorHints as apiDoorHints,
  parseJpdbText,
  lookupJpdbWord,
  lookupJpdbBatch,
  getDealerState as apiGetDealerState,
  dealerSell as apiDealerSell,
  dealerBuy as apiDealerBuy,
  dealerLeave as apiDealerLeave,
  startRobotEncounter as apiStartRobotEncounter,
  robotCombatCycle as apiRobotCombatCycle,
  useRobotUltimate as apiUseRobotUltimate,
  getRobotCollection as apiGetRobotCollection,
  rollPostCombatShop as apiRollPostCombatShop,
  selectShopItem as apiSelectShopItem,
  swapRobot as apiSwapRobot,
  rearrangeRobots as apiRearrangeRobots,
  swapRobotEquip as apiSwapRobotEquip,
  befriendReplace as apiBefriendReplace,
  getBefriendConversation as apiGetBefriendConversation,
  submitBefriendAnswer as apiSubmitBefriendAnswer,
  startNpcDialogue,
  respondNpcDialogue,
} from './js/api.js';

const API_BASE = '';

// ============ STATE ============
let gameState = {
  player: null,
  run: null,
  combat: null,
  phase: 'no_save'
};

window.gameState = gameState;  // Expose immediately for debugging
store.set('gameState', gameState);

function updateGameState(newState) {
  console.log('[DEBUG] updateGameState called. phase:', newState.phase, 'pendingBranch:', newState.run?.pendingBranch, 'currentRoom:', newState.run?.currentRoom);
  gameState = newState;
  window.gameState = gameState;
  store.set('gameState', gameState);
}

// Enemy dialogue state
let enemyDialogueActive = false;
let dialogueDismissResolve = null;
let dialogueDismissPromise = null;

// Combat animation state
let combatAnimationActive = false;

// Flash card state
let currentFlashCardWord = null;

// Saved player position for returning to room after combat
let savedPlayerPosition = null;

// Combat batch tracking for JPDB refresh
let combatReviewedBatch = [];

// ============ UTILITY ============
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
function updateUI() {
  // Clear any persistent narration on phase transitions
  narrationBox.forceHide();

  updateStatusBar();

  // Handle Phaser exploration mode
  console.log('[DEBUG] updateUI. phase:', gameState.phase, 'shouldUsePhaser:', shouldUsePhaser());
  if (shouldUsePhaser()) {
    console.log('[DEBUG] Phaser SHOULD activate. isActive:', phaser.isExplorationActive());
    if (!phaser.isExplorationActive()) {
      const roomData = getRoomDataForPhaser();
      console.log('[DEBUG] Starting Phaser with roomData:', roomData);
      phaser.startExploration(roomData);
    }
    // Don't update HTML scene/content when Phaser is active
  } else {
    // Make sure Phaser is hidden when not in exploration
    if (phaser.isExplorationActive()) {
      phaser.stopExploration();
    }
    updateScene();
    updateChipRow();
    updatePlayerHP();
    updateGameContent();
  }

  // Update BGM based on current phase
  const isBossRoom = gameState.run?.rooms?.[gameState.run?.currentRoom]?.isBossRoom;
  audio.updateBGMForPhase(gameState.phase, isBossRoom);
}

function updateStatusBar() {
  const floor = gameState.run?.floor;
  dom.floorIndicator.textContent = floor ? `F${floor}` : 'Hub';
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;
}

function updateScene() {
  if (gameState.phase === 'combat') {
    // Robot combat uses enemies[] array; legacy uses single enemy
    const enemies = gameState.combat?.enemies;
    if (enemies?.length > 1) {
      scene.showEnemies(enemies);
    } else {
      const enemy = enemies?.[0] || gameState.combat?.enemy;
      if (enemy) scene.showEnemy(enemy);
    }
  } else if (gameState.phase === 'shrine') {
    scene.showShrineFox();
  } else if (gameState.phase === 'quiz') {
    scene.showQuizMaster();
  } else if (gameState.phase === 'wordDiscovery') {
    scene.showWordDiscoveryNpc();
  } else if (gameState.phase === 'dealer') {
    scene.showDealer();
  } else {
    scene.hideEnemies();
  }
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.webp');
  } else if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.webp');
  } else if (gameState.phase === 'wordDiscovery') {
    scene.setBackground('/assets/backgrounds/word_discovery_background.webp');
  } else if (gameState.phase === 'dealer') {
    scene.setBackground('/assets/backgrounds/dealer_background.webp');
  } else if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  } else if (!gameState.run) {
    scene.setBackground('/assets/backgrounds/hub.webp');
  }
}

function updateChipRow() {
  // Hide row on hub and non-run phases
  if (!gameState.run && (gameState.phase === 'hub' || gameState.phase === 'no_save' || gameState.phase === 'area_selection')) {
    dom.chipRow.innerHTML = '';
    return;
  }

  if (gameState.run?.robotParty?.active?.length > 0) {
    // Robot party active: render robot slots
    robotRow.setReserves(gameState.run.robotParty.reserves || []);
    robotRow.render(gameState.run.robotParty.active);
    return;
  }

  // No robots, no chips - clear the row
  dom.chipRow.innerHTML = '';
}

function updatePlayerHP() {
  // In robot combat, individual robot HP bars handle health display
  if (gameState.run?.robotParty?.active?.length > 0) {
    hpBar.setVisible(false);
    return;
  }
  // Hide HP bar on hub and non-combat phases
  if (!gameState.phase || gameState.phase === 'hub' || gameState.phase === 'no_save' || gameState.phase === 'area_selection') {
    hpBar.setVisible(false);
    return;
  }
  if (gameState.player) {
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
    hpBar.setVisible(true);
  } else {
    hpBar.setVisible(false);
  }
}

function updateGameContent() {
  switch (gameState.phase) {
    case 'no_save':
      actions.setContent('<button class="action-btn action-btn-primary" id="new-game-btn">ニューゲーム</button>');
      document.getElementById('new-game-btn')?.addEventListener('click', createCharacter);
      break;
    case 'hub':
      explorationUI.renderHub();
      break;
    case 'area_selection':
      explorationUI.renderAreaSelection();
      break;
    case 'exploring':
    case 'room':
    case 'room_encounter':
      explorationUI.renderExploring();
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
    case 'dealer':
      economyUI.renderDealerRoom(actions);
      break;
    case 'branch_selection':
      console.log('[DEBUG] branch_selection phase. pendingBranch:', gameState.run?.pendingBranch, 'currentRoom:', gameState.run?.currentRoom, 'rooms:', gameState.run?.rooms);
      explorationUI.renderBranchSelection();
      break;
    case 'combat':
      // Clear stale buttons; flash card will be rendered by combat-loop
      if (!combatLoopUI.isCombatActive()) {
        actions.clear();
      }
      break;
    case 'npc_dialogue':
      // Handled by combat-loop's runNpcDialogue()
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
async function loadGameState() {
  const data = await apiGetGameState();
  if (data.player) {
    updateGameState(data);
    // Probe which robots have animated idle sprites (for background-image contexts)
    const allRobotIds = [
      ...(data.robotParty?.active || []),
      ...(data.robotParty?.reserves || []),
    ].filter(Boolean).map(r => r.id);
    probeIdleSprites(allRobotIds);
  } else {
    updateGameState({ ...gameState, phase: 'no_save' });
  }
}

// Warm JPDB cache on session start (uses server-side key like /api/jpdb/parse)
async function warmJpdbCache() {
  try {
    const response = await fetch(`${API_BASE}/api/game/session-start`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    console.log(`[Game] Session cache: ${data.warmed ? data.cachedWords + ' words' : data.reason || data.error}`);
  } catch (e) {
    console.warn('[Game] Failed to warm session cache:', e);
  }
}

// ============ GAME ACTIONS ============
async function createCharacter() {
  const result = await apiCreatePlayer('Hacker', {}, 0);
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}

function removeCollectionOverlay() {
  const gameApp = document.querySelector('.game-app');
  gameApp?.querySelector('.collection-select')?.remove();
}

async function startNewRun() {
  // Note: clearWordCache() moved to returnToHub() for earlier prefetching

  // Fetch robot collection for team select
  const collectionResult = await apiGetRobotCollection();
  const catalog = collectionResult?.catalog;
  const collection = collectionResult?.collection;

  if (catalog && catalog.length > 0) {
    const starterIds = await showCollectionSelect(catalog, collection);
    if (!starterIds || starterIds.length === 0) {
      removeCollectionOverlay();
      return;
    }

    // Retry up to 3 times if isLoading blocks the call
    let result = null;
    for (let attempt = 0; attempt < 3 && !result?.state; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 300));
      result = await apiStartRun({ starterIds });
    }

    removeCollectionOverlay();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  }
}

function showCollectionSelect(catalog, collection) {
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const MAX_POINTS = 10;

  return new Promise((resolve) => {
    const selected = new Set();
    let usedPoints = 0;

    // Sort: common first, then by element within rarity
    const sorted = [...catalog].sort((a, b) => {
      const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      if (ri !== 0) return ri;
      return a.element.localeCompare(b.element);
    });

    function render() {
      const remaining = MAX_POINTS - usedPoints;
      const budgetClass = remaining <= 0 ? 'budget-full' : remaining <= 3 ? 'budget-tight' : 'budget-ok';

      const cellsHtml = sorted.map(r => {
        const owned = collection.includes(r.id);
        const isSelected = selected.has(r.id);
        const tooExpensive = owned && !isSelected && r.pointCost > remaining;
        const classes = [
          'collection-cell',
          !owned && 'unowned',
          isSelected && 'selected',
          tooExpensive && 'too-expensive'
        ].filter(Boolean).join(' ');

        return `
          <div class="${classes}" data-id="${r.id}" data-rarity="${r.rarity}" data-element="${r.element}">
            <img data-robot-id="${r.id}" alt="${r.nameEn}" />
            ${owned ? `<span class="point-badge">${r.pointCost}</span>` : ''}
            <span class="robot-name">${owned ? r.nameEn : '???'}</span>
          </div>
        `;
      }).join('');

      // Render into .game-app (not #action-area) so the overlay fills the full mobile container
      const gameApp = document.querySelector('.game-app');
      let overlay = gameApp.querySelector('.collection-select');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'collection-select';
        gameApp.appendChild(overlay);
      }
      overlay.innerHTML = `
        <div class="collection-header">
          <span class="collection-title">${t('selectTeam')}</span>
          <span class="collection-points ${budgetClass}">${usedPoints} / ${MAX_POINTS} pts</span>
        </div>
        <div class="collection-grid">${cellsHtml}</div>
        <button class="action-btn action-btn-primary" id="collection-confirm-btn" ${selected.size === 0 ? 'disabled' : ''}>
          ${t('startRun', selected.size, selected.size !== 1 ? 's' : '')}
        </button>
      `;

      // Configure animated idle sprites with static fallback
      overlay.querySelectorAll('img[data-robot-id]').forEach(img => {
        configureRobotImg(img, img.dataset.robotId, el => { el.style.display = 'none'; });
      });

      // Set background
      scene.setBackground('/assets/backgrounds/hub.webp');

      // Bind click handlers
      document.querySelectorAll('.collection-cell:not(.unowned)').forEach(cell => {
        cell.addEventListener('click', () => {
          const id = cell.dataset.id;
          const robot = sorted.find(r => r.id === id);
          if (!robot) return;

          if (selected.has(id)) {
            selected.delete(id);
            usedPoints -= robot.pointCost;
          } else {
            if (robot.pointCost > MAX_POINTS - usedPoints) return;
            selected.add(id);
            usedPoints += robot.pointCost;
          }
          render();
        });
      });

      document.getElementById('collection-confirm-btn')?.addEventListener('click', () => {
        if (selected.size > 0) {
          resolve([...selected]);
        }
      });
    }

    render();
  });
}

function showCollectionToast(additions) {
  for (const robot of additions) {
    const toast = document.createElement('div');
    toast.className = 'collection-toast';
    toast.innerHTML = `
      <img />
      <span class="toast-text">${t('newRobot', robot.nameEn)}</span>
    `;
    configureRobotImg(toast.querySelector('img'), robot.id);
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

async function startEncounter() {
  const hasRobots = gameState.run?.robotParty?.active?.length > 0;

  let result;
  if (hasRobots) {
    result = await apiStartRobotEncounter();
  } else if (gameState.phase === 'room_encounter') {
    result = await apiRoomEncounter();
  } else {
    result = await apiStartEncounter();
  }

  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    // Robot encounters don't have possessed dialogue
    if (!hasRobots) {
      const enemy = gameState.combat?.enemy;
      if (result?.dialogue || enemy?.dialogue?.possessed) {
        const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
          ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
          : enemy.dialogue.possessed);
        await showEnemyDialogue(text, 'possessed');
      }
    }
    // Show NPC greeting before combat starts
    if (result?.npc) {
      await combatLoopUI.showNpcGreeting(result.npc);
    }
    await delay(300);
    startCombatLoop();
  }
}


async function returnToHub() {
  if (combatLoopUI.isCombatActive()) {
    combatLoopUI.cleanupCombat();
  }
  await apiForfeitRun();
  await loadGameState();
  updateUI();
  // Prefetch words now so they're ready when user starts next run
  wordPractice.clearWordCache();
  wordPractice.prefetchCombatWords();
}

// ============ COMBAT ============
function startCombatLoop() { combatLoopUI.startCombatLoop(); }
function resumeCombatAfterVocab() { combatLoopUI.resumeCombatAfterVocab(); }

function showVictoryModal(result) {
  audio.stopBGM();
  narrationBox.show('Victory!', { autoDismiss: 2000 });

  // Show collection toast for newly befriended robots
  if (result.newCollectionAdditions?.length > 0) {
    showCollectionToast(result.newCollectionAdditions);
  }

  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }
  setTimeout(async () => {
    await loadGameState();
    updateUI();
  }, 1500);
}

function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');

  // Trigger batch refresh on combat end if any pending reviews
  if (combatReviewedBatch.length > 0) {
    const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
    combatReviewedBatch = [];
    apiGetDueWords(reviewedWords).catch(e => console.warn('[Combat] End batch refresh failed:', e));
  }

  updateChipRow();
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const floor = gameState.run?.currentFloor || 1;
  const roomsCleared = gameState.run?.currentRoom || 0;
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:0 24px;">
      <div style="font-size:48px;margin-bottom:8px;">💀</div>
      <h2 style="text-align:center;font-size:24px;font-weight:700;">${t('defeated')}</h2>
      <p style="text-align:center;color:var(--text-secondary);font-size:14px;">${t('runEnded')}</p>
      <div style="text-align:center;color:var(--text-muted);font-size:13px;">
        ${t('floorRooms', floor, roomsCleared)}
      </div>
      <button class="action-btn action-btn-primary" id="gameover-hub-btn" style="margin-top:24px;">ハブに戻る</button>
    </div>
  `;
  document.getElementById('gameover-hub-btn')?.addEventListener('click', async () => {
    takeover.close('gameover');
    await returnToHub();
  });
}

// ============ FLASH CARD HANDLERS ============
function handleCardFlip() {
  if (currentFlashCardWord?.word) {
    tts.speakText(currentFlashCardWord.word);
  }
}

// ============ PHASER EXPLORATION HANDLERS ============

function setupPhaserEventListeners() {
  // Room transition via door
  gameEvents.on('roomTransition', async (data) => {
    phaser.stopExploration();
    // Clear saved position when entering new room
    savedPlayerPosition = null;
    // Use existing room advance API
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      // If still in exploration phase, restart Phaser with new room
      if (gameState.phase === 'exploring' || gameState.phase === 'room') {
        const roomData = getRoomDataForPhaser();
        phaser.startExploration(roomData);
      } else {
        updateUI();
      }
    }
  });

  // Credits collected
  gameEvents.on('creditsCollected', async (data) => {
    try {
      const response = await fetch('/api/game/collect-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ amount: data.amount })
      });
      const result = await response.json();
      if (result.success) {
        console.log('[collect-credits] credits:', result.newTotal);
        scene.showToast(`+${data.amount} credits`, 1500);
        // Update local state
        if (gameState.player) {
          gameState.player.gold = result.newTotal;
        }
      }
    } catch (e) {
      console.error('Failed to collect credits:', e);
    }
  });

  // Start interaction (NPC talk, combat, etc.)
  gameEvents.on('startInteraction', async (data) => {
    // Save player position before stopping Phaser
    savedPlayerPosition = phaser.getPlayerPosition();
    phaser.stopExploration();

    switch (data.type) {
      case 'encounter':
      case 'boss':
        await startEncounter();
        break;
      case 'shrine':
        // Load shrine state and render
        await loadGameState();
        updateUI();
        break;
      case 'quiz':
        await loadGameState();
        updateUI();
        break;
      case 'wordDiscovery':
        await loadGameState();
        updateUI();
        break;
      case 'dealer':
        await loadGameState();
        updateUI();
        break;
      default:
        updateUI();
    }
  });
}

/**
 * Get room data formatted for Phaser scene.
 */
function getRoomDataForPhaser() {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  const roomData = {
    type: room?.type || 'encounter',
    floor: gameState.run?.floor || 1,
    doorDestinations: [0, 1], // Fixed 2 doors for prototype
    interacted: room?.interacted || false,
    roomIndex: gameState.run?.currentRoom
  };

  // Include saved player position if returning to same room
  if (savedPlayerPosition && room?.interacted) {
    roomData.playerPosition = savedPlayerPosition;
  }

  return roomData;
}

/**
 * Check if current phase should use Phaser exploration.
 */
function shouldUsePhaser() {
  return false; // Phaser disabled - using VN-style backgrounds instead
}

// ============ ROBOT COMBAT HANDLERS ============
async function showPostCombatShopFlow() {
  try {
    const shopResult = await apiRollPostCombatShop();
    if (!shopResult?.items?.length) return;

    return new Promise((resolve) => {
      postCombatShop.init({
        itemSelectedCallback: async (index) => {
          const selectResult = await apiSelectShopItem(index);
          if (selectResult?.state) updateGameState(selectResult.state);
          postCombatShop.hide();
          resolve();
        }
      });
      postCombatShop.show(shopResult.items);
    });
  } catch (e) {
    console.error('Post-combat shop error:', e);
  }
}

async function handleUseRobotUltimate(robotIndex) {
  const result = await apiUseRobotUltimate(robotIndex);
  if (!result?.success) {
    console.warn('[Ultimate] Failed:', result?.reason);
    return;
  }

  // Find the robot that used the ultimate for animation source
  const state = gameState;
  const robot = state.run?.robotParty?.active?.[robotIndex];
  const robotElement = robot?.element || 'fire';
  const robotSlotEl = document.querySelectorAll('#chip-row .robot-slot')[robotIndex] || null;

  // Gather all enemy target elements
  const enemies = result.enemies || state.combat?.enemies || [];
  const targetEls = [];
  if (enemies.length > 1) {
    enemies.forEach((e, i) => {
      const el = document.querySelector(`.enemy-robot-slot[data-enemy-index="${i}"]`);
      if (el) targetEls.push(el);
    });
  } else {
    const el = document.getElementById('enemy-sprite-container');
    if (el) targetEls.push(el);
  }

  // Play ultimate sound and animation simultaneously
  playUltimateSound(robotElement);
  await playUltimateAnimation(robotElement, robotSlotEl, targetEls);

  // Show ultimate name in action area
  const actionArea = document.getElementById('action-area');
  if (actionArea && result.ultimateName) {
    if (result.type === 'heal') {
      const totalHeal = (result.healEvents || []).reduce((sum, h) => sum + h.healAmount, 0);
      actionArea.innerHTML = `<div class="combat-robot-attack" style="color: #4CAF50; font-size: 16px;">${result.robotName} uses ${result.ultimateName}! <strong>+${totalHeal}</strong> HP</div>`;
    } else {
      const totalDmg = (result.hits || []).reduce((sum, h) => sum + h.damage, 0);
      actionArea.innerHTML = `<div class="combat-robot-attack" style="color: #FFD700; font-size: 16px;">${result.robotName} uses ${result.ultimateName}! <strong>${totalDmg}</strong> total damage</div>`;
    }
  }

  // Show heal effects on healed robots
  if (result.type === 'heal' && result.healEvents) {
    const slots = document.querySelectorAll('#chip-row .robot-slot');
    const active = state.run?.robotParty?.active || [];
    for (const heal of result.healEvents) {
      const targetIdx = active.findIndex(r => r && r.id === heal.targetId);
      if (targetIdx >= 0 && slots[targetIdx]) {
        await healEffect(slots[targetIdx], heal.healAmount);
      }
    }
  }

  // Update enemy HP bars with damage from hits
  if (result.hits?.length > 0) {
    if (enemies.length > 1) {
      enemies.forEach((enemy, idx) => {
        characterUI.updateEnemyHPAtIndex(idx, enemy.hp, enemy.maxHp);
      });
    } else if (enemies[0]) {
      characterUI.updateEnemyHPBar({ current: enemies[0].hp, max: enemies[0].maxHp });
    }
  }

  // Show poison application effects for poison ultimates
  if (result.type === 'poison' && result.hits) {
    for (const hit of result.hits) {
      if (hit.poisonApplied) {
        // Find the enemy element that was poisoned
        const enemyEl = enemies.length > 1
          ? document.querySelector(`.enemy-robot-slot[data-enemy-id="${hit.targetId}"]`)
          : document.getElementById('enemy-sprite-container');
        if (enemyEl) {
          await poisonApplyEffect(enemyEl);
        }
      }
    }
  }

  // Show XP popups for enemies killed by ultimate
  if (result.xpEvents?.length > 0) {
    const activeRobots = state.run?.robotParty?.active || [];
    const slots = document.querySelectorAll('#chip-row .robot-slot');
    for (const event of result.xpEvents) {
      if (event.xpGrants) {
        for (const grant of event.xpGrants) {
          const index = activeRobots.findIndex(r => r && r.id === grant.robotId);
          if (index >= 0 && slots[index]) {
            showXpPopup(slots[index], grant.xp);
          }
        }
      }
      if (event.levelUps) {
        for (const lu of event.levelUps) {
          const index = activeRobots.findIndex(r => r && r.id === lu.robotId);
          if (index >= 0 && slots[index]) {
            setTimeout(() => showLevelUpPopup(slots[index], lu.newLevel), 400);
          }
        }
      }
    }
  }

  // Update game state
  if (result.state) {
    updateGameState(result.state);
    // Don't updateUI() when combat ended - stopCombatLoop handles victory flow
    // (calling updateUI here would render room phase while shop/narration still pending)
    if (!result.combatEnded) {
      updateUI();
    }
  }

  if (result.combatEnded && result.victory) {
    combatLoopUI.stopCombatLoop({
      combatEnded: true,
      victory: true,
      newCollectionAdditions: result.newCollectionAdditions,
    });
  } else if (!result.combatEnded) {
    // Resume combat loop so next vocab cards appear
    combatLoopUI.pauseForNextVocab();
  }
}

// ============ ROBOT EQUIP UI ============
async function openRobotEquipView() {
  const party = gameState.run?.robotParty;
  if (!party) return;

  takeover.open('robotEquip');
  const content = takeover.getContent('robotEquip');

  function renderRobotEquipContent() {
    const active = party.active || [];
    const reserves = party.reserves || [];

    const ELEMENT_ICONS = robotRow.ELEMENT_ICONS || { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };
    const ELEMENT_COLORS = robotRow.ELEMENT_COLORS || { wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3' };
    const rarityStars = (rarity) => { const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity]; return n ? `<span style="color:#FFD700">${n}★</span>` : ''; };

    const activeHtml = active.map((robot, i) => {
      if (!robot) return `<div class="robot-equip-slot empty" data-type="active" data-index="${i}"><span style="opacity:0.4">${t('emptySlot')}</span></div>`;
      const hpPct = Math.max(0, (robot.hp / robot.maxHp) * 100);
      return `
        <div class="robot-equip-slot" data-type="active" data-index="${i}" data-robot-id="${robot.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[robot.element] || '#666'}">
          <img class="robot-equip-sprite" data-robot-id="${robot.id}" alt="">
          <div class="robot-equip-info">
            <div class="robot-equip-name">${ELEMENT_ICONS[robot.element] || ''} ${robot.nameEn} ${rarityStars(robot.rarity)} <span style="opacity:0.6">Lv${robot.level}</span></div>
            <div class="robot-equip-stats">HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}</div>
            <div class="robot-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="robot-hp-fill" style="width:${hpPct}%;background-color:${hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)'}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const reservesHtml = reserves.length > 0 ? reserves.map((robot, i) => {
      if (!robot) return '';
      const hpPct = Math.max(0, (robot.hp / robot.maxHp) * 100);
      return `
        <div class="robot-equip-slot" data-type="reserve" data-index="${i}" data-robot-id="${robot.id}"
             style="border-left: 3px solid ${ELEMENT_COLORS[robot.element] || '#666'}">
          <img class="robot-equip-sprite" data-robot-id="${robot.id}" alt="">
          <div class="robot-equip-info">
            <div class="robot-equip-name">${ELEMENT_ICONS[robot.element] || ''} ${robot.nameEn} ${rarityStars(robot.rarity)} <span style="opacity:0.6">Lv${robot.level}</span></div>
            <div class="robot-equip-stats">HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}</div>
            <div class="robot-hp-bar" style="width:100%;height:4px;margin-top:2px">
              <div class="robot-hp-fill" style="width:${hpPct}%;background-color:${hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)'}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<p style="padding:16px;opacity:0.6;text-align:center">${t('noReserves')}</p>`;

    content.innerHTML = `
      <h3 style="margin:16px">${t('equippedRobots')}</h3>
      <div class="robot-equip-list">${activeHtml}</div>
      <h3 style="margin:16px">${t('reserveRobots')}</h3>
      <div class="robot-equip-list">${reservesHtml}</div>
      <p style="padding:8px 16px;opacity:0.5;font-size:0.8em;text-align:center">${t('swapInstruction')}</p>
    `;

    // Configure animated idle sprites with static fallback
    content.querySelectorAll('.robot-equip-sprite[data-robot-id]').forEach(img => {
      configureRobotImg(img, img.dataset.robotId, el => { el.style.display = 'none'; });
    });

    // Selection logic: tap active then reserve to swap
    let selectedActive = null;
    let selectedReserve = null;

    content.querySelectorAll('.robot-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('click', async () => {
        // Clear previous selections
        content.querySelectorAll('.robot-equip-slot').forEach(s => s.classList.remove('selected'));
        selectedActive = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedReserve !== null) {
          // Both selected: perform swap
          const result = await apiSwapRobotEquip(selectedActive, selectedReserve);
          if (result?.robotParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.robotParty.active;
            party.reserves = result.robotParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderRobotEquipContent(); // Re-render with updated data
          updateChipRow(); // Update main UI robot row
        }
      });
    });

    content.querySelectorAll('.robot-equip-slot[data-type="reserve"]').forEach(el => {
      el.addEventListener('click', async () => {
        content.querySelectorAll('.robot-equip-slot[data-type="reserve"]').forEach(s => s.classList.remove('selected'));
        selectedReserve = parseInt(el.dataset.index, 10);
        el.classList.add('selected');

        if (selectedActive !== null) {
          // Both selected: perform swap
          const result = await apiSwapRobotEquip(selectedActive, selectedReserve);
          if (result?.robotParty) {
            // Update party data in gameState immediately (BUG C fix)
            party.active = result.robotParty.active;
            party.reserves = result.robotParty.reserves;
            if (result.state) updateGameState(result.state);
          }
          selectedActive = null;
          selectedReserve = null;
          renderRobotEquipContent(); // Re-render with updated data
          updateChipRow(); // Update main UI robot row
        }
      });
    });

    // Also support rearranging: tap two active slots to swap positions
    let firstActiveClick = null;
    content.querySelectorAll('.robot-equip-slot[data-type="active"]').forEach(el => {
      el.addEventListener('dblclick', async () => {
        // Double-click to initiate rearrange mode (deselect reserve selection)
        selectedReserve = null;
        content.querySelectorAll('.robot-equip-slot').forEach(s => s.classList.remove('selected'));
      });
    });
  }

  renderRobotEquipContent();
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
  // Menu sheet toggle
  modalsUI.initMenu();
  dom.menuBtn?.addEventListener('click', () => modalsUI.toggleMenu());

  // Bots button opens robot equip view
  dom.botsBtn?.addEventListener('click', () => {
    if (gameState.run?.robotParty?.active?.length > 0) {
      openRobotEquipView();
    }
  });

  // Menu items (menu auto-closes via delegation in modals.initMenu)
  dom.settingsBtn.addEventListener('click', () => modalsUI.openSettings());
  dom.resetRunBtn.addEventListener('click', async () => {
    if (confirm('Forfeit current run?')) {
      await returnToHub();
    }
  });
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize auth UI
  auth.init({
    onAuthenticated: () => initGame()
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
  // Initialize i18n language from settings
  setLang(settings.isJapanifyUIEnabled() ? 'ja' : 'en');

  takeover.init();
  leaderboard.init();
  bugReport.init();
  speedReview.init({
    sendReview: (vid, sid, grade) => apiSendJpdbReview(vid, sid, grade),
    playTTS: (word) => tts.playWord(word),
    prefetchTTS: (word) => tts.prefetchWord(word),
    refreshQueue: async (reviewedWords = []) => {
      const result = await apiGetDueWords(reviewedWords);
      return result?.words || [];
    }
  });

  // Initialize lookup mode
  lookup.init({
    parseText: parseJpdbText,
    lookupWord: lookupJpdbWord,
    lookupBatch: lookupJpdbBatch,
    showToast: (msg) => scene.showToast(msg, 3000),
    hasJpdbKey: () => !!localStorage.getItem('authToken')
  });

  actions.init({
    equipBots: () => {
      if (gameState.run?.robotParty?.active?.length > 0) {
        openRobotEquipView();
      }
    },
    contextAction: null,
    cardSwipe: (direction) => {
      // Word discovery mode uses its own handler via custom event
      if (gameState.phase === 'wordDiscovery') {
        document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: direction }));
        return;
      }
      // Combat mode: grade based on swipe direction and pass action type
      const grade = direction === 'right' ? 4 : 1;
      const actionType = window._pendingCombatAction || 'attack';
      const reviewWord = window._pendingCombatWord;
      window._pendingCombatAction = null;
      window._pendingCombatWord = null;

      // Send JPDB review for the word that was just graded
      console.log('[JPDB Review] cardSwipe called:', { direction, grade, actionType, reviewWord });
      if (reviewWord?.vid !== undefined && reviewWord?.sid !== undefined) {
        console.log('[JPDB Review] Sending review:', { vid: reviewWord.vid, sid: reviewWord.sid, grade });
        apiSendJpdbReview(reviewWord.vid, reviewWord.sid, grade);

        // Track reviews for batch refresh
        combatReviewedBatch.push(reviewWord);

        // Check for batch refresh (every 50 reviews)
        if (combatReviewedBatch.length >= 50) {
          // Fire and forget - refresh queue in background
          const reviewedWords = combatReviewedBatch.map(w => ({ vid: w.vid, sid: w.sid }));
          combatReviewedBatch = [];
          apiGetDueWords(reviewedWords).then(result => {
            if (result?.words) {
              console.log('[Combat] Batch refresh: got', result.words.length, 'fresh words');
            }
          }).catch(e => console.warn('[Combat] Batch refresh failed:', e));
        }
      } else {
        console.warn('[JPDB Review] Missing vid/sid, cannot send review:', reviewWord);
      }

      // Play TTS for the reviewed word
      if (reviewWord?.word) {
        tts.playWord(reviewWord.word);
      }

      combatLoopUI.resumeCombatAfterVocab(grade, actionType);
    },
    cardFlip: handleCardFlip,
    dualCardSelect: (actionType, selectedWord) => {
      // Store the action type and word for when review completes
      window._pendingCombatAction = actionType;
      window._pendingCombatWord = selectedWord;
      console.log('[JPDB Review] dualCardSelect - stored word:', { actionType, selectedWord, hasVid: selectedWord?.vid !== undefined, hasSid: selectedWord?.sid !== undefined });

      // Return unchosen words to pool
      const words = wordPractice.getTwoCombatWords();
      if (actionType !== 'attack' && words?.attackWord) wordPractice.returnWordToPool(words.attackWord);
      if (actionType !== 'defend' && words?.defendWord) wordPractice.returnWordToPool(words.defendWord);

      // Remove selected word from queue
      wordPractice.removeWordFromCombatQueue(selectedWord);

      // Dual card flips in place - no separate flash card needed
    },
  });

  robotRow.init({
    useUltimateCallback: handleUseRobotUltimate,
    swapRobotCallback: async (activeIndex, reserveIndex) => {
      const result = await apiSwapRobot(activeIndex, reserveIndex);
      if (result.error) {
        console.error('Swap failed:', result.error);
        return;
      }
      // Update game state with new party
      if (result.state) {
        updateGameState(result.state);
      }
      // Re-render robot row with updated active roster
      robotRow.setReserves(result.robotParty?.reserves || []);
      robotRow.render(result.robotParty?.active || []);
      // If paid swap triggered enemy attacks, show them
      if (result.enemyAttacks?.length > 0) {
        for (const atk of result.enemyAttacks) {
          const actionArea = document.getElementById('action-area');
          if (actionArea) {
            actionArea.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong></div>`;
          }
        }
      }
      if (result.combatEnded) {
        combatLoopUI.stopCombatLoop(result);
      }
      updateUI();
    },
    rearrangeRobotCallback: async (indexA, indexB) => {
      const result = await apiRearrangeRobots(indexA, indexB);
      if (result?.error) {
        console.error('Rearrange failed:', result.error);
        return;
      }
      if (result?.state) {
        updateGameState(result.state);
      }
      robotRow.setReserves(result?.robotParty?.reserves || []);
      robotRow.render(result?.robotParty?.active || []);
    },
  });

  wordPractice.init({
    apiBase: API_BASE,
    getGameState: () => gameState,
    showToast: (msg) => scene.showToast(msg),
    escapeHtml: escapeHtml,
    updatePlayerHPBar: (hp) => {
      if (gameState.player) {
        gameState.player.hp = hp;
        hpBar.updatePlayerHP(hp, gameState.player.maxHp);
      }
    },
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
    resumeCombatAfterVocab: () => resumeCombatAfterVocab(),
    isCombatActive: () => combatLoopUI.isCombatActive(),
    isEnemyDialogueActive: () => enemyDialogueActive,
    shuffleArray: shuffleArray,
    sendJpdbReview: apiSendJpdbReview,
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
    apiSelectArea,
    apiReturnToHub: returnToHub,
    apiProceed,
    apiRoomEncounter,
    apiShrineUpgrade,
    apiQuizReward,
    apiGetQuizQuestion,
    apiSubmitQuizAnswer,
    apiGetDiscoveryWords,
    apiGetDiscoveryStatus,
    apiCompleteDiscovery,
    apiSelectBranch,
    apiDoorHints,
    apiSwipeWord: (vid, sid, grade, isDiscovery) => apiSendJpdbReview(vid, sid, grade, isDiscovery),
    apiPostCombatRefresh: (words) => fetch('/api/game/post-combat-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ words })
    }),
    apiGetDueWords,
    apiGetLevels,
    apiSelectLevel,
    apiGetRobotCollection,
    showCollectionSelect,
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
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
  });

  characterUI.init({
    getGameState: () => gameState,
    hpBar,
    scene,
  });

  combatLoopUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    settings,
    narration: { showNarration: (text, opts) => narrationBox.show(text, opts), forceHideNarration: () => narrationBox.forceHide() },
    wordPractice,
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => scene.showDamageNumber(dmg, { isCrit, isHeal, tierClass }),
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    animateEnemyHurt: () => {},
    animatePlayerHurt: () => {},
    animateEnemyDefeat: () => scene.hideEnemies(),
    updateActionPanel: () => {},
    playNarrationAudio: (audioData) => {
      if (!audioData) return;
      try {
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audioEl = new Audio(url);
        audioEl.onended = () => URL.revokeObjectURL(url);
        audioEl.onerror = () => URL.revokeObjectURL(url);
        audioEl.play().catch(e => console.warn('[TTS] Narration audio playback failed:', e.message));
      } catch (e) {
        console.warn('[TTS] Failed to play narration audio:', e.message);
      }
    },
    showVictoryModal,
    showGameOverModal,
    showEnemyDialogue,
    getEnemyDialogueActive: () => enemyDialogueActive,
    getDialogueDismissPromise: () => dialogueDismissPromise,
    delay,
    showFlashCard: (word) => {
      currentFlashCardWord = word;
      actions.showFlashCard(word);
    },
    showDualFlashCards: actions.showDualFlashCards,
    showTripleFlashCards: actions.showTripleFlashCards,
    setCombatAnimationActive: (active) => { combatAnimationActive = active; },
    apiRobotCombatCycle,
    showPostCombatShop: showPostCombatShopFlow,
    apiBefriendReplace: (releaseRobotId) => apiBefriendReplace(releaseRobotId),
    apiGetBefriendConversation,
    apiSubmitBefriendAnswer,
    apiStartNpcDialogue: startNpcDialogue,
    apiRespondNpcDialogue: respondNpcDialogue,
    showNpcSprite: (name) => scene.showNpcTrainer(name),
    hideNpcSprite: () => scene.hideNpcTrainer(),
    updateRobotRowData: (robots) => robotRow.updateData(robots),
  });

  setupEventListeners();
  setupPhaserEventListeners();

  // Wire logout button (in menu sheet — menu auto-closes via delegation)
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      auth.logout();
      auth.showAuthScreen();
    }
  });

  await loadGameState();

  // Warm JPDB cache on session start
  warmJpdbCache();

  updateUI();

  // Prefetch words if in hub (ready for when user starts a run)
  if (gameState.phase === 'hub') {
    wordPractice.prefetchCombatWords();
  }

  // Initialize TTS and review type from server settings
  const serverSettings = await settings.loadServerSettings();
  tts.initSettings(serverSettings);
  const savedTtsVol = localStorage.getItem('jrpg_ttsVolume');
  if (savedTtsVol !== null) tts.setVolume(parseFloat(savedTtsVol));
  wordPractice.setReviewType?.(serverSettings.reviewType || 'flash-card');

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
