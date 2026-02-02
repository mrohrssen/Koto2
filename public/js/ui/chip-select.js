/**
 * @file chip-select.js - Swipeable Chip Selection UI
 *
 * PURPOSE:
 * Displays chip selection cards for post-combat rewards and starting chip
 * selection. Shows one chip at a time as a swipeable card with full details
 * (icon, name, rarity, passive effect, skill description).
 *
 * KEY EXPORTS:
 * - showChipSelect(chips, options): Promise-based chip selection
 *   Returns selected chip object, or null if skipped
 * - cleanup(): Remove chip select UI and restore scene state
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references
 * - ../audio.js: Sound effects (button-tap, chip-equip)
 * - ./narration-box.js: Display chip greeting dialogue
 * - ./lookup.js: Re-parse text when lookup mode is active
 *
 * BEHAVIOR:
 * - Swipe left/right to cycle through chip options (loops infinitely)
 * - Dot indicators show current position
 * - "Skip" button available for post-combat (not starting chip)
 * - Chip sprite shown in scene area with greeting narration
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import * as narrationBox from './narration-box.js';
import * as lookup from './lookup.js';

const CHIP_GREETING = 'こんにちは！私を選んでくれる？';

let resolveSelection = null;
let selectedIndex = 0;
let currentChips = [];
let currentOptions = {};

// Swipe state
let touchStartX = 0;
let currentSwipeX = 0;
let isSwiping = false;

const SWIPE_THRESHOLD = 60;

/**
 * Show chip selection UI in the scene
 * @param {Object[]} chips - Array of chip objects to choose from
 * @param {Object} [options]
 * @param {boolean} [options.allowSkip] - Show skip button (for post-combat, not starting chip)
 * @param {number} [options.playerCredits] - Player's current credits
 * @param {boolean} [options.freeRefreshUsed] - Whether free refresh has been used
 * @param {function} [options.onRefresh] - Callback when refresh is clicked
 * @returns {Promise<Object|null>} Resolves to selected chip, or null if skipped
 */
export function showChipSelect(chips, options = {}) {
  return new Promise((resolve) => {
    resolveSelection = resolve;
    currentChips = chips;
    currentOptions = options;
    selectedIndex = 0;

    renderChipCard();
    showSelectedChip(chips[0]);
  });
}

function renderChipCard() {
  const chip = currentChips[selectedIndex];
  const skillName = chip.skill?.nameEn || chip.skill?.name || '';
  const skillDesc = chip.skill?.descriptionEn || chip.skill?.description || '';
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.webp`;

  // Price info
  const price = chip.price || 0;
  const playerCredits = currentOptions.playerCredits ?? 0;
  const canAfford = playerCredits >= price;
  const priceClass = canAfford ? 'affordable' : 'expensive';

  // Refresh cost (25 credits if free refresh used)
  const refreshCost = currentOptions.freeRefreshUsed ? 25 : 0;
  const canRefresh = playerCredits >= refreshCost;
  const refreshLabel = refreshCost > 0 ? `リフレッシュ (${refreshCost}cr)` : 'リフレッシュ (無料)';

  // Dots indicator
  const dots = currentChips.map((_, i) =>
    `<div class="chip-select-dot${i === selectedIndex ? ' active' : ''}"></div>`
  ).join('');

  const skipBtn = currentOptions.allowSkip
    ? '<button class="chip-select-btn chip-select-skip" id="chip-select-skip">スキップ</button>'
    : '';

  const refreshBtn = currentOptions.onRefresh
    ? `<button class="chip-select-btn chip-select-refresh ${canRefresh ? '' : 'disabled'}" id="chip-select-refresh">${refreshLabel}</button>`
    : '';

  // Buy button shows price
  const buyLabel = price > 0 ? `購入 (${price}cr)` : 'チップを選ぶ';
  const buyBtnClass = canAfford ? '' : 'disabled';

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      ${playerCredits !== undefined ? `<div class="chip-select-credits">クレジット: ${playerCredits}cr</div>` : ''}
      <div class="chip-select-card" id="chip-select-card">
        ${price > 0 ? `<div class="chip-select-price-badge ${priceClass}">${price}cr</div>` : ''}
        <div class="chip-select-top">
          <div class="chip-select-icon" style="background-image:url('${iconPath}')"></div>
          <div class="chip-select-info">
            <div class="chip-select-name">${chip.nameEn || chip.name}</div>
            <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
          </div>
        </div>
        <div class="chip-stat-row">
          <div class="chip-stat-box pwr">
            <span class="chip-stat-label">PWR</span>
            <span class="chip-stat-value">${chip.stats?.power || 0}</span>
          </div>
          <div class="chip-stat-box bw">
            <span class="chip-stat-label">BW</span>
            <span class="chip-stat-value">${chip.stats?.bandwidth || 0}</span>
          </div>
        </div>
        <div class="chip-select-passive">
          <div class="chip-select-label">Passive</div>
          <div class="chip-select-desc">${chip.descriptionEn || chip.description || ''}</div>
        </div>
        ${skillName ? `
        <div class="chip-select-active">
          <div class="chip-select-label">Skill: ${skillName}</div>
          <div class="chip-select-desc">${skillDesc}</div>
        </div>
        ` : ''}
      </div>
      <div class="chip-select-dots">${dots}</div>
      <div class="chip-select-hint">← スワイプで切り替え →</div>
      <div class="chip-select-buttons">
        ${refreshBtn}
        ${skipBtn}
        <button class="chip-select-btn ${buyBtnClass}" id="chip-select-confirm">${buyLabel}</button>
      </div>
    </div>
  `;

  // Set up swipe handlers
  const card = document.getElementById('chip-select-card');
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: false });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
  card.addEventListener('mousedown', handleMouseDown);
  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseup', handleMouseUp);
  card.addEventListener('mouseleave', handleMouseUp);

  // Button handlers
  document.getElementById('chip-select-confirm').addEventListener('click', confirmSelection);
  document.getElementById('chip-select-skip')?.addEventListener('click', skipSelection);
  document.getElementById('chip-select-refresh')?.addEventListener('click', handleRefresh);

  // Re-parse for lookup mode if active
  if (lookup.getActive()) {
    lookup.refresh();
  }
}

// Touch handlers
function handleTouchStart(e) {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  currentSwipeX = 0;
  isSwiping = false;
}

function handleTouchMove(e) {
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;

  if (Math.abs(dx) > 10) {
    isSwiping = true;
    currentSwipeX = dx;
    e.preventDefault();

    const card = document.getElementById('chip-select-card');
    if (card) {
      card.style.transform = `translateX(${dx * 0.5}px)`;
      card.style.opacity = `${1 - Math.abs(dx) / 300}`;
    }
  }
}

function handleTouchEnd() {
  if (!isSwiping) return;

  const card = document.getElementById('chip-select-card');

  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? -1 : 1; // Swipe right = prev, left = next
    navigateChip(direction);
  } else {
    // Snap back
    if (card) {
      card.style.transform = '';
      card.style.opacity = '';
    }
  }
  isSwiping = false;
}

// Mouse handlers
let mouseIsDown = false;

function handleMouseDown(e) {
  mouseIsDown = true;
  touchStartX = e.clientX;
  currentSwipeX = 0;
  isSwiping = false;
  e.preventDefault();
}

function handleMouseMove(e) {
  if (!mouseIsDown) return;
  const dx = e.clientX - touchStartX;

  if (Math.abs(dx) > 10) {
    isSwiping = true;
    currentSwipeX = dx;

    const card = document.getElementById('chip-select-card');
    if (card) {
      card.style.transform = `translateX(${dx * 0.5}px)`;
      card.style.opacity = `${1 - Math.abs(dx) / 300}`;
    }
  }
}

function handleMouseUp() {
  if (!mouseIsDown) return;
  mouseIsDown = false;

  if (!isSwiping) return;

  const card = document.getElementById('chip-select-card');

  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? -1 : 1;
    navigateChip(direction);
  } else {
    if (card) {
      card.style.transform = '';
      card.style.opacity = '';
    }
  }
  isSwiping = false;
}

function navigateChip(direction) {
  // Loop infinitely
  selectedIndex = (selectedIndex + direction + currentChips.length) % currentChips.length;
  playSFX('button-tap');

  // Re-render card and update sprite
  renderChipCard();
  showSelectedChip(currentChips[selectedIndex]);
}

function showSelectedChip(chip) {
  // Show chip name (Japanese preferred)
  dom.enemyName.textContent = chip.nameEn || chip.name;
  dom.enemyInfo.classList.add('visible');

  // Hide HP bar (chips don't have HP)
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Show chip icon as sprite
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.webp`;
  dom.enemySprite.src = iconPath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    dom.enemySprite.classList.add('visible');
  };

  // Show greeting narration (persistent - no click to dismiss)
  narrationBox.show(CHIP_GREETING, {
    speaker: chip.nameEn || chip.name,
    persistent: true
  });
}

function confirmSelection() {
  if (!resolveSelection) return;

  const chip = currentChips[selectedIndex];
  const price = chip.price || 0;
  const playerCredits = currentOptions.playerCredits ?? Infinity;

  // Check if player can afford
  if (playerCredits < price) {
    playSFX('button-tap');
    return;
  }

  const resolve = resolveSelection;
  playSFX('chip-equip');

  cleanup();
  resolve(chip);
}

function skipSelection() {
  if (!resolveSelection) return;

  const resolve = resolveSelection;
  playSFX('button-tap');
  cleanup();
  resolve(null);
}

function handleRefresh() {
  if (!currentOptions.onRefresh) return;

  const refreshCost = currentOptions.freeRefreshUsed ? 25 : 0;
  const playerCredits = currentOptions.playerCredits ?? 0;

  if (playerCredits < refreshCost) {
    playSFX('button-tap');
    return;
  }

  playSFX('button-tap');
  currentOptions.onRefresh();
}

/**
 * Update the chip selection with new chips and options (used after refresh)
 * @param {Object[]} chips - New array of chip objects
 * @param {Object} newOptions - Updated options
 */
export function updateChips(chips, newOptions = {}) {
  currentChips = chips;
  currentOptions = { ...currentOptions, ...newOptions };
  selectedIndex = 0;

  renderChipCard();
  showSelectedChip(chips[0]);
}

/** Clean up chip select UI */
export function cleanup() {
  dom.actionArea.innerHTML = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
  narrationBox.forceHide();
  resolveSelection = null;
  currentChips = [];
  currentOptions = {};
}
