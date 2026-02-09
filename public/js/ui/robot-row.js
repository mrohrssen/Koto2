/**
 * @file robot-row.js - Robot Slots Display
 *
 * PURPOSE:
 * Renders 3 robot slots at the bottom of the combat screen. Reuses the same
 * DOM container as chip-row.js (dom.chipRow / dom.chipPopup) but renders
 * robot-specific content: element icons, HP bars, charge bars, and ultimate popups.
 *
 * KEY EXPORTS:
 * - init({ useUltimateCallback }): Setup with ultimate skill callback
 * - render(robots): Draw all 3 robot slots
 * - isPopupVisible(): Check if a robot popup is currently open
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (chipRow, chipPopup)
 * - ../audio.js: Sound effects (chip-skill)
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onUseUltimate = null;
let currentPopupIndex = -1;

const ELEMENT_COLORS = {
  wood: '#4CAF50',
  fire: '#F44336',
  earth: '#8D6E63',
  metal: '#9E9E9E',
  water: '#2196F3'
};

const ELEMENT_ICONS = {
  wood: '🌿',
  fire: '🔥',
  earth: '⛰️',
  metal: '⚙️',
  water: '💧'
};

export function init({ useUltimateCallback }) {
  onUseUltimate = useUltimateCallback;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.robot-slot') && !e.target.closest('.robot-popup')) {
      hidePopup();
    }
  });
}

export function render(robots) {
  const row = dom.chipRow;
  row.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const robot = robots[i] || null;
    const slot = document.createElement('div');
    slot.className = 'robot-slot' + (robot ? '' : ' empty');
    slot.dataset.index = i;

    if (!robot) {
      slot.innerHTML = '<div class="robot-icon empty"></div>';
    } else {
      const hpPct = Math.max(0, (robot.hp / robot.maxHp) * 100);
      const isCharged = robot.ultimate.charges >= robot.ultimate.chargesRequired;
      const isKO = robot.hp <= 0;

      slot.innerHTML = `
        <div class="robot-icon${isKO ? ' ko' : ''}${isCharged ? ' charged' : ''}"
             style="border-color: ${ELEMENT_COLORS[robot.element]}">
          <span class="robot-element-icon">${ELEMENT_ICONS[robot.element]}</span>
          <span class="robot-level-badge">Lv${robot.level}</span>
        </div>
        <div class="robot-hp-bar">
          <div class="robot-hp-fill" style="width: ${hpPct}%"></div>
        </div>
        <div class="robot-charge-bar">
          ${buildChargeSegments(robot.ultimate.charges, robot.ultimate.chargesRequired)}
        </div>
      `;

      if (!isKO) {
        slot.addEventListener('click', () => togglePopup(i, robot));
      }
    }
    row.appendChild(slot);
  }
}

function buildChargeSegments(charges, required) {
  let html = '';
  for (let i = 0; i < required; i++) {
    html += `<div class="charge-segment${i < charges ? ' filled' : ''}"></div>`;
  }
  return html;
}

function togglePopup(index, robot) {
  if (currentPopupIndex === index) {
    hidePopup();
    return;
  }
  showPopup(index, robot);
}

function showPopup(index, robot) {
  currentPopupIndex = index;
  const isReady = robot.ultimate.charges >= robot.ultimate.chargesRequired;

  dom.chipPopup.innerHTML = `
    <div class="robot-popup-name">${robot.name} (${robot.nameEn})</div>
    <div class="robot-popup-element">${ELEMENT_ICONS[robot.element]} ${robot.element}</div>
    <div class="robot-popup-stats">
      HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}
    </div>
    <div class="robot-popup-ultimate">
      Ultimate: ${robot.ultimate.name} (${robot.ultimate.nameEn})
      <br>Power: ${robot.ultimate.power} | Charges: ${robot.ultimate.charges}/${robot.ultimate.chargesRequired}
    </div>
    <button class="robot-popup-ultimate-btn" ${isReady ? '' : 'disabled'}>
      ${isReady ? 'Use Ultimate' : `${robot.ultimate.charges}/${robot.ultimate.chargesRequired} Charges`}
    </button>
  `;

  // Position popup centered above the robot slot, clamped to viewport
  const slot = dom.chipRow.children[index];
  if (slot) {
    const rect = slot.getBoundingClientRect();
    dom.chipPopup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    dom.chipPopup.style.left = '50%';
    dom.chipPopup.style.transform = 'translateX(-50%)';
    dom.chipPopup.style.width = '85vw';
    dom.chipPopup.style.maxWidth = '320px';
  }

  dom.chipPopup.classList.add('visible');

  const btn = dom.chipPopup.querySelector('.robot-popup-ultimate-btn');
  if (isReady && btn) {
    btn.addEventListener('click', () => {
      playSFX('chip-skill');
      hidePopup();
      if (onUseUltimate) onUseUltimate(index);
    });
  }
}

function hidePopup() {
  currentPopupIndex = -1;
  dom.chipPopup.classList.remove('visible');
}

export function isPopupVisible() {
  return currentPopupIndex >= 0;
}
