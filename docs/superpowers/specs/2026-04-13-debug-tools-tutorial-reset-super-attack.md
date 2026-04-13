# Debug Tools: Tutorial Reset & 100 ATK Toggle

**Date:** 2026-04-13
**Status:** Approved

## Summary

Two debug features in the settings panel for faster playtesting:

1. **Reset Tutorial** button — resets tutorial state without touching prologue or progression
2. **100 ATK toggle** — gives all player creatures +100 base ATK in combat

Both are always visible in the settings panel (single playtester, no gating needed).

## Feature 1: Reset Tutorial

### Server

New `POST /api/game/tutorial-reset` endpoint in `src/routes/game/misc.js`, mirroring the existing `prologue-reset` pattern (line ~395):

```javascript
meta.tutorialStep = 0;
meta.tutorialFireDropsGifted = false;
```

Does NOT touch: `prologueComplete`, `creatureCollection`, `elementDrops`, `crests`, `achievements`, or any other meta fields.

### UI

Button in settings panel (`public/js/ui/modals.js`) next to the existing "Reset Prologue" button. Same interaction pattern:
- Label: "Reset Tutorial"
- Subtitle: "Replay the tutorial on next run."
- Click → "Resetting..." → "Done — start a new run to replay" (3s) → revert

## Feature 2: 100 ATK Toggle

### Server

New `debugSuperAttack` boolean in global settings (`.jrpg-settings.json`), defaults to `false`.

- `GET /api/settings` returns `debugSuperAttack` field
- `POST /api/settings` accepts `debugSuperAttack` boolean
- Default added to `loadSettings()` in `server.js`

### Combat Integration

At combat start, when player creatures are prepared for battle, if `debugSuperAttack` is enabled, inject `+100` into each player creature's `itemBuffs.baseAttackBonus`. This flows through the existing `getBuffedAttack()` pipeline — same path as equipment.

- Applies to all player creatures automatically, including newly befriended ones
- Scales with level via `levelMult` (+100 at Lv1, +140 at Lv5, +190 at Lv10)
- Works in both PvE and PvP (same code path)
- No changes to damage formula

### UI

Checkbox toggle in settings panel:
- Label: "100 ATK (Debug)"
- Subtitle: "All your creatures get +100 ATK in combat."
- Persisted server-side, survives page reloads

## Files Changed

| File | Change |
|------|--------|
| `src/routes/game/misc.js` | Add `tutorial-reset` endpoint |
| `src/routes/settings.js` | Add `debugSuperAttack` to GET/POST |
| `server.js` | Add `debugSuperAttack: false` to settings defaults |
| `public/js/ui/modals.js` | Add button + toggle to settings panel |
| Combat start code (TBD during planning) | Inject +100 baseAttackBonus when setting is on |
