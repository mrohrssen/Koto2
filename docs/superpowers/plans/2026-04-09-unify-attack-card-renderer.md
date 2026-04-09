# Unify Attack Card Renderer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `vocabStackHtml()` from combat-loop.js and route attack cards through `renderJpSentence` + `entityToToken`, fixing the broken known-word detection that hides English glosses for unknown words.

**Architecture:** Replace 4 `vocabStackHtml()` call sites in two functions (`buildSplitAttackCard`, `insertNpcAttackCard`) with `renderJpSentence([entityToToken(...)], getKnownWords(), new Map())`. Delete the dead function, its helper `primaryMeaning`, and all dead CSS. Add scoped CSS for `jp-word` inside `.sac-row` to maintain attack card visual weight.

**Tech Stack:** Client-side ES6 modules, CSS

---

## File Map

- **Modify:** `public/js/ui/combat-loop.js` — delete `vocabStackHtml`, `primaryMeaning`, replace 4 call sites
- **Modify:** `public/game.css` — delete `.sac-vocab-stack`/`.sac-romaji`/`.sac-kana`/`.sac-english` rules, delete `.sac-vocab` legacy rules + suppression hacks, add `.sac-row .jp-word` sizing
- **Test:** `tests/unit/sentence-renderer.test.js` — existing tests cover `renderJpSentence` + `entityToToken` already; add one test proving entity tokens from attack-card-shaped data render correctly

---

## Task 1: Add test for attack-card-shaped entityToToken rendering

This proves that the code path we're about to use (entityToToken with baseWord/baseReading/baseMeaning fields → renderJpSentence) produces correct known/unknown output.

**Files:**
- Modify: `tests/unit/sentence-renderer.test.js`

- [ ] **Step 1: Write two failing tests**

Add to the end of `tests/unit/sentence-renderer.test.js`, inside a new describe block:

```js
describe('renderJpSentence — attack card entity tokens via entityToToken', () => {
  // Import entityToToken alongside renderJpSentence at top of file
  // (see step 3 for import change)

  it('renders unknown attack base word with English gloss', () => {
    const { entityToToken } = await import('../../public/js/ui/bootstrap-client.js');
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(), new Map());
    assert.ok(html.includes('jp-entity'), 'unknown entity should have jp-entity class');
    assert.ok(html.includes('get lost / hesitate'), 'unknown entity should show English gloss');
    assert.ok(html.includes('まよう'), 'should show reading');
  });

  it('renders known attack base word WITHOUT English gloss', () => {
    const { entityToToken } = await import('../../public/js/ui/bootstrap-client.js');
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(['迷う']), new Map());
    assert.ok(html.includes('jp-known'), 'known entity should have jp-known class');
    assert.ok(!html.includes('get lost / hesitate'), 'known entity should NOT show English gloss');
  });
});
```

Note: `entityToToken` is already exported from bootstrap-client.js. We need to add it to the import at line 3 of the test file.

- [ ] **Step 2: Update import at top of test file**

Change line 3 of `tests/unit/sentence-renderer.test.js` from:
```js
import { renderJpSentence } from '../../public/js/ui/bootstrap-client.js';
```
to:
```js
import { renderJpSentence, entityToToken } from '../../public/js/ui/bootstrap-client.js';
```

Then simplify the test to use the top-level import (no dynamic import needed):

```js
describe('renderJpSentence — attack card entity tokens via entityToToken', () => {
  it('renders unknown attack base word with English gloss', () => {
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(), new Map());
    assert.ok(html.includes('jp-entity'), 'unknown entity should have jp-entity class');
    assert.ok(html.includes('get lost / hesitate'), 'unknown entity should show English gloss');
    assert.ok(html.includes('まよう'), 'should show reading');
  });

  it('renders known attack base word WITHOUT English gloss', () => {
    const token = entityToToken({ baseWord: '迷う', baseReading: 'まよう', baseMeaning: 'get lost / hesitate' });
    const html = renderJpSentence([token], new Set(['迷う']), new Map());
    assert.ok(html.includes('jp-known'), 'known entity should have jp-known class');
    assert.ok(!html.includes('get lost / hesitate'), 'known entity should NOT show English gloss');
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

These should pass immediately because `entityToToken` + `renderJpSentence` already work. This is a characterization test, not TDD — we're locking in expected behavior before changing call sites.

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: All tests PASS (including the two new ones)

- [ ] **Step 4: Commit**

```bash
git add tests/unit/sentence-renderer.test.js
git commit -m "test: add attack card entityToToken rendering tests"
```

---

## Task 2: Replace vocabStackHtml calls with renderJpSentence + entityToToken

**Files:**
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Replace the 2 calls in `buildSplitAttackCard` (~lines 262, 267)**

Replace line 262:
```js
        ${vocabStackHtml(atk.attackerBaseReading, atk.attackerBaseMeaning, atk.attackerBaseWord)}
```
with:
```js
        ${renderJpSentence([entityToToken({ baseWord: atk.attackerBaseWord, baseReading: atk.attackerBaseReading, baseMeaning: atk.attackerBaseMeaning })], getKnownWords(), new Map())}
```

Replace line 267:
```js
        ${vocabStackHtml(atk.attackerSkillReading, atk.attackerSkillEn, atk.attackerSkillName || atk.moveName)}
```
with:
```js
        ${renderJpSentence([entityToToken({ name: atk.attackerSkillName || atk.moveName, reading: atk.attackerSkillReading, nameEn: atk.attackerSkillEn })], getKnownWords(), new Map())}
```

- [ ] **Step 2: Replace the 2 calls in `insertNpcAttackCard` (~lines 357, 362)**

Replace line 357:
```js
        ${vocabStackHtml(atk.attackerBaseReading, atk.attackerBaseMeaning, atk.attackerBaseWord)}
```
with:
```js
        ${renderJpSentence([entityToToken({ baseWord: atk.attackerBaseWord, baseReading: atk.attackerBaseReading, baseMeaning: atk.attackerBaseMeaning })], getKnownWords(), new Map())}
```

Replace line 362:
```js
        ${vocabStackHtml(atk.attackerSkillReading, atk.attackerSkillEn, atk.attackerSkillName || atk.moveName)}
```
with:
```js
        ${renderJpSentence([entityToToken({ name: atk.attackerSkillName || atk.moveName, reading: atk.attackerSkillReading, nameEn: atk.attackerSkillEn })], getKnownWords(), new Map())}
```

- [ ] **Step 3: Delete `vocabStackHtml` function (~lines 192-206)**

Delete the entire function.

- [ ] **Step 4: Delete `primaryMeaning` function (~lines 178-182)**

Only caller was `vocabStackHtml`. Delete it.

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run existing tests**

Run: `node --test tests/unit/sentence-renderer.test.js`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "fix: replace vocabStackHtml with renderJpSentence + entityToToken

Fixes bug where unknown words hid English glosses in attack cards.
vocabStackHtml had a reading-based fallback in its known-word check
that could falsely mark words as known."
```

---

## Task 3: Delete dead CSS

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Delete `.sac-vocab-stack`, `.sac-romaji`, `.sac-kana`, `.sac-english` rules**

These are at ~lines 1302-1330. Delete from the `/* Vocab vertical stack */` comment through `.sac-english { ... }`.

- [ ] **Step 2: Delete `.sac-vocab` legacy rules**

At ~lines 1332-1345. The comment says "Legacy inline vocab (kept for non-attack-card uses)" — but grep confirms `.sac-vocab` is not referenced in any JS file. Delete `.sac-vocab { ... }` and `.sac-vocab rt { ... }`.

- [ ] **Step 3: Delete `.sac-vocab`/`.move-name-jp` suppression hacks entirely**

At ~lines 4764-4773. Delete the entire block:
```css
/* ── Suppress mini-card inside attack cards and move buttons ── */
.sac-vocab .bs-word:has(.bs-word-en),
.move-name-jp .bs-word:has(.bs-word-en) { ... }
.sac-vocab .bs-word-en,
.move-name-jp .bs-word-en { display: none; }
```

These are hacks that hide English output from `renderEnFirst` via CSS instead of letting the renderer handle it. Everything should go through standard `renderJpSentence` with `jp-*` classes — no suppression needed.

- [ ] **Step 4: Commit**

```bash
git add public/game.css
git commit -m "chore: delete dead sac-vocab CSS and suppression hacks"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Syntax check combat-loop.js one more time**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Grep to confirm no remaining references to deleted code**

Run these greps — all should return no matches:
- `vocabStackHtml` in `public/`
- `primaryMeaning` in `public/js/ui/combat-loop.js`
- `sac-vocab-stack` in `public/`
- `sac-romaji` in `public/` (except if referenced in other non-game CSS)
- `sac-kana` in `public/`
- `sac-english` in `public/`
