# Bark Bubble Auto-Fit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bark speech bubbles auto-size to visually contain the English definition glosses that currently overflow.

**Architecture:** Extract a pure `calcBubbleOverflow(bubbleRect, glossRects)` function that computes padding adjustments, call it from `showBubble()` after DOM append. Raise the CSS max-width ceiling on `.speech-bubble` so JS can grow it.

**Tech Stack:** Vanilla JS, CSS

---

## Chunk 1: Implementation

### Task 1: Write failing test for `calcBubbleOverflow`

**Files:**
- Modify: `tests/unit/ui/speech-bubble.test.js`

- [ ] **Step 1: Add tests for the pure overflow calculation function**

Add a new `describe` block at the end of the file:

```js
describe('calcBubbleOverflow', async () => {
  let calcBubbleOverflow;
  try {
    const mod = await import('../../../public/js/ui/speech-bubble.js');
    calcBubbleOverflow = mod.calcBubbleOverflow;
  } catch {
    calcBubbleOverflow = null;
  }

  it('returns zero padding when no glosses', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      []
    );
    assert.deepStrictEqual(result, { bottom: 0, left: 0, right: 0 });
  });

  it('returns zero padding when gloss fits inside bubble', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 140, left: 50, right: 230 },
      [{ top: 110, bottom: 135, left: 80, right: 150 }]
    );
    assert.deepStrictEqual(result, { bottom: 0, left: 0, right: 0 });
  });

  it('detects vertical overflow below bubble', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [{ top: 125, bottom: 145, left: 80, right: 150 }]
    );
    assert.strictEqual(result.bottom, 15); // 145 - 130
  });

  it('detects horizontal overflow on both sides', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [{ top: 110, bottom: 125, left: 30, right: 250 }]
    );
    assert.strictEqual(result.left, 20);  // 50 - 30
    assert.strictEqual(result.right, 20); // 250 - 230
  });

  it('takes max overflow across multiple glosses', () => {
    if (!calcBubbleOverflow) return;
    const result = calcBubbleOverflow(
      { top: 100, bottom: 130, left: 50, right: 230 },
      [
        { top: 125, bottom: 140, left: 60, right: 200 },
        { top: 125, bottom: 150, left: 40, right: 260 }
      ]
    );
    assert.strictEqual(result.bottom, 20); // max(10, 20)
    assert.strictEqual(result.left, 10);   // max(0, 10)
    assert.strictEqual(result.right, 30);  // max(0, 30)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "calcBubbleOverflow"`
Expected: Tests skip (calcBubbleOverflow is null) or fail because the export doesn't exist yet.

- [ ] **Step 3: Commit the test**

```bash
git add tests/unit/ui/speech-bubble.test.js
git commit -m "test: add calcBubbleOverflow tests for bark bubble auto-fit"
```

### Task 2: Implement `calcBubbleOverflow` and wire into `showBubble`

**Files:**
- Modify: `public/js/ui/speech-bubble.js:41-67`

- [ ] **Step 4: Add the pure `calcBubbleOverflow` function**

Add this exported function before `showBubble` (after the constants, around line 23):

```js
/**
 * Compute how far gloss elements overflow a bubble's bounding rect.
 * Returns { bottom, left, right } — extra pixels needed in each direction.
 * Pure function: takes DOMRect-like objects, no DOM access.
 */
export function calcBubbleOverflow(bubbleRect, glossRects) {
  let bottom = 0, left = 0, right = 0;
  for (const g of glossRects) {
    bottom = Math.max(bottom, g.bottom - bubbleRect.bottom);
    left = Math.max(left, bubbleRect.left - g.left);
    right = Math.max(right, g.right - bubbleRect.right);
  }
  return { bottom: Math.max(0, bottom), left: Math.max(0, left), right: Math.max(0, right) };
}
```

- [ ] **Step 5: Wire `calcBubbleOverflow` into `showBubble`**

In `showBubble()`, after `document.body.appendChild(bubble);` (line 66) and before setting `_activeBubble = bubble;` (line 67), add:

```js
  // Auto-fit: grow bubble to contain absolute-positioned glosses
  const glossEls = bubble.querySelectorAll('.jp-stack-en');
  if (glossEls.length > 0) {
    const bRect = bubble.getBoundingClientRect();
    const glossRects = [...glossEls].map(g => g.getBoundingClientRect());
    const overflow = calcBubbleOverflow(bRect, glossRects);
    if (overflow.bottom > 0) {
      bubble.style.paddingBottom = (6 + overflow.bottom) + 'px';
    }
    if (overflow.left > 0 || overflow.right > 0) {
      bubble.style.paddingLeft = (10 + overflow.left) + 'px';
      bubble.style.paddingRight = (10 + overflow.right) + 'px';
      bubble.style.maxWidth = 'none';
    }
  }
```

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/ui/speech-bubble.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern "calcBubbleOverflow"`
Expected: All 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/speech-bubble.js
git commit -m "feat: auto-fit bark bubbles around translation glosses"
```

### Task 3: Raise CSS max-width ceiling

**Files:**
- Modify: `public/game.css:5290`

- [ ] **Step 9: Update `.speech-bubble` max-width**

In `public/game.css`, line 5290, change:

```css
max-width: min(180px, 45vw);
```

to:

```css
max-width: min(300px, 75vw);
```

This raises the ceiling so bubbles *can* grow wider when JS overrides padding. Bubbles without glosses still shrink-wrap to their content.

- [ ] **Step 10: Commit**

```bash
git add public/game.css
git commit -m "style: raise speech-bubble max-width ceiling for auto-fit"
```

### Task 4: Full test suite + syntax check

- [ ] **Step 11: Run full unit + integration tests**

Run: `npm test`
Expected: All tests pass, no regressions.

- [ ] **Step 12: Final commit if any fixups needed**

Only if test failures required changes. Otherwise skip.
