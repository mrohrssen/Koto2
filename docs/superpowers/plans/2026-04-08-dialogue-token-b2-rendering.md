# Dialogue Token B2 Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ugly token rendering with the approved B2 design — romaji above, Japanese text, English meaning below for unknown words, all on one baseline. Applies everywhere `renderJpSentence` is used.

**Architecture:** Modify `renderJpSentence` in-place to output a 3-row flex-column structure per word. Reuse existing class names (`jp-word`, `jp-known`, `jp-unknown`, `jp-punct`) and add `jp-entity` (new). Child spans use `jp-romaji`, `jp-text`, `jp-en` (replacing `<ruby>` and `jp-stack-en`). Rewrite the existing CSS block. No new functions, no caller changes, no scoping.

**Tech Stack:** Vanilla JS (ES6 modules), CSS, node:test for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-08-dialogue-token-b2-design.md`
**Mockup:** `~/.gstack/projects/mrohrssen-Koto2/designs/npc-dialogue-tokens-20260408/variant-B2.html`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/js/ui/bootstrap-client.js` | Modify (rewrite `renderJpSentence` at lines 97-141) | New HTML output structure |
| `public/game.css` | Modify (replace block at lines 5682-5697) | B2 styles for existing + new classes |
| `tests/unit/sentence-renderer.test.js` | Modify (update assertions for new HTML structure) | Updated tests |

No caller changes needed. `exploration.js`, `dialogue-display.js`, `speech-bubble.js`, `room-transition.js`, `game.js` all call `renderJpSentence` and get the new output automatically.

---

## Chunk 1: Tests + Function

### Task 1: Update tests for new HTML structure

**Files:**
- Modify: `tests/unit/sentence-renderer.test.js`

The existing tests assert on `<ruby>`, `<rt>`, and `jp-stack-en` — those are gone. Update assertions for the new 3-span structure (`jp-romaji`, `jp-text`, `jp-en`). Parent classes (`jp-known`, `jp-unknown`, `jp-punct`) stay the same; add `jp-entity`.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `tests/unit/sentence-renderer.test.js` with:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';

const wordDict = new Map([
  ['こんにちは', { reading: 'こんにちは', definitions: [{ en: 'hello', primary: true }] }],
  ['一緒', { reading: 'いっしょ', definitions: [{ en: 'together', primary: true }] }],
  ['遊ぶ', { reading: 'あそぶ', definitions: [{ en: 'to play', primary: true }] }],
  ['に', { reading: 'に', definitions: [{ en: 'to/at', primary: true }] }],
]);

describe('renderJpSentence — B2 output structure', () => {
  it('renders known word with jp-known and 3 child spans', () => {
    const tokens = [{ surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' }];
    const knownWords = new Set(['こんにちは']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.ok(html.includes('jp-word jp-known'), 'should have jp-known class');
    assert.ok(html.includes('jp-romaji'), 'should have romaji span');
    assert.ok(html.includes('jp-text'), 'should have text span');
    assert.ok(html.includes('jp-en'), 'should have english slot span');
    assert.ok(html.includes('konnichiha'), 'should include romaji text');
    assert.ok(!html.includes('<ruby>'), 'should NOT use ruby tags');
  });

  it('renders unknown word with jp-unknown and English below', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('jp-word jp-unknown'), 'should have jp-unknown class');
    assert.ok(html.includes('jp-en'), 'should have english slot');
    assert.ok(html.includes('together'), 'should show English meaning');
    assert.ok(html.includes('issho'), 'should include romaji');
  });

  it('renders punctuation with jp-punct and spacer spans', () => {
    const tokens = [{ surface: '！', baseForm: '！', pos: '記号', reading: '' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, {}, false);
    assert.ok(html.includes('jp-punct'), 'should have punct class');
    assert.ok(html.includes('jp-romaji'), 'should have romaji spacer');
    assert.ok(html.includes('jp-en'), 'should have english spacer');
    assert.ok(html.includes('！'));
  });

  it('uses kanji surface form when useKanji=true', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(['一緒']), wordDict, {}, true);
    assert.ok(html.includes('>一緒<'), 'should show kanji in jp-text');
    assert.ok(html.includes('jp-known'));
  });

  it('applies definition overrides', () => {
    const tokens = [{ surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' }];
    const html = renderJpSentence(tokens, new Set(), wordDict, { '一緒': 'at the same time' }, false);
    assert.ok(html.includes('at the same time'));
    assert.ok(!html.includes('together'));
  });

  it('renders a mixed sentence with correct class counts', () => {
    const tokens = [
      { surface: 'こんにちは', baseForm: 'こんにちは', pos: '感動詞', reading: 'こんにちは' },
      { surface: '！', baseForm: '！', pos: '記号', reading: '' },
      { surface: '一緒', baseForm: '一緒', pos: '名詞', reading: 'いっしょ' },
      { surface: 'に', baseForm: 'に', pos: '助詞', reading: 'に' },
      { surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞', reading: 'あそぶ' },
    ];
    const knownWords = new Set(['こんにちは', 'に']);
    const html = renderJpSentence(tokens, knownWords, wordDict, {}, false);
    assert.equal((html.match(/jp-known/g) || []).length, 2, '2 known words');
    assert.equal((html.match(/jp-unknown/g) || []).length, 2, '2 unknown words');
    assert.equal((html.match(/jp-punct/g) || []).length, 1, '1 punctuation');
    assert.ok(!html.includes('<ruby>'), 'no ruby tags');
  });

  it('returns empty string for empty tokens', () => {
    assert.equal(renderJpSentence([], new Set(), wordDict), '');
    assert.equal(renderJpSentence(null, new Set(), wordDict), '');
  });
});

describe('renderJpSentence — universal token format', () => {
  it('renders known content word (new format)', () => {
    const tokens = [
      { surface: 'お茶', base: 'お茶', reading: 'おちゃ', meaning: 'Tea' },
    ];
    const html = renderJpSentence(tokens, new Set(['お茶']), new Map(), {}, false);
    assert.ok(html.includes('jp-known'));
    assert.ok(html.includes('おちゃ'));
  });

  it('renders unknown content word with meaning from token (new format)', () => {
    const tokens = [
      { surface: 'お茶', base: 'お茶', reading: 'おちゃ', meaning: 'Tea' },
    ];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-unknown'));
    assert.ok(html.includes('Tea'));
  });

  it('renders surface-only token as punctuation (new format)', () => {
    const tokens = [{ surface: 'を' }];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-punct'));
    assert.ok(html.includes('を'));
  });

  it('renders entity tokens with jp-entity class', () => {
    const tokens = [
      { surface: '火竜', base: '火竜', reading: 'かりゅう', meaning: 'Fire Dragon', entity: true },
    ];
    const html = renderJpSentence(tokens, new Set(), new Map(), {}, false);
    assert.ok(html.includes('jp-entity'), 'should have entity class');
    assert.ok(html.includes('Fire Dragon'));
  });

  it('renders full greeting with correct word counts', () => {
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
    const html = renderJpSentence(tokens, known, new Map());
    assert.equal((html.match(/jp-known/g) || []).length, 3, '3 known words');
    assert.equal((html.match(/jp-unknown/g) || []).length, 1, '1 unknown word');
    assert.equal((html.match(/jp-punct/g) || []).length, 3, '3 punct/particles');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: All tests FAIL (function still outputs old `<ruby>` structure).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/sentence-renderer.test.js
git commit -m "test: update sentence-renderer tests for B2 html structure"
```

---

### Task 2: Rewrite renderJpSentence output

**Files:**
- Modify: `public/js/ui/bootstrap-client.js` (rewrite lines 97-141)

- [ ] **Step 1: Replace renderJpSentence function body**

Replace the `renderJpSentence` function (lines 97-141) with:

```js
export function renderJpSentence(tokens, knownWords, wordDict, overrides = {}, useKanji = false) {
  if (!tokens || tokens.length === 0) return '';

  return tokens.map(token => {
    const { surface } = token;

    // Detect format: universal uses `base`, legacy uses `baseForm`
    const baseForm = token.base || token.baseForm;
    const reading = token.reading;

    // Non-content token: no base field → render as punctuation
    // (universal format) OR legacy POS-based detection
    const isNonContent = !baseForm
      || (token.pos && (PUNCT_POS.has(token.pos) || /^[\p{P}\p{S}\s]+$/u.test(surface)));

    if (isNonContent) {
      return `<span class="jp-word jp-punct">`
        + `<span class="jp-romaji"></span>`
        + `<span class="jp-text">${esc(surface)}</span>`
        + `<span class="jp-en"></span>`
        + `</span>`;
    }

    const isKnown = knownWords.has(baseForm);
    const displayReading = reading || surface;
    const romaji = toRomaji(displayReading);

    if (isKnown) {
      const display = useKanji ? surface : displayReading;
      return `<span class="jp-word jp-known">`
        + `<span class="jp-romaji">${esc(romaji)}</span>`
        + `<span class="jp-text">${esc(display)}</span>`
        + `<span class="jp-en"></span>`
        + `</span>`;
    }

    // Unknown word: get English definition
    const dictEntry = wordDict.get(baseForm);
    const enDef = token.meaning
      || overrides[baseForm]
      || dictEntry?.definitions?.find(d => d.primary)?.en
      || dictEntry?.definitions?.[0]?.en
      || '';

    const typeClass = token.entity ? 'jp-entity' : 'jp-unknown';
    return `<span class="jp-word ${typeClass}">`
      + `<span class="jp-romaji">${esc(romaji)}</span>`
      + `<span class="jp-text">${esc(displayReading)}</span>`
      + `<span class="jp-en">${esc(enDef)}</span>`
      + `</span>`;
  }).join('');
}
```

Keep the JSDoc comment above the function (lines 83-96) unchanged.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Run tests**

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat: rewrite renderJpSentence for B2 token display"
```

---

## Chunk 2: CSS

### Task 3: Replace token CSS with B2 styles

**Files:**
- Modify: `public/game.css` (replace lines 5682-5697)

- [ ] **Step 1: Replace the old sentence renderer CSS block**

Replace the block at lines 5682-5697 (from `/* ── Sentence renderer */` through `.jp-punct { display: inline; }`):

```css
/* ── Sentence renderer (B2 token display) ──────────────────── */
.jp-word {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 0 2px;
}

/* Row 1: romaji — uniform size/weight, only color varies */
.jp-romaji {
  font-size: 8px;
  font-weight: 400;
  color: rgba(47, 58, 69, 0.3);
  letter-spacing: 0.04em;
  font-family: 'Inter', 'Pretendard', var(--font-family);
  height: 12px;
  line-height: 12px;
}

/* Row 2: JP text — uniform size/weight, only color varies */
.jp-text {
  font-size: clamp(15px, 4vw, 17px);
  font-weight: 500;
  color: rgba(47, 58, 69, 0.85);
  line-height: 1.3;
  white-space: nowrap;
}

/* Row 3: English below — uniform size/weight, height reserved when empty */
.jp-en {
  font-size: 9.5px;
  font-weight: 500;
  font-family: 'Inter', 'Pretendard', var(--font-family);
  letter-spacing: 0.01em;
  color: transparent;
  height: 16px;
  line-height: 16px;
  margin-top: 1px;
}

/* Punctuation/particles — color only */
.jp-punct .jp-text {
  color: rgba(47, 58, 69, 0.35);
}

/* Unknown/teaching word — amber accent */
.jp-unknown .jp-romaji {
  color: rgba(170, 130, 40, 0.5);
}

.jp-unknown .jp-text {
  color: #2f3a45;
  position: relative;
}

.jp-unknown .jp-text::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(200, 160, 60, 0.5), transparent);
  border-radius: 1px;
}

.jp-unknown .jp-en {
  color: rgba(170, 130, 40, 0.75);
}

/* Entity word (item/creature name) — blue accent */
.jp-entity .jp-romaji {
  color: rgba(74, 130, 200, 0.45);
}

.jp-entity .jp-text {
  color: var(--accent-blue, #4a9eff);
  position: relative;
}

.jp-entity .jp-text::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(74, 158, 255, 0.4), transparent);
  border-radius: 1px;
}

.jp-entity .jp-en {
  color: rgba(74, 130, 200, 0.65);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "style: rewrite token CSS for B2 display"
```

---

## Chunk 3: Visual Verification

### Task 4: Verify with Playwright

**Before starting:** Ask the user if they want you to open Playwright for visual verification.

- [ ] **Step 1: Start dev server if not running**

Run: `npm run dev &`
Wait 3 seconds, then verify:
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 2: Navigate to NPC shop and trigger greeting**

Open `http://localhost:3000` in Playwright. Log in and navigate to the friendly NPC shop screen. The NPC greeting dialogue should appear with B2-styled tokens.

- [ ] **Step 3: Screenshot the greeting dialogue**

Take a screenshot showing the NPC greeting with tokenized words. Verify:
- Romaji appears in small text above each word
- Unknown/teaching word has amber underline and gold English below
- All Japanese text sits on the same baseline
- Punctuation/particles are dim with no romaji
- Font size/weight is uniform per row (no size changes by word type)

- [ ] **Step 4: Screenshot item purchase dialogue**

Click an item to trigger the purchase dialogue. Take screenshot. Verify:
- Entity word (item name) has blue accent colors
- Known words are clean with dim romaji
- English appears below unknown and entity words

- [ ] **Step 5: Verify speech bubbles also use new style**

Navigate to combat or a room with creature speech bubbles. Verify they render with the same B2 structure (same base styles).

- [ ] **Step 6: Delete screenshots**

```bash
rm -f /tmp/screenshot-*.png
```
