import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import { creatureStaticPath } from './sprite-utils.js';
import { renderChoices } from './ui-components.js';

export function getItemTargetEntries(creatures = []) {
  if (!Array.isArray(creatures)) return [];
  return creatures.flatMap((creature, targetIndex) => (
    creature ? [{ creature, targetIndex }] : []
  ));
}

/**
 * Shared creature target picker for applying items or item-like effects.
 * @param {Array} creatures - Active creatures to choose from
 * @param {Function} onPicked - Callback with target index
 */
export function showItemTargetPicker(creatures, onPicked) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;
  const targets = getItemTargetEntries(creatures);

  renderChoices({
    heading: 'Choose target',
    cards: targets.map(({ creature: c }) => ({
      sprite: `<img src="${creatureStaticPath(c.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
      title: `${c.reading || c.name} (${c.nameEn})`,
      subtitle: `Lv${c.level} · HP ${c.hp}/${c.maxHp}`,
    })),
    onSelect: (index) => {
      const target = targets[index];
      if (!target) return;
      playSFX('creature-equip');
      onPicked?.(target.targetIndex);
    },
    container: actionArea,
  });
}
