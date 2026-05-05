# Creature Quantity Fusion Design

## Goal

Fusing creatures should spend owned creature copies instead of treating collection entries as permanent, unconsumable ingredients. The player should be able to befriend more copies, see how many copies they currently own, and use those quantities for fusion requirements. Starter selection should show owned quantities, but still allow at most one of each creature for now.

## Current State

`meta.creatureCollection` is a unique list of discovered creature IDs. It drives starter eligibility, catalog ownership, fusion ingredient checks, and total discovered counts. `meta.befriendCount` is a lifetime stat that increments on every successful befriend. Fusion currently adds the result to `creatureCollection` and has tests asserting that inputs are not consumed.

Those meanings conflict with the new behavior. A discovered creature should stay discovered after fusion consumes the last available copy, while lifetime befriend count should not decrease.

## Data Model

Add `meta.creatureCounts` as the spendable inventory:

- Keys are creature IDs.
- Values are currently owned copy counts.
- New saves start with each `DEFAULT_COLLECTION` creature at `1`.
- Old saves migrate by granting `1` copy for each valid ID already in `creatureCollection`, with default starters guaranteed at `1`.

Keep existing fields:

- `creatureCollection`: discovery/unlock set. A creature remains in this list once discovered.
- `befriendCount`: lifetime number of successful befriends. This remains historical and never decreases.

## Collection Service Behavior

Add small helpers around creature quantities rather than spreading object mutation through routes and services:

- `ensureCreatureCounts(meta)` initializes and migrates counts.
- `getCreatureCount(meta, creatureId)` returns the current count.
- `addCreatureCopy(meta, creatureId, amount = 1)` adds spendable copies and ensures discovery.
- `consumeCreatureCopies(meta, requirements)` validates and subtracts required counts atomically.
- `countRequirements(ids)` turns recipe ingredient arrays into `{ id, required }` rows, so duplicate requirements like three of the same creature are naturally supported.

`addToCollection()` can remain for discovery-only callers, but befriend and fusion flows should use quantity helpers when they change owned copies.

## Befriend Flow

When pending captures are flushed after combat:

- Increment `befriendCount[id]`.
- Increment `creatureCounts[id]`.
- Add the ID to `creatureCollection` if this is the first discovery.
- Continue showing a “new creature” toast only when discovery is new, not on every duplicate.

This preserves the new duplicate-acquisition behavior while keeping the existing discovery UX.

## Fusion Flow

Fusion eligibility should check ingredient quantities instead of unique membership:

- Recipe state includes `ingredientRequirements`, each with `id`, `required`, `owned`, and `missing`.
- `missingIngredientIds` can remain for compatibility, but it should reflect requirements where `owned < required`.
- `canFuse` requires enough copies, enough fusion cores, and unlocked recipe data.

Starting fusion should:

1. Recompute recipe state from current meta.
2. Refuse if data, cores, or ingredient quantities are insufficient.
3. Subtract required ingredient copies atomically.
4. Spend fusion cores.
5. Add one copy of the result creature and ensure it is discovered.

Fusion should be repeatable. An already-discovered result should not block fusion; it should produce another spendable copy of that result. Each repeat fusion still consumes the full ingredient requirements and fusion core cost, just like the first fusion. Recipe state can still expose `alreadyDiscovered` or `resultOwned` for display, but inventory ownership must not serve as a one-time recipe gate. Tutorial completion should continue to use tutorial-specific state.

## UI

Starter creature select:

- Display the current owned quantity on owned grid cells, for example `x2`.
- Display the same count in the inspected card footer, replacing or pairing with the current lifetime “Befriended Nx” line.
- Keep selection as a `Set` of creature IDs for this change, so players cannot select duplicate copies into the same run yet.
- Treat count `0` as unavailable even if the creature was discovered before.

Fusion Lab:

- Display each ingredient slot with owned and required counts, for example `Owned 2/3`.
- Mark a slot missing when owned count is lower than required count.
- Update requirement text to call out quantity shortages, for example `Need 3 Hi (owned 2)`.
- After a successful fusion, refresh fusion state and catalog data so consumed ingredients and the new result count are visible immediately.

## Testing

Update unit coverage around collection and fusion:

- New saves and migrated saves receive valid starter counts.
- Befriending an already-discovered creature increments `creatureCounts` and `befriendCount`.
- Starter validation rejects a discovered creature with `0` owned copies.
- Fusion consumes one copy of each ingredient and adds one copy of the result.
- Fusion rejects insufficient quantities without spending cores or partially consuming ingredients.
- Duplicate ingredient requirements, such as three copies of the same creature, are counted correctly.

Frontend changes should get a syntax check for edited JS files. Because this includes UI display changes, visual verification should be performed before reporting implementation complete.
