import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

const views = {};

/** Initialize all takeover views and close buttons */
export function init() {
  views.creatureEquip = dom.creatureEquipView;
  views.settings = dom.settingsView;
  views.gameover = dom.gameoverView;
  views.speedReview = dom.speedReviewView;

  // Close buttons
  dom.creatureEquipClose.addEventListener('click', () => close('creatureEquip'));
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
    case 'creatureEquip': return dom.creatureEquipContent;
    case 'settings': return dom.settingsContent;
    case 'gameover': return dom.gameoverContent;
    default: return null;
  }
}
