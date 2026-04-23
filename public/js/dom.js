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

  // Area header pill
  get areaHeaderPill() { return el('area-header-pill'); },
  get areaHeaderName() { return el('area-header-name'); },
  get areaHeaderSub() { return el('area-header-sub'); },

  // Scene area
  get sceneArea() { return el('scene-area'); },
  get sceneBackground() { return el('scene-background'); },
  get enemyInfo() { return el('enemy-info'); },
  get enemyName() { return el('enemy-name'); },
  get enemyHpBar() { return el('enemy-hp-bar'); },
  get enemyHpFill() { return el('enemy-hp-fill'); },
  get enemyHpText() { return el('enemy-hp-text'); },
  get enemySkillBar() { return el('enemy-skill-bar'); },
  get battleStage() { return el('battle-stage'); },
  get playerFormation() { return el('player-formation'); },
  get enemyFormation() { return el('enemy-formation'); },
  get npcDisplay() { return el('npc-display'); },
  get roomProgressBadge() { return el('room-progress-badge'); },
  get enemySprite() { return el('enemy-sprite'); },
  get sceneToast() { return el('scene-toast'); },

  // Action area
  get actionArea() { return el('action-area'); },

  // Toolbar + Menu
  get settingsBtn() { return el('settings-btn'); },
  get resetRunBtn() { return el('reset-run-btn'); },
  get lookupBtn() { return el('lookup-btn'); },
  get menuBtn() { return el('menu-btn'); },
  get botsBtn() { return el('bots-btn'); },

  // Takeover views
  get creatureEquipView() { return el('creature-equip-view'); },
  get creatureEquipClose() { return el('creature-equip-close'); },
  get creatureEquipContent() { return el('creature-equip-content'); },
  get settingsView() { return el('settings-view'); },
  get settingsClose() { return el('settings-close'); },
  get settingsContent() { return el('settings-content'); },
  get gameoverView() { return el('gameover-view'); },
  get gameoverContent() { return el('gameover-content'); },

  // Creature popup (creature-row.js writes its own innerHTML)
  get creaturePopup() { return el('creature-popup'); },

  // Lookup mode
  get lookupPopup() { return el('lookup-popup'); },
  get lookupPopupWord() { return el('lookup-popup-word'); },
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

