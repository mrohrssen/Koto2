/**
 * @file robot-row.js - Robot Slots Display
 *
 * PURPOSE:
 * Renders 3 robot slots at the bottom of the combat screen using
 * dom.chipRow and dom.chipPopup containers. Shows robot-specific content:
 * element icons, HP bars, charge bars, and ultimate popups.
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
import { configureRobotImg } from './sprite-utils.js';

function rarityStars(rarity) {
  const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity];
  return n ? `<span style="color:#FFD700">${n}★</span>` : '';
}

let onUseUltimate = null;
let currentPopupIndex = -1;
let onSwapRobot = null;
let onRearrangeRobot = null;
let currentReserves = [];
let currentActiveRobots = [];

export const ELEMENT_COLORS = {
  wood: '#4CAF50',
  fire: '#F44336',
  earth: '#8D6E63',
  metal: '#9E9E9E',
  water: '#2196F3'
};

export const ELEMENT_ICONS = {
  wood: '🌿',
  fire: '🔥',
  earth: '⛰️',
  metal: '⚙️',
  water: '💧'
};

export function init({ useUltimateCallback, swapRobotCallback, rearrangeRobotCallback }) {
  onUseUltimate = useUltimateCallback;
  onSwapRobot = swapRobotCallback;
  onRearrangeRobot = rearrangeRobotCallback || null;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.robot-slot') && !e.target.closest('.robot-popup')) {
      hidePopup();
    }
  });
}

export function setReserves(reserves) {
  currentReserves = reserves || [];
}

/**
 * Update robot data without full DOM re-render.
 * Keeps popup charge checks in sync during combat.
 */
export function updateData(robots) {
  currentActiveRobots = robots || [];
}

export function render(robots) {
  const row = dom.chipRow;
  row.innerHTML = '';
  currentActiveRobots = robots || [];

  for (let i = 0; i < 3; i++) {
    const robot = robots[i] || null;
    const slot = document.createElement('div');
    slot.className = 'robot-slot' + (robot ? '' : ' empty');
    slot.dataset.index = i;

    if (robot) {
      const hpPct = Math.max(0, (robot.hp / robot.maxHp) * 100);
      const isCharged = robot.ultimate.charges >= robot.ultimate.chargesRequired;
      const isKO = robot.hp <= 0;
      const hpColor = hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';
      const xpNeeded = Math.pow(robot.level + 1, 3) - Math.pow(robot.level, 3);
      const xpPct = Math.min(100, (robot.xp / xpNeeded) * 100);

      slot.innerHTML = `
        <div class="robot-icon${isKO ? ' ko' : ''}${isCharged ? ' charged' : ''}"
             style="border-color: ${ELEMENT_COLORS[robot.element]}">
          <img class="robot-sprite-icon" alt="">
          <span class="robot-element-icon" style="display:none">${ELEMENT_ICONS[robot.element]}</span>
          <span class="robot-level-badge">Lv${robot.level}</span>
        </div>
        <div class="robot-slot-name">${robot.nameEn}</div>
        <div class="robot-hp-bar">
          <div class="robot-hp-fill" style="width: ${hpPct}%; background-color: ${hpColor}"></div>
        </div>
        <div class="robot-xp-bar">
          <div class="robot-xp-fill" style="width: ${xpPct}%"></div>
        </div>
        <div class="robot-charge-bar">
          ${buildChargeSegments(robot.ultimate.charges, robot.ultimate.chargesRequired)}
        </div>
      `;

      const spriteImg = slot.querySelector('.robot-sprite-icon');
      configureRobotImg(spriteImg, robot.id, el => {
        el.style.display = 'none';
        el.nextElementSibling.style.display = '';
      });

      slot.addEventListener('click', () => togglePopup(i));
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

function togglePopup(index) {
  if (currentPopupIndex === index) {
    hidePopup();
    return;
  }
  const robot = currentActiveRobots[index];
  if (!robot) return;
  showPopup(index, robot);
}

function showPopup(index, robot) {
  currentPopupIndex = index;
  const isReady = robot.ultimate.charges >= robot.ultimate.chargesRequired;
  const hasReserves = currentReserves.length > 0;
  const isKO = robot.hp <= 0;

  // BUG A fix: Build rearrange buttons for other active robots when no reserves
  const otherActives = currentActiveRobots
    .map((r, i) => ({ robot: r, index: i }))
    .filter(entry => entry.robot && entry.index !== index && entry.robot.hp > 0);
  const canRearrange = !hasReserves && otherActives.length > 0 && onRearrangeRobot;

  const archetypeLabel = robot.archetype || 'Fighter';

  dom.chipPopup.innerHTML = `
    <div class="robot-popup-name">${robot.name} (${robot.nameEn}) ${rarityStars(robot.rarity)}</div>
    <div class="robot-popup-element">${ELEMENT_ICONS[robot.element]} ${robot.element}</div>
    <div class="robot-popup-archetype">${archetypeLabel}</div>
    <div class="robot-popup-stats">
      HP: ${robot.hp}/${robot.maxHp} | ATK: ${robot.attack}
    </div>
    ${!isKO ? `
      <div class="robot-popup-ultimate">
        Ultimate: ${robot.ultimate.name} (${robot.ultimate.nameEn})
        <br>Power: ${robot.ultimate.power} | Charges: ${robot.ultimate.charges}/${robot.ultimate.chargesRequired}
      </div>
      <button class="robot-popup-ultimate-btn" ${isReady ? '' : 'disabled'}>
        ${isReady ? 'Use Ultimate' : `${robot.ultimate.charges}/${robot.ultimate.chargesRequired} Charges`}
      </button>
    ` : ''}
    ${hasReserves ? `
      <div class="robot-popup-swap-section">
        <div class="robot-popup-swap-label">Swap with:</div>
        <div class="robot-popup-swap-list">
          ${currentReserves.map((r, ri) => `
            <button class="robot-popup-swap-btn" data-reserve-index="${ri}">
              ${ELEMENT_ICONS[r.element]} ${r.nameEn} (Lv${r.level}) ${r.hp}/${r.maxHp}HP
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${canRearrange ? `
      <div class="robot-popup-swap-section">
        <div class="robot-popup-swap-label">Swap position with:</div>
        <div class="robot-popup-swap-list">
          ${otherActives.map(entry => `
            <button class="robot-popup-rearrange-btn" data-target-index="${entry.index}">
              ${ELEMENT_ICONS[entry.robot.element]} ${entry.robot.nameEn} (Lv${entry.robot.level})
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
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

  // Swap button handlers (swap with reserves)
  const swapBtns = dom.chipPopup.querySelectorAll('.robot-popup-swap-btn');
  swapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const reserveIndex = parseInt(btn.dataset.reserveIndex, 10);
      hidePopup();
      if (onSwapRobot) onSwapRobot(index, reserveIndex);
    });
  });

  // Rearrange button handlers (swap positions between active robots)
  const rearrangeBtns = dom.chipPopup.querySelectorAll('.robot-popup-rearrange-btn');
  rearrangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetIndex = parseInt(btn.dataset.targetIndex, 10);
      hidePopup();
      if (onRearrangeRobot) onRearrangeRobot(index, targetIndex);
    });
  });
}

function hidePopup() {
  currentPopupIndex = -1;
  dom.chipPopup.classList.remove('visible');
}

export function isPopupVisible() {
  return currentPopupIndex >= 0;
}
