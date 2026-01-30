/**
 * @file chip-row.js - Chip Slots Display
 *
 * PURPOSE:
 * Renders the 5 equipped chip slots at the bottom of the screen. Each slot
 * shows a circular icon with rarity-colored border, level badge, and a
 * 5-segment charge bar. Tapping a chip opens a popup with skill details.
 *
 * KEY EXPORTS:
 * - init({ useSkillCallback, onReorder, isBlocked, getChipIds }): Setup
 * - render(chips, { charges, levels, maxCharges, inCombat }): Draw all slots
 * - isInSwapMode(): Check if user is reordering chips
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (chipRow, chipPopup elements)
 * - ../audio.js: Sound effects (chip-skill, chip-lift)
 *
 * VISUAL STATES:
 * - Empty slot: Gray circle with no charge bar
 * - Equipped: Chip icon with rarity border color
 * - Charging: Partial charge segments filled
 * - Charged: Golden pulse animation, "Use Skill" button enabled
 * - Swap mode: Target chips glow for reordering
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onUseSkill = null; // Callback: (chipIndex) => void
let currentPopupIndex = -1;
let swapModeSourceIndex = -1;
let swapBlockCheckInterval = null;
let onReorder = null;
let isBlocked = null;

/** Initialize chip row with skill callback and swap support */
export function init({ useSkillCallback, onReorder: reorderCallback, isBlocked: blockedCallback, getChipIds }) {
  onUseSkill = useSkillCallback;
  onReorder = reorderCallback;
  isBlocked = blockedCallback;

  // Dismiss popup and cancel swap on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip-slot') && !e.target.closest('.chip-popup')) {
      hidePopup();
      exitSwapMode();
    }
  });
}

/**
 * Render all 5 chip slots
 * @param {Array} chips - Array of 5 chip objects (or null for empty slots)
 * @param {Object} options - { charges: [n,n,n,n,n], levels: [n,n,n,n,n], maxCharges: 5 }
 */
export function render(chips, { charges = [], levels = [], maxCharges = 5, inCombat = false } = {}) {
  const row = dom.chipRow;
  row.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const chip = chips[i] || null;
    const charge = charges[i] || 0;
    const level = levels[i] || 1;
    const isCharged = charge >= maxCharges;

    const slot = document.createElement('div');
    slot.className = 'chip-slot';
    slot.dataset.index = i;
    if (chip) {
      slot.dataset.chipId = chip.id;
    }

    // Chip icon
    const icon = document.createElement('div');
    icon.className = `chip-icon${chip ? '' : ' empty'}${isCharged ? ' charged' : ''}`;
    if (chip) {
      icon.style.backgroundImage = `url('/assets/icons/chips/${chip.id}.webp')`;
      icon.style.borderColor = getChipColor(chip);
    }

    // Level badge (only if > 1)
    if (chip && level > 1) {
      icon.style.position = 'relative';
      const badge = document.createElement('span');
      badge.className = 'chip-level-badge';
      badge.textContent = `${level}`;
      icon.appendChild(badge);
    }

    slot.appendChild(icon);

    // Charge bar (5 segments)
    if (chip) {
      const bar = document.createElement('div');
      bar.className = 'chip-charge-bar';
      for (let s = 0; s < maxCharges; s++) {
        const seg = document.createElement('div');
        seg.className = `chip-charge-segment${s < charge ? ' filled' : ''}`;
        bar.appendChild(seg);
      }
      slot.appendChild(bar);
    }

    // Tap handler
    if (chip) {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();

        // If in swap mode, handle swap logic
        if (swapModeSourceIndex !== -1) {
          if (i === swapModeSourceIndex) {
            // Clicking source chip cancels swap
            exitSwapMode();
          } else {
            // Clicking another chip completes swap
            completeSwap(i);
          }
          return;
        }

        // Normal click - show popup
        showPopup(i, { ...chip, _level: level }, charge, maxCharges, inCombat);
      });
    } else {
      // Empty slot - if in swap mode, clicking cancels
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (swapModeSourceIndex !== -1) {
          exitSwapMode();
        }
      });
    }

    row.appendChild(slot);
  }
}

/** Show chip skill popup */
function showPopup(index, chip, charge, maxCharges, inCombat = false) {
  currentPopupIndex = index;
  const isCharged = charge >= maxCharges;

  const chipLevel = chip._level || 1;
  dom.chipPopupName.textContent = `${chip.name || chip.nameEn} Lv. ${chipLevel}`;
  dom.chipPopupDesc.innerHTML = `
    <div class="chip-popup-section">
      <div class="chip-popup-section-label">Passive</div>
      <div>${chip.description || chip.descriptionEn || 'No passive effect'}</div>
    </div>
    <div class="chip-popup-section">
      <div class="chip-popup-section-label">Skill: ${chip.skill?.name || chip.skill?.nameEn || 'None'}</div>
      <div>${chip.skill?.description || chip.skill?.descriptionEn || 'No skill'}</div>
    </div>
  `;

  if (inCombat) {
    dom.chipPopupCharge.textContent = isCharged ? 'Ready!' : `Charging ${charge}/${maxCharges}`;
    dom.chipPopupCharge.style.display = '';
    dom.chipPopupUse.style.display = '';
    dom.chipPopupUse.disabled = !isCharged;
    dom.chipPopupUse.onclick = () => {
      playSFX('chip-skill');
      if (onUseSkill) onUseSkill(index);
      hidePopup();
    };
  } else {
    dom.chipPopupCharge.style.display = 'none';
    dom.chipPopupUse.style.display = 'none';
  }

  // Swap button - always visible when chip exists
  dom.chipPopupSwap.style.display = '';
  dom.chipPopupSwap.disabled = isBlocked && isBlocked();
  dom.chipPopupSwap.onclick = () => {
    hidePopup();
    enterSwapMode(index);
  };

  // Position popup centered above the chip slot, clamped to viewport
  const slot = dom.chipRow.children[index];
  if (slot) {
    const rect = slot.getBoundingClientRect();
    const popup = dom.chipPopup;
    popup.style.position = 'fixed';
    popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    popup.style.left = '50%';
    popup.style.transform = 'translateX(-50%)';
    popup.style.width = '85vw';
    popup.style.maxWidth = '320px';
    popup.classList.add('visible');
  }
}

/** Hide chip popup */
function hidePopup() {
  dom.chipPopup.classList.remove('visible');
  currentPopupIndex = -1;
}

/** Enter swap mode for the given chip index */
function enterSwapMode(sourceIndex) {
  swapModeSourceIndex = sourceIndex;

  // Add glow to all other chip slots
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  slots.forEach((slot, i) => {
    if (i !== sourceIndex && !slot.querySelector('.chip-icon.empty')) {
      slot.classList.add('swap-target');
    }
  });

  // Check for blocking during swap mode
  swapBlockCheckInterval = setInterval(() => {
    if (isBlocked && isBlocked()) {
      exitSwapMode();
    }
  }, 100);
}

/** Exit swap mode without making changes */
function exitSwapMode() {
  if (swapModeSourceIndex === -1) return;

  swapModeSourceIndex = -1;

  if (swapBlockCheckInterval) {
    clearInterval(swapBlockCheckInterval);
    swapBlockCheckInterval = null;
  }

  // Remove glow from all slots
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  slots.forEach(slot => slot.classList.remove('swap-target'));
}

/** Complete swap between source and target */
function completeSwap(targetIndex) {
  if (swapModeSourceIndex === -1 || swapModeSourceIndex === targetIndex) {
    exitSwapMode();
    return;
  }

  const sourceIndex = swapModeSourceIndex;
  exitSwapMode();

  // Get current chip IDs and swap them
  const slots = dom.chipRow.querySelectorAll('.chip-slot');
  const chipIds = Array.from(slots).map(slot => {
    const icon = slot.querySelector('.chip-icon:not(.empty)');
    return icon ? slot.dataset.chipId : null;
  });

  // Swap the two positions
  const temp = chipIds[sourceIndex];
  chipIds[sourceIndex] = chipIds[targetIndex];
  chipIds[targetIndex] = temp;

  playSFX('chip-lift');

  if (onReorder) {
    onReorder(chipIds);
  }
}

/** Check if currently in swap mode */
export function isInSwapMode() {
  return swapModeSourceIndex !== -1;
}

/** Get color for chip based on rarity */
function getChipColor(chip) {
  const colors = {
    common: '#95a5a6',
    uncommon: '#27ae60',
    rare: '#3498db',
    epic: '#8e44ad',
    legendary: '#f39c12',
  };
  return colors[chip.rarity] || colors.common;
}

/** Get display initial for chip icon (placeholder until art) */
function getChipInitial(chip) {
  const name = chip.name || chip.nameEn || '?';
  return name.charAt(0).toUpperCase();
}
