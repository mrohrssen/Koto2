/**
 * DOM Reference Module - Central element cache for mobile UI
 *
 * All UI modules import element references from here.
 * Elements are lazily cached on first access.
 */

const cache = {};

function el(id) {
  if (!cache[id]) {
    cache[id] = document.getElementById(id);
  }
  return cache[id];
}

export const dom = {
  // Status bar
  get statusBar() { return el('status-bar'); },
  get floorIndicator() { return el('floor-indicator'); },
  get essenceDisplay() { return el('essence-display'); },

  // Scene area
  get sceneArea() { return el('scene-area'); },
  get sceneBackground() { return el('scene-background'); },
  get enemyInfo() { return el('enemy-info'); },
  get enemyName() { return el('enemy-name'); },
  get enemyHpBar() { return el('enemy-hp-bar'); },
  get enemyHpFill() { return el('enemy-hp-fill'); },
  get enemySkillBar() { return el('enemy-skill-bar'); },
  get enemySpriteContainer() { return el('enemy-sprite-container'); },
  get enemySprite() { return el('enemy-sprite'); },
  get sceneToast() { return el('scene-toast'); },

  // Chip row
  get chipRow() { return el('chip-row'); },

  // Player HP
  get playerHpContainer() { return el('player-hp-container'); },
  get playerHpBar() { return el('player-hp-bar'); },
  get playerHpFill() { return el('player-hp-fill'); },
  get playerHpText() { return el('player-hp-text'); },

  // Action area
  get actionArea() { return el('action-area'); },

  // Utility
  get settingsBtn() { return el('settings-btn'); },
  get resetRunBtn() { return el('reset-run-btn'); },

  // Takeover views
  get chipEquipView() { return el('chip-equip-view'); },
  get chipEquipClose() { return el('chip-equip-close'); },
  get chipEquipContent() { return el('chip-equip-content'); },
  get chipShopView() { return el('chip-shop-view'); },
  get chipShopClose() { return el('chip-shop-close'); },
  get chipShopContent() { return el('chip-shop-content'); },
  get settingsView() { return el('settings-view'); },
  get settingsClose() { return el('settings-close'); },
  get settingsContent() { return el('settings-content'); },
  get gameoverView() { return el('gameover-view'); },
  get gameoverContent() { return el('gameover-content'); },

  // Chip popup
  get chipPopup() { return el('chip-popup'); },
  get chipPopupName() { return el('chip-popup-name'); },
  get chipPopupDesc() { return el('chip-popup-desc'); },
  get chipPopupCharge() { return el('chip-popup-charge'); },
  get chipPopupUse() { return el('chip-popup-use'); },
  get chipPopupSwap() { return el('chip-popup-swap'); },
};

/** Clear cache (for testing or hot reload) */
export function clearDomCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}
