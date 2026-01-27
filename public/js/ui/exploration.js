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

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startBossEncounter = null;
let nextFloor = null;
let startNewRun = null;
let returnToHub = null;

// Module-level guard to prevent multiple shrine clicks across re-renders
let shrineInProgress = false;

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

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startBossEncounter = callbacks.startBossEncounter;
  nextFloor = callbacks.nextFloor;
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
}

/** Hub phase — show Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.showButtons('潜入');
  // Override the context action for this phase
  const btn = document.getElementById('context-action-btn');
  if (btn) {
    btn.onclick = () => startNewRun();
  }
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
      <strong>${w.name || w.nameEn}</strong>
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
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="next-floor-btn">続ける</button>
  `);
  document.getElementById('next-floor-btn')?.addEventListener('click', () => {
    nextFloor();
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
        <div class="shrine-chip-icon" style="background-image:url('/assets/icons/chips/${chipId}.png'); border-color: ${chipInfo.rarityInfo?.color || '#95a5a6'}"></div>
        <div class="shrine-chip-info">
          <div class="shrine-chip-name">${chipInfo.name || chipInfo.nameEn || chipId} Lv. ${level} <span class="shrine-chip-upgrade">\u2192 Lv. ${Math.min(level + 1, 7)}</span></div>
          <div class="shrine-chip-rarity ${chipInfo.rarity || 'common'}">${chipInfo.rarity || 'common'}</div>
          <div class="shrine-chip-desc">${chipInfo.description || chipInfo.descriptionEn || ''}</div>
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
  sceneModule.showNarration(question.question, { speaker: 'Quiz Master', persistent: true });

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

      // Submit answer to server
      const result = await apiSubmitQuizAnswer(question.id, selectedIndex);

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
