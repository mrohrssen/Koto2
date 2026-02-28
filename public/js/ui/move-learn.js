// public/js/ui/move-learn.js
// Shows when a creature levels up and learns a new move
// If < 4 moves: shows "Learned [move]!" confirmation
// If 4 moves: shows new move + current 4 moves, player picks one to replace or skips

import { dom } from '../dom.js';

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63',
  metal: '#9E9E9E', water: '#2196F3', neutral: '#888'
};

// Returns a promise that resolves with { action: 'replace', replaceIndex } or { action: 'skip' } or { action: 'auto' }
// @param {boolean} alreadyLearned - If true, the move was auto-added by the backend (show confirmation only)
export function showLearnPrompt(robot, robotIndex, newMove, alreadyLearned = false) {
  return new Promise((resolve) => {
    const container = dom.actionArea;
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'move-learn-panel';

    // Header: "[Robot] wants to learn [Move]!"
    const header = document.createElement('div');
    header.className = 'move-learn-header';
    header.innerHTML = `<strong>${robot.nameEn || robot.name}</strong> wants to learn<br><span class="move-learn-new-name" style="color:${ELEMENT_COLORS[newMove.element] || ELEMENT_COLORS.neutral}">${newMove.name} (${newMove.nameEn})</span>`;
    panel.appendChild(header);

    // New move details
    const newCard = buildMoveCard(newMove, 'NEW');
    panel.appendChild(newCard);

    if (alreadyLearned || robot.moves.length < 4) {
      // Auto-learned, just show confirmation
      const msg = document.createElement('div');
      msg.className = 'move-learn-auto';
      msg.textContent = `Learned ${newMove.nameEn}!`;
      panel.appendChild(msg);

      const okBtn = document.createElement('button');
      okBtn.className = 'move-learn-ok-btn';
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => {
        container.innerHTML = '';
        resolve({ action: 'auto' });
      });
      panel.appendChild(okBtn);
    } else {
      // Must choose which move to replace
      const label = document.createElement('div');
      label.className = 'move-learn-label';
      label.textContent = 'Replace which move?';
      panel.appendChild(label);

      const moveList = document.createElement('div');
      moveList.className = 'move-learn-list';

      robot.moves.forEach((move, i) => {
        const row = buildMoveCard(move, null);
        row.classList.add('move-learn-replaceable');
        row.addEventListener('click', () => {
          container.innerHTML = '';
          resolve({ action: 'replace', replaceIndex: i });
        });
        moveList.appendChild(row);
      });

      panel.appendChild(moveList);

      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.className = 'move-learn-skip-btn';
      skipBtn.textContent = "Don't learn";
      skipBtn.addEventListener('click', () => {
        container.innerHTML = '';
        resolve({ action: 'skip' });
      });
      panel.appendChild(skipBtn);
    }

    container.appendChild(panel);
  });
}

function buildMoveCard(move, badge) {
  const card = document.createElement('div');
  card.className = 'move-learn-card';
  card.style.borderColor = ELEMENT_COLORS[move.element] || ELEMENT_COLORS.neutral;

  let badgeHtml = badge ? `<span class="move-learn-badge">${badge}</span>` : '';
  const powerLabel = move.category === 'heal' ? 'Heal' :
    (move.category === 'buff' || move.category === 'shield' || move.category === 'debuff') ? 'Effect' : 'Pow';
  const powerValue = move.power || '-';

  card.innerHTML = `
    ${badgeHtml}
    <div class="move-learn-card-name">${move.name} <small>${move.nameEn}</small></div>
    <div class="move-learn-card-stats">
      <span>${powerLabel} ${powerValue}</span>
      <span>${move.mpCost}MP</span>
      <span class="move-learn-card-element" style="color:${ELEMENT_COLORS[move.element] || ELEMENT_COLORS.neutral}">${move.element}</span>
    </div>
  `;
  return card;
}

export function clear() {
  dom.actionArea.innerHTML = '';
}
