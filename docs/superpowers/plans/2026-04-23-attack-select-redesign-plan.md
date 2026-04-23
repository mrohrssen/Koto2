# Attack-Select Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current in-combat move-select card with an element-tinted design: rounded-square badge on the left (keeps the per-move sprite), 3-row text block on the right (romaji / hiragana / English), semi-white MP-pipe-effect pill at the bottom, help button floating top-right.

**Architecture:** Pure surgical change — touch only `buildMoveCell()` in `public/js/ui/move-select.js` and the `.move-*` CSS rule block in `public/game.css` (lines ~4265–4569). Extract an `effectLabel(move)` pure helper so the branching logic for damage / buff / debuff / heal / status is testable in isolation. `showMoves()` callback contract, grid container, stagger animations, disabled logic, split-cell/items/befriend cells, help popup, and TTS prefetch are all preserved verbatim.

**Tech Stack:** Vanilla ES modules, `node:test` + `assert/strict` for unit tests, Playwright for visual verification, inline SVG for pill icons (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-04-23-attack-select-redesign-design.md`

---

## File Structure

- **Create** `public/js/ui/move-effect-label.js` — exports `effectLabel(move)` → `{ iconType: string, text: string }`. Pure, no DOM.
- **Create** `tests/unit/ui/move-effect-label.test.js` — covers all six effectLabel rules.
- **Modify** `public/js/ui/move-select.js` — rewrite `buildMoveCell()` template (imports `effectLabel`, inlines the six SVG icons). Keep every existing export and callback shape.
- **Modify** `public/game.css` — replace the `/* === Move Selection Grid === */` block (line 4265) through the end of `.move-active-label` (line ~4569). Keep `.move-items-cell`, `.move-split-cell`, `.move-befriend-half`, and the `.move-help-popup` rules untouched.

No other files change. No new npm dependencies.

---

## Task 1: Extract `effectLabel(move)` helper with unit tests

**Files:**
- Create: `public/js/ui/move-effect-label.js`
- Create: `tests/unit/ui/move-effect-label.test.js`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/unit/ui/move-effect-label.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectLabel } from '../../../public/js/ui/move-effect-label.js';

describe('effectLabel', () => {
  it('damage move returns sword + power number', () => {
    const move = { category: 'damage', power: 15, mpCost: 12, statusEffect: null };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '15' });
  });

  it('damage move with zero power still returns sword + "0"', () => {
    const move = { category: 'damage', power: 0, mpCost: 5, statusEffect: null };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '0' });
  });

  it('buff with single statChange returns chevron-up + formatted label', () => {
    const move = { category: 'buff', power: 0, statChanges: { atk: 1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Atk +1' });
  });

  it('buff with multiple statChanges picks largest magnitude', () => {
    const move = { category: 'buff', power: 0, statChanges: { atk: 1, def: 2 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Def +2' });
  });

  it('buff with tied magnitude tie-breaks atk > def > spd', () => {
    const move = { category: 'buff', power: 0, statChanges: { def: 1, atk: 1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Atk +1' });
  });

  it('buff with empty statChanges falls through to default', () => {
    const move = { category: 'buff', power: 0, statChanges: {} };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '0' });
  });

  it('debuff returns chevron-down with negative label', () => {
    const move = { category: 'debuff', power: 0, statChanges: { atk: -1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-down', text: 'Atk -1' });
  });

  it('heal returns heart + Heal <power>', () => {
    const move = { category: 'heal', power: 25, mpCost: 8 };
    assert.deepEqual(effectLabel(move), { iconType: 'heart', text: 'Heal 25' });
  });

  it('status-only non-damage returns star + effect + duration', () => {
    const move = { category: 'status', power: 0, statusEffect: 'poison', statusDuration: 3 };
    assert.deepEqual(effectLabel(move), { iconType: 'star', text: 'Poison 3T' });
  });

  it('damage with status effect still returns sword + power (status visible in help popup)', () => {
    const move = { category: 'damage', power: 20, statusEffect: 'stun', statusDuration: 1 };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '20' });
  });

  it('unknown category falls through to default damage behavior', () => {
    const move = { category: 'mystery', power: 7 };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '7' });
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="effectLabel"`
Expected: FAIL with `Cannot find module 'public/js/ui/move-effect-label.js'`.

- [ ] **Step 1.3: Write the minimal implementation**

Create `public/js/ui/move-effect-label.js`:

```javascript
const STAT_LABELS = { atk: 'Atk', def: 'Def', spd: 'Spd' };
const STAT_PRIORITY = ['atk', 'def', 'spd'];

function pickDominantStat(statChanges) {
  const entries = Object.entries(statChanges || {}).filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;

  let best = entries[0];
  for (const [key, val] of entries) {
    const [bestKey, bestVal] = best;
    if (Math.abs(val) > Math.abs(bestVal)) best = [key, val];
    else if (Math.abs(val) === Math.abs(bestVal) &&
             STAT_PRIORITY.indexOf(key) < STAT_PRIORITY.indexOf(bestKey)) best = [key, val];
  }
  return best;
}

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Compute the right-hand stat label for a move-select card pill.
 * @param {object} move - move data (category, power, mpCost, statChanges, statusEffect, statusDuration)
 * @returns {{iconType: string, text: string}}
 */
export function effectLabel(move) {
  if (move.category === 'buff') {
    const dominant = pickDominantStat(move.statChanges);
    if (dominant) {
      const [key, val] = dominant;
      const label = STAT_LABELS[key] || capitalize(key);
      const sign = val > 0 ? '+' : '';
      return { iconType: 'chevron-up', text: `${label} ${sign}${val}` };
    }
  }

  if (move.category === 'debuff') {
    const dominant = pickDominantStat(move.statChanges);
    if (dominant) {
      const [key, val] = dominant;
      const label = STAT_LABELS[key] || capitalize(key);
      return { iconType: 'chevron-down', text: `${label} ${val}` };
    }
  }

  if (move.category === 'heal') {
    return { iconType: 'heart', text: `Heal ${move.power ?? 0}` };
  }

  if (move.statusEffect && move.category !== 'damage') {
    const duration = move.statusDuration || 0;
    return { iconType: 'star', text: `${capitalize(move.statusEffect)} ${duration}T` };
  }

  return { iconType: 'sword', text: String(move.power ?? 0) };
}
```

- [ ] **Step 1.4: Run the tests and verify all pass**

Run: `npm run test:unit -- --test-name-pattern="effectLabel"`
Expected: PASS — all 11 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add public/js/ui/move-effect-label.js tests/unit/ui/move-effect-label.test.js
git commit -m "feat(ui): effectLabel helper for move-card pill"
```

---

## Task 2: Rewrite `buildMoveCell()` HTML template

**Files:**
- Modify: `public/js/ui/move-select.js` (full rewrite of `buildMoveCell`, add SVG helpers, import `effectLabel`)

- [ ] **Step 2.1: Read the current file to see what needs preserving**

Run: `cat public/js/ui/move-select.js`
Expected: See the existing `init`, `buildMoveCell`, `buildItemsCell`, `buildBefriendCell`, `buildSplitCell`, `showMoves`, `clear`, `setActiveLabel` exports. Preserve all of them except `buildMoveCell`, which we rewrite.

- [ ] **Step 2.2: Add the new imports and SVG icon map**

At the top of `public/js/ui/move-select.js`, below the existing imports, add:

```javascript
import { effectLabel } from './move-effect-label.js';
import { toRomaji } from './romaji.js';
```

Add below the existing `STATUS_ICONS` / `CATEGORY_ICONS` constants (keep them — they're used elsewhere / may be used by the help popup fallback):

```javascript
const SVG_ICONS = {
  drop:          '<svg class="move-pill-ico move-pill-ico--mp" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z"/></svg>',
  sword:         '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5 20.5 9.5M4 20l4.5-1.5L20 7l-3-3L5.5 15.5 4 20z"/><path d="M11.5 12.5 15 9"/></svg>',
  'chevron-up':   '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>',
  'chevron-down': '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M18 12l-6 6-6-6"/></svg>',
  heart:         '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/></svg>',
  star:          '<svg class="move-pill-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 15.5 6.4 19.5l2.1-6.7L3 8.8h6.8z"/></svg>',
};

function renderIcon(type) {
  return SVG_ICONS[type] || SVG_ICONS.sword;
}
```

- [ ] **Step 2.3: Replace the `buildMoveCell` function**

Replace the entire existing `buildMoveCell` function with:

```javascript
export function buildMoveCell(move, canAfford) {
  const cell = document.createElement('button');
  const element = move.element || 'neutral';
  cell.className = 'move-cell move-cell--' + element + (canAfford ? '' : ' disabled');

  const slug = iconSlug(move.nameEn);
  const iconFallback = CATEGORY_ICONS[move.category] || '★';

  // MP cost — warn if missing (debug aid for "0 MP" bug)
  const mpCost = move.mpCost ?? 0;
  if (!move.mpCost && move.mpCost !== 0) {
    console.warn('[MoveSelect] Move missing mpCost:', move.id, move.nameEn, JSON.stringify(Object.keys(move)));
  }

  const nameHtml = renderJpSentence([entityToToken(move)], getKnownWords(), new Map());
  const romaji = toRomaji(move.reading || '');
  const effect = effectLabel(move);

  cell.innerHTML = `
    <div class="move-help-btn" data-move-id="${move.id}">?</div>
    <div class="move-hero">
      <div class="move-badge">
        <img src="/assets/sprites/actions/${slug}.webp?v=20260322"
             onerror="this.parentElement.textContent='${iconFallback}'; this.remove();"
             alt="">
      </div>
      <div class="move-text">
        <div class="move-romaji">${romaji}</div>
        <div class="move-name-jp">${nameHtml}</div>
        <div class="move-name-en">${move.nameEn}</div>
      </div>
    </div>
    <div class="move-pill">
      <span class="move-pill-stat">${renderIcon('drop')}<span>${mpCost} MP</span></span>
      <span class="move-pill-divider"></span>
      <span class="move-pill-stat">${renderIcon(effect.iconType)}<span>${effect.text}</span></span>
    </div>
  `;

  const helpBtn = cell.querySelector('.move-help-btn');
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onMoveHelp) onMoveHelp(move);
  });

  return cell;
}
```

The function's signature and return value match the old one exactly. `showMoves()` calls `buildMoveCell(move, canAfford)`, wires the click listener, and appends to the grid without knowing anything about the internals — so we don't need to touch it.

- [ ] **Step 2.4: Syntax-check the file**

Run: `node --check public/js/ui/move-select.js && echo "OK"`
Expected: `OK` on stdout.

- [ ] **Step 2.5: Run the full test suite to catch regressions**

Run: `npm test`
Expected: PASS. No existing test touches the raw innerHTML of `.move-cell`, so nothing should break. If a test fails, inspect — the prior structure may have been asserted on and we need to update it.

- [ ] **Step 2.6: Commit**

```bash
git add public/js/ui/move-select.js
git commit -m "feat(ui): rewrite buildMoveCell template for element-tinted card"
```

---

## Task 3: Replace `.move-*` CSS block

**Files:**
- Modify: `public/game.css` — replace lines ~4265 through the end of `.move-active-label` (~line 4569). Do NOT touch `.move-items-cell`, `.move-split-cell`, `.move-befriend-half`, or `.move-help-popup` rules that follow.

- [ ] **Step 3.1: Read the current CSS block to lock in the boundaries**

Run: `grep -n "=== Move Selection Grid\|=== Move Learn Panel\|.move-items-cell\|.move-active-label\|.move-help-popup" public/game.css`
Expected: returns the start line (~4265) and the boundary lines so you know exactly what to cut.

The block to replace starts with the comment `/* === Move Selection Grid (Bright Gacha Style) === */` and ends just before `.move-items-cell` rule. `.move-items-cell` and everything after it must remain untouched.

- [ ] **Step 3.2: Replace the block**

Using the Edit tool, replace the range from `/* === Move Selection Grid (Bright Gacha Style) === */` through the closing `}` of `.move-active-label` (inclusive) with:

```css
/* === Move Selection Grid (Element Cards) === */

@keyframes moveCardIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.move-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: 8px;
  flex: 1;
  width: calc(100% + 32px);
  margin-left: -16px;
  margin-right: -16px;
  min-height: 0;
}

.move-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 9px 9px 7px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.55);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.38);
  color: var(--text-primary);
  cursor: pointer;
  overflow: hidden;
  animation: moveCardIn 0.25s ease-out both;
  transition: transform 0.1s, box-shadow 0.15s, opacity 0.2s;
  -webkit-tap-highlight-color: transparent;
  background: linear-gradient(180deg, #eee5d6 0%, #cbbfa5 100%); /* neutral fallback */
}

.move-cell:active {
  transform: scale(0.97);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.move-cell.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.move-cell:nth-child(1) { animation-delay: 0s; }
.move-cell:nth-child(2) { animation-delay: 0.06s; }
.move-cell:nth-child(3) { animation-delay: 0.12s; }

/* Element-specific card backgrounds and text colors */
.move-cell--fire    { background: linear-gradient(180deg, #ffc9b3 0%, #ff9b7a 100%); color: #3a1a10; }
.move-cell--water   { background: linear-gradient(180deg, #cfe9f7 0%, #98c7de 100%); color: #0f2a3d; }
.move-cell--wood    { background: linear-gradient(180deg, #d8e8bf 0%, #a9c98a 100%); color: #1e2e14; }
.move-cell--earth   { background: linear-gradient(180deg, #f1d9b2 0%, #e2bc84 100%); color: #3a2612; }
.move-cell--metal   { background: linear-gradient(180deg, #e5ebef 0%, #b7c4cd 100%); color: #1d2730; }
.move-cell--neutral { background: linear-gradient(180deg, #eee5d6 0%, #cbbfa5 100%); color: #3d3223; }

/* Help button floats top-right */
.move-help-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: rgba(0, 0, 0, 0.55);
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  z-index: 2;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.move-help-btn:active {
  background: rgba(255, 255, 255, 1);
  color: rgba(0, 0, 0, 0.85);
}

/* Hero row: badge on the left, 3-line text block on the right */
.move-hero {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 22px; /* leave room for help button */
  flex: 1;
  min-height: 0;
}

.move-badge {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 -3px 5px rgba(0, 0, 0, 0.18), 0 2px 4px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 28px; /* emoji fallback size */
}

.move-badge img {
  width: 38px;
  height: 38px;
  object-fit: contain;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}

/* Per-element badge fills */
.move-cell--fire    .move-badge { background: radial-gradient(circle at 35% 30%, #ffeacb, #ff6b3a 75%); }
.move-cell--water   .move-badge { background: radial-gradient(circle at 35% 30%, #d6f0ff, #4b9ed6 75%); }
.move-cell--wood    .move-badge { background: radial-gradient(circle at 35% 30%, #eef6d8, #7aae47 75%); }
.move-cell--earth   .move-badge { background: radial-gradient(circle at 35% 30%, #fae5c2, #c99356 75%); }
.move-cell--metal   .move-badge { background: radial-gradient(circle at 35% 30%, #f4f7fa, #8fa3b3 75%); }
.move-cell--neutral .move-badge { background: radial-gradient(circle at 35% 30%, #f4ecd9, #c7b892 75%); }

.move-text {
  flex: 1;
  min-width: 0;
  text-align: left;
  line-height: 1.05;
}

.move-romaji {
  font-size: 10px;
  opacity: 0.62;
  letter-spacing: 0.4px;
  margin-bottom: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: lowercase;
}

.move-name-jp {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.1;
  margin: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.move-name-en {
  font-size: 11.5px;
  font-weight: 700;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Stats pill below the hero row */
.move-pill {
  margin-top: 7px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.78);
  border-radius: 8px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  color: inherit;
}

.move-pill-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.move-pill-ico {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.move-pill-ico--mp { color: #1976d2; }
.move-cell--water   .move-pill-ico--mp { color: #0277bd; }
.move-cell--wood    .move-pill-ico--mp { color: #2e7d32; }
.move-cell--metal   .move-pill-ico--mp { color: #455a64; }
.move-cell--neutral .move-pill-ico--mp { color: #5d4037; }

.move-pill-divider {
  width: 1px;
  height: 12px;
  background: rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}

/* Disabled: red-ish MP stat so "can't afford" reads clearly */
.move-cell.disabled .move-pill-stat:first-child { color: #c62828; }
.move-cell.disabled .move-pill-stat:first-child .move-pill-ico--mp { color: #c62828; }

/* Active-selector label (unchanged behavior) */
.move-active-label {
  text-align: center;
  color: var(--accent-cyan);
  font-size: 12px;
  padding: 2px 0;
  font-weight: var(--font-weight-semi);
}
```

- [ ] **Step 3.3: Verify the boundary wasn't crossed**

Run: `grep -n "=== Move Selection Grid\|.move-items-cell\|.move-active-label\|=== Move Learn Panel" public/game.css`
Expected: You should see the new `/* === Move Selection Grid (Element Cards) === */` header, `.move-active-label` still present just before the `.move-items-cell` rule, and `.move-items-cell` untouched (still the same rule with `background: var(--glass-bg)` etc.).

- [ ] **Step 3.4: Run the full test suite to catch regressions**

Run: `npm test`
Expected: PASS. CSS changes don't run through unit tests but visual tests might snapshot; if `tests/visual/screens/combat.test.js` fails, that's expected and will be addressed in Task 4.

- [ ] **Step 3.5: Commit**

```bash
git add public/game.css
git commit -m "feat(ui): element-tinted move-select card styles"
```

---

## Task 4: Visual verification via Playwright

**Files:**
- No source changes. This task produces a screenshot and manual inspection.

- [ ] **Step 4.1: Start the dev server in the background**

Run: `npm run dev` (use a background-safe launcher like `nohup` or a separate terminal — Playwright needs it alive).
Wait 5 seconds, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`
Expected: `200`.

- [ ] **Step 4.2: Ask the user before launching Playwright**

CLAUDE.md rule: always ask before opening a Playwright session. Say to the user:

> "Ready to launch a Playwright browser to visually verify the card redesign. It'll navigate through login → combat and screenshot the move-select grid. OK to proceed?"

Wait for confirmation.

- [ ] **Step 4.3: Run through the playtest to reach combat**

Follow `docs/playtest-guide.md` to:
1. Log in as test user.
2. Advance to the first combat encounter.
3. Wait until the move-select grid renders (`dom.actionArea` contains `.move-grid`).

Verify with `browser_snapshot` that `.move-cell` elements are present. Take a screenshot:

```
browser_take_screenshot → screenshots/move-select-after.png
```

- [ ] **Step 4.4: Inspect the screenshot against the spec checklist**

Open the screenshot and verify:

- [ ] Cards have element-tinted gradients matching the creature's learnset (fire moves warm, water moves cool, neutral tan)
- [ ] Badge is a rounded square (not a circle) with the move's action sprite visible inside
- [ ] Three-row text block is left-aligned to the right of the badge: romaji (small) / hiragana (big, bold) / English (small)
- [ ] Stats pill at the bottom shows `💧 <n> MP | <icon> <effect>` with a visible 1px vertical divider
- [ ] `?` help button is a small white circle in the top-right corner, not crowding the pill
- [ ] The grid still lays out 2×2 (4 cells) at normal mobile width
- [ ] Disabled cards (if the creature doesn't have MP for a move) fade to ~40% and the MP stat goes red

If anything is off, note it, fix in `public/game.css` or `public/js/ui/move-select.js`, re-run the test.

- [ ] **Step 4.5: Clean up the screenshot and dev server**

Run: `rm screenshots/move-select-after.png` (per CLAUDE.md session cleanup rules).
Stop the dev server.

- [ ] **Step 4.6: Commit if any visual fixes were made**

If Step 4.4 surfaced issues that required code changes, commit them:

```bash
git add public/game.css public/js/ui/move-select.js
git commit -m "fix(ui): address visual polish from move-select playtest"
```

If no changes were needed, skip this step.

---

## Task 5: Non-regression sweep + PvP parity check

**Files:**
- No source changes unless something breaks.

- [ ] **Step 5.1: Verify PvP path still works**

`public/js/ui/pvp-battle.js` also calls `showMoves()` (line 163). The same `buildMoveCell` runs there, so nothing should have broken. Visually confirm by launching a PvP battle and taking a screenshot; the cards should look identical to PvE.

- [ ] **Step 5.2: Verify befriend move-select path**

`public/js/ui/befriend.js` calls `showMoves(creature, actingSlot, getMoveSelectBefriendOpts(actingSlot))` (line 261) during befriend challenges. Confirm the cards render the same way there. This is important — befriend passes `includeItems: true` with `onBefriend`, which triggers the split cell beside the moves. The split cell is separate from `.move-cell` and is untouched, so both should coexist.

- [ ] **Step 5.3: Run the full test suite one final time**

Run: `npm test`
Expected: PASS.

Run: `node --check public/js/ui/move-select.js public/js/ui/move-effect-label.js && echo "OK"`
Expected: `OK`.

- [ ] **Step 5.4: Squash-review the commit range**

Run: `git log --oneline master..HEAD`
Expected: three or four small commits, one per task.

---

## Done criteria

- [ ] Unit tests for `effectLabel` pass (11 cases).
- [ ] Existing `npm test` suite passes (no regressions).
- [ ] Move-select screen in combat renders the new element-tinted cards with badge, 3-row text, pill, and top-right help button.
- [ ] PvE, PvP, and befriend move-select paths all show the same redesigned cards.
- [ ] `.move-items-cell`, `.move-split-cell`, `.move-befriend-half`, and `.move-help-popup` behavior unchanged.
- [ ] No new dependencies; no callsite changes outside `move-select.js`.
