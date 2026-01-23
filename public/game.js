/**
 * Game.js - Main UI Orchestrator (Mobile-First Rewrite)
 *
 * Initializes UI modules, manages game state, routes phases to renderers.
 * Existing server API and game logic remain unchanged.
 */

import { dom } from './js/dom.js';
import * as scene from './js/ui/scene.js';
import * as chipRow from './js/ui/chip-row.js';
import * as hpBar from './js/ui/hp-bar.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import { getApiKeys, saveApiKeys, hasJpdbApiKey } from './js/settings.js';
import * as tts from './js/tts.js';

// ============ GAME STATE ============

let gameState = null;
let combatActive = false;

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', async () => {
  // Init UI modules
  takeover.init();
  chipRow.init({ useSkillCallback: handleUseSkill });
  actions.init({
    equipBots: handleEquipBots,
    contextAction: handleContextAction,
    cardSwipe: handleCardSwipe,
    cardFlip: handleCardFlip,
  });

  // Utility buttons
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.resetRunBtn.addEventListener('click', handleResetRun);

  // Load game
  await loadGameState();
  updateUI();
});

// ============ GAME STATE MANAGEMENT ============

async function loadGameState() {
  try {
    const response = await fetch('/api/game/state');
    gameState = await response.json();
  } catch (err) {
    console.error('Failed to load game state:', err);
    gameState = { phase: 'no_save' };
  }
}

// ============ MASTER UI ROUTER ============

function updateUI() {
  if (!gameState) return;

  const phase = gameState.phase;

  // Status bar
  updateStatusBar();

  // Scene area
  updateScene();

  // Chip row + HP bar (visible in all non-takeover phases)
  const showGameUI = !['no_save'].includes(phase);
  dom.chipRow.classList.toggle('hidden', !showGameUI);
  dom.playerHpContainer.classList.toggle('hidden', !showGameUI);

  if (showGameUI && gameState.player) {
    renderChips();
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
  }

  // Route to phase-specific action area
  switch (phase) {
    case 'no_save':
      renderNoSave();
      break;
    case 'hub':
      renderHub();
      break;
    case 'ward_selection':
      renderWardSelection();
      break;
    case 'exploring':
      renderExploring();
      break;
    case 'room':
    case 'room_encounter':
      renderRoomEncounter();
      break;
    case 'combat':
      renderCombat();
      break;
    case 'post_combat_shop':
      renderPostCombatShop();
      break;
    case 'floor_complete':
      renderFloorComplete();
      break;
    case 'run_ended':
      renderRunEnded();
      break;
    default:
      renderHub();
  }
}

// ============ STATUS BAR ============

function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    dom.floorIndicator.textContent = `Floor ${run.floor || 1}`;
  } else {
    dom.floorIndicator.textContent = 'Hub';
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || 0;
}

// ============ SCENE RENDERING ============

function updateScene() {
  const phase = gameState.phase;
  const run = gameState.run;
  const combat = gameState.combat;

  // Background
  if (run?.background) {
    scene.setBackground(`/assets/backgrounds/${run.background}`);
  } else {
    scene.setBackground('/assets/backgrounds/hub.png');
  }

  // Enemy
  if (combat?.enemy && ['combat', 'room_encounter'].includes(phase)) {
    scene.showEnemy(combat.enemy);
  } else {
    scene.hideEnemy();
  }
}

// ============ CHIP ROW ============

function renderChips() {
  const equipped = gameState.player?.equippedChips || [];
  const charges = gameState.combat?.chipCharges || new Array(5).fill(0);
  const levels = equipped.map(c => c?.level || 1);

  chipRow.render(equipped, {
    charges,
    levels,
    maxCharges: 5,
    inCombat: gameState.phase === 'combat',
  });
}

// ============ PHASE RENDERERS ============

function renderNoSave() {
  dom.chipRow.classList.add('hidden');
  dom.playerHpContainer.classList.add('hidden');
  scene.setBackground('/assets/backgrounds/hub.png');
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="new-game-start">New Game</button>
  `);
  document.getElementById('new-game-start').addEventListener('click', handleNewGame);
}

function renderHub() {
  scene.setBackground('/assets/backgrounds/hub.png');
  actions.showButtons('Infiltrate');
}

function renderWardSelection() {
  // Ward options shown in scene area
  const wards = gameState.run?.availableWards || [];
  const wardHtml = wards.map((w, i) => `
    <div class="ward-option" data-index="${i}">
      <div class="ward-option-name">${w.nameEn || w.name}</div>
      <div class="ward-option-desc">${w.description || ''}</div>
    </div>
  `).join('');

  // Clear any previous ward options
  document.getElementById('ward-options')?.remove();

  dom.sceneArea.insertAdjacentHTML('beforeend',
    `<div class="ward-options" id="ward-options">${wardHtml}</div>`);

  // Ward tap selection
  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(w => w.classList.remove('selected'));
      el.classList.add('selected');
      const ctxBtn = document.getElementById('context-action-btn');
      if (ctxBtn) ctxBtn.disabled = false;
    });
  });

  actions.showButtons('Proceed', { contextDisabled: true });
}

function renderExploring() {
  actions.showButtons('Proceed');
}

function renderRoomEncounter() {
  actions.showButtons('Fight');
}

function renderCombat() {
  combatActive = true;
  showNextVocabCard();
}

function renderPostCombatShop() {
  takeover.open('chipShop');
  const chips = gameState.combat?.rewards?.chips || [];
  const content = takeover.getContent('chipShop');
  content.innerHTML = `
    <h2 style="text-align:center;margin-bottom:16px;">Choose a Bot</h2>
    <div class="shop-chips">
      ${chips.map((c, i) => `
        <div class="shop-chip-option" data-index="${i}">
          <strong>${c.nameEn || c.name}</strong>
          <div style="font-size:12px;color:var(--text-secondary)">${c.description || ''}</div>
        </div>
      `).join('')}
    </div>
  `;

  content.querySelectorAll('.shop-chip-option').forEach(el => {
    el.addEventListener('click', () => handleChipSelection(parseInt(el.dataset.index)));
  });
}

function renderFloorComplete() {
  actions.showButtons('Continue');
}

function renderRunEnded() {
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const stats = gameState.run || {};
  content.innerHTML = `
    <div class="gameover-content">
      <div class="gameover-title">${gameState.player?.hp <= 0 ? 'Defeated' : 'Run Complete'}</div>
      <div class="gameover-stats">
        <p>Floor reached: ${stats.floor || 1}</p>
        <p>Words reviewed: ${stats.wordsReviewed || 0}</p>
      </div>
      <button class="action-btn action-btn-primary" id="return-hub-btn">Return to Hub</button>
    </div>
  `;
  document.getElementById('return-hub-btn').addEventListener('click', handleReturnToHub);
}

// ============ COMBAT FLOW ============

async function showNextVocabCard() {
  const word = await getNextWord();
  if (word) {
    actions.showFlashCard(word);
  }
}

async function getNextWord() {
  try {
    const response = await fetch('/api/vocab/next');
    if (!response.ok) throw new Error('No word available');
    return await response.json();
  } catch {
    // Fallback word
    return { word: '食べる', meanings: ['eat'], reading: 'たべる' };
  }
}

// ============ EVENT HANDLERS ============

function handleEquipBots() {
  takeover.open('chipEquip');
  renderChipEquipView();
}

function handleContextAction() {
  const phase = gameState.phase;
  switch (phase) {
    case 'hub':
      startRun();
      break;
    case 'ward_selection':
      confirmWardSelection();
      break;
    case 'exploring':
      proceedToNextRoom();
      break;
    case 'room_encounter':
      startCombat();
      break;
    case 'floor_complete':
      advanceFloor();
      break;
    default:
      break;
  }
}

async function handleCardSwipe(direction) {
  const correct = direction === 'right';
  try {
    await fetch('/api/game/attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correct }),
    });
  } catch (err) {
    console.error('Attack failed:', err);
  }

  await loadGameState();

  if (gameState.phase === 'combat') {
    updateScene();
    renderChips();
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
    showNextVocabCard();
  } else {
    combatActive = false;
    updateUI();
  }
}

function handleCardFlip() {
  const front = document.querySelector('.flash-card-front');
  if (front) {
    tts.playWord(front.textContent);
  }
}

function handleUseSkill(chipIndex) {
  fetch('/api/game/use-skill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chipIndex }),
  }).then(() => loadGameState()).then(() => {
    renderChips();
    updateScene();
  });
}

async function handleNewGame() {
  await fetch('/api/game/new', { method: 'POST' });
  await loadGameState();
  updateUI();
}

async function startRun() {
  const resp = await fetch('/api/game/start-run', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function confirmWardSelection() {
  const selected = document.querySelector('.ward-option.selected');
  if (!selected) return;
  const index = parseInt(selected.dataset.index);
  const resp = await fetch('/api/game/select-ward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wardIndex: index }),
  });
  gameState = await resp.json();
  document.getElementById('ward-options')?.remove();
  updateUI();
}

async function proceedToNextRoom() {
  const resp = await fetch('/api/game/proceed', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function startCombat() {
  const resp = await fetch('/api/game/start-combat', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function advanceFloor() {
  const resp = await fetch('/api/game/advance-floor', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function handleChipSelection(index) {
  const resp = await fetch('/api/game/select-chip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chipIndex: index }),
  });
  gameState = await resp.json();
  takeover.close('chipShop');
  updateUI();
}

function handleReturnToHub() {
  takeover.close('gameover');
  fetch('/api/game/return-hub', { method: 'POST' })
    .then(() => loadGameState())
    .then(() => updateUI());
}

async function handleResetRun() {
  if (!confirm('Abandon current run?')) return;
  await fetch('/api/game/reset-run', { method: 'POST' });
  await loadGameState();
  takeover.closeAll();
  updateUI();
}

function openSettings() {
  takeover.open('settings');
  renderSettingsView();
}

// ============ CHIP EQUIP VIEW ============

function renderChipEquipView() {
  const content = takeover.getContent('chipEquip');
  const equipped = gameState.player?.equippedChips || [];
  const available = gameState.player?.inventory?.chips || [];

  content.innerHTML = `
    <h2 style="text-align:center;margin-bottom:16px;">Equip Bots</h2>
    <div class="equip-slots">
      ${[0,1,2,3,4].map(i => {
        const chip = equipped[i];
        return `<div class="equip-slot ${chip ? 'filled' : ''}" data-slot="${i}">
          ${chip ? getChipInitial(chip) : ''}
        </div>`;
      }).join('')}
    </div>
    <h3 style="margin-bottom:8px;">Available</h3>
    <div class="available-chips">
      ${available.map((c, i) => `
        <div class="chip-card" data-chip-index="${i}">
          <strong>${c.nameEn || c.name}</strong>
          <div style="font-size:11px;color:var(--text-secondary)">${c.rarity}</div>
        </div>
      `).join('')}
    </div>
  `;

  content.querySelectorAll('.chip-card').forEach(el => {
    el.addEventListener('click', async () => {
      const chipIdx = parseInt(el.dataset.chipIndex);
      await fetch('/api/game/equip-chip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIndex: chipIdx }),
      });
      await loadGameState();
      renderChipEquipView();
      renderChips();
    });
  });
}

function getChipInitial(chip) {
  return (chip.nameEn || chip.name || '?').charAt(0).toUpperCase();
}

// ============ SETTINGS VIEW ============

function renderSettingsView() {
  const content = takeover.getContent('settings');
  const keys = getApiKeys();
  content.innerHTML = `
    <h2 style="margin-bottom:16px;">Settings</h2>
    <div class="settings-group">
      <div class="settings-group-title">JPDB API Key</div>
      <input class="settings-input" type="password" id="jpdb-key-input"
        value="${keys.jpdbApiKey || ''}" placeholder="Enter JPDB API key">
    </div>
    <div class="settings-group">
      <div class="settings-group-title">TTS</div>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="tts-enabled" ${tts.isEnabled() ? 'checked' : ''}>
        Enable Text-to-Speech
      </label>
    </div>
    <button class="action-btn action-btn-primary" id="save-settings-btn">Save</button>
  `;

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const jpdbKey = document.getElementById('jpdb-key-input').value;
    const ttsChecked = document.getElementById('tts-enabled').checked;
    saveApiKeys({ jpdbApiKey: jpdbKey });
    tts.setEnabled(ttsChecked);
    scene.showToast('Settings saved');
    takeover.close('settings');
  });
}
