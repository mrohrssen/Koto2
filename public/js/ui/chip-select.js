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
 * @param {Object} [options]
 * @param {boolean} [options.allowSkip] - Show skip button (for post-combat, not starting chip)
 * @returns {Promise<Object|null>} Resolves to selected chip, or null if skipped
 */
export function showChipSelect(chips, options = {}) {
  return new Promise((resolve) => {
    resolveSelection = resolve;
    currentChips = chips;
    selectedIndex = 0;

    renderChipCards(chips, options);
    showSelectedChip(chips[0]);
  });
}

function renderChipCards(chips, options = {}) {
  const cardsHtml = chips.map((chip, i) => `
    <div class="chip-select-card${i === 0 ? ' selected' : ''}" data-index="${i}">
      <div class="chip-select-name">${chip.name || chip.nameEn}</div>
      <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="chip-select-desc">${chip.description || chip.descriptionEn || ''}</div>
    </div>
  `).join('');

  const skipBtn = options.allowSkip
    ? '<button class="chip-select-btn chip-select-skip" id="chip-select-skip">スキップ</button>'
    : '';

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      <div class="chip-select-cards">${cardsHtml}</div>
      <button class="chip-select-btn" id="chip-select-confirm">チップを選ぶ</button>
      ${skipBtn}
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

  // Skip button handler
  document.getElementById('chip-select-skip')?.addEventListener('click', skipSelection);
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
  // Show chip name (Japanese preferred)
  dom.enemyName.textContent = chip.name || chip.nameEn;
  dom.enemyInfo.classList.add('visible');

  // Hide HP bar (chips don't have HP)
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Show chip icon as sprite
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.png`;
  dom.enemySprite.src = iconPath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    dom.enemySprite.classList.add('visible');
  };

  // Show greeting narration (persistent - no click to dismiss)
  narrationBox.show(CHIP_GREETING, {
    speaker: chip.name || chip.nameEn,
    persistent: true
  });
}

function confirmSelection() {
  if (!resolveSelection) return;

  const chip = currentChips[selectedIndex];
  const resolve = resolveSelection; // Save before cleanup nulls it
  playSFX('chip-equip');

  // Clean up UI
  cleanup();

  // Resolve the promise with selected chip
  resolve(chip);
}

function skipSelection() {
  if (!resolveSelection) return;

  const resolve = resolveSelection; // Save before cleanup nulls it
  playSFX('button-tap');
  cleanup();
  resolve(null);
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
