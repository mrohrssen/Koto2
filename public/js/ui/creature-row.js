/**
 * @file creature-row.js - Creature Slots Display
 *
 * PURPOSE:
 * Renders 3 creature slots at the bottom of the combat screen using
 * dom.chipRow and dom.chipPopup containers. Shows creature-specific content:
 * element icons, HP bars, MP bars, and move list popups.
 *
 * KEY EXPORTS:
 * - init({ swapCreatureCallback, rearrangeCreatureCallback }): Setup callbacks
 * - render(creatures): Draw all 3 creature slots
 * - isPopupVisible(): Check if a creature popup is currently open
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (chipRow, chipPopup)
 * - ../audio.js: Sound effects (chip-skill)
 */

import { dom } from '../dom.js';
import { configureCreatureImg, creatureStaticPath } from './sprite-utils.js';

function rarityStars(rarity) {
  const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity];
  return n ? `<span style="color:#FFD700">${n}★</span>` : '';
}

let currentPopupIndex = -1;
let onSwapCreature = null;
let onRearrangeCreature = null;
let currentReserves = [];
let currentActiveCreatures = [];

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

export function init({ swapCreatureCallback, rearrangeCreatureCallback }) {
  onSwapCreature = swapCreatureCallback;
  onRearrangeCreature = rearrangeCreatureCallback || null;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.creature-slot') && !e.target.closest('.creature-popup')) {
      hidePopup();
    }
  });
}

export function setReserves(reserves) {
  currentReserves = reserves || [];
}

/**
 * Update creature data without full DOM re-render.
 * Keeps popup charge checks in sync during combat.
 */
export function updateData(creatures) {
  currentActiveCreatures = creatures || [];
}

export function render(creatures) {
  const row = dom.chipRow;
  row.innerHTML = '';
  currentActiveCreatures = creatures || [];

  for (let i = 0; i < 3; i++) {
    const creature = creatures[i] || null;
    const slot = document.createElement('div');
    slot.className = 'creature-slot' + (creature ? '' : ' empty');
    slot.dataset.index = i;

    if (creature) {
      const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
      const isKO = creature.hp <= 0;
      const hpColor = hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';
      // Must match xpToNextLevel() in src/game/creatures.js
      const xpNeeded = Math.pow(creature.level + 1, 3) - Math.pow(creature.level, 3);
      const xpPct = Math.min(100, (creature.xp / xpNeeded) * 100);

      slot.innerHTML = `
        <div class="creature-icon${isKO ? ' ko' : ''}"
             style="border-color: ${ELEMENT_COLORS[creature.element]}">
          <img class="creature-sprite-icon" alt="">
          <span class="creature-element-icon" style="display:none">${ELEMENT_ICONS[creature.element]}</span>
          <span class="creature-level-badge">Lv${creature.level}</span>
        </div>
        <div class="creature-slot-name">${creature.nameEn}</div>
        <div class="creature-hp-bar">
          <div class="creature-hp-fill" style="width: ${hpPct}%; background-color: ${hpColor}"></div>
        </div>
        <div class="creature-xp-bar">
          <div class="creature-xp-fill" style="width: ${xpPct}%"></div>
        </div>
        <div class="creature-mp-bar">
          <div class="creature-mp-fill" style="width:${(creature.mp / creature.maxMp) * 100}%"></div>
          <span class="creature-mp-text">${creature.mp}/${creature.maxMp}</span>
        </div>
      `;

      const spriteImg = slot.querySelector('.creature-sprite-icon');
      if (isKO) {
        // Use static sprite for KO creatures (no idle animation)
        spriteImg.src = creatureStaticPath(creature.id);
        spriteImg.onerror = () => {
          spriteImg.style.display = 'none';
          spriteImg.nextElementSibling.style.display = '';
        };
      } else {
        configureCreatureImg(spriteImg, creature.id, el => {
          el.style.display = 'none';
          el.nextElementSibling.style.display = '';
        });
      }

      slot.addEventListener('click', () => togglePopup(i));
    }
    row.appendChild(slot);
  }
}

function togglePopup(index) {
  if (currentPopupIndex === index) {
    hidePopup();
    return;
  }
  const creature = currentActiveCreatures[index];
  if (!creature) return;
  showPopup(index, creature);
}

function showPopup(index, creature) {
  currentPopupIndex = index;
  const hasReserves = currentReserves.length > 0;
  const isKO = creature.hp <= 0;

  // BUG A fix: Build rearrange buttons for other active creatures when no reserves
  const otherActives = currentActiveCreatures
    .map((r, i) => ({ creature: r, index: i }))
    .filter(entry => entry.creature && entry.index !== index && entry.creature.hp > 0);
  const canRearrange = !hasReserves && otherActives.length > 0 && onRearrangeCreature;

  const archetypeLabel = creature.archetype || 'Fighter';

  dom.chipPopup.innerHTML = `
    <div class="creature-popup-name">${creature.name} (${creature.nameEn}) ${rarityStars(creature.rarity)}</div>
    <div class="creature-popup-element">${ELEMENT_ICONS[creature.element]} ${creature.element}</div>
    <div class="creature-popup-archetype">${archetypeLabel}</div>
    <div class="creature-popup-stats">
      HP: ${creature.hp}/${creature.maxHp} | ATK: ${creature.attack} | MP: ${creature.mp}/${creature.maxMp}
    </div>
    ${!isKO ? `
      <div class="creature-popup-moves">
        <div class="creature-popup-moves-label">Moves:</div>
        ${creature.moves.map(m => `
          <div class="creature-popup-move-row">
            <span style="color:${ELEMENT_COLORS[m.element] || '#888'}">●</span>
            ${m.name} (${m.nameEn}) — ${m.category} ${m.power}pw ${m.mpCost}mp
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${hasReserves ? `
      <div class="creature-popup-swap-section">
        <div class="creature-popup-swap-label">Swap with:</div>
        <div class="creature-popup-swap-list">
          ${currentReserves.map((r, ri) => `
            <button class="creature-popup-swap-btn" data-reserve-index="${ri}">
              ${ELEMENT_ICONS[r.element]} ${r.nameEn} (Lv${r.level}) ${r.hp}/${r.maxHp}HP
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${canRearrange ? `
      <div class="creature-popup-swap-section">
        <div class="creature-popup-swap-label">Swap position with:</div>
        <div class="creature-popup-swap-list">
          ${otherActives.map(entry => `
            <button class="creature-popup-rearrange-btn" data-target-index="${entry.index}">
              ${ELEMENT_ICONS[entry.creature.element]} ${entry.creature.nameEn} (Lv${entry.creature.level})
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // Position popup centered above the creature slot, clamped to viewport
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

  // Swap button handlers (swap with reserves)
  const swapBtns = dom.chipPopup.querySelectorAll('.creature-popup-swap-btn');
  swapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const reserveIndex = parseInt(btn.dataset.reserveIndex, 10);
      hidePopup();
      if (onSwapCreature) onSwapCreature(index, reserveIndex);
    });
  });

  // Rearrange button handlers (swap positions between active creatures)
  const rearrangeBtns = dom.chipPopup.querySelectorAll('.creature-popup-rearrange-btn');
  rearrangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetIndex = parseInt(btn.dataset.targetIndex, 10);
      hidePopup();
      if (onRearrangeCreature) onRearrangeCreature(index, targetIndex);
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
