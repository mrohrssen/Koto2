/**
 * @file exploration.js - Non-Combat Navigation UI
 *
 * PURPOSE:
 * Handles all non-combat game phases: hub, area selection, room exploration,
 * shrine upgrades, and quiz encounters. Renders appropriate buttons and
 * manages phase-specific interactions.
 *
 * KEY EXPORTS:
 * - init(callbacks): Initialize with game state and API callbacks
 * - renderHub(): Show hub phase (Equip Bots + Infiltrate buttons)
 * - renderAreaSelection(): Show area picker cards
 * - renderExploring(): Show Proceed/Fight buttons for room navigation
 * - renderAreaComplete(): Show Continue button after area cleared
 * - renderRunEnded(): Show Return to Hub button
 * - renderShrine(): Show robot level-up selection
 * - renderQuiz(): Show quiz question and reward selection
 *
 * DEPENDENCIES:
 * - Callbacks injected via init(): getGameState, updateGameState, updateUI
 * - API functions: apiGetAreaOptions, apiSelectArea, apiProceed, etc.
 * - actions module: For button rendering
 * - scene module: For narration display
 */

import * as speedReview from './speed-review.js';
import { playSFX } from '../audio.js';
import { speakNarration, prefetchNarration } from '../tts.js';
import { robotBgUrl, configureRobotImg } from './sprite-utils.js';
import { t, isJapanified } from './i18n.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startNewRun = null;
let returnToHub = null;

// Module-level guard to prevent multiple shrine clicks across re-renders
let shrineInProgress = false;

// Request counter to invalidate stale renderBranchSelection invocations
let branchSelectionRequestId = 0;

// Chippy's natural transition phrases for left/right door hints (20 pairs)
const DOOR_INTROS = [
  { left: '左のドアだけど…', right: 'で、右のドアは…' },
  { left: '左の方はね…', right: '右の方はね…' },
  { left: 'まず左のドアから。', right: 'それから右のドア。' },
  { left: '左のドアからいくよ。', right: '次、右のドア。' },
  { left: '左側のドア…', right: 'そして右側は…' },
  { left: 'えっとね、左のドアは…', right: 'んで、右のドアは…' },
  { left: '左のドアの奥から…', right: '右のドアの奥からは…' },
  { left: '左から感じるのは…', right: '右から感じるのは…' },
  { left: '左のドア、ちょっと気になる。', right: '右のドアも見てみると…' },
  { left: 'こっちの左のドアはね…', right: 'あっちの右のドアは…' },
  { left: '左の扉に近づくと…', right: '右の扉に近づくと…' },
  { left: 'まずは左！', right: 'そして右！' },
  { left: '左のドア、嗅いでみると…', right: '右のドア、嗅いでみると…' },
  { left: '左の方に耳を当てると…', right: '右の方に耳を当てると…' },
  { left: '左のドアに触れてみた。', right: '右のドアにも触れてみた。' },
  { left: 'ねえ、左のドアなんだけど…', right: 'で、右のドアはっていうと…' },
  { left: '左の気配は…', right: '右の気配は…' },
  { left: '左のドア、覗いてみたよ。', right: '右のドアも覗いてみた。' },
  { left: 'うーん、左はね…', right: 'うーん、右はね…' },
  { left: '左のドアの向こうは…', right: '右のドアの向こうは…' },
];

// Module-level state for word discovery (persists across gameState updates)
// This prevents infinite narration loops when updateGameState() replaces room object
let discoveryState = {
  fetched: false,
  words: [],
  wordsLearned: 0,
  roomId: null,  // Reset when room changes
  statusChecked: false,
  atLimit: false,
  todayCount: 0,
  dailyLimit: 10
};

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

// Branch selection API
let apiSelectBranch = null;
let apiDoorHints = null;

// Whack-a-Mole API
let apiGetWhackAMolePool = null;
let apiCompleteWhackAMole = null;

// Speed review API
let apiGetDueWords = null;

// Level select API functions
let apiGetLevels = null;
let apiSelectLevel = null;
let apiGetRobotCollection = null;
let showCollectionSelect = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startNewRun = callbacks.startNewRun;
  returnToHub = callbacks.returnToHub;
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
  apiSelectBranch = callbacks.apiSelectBranch;
  apiDoorHints = callbacks.apiDoorHints;
  apiGetDueWords = callbacks.apiGetDueWords;
  apiGetLevels = callbacks.apiGetLevels;
  apiSelectLevel = callbacks.apiSelectLevel;
  apiGetRobotCollection = callbacks.apiGetRobotCollection;
  showCollectionSelect = callbacks.showCollectionSelect;
  apiGetWhackAMolePool = callbacks.apiGetWhackAMolePool;
  apiCompleteWhackAMole = callbacks.apiCompleteWhackAMole;
}

// ============ INVENTORY OVERLAY ============

/** Buff metadata: maps itemBuffs fields to display info */
const BUFF_DISPLAY = {
  attackMult:        { name: '攻撃強化',     nameEn: 'ATK Boost',       icon: '⚔️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  hpMult:            { name: '体力強化',     nameEn: 'HP Boost',        icon: '❤️', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  autoPowerMult:     { name: '自動攻撃強化', nameEn: 'Auto Power',      icon: '🔄', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  ultimatePowerMult: { name: '必殺技強化',   nameEn: 'Ultimate Power',  icon: '💥', default: 1.0, format: v => `+${Math.round((v - 1.0) * 100)}%` },
  elementEdge:       { name: '属性強化',     nameEn: 'Element Edge',    icon: '🔷', default: 0,   format: v => `+${v.toFixed(2)}` },
  flatDamageReduction: { name: '装甲強化',   nameEn: 'Thick Armor',     icon: '🛡️', default: 0,   format: v => `-${v} dmg` }
};

/** Show inventory overlay listing all active persistent item buffs */
function showInventory() {
  // Remove existing overlay if any
  document.getElementById('inventory-overlay')?.remove();

  const gameState = getGameState();
  const itemBuffs = gameState.run?.itemBuffs;

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
    : '<div class="inventory-empty">アイテムなし<br><small>No active buffs</small></div>';

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
      <div class="inventory-list">${buffsHtml}</div>
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

/** Hub phase — show Speed Review + Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px;">
      <button class="action-btn action-btn-secondary" id="speed-review-btn">\uD83D\uDCDA 速習</button>
      <button class="action-btn action-btn-primary" id="context-action-btn">\u26A1 潜入</button>
    </div>
  `);

  document.getElementById('speed-review-btn')?.addEventListener('click', async () => {
    playSFX('button-tap');
    // Fetch due words and start speed review
    const result = await apiGetDueWords();
    if (result?.words?.length > 0) {
      speedReview.start(result.words);
    } else {
      sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
    }
  });

  document.getElementById('context-action-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    renderLevelSelect();
  });
}

/** Level select — show scrollable list of level cards */
export async function renderLevelSelect() {
  const result = await apiGetLevels();
  if (!result?.levels) {
    actions.setContent('<p style="text-align:center">Failed to load levels</p>');
    return;
  }

  const { levels, progress } = result;
  const { highestUnlocked, completed } = progress;

  const cardsHtml = levels.map(level => {
    const isCompleted = completed.includes(level.id);
    const isUnlocked = level.id <= highestUnlocked;

    let statusIcon = '';
    let stateClass = '';
    if (isCompleted) {
      statusIcon = '<span class="level-status level-complete">\u2713</span>';
      stateClass = 'level-completed';
    } else if (isUnlocked) {
      statusIcon = `<span class="level-status level-new">${t('new')}</span>`;
      stateClass = 'level-unlocked';
    } else {
      statusIcon = '<span class="level-status level-locked">\uD83D\uDD12</span>';
      stateClass = 'level-locked';
    }

    return `
      <div class="level-card ${stateClass}" data-level-id="${level.id}" ${!isUnlocked ? 'aria-disabled="true"' : ''}>
        <div class="level-number">${level.id}</div>
        <div class="level-info">
          <div class="level-name">${level.nameJa}</div>
          <div class="level-name-en">${level.name}</div>
        </div>
        ${statusIcon}
      </div>
    `;
  }).join('');

  actions.setContent(`
    <div class="level-select-header">\u30EC\u30D9\u30EB\u9078\u629E</div>
    <div class="level-select-list">${cardsHtml}</div>
    <button class="action-btn action-btn-tertiary" id="level-back-btn">\u623B\u308B</button>
  `);

  // Click handlers for unlocked levels
  document.querySelectorAll('.level-card:not(.level-locked)').forEach(card => {
    card.addEventListener('click', async () => {
      const levelId = parseInt(card.dataset.levelId);
      playSFX('button-tap');

      // Show starter robot selection before starting the run
      let starterIds = null;
      if (apiGetRobotCollection && showCollectionSelect) {
        const collectionResult = await apiGetRobotCollection();
        const catalog = collectionResult?.catalog;
        const collection = collectionResult?.collection;
        if (catalog && catalog.length > 0) {
          starterIds = await showCollectionSelect(catalog, collection);
          if (!starterIds || starterIds.length === 0) {
            document.querySelector('.game-app')?.querySelector('.collection-select')?.remove();
            return;
          }
        }
      }

      // Retry up to 3 times if isLoading blocks the call
      let runResult = null;
      for (let attempt = 0; attempt < 3 && !runResult?.state; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 300));
        runResult = await apiSelectLevel(levelId, starterIds);
      }

      document.querySelector('.game-app')?.querySelector('.collection-select')?.remove();
      if (runResult?.state) {
        updateGameState(runResult.state);
        updateUI();
      }
    });
  });

  // Back button
  document.getElementById('level-back-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    updateUI();
  });
}

/** Area selection — show area cards, proceed button */
export async function renderAreaSelection() {
  const gameState = getGameState();

  // Skip if starting chip shop is active - chip selection will render instead
  if (gameState.run?.startingChipShop?.active) {
    return;
  }

  const areas = await apiGetAreaOptions();

  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  let selectedAreaId = null;

  const areaHtml = areas.map(a => `
    <div class="ward-option" data-area-id="${a.id}">
      <strong>${a.nameEn || a.name}</strong>
      <small>${a.theme || ''}</small>
    </div>
  `).join('');

  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Area ${areasCompleted + 1} / ${areasToWin}
    </p>
    <div class="ward-selection-list">${areaHtml}</div>
    <button class="action-btn action-btn-primary" id="area-proceed-btn" disabled>進む</button>
  `);

  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedAreaId = el.dataset.areaId;
      const btn = document.getElementById('area-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('area-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedAreaId) return;
    const result = await apiSelectArea(selectedAreaId);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Exploring phase — show Proceed or Fight button */
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    actions.setContent(`
      <button class="action-btn action-btn-tertiary" id="inventory-btn">\uD83D\uDCE6 インベントリ</button>
      <button class="action-btn action-btn-primary" id="equip-bots-btn">\uD83E\uDD16 ボット装備</button>
      <button class="action-btn action-btn-secondary" id="fight-btn">\u2694\uFE0F 戦う</button>
    `);
    document.getElementById('inventory-btn')?.addEventListener('click', showInventory);
    document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
      actions.triggerEquipBots();
    });
    document.getElementById('fight-btn')?.addEventListener('click', () => {
      startEncounter();
    });
    return;
  }

  actions.setContent(`
    <button class="action-btn action-btn-tertiary" id="inventory-btn">\uD83D\uDCE6 インベントリ</button>
    <button class="action-btn action-btn-primary" id="equip-bots-btn">\uD83E\uDD16 ボット装備</button>
    <button class="action-btn action-btn-secondary" id="proceed-btn">\u27A1\uFE0F 進む</button>
  `);
  document.getElementById('inventory-btn')?.addEventListener('click', showInventory);
  document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
    actions.triggerEquipBots();
  });
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Branch selection phase - Chippy senses what's behind each door */
export async function renderBranchSelection() {
  const myRequestId = ++branchSelectionRequestId;
  const gameState = getGameState();
  const currentRoomIndex = gameState.run?.currentRoom;
  const pair = gameState.run?.rooms?.[currentRoomIndex];

  // Helper: returns true if this invocation has been superseded
  const isStale = () =>
    myRequestId !== branchSelectionRequestId ||
    getGameState().phase !== 'branch_selection';

  if (!Array.isArray(pair) || pair.length !== 2) {
    console.error('[BranchSelection] Invalid room pair');
    return;
  }

  // Show Chippy sprite and two-door background
  sceneModule.showChippy();
  sceneModule.setBackground('/assets/backgrounds/branch_doors.webp');

  // Show greyed-out door buttons while Chippy narrates
  actions.setContent(`
    <button class="action-btn action-btn-secondary branch-option disabled" data-door="0" disabled>\uD83D\uDEAA 左のドア</button>
    <button class="action-btn action-btn-secondary branch-option disabled" data-door="1" disabled>\uD83D\uDEAA 右のドア</button>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  // Fetch AI-remixed door hints from backend
  let door1Hint = '何かを感じる...';
  let door2Hint = '何かを感じる...';

  try {
    const result = await apiDoorHints();
    if (isStale()) return;
    if (result?.hints) {
      door1Hint = result.hints.door1;
      door2Hint = result.hints.door2;
    }
  } catch (e) {
    console.warn('[BranchSelection] Failed to fetch door hints:', e);
  }

  if (isStale()) return;

  // Prepend natural left/right transition phrase so player knows which door Chippy means
  const intro = DOOR_INTROS[Math.floor(Math.random() * DOOR_INTROS.length)];
  door1Hint = intro.left + door1Hint;
  door2Hint = intro.right + door2Hint;

  // Show door 1 hint with Chippy as speaker, auto-play TTS
  // Prefetch door 2 audio while user reads door 1
  prefetchNarration(door2Hint);
  speakNarration(door1Hint);
  await sceneModule.showNarration(door1Hint, { speaker: 'チッピー' });
  if (isStale()) return;

  // Show door 2 hint with Chippy as speaker, auto-play TTS (already prefetched)
  speakNarration(door2Hint);
  await sceneModule.showNarration(door2Hint, { speaker: 'チッピー' });
  if (isStale()) return;

  // Now show the door selection UI
  let selectedDoor = null;

  actions.setContent(`
    <button class="action-btn action-btn-secondary branch-option" data-door="0">\uD83D\uDEAA 左のドア</button>
    <button class="action-btn action-btn-secondary branch-option" data-door="1">\uD83D\uDEAA 右のドア</button>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  // Allow re-reading hints by clicking doors before confirming
  document.querySelectorAll('.branch-option').forEach(el => {
    el.addEventListener('click', () => {
      if (isStale()) return;
      document.querySelectorAll('.branch-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedDoor = parseInt(el.dataset.door, 10);
      const btn = document.getElementById('branch-proceed-btn');
      if (btn) btn.disabled = false;

      // Re-show the hint for the clicked door
      const hint = selectedDoor === 0 ? door1Hint : door2Hint;
      speakNarration(hint);
      sceneModule.showNarration(hint, { speaker: 'チッピー', persistent: true });
    });
  });

  document.getElementById('branch-proceed-btn')?.addEventListener('click', async () => {
    if (selectedDoor === null) return;

    // Invalidate stale branch selection callbacks
    branchSelectionRequestId++;

    // Hide persistent narration and Chippy
    if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
    sceneModule.hideChippy();

    const result = await apiSelectBranch(selectedDoor);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
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
    <button class="action-btn action-btn-primary" id="next-area-btn">次のエリアへ</button>
  `);

  document.getElementById('next-area-btn')?.addEventListener('click', () => {
    updateUI();
  });
}

/** Run complete (game victory) — show Return to Hub */
export function renderRunComplete() {
  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      ゲームクリア！おめでとう！
    </p>
    <button class="action-btn action-btn-primary" id="victory-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    apiReturnToHub();
  });
}

/** Run ended — show Return to Hub */
export function renderRunEnded() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="return-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('return-hub-btn')?.addEventListener('click', () => {
    returnToHub();
  });
}

/** Shrine phase - show robot roster for level-up */
export function renderShrine() {
  const gameState = getGameState();
  const robotParty = gameState.run?.robotParty;

  if (!robotParty) {
    actions.setContent(`
      <p style="text-align:center;color:var(--text-secondary)">No robots in party</p>
      <button class="action-btn action-btn-primary" id="shrine-skip-btn">続ける</button>
    `);
    document.getElementById('shrine-skip-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) { updateGameState(result.state); updateUI(); }
    });
    return;
  }

  const allRobots = [
    ...(robotParty.active || []),
    ...(robotParty.reserves || [])
  ].filter(Boolean);

  const robotCards = allRobots.map(robot => {
    const hpPercent = Math.floor((robot.hp / robot.maxHp) * 100);
    return `
      <div class="shrine-chip-option" data-robot-id="${robot.id}">
        <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})">
          <img class="shrine-chip-img" data-robot-id="${robot.id}" alt="">
        </div>
        <div class="shrine-chip-info">
          <div class="shrine-chip-name">${robot.nameEn} Lv.${robot.level} <span class="shrine-chip-upgrade">\u2192 Lv.${robot.level + 1}</span></div>
          <div class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity} \u00B7 ${robot.element}</div>
          <div class="shrine-chip-desc">HP: ${robot.hp}/${robot.maxHp} (${hpPercent}%) \u00B7 ATK: ${robot.attack}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <h3 class="shrine-title">${t('chooseToTrain')}</h3>
    <div class="shrine-chip-list">${robotCards}</div>
  `);

  // Wire up sprite images with proper idle->static fallback
  document.querySelectorAll('.shrine-chip-img').forEach(img => {
    configureRobotImg(img, img.dataset.robotId, el => { el.style.display = 'none'; });
  });

  if (shrineInProgress) return;
  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.shrine-chip-option');
      if (!option || shrineInProgress) return;
      shrineInProgress = true;

      document.querySelectorAll('.shrine-chip-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const robotId = option.dataset.robotId;
      const result = await apiShrineUpgrade(robotId);
      if (result?.state) { updateGameState(result.state); }
      sceneModule.showNarration(t('leveledUp', result?.robotName || 'Robot', result?.newLevel || '?'), { autoDismiss: 2000 });

      const proceedResult = await apiProceed();
      shrineInProgress = false;
      if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
    });
  }
}

/** Quiz phase - question then reward selection */
export async function renderQuiz() {
  const gameState = getGameState();

  // Stage tracking: undefined = intro, 'question' = show question, 'reward' = pick reward, 'failed' = wrong answer
  if (gameState._quizStage === 'reward') {
    await renderQuizRewards();
    return;
  }

  if (gameState._quizStage === 'failed') {
    // Wrong answer - proceed to next room with no reward
    delete gameState._quizStage;
    delete gameState._quizQuestion;
    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  // Fetch question if not already fetched
  if (!gameState._quizQuestion) {
    const question = await apiGetQuizQuestion();
    if (question.error) {
      sceneModule.showNarration('クイズの問題を読み込めませんでした...', { autoDismiss: 2000 });
      return;
    }
    gameState._quizQuestion = question;
  }

  const question = gameState._quizQuestion;

  // Show intro dialogue first (click to continue)
  if (gameState._quizStage !== 'question') {
    actions.setContent(''); // Clear actions while showing intro
    // Prefetch question audio while user reads intro
    prefetchNarration(question.question);
    speakNarration('この問題に答えれば、ご褒美をあげよう。');
    await sceneModule.showNarration('この問題に答えれば、ご褒美をあげよう。', { speaker: 'Quiz Master' });
    gameState._quizStage = 'question';
    updateUI();
    return;
  }

  // Show question in narration box (persistent - stays until we hide it)
  let questionText = question.question;
  if (question.translation) {
    questionText += `\n\n(${question.translation})`;
  }
  speakNarration(question.question);
  sceneModule.showNarration(questionText, { speaker: 'Quiz Master', persistent: true });

  // Build answer buttons - full width with padding
  const answerButtons = question.options.map((opt, idx) => `
    <div class="shrine-chip-option quiz-answer-option" data-answer-index="${idx}" style="width:100%">
      <div class="shrine-chip-info" style="padding:1rem; width:100%; text-align:center">
        <div class="shrine-chip-name" style="color:var(--accent-primary)">${opt}</div>
      </div>
    </div>
  `).join('');

  // Show answer buttons in actions area
  actions.setContent(`
    <div class="shrine-chip-list quiz-answer-list" style="padding:0 1rem">${answerButtons}</div>
  `);

  const list = document.querySelector('.quiz-answer-list');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.quiz-answer-option');
      if (!option || list.dataset.answered) return;
      list.dataset.answered = '1';

      const selectedIndex = parseInt(option.dataset.answerIndex, 10);

      // Submit answer to server (pass bunproMeta if available)
      const result = await apiSubmitQuizAnswer(question.id, selectedIndex, question._bunproMeta);

      if (result.error) {
        sceneModule.showNarration('エラーが発生しました...', { autoDismiss: 2000 });
        list.dataset.answered = '';
        // Reset button styling for retry
        document.querySelectorAll('.quiz-answer-option').forEach((o) => {
          o.style.pointerEvents = '';
          o.style.opacity = '';
          o.style.borderColor = '';
          o.style.boxShadow = '';
        });
        return;
      }

      // Show visual feedback on buttons
      document.querySelectorAll('.quiz-answer-option').forEach((o, idx) => {
        o.style.pointerEvents = 'none';
        if (idx === result.correctIndex) {
          o.style.borderColor = 'var(--success-color, #4ade80)';
          o.style.boxShadow = '0 0 10px var(--success-color, #4ade80)';
        } else if (idx === selectedIndex && !result.correct) {
          o.style.borderColor = 'var(--danger-color, #ef4444)';
          o.style.boxShadow = '0 0 10px var(--danger-color, #ef4444)';
        } else {
          o.style.opacity = '0.5';
        }
      });

      // Hide the persistent question narration, then show Quiz Master's response
      if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
      await sceneModule.showNarration(result.response, { speaker: 'Quiz Master' });

      // Proceed based on result
      if (result.correct) {
        gameState._quizStage = 'reward';
        delete gameState._quizQuestion;
        updateUI();
      } else {
        gameState._quizStage = 'failed';
        updateUI();
      }
    });
  }
}

async function renderQuizRewards() {
  const gameState = getGameState();
  const robotParty = gameState.run?.robotParty;

  // If a reward type was chosen that needs a robot, show robot picker
  if (gameState._quizSelectedReward && gameState._quizSelectedReward !== 'credits') {
    const allRobots = [
      ...(robotParty?.active || []),
      ...(robotParty?.reserves || [])
    ].filter(Boolean);

    const rewardType = gameState._quizSelectedReward;
    const label = rewardType === 'heal' ? t('chooseToHeal') : t('chooseToLevelUp');

    const robotCards = allRobots.map(robot => {
      const hpText = rewardType === 'heal'
        ? `HP: ${robot.hp}/${robot.maxHp}`
        : `Lv.${robot.level} \u2192 Lv.${robot.level + 1}`;
      return `
        <div class="shrine-chip-option quiz-reward-robot" data-robot-id="${robot.id}" style="width:100%">
          <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})">
            <img class="shrine-chip-img" data-robot-id="${robot.id}" alt="">
          </div>
          <div class="shrine-chip-info" style="padding:0.75rem">
            <div class="shrine-chip-name">${robot.nameEn}</div>
            <div class="shrine-chip-desc">${hpText} \u00B7 ATK: ${robot.attack}</div>
          </div>
        </div>
      `;
    }).join('');

    sceneModule.showNarration(label, { speaker: 'Quiz Master', persistent: true });
    actions.setContent(`<div class="shrine-chip-list" style="padding:0 1rem">${robotCards}</div>`);

    // Wire up sprite images with proper idle->static fallback
    document.querySelectorAll('.shrine-chip-img').forEach(img => {
      configureRobotImg(img, img.dataset.robotId, el => { el.style.display = 'none'; });
    });

    const list = document.querySelector('.shrine-chip-list');
    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', async (e) => {
        const option = e.target.closest('.quiz-reward-robot');
        if (!option || list.dataset.used) return;
        list.dataset.used = '1';

        document.querySelectorAll('.quiz-reward-robot').forEach(o => {
          o.style.opacity = '0.5'; o.style.pointerEvents = 'none';
        });

        const robotId = option.dataset.robotId;
        const result = await apiQuizReward(rewardType, robotId);
        if (result?.state) { updateGameState(result.state); }

        if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
        sceneModule.showNarration(result?.description || 'Reward claimed!', { autoDismiss: 2000 });

        delete getGameState()._quizStage;
        delete getGameState()._quizSelectedReward;
        const proceedResult = await apiProceed();
        if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
      });
    }
    return;
  }

  // Show reward choices
  sceneModule.showNarration('\u3054\u8912\u7F8E\u3092\u9078\u3079\u3002', { speaker: 'Quiz Master', persistent: true });

  actions.setContent(`
    <div class="shrine-chip-list" style="padding:0 1rem">
      <div class="shrine-chip-option quiz-reward-option" data-reward="heal" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">\u30ED\u30DC\u30C3\u30C8\u56DE\u5FA9</div>
          <div class="shrine-chip-desc">1\u4F53\u306E\u30ED\u30DC\u30C3\u30C8\u3092\u5168\u56DE\u5FA9\u3059\u308B</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="levelup" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">\u30ED\u30DC\u30C3\u30C8\u4FEE\u7DF4</div>
          <div class="shrine-chip-desc">1\u4F53\u306E\u30ED\u30DC\u30C3\u30C8\u3092\u30EC\u30D9\u30EB\u30A2\u30C3\u30D7</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="credits" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">\u30AF\u30EC\u30B8\u30C3\u30C8</div>
          <div class="shrine-chip-desc">\u30AF\u30EC\u30B8\u30C3\u30C8\u3092\u7372\u5F97\u3059\u308B</div>
        </div>
      </div>
    </div>
  `);

  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.quiz-reward-option');
      if (!option || list.dataset.used) return;
      list.dataset.used = '1';

      const rewardType = option.dataset.reward;

      if (rewardType === 'credits') {
        document.querySelectorAll('.quiz-reward-option').forEach(o => {
          o.style.opacity = '0.5'; o.style.pointerEvents = 'none';
        });

        const result = await apiQuizReward(rewardType);
        if (result?.state) { updateGameState(result.state); }
        if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
        sceneModule.showNarration(result?.description || 'Credits earned!', { autoDismiss: 2000 });

        delete getGameState()._quizStage;
        const proceedResult = await apiProceed();
        if (proceedResult?.state) { updateGameState(proceedResult.state); updateUI(); }
      } else {
        // Heal or levelup — need robot picker
        gameState._quizSelectedReward = rewardType;
        updateUI();
      }
    });
  }
}

/** Word Discovery phase - show flash cards for new words */
export async function renderWordDiscovery() {
  const gameState = getGameState();
  const room = gameState.room;

  // Clear stale content immediately before any async operations
  actions.setContent('');

  if (!room) return;

  // Reset module-level discovery state when entering a new room
  const roomId = room.id || room.type || 'unknown';
  if (discoveryState.roomId !== roomId) {
    discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: roomId,
      statusChecked: false,
      atLimit: false,
      todayCount: 0,
      dailyLimit: 10
    };
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
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="proceed-btn">続ける</button>
    `);
    document.getElementById('proceed-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    });
    return;
  }

  // Check discovery status first (only once per room)
  if (!discoveryState.statusChecked) {
    discoveryState.statusChecked = true;
    const status = await apiGetDiscoveryStatus();
    discoveryState.todayCount = status.todayCount;
    discoveryState.dailyLimit = status.dailyLimit;
    discoveryState.atLimit = status.atLimit;

    // Show today's count
    await sceneModule.showNarration(
      `今日は ${status.todayCount} 個の新しい言葉を学びました！`,
      { speaker: 'Quiz Master' }
    );

    // If at limit, show "come back tomorrow" and skip room
    if (status.atLimit) {
      await sceneModule.showNarration(
        'また明日来てね！',
        { speaker: 'Quiz Master' }
      );

      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
      return;
    }
  }

  // If we hit the limit mid-room, stop
  if (discoveryState.atLimit) {
    await sceneModule.showNarration(
      'また明日来てね！',
      { speaker: 'Quiz Master' }
    );

    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }
    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  // Fetch words if not already fetched (use module-level state, not room object)
  if (!discoveryState.fetched) {
    discoveryState.fetched = true;

    // Show intro narration
    await sceneModule.showNarration('新しい言葉を発見しよう！', { speaker: 'Quiz Master' });

    const result = await apiGetDiscoveryWords(discovery.wordsToLearn);

    if (!result.available || result.words.length === 0) {
      // No new words available - mark complete on server first
      await sceneModule.showNarration('今は新しい言葉がないようだ。また来よう！', { speaker: 'Quiz Master' });
      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
      return;
    }

    // Store words in module-level state (survives gameState updates)
    discoveryState.words = result.words;
  }

  const words = discoveryState.words;
  const currentIndex = discoveryState.wordsLearned;

  if (currentIndex >= words.length) {
    // All words learned - mark complete on server first
    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }

    // Fire and forget: refresh cache for learned words
    const learnedWords = words.map(w => w.word);
    apiPostCombatRefresh?.(learnedWords).catch(() => {});

    await sceneModule.showNarration('素晴らしい！新しい言葉を覚えた！', { speaker: 'Quiz Master' });

    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  // Show current word's flash card
  const currentWord = words[currentIndex];

  // Show helper text in narration
  sceneModule.showNarration(`${currentIndex + 1}/${words.length}: スワイプして覚えよう`, {
    speaker: 'Quiz Master',
    persistent: true
  });

  actions.showFlashCards([currentWord], { discoveryMode: true });

  // Set up swipe handler - we need to use the actions module's init callback mechanism
  // The actions module was initialized with cardSwipe callback, but we need discovery-specific behavior
  // Store original and override temporarily
  const handleDiscoverySwipe = async (direction) => {
    console.log(`[Discovery] Swiped ${direction} on "${currentWord.word}" (vid=${currentWord.vid}, sid=${currentWord.sid})`);
    try {
      // Pass isDiscovery: true to track the discovery
      const reviewResult = await apiSwipeWord(currentWord.vid, currentWord.sid, 1, true);
      console.log(`[Discovery] Review sent: vid=${currentWord.vid}, grade=1 (learning)`);

      // Check if we hit the limit
      if (reviewResult.atLimit) {
        discoveryState.atLimit = true;
        discoveryState.todayCount = reviewResult.todayCount;
      }
    } catch (e) {
      console.warn('[Discovery] Failed to submit review:', e);
    }

    discoveryState.wordsLearned++;
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

// ============ WHACK-A-MOLE MINI GAME ============

/** Whack-a-Mole mini game — match Japanese words to creature/item sprites */
export async function renderWhackAMole() {
  const gameState = getGameState();
  const room = gameState.run.rooms[gameState.run.currentRoom];

  // Already completed — just show proceed
  if (room?.interacted) {
    actions.setContent(`
      <div class="wam-results">
        <div class="wam-results-title">ゲーム完了!</div>
        <div class="wam-results-score">Score: ${room.whackAMole?.score || 0}</div>
      </div>
    `);
    return;
  }

  // Fetch pool from server
  let pool;
  try {
    const resp = await apiGetWhackAMolePool();
    pool = resp.pool;
  } catch (err) {
    actions.setContent('<div class="wam-error">Failed to load game data</div>');
    return;
  }

  if (!pool || pool.length < 9) {
    actions.setContent('<div class="wam-error">Not enough creatures/items for game</div>');
    return;
  }

  // Show start screen
  actions.setContent(`
    <div class="wam-container">
      <div class="wam-start">
        <div class="wam-start-title">ワードマッチ!</div>
        <div class="wam-start-desc">Match the word to the correct creature or item</div>
        <button class="action-btn action-btn-primary wam-start-btn">プレイ</button>
      </div>
    </div>
  `);

  document.querySelector('.wam-start-btn')?.addEventListener('click', () => {
    startWhackAMoleGame(pool, room);
  });
}

function startWhackAMoleGame(pool, room) {
  let score = 0;
  let timeLeft = 30.0;
  let targetIndex = 0;
  let tiles = Array(9).fill(null).map(() => ({ faceUp: false, poolIndex: -1 }));
  let gameOver = false;
  let flipTimeout = null;
  let timerInterval = null;
  let wordTimeLeft = 5.0;
  const WORD_TIME_LIMIT = 5.0;

  // Pick initial target
  targetIndex = Math.floor(Math.random() * pool.length);

  function formatTime(t) {
    const secs = Math.max(0, Math.ceil(t));
    return secs.toString().padStart(2, '0');
  }

  // Render game UI
  function renderGameUI() {
    const target = pool[targetIndex];
    actions.setContent(`
      <div class="wam-container">
        <div class="wam-hud">
          <div class="wam-score">★ ${score}</div>
          <div class="wam-timer" id="wam-timer">${formatTime(timeLeft)}</div>
        </div>
        <div class="wam-word-card">
          <div class="wam-word-kanji">${target.word}</div>
          <div class="wam-word-reading">${target.reading}</div>
          <div class="wam-word-timer-bar"><div class="wam-word-timer-fill" id="wam-word-timer-fill"></div></div>
        </div>
        <div class="wam-grid" id="wam-grid">
          ${tiles.map((_, i) => `
            <div class="wam-tile" data-index="${i}">
              <div class="wam-tile-inner">
                <div class="wam-tile-front"></div>
                <div class="wam-tile-back">
                  <img class="wam-tile-img" src="" alt="" />
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // Bind click handlers
    document.querySelectorAll('.wam-tile').forEach(tile => {
      tile.addEventListener('click', () => handleTileTap(parseInt(tile.dataset.index)));
    });
  }

  function updateTimerDisplay() {
    const el = document.getElementById('wam-timer');
    if (!el) return;
    const secs = Math.max(0, Math.ceil(timeLeft));
    el.textContent = secs.toString().padStart(2, '0');
    el.classList.toggle('wam-timer-warn', timeLeft <= 10 && timeLeft > 5);
    el.classList.toggle('wam-timer-danger', timeLeft <= 5);
  }

  function updateWordCard() {
    const target = pool[targetIndex];
    const kanji = document.querySelector('.wam-word-kanji');
    const reading = document.querySelector('.wam-word-reading');
    if (kanji) kanji.textContent = target.word;
    if (reading) reading.textContent = target.reading;
  }

  function updateScoreDisplay() {
    const el = document.querySelector('.wam-score');
    if (el) el.textContent = `★ ${score}`;
  }

  function updateWordTimerBar() {
    const fill = document.getElementById('wam-word-timer-fill');
    if (!fill) return;
    const pct = Math.max(0, (wordTimeLeft / WORD_TIME_LIMIT) * 100);
    fill.style.width = pct + '%';
    fill.classList.toggle('wam-word-timer-warn', wordTimeLeft <= 2);
  }

  // Tile state management
  function setTileFaceUp(index, poolIdx) {
    tiles[index] = { faceUp: true, poolIndex: poolIdx };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.add('wam-flipped');
    const img = tileEl.querySelector('.wam-tile-img');
    if (img) img.src = pool[poolIdx].sprite;
  }

  function setTileFaceDown(index) {
    tiles[index] = { faceUp: false, poolIndex: -1 };
    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);
    if (!tileEl) return;
    tileEl.classList.remove('wam-flipped');
  }

  // Score checker: is this tile showing the current target?
  function isCorrectTile(index) {
    const tile = tiles[index];
    if (!tile.faceUp || tile.poolIndex < 0) return false;
    return pool[tile.poolIndex].id === pool[targetIndex].id;
  }

  function randomDistractorIndex() {
    const targetId = pool[targetIndex].id;
    let idx;
    do {
      idx = Math.floor(Math.random() * pool.length);
    } while (pool[idx].id === targetId);
    return idx;
  }

  function ensureCorrectTileVisible() {
    // Check if any face-up tile already shows the target
    for (let i = 0; i < 9; i++) {
      if (isCorrectTile(i)) return; // already visible
    }
    // No correct tile visible — flip one up
    const candidates = [];
    for (let i = 0; i < 9; i++) candidates.push(i);
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const downTile = shuffled.find(i => !tiles[i].faceUp);
    const pick = downTile !== undefined ? downTile : shuffled[0];
    setTileFaceUp(pick, targetIndex);
  }

  // Flip event: randomly flip a tile up or down
  function flipEvent() {
    if (gameOver) return;

    const faceUpCount = tiles.filter(t => t.faceUp).length;
    const faceDownCount = 9 - faceUpCount;

    // Bias: try to keep 4-5 face up
    let shouldFlipUp;
    if (faceUpCount <= 3) shouldFlipUp = true;
    else if (faceUpCount >= 7) shouldFlipUp = false;
    else shouldFlipUp = Math.random() < 0.5;

    if (shouldFlipUp && faceDownCount > 0) {
      const downIndices = tiles.map((t, i) => (!t.faceUp ? i : -1)).filter(i => i >= 0);
      const pick = downIndices[Math.floor(Math.random() * downIndices.length)];
      setTileFaceUp(pick, randomDistractorIndex());
    } else if (!shouldFlipUp && faceUpCount > 1) {
      const upIndices = tiles.map((t, i) => (t.faceUp && !isCorrectTile(i) ? i : -1)).filter(i => i >= 0);
      if (upIndices.length > 0) {
        const pick = upIndices[Math.floor(Math.random() * upIndices.length)];
        setTileFaceDown(pick);
      }
    }

    ensureCorrectTileVisible();
  }

  // Handle tile tap
  function handleTileTap(index) {
    if (gameOver) return;
    const tile = tiles[index];
    if (!tile.faceUp) return;

    const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);

    if (isCorrectTile(index)) {
      // HIT
      score++;
      timeLeft = Math.min(timeLeft + 5, 99);
      updateScoreDisplay();
      updateTimerDisplay();

      // Non-blocking celebration
      if (tileEl) {
        tileEl.classList.add('wam-hit');
        const plus = document.createElement('div');
        plus.className = 'wam-plus-one';
        plus.textContent = '+1';
        tileEl.appendChild(plus);
        setTimeout(() => {
          tileEl.classList.remove('wam-hit');
          plus.remove();
        }, 600);
      }

      advanceToNextWord();
      try { playSFX('correct'); } catch (e) { /* sfx optional */ }
    } else {
      // MISS
      timeLeft = Math.max(0, timeLeft - 3);
      updateTimerDisplay();

      if (tileEl) {
        tileEl.classList.add('wam-miss');
        setTimeout(() => tileEl.classList.remove('wam-miss'), 400);
      }

      if (timeLeft <= 0) endGame();
    }
  }

  function advanceToNextWord() {
    const oldTarget = targetIndex;
    do {
      targetIndex = Math.floor(Math.random() * pool.length);
    } while (targetIndex === oldTarget && pool.length > 1);

    wordTimeLeft = WORD_TIME_LIMIT;
    updateWordCard();
    updateWordTimerBar();
    ensureCorrectTileVisible();
  }

  // End game
  async function endGame() {
    gameOver = true;
    clearTimeout(flipTimeout);
    clearInterval(timerInterval);

    try {
      const result = await apiCompleteWhackAMole(score);
      updateGameState(result.state);
    } catch (err) {
      // Still show results even if save fails
    }

    actions.setContent(`
      <div class="wam-container">
        <div class="wam-results">
          <div class="wam-results-title">タイムアップ!</div>
          <div class="wam-results-score">★ ${score}</div>
          <div class="wam-results-credits">${score} credits earned</div>
          <button class="action-btn action-btn-primary wam-continue-btn">Continue</button>
        </div>
      </div>
    `);

    document.querySelector('.wam-continue-btn')?.addEventListener('click', () => {
      updateUI();
    });
  }

  // Initialize game
  renderGameUI();

  // Set up initial board: 4-5 face-up tiles
  const initialUp = 4 + Math.floor(Math.random() * 2);
  const indices = [0,1,2,3,4,5,6,7,8].sort(() => Math.random() - 0.5);

  // First, place the correct answer
  setTileFaceUp(indices[0], targetIndex);

  // Then fill remaining initial tiles with distractors
  for (let i = 1; i < initialUp; i++) {
    setTileFaceUp(indices[i], randomDistractorIndex());
  }

  // Start flip scheduling (random interval 1-2s)
  function scheduleFlip() {
    if (gameOver) return;
    const delay = 1000 + Math.random() * 1000;
    flipTimeout = setTimeout(() => {
      flipEvent();
      scheduleFlip();
    }, delay);
  }
  scheduleFlip();

  // Start timer countdown (update every 100ms for smooth display)
  timerInterval = setInterval(() => {
    if (gameOver) return;
    timeLeft -= 0.1;
    wordTimeLeft -= 0.1;
    updateTimerDisplay();
    updateWordTimerBar();

    if (wordTimeLeft <= 0) {
      advanceToNextWord();
    }

    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
  }, 100);
}
