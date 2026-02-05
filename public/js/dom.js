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
  get enemyHpText() { return el('enemy-hp-text'); },
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
  get lookupBtn() { return el('lookup-btn'); },

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

  // Lookup mode
  get lookupPopup() { return el('lookup-popup'); },
  get lookupPopupWord() { return el('lookup-popup-word'); },
  get lookupPopupReading() { return el('lookup-popup-reading'); },
  get lookupPopupClose() { return el('lookup-popup-close'); },
  get lookupPopupPos() { return el('lookup-popup-pos'); },
  get lookupPopupMeanings() { return el('lookup-popup-meanings'); },
  get lookupPopupState() { return el('lookup-popup-state'); },
  get lookupStateDot() { return el('lookup-state-dot'); },
  get lookupStateText() { return el('lookup-state-text'); },

  // Bug report
  get bugReportBtn() { return el('bug-report-btn'); },
  get bugReportModal() { return el('bug-report-modal'); },
  get bugReportNote() { return el('bug-report-note'); },
  get bugReportSubmit() { return el('bug-report-submit'); },
  get bugReportCancel() { return el('bug-report-cancel'); },
  get bugReportFile() { return el('bug-report-file'); },
  get bugReportPreview() { return el('bug-report-preview'); },

  // Speed Review
  get speedReviewView() { return el('speed-review-view'); },
  get speedReviewClose() { return el('speed-review-close'); },
  get speedReviewUndo() { return el('speed-review-undo'); },
  get speedReviewContent() { return el('speed-review-content'); },
  get speedReviewCounter() { return el('speed-review-counter'); },
  get speedReviewEmpty() { return el('speed-review-empty'); },
  get speedReviewSlots() {
    return [
      el('speed-review-slot-0'),
      el('speed-review-slot-1'),
      el('speed-review-slot-2')
    ];
  },
};

/** Clear cache (for testing or hot reload) */
export function clearDomCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}
