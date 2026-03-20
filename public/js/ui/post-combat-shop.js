/**
 * @file post-combat-shop.js - Post-Combat Item Shop
 *
 * PURPOSE:
 * Shows 3 random items after each creature combat victory. Player picks one.
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
import { prefetchWord, playWord } from '../tts.js';
import { renderJpFirst, renderEnFirst, flushExposures } from './bootstrap-client.js';
import { buildItemEffectPills } from './item-effect-pills.js';

let onItemSelected = null;

const RARITY_COLORS = {
  common: '#aaa',
  uncommon: '#4fc3f7',
  rare: '#ab47bc',
  epic: '#ff7043',
  legendary: '#ffd740'
};

const TYPE_ICONS = {
  heal: '💚',
  boost: '⬆️',
  mpRestore: '🔵',
  revive: '💫',
  keepsake: '🔒'
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
          const itemNameHtml = renderJpFirst(item.word, item.reading, item.meaning);
          const itemDescHtml = item.descriptionTagged
            ? renderEnFirst(item.descriptionTagged)
            : (isJapanified() && item.descriptionJa ? item.descriptionJa : item.description);
          return `
          <div class="shop-item-card" data-index="${i}" style="border-color: ${rarityColor}40; position: relative;">
            <div class="shop-item-rarity-badge" style="background: ${rarityColor}">${(item.rarity || 'common').toUpperCase()}</div>
            <button class="shop-help-btn" data-item-index="${i}">?</button>
            <div class="text-sprite shop-item-sprite">${item.word || '？'}</div>
            <div class="shop-item-info">
              <div class="shop-item-word">${itemNameHtml}</div>
              <div class="shop-item-effect">${buildItemEffectPills(item)}</div>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  // Report i+1 word exposures to server
  flushExposures();

  // Prefetch audio for all item words
  items.forEach(item => { if (item.word) prefetchWord(item.word); });

  const cards = actionArea.querySelectorAll('.shop-item-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index, 10);
      playSFX('creature-equip');
      if (items[index]?.word) playWord(items[index].word);
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      cards.forEach(c => c.style.pointerEvents = 'none');
      if (onItemSelected) onItemSelected(index);
    });
  });

  // Help button (?) — show item detail popup
  actionArea.querySelectorAll('.shop-help-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.itemIndex);
      const item = items[idx];
      if (!item) return;
      document.querySelector('.item-help-backdrop')?.remove();
      const nameHtml = renderJpFirst(item.word, item.reading, item.meaning);
      const descHtml = item.descriptionTagged
        ? renderEnFirst(item.descriptionTagged)
        : (item.description || '');
      const backdrop = document.createElement('div');
      backdrop.className = 'item-help-backdrop';
      backdrop.innerHTML = `
        <div class="item-help-popup">
          <div class="item-help-name">${nameHtml}</div>
          <div class="item-help-pills">${buildStatPills(item)}</div>
          <div class="item-help-desc">${descHtml}</div>
        </div>
      `;
      backdrop.addEventListener('click', () => backdrop.remove());
      document.body.appendChild(backdrop);
    });
  });
}

export function hide() {
  const actionArea = dom.actionArea;
  if (actionArea) actionArea.innerHTML = '';
}
