# Bug: Settings icon doesn't look like a gear

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Low (cosmetic)

## Symptoms

- The settings button icon doesn't read as a gear/cog
- Users may not recognize it as settings

## Fix

Replace with a proper gear unicode character or SVG. Options:
- Unicode gear: `⚙` (U+2699) or `⚙️`
- CSS-only gear using border-radius + pseudo-elements
- Inline SVG gear icon

## Files to Modify

- `public/game.html` or `public/js/ui/modals.js` — wherever the settings button is rendered
- `public/game.css` — icon styling if using CSS approach
