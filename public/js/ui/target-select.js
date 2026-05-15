import { dom } from '../dom.js';
import { ELEMENT_COLORS } from './creature-row.js';
import { creatureStaticPath } from './sprite-utils.js';
import { renderChoices, renderButtons } from './ui-components.js';
import { renderJpSentence, entityToToken, getKnownWords } from './bootstrap-client.js';
import { assetPreloader } from '../assets/asset-preloader.js';
import { prefetchWord, playWord } from '../tts.js';

const ELEMENT_KANJI = {
  fire: '火', water: '水', wood: '木',
  earth: '土', metal: '金', neutral: '—'
};

const ELEMENT_CYCLE = ['wood', 'earth', 'water', 'fire', 'metal'];

function getEffectiveness(moveElement, targetElement) {
  const ai = ELEMENT_CYCLE.indexOf(moveElement);
  const di = ELEMENT_CYCLE.indexOf(targetElement);
  if (ai === -1 || di === -1) return null;
  if ((ai + 1) % ELEMENT_CYCLE.length === di) return 'up';
  if ((di + 1) % ELEMENT_CYCLE.length === ai) return 'down';
  return null;
}

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

function targetSpokenName(target) {
  return target?.name || target?.word || target?.nameJp || '';
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

  assetPreloader.enqueue(validTargets.map(target => creatureStaticPath(target.id)), { priority: 'immediate' });
  validTargets.forEach(target => {
    const spokenName = targetSpokenName(target);
    if (spokenName) prefetchWord(spokenName);
  });

  renderChoices({
    heading: 'Choose target',
    cards: validTargets.map(target => {
      const elemColor = ELEMENT_COLORS[target.element] || '#888';
      const elemKanji = ELEMENT_KANJI[target.element] || '—';
      const spriteHtml = `<img src="${creatureStaticPath(target.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`;
      const nameHtml = renderJpSentence(
        [entityToToken(target)],
        getKnownWords(), new Map()
      );
      const eff = move ? getEffectiveness(move.element, target.element) : null;
      let suffix = '';
      if (eff === 'up') suffix = '<span class="dmg-pill dmg-pill--up">DMG<span class="dmg-pill__arrow">\u2191</span></span>';
      if (eff === 'down') suffix = '<span class="dmg-pill dmg-pill--down">DMG<span class="dmg-pill__arrow">\u2193</span></span>';
      return {
        sprite: spriteHtml,
        title: nameHtml,
        subtitle: `Lv${target.level}`,
        badge: { text: elemKanji, color: elemColor },
        suffix,
      };
    }),
    onSelect: (index) => {
      const spokenName = targetSpokenName(validTargets[index]);
      if (spokenName) playWord(spokenName);
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
