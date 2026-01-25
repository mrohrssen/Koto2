/**
 * chip-select.js - In-scene chip selection UI
 *
 * Shows one chip at a time as a swipeable card with icon, name, rarity,
 * and skill descriptions. Swipe left/right to cycle through options.
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
  const skillName = chip.skill?.name || chip.skill?.nameEn || '';
  const skillDesc = chip.skill?.description || chip.skill?.descriptionEn || '';
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.png`;

  // Dots indicator
  const dots = currentChips.map((_, i) =>
    `<div class="chip-select-dot${i === selectedIndex ? ' active' : ''}"></div>`
  ).join('');

  const skipBtn = currentOptions.allowSkip
    ? '<button class="chip-select-btn chip-select-skip" id="chip-select-skip">スキップ</button>'
    : '';

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      <div class="chip-select-card" id="chip-select-card">
        <div class="chip-select-top">
          <div class="chip-select-icon" style="background-image:url('${iconPath}')"></div>
          <div class="chip-select-info">
            <div class="chip-select-name">${chip.name || chip.nameEn}</div>
            <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
          </div>
        </div>
        <div class="chip-select-passive">
          <div class="chip-select-label">パッシブ</div>
          <div class="chip-select-desc">${chip.description || chip.descriptionEn || ''}</div>
        </div>
        ${skillName ? `
        <div class="chip-select-active">
          <div class="chip-select-label">スキル: ${skillName}</div>
          <div class="chip-select-desc">${skillDesc}</div>
        </div>
        ` : ''}
      </div>
      <div class="chip-select-dots">${dots}</div>
      <div class="chip-select-hint">← スワイプで切り替え →</div>
      <div class="chip-select-buttons">
        ${skipBtn}
        <button class="chip-select-btn" id="chip-select-confirm">チップを選ぶ</button>
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
