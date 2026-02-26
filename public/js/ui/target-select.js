// public/js/ui/target-select.js
// Shows targetable enemies or allies after a move is selected
import { dom } from '../dom.js';
import { ELEMENT_COLORS } from './robot-row.js';

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

  const header = document.createElement('div');
  header.className = 'target-header';
  header.innerHTML = `<span class="target-move-name">${move.nameEn}</span> → Select target`;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'target-list';

  targets.forEach((target, i) => {
    if (target.hp <= 0) return; // Skip KO'd targets

    const row = document.createElement('button');
    row.className = 'target-row';

    const hpPct = Math.max(0, (target.hp / target.maxHp) * 100);
    const hpColor = hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';

    row.innerHTML = `
      <div class="target-info">
        <span class="target-element-dot" style="background:${ELEMENT_COLORS[target.element] || '#888'}"></span>
        <span class="target-name">${target.nameEn}</span>
        <span class="target-level">Lv${target.level}</span>
      </div>
      <div class="target-hp-bar">
        <div class="target-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div>
      </div>
    `;

    row.addEventListener('click', () => {
      if (onTargetSelect) onTargetSelect(i);
    });
    list.appendChild(row);
  });

  container.appendChild(list);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'target-cancel-btn';
  cancelBtn.textContent = 'Back';
  cancelBtn.addEventListener('click', () => {
    if (onCancel) onCancel();
  });
  container.appendChild(cancelBtn);
}

export function clear() {
  dom.actionArea.innerHTML = '';
}
