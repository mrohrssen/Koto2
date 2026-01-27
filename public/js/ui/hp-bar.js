/**
 * @file hp-bar.js - Player HP Bar Display
 *
 * PURPOSE:
 * Renders the player's HP bar at the top of the screen. Changes color based
 * on HP percentage: green (>50%), yellow (25-50%), red (<25%).
 *
 * KEY EXPORTS:
 * - updatePlayerHP(current, max): Update bar fill and text
 * - setVisible(visible): Show or hide the HP container
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (playerHpFill, playerHpText, playerHpContainer)
 *
 * COLOR THRESHOLDS:
 * - >50% HP: --hp-green
 * - 25-50% HP: --hp-yellow
 * - <25% HP: --hp-red
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
