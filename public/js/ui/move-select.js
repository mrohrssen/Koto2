import { dom } from '../dom.js';
import { prefetchWord, playWord } from '../tts.js';
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
import { effectLabel } from './move-effect-label.js';
import { toRomaji } from './romaji.js';

const STATUS_ICONS = {
  poison: '☠', stun: '⚡', confuse: '😵',
  shield: '🛡', team_shield: '🛡',
  attack_buff: '⚔', haste: '💨'
};

const CATEGORY_ICONS = {
  damage: '⚔', drain: '⚔', heal: '❤', shield: '🛡',
  buff: '★', debuff: '★'
};

const SVG_ICONS = {
  drop:          '<svg class="move-pill-ico move-pill-ico--mp" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z"/></svg>',
  sword:         '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5 20.5 9.5M4 20l4.5-1.5L20 7l-3-3L5.5 15.5 4 20z"/><path d="M11.5 12.5 15 9"/></svg>',
  'chevron-up':   '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>',
  'chevron-down': '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M18 12l-6 6-6-6"/></svg>',
  heart:         '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/></svg>',
  star:          '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 15.5 6.4 19.5l2.1-6.7L3 8.8h6.8z"/></svg>',
};

function renderIcon(type) {
  return SVG_ICONS[type] || SVG_ICONS.sword;
}

let onMoveSelect = null;
let onItemsOpen = null;
let onMoveHelp = null;

export function init({ onMoveSelectCb, onItemsOpenCb, onMoveHelpCb }) {
  onMoveSelect = onMoveSelectCb;
  if (onItemsOpenCb) onItemsOpen = onItemsOpenCb;
  if (onMoveHelpCb) onMoveHelp = onMoveHelpCb;
}

function iconSlug(nameEn) {
  return nameEn.split(';')[0].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function buildMoveCell(move, canAfford) {
  const cell = document.createElement('button');
  const element = move.element || 'neutral';
  cell.className = 'move-cell move-cell--' + element + (canAfford ? '' : ' disabled');

  const slug = iconSlug(move.nameEn);
  const iconFallback = CATEGORY_ICONS[move.category] || '★';

  // MP cost — warn if missing (debug aid for "0 MP" bug)
  const mpCost = move.mpCost ?? 0;
  if (!move.mpCost && move.mpCost !== 0) {
    console.warn('[MoveSelect] Move missing mpCost:', move.id, move.nameEn, JSON.stringify(Object.keys(move)));
  }

  const nameHtml = renderJpSentence([entityToToken(move)], getKnownWords(), new Map());
  const romaji = toRomaji(move.reading || '');
  const effect = effectLabel(move);

  cell.innerHTML = `
    <div class="move-help-btn" data-move-id="${move.id}">?</div>
    <div class="move-hero">
      <div class="move-badge">
        <img src="/assets/sprites/actions/${slug}.webp?v=20260322"
             onerror="this.parentElement.textContent='${iconFallback}'; this.remove();"
             alt="">
      </div>
      <div class="move-text">
        <div class="move-romaji">${romaji}</div>
        <div class="move-name-jp">${nameHtml}</div>
        <div class="move-name-en">${move.nameEn}</div>
      </div>
    </div>
    <div class="move-pill">
      <span class="move-pill-stat">${renderIcon('drop')}<span>${mpCost} MP</span></span>
      <span class="move-pill-divider"></span>
      <span class="move-pill-stat">${renderIcon(effect.iconType)}<span>${effect.text}</span></span>
    </div>
  `;

  const helpBtn = cell.querySelector('.move-help-btn');
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onMoveHelp) onMoveHelp(move);
  });

  return cell;
}

function buildItemsCell() {
  const cell = document.createElement('div');
  cell.className = 'move-items-cell';
  cell.innerHTML = `<span class="move-items-emoji">🎒</span><span class="move-items-label">アイテム</span>`;
  cell.addEventListener('click', () => {
    if (onItemsOpen) onItemsOpen();
  });
  return cell;
}

function buildBefriendCell(onBefriend) {
  const cell = document.createElement('div');
  cell.className = 'move-befriend-half';
  cell.innerHTML = `<span class="move-items-emoji">💬</span><span class="move-items-label">はなす</span>`;
  cell.addEventListener('click', () => {
    if (onBefriend) onBefriend();
  });
  return cell;
}

function buildSplitCell(onBefriend) {
  const wrap = document.createElement('div');
  wrap.className = 'move-split-cell';
  wrap.appendChild(buildBefriendCell(onBefriend));
  wrap.appendChild(buildItemsCell());
  return wrap;
}

export function showMoves(creature, creatureIndex, opts = {}) {
  const container = dom.actionArea;
  container.innerHTML = '';

  if (creature.moves?.some(m => !m.mpCost && m.mpCost !== 0)) {
    console.warn('[MoveSelect] showMoves — creature has moves with missing mpCost:',
      creature.nameEn, creature.moves.map(m => ({ id: m.id, mpCost: m.mpCost })));
  }

  const moveSelectCb = opts.onMoveSelect || onMoveSelect;
  const includeItems = opts.includeItems !== false;

  const grid = document.createElement('div');
  grid.className = 'move-grid';

  for (const move of creature.moves) {
    const canAfford = (creature.mp ?? creature.currentMp ?? 0) >= (move.mpCost || 0);
    const cell = buildMoveCell(move, canAfford);

    if (canAfford) {
      cell.addEventListener('click', () => {
        if (move.name) playWord(move.name);
        if (moveSelectCb) moveSelectCb(move, creatureIndex);
      });
    }
    grid.appendChild(cell);
  }

  if (includeItems) {
    if (opts.befriendAvailable && opts.onBefriend) {
      grid.appendChild(buildBefriendCell(opts.onBefriend));
    }
  }

  for (const move of creature.moves) {
    if (move.name) prefetchWord(move.name);
  }

  container.appendChild(grid);
}

export function clear() {
  dom.actionArea.innerHTML = '';
}

// Show which creature is currently selecting
export function setActiveLabel(creature) {
  const label = document.createElement('div');
  label.className = 'move-active-label';
  label.textContent = `${creature.nameEn}'s turn`;
  dom.actionArea.prepend(label);
}
