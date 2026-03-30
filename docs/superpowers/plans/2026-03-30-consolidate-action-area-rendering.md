# Consolidate Action-Area Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 24 screens' worth of duplicated rendering code with 3 shared primitives in a new `ui-components.js` module.

**Architecture:** New `public/js/ui/ui-components.js` exports `renderButtons()`, `renderButtonsAsync()`, and `renderChoices()`. All screens migrate to use these. Flash card cleanup is a separate pass on `actions.js`. Dead CSS and files are removed last.

**Tech Stack:** Vanilla ES6 modules, DOM APIs, existing `playSFX`/`hapticLight` utilities.

**Spec:** `docs/superpowers/specs/2026-03-30-consolidate-action-area-rendering-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `public/js/ui/ui-components.js` | **Create** | `renderButtons`, `renderButtonsAsync`, `renderChoices` |
| `public/js/ui/actions.js` | **Modify** | Remove `showButtons`, `showFlashCards` multi-card, `getSelectedActionType`, `clearSelectedActionType`, combat SVGs. Keep `setContent`, `clear`, `triggerEquipBots`, `init`, flash card single-card + swipe handlers. |
| `public/js/ui/exploration.js` | **Modify** | Rewrite `renderHub`, `renderExploring`, `renderAreaComplete`, `renderRunComplete`, `renderRunEnded`, `renderAreaSelection`, `renderShrine`, `renderSkillMaster`, `renderFriendlyNpc`, `renderNpcBattleSkillSelection`, `renderWordDiscovery` to use new components |
| `public/js/ui/target-select.js` | **Modify** | Rewrite `showTargets` to use `renderChoices` |
| `public/js/ui/post-combat-shop.js` | **Modify** | Rewrite `show` and `showTargetPicker` to use `renderChoices` |
| `public/js/ui/dialogue-choices.js` | **Delete** | Replaced by `renderButtonsAsync` |
| `public/js/ui/combat-loop.js` | **Modify** | Replace `showDialogueChoices` import with `renderButtonsAsync` from `ui-components.js` |
| `public/js/game.js` | **Modify** | Replace `showDialogueChoices` import with `renderButtonsAsync` from `ui-components.js` |
| `public/game.css` | **Modify** | Add `.ui-btn-*` and `.ui-choice-*` classes; remove old `.action-btn-*`, `.ward-*`, `.shrine-creature-*`, `.befriend-answer-*`, `.shop-item-*`, `.target-*`, `.dual-flash-card-*` classes |

---

### Task 1: Create `ui-components.js` with `renderButtons` + `renderButtonsAsync`

**Files:**
- Create: `public/js/ui/ui-components.js`
- Modify: `public/game.css`

- [ ] **Step 1: Create `ui-components.js` with both functions**

```js
// public/js/ui/ui-components.js
import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';

/**
 * Render a vertical stack of tappable buttons.
 * @param {Array<{label: string, onClick: Function, primary?: boolean, disabled?: boolean}>} buttons
 * @param {{container?: HTMLElement}} options
 */
export function renderButtons(buttons, { container } = {}) {
  const el = container || document.getElementById('action-area');
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'ui-btn-list';

  for (const btn of buttons) {
    const button = document.createElement('button');
    button.className = 'ui-btn' +
      (btn.primary ? ' ui-btn--primary' : '') +
      (btn.disabled ? ' ui-btn--disabled' : '');
    button.innerHTML = btn.label;
    if (btn.disabled) button.disabled = true;
    button.addEventListener('click', () => {
      if (btn.disabled) return;
      playSFX('button-tap');
      hapticLight();
      btn.onClick?.();
    });
    list.appendChild(button);
  }

  el.appendChild(list);
}

/**
 * Render buttons and return a Promise that resolves with the selected index.
 * Used for dialogue choices.
 * @param {Array<{label: string, primary?: boolean, disabled?: boolean}>} buttons
 * @param {{container?: HTMLElement}} options
 * @returns {Promise<number>}
 */
export function renderButtonsAsync(buttons, options = {}) {
  return new Promise(resolve => {
    let answered = false;
    const wrappedButtons = buttons.map((btn, i) => ({
      ...btn,
      onClick: () => {
        if (answered) return;
        answered = true;
        resolve(i);
      },
    }));
    renderButtons(wrappedButtons, options);
  });
}
```

- [ ] **Step 2: Add CSS for `.ui-btn` classes to `game.css`**

Add at the end of `public/game.css` (before any `@media` queries):

```css
/* ========== UI COMPONENTS: BUTTONS ========== */

.ui-btn-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
  box-sizing: border-box;
}

.ui-btn {
  padding: 14px 20px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  background: var(--bg-elevated);
  color: var(--text-primary);
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}

.ui-btn:active {
  transform: scale(0.97);
  opacity: 0.85;
}

.ui-btn--primary {
  background: var(--accent-cyan);
  color: white;
  border-color: transparent;
}

.ui-btn--primary:active {
  background: #39b0e4;
}

.ui-btn--disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/ui-components.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/ui-components.js public/game.css
git commit -m "feat: add ui-components.js with renderButtons + renderButtonsAsync"
```

---

### Task 2: Migrate button screens in exploration.js

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Add import at top of exploration.js**

```js
import { renderButtons } from './ui-components.js';
```

Add after the existing import lines (after line 33: `import { playRoomTransition } from './room-transition.js';`).

- [ ] **Step 2: Rewrite `renderHub()`**

Replace the entire `renderHub` function (lines 330-362) with:

```js
export function renderHub() {
  const gameState = getGameState();
  const tokens = gameState.meta?.progressionTokens || 0;

  renderButtons([
    { label: '📚 速習', onClick: async () => {
      const result = await apiGetDueWords();
      if (result?.words?.length > 0) {
        speedReview.start(result.words);
      } else {
        sceneModule.showNarration('復習する言葉がありません', { autoDismiss: 2000 });
      }
    }},
    { label: `⬆️ 強化${tokens > 0 ? ` (${tokens})` : ''}`, onClick: () => metaShop.show() },
    { label: '⚡ 潜入', onClick: () => startNewRun(), primary: true },
  ]);
}
```

- [ ] **Step 3: Rewrite `renderExploring()`**

Replace the entire `renderExploring` function (lines 421-458) with:

```js
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    renderButtons([
      { label: '📦 インベントリ', onClick: showInventory },
      { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
      { label: '⚔️ 戦う', onClick: () => startEncounter(), primary: true },
    ]);
    return;
  }

  renderButtons([
    { label: '📦 インベントリ', onClick: showInventory },
    { label: '🐾 モンスター装備', onClick: () => actions.triggerEquipBots() },
    { label: '➡️ 進む', onClick: async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        await playRoomTransition(result.state);
        updateUI();
      }
    }, primary: true },
  ]);
}
```

- [ ] **Step 4: Rewrite `renderAreaComplete()`**

Replace lines 461-476 with:

```js
export function renderAreaComplete() {
  const gameState = getGameState();
  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      Area ${areasCompleted} / ${areasToWin} cleared!
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const btnContainer = document.createElement('div');
  actionArea.appendChild(btnContainer);
  renderButtons([
    { label: '次のエリアへ', onClick: () => updateUI(), primary: true },
  ], { container: btnContainer });
}
```

- [ ] **Step 5: Rewrite `renderRunComplete()`**

Replace lines 479-489 with:

```js
export function renderRunComplete() {
  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      ゲームクリア！おめでとう！
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const btnContainer = document.createElement('div');
  actionArea.appendChild(btnContainer);
  renderButtons([
    { label: 'ハブに戻る', onClick: () => apiReturnToHub(), primary: true },
  ], { container: btnContainer });
}
```

- [ ] **Step 6: Rewrite `renderRunEnded()`**

Replace lines 492-499 with:

```js
export function renderRunEnded() {
  renderButtons([
    { label: 'ハブに戻る', onClick: () => returnToHub(), primary: true },
  ]);
}
```

- [ ] **Step 7: Update word discovery proceed button (inside `renderWordDiscovery`)**

Replace the discovery-completed proceed button (lines 635-647) with:

```js
  if (discovery.completed) {
    renderButtons([
      { label: '続ける', onClick: async () => {
        const result = await apiProceed();
        if (result?.state) {
          updateGameState(result.state);
          await playRoomTransition(result.state);
          updateUI();
        }
      }, primary: true },
    ]);
    return;
  }
```

- [ ] **Step 8: Update whack-a-mole start button (inside `renderWhackAMole`)**

Replace the start screen section (lines 900-912) with:

```js
  // Show start screen
  actions.setContent(`
    <div class="wam-container">
      <div class="wam-start">
        <div class="wam-start-title">ワードマッチ!</div>
        <div class="wam-start-desc">Match the word to the correct creature or item</div>
      </div>
    </div>
  `);

  const startBtnContainer = document.createElement('div');
  document.querySelector('.wam-start')?.appendChild(startBtnContainer);
  renderButtons([
    { label: 'プレイ', onClick: () => startWhackAMoleGame(pool), primary: true },
  ], { container: startBtnContainer });
```

- [ ] **Step 9: Update shrine skip button**

Replace the no-creatures fallback (lines 507-519) with:

```js
  if (!creatureParty) {
    renderButtons([
      { label: '続ける', onClick: async () => {
        const result = await apiProceed();
        if (result?.state) {
          updateGameState(result.state);
          await playRoomTransition(result.state);
          updateUI();
        }
      }, primary: true },
    ]);
    return;
  }
```

- [ ] **Step 10: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 11: Run tests**

Run: `npm test`
Expected: All existing tests pass (no server-side changes).

- [ ] **Step 12: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "refactor: migrate exploration button screens to renderButtons"
```

---

### Task 3: Migrate dialogue choices

**Files:**
- Modify: `public/js/game.js`
- Modify: `public/js/ui/combat-loop.js`
- Delete: `public/js/ui/dialogue-choices.js`

- [ ] **Step 1: Update `game.js` import**

Replace:
```js
import { showDialogueChoices } from './js/ui/dialogue-choices.js';
```
With:
```js
import { renderButtonsAsync } from './js/ui/ui-components.js';
```

- [ ] **Step 2: Update `game.js` `playPrologue` usage**

Find all calls to `showDialogueChoices` in `game.js` and replace them. The call looks like:

```js
const choiceIdx = await showDialogueChoices(prologueScene.choices);
```

Replace with:

```js
const choiceIdx = await renderButtonsAsync(
  prologueScene.choices.map(c => ({
    label: renderEnFirst(typeof c === 'string' ? c : c.text),
  }))
);
```

Note: `renderEnFirst` is already imported in game.js. The old `showDialogueChoices` applied it internally.

- [ ] **Step 3: Update `combat-loop.js` import**

Replace:
```js
import { showDialogueChoices } from './dialogue-choices.js';
```
With:
```js
import { renderButtonsAsync } from './ui-components.js';
```

- [ ] **Step 4: Update `combat-loop.js` usage**

Find all calls to `showDialogueChoices` in `combat-loop.js` (there are 2 — around lines 2590 and 3080). Replace each:

```js
const selectedIndex = await showDialogueChoices(round.options);
```

With:

```js
const selectedIndex = await renderButtonsAsync(
  round.options.map(o => ({
    label: renderEnFirst(typeof o === 'string' ? o : o.text),
  }))
);
```

Note: `renderEnFirst` is already imported in combat-loop.js. The old `showDialogueChoices` applied `renderEnFirst` internally — the new code must apply it at the call site.

- [ ] **Step 5: Syntax check both files**

Run: `node --check public/js/game.js && node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Delete dialogue-choices.js**

```bash
rm public/js/ui/dialogue-choices.js
```

- [ ] **Step 7: Check no remaining imports of dialogue-choices.js**

Run: `grep -r "dialogue-choices" public/js/`
Expected: No results (or only comments).

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add public/js/game.js public/js/ui/combat-loop.js
git rm public/js/ui/dialogue-choices.js
git commit -m "refactor: replace dialogue-choices.js with renderButtonsAsync"
```

---

### Task 4: Add `renderChoices` to `ui-components.js`

**Files:**
- Modify: `public/js/ui/ui-components.js`
- Modify: `public/game.css`

- [ ] **Step 1: Add `renderChoices` to `ui-components.js`**

Append after `renderButtonsAsync`:

```js
/**
 * Render a list of tappable choice cards with a unified card template.
 * Callers use narration box to instruct the player — no title/subtitle here.
 *
 * @param {object} options
 * @param {Array<{sprite?: string, title: string, subtitle?: string, pills?: string, badge?: {text: string, color: string}, helpBtn?: Function}>} options.cards
 * @param {Function} options.onSelect - Called with selected card index
 * @param {boolean} [options.disableAfterSelect=true] - Grey out all cards after selection
 * @param {HTMLElement} [options.container] - Target element (defaults to #action-area)
 */
export function renderChoices({ cards, onSelect, disableAfterSelect = true, container } = {}) {
  const el = container || document.getElementById('action-area');
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'ui-choice-list';

  let selected = false;

  cards.forEach((card, i) => {
    const btn = document.createElement('button');
    btn.className = 'ui-choice';

    let html = '';

    if (card.badge) {
      html += `<span class="ui-choice__badge" style="background:${card.badge.color}">${card.badge.text}</span>`;
    }

    if (card.helpBtn) {
      html += `<button class="ui-choice__help" data-help-index="${i}">?</button>`;
    }

    if (card.sprite) {
      html += `<div class="ui-choice__sprite">${card.sprite}</div>`;
    }

    html += '<div class="ui-choice__info">';
    html += `<div class="ui-choice__title">${card.title}</div>`;
    if (card.subtitle) html += `<div class="ui-choice__subtitle">${card.subtitle}</div>`;
    if (card.pills) html += `<div class="ui-choice__pills">${card.pills}</div>`;
    html += '</div>';

    btn.innerHTML = html;

    btn.addEventListener('click', (e) => {
      if (e.target.closest('.ui-choice__help')) return;
      if (selected && disableAfterSelect) return;
      selected = true;
      playSFX('button-tap');
      hapticLight();
      btn.classList.add('ui-choice--selected');
      if (disableAfterSelect) {
        list.querySelectorAll('.ui-choice').forEach(c => {
          c.classList.add('ui-choice--disabled');
          c.style.pointerEvents = 'none';
        });
        btn.style.opacity = '1';
      }
      onSelect(i);
    });

    if (card.helpBtn) {
      const helpEl = btn.querySelector('.ui-choice__help');
      helpEl?.addEventListener('click', (e) => {
        e.stopPropagation();
        card.helpBtn();
      });
    }

    list.appendChild(btn);
  });

  el.appendChild(list);
}
```

- [ ] **Step 2: Add CSS for `.ui-choice` classes to `game.css`**

Append after the `.ui-btn` section:

```css
/* ========== UI COMPONENTS: CHOICE CARDS ========== */

.ui-choice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  box-sizing: border-box;
}

.ui-choice {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  width: 100%;
}

.ui-choice:active {
  transform: scale(0.98);
  opacity: 0.85;
}

.ui-choice--selected {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px var(--accent-cyan);
}

.ui-choice--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.ui-choice__sprite {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
}

.ui-choice__sprite img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.ui-choice__info {
  flex: 1;
  min-width: 0;
}

.ui-choice__title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-primary);
}

.ui-choice__subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.3;
}

.ui-choice__pills {
  margin-top: 4px;
  font-size: 12px;
}

.ui-choice__badge {
  position: absolute;
  top: 4px;
  left: 8px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
  text-transform: uppercase;
}

.ui-choice__help {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/ui-components.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/ui-components.js public/game.css
git commit -m "feat: add renderChoices to ui-components.js"
```

---

### Task 5: Migrate text-only card screens (skill master, NPC battle skill, area selection)

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Add `renderChoices` import**

Update the existing import line in exploration.js:

```js
import { renderButtons } from './ui-components.js';
```

Change to:

```js
import { renderButtons, renderChoices } from './ui-components.js';
```

- [ ] **Step 2: Rewrite `renderAreaSelection()`**

Replace the entire function (lines 365-418) with:

```js
export async function renderAreaSelection() {
  const gameState = getGameState();

  if (gameState.run?.startingCreatureShop?.active) return;

  const areas = await apiGetAreaOptions();
  if (!areas || !areas.length) {
    actions.setContent('<p style="text-align:center">No areas available</p>');
    return;
  }

  const areasCompleted = gameState.run?.areasCompleted || 0;
  const areasToWin = gameState.run?.areasToWin || 10;

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Area ${areasCompleted + 1} / ${areasToWin}
    </p>
  `);

  const actionArea = document.getElementById('action-area');
  const choiceContainer = document.createElement('div');
  actionArea.appendChild(choiceContainer);

  renderChoices({
    cards: areas.map(a => ({
      title: `<strong>${a.nameEn || a.name}</strong>`,
      subtitle: a.theme || '',
    })),
    onSelect: async (index) => {
      const result = await apiSelectArea(areas[index].id);
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    },
    container: choiceContainer,
  });
}
```

- [ ] **Step 3: Rewrite `renderSkillMaster()` card rendering section**

The function has loading/error/retry logic at the top that stays. Only the card rendering and click handling (lines 1015-1076) changes. Replace from `const offers = skillMasterState.offered ...` through end of function with:

```js
  const offers = skillMasterState.offered || room?.skillMaster?.offered || [];

  renderChoices({
    cards: offers.slice(0, 3).map(s => ({
      title: s.name || skillMasterState.catalogById?.[s.id]?.name || s.id,
      subtitle: s.desc || skillMasterState.catalogById?.[s.id]?.desc || '',
    })),
    onSelect: async (index) => {
      const skillId = offers[index].id;
      let result;
      try {
        result = await apiSkillMasterChoose?.(skillId);
      } catch (err) {
        sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
        renderSkillMaster();
        return;
      }
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      } else {
        sceneModule?.showNarration?.('Could not apply skill choice. Try again.', { autoDismiss: 2200 });
        renderSkillMaster();
      }
    },
  });
```

Also update the loading state and error/retry states throughout the function to use `renderButtons` for the Retry button instead of inline HTML with `.action-btn` classes. Replace each retry button pattern like:

```js
<button class="action-btn action-btn-primary" id="skillmaster-retry-btn">Retry</button>
```

With a `renderButtons` call after `setContent`. For example, for the fetch error block:

```js
      actions.setContent(`
        <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:380px;">
          <div style="text-align:center;font-weight:800;letter-spacing:0.02em;">Skill Master</div>
          <div style="text-align:center;color:var(--text-secondary);font-size:13px;">Failed to load offers.</div>
        </div>
      `);
      const retryContainer = document.createElement('div');
      document.getElementById('action-area').appendChild(retryContainer);
      renderButtons([
        { label: 'Retry', onClick: () => { skillMasterState.fetched = false; skillMasterState.offered = null; renderSkillMaster(); }, primary: true },
      ], { container: retryContainer });
      return;
```

Apply this same pattern to both error blocks in `renderSkillMaster`.

- [ ] **Step 4: Rewrite `renderNpcBattleSkillSelection()` card rendering section**

Same pattern as skill master. Replace from `const offers = npcBattleSkillState.offered ...` through end of function with:

```js
  const offers = npcBattleSkillState.offered || [];

  renderChoices({
    cards: offers.slice(0, 3).map(s => ({
      title: s.name || s.id,
      subtitle: s.desc || '',
    })),
    onSelect: async (index) => {
      const skillId = offers[index].id;
      try {
        await onSkillChosen?.(skillId);
      } catch (err) {
        sceneModule?.showNarration?.('Failed to choose skill.', { autoDismiss: 1800 });
        renderNpcBattleSkillSelection({ onSkillChosen, fetchOffers });
      }
    },
  });
```

Also update retry buttons in this function to use `renderButtons` (same pattern as Step 3).

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "refactor: migrate skill/area selection screens to renderChoices"
```

---

### Task 6: Migrate shrine and creature target screens

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/target-select.js`
- Modify: `public/js/ui/post-combat-shop.js`

- [ ] **Step 1: Add sprite imports to exploration.js if missing**

Verify `creatureStaticPath` is imported. If not, add to the existing sprite-utils import:

```js
import { creatureBgUrl, replaceWithTextSprite, itemSpriteHtml, creatureStaticPath } from './sprite-utils.js';
```

- [ ] **Step 2: Rewrite `renderShrine()` card section**

Replace the creature card HTML + click handler (from `const creatureCards = allCreatures.map(...)` through the click handler, lines 537-585) with:

```js
  renderChoices({
    cards: allCreatures.map(creature => {
      const hpPercent = Math.floor((creature.hp / creature.maxHp) * 100);
      const spriteHtml = `<img src="${creatureStaticPath(creature.id)}" alt="" onerror="this.style.display='none'">`;
      return {
        sprite: spriteHtml,
        title: `${creature.nameEn} Lv.${creature.level} → Lv.${creature.level + 1}`,
        subtitle: `${creature.rarity} · ${creature.element} · HP: ${creature.hp}/${creature.maxHp} (${hpPercent}%) · ATK: ${shrineDisplayAtk(creature.attack)}`,
      };
    }),
    onSelect: async (index) => {
      if (shrineInProgress) return;
      shrineInProgress = true;
      const creature = allCreatures[index];
      const result = await apiShrineUpgrade(creature.id);
      if (result?.state) { updateGameState(result.state); }
      sceneModule.showNarration(t('leveledUp', result?.creatureName || 'Creature', result?.newLevel || '?'), { autoDismiss: 2000 });
      shrineInProgress = false;
      updateUI();
    },
  });
```

- [ ] **Step 3: Rewrite `target-select.js`**

Replace the entire file with:

```js
// public/js/ui/target-select.js
import { dom } from '../dom.js';
import { ELEMENT_COLORS } from './creature-row.js';
import { creatureStaticPath } from './sprite-utils.js';
import { renderJpFirst } from './bootstrap-client.js';
import { renderChoices, renderButtons } from './ui-components.js';

const ELEMENT_KANJI = {
  fire: '火', water: '水', wood: '木',
  earth: '土', metal: '金', neutral: '—'
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

  // Filter valid targets
  const validTargets = [];
  const validIndices = [];
  targets.forEach((target, i) => {
    if (target.hp <= 0) return;
    if (type === 'enemy' && target.befriended) return;
    validTargets.push(target);
    validIndices.push(i);
  });

  if (validTargets.length === 0) {
    console.warn('[TargetSelect] No targetable enemies found — auto-cancelling');
    if (onCancel) onCancel();
    return;
  }

  // Header
  const header = document.createElement('div');
  header.className = 'target-header';
  header.innerHTML = `<span class="target-move-name">${renderJpFirst(move.name, move.reading, move.nameEn)}</span> → Select target`;
  container.appendChild(header);

  // Choice cards
  const choiceContainer = document.createElement('div');
  container.appendChild(choiceContainer);

  renderChoices({
    cards: validTargets.map(target => {
      const elemColor = ELEMENT_COLORS[target.element] || '#888';
      const elemKanji = ELEMENT_KANJI[target.element] || '—';
      const spriteHtml = `<img src="${creatureStaticPath(target.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`;
      return {
        sprite: spriteHtml,
        title: target.name,
        subtitle: `${target.nameEn} · Lv${target.level}`,
        badge: { text: elemKanji, color: elemColor },
      };
    }),
    onSelect: (index) => {
      if (onTargetSelect) onTargetSelect(validIndices[index]);
    },
    container: choiceContainer,
  });

  // Back button
  const btnContainer = document.createElement('div');
  container.appendChild(btnContainer);
  renderButtons([
    { label: 'Back', onClick: () => { if (onCancel) onCancel(); } },
  ], { container: btnContainer });
}

export function clear() {
  dom.actionArea.innerHTML = '';
}
```

- [ ] **Step 4: Rewrite `showTargetPicker` in `post-combat-shop.js`**

Replace the `showTargetPicker` function (lines 128-160) with:

```js
export function showTargetPicker(creatures, onPicked) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  renderChoices({
    cards: creatures.filter(Boolean).map((c, i) => ({
      sprite: creatureSpriteHtml(c.id, c.baseWord || c.name, c.element),
      title: `${c.baseReading || c.name} (${c.nameEn})`,
      subtitle: `Lv${c.level} · HP ${c.hp}/${c.maxHp}`,
    })),
    onSelect: (index) => {
      playSFX('creature-equip');
      if (onPicked) onPicked(index);
    },
    container: actionArea,
  });
}
```

Add to imports at top of post-combat-shop.js:

```js
import { renderChoices } from './ui-components.js';
```

- [ ] **Step 5: Syntax check all modified files**

Run: `node --check public/js/ui/exploration.js && node --check public/js/ui/target-select.js && node --check public/js/ui/post-combat-shop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/target-select.js public/js/ui/post-combat-shop.js
git commit -m "refactor: migrate shrine + target selection to renderChoices"
```

---

### Task 7: Migrate item selection screens (post-combat shop, friendly NPC)

**Files:**
- Modify: `public/js/ui/post-combat-shop.js`
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Rewrite `show()` in `post-combat-shop.js`**

Replace the `show` function (lines 45-119) with:

```js
export function show(items) {
  const actionArea = dom.actionArea;
  if (!actionArea) return;

  // Prefetch audio for all item words
  items.forEach(item => { if (item.word) prefetchWord(item.word); });

  renderChoices({
    cards: items.map(item => {
      const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
      return {
        sprite: itemSpriteHtml(item.id, item.word),
        title: renderJpFirst(item.word, item.reading, item.nameEn),
        pills: buildItemEffectPills(item),
        badge: { text: (item.rarity || 'common').toUpperCase(), color: rarityColor },
        helpBtn: () => showItemHelpPopup(item),
      };
    }),
    onSelect: (index) => {
      playSFX('creature-equip');
      if (items[index]?.word) playWord(items[index].word);
      flushExposures();
      if (onItemSelected) onItemSelected(index);
    },
    container: actionArea,
  });

  flushExposures();
}
```

- [ ] **Step 2: Extract help popup into a standalone function in `post-combat-shop.js`**

Add this helper function (replaces the inline help button logic):

```js
function showItemHelpPopup(item) {
  document.querySelector('.item-help-backdrop')?.remove();
  const nameHtml = renderJpFirst(item.word, item.reading, item.nameEn);
  const descHtml = item.descriptionTagged
    ? renderEnFirst(item.descriptionTagged)
    : (item.description || '');
  const backdrop = document.createElement('div');
  backdrop.className = 'item-help-backdrop';
  backdrop.innerHTML = `
    <div class="item-help-popup">
      <div class="item-help-name">${nameHtml}</div>
      <div class="item-help-pills">${buildItemEffectPills(item)}</div>
      <div class="item-help-desc">${descHtml}</div>
    </div>
  `;
  backdrop.addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}
```

Note: `buildStatPills` is called in the existing code but never defined — it's a pre-existing bug. Replace with `buildItemEffectPills` (which is already imported).

- [ ] **Step 3: Rewrite `renderFriendlyNpc()` card rendering in exploration.js**

Replace the item card rendering and click handling (from `const offers = friendlyNpcState.offered ...` through end of function, approximately lines 1180-1283) with:

```js
  const offers = friendlyNpcState.offered || [];

  renderChoices({
    cards: offers.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: `${item.word} (${item.reading})`,
      subtitle: item.nameEn,
      pills: buildItemEffectPills(item),
    })),
    onSelect: async (index) => {
      if (friendlyNpcState.choosing) return;
      friendlyNpcState.choosing = true;
      const itemId = offers[index].id;
      playSFX('creature-equip');

      // Phase 2: creature targeting
      const gameState = getGameState();
      const party = gameState.run?.creatureParty?.active || [];

      renderChoices({
        cards: party.filter(Boolean).map(creature => ({
          sprite: `<img src="${creatureStaticPath(creature.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`,
          title: `${creature.name} (${creature.nameEn})`,
          subtitle: `Lv.${creature.level} · HP: ${creature.hp}/${creature.maxHp}`,
        })),
        onSelect: async (creatureIndex) => {
          let result;
          try {
            result = await apiChooseFriendlyNpcItem?.(itemId, creatureIndex);
          } catch (err) {
            friendlyNpcState.choosing = false;
            sceneModule?.showNarration?.('Failed to choose item.', { autoDismiss: 1800 });
            renderFriendlyNpc();
            return;
          }
          if (result?.state) {
            updateGameState(result.state);
            friendlyNpcState.choosing = false;
            updateUI();
          } else {
            friendlyNpcState.choosing = false;
            sceneModule?.showNarration?.('Could not apply item. Tap to try again.', { autoDismiss: 2200 });
            renderFriendlyNpc();
          }
        },
      });
    },
  });
```

Also update error/retry buttons in `renderFriendlyNpc` to use `renderButtons` (same pattern as skill master in Task 5).

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/post-combat-shop.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/post-combat-shop.js public/js/ui/exploration.js
git commit -m "refactor: migrate item selection screens to renderChoices"
```

---

### Task 8: Clean up flash cards in actions.js

**Files:**
- Modify: `public/js/ui/actions.js`

- [ ] **Step 1: Remove dead code from `actions.js`**

Remove the following from `actions.js`:

1. **`showButtons` function** (lines 71-90) — replaced by `renderButtons`
2. **Multi-card mode in `showFlashCards`** (lines 196-262, the `else` branch) — remove entire dual/triple card rendering
3. **`CARD_ICONS` constant** (lines 94-98) — combat SVG icons
4. **`CARD_ACTIONS` constant** (line 100) — `['attack', 'defend', 'befriend']`
5. **`attachGradeHandlers` function** (lines 110-130) — only used by multi-card mode
6. **`getSelectedActionType` function** (lines 285-287)
7. **`clearSelectedActionType` function** (lines 292-294)
8. **`selectedActionType` variable** (line 40)
9. **`onDualCardSelect` variable** (line 39) and its usage in `init`

Update the `init` function signature to remove `dualCardSelect`:

```js
export function init({ equipBots, contextAction, cardSwipe, cardFlip }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;

  document.addEventListener('test-swipe', (e) => {
    if (onCardSwipe) onCardSwipe(e.detail);
  });
}
```

- [ ] **Step 2: Update the file's JSDoc header**

Replace the header comment to reflect the slimmed module:

```js
/**
 * @file actions.js - Action Area Coordinator
 *
 * PURPOSE:
 * Manages the #action-area div lifecycle. Provides content management
 * (setContent, clear) and flash card display for word discovery.
 * Button rendering has moved to ui-components.js.
 *
 * KEY EXPORTS:
 * - init({ equipBots, contextAction, cardSwipe, cardFlip }): Set up callbacks
 * - showFlashCards(words, options): Display single swipeable vocabulary card
 * - triggerEquipBots(): Programmatically trigger equip callback
 * - clear(): Empty the action area
 * - setContent(html): Set custom HTML content
 */
```

- [ ] **Step 3: Remove `showButtons` from any remaining callers**

Search for any remaining calls to `actions.showButtons` or `showButtons`:

Run: `grep -r "showButtons\|actions\.showButtons" public/js/ --include="*.js"`

If any remain, replace them with `renderButtons` calls.

- [ ] **Step 4: Remove `getSelectedActionType` / `clearSelectedActionType` from callers**

Run: `grep -r "getSelectedActionType\|clearSelectedActionType" public/js/ --include="*.js"`

Remove any calls to these functions. They were part of the combat flash card system which no longer exists.

- [ ] **Step 5: Update `init` callers to remove `dualCardSelect`**

Search for `actions.init` or `init({` calls that pass `dualCardSelect`:

Run: `grep -rn "dualCardSelect" public/js/ --include="*.js"`

Remove the `dualCardSelect` parameter from the init call.

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/ui/actions.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/actions.js
git commit -m "refactor: slim actions.js — remove showButtons + combat flash card code"
```

---

### Task 9: CSS cleanup — remove old classes

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Verify no remaining references to old CSS classes**

Run these checks to ensure old classes are no longer used in JS:

```bash
grep -rn "action-btn-primary\|action-btn-secondary\|action-btn-tertiary" public/js/ --include="*.js" | grep -v "ui-btn"
grep -rn "ward-option\|ward-selection-list" public/js/ --include="*.js"
grep -rn "shrine-creature-option\|shrine-creature-list\|shrine-creature-img\|shrine-creature-icon\|shrine-creature-info\|shrine-creature-name\|shrine-creature-rarity\|shrine-creature-desc\|shrine-creature-upgrade" public/js/ --include="*.js"
grep -rn "befriend-answer-option\|befriend-answer-list" public/js/ --include="*.js"
grep -rn "shop-item-card\|shop-item-sprite\|shop-item-info\|shop-item-word\|shop-item-effect\|shop-item-rarity-badge\|shop-help-btn" public/js/ --include="*.js"
grep -rn "target-row\|target-sprite-panel\|target-info-panel\|target-elem-badge\|target-cancel-btn" public/js/ --include="*.js"
grep -rn "dual-flash-card\|dual-card-wrapper\|dual-card-front\|dual-card-back\|dual-card-icon" public/js/ --include="*.js"
```

Expected: No results for any of these (or only in comments/dead code).

**If results are found**, go back and migrate the remaining reference before proceeding. Do NOT remove CSS that is still referenced.

- [ ] **Step 2: Remove old CSS blocks from `game.css`**

Remove these CSS sections (use the class names as anchors to find the blocks):

1. `.action-btn-primary`, `.action-btn-secondary`, `.action-btn-tertiary` and their `:active` variants — but keep `.action-btn` base class if used by standalone screens (whack-a-mole, move-select)
2. `.ward-option`, `.ward-option:active`, `.ward-option.selected`, `.ward-option.disabled`, `.ward-option-name`, `.ward-option-desc`, `#area-proceed-btn`
3. `.shrine-creature-list`, `.shrine-creature-option`, `.shrine-creature-option:active`, `.shrine-creature-option.disabled`, `.shrine-creature-icon`, `.shrine-creature-img`, `.shrine-creature-info`, `.shrine-creature-name`, `.shrine-creature-rarity` + its rarity variants, `.shrine-creature-desc`, `.shrine-creature-upgrade`, `.shrine-title`
4. `.shop-item-card`, `.shop-item-card:active`, `.shop-item-card.selected`, `.shop-item-sprite`, `.shop-item-sprite-img`, `.shop-item-rarity-badge`, `.shop-item-word`, `.shop-item-reading`, `.shop-item-meaning`, `.shop-item-divider`, `.shop-item-info`, `.shop-item-effect`, `.shop-title`, `.shop-items`, `.post-combat-shop`
5. `.befriend-answer-option`, `.befriend-target-option`, `.befriend-target-option:active`
6. `.target-header`, `.target-move-name`, `.target-list`, `.target-row`, `.target-row:active`, `.target-sprite-panel`, `.target-sprite-img`, `.target-sprite-fallback`, `.target-elem-badge`, `.target-info-panel`, `.target-jp`, `.target-en`, `.target-baseword`, `.target-stats`, `.target-lv`, `.target-hp-bar`, `.target-hp-fill`, `.target-hp-pct`, `.target-cancel-btn`
7. `.dual-flash-card-container`, `.dual-card-wrapper`, `.dual-flash-card`, all dual-flash-card variants (`.attack`, `.defend`, `.befriend`, `.triple`, `.selected`, `.hidden`), `.dual-card-front`, `.dual-card-back`, `.dual-card-icon`

**Keep:** `.flash-card-container`, `.flash-card`, `.flash-card-front`, `.flash-card-back`, `.flash-card-word`, `.flash-card-meaning`, `.flash-card-hint` — still used by single-card mode and speed review. Also keep `.item-help-backdrop`, `.item-help-popup` — still used by post-combat shop help.

- [ ] **Step 3: Check `.action-btn` base class usage**

Run: `grep -rn '"action-btn"' public/js/ --include="*.js"`

If `.action-btn` (the base class, not the variants) is still used by standalone screens (whack-a-mole gameplay, etc.), keep it. Otherwise remove it too.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/game.css
git commit -m "refactor: remove old CSS classes replaced by ui-components"
```

---

### Task 10: Final cleanup — unused imports and barrel exports

**Files:**
- Modify: `public/js/ui/exploration.js` (remove unused imports)
- Modify: any barrel export files

- [ ] **Step 1: Clean up unused imports in exploration.js**

Check if these are still needed after the migration:
- `actions` module — still needed for `setContent`, `clear`, `triggerEquipBots`
- `replaceWithTextSprite` — no longer needed if shrine uses `onerror="this.style.display='none'"` instead
- Any other imports that were only used by removed code

Remove unused imports.

- [ ] **Step 2: Clean up unused imports in post-combat-shop.js**

Check if `t`, `isJapanified`, `renderJpFirst` are still used after the rewrite. Keep only what's needed.

- [ ] **Step 3: Remove `dialogue-choices` from any barrel exports**

Run: `grep -rn "dialogue-choices" public/js/ --include="*.js"`

If it appears in any index/barrel file, remove the re-export.

- [ ] **Step 4: Check for unused `showButtons` references**

Run: `grep -rn "showButtons" public/js/ --include="*.js"`

Remove any remaining dead references.

- [ ] **Step 5: Full syntax check on all modified files**

```bash
node --check public/js/ui/ui-components.js && \
node --check public/js/ui/actions.js && \
node --check public/js/ui/exploration.js && \
node --check public/js/ui/target-select.js && \
node --check public/js/ui/post-combat-shop.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/game.js && \
echo "ALL OK"
```

Expected: `ALL OK`

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: final cleanup — remove unused imports and dead references"
```
