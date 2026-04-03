/**
 * @file creature-row.js - Creature Slots Display
 *
 * PURPOSE:
 * Renders the player formation in the scene area using showFormation() from scene.js,
 * then attaches popup click handlers to the resulting .formation-slot elements.
 * Shows creature details in a popup: element icons, HP/MP stats, move list, swap buttons.
 *
 * KEY EXPORTS:
 * - init({ swapCreatureCallback, rearrangeCreatureCallback }): Setup callbacks
 * - render(creatures): Draw all 3 creature slots via scene.js formation
 * - isPopupVisible(): Check if a creature popup is currently open
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (playerFormation, creaturePopup)
 * - ./scene.js: showFormation(), hideFormation()
 */

import { dom } from '../dom.js';
import { showFormation, hideFormation } from './scene.js';
import { renderJpFirst, flushExposures } from './bootstrap-client.js';

function rarityStars(rarity) {
  const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity];
  return n ? `<span style="color:#FFD700">${n}★</span>` : '';
}

let currentPopupIndex = -1;
let onSwapCreature = null;
let onRearrangeCreature = null;
let currentReserves = [];
let currentActiveCreatures = [];
let _creatures = [];
/** @type {() => object|undefined|null} */
let getItemBuffs = null;

/** Level multiplier matching server getStatsForLevel */
function levelMult(level) {
  return 1 + ((level || 1) - 1) * 0.1;
}

/** Match server getBuffedAttack (item-service): base bonus + % mult */
function effectiveAttack(creature) {
  const buffs = creature?.itemBuffs;
  let n = Math.max(1, Math.floor(Number(creature?.attack) || 0));
  // Flat base bonus scaled by level (equipment)
  const bonus = buffs?.baseAttackBonus || 0;
  if (bonus && creature?.level) {
    n += Math.floor(bonus * levelMult(creature.level));
  }
  // % multiplier (food items)
  const mult = Number(buffs?.attackMult) || 1;
  if (!(mult > 0) || mult === 1.0) return n;
  const raw = n * mult;
  if (mult <= 1) return Math.max(1, Math.floor(raw));
  let out = Math.floor(raw);
  if (out === n && raw > n + 1e-9) out = n + 1;
  return Math.max(1, out);
}

/** Calculate total ATK bonus from all item buffs for display */
function attackBonus(creature) {
  const base = Math.max(1, Math.floor(Number(creature?.attack) || 0));
  return effectiveAttack(creature) - base;
}

/** Build per-creature item buffs + equipment sections for popup */
function buildBuffsSummary(creature) {
  let html = '';
  const buffs = creature?.itemBuffs;

  // Food / consumable buffs (% multipliers)
  if (buffs) {
    const lines = [];
    if (buffs.attackMult > 1.0) lines.push(`ATK ×${buffs.attackMult.toFixed(2)}`);
    if (buffs.flatDamageReduction > 0) lines.push(`DMG Reduce ${buffs.flatDamageReduction}`);
    if (buffs.elementEdge > 0) lines.push(`Elem Edge +${buffs.elementEdge}`);
    if (lines.length > 0) {
      html += `
        <div class="creature-popup-buffs">
          <div class="creature-popup-buffs-label">Item Buffs:</div>
          <div class="creature-popup-buffs-list">${lines.join(' · ')}</div>
        </div>`;
    }
  }

  // Equipment list with per-item effects
  const equipped = creature?.equippedItems || [];
  if (equipped.length > 0) {
    const lm = levelMult(creature?.level);
    html += `
      <div class="creature-popup-equipment">
        <div class="creature-popup-equipment-label">Equipment:</div>
        ${equipped.map(item => {
          const desc = item.description || '';
          return `<div class="creature-popup-equipment-row">${item.word} (${item.nameEn}) <span class="equip-effect">${desc}</span></div>`;
        }).join('')}
        <div class="creature-popup-equipment-totals">
          ${buffs?.baseAttackBonus > 0 ? `ATK +${Math.floor(buffs.baseAttackBonus * lm)}` : ''}
          ${buffs?.baseHpBonus > 0 ? ` HP +${Math.floor(buffs.baseHpBonus * lm)}` : ''}
          ${buffs?.baseMpBonus > 0 ? ` MP +${Math.floor(buffs.baseMpBonus * lm)}` : ''}
        </div>
      </div>`;
  }

  return html;
}

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

/** @type {() => Array|undefined|null} */
let getEquippedItems = null;

export function init({ swapCreatureCallback, rearrangeCreatureCallback, getItemBuffs: getBuffs, getEquippedItems: getEquip }) {
  onSwapCreature = swapCreatureCallback;
  onRearrangeCreature = rearrangeCreatureCallback || null;
  getItemBuffs = typeof getBuffs === 'function' ? getBuffs : null;
  getEquippedItems = typeof getEquip === 'function' ? getEquip : null;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.formation-slot') && !e.target.closest('.creature-popup')) {
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
  _creatures = creatures;
  currentActiveCreatures = creatures || [];
  showFormation('player', creatures);

  // Attach popup click handlers to formation slots
  const slots = dom.playerFormation.querySelectorAll('.formation-slot');
  slots.forEach(slot => {
    const idx = parseInt(slot.dataset.index, 10);
    slot.addEventListener('click', () => {
      if (_creatures[idx]) togglePopup(idx);
    });
  });
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

  const popupSubtitle = creature.modifier
    ? renderJpFirst(creature.modifier.word, creature.modifier.reading, creature.modifier.meaning)
      + 'の'
      + renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning)
    : renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning);

  dom.creaturePopup.innerHTML = `
    <div class="creature-popup-name">${creature.name} (${creature.nameEn}) ${rarityStars(creature.rarity)}</div>
    <div class="creature-popup-subtitle">${popupSubtitle}</div>
    <div class="creature-popup-element">${ELEMENT_ICONS[creature.element]} ${creature.element}</div>
    <div class="creature-popup-archetype">${archetypeLabel}</div>
    <div class="creature-popup-stats">
      HP: ${creature.hp}/${creature.maxHp} | ATK: ${effectiveAttack(creature)}${attackBonus(creature) > 0 ? ` <span class="buff-bonus">(+${attackBonus(creature)})</span>` : ''} | DEF: ${creature.defense ?? 5} | MP: ${creature.mp}/${creature.maxMp}
    </div>
    ${buildBuffsSummary(creature)}
    ${!isKO ? `
      <div class="creature-popup-moves">
        <div class="creature-popup-moves-label">Moves:</div>
        ${creature.moves.map(m => `
          <div class="creature-popup-move-row">
            <span style="color:${ELEMENT_COLORS[m.element] || '#888'}">●</span>
            ${m.name} (${m.nameEn}) — ${m.category} ${m.power}pw ${m.mpCost ?? 0}mp
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

  // Position relative to formation slot
  const slot = dom.playerFormation.querySelector(`.formation-slot[data-index="${index}"]`);
  if (slot) {
    const rect = slot.getBoundingClientRect();
    dom.creaturePopup.style.position = 'fixed';
    dom.creaturePopup.style.left = rect.left + 'px';
    dom.creaturePopup.style.top = (rect.bottom + 8) + 'px';
    dom.creaturePopup.style.bottom = 'auto';
  }
  dom.creaturePopup.classList.add('visible');
  flushExposures();

  // Swap button handlers (swap with reserves)
  const swapBtns = dom.creaturePopup.querySelectorAll('.creature-popup-swap-btn');
  swapBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const reserveIndex = parseInt(btn.dataset.reserveIndex, 10);
      hidePopup();
      if (onSwapCreature) onSwapCreature(index, reserveIndex);
    });
  });

  // Rearrange button handlers (swap positions between active creatures)
  const rearrangeBtns = dom.creaturePopup.querySelectorAll('.creature-popup-rearrange-btn');
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
  dom.creaturePopup.classList.remove('visible');
}

export function isPopupVisible() {
  return currentPopupIndex >= 0;
}
