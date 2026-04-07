/**
 * @fileoverview Crests equip screen — pentagon loadout scene + inventory grid.
 * Renders into .scene-area (equipped pentagon) and #action-area (inventory).
 */

let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire', rawColor: '#ef5350' },
  water: { icon: '💧', name: 'Water', rawColor: '#42a5f5' },
  wood: { icon: '🌿', name: 'Wood', rawColor: '#66bb6a' },
  earth: { icon: '🪨', name: 'Earth', rawColor: '#ffb74d' },
  metal: { icon: '⚙️', name: 'Metal', rawColor: '#b39ddb' }
};
const STAT_LABELS = {
  attack: 'ATK', mp: 'MP', hp: 'HP', defense: 'DEF', xp: 'XP'
};
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
const RARITY_COLORS = {
  common: 'var(--rarity-common, #b0bec5)',
  uncommon: 'var(--rarity-uncommon, #66bb6a)',
  rare: 'var(--rarity-rare, #42a5f5)',
  epic: 'var(--rarity-epic, #ab47bc)',
  legendary: 'var(--rarity-legendary, #ffd54f)'
};

export function init(cbs) {
  callbacks = cbs;
}

let currentFilter = 'all';

export async function show() {
  const { getAuthHeaders, apiUrl } = callbacks;

  let state;
  try {
    const res = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
    state = await res.json();
  } catch (e) {
    console.error('[Crests] Failed to fetch state:', e);
    return;
  }

  currentFilter = 'all';
  renderScene(state);
  renderActions(state);

  // Tutorial step 5: Cid guides crest equip
  if ((state.tutorialStep ?? 7) === 5 && callbacks.showNarration) {
    await callbacks.showNarration("Now let's equip that crest to power up!", { speaker: 'Cid' });
  }
}

function renderScene(state) {
  const sceneArea = document.getElementById('scene-area');
  sceneArea.querySelector('.crest-scene')?.remove();
  sceneArea.querySelector('.chest-scene')?.remove();

  const { crests, equippedCrests } = state;
  const scene = document.createElement('div');
  scene.className = 'crest-scene';

  const particles = Array.from({ length: 8 }, (_, i) => {
    const left = 10 + Math.random() * 80;
    const top = 10 + Math.random() * 80;
    const delay = Math.random() * 5;
    return `<div class="chest-particle" style="left:${left}%;top:${top}%;background:rgba(255,255,255,0.4);animation-delay:${delay}s"></div>`;
  }).join('');

  scene.innerHTML = `
    <div class="crest-scene-particles">${particles}</div>
    <div class="crest-pentagon">
      ${ELEMENTS.map(el => {
        const info = ELEMENT_LABELS[el];
        const crestId = equippedCrests?.[el];
        const crest = crestId ? crests.find(c => c.id === crestId) : null;

        if (crest) {
          const pct = Math.round(crest.value * 100);
          return `
            <div class="crest-pent-slot equipped" data-element="${el}" style="color: ${info.rawColor}">
              <div class="rarity-dot" style="background: ${RARITY_COLORS[crest.rarity] || '#b0bec5'}"></div>
              <div class="slot-icon">${info.icon}</div>
              <div class="slot-stat">${STAT_LABELS[crest.stat]} +${pct}%</div>
            </div>`;
        }
        return `
          <div class="crest-pent-slot empty" data-element="${el}">
            <div class="slot-plus">+</div>
          </div>`;
      }).join('')}
    </div>
  `;
  sceneArea.appendChild(scene);
}

function renderActions(state) {
  const actionArea = document.getElementById('action-area');
  actionArea.innerHTML = '';

  actionArea.innerHTML = `
    <div class="crests-title">
      <h2>Crests</h2>
      <div class="subtitle">Inventory</div>
    </div>
    <div class="crests-filter-tabs">
      <button class="crests-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
      ${ELEMENTS.map(el =>
        `<button class="crests-tab ${currentFilter === el ? 'active' : ''}" data-filter="${el}">${ELEMENT_LABELS[el].icon}</button>`
      ).join('')}
    </div>
    <div class="crests-inventory">
      ${renderInventory(state.crests, state.equippedCrests, currentFilter)}
    </div>
    <div class="crest-back-link">← Back</div>
  `;

  wireEvents(actionArea, state);
}

function renderInventory(crests, equippedCrests, filter) {
  const equippedIds = new Set(Object.values(equippedCrests || {}).filter(Boolean));
  let filtered = crests || [];
  if (filter !== 'all') {
    filtered = filtered.filter(c => c.element === filter);
  }

  filtered.sort((a, b) => {
    const rd = (RARITY_ORDER[a.rarity] || 4) - (RARITY_ORDER[b.rarity] || 4);
    if (rd !== 0) return rd;
    return b.value - a.value;
  });

  if (filtered.length === 0) {
    return '<div class="crests-empty">No crests yet. Open chests to find some!</div>';
  }

  return filtered.map(c => {
    const pct = Math.round(c.value * 100);
    const equipped = equippedIds.has(c.id);
    const isWeaker = !equipped && isWeakerThanEquipped(c, crests, equippedCrests);
    return `
      <div class="crest-tile rarity-${c.rarity} ${equipped ? 'equipped' : ''} ${isWeaker ? 'weaker' : ''}" data-crest-id="${c.id}">
        <div class="crest-tile-icon">${ELEMENT_LABELS[c.element]?.icon || '?'}</div>
        <div class="crest-tile-value">+${pct}%</div>
      </div>
    `;
  }).join('');
}

function isWeakerThanEquipped(crest, allCrests, equippedCrests) {
  const equippedId = equippedCrests?.[crest.element];
  if (!equippedId) return false;
  const equipped = allCrests.find(c => c.id === equippedId);
  return equipped ? crest.value < equipped.value : false;
}

function wireEvents(actionArea, state) {
  const { getAuthHeaders, apiUrl } = callbacks;

  // Filter tabs
  actionArea.querySelectorAll('.crests-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;
      renderActions(state);
    });
  });

  // Inventory tile clicks
  actionArea.querySelectorAll('.crest-tile:not(.equipped)').forEach(tile => {
    tile.addEventListener('click', async () => {
      const crestId = tile.dataset.crestId;
      const crest = state.crests.find(c => c.id === crestId);
      if (!crest) return;

      const equippedId = state.equippedCrests?.[crest.element];
      const equipped = equippedId ? state.crests.find(c => c.id === equippedId) : null;
      const confirmed = await showEquipPreview(crest, equipped);
      if (!confirmed) return;

      try {
        const res = await fetch(apiUrl('/api/game/crests/equip'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ crestId })
        });
        const data = await res.json();
        if (!data.error) {
          if (callbacks.getTutorialStep?.() === 5) {
            try {
              await fetch(apiUrl('/api/game/tutorial-advance'), {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ expectedStep: 5 })
              });
            } catch (e) { console.warn('[Tutorial] advance failed:', e); }
          }
          Object.assign(state, data);
          renderScene(state);
          renderActions(state);
        }
      } catch (e) { console.error('[Crests] Equip failed:', e); }
    });
  });

  // Scene slot clicks (unequip filled, filter empty)
  document.querySelectorAll('.crest-pent-slot.equipped').forEach(slot => {
    slot.addEventListener('click', async () => {
      const element = slot.dataset.element;
      try {
        const res = await fetch(apiUrl('/api/game/crests/unequip'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ element })
        });
        const data = await res.json();
        if (!data.error) {
          Object.assign(state, data);
          renderScene(state);
          renderActions(state);
        }
      } catch (e) { console.error('[Crests] Unequip failed:', e); }
    });
  });

  document.querySelectorAll('.crest-pent-slot.empty').forEach(slot => {
    slot.addEventListener('click', () => {
      currentFilter = slot.dataset.element;
      renderActions(state);
    });
  });

  // Back
  actionArea.querySelector('.crest-back-link')?.addEventListener('click', () => {
    cleanup();
    callbacks.onBack?.();
  });
}

function cleanup() {
  document.getElementById('scene-area')?.querySelector('.crest-scene')?.remove();
}

function showEquipPreview(crest, equipped) {
  return new Promise(resolve => {
    const newPct = Math.round(crest.value * 100);
    const curPct = equipped ? Math.round(equipped.value * 100) : 0;
    const diff = newPct - curPct;
    const diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;

    const overlay = document.createElement('div');
    overlay.className = 'crest-preview-overlay';
    overlay.innerHTML = `
      <div class="crest-preview-card">
        <div class="crest-preview-title">${ELEMENT_LABELS[crest.element]?.icon || ''} ${STAT_LABELS[crest.stat]} +${newPct}%</div>
        ${equipped ? `<div class="crest-preview-compare">Current: +${curPct}% → ${diffStr}</div>` : ''}
        <div class="crest-preview-rarity rarity-${crest.rarity}">${crest.rarity.toUpperCase()}</div>
        <div class="crest-preview-actions">
          <button class="crest-preview-cancel">Cancel</button>
          <button class="crest-preview-confirm">Equip</button>
        </div>
      </div>
    `;

    overlay.querySelector('.crest-preview-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('.crest-preview-confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
    document.getElementById('action-area').appendChild(overlay);
  });
}
