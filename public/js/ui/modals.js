/**
 * Modals UI Module - Handles all modal dialogs in the game
 *
 * EXTRACTED FROM: public/game.js (Step 6.4)
 *
 * SECTIONS:
 * - Result Modals: Victory, Game Victory, Game Over displays
 * - Log Modal: System message history
 * - Liberation Tracker: Enemy liberation progress
 * - Meta-Progression: Upgrades, achievements, lifetime stats
 * - Game Stats: Japanese language learning statistics
 */

// ============ MODULE STATE ============

// DOM element references (set during init)
let resultModal = null;
let gameoverModal = null;
let logModal = null;
let logEntries = null;
let upgradesModal = null;
let modalEssenceCount = null;
let upgradesGrid = null;
let achievementsList = null;
let lifetimeStats = null;
let gameStatsModal = null;
let gameStatsPeriod = null;
let gameStatsKanjiGrid = null;
let gameStatsWordList = null;
let gameWordStateFilters = null;
let gameWordStatesLoading = null;
let refreshGameWordStatesBtn = null;

// Callback references (set during init)
let getGameState = null;
let narration = null;
let settings = null;
let parseAndWrapText = null;
let showPostCombatShopContent = null;
let showError = null;
let escapeHtml = null;
let apiGetMetaProgression = null;
let apiPurchaseUpgrade = null;
let apiSendJpdbReview = null;

// Liberation tracker cache
let liberationTrackerCache = null;

// Game stats state
let gameWordStatesData = null;
let gameActiveStateFilter = 'all';

const API_BASE = '';

/**
 * Initialize the modals UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  // DOM elements
  resultModal = document.getElementById('result-modal');
  gameoverModal = document.getElementById('gameover-modal');
  logModal = document.getElementById('log-modal');
  logEntries = document.getElementById('log-entries');
  upgradesModal = document.getElementById('upgrades-modal');
  modalEssenceCount = document.getElementById('modal-essence-count');
  upgradesGrid = document.getElementById('upgrades-grid');
  achievementsList = document.getElementById('achievements-list');
  lifetimeStats = document.getElementById('lifetime-stats');
  gameStatsModal = document.getElementById('game-stats-modal');
  gameStatsPeriod = document.getElementById('game-stats-period');
  gameStatsKanjiGrid = document.getElementById('game-stats-kanji-grid');
  gameStatsWordList = document.getElementById('game-stats-word-list');
  gameWordStateFilters = document.getElementById('game-word-state-filters');
  gameWordStatesLoading = document.getElementById('game-word-states-loading');
  refreshGameWordStatesBtn = document.getElementById('refresh-game-word-states');

  // Callbacks
  getGameState = callbacks.getGameState;
  narration = callbacks.narration;
  settings = callbacks.settings;
  parseAndWrapText = callbacks.parseAndWrapText;
  showPostCombatShopContent = callbacks.showPostCombatShopContent;
  showError = callbacks.showError;
  escapeHtml = callbacks.escapeHtml;
  apiGetMetaProgression = callbacks.apiGetMetaProgression;
  apiPurchaseUpgrade = callbacks.apiPurchaseUpgrade;
  apiSendJpdbReview = callbacks.apiSendJpdbReview;
}

// ============ RESULT MODALS ============

/**
 * Show victory modal after defeating an enemy
 * @param {Object} result - Combat result with rewards
 */
export function showVictoryModal(result) {
  const gameState = getGameState();

  // Skip victory modal if post-combat shop is active - go straight to shop
  if (gameState.run?.postCombatShop?.active) {
    showPostCombatShopContent();
    return;
  }

  const title = document.getElementById('result-title');
  const message = document.getElementById('result-message');
  const rewards = document.getElementById('result-rewards');

  const enemy = gameState.combat?.enemy;
  title.textContent = enemy?.isBoss ? 'BOSS LIBERATED!' : 'CITIZEN FREED!';
  title.className = 'victory';

  message.textContent = '';

  let rewardsHtml = '';
  if (result.rewards) {
    if (result.rewards.xp) {
      rewardsHtml += `<div class="reward-item"><span class="reward-label">経験値</span><span class="reward-value xp">+${result.rewards.xp} XP</span></div>`;
    }
    if (result.rewards.gold) {
      rewardsHtml += `<div class="reward-item"><span class="reward-label">クレジット</span><span class="reward-value gold">+¥${result.rewards.gold}</span></div>`;
    }
    // Show regular drops
    if (result.rewards.drops && result.rewards.drops.length > 0) {
      for (const drop of result.rewards.drops) {
        const dropName = typeof drop === 'object' ? drop.name : drop;
        rewardsHtml += `<div class="reward-item"><span class="reward-label">アイテム</span><span class="reward-value item">${dropName}</span></div>`;
      }
    }
    // Show boss drop
    if (result.rewards.bossDrop) {
      rewardsHtml += `<div class="reward-item boss-drop"><span class="reward-label">解放報酬</span><span class="reward-value item">${result.rewards.bossDrop.name}</span></div>`;
    }
  }
  if (result.levelUps?.length > 0) {
    for (const lu of result.levelUps) {
      rewardsHtml += `<div class="reward-item level-up"><span class="reward-label">レベルアップ！</span><span class="reward-value">Lv.${lu.newLevel}</span></div>`;
    }
  }

  rewards.innerHTML = rewardsHtml || '<p>報酬なし</p>';
  resultModal.classList.remove('hidden');
}

/**
 * Show game victory modal after beating the final boss
 * @param {Object} result - Game victory result
 */
export function showGameVictoryModal(result) {
  const title = document.getElementById('result-title');
  const message = document.getElementById('result-message');
  const rewards = document.getElementById('result-rewards');
  const essenceEarned = result.essenceEarned || 0;

  title.textContent = 'TOKYO LIBERATED!';
  title.className = 'victory game-victory';

  message.innerHTML = '<p>システム天皇を倒し、東京を解放した！</p>';

  rewards.innerHTML = `
    <div class="reward-item"><span class="reward-label">エリアクリア</span><span class="reward-value">7/7</span></div>
    <div class="reward-item"><span class="reward-label">市民解放</span><span class="reward-value">${result.stats?.enemiesDefeated || 0}</span></div>
    ${essenceEarned > 0 ? `
      <div class="essence-earned">
        <span class="essence-earned-label">解放データ獲得</span>
        <div class="essence-earned-value">
          <span class="essence-icon">01</span>
          <span>+${essenceEarned}</span>
        </div>
      </div>
    ` : ''}
  `;

  // Show achievement notifications
  if (result.newAchievements?.length > 0) {
    result.newAchievements.forEach((ach, i) => {
      setTimeout(() => showAchievementNotification(ach), i * 500);
    });
  }

  resultModal.classList.remove('hidden');
}

/**
 * Show game over modal
 * @param {Object} result - Game over result with stats
 */
export function showGameOverModal(result) {
  const gameState = getGameState();
  const stats = document.getElementById('gameover-stats');
  const runStats = result.stats || gameState.run?.stats || {};
  const essenceEarned = result.essenceEarned || 0;

  stats.innerHTML = `
    <div class="gameover-stat"><span>到達エリア</span><span>${gameState.run?.floor || 1}</span></div>
    <div class="gameover-stat"><span>市民解放</span><span>${runStats.enemiesDefeated || 0}</span></div>
    <div class="gameover-stat"><span>与ダメージ</span><span>${runStats.damageDealt || 0}</span></div>
    <div class="gameover-stat"><span>被ダメージ</span><span>${runStats.damageTaken || 0}</span></div>
    ${essenceEarned > 0 ? `
      <div class="essence-earned">
        <span class="essence-earned-label">解放データ獲得</span>
        <div class="essence-earned-value">
          <span class="essence-icon">01</span>
          <span>+${essenceEarned}</span>
        </div>
      </div>
    ` : ''}
  `;

  // Show achievement notifications
  if (result.newAchievements?.length > 0) {
    result.newAchievements.forEach((ach, i) => {
      setTimeout(() => showAchievementNotification(ach), i * 500);
    });
  }

  gameoverModal.classList.remove('hidden');
}

/**
 * Handle continue button on result modal
 */
export function handleResultContinue() {
  resultModal.classList.add('hidden');
}

// ============ LOG MODAL ============

/**
 * Open the system message log modal
 */
export async function openLogModal() {
  const narrationLog = narration.getNarrationLog();
  if (narrationLog.length === 0) {
    logEntries.innerHTML = '<p class="empty-msg">No system messages yet.</p>';
  } else {
    // Group by floor for better readability
    let html = '';
    let currentFloor = -1;

    for (const entry of narrationLog) {
      if (entry.floor !== currentFloor && entry.floor > 0) {
        currentFloor = entry.floor;
        html += `<div class="log-floor-header">Ward ${currentFloor}</div>`;
      }
      // Use cached parsed HTML if available, otherwise parse now
      const parsedText = entry.parsedHtml || await parseAndWrapText(entry.text);
      entry.parsedHtml = parsedText; // Cache for next time
      html += `<div class="log-entry"><p>${parsedText}</p></div>`;
    }

    logEntries.innerHTML = html;
  }

  logModal.classList.remove('hidden');

  // Scroll to bottom of log
  requestAnimationFrame(() => {
    logEntries.scrollTop = logEntries.scrollHeight;
  });
}

/**
 * Close the log modal
 */
export function closeLogModal() {
  logModal.classList.add('hidden');
}

// ============ LIBERATION TRACKER MODAL ============

/**
 * Open the Liberation Tracker modal
 */
export async function openLiberationTracker() {
  try {
    const response = await fetch('/api/game/liberation-tracker');
    liberationTrackerCache = await response.json();
  } catch (error) {
    console.error('Failed to fetch liberation tracker:', error);
    narration.showNarration('解放記録の取得に失敗しました');
    return;
  }

  const modal = document.getElementById('liberation-modal');
  if (!modal) {
    console.error('Liberation modal not found');
    return;
  }

  renderLiberationTracker();
  modal.classList.remove('hidden');
}

/**
 * Close the Liberation Tracker modal
 */
export function closeLiberationTracker() {
  const modal = document.getElementById('liberation-modal');
  modal?.classList.add('hidden');
}

/**
 * Render the Liberation Tracker content
 */
export function renderLiberationTracker() {
  if (!liberationTrackerCache) return;

  const { liberated, notLiberated, totalCount, liberatedCount } = liberationTrackerCache;
  const progressPercent = Math.round((liberatedCount / totalCount) * 100);

  // Build liberated entries
  let liberatedHtml = '';
  for (const entry of liberated) {
    const tierClass = entry.isBoss ? 'tier-boss' : `tier-${entry.tier}`;
    liberatedHtml += `
      <div class="liberation-entry ${tierClass}" onclick="showLiberationDetail('${entry.id}')">
        <div class="entry-header">
          <span class="entry-name">${entry.name}</span>
          <span class="entry-count">x${entry.count}</span>
        </div>
        <span class="entry-name-en">${entry.nameEn}</span>
      </div>
    `;
  }

  // Build not-yet-liberated entries
  let lockedHtml = '';
  for (const entry of notLiberated) {
    const tierClass = entry.isBoss ? 'tier-boss' : `tier-${entry.tier}`;
    lockedHtml += `
      <div class="liberation-entry locked ${tierClass}">
        <div class="entry-header">
          <span class="entry-name">???</span>
        </div>
        <span class="entry-hint">${entry.isBoss ? 'BOSS' : `Tier ${entry.tier}`}</span>
      </div>
    `;
  }

  const modalBody = document.querySelector('#liberation-modal .modal-body');
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="liberation-progress">
        <div class="progress-text">解放進捗: ${liberatedCount}/${totalCount}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
      <div class="liberation-tabs">
        <button class="lib-tab active" onclick="showLiberationTab('liberated')">解放済み (${liberatedCount})</button>
        <button class="lib-tab" onclick="showLiberationTab('locked')">未解放 (${notLiberated.length})</button>
      </div>
      <div class="liberation-list" id="liberation-liberated">
        ${liberatedHtml || '<p class="empty-msg">まだ誰も解放していません</p>'}
      </div>
      <div class="liberation-list hidden" id="liberation-locked">
        ${lockedHtml}
      </div>
    `;
  }
}

/**
 * Show detail view for a liberated enemy
 * @param {string} enemyId - Enemy ID to show details for
 */
export function showLiberationDetail(enemyId) {
  const entry = liberationTrackerCache?.liberated?.find(e => e.id === enemyId);
  if (!entry) return;

  const modalBody = document.querySelector('#liberation-modal .modal-body');
  if (modalBody) {
    const firstDate = new Date(entry.firstLiberated).toLocaleDateString('ja-JP');
    modalBody.innerHTML = `
      <div class="liberation-detail">
        <button class="back-btn" onclick="renderLiberationTracker()">← 戻る</button>
        <h3>${entry.name}</h3>
        <p class="detail-en">${entry.nameEn}</p>
        <div class="detail-stats">
          <span>解放回数: ${entry.count}</span>
          <span>初回解放: ${firstDate}</span>
        </div>
        <div class="detail-dialogue">
          <h4>解放メッセージ</h4>
          <p class="dialogue-text">"${entry.dialogue}"</p>
        </div>
      </div>
    `;
  }
}

/**
 * Switch tabs in liberation tracker
 * @param {string} tab - Tab to show ('liberated' or 'locked')
 */
export function showLiberationTab(tab) {
  document.querySelectorAll('.lib-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.lib-tab[onclick*="${tab}"]`)?.classList.add('active');

  document.getElementById('liberation-liberated')?.classList.toggle('hidden', tab !== 'liberated');
  document.getElementById('liberation-locked')?.classList.toggle('hidden', tab !== 'locked');
}

// ============ META-PROGRESSION UI ============

/**
 * Open the upgrades modal
 */
export async function openUpgradesModal() {
  await loadUpgradesData();
  upgradesModal?.classList.remove('hidden');
  switchUpgradesTab('upgrades');
}

/**
 * Close the upgrades modal
 */
export function closeUpgradesModal() {
  upgradesModal?.classList.add('hidden');
}

/**
 * Switch tabs in the upgrades modal
 * @param {string} tabName - Tab to switch to
 */
export function switchUpgradesTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.upgrades-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  // Load content for the selected tab
  if (tabName === 'upgrades') {
    loadUpgradesData();
  } else if (tabName === 'achievements') {
    loadAchievementsData();
  } else if (tabName === 'stats') {
    loadLifetimeStats();
  }
}

/**
 * Load and display upgrades data
 */
export async function loadUpgradesData() {
  const data = await apiGetMetaProgression();

  // Update essence count
  if (modalEssenceCount) {
    modalEssenceCount.textContent = data.essence || 0;
  }

  // Render upgrades
  if (upgradesGrid) {
    upgradesGrid.innerHTML = data.upgrades.map(upgrade => `
      <div class="upgrade-card ${upgrade.maxed ? 'maxed' : ''}">
        <div class="upgrade-header">
          <div>
            <div class="upgrade-name">${upgrade.name}</div>
            <div class="upgrade-name-en">${upgrade.nameEn}</div>
          </div>
          <span class="upgrade-level ${upgrade.maxed ? 'max' : ''}">
            ${upgrade.maxed ? 'MAX' : `Lv.${upgrade.currentLevel}/${upgrade.maxLevel}`}
          </span>
        </div>
        <div class="upgrade-description">${upgrade.description}</div>
        <div class="upgrade-footer">
          ${upgrade.maxed ? '' : `
            <button class="upgrade-buy-btn"
                    onclick="purchaseUpgrade('${upgrade.id}')"
                    ${!upgrade.canAfford ? 'disabled' : ''}>
              <span class="cost-icon">&#x2728;</span>
              ${upgrade.nextCost}
            </button>
          `}
        </div>
      </div>
    `).join('');
  }
}

/**
 * Load and display achievements data
 */
export async function loadAchievementsData() {
  try {
    const response = await fetch(`${API_BASE}/api/game/achievements`);
    const data = await response.json();

    if (achievementsList) {
      achievementsList.innerHTML = data.achievements.map(ach => `
        <div class="achievement-card ${ach.earned ? 'earned' : ''}">
          <div class="achievement-icon">${ach.earned ? '&#x1F3C6;' : '&#x1F512;'}</div>
          <div class="achievement-info">
            <div class="achievement-name">${ach.name} (${ach.nameEn})</div>
            <div class="achievement-description">${ach.description}</div>
          </div>
          <div class="achievement-reward">
            <span class="essence-icon">&#x2728;</span>
            +${ach.reward?.essence || 0}
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load achievements:', error);
  }
}

/**
 * Load and display lifetime stats
 */
export async function loadLifetimeStats() {
  try {
    const response = await fetch(`${API_BASE}/api/game/lifetime-stats`);
    const data = await response.json();
    const stats = data.stats || {};

    if (lifetimeStats) {
      lifetimeStats.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Total Runs</div>
          <div class="stat-value">${stats.totalRuns || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Runs Completed</div>
          <div class="stat-value">${stats.runsCompleted || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">最高到達エリア</div>
          <div class="stat-value">${stats.highestFloor || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">市民解放数</div>
          <div class="stat-value">${stats.totalEnemiesDefeated || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">ボス解放数</div>
          <div class="stat-value">${stats.totalBossesDefeated || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">解放データ合計</div>
          <div class="stat-value">${stats.totalEssenceEarned || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">与ダメージ合計</div>
          <div class="stat-value">${stats.totalDamageDealt || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">獲得クレジット</div>
          <div class="stat-value">¥${stats.totalGoldEarned || 0}</div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Failed to load lifetime stats:', error);
  }
}

/**
 * Purchase an upgrade
 * @param {string} upgradeId - ID of upgrade to purchase
 */
export async function purchaseUpgrade(upgradeId) {
  const data = await apiPurchaseUpgrade(upgradeId);

  if (data.success) {
    // Show success feedback
    narration.showNarration(`アップグレード完了！ ${data.upgrade.newLevel}レベルになった！`);

    // Reload upgrades display
    await loadUpgradesData();
  } else {
    showError(data.error || 'Purchase failed');
  }
}

/**
 * Show achievement notification
 * @param {Object} achievement - Achievement data
 */
export function showAchievementNotification(achievement) {
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <h3>Achievement Unlocked!</h3>
    <p>${achievement.name} (${achievement.nameEn})</p>
  `;
  document.body.appendChild(notification);

  // Remove after animation
  setTimeout(() => notification.remove(), 3000);
}

/**
 * Get essence display HTML for hub
 * @returns {string} HTML string for essence display
 */
export function getEssenceDisplayHTML() {
  const gameState = getGameState();
  const essence = gameState.meta?.essence || 0;
  return `
    <div class="hub-essence" onclick="openUpgradesModal()">
      <span class="hub-essence-label">Shadow Essence</span>
      <div class="hub-essence-value">
        <span class="essence-icon">&#x2728;</span>
        <span>${essence}</span>
      </div>
    </div>
  `;
}

// ============ GAME STATS MODAL ============

/**
 * Open the game stats modal
 */
export async function openGameStatsModal() {
  await loadGameStatsData();
  await loadCachedWordStates();
  gameStatsModal?.classList.remove('hidden');
}

/**
 * Close the game stats modal
 */
export function closeGameStatsModal() {
  gameStatsModal?.classList.add('hidden');
}

/**
 * Load and display game stats data
 */
export async function loadGameStatsData() {
  try {
    const period = gameStatsPeriod?.value || 'all';
    const response = await fetch(`${API_BASE}/api/game/stats?period=${period}`);
    const stats = await response.json();

    if (stats) {
      updateGameStatsDisplay(stats);
    }
  } catch (error) {
    console.error('Failed to load game stats:', error);
  }
}

/**
 * Update the stats display with data
 * @param {Object} stats - Stats data to display
 */
export function updateGameStatsDisplay(stats) {
  // Update overview cards
  const totalNarrations = document.getElementById('game-stat-narrations');
  const totalJapaneseChars = document.getElementById('game-stat-jp-chars');
  const uniqueKanji = document.getElementById('game-stat-kanji');
  const uniqueWords = document.getElementById('game-stat-words');

  if (totalNarrations) totalNarrations.textContent = stats.totalNarrations || 0;
  if (totalJapaneseChars) totalJapaneseChars.textContent = stats.totalJapaneseCharacters || 0;
  if (uniqueKanji) uniqueKanji.textContent = stats.uniqueKanjiCount || 0;
  if (uniqueWords) uniqueWords.textContent = stats.uniqueWordsCount || 0;

  // Update kanji grid
  if (gameStatsKanjiGrid) {
    const kanjiList = stats.uniqueKanji || [];
    if (kanjiList.length === 0) {
      gameStatsKanjiGrid.innerHTML = '<p class="empty-msg">まだ漢字がありません</p>';
    } else {
      gameStatsKanjiGrid.innerHTML = kanjiList.map(k => `<span class="kanji-char">${k}</span>`).join('');
    }
  }

  // Update word frequency list
  if (gameStatsWordList) {
    const wordFreq = stats.wordFrequency || [];
    if (wordFreq.length === 0) {
      gameStatsWordList.innerHTML = '<p class="empty-msg">まだ単語がありません</p>';
    } else {
      // Show top 50 words
      const topWords = wordFreq.slice(0, 50);
      gameStatsWordList.innerHTML = topWords.map(([word, count]) => `
        <div class="word-item">
          <span class="word-text">${escapeHtml(word)}</span>
          <span class="word-count">${count}</span>
        </div>
      `).join('');
    }
  }
}

/**
 * Reset game stats with confirmation
 */
export async function resetGameStats() {
  if (!confirm('ゲームの日本語統計をリセットしますか？\nこの操作は取り消せません。')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/game/stats/reset`, {
      method: 'POST'
    });

    if (response.ok) {
      narration.showNarration('統計がリセットされました。');
      await loadGameStatsData();
    } else {
      showError('Failed to reset stats');
    }
  } catch (error) {
    console.error('Failed to reset stats:', error);
    showError('Failed to reset stats');
  }
}

/**
 * Load cached word states if available
 */
export async function loadCachedWordStates() {
  try {
    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/stats/word-states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jpdbApiKey })
    });
    const data = await response.json();

    if (data.cached && data.words && data.words.length > 0) {
      gameWordStatesData = data;
      gameActiveStateFilter = 'all';

      // Show filter chips and update counts
      gameWordStateFilters?.classList.remove('hidden');
      updateGameFilterCounts(data.stateCounts, data.totalWords);

      // Render the words
      renderGameFilteredWords();

      // Update button text with cache time
      if (refreshGameWordStatesBtn && data.cachedAt) {
        const timeAgo = getTimeAgo(data.cachedAt);
        refreshGameWordStatesBtn.textContent = `Refresh (cached ${timeAgo})`;
      }
    }
  } catch (error) {
    console.error('Failed to load cached word states:', error);
  }
}

/**
 * Refresh word states from JPDB
 */
export async function refreshGameWordStates() {
  const period = gameStatsPeriod?.value || 'all';

  if (refreshGameWordStatesBtn) {
    refreshGameWordStatesBtn.disabled = true;
    refreshGameWordStatesBtn.textContent = 'Loading...';
  }
  gameWordStatesLoading?.classList.remove('hidden');
  gameStatsWordList?.classList.add('hidden');

  try {
    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/stats/word-states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, jpdbApiKey })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch word states');
    }

    gameWordStatesData = data;
    gameActiveStateFilter = 'all';

    // Show the filter chips and update counts
    gameWordStateFilters?.classList.remove('hidden');
    updateGameFilterCounts(data.stateCounts, data.totalWords);

    // Render the words with state badges
    renderGameFilteredWords();

    if (refreshGameWordStatesBtn) {
      refreshGameWordStatesBtn.textContent = 'Refresh (cached just now)';
    }

  } catch (error) {
    console.error('Failed to refresh word states:', error);
    if (gameStatsWordList) {
      gameStatsWordList.innerHTML = '<p class="empty-msg">Failed to load word states. Check your JPDB API key.</p>';
      gameStatsWordList.classList.remove('hidden');
    }
    if (refreshGameWordStatesBtn) {
      refreshGameWordStatesBtn.textContent = 'Refresh JPDB States';
    }
  } finally {
    if (refreshGameWordStatesBtn) {
      refreshGameWordStatesBtn.disabled = false;
    }
    gameWordStatesLoading?.classList.add('hidden');
  }
}

/**
 * Update filter chip counts
 * @param {Object} stateCounts - Count per state
 * @param {number} totalWords - Total word count
 */
export function updateGameFilterCounts(stateCounts, totalWords) {
  document.querySelectorAll('#game-word-state-filters .filter-chip').forEach(chip => {
    const state = chip.dataset.state;
    const countEl = chip.querySelector('.chip-count');

    if (state === 'all') {
      countEl.textContent = `(${totalWords})`;
    } else if (stateCounts && stateCounts[state] !== undefined) {
      const count = stateCounts[state];
      countEl.textContent = count > 0 ? `(${count})` : '';
      chip.style.display = count > 0 ? '' : 'none';
    }
  });

  // Update active state
  document.querySelectorAll('#game-word-state-filters .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.state === gameActiveStateFilter);
  });
}

/**
 * Handle filter chip click
 * @param {string} state - State to filter by
 */
export function handleGameFilterClick(state) {
  gameActiveStateFilter = state;

  document.querySelectorAll('#game-word-state-filters .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.state === state);
  });

  renderGameFilteredWords();
}

/**
 * Render filtered words with state badges and review buttons
 */
export function renderGameFilteredWords() {
  if (!gameWordStatesData || !gameWordStatesData.words) {
    if (gameStatsWordList) {
      gameStatsWordList.innerHTML = '<p class="empty-msg">No word state data. Click "Refresh JPDB States" to load.</p>';
      gameStatsWordList.classList.remove('hidden');
    }
    return;
  }

  const words = gameWordStatesData.words;

  // Filter words based on active filter
  const filteredWords = gameActiveStateFilter === 'all'
    ? words
    : words.filter(w => w.states && w.states.includes(gameActiveStateFilter));

  if (filteredWords.length === 0) {
    if (gameStatsWordList) {
      gameStatsWordList.innerHTML = `<p class="empty-msg">No words with state "${gameActiveStateFilter}".</p>`;
      gameStatsWordList.classList.remove('hidden');
    }
    return;
  }

  // Render the filtered words with state badges and review buttons
  if (gameStatsWordList) {
    gameStatsWordList.innerHTML = filteredWords
      .map(({ word, count, states, vid, sid }) => {
        const stateBadges = (states || [])
          .map(s => `<span class="word-state-badge state-${s}">${s}</span>`)
          .join('');

        // Only show review buttons if we have vid/sid
        const reviewButtons = (vid !== null && vid !== undefined && sid !== null && sid !== undefined) ? `
          <div class="review-buttons" data-vid="${vid}" data-sid="${sid}" data-word="${escapeHtml(word)}">
            <button class="review-btn review-nothing" data-grade="1" title="Forgot completely">Nothing</button>
            <button class="review-btn review-something" data-grade="2" title="Recognized but couldn't recall">Something</button>
            <button class="review-btn review-hard" data-grade="3" title="Recalled with difficulty">Hard</button>
            <button class="review-btn review-okay" data-grade="4" title="Recalled correctly">Okay</button>
            <button class="review-btn review-easy" data-grade="5" title="Very easy">Easy</button>
          </div>
        ` : '';

        return `
          <div class="word-item">
            <div class="word-left">
              <span class="word-text">${escapeHtml(word)}${stateBadges}</span>
            </div>
            <div class="word-right">
              ${reviewButtons}
              <span class="word-count">${count}</span>
            </div>
          </div>
        `;
      })
      .join('');

    // Add click handlers for review buttons
    gameStatsWordList.querySelectorAll('.review-btn').forEach(btn => {
      btn.addEventListener('click', handleGameReviewClick);
    });

    gameStatsWordList.classList.remove('hidden');
  }
}

/**
 * Handle review button click
 * @param {Event} e - Click event
 */
export async function handleGameReviewClick(e) {
  const btn = e.target;
  const container = btn.closest('.review-buttons');
  const vid = parseInt(container.dataset.vid);
  const sid = parseInt(container.dataset.sid);
  const word = container.dataset.word;
  const grade = parseInt(btn.dataset.grade);

  // Disable all buttons in this row while processing
  container.querySelectorAll('.review-btn').forEach(b => b.disabled = true);
  btn.classList.add('loading');

  try {
    const result = await apiSendJpdbReview(vid, sid, grade);

    if (result.error) {
      throw new Error(result.error);
    }

    // Show success feedback
    btn.classList.remove('loading');
    btn.classList.add('success');
    container.classList.add('reviewed');

    // Show toast (don't use showNarration to avoid TTS)
    const gradeNames = ['', 'Nothing', 'Something', 'Hard', 'Okay', 'Easy'];
    console.log(`Reviewed "${word}" as ${gradeNames[grade]}`);

  } catch (error) {
    btn.classList.remove('loading');
    container.querySelectorAll('.review-btn').forEach(b => b.disabled = false);
    showError(error.message);
  }
}

/**
 * Get human-readable time ago string
 * @param {string} dateString - ISO date string
 * @returns {string} Human-readable time ago
 */
export function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

