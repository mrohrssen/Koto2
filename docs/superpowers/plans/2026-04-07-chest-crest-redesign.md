# Chest & Crest Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chest and crest equip full-screen modal overlays with the standard scene area + action area layout pattern, using gacha-inspired visual designs.

**Architecture:** Both screens currently create `position: fixed` overlay panels appended to `#action-area`. The redesign renders scene content into `.scene-area` (backgrounds, visuals) and interactive content into `#action-area` (selectors, grids, buttons) using the same pattern as combat, hub, and area selection. Navigation uses a "Back" callback that re-renders the hub.

**Tech Stack:** Vanilla JS (ES6 modules), CSS custom properties, existing game layout system.

**Spec:** `docs/superpowers/specs/2026-04-07-chest-crest-redesign-design.md`

---

## File Structure

| File | Role | Change Type |
|------|------|-------------|
| `public/js/ui/chests.js` | Chest opening screen | Rewrite — modal overlay → scene+action rendering |
| `public/js/ui/crests-equip.js` | Crest equip screen | Rewrite — modal overlay → scene+action rendering |
| `public/game.css` | Chest/crest styles | Replace — remove modal styles, add scene-based styles |
| `public/js/ui/exploration.js` | Hub buttons | Minor — add `onBack` callback plumbing |
| `public/game.js` | Module init | Minor — pass `onBack` callback to init |

No new files. No backend changes. No test file changes (crest-service.test.js tests backend logic, unaffected).

---

## Chunk 1: CSS — Replace Modal Styles with Scene-Based Styles

### Task 1: Replace chest/crest CSS

**Files:**
- Modify: `public/game.css:4801-5053` (the entire `CRESTS & CHESTS` section)

The existing CSS defines `.crests-panel` as a `position: fixed; z-index: 100` overlay. We replace this entire section with styles that render into the existing `.scene-area` and `#action-area` containers.

- [ ] **Step 1: Read the current CSS section to confirm boundaries**

Run: `node -e "const css = require('fs').readFileSync('public/game.css','utf8'); const start = css.indexOf('/* ============ CRESTS & CHESTS'); const end = css.indexOf('/* ====', start + 10); console.log('Section:', start > -1 ? 'found' : 'NOT FOUND', 'lines ~4801-5053')"`

- [ ] **Step 2: Replace the CRESTS & CHESTS CSS section**

Delete everything from `/* ============ CRESTS & CHESTS ============ */` (line 4801) through the end of `.crest-preview-confirm` (line 5053). Replace with:

```css
/* ============ CRESTS & CHESTS ============ */

/* ── Chest Scene (renders inside .scene-area) ── */
.chest-scene {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background 0.4s ease;
  overflow: hidden;
}

.chest-scene-bg {
  position: absolute;
  inset: 0;
  transition: background 0.4s ease;
}

.chest-scene-rays {
  position: absolute;
  inset: -50%;
  background: conic-gradient(from 0deg, transparent, rgba(255,255,255,0.03) 10%, transparent 20%);
  animation: chest-rays-spin 30s linear infinite;
}

@keyframes chest-rays-spin {
  to { transform: rotate(360deg); }
}

.chest-scene-icon {
  position: relative;
  z-index: 1;
  font-size: 4rem;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
  animation: chest-float 3s ease-in-out infinite;
}

@keyframes chest-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.chest-scene-pedestal {
  position: relative;
  z-index: 1;
  width: 80px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  margin-top: 8px;
  filter: blur(4px);
  animation: pedestal-pulse 3s ease-in-out infinite;
}

@keyframes pedestal-pulse {
  0%, 100% { opacity: 0.6; transform: scaleX(1); }
  50% { opacity: 1; transform: scaleX(1.1); }
}

.chest-scene-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.chest-particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  opacity: 0;
  animation: particle-drift 4s ease-in-out infinite;
}

@keyframes particle-drift {
  0% { opacity: 0; transform: translateY(0) scale(0.5); }
  30% { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-60px) scale(0); }
}

/* ── Pentagon Element Selector (action-area for chests) ── */
.pentagon-selector {
  position: relative;
  width: 240px;
  height: 200px;
  margin: 0 auto 16px;
}

.pentagon-btn {
  position: absolute;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.25s ease;
  opacity: 0.7;
  -webkit-tap-highlight-color: transparent;
}

.pentagon-btn.active {
  width: 80px;
  height: 80px;
  opacity: 1;
  border: 3px solid #fff;
  box-shadow: 0 0 20px currentColor;
  font-size: 1.8rem;
}

.pentagon-btn:active { transform: scale(0.93); }

/* Pentagon positions (centered in 240x200 container) */
.pentagon-btn[data-element="fire"]  { top: 0;    left: 50%; transform: translateX(-50%); }
.pentagon-btn[data-element="water"] { top: 38%;  right: 0; }
.pentagon-btn[data-element="earth"] { bottom: 0; right: 12%; }
.pentagon-btn[data-element="metal"] { bottom: 0; left: 12%; }
.pentagon-btn[data-element="wood"]  { top: 38%;  left: 0; }

.pentagon-btn.active[data-element="fire"]  { top: -8px; margin-left: -8px; }
.pentagon-btn.active[data-element="water"] { right: -8px; }
.pentagon-btn.active[data-element="earth"] { bottom: -8px; }
.pentagon-btn.active[data-element="metal"] { bottom: -8px; }
.pentagon-btn.active[data-element="wood"]  { left: -8px; }

.chest-info {
  text-align: center;
  margin-bottom: 12px;
}

.chest-info-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chest-info-drops {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.chest-open-btn {
  display: block;
  width: calc(100% - 32px);
  max-width: 300px;
  margin: 0 auto 12px;
  padding: 14px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}

.chest-open-btn:active { transform: scale(0.97); }
.chest-open-btn.disabled { opacity: 0.4; cursor: default; pointer-events: none; }

.chest-back-link {
  display: block;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}

/* ── Crest Pentagon Scene (renders inside .scene-area) ── */
.crest-scene {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a3e, #2d1b4e);
  overflow: hidden;
}

.crest-scene-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crest-pentagon {
  position: relative;
  width: 220px;
  height: 200px;
}

.crest-pent-slot {
  position: absolute;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s ease;
  -webkit-tap-highlight-color: transparent;
}

/* Pentagon slot positions */
.crest-pent-slot[data-element="fire"]  { top: 0;    left: 50%; transform: translateX(-50%); }
.crest-pent-slot[data-element="water"] { top: 38%;  right: 0; }
.crest-pent-slot[data-element="earth"] { bottom: 0; right: 12%; }
.crest-pent-slot[data-element="metal"] { bottom: 0; left: 12%; }
.crest-pent-slot[data-element="wood"]  { top: 38%;  left: 0; }

.crest-pent-slot.equipped {
  border: 2px solid currentColor;
  box-shadow: 0 0 12px currentColor;
  animation: slot-breathe 3s ease-in-out infinite;
}

.crest-pent-slot.empty {
  border: 2px dashed rgba(255,255,255,0.25);
  opacity: 0.4;
}

.crest-pent-slot .slot-icon { font-size: 1.2rem; }
.crest-pent-slot .slot-plus { color: rgba(255,255,255,0.4); font-size: 1.2rem; }

.crest-pent-slot .slot-stat {
  position: absolute;
  bottom: -18px;
  font-size: 0.6rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}

.crest-pent-slot .rarity-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.2);
}

@keyframes slot-breathe {
  0%, 100% { box-shadow: 0 0 8px currentColor; }
  50% { box-shadow: 0 0 18px currentColor; }
}

/* ── Crest Inventory (action-area) ── */
.crests-title {
  text-align: center;
  margin-bottom: 8px;
}

.crests-title h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.crests-title .subtitle {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.crests-filter-tabs {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 12px;
}

.crests-tab {
  background: var(--bg-secondary);
  border: none;
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.crests-tab.active {
  background: var(--accent);
  color: #fff;
}

.crests-inventory {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 0 4px;
}

.crests-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
  font-size: 0.9rem;
  grid-column: 1 / -1;
}

.crest-tile {
  aspect-ratio: 1;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  padding: 6px;
  text-align: center;
  cursor: pointer;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.crest-tile:active { transform: scale(0.95); }

.crest-tile.rarity-common    { border-color: var(--rarity-common); }
.crest-tile.rarity-uncommon  { border-color: var(--rarity-uncommon); }
.crest-tile.rarity-rare      { border-color: var(--rarity-rare); }
.crest-tile.rarity-epic      { border-color: var(--rarity-epic); }
.crest-tile.rarity-legendary { border-color: var(--rarity-legendary); }

.crest-tile.equipped {
  opacity: 0.4;
  pointer-events: none;
  position: relative;
}

.crest-tile.equipped::after {
  content: 'Equipped';
  position: absolute;
  bottom: 2px;
  font-size: 0.5rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.crest-tile.weaker { opacity: 0.5; }

.crest-tile-icon { font-size: 1.4rem; }
.crest-tile-value { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); }

.chest-back-link,
.crest-back-link {
  display: block;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}

/* ── Crest Equip Preview (unchanged — still an overlay modal) ── */
.crest-preview-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crest-preview-card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: 24px;
  text-align: center;
  box-shadow: var(--shadow-elevated);
  min-width: 200px;
}

.crest-preview-title { font-size: 1.2rem; font-weight: 600; margin-bottom: 8px; }
.crest-preview-compare { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px; }
.crest-preview-rarity { font-size: 0.75rem; font-weight: 700; margin-bottom: 16px; }

.crest-preview-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.crest-preview-cancel {
  background: var(--bg-secondary);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 20px;
  color: var(--text-secondary);
  cursor: pointer;
}

.crest-preview-confirm {
  background: var(--accent);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 20px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 3: Verify CSS syntax**

Run: `node -e "require('fs').readFileSync('public/game.css','utf8'); console.log('CSS file reads OK')"` 
Expected: `CSS file reads OK`

- [ ] **Step 4: Commit**

```bash
git add public/game.css
git commit -m "style: replace chest/crest modal overlay CSS with scene-based layout"
```

---

## Chunk 2: Rewrite chests.js — Scene + Pentagon Selector

### Task 2: Rewrite chests.js

**Files:**
- Rewrite: `public/js/ui/chests.js` (118 lines → ~150 lines)

The current file creates a `#chests-panel` div with class `crests-panel` (the fixed overlay). The rewrite renders a scene into `.scene-area` and a pentagon selector into `#action-area`.

**Key preservation:**
- `ELEMENTS`, `ELEMENT_LABELS`, `CHEST_COST` constants (lines 7-15)
- `init(cbs)` callback pattern (line 17-19)
- Tutorial step 4 logic (lines 52-66)
- Chest open API call and `onChestOpened` callback (lines 68-101)
- `callbacks.showNarration` and `callbacks.getTutorialStep` usage

**Key changes:**
- Remove: `panel.id = 'chests-panel'`, `panel.className = 'crests-panel'`, the close button
- Add: scene rendering into `.scene-area`, pentagon selector into `#action-area`
- Add: element gradient backgrounds map
- Add: `onBack` callback for returning to hub
- Add: particle generation for scene

- [ ] **Step 1: Rewrite chests.js**

Replace the entire file with:

```javascript
/**
 * @fileoverview Chests screen — pentagon element selector + dramatic chest scene.
 * Renders into .scene-area (pedestal visual) and #action-area (selector + open button).
 */

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

  // Tutorial step 4: Cid explains chests
  if ((state.tutorialStep ?? 7) === 4 && callbacks.showNarration) {
    selectedElement = 'fire';
    renderScene('fire');
    renderActions(state);
    await callbacks.showNarration('Every run you can use your resources to get stronger.', { speaker: 'Cid' });
    await callbacks.showNarration("I'll give you 3 Fire Elements.", { speaker: 'Cid' });
    await callbacks.showNarration("Let's open that fire chest!", { speaker: 'Cid' });
  }
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
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/chests.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/chests.js
git commit -m "feat(chests): rewrite to scene+action layout with pentagon selector"
```

---

## Chunk 3: Rewrite crests-equip.js — Pentagon Loadout + Inventory

### Task 3: Rewrite crests-equip.js

**Files:**
- Rewrite: `public/js/ui/crests-equip.js` (254 lines → ~260 lines)

**Key preservation:**
- All constants: `ELEMENTS`, `ELEMENT_LABELS`, `STAT_LABELS`, `RARITY_ORDER` (lines 7-18)
- `init(cbs)` pattern
- `renderInventory()` logic (lines 100-128) — filtering, sorting, tile rendering
- `isWeakerThanEquipped()` helper (lines 130-136)
- `showEquipPreview()` modal (lines 228-253) — stays as-is (still an overlay modal)
- Tutorial step 5 logic
- Equip/unequip API calls and tutorial advance

**Key changes:**
- Remove: `crests-panel` overlay, close button, `crests-header`
- Add: scene rendering with pentagon formation into `.scene-area`
- Add: inventory + filter tabs into `#action-area`
- Add: `onBack` callback

- [ ] **Step 1: Rewrite crests-equip.js**

Replace the entire file with:

```javascript
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
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/crests-equip.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/crests-equip.js
git commit -m "feat(crests): rewrite to pentagon loadout scene + inventory layout"
```

---

## Chunk 4: Wire Up Navigation — exploration.js + game.js

### Task 4: Add onBack callback plumbing

**Files:**
- Modify: `public/js/ui/exploration.js:383-389` (hub button handlers)
- Modify: `public/game.js` (init calls, ~lines 1820-1835)

Both modules now need an `onBack` callback that re-renders the hub when the user taps "← Back". The hub rendering is already handled by `renderHub()` in exploration.js. We need to pass it through.

- [ ] **Step 1: Update exploration.js hub buttons**

In `public/js/ui/exploration.js`, the chest and crest button handlers (lines 383-389) currently call `chestsUI.show()` and `crestsEquipUI.show()` directly. These don't need changes — the modules themselves call `callbacks.onBack?.()` when Back is tapped, which re-renders the hub.

However, we need to verify that `renderHub` is accessible. Find where `renderHub` is exported and confirm it can be called by the init callbacks in game.js.

Run: `grep -n 'export.*renderHub' public/js/ui/exploration.js`
Expected: Shows the export line.

- [ ] **Step 2: Update game.js init calls to pass onBack**

In `public/game.js`, find the `chestsUI.init({...})` call (~line 1820) and add the `onBack` callback. Do the same for `crestsEquipUI.init({...})` (~line 1830).

Add to both init calls:
```javascript
onBack: () => {
  // Restore hub scene and action area
  import('./js/ui/exploration.js').then(m => m.renderHub());
},
```

**Important:** Since game.js already imports exploration statically, check first:
Run: `grep -n 'exploration' public/game.js | head -5`

If exploration is already imported, use the existing import reference instead of dynamic import. Adjust accordingly.

- [ ] **Step 3: Syntax check both files**

Run: `node --check public/js/ui/exploration.js && node --check public/game.js && echo "OK"`
Expected: `OK`

Note: `game.js` may not be at the expected path. The codebase uses `public/game.js` as the main frontend entry. If `node --check` fails on it due to browser-only imports, that's expected — just verify no syntax errors in the lines you changed.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/exploration.js public/game.js
git commit -m "feat: wire onBack callback for chest/crest navigation to hub"
```

---

## Chunk 5: Manual Testing + Visual Verification

### Task 5: Test the full flow

**Files:** None (testing only)

**IMPORTANT:** Per CLAUDE.md, all visual changes MUST be verified with Playwright screenshots. Ask the user before opening a Playwright browser session.

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (background)
Wait 3s, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 2: Run existing tests to confirm no regressions**

Run: `npm test`
Expected: All Tier 1 + Tier 2 tests pass. The crest-service tests are backend-only and should be unaffected.

- [ ] **Step 3: Syntax check all modified files**

Run: `node --check public/js/ui/chests.js && node --check public/js/ui/crests-equip.js && echo "All OK"`
Expected: `All OK`

- [ ] **Step 4: Ask user to open Playwright for visual verification**

Ask: "Can I open a Playwright browser to verify the chest and crest screens visually?"

If approved, navigate to http://localhost:3000, log in, reach the hub, and:
1. Screenshot the hub (baseline)
2. Click "Chests" → screenshot the chest screen (verify pentagon selector + pedestal scene)
3. Tap different elements → screenshot (verify scene background transitions)
4. Go back → screenshot (verify hub restores)
5. Click "Crests" → screenshot the crest equip screen (verify pentagon loadout + inventory)
6. Go back → screenshot (verify hub restores again)

Delete all screenshots after showing them.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: visual polish for chest/crest redesign"
```
