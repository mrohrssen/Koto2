/**
 * Mobile UI DOM selectors for E2E tests
 * Targets the mobile-first UI structure (takeover views, action-area, flash cards)
 */
export const SELECTORS = {
  // Status bar
  floorIndicator: '#floor-indicator',
  essenceDisplay: '#essence-display',

  // Scene area
  sceneArea: '#scene-area',
  enemySprite: '#enemy-sprite',
  enemySpriteContainer: '#enemy-sprite-container',
  enemyName: '#enemy-name',
  enemyHpFill: '#enemy-hp-fill',
  sceneToast: '#scene-toast',

  // Chip row
  chipRow: '#chip-row',
  chipSlot: '.chip-slot',
  chipPopup: '#chip-popup',
  chipPopupName: '#chip-popup-name',
  chipPopupDesc: '#chip-popup-desc',
  chipPopupCharge: '#chip-popup-charge',
  chipPopupUse: '#chip-popup-use',

  // Player HP
  playerHpContainer: '#player-hp-container',
  playerHpFill: '#player-hp-fill',
  playerHpText: '#player-hp-text',

  // Action area
  actionArea: '#action-area',
  actionBtn: '.action-btn',
  actionBtnPrimary: '.action-btn-primary',

  // Flash card
  flashCardContainer: '#flash-card-container',
  flashCard: '#flash-card',
  flashCardFront: '.flash-card-front',
  flashCardBack: '.flash-card-back',
  flashCardReading: '.flash-card-reading',
  flashCardMeaning: '.flash-card-meaning',
  flashCardHint: '.flash-card-hint',

  // Dynamic action buttons (rendered into action-area by phase)
  newGameBtn: '#new-game-btn',
  proceedBtn: '#proceed-btn',
  fightBtn: '#fight-btn',
  bossFightBtn: '#boss-fight-btn',
  nextFloorBtn: '#next-floor-btn',
  returnHubBtn: '#return-hub-btn',
  equipBotsBtn: '#equip-bots-btn',
  contextActionBtn: '#context-action-btn',
  wardProceedBtn: '#ward-proceed-btn',
  wardOption: '.ward-option',

  // Takeover views (opened via .active class)
  chipEquipView: '#chip-equip-view',
  chipEquipContent: '#chip-equip-content',
  chipEquipClose: '#chip-equip-close',
  chipShopView: '#chip-shop-view',
  chipShopContent: '#chip-shop-content',
  chipShopClose: '#chip-shop-close',
  settingsView: '#settings-view',
  settingsContent: '#settings-content',
  settingsClose: '#settings-close',
  gameoverView: '#gameover-view',
  gameoverContent: '#gameover-content',
  takeoverClose: '.takeover-close',

  // Shop elements (rendered into chip-shop takeover)
  shopChipOption: '.shop-chip-option',
  shopSkipBtn: '#shop-skip-btn',

  // In-scene chip selection (rendered into action area)
  chipSelectCard: '.chip-select-card',
  chipSelectConfirm: '#chip-select-confirm',
  chipSelectSkip: '#chip-select-skip',

  // Chip equip elements (rendered into chip-equip takeover)
  chipEquipSlot: '.chip-equip-slot',
  chipEquipSlotFilled: '.chip-equip-slot.filled',
  chipEquipSlotEmpty: '.chip-equip-slot.empty',
  chipInventoryItem: '.chip-inventory-item',

  // Settings elements (rendered into settings takeover)
  settingsJpdbKey: '#settings-jpdb-key',
  settingsTtsEnabled: '#settings-tts-enabled',
  settingsSaveBtn: '#settings-save-btn',

  // Utility row
  settingsBtn: '#settings-btn',
  resetRunBtn: '#reset-run-btn',
  lookupBtn: '#lookup-btn',
  lookupPopup: '#lookup-popup',
  lookupPopupWord: '#lookup-popup-word',
  lookupPopupClose: '#lookup-popup-close',
  lookupWord: '.lookup-word',

  // Game over
  gameoverHubBtn: '#gameover-hub-btn',
};
