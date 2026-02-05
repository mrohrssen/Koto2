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
import { dom } from './js/dom.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as hpBar from './js/ui/hp-bar.js';
import * as chipRow from './js/ui/chip-row.js';
import * as scene from './js/ui/scene.js';
import * as audio from './js/audio.js';
import * as auth from './js/ui/auth.js';
import * as narrationBox from './js/ui/narration-box.js';
import * as leaderboard from './js/ui/leaderboard.js';
import * as lookup from './js/ui/lookup.js';
import * as bugReport from './js/ui/bug-report.js';
import * as speedReview from './js/ui/speed-review.js';
import * as phaser from './js/phaser/index.js';
import { gameEvents } from './js/phaser/phaser-bridge.js';

// API imports - these are the server communication functions
import {
  getGameState as apiGetGameState,
  createPlayer as apiCreatePlayer,
  startRun as apiStartRun,
  forfeitRun as apiForfeitRun,
  getStartingWards as apiGetStartingWards,
  selectStartingWard as apiSelectStartingWard,
  getNextWardOptions as apiGetNextWardOptions,
  selectNextWard as apiSelectNextWard,
  proceed as apiProceed,
  roomEncounter as apiRoomEncounter,
  startEncounter as apiStartEncounter,
  startBoss as apiStartBoss,
  claimStartingChip as apiClaimStartingChip,
  startingChipRefresh as apiStartingChipRefresh,
  postCombatShopBuy as apiPostCombatShopBuy,
  shopSkip as apiShopSkip,
  postCombatShopRefresh as apiShopRefresh,
  equipChip as apiEquipChip,
  unequipChip as apiUnequipChip,
  nextFloor as apiNextFloor,
  getChipLoadout as apiGetChipLoadout,
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
  selectBranch as apiSelectBranch,
  parseJpdbText,
  lookupJpdbWord,
  lookupJpdbBatch,
  reorderChips
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

// Combat animation state (blocks chip dragging during attacks)
let combatAnimationActive = false;

// Flash card state
let currentFlashCardWord = null;

// Chip loadout cache
let chipLoadoutCache = null;

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
  if (gameState.phase === 'combat' && gameState.combat?.enemy) {
    scene.showEnemy(gameState.combat.enemy);
  } else if (gameState.phase === 'shrine') {
    scene.showShrineFox();
  } else if (gameState.phase === 'quiz') {
    scene.showQuizMaster();
  } else if (gameState.phase === 'wordDiscovery') {
    scene.showQuizMaster();
  } else {
    scene.hideEnemy();
  }
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.webp');
  } else if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.webp');
  } else if (gameState.phase === 'wordDiscovery') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.webp');
  } else if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  } else if (!gameState.run) {
    scene.setBackground('/assets/backgrounds/hub.webp');
  }
}

function updateChipRow() {
  // Prefer enriched chip objects from loadout cache (has name, rarity, skill info)
  // Fall back to raw game state (which only has chip ID strings)
  const cacheChips = chipLoadoutCache?.equipment?.weapon?.equippedChips;
  const equipped = cacheChips || [];
  const charges = chipLoadoutCache?.chipCharges || gameState.player?._chipCharges || {};
  const levels = chipLoadoutCache?.chipLevels || gameState.player?._chipLevels || {};

  chipRow.render(equipped, {
    charges: equipped.map(c => charges[c?.id] || 0),
    levels: equipped.map(c => levels[c?.id] || 1),
    maxCharges: 5,
    inCombat: gameState.phase === 'combat',
  });
}

function updatePlayerHP() {
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
    case 'ward_selection':
      explorationUI.renderWardSelection();
      break;
    case 'exploring':
    case 'room':
    case 'room_encounter':
      explorationUI.renderExploring();
      break;
    case 'boss_ready':
      explorationUI.renderBossReady();
      break;
    case 'shrine':
      explorationUI.renderShrine(chipLoadoutCache);
      break;
    case 'quiz':
      explorationUI.renderQuiz();
      break;
    case 'wordDiscovery':
      explorationUI.renderWordDiscovery();
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
    case 'post_combat_shop':
      economyUI.renderPostCombatShop();
      break;
    case 'floor_complete':
      explorationUI.renderFloorComplete();
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
    // Refresh chip loadout cache so chip row stays in sync
    try {
      chipLoadoutCache = await apiGetChipLoadout();
    } catch (e) {
      console.warn('Failed to refresh chip loadout:', e);
    }
  } else {
    updateGameState({ ...gameState, phase: 'no_save' });
    chipLoadoutCache = null;
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

async function startNewRun() {
  // Note: clearWordCache() moved to returnToHub() for earlier prefetching
  const result = await apiStartRun();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    wordPractice.prefetchCombatWords(); // Fallback if not prefetched from hub
    if (gameState.run?.startingChipShop?.active) {
      await economyUI.renderStartingChipShop();
    }
  }
}

async function startEncounter() {
  const result = gameState.phase === 'room_encounter'
    ? await apiRoomEncounter()
    : await apiStartEncounter();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    const enemy = gameState.combat?.enemy;
    if (result?.dialogue || enemy?.dialogue?.possessed) {
      const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
        ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
        : enemy.dialogue.possessed);
      await showEnemyDialogue(text, 'possessed');
    }
    await delay(300);
    startCombatLoop();
  }
}

async function startBossEncounter() {
  const result = await apiStartBoss();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    const enemy = gameState.combat?.enemy;
    if (result?.dialogue || enemy?.dialogue?.possessed) {
      const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
        ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
        : enemy.dialogue.possessed);
      await showEnemyDialogue(text, 'possessed');
    }
    await delay(500);
    startCombatLoop();
  }
}

async function nextFloor() {
  const result = await apiNextFloor();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
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

  chipLoadoutCache = null;
  updateChipRow();
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  content.innerHTML = `
    <h2 style="text-align:center;margin-top:40%">Defeated</h2>
    <p style="text-align:center">Your run has ended.</p>
    <button class="action-btn action-btn-primary" id="gameover-hub-btn">ハブに戻る</button>
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

// ============ CHIP HANDLERS ============
async function openChipEquipView() {
  takeover.open('chipEquip');
  const content = takeover.getContent('chipEquip');
  content.innerHTML = '<p style="text-align:center;padding:20px">Loading...</p>';

  const data = await apiGetChipLoadout();
  chipLoadoutCache = data;

  const weaponData = data.equipment?.weapon || {};
  const equippedChips = weaponData.equippedChips || [];
  const maxSlots = weaponData.maxSlots || 5;
  // Build a fixed-length slots array: equipped chips + empty slots
  const equipped = Array.from({ length: maxSlots }, (_, i) => equippedChips[i] || null);
  const inventory = data.inventory || [];

  content.innerHTML = `
    <h3 style="margin:16px">Equipped Chips</h3>
    <div class="chip-equip-slots">
      ${equipped.map((chip, i) => chip ? `
        <div class="chip-equip-slot filled" data-action="unequip" data-index="${i}">
          <div class="chip-equip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.webp')"></div>
          <span class="chip-equip-name">${chip.name || chip.nameEn}</span>
          <span class="chip-equip-rarity ${chip.rarity || 'common'}">${chip.rarity || 'common'}</span>
        </div>
      ` : `
        <div class="chip-equip-slot empty" data-index="${i}">Empty</div>
      `).join('')}
    </div>
    <h3 style="margin:16px">Inventory</h3>
    <div class="chip-inventory-list">
      ${inventory.map((chip, i) => `
        <div class="chip-inventory-item" data-action="equip" data-chip-id="${chip.id}">
          <div class="chip-equip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.webp')"></div>
          <span class="chip-equip-name">${chip.name || chip.nameEn}</span>
          <span class="chip-equip-rarity ${chip.rarity || 'common'}">${chip.rarity || 'common'}</span>
        </div>
      `).join('')}
      ${inventory.length === 0 ? '<p style="padding:16px;opacity:0.6">No chips in inventory</p>' : ''}
    </div>
  `;

  content.querySelectorAll('[data-action="unequip"]').forEach(el => {
    el.addEventListener('click', async () => {
      const chip = equipped[parseInt(el.dataset.index)];
      if (chip) {
        await apiUnequipChip(chip.id, 'weapon');
        await openChipEquipView();
        updateChipRow();
      }
    });
  });

  content.querySelectorAll('[data-action="equip"]').forEach(el => {
    el.addEventListener('click', async () => {
      await apiEquipChip('weapon', el.dataset.chipId);
      await openChipEquipView();
      updateChipRow();
    });
  });
}

async function handleUseChipSkill(chipIndex) {
  const weapon = gameState.player?.equipment?.weapon;
  const chipEntry = weapon?.equippedChips?.[chipIndex];
  if (!chipEntry) return;

  const chipId = typeof chipEntry === 'string' ? chipEntry : chipEntry.id;
  if (!chipId) return;

  try {
    const response = await fetch(`${API_BASE}/api/game/use-chip-skill`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ chipId }),
    });
    const result = await response.json();
    if (result.error) {
      scene.showToast(result.error, 2000);
      return;
    }
    if (result.state) {
      updateGameState(result.state);
    }
    // Sync local state with backend HP after skill use
    if (result.enemyHp && gameState.combat?.enemy) {
      gameState.combat.enemy.hp = result.enemyHp.current;
    }
    if (result.playerHp && gameState.player) {
      gameState.player.hp = result.playerHp.current;
    }

    // Show skill activation as toast (doesn't overwrite flash cards)
    const skillName = result.skillNameEn || result.skillName || chipId;
    let toastMsg = `${skillName}!`;
    if (result.damage > 0) toastMsg += ` ${result.damage} dmg`;
    if (result.heal > 0) toastMsg += ` +${result.heal} HP`;
    if (result.skillType === 'buff') toastMsg += ' Buff active!';
    narrationBox.show(toastMsg, { autoDismiss: 1000 });

    updateUI();
  } catch (e) {
    console.error('Chip skill error:', e);
  }
}

// ============ CHIP ACTION HELPERS ============
function isChipActionBlocked() {
  return enemyDialogueActive || combatAnimationActive;
}

function getChipIds() {
  const chips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  return chips.map(c => c?.id || null);
}

async function handleChipReorder(newChipIds) {
  // Optimistic update for UI cache (rich chip objects with names, rarities, etc.)
  // chipLoadoutCache uses full chip objects and can include nulls for empty slots in UI
  const oldCacheChips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  const reorderedCacheChips = newChipIds.map(id => {
    if (id === null) return null;
    return oldCacheChips.find(c => c?.id === id) || null;
  }).filter(Boolean);  // Filter nulls - UI cache should match backend format

  if (chipLoadoutCache?.equipment?.weapon) {
    chipLoadoutCache.equipment.weapon.equippedChips = reorderedCacheChips;
  }

  // Also update gameState.player.equipment.weapon.equippedChips (stores chip IDs as strings)
  // This is critical because combat logic reads from gameState, not chipLoadoutCache
  // Filter nulls to maintain compact array format expected by game logic
  const oldStateChips = gameState.player?.equipment?.weapon?.equippedChips || [];
  const compactChipIds = newChipIds.filter(id => id !== null);
  if (gameState.player?.equipment?.weapon) {
    gameState.player.equipment.weapon.equippedChips = compactChipIds;
  }

  updateChipRow();

  // Persist to backend
  const result = await reorderChips(newChipIds);
  if (result.error) {
    // Revert on error
    console.error('Chip reorder failed:', result.error);
    if (chipLoadoutCache?.equipment?.weapon) {
      chipLoadoutCache.equipment.weapon.equippedChips = oldCacheChips;
    }
    if (gameState.player?.equipment?.weapon) {
      gameState.player.equipment.weapon.equippedChips = oldStateChips;
    }
    updateChipRow();
  }
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
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
    equipBots: () => openChipEquipView(),
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

      // Get both words to return the unchosen one
      const words = wordPractice.getTwoCombatWords();
      const unchosenWord = actionType === 'attack' ? words.defendWord : words.attackWord;

      // Return unchosen word to pool
      if (unchosenWord) {
        wordPractice.returnWordToPool(unchosenWord);
      }

      // Remove selected word from queue
      wordPractice.removeWordFromCombatQueue(selectedWord);

      // Dual card flips in place - no separate flash card needed
    },
  });

  chipRow.init({
    useSkillCallback: handleUseChipSkill,
    onReorder: handleChipReorder,
    isBlocked: isChipActionBlocked,
    getChipIds: getChipIds
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
    startBossEncounter,
    nextFloor,
    startNewRun,
    returnToHub,
    apiGetStartingWards,
    apiSelectStartingWard,
    apiGetNextWardOptions,
    apiSelectNextWard,
    apiProceed,
    apiRoomEncounter,
    apiShrineUpgrade,
    apiQuizReward,
    apiGetQuizQuestion,
    apiSubmitQuizAnswer,
    apiGetChipLoadout,
    setChipLoadoutCache: (cache) => { chipLoadoutCache = cache; },
    apiGetDiscoveryWords,
    apiGetDiscoveryStatus,
    apiCompleteDiscovery,
    apiSelectBranch,
    apiSwipeWord: (vid, sid, grade, isDiscovery) => apiSendJpdbReview(vid, sid, grade, isDiscovery),
    apiPostCombatRefresh: (words) => fetch('/api/game/post-combat-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ words })
    }),
    apiGetDueWords,
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    apiClaimStartingChip,
    apiStartingChipRefresh,
    apiPostCombatShopBuy,
    apiShopSkip,
    apiShopRefresh,
    apiGetChipLoadout,
    setChipLoadoutCache: (data) => { chipLoadoutCache = data; updateChipRow(); },
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
    narration: { showNarration: (text) => narrationBox.show(text) },
    wordPractice,
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => scene.showDamageNumber(dmg, { isCrit, isHeal, tierClass }),
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    animateEnemyHurt: () => {},
    animatePlayerHurt: () => {},
    animateEnemyDefeat: () => scene.hideEnemy(),
    updateActionPanel: () => {},
    playNarrationAudio: () => {},
    showVictoryModal,
    showGameOverModal,
    showEnemyDialogue,
    getChipLoadoutCache: () => chipLoadoutCache,
    setChipLoadoutCache: (data) => { chipLoadoutCache = data; updateChipRow(); },
    getEnemyDialogueActive: () => enemyDialogueActive,
    getDialogueDismissPromise: () => dialogueDismissPromise,
    delay,
    showFlashCard: (word) => {
      currentFlashCardWord = word;
      actions.showFlashCard(word);
    },
    showDualFlashCards: actions.showDualFlashCards,
    setCombatAnimationActive: (active) => { combatAnimationActive = active; },
  });

  setupEventListeners();
  setupPhaserEventListeners();

  // Wire logout button
  document.getElementById('logout-btn').addEventListener('click', () => {
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
