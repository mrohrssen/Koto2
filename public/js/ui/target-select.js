import { dom } from '../dom.js';
import { ELEMENT_COLORS } from './creature-row.js';
import { creatureStaticPath } from './sprite-utils.js';
import { renderChoices, renderButtons } from './ui-components.js';

const ELEMENT_KANJI = {
  fire: '火', water: '水', wood: '木',
  earth: '土', metal: '金', neutral: '—'
};

let onTargetSelect = null;
let onCancel = null;

export function init({ onTargetSelectCb, onCancelCb }) {
  onTargetSelect = onTargetSelectCb;
  onCancel = onCancelCb;
}

export function showEnemies(enemies, move) {
  showTargets(enemies, move, 'enemy');
}

export function showAllies(allies, move) {
  showTargets(allies, move, 'ally');
}

function showTargets(targets, move, type) {
  const container = dom.actionArea;
  container.innerHTML = '';

  // Filter valid targets
  const validTargets = [];
  const validIndices = [];
  targets.forEach((target, i) => {
    if (target.hp <= 0) return;
    if (type === 'enemy' && target.befriended) return;
    validTargets.push(target);
    validIndices.push(i);
  });

  if (validTargets.length === 0) {
    console.warn('[TargetSelect] No targetable enemies found — auto-cancelling');
    if (onCancel) onCancel();
    return;
  }

  renderChoices({
    cards: validTargets.map(target => {
      const elemColor = ELEMENT_COLORS[target.element] || '#888';
      const elemKanji = ELEMENT_KANJI[target.element] || '—';
      const spriteHtml = `<img src="${creatureStaticPath(target.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`;
      return {
        sprite: spriteHtml,
        title: target.name,
        subtitle: `${target.nameEn} · Lv${target.level}`,
        badge: { text: elemKanji, color: elemColor },
      };
    }),
    onSelect: (index) => {
      if (onTargetSelect) onTargetSelect(validIndices[index]);
    },
  });

  renderButtons([
    { label: 'Back', onClick: () => { if (onCancel) onCancel(); } },
  ], { append: true });
}

export function clear() {
  dom.actionArea.innerHTML = '';
}
