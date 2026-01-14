/**
 * DOM selectors for e2e tests
 * Based on public/game.html structure
 */
export const SELECTORS = {
  // Header
  newGameBtn: '#new-game-btn',
  settingsBtn: '#settings-btn',
  debugModeBtn: '#debug-mode-btn',
  gameStatsBtn: '#game-stats-btn',
  quickStats: '#quick-stats',
  logBtn: '#log-btn',

  // VN Stage
  vnStage: '#vn-stage',
  vnBackground: '#vn-background',
  playerSprite: '#player-sprite',
  playerSpriteImg: '#player-sprite-img',
  enemySprite: '#enemy-sprite',
  enemySpriteImg: '#enemy-sprite-img',

  // HP Bars
  playerHpBar: '#player-hp-bar',
  playerHpFill: '#player-hp-fill',
  playerMpFill: '#player-mp-fill',
  playerHpValues: '#player-hp-values',
  playerNameDisplay: '#player-name-display',
  enemyHpBar: '#enemy-hp-bar',
  enemyHpFill: '#enemy-hp-fill',
  enemyHpValues: '#enemy-hp-values',
  enemyNameDisplay: '#enemy-name-display',

  // Floor Indicator
  floorIndicator: '#floor-indicator',
  floorDisplay: '#floor-display',
  roomDisplay: '#room-display',

  // Word Practice
  wordCards: '#word-cards',
  wordCard: '.word-card',
  wordInputModal: '#word-input-modal',
  wordToDefine: '#word-to-define',
  wordDefinitionInput: '#word-definition-input',
  wordFeedback: '#word-feedback',
  definitionsReveal: '#definitions-reveal',
  selfGradeModal: '#self-grade-modal',
  selfGradeWord: '#self-grade-word',
  selfGradeMeanings: '#self-grade-meanings',
  reviewBtn: '.review-btn',

  // Game Content
  gameContent: '#game-content',

  // Narration Panel
  narrationPanel: '#narration-panel',
  narrationText: '#narration-text',
  narrationContinue: '#narration-continue',

  // Action Panel
  actionPanel: '#action-panel',
  actionBtn: '.action-btn',

  // Status Panel
  statusPanel: '#status-panel',
  playerStats: '#player-stats',
  equipmentList: '#equipment-list',
  inventoryList: '#inventory-list',

  // Character Creation Modal
  createCharModal: '#create-char-modal',
  charName: '#char-name',
  createStatPoints: '#create-stat-points',
  statMinus: '.stat-minus',
  statPlus: '.stat-plus',
  statRow: '.stat-row',
  resetStatsBtn: '#reset-stats-btn',
  createCharBtn: '#create-char-btn',
  // Individual stat values
  createStr: '#create-str',
  createAgi: '#create-agi',
  createVit: '#create-vit',
  createInt: '#create-int',
  createDex: '#create-dex',
  createLuk: '#create-luk',
  // Derived stats preview
  previewAtk: '#preview-atk',
  previewDef: '#preview-def',
  previewMatk: '#preview-matk',
  previewMdef: '#preview-mdef',
  previewHit: '#preview-hit',
  previewFlee: '#preview-flee',
  previewCrit: '#preview-crit',
  previewHp: '#preview-hp',
  previewSp: '#preview-sp',

  // Result Modal (Victory/Defeat)
  resultModal: '#result-modal',
  resultTitle: '#result-title',
  resultMessage: '#result-message',
  resultRewards: '#result-rewards',
  resultContinueBtn: '#result-continue-btn',

  // Game Over Modal
  gameoverModal: '#gameover-modal',
  gameoverStats: '#gameover-stats',
  gameoverRetryBtn: '#gameover-retry-btn',
  gameoverHubBtn: '#gameover-hub-btn',

  // Settings Modal
  settingsModal: '#settings-modal',
  closeSettings: '#close-settings',
  aiProvider: '#ai-provider',
  openaiModel: '#openai-model',
  aiKey: '#ai-key',
  openrouterModel: '#openrouter-model',
  jlptLevel: '#jlpt-level',
  jpdbApiKey: '#jpdb-api-key',
  reviewType: '#review-type',
  gameTtsEnabled: '#game-tts-enabled',
  gameTtsSpeaker: '#game-tts-speaker',
  gameTtsSpeed: '#game-tts-speed',
  gameTtsVolume: '#game-tts-volume',
  gameTtsTest: '#game-tts-test',
  cancelSettings: '#cancel-settings',
  saveSettings: '#save-settings',

  // Upgrades Modal
  upgradesModal: '#upgrades-modal',
  closeUpgrades: '#close-upgrades',
  modalEssenceCount: '#modal-essence-count',
  tabBtns: '.tab-btn',
  tabUpgrades: '#tab-upgrades',
  tabAchievements: '#tab-achievements',
  tabStats: '#tab-stats',
  upgradesGrid: '#upgrades-grid',
  achievementsList: '#achievements-list',
  lifetimeStats: '#lifetime-stats',

  // Chip Modal
  chipModal: '#chip-modal',

  // Shop Modal
  shopModal: '#shop-modal',
  shopTitle: '#shop-title',
  shopPlayerGold: '#shop-player-gold',
  closeShop: '#close-shop',
  shopGreeting: '#shop-greeting',
  shopItems: '#shop-items',
  shopCloseBtn: '#shop-close-btn',
  shopSkipBtn: '#shop-skip-btn',

  // Blacksmith Modal
  blacksmithModal: '#blacksmith-modal',
  blacksmithPlayerGold: '#blacksmith-player-gold',
  closeBlacksmith: '#close-blacksmith',
  blacksmithItems: '#blacksmith-items',
  blacksmithCloseBtn: '#blacksmith-close-btn',

  // Log Modal
  logModal: '#log-modal',
  closeLog: '#close-log',
  logEntries: '#log-entries',

  // Game Stats Modal
  gameStatsModal: '#game-stats-modal',
  closeGameStats: '#close-game-stats',
  statsPeriod: '#stats-period',

  // Generic
  hidden: '.hidden',
  modal: '.modal',
  btnPrimary: '.btn-primary',
  btnSecondary: '.btn-secondary',
};

// Action buttons - combat buttons have specific classes, action buttons use onclick
export const ACTION_BTNS = {
  // Combat buttons (have specific classes)
  attack: '.attack-btn',
  defend: '.defend-btn',
  magic: '.magic-btn',
  item: '.item-btn',
  flee: '.flee-btn',
  // Action panel buttons (use onclick attribute)
  proceed: '#action-panel button',  // Fallback - first action button
  startRun: '#action-panel button',
  nextFloor: '#action-panel button',
  returnHub: '#action-panel button',
  startBoss: '#action-panel button.boss',
  upgrades: '#action-panel button',
  chips: '#action-panel button',
  startEncounter: '#action-panel button',
};

// Grade buttons for self-grade mode
export const GRADE_BTNS = {
  nothing: '[data-grade="1"]',
  something: '[data-grade="2"]',
  hard: '[data-grade="3"]',
  okay: '[data-grade="4"]',
  easy: '[data-grade="5"]',
};
