# Chip Select Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the takeover modal chip selection with an in-scene experience that shows chips as characters with Japanese greetings.

**Architecture:** Create a new `chip-select.js` UI module that renders chip cards in the action area, displays selected chip's icon in the enemy sprite area, and shows persistent narration. The module exports a Promise-based `showChipSelect(chips)` function that resolves to the chosen chip.

**Tech Stack:** Vanilla JS (ES modules), existing DOM elements, existing CSS patterns from `.shop-chip-*` classes.

---

## Task 1: Create chip-select.js Module Skeleton

**Files:**
- Create: `public/js/ui/chip-select.js`

**Step 1: Create the module with exports**

```javascript
/**
 * chip-select.js - In-scene chip selection UI
 *
 * Shows chips as selectable cards in action area, with selected chip
 * displayed as a "character" in the sprite area with narration.
 */

import { dom } from '../dom.js';
import { playSFX } from '../audio.js';
import * as narrationBox from './narration-box.js';

const CHIP_GREETING = 'こんにちは！私を選んでくれる？';

let resolveSelection = null;
let selectedIndex = 0;
let currentChips = [];

/**
 * Show chip selection UI in the scene
 * @param {Object[]} chips - Array of chip objects to choose from
 * @returns {Promise<Object>} Resolves to the selected chip
 */
export function showChipSelect(chips) {
  return new Promise((resolve) => {
    resolveSelection = resolve;
    currentChips = chips;
    selectedIndex = 0;

    renderChipCards(chips);
    showSelectedChip(chips[0]);
  });
}

function renderChipCards(chips) {
  // TODO: Implement in Task 2
}

function showSelectedChip(chip) {
  // TODO: Implement in Task 3
}

function confirmSelection() {
  // TODO: Implement in Task 4
}

/** Clean up chip select UI */
export function cleanup() {
  dom.actionArea.innerHTML = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  narrationBox.forceHide();
  resolveSelection = null;
  currentChips = [];
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/chip-select.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add public/js/ui/chip-select.js
git commit -m "feat(chip-select): create module skeleton"
```

---

## Task 2: Implement Chip Cards in Action Area

**Files:**
- Modify: `public/js/ui/chip-select.js`
- Modify: `public/game.css`

**Step 1: Add CSS for chip select cards**

Add to `public/game.css` after the `.shop-chip-option:active` rule (around line 886):

```css
/* ===== CHIP SELECT (In-Scene) ===== */
.chip-select-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px;
  width: 100%;
}

.chip-select-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chip-select-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  border: 2px solid transparent;
}

.chip-select-card.selected {
  border-color: var(--accent-orange);
  box-shadow: 0 0 12px rgba(255, 153, 0, 0.4);
}

.chip-select-card:active {
  transform: scale(0.98);
}

.chip-select-name {
  font-weight: 600;
  font-size: 14px;
}

.chip-select-rarity {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.chip-select-desc {
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chip-select-btn {
  margin-top: 8px;
  padding: 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--btn-primary);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.chip-select-btn:active {
  transform: scale(0.98);
}
```

**Step 2: Implement renderChipCards function**

Replace the `renderChipCards` stub in `public/js/ui/chip-select.js`:

```javascript
function renderChipCards(chips) {
  const cardsHtml = chips.map((chip, i) => `
    <div class="chip-select-card${i === 0 ? ' selected' : ''}" data-index="${i}">
      <div class="chip-select-name">${chip.name || chip.nameEn}</div>
      <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="chip-select-desc">${chip.description || chip.descriptionEn || ''}</div>
    </div>
  `).join('');

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      <div class="chip-select-cards">${cardsHtml}</div>
      <button class="chip-select-btn" id="chip-select-confirm">チップを選ぶ</button>
    </div>
  `;

  // Card click handlers
  dom.actionArea.querySelectorAll('.chip-select-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      selectChip(index);
    });
  });

  // Confirm button handler
  document.getElementById('chip-select-confirm').addEventListener('click', confirmSelection);
}

function selectChip(index) {
  if (index === selectedIndex) return;

  // Update visual selection
  dom.actionArea.querySelectorAll('.chip-select-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });

  selectedIndex = index;
  playSFX('button-tap');
  showSelectedChip(currentChips[index]);
}
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/chip-select.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add public/js/ui/chip-select.js public/game.css
git commit -m "feat(chip-select): render chip cards in action area"
```

---

## Task 3: Show Selected Chip as Character

**Files:**
- Modify: `public/js/ui/chip-select.js`

**Step 1: Implement showSelectedChip function**

Replace the `showSelectedChip` stub:

```javascript
function showSelectedChip(chip) {
  // Show chip name (Japanese preferred)
  dom.enemyName.textContent = chip.name || chip.nameEn;
  dom.enemyInfo.classList.add('visible');

  // Hide HP bar (chips don't have HP)
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Show chip icon as sprite
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.png`;
  dom.enemySprite.src = iconPath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    dom.enemySprite.classList.add('visible');
  };

  // Show greeting narration (persistent - no click to dismiss)
  narrationBox.show(CHIP_GREETING, {
    speaker: chip.name || chip.nameEn,
    persistent: true
  });
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/chip-select.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add public/js/ui/chip-select.js
git commit -m "feat(chip-select): show selected chip as character with greeting"
```

---

## Task 4: Implement Confirm Selection

**Files:**
- Modify: `public/js/ui/chip-select.js`

**Step 1: Implement confirmSelection function**

Replace the `confirmSelection` stub:

```javascript
function confirmSelection() {
  if (!resolveSelection) return;

  const chip = currentChips[selectedIndex];
  playSFX('chip-equip');

  // Clean up UI
  cleanup();

  // Resolve the promise with selected chip
  resolveSelection(chip);
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/chip-select.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add public/js/ui/chip-select.js
git commit -m "feat(chip-select): implement confirm selection"
```

---

## Task 5: Wire Up Starting Chip Selection

**Files:**
- Modify: `public/js/ui/economy.js`
- Modify: `public/game.js`

**Step 1: Import chip-select in economy.js**

Add import at top of `public/js/ui/economy.js`:

```javascript
import * as chipSelect from './chip-select.js';
```

**Step 2: Modify renderStartingChipShop to use chip-select**

Replace the `renderStartingChipShop` function in `public/js/ui/economy.js`:

```javascript
/** Render starting chip selection (in-scene, not takeover) */
export async function renderStartingChipShop(items) {
  const chip = await chipSelect.showChipSelect(items);
  const index = items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

  const result = await apiClaimStartingChip(index);
  if (result?.state) {
    updateGameState(result.state);
  }

  speakText(chip.name || chip.nameEn);

  if (apiGetChipLoadout && setChipLoadoutCache) {
    const loadout = await apiGetChipLoadout();
    setChipLoadoutCache(loadout);
  }
  updateUI();
}
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/economy.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add public/js/ui/economy.js
git commit -m "feat(chip-select): wire up starting chip selection"
```

---

## Task 6: Wire Up Post-Combat Chip Selection

**Files:**
- Modify: `public/js/ui/economy.js`

**Step 1: Modify renderPostCombatShop to use chip-select**

Replace the `renderPostCombatShop` function:

```javascript
/** Render post-combat chip shop (in-scene, not takeover) */
export async function renderPostCombatShop() {
  const gameState = getGameState();
  const shop = gameState.run?.postCombatShop;
  if (!shop?.active || !shop?.items) {
    handleSkip();
    return;
  }

  const chip = await chipSelect.showChipSelect(shop.items);
  const index = shop.items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

  const result = await apiPostCombatShopBuy(index);
  if (result?.state) {
    updateGameState(result.state);
  }

  playSFX('chip-equip');
  speakText(chip.name || chip.nameEn);

  if (apiGetChipLoadout && setChipLoadoutCache) {
    const loadout = await apiGetChipLoadout();
    setChipLoadoutCache(loadout);
  }
  updateUI();
}
```

**Step 2: Remove the old renderChipShopContent function**

Delete the entire `renderChipShopContent` function (lines ~50-95 approximately) since it's no longer used.

**Step 3: Verify syntax**

Run: `node --check public/js/ui/economy.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add public/js/ui/economy.js
git commit -m "feat(chip-select): wire up post-combat chip selection"
```

---

## Task 7: Add Skip Button for Post-Combat Shop

**Files:**
- Modify: `public/js/ui/chip-select.js`

**Step 1: Update showChipSelect to accept options**

Modify the function signature and rendering to support an optional skip button:

```javascript
/**
 * Show chip selection UI in the scene
 * @param {Object[]} chips - Array of chip objects to choose from
 * @param {Object} [options]
 * @param {boolean} [options.allowSkip] - Show skip button (for post-combat, not starting chip)
 * @returns {Promise<Object|null>} Resolves to selected chip, or null if skipped
 */
export function showChipSelect(chips, options = {}) {
  return new Promise((resolve) => {
    resolveSelection = resolve;
    currentChips = chips;
    selectedIndex = 0;

    renderChipCards(chips, options);
    showSelectedChip(chips[0]);
  });
}
```

**Step 2: Update renderChipCards to show skip button**

Modify `renderChipCards` to accept and use options:

```javascript
function renderChipCards(chips, options = {}) {
  const cardsHtml = chips.map((chip, i) => `
    <div class="chip-select-card${i === 0 ? ' selected' : ''}" data-index="${i}">
      <div class="chip-select-name">${chip.name || chip.nameEn}</div>
      <div class="chip-select-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="chip-select-desc">${chip.description || chip.descriptionEn || ''}</div>
    </div>
  `).join('');

  const skipBtn = options.allowSkip
    ? '<button class="chip-select-btn chip-select-skip" id="chip-select-skip">スキップ</button>'
    : '';

  dom.actionArea.innerHTML = `
    <div class="chip-select-container">
      <div class="chip-select-cards">${cardsHtml}</div>
      <button class="chip-select-btn" id="chip-select-confirm">チップを選ぶ</button>
      ${skipBtn}
    </div>
  `;

  // Card click handlers
  dom.actionArea.querySelectorAll('.chip-select-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      selectChip(index);
    });
  });

  // Confirm button handler
  document.getElementById('chip-select-confirm').addEventListener('click', confirmSelection);

  // Skip button handler
  document.getElementById('chip-select-skip')?.addEventListener('click', skipSelection);
}
```

**Step 3: Add skipSelection function**

Add after `confirmSelection`:

```javascript
function skipSelection() {
  if (!resolveSelection) return;

  playSFX('button-tap');
  cleanup();
  resolveSelection(null);
}
```

**Step 4: Update economy.js to use allowSkip**

In `renderPostCombatShop`, change the showChipSelect call:

```javascript
const chip = await chipSelect.showChipSelect(shop.items, { allowSkip: true });

// Handle skip
if (!chip) {
  await handleSkip();
  return;
}
```

**Step 5: Add CSS for skip button variant**

Add to `public/game.css` after `.chip-select-btn:active`:

```css
.chip-select-skip {
  background: transparent;
  border: 1px solid var(--text-secondary);
  color: var(--text-secondary);
}
```

**Step 6: Verify syntax**

Run: `node --check public/js/ui/chip-select.js && node --check public/js/ui/economy.js`
Expected: No output (success)

**Step 7: Commit**

```bash
git add public/js/ui/chip-select.js public/js/ui/economy.js public/game.css
git commit -m "feat(chip-select): add skip button for post-combat shop"
```

---

## Task 8: Remove Unused Takeover Modal Code

**Files:**
- Modify: `public/game.html`
- Modify: `public/game.css`

**Step 1: Evaluate if chip-shop-view takeover is still used**

Check if any code still uses the `chip-shop-view` takeover. If `renderChipShopContent` is removed and both chip selection flows use the new in-scene UI, the takeover may be unused.

Search for usage: `grep -r "chipShop" public/js/`

If only `takeover.close('chipShop')` remains in old code paths, those can be removed.

**Step 2: Clean up unused references in economy.js**

Remove the `takeover.open('chipShop')` and `takeover.close('chipShop')` calls if they exist.

**Step 3: Commit cleanup**

```bash
git add public/js/ui/economy.js
git commit -m "refactor(chip-select): remove unused takeover modal references"
```

---

## Task 9: Manual Testing

**No code changes - manual verification**

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test starting chip selection**

1. Create new character or start new run
2. Verify three chip cards appear in action area (no icons)
3. Verify first chip is auto-selected with highlight
4. Verify chip icon appears large in sprite area
5. Verify narration shows greeting with chip name as speaker
6. Click different chip - verify highlight moves, sprite updates, speaker updates
7. Click "チップを選ぶ" - verify chip is selected and game proceeds

**Step 3: Test post-combat chip selection**

1. Win a combat encounter
2. Verify chip selection appears with skip button
3. Test selecting a chip
4. Test skipping (on another encounter)

**Step 4: Test lookup mode**

1. Activate lookup mode during chip selection
2. Verify Japanese text in chip names/descriptions is parseable
3. Verify narration greeting is parseable

---

## Task 10: Run E2E Tests

**Step 1: Run the test suite**

Run: `./scripts/e2e-test.sh`

Expected: 80+/87 tests pass (known flakiness acceptable)

**Step 2: Fix any regressions**

If chip-related tests fail, investigate and fix. Common issues:
- Selectors changed (update test selectors)
- Timing issues (add waits)

**Step 3: Commit any test fixes**

```bash
git add tests/
git commit -m "test: fix e2e tests for chip select redesign"
```
