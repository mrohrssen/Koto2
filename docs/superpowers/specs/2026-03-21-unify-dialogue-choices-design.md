# Unify Dialogue Choice Rendering

**Date:** 2026-03-21
**Goal:** Eliminate duplicate dialogue/choice rendering code. One shared function for showing NPC-style dialogue with response options.

## Problem

Three independent choice-rendering systems exist:

| System | Location | Renders into | CSS classes | Text rendering |
|--------|----------|-------------|-------------|----------------|
| Prologue choices | `game.js:555-583` | `#action-area` | `action-btn action-btn-primary` | `escapeHtml()` |
| NPC dialogue responses | `combat-loop.js:3043-3070` | `#action-area` | `shrine-creature-option befriend-answer-option` | `renderEnFirst()` |
| narration-box built-in choices | `narration-box.js:242-260` | `#narration-choices` (inside narration overlay) | `narration-choice-btn` | plain `textContent` |

Additionally, `showConversationRound()` in `combat-loop.js:2492-2525` (befriend conversation) duplicates the NPC response option pattern with slightly different text handling.

## Design

### Gold standard: NPC post-combat dialogue flow

The pattern in `combat-loop.js:2979-3070` is correct:
1. Show NPC line via persistent narration box (with speaker label)
2. Render response buttons in `#action-area` using `shrine-creature-option befriend-answer-option` classes
3. Text rendered via `renderEnFirst()` for vocab markup
4. Resolve promise with selected index on click

### Extract shared function

Extract from `showNpcResponseOptions()` a reusable function that any dialogue flow can call:

```js
// Signature
showDialogueChoices(options, { renderFn = renderEnFirst } = {}) => Promise<index>
```

- Renders into `#action-area` with `shrine-creature-option befriend-answer-option` classes
- Each option is `{ text: string }` or plain string
- Returns selected index
- `renderFn` defaults to `renderEnFirst()` — plain English text passes through unchanged

This function lives in a shared location importable by both `game.js` (prologue) and `combat-loop.js`.

### Refactor consumers

**Prologue (`playPrologue` in `game.js`):**
- Delete `showPrologueChoices()` entirely
- Use persistent narration + `showDialogueChoices()` for choice scenes
- Choice text goes through `renderEnFirst()` (no-op on plain English)

**Befriend conversation (`showConversationRound` in `combat-loop.js`):**
- Replace inline button rendering with `showDialogueChoices()`
- Keep the existing narration call (persistent, with speaker)

**NPC post-combat dialogue (`runNpcDialogue` in `combat-loop.js`):**
- Replace `showNpcResponseOptions()` call with `showDialogueChoices()`
- No behavior change, just uses the extracted function

### Delete dead code

- Remove `choices` handling from `narrationBox.show()` (lines 236, 242-260)
- Remove `#narration-choices` div from `game.html:58`
- Remove `.narration-choices`, `.narration-choices:empty`, `.narration-choice-btn` CSS from `game.css:669-704`
- Remove `choicesEl` reference from `narration-box.js:35`
- Remove `choicesEl` cleanup from `hide()` and `forceHide()` in `narration-box.js`

### Out of scope (leave as-is)

- **Befriend name quiz** (`renderBefriendQuiz`) — different UI pattern (Fight/Talk + name multiple-choice quiz), not dialogue responses
- **Befriend release prompt** (`showBefriendReleasePrompt`) — full-screen overlay for party management
- **Enemy possessed dialogue** (`showEnemyDialogue`) — narration only, no choices

## Where to put the shared function

Option A: New small module `public/js/ui/dialogue-choices.js`
Option B: Add to existing `public/js/ui/scene.js` (already shared between game.js and combat-loop.js)

Recommend **Option A** — it's a focused module with one export. `scene.js` is about sprites/backgrounds, not dialogue.

## Testing

- Manual playtest: reset prologue, verify Cid's dialogue uses the same visual style as NPC post-combat dialogue
- Manual playtest: trigger befriend conversation, verify response options match NPC dialogue style
- Verify no regressions in NPC post-combat dialogue flow
- Syntax check all modified JS files with `node --check`
