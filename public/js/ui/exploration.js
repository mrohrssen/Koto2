/**
 * Exploration UI Module - Room navigation, ward selection, and content views
 *
 * Handles:
 * - Content views (no save, hub, exploring)
 * - Ward selection UI and keyboard navigation
 * - Room exploration (display, actions, navigation)
 * - Room interactions (treasure, trap, body, shrine)
 */

import * as narration from '../narration.js';
import * as background from '../background.js';

// Module state
let gameContent = null;
let actionPanel = null;
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let triggerJpdbParse = null;
let handlePlayerDefeat = null;
let startEncounter = null;
let startBossEncounter = null;
let openUpgradesModal = null;

// API functions
let apiGetStartingWards = null;
let apiGetNextWardOptions = null;
let apiSelectStartingWard = null;
let apiSelectNextWard = null;
let apiProceed = null;
let apiRoomEncounter = null;
let apiUseShrine = null;

// Ward selection state
let wardSelectionData = [];
let selectedWardIndex = 0;

// Fallback narrations
let FALLBACK_NARRATIONS = null;

/**
 * Initialize the exploration UI module
 * @param {Object} config Configuration object
 */
export function init(config) {
  gameContent = config.gameContent;
  actionPanel = config.actionPanel;
  getGameState = config.getGameState;
  updateGameState = config.updateGameState;
  updateUI = config.updateUI;
  triggerJpdbParse = config.triggerJpdbParse;
  handlePlayerDefeat = config.handlePlayerDefeat;
  startEncounter = config.startEncounter;
  startBossEncounter = config.startBossEncounter;
  openUpgradesModal = config.openUpgradesModal;
  FALLBACK_NARRATIONS = config.FALLBACK_NARRATIONS;

  // API functions
  apiGetStartingWards = config.apiGetStartingWards;
  apiGetNextWardOptions = config.apiGetNextWardOptions;
  apiSelectStartingWard = config.apiSelectStartingWard;
  apiSelectNextWard = config.apiSelectNextWard;
  apiProceed = config.apiProceed;
  apiRoomEncounter = config.apiRoomEncounter;
  apiUseShrine = config.apiUseShrine;
}

// ============ CONTENT VIEWS ============

/**
 * Show no save content (welcome screen)
 */
export function showNoSaveContent() {
  if (!gameContent) return;
  gameContent.innerHTML = `
    <div class="content-center">
      <div class="welcome-icon">&#x2694;</div>
      <h2>NEO TOKYO: System Liberation</h2>
      <p>Create your hunter to begin the journey into darkness.</p>
    </div>
  `;
  narration.showNarration(FALLBACK_NARRATIONS?.welcome || 'ようこそ、ハッカー。');
}

/**
 * Show hub content (hacker's den)
 */
export function showHubContent() {
  if (!gameContent) return;
  const gameState = getGameState();
  const essence = gameState.meta?.essence || 0;

  gameContent.innerHTML = `
    <div class="content-center">
      <div class="hub-icon">&#x1F5FC;</div>
      <h2>Hacker's Den</h2>
      <p>東京はSYSTEMに支配されている。解放の準備はできているか？</p>
      <div class="hub-essence" onclick="openUpgradesModal()">
        <span class="hub-essence-label">解放データ</span>
        <div class="hub-essence-value">
          <span class="essence-icon">01</span>
          <span>${essence}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Show ward selection content
 */
export async function showWardSelectionContent() {
  if (!gameContent) return;
  const gameState = getGameState();

  // Determine if this is starting ward or next ward selection
  const isNextWard = gameState.run?.currentWard != null;
  const currentWard = gameState.run?.currentWard;

  // Fetch ward options from appropriate API
  const wardOptions = isNextWard
    ? await apiGetNextWardOptions()
    : await apiGetStartingWards();

  if (wardOptions.length === 0) {
    gameContent.innerHTML = `
      <div class="content-center">
        <h2>Error</h2>
        <p>Failed to load ward options</p>
      </div>
    `;
    return;
  }

  // Store for keyboard navigation
  wardSelectionData = wardOptions.map(w => ({ id: w.id, isNextWard }));
  selectedWardIndex = 0;

  const wardCardsHtml = wardOptions.map((ward, index) => `
    <div class="ward-card${index === 0 ? ' selected' : ''}" data-ward-index="${index}" onclick="selectWard('${ward.id}', ${isNextWard})">
      <div class="ward-name">${ward.name}</div>
      <div class="ward-name-en">${ward.nameEn}</div>
      <div class="ward-theme">${ward.theme}</div>
      <div class="ward-tier">Tier ${ward.tier || 1}</div>
    </div>
  `).join('');

  const title = isNextWard ? '次の区を選択 (Select Next Ward)' : '区を選択 (Select Ward)';
  const desc = isNextWard
    ? `${currentWard}区クリア！次はどこへ向かう？`
    : 'どこから潜入を開始する？';

  gameContent.innerHTML = `
    <div class="ward-selection">
      <h2>${title}</h2>
      <p class="ward-selection-desc">${desc}</p>
      <div class="ward-cards">
        ${wardCardsHtml}
      </div>
    </div>
  `;
}

/**
 * Select a ward
 */
export async function selectWard(wardId, isNextWard = false) {
  const result = isNextWard
    ? await apiSelectNextWard(wardId)
    : await apiSelectStartingWard(wardId);

  if (result.error) {
    narration.showNarration(`選択失敗: ${result.error}`);
    return;
  }

  if (result.state) {
    updateGameState(result.state);
  }

  updateUI();
}

/**
 * Get ward selection data for keyboard navigation
 */
export function getWardSelectionData() {
  return wardSelectionData;
}

/**
 * Get selected ward index
 */
export function getSelectedWardIndex() {
  return selectedWardIndex;
}

/**
 * Set selected ward index
 */
export function setSelectedWardIndex(index) {
  selectedWardIndex = index;
}

/**
 * Update ward card selection visuals
 */
export function updateWardSelection(wardCards) {
  wardCards.forEach((card, i) => {
    card.classList.toggle('selected', i === selectedWardIndex);
  });
}

/**
 * Show exploring content (floor progress)
 */
export function showExploringContent() {
  if (!gameContent) return;
  const gameState = getGameState();
  const run = gameState.run;
  if (!run) return;

  const progress = [];
  for (let i = 0; i < run.encountersNeeded; i++) {
    const completed = i < run.encountersCompleted;
    progress.push(`<div class="progress-dot ${completed ? 'completed' : ''}"></div>`);
  }
  progress.push(`<div class="progress-dot boss-dot"></div>`);

  gameContent.innerHTML = `
    <div class="floor-display">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="floor-status">Exploring...</span>
      </div>
      <div class="progress-bar">
        ${progress.join('')}
      </div>
      <div class="encounters-text">
        ${run.encountersCompleted}/${run.encountersNeeded} encounters cleared
      </div>
    </div>
  `;
}

// ============ ROOM EXPLORATION UI ============

/**
 * Show room content display
 */
export function showRoomContent() {
  if (!gameContent) return;
  const gameState = getGameState();
  const run = gameState.run;
  const room = gameState.room;
  if (!run || !room) return;

  const roomIcon = getRoomIcon(room.type);
  const roomTypeName = getRoomTypeName(room.type);

  // Progress dots showing rooms
  const totalRooms = run.totalRooms || room.totalRooms || 15;
  const currentRoom = run.currentRoom || 0;

  // Create a simplified progress bar for rooms
  let progressHTML = '<div class="room-progress">';
  for (let i = 0; i < totalRooms; i++) {
    let dotClass = 'room-dot';
    if (i < currentRoom) dotClass += ' explored';
    else if (i === currentRoom) dotClass += ' current';
    if (i === totalRooms - 1) dotClass += ' boss-room';
    progressHTML += `<div class="${dotClass}"></div>`;
  }
  progressHTML += '</div>';

  gameContent.innerHTML = `
    <div class="floor-display room-display">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="room-number">Room ${currentRoom + 1}/${totalRooms}</span>
      </div>
      ${progressHTML}
      <div class="room-info">
        <div class="room-icon">${roomIcon}</div>
        <div class="room-type">${roomTypeName}</div>
      </div>
    </div>
  `;
}

/**
 * Show room action buttons
 */
export function showRoomActions() {
  if (!actionPanel) return;
  const gameState = getGameState();
  const room = gameState.room;
  console.log('[showRoomActions] room:', room?.type, 'actions:', room?.actions);
  if (!room) {
    actionPanel.innerHTML = '<button class="action-btn primary" onclick="proceedToNextRoom()">進む</button>';
    return;
  }

  const actions = room.actions || [];
  let buttonsHTML = '';

  for (const action of actions) {
    let btnClass;
    if (action.id === 'boss_fight') {
      btnClass = 'boss';
    } else if (action.id === 'fight') {
      btnClass = 'danger';
    } else if (action.id === 'proceed') {
      btnClass = 'primary';
    } else {
      btnClass = 'secondary';
    }

    buttonsHTML += `
      <button class="action-btn ${btnClass}" onclick="handleRoomAction('${action.id}')" title="${action.description || ''}">
        ${action.name}
      </button>
    `;
  }

  actionPanel.innerHTML = buttonsHTML || '<button class="action-btn primary" onclick="proceedToNextRoom()">進む</button>';
}

/**
 * Get room icon by type
 */
export function getRoomIcon(type) {
  const icons = {
    empty: '🚪',
    encounter: '⚔️',
    shrine: '⛩️',
    boss: '👹'
  };
  return icons[type] || '❓';
}

/**
 * Get room type name (Japanese)
 */
export function getRoomTypeName(type) {
  const names = {
    empty: '何もない部屋',
    encounter: '敵がいる！',
    shrine: '神秘的な祠',
    boss: 'ボスの間'
  };
  return names[type] || '不明な部屋';
}

/**
 * Handle room action
 */
export async function handleRoomAction(actionId) {
  console.log('handleRoomAction called with:', actionId);
  switch (actionId) {
    case 'proceed':
      console.log('Calling proceedToNextRoom...');
      await proceedToNextRoom();
      break;
    case 'fight':
      await startEncounter();
      break;
    case 'boss_fight':
      await startBossEncounter();
      break;
    case 'pray':
      await useShrine();
      break;
    default:
      console.warn('Unknown room action:', actionId);
  }
}

/**
 * Proceed to next room
 */
export async function proceedToNextRoom() {
  console.log('proceedToNextRoom called');
  const result = await apiProceed();
  console.log('proceedToNextRoom result:', result ? 'success' : 'null');
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    narration.showNarration(result.narration || '次の部屋に入った。');
    background.updateBackground();
    updateUI();
    triggerJpdbParse();
  }
}

/**
 * Start room encounter
 */
export async function startRoomEncounter() {
  const result = await apiRoomEncounter();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    const gameState = getGameState();
    const enemy = result.enemy || gameState.combat?.enemy;
    narration.showNarration(result.narration || FALLBACK_NARRATIONS?.combatStart?.(enemy) || '戦闘開始！');
    updateUI();
    triggerJpdbParse();
  }
}

/**
 * Use shrine
 */
export async function useShrine() {
  const result = await apiUseShrine();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    narration.showNarration(result.narration);
    updateUI();
    triggerJpdbParse();
  }
}
