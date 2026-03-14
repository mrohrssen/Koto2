// public/js/ui/target-select.js
// Shows targetable enemies or allies after a move is selected
// Design: Full info card with sprite panel + kanji element badge
import { dom } from '../dom.js';
import { ELEMENT_COLORS } from './creature-row.js';
import { configureCreatureImg } from './sprite-utils.js';
import { renderJpFirst } from './bootstrap-client.js';

const ELEMENT_KANJI = {
  fire: '火', water: '水', wood: '木',
  earth: '土', metal: '金', neutral: '—'
};

// Element tint as rgba for sprite panel backgrounds
const ELEMENT_TINTS = {
  fire: 'rgba(244,67,54,0.1)',
  water: 'rgba(33,150,243,0.1)',
  wood: 'rgba(76,175,80,0.1)',
  earth: 'rgba(141,110,99,0.1)',
  metal: 'rgba(158,158,158,0.1)',
  neutral: 'rgba(136,136,136,0.1)'
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

  const header = document.createElement('div');
  header.className = 'target-header';
  header.innerHTML = `<span class="target-move-name">${renderJpFirst(move.name, move.reading, move.nameEn)}</span> → Select target`;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'target-list';

  targets.forEach((target, i) => {
    if (target.hp <= 0) return; // Skip KO'd targets

    const elemColor = ELEMENT_COLORS[target.element] || '#888';
    const elemKanji = ELEMENT_KANJI[target.element] || '—';
    const elemTint = ELEMENT_TINTS[target.element] || ELEMENT_TINTS.neutral;
    const hpPct = Math.max(0, Math.round((target.hp / target.maxHp) * 100));
    const hpColor = hpPct > 60 ? 'var(--hp-green)' : hpPct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';
    const hpPctColor = hpPct <= 30 ? 'var(--hp-red)' : '#666';

    const row = document.createElement('button');
    row.className = 'target-row';
    row.style.borderColor = elemColor;

    // Sprite panel
    const spritePanel = document.createElement('div');
    spritePanel.className = 'target-sprite-panel';
    spritePanel.style.background = elemTint;

    const spriteImg = document.createElement('img');
    spriteImg.className = 'target-sprite-img';
    spriteImg.alt = target.nameEn || '';
    configureCreatureImg(spriteImg, target.id, (img) => {
      img.style.display = 'none';
      // Show element emoji as fallback
      const fallback = document.createElement('span');
      fallback.className = 'target-sprite-fallback';
      fallback.textContent = elemKanji;
      spritePanel.insertBefore(fallback, spritePanel.firstChild);
    });
    spritePanel.appendChild(spriteImg);

    // Element kanji badge
    const badge = document.createElement('span');
    badge.className = 'target-elem-badge';
    badge.style.background = elemColor;
    badge.textContent = elemKanji;
    spritePanel.appendChild(badge);

    // Info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'target-info-panel';
    const baseWordLine = target.baseWord
      ? `<div class="target-baseword">${renderJpFirst(target.baseWord, target.baseReading, target.baseMeaning)}</div>`
      : '';
    infoPanel.innerHTML = `
      <div class="target-jp">${target.name}</div>
      <div class="target-en">${target.nameEn}</div>
      ${baseWordLine}
      <div class="target-stats">
        <span class="target-lv">Lv${target.level}</span>
        <div class="target-hp-bar">
          <div class="target-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div>
        </div>
        <span class="target-hp-pct" style="color:${hpPctColor}">${hpPct}%</span>
      </div>
    `;

    row.appendChild(spritePanel);
    row.appendChild(infoPanel);

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
