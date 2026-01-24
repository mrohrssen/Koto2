# Bug: Original word disappears on flashcard flip, should persist with furigana

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (hurts learning effectiveness)

## Symptoms

- Flash card shows the vocab word initially
- When the card flips to reveal the answer, the original word disappears
- User loses sight of what they were trying to read

## Expected Behavior

- The original word should remain visible on the answer side
- Furigana (reading in hiragana) should be shown above the kanji if the word contains kanji
- This reinforces the kanji → reading association

## Implementation Notes

- Use `<ruby>` tags for furigana: `<ruby>漢字<rt>かんじ</rt></ruby>`
- The vocab data from JPDB should already include the reading
- Check what fields the API returns for each vocab word (likely `word`, `reading`, `meanings`)

## Files to Investigate

- `public/js/ui/combat-loop.js` — flash card rendering (front/back content)
- `public/js/word-practice.js` — may handle word display logic
- `public/game.css` — ruby/furigana styling
- API response from vocab endpoints — check available fields
