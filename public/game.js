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
  sendJpdbReview as apiSendJpdbReview
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
  } else {
    scene.hideEnemy();
  }
  if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
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

  const duration = type === 'liberated' ? 5000 : 3000;
  scene.showToast(text, duration);

  dialogueDismissPromise = new Promise(resolve => {
    dialogueDismissResolve = resolve;
    setTimeout(() => {
      enemyDialogueActive = false;
      resolve();
      dialogueDismissResolve = null;
      dialogueDismissPromise = null;
      // Resume combat after mid-combat dialogue (e.g., glitching at 30% HP)
      if (combatLoopUI.isCombatActive() && !combatLoopUI.isCombatPausedForVocab()) {
        combatLoopUI.executeEnemyAttackThenPause();
      }
    }, duration);
  });
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
  wordPractice.clearWordCache();
  const result = await apiStartRun();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
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
}

// ============ COMBAT ============
function startCombatLoop() { combatLoopUI.startCombatLoop(); }
function resumeCombatAfterVocab() { combatLoopUI.resumeCombatAfterVocab(); }

function showVictoryModal(result) {
  scene.showToast('Victory!', 2000);
  setTimeout(async () => {
    await loadGameState();
    updateUI();
  }, 1500);
}

function showGameOverModal(result) {
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

  const equipped = data.equipped || [];
  const inventory = data.inventory || [];

  content.innerHTML = `
    <h3 style="margin:16px">Equipped Chips</h3>
    <div class="chip-equip-slots">
      ${equipped.map((chip, i) => chip ? `
        <div class="chip-equip-slot filled" data-action="unequip" data-index="${i}">
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
  const chip = weapon?.equippedChips?.[chipIndex];
  if (!chip) return;

  try {
    const response = await fetch(`${API_BASE}/api/game/use-chip-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId: chip.id }),
    });
    const result = await response.json();
    if (result.error) {
      scene.showToast(result.error, 2000);
      return;
    }
    if (result.state) {
      updateGameState(result.state);
    }
    scene.showToast(result.message || `${chip.nameEn} activated!`, 2000);
    updateUI();
  } catch (e) {
    console.error('Chip skill error:', e);
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
  takeover.init();

  actions.init({
    equipBots: () => openChipEquipView(),
    contextAction: null,
    cardSwipe: handleCardSwipe,
    cardFlip: handleCardFlip,
  });

  chipRow.init({
    useSkillCallback: handleUseChipSkill,
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
    scene,
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
  });

  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    takeover,
    scene,
    apiClaimStartingChip,
    apiPostCombatShopBuy,
    apiShopSkip,
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
    narration: { showNarration: (text) => scene.showToast(text, 3000) },
    wordPractice,
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    showChipEffect: (name) => scene.showToast(name, 1500),
    animateEnemyHurt: () => {},
    animatePlayerHurt: () => {},
    animateEnemyDefeat: () => scene.hideEnemy(),
    animateChipPipeline: () => Promise.resolve(),
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
  });

  setupEventListeners();
  await loadGameState();
  updateUI();

  // Initialize TTS and review type from server settings
  const serverSettings = await settings.loadServerSettings();
  tts.initSettings(serverSettings);
  wordPractice.setReviewType?.(serverSettings.reviewType || 'flash-card');

  // Initialize audio on first user interaction (browser autoplay policy)
  async function ensureAudio() {
    await audio.initAudio();
    document.removeEventListener('click', ensureAudio);
    document.removeEventListener('touchstart', ensureAudio);
  }
  document.addEventListener('click', ensureAudio, { once: true });
  document.addEventListener('touchstart', ensureAudio, { once: true });

  if (gameState.phase === 'combat' && gameState.combat?.enemy?.hp > 0) {
    startCombatLoop();
  }
});
