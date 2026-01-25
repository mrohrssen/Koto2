// Register service worker for asset caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

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
  postCombatShopBuy as apiPostCombatShopBuy,
  shopSkip as apiShopSkip,
  equipChip as apiEquipChip,
  unequipChip as apiUnequipChip,
  nextFloor as apiNextFloor,
  getChipLoadout as apiGetChipLoadout,
  sendJpdbReview as apiSendJpdbReview,
  getAuthHeaders,
  shrineUpgrade as apiShrineUpgrade,
  quizReward as apiQuizReward,
  getQuizQuestion as apiGetQuizQuestion,
  submitQuizAnswer as apiSubmitQuizAnswer,
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

store.set('gameState', gameState);

function updateGameState(newState) {
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
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();
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
  } else {
    scene.hideEnemy();
  }
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.png');
  } else if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.png');
  } else if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  } else if (!gameState.run) {
    scene.setBackground('/assets/backgrounds/hub.png');
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
      actions.setContent('<button class="action-btn action-btn-primary" id="new-game-btn">New Game</button>');
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

  const speaker = gameState.combat?.enemy?.nameEn || gameState.combat?.enemy?.name;

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
  } else {
    updateGameState({ ...gameState, phase: 'no_save' });
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
    audio.playBGM('main');
    if (gameState.run?.startingChipShop?.active) {
      economyUI.renderStartingChipShop(gameState.run.startingChipShop.items);
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
  setTimeout(async () => {
    await loadGameState();
    updateUI();
  }, 1500);
}

function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');
  chipLoadoutCache = null;
  updateChipRow();
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  content.innerHTML = `
    <h2 style="text-align:center;margin-top:40%">Defeated</h2>
    <p style="text-align:center">Your run has ended.</p>
    <button class="action-btn action-btn-primary" id="gameover-hub-btn">Return to Hub</button>
  `;
  document.getElementById('gameover-hub-btn')?.addEventListener('click', async () => {
    takeover.close('gameover');
    await returnToHub();
  });
}

// ============ FLASH CARD HANDLERS ============
function handleCardSwipe(direction) {
  const grade = direction === 'right' ? 4 : 1;
  wordPractice.submitSelfGradeReview(grade);
}

function handleCardFlip() {
  if (currentFlashCardWord?.word) {
    tts.speakText(currentFlashCardWord.word);
  }
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
          <div class="chip-equip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.png')"></div>
          <span class="chip-equip-name">${chip.nameEn || chip.name}</span>
          <span class="chip-equip-rarity ${chip.rarity}">${chip.rarity}</span>
        </div>
      ` : `
        <div class="chip-equip-slot empty" data-index="${i}">Empty</div>
      `).join('')}
    </div>
    <h3 style="margin:16px">Inventory</h3>
    <div class="chip-inventory-list">
      ${inventory.map((chip, i) => `
        <div class="chip-inventory-item" data-action="equip" data-chip-id="${chip.id}">
          <div class="chip-equip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.png')"></div>
          <span class="chip-equip-name">${chip.nameEn || chip.name}</span>
          <span class="chip-equip-rarity ${chip.rarity}">${chip.rarity}</span>
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
      }
    });
  });

  content.querySelectorAll('[data-action="equip"]').forEach(el => {
    el.addEventListener('click', async () => {
      await apiEquipChip(el.dataset.chipId, 'weapon');
      await openChipEquipView();
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
  // Optimistic update
  const oldChips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  const reorderedChips = newChipIds.map(id => {
    if (id === null) return null;
    return oldChips.find(c => c?.id === id) || null;
  });

  if (chipLoadoutCache?.equipment?.weapon) {
    chipLoadoutCache.equipment.weapon.equippedChips = reorderedChips;
  }
  updateChipRow();

  // Persist to backend
  const result = await reorderChips(newChipIds);
  if (result.error) {
    // Revert on error
    console.error('Chip reorder failed:', result.error);
    if (chipLoadoutCache?.equipment?.weapon) {
      chipLoadoutCache.equipment.weapon.equippedChips = oldChips;
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

  actions.init({
    equipBots: () => openChipEquipView(),
    contextAction: null,
    cardSwipe: handleCardSwipe,
    cardFlip: handleCardFlip,
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
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    takeover,
    scene: { ...scene, showNarration: (text, opts) => narrationBox.show(text, opts) },
    apiClaimStartingChip,
    apiPostCombatShopBuy,
    apiShopSkip,
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
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
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
    setCombatAnimationActive: (active) => { combatAnimationActive = active; },
  });

  setupEventListeners();

  // Wire logout button
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) {
      auth.logout();
      auth.showAuthScreen();
    }
  });

  await loadGameState();

  // Fetch chip loadout on startup so chip row renders with equipped chips
  if (gameState.player) {
    try {
      chipLoadoutCache = await apiGetChipLoadout();
    } catch (e) {
      console.warn('Failed to fetch chip loadout:', e);
    }
  }

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
    // Start BGM if there's an active run
    if (gameState.phase && gameState.phase !== 'hub') {
      audio.playBGM('main');
    }
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
