/**
 * @file post-combat-shop.js - Post-Combat Item Shop
 *
 * PURPOSE:
 * Shows 3 random items after each combat victory. Player picks one.
 * Stat boosts stack permanently for the run. Heals apply immediately.
 *
 * KEY EXPORTS:
 * - init({ itemSelectedCallback }): Setup with selection callback
 * - show(items): Display 3 item cards
 * - hide(): Clear the shop display
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';

let onItemSelected = null;

const ITEM_ICONS = {
  'atk-boost': '⚔️',
  'hp-boost': '❤️',
  'auto-power': '🔄',
  'ultimate-power': '💥',
  'element-edge': '🔷',
  'thick-armor': '🛡️',
  'team-heal': '💚',
  'patch-up': '🩹',
  'revive': '✨',
  'quick-charge': '⚡'
};

export function init({ itemSelectedCallback }) {
  onItemSelected = itemSelectedCallback;
}

export function show(items) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  actionArea.innerHTML = `
    <div class="post-combat-shop">
      <div class="shop-title">Choose a Reward</div>
      <div class="shop-items">
        ${items.map((item, i) => `
          <div class="shop-item-card" data-index="${i}">
            <div class="shop-item-icon">${ITEM_ICONS[item.id] || '📦'}</div>
            <div class="shop-item-name">${item.nameEn}</div>
            <div class="shop-item-desc">${item.description}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const cards = actionArea.querySelectorAll('.shop-item-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index, 10);
      playSFX('chip-equip');
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      cards.forEach(c => c.style.pointerEvents = 'none');
      if (onItemSelected) onItemSelected(index);
    });
  });
}

export function hide() {
  const actionArea = dom.actionArea;
  if (actionArea) actionArea.innerHTML = '';
}
