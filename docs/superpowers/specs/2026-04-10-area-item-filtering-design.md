# Area-Based Item Filtering for Friendly NPC Shop

**Date:** 2026-04-10
**Status:** Approved

## Problem

The friendly NPC shop (`rollFriendlyNpcOffers`) draws from all items in `items.json` regardless of which area the player is in. Area 2 items (school-themed) can appear in area 1 shops, breaking progression.

## Goal

Area 1 shops show only area 1 items. Area 2 shops show area 1 + area 2 items. Cumulative, per-run, based on current area.

## Design

### 1. Data: Add `area` field to `items.json`

Every item gets an `"area"` field matching the area ID it belongs to.

**Area 1 (`hajimari-no-hiroba`):** ocha, toufu, ringo, tamago, ichigo, sake, raamen, bentou, sushi, wasabi, katana, hon, kutsu, kagami, boushi

**Area 2 (`school`):** pan, ame, okashi, onigiri, sandoicchi, enpitsu, pen, nooto, kyoukasho, jisho, ryukku, tokei

### 2. Code: `rollFriendlyNpcOffers` in `src/game/services/exploration-service.js`

Change signature from:
```js
rollFriendlyNpcOffers(category, itemPool = null)
```
To:
```js
rollFriendlyNpcOffers(category, areaIds, itemPool = null)
```

Add area filter to the eligible pool:
```js
const eligible = itemPool.filter(item =>
  item.category === category &&
  (!item.area || areaIds.includes(item.area))
);
```

The `!item.area` fallback ensures any item missing the field still appears (backward compat safety net).

### 3. Call site: `src/routes/game/run.js:628`

Build cumulative area IDs from run state before calling:
```js
const areaPath = gm.run.areaPath || [];
const currentAreaId = gm.run.currentArea?.id;
const areaIds = [...new Set([...areaPath, currentAreaId].filter(Boolean))];
room.friendlyNpc.offered = rollFriendlyNpcOffers(room.friendlyNpc.offerCategory, areaIds, allItems);
```

### 4. Tests

- Add unit test for `rollFriendlyNpcOffers` with area filtering: area 1 only → only area 1 items; area 1+2 → both
- Existing `rollShopItems` tests are unaffected (different function)

## Files to change

| File | Change |
|------|--------|
| `data/items.json` | Add `"area"` field to all 27 items |
| `src/game/services/exploration-service.js` | Add `areaIds` param + filter to `rollFriendlyNpcOffers` |
| `src/routes/game/run.js` | Build `areaIds` from run state, pass to `rollFriendlyNpcOffers` |
| `tests/unit/exploration/friendly-npc-offers.test.js` (new) | Area filtering tests |
