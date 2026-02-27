// public/js/ui/move-select.js
// Renders a 2x2 grid of the active creature's moves (vertical icon-top cards)
import { dom } from '../dom.js';

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63',
  metal: '#9E9E9E', water: '#2196F3', neutral: '#888'
};

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

export function init({ onMoveSelectCb, onItemsOpenCb }) {
  onMoveSelect = onMoveSelectCb;
  if (onItemsOpenCb) onItemsOpen = onItemsOpenCb;
}

function iconSlug(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '-');
}

function buildMoveCell(move, canAfford) {
  const cell = document.createElement('button');
  cell.className = 'move-cell' + (canAfford ? '' : ' disabled');

  const color = ELEMENT_COLORS[move.element] || ELEMENT_COLORS.neutral;
  cell.style.borderColor = color;

  // Icon — try sprite, fall back to category emoji
  const slug = iconSlug(move.nameEn);
  const iconFallback = CATEGORY_ICONS[move.category] || '★';
  const iconHtml = `<div class="move-icon">
    <img src="/assets/sprites/actions/${slug}.webp"
         onerror="this.parentElement.textContent='${iconFallback}'; this.remove();"
         alt="">
  </div>`;

  // Power display
  const powerIcon = CATEGORY_ICONS[move.category] || '★';
  const powerText = move.power > 0 ? `${powerIcon} ${move.power}` : `${powerIcon}`;

  // Status pill
  let statusHtml = '';
  if (move.statusEffect) {
    const sIcon = STATUS_ICONS[move.statusEffect] || '✦';
    const durText = move.statusDuration > 0 ? `<span class="turns">${move.statusDuration}T</span>` : '';
    statusHtml = `<span class="move-status-pill">${sIcon} ${move.statusEffect.replace('_', ' ')} ${durText}</span>`;
  }

  cell.innerHTML = `
    ${iconHtml}
    <div class="move-furigana">${move.reading || ''}</div>
    <div class="move-name-jp">${move.name}</div>
    <div class="move-stats">
      <span class="move-power">${powerText}</span>
      ${statusHtml}
      <span class="move-cost">${move.mpCost} MP</span>
    </div>
    <div class="move-element-bar" style="background:${color}"></div>
  `;

  return cell;
}

function buildItemsCell() {
  const cell = document.createElement('div');
  cell.className = 'move-items-cell';
  cell.innerHTML = `
    <div class="move-items-icon">🎒</div>
    <div class="move-items-label">Items</div>
  `;
  cell.addEventListener('click', () => {
    if (onItemsOpen) onItemsOpen();
  });
  return cell;
}

export function showMoves(robot, robotIndex) {
  const container = dom.actionArea;
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'move-grid';

  for (const move of robot.moves) {
    const canAfford = robot.mp >= move.mpCost;
    const cell = buildMoveCell(move, canAfford);

    if (canAfford) {
      cell.addEventListener('click', () => {
        if (onMoveSelect) onMoveSelect(move, robotIndex);
      });
    }
    grid.appendChild(cell);
  }

  // Items button fills the last cell
  grid.appendChild(buildItemsCell());

  container.appendChild(grid);
}

export function clear() {
  dom.actionArea.innerHTML = '';
}

// Show which robot is currently selecting
export function setActiveLabel(robot) {
  const label = document.createElement('div');
  label.className = 'move-active-label';
  label.textContent = `${robot.nameEn}'s turn`;
  dom.actionArea.prepend(label);
}
