let callbacks = {};

const ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];
const ELEMENT_LABELS = {
  fire: { icon: '🔥', name: 'Fire', color: 'var(--accent-red, #ef5350)', rawColor: '#ef5350' },
  water: { icon: '💧', name: 'Water', color: 'var(--accent-blue, #42a5f5)', rawColor: '#42a5f5' },
  wood: { icon: '🌿', name: 'Wood', color: 'var(--accent-green, #66bb6a)', rawColor: '#66bb6a' },
  earth: { icon: '🪨', name: 'Earth', color: 'var(--accent-amber, #ffb74d)', rawColor: '#ffb74d' },
  metal: { icon: '⚙️', name: 'Metal', color: 'var(--accent-lavender, #b39ddb)', rawColor: '#b39ddb' }
};
const ELEMENT_GRADIENTS = {
  fire: 'linear-gradient(135deg, #b71c1c, #ef5350, #ff8a65)',
  water: 'linear-gradient(135deg, #1565c0, #42a5f5, #80d8ff)',
  wood: 'linear-gradient(135deg, #2e7d32, #66bb6a, #a5d6a7)',
  earth: 'linear-gradient(135deg, #e65100, #ffb74d, #ffe082)',
  metal: 'linear-gradient(135deg, #4527a0, #b39ddb, #e1bee7)'
};
const CHEST_COST = 3;

export function init(cbs) {
  callbacks = cbs;
}

let selectedElement = 'fire';

export async function show() {
  const { getAuthHeaders, apiUrl, onChestOpened } = callbacks;

  let state;
  try {
    const res = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
    state = await res.json();
  } catch (e) {
    console.error('[Chests] Failed to fetch state:', e);
    return;
  }

  renderScene(selectedElement);
  renderActions(state);
}

function renderScene(element) {
  const sceneArea = document.getElementById('scene-area');
  // Remove any existing chest/crest scene
  sceneArea.querySelector('.chest-scene')?.remove();
  sceneArea.querySelector('.crest-scene')?.remove();

  const el = ELEMENT_LABELS[element];
  const scene = document.createElement('div');
  scene.className = 'chest-scene';
  scene.innerHTML = `
    <div class="chest-scene-bg" style="background: ${ELEMENT_GRADIENTS[element]}"></div>
    <div class="chest-scene-rays"></div>
    <div class="chest-scene-particles">${generateParticles(6, el.rawColor)}</div>
    <div class="chest-scene-icon">🎁</div>
    <div class="chest-scene-pedestal"></div>
  `;
  sceneArea.appendChild(scene);
}

function renderActions(state) {
  const actionArea = document.getElementById('action-area');
  actionArea.innerHTML = '';

  const drops = state.elementDrops || {};
  const currentDrops = drops[selectedElement] || 0;
  const canOpen = currentDrops >= CHEST_COST;
  const el = ELEMENT_LABELS[selectedElement];

  actionArea.innerHTML = `
    <div class="pentagon-selector">
      ${ELEMENTS.map(e => {
        const info = ELEMENT_LABELS[e];
        const isActive = e === selectedElement;
        return `<div class="pentagon-btn ${isActive ? 'active' : ''}"
                     data-element="${e}"
                     style="background: ${info.rawColor}; color: ${info.rawColor}">
          ${info.icon}
        </div>`;
      }).join('')}
    </div>
    <div class="chest-info">
      <div class="chest-info-title">${el.name} Chest</div>
      <div class="chest-info-drops">${currentDrops} / ${CHEST_COST} drops</div>
    </div>
    <button class="chest-open-btn ${canOpen ? '' : 'disabled'}" ${canOpen ? '' : 'disabled'}>
      Open Chest
    </button>
    <div class="chest-back-link">← Back</div>
  `;

  // Wire pentagon selector
  actionArea.querySelectorAll('.pentagon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedElement = btn.dataset.element;
      renderScene(selectedElement);
      renderActions(state);
    });
  });

  // Wire open button
  const openBtn = actionArea.querySelector('.chest-open-btn');
  if (openBtn && canOpen) {
    openBtn.addEventListener('click', async () => {
      const { getAuthHeaders, apiUrl, onChestOpened } = callbacks;
      try {
        const res = await fetch(apiUrl('/api/game/crests/open'), {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ element: selectedElement })
        });
        const data = await res.json();
        if (data.error) return;

        if (onChestOpened) {
          await onChestOpened(selectedElement, data.crest);
        }

        // Refresh state and re-render
        try {
          const refreshRes = await fetch(apiUrl('/api/game/crests'), { headers: getAuthHeaders() });
          const refreshed = await refreshRes.json();
          renderActions(refreshed);
        } catch (_) {
          // Fallback: just go back
          cleanup();
          callbacks.onBack?.();
        }
      } catch (e) {
        console.error('[Chests] Failed to open chest:', e);
      }
    });
  }

  // Wire back
  actionArea.querySelector('.chest-back-link')?.addEventListener('click', () => {
    cleanup();
    callbacks.onBack?.();
  });
}

function cleanup() {
  document.getElementById('scene-area')?.querySelector('.chest-scene')?.remove();
}

function generateParticles(count, color) {
  return Array.from({ length: count }, (_, i) => {
    const left = 10 + Math.random() * 80;
    const delay = Math.random() * 4;
    const top = 30 + Math.random() * 50;
    return `<div class="chest-particle" style="left:${left}%;top:${top}%;background:${color};animation-delay:${delay}s"></div>`;
  }).join('');
}
