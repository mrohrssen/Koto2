# Cid Tutorial Click Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent taps that advance visible Cid/tutorial narration from also activating underlying game controls, while preserving explicit persistent dialogue choices.

**Architecture:** Put the behavior in the existing capture-phase click handler in `public/js/ui/narration-box.js`. Non-persistent outside narration clicks already mean "advance this narration"; the implementation will consume those clicks before button/choice handlers can run. Persistent narration remains exempt so prologue choice buttons continue to work while the narration box is visible.

**Tech Stack:** Browser DOM event propagation, ES modules, Node built-in test runner, `mock.module`, existing frontend UI modules.

---

## File Structure

- Create `tests/unit/ui/narration-box.test.js`: focused regression tests for capture-phase click consumption, persistent narration exceptions, and safe-zone lookup behavior.
- Modify `public/js/ui/narration-box.js`: consume outside clicks in `handleClick(e)` after existing safe-zone early returns and before advancing/dismissing narration.
- Inspect only, no expected edits: `public/game.js`, `public/js/ui/exploration.js`, `public/js/ui/befriend.js`, `public/js/ui/fusion-lab.js`, `public/js/ui/room-transition.js`, `public/js/ui/combat-loop.js`, `public/js/ui/move-select.js`.

Do not change tutorial sequencing, tutorial copy, prologue data, move selection locking, or server-side tutorial advancement.

## Task 1: Add Focused Narration-Box Tests

**Files:**
- Create: `tests/unit/ui/narration-box.test.js`

- [ ] **Step 1: Create the test file with module mocks and a minimal DOM shim**

Use this complete file:

```js
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let legacyLookupActive = false;
let dialoguePopupVisible = false;
let documentListeners = new Map();
let elementsById = new Map();
let outsideButtonClickHandler = null;

function createEvent(target) {
  return {
    target,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
  };
}

function createElement(id) {
  const classes = new Set();
  const element = {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    parentElement: null,
    children: [],
    scrollHeight: 0,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : !!force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
      },
    },
    appendChild(child) {
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === '.narration-indicator') return elementsById.get('narration-indicator') || null;
      return null;
    },
    contains(target) {
      if (target === element) return true;
      return element.children.some(child => child.contains?.(target));
    },
  };
  return element;
}

function createClickableElement(id) {
  const element = createElement(id);
  element.click = () => {
    const event = createEvent(element);
    const listeners = documentListeners.get('click') || [];
    for (const listener of listeners) {
      listener(event);
      if (event.immediatePropagationStopped) return event;
    }
    outsideButtonClickHandler?.(event);
    return event;
  };
  return element;
}

function installDom() {
  elementsById = new Map();

  const narrationBox = createElement('narration-box');
  const narrationText = createElement('narration-text');
  const narrationSpeaker = createElement('narration-speaker');
  const narrationIndicator = createElement('narration-indicator');
  const lookupPopup = createElement('lookup-popup');
  const outsideButton = createClickableElement('outside-button');

  narrationBox.appendChild(narrationText);
  narrationBox.appendChild(narrationSpeaker);
  narrationBox.appendChild(narrationIndicator);

  for (const element of [narrationBox, narrationText, narrationSpeaker, narrationIndicator, lookupPopup, outsideButton]) {
    elementsById.set(element.id, element);
  }

  globalThis.document = {
    getElementById: id => elementsById.get(id) || null,
    addEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) || [];
      documentListeners.set(type, listeners.filter(entry => entry !== listener));
    },
  };

  globalThis.window = {
    getComputedStyle: () => ({ lineHeight: '20px', fontSize: '16px' }),
  };

  return { narrationBox, narrationText, lookupPopup, outsideButton };
}

const dom = installDom();

function resetDomState() {
  documentListeners = new Map();
  outsideButtonClickHandler = null;
  legacyLookupActive = false;
  dialoguePopupVisible = false;
  for (const element of elementsById.values()) {
    element.textContent = '';
    element.innerHTML = '';
    element.style = {};
  }
}

function waitForDeferredListener() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

await mock.module('../../../public/js/ui/lookup.js', {
  namedExports: {
    getActive: () => legacyLookupActive,
    refresh: async () => {},
  },
});

await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    getKnownWords: () => new Set(),
    entityToToken: value => value,
  },
});

await mock.module('../../../public/js/ui/dialogue-word-lookup.js', {
  namedExports: {
    hidePopup: () => {
      dialoguePopupVisible = false;
    },
    isPopupVisible: () => dialoguePopupVisible,
    attachWordClickHandlers: () => {},
  },
});

const narrationBox = await import('../../../public/js/ui/narration-box.js');

describe('narration box click gating', () => {
  beforeEach(() => {
    narrationBox.forceHide();
    resetDomState();
  });

  it('uses an outside click to dismiss narration without activating the underlying button', async () => {
    let buttonClicks = 0;
    outsideButtonClickHandler = () => {
      buttonClicks += 1;
    };

    const dismissed = narrationBox.show('Cid line', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = dom.outsideButton.click();
    await dismissed;

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(buttonClicks, 0);
  });

  it('allows persistent narration choice buttons to remain clickable', async () => {
    let buttonClicks = 0;
    outsideButtonClickHandler = () => {
      buttonClicks += 1;
    };

    await narrationBox.show('Do you understand me NOW?', {
      speaker: 'Cid',
      persistent: true,
    });

    const event = dom.outsideButton.click();

    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);
    assert.equal(buttonClicks, 1);
  });

  it('does not consume clicks inside the narration box safe zone', async () => {
    let documentSawClick = false;
    const dismissed = narrationBox.show('Tap a word', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = createEvent(dom.narrationText);
    for (const listener of documentListeners.get('click') || []) {
      listener(event);
      documentSawClick = true;
    }

    assert.equal(documentSawClick, true);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);

    narrationBox.forceHide();
    await dismissed;
  });

  it('does not consume clicks inside the dictionary popup safe zone', async () => {
    dialoguePopupVisible = true;
    const dismissed = narrationBox.show('Dictionary open', { speaker: 'Cid' });
    await waitForDeferredListener();

    const event = createEvent(dom.lookupPopup);
    for (const listener of documentListeners.get('click') || []) {
      listener(event);
    }

    assert.equal(event.defaultPrevented, false);
    assert.equal(event.immediatePropagationStopped, false);

    narrationBox.forceHide();
    await dismissed;
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails before implementation**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/narration-box.test.js
```

Expected: the first test fails because `buttonClicks` is `1`, or because `defaultPrevented` / `immediatePropagationStopped` is `false`. The persistent-choice and safe-zone tests pass.

## Task 2: Consume Outside Narration Clicks

**Files:**
- Modify: `public/js/ui/narration-box.js`

- [ ] **Step 1: Patch `handleClick(e)` to consume outside clicks**

Replace the outside-click block in `handleClick(e)` with this:

```js
  // Click is outside narration box — advance dialogue and consume this click so
  // it cannot activate the game control underneath the narration.
  e.preventDefault();
  e.stopImmediatePropagation();

  if (pagedText.length > 0 && currentPage < pagedText.length - 1) {
    currentPage += 1;
    if (textEl) {
      textEl.textContent = pagedText[currentPage];
    }
    return;
  }

  document.removeEventListener('click', handleClick, true);
  hide();
```

Keep the existing early returns above this block unchanged:

```js
  if (lookup.getActive()) return;

  if (box && box.contains(e.target)) {
    return;
  }

  if (dialogueLookup.isPopupVisible() && document.getElementById('lookup-popup')?.contains(e.target)) {
    return;
  }
```

Do not add a new global listener in `public/game.js`. The existing narration listener is already capture-phase and has the correct scope.

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check public/js/ui/narration-box.js
```

Expected: exits with code `0`.

- [ ] **Step 3: Re-run the focused narration-box test**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/narration-box.test.js
```

Expected: all tests pass.

## Task 3: Confirm Tutorial Call Sites Need No Local Disable

**Files:**
- Inspect: `public/game.js`
- Inspect: `public/js/ui/exploration.js`
- Inspect: `public/js/ui/befriend.js`
- Inspect: `public/js/ui/fusion-lab.js`
- Inspect: `public/js/ui/room-transition.js`
- Inspect: `public/js/ui/combat-loop.js`
- Inspect: `public/js/ui/move-select.js`

- [ ] **Step 1: Confirm prologue persistent choice remains the only active below-dialogue exception**

Check `public/game.js` and confirm `prologueScene.choices?.length > 0` still uses:

```js
await narrationBox.show(html, { ...showOpts, persistent: true });
const choiceIdx = await renderButtonsAsync(
  prologueScene.choices.map(c => ({
    label: renderEnFirst(typeof c === 'string' ? c : c.text),
  }))
);
```

Expected: no edit needed. Persistent narration does not register `handleClick`, so the response button remains clickable.

- [ ] **Step 2: Confirm Skill Master step 0 remains intentionally concurrent**

Check `public/js/ui/exploration.js` and confirm tutorial step 0 still starts narration without awaiting:

```js
if (tutorialStep === 0 && !skillMasterState.tutorialNarrationStarted) {
  skillMasterState.tutorialNarrationStarted = true;
  showTutorialNarration(getTutorialNarration(0), { showSprite: true });
}
```

Expected: no edit needed. The click gate now prevents the highlighted skill from selecting while narration is visible, then allows it after narration is dismissed.

- [ ] **Step 3: Confirm befriend step 1 remains concurrent**

Check `public/js/ui/befriend.js` and confirm Fight/Talk choices still render before Cid narration:

```js
const choicePromise = renderChoicesAsync({
  heading: 'Choose an action',
  cards: simpleChoiceCards(['たたかう (Fight)', 'はなす (Talk)']),
});
```

Expected: no edit needed. The click gate now prevents Talk from firing until Cid's narration has been dismissed.

- [ ] **Step 4: Confirm first combat move hint is not gated by Cid narration**

Check `public/js/ui/combat-loop.js` and `public/js/ui/move-select.js` and confirm no changes were made to:

```js
return {
  tutorialMoveId: 'honoo',
  tutorialHintText: 'Tap here!',
  lockToTutorialMove: true
};
```

Expected: no edit needed. The move hint appears after Cid has stopped speaking and should remain clickable.

## Task 4: Run Verification

**Files:**
- Verify: `public/js/ui/narration-box.js`
- Verify: `tests/unit/ui/narration-box.test.js`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node --check public/js/ui/narration-box.js
node --experimental-test-module-mocks --test tests/unit/ui/narration-box.test.js
```

Expected: both commands exit with code `0`.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: exits with code `0`.

- [ ] **Step 3: Check lints for edited files**

Use the Cursor lints tool on:

```text
public/js/ui/narration-box.js
tests/unit/ui/narration-box.test.js
```

Expected: no new diagnostics caused by this change.

## Task 5: Manual UI Verification

**Files:**
- Exercise app behavior through the browser; no file edits expected.

The project rule requires visual/browser verification for UI behavior changes. Ask before opening Playwright if the user has not already approved it for this session.

- [ ] **Step 1: Start or reuse the dev server**

Before starting a new server, check existing terminals for a running `npm run dev`. If none is running, run:

```bash
npm run dev
```

Then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 2: Verify prologue behavior**

Use a fresh or reset tutorial account. During normal Cid prologue lines, click on the action area while narration is visible.

Expected:
- The narration advances or dismisses.
- No unrelated game action fires from the same click.
- At `prologue-03-understand`, the "Yes, I understand!" button is clickable while the narration box is still visible.

- [ ] **Step 3: Verify tutorial Skill Master step 0**

Reach the first Skill Master tutorial. While Cid's step 0 narration is visible, click the highlighted first skill once.

Expected:
- The click advances/dismisses Cid narration.
- The skill is not selected by that same click.
- Clicking the highlighted skill again after the narration is gone selects it normally.

- [ ] **Step 4: Verify one hub tutorial moment**

Reach any of tutorial steps 3, 4, or 5. While Cid narration is visible over hub buttons, click the highlighted or primary hub action.

Expected:
- The click advances/dismisses Cid narration.
- The hub action does not fire from that same click.
- Clicking after narration is gone performs the hub action normally.

- [ ] **Step 5: Verify Fusion Lab tutorial if reachable**

Reach the Fusion Lab tutorial. While Cid's fusion guidance is visible, click the recipe tile or Start Fusion.

Expected:
- The click advances/dismisses Cid narration.
- Fusion does not start from that same click.
- Clicking after narration is gone works normally.

## Task 6: Final Review

**Files:**
- Review: `public/js/ui/narration-box.js`
- Review: `tests/unit/ui/narration-box.test.js`
- Review: `docs/superpowers/specs/2026-05-17-cid-tutorial-click-gate-design.md`

- [ ] **Step 1: Review diff for scope**

Run:

```bash
git diff -- public/js/ui/narration-box.js tests/unit/ui/narration-box.test.js docs/superpowers/specs/2026-05-17-cid-tutorial-click-gate-design.md docs/superpowers/plans/2026-05-17-cid-tutorial-click-gate.md
```

Expected:
- Only `narration-box.js`, the new focused test, and documentation files are changed for this feature.
- No tutorial copy, prologue JSON, combat move logic, or backend files are changed.

- [ ] **Step 2: Report verification results**

In the final implementation report, include:

```text
Implemented shared narration click gate in public/js/ui/narration-box.js.
Added focused regression coverage in tests/unit/ui/narration-box.test.js.
Verified:
- node --check public/js/ui/narration-box.js
- node --experimental-test-module-mocks --test tests/unit/ui/narration-box.test.js
- npm run test:unit
- Manual browser checks: describe each completed prologue, Skill Master, hub, or Fusion Lab check
```

Do not claim manual verification completed unless it was actually performed.
