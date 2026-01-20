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
 * - showNarration()/appendNarration() - VN-style text display with JPDB parsing
 * - openSettings()/saveSettings() - Configuration modal
 * - openChipModal()/renderChipModal() - Equipment chip management
 * - openUpgradesModal() - Meta-progression upgrades
 * - openGameStatsModal() - Statistics and word state tracking
 *
 * Word Practice:
 * - showWordCards()/hideWordCards() - Vocabulary review during combat
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

// Stat allocation state for character creation (default: evenly distributed)
let createStats = { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 };
let createStatPoints = 0;

// Word Review Settings
let reviewType = 'typing'; // 'typing' or 'self-grade'

// Shop Selection State
let selectedShopIndex = -1;
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

// Word Practice State
let combatWords = [];           // Array of {word, meanings} objects (meanings is array)
let availableWords = [];        // Pool of words not yet shown
let selectedWordIndex = 0;      // Currently selected word (0-4)
let jpdbWordsCache = null;      // Cached JPDB due words
let jpdbWordsFetching = false;  // Prevent duplicate fetches

// Fallback test data for word practice (used when JPDB unavailable)
const FALLBACK_WORD_DATA = [
  { word: '食べる', meanings: ['eat'] },
  { word: '飲む', meanings: ['drink'] },
  { word: '見る', meanings: ['see', 'watch', 'look'] },
  { word: '聞く', meanings: ['hear', 'listen', 'ask'] },
  { word: '行く', meanings: ['go'] },
  { word: '来る', meanings: ['come'] },
  { word: '言う', meanings: ['say', 'tell'] },
  { word: '思う', meanings: ['think', 'feel'] },
  { word: '知る', meanings: ['know'] },
  { word: '分かる', meanings: ['understand'] },
  { word: '読む', meanings: ['read'] },
  { word: '書く', meanings: ['write'] },
  { word: '話す', meanings: ['speak', 'talk'] },
  { word: '買う', meanings: ['buy'] },
  { word: '使う', meanings: ['use'] },
  { word: '作る', meanings: ['make', 'create'] },
  { word: '待つ', meanings: ['wait'] },
  { word: '持つ', meanings: ['hold', 'have'] },
  { word: '歩く', meanings: ['walk'] },
  { word: '走る', meanings: ['run'] }
];

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

// ============ NARRATION SYSTEM ============
// Narration comes from server - can be simple Japanese or AI-generated based on user's vocab

// Narration queue for video game-style "press to continue"
let narrationQueue = [];
let isNarrationWaiting = false;
let narrationLog = []; // Log of all narrations for current run

// Keyboard navigation for action buttons
let selectedActionIndex = 0;

// Setting for AI narration (can be toggled)
let useAINarration = true;

// Fetch AI-generated narration using player's JPDB vocabulary
async function fetchAINarration(event, context = {}) {
  if (!useAINarration) return null;

  try {
    const response = await fetch(`${API_BASE}/api/game/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, context })
    });
    const data = await response.json();
    console.log('AI Narration:', data.source, data.narration?.substring(0, 50) + '...');
    return data.narration || null;
  } catch (error) {
    console.error('AI Narration fetch error:', error);
    return null;
  }
}

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
  const settings = await apiGetSettings();
  reviewType = settings.reviewType || 'typing';
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
  document.addEventListener('keydown', handleWordPracticeKeydown);

  // Self-grade button click handlers
  document.querySelectorAll('.self-grade-buttons .review-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const grade = parseInt(btn.dataset.grade);
      submitSelfGradeReview(grade);
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
    advanceNarration();
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

  // Include allocated stats in player creation
  const result = await apiCreatePlayer(name, { ...createStats }, createStatPoints);
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    createCharModal.classList.add('hidden');
    // Reset create stats for next time
    resetCreateStats();
    // Use server narration or fallback
    const narration = result.narration || FALLBACK_NARRATIONS.hub(gameState.player);
    showNarration(narration);
  }
}

// ============ STAT ALLOCATION (CHARACTER CREATION) ============

// Calculate cost to raise a stat from X to X+1 (iRO formula)
function getStatPointCost(currentValue) {
  return Math.floor((currentValue - 1) / 10) + 2;
}

// Calculate derived stats for preview - SIMPLIFIED
// Only returns attack and hp (no complex stat formulas)
function calculateDerivedPreview(stats, level = 1) {
  // SIMPLIFIED: Fixed values, no stat-based calculations
  return {
    atk: 15,
    def: 0,
    matk: 0,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    hp: 100,
    sp: 50
  };
}

// Open character creation modal and initialize stats display
function openCreateCharModal() {
  createCharModal.classList.remove('hidden');
  updateCreateStatDisplay();
}

// Update the create character stat display
function updateCreateStatDisplay() {
  // Update stat values
  Object.keys(createStats).forEach(stat => {
    const valueEl = document.getElementById(`create-${stat}`);
    const costEl = document.getElementById(`create-${stat}-cost`);
    if (valueEl) valueEl.textContent = createStats[stat];
    if (costEl) costEl.textContent = `${getStatPointCost(createStats[stat])} pts`;
  });

  // Update stat points remaining
  const pointsEl = document.getElementById('create-stat-points');
  if (pointsEl) pointsEl.textContent = createStatPoints;

  // Update derived stats preview
  const preview = calculateDerivedPreview(createStats);
  document.getElementById('preview-atk').textContent = preview.atk;
  document.getElementById('preview-def').textContent = preview.def;
  document.getElementById('preview-matk').textContent = preview.matk;
  document.getElementById('preview-mdef').textContent = preview.mdef;
  document.getElementById('preview-hit').textContent = preview.hit;
  document.getElementById('preview-flee').textContent = preview.flee;
  document.getElementById('preview-crit').textContent = `${preview.crit}%`;
  document.getElementById('preview-hp').textContent = preview.hp;
  document.getElementById('preview-sp').textContent = preview.sp;

  // Update button states (disable minus at 1, disable plus if not enough points)
  Object.keys(createStats).forEach(stat => {
    const minusBtn = document.querySelector(`.stat-minus[data-stat="${stat}"]`);
    const plusBtn = document.querySelector(`.stat-plus[data-stat="${stat}"]`);
    if (minusBtn) minusBtn.disabled = createStats[stat] <= 1;
    if (plusBtn) plusBtn.disabled = createStatPoints < getStatPointCost(createStats[stat]) || createStats[stat] >= 99;
  });
}

// Handle stat increase
function handleStatIncrease(stat) {
  const cost = getStatPointCost(createStats[stat]);
  if (createStatPoints >= cost && createStats[stat] < 99) {
    createStatPoints -= cost;
    createStats[stat]++;
    updateCreateStatDisplay();
  }
}

// Handle stat decrease
function handleStatDecrease(stat) {
  if (createStats[stat] > 1) {
    createStats[stat]--;
    const refund = getStatPointCost(createStats[stat]); // Cost to go from new value to previous
    createStatPoints += refund;
    updateCreateStatDisplay();
  }
}

// Reset stats to initial values
function resetCreateStats() {
  createStats = { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 };
  createStatPoints = 0;
  updateCreateStatDisplay();
}

async function startNewRun() {
  // Clear narration log for new run
  clearNarrationLog();
  // Reset background tracking for new run
  background.resetBackground();
  // Clear word cache to get fresh due words for this run
  clearWordCache();
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
    showNarration(narration);
    background.updateBackground();
    updateUI();

    // Fetch richer AI narration in background
    fetchAINarration('enterFloor', gameState.run.floor).then(aiNarr => {
      if (aiNarr) showNarration(aiNarr);
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
    showNarration(narration);

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
    showNarration(narration);

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
    hideWordCards();
    enemyDialogueTtsPlaying = true;
  }

  const restoreWordCards = () => {
    if (wasInCombat && realtimeCombatActive) {
      showWordCards();
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
        showWordCards();
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
    showNarration(narration);
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
  hideWordCards();
  closeWordInputModal();
  closeSelfGradeModal();

  await apiForfeitRun();
  gameState.run = null;
  gameState.combat = null;
  // Clear word cache so next run gets fresh due words
  clearWordCache();
  gameState.phase = 'hub';
  showNarration(FALLBACK_NARRATIONS.hub(gameState.player));
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
      appendNarration(narration);

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
    appendNarration(narr);

    if (levelUps.length > 0) {
      await delay(500);
      appendNarration(FALLBACK_NARRATIONS.levelUp(gameState.run?.player));
    }

    await delay(1000);
    showVictoryModal({ ...result, rewards, levelUps });
  } else if (result.type === 'game_victory') {
    appendNarration(FALLBACK_NARRATIONS.gameVictory(gameState.run?.player));
    await delay(1500);
    showGameVictoryModal({ ...result, rewards, levelUps });
  }

  updateUI();
}

async function handlePlayerDefeat(result) {
  const enemy = gameState.combat?.enemy;
  appendNarration(FALLBACK_NARRATIONS.defeat(enemy));
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
function updateVNStage() {
  if (!vnStage) return;

  const phase = gameState.phase;
  const isInDungeon = ['room', 'room_encounter', 'combat', 'trap', 'treasure', 'shrine', 'floor_complete', 'boss', 'post_combat_shop'].includes(phase);
  const isInCombat = phase === 'combat';

  // Show/hide VN stage based on phase
  if (isInDungeon) {
    vnStage.classList.remove('hub-mode');
    gameContent.classList.remove('hub-mode');
    gameContent.classList.add('hidden');
  } else {
    vnStage.classList.add('hub-mode');
    gameContent.classList.add('hub-mode');
    gameContent.classList.remove('hidden');
  }

  // Update player HP/MP bars
  const p = gameState.run?.player || gameState.player;
  if (p) {
    // Ensure valid values with fallbacks
    const hp = p.hp || 0;
    const maxHp = p.maxHp || 100;
    const mp = p.mp || 0;
    const maxMp = p.maxMp || 100;
    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const mpPercent = Math.max(0, Math.min(100, (mp / maxMp) * 100));

    playerNameDisplay.textContent = p.name || 'Hunter';
    playerHpValues.textContent = `${hp}/${maxHp}`;
    playerHpFill.style.width = `${hpPercent}%`;
    playerMpFill.style.width = `${mpPercent}%`;

    // HP color classes
    playerHpFill.classList.remove('low', 'critical');
    if (hpPercent <= 25) {
      playerHpFill.classList.add('critical');
    } else if (hpPercent <= 50) {
      playerHpFill.classList.add('low');
    }

    // Add idle animation to player
    playerSprite.classList.add('idle');
  }

  // Update ward/area indicator
  if (gameState.run) {
    floorDisplay.textContent = `Ward ${gameState.run.floor || 1}`;
    roomDisplay.textContent = `Area ${gameState.run.currentRoom || 0}/${gameState.run.totalRooms || '?'}`;
    floorIndicator.classList.remove('hidden');
  } else {
    floorIndicator.classList.add('hidden');
  }

  // Update enemy visibility and stats
  const enemy = gameState.combat?.enemy;
  if (isInCombat && enemy && enemy.hp > 0) {
    // Auto-start realtime combat if we're in combat phase but combat hasn't started
    // This handles page reloads during combat or debug API setup
    // Skip if enemyDialogueActive - encounter setup will start combat after dialogue
    if (!realtimeCombatActive && !enemyDialogueActive) {
      startRealtimeCombat();
    }

    // Remove defeated class from previous combat and show enemy
    enemySprite.classList.remove('hidden', 'defeated');
    enemyHpBar.classList.remove('hidden');

    const enemyHpPercent = (enemy.hp / enemy.maxHp) * 100;
    enemyNameDisplay.textContent = enemy.name || 'Enemy';
    enemyHpValues.textContent = `${enemy.hp}/${enemy.maxHp}`;
    enemyHpFill.style.width = `${enemyHpPercent}%`;

    // Set enemy sprite image based on enemy ID
    const spriteId = enemy.id || 'enemy';
    const newSpritePath = `assets/sprites/enemies/${spriteId}.png`;
    // Only update src if it changed (avoid flickering)
    if (!enemySpriteImg.src.endsWith(newSpritePath)) {
      enemySpriteImg.onerror = () => {
        // Fallback to generic enemy sprite if specific one not found
        if (!enemySpriteImg.src.endsWith('enemy.png')) {
          enemySpriteImg.src = 'assets/sprites/enemies/enemy.png';
        }
      };
      enemySpriteImg.src = newSpritePath;
      enemySpriteImg.alt = enemy.name || 'Enemy';
    }

    // Add idle animation
    enemySprite.classList.add('idle');
  } else {
    enemySprite.classList.add('hidden');
    enemyHpBar.classList.add('hidden');
  }
}

// Sprite animation helpers
function animatePlayerAttack() {
  playerSprite.classList.remove('idle');
  playerSprite.classList.add('attacking');
  setTimeout(() => {
    playerSprite.classList.remove('attacking');
    playerSprite.classList.add('idle');
  }, 500);
}

function animateEnemyAttack() {
  enemySprite.classList.remove('idle');
  enemySprite.classList.add('attacking');
  setTimeout(() => {
    enemySprite.classList.remove('attacking');
    enemySprite.classList.add('idle');
  }, 500);
}

function animatePlayerHurt() {
  playerSprite.classList.add('hurt');
  setTimeout(() => {
    playerSprite.classList.remove('hurt');
  }, 400);
}

function animateEnemyHurt() {
  enemySprite.classList.add('hurt');
  setTimeout(() => {
    enemySprite.classList.remove('hurt');
  }, 400);
}

// Show critical hit splash effect on enemy
function showCriticalSplash() {
  const enemyArea = document.querySelector('.vn-enemy-area');
  if (!enemyArea) return;

  const splash = document.createElement('div');
  splash.className = 'critical-splash';
  splash.innerHTML = `
    <div class="critical-splash-inner">
      <div class="critical-flash"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-ring"></div>
      <div class="critical-text">CRITICAL!</div>
    </div>
  `;

  enemyArea.appendChild(splash);

  // Remove after animation completes
  setTimeout(() => splash.remove(), 700);
}

function animateEnemyDefeat() {
  enemySprite.classList.remove('idle', 'hurt');
  enemySprite.classList.add('defeated');
}

function showChipEffect(effectName, isPlayer = false, type = 'buff') {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const effectEl = document.createElement('div');
  effectEl.className = `chip-effect ${type}`;
  effectEl.textContent = effectName;

  // Position below the damage number
  effectEl.style.left = `${50 + (Math.random() - 0.5) * 30}%`;
  effectEl.style.top = `${55 + Math.random() * 10}%`;

  targetArea.appendChild(effectEl);
  setTimeout(() => effectEl.remove(), 1500);
}

function showDotDamage(damage, isPlayer = false) {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number dot-damage';
  damageEl.textContent = `-${damage}`;

  // Position offset from regular damage
  damageEl.style.left = `${60 + (Math.random() - 0.5) * 20}%`;
  damageEl.style.top = `${40 + Math.random() * 15}%`;

  targetArea.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1000);
}

function showDamageNumber(damage, isPlayer, isCritical = false, isHeal = false, isMiss = false, outcomeType = null) {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';

  // Handle outcome types: 'miss', 'dodge', 'perfect'
  if (outcomeType) {
    damageEl.classList.add(outcomeType);
    switch (outcomeType) {
      case 'miss':
        damageEl.textContent = 'MISS';
        break;
      case 'dodge':
        damageEl.textContent = 'DODGE';
        break;
      case 'perfect':
        damageEl.textContent = 'PERFECT!';
        break;
    }
  } else if (isMiss) {
    damageEl.classList.add('miss');
    damageEl.textContent = 'MISS';
  } else if (isHeal) {
    damageEl.classList.add('heal');
    damageEl.textContent = `+${damage}`;
  } else {
    if (isCritical) damageEl.classList.add('critical');
    damageEl.textContent = `-${damage}`;

    // Show critical splash effect on enemy (not on player)
    if (isCritical && !isPlayer) {
      showCriticalSplash();
    }
  }

  // Position randomly around the sprite
  damageEl.style.left = `${50 + (Math.random() - 0.5) * 40}%`;
  damageEl.style.top = `${30 + Math.random() * 20}%`;

  targetArea.appendChild(damageEl);

  // Remove after animation
  setTimeout(() => damageEl.remove(), 1000);
}

/**
 * Process and display chip effects from attack result
 */
function displayChipEffects(attackData, isPlayerAttack = true) {
  // On-crit effects (player attacking)
  if (isPlayerAttack && attackData.anyCritical) {
    if (attackData.onCritHeal > 0) {
      setTimeout(() => showChipEffect(`CHIP +${attackData.onCritHeal} HP`, true, 'heal'), 200);
    }
    if (attackData.doubleCritDamage) {
      setTimeout(() => showChipEffect('DOUBLE CRIT!', false, 'special'), 300);
    }
    if (attackData.onCritBuffs?.length > 0) {
      setTimeout(() => showChipEffect('BUFF!', true, 'buff'), 400);
    }
  }

  // On-dodge effects (player dodging enemy attack)
  if (!isPlayerAttack && (attackData.dodge || attackData.perfectDodge)) {
    if (attackData.onDodgeBuffs?.length > 0) {
      setTimeout(() => showChipEffect('SPEED UP!', true, 'buff'), 300);
    }
    if (attackData.onDodgeCounterAttack) {
      setTimeout(() => showChipEffect('COUNTER!', true, 'special'), 400);
    }
  }

  // On-damage effects (player taking damage)
  if (!isPlayerAttack && attackData.damage > 0) {
    if (attackData.onDamageHeal > 0) {
      setTimeout(() => showChipEffect(`CHIP +${attackData.onDamageHeal} HP`, true, 'heal'), 300);
    }
    if (attackData.damageNegated) {
      setTimeout(() => showChipEffect('NEGATED!', true, 'special'), 200);
    }
    if (attackData.chipDamageReduction?.length > 0) {
      setTimeout(() => showChipEffect('REDUCED!', true, 'buff'), 300);
    }
  }

  // On-low-hp effects (player surviving lethal)
  if (!isPlayerAttack) {
    if (attackData.survivedWithOneHp) {
      setTimeout(() => showChipEffect('SURVIVE!', true, 'survive'), 100);
    }
    if (attackData.shieldAbsorbed > 0) {
      setTimeout(() => showChipEffect(`SHIELD -${attackData.shieldAbsorbed}`, true, 'buff'), 200);
    }
  }

  // Chip status effects applied to enemy
  if (isPlayerAttack && attackData.chipEffects?.length > 0) {
    for (let i = 0; i < attackData.chipEffects.length; i++) {
      const effect = attackData.chipEffects[i];
      if (effect.status) {
        setTimeout(() => showChipEffect(effect.status.toUpperCase(), false, 'special'), 400 + i * 150);
      }
    }
  }
}

// ============ REALTIME COMBAT FUNCTIONS ============

function updateEnemyHPBar(hp) {
  const hpFill = document.getElementById('enemy-hp-fill');
  const hpText = document.getElementById('enemy-hp-values');

  if (hpFill) {
    const percent = Math.max(0, (hp.current / hp.max) * 100);
    hpFill.style.width = `${percent}%`;
  }

  if (hpText) {
    hpText.textContent = `${hp.current}/${hp.max}`;
  }
}

function updatePlayerHPBar(hp) {
  const hpFill = document.getElementById('player-hp-fill');
  const hpText = document.getElementById('player-hp-values');

  // Ensure valid values
  const current = hp.current || 0;
  const max = hp.max || 100;
  const percent = Math.max(0, Math.min(100, (current / max) * 100));

  if (hpFill) {
    hpFill.style.width = `${percent}%`;

    // Update HP color classes based on percentage
    hpFill.classList.remove('low', 'critical');
    if (percent <= 25) {
      hpFill.classList.add('critical');
    } else if (percent <= 50) {
      hpFill.classList.add('low');
    }
  }

  if (hpText) {
    hpText.textContent = `${current}/${max}`;
  }

  // Also update the gameState for consistency
  if (gameState.run?.player) {
    gameState.run.player.hp = current;
    gameState.run.player.maxHp = max;
  }
  if (gameState.player) {
    gameState.player.hp = current;
    gameState.player.maxHp = max;
  }
}

function startRealtimeCombat() {
  if (realtimeCombatActive) return;

  realtimeCombatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // Fetch chip loadout for combat display (non-blocking)
  if (!chipLoadoutCache) {
    fetch(`${API_BASE}/api/game/chip-loadout`)
      .then(r => r.json())
      .then(data => {
        chipLoadoutCache = data;
        updateActionPanel(); // Re-render with chips
      })
      .catch(err => console.warn('[Combat] Failed to fetch chip loadout:', err));
  }

  // Update action panel to show combat indicator
  updateActionPanel();

  // Initialize word practice cards
  initCombatWords();

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
  hideWordCards();
  closeWordInputModal();

  // Refresh server cache for all reviewed words (runs in background)
  if (recentlyReviewedVids.length > 0) {
    const vidsToRefresh = [...recentlyReviewedVids];
    recentlyReviewedVids = [];
    const { jpdbApiKey } = settings.getApiKeys();
    fetch(`${API_BASE}/api/game/refresh-word-states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vids: vidsToRefresh, jpdbApiKey })
    }).then(r => r.json()).then(data => {
      console.log(`[WordPractice] Refreshed ${data.updated || 0} word states from JPDB`);
    }).catch(e => console.warn('[WordPractice] Failed to refresh word states:', e));
  }

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
      showNarration(narrationResult.narration);
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
      showNarration('市民解放！');
      showVictoryModal(result);
    } else {
      showNarration('敗北...');
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

// Fetch due words from JPDB API
async function fetchJpdbDueWords() {
  if (jpdbWordsFetching) return jpdbWordsCache;
  if (jpdbWordsCache && jpdbWordsCache.length > 0) return jpdbWordsCache;

  jpdbWordsFetching = true;
  try {
    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/due-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50, jpdbApiKey })
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      jpdbWordsCache = data.words;
      console.log(`[WordPractice] Loaded ${data.words.length} words from JPDB (source: ${data.source})`);
      return jpdbWordsCache;
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch JPDB words:', e);
  } finally {
    jpdbWordsFetching = false;
  }
  return null;
}

// Track recently reviewed vids to prevent them from being fetched again
let recentlyReviewedVids = [];

// Fetch a replacement word after successful review (keeps queue at 30)
async function fetchReplacementWord(justReviewedVid = null) {
  try {
    // Get all current vids in the queue
    const currentVids = [...combatWords, ...availableWords]
      .filter(w => w.vid)
      .map(w => w.vid);

    // Also exclude recently reviewed words (server cache may be stale)
    if (justReviewedVid) {
      recentlyReviewedVids.push(justReviewedVid);
    }
    const allExcludeVids = [...new Set([...currentVids, ...recentlyReviewedVids])];

    if (allExcludeVids.length === 0) return null;

    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/due-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, exclude: allExcludeVids, jpdbApiKey })
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      console.log(`[WordPractice] Fetched replacement word: ${data.words[0].word}`);
      return data.words[0];
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch replacement word:', e);
  }
  return null;
}

// Initialize word cards for combat
async function initCombatWords() {
  // Try to fetch JPDB due words first
  let wordData = await fetchJpdbDueWords();

  // Fallback to hardcoded data if JPDB unavailable
  if (!wordData || wordData.length === 0) {
    console.log('[WordPractice] Using fallback word data');
    wordData = FALLBACK_WORD_DATA;
  }

  const shuffled = shuffleArray([...wordData]);
  combatWords = shuffled.slice(0, 5);
  availableWords = shuffled.slice(5);
  selectedWordIndex = 0;
  renderWordCards();
  showWordCards();
}

// Render word cards to DOM
function renderWordCards() {
  const container = document.getElementById('word-cards');
  if (!container) return;

  if (combatWords.length === 0) {
    container.innerHTML = '<div class="word-card" style="opacity: 0.5;">All words cleared!</div>';
    return;
  }

  container.innerHTML = combatWords.map((w, i) => `
    <div class="word-card ${i === selectedWordIndex ? 'selected' : ''}" data-index="${i}">
      ${w.word}
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index);
      if (!isNaN(idx)) {
        selectedWordIndex = idx;
        renderWordCards();
        openWordInputModal();
      }
    });
  });

  // Prefetch TTS audio for visible words
  prefetchCombatWordAudio();
}

// Show/hide word cards
function showWordCards() {
  document.getElementById('word-cards')?.classList.remove('hidden');
}

function hideWordCards() {
  document.getElementById('word-cards')?.classList.add('hidden');
}

// ============ WORD AUDIO TTS FUNCTIONS ============

// Prefetch audio for all visible combat words
function prefetchCombatWordAudio() {
  if (!tts.isWordAudioEnabled()) return;

  // Prefetch current 5 visible words
  for (const wordData of combatWords) {
    tts.prefetchWord(wordData.word);
  }

  // Also prefetch next few from available pool
  for (let i = 0; i < 3 && i < availableWords.length; i++) {
    tts.prefetchWord(availableWords[i].word);
  }
}

// Keyboard handler for word practice
function handleWordPracticeKeydown(e) {
  // Only during combat
  if (!realtimeCombatActive) return;

  // Don't process if enemy dialogue is active (Enter dismisses dialogue first)
  if (enemyDialogueActive) return;

  const typingModal = document.getElementById('word-input-modal');
  const selfGradeModal = document.getElementById('self-grade-modal');
  const typingOpen = typingModal && !typingModal.classList.contains('hidden');
  const selfGradeOpen = selfGradeModal && !selfGradeModal.classList.contains('hidden');

  if (selfGradeOpen) {
    // Self-grade modal open - arrow keys to navigate, Enter to submit, 1-5 direct submit
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSelfGradeModal();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selfGradeSelectedIndex = Math.max(0, selfGradeSelectedIndex - 1);
      updateSelfGradeSelection();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selfGradeSelectedIndex = Math.min(4, selfGradeSelectedIndex + 1);
      updateSelfGradeSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitSelfGradeReview(selfGradeSelectedIndex + 1); // grades are 1-5
    } else {
      const gradeKey = parseInt(e.key);
      if (gradeKey >= 1 && gradeKey <= 5) {
        e.preventDefault();
        submitSelfGradeReview(gradeKey);
      }
    }
  } else if (typingOpen) {
    // Typing modal open - Enter to submit, Escape to close
    if (e.key === 'Escape') {
      e.preventDefault();
      closeWordInputModal();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      checkWordAnswer();
    }
  } else {
    // Modal closed - handle arrow navigation, Enter to open, R to refresh
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectedWordIndex = Math.max(0, selectedWordIndex - 1);
      renderWordCards();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectedWordIndex = Math.min(combatWords.length - 1, selectedWordIndex + 1);
      renderWordCards();
    } else if (e.key === 'Enter' && combatWords.length > 0) {
      e.preventDefault();
      openWordInputModal();
    } else if (e.key === 'r' || e.key === 'R') {
      // Refresh word cards with new random words from pool (costs 2 HP)
      e.preventDefault();
      refreshWordCards();
      damagePlayerForRefresh(2);
    } else if (e.key === 'f' || e.key === 'F') {
      // Quick fail - mark selected word as failed without typing
      e.preventDefault();
      quickFailWord();
    }
  }
}

// Quick fail the currently selected word (F key shortcut)
function quickFailWord() {
  if (combatWords.length === 0) return;

  const word = combatWords[selectedWordIndex];
  if (!word) return;

  // Get meanings for the reveal modal
  const meanings = word.meanings || (word.definition ? [word.definition] : []);

  // Play audio for the word
  tts.playWord(word.word);

  // Send JPDB review (grade 1 = Nothing/Failed)
  if (word.vid && word.sid) {
    sendJpdbReviewHandler(word.vid, word.sid, 1);
  }

  // Remove the failed word from combatWords
  combatWords.splice(selectedWordIndex, 1);
  selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));

  // Replenish from available pool if possible
  if (availableWords.length > 0) {
    combatWords.push(availableWords.shift());
  }

  // Show definitions reveal and update cards
  showDefinitionsReveal(word.word, meanings, word.reading);
  renderWordCards();

  console.log(`[WordPractice] Quick failed: ${word.word}`);
}

// Refresh word cards with new words from the pool
function refreshWordCards() {
  if (availableWords.length === 0) {
    console.log('[WordPractice] No more words in pool to refresh');
    return;
  }

  // Replace all current words with new ones from the pool
  const newWords = [];
  for (let i = 0; i < 5 && availableWords.length > 0; i++) {
    newWords.push(availableWords.shift());
  }

  // Put old words back in the pool (shuffle them in)
  availableWords.push(...combatWords);
  combatWords = newWords;
  selectedWordIndex = 0;

  renderWordCards();
  console.log(`[WordPractice] Refreshed cards. ${availableWords.length} words remaining in pool`);
}

// Open typing modal for selected word
function openWordInputModal() {
  const word = combatWords[selectedWordIndex];
  if (!word) return;

  if (reviewType === 'self-grade') {
    // Self-grade mode: use definitions-reveal style modal
    openSelfGradeModal(word);
  } else {
    // Typing mode: show input field
    document.getElementById('word-to-define').textContent = word.word;
    document.getElementById('word-feedback').classList.add('hidden');
    document.getElementById('word-input-modal').classList.remove('hidden');
    document.getElementById('word-definition-input').value = '';
    document.getElementById('word-definition-input').focus();
  }
}

// Self-grade modal state
let selfGradeSelectedIndex = 3; // Default to "Okay"

function openSelfGradeModal(word) {
  const modal = document.getElementById('self-grade-modal');
  const wordEl = document.getElementById('self-grade-word');
  const meaningsList = document.getElementById('self-grade-meanings');

  // Set word with furigana if reading is available and different from word
  if (word.reading && word.reading !== word.word) {
    wordEl.innerHTML = `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`;
  } else {
    wordEl.textContent = word.word;
  }

  // Populate meanings (top 5)
  const meanings = word.meanings || [word.definition];
  meaningsList.innerHTML = meanings.slice(0, 5).map(m => `<li>${escapeHtml(m)}</li>`).join('');

  // Reset selection to Okay (most common choice)
  selfGradeSelectedIndex = 3;
  updateSelfGradeSelection();

  // Show modal
  modal.classList.remove('hidden', 'fading');
}

function closeSelfGradeModal() {
  document.getElementById('self-grade-modal').classList.add('hidden');
}

function updateSelfGradeSelection() {
  const buttons = document.querySelectorAll('#self-grade-modal .review-btn');
  buttons.forEach((btn, i) => {
    btn.classList.toggle('selected', i === selfGradeSelectedIndex);
  });
}

// Close modal
function closeWordInputModal() {
  document.getElementById('word-input-modal').classList.add('hidden');
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Normalize meaning for comparison (strip common prefixes)
function normalizeMeaning(meaning) {
  return meaning
    .toLowerCase()
    .replace(/^to\s+/, '')           // Remove "to " prefix
    .replace(/^(a|an|the)\s+/i, '')  // Remove articles
    .replace(/\s*\([^)]*\)/g, '')    // Remove parenthetical notes
    .trim();
}

// Send JPDB review and remove word from cache
async function sendJpdbReviewHandler(vid, sid, grade) {
  const result = await apiSendJpdbReview(vid, sid, grade);
  if (!result.error) {
    console.log(`[JPDB] Review sent: vid=${vid}, grade=${grade}`);
    // Remove reviewed word from cache so it won't show up again
    removeWordFromCache(vid);
  } else {
    console.warn('[JPDB] Review failed:', result.error);
  }
}

// Remove a word from all caches by vid
function removeWordFromCache(vid) {
  // Remove from jpdbWordsCache
  if (jpdbWordsCache) {
    const cacheIndex = jpdbWordsCache.findIndex(w => w.vid === vid);
    if (cacheIndex !== -1) {
      jpdbWordsCache.splice(cacheIndex, 1);
      console.log(`[WordPractice] Removed vid=${vid} from cache. ${jpdbWordsCache.length} words remaining in cache.`);
    }
  }
  // Remove from availableWords pool (in case of duplicates)
  const availIndex = availableWords.findIndex(w => w.vid === vid);
  if (availIndex !== -1) {
    availableWords.splice(availIndex, 1);
  }
}

// Clear word cache to force fresh fetch
function clearWordCache() {
  jpdbWordsCache = null;
  jpdbWordsFetching = false;
  recentlyReviewedVids = [];
  console.log('[WordPractice] Cache cleared - will fetch fresh words on next combat');
}

// Multi-tier answer checking
function checkAnswerMatch(input, meanings) {
  // Normalize input the same way we normalize meanings
  const normalized = normalizeMeaning(input.trim().toLowerCase());
  if (!normalized) return { correct: false };

  // Minimum length to prevent single-letter matches
  const MIN_LENGTH_FOR_PARTIAL = 3;

  // Normalize all meanings
  const normalizedMeanings = meanings.map(normalizeMeaning);

  // Tier 1: Exact match (any meaning) - no minimum length
  if (normalizedMeanings.some(m => m === normalized)) {
    return { correct: true, confidence: 'exact' };
  }

  // Tier 2: Contains match (input found in meaning) - requires min length
  if (normalized.length >= MIN_LENGTH_FOR_PARTIAL &&
      normalizedMeanings.some(m => m.includes(normalized))) {
    return { correct: true, confidence: 'partial' };
  }

  // Tier 3: Word match (input matches any word in any meaning)
  const meaningWords = normalizedMeanings.flatMap(m =>
    m.split(/[\s,;]+/).filter(w => w.length > 0)
  );
  if (meaningWords.includes(normalized)) {
    return { correct: true, confidence: 'word' };
  }

  // Tier 4: Fuzzy match - requires min length, stricter for short words
  if (normalized.length >= MIN_LENGTH_FOR_PARTIAL) {
    for (const meaning of normalizedMeanings) {
      // For short meanings (< 6 chars), only allow 1 typo; longer allow 2
      const maxDistance = meaning.length < 6 ? 1 : 2;
      if (levenshteinDistance(normalized, meaning) <= maxDistance) {
        return { correct: true, confidence: 'fuzzy' };
      }
      // Also check each word in the meaning (only allow 1 typo for words)
      for (const word of meaning.split(/[\s,;]+/)) {
        if (word.length >= 4 && levenshteinDistance(normalized, word) <= 1) {
          return { correct: true, confidence: 'fuzzy' };
        }
      }
    }
  }

  return { correct: false };
}

// Check answer
function checkWordAnswer() {
  const input = document.getElementById('word-definition-input').value.trim().toLowerCase();
  const word = combatWords[selectedWordIndex];

  if (!word || input.length === 0) {
    showWordFeedback('Please enter an answer!', 'error');
    return;
  }

  // Support both old format (definition string) and new format (meanings array)
  const meanings = word.meanings || (word.definition ? [word.definition] : []);

  const result = checkAnswerMatch(input, meanings);

  // Play audio for the word (both correct and incorrect)
  tts.playWord(word.word);

  if (result.correct) {
    // Correct!
    showWordFeedback(`Correct!`, 'success');

    // Send JPDB review (grade 4 = Okay)
    if (word.vid && word.sid) {
      sendJpdbReviewHandler(word.vid, word.sid, 4);

      // Remove this word from availableWords pool (in case it was loaded at start)
      availableWords = availableWords.filter(w => w.vid !== word.vid);

      // Fetch a replacement word to keep queue full (runs in background)
      // Pass the just-reviewed vid to exclude it (server cache may be stale)
      fetchReplacementWord(word.vid).then(newWord => {
        if (newWord) {
          availableWords.push(newWord);
        }
      });
    }

    // Replace word with a new one from the pool, or remove if pool is empty
    if (availableWords.length > 0) {
      const newWord = availableWords.shift();
      combatWords[selectedWordIndex] = newWord;
    } else {
      combatWords.splice(selectedWordIndex, 1);
      selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));
    }

    // Close modal, show definitions, and update display after short delay
    setTimeout(() => {
      closeWordInputModal();
      showDefinitionsReveal(word.word, meanings, word.reading);
      renderWordCards();
      // Resume combat after vocab review
      resumeCombatAfterVocab();
    }, 800);
  } else {
    // Wrong - show definitions and close input modal
    showWordFeedback('Incorrect!', 'error');

    // Send JPDB review (grade 1 = Nothing/Failed)
    if (word.vid && word.sid) {
      sendJpdbReviewHandler(word.vid, word.sid, 1);
      // Remove this word from availableWords pool (in case it was loaded at start)
      availableWords = availableWords.filter(w => w.vid !== word.vid);
      // Track this vid to prevent it from being fetched again this session
      recentlyReviewedVids.push(word.vid);

      // Fetch a replacement word to keep queue full
      fetchReplacementWord(word.vid).then(newWord => {
        if (newWord) {
          availableWords.push(newWord);
        }
      });
    }

    // Remove the failed word from the pool entirely (it will come back naturally if due soon)
    combatWords.splice(selectedWordIndex, 1);
    selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));

    // Replenish from available pool if possible
    if (availableWords.length > 0) {
      combatWords.push(availableWords.shift());
    }

    // Close input modal and show definitions reveal
    setTimeout(() => {
      closeWordInputModal();
      showDefinitionsReveal(word.word, meanings, word.reading);
      renderWordCards();
      // Resume combat after vocab review
      resumeCombatAfterVocab();
    }, 300);
  }
}

// Submit self-grade review (grade 1-5)
function submitSelfGradeReview(grade) {
  const word = combatWords[selectedWordIndex];
  if (!word) return;

  const gradeNames = ['', 'Nothing', 'Something', 'Hard', 'Okay', 'Easy'];
  const isPass = grade >= 3; // Hard, Okay, Easy count as pass

  // Close modal immediately
  closeSelfGradeModal();

  // Play audio for the word
  tts.playWord(word.word);

  // Send JPDB review
  if (word.vid && word.sid) {
    sendJpdbReviewHandler(word.vid, word.sid, grade);

    // Remove this word from availableWords pool (in case it was loaded at start)
    availableWords = availableWords.filter(w => w.vid !== word.vid);

    // Track reviewed words to prevent re-fetching
    recentlyReviewedVids.push(word.vid);

    // Fetch replacement word to keep queue full
    fetchReplacementWord(word.vid).then(newWord => {
      if (newWord) {
        availableWords.push(newWord);
      }
    });
  }

  if (isPass) {
    // Pass: replace word
    showToast(`${gradeNames[grade]}!`, 'success');

    if (availableWords.length > 0) {
      combatWords[selectedWordIndex] = availableWords.shift();
    } else {
      combatWords.splice(selectedWordIndex, 1);
      selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));
    }
  } else {
    // Fail: remove word without healing
    showToast(`${gradeNames[grade]}`, 'error');

    combatWords.splice(selectedWordIndex, 1);
    selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));

    if (availableWords.length > 0) {
      combatWords.push(availableWords.shift());
    }
  }

  renderWordCards();

  // Resume combat after vocab review
  resumeCombatAfterVocab();
}

// Show feedback in modal
function showWordFeedback(message, type) {
  const feedback = document.getElementById('word-feedback');
  feedback.textContent = message;
  feedback.className = `word-feedback ${type}`;
  feedback.classList.remove('hidden');
}

// Show definitions reveal modal (auto-fades after 3 seconds)
function showDefinitionsReveal(word, meanings, reading = null) {
  const modal = document.getElementById('definitions-reveal');
  const wordEl = document.getElementById('definitions-word');
  const listEl = document.getElementById('definitions-list');

  if (!modal || !wordEl || !listEl) return;

  // Set the word with furigana if reading is available and different
  if (reading && reading !== word) {
    wordEl.innerHTML = `<ruby>${escapeHtml(word)}<rt>${escapeHtml(reading)}</rt></ruby>`;
  } else {
    wordEl.textContent = word;
  }

  // Show top 5 definitions
  const top5 = meanings.slice(0, 5);
  listEl.innerHTML = top5.map(m => `<li>${escapeHtml(m)}</li>`).join('');

  // Show modal (reset animation)
  modal.classList.remove('fading', 'hidden');

  // Auto-fade after 3 seconds
  setTimeout(() => {
    modal.classList.add('fading');
    // Hide completely after fade animation (0.5s)
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('fading');
    }, 500);
  }, 3000);
}

// Heal player from correct word answer
function healPlayerFromWord(amount) {
  if (!gameState.player && !gameState.run?.player) return;

  const player = gameState.run?.player || gameState.player;
  const maxHp = player.maxHp || 100; // Fallback to 100 if maxHp not set
  const currentHp = player.hp || 0;
  const newHp = Math.min(currentHp + amount, maxHp);

  // Update player state
  player.hp = newHp;

  // Also update top-level player if exists
  if (gameState.player) {
    gameState.player.hp = newHp;
  }

  // Update HP bar with validated values
  updatePlayerHPBar({ current: newHp, max: maxHp });

  // Show heal number
  showDamageNumber(amount, true, false, true); // isPlayer=true, isHeal=true

  // Sync to server (fire and forget)
  fetch(`${API_BASE}/api/game/heal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  }).catch(err => console.warn('Heal sync failed:', err));
}

// Damage player for refreshing word cards (costs HP)
function damagePlayerForRefresh(amount) {
  if (!gameState.player && !gameState.run?.player) return;

  const player = gameState.run?.player || gameState.player;
  const maxHp = player.maxHp || 100; // Fallback to 100 if maxHp not set
  const currentHp = player.hp || 0;
  const newHp = Math.max(1, currentHp - amount); // Don't let refresh kill player

  // Update player state
  player.hp = newHp;

  // Also update top-level player if exists
  if (gameState.player) {
    gameState.player.hp = newHp;
  }

  // Update HP bar with validated values
  updatePlayerHPBar({ current: newHp, max: maxHp });

  // Show damage number
  showDamageNumber(amount, true, false, false); // isPlayer=true, isHeal=false

  // Sync to server (fire and forget)
  fetch(`${API_BASE}/api/game/damage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  }).catch(err => console.warn('Damage sync failed:', err));
}

function updateQuickStats() {
  if (!gameState.player) {
    quickStats.innerHTML = '';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const floorText = gameState.run ? `Ward ${gameState.run.floor}/7` : '';

  // SIMPLIFIED: Just show floor progress
  quickStats.innerHTML = `
    ${floorText ? `<div class="quick-stat"><span class="floor">${floorText}</span></div>` : ''}
  `;
}

function updatePlayerStats() {
  if (!gameState.player) {
    playerStats.innerHTML = '<p class="no-save-msg">No character yet</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const hpPercent = (p.hp / p.maxHp) * 100;

  // SIMPLIFIED: Only show Name, HP, Attack, and Credits
  // No levels, no XP, no 6-stat system, no derived stats

  playerStats.innerHTML = `
    <div class="stat-row">
      <span class="label">Name</span>
      <span class="value">${escapeHtml(p.name)}</span>
    </div>
    <div class="hp-mp-bars">
      <div class="bar-row">
        <div class="bar-label-row">
          <span>HP</span>
          <span class="value hp">${p.hp}/${p.maxHp}</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill hp" style="width: ${hpPercent}%"></div>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="derived-stats">
        <div class="stat-row mini"><span class="label">ATK</span><span class="value">${p.attack ?? 15}</span></div>
      </div>
    </div>
    <div class="stat-row">
      <span class="label">Credits</span>
      <span class="value" style="color: #00ff88">¥${p.gold}</span>
    </div>
  `;
}

function updateEquipment() {
  if (!gameState.player) {
    equipmentList.innerHTML = '<p class="empty-msg">None</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const eq = p.equipment;

  const renderSlot = (slotName, slotKey) => {
    const item = eq[slotKey];
    if (item) {
      const chipsEquipped = item.equippedChips?.length || 0;
      return `
        <div class="equipment-slot equipped">
          <span class="slot-name">${slotName}</span>
          <span class="item-name">${item.name}</span>
          <div class="equipment-actions">
            <button class="modify-btn" onclick="openChipModal('${slotKey}')" title="Modify Chips">
              <span class="chip-count">${chipsEquipped}/5</span> Modify
            </button>
            <button class="unequip-btn" onclick="unequipItem('${slotKey}')" title="Unequip">✕</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="equipment-slot empty">
        <span class="slot-name">${slotName}</span>
        <span class="item-name empty-slot">Empty</span>
      </div>
    `;
  };

  equipmentList.innerHTML = `
    ${renderSlot('Weapon', 'weapon')}
    ${renderSlot('Body', 'body')}
    ${renderSlot('Shield', 'shield')}
    ${renderSlot('Accessory', 'accessory')}
  `;
}

async function equipItem(itemId) {
  try {
    const response = await fetch('/api/game/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Equip failed');
    }

    const result = await response.json();
    if (result.state) {
      updateGameState(result.state); // Keep window reference in sync
    }
    if (result.message) {
      showNarration(result.message);
    }
    // Speak "[item name]を装備" via TTS
    if (result.equipped) {
      tts.speakText(`${result.equipped}を装備`);
    }
    updateUI();
  } catch (error) {
    console.error('Equip error:', error);
    showNarration(`装備に失敗: ${error.message}`);
  }
}

async function unequipItemHandler(slot) {
  const result = await apiUnequipItem(slot);
  if (result.error) {
    console.error('Unequip error:', result.error);
    showNarration(`装備解除に失敗: ${result.error}`);
    return;
  }
  if (result.state) {
    updateGameState(result.state);
  }
  if (result.message) {
    showNarration(result.message);
  }
  updateUI();
}

window.equipItem = equipItem;
window.unequipItem = unequipItemHandler;

function updateInventory() {
  if (!gameState.player) {
    inventoryList.innerHTML = '<p class="empty-msg">Empty</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  let html = '';

  // Check if in combat (can't equip during combat)
  const inCombat = gameState.phase === 'combat';

  // Show chips section if player has any
  if (p.chips && p.chips.length > 0) {
    const categoryNames = {
      stat: 'ステータス',
      onHit: 'オンヒット',
      onEffect: 'オンエフェクト',
      counter: 'カウンター'
    };

    html += '<div class="inventory-section"><h4>チップ (Chips)</h4>';
    html += p.chips.map(chip => {
      const rarityClass = chip.rarity ? `rarity-${chip.rarity}` : '';
      const categoryBadge = categoryNames[chip.category] || '';
      return `
        <div class="inventory-item chip-item ${rarityClass}" title="${formatItemStats(chip)}">
          <span class="chip-category">[${categoryBadge}]</span>
          <span class="item-name">${chip.name}</span>
        </div>
      `;
    }).join('');
    html += '</div>';
  }

  // Show items section
  if (p.items && p.items.length > 0) {
    html += '<div class="inventory-section"><h4>アイテム (Items)</h4>';
    html += p.items.map(item => {
      const isEquipment = item.slot; // Equipment items have a slot property
      const equipClass = isEquipment && !inCombat ? 'equippable' : '';
      const rarityClass = item.rarity ? `rarity-${item.rarity}` : '';
      return `
        <div class="inventory-item ${equipClass} ${rarityClass}" ${isEquipment ? `data-item-id="${item.id}"` : ''}>
          <span class="item-name">${item.name || item.id}</span>
          <span class="item-qty">x${item.quantity}</span>
        </div>
      `;
    }).join('');
    html += '</div>';
  }

  if (!html) {
    html = '<p class="empty-msg">Empty</p>';
  }

  inventoryList.innerHTML = html;

  // Add click handlers for equippable items
  inventoryList.querySelectorAll('.equippable').forEach(el => {
    el.addEventListener('click', async () => {
      const itemId = el.dataset.itemId;
      await equipItem(itemId);
    });
  });
}

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
  const shouldBlock = isNarrationWaiting && narrationQueue.length > 0;
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
function showNoSaveContent() {
  gameContent.innerHTML = `
    <div class="content-center">
      <div class="welcome-icon">&#x2694;</div>
      <h2>NEO TOKYO: System Liberation</h2>
      <p>Create your hunter to begin the journey into darkness.</p>
    </div>
  `;
  showNarration(FALLBACK_NARRATIONS.welcome);
}

function showHubContent() {
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

async function showWardSelectionContent() {
  // Determine if this is starting ward or next ward selection
  const isNextWard = gameState.run?.currentWard != null;
  const currentWard = gameState.run?.currentWard;
  const currentFloor = gameState.run?.floor || 1;

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

async function selectWard(wardId, isNextWard = false) {
  const result = isNextWard
    ? await apiSelectNextWard(wardId)
    : await apiSelectStartingWard(wardId);

  if (result.error) {
    showNarration(`選択失敗: ${result.error}`);
    return;
  }

  if (result.state) {
    updateGameState(result.state);
  }

  updateUI();
}

window.selectWard = selectWard;

// Update ward card selection visuals
function updateWardSelection(wardCards) {
  wardCards.forEach((card, i) => {
    card.classList.toggle('selected', i === selectedWardIndex);
  });
}

function showExploringContent() {
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
function showRoomContent() {
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

function showRoomActions() {
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
    } else if (action.id === 'ignore_body' || action.id === 'ignore_treasure') {
      btnClass = 'muted';  // Safe but no reward
    } else if (action.id === 'loot' || action.id === 'open') {
      btnClass = 'warning';  // Risky but rewarding
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

function getRoomIcon(type) {
  const icons = {
    empty: '🚪',
    encounter: '⚔️',
    trap: '⚠️',
    body: '💀',
    treasure: '📦',
    shrine: '⛩️',
    merchant: '🛒',
    blacksmith: '🔨',
    boss: '👹'
  };
  return icons[type] || '❓';
}

function getRoomTypeName(type) {
  const names = {
    empty: '何もない部屋',
    encounter: '敵がいる！',
    trap: '罠がある...',
    body: '冒険者の遺体',
    treasure: '宝箱！',
    shrine: '神秘的な祠',
    merchant: '商人',
    blacksmith: '鍛冶屋',
    boss: 'ボスの間'
  };
  return names[type] || '不明な部屋';
}

async function handleRoomAction(actionId) {
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
    case 'disarm':
      await disarmTrap();
      break;
    case 'trigger':
      await triggerTrap();
      break;
    case 'loot':
      await lootBody();
      break;
    case 'ignore_body':
      await skipBody();
      break;
    case 'open':
      await openTreasure();
      break;
    case 'ignore_treasure':
      await skipTreasure();
      break;
    case 'pray':
      await useShrine();
      break;
    case 'shop':
      await openShop();
      break;
    case 'refine':
      await openBlacksmith();
      break;
    case 'upgrade':
      await openChipUpgradeModal();
      break;
    default:
      console.warn('Unknown room action:', actionId);
  }
}

async function proceedToNextRoom() {
  console.log('proceedToNextRoom called');
  const result = await apiProceed();
  console.log('proceedToNextRoom result:', result ? 'success' : 'null');
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration || '次の部屋に入った。');
    background.updateBackground();
    updateUI();
    triggerJpdbParse();
  }
}

async function startRoomEncounter() {
  const result = await apiRoomEncounter();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    const enemy = result.enemy || gameState.combat?.enemy;
    showNarration(result.narration || FALLBACK_NARRATIONS.combatStart(enemy));
    updateUI();
    triggerJpdbParse();
  }
}

async function disarmTrap() {
  const result = await apiDisarmTrap();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();

    // Check for defeat
    if (result.type === 'defeat') {
      await handlePlayerDefeat(result);
    }
  }
}

async function triggerTrap() {
  const result = await apiTriggerTrap();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();

    // Check for defeat
    if (result.type === 'defeat') {
      await handlePlayerDefeat(result);
    }
  }
}

async function lootBody() {
  const result = await apiLootBody();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();

    // Check for defeat from trapped body
    if (result.type === 'defeat') {
      await handlePlayerDefeat(result);
    }
  }
}

async function skipBody() {
  const result = await apiSkipBody();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();
  }
}

async function skipTreasure() {
  const result = await apiSkipTreasure();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();
  }
}

async function openTreasure() {
  const result = await apiOpenTreasure();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();

    // Check for defeat from trapped chest
    if (result.type === 'defeat') {
      await handlePlayerDefeat(result);
    }
  }
}

async function useShrine() {
  const result = await apiUseShrine();
  if (result) {
    // Update local state from server response
    if (result.state) {
      updateGameState(result.state);
    }
    showNarration(result.narration);
    updateUI();
    triggerJpdbParse();
  }
}

// ============ SHOP FUNCTIONS ============

let shopInventory = [];

// Format item stats for display in Japanese
function formatItemStats(item) {
  const stats = [];

  // Chip category display
  if (item.type === 'chip' || item.category) {
    const categoryNames = {
      stat: 'ステータス',
      onHit: 'オンヒット',
      onEffect: 'オンエフェクト',
      counter: 'カウンター'
    };
    if (item.category && categoryNames[item.category]) {
      stats.push(`[${categoryNames[item.category]}]`);
    }

    // Handle chip effects
    if (item.effects) {
      // STAT chips
      if (item.effects.stats) {
        const statNames = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK' };
        for (const [stat, value] of Object.entries(item.effects.stats)) {
          if (value && statNames[stat]) {
            stats.push(`${statNames[stat]}+${value}`);
          }
        }
      }

      // ON_HIT chips
      if (item.effects.onHit) {
        const effect = item.effects.onHit;
        const statusNames = {
          defrag: 'デフラグ', lag: 'ラグ', bufferOverflow: 'バッファオーバーフロー',
          corrupted: '破損', exposed: '露出', overheated: 'オーバーヒート'
        };
        const statusName = statusNames[effect.status] || effect.status;
        stats.push(`${Math.round(effect.chance * 100)}%${statusName}(${effect.duration}秒)`);
        if (effect.bonusDamage) stats.push(`+${effect.bonusDamage}ダメージ`);
      }

      // ON_EFFECT chips (onKill, onDamage, onDodge, onCrit, onHeal, onLowHp, onRoomEnter, onStatusInflict)
      if (item.effects.onKill) {
        const effect = item.effects.onKill;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.aspdBoost) effectParts.push(`攻速+${Math.round(effect.aspdBoost * 100)}%`);
        if (effect.doubleCredits) effectParts.push('2x金');
        if (effect.aoeExplosion) effectParts.push('爆発');
        if (effectParts.length > 0) {
          stats.push(`撃破時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onDamage) {
        const effect = item.effects.onDamage;
        if (effect.damageReduction) {
          stats.push(`被弾時${Math.round(effect.chance * 100)}%:${Math.round(effect.damageReduction * 100)}%軽減`);
        }
        if (effect.heal) {
          stats.push(`被弾時${Math.round(effect.chance * 100)}%:HP+${effect.heal}`);
        }
      }
      if (item.effects.onDodge) {
        const effect = item.effects.onDodge;
        const effectParts = [];
        if (effect.buff === 'speed') effectParts.push(`加速+${Math.round(effect.value * 100)}%`);
        if (effect.counterAttack) effectParts.push('反撃');
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effectParts.length > 0) {
          stats.push(`回避時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onCrit) {
        const effect = item.effects.onCrit;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.healPercent) effectParts.push(`HP+${Math.round(effect.healPercent * 100)}%`);
        if (effect.bonusDamage) effectParts.push(`+${effect.bonusDamage}ダメ`);
        if (effect.damageBonus) effectParts.push(`ダメ+${Math.round(effect.damageBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`クリ時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onHeal) {
        const effect = item.effects.onHeal;
        const effectParts = [];
        if (effect.bonusHeal) effectParts.push(`+${effect.bonusHeal}回復`);
        if (effect.healBonus) effectParts.push(`回復+${Math.round(effect.healBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`回復時:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onLowHp) {
        const effect = item.effects.onLowHp;
        const effectParts = [];
        if (effect.damageBonus) effectParts.push(`ダメ+${Math.round(effect.damageBonus * 100)}%`);
        if (effect.defenseBonus) effectParts.push(`防御+${Math.round(effect.defenseBonus * 100)}%`);
        if (effectParts.length > 0) {
          const threshold = effect.threshold ? Math.round(effect.threshold * 100) : 30;
          stats.push(`HP${threshold}%以下:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onRoomEnter) {
        const effect = item.effects.onRoomEnter;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.goldBonus) effectParts.push(`金+${Math.round(effect.goldBonus * 100)}%`);
        if (effect.xpBonus) effectParts.push(`経験+${Math.round(effect.xpBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`部屋移動時:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onStatusInflict) {
        const effect = item.effects.onStatusInflict;
        const effectParts = [];
        if (effect.bonusDamage) effectParts.push(`+${effect.bonusDamage}ダメ`);
        if (effect.extendDuration) effectParts.push(`時間+${effect.extendDuration}`);
        if (effectParts.length > 0) {
          stats.push(`状態異常付与時:${effectParts.join(',')}`);
        }
      }

      // COUNTER chips
      if (item.effects.counter) {
        const counter = item.effects.counter;
        const triggerNames = {
          onKill: '撃破', onCrit: 'クリティカル', onRoomEnter: '部屋移動',
          onStatusInflict: '状態異常', onChipCount: 'チップ数'
        };
        const bonusNames = {
          damagePercent: 'ダメージ', statusDuration: '状態時間',
          critDamage: 'クリダメ', aspd: '攻速', allStats: '全能力'
        };
        const triggerName = triggerNames[counter.trigger] || counter.trigger;
        const bonusName = bonusNames[counter.bonus] || counter.bonus;
        stats.push(`${triggerName}毎+${counter.perStack}%${bonusName}(最大${counter.maxStacks})`);
      }
    }

    return stats.join(' ');
  }

  // Slot type (for equipment)
  const slotNames = { weapon: '武器', body: '体', shield: '盾', accessory: 'アクセ' };
  if (item.slot) {
    stats.push(`[${slotNames[item.slot] || item.slot}]`);
  }

  // Primary combat stats
  if (item.atk) stats.push(`攻撃+${item.atk}`);
  if (item.def) stats.push(`防御+${item.def}`);
  if (item.matk) stats.push(`魔攻+${item.matk}`);
  if (item.mdef) stats.push(`魔防+${item.mdef}`);
  if (item.hit) stats.push(`命中+${item.hit}`);
  if (item.flee) stats.push(`回避+${item.flee}`);
  if (item.crit) stats.push(`会心+${item.crit}`);

  // Base stats
  if (item.str) stats.push(`STR+${item.str}`);
  if (item.agi) stats.push(`AGI+${item.agi}`);
  if (item.vit) stats.push(`VIT+${item.vit}`);
  if (item.int) stats.push(`INT+${item.int}`);
  if (item.dex) stats.push(`DEX+${item.dex}`);
  if (item.luk) stats.push(`LUK+${item.luk}`);

  // Special effects
  if (item.doubleStrike) stats.push(`二連撃${item.doubleStrike}%`);
  if (item.armorPen) stats.push(`貫通${Math.round(item.armorPen * 100)}%`);
  if (item.onKillHp) stats.push(`撃破HP+${item.onKillHp}`);
  if (item.onKillSp) stats.push(`撃破SP+${item.onKillSp}`);
  if (item.healingBonus) stats.push(`回復+${Math.round(item.healingBonus * 100)}%`);
  if (item.goldFind) stats.push(`金運+${Math.round(item.goldFind * 100)}%`);
  if (item.statusInflict) stats.push(`${item.statusInflict.status}付与${item.statusInflict.chance}%`);
  if (item.setId) stats.push(`【${item.setId}】`);

  return stats.join(' ');
}

async function openShop() {
  try {
    const response = await fetch('/api/game/shop');
    if (!response.ok) {
      throw new Error('Failed to load shop');
    }
    const data = await response.json();
    shopInventory = data.inventory;

    const shopModal = document.getElementById('shop-modal');
    const shopGold = document.getElementById('shop-player-gold');
    const shopItems = document.getElementById('shop-items');

    // Reset to normal merchant mode
    const shopTitle = document.getElementById('shop-title');
    const shopGreeting = document.getElementById('shop-greeting');
    const closeBtn = document.getElementById('shop-close-btn');
    const skipBtn = document.getElementById('shop-skip-btn');
    const closeX = document.getElementById('close-shop');
    if (shopTitle) shopTitle.textContent = 'Merchant';
    if (shopGreeting) shopGreeting.textContent = '「いらっしゃい、冒険者よ。何が欲しい？」';
    if (closeBtn) closeBtn.classList.remove('hidden');
    if (skipBtn) skipBtn.classList.add('hidden');
    if (closeX) closeX.classList.remove('hidden');

    // Update gold display
    shopGold.textContent = data.playerGold;

    // Render items
    if (shopInventory.length === 0) {
      shopItems.innerHTML = '<p class="shop-empty">「もう売り切れだ」</p>';
    } else {
      shopItems.innerHTML = shopInventory.map(item => {
        const canAfford = data.playerGold >= item.price;
        const outOfStock = item.quantity <= 0;
        let itemClass = `shop-item rarity-${item.rarity || 'common'}`;
        if (outOfStock) itemClass += ' out-of-stock';
        else if (!canAfford) itemClass += ' cannot-afford';

        // Build stats string in Japanese
        const statsStr = formatItemStats(item);

        const rarityLabel = {
          common: 'コモン - 効果1.0x',
          uncommon: 'アンコモン - 効果1.5x',
          rare: 'レア - 効果2.0x',
          epic: 'エピック - 効果2.5x',
          legendary: 'レジェンド - 効果3.0x'
        }[item.rarity] || '';

        const iconId = item.baseId || item.itemId.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
        return `
          <div class="${itemClass}" data-item-id="${item.itemId}">
            <img class="shop-item-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
            <div class="shop-item-info">
              <div class="shop-item-name">
                ${item.name}
                ${rarityLabel ? `<span class="shop-item-rarity rarity-${item.rarity}">[${rarityLabel}]</span>` : ''}
              </div>
              <div class="shop-item-desc">${item.description}</div>
              ${statsStr ? `<div class="shop-item-stats">${statsStr}</div>` : ''}
            </div>
            <div class="shop-item-meta">
              <span class="shop-item-stock">x${item.quantity}</span>
              <span class="shop-item-price">¥${item.price}</span>
              <button class="shop-item-buy"
                      onclick="buyItem('${item.itemId}')"
                      ${!canAfford || outOfStock ? 'disabled' : ''}>
                Buy
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    shopModal.classList.remove('hidden');
  } catch (error) {
    console.error('Shop error:', error);
    showNarration('商人との取引に失敗した。');
  }
}

async function buyItem(itemId) {
  try {
    const response = await fetch('/api/game/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity: 1 })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Purchase failed');
    }

    const result = await response.json();

    // Update game state
    if (result.state) {
      updateGameState(result.state); // Keep window reference in sync
    }

    // Show narration
    if (result.narration) {
      showNarration(result.narration);
      triggerJpdbParse();
    }

    // Refresh shop display
    await openShop();
    updateUI();
  } catch (error) {
    console.error('Buy error:', error);
    showNarration(`購入に失敗した: ${error.message}`);
  }
}

function closeShop() {
  document.getElementById('shop-modal').classList.add('hidden');
}

// Make buyItem available globally for onclick
window.buyItem = buyItem;

// ============ BLACKSMITH FUNCTIONS ============

async function openBlacksmith() {
  try {
    const data = await apiGetRefinePreview();
    if (data.error) {
      throw new Error(data.error);
    }

    const blacksmithModal = document.getElementById('blacksmith-modal');
    const blacksmithGold = document.getElementById('blacksmith-player-gold');
    const blacksmithItems = document.getElementById('blacksmith-items');

    // Update gold display
    blacksmithGold.textContent = data.playerGold;

    // Render equipment items for refinement
    const previews = data.previews || {};
    const slots = ['weapon', 'body', 'shield', 'accessory'];
    const slotNames = { weapon: '武器', body: '体', shield: '盾', accessory: 'アクセサリー' };

    if (Object.keys(previews).length === 0) {
      blacksmithItems.innerHTML = '<p class="blacksmith-empty">「装備がないな...何も鍛えられない」</p>';
    } else {
      blacksmithItems.innerHTML = slots.map(slot => {
        const preview = previews[slot];
        if (!preview) return '';

        const canAfford = data.playerGold >= (preview.cost || 0);
        const isMaxed = preview.maxed;
        const breakChance = preview.breakChance || 0;
        const isRisky = breakChance > 0;

        let itemClass = 'blacksmith-item';
        if (isMaxed) itemClass += ' maxed';
        else if (!canAfford) itemClass += ' cannot-afford';

        const currentLevel = preview.currentLevel || 0;
        const displayName = currentLevel > 0 ? `${preview.itemName} +${currentLevel}` : preview.itemName;

        if (isMaxed) {
          return `
            <div class="${itemClass}">
              <div class="blacksmith-item-info">
                <div class="blacksmith-slot-name">${slotNames[slot]}</div>
                <div class="blacksmith-item-name">${displayName}</div>
                <div class="blacksmith-item-status">MAX +10</div>
              </div>
            </div>
          `;
        }

        return `
          <div class="${itemClass}" data-slot="${slot}">
            <div class="blacksmith-item-info">
              <div class="blacksmith-slot-name">${slotNames[slot]}</div>
              <div class="blacksmith-item-name">${displayName} → +${preview.targetLevel}</div>
              <div class="blacksmith-item-meta">
                <span class="blacksmith-cost">${preview.cost}G</span>
                ${isRisky ? `<span class="blacksmith-risk ${breakChance >= 30 ? 'high-risk' : ''}">${breakChance}% 破壊</span>` : '<span class="blacksmith-safe">安全</span>'}
                ${preview.indestructible ? '<span class="blacksmith-protected">破壊不可</span>' : ''}
              </div>
            </div>
            <button class="blacksmith-refine-btn"
                    onclick="refineItem('${slot}')"
                    ${!canAfford ? 'disabled' : ''}>
              ${isRisky ? '精錬!' : '精錬'}
            </button>
          </div>
        `;
      }).join('');
    }

    blacksmithModal.classList.remove('hidden');
  } catch (error) {
    console.error('Blacksmith error:', error);
    showNarration('鍛冶屋との会話に失敗した。');
  }
}

async function refineItemHandler(slot) {
  try {
    // Close modal during refinement
    closeBlacksmith();

    const result = await apiRefineItem(slot);
    if (result.error) {
      throw new Error(result.error);
    }

    // Update game state
    if (result.state) {
      updateGameState(result.state); // Keep window reference in sync
    }

    // Show narration
    if (result.narration) {
      showNarration(result.narration);
      triggerJpdbParse();
    }

    updateUI();

    // Reopen blacksmith after a delay
    await delay(500);
    await openBlacksmith();
  } catch (error) {
    console.error('Refine error:', error);
    showNarration(`精錬に失敗した: ${error.message}`);
  }
}

function closeBlacksmith() {
  document.getElementById('blacksmith-modal').classList.add('hidden');
}

// Make refineItem available globally for onclick
window.refineItem = refineItemHandler;

// ============ CHIP UPGRADE (MODDER) FUNCTIONS ============

const RARITY_NAMES = {
  common: 'ノーマル',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー'
};

async function openChipUpgradeModal() {
  console.log('[openChipUpgradeModal] Called');
  try {
    console.log('[openChipUpgradeModal] Fetching preview...');
    const response = await fetch(`${API_BASE}/api/game/chip-upgrade-preview`);
    console.log('[openChipUpgradeModal] Response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[openChipUpgradeModal] Error response:', errorData);
      throw new Error(errorData.error || 'Failed to load chip upgrade preview');
    }
    const data = await response.json();
    console.log('[openChipUpgradeModal] Data:', data);

    const modal = document.getElementById('chip-upgrade-modal');
    const goldDisplay = document.getElementById('chip-upgrade-gold');
    const greetingDisplay = document.getElementById('chip-upgrade-greeting');
    const itemsContainer = document.getElementById('chip-upgrade-items');

    // Update gold display
    goldDisplay.textContent = data.playerGold;

    // Show greeting
    if (greetingDisplay && data.greeting) {
      greetingDisplay.textContent = data.greeting;
    }

    // Render chips
    const chips = data.chips || [];
    if (chips.length === 0) {
      itemsContainer.innerHTML = '<p class="chip-upgrade-empty">「強化できるチップがないな...」</p>';
    } else {
      itemsContainer.innerHTML = chips.map(chip => {
        const canAfford = data.playerGold >= chip.upgradeCost;
        const failurePercent = Math.round(chip.failureChance * 100);

        // Determine risk level for styling
        let riskClass = 'low';
        if (failurePercent >= 20) riskClass = 'high';
        else if (failurePercent >= 10) riskClass = 'medium';

        // Get icon path (strip rarity suffix for icon lookup)
        const baseId = chip.baseId || chip.id.split('_')[0];
        const iconPath = `/assets/icons/chips/${baseId}.png`;

        const chipName = chip.name || chip.nameEn || baseId;
        const currentRarityName = RARITY_NAMES[chip.rarity] || chip.rarity;
        const nextRarityName = RARITY_NAMES[chip.nextRarity] || chip.nextRarity;

        return `
          <div class="chip-upgrade-item rarity-${chip.rarity} ${!canAfford ? 'cannot-afford' : ''}" data-chip-id="${chip.id}">
            <img class="chip-upgrade-item-icon" src="${iconPath}" alt="${chipName}" onerror="this.src='/assets/icons/chips/default.png'">
            <div class="chip-upgrade-item-info">
              <div class="chip-upgrade-item-name">${chipName}</div>
              <div class="chip-upgrade-item-rarity">
                <span class="chip-upgrade-rarity-current rarity-${chip.rarity}">${currentRarityName}</span>
                <span class="chip-upgrade-rarity-arrow">→</span>
                <span class="chip-upgrade-rarity-next rarity-${chip.nextRarity}">${nextRarityName}</span>
              </div>
            </div>
            <div class="chip-upgrade-item-meta">
              <span class="chip-upgrade-cost">${chip.upgradeCost}G</span>
              <span class="chip-upgrade-risk ${riskClass}">${failurePercent}% 失敗</span>
              <button class="chip-upgrade-btn"
                      onclick="performChipUpgrade('${chip.id}')"
                      ${!canAfford ? 'disabled' : ''}>
                強化
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    console.log('[openChipUpgradeModal] Modal opened successfully');

    // Update game state if provided
    if (data.state) {
      updateGameState(data.state);
    }
  } catch (error) {
    console.error('[openChipUpgradeModal] Error:', error);
    showNarration('改造屋との会話に失敗した。');
  }
}

async function performChipUpgrade(chipId) {
  try {
    // Close modal during upgrade
    closeChipUpgradeModal();

    const response = await fetch(`${API_BASE}/api/game/chip-upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Upgrade failed');
    }

    const result = await response.json();

    // Update game state
    if (result.state) {
      updateGameState(result.state);
    }

    // Show result narration
    if (result.message) {
      showNarration(result.message);
      triggerJpdbParse();
    }

    updateUI();
  } catch (error) {
    console.error('Chip upgrade error:', error);
    showNarration(`強化に失敗した: ${error.message}`);
    updateUI();
  }
}

function closeChipUpgradeModal() {
  document.getElementById('chip-upgrade-modal').classList.add('hidden');
}

// Make chip upgrade functions available globally
window.performChipUpgrade = performChipUpgrade;
window.closeChipUpgradeModal = closeChipUpgradeModal;

function showBossReadyContent() {
  const run = gameState.run;
  if (!run) return;

  gameContent.innerHTML = `
    <div class="floor-display boss-ready">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="floor-status boss-status">BOSS AHEAD</span>
      </div>
      <div class="boss-warning">
        <span class="skull-icon">&#x1F480;</span>
        <p>The floor guardian awaits...</p>
      </div>
    </div>
  `;
}

function showFloorCompleteContent() {
  const run = gameState.run;
  if (!run) return;

  const isComplete = run.floor >= 7;

  gameContent.innerHTML = `
    <div class="floor-display floor-complete">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="floor-status complete-status">${isComplete ? 'DUNGEON CLEARED!' : 'CLEARED!'}</span>
      </div>
      <div class="complete-message">
        <span class="victory-icon">${isComplete ? '&#x1F451;' : '&#x2B06;'}</span>
        <p>${isComplete ? 'You have conquered the Shadow Gate!' : 'A stairway descends into darkness...'}</p>
      </div>
    </div>
  `;
}

function showPostCombatShopContent() {
  const run = gameState.run;
  if (!run || !run.postCombatShop) return;

  const shop = run.postCombatShop;
  const player = run.player || gameState.player;
  const gold = player?.gold || 0;
  const isStartingChips = shop.isStartingChips;

  // Update title and greeting
  const shopTitle = document.getElementById('shop-title');
  const shopGreeting = document.getElementById('shop-greeting');
  if (isStartingChips) {
    if (shopTitle) shopTitle.textContent = 'チップを選択';
    if (shopGreeting) shopGreeting.textContent = '「冒険の始まりに、一つチップをあげよう。選びな」';
  } else {
    if (shopTitle) shopTitle.textContent = '商人が現れた！';
    if (shopGreeting) shopGreeting.textContent = '「戦いの後はいい買い物日和だな。一つだけ選びな」';
  }

  // Update gold display
  const goldDisplay = document.getElementById('shop-player-gold');
  if (goldDisplay) goldDisplay.textContent = gold;

  // Show skip and refresh buttons, hide close button for post-combat shop
  const closeBtn = document.getElementById('shop-close-btn');
  const skipBtn = document.getElementById('shop-skip-btn');
  const refreshBtn = document.getElementById('shop-refresh-btn');
  const closeX = document.getElementById('close-shop');
  if (closeBtn) closeBtn.classList.add('hidden');
  if (skipBtn) skipBtn.classList.remove('hidden');
  if (refreshBtn) refreshBtn.classList.remove('hidden');
  if (closeX) closeX.classList.add('hidden');

  // Generate shop items HTML using same format as regular shop
  const shopItemsContainer = document.getElementById('shop-items');
  if (shopItemsContainer) {
    const itemsHtml = shop.items.map((item, index) => {
      const canAfford = isStartingChips || gold >= item.price;
      let itemClass = `shop-item rarity-${item.rarity || 'common'}`;
      if (!canAfford) itemClass += ' cannot-afford';

      // Build stats string
      const statsStr = formatItemStats(item);

      const rarityLabel = {
        common: 'コモン - 効果1.0x',
        uncommon: 'アンコモン - 効果1.5x',
        rare: 'レア - 効果2.0x',
        epic: 'エピック - 効果2.5x',
        legendary: 'レジェンド - 効果3.0x'
      }[item.rarity] || '';

      const iconId = item.baseId || item.itemId.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      const priceDisplay = isStartingChips ? 'FREE' : `¥${item.price}`;
      const buyAction = isStartingChips ? `claimStartingChip(${index})` : `buyFromShop(${index})`;
      const buyLabel = isStartingChips ? '選択' : 'Buy';

      return `
        <div class="${itemClass}" data-item-index="${index}" onclick="selectShopItem(${index})">
          <img class="shop-item-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <div class="shop-item-info">
            <div class="shop-item-name">
              ${item.name}
              ${rarityLabel ? `<span class="shop-item-rarity rarity-${item.rarity}">[${rarityLabel}]</span>` : ''}
            </div>
            <div class="shop-item-desc">${item.description || ''}</div>
            ${statsStr ? `<div class="shop-item-stats">${statsStr}</div>` : ''}
          </div>
          <div class="shop-item-meta">
            <span class="shop-item-price${isStartingChips ? ' free-chip' : ''}">${priceDisplay}</span>
            <button class="shop-item-buy"
                    onclick="event.stopPropagation(); ${buyAction}"
                    ${!canAfford ? 'disabled' : ''}>
              ${buyLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');
    shopItemsContainer.innerHTML = itemsHtml;
  }

  // Reset shop selection and show the modal
  selectedShopIndex = -1;
  if (shopModal) shopModal.classList.remove('hidden');
}

// Claim free starting chip
async function claimStartingChipHandler(itemIndex) {
  const result = await apiClaimStartingChip(itemIndex);
  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Clear the starting chip shop flag
    if (gameState.run) {
      gameState.run.startingChipShop = { active: false };
      gameState.run.postCombatShop = { active: false };
    }
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    showNarration(result.chip?.name ? result.chip.name + 'を獲得した！' : 'チップを獲得！');
  }
}

// Make claimStartingChip globally accessible
window.claimStartingChip = claimStartingChipHandler;

function resetShopModal() {
  // Reset shop selection
  selectedShopIndex = -1;
  // Reset shop modal back to default state
  const shopTitle = document.getElementById('shop-title');
  const shopGreeting = document.getElementById('shop-greeting');
  const closeBtn = document.getElementById('shop-close-btn');
  const skipBtn = document.getElementById('shop-skip-btn');
  const refreshBtn = document.getElementById('shop-refresh-btn');
  const closeX = document.getElementById('close-shop');
  if (shopTitle) shopTitle.textContent = 'Merchant';
  if (shopGreeting) shopGreeting.textContent = '「いらっしゃい、冒険者よ。何が欲しい？」';
  if (closeBtn) closeBtn.classList.remove('hidden');
  if (skipBtn) skipBtn.classList.add('hidden');
  if (refreshBtn) refreshBtn.classList.add('hidden');
  if (closeX) closeX.classList.remove('hidden');
}

async function buyFromShop(itemIndex) {
  // Check if this is a post-combat shop or regular merchant
  const isPostCombatShop = gameState.run?.postCombatShop?.active;
  const result = isPostCombatShop
    ? await apiPostCombatShopBuy(itemIndex)
    : await apiShopBuy(itemIndex);

  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    showNarration(result.item?.name ? result.item.name + 'を購入した！' : '購入完了！');
  }
}

async function skipShop() {
  const result = await apiShopSkip();
  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
  }
}

async function refreshShop() {
  const result = await apiPostCombatShopRefresh();
  if (result) {
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    // Re-render the shop with new items
    showPostCombatShopContent();
    showNarration('商人が新しい品を出してきた！');
  }
}

// Expose shop functions to window for onclick handlers
window.buyFromShop = buyFromShop;
window.skipShop = skipShop;
window.refreshShop = refreshShop;
window.selectShopItem = selectShopItem;

function showRunEndedContent() {
  gameContent.innerHTML = `
    <div class="content-center">
      <h2>Run Ended</h2>
      <p>Return to the guild to recover and try again.</p>
    </div>
  `;
}

// ============ COMBAT UI ============
function showCombatContent() {
  const combat = gameState.combat;
  if (!combat) return;

  const enemy = combat.enemy;
  const player = gameState.run?.player;

  const enemyHpPercent = (enemy.hp / enemy.maxHp) * 100;
  const playerHpPercent = player ? (player.hp / player.maxHp) * 100 : 100;
  const playerMpPercent = player ? (player.mp / player.maxMp) * 100 : 100;

  const isBoss = enemy.isBoss;
  const enemyClass = isBoss ? 'enemy-display boss-enemy' : 'enemy-display';

  gameContent.innerHTML = `
    <div class="combat-view">
      <div class="${enemyClass}">
        <div class="enemy-sprite ${isBoss ? 'boss-sprite' : ''}">${getEnemyEmoji(enemy)}</div>
        <div class="enemy-info">
          <div class="enemy-name">${enemy.name} <span class="enemy-name-en">(${enemy.nameEn})</span></div>
          <div class="enemy-hp-bar">
            <div class="hp-fill" style="width: ${enemyHpPercent}%"></div>
            <span class="hp-text">${enemy.hp}/${enemy.maxHp}</span>
          </div>
        </div>
      </div>

      <div class="combat-divider">
        <span class="vs-text">VS</span>
      </div>

      <div class="player-combat-display">
        <div class="player-bars">
          <div class="bar-group">
            <span class="bar-label">HP</span>
            <div class="hp-bar">
              <div class="hp-fill player-hp" style="width: ${playerHpPercent}%"></div>
              <span class="hp-text">${player?.hp || 0}/${player?.maxHp || 100}</span>
            </div>
          </div>
          <div class="bar-group">
            <span class="bar-label">MP</span>
            <div class="mp-bar">
              <div class="mp-fill" style="width: ${playerMpPercent}%"></div>
              <span class="mp-text">${player?.mp || 0}/${player?.maxMp || 50}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function closeCombatSubmenu() {
  const submenu = document.getElementById('combat-submenu');
  if (submenu) submenu.classList.add('hidden');
}

function getEnemyEmoji(enemy) {
  const emojiMap = {
    'slime': '&#x1F7E2;',
    'goblin': '&#x1F47A;',
    'wolf': '&#x1F43A;',
    'skeleton': '&#x1F480;',
    'orc': '&#x1F479;',
    'mage': '&#x1F9D9;',
    'knight': '&#x2694;',
    'demon': '&#x1F608;',
    'golem': '&#x1FAA8;',
    'shadow': '&#x1F47B;',
    'dragon': '&#x1F409;',
    'boss_goblin_king': '&#x1F451;',
    'boss_wolf_alpha': '&#x1F43A;',
    'boss_lich': '&#x1F9DF;',
    'boss_ogre': '&#x1F479;',
    'boss_demon_lord': '&#x1F608;',
    'boss_dragon_elder': '&#x1F432;',
    'boss_shadow_monarch': '&#x1F👑'
  };

  return emojiMap[enemy.id] || '&#x1F47E;';
}

function disableCombatActions() {
  document.querySelectorAll('.combat-btn').forEach(btn => btn.disabled = true);
}

function enableCombatActions() {
  document.querySelectorAll('.combat-btn').forEach(btn => {
    btn.disabled = false;
  });
}

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

// ============ NARRATION (Visual Novel Style) ============

// Queue a narration message
function queueNarration(text) {
  narrationQueue.push(text);

  // Add to log
  narrationLog.push({
    text,
    timestamp: Date.now(),
    floor: gameState.run?.floor || 0,
    phase: gameState.phase
  });

  // Immediately disable buttons when message is queued
  updateActionButtonsState();

  // Only display immediately if nothing is currently shown
  if (!isNarrationWaiting) {
    displayNextNarration();
  } else {
    // Just update the indicator to show more messages are queued
    updateContinueIndicator();
  }
}

// Display the next narration in queue (replaces current message - VN style)
async function displayNextNarration() {
  if (narrationQueue.length === 0) {
    // No more messages - allow new messages to display immediately
    isNarrationWaiting = false;
    updateContinueIndicator();
    updateActionButtonsState(); // Re-enable buttons when narration is done
    return;
  }

  const text = narrationQueue.shift();

  // Parse and wrap Japanese text for popup dictionary
  const wrappedText = await parseAndWrapText(text);

  // Replace the text (visual novel style - one message at a time)
  narrationText.innerHTML = `<p class="vn-message">${wrappedText}</p>`;

  // Always mark as waiting - user must acknowledge message was displayed
  // This ensures back-to-back messages wait for space between them
  isNarrationWaiting = true;
  updateContinueIndicator();
  updateActionButtonsState();

  // Speak the narration if TTS is enabled
  tts.speakNarration(text);

  // Trigger JPDB extension to parse Japanese text
  triggerJpdbParse();
}

// Update the continue indicator
function updateContinueIndicator() {
  // Show indicator only when there are MORE messages waiting in queue
  // Don't show on the last message - user can take action immediately
  if (isNarrationWaiting && narrationQueue.length > 0) {
    narrationContinue?.classList.remove('hidden');
    narrationPanel.classList.add('waiting-continue');
  } else {
    narrationContinue?.classList.add('hidden');
    narrationPanel.classList.remove('waiting-continue');
  }
}

// Advance to next narration (Space key or click)
function advanceNarration() {
  // Stop any currently playing TTS before advancing
  tts.stop();

  if (narrationQueue.length > 0) {
    // Show next message
    displayNextNarration();
  } else {
    // No more messages - unlock for new messages
    isNarrationWaiting = false;
    updateContinueIndicator();
  }

  // Update action buttons when narration state changes
  updateActionButtonsState();
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
      } else if (e.key === 'Enter' && selectedShopIndex >= 0) {
        e.preventDefault();
        buyFromShop(selectedShopIndex);
        return;
      }
    }
    return; // Don't process other keys while shop is open
  }

  // Ward selection keyboard navigation
  if (gameState.phase === 'ward_selection' && wardSelectionData.length > 0) {
    const wardCards = document.querySelectorAll('.ward-card');
    if (wardCards.length > 0) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectedWardIndex = (selectedWardIndex - 1 + wardCards.length) % wardCards.length;
        updateWardSelection(wardCards);
        return;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectedWardIndex = (selectedWardIndex + 1) % wardCards.length;
        updateWardSelection(wardCards);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const ward = wardSelectionData[selectedWardIndex];
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
    if (narrationQueue.length > 0) {
      e.preventDefault();
      advanceNarration();
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

  // Calculate new index
  if (selectedShopIndex < 0) {
    selectedShopIndex = direction > 0 ? 0 : items.length - 1;
  } else {
    selectedShopIndex += direction;
    if (selectedShopIndex < 0) selectedShopIndex = items.length - 1;
    if (selectedShopIndex >= items.length) selectedShopIndex = 0;
  }

  // Add selection to new item and speak the chip name
  const selectedItem = items[selectedShopIndex];
  selectedItem.classList.add('keyboard-selected');
  selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Get chip name and speak it
  const chipName = selectedItem.querySelector('.shop-item-name')?.childNodes[0]?.textContent?.trim();
  if (chipName) {
    tts.speakText(chipName);
  }
}

// Select a shop item by click (also speaks the name)
function selectShopItem(index) {
  const shopItems = shopModal?.querySelectorAll('.shop-item');
  if (!shopItems || index < 0 || index >= shopItems.length) return;

  // Remove selection from all items
  shopItems.forEach(item => item.classList.remove('keyboard-selected'));

  // Select the clicked item
  selectedShopIndex = index;
  shopItems[index].classList.add('keyboard-selected');

  // Speak the chip name
  const chipName = shopItems[index].querySelector('.shop-item-name')?.childNodes[0]?.textContent?.trim();
  if (chipName) {
    tts.speakText(chipName);
  }
}

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

// Show narration - clears queue and displays immediately
function showNarration(text) {
  // Clear any pending messages
  narrationQueue = [];
  isNarrationWaiting = false;

  // Queue and display immediately
  queueNarration(text);

  // Update button states after narration change
  updateActionButtonsState();
}

// Append narration - adds to queue
function appendNarration(text) {
  queueNarration(text);
  updateActionButtonsState();
}

// Clear narration log (call when starting new run)
function clearNarrationLog() {
  narrationLog = [];
  narrationQueue = [];
  isNarrationWaiting = false;
  narrationText.innerHTML = '<p class="vn-message">...</p>';
  updateContinueIndicator();
  updateActionButtonsState(); // Re-enable buttons when narration is cleared
}

// ============ LOG MODAL ============
async function openLogModal() {
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

// ============ CHIP SLOT MODAL ============

let currentChipModalSlot = null;
let chipLoadoutCache = null;

/**
 * Open the chip modification modal for an equipment slot
 */
async function openChipModal(equipmentSlot) {
  currentChipModalSlot = equipmentSlot;

  // Fetch current chip loadout
  try {
    const response = await fetch('/api/game/chip-loadout');
    chipLoadoutCache = await response.json();
  } catch (error) {
    console.error('Failed to fetch chip loadout:', error);
    showNarration('チップ情報の取得に失敗しました');
    return;
  }

  const modal = document.getElementById('chip-modal');
  if (!modal) {
    console.error('Chip modal not found');
    return;
  }

  renderChipModal();
  modal.classList.remove('hidden');
}

/**
 * Close the chip modal
 */
function closeChipModal() {
  const modal = document.getElementById('chip-modal');
  modal?.classList.add('hidden');
  currentChipModalSlot = null;
}

/**
 * Render the chip modal content
 */
function renderChipModal() {
  if (!chipLoadoutCache || !currentChipModalSlot) return;

  const slotData = chipLoadoutCache.equipment[currentChipModalSlot] || {
    equippedChips: [],
    slotsUsed: 0,
    maxSlots: 5
  };
  const inventory = chipLoadoutCache.inventory || [];
  const p = gameState.run?.player || gameState.player;
  const equipmentItem = p?.equipment?.[currentChipModalSlot];

  const slotNames = {
    weapon: 'Weapon',
    body: 'Body',
    shield: 'Shield',
    accessory: 'Accessory'
  };

  // Build slot grid (5 slots)
  let slotsHtml = '';
  for (let i = 0; i < 5; i++) {
    const chip = slotData.equippedChips[i];
    if (chip) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      slotsHtml += `
        <div class="chip-slot filled ${rarityClass}" onclick="removeChipFromSlot('${chip.id}')" title="Click to remove">
          <img class="chip-slot-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <span class="chip-name">${chip.name}</span>
          <span class="chip-category">${getCategoryLabel(chip.category)}</span>
        </div>
      `;
    } else {
      slotsHtml += `
        <div class="chip-slot empty">
          <span class="slot-label">Empty</span>
        </div>
      `;
    }
  }

  // Build inventory chips (equipped chips are filtered out server-side)
  let inventoryHtml = '';
  if (inventory.length === 0) {
    inventoryHtml = '<p class="empty-msg">No chips available. Defeat enemies to collect chips!</p>';
  } else {
    for (const chip of inventory) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const slotCost = chip.rarity === 'legendary' ? 3 : chip.rarity === 'epic' ? 2 : 1;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      inventoryHtml += `
        <div class="inventory-chip ${rarityClass}" onclick="addChipToSlot('${chip.id}')" title="Click to equip">
          <img class="inventory-chip-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <div class="inventory-chip-content">
            <span class="chip-name">${chip.name}</span>
            <span class="chip-info">
              <span class="chip-category">${getCategoryLabel(chip.category)}</span>
              <span class="chip-cost">${slotCost} slot${slotCost > 1 ? 's' : ''}</span>
            </span>
            <span class="chip-effect">${getChipEffectText(chip)}</span>
          </div>
        </div>
      `;
    }
  }

  const modalBody = document.querySelector('#chip-modal .modal-body');
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="chip-modal-equipment">
        <h3>${equipmentItem?.name || slotNames[currentChipModalSlot]}</h3>
        <p class="slots-used">${slotData.slotsUsed}/${slotData.maxSlots} slots used</p>
      </div>
      <div class="chip-slots-grid">
        ${slotsHtml}
      </div>
      <div class="chip-inventory-section">
        <h4>Available Chips</h4>
        <div class="chip-inventory-list">
          ${inventoryHtml}
        </div>
      </div>
    `;
  }
}

/**
 * Render equipped weapon chips for combat display (display-only, no click handlers)
 * @param {object} pipelineResult - Optional pipeline result for showing fired state
 */
function renderCombatChips(pipelineResult = null) {
  if (!chipLoadoutCache?.equipment?.weapon) return '';

  const weaponChips = chipLoadoutCache.equipment.weapon.equippedChips || [];
  let html = '';

  for (let i = 0; i < 5; i++) {
    const chip = weaponChips[i];
    if (chip) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');

      // Get pipeline fire state for this chip
      const fireState = pipelineResult?.firedChips?.[i];
      let stateClass = '';
      if (fireState && !fireState.skipped && !fireState.notPipeline) {
        stateClass = fireState.triggered ? 'triggered' : 'failed';
      }

      html += `
        <div class="chip-slot filled ${rarityClass} ${stateClass}" title="${chip.name}" data-index="${i}">
          <img class="chip-slot-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          ${fireState?.triggered ? `<span class="chip-effect-text">${fireState.displayText}</span>` : ''}
        </div>
      `;
    } else {
      html += `<div class="chip-slot empty" data-index="${i}"></div>`;
    }
  }
  return html;
}

// Cache for the latest pipeline result (for UI updates)
let lastPipelineResult = null;

/**
 * Animate the chip pipeline firing sequentially
 * @param {object} pipelineResult - Result from executeChipPipeline
 */
async function animateChipPipeline(pipelineResult) {
  if (!pipelineResult?.firedChips) return;

  lastPipelineResult = pipelineResult;

  const slots = document.querySelectorAll('.combat-chips-display .chip-slot');
  if (slots.length === 0) return;

  // Reset all slots first
  slots.forEach(slot => {
    slot.classList.remove('firing', 'triggered', 'failed');
    const effectText = slot.querySelector('.chip-effect-text');
    if (effectText) effectText.remove();
  });

  // Animate each chip sequentially
  for (let i = 0; i < pipelineResult.firedChips.length; i++) {
    const result = pipelineResult.firedChips[i];
    const slot = slots[i];
    if (!slot || result.skipped || result.notPipeline) continue;

    // Add firing class briefly
    slot.classList.add('firing');
    await delay(120);
    slot.classList.remove('firing');

    // Add final state
    slot.classList.add(result.triggered ? 'triggered' : 'failed');

    // Show effect text for triggered chips
    if (result.triggered && result.displayText) {
      const effectSpan = document.createElement('span');
      effectSpan.className = 'chip-effect-text';
      effectSpan.textContent = result.displayText;
      slot.appendChild(effectSpan);
    }

    // Show heal number for chips that heal (like Siphon)
    if (result.triggered && result.healPlayer > 0) {
      showDamageNumber(result.healPlayer, true, false, true); // isPlayer=true, isHeal=true
    }

    await delay(80);
  }
}

/**
 * Get category label for display
 */
function getCategoryLabel(category) {
  const labels = {
    stat: 'STAT',
    onHit: 'ON HIT',
    onEffect: 'ON EFFECT',
    counter: 'COUNTER',
    pipeline: 'PIPELINE'
  };
  return labels[category] || category?.toUpperCase() || '???';
}

/**
 * Get chip effect text for display
 */
function getChipEffectText(chip) {
  if (!chip.effects) return '';

  if (chip.effects.stats) {
    const stats = Object.entries(chip.effects.stats)
      .map(([stat, val]) => `+${val} ${stat.toUpperCase()}`)
      .join(', ');
    return stats;
  }

  if (chip.effects.onHit) {
    const hit = chip.effects.onHit;
    return `${Math.round(hit.chance * 100)}% ${hit.status}`;
  }

  if (chip.effects.counter) {
    const c = chip.effects.counter;
    return `+${c.perStack} ${c.stat} per ${c.trigger}`;
  }

  // Handle onEffect category (onKill, onDamage, etc.)
  if (chip.effects.onKill) {
    const e = chip.effects.onKill;
    const parts = [];
    if (e.heal) parts.push(`回復${e.heal}HP`);
    if (e.aspdBoost) parts.push(`ASPD+${Math.round(e.aspdBoost * 100)}%`);
    if (e.doubleCredits) parts.push('報酬2倍');
    if (e.aoeExplosion) parts.push(`爆発${e.aoeDamage}dmg`);
    return `${Math.round((e.chance || 1) * 100)}% ${parts.join(', ') || '撃破時効果'}`;
  }

  if (chip.effects.onDamage) {
    const e = chip.effects.onDamage;
    return `${Math.round((e.chance || 1) * 100)}% ダメージ${Math.round((e.damageReduction || 0) * 100)}%軽減`;
  }

  if (chip.effects.onDodge) {
    return '回避時効果';
  }

  if (chip.effects.onCrit) {
    return 'クリティカル時効果';
  }

  if (chip.effects.onLowHp) {
    return 'HP低下時効果';
  }

  return '';
}

/**
 * Add a chip from inventory to the current equipment slot
 */
async function addChipToSlot(chipId) {
  if (!currentChipModalSlot) return;

  const result = await apiEquipChip(currentChipModalSlot, chipId);

  if (result.error) {
    showNarration(`装着失敗: ${result.error}`);
    return;
  }

  // Speak "[chip name]を装備" via TTS
  if (result.chipName) {
    tts.speakText(`${result.chipName}を装備`);
  }

  // Refresh loadout and re-render
  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();

  // Also refresh main game state
  await loadGameState();
  updateUI();
}

/**
 * Remove a chip from the current equipment slot
 */
async function removeChipFromSlot(chipId) {
  if (!currentChipModalSlot) return;

  const result = await apiUnequipChip(currentChipModalSlot);

  if (result.error) {
    showNarration(`取り外し失敗: ${result.error}`);
    return;
  }

  // Refresh loadout and re-render
  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();

  // Also refresh main game state
  await loadGameState();
  updateUI();
}

/**
 * Toggle chip equip - unequip from one slot and optionally equip to current slot
 */
async function toggleChipEquip(chipId, fromSlot) {
  // First unequip from the other slot
  const unequipResult = await apiUnequipChip(fromSlot);
  if (unequipResult.error) {
    showNarration(`取り外し失敗: ${unequipResult.error}`);
    return;
  }

  // Then equip to current slot
  if (currentChipModalSlot) {
    const equipResult = await apiEquipChip(currentChipModalSlot, chipId);
    if (equipResult.error) {
      showNarration(`装着失敗: ${equipResult.error}`);
    }
  }

  // Refresh loadout and re-render
  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();

  // Also refresh main game state
  await loadGameState();
  updateUI();
}

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
    showNarration('解放記録の取得に失敗しました');
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
    showNarration(`アップグレード完了！ ${data.upgrade.newLevel}レベルになった！`);

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
    showNarration('Welcome to NEO TOKYO! Create a character to begin your adventure.');
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
  reviewType = serverSettings.reviewType;

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
      showNarration('統計がリセットされました。');
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
    showDefinitionsReveal(word, data.meanings, reading || data.reading);
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
window.advanceNarration = advanceNarration;
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
