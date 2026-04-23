# Dictionary Popup Headword Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dictionary popup's `"hiraganaromaji hiragana"` headword so it renders pronunciation-above-headword per Koto's JP typography rule, driven by a shared helper that respects the player's `useKanji` mode.

**Architecture:** Add `buildHeadwordRuby(base, reading, useKanji)` to `public/js/ui/romaji.js`. Emit `data-kanji-mode="1"` on `.jp-word` spans in `renderJpSentence` so the popup's dialogue path can read the current mode statelessly from the clicked span. Update both popup entry points (`dialogue-word-lookup.js` and `lookup.js`) to call the helper instead of flattening `span.textContent`. Remove the now-orphaned `.lookup-popup-reading` span, CSS rule, and DOM getter.

**Tech Stack:** Vanilla ES modules, `node:test` unit runner, Playwright MCP for manual visual verification.

**Spec:** [`docs/superpowers/specs/2026-04-23-dictionary-popup-layout-design.md`](../specs/2026-04-23-dictionary-popup-layout-design.md)

---

## File Structure

- **Create:** `tests/unit/build-headword-ruby.test.js` — unit tests for the new helper.
- **Modify:** `public/js/ui/romaji.js` — add `buildHeadwordRuby` helper.
- **Modify:** `public/js/ui/bootstrap-client.js` — emit `data-kanji-mode="1"` on `.jp-word` spans when `useKanji === true`.
- **Modify:** `public/js/ui/dialogue-word-lookup.js` — replace textContent writes with helper; drop `dom.reading`.
- **Modify:** `public/js/ui/lookup.js` — replace textContent writes with helper in loading flash + `populatePopup`.
- **Modify:** `public/index.html` — remove `<span class="lookup-popup-reading">`.
- **Modify:** `public/js/dom.js` — remove `lookupPopupReading` getter.
- **Modify:** `public/game.css` — delete `.lookup-popup-reading` rule; restyle `.lookup-popup-word` for ruby.

Every file has exactly one responsibility in this change. The helper is the only new symbol.

---

## Task 1: Add `buildHeadwordRuby` helper + unit tests

**Files:**
- Create: `tests/unit/build-headword-ruby.test.js`
- Modify: `public/js/ui/romaji.js`

Rules (first match wins):

1. `reading` is empty → bare `{base}`.
2. `useKanji === false` (beginner) → `<ruby>{reading}<rt>{toRomaji(reading)}</rt></ruby>`.
3. `base === reading` (kana-only in kanji mode) → bare `{reading}`.
4. Otherwise (kanji mode, kanji word) → `<ruby>{base}<rt>{reading}</rt></ruby>`.

All interpolated values must be HTML-escaped to prevent injection from dictionary data.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/build-headword-ruby.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeadwordRuby } from '../../public/js/ui/romaji.js';

describe('buildHeadwordRuby', () => {
  it('beginner mode, pure hiragana word: ruby with romaji on top', () => {
    const html = buildHeadwordRuby('たべる', 'たべる', false);
    assert.equal(html, '<ruby>たべる<rt>taberu</rt></ruby>');
  });

  it('beginner mode, kanji base with hiragana reading: still shows reading + romaji (kanji ignored in beginner mode)', () => {
    const html = buildHeadwordRuby('食べる', 'たべる', false);
    assert.equal(html, '<ruby>たべる<rt>taberu</rt></ruby>');
  });

  it('kanji mode, kanji base differs from reading: ruby with hiragana on top, kanji below', () => {
    const html = buildHeadwordRuby('食べる', 'たべる', true);
    assert.equal(html, '<ruby>食べる<rt>たべる</rt></ruby>');
  });

  it('kanji mode, kana-only word (base === reading): bare reading, no ruby', () => {
    const html = buildHeadwordRuby('かわいい', 'かわいい', true);
    assert.equal(html, 'かわいい');
  });

  it('empty reading: bare base, no ruby (both modes)', () => {
    assert.equal(buildHeadwordRuby('dog', '', false), 'dog');
    assert.equal(buildHeadwordRuby('dog', '', true), 'dog');
  });

  it('escapes HTML in base and reading to prevent injection', () => {
    const html = buildHeadwordRuby('<script>x</script>', 'reading', true);
    assert.equal(html, '<ruby>&lt;script&gt;x&lt;/script&gt;<rt>reading</rt></ruby>');
  });

  it('escapes ampersands and quotes', () => {
    const html = buildHeadwordRuby('a&b"c', 'a&b"c', true);
    // base === reading triggers bare output; still escaped
    assert.equal(html, 'a&amp;b&quot;c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="buildHeadwordRuby"`

Expected: FAIL with `SyntaxError` or `buildHeadwordRuby is not a function` (the export does not exist yet).

- [ ] **Step 3: Implement the helper in `public/js/ui/romaji.js`**

Append to the end of `public/js/ui/romaji.js`:

```js
/**
 * Escape HTML-special characters for safe insertion into innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the popup headword HTML.
 *
 * Pronunciation-above-headword rule:
 *   - Beginner mode: <ruby>hiragana<rt>romaji</rt></ruby>
 *   - Kanji mode (kanji word): <ruby>kanji<rt>hiragana</rt></ruby>
 *   - Kanji mode (kana-only word): bare hiragana (kanji-mode players have graduated past romaji)
 *   - Empty reading: bare base (fallback)
 *
 * Inputs are HTML-escaped to prevent injection from dictionary data.
 *
 * @param {string} base - dictionary headword (kanji form where available)
 * @param {string} reading - hiragana reading
 * @param {boolean} useKanji - true for Area 4+, false for Areas 1-3
 * @returns {string} HTML string
 */
export function buildHeadwordRuby(base, reading, useKanji) {
  const b = base || '';
  const r = reading || '';

  if (!r) return escapeHtml(b);
  if (!useKanji) return `<ruby>${escapeHtml(r)}<rt>${escapeHtml(toRomaji(r))}</rt></ruby>`;
  if (b === r) return escapeHtml(r);
  return `<ruby>${escapeHtml(b)}<rt>${escapeHtml(r)}</rt></ruby>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern="buildHeadwordRuby"`

Expected: PASS, all 7 assertions green.

- [ ] **Step 5: Syntax-check the modified file**

Run: `node --check public/js/ui/romaji.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/romaji.js tests/unit/build-headword-ruby.test.js
git commit -m "feat(ui): add buildHeadwordRuby helper for dictionary popup"
```

---

## Task 2: Emit `data-kanji-mode` on `.jp-word` spans

**Goal:** Let the popup read the current mode statelessly from the clicked span — no new module-level flags.

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` (around line 106 and line 123)

- [ ] **Step 1: Read current `renderJpSentence` implementation**

Open `public/js/ui/bootstrap-client.js` and locate the two `<span class="jp-word ...">` emissions inside `renderJpSentence`. Both build `dataAttrs` from the same template at line 106:

```js
const dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"${isFromOverride ? ' data-override="1"' : ''}`;
```

- [ ] **Step 2: Add `data-kanji-mode="1"` to dataAttrs when useKanji is true**

Replace the `dataAttrs` assignment in `public/js/ui/bootstrap-client.js` with:

```js
const dataAttrs = ` data-base="${esc(baseForm)}" data-reading="${esc(displayReading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"${isFromOverride ? ' data-override="1"' : ''}${useKanji ? ' data-kanji-mode="1"' : ''}`;
```

That single line is the only change in this task — both known and unknown `.jp-word` spans use this shared `dataAttrs` variable, so both inherit the new attribute.

- [ ] **Step 3: Syntax-check the modified file**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`

Expected: PASS. No tests currently assert on `data-kanji-mode`, so this change is purely additive and must not break anything.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat(ui): emit data-kanji-mode on .jp-word spans"
```

---

## Task 3: Rewrite dialogue-word-lookup.js popup headword

**Files:**
- Modify: `public/js/ui/dialogue-word-lookup.js` (dom cache around line 67–68, `handleWordClick` around line 147–148)

- [ ] **Step 1: Add the `buildHeadwordRuby` import**

At the top of `public/js/ui/dialogue-word-lookup.js`, find the existing imports and add the helper. The file already imports from sibling modules — add:

```js
import { buildHeadwordRuby } from './romaji.js';
```

If an import from `./romaji.js` already exists, extend the destructure instead of adding a new line.

- [ ] **Step 2: Remove the `dom.reading` cache entry**

In the dom-init block (around lines 66–76), the module caches DOM references. Current block:

```js
dom.popup = document.getElementById('lookup-popup');
dom.word = document.getElementById('lookup-popup-word');
dom.reading = document.getElementById('lookup-popup-reading');
dom.pos = document.getElementById('lookup-popup-pos');
dom.meanings = document.getElementById('lookup-popup-meanings');
```

Delete the `dom.reading = ...` line so the module no longer references the now-deleted element:

```js
dom.popup = document.getElementById('lookup-popup');
dom.word = document.getElementById('lookup-popup-word');
dom.pos = document.getElementById('lookup-popup-pos');
dom.meanings = document.getElementById('lookup-popup-meanings');
```

- [ ] **Step 3: Replace the headword write in `handleWordClick`**

At lines 147–148, current code is:

```js
dom.word.textContent = span.textContent;
dom.reading.textContent = reading !== span.textContent ? reading : '';
```

Replace with a single innerHTML write driven by the helper. The `data-kanji-mode` attribute (set by Task 2) drives the mode; the existing `reading` local (line 143) already holds `span.dataset.reading || ''`:

```js
const useKanji = span.dataset.kanjiMode === '1';
dom.word.innerHTML = buildHeadwordRuby(base, reading, useKanji);
```

Place this replacement where the old two lines lived. The `base` local is already declared above at line 129 (`const base = span.dataset.base;`), so no new variable needed.

- [ ] **Step 4: Syntax-check the modified file**

Run: `node --check public/js/ui/dialogue-word-lookup.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 5: Run the unit tests**

Run: `npm run test:unit`

Expected: PASS, including the existing `dialogue-word-lookup.test.js`. The `buildPopupMeanings` export is untouched; this task only modifies `handleWordClick`'s innards.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/dialogue-word-lookup.js
git commit -m "fix(ui): render dialogue popup headword via buildHeadwordRuby"
```

---

## Task 4: Rewrite lookup.js popup headword

**Rationale:** `lookup.js` renders its own `.lookup-word` spans with plain text (no ruby, no reading data). Its popup shows results from an API call. The loading flash has no reading yet, so it falls back to bare text. The final populate call has `result.spelling` + `result.reading` from the API and uses the helper. `useKanji` is hardcoded to `false` here because `lookup.js`'s rendered spans carry no mode info and the server currently always returns `useKanji: false`. When kanji-mode graduation is wired up server-side in a later plan, the follow-up will thread the mode through `lookup.init(callbacks)` — out of scope here.

**Files:**
- Modify: `public/js/ui/lookup.js` (loading flash around line 357–358, `populatePopup` around line 378–380)

- [ ] **Step 1: Add the `buildHeadwordRuby` import**

At the top of `public/js/ui/lookup.js`, after the existing imports, add:

```js
import { buildHeadwordRuby } from './romaji.js';
```

- [ ] **Step 2: Fix the loading flash (drop the reading write)**

At lines 357–358, current code is:

```js
dom.lookupPopupWord.textContent = span.textContent;
dom.lookupPopupReading.textContent = '';
```

Delete line 358 entirely (the element is being removed in Task 5). Line 357 stays — `.lookup-word` spans contain plain text, so `span.textContent` is safe during the pre-API loading flicker:

```js
dom.lookupPopupWord.textContent = span.textContent;
```

- [ ] **Step 3: Fix `populatePopup` to use the helper**

At lines 378–380, current code is:

```js
function populatePopup(result, fallbackText) {
  dom.lookupPopupWord.textContent = result.spelling || fallbackText;
  dom.lookupPopupReading.textContent = result.reading || '';
```

Replace the two assignments (lines 379–380) with a single helper call:

```js
function populatePopup(result, fallbackText) {
  dom.lookupPopupWord.innerHTML = buildHeadwordRuby(
    result.spelling || fallbackText,
    result.reading || '',
    false
  );
```

Everything below (`dom.lookupPopupPos.textContent = ...` onward) is unchanged.

- [ ] **Step 4: Syntax-check the modified file**

Run: `node --check public/js/ui/lookup.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 5: Run the unit tests**

Run: `npm run test:unit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/lookup.js
git commit -m "fix(ui): render manual-lookup popup headword via buildHeadwordRuby"
```

---

## Task 5: Remove `.lookup-popup-reading` span, getter, and CSS; restyle ruby

**Files:**
- Modify: `public/index.html` (around line 123–130)
- Modify: `public/js/dom.js` (around line 64)
- Modify: `public/game.css` (around line 1607–1617)

- [ ] **Step 1: Remove the reading span from HTML**

In `public/index.html`, lines 123–130 currently read:

```html
<div class="lookup-popup" id="lookup-popup">
  <div class="lookup-popup-header">
    <div>
      <span class="lookup-popup-word" id="lookup-popup-word"></span>
      <span class="lookup-popup-reading" id="lookup-popup-reading"></span>
    </div>
    <button class="lookup-popup-close" id="lookup-popup-close">&times;</button>
  </div>
```

Delete the `.lookup-popup-reading` span line so the block becomes:

```html
<div class="lookup-popup" id="lookup-popup">
  <div class="lookup-popup-header">
    <div>
      <span class="lookup-popup-word" id="lookup-popup-word"></span>
    </div>
    <button class="lookup-popup-close" id="lookup-popup-close">&times;</button>
  </div>
```

- [ ] **Step 2: Remove the `lookupPopupReading` DOM getter**

In `public/js/dom.js`, locate line 64:

```js
get lookupPopupReading() { return el('lookup-popup-reading'); },
```

Delete that entire line.

- [ ] **Step 3: Restyle `.lookup-popup-word` for ruby; remove `.lookup-popup-reading` CSS**

In `public/game.css`, lines 1607–1617 currently read:

```css
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
```

Replace that entire block with:

```css
.lookup-popup-word {
  display: inline-block;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.lookup-popup-word ruby rt {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}
```

`display: inline-block` + `line-height: 1.2` give the ruby's `<rt>` room to render above the base without clipping. The `.lookup-popup-reading` rule is gone — no replacement needed, there is no such element anymore.

- [ ] **Step 4: Syntax-check JS (dom.js only — HTML and CSS have no dedicated check)**

Run: `node --check public/js/dom.js && echo "OK"`

Expected: `OK`.

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:unit`

Expected: PASS. No test should reference the removed element (`dialogue-word-lookup.test.js` only exercises `buildPopupMeanings`, not DOM).

- [ ] **Step 6: Grep for stragglers**

Run: `grep -rn "lookup-popup-reading\|lookupPopupReading" public/ src/ tests/ 2>/dev/null`

Expected: **no output**. If any references remain, delete them before continuing.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/js/dom.js public/game.css
git commit -m "refactor(ui): remove .lookup-popup-reading element after ruby migration"
```

---

## Task 6: Playwright visual verification

**Files:** none modified. This task produces evidence that the fix actually renders correctly in the browser, per the repo's Visual Verification Rule.

**Prerequisites:** Ask the user before launching Playwright (per CLAUDE.md). Use `npm run dev` (Vite + Express), NOT `npm start`. Navigate to `http://localhost:5173`.

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev`

Wait 5 seconds, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`

Expected: `200`.

- [ ] **Step 2: Ask user for permission to launch Playwright**

Send a message: "Ready to verify the popup fix in Playwright — OK to launch the browser?" Wait for user confirmation before continuing.

- [ ] **Step 3: Navigate to a dialogue screen and click a Japanese word**

Use Playwright MCP:
1. `browser_navigate` to `http://localhost:5173`.
2. Log in / progress to a screen with dialogue narration (see `docs/playtest-guide.md`).
3. `browser_snapshot` to find a `.jp-word` in the narration.
4. `browser_click` on a known hiragana word (e.g. a pure-kana word from Area 1).
5. `browser_take_screenshot` of the popup.

Expected visual: the headword area shows `taberu` (small, secondary color) on top and `たべる` (large, bold) below. No duplicate text, no `"hiraganaromaji"` artifact.

- [ ] **Step 4: Click a word where `data-base` contains kanji**

Find a `.jp-word` whose `data-base` contains kanji but which is being displayed as hiragana (beginner mode). Click it. Screenshot.

Expected: same `romaji / hiragana` layout — kanji from `data-base` is ignored because `data-kanji-mode` is absent (beginner mode). No kanji visible in the popup.

- [ ] **Step 5: Simulate kanji mode manually**

In the DevTools console via `browser_evaluate`:

```js
// Force data-kanji-mode on all jp-word spans in the current narration
document.querySelectorAll('.jp-word').forEach(s => s.dataset.kanjiMode = '1');
```

Then click a `.jp-word` whose `data-base` contains kanji. Screenshot.

Expected: headword shows `たべる` (small, secondary) on top and `食べる` (large, bold) below — the kanji headword with hiragana furigana above.

- [ ] **Step 6: Click a kana-only word in simulated kanji mode**

With `data-kanji-mode="1"` still forced, click a `.jp-word` where `data-base === data-reading` (pure hiragana). Screenshot.

Expected: bare hiragana (e.g. `かわいい`) — no ruby, no romaji. Player has graduated past romaji.

- [ ] **Step 7: Delete all screenshots from the repo**

Per CLAUDE.md session-cleanup rule — screenshots must be removed after being shown. Run:

```bash
rm *.png 2>/dev/null; ls *.png 2>/dev/null && echo "FAILED: pngs remain" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 8: Stop the dev server**

Kill the background `npm run dev` process. No commit for this task — verification only.

---

## Self-Review (done inline during plan writing)

**Spec coverage:**

- Beginner mode rule → Task 1 test case + Task 3 wiring ✓
- Kanji mode, kanji word → Task 1 test case + Task 2 data attr + Task 3 read ✓
- Kanji mode, kana-only word → Task 1 test case ✓
- Empty reading fallback → Task 1 test case ✓
- `lookup.js` path uses helper → Task 4 ✓
- HTML element removal → Task 5 ✓
- DOM getter cleanup → Task 5 ✓
- CSS cleanup + restyle → Task 5 ✓
- `useKanji` sourced from span dataset (dialogue) / hardcoded false (manual lookup) → Task 2 + 3 + 4 ✓
- Visual verification all four cases → Task 6 ✓

**Placeholder scan:** No TBDs, no "implement error handling," every step has exact code or commands. The `useKanji: false` in Task 4 is not a placeholder — it's the current runtime value per `src/routes/game/run.js:147` and `src/routes/game/combat.js:91`, and the task's rationale block documents why.

**Type consistency:** `buildHeadwordRuby(base, reading, useKanji)` signature is used identically in Tasks 1, 3, 4. `data-kanji-mode` attribute is emitted in Task 2 and read in Task 3.
