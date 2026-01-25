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
  const cardsHtml = chips.map((chip, i) => `
    <div class="chip-select-card${i === 0 ? ' selected' : ''}" data-index="${i}">
      <div class="chip-select-name">${chip.name || chip.nameEn}</div>
      <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="chip-select-desc">${chip.description || chip.descriptionEn || ''}</div>
    </div>
  `).join('');

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      <div class="chip-select-cards">${cardsHtml}</div>
      <button class="chip-select-btn" id="chip-select-confirm">チップを選ぶ</button>
    </div>
  `;

  // Card click handlers
  dom.actionArea.querySelectorAll('.chip-select-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      selectChip(index);
    });
  });

  // Confirm button handler
  document.getElementById('chip-select-confirm').addEventListener('click', confirmSelection);
}

function selectChip(index) {
  if (index === selectedIndex) return;

  // Update visual selection
  dom.actionArea.querySelectorAll('.chip-select-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });

  selectedIndex = index;
  playSFX('button-tap');
  showSelectedChip(currentChips[index]);
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
