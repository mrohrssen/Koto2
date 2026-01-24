/**
 * Chip Row UI Module - Renders 5 chip slots with charges and skill popup
 *
 * Per spec: circular icons, 5-segment charge bars, golden pulse when charged,
 * tap to show skill popup with "Use Skill" button
 */

import { dom } from '../dom.js';

let onUseSkill = null; // Callback: (chipIndex) => void
let currentPopupIndex = -1;

/** Initialize chip row with skill callback */
export function init({ useSkillCallback }) {
  onUseSkill = useSkillCallback;

  // Dismiss popup on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip-slot') && !e.target.closest('.chip-popup')) {
      hidePopup();
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

    // Chip icon
    const icon = document.createElement('div');
    const chipColor = chip ? getChipColor(chip) : 'transparent';
    icon.className = `chip-icon${chip ? '' : ' empty'}${isCharged ? ' charged' : ''}`;
    icon.style.background = chip ? chipColor : '';
    icon.textContent = chip ? getChipInitial(chip) : '';

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

    // Tap handler (combat only)
    if (chip && inCombat) {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup(i, chip, charge, maxCharges);
      });
    }

    row.appendChild(slot);
  }
}

/** Show chip skill popup */
function showPopup(index, chip, charge, maxCharges) {
  currentPopupIndex = index;
  const isCharged = charge >= maxCharges;

  dom.chipPopupName.textContent = chip.skill?.nameEn || chip.nameEn || chip.name;
  dom.chipPopupDesc.textContent = chip.skill?.descriptionEn || chip.description || '';
  dom.chipPopupCharge.textContent = isCharged ? 'Ready!' : `Charging ${charge}/${maxCharges}`;
  dom.chipPopupUse.disabled = !isCharged;
  dom.chipPopupUse.onclick = () => {
    if (onUseSkill) onUseSkill(index);
    hidePopup();
  };

  // Position popup near the chip slot
  const slot = dom.chipRow.children[index];
  if (slot) {
    const rect = slot.getBoundingClientRect();
    const popup = dom.chipPopup;
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    popup.style.transform = 'translateX(-50%)';
    popup.style.position = 'fixed';
    popup.classList.add('visible');
  }
}

/** Hide chip popup */
function hidePopup() {
  dom.chipPopup.classList.remove('visible');
  currentPopupIndex = -1;
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
  const name = chip.nameEn || chip.name || '?';
  return name.charAt(0).toUpperCase();
}
