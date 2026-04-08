# Dialogue Token B2 Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ugly token rendering in NPC dialogue with the approved B2 design — romaji above, Japanese text, English meaning below for unknown words, all on one baseline.

**Architecture:** New `renderJpSentenceDialogue()` function in `bootstrap-client.js` outputs a 3-row flex-column structure per word (`jp-dlg-*` classes). CSS scoped to `.narration-text` provides the B2 styling. Existing `renderJpSentence` is untouched — speech bubbles, combat barks, room transitions keep their current look.

**Tech Stack:** Vanilla JS (ES6 modules), CSS, node:test for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-08-dialogue-token-b2-design.md`
**Mockup:** `~/.gstack/projects/mrohrssen-Koto2/designs/npc-dialogue-tokens-20260408/variant-B2.html`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/js/ui/bootstrap-client.js` | Modify (add function after line 141) | New `renderJpSentenceDialogue()` export |
| `public/game.css` | Modify (add block after line 5697) | B2 `.narration-text .jp-dlg-*` styles |
| `public/js/ui/exploration.js` | Modify (lines 41, 1209, 1228, 1241, 1246) | Switch to `renderJpSentenceDialogue` for NPC dialogue |
| `public/js/ui/dialogue-display.js` | Modify (lines 5, 32) | Switch to `renderJpSentenceDialogue` |
| `tests/unit/sentence-renderer.test.js` | Modify (add new describe block) | Tests for `renderJpSentenceDialogue` |

---

## Chunk 1: Core Function + Tests

### Task 1: Write failing tests for renderJpSentenceDialogue

**Files:**
- Modify: `tests/unit/sentence-renderer.test.js` (add after line 114)

- [ ] **Step 1: Add test import**

At line 3 of `tests/unit/sentence-renderer.test.js`, change:
```js
import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';
```
to:
```js
import { renderJpSentence, renderJpSentenceDialogue } from '../../public/js/ui/bootstrap-client.js';
```

- [ ] **Step 2: Write tests for the new function**

Add this describe block at the end of the file (after line 114):

```js
describe('renderJpSentenceDialogue', () => {
  it('renders known word with jp-dlg-known class and 3 spans', () => {
    const tokens = [
      { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' },
    ];
    const html = renderJpSentenceDialogue(tokens, new Set(['こんにちは']), new Map());
    assert.ok(html.includes('jp-dlg jp-dlg-known'), 'should have jp-dlg-known class');
    assert.ok(html.includes('jp-dlg-romaji'), 'should have romaji span');
    assert.ok(html.includes('jp-dlg-text'), 'should have text span');
    assert.ok(html.includes('jp-dlg-en'), 'should have english slot span');
    assert.ok(html.includes('konnichiha'), 'should include romaji text');
    assert.ok(!html.includes('<ruby>'), 'should NOT use ruby tags');
  });

  it('renders unknown word with jp-dlg-unknown class and English below', () => {
    const tokens = [
      { surface: 'ゆっくり', base: 'ゆっくり', reading: 'ゆっくり', meaning: 'slowly' },
    ];
    const html = renderJpSentenceDialogue(tokens, new Set(), new Map());
    assert.ok(html.includes('jp-dlg jp-dlg-unknown'), 'should have jp-dlg-unknown class');
    assert.ok(html.includes('jp-dlg-en'), 'should have english slot');
    assert.ok(html.includes('slowly'), 'should show English meaning');
    assert.ok(html.includes('yukkuri'), 'should include romaji');
  });

  it('renders entity token with jp-dlg-entity class', () => {
    const tokens = [
      { surface: '薬草', base: '薬草', reading: 'やくそう', meaning: 'Medicinal Herb', entity: true },
    ];
    const html = renderJpSentenceDialogue(tokens, new Set(), new Map());
    assert.ok(html.includes('jp-dlg-entity'), 'should have jp-dlg-entity class');
    assert.ok(html.includes('Medicinal Herb'), 'should show entity English name');
    assert.ok(html.includes('yakusou'), 'should include romaji');
  });

  it('renders punctuation/particles with jp-dlg-punct class and spacers', () => {
    const tokens = [{ surface: '、' }];
    const html = renderJpSentenceDialogue(tokens, new Set(), new Map());
    assert.ok(html.includes('jp-dlg-punct'), 'should have punct class');
    assert.ok(html.includes('jp-dlg-romaji'), 'should have romaji spacer');
    assert.ok(html.includes('jp-dlg-en'), 'should have english spacer');
    assert.ok(html.includes('、'), 'should contain the punctuation');
  });

  it('renders full greeting sentence with correct word counts', () => {
    const tokens = [
      { surface: 'いらっしゃいませ', base: 'いらっしゃいませ', reading: 'いらっしゃいませ', meaning: 'welcome' },
      { surface: '、' },
      { surface: 'ゆっくり', base: 'ゆっくり', reading: 'ゆっくり', meaning: 'slowly' },
      { surface: '見', base: '見る', reading: 'み', meaning: 'to see' },
      { surface: 'て' },
      { surface: 'ください', base: 'くださる', reading: 'ください', meaning: 'to give / please' },
      { surface: '！' },
    ];
    const known = new Set(['いらっしゃいませ', '見る', 'くださる']);
    const html = renderJpSentenceDialogue(tokens, known, new Map());
    assert.equal((html.match(/jp-dlg-known/g) || []).length, 3, '3 known words');
    assert.equal((html.match(/jp-dlg-unknown/g) || []).length, 1, '1 unknown word');
    assert.equal((html.match(/jp-dlg-punct/g) || []).length, 3, '3 punct/particles');
    assert.ok(!html.includes('<ruby>'), 'no ruby tags anywhere');
  });

  it('uses kanji surface when useKanji=true for known words', () => {
    const tokens = [
      { surface: '見', base: '見る', reading: 'み', meaning: 'to see' },
    ];
    const html = renderJpSentenceDialogue(tokens, new Set(['見る']), new Map(), {}, true);
    // jp-dlg-text should contain the kanji surface, not the reading
    assert.ok(html.includes('>見<'), 'should show kanji surface');
  });

  it('falls back to wordDict for English definition (legacy tokens)', () => {
    const tokens = [
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
    ];
    const html = renderJpSentenceDialogue(tokens, new Set(), wordDict);
    assert.ok(html.includes('together'), 'should get English from wordDict');
  });

  it('returns empty string for empty/null tokens', () => {
    assert.equal(renderJpSentenceDialogue([], new Set(), new Map()), '');
    assert.equal(renderJpSentenceDialogue(null, new Set(), new Map()), '');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: All new `renderJpSentenceDialogue` tests FAIL (function not exported yet). All existing `renderJpSentence` tests still PASS.

- [ ] **Step 4: Commit failing tests**

```bash
git add tests/unit/sentence-renderer.test.js
git commit -m "test: add failing tests for renderJpSentenceDialogue (B2)"
```

---

### Task 2: Implement renderJpSentenceDialogue

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` (add after line 141, before `addKnownWord`)

- [ ] **Step 1: Add the function**

Insert after line 141 (closing `}` of `renderJpSentence`) in `bootstrap-client.js`:

```js
/**
 * Render a tokenized Japanese sentence for dialogue display (B2 style).
 *
 * 3-row flex columns per word: romaji / JP text / English below.
 * Uses jp-dlg-* classes (not jp-word) to avoid style collision.
 * Entity tokens (token.entity === true) get jp-dlg-entity class.
 *
 * Same signature as renderJpSentence for easy caller migration.
 */
export function renderJpSentenceDialogue(tokens, knownWords, wordDict, overrides = {}, useKanji = false) {
  if (!tokens || tokens.length === 0) return '';

  return tokens.map(token => {
    const { surface } = token;
    const baseForm = token.base || token.baseForm;
    const reading = token.reading;

    const isNonContent = !baseForm
      || (token.pos && (PUNCT_POS.has(token.pos) || /^[\p{P}\p{S}\s]+$/u.test(surface)));

    if (isNonContent) {
      return `<span class="jp-dlg jp-dlg-punct">`
        + `<span class="jp-dlg-romaji"></span>`
        + `<span class="jp-dlg-text">${esc(surface)}</span>`
        + `<span class="jp-dlg-en"></span>`
        + `</span>`;
    }

    const isKnown = knownWords.has(baseForm);
    const displayReading = reading || surface;
    const romaji = toRomaji(displayReading);

    if (isKnown) {
      const display = useKanji ? surface : displayReading;
      return `<span class="jp-dlg jp-dlg-known">`
        + `<span class="jp-dlg-romaji">${esc(romaji)}</span>`
        + `<span class="jp-dlg-text">${esc(display)}</span>`
        + `<span class="jp-dlg-en"></span>`
        + `</span>`;
    }

    // Unknown word — English from token.meaning, overrides, or wordDict
    const dictEntry = wordDict.get(baseForm);
    const enDef = token.meaning
      || overrides[baseForm]
      || dictEntry?.definitions?.find(d => d.primary)?.en
      || dictEntry?.definitions?.[0]?.en
      || '';

    const typeClass = token.entity ? 'jp-dlg-entity' : 'jp-dlg-unknown';
    return `<span class="jp-dlg ${typeClass}">`
      + `<span class="jp-dlg-romaji">${esc(romaji)}</span>`
      + `<span class="jp-dlg-text">${esc(displayReading)}</span>`
      + `<span class="jp-dlg-en">${esc(enDef)}</span>`
      + `</span>`;
  }).join('');
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Run all tests**

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: ALL tests pass — both existing `renderJpSentence` tests and new `renderJpSentenceDialogue` tests.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat: add renderJpSentenceDialogue for B2 token display"
```

---

## Chunk 2: CSS + Caller Migration

### Task 3: Add B2 CSS styles

**Files:**
- Modify: `public/game.css` (add after line 5697, the closing `}` of `.jp-punct`)

- [ ] **Step 1: Add the B2 dialogue token styles**

Insert after line 5697 in `game.css`:

```css
/* ── Dialogue token renderer (B2 style) ─────────────────────── */
/* Base: inline-flex columns for 3-row layout (romaji/text/english) */
.jp-dlg {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 0 2px;
}

.jp-dlg-romaji {
  font-size: 8px;
  font-weight: 400;
  color: rgba(47, 58, 69, 0.3);
  letter-spacing: 0.04em;
  font-family: 'Inter', 'Pretendard', var(--font-family);
  height: 12px;
  line-height: 12px;
}

.jp-dlg-text {
  font-size: clamp(15px, 4vw, 17px);
  font-weight: 500;
  color: rgba(47, 58, 69, 0.85);
  line-height: 1.3;
  white-space: nowrap;
}

/* Reserve consistent height even when empty */
.jp-dlg-en {
  height: 16px;
  line-height: 16px;
}

/* Punctuation/particles — dim text, no romaji visible */
.jp-dlg-punct .jp-dlg-text {
  font-size: clamp(14px, 3.5vw, 16px);
  color: rgba(47, 58, 69, 0.35);
}

/* ── Unknown/teaching word — amber accent ── */
.jp-dlg-unknown .jp-dlg-romaji {
  color: rgba(170, 130, 40, 0.5);
}

.jp-dlg-unknown .jp-dlg-text {
  font-weight: 600;
  color: #2f3a45;
  position: relative;
}

.jp-dlg-unknown .jp-dlg-text::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(200, 160, 60, 0.5), transparent);
  border-radius: 1px;
}

.jp-dlg-unknown .jp-dlg-en {
  font-size: 9.5px;
  font-weight: 500;
  color: rgba(170, 130, 40, 0.75);
  font-family: 'Inter', 'Pretendard', var(--font-family);
  letter-spacing: 0.01em;
  margin-top: 1px;
}

/* ── Entity word (item/creature name) — blue accent ── */
.jp-dlg-entity .jp-dlg-romaji {
  color: rgba(74, 130, 200, 0.45);
}

.jp-dlg-entity .jp-dlg-text {
  font-weight: 600;
  color: var(--accent-blue, #4a9eff);
  position: relative;
}

.jp-dlg-entity .jp-dlg-text::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(74, 158, 255, 0.4), transparent);
  border-radius: 1px;
}

.jp-dlg-entity .jp-dlg-en {
  font-size: 9.5px;
  font-weight: 500;
  color: rgba(74, 130, 200, 0.65);
  font-family: 'Inter', 'Pretendard', var(--font-family);
  letter-spacing: 0.01em;
  margin-top: 1px;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "style: add B2 dialogue token CSS (jp-dlg-* classes)"
```

---

### Task 4: Switch dialogue callers to renderJpSentenceDialogue

**Files:**
- Modify: `public/js/ui/exploration.js` (lines 41, 1209, 1228, 1241, 1246)
- Modify: `public/js/ui/dialogue-display.js` (lines 5, 32)

- [ ] **Step 1: Update exploration.js import**

At line 41 of `exploration.js`, change:
```js
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
```
to:
```js
import { renderJpSentence, renderJpSentenceDialogue, getKnownWords } from './bootstrap-client.js';
```

- [ ] **Step 2: Switch NPC greeting rendering (line 1209)**

Change line 1209:
```js
      greetingContent = renderJpSentence(greetingTokens, getKnownWords(), wordDict, {}, false);
```
to:
```js
      greetingContent = renderJpSentenceDialogue(greetingTokens, getKnownWords(), wordDict, {}, false);
```

- [ ] **Step 3: Switch item name token rendering (line 1228)**

Change line 1228:
```js
        ? renderJpSentence([item.nameToken], getKnownWords(), wordDict, {}, false)
```
to:
```js
        ? renderJpSentenceDialogue([item.nameToken], getKnownWords(), wordDict, {}, false)
```

- [ ] **Step 4: Switch item purchase dialogue rendering (line 1241)**

Change line 1241:
```js
        const html = renderJpSentence(item.tokens, getKnownWords(), wordDict, {}, false);
```
to:
```js
        const html = renderJpSentenceDialogue(item.tokens, getKnownWords(), wordDict, {}, false);
```

- [ ] **Step 5: Switch legacy shop dialogue rendering (line 1246)**

Change line 1246:
```js
        const html = renderJpSentence(item.shopTokens, getKnownWords(), wordDict, item.shopOverrides || {}, false);
```
to:
```js
        const html = renderJpSentenceDialogue(item.shopTokens, getKnownWords(), wordDict, item.shopOverrides || {}, false);
```

- [ ] **Step 6: Update dialogue-display.js import**

At line 5 of `dialogue-display.js`, change:
```js
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
```
to:
```js
import { renderJpSentenceDialogue, getKnownWords } from './bootstrap-client.js';
```

- [ ] **Step 7: Switch dialogue-display rendering (line 32)**

Change line 32:
```js
    const html = renderJpSentence(
```
to:
```js
    const html = renderJpSentenceDialogue(
```

- [ ] **Step 8: Syntax check both files**

Run: `node --check public/js/ui/exploration.js && node --check public/js/ui/dialogue-display.js && echo "OK"`
Expected: `OK`

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: All tests pass. The existing `renderJpSentence` tests still pass (function untouched). The new `renderJpSentenceDialogue` tests pass.

- [ ] **Step 10: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/dialogue-display.js
git commit -m "feat: switch NPC dialogue + DM display to B2 token rendering"
```

---

## Chunk 3: Visual Verification

### Task 5: Verify with Playwright

**Before starting:** Ask the user if they want you to open Playwright for visual verification.

- [ ] **Step 1: Start dev server if not running**

Run: `npm run dev &`
Wait 3 seconds, then verify:
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 2: Navigate to NPC shop and trigger greeting**

Open `http://localhost:3000` in Playwright. Log in and navigate to the friendly NPC shop screen. The NPC greeting dialogue should appear with the B2-styled tokens.

- [ ] **Step 3: Screenshot the greeting dialogue**

Take a screenshot showing the NPC greeting with tokenized words. Verify:
- Romaji appears in small text above each word
- Unknown/teaching word has amber underline and gold English below
- All Japanese text sits on the same baseline
- Punctuation/particles are dim with no romaji

- [ ] **Step 4: Screenshot item purchase dialogue**

Click an item to trigger the purchase dialogue. Take screenshot. Verify:
- Entity word (item name) has blue accent
- Known words are clean with dim romaji
- English appears below unknown and entity words

- [ ] **Step 5: Verify speech bubbles unchanged**

Navigate to combat or a room with creature speech bubbles. Verify they still use the old rendering (ruby tags, blue boxes for unknowns).

- [ ] **Step 6: Delete screenshots**

```bash
rm -f /tmp/screenshot-*.png
```
