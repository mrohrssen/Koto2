# Bug: Chip descriptions overflow flash card boundaries

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Low (cosmetic, readability issue)

## Symptoms

- Some chip descriptions are too long and overflow/clip the card or modal area
- Text runs past the container boundaries

## Fix Options

1. **CSS truncation** — `overflow: hidden; text-overflow: ellipsis` with a max-height or line-clamp:
   ```css
   .chip-description {
     display: -webkit-box;
     -webkit-line-clamp: 3;
     -webkit-box-orient: vertical;
     overflow: hidden;
   }
   ```

2. **Dynamic font size** — detect overflow and reduce font-size until it fits

3. **Shorter descriptions** — edit `data/chips.json` to keep descriptions within a character limit (e.g., 60 chars for English, 30 chars for Japanese)

Option 1 (CSS line-clamp) is the simplest and most robust.

## Files to Modify

- `public/game.css` — add overflow/clamp rules to chip description elements
- `data/chips.json` — optionally shorten long descriptions
