# Lookup Mode - Bug Report & Implementation Status

## Bugs Fixed (2026-01-25)

### Bug #1: Clicks dismissed narration when lookup mode was active

**Problem:** When lookup mode was active, clicking anywhere dismissed narration and progressed the game.

**Root cause:** Event capture phase order. The document-level click handler for blocking game clicks ran before the lookup button click handler, so `isActive` was still `false` when the user clicked to activate lookup mode. The narration dismiss handler fired before lookup mode became active.

**Solution:** Handle lookup button activation directly in the document-level `blockGameClicks` capture handler. This ensures we:
1. Intercept the click before narration dismiss fires
2. Call `stopImmediatePropagation()` to block all other handlers
3. Then trigger `toggle()` to activate lookup mode

Key code in `lookup.js`:
```javascript
function blockGameClicks(e) {
  // Handle activation in document capture phase
  if (!isActive && !isLoading && dom.lookupBtn?.contains(e.target)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    toggle();
    return;
  }
  // ... rest of blocking logic
}
```

### Bug #2: Text not fully parsing (only first few words got underlines)

**Problem:** Japanese text was only partially parsed - only the first few characters would get underlines.

**Root cause:** JPDB returns token positions in **bytes**, not characters. Japanese characters are 3 bytes each in UTF-8. JavaScript's `String.slice()` uses character positions, causing complete misalignment:
- Position 0, length 6 → JPDB means bytes 0-6 (2 Japanese chars)
- JavaScript's `slice(0, 6)` gives characters 0-6 (6 Japanese chars)

**Solution:** Build a byte-to-character index map in `parseText()` (server-side `src/jpdb.js`):
```javascript
const textBytes = Buffer.from(text, 'utf-8');
const byteToChar = [];
let charIndex = 0;
for (let byteIndex = 0; byteIndex < textBytes.length; charIndex++) {
  const char = text[charIndex];
  const charBytes = Buffer.byteLength(char, 'utf-8');
  for (let i = 0; i < charBytes; i++) {
    byteToChar[byteIndex + i] = charIndex;
  }
  byteIndex += charBytes;
}
```

This fix also ensures conjugated forms (e.g., "答えれば") appear correctly instead of dictionary forms ("答える").

---

## Implementation Completed

### Files Created

1. **`public/js/ui/lookup.js`** - Main lookup mode module
   - `init(callbacks)` - Initialize with API callbacks
   - `toggle()` - Toggle lookup mode on/off
   - `getActive()` - Check if lookup mode is active
   - `refresh()` - Re-parse text after content changes
   - Handles text parsing, word click events, popup positioning

### Files Modified

1. **`public/game.html`**
   - Added lookup button to utility row (magnifying glass icon)
   - Added lookup popup container markup

2. **`public/game.css`**
   - Added `.util-btn.lookup-active` - Green active state
   - Added `.util-btn.lookup-loading` - Pulse animation
   - Added `.lookup-word` - Solid underline for clickable words
   - Added `.lookup-popup` and children - Popup styling
   - Added `.lookup-state-dot` variants - Card state colors
   - Made `.utility-row` position fixed with z-index 150 (above takeovers)
   - Added padding-bottom to `.game-app` and `.takeover` for fixed toolbar

3. **`public/js/dom.js`**
   - Added `lookupBtn` getter
   - Added popup element getters (lookupPopup, lookupPopupWord, etc.)

4. **`public/js/api.js`**
   - Modified `parseJpdbText()` to include jpdbApiKey from localStorage
   - Modified `lookupJpdbWord()` to include jpdbApiKey from localStorage

5. **`public/js/ui/index.js`**
   - Added export for lookup module

6. **`public/js/ui/narration-box.js`**
   - Added import of lookup.js
   - Added check for `lookup.getActive()` in handleClick

7. **`public/game.js`**
   - Added import of lookup module
   - Added import of parseJpdbText, lookupJpdbWord from api.js
   - Added lookup.init() call in initGame()

8. **`src/jpdb.js`**
   - Fixed `parseText()` to convert JPDB byte positions to character positions
   - Now returns actual conjugated forms from text instead of dictionary spellings

### Test Files Created

1. **`tests/e2e/utils/selectors.ts`**
   - Added lookup button and popup selectors

2. **`tests/e2e/specs/lookup-mode.spec.ts`**
   - Basic UI presence tests (button exists, popup close works)

---

## Features Working

1. Lookup button appears in toolbar
2. Button shows loading state while parsing
3. Button turns green when active
4. Text gets parsed via JPDB API
5. Words get solid underlines
6. Clicking words shows popup with definition
7. Popup displays: word, reading, part of speech, meanings, card state
8. Popup positioning (above/below word, viewport-aware)
9. Popup close button works
10. Clicking outside popup closes it
11. Deactivation restores original text
12. Quiz answers excluded from parsing (anti-cheat)
13. Flashcards excluded from parsing (anti-cheat)
14. Toolbar visible above takeover modals
15. **Click blocking works** - Game doesn't progress when lookup mode is active
16. **Full text parsing** - All Japanese text gets parsed correctly

## Known Bugs

1. **Chip modal not detected as visible** - When the starting chip selection modal is open, pressing lookup parses the ward select content behind it instead of the chip descriptions. The chip modal may not have the `.visible` class that `getTextElements()` checks for, or there's a timing/z-index issue.

## Future Enhancements

1. ~~**Expand TEXT_SELECTORS**~~ - Now uses blocklist approach, parses any Japanese text in `.game-app` and visible `.takeover` elements.

---

## Commit History

```
367ca13 fix(lookup): make narration-box check lookup mode before dismissing
aa9cc3a fix(lookup): use stopImmediatePropagation to block narration dismiss
587707f fix(lookup): block all game clicks when lookup mode is active
ffb606a fix(lookup): send JPDB API key with parse and lookup requests
97f4222 fix(lookup): exclude quiz answer options from parsing (no cheating!)
618a4fd fix(lookup): correct JPDB key check, exclude flashcards, prevent narration dismiss
0c97018 fix(lookup): make toolbar always visible above modals for lookup access
7749a87 test(lookup): add E2E tests for lookup mode UI
7533984 test(lookup): add E2E test selectors for lookup mode
1348793 feat(lookup): export lookup module from UI index
81a61c1 feat(lookup): integrate lookup module initialization in game.js
9886784 feat(lookup): create lookup mode UI module
f7d6ef1 feat(lookup): add DOM references for lookup popup elements
3ede063 feat(lookup): add lookup popup container markup
a925b11 feat(lookup): add CSS for lookup mode button states and popup
ef94b74 feat(lookup): add lookupBtn DOM reference
fe4c5dd feat(lookup): add lookup mode toggle button to toolbar
```

---

## Worktree Location

`/Users/michia/Documents/jrpg-wt-lookup`

Branch: `feature/lookup-mode`
