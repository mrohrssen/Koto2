import { dom } from '../dom.js';
import { buildMoveCell } from './move-select.js';

function hiraganaName(entity, fallback) {
  return entity?.reading || entity?.name || entity?.nameEn || fallback;
}

function moveDisplayName(move) {
  return hiraganaName(move, 'this move');
}

// Returns a promise that resolves with { action: 'replace', replaceIndex } or { action: 'skip' } or { action: 'auto' }
// @param {boolean} alreadyLearned - If true, the move was auto-added by the backend (show confirmation only)
export function showLearnPrompt(creature, creatureIndex, newMove, alreadyLearned = false) {
  return new Promise((resolve) => {
    const container = dom.actionArea;
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'move-learn-panel';

    // Header: "[Creature] wants to learn [Move]!"
    const header = document.createElement('div');
    header.className = 'move-learn-header';
    header.textContent = `${hiraganaName(creature, 'This creature')} wants to learn ${hiraganaName(newMove, 'this move')}!`;
    panel.appendChild(header);

    if (alreadyLearned || creature.moves.length < 3) {
      panel.classList.add('move-learn-panel--grid', 'move-learn-panel--auto');
      header.textContent = `${hiraganaName(creature, 'This creature')} learned ${hiraganaName(newMove, 'this move')}!`;

      const grid = document.createElement('div');
      grid.className = 'move-grid move-learn-grid move-learn-auto-grid';

      const newMoveCell = buildMoveCell(newMove, true);
      newMoveCell.classList.add('move-learn-new-slot');
      grid.appendChild(newMoveCell);
      panel.appendChild(grid);

      const okBtn = document.createElement('button');
      okBtn.className = 'move-learn-ok-btn';
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => {
        container.innerHTML = '';
        resolve({ action: 'auto' });
      });
      panel.appendChild(okBtn);
    } else {
      panel.classList.add('move-learn-panel--grid');
      header.textContent = `${hiraganaName(creature, 'This creature')} wants to learn ${hiraganaName(newMove, 'this move')}! Choose a move to forget.`;

      const grid = document.createElement('div');
      grid.className = 'move-grid move-learn-grid';

      creature.moves.forEach((move, replaceIndex) => {
        const cell = buildMoveCell(move, true);
        cell.classList.add('move-learn-replaceable');
        cell.addEventListener('click', () => {
          showReplaceConfirm(panel, move, newMove, () => {
            container.innerHTML = '';
            resolve({ action: 'replace', replaceIndex });
          });
        });
        grid.appendChild(cell);
      });

      const newMoveCell = buildMoveCell(newMove, true);
      newMoveCell.classList.add('move-learn-new-slot');
      newMoveCell.addEventListener('click', () => {
        showSkipConfirm(panel, newMove, () => {
          container.innerHTML = '';
          resolve({ action: 'skip' });
        });
      });
      grid.appendChild(newMoveCell);

      panel.appendChild(grid);
    }

    container.appendChild(panel);
  });
}

function showReplaceConfirm(panel, oldMove, newMove, onConfirm) {
  showConfirm(panel, `Forget ${moveDisplayName(oldMove)} and learn ${moveDisplayName(newMove)}?`, onConfirm);
}

function showSkipConfirm(panel, newMove, onConfirm) {
  showConfirm(panel, `Skip learning ${moveDisplayName(newMove)}?`, onConfirm);
}

function showConfirm(panel, messageText, onConfirm) {
  const existing = panel.querySelector('.move-learn-confirm-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'move-learn-confirm-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'move-learn-confirm-modal';

  const message = document.createElement('div');
  message.className = 'move-learn-confirm-message';
  message.textContent = messageText;

  const actions = document.createElement('div');
  actions.className = 'move-learn-confirm-actions';

  const noBtn = document.createElement('button');
  noBtn.className = 'move-learn-confirm-btn move-learn-confirm-btn--no';
  noBtn.textContent = 'No';
  noBtn.addEventListener('click', () => {
    backdrop.remove();
  });

  const yesBtn = document.createElement('button');
  yesBtn.className = 'move-learn-confirm-btn move-learn-confirm-btn--yes';
  yesBtn.textContent = 'Yes';
  yesBtn.addEventListener('click', onConfirm);

  actions.appendChild(noBtn);
  actions.appendChild(yesBtn);
  dialog.appendChild(message);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);
  panel.appendChild(backdrop);
}

export function clear() {
  dom.actionArea.innerHTML = '';
}
