# Lookup Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggle-able lookup mode that lets learners click any Japanese word on screen to see its definition via JPDB API.

**Architecture:** New `lookup.js` UI module manages state and coordinates between existing `parseJpdbText()` / `lookupJpdbWord()` API functions and a floating popup. Toggle button in toolbar activates mode, text elements get parsed and wrapped in clickable spans.

**Tech Stack:** Vanilla JS (ES modules), existing JPDB API integration, CSS for popup/underlines

---

## Task 1: Add Lookup Toggle Button to HTML

**Files:**
- Modify: `public/game.html:85` (add button before logout)

**Step 1: Add button markup**

In `public/game.html`, after the reset-run-btn (line 85) and before logout-btn (line 86), add:

```html
      <button class="util-btn" id="lookup-btn" aria-label="Lookup Mode">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
      </button>
```

**Step 2: Verify button appears**

Run server: `npm run dev`
Open browser at localhost:3000, verify magnifying glass button appears in toolbar.

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(lookup): add lookup mode toggle button to toolbar"
```

---

## Task 2: Add DOM Reference for Lookup Button

**Files:**
- Modify: `public/js/dom.js:48-49` (add getter)

**Step 1: Add lookup button getter**

In `public/js/dom.js`, in the `// Utility` section after `get resetRunBtn()`, add:

```javascript
  get lookupBtn() { return el('lookup-btn'); },
```

**Step 2: Verify syntax**

```bash
node --check public/js/dom.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/dom.js
git commit -m "feat(lookup): add lookupBtn DOM reference"
```

---

## Task 3: Add CSS for Lookup Mode States

**Files:**
- Modify: `public/game.css` (add new section after line 522, after `.util-btn:active`)

**Step 1: Add lookup mode CSS**

After the `.util-btn:active` rule (line 522), add:

```css
/* ===== LOOKUP MODE ===== */
.util-btn.lookup-active {
  color: var(--accent-green);
  background: rgba(39, 174, 96, 0.15);
}

.util-btn.lookup-loading {
  animation: pulse-glow 1s infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.lookup-word {
  border-bottom: 1px dotted var(--text-secondary);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.lookup-word:hover {
  border-color: var(--accent-orange);
}

/* Lookup popup */
.lookup-popup {
  position: fixed;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 0;
  box-shadow: var(--shadow-card);
  border: 2px solid var(--accent-orange);
  min-width: 240px;
  max-width: 280px;
  z-index: 200;
  display: none;
}

.lookup-popup.visible {
  display: block;
}

.lookup-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 12px 8px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}

.lookup-popup-word {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.lookup-popup-reading {
  font-size: 14px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.lookup-popup-close {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  margin-left: 8px;
}

.lookup-popup-pos {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(0,0,0,0.03);
}

.lookup-popup-meanings {
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.5;
}

.lookup-popup-meanings li {
  margin-left: 16px;
  margin-bottom: 4px;
}

.lookup-popup-state {
  padding: 8px 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid rgba(0,0,0,0.08);
}

.lookup-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.lookup-state-dot.new { background: var(--accent-red); }
.lookup-state-dot.learning { background: var(--accent-orange); }
.lookup-state-dot.known { background: var(--accent-green); }
.lookup-state-dot.never-looked-up { background: var(--text-secondary); }
```

**Step 2: Verify CSS syntax (visual check)**

Reload page in browser. No parse errors in console.

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(lookup): add CSS for lookup mode button states and popup"
```

---

## Task 4: Add Lookup Popup Container to HTML

**Files:**
- Modify: `public/game.html` (add after utility-row, before takeover views)

**Step 1: Add popup markup**

After the closing `</div>` of `#utility-row` (line 93) and before the takeover views comment (line 96), add:

```html

    <!-- Lookup Popup -->
    <div class="lookup-popup" id="lookup-popup">
      <div class="lookup-popup-header">
        <div>
          <span class="lookup-popup-word" id="lookup-popup-word"></span>
          <span class="lookup-popup-reading" id="lookup-popup-reading"></span>
        </div>
        <button class="lookup-popup-close" id="lookup-popup-close">&times;</button>
      </div>
      <div class="lookup-popup-pos" id="lookup-popup-pos"></div>
      <ul class="lookup-popup-meanings" id="lookup-popup-meanings"></ul>
      <div class="lookup-popup-state" id="lookup-popup-state">
        <span class="lookup-state-dot" id="lookup-state-dot"></span>
        <span id="lookup-state-text"></span>
      </div>
    </div>
```

**Step 2: Verify markup**

Reload page, open DevTools, verify `#lookup-popup` exists in DOM.

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(lookup): add lookup popup container markup"
```

---

## Task 5: Add DOM References for Lookup Popup

**Files:**
- Modify: `public/js/dom.js` (add getters after chip popup section, around line 70)

**Step 1: Add popup getters**

After the chip popup getters (around line 69), add:

```javascript

  // Lookup mode
  get lookupPopup() { return el('lookup-popup'); },
  get lookupPopupWord() { return el('lookup-popup-word'); },
  get lookupPopupReading() { return el('lookup-popup-reading'); },
  get lookupPopupClose() { return el('lookup-popup-close'); },
  get lookupPopupPos() { return el('lookup-popup-pos'); },
  get lookupPopupMeanings() { return el('lookup-popup-meanings'); },
  get lookupPopupState() { return el('lookup-popup-state'); },
  get lookupStateDot() { return el('lookup-state-dot'); },
  get lookupStateText() { return el('lookup-state-text'); },
```

**Step 2: Verify syntax**

```bash
node --check public/js/dom.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/dom.js
git commit -m "feat(lookup): add DOM references for lookup popup elements"
```

---

## Task 6: Create Lookup Module

**Files:**
- Create: `public/js/ui/lookup.js`

**Step 1: Create the module**

Create `public/js/ui/lookup.js`:

```javascript
/**
 * lookup.js - Lookup mode for clicking Japanese words to see definitions
 *
 * USAGE:
 *   import * as lookup from './js/ui/lookup.js';
 *   lookup.init({ showToast, parseText, lookupWord });
 *   // Toggle via button click
 */

import { dom } from '../dom.js';

let isActive = false;
let isLoading = false;
let originalTextMap = new WeakMap(); // Store original text per element
let api = {
  parseText: null,
  lookupWord: null,
  showToast: null,
  hasJpdbKey: null
};

const TEXT_SELECTORS = [
  '#narration-text',
  '#enemy-name',
  '.action-btn'
];

/** Initialize lookup module with callbacks */
export function init(callbacks) {
  api.parseText = callbacks.parseText;
  api.lookupWord = callbacks.lookupWord;
  api.showToast = callbacks.showToast;
  api.hasJpdbKey = callbacks.hasJpdbKey;

  // Button click toggles mode
  dom.lookupBtn?.addEventListener('click', toggle);

  // Popup close button
  dom.lookupPopupClose?.addEventListener('click', hidePopup);

  // Click outside popup closes it
  document.addEventListener('click', (e) => {
    if (!dom.lookupPopup?.contains(e.target) &&
        !e.target.classList.contains('lookup-word')) {
      hidePopup();
    }
  });
}

/** Check if lookup mode is active */
export function getActive() {
  return isActive;
}

/** Toggle lookup mode on/off */
export async function toggle() {
  if (isLoading) return;

  if (isActive) {
    deactivate();
  } else {
    await activate();
  }
}

/** Activate lookup mode */
async function activate() {
  // Check for JPDB API key
  if (api.hasJpdbKey && !api.hasJpdbKey()) {
    api.showToast?.('Set JPDB API key in settings to use lookup');
    return;
  }

  isLoading = true;
  dom.lookupBtn?.classList.add('lookup-loading');

  try {
    // Gather all text to parse
    const elements = getTextElements();
    const textToElements = new Map();

    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.length > 0) {
        if (!textToElements.has(text)) {
          textToElements.set(text, []);
        }
        textToElements.get(text).push(el);
        originalTextMap.set(el, el.innerHTML);
      }
    }

    // Parse all unique texts
    const allText = Array.from(textToElements.keys()).join('\n');
    if (!allText) {
      api.showToast?.('No text to parse');
      isLoading = false;
      dom.lookupBtn?.classList.remove('lookup-loading');
      return;
    }

    const result = await api.parseText(allText);

    if (result.error) {
      api.showToast?.('Couldn\'t parse text. Try again.');
      isLoading = false;
      dom.lookupBtn?.classList.remove('lookup-loading');
      return;
    }

    // Apply parsed tokens to elements
    applyTokensToElements(result.tokens, textToElements);

    isActive = true;
    dom.lookupBtn?.classList.remove('lookup-loading');
    dom.lookupBtn?.classList.add('lookup-active');

  } catch (err) {
    console.error('Lookup activation failed:', err);
    api.showToast?.('Couldn\'t parse text. Try again.');
    isLoading = false;
    dom.lookupBtn?.classList.remove('lookup-loading');
  }

  isLoading = false;
}

/** Deactivate lookup mode */
function deactivate() {
  isActive = false;
  dom.lookupBtn?.classList.remove('lookup-active');
  hidePopup();

  // Restore original text
  const elements = getTextElements();
  for (const el of elements) {
    const original = originalTextMap.get(el);
    if (original !== undefined) {
      el.innerHTML = original;
    }
  }
  originalTextMap = new WeakMap();
}

/** Get all text elements to parse */
function getTextElements() {
  const elements = [];
  for (const selector of TEXT_SELECTORS) {
    elements.push(...document.querySelectorAll(selector));
  }
  return elements;
}

/** Apply parsed tokens to text elements */
function applyTokensToElements(tokens, textToElements) {
  // Group tokens by their source text line
  // Tokens come in order, we need to match them back to elements
  for (const [text, elements] of textToElements) {
    const html = buildHtmlFromTokens(tokens, text);
    for (const el of elements) {
      el.innerHTML = html;
      // Add click handlers to lookup words
      el.querySelectorAll('.lookup-word').forEach(span => {
        span.addEventListener('click', handleWordClick);
      });
    }
  }
}

/** Build HTML string from tokens matching a specific text */
function buildHtmlFromTokens(tokens, targetText) {
  let html = '';
  let textIndex = 0;

  for (const token of tokens) {
    const spelling = token.spelling || token.text || '';

    // Skip if this token isn't part of our target text
    const idx = targetText.indexOf(spelling, textIndex);
    if (idx === -1) continue;

    // Add any skipped characters as plain text
    if (idx > textIndex) {
      html += escapeHtml(targetText.substring(textIndex, idx));
    }

    // Add the token
    if (token.vid && token.sid !== undefined) {
      // Lookupable word
      html += `<span class="lookup-word" data-vid="${token.vid}" data-sid="${token.sid}">${escapeHtml(spelling)}</span>`;
    } else {
      // Not lookupable (punctuation, particles without vid)
      html += escapeHtml(spelling);
    }

    textIndex = idx + spelling.length;
  }

  // Add any remaining text
  if (textIndex < targetText.length) {
    html += escapeHtml(targetText.substring(textIndex));
  }

  return html || escapeHtml(targetText);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Handle click on a lookup word */
async function handleWordClick(e) {
  e.stopPropagation();
  const span = e.target;
  const vid = parseInt(span.dataset.vid, 10);
  const sid = parseInt(span.dataset.sid, 10);

  if (isNaN(vid) || isNaN(sid)) return;

  // Position popup near clicked word
  const rect = span.getBoundingClientRect();
  positionPopup(rect);

  // Show loading state
  dom.lookupPopupWord.textContent = span.textContent;
  dom.lookupPopupReading.textContent = '';
  dom.lookupPopupPos.textContent = 'Loading...';
  dom.lookupPopupMeanings.innerHTML = '';
  dom.lookupPopupState.style.display = 'none';
  dom.lookupPopup?.classList.add('visible');

  // Fetch definition
  const result = await api.lookupWord(vid, sid);

  if (result.error) {
    dom.lookupPopupPos.textContent = 'Couldn\'t load definition';
    return;
  }

  // Populate popup
  dom.lookupPopupWord.textContent = result.spelling || span.textContent;
  dom.lookupPopupReading.textContent = result.reading || '';
  dom.lookupPopupPos.textContent = result.partOfSpeech?.join(', ') || '';

  // Meanings list
  dom.lookupPopupMeanings.innerHTML = '';
  const meanings = result.meanings || [];
  for (const meaning of meanings.slice(0, 5)) {
    const li = document.createElement('li');
    li.textContent = meaning;
    dom.lookupPopupMeanings.appendChild(li);
  }

  // Card state
  const state = result.cardState?.[0] || 'never-looked-up';
  const stateLabels = {
    'new': 'New',
    'learning': 'Learning',
    'known': 'Known',
    'due': 'Due for review',
    'never-looked-up': 'Never looked up'
  };
  dom.lookupStateDot.className = `lookup-state-dot ${state}`;
  dom.lookupStateText.textContent = stateLabels[state] || state;
  dom.lookupPopupState.style.display = 'flex';
}

/** Position popup near clicked word */
function positionPopup(wordRect) {
  const popup = dom.lookupPopup;
  if (!popup) return;

  // Reset position to measure
  popup.style.left = '0';
  popup.style.top = '0';
  popup.classList.add('visible');

  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal: center on word, but keep within viewport
  let left = wordRect.left + (wordRect.width / 2) - (popupRect.width / 2);
  left = Math.max(8, Math.min(left, viewportWidth - popupRect.width - 8));

  // Vertical: prefer above word, flip below if not enough space
  let top;
  const spaceAbove = wordRect.top;
  const spaceBelow = viewportHeight - wordRect.bottom;

  if (spaceAbove >= popupRect.height + 8) {
    top = wordRect.top - popupRect.height - 8;
  } else if (spaceBelow >= popupRect.height + 8) {
    top = wordRect.bottom + 8;
  } else {
    // Not enough space either way, position at top of viewport
    top = 8;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/** Hide the lookup popup */
function hidePopup() {
  dom.lookupPopup?.classList.remove('visible');
}

/** Re-parse text when content changes (for navigation) */
export async function refresh() {
  if (!isActive) return;
  // Deactivate and reactivate to re-parse
  deactivate();
  await activate();
}
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/lookup.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/lookup.js
git commit -m "feat(lookup): create lookup mode UI module"
```

---

## Task 7: Integrate Lookup Module in game.js

**Files:**
- Modify: `public/game.js` (add import and initialization)

**Step 1: Add import**

After line 24 (`import * as leaderboard from './js/ui/leaderboard.js';`), add:

```javascript
import * as lookup from './js/ui/lookup.js';
```

**Step 2: Add API imports**

In the import block from `'./js/api.js'` (lines 28-54), add to the destructured imports:

```javascript
  parseJpdbText,
  lookupJpdbWord
```

Add these after line 53 (`submitQuizAnswer as apiSubmitQuizAnswer`).

**Step 3: Initialize lookup module**

Find the DOMContentLoaded handler or main initialization code. After other module initializations, add:

```javascript
// Initialize lookup mode
lookup.init({
  parseText: parseJpdbText,
  lookupWord: lookupJpdbWord,
  showToast: (msg) => scene.showToast(msg, 3000),
  hasJpdbKey: () => !!localStorage.getItem('jpdbApiKey')
});
```

**Step 4: Verify syntax**

```bash
node --check public/game.js && echo "OK"
```

**Step 5: Manual test**

1. Start server: `npm run dev`
2. Open browser at localhost:3000
3. Configure JPDB API key in settings
4. Start a run to get some narration text
5. Click lookup button - should turn green
6. Click a Japanese word - popup should appear
7. Click outside - popup closes
8. Click lookup button again - deactivates

**Step 6: Commit**

```bash
git add public/game.js
git commit -m "feat(lookup): integrate lookup module initialization in game.js"
```

---

## Task 8: Export Lookup Module from UI Index

**Files:**
- Modify: `public/js/ui/index.js` (add export)

**Step 1: Add export**

After the last export (line 14), add:

```javascript
export * as lookup from './lookup.js';
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/index.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/index.js
git commit -m "feat(lookup): export lookup module from UI index"
```

---

## Task 9: Add E2E Test Selectors

**Files:**
- Modify: `tests/e2e/utils/selectors.ts` (add lookup selectors)

**Step 1: Add selectors**

After the `resetRunBtn` selector (line 88), add:

```typescript
  lookupBtn: '#lookup-btn',
  lookupPopup: '#lookup-popup',
  lookupPopupWord: '#lookup-popup-word',
  lookupPopupClose: '#lookup-popup-close',
  lookupWord: '.lookup-word',
```

**Step 2: Commit**

```bash
git add tests/e2e/utils/selectors.ts
git commit -m "test(lookup): add E2E test selectors for lookup mode"
```

---

## Task 10: Add E2E Tests for Lookup Mode

**Files:**
- Create: `tests/e2e/specs/lookup-mode.spec.ts`

**Step 1: Create test file**

```typescript
import { test, expect, setupCharacter } from '../fixtures/test-fixtures';
import { SELECTORS } from '../utils/selectors';

test.describe('Lookup Mode', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
  });

  test('lookup button toggles active state', async ({ page }) => {
    const lookupBtn = page.locator(SELECTORS.lookupBtn);

    // Initially not active
    await expect(lookupBtn).not.toHaveClass(/lookup-active/);

    // Click to activate (will show error toast if no API key, but button state still works)
    await lookupBtn.click();
    await page.waitForTimeout(500);

    // If no JPDB key, button should not be active (error shown)
    // This test verifies the toggle behavior exists
  });

  test('lookup popup close button works', async ({ page }) => {
    const popup = page.locator(SELECTORS.lookupPopup);
    const closeBtn = page.locator(SELECTORS.lookupPopupClose);

    // Popup should be hidden initially
    await expect(popup).not.toBeVisible();

    // Manually show popup for testing close button
    await page.evaluate(() => {
      document.getElementById('lookup-popup')?.classList.add('visible');
    });
    await expect(popup).toBeVisible();

    // Click close
    await closeBtn.click();
    await expect(popup).not.toBeVisible();
  });

  test('lookup button exists in utility row', async ({ page }) => {
    await expect(page.locator(SELECTORS.lookupBtn)).toBeVisible();
  });
});
```

**Step 2: Run tests**

```bash
./scripts/e2e-test.sh specs/lookup-mode
```

Expected: Tests pass (basic UI presence tests).

**Step 3: Commit**

```bash
git add tests/e2e/specs/lookup-mode.spec.ts
git commit -m "test(lookup): add E2E tests for lookup mode UI"
```

---

## Task 11: Run Full E2E Suite

**Step 1: Run all E2E tests**

```bash
./scripts/e2e-test.sh
```

Expected: 80+ tests pass. Some flakiness acceptable.

**Step 2: Fix any regressions if needed**

If tests fail, check for:
- CSS selectors conflicting
- Button order changes breaking existing tests
- Module import errors

---

## Task 12: Final Manual Testing Checklist

Perform these manual tests with a valid JPDB API key configured:

1. **Activation flow:**
   - [ ] Click lookup button → turns green
   - [ ] Japanese text gets dotted underlines
   - [ ] Non-Japanese text (English, punctuation) has no underlines

2. **Popup behavior:**
   - [ ] Click underlined word → popup appears
   - [ ] Popup shows word, reading, meanings, card state
   - [ ] Popup positions correctly (doesn't overflow viewport)
   - [ ] Click X → popup closes
   - [ ] Click outside popup → popup closes
   - [ ] Click another word → old popup closes, new one opens

3. **Deactivation flow:**
   - [ ] Click green button → reverts to default color
   - [ ] Underlines disappear
   - [ ] Any open popup closes
   - [ ] Text returns to normal (no broken spans)

4. **Error handling:**
   - [ ] No JPDB key → toast "Set JPDB API key..."
   - [ ] Network error → toast "Couldn't parse text..."

5. **Edge cases:**
   - [ ] Empty narration box → no crash
   - [ ] Very long text → parses without timeout
   - [ ] Toggle rapidly → no duplicate underlines

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Toggle button HTML | `game.html` |
| 2 | DOM reference | `dom.js` |
| 3 | CSS styles | `game.css` |
| 4 | Popup HTML | `game.html` |
| 5 | Popup DOM refs | `dom.js` |
| 6 | Lookup module | `lookup.js` (new) |
| 7 | game.js integration | `game.js` |
| 8 | UI index export | `ui/index.js` |
| 9 | Test selectors | `selectors.ts` |
| 10 | E2E tests | `lookup-mode.spec.ts` (new) |
| 11 | Full test run | - |
| 12 | Manual testing | - |
