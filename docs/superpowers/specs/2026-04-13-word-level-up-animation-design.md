# Word Level-Up Animation Design

**Date:** 2026-04-13
**Status:** Approved

## Problem

Users get no dopamine hit when marking a word as "knew it" in speed review or the dictionary popup. We want to add a celebratory animation that reuses the visual language of our creature level-up (gold color, float-up text, particle burst) to make every successful recall feel rewarding.

## Design

### Animation

Every "knew it" action triggers a gold text popup + gold spark burst:

- **Text:** `{word} leveled up!` — shows the Japanese word in kanji or hiragana depending on `kanaMode`
- **Color:** `#FFD700` (gold, matching creature level-up)
- **Font:** bold, monospace, black text-stroke for legibility
- **Motion:** floats up ~40px over 1s, fades out
- **Positioning:** centered on the source element (the card in speed review, the popup in dictionary)
- **Sparks:** 10 gold particles in radial burst (reuses `spawnSparks` pattern from speed-review.js)
- **No screen flash** — too aggressive for every card in a 50-card session

### Kana mode

- Speed review: word object has `.word` (kanji) and `.reading` (hiragana). Check `getGameState()?.meta?.kanaMode` to pick.
- Dictionary popup: `_currentWord` is the base form, reading from span `data-reading`. Same kanaMode check.
- Fallback: if kanaMode is on but no reading available, use the base form as-is.

### Shared module

New file: `public/js/ui/word-level-up.js` (~40 lines)

Exports one function:

```
showWordLevelUp(anchorEl, wordText)
```

- Creates a fixed-position div with the text `{wordText} leveled up!`
- Positions it centered over `anchorEl` using `getBoundingClientRect()`
- Runs float-up + fade-out CSS animation (1s)
- Fires `spawnGoldSparks(anchorEl)` — 10 gold particles, same pattern as speed-review's `spawnSparks` but with `#FFD700`
- Auto-removes DOM elements on animation end

CSS keyframes (`@keyframes wordLevelUpFloat`) added to `game.css`.

### Integration points

**Speed review** (`public/js/ui/speed-review.js`):
- In `gradeCard()`, after line 635 (spawnSparks), when `direction === 'right'`:
  - Determine display word: `kanaMode ? (word.reading || word.word) : word.word`
  - Call `showWordLevelUp(card, displayWord)`

**Dictionary popup** (`public/js/ui/dialogue-word-lookup.js`):
- In `handleReview()`, after line 179 (grade === 'good' success):
  - Determine display word from `_currentWord` and reading, respecting kanaMode
  - Call `showWordLevelUp(dom.popup, displayWord)`

### Files changed

| File | Change |
|------|--------|
| `public/js/ui/word-level-up.js` | New — shared animation function |
| `public/game.css` | Add `@keyframes wordLevelUpFloat` and `.word-level-up` styles |
| `public/js/ui/speed-review.js` | Import + call in `gradeCard()` for right swipes |
| `public/js/ui/dialogue-word-lookup.js` | Import + call in `handleReview()` for 'good' grades |
