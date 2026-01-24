# Bug: Chip skill usage returns "chipId required"

**Found:** 2026-01-24 during integration testing
**Branch:** `integration/all-features`
**Severity:** Medium (feature broken, not a crash)

## Reproduction

1. Start a run, equip chips
2. Attempt to use a chip skill
3. Error: "chipId required"

## Likely Cause

The mobile-ui frontend sends the skill activation request without the `chipId` parameter, or sends it in a format the backend doesn't expect. The chip skill endpoints (`/api/game/use-chip-skill`) were added on master before the mobile-ui rewrite, so the frontend call site may not match the API contract.

## Files to Investigate

- `public/js/ui/chip-row.js` — frontend chip skill trigger
- `src/routes/game/run.js` or `server.js` — `/api/game/use-chip-skill` endpoint
- `public/js/api.js` — API call function
