/**
 * @fileoverview Frontend game UI, state management, and server communication
 * @module public/game.js
 *
 * PURPOSE:
 * Main frontend JavaScript for the JRPG. Handles all UI rendering, user input,
 * API communication with the server, TTS playback, vocabulary word practice,
 * and visual novel-style narration display. This is a single-page application
 * with no framework - vanilla JS with direct DOM manipulation.
 *
 * KEY EXPORTS: (None - this is a browser script, all functions are global)
 *
 * KEY FUNCTIONS:
 * - loadGameState() - Fetches game state from server, updates UI
 * - updateUI() - Master UI refresh, calls phase-specific renderers
 * - updateVNStage() - Updates visual novel character/enemy sprites
 *
 * Game Flow:
 * - createCharacter() - Character creation with stat allocation
 * - startNewRun() - Begins dungeon run, ward selection
 * - startEncounter()/startBossEncounter() - Initiates combat
 * - performAttack/Defend/Magic/Item/Flee() - Combat actions
 * - handleCombatEnd() - Victory/defeat processing
 *
 * UI Systems:
 * - narration.showNarration()/narration.appendNarration() - VN-style text display with JPDB parsing
 * - openSettings()/saveSettings() - Configuration modal
 * - openChipModal()/renderChipModal() - Equipment chip management
 * - openUpgradesModal() - Meta-progression upgrades
 * - openGameStatsModal() - Statistics and word state tracking
 *
 * Word Practice:
 * - wordPractice.showWordCards()/wordPractice.hideWordCards() - Vocabulary review during combat
 * - handleWordSelection() - Process word review answers
 * - fetchJpdbWords() - Load due words from JPDB
 * - speakWord() - TTS pronunciation for vocabulary
 *
 * TTS:
 * - speakNarration(text) - Speaks game narration via VOICEVOX
 * - speakEnemyDialogue(text) - Enemy dialogue TTS
 * - stopTts() - Cancels current audio
 *
 * DEPENDENCIES:
 * - Server API endpoints (/api/game/*, /api/jpdb/*, /api/vocab/*, /api/tts/*)
 * - VOICEVOX for TTS (via server proxy)
 * - localStorage for user API keys and settings
 *
 * STATE VARIABLES:
 * - gameState: { player, run, combat, phase } - Current game state from server
 * - ttsEnabled, ttsSpeakerId, ttsSpeed, ttsVolume - TTS configuration
 * - combatWords[], availableWords[] - Word practice state
 * - realtimeCombatActive - Timer-based combat mode flag
 *
 * UI PHASES (gameState.phase):
 * - 'no_save' - No character exists, show create button
 * - 'hub' - In town, can start run or manage equipment
 * - 'ward_selection' - Choosing next ward/area
 * - 'exploring' - Navigating dungeon rooms
 * - 'combat' - In battle
 * - 'victory'/'defeat' - Post-combat state
 * - 'shop' - Buying/selling items
 * - 'blacksmith' - Equipment refinement
 *
 * ARCHITECTURE NOTES:
 * - No build step - vanilla JS loaded directly by browser
 * - DOM elements cached in variables at top (statsDisplay, combatArea, etc.)
 * - All server communication via api.js module which handles API keys from localStorage
 * - JPDB integration parses narration text, wraps words with clickable spans
 * - Background images change based on current ward/floor
 * - Keyboard shortcuts: Enter (advance), R (repeat TTS), 1-5 (word selection)
 *
 * CLAUDE HINTS:
 * - For combat mechanics, check server.js and src/game/combat/
 * - For word practice logic, look at WORD PRACTICE FUNCTIONS section (~line 1880)
 * - For UI updates after actions, trace through updateUI() and updateVNStage()
 * - Settings are split: API keys in localStorage, other settings on server
 * - TTS requires VOICEVOX running (server proxies to VOICEVOX_URL)
 * - Section headers marked with // ============ SECTION NAME ============
 */

// Observable store for reactive state management
import { store } from './js/store.js';

// TTS module for VOICEVOX text-to-speech
import * as tts from './js/tts.js';

// Settings module for API keys and preferences
import * as settings from './js/settings.js';

// Background module for ward/floor background images
import * as background from './js/background.js';

// Narration module for VN-style text display
import * as narration from './js/narration.js';

// Word practice module for JPDB vocabulary review
import * as wordPractice from './js/word-practice.js';

// Combat UI module for combat rendering and animations
import * as combatUI from './js/ui/combat.js';

// Exploration UI module for room navigation and content views
import * as explorationUI from './js/ui/exploration.js';

// Economy UI module for shop, blacksmith, and chip upgrade functions
import * as economyUI from './js/ui/economy.js';

// Character UI module for stat allocation, VN stage, and equipment
import * as characterUI from './js/ui/character.js';

// API module - centralized server communication
import {
  getGameState as apiGetGameState,
  getMetaProgression as apiGetMetaProgression,
  getSettings as apiGetSettings,
  createPlayer as apiCreatePlayer,
  allocateStat as apiAllocateStat,
  purchaseUpgrade as apiPurchaseUpgrade,
  startRun as apiStartRun,
  forfeitRun as apiForfeitRun,
  getStartingWards as apiGetStartingWards,
  selectStartingWard as apiSelectStartingWard,
  getNextWardOptions as apiGetNextWardOptions,
  selectNextWard as apiSelectNextWard,
  proceed as apiProceed,
  roomEncounter as apiRoomEncounter,
  disarmTrap as apiDisarmTrap,
  triggerTrap as apiTriggerTrap,
  lootBody as apiLootBody,
  skipBody as apiSkipBody,
  openTreasure as apiOpenTreasure,
  skipTreasure as apiSkipTreasure,
  useShrine as apiUseShrine,
  startEncounter as apiStartEncounter,
  startBoss as apiStartBoss,
  attack as apiAttack,
  useItem as apiUseItem,
  useSkill as apiUseSkill,
  enemyTurn as apiEnemyTurn,
  claimStartingChip as apiClaimStartingChip,
  shopBuy as apiShopBuy,
  postCombatShopBuy as apiPostCombatShopBuy,
  shopSkip as apiShopSkip,
  postCombatShopRefresh as apiPostCombatShopRefresh,
  equipChip as apiEquipChip,
  unequipChip as apiUnequipChip,
  getRefinePreview as apiGetRefinePreview,
  refineItem as apiRefineItem,
  unequipItem as apiUnequipItem,
  nextFloor as apiNextFloor,
  getChipLoadout as apiGetChipLoadout,
  warmVocabCache as apiWarmVocabCache,
  fetchJpdbVocab as apiFetchJpdbVocab,
  sendJpdbReview as apiSendJpdbReview,
  parseJpdbText as apiParseJpdbText,
  lookupJpdbWord as apiLookupJpdbWord
} from './js/api.js';

const API_BASE = '';

// ============ STATE ============
let gameState = {
  player: null,
  run: null,
  combat: null,
  phase: 'no_save'
};

// Initialize store with default state
store.set('gameState', gameState);

/**
 * Update game state through the store (enables reactive UI updates)
 * @param {object} newState - New game state from server
 */
function updateGameState(newState) {
  gameState = newState;
  window.gameState = gameState;
  store.set('gameState', gameState);
}

let isLoading = false;

// Stat allocation state managed by characterUI module

// Shop Selection State (selectedShopIndex managed by economyUI module)
let selectedWardIndex = 0;
let wardSelectionData = []; // Store ward options for keyboard selection

// Realtime Combat State
let realtimeCombatActive = false;
let playerAttackTimer = null;
let enemyAttackTimer = null;
let playerAttackPending = false;
let enemyAttackPending = false;
let currentPlayerInterval = 1500;  // Will be updated from server
let currentEnemyInterval = 1500;   // Will be updated from server
let combatPausedForVocab = false;  // Pause combat until user reviews a word

// Debug Mode - disables AI narration only (JPDB vocab calls still work)
let debugMode = settings.isDebugMode();

// ============ DOM ELEMENTS ============
const narrationPanel = document.getElementById('narration-panel');
const narrationText = document.getElementById('narration-text');
const gameContent = document.getElementById('game-content');
const actionPanel = document.getElementById('action-panel');
const quickStats = document.getElementById('quick-stats');
const playerStats = document.getElementById('player-stats');
const equipmentList = document.getElementById('equipment-list');
const inventoryList = document.getElementById('inventory-list');

// Modals
const createCharModal = document.getElementById('create-char-modal');
const resultModal = document.getElementById('result-modal');
const gameoverModal = document.getElementById('gameover-modal');
const settingsModal = document.getElementById('settings-modal');
const logModal = document.getElementById('log-modal');
const upgradesModal = document.getElementById('upgrades-modal');
const shopModal = document.getElementById('shop-modal');

// Upgrades Modal Elements
const modalEssenceCount = document.getElementById('modal-essence-count');
const upgradesGrid = document.getElementById('upgrades-grid');
const achievementsList = document.getElementById('achievements-list');
const lifetimeStats = document.getElementById('lifetime-stats');

// Stats Modal Elements
const gameStatsBtn = document.getElementById('game-stats-btn');
const gameStatsModal = document.getElementById('game-stats-modal');
const gameStatsPeriod = document.getElementById('stats-period');
const gameStatsKanjiGrid = document.getElementById('game-kanji-grid');
const gameStatsWordList = document.getElementById('game-word-frequency');
const gameStatsResetBtn = document.getElementById('reset-game-stats');
const gameWordStateFilters = document.getElementById('game-word-state-filters');
const gameWordStatesLoading = document.getElementById('game-word-states-loading');
const refreshGameWordStatesBtn = document.getElementById('refresh-game-word-states');

// Word states data for filtering
let gameWordStatesData = null;
let gameActiveStateFilter = 'all';

// Narration elements
const narrationContinue = document.getElementById('narration-continue');
const logBtn = document.getElementById('log-btn');
const logEntries = document.getElementById('log-entries');

// Header buttons
const newGameBtn = document.getElementById('new-game-btn');

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings');
const cancelSettingsBtn = document.getElementById('cancel-settings');
const saveSettingsBtn = document.getElementById('save-settings');
const aiProviderSelect = document.getElementById('ai-provider');
const aiKeyInput = document.getElementById('ai-key');
const openrouterModelGroup = document.getElementById('openrouter-model-group');
const openrouterModelInput = document.getElementById('openrouter-model');
const openaiModelGroup = document.getElementById('openai-model-group');
const openaiModelSelect = document.getElementById('openai-model');
const jlptLevelSelect = document.getElementById('jlpt-level');
const reviewTypeSelect = document.getElementById('review-type');
const jpdbApiKeyInput = document.getElementById('jpdb-api-key');
const settingsStatus = document.getElementById('settings-status');

// TTS Elements
const gameTtsStatus = document.getElementById('game-tts-status');
const gameTtsRefresh = document.getElementById('game-tts-refresh');
const gameTtsEnabled = document.getElementById('game-tts-enabled');
const gameTtsSpeaker = document.getElementById('game-tts-speaker');
const gameTtsSpeed = document.getElementById('game-tts-speed');
const gameTtsSpeedValue = document.getElementById('game-tts-speed-value');
const gameTtsVolume = document.getElementById('game-tts-volume');
const gameTtsVolumeValue = document.getElementById('game-tts-volume-value');
const gameTtsTest = document.getElementById('game-tts-test');

// VN Stage Elements
const vnStage = document.getElementById('vn-stage');
const vnBackground = document.getElementById('vn-background');
const playerSprite = document.getElementById('player-sprite');
const playerSpriteImg = document.getElementById('player-sprite-img');
const enemySprite = document.getElementById('enemy-sprite');
const enemySpriteImg = document.getElementById('enemy-sprite-img');
const playerHpBar = document.getElementById('player-hp-bar');
const enemyHpBar = document.getElementById('enemy-hp-bar');
const playerNameDisplay = document.getElementById('player-name-display');
const playerHpValues = document.getElementById('player-hp-values');
const playerHpFill = document.getElementById('player-hp-fill');
const playerMpFill = document.getElementById('player-mp-fill');
const enemyNameDisplay = document.getElementById('enemy-name-display');
const enemyHpValues = document.getElementById('enemy-hp-values');
const enemyHpFill = document.getElementById('enemy-hp-fill');
const floorDisplay = document.getElementById('floor-display');
const roomDisplay = document.getElementById('room-display');
const floorIndicator = document.getElementById('floor-indicator');

// ============ BACKGROUND SYSTEM ============
// Initialize background module with DOM element and state getter
background.init(vnBackground, () => gameState);

// Keyboard navigation for action buttons
let selectedActionIndex = 0;

// Simple fallback narrations (Japanese) for when server narration isn't available
const FALLBACK_NARRATIONS = {
  welcome: 'NEO TOKYOへようこそ。SYSTEMに支配された東京を解放せよ。',
  hub: (player) => `${player.name}は地下のハッカー拠点にいる。モニターが明滅している。東京のマップが表示されている。`,
  enterDungeon: (floor) => {
    const desc = {
      1: '練馬区に侵入した。住宅街にSYSTEMの影響が見える。市民たちが無表情で歩いている...',
      2: '中野区。ブロードウェイのネオンが異常に点滅している。オタク文化がSYSTEMに汚染されている。',
      3: '新宿区。歌舞伎町のネオンが冷たく光る。SYSTEM制御下のホストたちが徘徊している。',
      4: '池袋区。サンシャインシティの電光掲示板がSYSTEMのプロパガンダを流している。',
      5: '港区。六本木ヒルズの企業ビルが威圧的にそびえる。外資系CEOたちがSYSTEMの手先だ。',
      6: '千代田区。官庁街がSYSTEMの中枢に近づいている。官僚たちが無機質に動いている。',
      7: '皇居。SYSTEMの心臓部。デジタルと伝統が融合した異様な空間。システム天皇が待っている。'
    };
    return desc[floor] || `エリア${floor}に侵入した。`;
  },
  combatStart: (enemy) => `${enemy?.name || '市民'}がSYSTEMに操られている！解放しろ！`,
  playerAttack: (result) => {
    const dmg = result?.damage || result?.totalDamage || 0;
    if (result?.miss) return `攻撃が外れた！MISS!`;
    if (result?.dodge || result?.perfectDodge) return `敵が攻撃をかわした！`;
    if (result?.critical) return `クリティカル！完璧な一撃！${dmg}ダメージ！`;
    if (dmg >= 20) return `強い攻撃！${dmg}ダメージを与えた！`;
    if (dmg >= 10) return `攻撃が当たった！${dmg}ダメージ！`;
    return `攻撃！${dmg}ダメージ。`;
  },
  enemyAttack: (result, enemy) => {
    const dmg = result?.damage || 0;
    const name = enemy?.name || '敵';
    if (result?.miss) return `${name}の攻撃が外れた！`;
    if (result?.dodge) return `${name}の攻撃をかわした！DODGE!`;
    if (result?.perfectDodge) return `完璧な回避！${name}の攻撃を読み切った！`;
    if (result?.critical) return `痛い！${name}の強い攻撃！${dmg}ダメージを受けた！`;
    if (dmg >= 15) return `${name}の攻撃！${dmg}ダメージ！気をつけろ！`;
    if (dmg >= 5) return `${name}が攻撃してきた。${dmg}ダメージ。`;
    if (dmg > 0) return `${name}の攻撃。${dmg}ダメージ。大丈夫だ。`;
    return `${name}の攻撃をかわした！`;
  },
  victory: (enemy, rewards) => `${enemy?.name || '市民'}を解放した！${rewards?.xp || 0}XP、¥${rewards?.gold || 0}獲得！`,
  bossVictory: (enemy, rewards) => `「${enemy?.name}」を解放した！SYSTEMの支配が弱まった！`,
  defeat: (enemy) => `力が足りなかった...SYSTEMに捕らえられた。意識が遠のく...`,
  levelUp: (player) => `レベルアップ！レベル${player?.level}になった！ハッキング能力が上がった！`,
  floorClear: (floor) => `エリアをクリアした！次のエリアへのアクセスが開放された。`,
  usePotion: (healed) => `エナジードリンクを使った。体が温かくなる。${healed}HP回復！`,
  useMagic: (skill, result) => `${skill?.name || 'スキル'}を使った！`,
  flee: (success) => success ? '撤退した！また戻ろう。' : '逃げられない！SYSTEMが道を塞いでいる！',
  gameVictory: (player) => `東京解放！システム天皇を倒した！おめでとう、${player?.name}！君は本当の英雄だ！`
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize narration module with DOM elements and callbacks
  narration.init({
    textElement: narrationText,
    continueElement: narrationContinue,
    panelElement: narrationPanel,
    getGameState: () => gameState,
    parseAndWrapText: parseAndWrapText,
    triggerJpdbParse: triggerJpdbParse,
    updateActionButtonsState: updateActionButtonsState,
    apiBase: API_BASE
  });

  // Initialize word practice module with callbacks
  wordPractice.init({
    apiBase: API_BASE,
    getGameState: () => gameState,
    showToast: showToast,
    escapeHtml: escapeHtml,
    updatePlayerHPBar: updatePlayerHPBar,
    showDamageNumber: combatUI.showDamageNumber,
    resumeCombatAfterVocab: resumeCombatAfterVocab,
    isRealtimeCombatActive: () => realtimeCombatActive,
    isEnemyDialogueActive: () => enemyDialogueActive,
    shuffleArray: shuffleArray,
    sendJpdbReview: apiSendJpdbReview
  });

  // Initialize combat UI module with DOM elements and callbacks
  combatUI.init({
    gameContent: gameContent,
    playerSprite: playerSprite,
    enemySprite: enemySprite,
    getGameState: () => gameState,
    delay: delay
  });

  // Initialize exploration UI module with DOM elements and callbacks
  explorationUI.init({
    gameContent: gameContent,
    actionPanel: actionPanel,
    getGameState: () => gameState,
    updateGameState: updateGameState,
    updateUI: updateUI,
    triggerJpdbParse: triggerJpdbParse,
    handlePlayerDefeat: handlePlayerDefeat,
    startEncounter: startEncounter,
    startBossEncounter: startBossEncounter,
    openShop: economyUI.openShop,
    openBlacksmith: economyUI.openBlacksmith,
    openChipUpgradeModal: economyUI.openChipUpgradeModal,
    openUpgradesModal: openUpgradesModal,
    FALLBACK_NARRATIONS: FALLBACK_NARRATIONS,
    // API functions
    apiGetStartingWards: apiGetStartingWards,
    apiGetNextWardOptions: apiGetNextWardOptions,
    apiSelectStartingWard: apiSelectStartingWard,
    apiSelectNextWard: apiSelectNextWard,
    apiProceed: apiProceed,
    apiRoomEncounter: apiRoomEncounter,
    apiDisarmTrap: apiDisarmTrap,
    apiTriggerTrap: apiTriggerTrap,
    apiLootBody: apiLootBody,
    apiSkipBody: apiSkipBody,
    apiOpenTreasure: apiOpenTreasure,
    apiSkipTreasure: apiSkipTreasure,
    apiUseShrine: apiUseShrine
  });

  // Initialize economy UI module with DOM elements and callbacks
  economyUI.init({
    getGameState: () => gameState,
    updateGameState: updateGameState,
    updateUI: updateUI,
    delay: delay,
    triggerJpdbParse: triggerJpdbParse,
    narration: narration,
    tts: tts,
    // API functions
    apiGetRefinePreview: apiGetRefinePreview,
    apiRefineItem: apiRefineItem,
    apiClaimStartingChip: apiClaimStartingChip,
    apiPostCombatShopBuy: apiPostCombatShopBuy,
    apiShopBuy: apiShopBuy,
    apiShopSkip: apiShopSkip,
    apiPostCombatShopRefresh: apiPostCombatShopRefresh
  });

  // Initialize character UI module with DOM elements and callbacks
  characterUI.init({
    getGameState: () => gameState,
    updateGameState: updateGameState,
    updateUI: updateUI,
    loadGameState: loadGameState,
    narration: narration,
    tts: tts,
    combatUI: combatUI,
    formatItemStats: economyUI.formatItemStats,
    // Combat state
    isRealtimeCombatActive: () => realtimeCombatActive,
    isEnemyDialogueActive: () => enemyDialogueActive,
    startRealtimeCombat: startRealtimeCombat,
    // API functions
    apiAllocateStat: apiAllocateStat,
    apiEquipChip: apiEquipChip,
    apiUnequipChip: apiUnequipChip,
    apiGetChipLoadout: apiGetChipLoadout,
    apiUnequipItem: apiUnequipItem
  });

  await loadGameState();
  setupEventListeners();
  updateUI();
  // Subscribe to state changes for reactive updates
  store.subscribe(() => updateUI());
  // Restore debug mode from localStorage
  initDebugMode();
  // Load review type setting
  loadReviewTypeSetting();
  // Trigger JPDB parse after a short delay to let extension initialize
  setTimeout(triggerJpdbParse, 500);
  // Warm vocab cache in background
  warmVocabCacheHandler();
});

async function loadReviewTypeSetting() {
  const serverSettings = await apiGetSettings();
  wordPractice.setReviewType(serverSettings.reviewType || 'typing');
}

async function warmVocabCacheHandler(force = false) {
  const result = await apiWarmVocabCache(force);
  if (result.status === 'refreshed') {
    showToast(`Loaded ${result.wordCount} word states from JPDB`, 'info');
  }
  // Don't show anything for 'cached' or 'no_key' status - it's seamless
}

// Fetch vocabulary from JPDB decks and force refresh word states (runs at run start)
async function fetchJpdbVocabulary() {
  const data = await apiFetchJpdbVocab();
  if (data.count > 0) {
    console.log(`[JPDB] Fetched ${data.count} vocabulary words from decks`);
    // Force refresh word state cache to get fresh dueAt values from JPDB
    warmVocabCacheHandler(true);
  }
}

function setupEventListeners() {
  // Create character
  document.getElementById('create-char-btn').addEventListener('click', createCharacter);

  // Stat allocation buttons in create character modal
  document.querySelectorAll('.stat-allocation-grid .stat-plus').forEach(btn => {
    btn.addEventListener('click', () => handleStatIncrease(btn.dataset.stat));
  });
  document.querySelectorAll('.stat-allocation-grid .stat-minus').forEach(btn => {
    btn.addEventListener('click', () => handleStatDecrease(btn.dataset.stat));
  });
  document.getElementById('reset-stats-btn')?.addEventListener('click', resetCreateStats);

  // Result modal
  document.getElementById('result-continue-btn').addEventListener('click', handleResultContinue);

  // Shop modal
  document.getElementById('shop-skip-btn')?.addEventListener('click', skipShop);
  document.getElementById('shop-refresh-btn')?.addEventListener('click', refreshShop);

  // Game over modal
  document.getElementById('gameover-retry-btn').addEventListener('click', () => {
    gameoverModal.classList.add('hidden');
    startNewRun();
  });
  document.getElementById('gameover-hub-btn').addEventListener('click', () => {
    gameoverModal.classList.add('hidden');
    returnToHub();
  });

  // Settings modal
  settingsBtn.addEventListener('click', openSettings);
  closeSettingsBtn.addEventListener('click', closeSettings);
  cancelSettingsBtn.addEventListener('click', closeSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);
  aiProviderSelect.addEventListener('change', updateProviderVisibility);

  // New game button
  newGameBtn.addEventListener('click', confirmNewGame);

  // Debug mode button
  document.getElementById('debug-mode-btn')?.addEventListener('click', toggleDebugMode);

  // Word practice keyboard handler (Enter to submit, Esc to cancel)
  document.addEventListener('keydown', wordPractice.handleWordPracticeKeydown);

  // Self-grade button click handlers
  document.querySelectorAll('.self-grade-buttons .review-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const grade = parseInt(btn.dataset.grade);
      wordPractice.submitSelfGradeReview(grade);
    });
  });

  // Log modal
  logBtn.addEventListener('click', openLogModal);
  document.getElementById('close-log').addEventListener('click', closeLogModal);

  // Upgrades modal
  document.getElementById('close-upgrades')?.addEventListener('click', closeUpgradesModal);

  // Upgrades tabs
  document.querySelectorAll('.upgrades-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchUpgradesTab(e.target.dataset.tab));
  });

  // Game stats modal
  gameStatsBtn?.addEventListener('click', openGameStatsModal);
  document.getElementById('close-game-stats')?.addEventListener('click', closeGameStatsModal);
  gameStatsPeriod?.addEventListener('change', loadGameStatsData);
  gameStatsResetBtn?.addEventListener('click', resetGameStats);
  refreshGameWordStatesBtn?.addEventListener('click', refreshGameWordStates);

  // Shop modal
  document.getElementById('close-shop')?.addEventListener('click', closeShop);
  document.getElementById('shop-close-btn')?.addEventListener('click', closeShop);

  // Blacksmith modal
  document.getElementById('close-blacksmith')?.addEventListener('click', closeBlacksmith);
  document.getElementById('blacksmith-close-btn')?.addEventListener('click', closeBlacksmith);

  // Chip upgrade modal (Modder)
  document.getElementById('close-chip-upgrade')?.addEventListener('click', closeChipUpgradeModal);
  document.getElementById('chip-upgrade-leave-btn')?.addEventListener('click', closeChipUpgradeModal);

  // Filter chips for word states
  document.querySelectorAll('#game-word-state-filters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => handleGameFilterClick(chip.dataset.state));
  });

  // TTS controls
  gameTtsRefresh?.addEventListener('click', checkTtsStatus);
  gameTtsEnabled?.addEventListener('change', (e) => {
    tts.setEnabled(e.target.checked);
  });
  gameTtsSpeaker?.addEventListener('change', (e) => {
    tts.setSpeakerId(parseInt(e.target.value) || 13);
  });
  gameTtsSpeed?.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    tts.setSpeed(speed);
    if (gameTtsSpeedValue) gameTtsSpeedValue.textContent = speed.toFixed(1);
  });
  gameTtsVolume?.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    tts.setVolume(volume);
    if (gameTtsVolumeValue) gameTtsVolumeValue.textContent = Math.round(volume * 100);
  });
  gameTtsTest?.addEventListener('click', testTts);

  // Keyboard navigation (handles both narration and action buttons)
  document.addEventListener('keydown', handleKeypress);

  // Narration "press to continue" - click (but not on clickable words)
  narrationPanel.addEventListener('click', (e) => {
    if (e.target.closest('.jpdb-word')) return; // Let word popup handle it
    narration.advanceNarration();
  });
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
  const name = document.getElementById('char-name').value.trim() || 'Hunter';

  // Include allocated stats in player creation (get from characterUI module)
  const createStats = characterUI.getCreateStats();
  const createStatPoints = characterUI.getCreateStatPoints();
  const result = await apiCreatePlayer(name, { ...createStats }, createStatPoints);
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    createCharModal.classList.add('hidden');
    // Reset create stats for next time
    characterUI.resetCreateStats();
    // Use server narration or fallback
    const narrationText = result.narration || FALLBACK_NARRATIONS.hub(gameState.player);
    narration.showNarration(narrationText);
  }
}

// ============ STAT ALLOCATION (CHARACTER CREATION) ============
// Delegated to characterUI module
function getStatPointCost(currentValue) { return characterUI.getStatPointCost(currentValue); }
function calculateDerivedPreview(stats, level = 1) { return characterUI.calculateDerivedPreview(stats, level); }
function openCreateCharModal() { characterUI.openCreateCharModal(); }
function updateCreateStatDisplay() { characterUI.updateCreateStatDisplay(); }
function handleStatIncrease(stat) { characterUI.handleStatIncrease(stat); }
function handleStatDecrease(stat) { characterUI.handleStatDecrease(stat); }
function resetCreateStats() { characterUI.resetCreateStats(); }

async function startNewRun() {
  // Clear narration log for new run
  narration.clearNarrationLog();
  // Reset background tracking for new run
  background.resetBackground();
  // Clear word cache to get fresh due words for this run
  wordPractice.clearWordCache();
  // Prefetch all location backgrounds for combat scenes
  background.prefetchLocationBackgrounds();
  // Fetch JPDB vocabulary and force refresh word states for fresh dueAt values
  fetchJpdbVocabulary();

  const result = await apiStartRun();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }

    // Show starting chip selection using the post-combat shop modal
    if (gameState.run?.startingChipShop?.active) {
      // Copy starting chips to postCombatShop so we can reuse the modal
      gameState.run.postCombatShop = {
        active: true,
        items: gameState.run.startingChipShop.items,
        isStartingChips: true  // Flag to customize behavior
      };
      showPostCombatShopContent();
    }

    // Try AI narration for immersive experience, fall back to simple
    let narration = result.narration || FALLBACK_NARRATIONS.enterDungeon(gameState.run.floor);
    narration.showNarration(narration);
    background.updateBackground();
    updateUI();

    // Fetch richer AI narration in background
    narration.fetchAINarration('enterFloor', gameState.run.floor).then(aiNarr => {
      if (aiNarr) narration.showNarration(aiNarr);
    });
  }
}

async function startEncounter() {
  const result = await apiStartEncounter();
  // Enemy is in result.result.enemy or gameState.combat.enemy
  const enemy = result?.result?.enemy || gameState.combat?.enemy;
  if (result && enemy) {
    // Show immediate fallback narration for encounter start
    let narration = result.narration || FALLBACK_NARRATIONS.combatStart(enemy);
    narration.showNarration(narration);

    // Check for dialogue BEFORE updateUI to prevent auto-start race condition
    // Server returns a single string, but fallback to enemy.dialogue.possessed is an array
    let dialogue = result?.result?.dialogue;
    if (!dialogue && enemy?.dialogue?.possessed) {
      const lines = enemy.dialogue.possessed;
      dialogue = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
    }
    if (dialogue) {
      enemyDialogueActive = true; // Block updateUI from auto-starting combat
    }

    updateUI();
    background.updateBackground(); // Switch to enemy's location background

    // Show possessed dialogue if available - wait for Enter to dismiss before combat starts
    if (dialogue) {
      await delay(400);
      showEnemyDialogue(dialogue, 'possessed');
      // Wait for dialogue to be dismissed (polling as backup to promise)
      while (enemyDialogueActive) {
        await delay(100);
      }
    }

    // Brief pause to show enemy, then start realtime combat
    await delay(300);
    startRealtimeCombat();
  } else if (result) {
    // Just update UI if no enemy data available
    updateUI();
  }
}

async function startBossEncounter() {
  const result = await apiStartBoss();
  // Enemy is in result.result.enemy or gameState.combat.enemy
  const enemy = result?.result?.enemy || gameState.combat?.enemy;
  if (result && enemy) {
    // Show immediate fallback narration for boss encounter
    let narration = result.narration || FALLBACK_NARRATIONS.combatStart(enemy);
    narration.showNarration(narration);

    // Check for dialogue BEFORE updateUI to prevent auto-start race condition
    // Server returns a single string, but fallback to enemy.dialogue.possessed is an array
    let dialogue = result?.result?.dialogue;
    if (!dialogue && enemy?.dialogue?.possessed) {
      const lines = enemy.dialogue.possessed;
      dialogue = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
    }
    if (dialogue) {
      enemyDialogueActive = true; // Block updateUI from auto-starting combat
    }

    updateUI();
    background.updateBackground(); // Switch to enemy's location background

    // Show possessed dialogue if available - wait for Enter to dismiss before combat starts
    if (dialogue) {
      await delay(500);
      showEnemyDialogue(dialogue, 'possessed');
      // Wait for dialogue to be dismissed (polling as backup to promise)
      while (enemyDialogueActive) {
        await delay(100);
      }
    }

    // Brief pause to show boss, then start realtime combat
    await delay(500);
    startRealtimeCombat();
  } else if (result) {
    updateUI();
  }
}

// Track if enemy dialogue TTS is currently playing
let enemyDialogueTtsPlaying = false;

// Track if enemy dialogue is active and blocking input (waiting for Enter)
let enemyDialogueActive = false;
let enemyDialogueType = null; // 'possessed', 'glitching', or 'liberated'
let dialogueDismissResolve = null; // Promise resolver for waiting on dialogue dismissal
let dialogueDismissPromise = null; // Promise that resolves when dialogue is dismissed

// Show enemy dialogue bubble (possessed/glitching/liberated)
// Pauses combat and waits for Enter key to dismiss
// Returns a Promise that resolves when dialogue is dismissed
function showEnemyDialogue(text, type = 'possessed') {
  const enemyArea = document.querySelector('.vn-enemy-area');
  if (!enemyArea || !text) return Promise.resolve();

  // Remove any existing dialogue and resolve any pending promise
  const existing = enemyArea.querySelector('.enemy-dialogue');
  if (existing) {
    existing.remove();
    if (dialogueDismissResolve) {
      dialogueDismissResolve();
      dialogueDismissResolve = null;
    }
  }

  const dialogue = document.createElement('div');
  dialogue.className = `enemy-dialogue enemy-dialogue-${type}`;
  dialogue.innerHTML = `
    <span class="dialogue-text">${text}</span>
    <span class="dialogue-continue">Enter</span>
  `;
  enemyArea.appendChild(dialogue);

  // Set state flags to block input and track dialogue type
  enemyDialogueActive = true;
  enemyDialogueType = type;

  // Pause combat while dialogue is active (for glitching dialogue mid-combat)
  // Setting realtimeCombatActive = false ensures ALL checks work correctly,
  // including any in-flight fetch requests that complete after this
  if (type === 'glitching' && realtimeCombatActive) {
    if (playerAttackTimer) {
      clearTimeout(playerAttackTimer);
      playerAttackTimer = null;
    }
    if (enemyAttackTimer) {
      clearTimeout(enemyAttackTimer);
      enemyAttackTimer = null;
    }
    realtimeCombatActive = false;
  }

  // Get enemy personality and speakerId for voice selection
  const enemy = gameState.combat?.enemy;
  const personality = enemy?.personality || 'default';
  const speakerId = enemy?.speakerId; // Direct speaker assignment from enemy template

  // Speak enemy dialogue via TTS with personality-based voice
  // Use a reasonable duration for TTS pacing
  const ttsDuration = type === 'liberated' ? 4000 : type === 'glitching' ? 3000 : 2500;
  speakEnemyDialogue(text, ttsDuration, personality, speakerId);

  // Create and store promise that resolves when dialogue is dismissed
  dialogueDismissPromise = new Promise(resolve => {
    dialogueDismissResolve = resolve;
  });
  return dialogueDismissPromise;
}

// Dismiss enemy dialogue when user presses Enter
function dismissEnemyDialogue() {
  const enemyArea = document.querySelector('.vn-enemy-area');
  const dialogue = enemyArea?.querySelector('.enemy-dialogue');
  if (dialogue) {
    dialogue.remove();
  }

  // Save type before clearing for timer restart logic
  const wasGlitching = enemyDialogueType === 'glitching';

  // Clear state flags
  enemyDialogueActive = false;
  enemyDialogueType = null;

  // Resume combat if we were paused during glitching dialogue
  // Note: realtimeCombatActive was set to false in showEnemyDialogue for glitching
  if (wasGlitching) {
    realtimeCombatActive = true;
    playerAttackPending = false;
    enemyAttackPending = false;
    // Use the new vocab pause flow - player attacks, chains to enemy, then pauses
    executePlayerAttack();
  }

  // Resolve the promise so waiting code can continue
  if (dialogueDismissResolve) {
    dialogueDismissResolve();
    dialogueDismissResolve = null;
    dialogueDismissPromise = null;
  }
}

/**
 * Speak enemy dialogue using TTS
 * Uses direct speakerId if available, otherwise falls back to personality-based voice selection
 * Hides word cards during playback if combat is active
 */
async function speakEnemyDialogue(text, dialogueDuration, personality = 'default', speakerId = null) {
  if (!tts.isEnabled() || !text || text.trim().length === 0) return;

  // Use direct speakerId if provided, otherwise fall back to personality mapping
  const enemySpeakerId = speakerId ?? tts.getSpeakerForPersonality(personality);

  // Hide word cards while enemy is speaking (if in combat)
  const wasInCombat = realtimeCombatActive;
  if (wasInCombat) {
    wordPractice.hideWordCards();
    enemyDialogueTtsPlaying = true;
  }

  const restoreWordCards = () => {
    if (wasInCombat && realtimeCombatActive) {
      wordPractice.showWordCards();
      enemyDialogueTtsPlaying = false;
    }
  };

  try {
    const audio = await tts.speakWithVoice(text, enemySpeakerId);
    if (!audio) {
      restoreWordCards();
      return;
    }

    audio.onended = restoreWordCards;
    audio.onerror = restoreWordCards;
    audio.play();

    // Fallback: restore word cards after dialogue duration if audio hasn't ended
    setTimeout(() => {
      if (wasInCombat && realtimeCombatActive && enemyDialogueTtsPlaying) {
        wordPractice.showWordCards();
        enemyDialogueTtsPlaying = false;
      }
    }, dialogueDuration + 500);

  } catch (error) {
    console.warn('Enemy dialogue TTS playback error:', error);
    restoreWordCards();
  }
}


async function nextFloor() {
  const result = await apiNextFloor();
  if (result) {
    // Use server narration or fallback
    const narration = result.narration || FALLBACK_NARRATIONS.enterDungeon(gameState.run.floor);
    narration.showNarration(narration);
    background.updateBackground();
    updateUI();
  }
}

async function returnToHub() {
  // Stop realtime combat if active
  if (realtimeCombatActive) {
    if (playerAttackTimer) {
      clearTimeout(playerAttackTimer);
      playerAttackTimer = null;
    }
    if (enemyAttackTimer) {
      clearTimeout(enemyAttackTimer);
      enemyAttackTimer = null;
    }
    realtimeCombatActive = false;
    playerAttackPending = false;
    enemyAttackPending = false;
  }

  // Close any open combat-related modals
  wordPractice.hideWordCards();
  wordPractice.closeWordInputModal();
  wordPractice.closeSelfGradeModal();

  await apiForfeitRun();
  gameState.run = null;
  gameState.combat = null;
  // Clear word cache so next run gets fresh due words
  wordPractice.clearWordCache();
  gameState.phase = 'hub';
  narration.showNarration(FALLBACK_NARRATIONS.hub(gameState.player));
  background.updateBackground();
  updateUI();
}

// ============ COMBAT ACTIONS ============
async function performAttack(attackType = 'normal') {
  // Check if it's player turn before attacking
  if (!gameState.combat?.active || gameState.combat.turn !== 'player') {
    console.log('Cannot attack: not player turn');
    return;
  }

  closeCombatSubmenu();
  disableCombatActions();

  const enemy = gameState.combat?.enemy;
  const result = await apiAttack(attackType);

  if (result) {
    // Combat data is in result.result.result (nested)
    const attackData = result.result?.result || result.result;
    if (attackData) {
      // Animate player attack
      animatePlayerAttack();
      await delay(300);

      // Show damage number and animate enemy hurt
      const damage = attackData.totalDamage || attackData.damage || 0;
      if (damage > 0) {
        showDamageNumber(damage, false, attackData.critical);
        animateEnemyHurt();
      }

      // Display chip effect feedback
      displayChipEffects(attackData, true);

      // Use server narration or fallback
      const narration = result.narration || FALLBACK_NARRATIONS.playerAttack(attackData);
      narration.appendNarration(narration);

      if (attackData.enemyDefeated || result.type === 'victory' || result.type === 'game_victory') {
        animateEnemyDefeat();
        await handleCombatEnd(result);
      } else {
        updateUI();
      }
    }
  }

  enableCombatActions();
}

async function handleCombatEnd(result) {
  await delay(500);

  const enemy = gameState.combat?.enemy;
  // Rewards are in result.result.rewards
  const rewards = result.result?.rewards || result.rewards || { xp: 0, gold: 0, drops: [] };
  const levelUps = result.result?.levelUps || result.levelUps || [];

  if (result.type === 'victory') {
    // Use server narration or fallback
    const narr = enemy?.isBoss
      ? FALLBACK_NARRATIONS.bossVictory(enemy, rewards)
      : FALLBACK_NARRATIONS.victory(enemy, rewards);
    narration.appendNarration(narr);

    if (levelUps.length > 0) {
      await delay(500);
      narration.appendNarration(FALLBACK_NARRATIONS.levelUp(gameState.run?.player));
    }

    await delay(1000);
    showVictoryModal({ ...result, rewards, levelUps });
  } else if (result.type === 'game_victory') {
    narration.appendNarration(FALLBACK_NARRATIONS.gameVictory(gameState.run?.player));
    await delay(1500);
    showGameVictoryModal({ ...result, rewards, levelUps });
  }

  updateUI();
}

async function handlePlayerDefeat(result) {
  const enemy = gameState.combat?.enemy;
  narration.appendNarration(FALLBACK_NARRATIONS.defeat(enemy));
  await delay(1500);
  showGameOverModal(result);
}

// ============ UI UPDATES ============
function updateUI() {
  updateQuickStats();
  updatePlayerStats();
  updateEquipment();
  updateInventory();
  updateGameContent();
  updateActionPanel();
  updateVNStage();
}

// ============ VN STAGE UPDATES ============
// Delegated to characterUI module
function updateVNStage() { characterUI.updateVNStage(); }

// Sprite animation helpers - delegated to combatUI module
function animatePlayerAttack() { combatUI.animatePlayerAttack(); }
function animateEnemyAttack() { combatUI.animateEnemyAttack(); }
function animatePlayerHurt() { combatUI.animatePlayerHurt(); }
function animateEnemyHurt() { combatUI.animateEnemyHurt(); }
function animateEnemyDefeat() { combatUI.animateEnemyDefeat(); }
function showCriticalSplash() { combatUI.showCriticalSplash(); }
function showChipEffect(effectName, isPlayer = false, type = 'buff') { combatUI.showChipEffect(effectName, isPlayer, type); }
function showDotDamage(damage, isPlayer = false) { combatUI.showDotDamage(damage, isPlayer); }
function showDamageNumber(damage, isPlayer, isCritical = false, isHeal = false, isMiss = false, outcomeType = null) {
  combatUI.showDamageNumber(damage, isPlayer, isCritical, isHeal, isMiss, outcomeType);
}
function displayChipEffects(attackData, isPlayerAttack = true) { combatUI.displayChipEffects(attackData, isPlayerAttack); }

// ============ REALTIME COMBAT FUNCTIONS ============

// HP bar updates - delegated to characterUI module
function updateEnemyHPBar(hp) { characterUI.updateEnemyHPBar(hp); }
function updatePlayerHPBar(hp) { characterUI.updatePlayerHPBar(hp); }

function startRealtimeCombat() {
  if (realtimeCombatActive) return;

  realtimeCombatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // Fetch chip loadout for combat display (non-blocking)
  if (!getChipLoadoutCache()) {
    fetch(`${API_BASE}/api/game/chip-loadout`)
      .then(r => r.json())
      .then(data => {
        characterUI.setChipLoadoutCache(data);
        updateActionPanel(); // Re-render with chips
      })
      .catch(err => console.warn('[Combat] Failed to fetch chip loadout:', err));
  }

  // Update action panel to show combat indicator
  updateActionPanel();

  // Initialize word practice cards
  wordPractice.initCombatWords();

  console.log('[Combat] Starting realtime combat with vocab pause mode');

  // Execute first player attack, which will chain into enemy attack, then pause
  executePlayerAttack();
}

// Execute a single player attack and schedule the next one
async function executePlayerAttack() {
  if (!realtimeCombatActive || playerAttackPending || enemyDialogueActive) return;

  playerAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'player', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Player attack:', result.playerAttack?.damage, 'interval:', result.playerInterval);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale player attack ignored (combat ended on server)');
        realtimeCombatActive = false; // Sync client state
        return;
      }
      console.error('Player attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (enemyDialogueActive) {
      playerAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

    // Show player's attack result
    if (result.playerAttack) {
      const pa = result.playerAttack;
      if (pa.perfectDodge) {
        showDamageNumber(0, false, false, false, false, 'perfect');
      } else if (pa.dodged) {
        showDamageNumber(0, false, false, false, false, 'dodge');
      } else if (pa.miss) {
        showDamageNumber(0, false, false, false, false, 'miss');
      } else {
        showDamageNumber(pa.damage, false, pa.critical);
        animateEnemyHurt();

        // Animate chip pipeline if present
        if (pa.pipelineResult) {
          animateChipPipeline(pa.pipelineResult);
        }

        // Show chip effects that triggered
        if (pa.chipEffects && pa.chipEffects.length > 0) {
          const statusNames = {
            defrag: 'デフラグ!', lag: 'ラグ!', bufferOverflow: 'バッファオーバーフロー!',
            corrupted: '破損!', exposed: '露出!', overheated: 'オーバーヒート!'
          };
          pa.chipEffects.forEach((effect, i) => {
            setTimeout(() => {
              const displayName = statusNames[effect.status] || effect.status;
              showChipEffect(displayName, false);
            }, i * 200); // Stagger multiple effects
          });
        }

        // Show DoT damage from status effects (defrag, overheated, etc.)
        if (pa.dotDamage && pa.dotDamage > 0) {
          setTimeout(() => {
            showDotDamage(pa.dotDamage, false);
          }, 300); // Show after chip effect text
        }
      }
    }

    // Update HP bars
    updateEnemyHPBar(result.enemyHp);
    updatePlayerHPBar(result.playerHp);

    // Show glitching dialogue when enemy HP drops below 30%
    // Combat pauses until Enter is pressed - don't schedule next attack
    if (result.enemyGlitching && result.glitchingDialogue) {
      showEnemyDialogue(result.glitchingDialogue, 'glitching');
      return; // Timers cleared in showEnemyDialogue, restarted in dismissEnemyDialogue
    }

    // Check if combat ended
    if (result.combatEnded) {
      // Show liberated dialogue on victory
      if (result.victory && result.liberatedDialogue) {
        showEnemyDialogue(result.liberatedDialogue, 'liberated');
      }
      stopRealtimeCombat(result);
      return;
    }

    playerAttackPending = false;

    // Combat pause mode: trigger enemy attack after player, then pause for vocab review
    if (realtimeCombatActive && !enemyDialogueActive) {
      // Small delay before enemy attacks back
      setTimeout(() => {
        executeEnemyAttackThenPause();
      }, 400);
    }

  } catch (error) {
    console.error('Player attack error:', error);
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

// Execute a single enemy attack and schedule the next one
async function executeEnemyAttack() {
  if (!realtimeCombatActive || enemyAttackPending || enemyDialogueActive) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack:', result.enemyAttack?.damage, 'interval:', result.enemyInterval);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
        realtimeCombatActive = false; // Sync client state
        return;
      }
      console.error('Enemy attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (enemyDialogueActive) {
      enemyAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

    // Show enemy's attack result
    if (result.enemyAttack) {
      const ea = result.enemyAttack;
      if (ea.perfectDodge) {
        showDamageNumber(0, true, false, false, false, 'perfect');
      } else if (ea.dodged) {
        showDamageNumber(0, true, false, false, false, 'dodge');
      } else if (ea.miss) {
        showDamageNumber(0, true, false, false, false, 'miss');
      } else {
        showDamageNumber(ea.damage, true, ea.critical);
        animatePlayerHurt();
      }
    }

    // Update HP bars
    updateEnemyHPBar(result.enemyHp);
    updatePlayerHPBar(result.playerHp);

    // Check if combat ended
    if (result.combatEnded) {
      stopRealtimeCombat(result);
      return;
    }

    // Don't reschedule - the vocab pause flow handles attack cycling
    enemyAttackPending = false;

  } catch (error) {
    console.error('Enemy attack error:', error);
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

// Execute enemy attack and then pause combat for vocab review
async function executeEnemyAttackThenPause() {
  if (!realtimeCombatActive || enemyAttackPending || enemyDialogueActive) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

    if (result.error) {
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
        realtimeCombatActive = false;
        return;
      }
      console.error('Enemy attack error:', result.error);
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    if (enemyDialogueActive) {
      enemyAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

    // Show enemy's attack result
    if (result.enemyAttack) {
      const ea = result.enemyAttack;
      if (ea.perfectDodge) {
        showDamageNumber(0, true, false, false, false, 'perfect');
      } else if (ea.dodged) {
        showDamageNumber(0, true, false, false, false, 'dodge');
      } else if (ea.miss) {
        showDamageNumber(0, true, false, false, false, 'miss');
      } else {
        showDamageNumber(ea.damage, true, ea.critical);
        animatePlayerHurt();
      }
    }

    // Update HP bars
    updateEnemyHPBar(result.enemyHp);
    updatePlayerHPBar(result.playerHp);

    // Check if combat ended
    if (result.combatEnded) {
      stopRealtimeCombat(result);
      return;
    }

    // Pause combat - wait for vocab review before next cycle
    enemyAttackPending = false;
    combatPausedForVocab = true;
    console.log('[Combat] Paused for vocab review. Review a word to continue.');

  } catch (error) {
    console.error('Enemy attack error:', error);
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

// Resume combat after vocab review - triggers next attack cycle
function resumeCombatAfterVocab() {
  if (!realtimeCombatActive || !combatPausedForVocab) return;

  combatPausedForVocab = false;
  console.log('[Combat] Resuming after vocab review');

  // Trigger player attack, which will chain into enemy attack, then pause again
  executePlayerAttack();
}

async function stopRealtimeCombat(result) {
  // Clear both attack timers
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }

  realtimeCombatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // Hide word practice cards and close modal
  wordPractice.hideWordCards();
  wordPractice.closeWordInputModal();

  // Brief pause before narration (let final damage numbers display)
  await delay(600);

  // Wait for enemy dialogue to be dismissed (e.g., liberated dialogue on victory)
  if (dialogueDismissPromise) {
    await dialogueDismissPromise;
  }

  // Animate victory or defeat
  if (result.victory) {
    animateEnemyDefeat();
  }

  // Request narration from server
  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-end-narration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victory: result.victory,
        expGained: result.expGained,
        goldGained: result.goldGained,
        loot: result.loot,
        leveledUp: result.leveledUp,
        newLevel: result.newLevel,
        isBoss: result.isBoss,
        ...apiKeys
      })
    });
    const narrationResult = await response.json();

    // Display narration
    if (narrationResult.narration) {
      narration.showNarration(narrationResult.narration);
    }

    // Update game state from server
    if (narrationResult.state) {
      updateGameState({ ...gameState, ...narrationResult.state });
    }

    // Play TTS if available
    if (narrationResult.audio) {
      playNarrationAudio(narrationResult.audio);
    }

    // Show victory or defeat modal
    if (result.victory) {
      showVictoryModal(result);
    } else {
      showGameOverModal(result);
    }

  } catch (error) {
    console.error('Error getting combat end narration:', error);
    // Fallback narration
    if (result.victory) {
      narration.showNarration('市民解放！');
      showVictoryModal(result);
    } else {
      narration.showNarration('敗北...');
      showGameOverModal(result);
    }
  }

  // Refresh full UI state
  updateUI();
}

// ============ WORD PRACTICE FUNCTIONS ============

// Shuffle array (Fisher-Yates)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Player stats and equipment display - delegated to characterUI module
function updateQuickStats() { characterUI.updateQuickStats(); }
function updatePlayerStats() { characterUI.updatePlayerStats(); }
function updateEquipment() { characterUI.updateEquipment(); }
async function equipItem(itemId) { return characterUI.equipItem(itemId); }
async function unequipItemHandler(slot) { return characterUI.unequipItemHandler(slot); }
function updateInventory() { characterUI.updateInventory(); }

function updateGameContent() {
  const phase = gameState.phase;

  switch (phase) {
    case 'no_save':
      showNoSaveContent();
      break;
    case 'hub':
      showHubContent();
      break;
    case 'ward_selection':
      showWardSelectionContent();
      break;
    case 'exploring':
      showExploringContent();
      break;
    case 'room':
    case 'room_encounter':
      showRoomContent();
      break;
    case 'boss_ready':
      showBossReadyContent();
      break;
    case 'floor_complete':
      showFloorCompleteContent();
      break;
    case 'post_combat_shop':
      showPostCombatShopContent();
      break;
    case 'combat':
      showCombatContent();
      break;
    case 'run_ended':
      showRunEndedContent();
      break;
  }
}

function updateActionPanel() {
  // During realtime combat, show combat indicator instead of actions
  if (realtimeCombatActive) {
    actionPanel.innerHTML = `
      <div class="combat-status-container">
        <div class="combat-chips-display">
          ${renderCombatChips()}
        </div>
        <div class="combat-in-progress">
          <div class="combat-indicator">⚔️ 戦闘中...</div>
        </div>
      </div>
    `;
    return;
  }

  const phase = gameState.phase;

  switch (phase) {
    case 'no_save':
      actionPanel.innerHTML = `
        <button class="action-btn primary" onclick="createCharacter()">
          Start Game
        </button>
      `;
      break;
    case 'hub':
      actionPanel.innerHTML = `
        <button class="action-btn primary" onclick="startNewRun()">
          Infiltrate Tokyo
        </button>
        <button class="action-btn secondary" onclick="openUpgradesModal()">
          Upgrades
        </button>
        <button class="action-btn secondary" onclick="openLiberationTracker()">
          解放記録
        </button>
      `;
      break;
    case 'ward_selection':
      // Actions handled by showWardSelectionContent
      actionPanel.innerHTML = '';
      break;
    case 'exploring':
      actionPanel.innerHTML = `
        <button class="action-btn primary" onclick="startEncounter()">
          Explore
        </button>
      `;
      break;
    case 'room':
    case 'room_encounter':
      showRoomActions();
      break;
    case 'boss_ready':
      actionPanel.innerHTML = `
        <button class="action-btn boss" onclick="startBossEncounter()">
          Liberate Boss
        </button>
      `;
      break;
    case 'floor_complete':
      if (gameState.run?.floor < 7) {
        actionPanel.innerHTML = `
          <button class="action-btn primary" onclick="nextFloor()">
            Descend to Next Floor
          </button>
        `;
      } else {
        actionPanel.innerHTML = `
          <button class="action-btn primary" onclick="returnToHub()">
            Return Home Victorious
          </button>
        `;
      }
      break;
    case 'post_combat_shop':
      // Actions are in the shop content itself
      actionPanel.innerHTML = `
        <button class="action-btn primary" onclick="refreshShop()">
          リフレッシュ
        </button>
        <button class="action-btn secondary" onclick="skipShop()">
          スキップ (¥節約)
        </button>
      `;
      break;
    case 'combat':
      // Don't show old turn-based combat actions - realtime combat will start shortly
      // Show a brief "combat starting" indicator instead
      actionPanel.innerHTML = `
        <div class="combat-in-progress">
          <div class="combat-indicator">⚔️ 戦闘開始...</div>
        </div>
      `;
      break;
    case 'run_ended':
      actionPanel.innerHTML = `
        <button class="action-btn primary" onclick="returnToHub()">
          拠点に戻る
        </button>
      `;
      break;
  }

  // Reset keyboard selection after updating actions
  setTimeout(resetActionSelection, 50);

  // Disable buttons if narration is pending
  updateActionButtonsState();
}

// Disable/enable action buttons based on narration state
function updateActionButtonsState() {
  // Block buttons only when there are MORE messages to show
  // Allow actions immediately after the last message displays
  const shouldBlock = narration.shouldBlockActions();
  const buttons = actionPanel.querySelectorAll('.action-btn, .combat-btn');

  buttons.forEach(btn => {
    if (shouldBlock) {
      btn.disabled = true;
      btn.classList.add('waiting-narration');
    } else {
      // Don't re-enable buttons that were disabled for other reasons (e.g., not enough SP)
      if (btn.classList.contains('waiting-narration')) {
        btn.disabled = false;
        btn.classList.remove('waiting-narration');
      }
    }
  });
}

// ============ CONTENT VIEWS ============
// Delegated to explorationUI module
function showNoSaveContent() { explorationUI.showNoSaveContent(); }
function showHubContent() { explorationUI.showHubContent(); }
async function showWardSelectionContent() { return explorationUI.showWardSelectionContent(); }
async function selectWard(wardId, isNextWard = false) { return explorationUI.selectWard(wardId, isNextWard); }
window.selectWard = selectWard;
function updateWardSelection(wardCards) { explorationUI.updateWardSelection(wardCards); }
function showExploringContent() { explorationUI.showExploringContent(); }

// ============ ROOM EXPLORATION UI ============
// Delegated to explorationUI module
function showRoomContent() { explorationUI.showRoomContent(); }
function showRoomActions() { explorationUI.showRoomActions(); }
function getRoomIcon(type) { return explorationUI.getRoomIcon(type); }
function getRoomTypeName(type) { return explorationUI.getRoomTypeName(type); }
async function handleRoomAction(actionId) { return explorationUI.handleRoomAction(actionId); }
async function proceedToNextRoom() { return explorationUI.proceedToNextRoom(); }
async function startRoomEncounter() { return explorationUI.startRoomEncounter(); }
async function disarmTrap() { return explorationUI.disarmTrap(); }
async function triggerTrap() { return explorationUI.triggerTrap(); }
async function lootBody() { return explorationUI.lootBody(); }
async function skipBody() { return explorationUI.skipBody(); }
async function skipTreasure() { return explorationUI.skipTreasure(); }
async function openTreasure() { return explorationUI.openTreasure(); }
async function useShrine() { return explorationUI.useShrine(); }

// ============ ECONOMY UI ============
// Delegated to economyUI module
function formatItemStats(item) { return economyUI.formatItemStats(item); }
async function openShop() { return economyUI.openShop(); }
async function buyItem(itemId) { return economyUI.buyItem(itemId); }
function closeShop() { economyUI.closeShop(); }
async function openBlacksmith() { return economyUI.openBlacksmith(); }
async function refineItemHandler(slot) { return economyUI.refineItemHandler(slot); }
function closeBlacksmith() { economyUI.closeBlacksmith(); }
async function openChipUpgradeModal() { return economyUI.openChipUpgradeModal(); }
async function performChipUpgrade(chipId) { return economyUI.performChipUpgrade(chipId); }
function closeChipUpgradeModal() { economyUI.closeChipUpgradeModal(); }
function showBossReadyContent() { economyUI.showBossReadyContent(); }
function showFloorCompleteContent() { economyUI.showFloorCompleteContent(); }
function showPostCombatShopContent() { economyUI.showPostCombatShopContent(); }
async function claimStartingChipHandler(itemIndex) { return economyUI.claimStartingChipHandler(itemIndex); }
function resetShopModal() { economyUI.resetShopModal(); }
async function buyFromShop(itemIndex) { return economyUI.buyFromShop(itemIndex); }
async function skipShop() { return economyUI.skipShop(); }
async function refreshShop() { return economyUI.refreshShop(); }
function showRunEndedContent() { economyUI.showRunEndedContent(); }
function selectShopItem(index) { economyUI.selectShopItem(index); }

// ============ COMBAT UI ============
// Delegated to combatUI module
function showCombatContent() { combatUI.showCombatContent(); }
function closeCombatSubmenu() { combatUI.closeCombatSubmenu(); }
function getEnemyEmoji(enemy) { return combatUI.getEnemyEmoji(enemy); }
function disableCombatActions() { combatUI.disableCombatActions(); }
function enableCombatActions() { combatUI.enableCombatActions(); }

// ============ MODALS ============
function showVictoryModal(result) {
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

function showGameVictoryModal(result) {
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

function showGameOverModal(result) {
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

function handleResultContinue() {
  resultModal.classList.add('hidden');

  // Check if there's a post-combat shop to show
  if (gameState.run?.postCombatShop?.active) {
    showPostCombatShopContent();
  } else {
    updateUI();
  }
}

// Handle all keyboard input (narration + action buttons)
function handleKeypress(e) {
  // Don't trigger if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Enter to dismiss enemy dialogue (highest priority)
  if (e.key === 'Enter' && enemyDialogueActive) {
    e.preventDefault();
    dismissEnemyDialogue();
    return;
  }

  // Enter to continue on result modal (after beating enemy)
  if (e.key === 'Enter' && !resultModal.classList.contains('hidden')) {
    e.preventDefault();
    handleResultContinue();
    return;
  }

  // Handle shop modal keyboard navigation
  if (shopModal && !shopModal.classList.contains('hidden')) {
    const shopItems = shopModal.querySelectorAll('.shop-item');
    if (shopItems.length > 0) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateShopItems(-1, shopItems);
        return;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateShopItems(1, shopItems);
        return;
      } else if (e.key === 'Enter' && economyUI.getSelectedShopIndex() >= 0) {
        e.preventDefault();
        buyFromShop(economyUI.getSelectedShopIndex());
        return;
      }
    }
    return; // Don't process other keys while shop is open
  }

  // Ward selection keyboard navigation
  const wardData = explorationUI.getWardSelectionData();
  if (gameState.phase === 'ward_selection' && wardData.length > 0) {
    const wardCards = document.querySelectorAll('.ward-card');
    if (wardCards.length > 0) {
      let idx = explorationUI.getSelectedWardIndex();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx - 1 + wardCards.length) % wardCards.length;
        explorationUI.setSelectedWardIndex(idx);
        updateWardSelection(wardCards);
        return;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        idx = (idx + 1) % wardCards.length;
        explorationUI.setSelectedWardIndex(idx);
        updateWardSelection(wardCards);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const ward = wardData[explorationUI.getSelectedWardIndex()];
        if (ward) selectWard(ward.id, ward.isNextWard);
        return;
      }
    }
  }

  // Don't trigger if a modal is open
  if (!settingsModal.classList.contains('hidden') ||
      !createCharModal.classList.contains('hidden') ||
      !resultModal.classList.contains('hidden') ||
      !gameoverModal.classList.contains('hidden') ||
      !logModal.classList.contains('hidden') ||
      (upgradesModal && !upgradesModal.classList.contains('hidden')) ||
      (gameStatsModal && !gameStatsModal.classList.contains('hidden'))) {
    return;
  }

  // Space key: advance narration if messages queued
  if (e.key === ' ') {
    if (narration.getQueueLength() > 0) {
      e.preventDefault();
      narration.advanceNarration();
      return;
    }
  }

  // R key: repeat last narration voice (but not during combat - R refreshes words there)
  if (e.key === 'r' || e.key === 'R') {
    const lastNarration = tts.getLastSpokenNarration();
    if (!realtimeCombatActive && lastNarration && tts.isEnabled()) {
      e.preventDefault();
      tts.speakNarration(lastNarration);
      return;
    }
  }

  // Get action buttons
  const actionButtons = getActionButtons();
  if (actionButtons.length === 0) return;

  // Handle arrow key navigation
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    navigateActions(-1, actionButtons);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateActions(1, actionButtons);
  } else if (e.key === 'Enter') {
    // Enter only triggers actions, not narration
    e.preventDefault();
    triggerSelectedAction(actionButtons);
  }
}

// Get all action buttons currently visible
function getActionButtons() {
  // Check for combat actions first
  const combatButtons = document.querySelectorAll('.combat-btn:not(:disabled)');
  if (combatButtons.length > 0) return Array.from(combatButtons);

  // Check for regular action buttons
  const actionButtons = document.querySelectorAll('.action-btn:not(:disabled)');
  if (actionButtons.length > 0) return Array.from(actionButtons);

  // Check for submenu options
  const submenuButtons = document.querySelectorAll('.submenu-option:not(:disabled)');
  if (submenuButtons.length > 0) return Array.from(submenuButtons);

  return [];
}

// Navigate through action buttons
function navigateActions(direction, buttons) {
  // Remove selection from current
  buttons.forEach(btn => btn.classList.remove('keyboard-selected'));

  // Calculate new index
  selectedActionIndex += direction;
  if (selectedActionIndex < 0) selectedActionIndex = buttons.length - 1;
  if (selectedActionIndex >= buttons.length) selectedActionIndex = 0;

  // Add selection to new button
  const selectedButton = buttons[selectedActionIndex];
  selectedButton.classList.add('keyboard-selected');
  selectedButton.focus();
}

// Trigger the currently selected action
function triggerSelectedAction(buttons) {
  if (selectedActionIndex >= 0 && selectedActionIndex < buttons.length) {
    const selectedButton = buttons[selectedActionIndex];
    if (selectedButton && !selectedButton.disabled) {
      selectedButton.click();
    }
  }
}

// Navigate through shop items with keyboard
function navigateShopItems(direction, items) {
  // Remove selection from all items
  items.forEach(item => item.classList.remove('keyboard-selected'));

  // Calculate new index using economyUI module state
  let idx = economyUI.getSelectedShopIndex();
  if (idx < 0) {
    idx = direction > 0 ? 0 : items.length - 1;
  } else {
    idx += direction;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
  }
  economyUI.setSelectedShopIndex(idx);

  // Add selection to new item and speak the chip name
  const selectedItem = items[idx];
  selectedItem.classList.add('keyboard-selected');
  selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Get chip name and speak it
  const chipName = selectedItem.querySelector('.shop-item-name')?.childNodes[0]?.textContent?.trim();
  if (chipName) {
    tts.speakText(chipName);
  }
}

// selectShopItem is delegated to economyUI module (see ECONOMY UI section)

// Reset action selection (call when UI updates)
function resetActionSelection() {
  selectedActionIndex = 0;
  document.querySelectorAll('.keyboard-selected').forEach(el => {
    el.classList.remove('keyboard-selected');
  });

  // Auto-select first button
  const buttons = getActionButtons();
  if (buttons.length > 0) {
    buttons[0].classList.add('keyboard-selected');
  }
}

// ============ LOG MODAL ============
async function openLogModal() {
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

function closeLogModal() {
  logModal.classList.add('hidden');
}

// ============ META-PROGRESSION UI ============

/**
 * Open the upgrades modal
 */
async function openUpgradesModal() {
  await loadUpgradesData();
  upgradesModal?.classList.remove('hidden');
  switchUpgradesTab('upgrades');
}

/**
 * Close the upgrades modal
 */
function closeUpgradesModal() {
  upgradesModal?.classList.add('hidden');
}

// ============ CHIP MODAL - delegated to characterUI ============
async function openChipModal(equipmentSlot) { return characterUI.openChipModal(equipmentSlot); }
function closeChipModal() { return characterUI.closeChipModal(); }
function renderChipModal() { return characterUI.renderChipModal(); }
function getChipEffectText(chip) { return characterUI.getChipEffectText(chip); }
async function addChipToSlot(chipId) { return characterUI.addChipToSlot(chipId); }
async function removeChipFromSlot(chipId) { return characterUI.removeChipFromSlot(chipId); }
async function toggleChipEquip(chipId, fromSlot) { return characterUI.toggleChipEquip(chipId, fromSlot); }
function getChipLoadoutCache() { return characterUI.getChipLoadoutCache(); }

// Combat chip display - delegated to combatUI module
function renderCombatChips(pipelineResult = null) {
  combatUI.setChipLoadoutCache(getChipLoadoutCache());
  return combatUI.renderCombatChips(pipelineResult);
}
async function animateChipPipeline(pipelineResult) { return combatUI.animateChipPipeline(pipelineResult); }
function getCategoryLabel(category) { return combatUI.getCategoryLabel(category); }

// Make chip modal functions globally accessible
window.openChipModal = openChipModal;
window.closeChipModal = closeChipModal;
window.addChipToSlot = addChipToSlot;
window.removeChipFromSlot = removeChipFromSlot;
window.toggleChipEquip = toggleChipEquip;

// ============ LIBERATION TRACKER MODAL ============
let liberationTrackerCache = null;

/**
 * Open the Liberation Tracker modal
 */
async function openLiberationTracker() {
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
function closeLiberationTracker() {
  const modal = document.getElementById('liberation-modal');
  modal?.classList.add('hidden');
}

/**
 * Render the Liberation Tracker content
 */
function renderLiberationTracker() {
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
 */
function showLiberationDetail(enemyId) {
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
 */
function showLiberationTab(tab) {
  document.querySelectorAll('.lib-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.lib-tab[onclick*="${tab}"]`)?.classList.add('active');

  document.getElementById('liberation-liberated')?.classList.toggle('hidden', tab !== 'liberated');
  document.getElementById('liberation-locked')?.classList.toggle('hidden', tab !== 'locked');
}

// Make liberation tracker functions globally accessible
window.openLiberationTracker = openLiberationTracker;
window.closeLiberationTracker = closeLiberationTracker;
window.showLiberationDetail = showLiberationDetail;
window.showLiberationTab = showLiberationTab;
window.renderLiberationTracker = renderLiberationTracker;

/**
 * Switch tabs in the upgrades modal
 */
function switchUpgradesTab(tabName) {
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
async function loadUpgradesData() {
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
async function loadAchievementsData() {
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
async function loadLifetimeStats() {
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
 */
async function purchaseUpgrade(upgradeId) {
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
 */
function showAchievementNotification(achievement) {
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
 */
function getEssenceDisplayHTML() {
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

/**
 * Trigger JPDB browser extension to parse the page
 * Simulates Alt+P keypress which is the default parse keybind
 * Debounced to prevent too many rapid calls
 */
let jpdbParseTimeout = null;
function triggerJpdbParse() {
  return; // DISABLED - too many server pings
  // Debounce: cancel pending parse and schedule a new one
  if (jpdbParseTimeout) {
    clearTimeout(jpdbParseTimeout);
  }

  jpdbParseTimeout = setTimeout(() => {
    jpdbParseTimeout = null;
    try {
      const event = new KeyboardEvent('keydown', {
        key: 'p',
        code: 'KeyP',
        altKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      // Also dispatch keyup to complete the sequence
      setTimeout(() => {
        const upEvent = new KeyboardEvent('keyup', {
          key: 'p',
          code: 'KeyP',
          altKey: true,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(upEvent);
      }, 50);
    } catch (e) {
      // Silently ignore JPDB extension errors
      console.debug('JPDB parse trigger failed:', e);
    }
  }, 300);
}

// ============ NEW GAME ============
function confirmNewGame() {
  if (confirm('FULL RESET: This will erase ALL progress including meta-upgrades, achievements, and essence. Continue?')) {
    resetGame();
  }
}

async function resetGame() {
  try {
    await fetch(`${API_BASE}/api/game/reset`, { method: 'POST' });

    // Clear debug mode (keep API keys)
    settings.setDebugMode(false);
    debugMode = false;

    await loadGameState();
    narration.showNarration('Welcome to NEO TOKYO! Create a character to begin your adventure.');
    updateUI();
  } catch (error) {
    console.error('Failed to reset game:', error);
    showError('Failed to reset game');
  }
}

// ============ DEBUG MODE ============
async function toggleDebugMode() {
  try {
    const response = await fetch(`${API_BASE}/api/game/debug-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !debugMode })
    });
    const result = await response.json();
    debugMode = result.debugMode;

    // Persist to localStorage via settings module
    settings.setDebugMode(debugMode);

    // Update button visual
    updateDebugModeButton();

    if (debugMode) {
      showToast('Debug mode ON - No AI calls', 'info');
    } else {
      showToast('Debug mode OFF - AI enabled', 'info');
    }
  } catch (error) {
    console.error('Failed to toggle debug mode:', error);
  }
}

// Update debug mode button visual
function updateDebugModeButton() {
  const btn = document.getElementById('debug-mode-btn');
  if (!btn) return;

  if (debugMode) {
    btn.classList.add('active');
    btn.style.color = '#ff6b6b';
  } else {
    btn.classList.remove('active');
    btn.style.color = '';
  }
}

// Initialize debug mode from localStorage on page load
async function initDebugMode() {
  if (debugMode) {
    // Sync with server
    try {
      await fetch(`${API_BASE}/api/game/debug-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      });
    } catch (e) {
      console.warn('Failed to sync debug mode with server:', e);
    }
  }
  updateDebugModeButton();
}

// ============ SETTINGS ============
async function openSettings() {
  // Load API keys from localStorage (per-user storage)
  const storedKeys = settings.getApiKeys();
  aiProviderSelect.value = storedKeys.aiProvider || 'openai';
  aiKeyInput.value = storedKeys.aiApiKey || '';
  openaiModelSelect.value = storedKeys.openaiModel || 'gpt-4o-mini';
  openrouterModelInput.value = storedKeys.openrouterModel || '';
  jlptLevelSelect.value = storedKeys.jlptLevel || 'N4';
  jpdbApiKeyInput.value = storedKeys.jpdbApiKey || '';

  // Load non-sensitive settings from server
  try {
    const response = await fetch(`${API_BASE}/api/settings`);
    const settings = await response.json();

    reviewTypeSelect.value = settings.reviewType || 'typing';

    // Initialize TTS settings from server
    initTtsSettings(settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  updateProviderVisibility();

  settingsStatus.textContent = '';
  settingsStatus.className = 'settings-status';
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

function updateProviderVisibility() {
  const provider = aiProviderSelect.value;

  // Show OpenAI model selector only for OpenAI
  if (provider === 'openai') {
    openaiModelGroup.classList.remove('hidden');
  } else {
    openaiModelGroup.classList.add('hidden');
  }

  // Show OpenRouter model input only for OpenRouter
  if (provider === 'openrouter') {
    openrouterModelGroup.classList.remove('hidden');
  } else {
    openrouterModelGroup.classList.add('hidden');
  }
}

async function saveSettings() {
  // Save API keys to localStorage (per-user storage)
  settings.saveApiKeys({
    aiApiKey: aiKeyInput.value,
    aiProvider: aiProviderSelect.value,
    openaiModel: openaiModelSelect.value,
    openrouterModel: openrouterModelInput.value,
    jlptLevel: jlptLevelSelect.value,
    jpdbApiKey: jpdbApiKeyInput.value
  });

  // Get current server settings to preserve fields we don't manage here
  let currentSettings = {};
  try {
    const currentRes = await fetch(`${API_BASE}/api/settings`);
    currentSettings = await currentRes.json();
  } catch (e) {
    console.warn('Could not fetch current settings:', e);
  }

  // Only send non-sensitive settings to server
  const serverSettings = {
    // TTS settings (server-side for VOICEVOX)
    gameTtsEnabled: gameTtsEnabled?.checked || false,
    gameTtsSpeakerId: parseInt(gameTtsSpeaker?.value) || 13,
    gameTtsSpeed: parseFloat(gameTtsSpeed?.value) || 0.9,
    gameTtsVolume: parseFloat(gameTtsVolume?.value) || 1.0,
    // Word review settings
    reviewType: reviewTypeSelect.value
  };

  // Update TTS module state
  tts.setEnabled(serverSettings.gameTtsEnabled);
  tts.setSpeakerId(serverSettings.gameTtsSpeakerId);
  tts.setSpeed(serverSettings.gameTtsSpeed);
  tts.setVolume(serverSettings.gameTtsVolume);

  // Update local review type
  wordPractice.setReviewType(serverSettings.reviewType);

  try {
    const response = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverSettings)
    });

    if (response.ok) {
      settingsStatus.textContent = 'Settings saved!';
      settingsStatus.className = 'settings-status success';
      setTimeout(() => {
        closeSettings();
      }, 1000);
    } else {
      throw new Error('Failed to save');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    settingsStatus.textContent = 'Failed to save settings';
    settingsStatus.className = 'settings-status error';
  }
}

// ============ GAME STATS MODAL ============

/**
 * Open the game stats modal
 */
async function openGameStatsModal() {
  await loadGameStatsData();
  await loadCachedWordStates();
  gameStatsModal?.classList.remove('hidden');
}

/**
 * Load cached word states if available
 */
async function loadCachedWordStates() {
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
 * Get human-readable time ago string
 */
function getTimeAgo(dateString) {
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

/**
 * Close the game stats modal
 */
function closeGameStatsModal() {
  gameStatsModal?.classList.add('hidden');
}

/**
 * Load and display game stats data
 */
async function loadGameStatsData() {
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
 */
function updateGameStatsDisplay(stats) {
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
async function resetGameStats() {
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

// ============ WORD STATES FUNCTIONS ============

/**
 * Refresh word states from JPDB
 */
async function refreshGameWordStates() {
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
 */
function updateGameFilterCounts(stateCounts, totalWords) {
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
 */
function handleGameFilterClick(state) {
  gameActiveStateFilter = state;

  document.querySelectorAll('#game-word-state-filters .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.state === state);
  });

  renderGameFilteredWords();
}

/**
 * Render filtered words with state badges and review buttons
 */
function renderGameFilteredWords() {
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
 */
async function handleGameReviewClick(e) {
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

// ============ TTS (VOICEVOX) FUNCTIONS ============

/**
 * Check VOICEVOX status (DOM update wrapper for tts module)
 */
async function checkTtsStatus() {
  if (!gameTtsStatus) return;

  gameTtsStatus.textContent = 'Checking...';
  gameTtsStatus.className = '';

  const data = await tts.checkStatus();

  if (data.running) {
    gameTtsStatus.textContent = `VOICEVOX running (v${data.version})`;
    gameTtsStatus.className = 'status-running';
    await loadTtsSpeakers();
  } else {
    gameTtsStatus.textContent = 'VOICEVOX not running';
    gameTtsStatus.className = 'status-stopped';
    if (gameTtsSpeaker) {
      gameTtsSpeaker.innerHTML = '<option value="">Start VOICEVOX first</option>';
    }
  }
}

/**
 * Load available TTS speakers/voices (DOM update wrapper for tts module)
 */
async function loadTtsSpeakers() {
  if (!gameTtsSpeaker) return;

  const speakers = await tts.loadSpeakers();

  if (speakers.length === 0) {
    gameTtsSpeaker.innerHTML = '<option value="">Failed to load voices</option>';
    return;
  }

  gameTtsSpeaker.innerHTML = '';
  for (const speaker of speakers) {
    const option = document.createElement('option');
    option.value = speaker.id;
    option.textContent = speaker.displayName;
    if (speaker.id === tts.getSpeakerId()) {
      option.selected = true;
    }
    gameTtsSpeaker.appendChild(option);
  }
}

/**
 * Test TTS with sample narration
 */
async function testTts() {
  const testText = 'NEO TOKYOに侵入する。SYSTEMの支配が見える。解放作戦が始まる。';
  await tts.speakNarration(testText);
}

/**
 * Initialize TTS settings from loaded settings
 */
function initTtsSettings(settings) {
  tts.initSettings(settings);

  // Update DOM elements
  if (gameTtsEnabled) gameTtsEnabled.checked = tts.isEnabled();
  if (gameTtsSpeed) {
    gameTtsSpeed.value = tts.getSpeed();
    if (gameTtsSpeedValue) gameTtsSpeedValue.textContent = tts.getSpeed().toFixed(1);
  }
  if (gameTtsVolume) {
    gameTtsVolume.value = tts.getVolume();
    if (gameTtsVolumeValue) gameTtsVolumeValue.textContent = Math.round(tts.getVolume() * 100);
  }

  // Check VOICEVOX status
  checkTtsStatus();
}

// ============ UTILITIES ============
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ POPUP DICTIONARY ============
// Cache for word meanings to avoid repeated API calls
const meaningCache = new Map();

// Track parsed text to avoid re-parsing
const parsedTextCache = new Map();

/**
 * Wrap parsed tokens in clickable spans for popup dictionary
 * @param {Array} tokens - Array of {spelling, reading, vid, sid, isWord}
 * @returns {string} HTML string with clickable word spans
 */
function wrapWordsWithSpans(tokens) {
  return tokens.map(token => {
    if (token.isWord && token.vid && token.sid) {
      const reading = token.reading && token.reading !== token.spelling ? token.reading : '';
      return `<span class="jpdb-word" data-vid="${token.vid}" data-sid="${token.sid}" data-reading="${escapeHtml(reading)}">${escapeHtml(token.spelling)}</span>`;
    }
    // Non-word tokens (punctuation, particles without vid, etc.)
    return escapeHtml(token.spelling);
  }).join('');
}

/**
 * Parse Japanese text and wrap words in clickable spans
 * @param {string} text - Raw Japanese text
 * @returns {Promise<string>} HTML string with clickable word spans
 */
async function parseAndWrapText(text) {
  if (!text || text.trim() === '') return text;

  // Check cache first
  if (parsedTextCache.has(text)) {
    return parsedTextCache.get(text);
  }

  const data = await apiParseJpdbText(text);

  if (data.error) {
    console.warn('JPDB parse failed:', data.error);
    return escapeHtml(text);
  }

  const tokens = data.tokens || [];

  if (tokens.length === 0) {
    return escapeHtml(text);
  }

  const wrappedHtml = wrapWordsWithSpans(tokens);
  parsedTextCache.set(text, wrappedHtml);
  return wrappedHtml;
}

/**
 * Fetch word meaning from API (with caching)
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @returns {Promise<{spelling, reading, meanings}|null>}
 */
async function fetchWordMeaning(vid, sid) {
  const cacheKey = `${vid}-${sid}`;

  if (meaningCache.has(cacheKey)) {
    return meaningCache.get(cacheKey);
  }

  const data = await apiLookupJpdbWord(vid, sid);

  if (data.error) {
    console.warn('JPDB lookup failed:', data.error);
    return null;
  }

  meaningCache.set(cacheKey, data);
  return data;
}

/**
 * Show popup dictionary for a clicked word
 * @param {HTMLElement} wordEl - The clicked .jpdb-word element
 */
async function showWordPopup(wordEl) {
  const vid = parseInt(wordEl.dataset.vid);
  const sid = parseInt(wordEl.dataset.sid);
  const reading = wordEl.dataset.reading || null;
  const word = wordEl.textContent;

  if (!vid || !sid) return;

  // Show loading state
  wordEl.classList.add('loading');

  const data = await fetchWordMeaning(vid, sid);

  wordEl.classList.remove('loading');

  if (data && data.meanings && data.meanings.length > 0) {
    wordPractice.showDefinitionsReveal(word, data.meanings, reading || data.reading);
  }
}

// Global click handler for popup dictionary (event delegation)
document.addEventListener('click', (e) => {
  const wordEl = e.target.closest('.jpdb-word');
  if (wordEl) {
    e.preventDefault();
    e.stopPropagation();
    showWordPopup(wordEl);
  }
});

function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Stat allocation
async function allocateStatPoint(statKey) {
  const result = await apiAllocateStat(statKey);

  if (result?.success) {
    // Update game state
    gameState.player = result.state.player;
    if (result.state.run) {
      gameState.run = result.state.run;
    }

    // Show feedback
    const statNames = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK' };
    showToast(`${statNames[statKey] || statKey} +1!`, 'success');

    // Refresh UI
    updateUI();
  } else if (result?.error) {
    showToast(result.error, 'error');
  }
}

// Expose functions to global scope for onclick handlers
window.createCharacter = createCharacter;
window.openCreateCharModal = openCreateCharModal;
window.startNewRun = startNewRun;
window.startEncounter = startEncounter;
window.startBossEncounter = startBossEncounter;
window.nextFloor = nextFloor;
window.returnToHub = returnToHub;
window.performAttack = performAttack;

// Room exploration functions
window.proceedToNextRoom = proceedToNextRoom;
window.handleRoomAction = handleRoomAction;
window.disarmTrap = disarmTrap;
window.triggerTrap = triggerTrap;
window.lootBody = lootBody;
window.openTreasure = openTreasure;
window.useShrine = useShrine;
window.startRoomEncounter = startRoomEncounter;

// Narration functions
window.advanceNarration = narration.advanceNarration;
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;

// Meta-progression functions
window.openUpgradesModal = openUpgradesModal;
window.closeUpgradesModal = closeUpgradesModal;
window.purchaseUpgrade = purchaseUpgrade;
window.allocateStatPoint = allocateStatPoint;

// Game stats functions
window.openGameStatsModal = openGameStatsModal;
window.closeGameStatsModal = closeGameStatsModal;
window.resetGameStats = resetGameStats;

// For testing - expose gameState
window.gameState = gameState;
