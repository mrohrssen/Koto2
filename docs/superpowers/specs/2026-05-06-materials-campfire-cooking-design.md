# Materials Room And Campfire Cooking Design

**Date:** 2026-05-06  
**Status:** Approved design, awaiting implementation plan  
**Scope:** Add run-scoped ingredient collection rooms and deterministic one-dish campfire cooking using approved MVP ingredient and recipe seed data.

## Goal

Koto should gain a lightweight cooking loop inside normal exploration:

1. The player sometimes enters a materials room and receives 3-5 raw ingredients.
2. Those ingredients are stored only for the current run.
3. If the player has unused ingredients, future support rooms can become campfires.
4. At a campfire, the player chooses 1-5 ingredients, cooks one resulting dish, sees the dish's effects, and feeds it to one creature.
5. Cooked food applies through the current in-game item model: immediate effects or run-scoped creature `itemBuffs`.

The feature should make exploration feel richer without adding permanent crafting inventory, runtime AI, or a broad new item system.

## Source Data

The MVP seed content is:

- `output/koto-base-ingredients.json`
- `output/koto-cooking-recipes-final.json`

Implementation should copy this content into durable data files:

- `data/cooking/ingredients.json`
- `data/cooking/recipes.json`

The current seed data is good enough for MVP implementation. It still deserves later human content polish:

- `meron` and `tane` are currently unused in recipes.
- A few 5-ingredient recipes are mechanically valid but underwhelming or awkward, including `five-grain-rice`, `hot-pepper-stir-fry`, `kaisendon`, and `special-curry`.
- Some names remain formulaic or slightly awkward, for example `骨スープ`, `豆腐スープ`, `昆布スープ`, `新芽サラダ`, and `蜂蜜レモン水`.

These are not implementation blockers. Treat them as content polish follow-up.

## Ingredient Model

Each base ingredient has:

- `id`
- `word`
- `reading`
- `nameEn`
- `meaning`
- `jpdbRank`
- `rarity`
- `primaryEffect`
- optional `secondaryEffect`
- `effectRationale`

Ingredient requirements:

- Ingredients are raw materials, not final dishes.
- Ingredients are globally available from day one.
- Ingredients are run-scoped and reset when the run ends.
- Ingredients are never area-gated in MVP.
- Every ingredient rarity is one of `common`, `uncommon`, `rare`, `epic`, or `legendary`.
- Lower JPDB frequency maps to higher rarity, but every ingredient should remain useful learner vocabulary.

Allowed hidden ingredient effect lanes:

- `hpRestore`
- `partyHpRestore`
- `mpRestore`
- `revive`
- `attackMult`
- `hpMult`
- `xpMult`
- `xpGrant`
- `elementEdge`
- `dexMult`

Forbidden cooking lanes:

- Damage reduction.
- Cleanse or status recovery.
- Base stat bonuses; those are equipment-only.
- Speed, `spd`, haste, shield, random effects, or penalties.

## Recipe Model

Each recipe has:

- `id`
- `word`
- `reading`
- `nameEn`
- `meaning`
- `rarity`
- `ingredients[]` with `{ id, quantity }`
- `effects[]`
- `effectDescription`
- `rationale`

Recipes are deterministic. A recipe can only cook if all required ingredient quantities are present in the selected ingredient set.

The resolver should:

1. Accept 1-5 selected ingredient units.
2. Find every authored recipe whose ingredient requirements are fully contained in the selected ingredients.
3. Choose the recipe with the largest total ingredient quantity.
4. If tied, choose the highest recipe rarity.
5. If still tied, choose the stable lowest or first sorted recipe id.
6. If no multi-ingredient recipe matches, produce a cooked single-ingredient fallback from one selected ingredient.

For fallback selection, use the highest-rarity selected ingredient, then stable ingredient id. The fallback dish should be simple, for example `Cooked Shrimp`, and should derive its effect from that ingredient's effect lane. Fallback recipes do not need authored entries in `recipes.json`.

## Effect Rules

Recipe effects must derive from ingredient `primaryEffect` or `secondaryEffect`. No recipe should gain an effect lane not represented by at least one ingredient.

Effect value generation is content-authored in the seed JSON, but validation should preserve the design bounds:

- No effect value may be `0`.
- No forbidden effect type may appear.
- `target` must be `fedCreature` or `party`.
- `revive` and `xpGrant` should remain rare.
- 4-5 ingredient recipes should feel stronger than 2-3 ingredient recipes.

The current final recipe seed passes structural checks:

- 200 recipes.
- Total ingredient-count distribution: 90 two-ingredient, 70 three-ingredient, 30 four-ingredient, 10 five-ingredient.
- No unknown ingredient ids.
- No duplicate recipe ids.
- No duplicate ingredient signatures.
- No zero effect values.
- No forbidden effects.
- No lane violations.

## Materials Room

Add a new support room type:

- `materials`

Materials rooms appear in the normal room pool with a 10% chance, without replacing scripted boss or NPC battle slots.

When the player enters a materials room:

1. The room immediately rolls 3-5 ingredient units.
2. The ingredients are added to `run.ingredients`.
3. A dialogue-style popup tells the player what they received.
4. The room is marked complete and returns to normal completed-room auto-proceed behavior.

Drop count:

- Roll 3, 4, or 5 total ingredient units.
- A simple distribution is acceptable, for example 50% for 3, 35% for 4, 15% for 5.

Per-slot rarity weights:

- `common`: 68%
- `uncommon`: 22%
- `rare`: 8%
- `epic`: 1.8%
- `legendary`: 0.2%

Duplicate ingredients are allowed. The materials room can award `2 shrimp`, `1 mushroom`, `1 herb`, etc.

## Materials Room Dialogue

Use the existing dialogue/popup style rather than building a full new screen.

The receipt text must be player-facing Japanese, not English. A typical rendered line should be:

> エビを二つ、キノコを一つ、ハーブを一つ手に入れた。

Ingredient names should render as existing entity tokens, the same way other entity names are supported. Listing ingredient names in Japanese does not require special tokenization beyond the entity-name handling already used by the UI.

The surrounding receipt frame should still come from the static frames pipeline so the non-entity Japanese text remains controlled and beginner-safe. Do not hand-edit `data/dialogue/frames.json`.

## Campfire Room

Add a new support room type:

- `campfire`

Campfire rooms have a 25% chance to appear only when the active run has unused ingredients. They should not be eligible when the player has no ingredient units.

When the player enters a campfire:

1. The room displays a campfire cooking UI.
2. The player can cook exactly one dish.
3. After cooking, the UI shows the resulting dish and its effects.
4. The player chooses which creature receives the dish.
5. The cooked item effect is applied.
6. The used ingredients are consumed.
7. The dish is added to the discovered recipe list if it came from an authored recipe.
8. The room is marked complete and returns to normal completed-room auto-proceed behavior.

Each campfire can grant exactly one cooked item. Re-entering or refreshing a completed campfire must not allow a second cook.

## Campfire UI

The campfire UI should be inspired by the existing fusion lab pattern, but it is an in-run room encounter rather than a hub lab.

It has two tabs:

- Ingredients.
- Recipes.

Ingredients tab:

- Shows the run ingredient bag.
- Lets the player select 1-5 ingredient units.
- Shows a Cook button when the selection is valid.
- After cooking, shows the resulting dish, effect summary, and target creature selection.

Recipes tab:

- Shows only discovered authored recipes.
- Does not show all recipes by default.
- Helps the player remember known combinations without spoiling the full database.
- A discovered recipe can be selected if the run ingredient bag contains its required ingredients.

The result preview before cooking may be omitted for MVP if it would spoil undiscovered recipes. After cooking, the result and stats must be shown before feeding.

## State

Add run-scoped cooking state to `createNewRun()`:

```js
cooking: {
  ingredients: {},
  cookedThisRun: []
}
```

Recommended shapes:

- `ingredients`: map of ingredient id to count.
- `cookedThisRun`: optional telemetry for adventure report/debugging.

Recipe discovery is meta-scoped rather than run-scoped, because the Recipes tab functions like a remembered cookbook. Add a meta field:

```js
cookingRecipesDiscovered: []
```

Ingredient inventory remains run-scoped even if recipe discovery is meta-scoped.

## Applying Cooked Items

Cooked dishes should reuse the current item application model where practical.

Mapping:

- `hpRestore` -> current `heal` item with `healPercent`.
- `partyHpRestore` -> current `heal` item with `healAllPercent`.
- `mpRestore` -> current `mpRestore` item with `mpRestorePercent`.
- `revive` -> current `revive` item with `revivePercent`.
- `attackMult`, `hpMult`, `xpMult`, `elementEdge` -> current `boost` or XP item patterns.
- `dexMult` -> new item buff field after the dex implementation lands.
- `xpGrant` -> current `xpGrant` item semantics if context is available; otherwise implement a deterministic cooking-specific XP grant helper.

Base stat bonus fields must not be used for cooked food.

If `dexMult` is implemented before the dex combat plan lands, it should be data-valid but mechanically inert only if that is explicitly tested and documented. Prefer implementing cooking after dex support is available.

## API

Recommended endpoints:

- `GET /api/game/campfire` - return ingredient bag, discovered recipes, and current room campfire state.
- `POST /api/game/campfire/cook` - accept selected ingredient units, resolve recipe/fallback, consume ingredients, return cooked dish result.
- `POST /api/game/campfire/feed` - accept target creature index/id, apply cooked dish effect, mark room complete.
- `POST /api/game/materials/claim` - idempotently claim current materials room drops if needed.

Endpoint behavior should be idempotent for current-room refreshes:

- Materials drops should not reroll after they have been claimed.
- Campfire cooking should not cook a second dish after one has already been cooked.
- Feeding should not apply a cooked dish twice.

## Room Generation

Room generation should preserve scripted structure:

- Boss remains final room.
- NPC battle slots remain fixed.
- Tutorial overrides remain safe.
- Materials and campfire are support rooms in the normal room pool.

Support-room decision rules:

- Materials room: 10% chance.
- Campfire room: 25% chance only when the run has at least one unused ingredient unit.
- If campfire is ineligible, fall back to the normal support/encounter distribution.

Because rooms are generated up front for an area today, campfire eligibility needs runtime resolution. Use support-slot late binding:

1. Preserve scripted boss and NPC battle slots as concrete room types.
2. Generate ordinary non-scripted support opportunities as support slots or otherwise defer their exact type.
3. When the player advances into that slot, resolve it once using current run state:
   - If the run has unused ingredients, campfire is eligible at 25%.
   - Materials is eligible at 10%.
   - Remaining probability falls back to existing support or encounter options.
4. Persist the resolved concrete room type so refreshes and re-entry do not reroll.

The implementation plan should choose the smallest code shape that achieves this late binding without changing boss/NPC battle placement.

## Testing

Unit coverage should include:

- Ingredient data validates allowed fields, effect lanes, rarities, and unique ids.
- Recipe data validates unique ids, known ingredients, known effect lanes, nonzero effect values, and no duplicate ingredient signatures.
- Recipe resolver chooses largest fully matched recipe.
- Recipe resolver ties by rarity, then stable id.
- Resolver falls back to cooked single ingredient when no authored recipe matches.
- Materials room rolls 3-5 ingredient units using allowed rarities.
- Materials room claim is idempotent.
- Ingredients are added to run-scoped inventory and reset with the run.
- Campfire can appear only when ingredient inventory is non-empty.
- Campfire cooks exactly one dish.
- Cooking consumes selected ingredients.
- Feeding applies the cooked dish to the selected creature.
- Completed campfire cannot be claimed or fed twice.
- Recipes tab only includes discovered recipes.
- Authored recipe discovery persists in meta if meta-scoped discovery is implemented.

Frontend unit coverage should include:

- Ingredients tab renders counts and selection state.
- Cook button enables only for 1-5 selected ingredient units.
- Recipes tab hides undiscovered recipes.
- Result state shows dish effects before target selection.
- Feeding calls the correct API with the selected target.

Manual verification:

- Because this adds visible room UI, browser verification with screenshots is required before reporting implementation complete.
- Ask before opening Playwright.
- Verify a materials room receipt popup and a campfire cooking flow in the parallax exploration scene.

## Non-Goals

This pass should not:

- Add permanent ingredient inventory.
- Add recipe area gating.
- Add runtime AI dish generation.
- Add stack caps.
- Add damage reduction, cleanse, base stat bonuses, speed, haste, shield, random effects, or penalties.
- Add handcrafted edits to `data/dialogue/frames.json`.
- Fully polish every recipe name manually.
- Add cooking mastery, cooking XP, or long-term chef progression.

## Acceptance Criteria

The implementation is complete when:

- Materials rooms can appear and grant 3-5 run-scoped ingredients.
- Campfires can appear only when unused ingredients exist.
- A campfire lets the player cook exactly one dish from 1-5 selected ingredients.
- The deterministic resolver uses authored recipes and single-ingredient fallback correctly.
- Cooked dish effects are shown before feeding.
- Feeding applies effects through the existing item model or a compatible cooking helper.
- Used ingredients are consumed.
- Authored recipes are discovered after cooking and shown in the Recipes tab.
- Ingredients reset at run end.
- Data validation and focused unit tests pass.
- Manual browser verification covers the new visible flows.
