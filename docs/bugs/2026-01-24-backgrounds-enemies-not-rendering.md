# Bug: Floor backgrounds and enemy sprites not rendering (blank)

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** High (core visual content missing)

## Symptoms

- Floor/location backgrounds are blank (no image shown)
- Enemy sprites don't appear during combat
- The image files exist and return HTTP 200 when accessed directly (verified during smoke test)

## Likely Cause

The mobile-ui frontend may not be setting the background images or enemy sprite `src` attributes correctly. Possible issues:
- The background module references a different path structure than where assets actually are
- The enemy sprite element isn't being populated with the correct URL
- CSS `background-image` may be overridden or the container has zero dimensions

## Files to Investigate

- `public/js/ui/scene.js` — likely handles background rendering
- `public/js/ui/combat-loop.js` or `public/js/ui/combat.js` — enemy sprite display
- `public/game.css` — background container styling (check dimensions, `background-size`)
- `src/game/rooms.js` — check what background path the server sends to the client
- `src/game/enemies.js` — check what sprite path is included in enemy data
- API responses — verify the image paths in game state match actual file locations
