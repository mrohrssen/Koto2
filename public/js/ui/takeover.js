/**
 * @file takeover.js - Full-Screen Panel Manager
 *
 * PURPOSE:
 * Manages full-screen overlay panels that slide in from the right. Used for
 * chip equipment, shop, settings, and game over screens. Only one takeover
 * can be active at a time.
 *
 * KEY EXPORTS:
 * - init(): Initialize all takeover views and close button handlers
 * - open(viewName): Slide in a takeover panel
 * - close(viewName): Slide out a takeover panel
 * - closeAll(): Close all open takeovers
 * - isAnyActive(): Check if any takeover is currently open
 * - getContent(viewName): Get the content container for a view
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (chipEquipView, settingsView, etc.)
 * - ../audio.js: Sound effects (takeover-open, takeover-close)
 *
 * AVAILABLE VIEWS:
 * - chipEquip: Chip management and reordering
 * - chipShop: Chip purchase interface
 * - settings: API keys, audio, preferences
 * - gameover: Run end results
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

const views = {};

/** Initialize all takeover views and close buttons */
export function init() {
  views.chipEquip = dom.chipEquipView;
  views.chipShop = dom.chipShopView;
  views.settings = dom.settingsView;
  views.gameover = dom.gameoverView;
  views.speedReview = dom.speedReviewView;

  // Close buttons
  dom.chipEquipClose.addEventListener('click', () => close('chipEquip'));
  dom.chipShopClose.addEventListener('click', () => close('chipShop'));
  dom.settingsClose.addEventListener('click', () => close('settings'));
  dom.speedReviewClose.addEventListener('click', () => close('speedReview'));
}

/** Open a takeover view */
export function open(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.add('active');
    playSFX('takeover-open');
  }
}

/** Close a takeover view */
export function close(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.remove('active');
    playSFX('takeover-close');
  }
}

/** Close all takeover views */
export function closeAll() {
  Object.values(views).forEach(v => v.classList.remove('active'));
}

/** Check if any takeover is active */
export function isAnyActive() {
  return Object.values(views).some(v => v.classList.contains('active'));
}

/** Get content container for a view */
export function getContent(viewName) {
  switch (viewName) {
    case 'chipEquip': return dom.chipEquipContent;
    case 'chipShop': return dom.chipShopContent;
    case 'settings': return dom.settingsContent;
    case 'gameover': return dom.gameoverContent;
    default: return null;
  }
}
