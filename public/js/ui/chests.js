/**
 * @fileoverview Chests screen — shows 5 element chests, drop counts, and opens chests.
 */

let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire', color: 'var(--accent-red, #ef5350)' },
  water: { icon: '💧', name: 'Water', color: 'var(--accent-blue, #42a5f5)' },
  wood: { icon: '🌿', name: 'Wood', color: 'var(--accent-green, #66bb6a)' },
  earth: { icon: '🪨', name: 'Earth', color: 'var(--accent-amber, #ffb74d)' },
  metal: { icon: '⚙️', name: 'Metal', color: 'var(--accent-lavender, #b39ddb)' }
};
const CHEST_COST = 3;

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  const { getAuthHeaders, apiUrl, onChestOpened } = callbacks;

  const panel = document.createElement('div');
  panel.id = 'chests-panel';
  panel.className = 'crests-panel';

  let state;
  try {
    const res = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
    state = await res.json();
  } catch (e) {
    console.error('[Chests] Failed to fetch state:', e);
    return;
  }

  panel.innerHTML = `
    <div class="crests-header">
      <button class="crests-close" id="chests-close-btn">&times;</button>
      <h2>Chests</h2>
      <div class="crests-subtitle">Open chests to find Crests</div>
    </div>
    <div class="chests-grid">
      ${ELEMENTS.map(el => renderChest(el, state.elementDrops[el] || 0)).join('')}
    </div>
  `;

  document.getElementById('action-area').appendChild(panel);

  document.getElementById('chests-close-btn')?.addEventListener('click', () => panel.remove());

  // Tutorial step 4: Cid explains chests
  if ((state.tutorialStep ?? 7) === 4 && callbacks.showNarration) {
    await callbacks.showNarration('Every run you can use your resources to get stronger.', { speaker: 'Cid' });
    await callbacks.showNarration("I'll give you 3 Fire Elements.", { speaker: 'Cid' });
    await callbacks.showNarration("Let's open that fire chest!", { speaker: 'Cid' });
    // Highlight fire chest, dim others
    panel.querySelectorAll('.chest-card').forEach(card => {
      const btn = card.querySelector('.chest-open-btn');
      if (btn?.dataset.element === 'fire') {
        card.classList.add('tutorial-highlight');
      } else {
        card.classList.add('tutorial-dimmed');
      }
    });
  }

  panel.querySelectorAll('.chest-open-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const element = btn.dataset.element;
      try {
        const res = await fetch(apiUrl('/api/game/crests/open'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ element })
        });
        const data = await res.json();
        if (data.error) return;

        // Tutorial: advance step 4→5
        if (callbacks.getTutorialStep?.() === 4) {
          try {
            await fetch(apiUrl('/api/game/tutorial-advance'), {
              method: 'POST',
              headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ expectedStep: 4 })
            });
          } catch (e) { console.warn('[Tutorial] advance failed:', e); }
        }

        if (onChestOpened) {
          await onChestOpened(element, data.crest);
        }

        panel.remove();
        show();
      } catch (e) {
        console.error('[Chests] Failed to open chest:', e);
      }
    });
  });
}

function renderChest(element, drops) {
  const el = ELEMENT_LABELS[element];
  const canOpen = drops >= CHEST_COST;
  return `
    <div class="chest-card ${canOpen ? 'affordable' : ''}" style="--element-color: ${el.color}">
      <div class="chest-icon">${el.icon}</div>
      <div class="chest-name">${el.name}</div>
      <div class="chest-drops">${drops} / ${CHEST_COST}</div>
      <button class="chest-open-btn ${canOpen ? '' : 'disabled'}" data-element="${element}" ${canOpen ? '' : 'disabled'}>
        Open
      </button>
    </div>
  `;
}
