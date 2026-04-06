/**
 * @fileoverview Crests equip screen — 5 element slots + inventory grid.
 */

let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire' },
  water: { icon: '💧', name: 'Water' },
  wood: { icon: '🌿', name: 'Wood' },
  earth: { icon: '🪨', name: 'Earth' },
  metal: { icon: '⚙️', name: 'Metal' }
};
const STAT_LABELS = {
  attack: 'ATK', mp: 'MP', hp: 'HP', defense: 'DEF', xp: 'XP'
};
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

export function init(cbs) {
  callbacks = cbs;
}

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

  const panel = document.createElement('div');
  panel.id = 'crests-equip-panel';
  panel.className = 'crests-panel';

  render(panel, state);
  document.getElementById('action-area').appendChild(panel);
  wireEvents(panel, state);
}

function render(panel, state) {
  const { crests, equippedCrests } = state;

  panel.innerHTML = `
    <div class="crests-header">
      <button class="crests-close" id="crests-close-btn">&times;</button>
      <h2>Crests</h2>
    </div>
    <div class="crests-slots">
      ${ELEMENTS.map(el => {
        const crestId = equippedCrests[el];
        const crest = crestId ? crests.find(c => c.id === crestId) : null;
        return renderSlot(el, crest);
      }).join('')}
    </div>
    <div class="crests-filter-tabs">
      <button class="crests-tab active" data-filter="all">All</button>
      ${ELEMENTS.map(el => `<button class="crests-tab" data-filter="${el}">${ELEMENT_LABELS[el].icon}</button>`).join('')}
    </div>
    <div class="crests-inventory">
      ${renderInventory(crests, equippedCrests, 'all')}
    </div>
  `;
}

function renderSlot(element, crest) {
  const el = ELEMENT_LABELS[element];
  if (crest) {
    const pct = Math.round(crest.value * 100);
    return `
      <div class="crest-slot filled rarity-${crest.rarity}" data-element="${element}" data-crest-id="${crest.id}">
        <div class="crest-slot-icon">${el.icon}</div>
        <div class="crest-slot-value">${STAT_LABELS[crest.stat]} +${pct}%</div>
      </div>
    `;
  }
  return `
    <div class="crest-slot empty" data-element="${element}">
      <div class="crest-slot-icon">${el.icon}</div>
      <div class="crest-slot-plus">+</div>
    </div>
  `;
}

function renderInventory(crests, equippedCrests, filter) {
  const equippedIds = new Set(Object.values(equippedCrests).filter(Boolean));
  let filtered = crests;
  if (filter !== 'all') {
    filtered = crests.filter(c => c.element === filter);
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
        <div class="crest-tile-icon">${ELEMENT_LABELS[c.element].icon}</div>
        <div class="crest-tile-value">+${pct}%</div>
      </div>
    `;
  }).join('');
}

function isWeakerThanEquipped(crest, allCrests, equippedCrests) {
  const equippedId = equippedCrests[crest.element];
  if (!equippedId) return false;
  const equipped = allCrests.find(c => c.id === equippedId);
  if (!equipped) return false;
  return crest.value < equipped.value;
}

function wireEvents(panel, state) {
  const { getAuthHeaders, apiUrl } = callbacks;

  panel.querySelector('#crests-close-btn')?.addEventListener('click', () => panel.remove());

  panel.querySelectorAll('.crests-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.crests-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const inv = panel.querySelector('.crests-inventory');
      if (inv) inv.innerHTML = renderInventory(state.crests, state.equippedCrests, tab.dataset.filter);
      wireInventoryClicks(panel, state);
    });
  });

  panel.querySelectorAll('.crest-slot.filled').forEach(slot => {
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
          render(panel, state);
          wireEvents(panel, state);
        }
      } catch (e) { console.error('[Crests] Unequip failed:', e); }
    });
  });

  panel.querySelectorAll('.crest-slot.empty').forEach(slot => {
    slot.addEventListener('click', () => {
      const element = slot.dataset.element;
      panel.querySelectorAll('.crests-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.filter === element);
      });
      const inv = panel.querySelector('.crests-inventory');
      if (inv) inv.innerHTML = renderInventory(state.crests, state.equippedCrests, element);
      wireInventoryClicks(panel, state);
    });
  });

  wireInventoryClicks(panel, state);
}

function wireInventoryClicks(panel, state) {
  const { getAuthHeaders, apiUrl } = callbacks;

  panel.querySelectorAll('.crest-tile:not(.equipped)').forEach(tile => {
    tile.addEventListener('click', async () => {
      const crestId = tile.dataset.crestId;
      const crest = state.crests.find(c => c.id === crestId);
      if (!crest) return;

      const equippedId = state.equippedCrests[crest.element];
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
          Object.assign(state, data);
          render(panel, state);
          wireEvents(panel, state);
        }
      } catch (e) { console.error('[Crests] Equip failed:', e); }
    });
  });
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
        <div class="crest-preview-title">${ELEMENT_LABELS[crest.element].icon} ${STAT_LABELS[crest.stat]} +${newPct}%</div>
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
