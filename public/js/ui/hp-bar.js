/**
 * Player HP Bar Module
 *
 * Full-width bar: green → yellow → red as HP decreases.
 * Shows current/max as text overlay.
 */

import { dom } from '../dom.js';

/** Update player HP bar display */
export function updatePlayerHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.playerHpFill.style.width = `${pct}%`;
  dom.playerHpText.textContent = `${current} / ${max}`;

  // Color transitions
  if (pct > 50) {
    dom.playerHpFill.style.background = 'var(--hp-green)';
  } else if (pct > 25) {
    dom.playerHpFill.style.background = 'var(--hp-yellow)';
  } else {
    dom.playerHpFill.style.background = 'var(--hp-red)';
  }
}

/** Show/hide the HP container */
export function setVisible(visible) {
  dom.playerHpContainer.classList.toggle('hidden', !visible);
}
