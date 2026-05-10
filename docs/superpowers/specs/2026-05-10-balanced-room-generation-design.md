# Balanced Room Generation Design

**Status:** Draft

## Goal

Make 30-room runs show the full set of encounter and room experiences regularly without turning area generation into a fixed deck or predictable route. The player should still feel roguelike variance from run to run, but should not go through a long area and miss shrine, whack-a-mole, friendly NPC, or campfire rooms because of unlucky independent rolls or campfire eligibility bugs.

This design keeps the existing fixed milestone structure:

- 30-room areas keep `npcBattle` at rooms 6, 12, 18, and 24.
- 10-room areas keep one `npcBattle` milestone.
- The final room remains `boss`.
- First-run scripted tutorial layout remains scripted.

## Non-Goals

- Do not introduce a quota deck or fixed counts for support rooms.
- Do not make every run contain the exact same room mix.
- Do not change combat encounter composition or boss placement.
- Do not revive old disabled room types such as `quiz`, `wordDiscovery`, `dealer`, `skillMaster`, or `speedReviewRoom`.

## Current Problem

Active room generation currently rolls random non-milestone rooms as either `encounter` or `support`. The `support` room is resolved later when the player enters it.

The current support resolver uses one random roll:

- If the run has unused ingredients and `roll < 0.50`, it returns `campfire`.
- The later `whackAMole` and `shrine` checks also require `roll < 0.45` and `roll < 0.50`.
- Therefore, when ingredients exist, `whackAMole` and `shrine` are unreachable from support rooms.

Even without that bug, the two-step `support` placeholder hides the real room type during area generation, which makes spacing and pity rules harder to reason about.

## Proposed Algorithm

Replace the current `encounter` versus `support` roll with lazy random slot finalization.

At area creation time:

- Fixed milestone rooms are created immediately.
- Random non-milestone rooms are created as unresolved random slots.

When the player enters an unresolved random slot, the game finalizes it into a concrete room type using a weighted pick among currently eligible room types:

- `encounter`
- `friendlyNpc`
- `whackAMole`
- `shrine`
- `campfire`

Use base weights, then adjust them per room based on the generation history for the current area. The final pick remains stochastic.

Suggested base weights:

```js
{
  encounter: 45,
  friendlyNpc: 18,
  whackAMole: 14,
  shrine: 10,
  campfire: 13
}
```

These weights intentionally keep normal creature encounters as the largest single category while making each support room common enough to appear in many 30-room runs.

Once a random slot is finalized, persist the concrete room type in `run.rooms` so refreshes, reloads, and repeated state reads do not reroll it.

## Pacing Rules

Apply the following modifiers before each random non-milestone room is picked.

### Cooldowns

Support room types should avoid immediate repeats:

- If the previous random room was the same support type, set that type's weight to `0`.
- If the same support type appeared two random slots ago, multiply its weight by `0.35`.
- `encounter` may repeat; repeated combat is part of the core loop.

This prevents runs like shrine, shrine, shrine without making individual support rooms deterministic.

### Combat And Support Streaks

Use streak correction to keep the run from feeling lopsided:

- If the last 3 random rooms were all non-combat support rooms, multiply `encounter` by `2.5`.
- If the last 4 random rooms were combat-like rooms (`encounter` or `npcBattle`), multiply all support room weights by `1.75`.
- Do not force a type unless all adjusted support or encounter weights would otherwise be `0`.

This keeps long combat stretches and long utility-room stretches rare while preserving chance.

### Pity Boosts

Track `roomsSinceSeen` per random room type during the current area. For each random room type:

- After 6 random slots without that type, multiply its weight by `1.5`.
- After 9 random slots without that type, multiply its weight by `2.25`.
- Cap the final pity multiplier at `3`.

Pity boosts should not guarantee a room type; they should only make long dry spells increasingly unlikely.

### Milestone Awareness

Fixed `npcBattle` and `boss` rooms should be included in history for pacing, but not in pity counters for random room types.

Example:

- `npcBattle` counts as combat-like for combat/support streaks.
- `boss` does not need to affect future room generation because it is the final room.
- Neither `npcBattle` nor `boss` competes with random room type weights.

## Campfire Eligibility

Campfire should only be eligible when the player can cook at least one real authored recipe with total ingredient quantity `>= 2`.

Eligibility must reuse the existing cooking recipe logic rather than duplicating recipe checks in room generation. Add a small helper in `src/game/services/cooking-service.js`, built on `getCookableRecipeHints()`:

```js
hasCookableRecipe(bag, { minTotalQuantity: 2 })
```

This intentionally excludes fallback single-ingredient cooking:

- `getCookableRecipeHints()` returns authored recipes, not fallback dishes.
- The `minTotalQuantity: 2` filter excludes any authored one-ingredient recipe if such recipes exist now or later.

If the player cannot cook a qualifying recipe when a random slot is finalized, set `campfire` weight to `0` before rolling. Do not redistribute manually; the weighted picker naturally gives the probability mass to the remaining eligible types.

Lazy finalization is required because ingredients drop as the player moves through rooms. A player may be ineligible for campfire at area start, then become eligible after room drops later in the same area.

## Implementation Shape

Keep weighting logic in `src/game/rooms.js`, and keep recipe eligibility in `src/game/services/cooking-service.js`.

Recommended helpers:

- `getRandomRoomBaseWeights()`
- `getRoomGenerationHistory(rooms)`
- `applyRoomPacingModifiers(baseWeights, history)`
- `applyRoomEligibilityFilters(weights, run)`
- `pickWeightedRoomType(weights, rng)`
- `finalizeRandomRoom(room, run, rng)`

Do not add persistent debug metadata to room objects. If implementation needs to inspect adjusted weights during development, expose that through test-only helper return values or temporary logs that are removed before merge.

`generateAreaRooms()` should:

1. Place fixed milestone rooms exactly as today.
2. Create unresolved random slots for non-milestone rooms.
3. Attach sub-area metadata as today.
4. Attach boss creature metadata as today.

Room navigation should finalize the current unresolved random slot when the player first enters it, including the first room of an area. The finalized room should preserve `id`, `roomNumber`, `totalRooms`, `areaId`, `subArea`, and exploration flags.

`ROOM_TYPES.support` and `resolveSupportRoom()` can remain temporarily for saved-run compatibility, but new room generation should not create `support` rooms. Use a separate unresolved type such as `randomRoom` so saved support behavior and new lazy generation behavior are not conflated.

## Testing

Unit tests should cover deterministic edge cases with a stubbed RNG:

- 30-room areas still place `npcBattle` at rooms 6, 12, 18, and 24.
- 30-room areas still place `boss` at room 30.
- 10-room areas still place one `npcBattle` and one final `boss`.
- New generation creates unresolved random slots rather than `support` rooms.
- Unresolved random slots finalize to concrete room types when entered.
- `shrine`, `whackAMole`, `friendlyNpc`, and `campfire` are all selectable by the room picker when eligible.
- Campfire has weight `0` when the player cannot cook a real 2+ ingredient recipe.
- Campfire remains eligible when the player can cook a real 2+ ingredient recipe.
- Same support type cannot appear in adjacent random slots.
- Pity boosts increase the weight of long-unseen room types without forcing fixed counts.

Statistical tests should be lightweight and seeded/stubbed enough to avoid flake:

- Over many generated 30-room areas, every enabled random room type appears at a non-trivial rate.
- The observed mix stays near the base-weight intent, allowing broad tolerance for pacing modifiers.

Manual playtest should confirm that a 30-room run feels varied and that campfire, shrine, whack-a-mole, friendly NPC, and normal encounter rooms can all be encountered during normal play. Campfire should start appearing only after the run has enough ingredients for an authored 2+ ingredient recipe.

No special first-5-room rule is needed for MVP. The general combat/support streak modifier already gives support rooms a boost after early combat-heavy starts, while still allowing high-combat openings.
