// public/js/ui/move-select.js
// Renders a 2x2 grid of the active creature's moves
// Grid shows 3-4 move cells + optional items button
import { dom } from '../dom.js';

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63',
  metal: '#9E9E9E', water: '#2196F3', neutral: '#888'
};

let onMoveSelect = null;

export function init({ onMoveSelectCb }) {
  onMoveSelect = onMoveSelectCb;
}

export function showMoves(robot, robotIndex) {
  const container = dom.actionArea;
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'move-grid';

  for (const move of robot.moves) {
    const cell = document.createElement('button');
    const canAfford = robot.mp >= move.mpCost;
    cell.className = 'move-cell' + (canAfford ? '' : ' disabled');
    cell.style.borderColor = ELEMENT_COLORS[move.element] || ELEMENT_COLORS.neutral;

    cell.innerHTML = `
      <span class="move-element-dot" style="background:${ELEMENT_COLORS[move.element] || ELEMENT_COLORS.neutral}"></span>
      <div class="move-name-jp">${move.name}</div>
      <div class="move-name-en">${move.nameEn}</div>
      <div class="move-stats">
        <span class="move-power">${move.category === 'damage' || move.category === 'drain' ? '⚔' + move.power : move.category === 'heal' ? '❤' + move.power : '★' + move.power}</span>
        <span class="move-cost">${move.mpCost}MP</span>
      </div>
    `;

    if (canAfford) {
      cell.addEventListener('click', () => {
        if (onMoveSelect) onMoveSelect(move, robotIndex);
      });
    }
    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

export function clear() {
  dom.actionArea.innerHTML = '';
}

// Show which robot is currently selecting
export function setActiveLabel(robot) {
  // Highlight text showing whose turn it is
  const label = document.createElement('div');
  label.className = 'move-active-label';
  label.textContent = `${robot.nameEn}'s turn`;
  dom.actionArea.prepend(label);
}
