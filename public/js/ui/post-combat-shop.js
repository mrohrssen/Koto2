/**
 * @file post-combat-shop.js - Post-Combat Item Shop
 *
 * PURPOSE:
 * Shows 3 random items after each robot combat victory. Player picks one.
 * Each item teaches a Japanese vocabulary word.
 * Stat boosts stack permanently for the run. Heals apply immediately.
 *
 * KEY EXPORTS:
 * - init({ itemSelectedCallback }): Setup with selection callback
 * - show(items): Display 3 item cards
 * - hide(): Clear the shop display
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import { t, isJapanified } from './i18n.js';

let onItemSelected = null;

const RARITY_COLORS = {
  common: '#aaa',
  uncommon: '#4fc3f7',
  rare: '#ab47bc',
  epic: '#ff7043',
  legendary: '#ffd740'
};

const TYPE_ICONS = {
  stat: '⬆️',
  heal: '💚',
  utility: '⚡'
};

export function init({ itemSelectedCallback }) {
  onItemSelected = itemSelectedCallback;
}

export function show(items) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  actionArea.innerHTML = `
    <div class="post-combat-shop">
      <div class="shop-title">${t('chooseReward')}</div>
      <div class="shop-items">
        ${items.map((item, i) => {
          const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
          const icon = TYPE_ICONS[item.type] || '📦';
          return `
          <div class="shop-item-card" data-index="${i}" style="border-color: ${rarityColor}40">
            <div class="shop-item-rarity" style="color: ${rarityColor}">${item.rarity || 'common'}</div>
            <img class="shop-item-sprite" src="/assets/sprites/items/${item.id}.webp" alt="${item.meaning}" />
            <div class="shop-item-word">${item.word}</div>
            <div class="shop-item-reading">${item.reading}</div>
            <div class="shop-item-meaning">${item.meaning}</div>
            <div class="shop-item-divider"></div>
            <div class="shop-item-effect">${icon} ${isJapanified() && item.descriptionJa ? item.descriptionJa : item.description}</div>
          </div>
        `}).join('')}
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
