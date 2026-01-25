# Lookup Mode - Bug Report & Implementation Status

## Critical Unresolved Bug

### Issue: Clicks still dismiss narration when lookup mode is active

**Expected behavior:** When lookup mode is active, clicking anywhere should NOT dismiss narration or trigger game actions. User should only be able to:
- Click lookup words to see definitions
- Click the lookup button to deactivate
- Click popup close button

**Actual behavior:** Clicking dismisses narration and progresses the game even when lookup mode is active.

### Root Cause (Unresolved)

The narration-box.js click handler runs before the lookup mode can block it. Multiple attempted fixes have failed:

1. **Attempted:** Add capture-phase click blocker with `stopPropagation()` - Failed
2. **Attempted:** Use `stopImmediatePropagation()` - Failed
3. **Attempted:** Import lookup.js in narration-box.js and check `lookup.getActive()` - Failed

The fundamental issue appears to be that the narration click handler is registered and executes before any lookup blocking code can intercept it. The exact reason why the `lookup.getActive()` check in narration-box.js doesn't work has not been determined.

### Files Involved

- `public/js/ui/lookup.js` - Lookup mode state management
- `public/js/ui/narration-box.js` - Narration dismiss handler
- `public/game.js` - Module initialization order

### Suggested Investigation

1. Add console.log debugging to verify:
   - Is `lookup.getActive()` returning true when expected?
   - Is the import of lookup.js in narration-box.js working correctly?
   - What is the actual execution order of click handlers?

2. Check for circular import issues between modules

3. Consider alternative approaches:
   - Global event blocking at a higher level
   - Disable narration click handler entirely when lookup mode activates
   - Use a shared state module that both can import without circular deps

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
   - Added `.lookup-word` - Dotted underline for clickable words
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
   - Added check for `lookup.getActive()` in handleClick (NOT WORKING)

7. **`public/game.js`**
   - Added import of lookup module
   - Added import of parseJpdbText, lookupJpdbWord from api.js
   - Added lookup.init() call in initGame()

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
5. Words get dotted underlines
6. Clicking words shows popup with definition
7. Popup displays: word, reading, part of speech, meanings, card state
8. Popup positioning (above/below word, viewport-aware)
9. Popup close button works
10. Clicking outside popup closes it
11. Deactivation restores original text
12. Quiz answers excluded from parsing (anti-cheat)
13. Flashcards excluded from parsing (anti-cheat)
14. Toolbar visible above takeover modals

## Features NOT Working

1. **Click blocking** - Clicks still progress game when lookup mode is active
2. **Limited text parsing** - Only parses `#narration-text` and `#enemy-name`. Does NOT parse:
   - Chip modal options
   - Chip skill descriptions
   - Ward descriptions
   - Shop item descriptions
   - Any other UI text outside the hardcoded selectors

   See `TEXT_SELECTORS` in `lookup.js` line 22-27 - needs expansion to cover more UI elements.

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
