/**
 * @file exploration.js - Non-Combat Navigation UI
 *
 * PURPOSE:
 * Handles all non-combat game phases: hub, ward selection, room exploration,
 * shrine upgrades, and quiz encounters. Renders appropriate buttons and
 * manages phase-specific interactions.
 *
 * KEY EXPORTS:
 * - init(callbacks): Initialize with game state and API callbacks
 * - renderHub(): Show hub phase (Equip Bots + Infiltrate buttons)
 * - renderWardSelection(): Show ward picker cards
 * - renderExploring(): Show Proceed/Fight buttons for room navigation
 * - renderBossReady(): Show Boss Fight button
 * - renderFloorComplete(): Show Continue button after floor cleared
 * - renderRunEnded(): Show Return to Hub button
 * - renderShrine(chipLoadoutCache): Show chip upgrade selection
 * - renderQuiz(): Show quiz question and reward selection
 *
 * DEPENDENCIES:
 * - Callbacks injected via init(): getGameState, updateGameState, updateUI
 * - API functions: apiGetStartingWards, apiSelectStartingWard, apiProceed, etc.
 * - actions module: For button rendering
 * - scene module: For narration display
 */

import * as speedReview from './speed-review.js';
import { playSFX } from '../audio.js';
import { speakNarration } from '../tts.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startBossEncounter = null;
let nextFloor = null;
let continueEndless = null;
let returnToHubFromVictory = null;
let startNewRun = null;
let returnToHub = null;

// Module-level guard to prevent multiple shrine clicks across re-renders
let shrineInProgress = false;

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
let apiGetStartingWards = null;
let apiSelectStartingWard = null;
let apiGetNextWardOptions = null;
let apiSelectNextWard = null;
let apiProceed = null;
let apiRoomEncounter = null;
let apiShrineUpgrade = null;
let apiQuizReward = null;
let apiGetQuizQuestion = null;
let apiSubmitQuizAnswer = null;
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;

// Word discovery API functions
let apiGetDiscoveryWords = null;
let apiGetDiscoveryStatus = null;
let apiCompleteDiscovery = null;
let apiSwipeWord = null;
let apiPostCombatRefresh = null;

// Branch selection API
let apiSelectBranch = null;
let apiDoorHints = null;

// Speed review API
let apiGetDueWords = null;

// Level select API functions
let apiGetLevels = null;
let apiSelectLevel = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startBossEncounter = callbacks.startBossEncounter;
  nextFloor = callbacks.nextFloor;
  continueEndless = callbacks.continueEndless;
  returnToHubFromVictory = callbacks.returnToHubFromVictory;
  startNewRun = callbacks.startNewRun;
  returnToHub = callbacks.returnToHub;
  apiGetStartingWards = callbacks.apiGetStartingWards;
  apiSelectStartingWard = callbacks.apiSelectStartingWard;
  apiGetNextWardOptions = callbacks.apiGetNextWardOptions;
  apiSelectNextWard = callbacks.apiSelectNextWard;
  apiProceed = callbacks.apiProceed;
  apiRoomEncounter = callbacks.apiRoomEncounter;
  apiShrineUpgrade = callbacks.apiShrineUpgrade;
  apiQuizReward = callbacks.apiQuizReward;
  apiGetQuizQuestion = callbacks.apiGetQuizQuestion;
  apiSubmitQuizAnswer = callbacks.apiSubmitQuizAnswer;
  apiGetChipLoadout = callbacks.apiGetChipLoadout;
  setChipLoadoutCache = callbacks.setChipLoadoutCache;
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
}

/** Hub phase — show Speed Review + Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px;">
      <button class="action-btn" id="speed-review-btn">速習</button>
      <button class="action-btn action-btn-primary" id="context-action-btn">潜入</button>
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
      statusIcon = '<span class="level-status level-new">NEW</span>';
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
      const runResult = await apiSelectLevel(levelId);
      if (runResult?.state) {
        updateGameState(runResult.state);
        updateUI();
        if (runResult.state.run?.startingChipShop?.active) {
          const economyMod = await import('./economy.js');
          await economyMod.renderStartingChipShop();
        }
      }
    });
  });

  // Back button
  document.getElementById('level-back-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    updateUI();
  });
}

/** Ward selection — show ward cards, proceed button */
export async function renderWardSelection() {
  const gameState = getGameState();

  // Skip if starting chip shop is active - chip selection will render instead
  if (gameState.run?.startingChipShop?.active) {
    return;
  }

  let wards;
  if (!gameState.run?.currentWard) {
    wards = await apiGetStartingWards();
  } else {
    wards = await apiGetNextWardOptions();
  }

  if (!wards || !wards.length) {
    actions.setContent('<p style="text-align:center">No wards available</p>');
    return;
  }

  let selectedWardId = null;

  const wardHtml = wards.map(w => `
    <div class="ward-option" data-ward-id="${w.id}">
      <strong>${w.nameEn || w.name}</strong>
      <small>${w.description || ''}</small>
    </div>
  `).join('');

  actions.setContent(`
    <div class="ward-selection-list">${wardHtml}</div>
    <button class="action-btn action-btn-primary" id="ward-proceed-btn" disabled>進む</button>
  `);

  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedWardId = el.dataset.wardId;
      const btn = document.getElementById('ward-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('ward-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedWardId) return;
    const result = gameState.run?.currentWard
      ? await apiSelectNextWard(selectedWardId)
      : await apiSelectStartingWard(selectedWardId);
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
      <button class="action-btn action-btn-primary" id="equip-bots-btn">ボット装備</button>
      <button class="action-btn action-btn-secondary" id="fight-btn">戦う</button>
    `);
    document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
      actions.triggerEquipBots();
    });
    document.getElementById('fight-btn')?.addEventListener('click', () => {
      startEncounter();
    });
    return;
  }

  actions.setContent(`
    <button class="action-btn action-btn-primary" id="equip-bots-btn">ボット装備</button>
    <button class="action-btn action-btn-secondary" id="proceed-btn">進む</button>
  `);
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
  const gameState = getGameState();
  const currentRoomIndex = gameState.run?.currentRoom;
  const pair = gameState.run?.rooms?.[currentRoomIndex];

  if (!Array.isArray(pair) || pair.length !== 2) {
    console.error('[BranchSelection] Invalid room pair');
    return;
  }

  // Show Chippy sprite and two-door background
  sceneModule.showChippy();
  sceneModule.setBackground('/assets/backgrounds/branch_doors.webp');

  // Show greyed-out door buttons while Chippy narrates
  actions.setContent(`
    <div class="ward-selection-list">
      <div class="ward-option branch-option disabled" data-door="0">
        <strong>左のドア</strong>
      </div>
      <div class="ward-option branch-option disabled" data-door="1">
        <strong>右のドア</strong>
      </div>
    </div>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  // Fetch AI-remixed door hints from backend
  let door1Hint = '何かを感じる...';
  let door2Hint = '何かを感じる...';

  try {
    const result = await apiDoorHints();
    if (result?.hints) {
      door1Hint = result.hints.door1;
      door2Hint = result.hints.door2;
    }
  } catch (e) {
    console.warn('[BranchSelection] Failed to fetch door hints:', e);
  }

  // Prepend natural left/right transition phrase so player knows which door Chippy means
  const intro = DOOR_INTROS[Math.floor(Math.random() * DOOR_INTROS.length)];
  door1Hint = intro.left + door1Hint;
  door2Hint = intro.right + door2Hint;

  // Show door 1 hint with Chippy as speaker, auto-play TTS
  speakNarration(door1Hint);
  await sceneModule.showNarration(door1Hint, { speaker: 'チッピー' });

  // Show door 2 hint with Chippy as speaker, auto-play TTS
  speakNarration(door2Hint);
  await sceneModule.showNarration(door2Hint, { speaker: 'チッピー' });

  // Now show the door selection UI
  let selectedDoor = null;

  actions.setContent(`
    <div class="ward-selection-list">
      <div class="ward-option branch-option" data-door="0">
        <strong>左のドア</strong>
      </div>
      <div class="ward-option branch-option" data-door="1">
        <strong>右のドア</strong>
      </div>
    </div>
    <button class="action-btn action-btn-primary" id="branch-proceed-btn" disabled>進む</button>
  `);

  // Allow re-reading hints by clicking doors before confirming
  document.querySelectorAll('.branch-option').forEach(el => {
    el.addEventListener('click', () => {
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

/** Boss ready phase */
export function renderBossReady() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="equip-bots-btn">ボット装備</button>
    <button class="action-btn action-btn-secondary" id="boss-fight-btn">ボス戦</button>
  `);
  document.getElementById('equip-bots-btn')?.addEventListener('click', () => {
    actions.triggerEquipBots();
  });
  document.getElementById('boss-fight-btn')?.addEventListener('click', () => {
    startBossEncounter();
  });
}

/** Floor complete — show Continue button */
export function renderFloorComplete() {
  const gameState = getGameState();
  if (gameState.run?.floor > 7) {
    // Endless mode — continue to next endless floor
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="endless-continue-btn">続ける</button>
    `);
    document.getElementById('endless-continue-btn')?.addEventListener('click', () => {
      continueEndless();
    });
  } else {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="next-floor-btn">続ける</button>
    `);
    document.getElementById('next-floor-btn')?.addEventListener('click', () => {
      nextFloor();
    });
  }
}

/** Run complete (game victory) — show Keep Going / Return to Hub */
export function renderRunComplete() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="endless-btn">まだまだ</button>
    <button class="action-btn action-btn-secondary" id="victory-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('endless-btn')?.addEventListener('click', () => {
    continueEndless();
  });
  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    returnToHubFromVictory();
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

/** Shrine phase - show equipped chips for upgrade */
export function renderShrine(chipLoadoutCache) {
  const gameState = getGameState();
  const equippedChips = gameState.player?.equipment?.weapon?.equippedChips || [];

  if (equippedChips.length === 0) {
    actions.setContent(`
      <p style="text-align:center;color:var(--text-secondary)">No chips equipped to upgrade</p>
      <button class="action-btn action-btn-primary" id="shrine-skip-btn">続ける</button>
    `);
    document.getElementById('shrine-skip-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    });
    return;
  }

  // Pick up to 3 random chips, stable across re-renders
  if (!gameState._shrineOfferings) {
    const shuffled = [...equippedChips].sort(() => Math.random() - 0.5);
    gameState._shrineOfferings = shuffled.slice(0, 3);
  }
  const offerings = gameState._shrineOfferings;

  const enrichedChips = chipLoadoutCache?.equipment?.weapon?.equippedChips || [];
  const chipLevels = gameState.player?._chipLevels || {};

  const chipCards = offerings.map(chipId => {
    const chipInfo = enrichedChips.find(c => c?.id === chipId) || { id: chipId, nameEn: chipId };
    const level = chipLevels[chipId] || 1;
    return `
      <div class="shrine-chip-option" data-chip-id="${chipId}">
        <div class="shrine-chip-icon" style="background-image:url('/assets/icons/chips/${chipId}.webp'); border-color: ${chipInfo.rarityInfo?.color || '#95a5a6'}"></div>
        <div class="shrine-chip-info">
          <div class="shrine-chip-name">${chipInfo.nameEn || chipInfo.name || chipId} Lv. ${level} <span class="shrine-chip-upgrade">\u2192 Lv. ${Math.min(level + 1, 7)}</span></div>
          <div class="shrine-chip-rarity ${chipInfo.rarity || 'common'}">${chipInfo.rarity || 'common'}</div>
          <div class="shrine-chip-desc">${chipInfo.descriptionEn || chipInfo.description || ''}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <h3 class="shrine-title">Choose a chip to upgrade</h3>
    <div class="shrine-chip-list">${chipCards}</div>
  `);

  // Use event delegation with module-level guard (persists across re-renders)
  if (shrineInProgress) return;
  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.shrine-chip-option');
      if (!option || shrineInProgress) return;
      shrineInProgress = true;

      // Disable all options visually
      document.querySelectorAll('.shrine-chip-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const chipId = option.dataset.chipId;
      const result = await apiShrineUpgrade(chipId);
      if (result?.state) {
        updateGameState(result.state);
      }
      if (apiGetChipLoadout && setChipLoadoutCache) {
        const newLoadout = await apiGetChipLoadout();
        setChipLoadoutCache(newLoadout);
      }
      sceneModule.showNarration(`Chip upgraded to Lv. ${result?.newLevel || '?'}!`, { autoDismiss: 2000 });
      delete getGameState()._shrineOfferings;
      const proceedResult = await apiProceed();
      shrineInProgress = false;
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
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
  sceneModule.showNarration(questionText, { speaker: 'Quiz Master', persistent: true, skipRewrite: true });

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

  // Show reward intro dialogue (persistent - stays while selecting)
  sceneModule.showNarration('ご褒美を選べ。', { speaker: 'Quiz Master', persistent: true });

  actions.setContent(`
    <div class="shrine-chip-list" style="padding:0 1rem">
      <div class="shrine-chip-option quiz-reward-option" data-reward="max_hp" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">最大HP +25</div>
          <div class="shrine-chip-desc">最大HPが25増える</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="heal_hp" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">HP回復 +75</div>
          <div class="shrine-chip-desc">HPを75回復する</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="chip_charges" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%">
          <div class="shrine-chip-name">全チップ +3チャージ</div>
          <div class="shrine-chip-desc">全てのチップに3チャージ追加</div>
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

      // Disable all options
      document.querySelectorAll('.quiz-reward-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const rewardType = option.dataset.reward;
      const result = await apiQuizReward(rewardType);
      if (result?.state) {
        updateGameState(result.state);
      }

      // Hide persistent narration, then show reward confirmation
      if (sceneModule.forceHideNarration) sceneModule.forceHideNarration();
      sceneModule.showNarration(result?.description || 'Reward claimed!', { autoDismiss: 2000 });

      // Refresh chip loadout if charges changed
      if (rewardType === 'chip_charges' && apiGetChipLoadout && setChipLoadoutCache) {
        const newLoadout = await apiGetChipLoadout();
        setChipLoadoutCache(newLoadout);
      }

      delete getGameState()._quizStage;
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
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

  actions.showFlashCard(currentWord, { discoveryMode: true });

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
