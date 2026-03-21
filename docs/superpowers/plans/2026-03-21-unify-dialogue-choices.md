# Unify Dialogue Choice Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three duplicate choice-rendering systems with one shared `showDialogueChoices()` function, and delete the dead narration-box choices code.

**Architecture:** Extract the gold-standard NPC response option rendering (`combat-loop.js:showNpcResponseOptions`) into a new `dialogue-choices.js` module. Refactor all three consumers (prologue, befriend conversation, NPC dialogue) to call it. Remove dead choices code from narration-box.

**Tech Stack:** Vanilla ES6 modules, browser DOM

**Spec:** `docs/superpowers/specs/2026-03-21-unify-dialogue-choices-design.md`

---

### Task 1: Create `dialogue-choices.js` shared module

**Files:**
- Create: `public/js/ui/dialogue-choices.js`

- [ ] **Step 1: Create the module**

Extract from `showNpcResponseOptions()` in `combat-loop.js:3043-3070`. The function accepts an array of options (plain strings or `{ text }` objects), renders them into `#action-area`, and returns a promise that resolves with the selected index.

```js
/**
 * @file dialogue-choices.js - Shared dialogue response button renderer
 *
 * Renders response option buttons in #action-area for any dialogue flow
 * (prologue, NPC post-combat, befriend conversation).
 */

import { renderEnFirst } from './bootstrap-client.js';

/**
 * Show dialogue choice buttons in the action area.
 * @param {Array<string|{text: string}>} options - Choice options
 * @returns {Promise<number>} Selected option index
 */
export function showDialogueChoices(options) {
  return new Promise(resolve => {
    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(0); return; }

    const buttons = options.map((option, idx) => {
      const text = typeof option === 'string' ? option : option.text;
      return `
      <div class="shrine-creature-option befriend-answer-option" data-answer-index="${idx}" style="width:100%">
        <div class="shrine-creature-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-creature-name" style="color:var(--accent-primary)">${renderEnFirst(text)}</div>
        </div>
      </div>
    `;
    }).join('');

    actionArea.innerHTML = `
      <div class="shrine-creature-list befriend-answer-list" style="padding:0 1rem">
        ${buttons}
      </div>
    `;

    const list = actionArea.querySelector('.befriend-answer-list');
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.befriend-answer-option');
      if (!opt || list.dataset.answered) return;
      list.dataset.answered = '1';
      resolve(parseInt(opt.dataset.answerIndex, 10));
    });
  });
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/dialogue-choices.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/dialogue-choices.js
git commit -m "feat: extract showDialogueChoices into shared module"
```

---

### Task 2: Refactor NPC post-combat dialogue to use shared module

**Files:**
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Add import**

At the top of `combat-loop.js`, after the existing imports (around line 55), add:

```js
import { showDialogueChoices } from './dialogue-choices.js';
```

- [ ] **Step 2: Replace `showNpcResponseOptions` call in `runNpcDialogue`**

In `runNpcDialogue()` (around line 3011), change:

```js
    const selectedIndex = await showNpcResponseOptions(round.options, i);
```

to:

```js
    const selectedIndex = await showDialogueChoices(round.options);
```

- [ ] **Step 3: Replace `showConversationRound` usage in befriend**

In `showConversationRound()` (around line 2492-2525), replace the inline button rendering. The function currently does two things: (1) shows narration and (2) renders choice buttons. Keep the narration call, replace the choice rendering.

Replace the entire `showConversationRound` function body:

```js
function showConversationRound(round, roundNumber, creatureName) {
  // Show creature's line in narration box
  narration.showNarration(round.speaker, {
    speaker: creatureName,
    persistent: true
  });

  return showDialogueChoices(round.options);
}
```

- [ ] **Step 4: Delete `showNpcResponseOptions` function**

Delete the entire `showNpcResponseOptions` function (lines 3043-3070).

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "refactor: combat-loop uses shared showDialogueChoices"
```

---

### Task 3: Refactor prologue to use shared module

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Add import**

At the top of `game.js`, near the other UI imports (around line 102), add:

```js
import { showDialogueChoices } from './js/ui/dialogue-choices.js';
```

- [ ] **Step 2: Delete `showPrologueChoices` function**

Delete the entire `showPrologueChoices` function inside `playPrologue()` (lines 555-583 approximately — the function definition and all its contents including the `actions.setContent(...)` call and the Promise).

- [ ] **Step 3: Update the choice-rendering call site**

In the `playPrologue` loop, find the block that handles choices (around line 615-618):

```js
    if (prologueScene.choices?.length > 0) {
      await narrationBox.show(html, { ...showOpts, persistent: true });
      result = await showPrologueChoices(prologueScene.choices);
      lastChoiceId = result;
```

Replace with:

```js
    if (prologueScene.choices?.length > 0) {
      await narrationBox.show(html, { ...showOpts, persistent: true });
      const choiceIdx = await showDialogueChoices(prologueScene.choices);
      actions.clear();
      narrationBox.forceHide();
      const chosen = prologueScene.choices[choiceIdx];
      result = chosen.id ?? chosen.text;
      lastChoiceId = result;
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "refactor: prologue uses shared showDialogueChoices"
```

---

### Task 4: Delete dead narration-box choices code

**Files:**
- Modify: `public/js/ui/narration-box.js`
- Modify: `public/game.html`
- Modify: `public/game.css`

- [ ] **Step 1: Remove `#narration-choices` div from HTML**

In `public/game.html`, delete line 58:

```html
        <div class="narration-choices" id="narration-choices"></div>
```

- [ ] **Step 2: Remove CSS for narration choices**

In `public/game.css`, delete the three rule blocks (lines 669-703):

```css
.narration-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  position: relative;
  z-index: 1;
}

.narration-choices:empty {
  display: none;
}

.narration-choice-btn {
  background: var(--accent-cyan);
  border: none;
  border-radius: var(--card-radius);
  padding: 14px 16px;
  color: white;
  font-size: clamp(14px, 3.8vw, 18px);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s, transform 0.1s;
  box-shadow: var(--shadow-soft);
  -webkit-tap-highlight-color: transparent;
  width: 100%;
}

.narration-choice-btn:hover,
.narration-choice-btn:active {
  background: #39b0e4;
  transform: scale(0.96);
}
```

- [ ] **Step 3: Clean up narration-box.js**

In `public/js/ui/narration-box.js`:

a) Delete the `choicesEl` const (line 35):
```js
const choicesEl = document.getElementById('narration-choices');
```

b) In `hide()` (line 145), delete:
```js
  if (choicesEl) choicesEl.innerHTML = '';
```

c) In `show()`, remove `choices` from destructuring (line 194):
Change:
```js
  const {
    speaker,
    autoDismiss,
    persistent,
    html,
    choices,
    garbled
  } = options;
```
To:
```js
  const {
    speaker,
    autoDismiss,
    persistent,
    html,
    garbled
  } = options;
```

d) Delete `const hasChoices = choices?.length > 0;` (line 236) entirely, and replace the indicator line (line 237) with:
```js
  if (indicatorEl) indicatorEl.style.display = (autoDismiss || persistent) ? 'none' : '';
```

Then delete the entire choices block:
```js
  // Choices mode: show text + choice buttons, resolve with choice id on click
  if (hasChoices) {
    return new Promise(resolve => {
      dismissResolve = resolve;
      if (choicesEl) {
        choicesEl.innerHTML = '';
        for (const choice of choices) {
          const btn = document.createElement('button');
          btn.className = 'narration-choice-btn';
          btn.textContent = choice.text;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.removeEventListener('click', handleClick, true);
            hide(choice.id || choice.text);
          });
          choicesEl.appendChild(btn);
        }
      }
    });
  }
```

e) In `forceHide()` (line 292), delete:
```js
  if (choicesEl) choicesEl.innerHTML = '';
```

- [ ] **Step 4: Syntax check all modified files**

Run:
```bash
node --check public/js/ui/narration-box.js && node --check public/game.js && node --check public/js/ui/combat-loop.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/narration-box.js public/game.html public/game.css
git commit -m "refactor: remove dead narration-box choices code"
```

---

### Task 5: Verify

- [ ] **Step 1: Syntax check all touched files**

```bash
node --check public/js/ui/dialogue-choices.js && \
node --check public/js/ui/narration-box.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/game.js && \
echo "All OK"
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

- [ ] **Step 3: Start dev server and verify it loads**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200`
