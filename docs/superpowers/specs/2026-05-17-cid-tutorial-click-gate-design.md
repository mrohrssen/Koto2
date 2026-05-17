# Cid Tutorial Click Gate Design

**Date:** 2026-05-17
**Status:** Proposed

## Problem

Several Cid tutorial moments show normal game controls while Cid's narration box is still visible. Today the same tap that advances the narration can also fall through to the underlying button or choice card, causing the tutorial action to fire before the player has finished reading Cid's instruction.

The desired behavior is:

1. Tapping outside Cid's narration still progresses the tutorial narration.
2. That tap must not trigger any underlying game button, choice card, move, shop item, or hub action.
3. Dialogues that intentionally keep Cid's narration visible while requiring a response button below it must continue to allow that response button.

## Goals

- Block underlying game controls while a non-persistent Cid tutorial narration is visible.
- Preserve existing tap-to-advance behavior for tutorial narration.
- Keep word lookup inside narration boxes working.
- Keep explicit Cid dialogue choices working when the narration box is persistent.
- Avoid changing tutorial sequencing or server-side tutorial progression.

## Non-Goals

- Do not redesign tutorial copy or timing.
- Do not block non-Cid dialogue cards that already own the action area.
- Do not change the first combat move hint after Cid has stopped speaking.
- Do not add server-side validation beyond the existing tutorial protections.

## Current Inventory

### Prologue

**Files:** `data/prologue.json`, `public/game.js`

- `prologue-01-garbled`: Cid garbled narration. Block underlying controls; tap advances narration.
- `prologue-02-garbled`: Cid garbled narration. Block underlying controls; tap advances narration.
- `prologue-03-understand`: Cid asks "Do you understand me NOW?" and renders "Yes, I understand!" while the box remains visible. Leave the response button clickable.
- `prologue-04-translator`: Block underlying controls; tap advances narration.
- `prologue-05-translator-on`: Block underlying controls; tap advances narration.
- `prologue-06-intro`: Block underlying controls; tap advances narration.
- `prologue-translator-try`: Block underlying controls; tap advances narration.
- `prologue-translator-how`: Block underlying controls; tap advances narration.
- `prologue-translator-demo`: Tokenized Japanese demo. Block underlying controls; keep word lookup inside the narration box clickable.
- `prologue-translator-reaction`: Block underlying controls; tap advances narration.
- `prologue-translator-click`: Block underlying controls; tap advances narration.
- `prologue-10-disruption`: Block underlying controls; tap advances narration.
- `prologue-starter-gift`: Block underlying controls; tap advances narration.
- `prologue-lets-go`: Block underlying controls; tap advances narration.

### Tutorial Step 0: Skill Master

**File:** `public/js/ui/exploration.js`

`renderSkillMaster()` starts `showTutorialNarration(getTutorialNarration(0), { showSprite: true })` without awaiting it, then renders the tutorial skill choices. The highlighted first skill is currently selectable while Cid may still be speaking.

Required behavior: taps on the highlighted skill while Cid narration is visible should only advance/dismiss Cid's narration. Once the narration is gone, the highlighted skill should select normally.

Non-tutorial Skill Master uses `showNpcDialogueCard()` and awaits it before rendering choices, so it should be left as is.

### Tutorial Step 1: Befriend Intro

**File:** `public/js/ui/befriend.js`

The Fight/Talk choices render before Cid's befriend narration. Fight is dimmed and Talk is highlighted, but Talk can be clicked while Cid is still speaking.

Required behavior: taps on Fight/Talk while Cid narration is visible should only advance/dismiss Cid's narration. After Cid leaves, Talk remains clickable.

### Tutorial Step 1: Befriend Wrong Answer Retry

**File:** `public/js/ui/befriend.js`

When the player chooses the wrong name during the protected befriend tutorial, Cid says "No, I don't think that's it... try again."

Required behavior: taps outside this narration should only dismiss Cid's line and must not trigger any underlying choice if one is present.

### Tutorial Step 1: First Combat Move Hint

**Files:** `public/js/ui/combat-loop.js`, `public/js/ui/move-select.js`

The "Tap here!" move hint is not a Cid narration moment. It appears after the Cid tutorial narration has completed.

Required behavior: leave as is. The highlighted move should remain clickable.

### Tutorial Step 2: Friendly NPC Item Shop

**File:** `public/js/ui/exploration.js`

Cid explains item offers after the shopkeeper greeting and before item choices are rendered.

Required behavior: Cid narration should block underlying controls while visible. The item cards render after the Cid line finishes and remain clickable.

### Tutorial Step 3: Death Hub

**File:** `public/js/ui/exploration.js`

Hub buttons are rendered before Cid's post-defeat narration, then Cid narration is awaited and the tutorial advances.

Required behavior: taps on hub buttons while Cid narration is visible should advance/dismiss Cid's narration only. After Cid is gone, hub buttons work normally.

### Tutorial Step 4: Speed Review Intro

**File:** `public/js/ui/exploration.js`

Hub buttons render first, Cid introduces Knowledge Review, then the Knowledge Review button is highlighted.

Required behavior: taps on hub buttons while Cid narration is visible should advance/dismiss Cid's narration only. After Cid is gone, Knowledge Review opens normally and advances the tutorial.

### Tutorial Step 5: Formation / Explore Prompt

**Files:** `public/js/ui/exploration.js`, `public/game.js`

Cid explains returning to Starting Meadow, then Explore is highlighted. Starting a new run advances tutorial step 5 to complete.

Required behavior: taps on Explore while Cid narration is visible should advance/dismiss Cid's narration only. After Cid is gone, Explore starts the run normally.

The legacy crest equip tutorial advance in `public/js/ui/crests-equip.js` is not a Cid narration moment and should not be changed for this feature.

### Hinoneko Boss Intro

**Files:** `src/game/services/combat-cycle-service.js`, `public/game.js`, `public/js/ui/room-transition.js`

The server returns `tutorialBossIntro` lines with `speaker: 'Cid'`; the frontend plays them before `startCombatLoop()`.

Required behavior: taps while these Cid lines are visible should advance/dismiss narration only. Combat move buttons are not expected to be active yet, but the click gate should still apply consistently.

### Fusion Tutorial Follow-Ups

**Files:** `public/js/ui/exploration.js`, `public/js/ui/fusion-lab.js`

Cid tutorial copy includes:

- Fusion core reward narration after speed review exit.
- Fusion Lab recipe guidance.
- Post-fusion encouragement.

Required behavior: while Cid narration is visible, taps on Fusion Lab recipe tiles, Start Fusion, Back to Hub, or hub controls should advance/dismiss narration only. Once narration is gone, those controls work normally.

## Design

Use the existing capture-phase narration click handler in `public/js/ui/narration-box.js` as the click gate. It already receives outside clicks before normal button handlers and already decides whether a click should advance the narration.

For non-persistent narration:

1. If the click is inside `#narration-box`, keep existing behavior and do not dismiss. This preserves word lookup and safe-zone interactions.
2. If the dictionary popup is visible and the click is inside `#lookup-popup`, keep existing behavior.
3. If the click is outside the narration box and dictionary popup, advance to the next page or hide the narration.
4. Before returning from that outside-click path, call `preventDefault()` and `stopImmediatePropagation()` so the underlying target never receives the same click.

For persistent narration:

- Do not register the outside-click gate.
- Continue resolving immediately.
- Keep `prologue-03-understand` working by allowing `renderButtonsAsync()` to receive the explicit response-button click while the narration box remains visible.

This should be implemented as general narration behavior rather than a scattered set of local disables. The behavior is correct for all non-persistent narration that uses the box: an outside click means "advance this narration", not "also activate whatever happened to be under my finger."

## Implementation Plan

### Task 1: Add a regression test for outside-click propagation

**Files:**

- Create: `tests/unit/ui/narration-box.test.js`

Test behavior:

1. Render a visible narration with `narrationBox.show('Cid line', { speaker: 'Cid' })`.
2. Render a clickable button outside `#narration-box`.
3. Dispatch one click on that button.
4. Assert that the narration promise resolves or advances.
5. Assert that the button handler did not run.

Also test the explicit exception:

1. Render persistent narration with `narrationBox.show('Choice line', { speaker: 'Cid', persistent: true })`.
2. Render a button outside `#narration-box`.
3. Dispatch one click on that button.
4. Assert that the button handler did run.

### Task 2: Gate outside narration clicks

**File:** `public/js/ui/narration-box.js`

Update `handleClick(e)` so the outside-click path consumes the click before advancing or hiding narration:

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
```

Keep the existing early returns for legacy lookup, narration-box clicks, and dictionary popup clicks.

### Task 3: Verify known tutorial call sites

**Files to inspect after implementation:**

- `public/game.js`
- `public/js/ui/exploration.js`
- `public/js/ui/befriend.js`
- `public/js/ui/fusion-lab.js`
- `public/js/ui/room-transition.js`
- `public/js/ui/combat-loop.js`
- `public/js/ui/move-select.js`

Confirm that no call site needs a local disable. The intended behavior should come from the shared narration click gate.

### Task 4: Run focused tests and syntax checks

Run:

```bash
node --check public/js/ui/narration-box.js
node --experimental-test-module-mocks --test tests/unit/ui/narration-box.test.js
```

Then run the full unit suite:

```bash
npm run test:unit
```

### Task 5: Manual verification checklist

Because this is a UI click-propagation behavior, verify manually before reporting completion.

Required checks:

- Prologue normal Cid lines: tapping an underlying action area hint advances narration and does not trigger unrelated game actions.
- Prologue `prologue-03-understand`: "Yes, I understand!" remains clickable while narration is visible.
- Tutorial Skill Master step 0: tapping the highlighted skill while Cid is speaking advances narration only; tapping it after Cid is gone selects the skill.
- Hub tutorial step 3, 4, or 5: tapping a hub button while Cid is speaking advances narration only; tapping after Cid is gone performs the hub action.
- Fusion Lab tutorial: tapping recipe or Start Fusion while Cid is speaking advances narration only; tapping after Cid is gone works.

## Risks

- This changes all non-persistent narration outside-click behavior, not only Cid. That is probably correct because outside-click means "advance narration", but tests should catch any flow that intentionally relied on click-through.
- Word lookup must remain untouched. The early returns for narration-box and dictionary popup clicks are essential.
- Persistent narration must remain exempt, otherwise the prologue choice button will stop working.

## Acceptance Criteria

- Outside clicks still advance or dismiss Cid tutorial narration.
- The same outside click does not activate game controls underneath the narration.
- `prologue-03-understand` still allows its response button while Cid narration is visible.
- Tutorial first skill selection cannot happen until Cid's narration is dismissed.
- Existing word lookup interactions inside narration continue to work.
- Focused tests and JS syntax check pass.
