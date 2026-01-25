/**
 * chip-select.js - In-scene chip selection UI
 *
 * Shows chips as selectable cards in action area, with selected chip
 * displayed as a "character" in the sprite area with narration.
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import * as narrationBox from './narration-box.js';

const CHIP_GREETING = 'こんにちは！私を選んでくれる？';

let resolveSelection = null;
let selectedIndex = 0;
let currentChips = [];

/**
 * Show chip selection UI in the scene
 * @param {Object[]} chips - Array of chip objects to choose from
 * @returns {Promise<Object>} Resolves to the selected chip
 */
export function showChipSelect(chips) {
  return new Promise((resolve) => {
    resolveSelection = resolve;
    currentChips = chips;
    selectedIndex = 0;

    renderChipCards(chips);
    showSelectedChip(chips[0]);
  });
}

function renderChipCards(chips) {
  // TODO: Implement in Task 2
}

function showSelectedChip(chip) {
  // TODO: Implement in Task 3
}

function confirmSelection() {
  // TODO: Implement in Task 4
}

/** Clean up chip select UI */
export function cleanup() {
  dom.actionArea.innerHTML = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  narrationBox.forceHide();
  resolveSelection = null;
  currentChips = [];
}
