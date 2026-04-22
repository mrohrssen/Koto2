import { dom } from '../dom.js';
import { prefetchWord, playWord } from '../tts.js';
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';

const STATUS_ICONS = {
  poison: '☠', stun: '⚡', confuse: '😵',
  shield: '🛡', team_shield: '🛡',
  attack_buff: '⚔', haste: '💨'
};

const CATEGORY_ICONS = {
  damage: '⚔', drain: '⚔', heal: '❤', shield: '🛡',
  buff: '★', debuff: '★'
};

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
  cell.className = 'move-cell' + (canAfford ? '' : ' disabled');

  const slug = iconSlug(move.nameEn);
  const iconFallback = CATEGORY_ICONS[move.category] || '★';

  // Power display
  const powerIcon = CATEGORY_ICONS[move.category] || '★';
  const powerText = move.power > 0 ? `${powerIcon} ${move.power}` : `${powerIcon}`;

  // MP cost — warn if missing (debug aid for "0 MP" bug)
  const mpCost = move.mpCost ?? 0;
  if (!move.mpCost && move.mpCost !== 0) {
    console.warn('[MoveSelect] Move missing mpCost:', move.id, move.nameEn, JSON.stringify(Object.keys(move)));
  }

  // Status pill
  let statusHtml = '';
  if (move.statusEffect) {
    const sIcon = STATUS_ICONS[move.statusEffect] || '✦';
    const durText = move.statusDuration > 0 ? `<span class="turns">${move.statusDuration}T</span>` : '';
    statusHtml = `<span class="move-status-pill">${sIcon} ${move.statusEffect.replace('_', ' ')} ${durText}</span>`;
  }

  const moveNameHtml = renderJpSentence([entityToToken(move)], getKnownWords(), new Map());

  cell.innerHTML = `
    <div class="move-hero">
      <div class="move-icon">
        <img src="/assets/sprites/actions/${slug}.webp?v=20260322"
             onerror="this.parentElement.textContent='${iconFallback}'; this.remove();"
             alt="">
      </div>
      <div class="move-name-block">
        <div class="move-name-jp">${moveNameHtml}</div>
      </div>
    </div>
    <div class="move-stats">
      <span class="move-power">${powerText}</span>
      ${statusHtml}
      <span class="move-cost">${mpCost} MP</span>
    </div>
    <div class="move-help-btn" data-move-id="${move.id}">?</div>
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
