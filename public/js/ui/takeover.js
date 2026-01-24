/**
 * Takeover View Module - Full-screen slide-in panels
 *
 * Manages: chip equip, chip shop, settings, game over
 * Slides in from right, close button in top corner.
 */

import { dom } from '../dom.js';

const views = {};

/** Initialize all takeover views and close buttons */
export function init() {
  views.chipEquip = dom.chipEquipView;
  views.chipShop = dom.chipShopView;
  views.settings = dom.settingsView;
  views.gameover = dom.gameoverView;

  // Close buttons
  dom.chipEquipClose.addEventListener('click', () => close('chipEquip'));
  dom.chipShopClose.addEventListener('click', () => close('chipShop'));
  dom.settingsClose.addEventListener('click', () => close('settings'));
}

/** Open a takeover view */
export function open(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.add('active');
  }
}

/** Close a takeover view */
export function close(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.remove('active');
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
