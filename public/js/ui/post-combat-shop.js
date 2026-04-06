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
import { prefetchWord, playWord } from '../tts.js';
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';
import { buildItemEffectPills } from './item-effect-pills.js';
import { creatureSpriteHtml, itemSpriteHtml } from './sprite-utils.js';
import { renderChoices } from './ui-components.js';

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

  // Prefetch audio for all item words
  items.forEach(item => { if (item.word) prefetchWord(item.word); });

  renderChoices({
    cards: items.map(item => {
      const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
      return {
        sprite: itemSpriteHtml(item.id, item.word),
        title: renderJpFirst(item.word, item.reading, item.nameEn),
        pills: buildItemEffectPills(item),
        badge: { text: (item.rarity || 'common').toUpperCase(), color: rarityColor },
        helpBtn: () => showItemHelpPopup(item),
      };
    }),
    onSelect: (index) => {
      playSFX('creature-equip');
      if (items[index]?.word) playWord(items[index].word);
      if (onItemSelected) onItemSelected(index);
    },
    container: actionArea,
  });
}

function showItemHelpPopup(item) {
  document.querySelector('.item-help-backdrop')?.remove();
  const nameHtml = renderJpFirst(item.word, item.reading, item.nameEn);
  const descHtml = item.descriptionTagged
    ? renderEnFirst(item.descriptionTagged)
    : (item.description || '');
  const backdrop = document.createElement('div');
  backdrop.className = 'item-help-backdrop';
  backdrop.innerHTML = `
    <div class="item-help-popup">
      <div class="item-help-name">${nameHtml}</div>
      <div class="item-help-pills">${buildItemEffectPills(item)}</div>
      <div class="item-help-desc">${descHtml}</div>
    </div>
  `;
  backdrop.addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}

/**
 * Show creature target picker after item selection.
 * @param {Array} creatures - Active creatures to choose from
 * @param {Function} onPicked - Callback with (targetIndex)
 */
export function showTargetPicker(creatures, onPicked) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  renderChoices({
    cards: creatures.filter(Boolean).map((c, i) => ({
      sprite: creatureSpriteHtml(c.id, c.baseWord || c.name, c.element),
      title: `${c.baseReading || c.name} (${c.nameEn})`,
      subtitle: `Lv${c.level} · HP ${c.hp}/${c.maxHp}`,
    })),
    onSelect: (index) => {
      playSFX('creature-equip');
      if (onPicked) onPicked(index);
    },
    container: actionArea,
  });
}

export function hide() {
  const actionArea = dom.actionArea;
  if (actionArea) actionArea.innerHTML = '';
}
