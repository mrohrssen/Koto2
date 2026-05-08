import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import { prefetchWord, playWord } from '../tts.js';
import { renderJpSentence, renderEnFirst, getKnownWords, entityToToken } from './bootstrap-client.js';
import { buildItemEffectPills } from './item-effect-pills.js';
import { itemSpriteHtml } from './sprite-utils.js';
import { renderChoices } from './ui-components.js';
import { showItemTargetPicker } from './item-target-picker.js';

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
    heading: 'Choose an item',
    cards: items.map(item => {
      const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
      return {
        sprite: itemSpriteHtml(item.id, item.word),
        title: renderJpSentence([entityToToken(item)], getKnownWords(), new Map()),
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
  const nameHtml = renderJpSentence([entityToToken(item)], getKnownWords(), new Map());
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
  showItemTargetPicker(creatures, onPicked);
}

export function hide() {
  const actionArea = dom.actionArea;
  if (actionArea) actionArea.innerHTML = '';
}
