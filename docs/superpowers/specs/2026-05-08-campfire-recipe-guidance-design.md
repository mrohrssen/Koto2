# Campfire Recipe Guidance Design

**Date:** 2026-05-08  
**Status:** Approved in chat, awaiting implementation plan  
**Scope:** Add live ingredient highlighting and fireplace readiness feedback to the campfire cooking UI so players can discover real recipes without guessing blindly.

## Goal

Cooking feels good once it works, but it is currently hard to use because players cannot tell which ingredient combinations produce real recipes versus fallback dishes. The campfire screen should guide the player toward valid real recipes in real time while preserving the joy of discovery.

When the player enters the cooking area, the game calculates every real recipe the player can currently make from owned ingredients. Fallback dishes are not recipes for this feature and must not influence highlights or ready-state feedback.

## User-Facing Requirements

Ingredient guidance:

- In the `Ingredients` tab, ingredient cards that can participate in at least one complete real recipe glow with a pulsing border.
- With no ingredients selected, an ingredient glows if it appears in at least one real recipe that the player can fully make from their current ingredient bag.
- After each selection change, highlights update immediately.
- A selected ingredient keeps glowing only if the current selection is still contained by at least one complete real recipe.
- An unselected ingredient glows only if adding one unit of that ingredient to the current selection still leaves the player on at least one complete real recipe path.
- Ingredients that are no longer valid for the current selection stop glowing.
- Deselecting an ingredient recomputes the highlights from the new selection.

Fireplace ready state:

- The fireplace starts a repeated scale pulse when the current selection is on a valid recipe path and satisfies every requirement for at least one real recipe.
- The pulse loops until the current selection no longer completes a valid real recipe path, the player cooks, or the campfire screen exits.
- The pulse should reuse the same visual language as the existing ingredient press/campfire pulse, but it must be a persistent "ready to cook" loop rather than a one-shot tap response.
- The Cook button can remain available for fallback cooking if 1-5 ingredients are selected, but the fireplace pulse is the clear signal that cooking now will produce a real recipe.

Stronger recipe continuation:

- If the current selection already completes a real recipe, the UI still highlights ingredients that can extend the selection into a larger or stronger real recipe.
- Example: if `Water + Miso` is a complete recipe and `Water + Miso + Tofu` is also a complete recipe, the fire pulses after `Water + Miso`, and `Tofu` continues glowing.
- Ingredients unrelated to any recipe containing the current selection do not glow, even if they are useful in some other recipe.

## Recipe Matching Rules

Use multiset/count semantics, not simple set membership:

- A selected count must not exceed the corresponding requirement count for candidate-extension checks.
- A recipe contains the current selection when every selected ingredient id exists in the recipe and the selected quantity is less than or equal to the recipe quantity.
- A recipe is complete for the current selection when every recipe requirement is present in the selected counts at the required quantity or higher.
- A recipe can be extended by an ingredient when the current selection plus one more unit of that ingredient is contained by the recipe.
- Ignore fallback dishes entirely. Only entries from `data/cooking/recipes.json` count.
- Ignore recipes the player cannot fully make from their owned ingredient bag.
- Ignore recipes requiring more than five total ingredient units, since the campfire selection cap is five.

These rules intentionally make highlights path-based: the glow answers "can this ingredient still lead from my current selection to a real recipe?"

## Data Flow

Add a server-provided recipe guidance payload to the existing campfire state:

- Keep `discoveredRecipes` unchanged for the Recipes tab.
- Add a separate field named `cookableRecipeHints`.
- Each hint should include only the data needed for matching: `id`, `ingredients`, `rarity`, and `totalQuantity`.
- The UI must not render undiscovered recipe names, effects, or outcomes from this hint payload.

The server should compute hints from:

- `COOKING_RECIPES`
- `gm.run.cooking.ingredients`
- the existing `hasIngredients` helper or a shared recipe-matching helper

This keeps the frontend from depending on a full public recipe catalog while still allowing it to update highlights instantly as the local `selected` state changes.

## Frontend Behavior

In `public/js/ui/campfire.js`, derive three pieces of state on every render:

- `candidateRecipes`: cookable recipe hints that contain the current selection.
- `hasCompleteRecipe`: whether any candidate recipe is complete for the current selection.
- `highlightedIngredientIds`: ingredient ids where adding one more unit would remain inside at least one candidate recipe, plus selected ingredient ids that are still on a valid recipe path.

Ingredient card classes:

- Keep the existing `selected` class for selected visual state.
- Add a `recipe-valid` class for pulsing recipe guidance.
- Non-highlighted ingredients should simply lose the glow. They should remain tappable because the player may intentionally cook a fallback dish or change paths.

Fireplace classes:

- Add a `campfire-focus-wrap--recipe-ready` class when `hasCompleteRecipe` is true.
- Apply the class in the scene preview render so the pulse updates when selection changes.
- Do not pulse the fireplace for fallback-only selections.

## Edge Cases

- No cookable real recipes: no ingredient cards glow and the fireplace does not pulse. The player can still select 1-5 ingredients and cook a fallback dish.
- Selected path becomes invalid: selected cards may remain visibly selected, but their recipe-valid glow is removed and the fireplace stops pulsing.
- Duplicate ingredient quantities: if a recipe needs two of the same ingredient, that ingredient remains glow-valid while selecting the second unit would still be inside the recipe and the player owns enough units.
- Selection cap reached: no additional unselected ingredient should glow unless selecting it would be possible under the five-unit cap.
- Recipe tab clicks: selecting a discovered recipe should produce the same highlight/fireplace state as manually selecting its ingredients.

## Testing

Add focused unit coverage in `tests/unit/ui/campfire.test.js`:

- Initial render glows ingredients that belong to at least one cookable real recipe.
- Selecting an ingredient prunes unrelated ingredient glows.
- Selecting enough ingredients for a real recipe adds the fireplace ready pulse class.
- Selecting a complete recipe still highlights valid stronger-recipe extensions.
- Fallback-only selections do not pulse the fireplace.
- Duplicate quantity recipes keep highlighting correct repeat selections.

Add server/service coverage if a helper is introduced:

- Cookable recipe hint calculation excludes fallback dishes by construction.
- It excludes recipes the player cannot fully make.
- It excludes recipes above the five-unit selection cap.

Manual visual verification is required because this changes visual state and animation. Ask before opening Playwright, run `npm run dev`, navigate to a campfire with ingredients, and capture screenshots showing:

- initial valid ingredient glows;
- pruned highlights after one selection;
- fireplace pulsing once a real recipe is complete.

## Non-Goals

This feature should not:

- Change how cooking resolves selected ingredients.
- Remove fallback cooking.
- Reveal undiscovered recipe names, effects, or dish outcomes.
- Edit `data/dictionary.json`.
- Add new recipe or ingredient content.
- Redesign the Recipes tab beyond ensuring recipe-tab selections participate in the same guidance behavior.

## Acceptance Criteria

The implementation is complete when:

- Campfire state includes anonymous cookable real recipe hints for the current ingredient bag.
- Ingredient cards glow only when valid for at least one complete real recipe path containing the current selection.
- Highlights update immediately when ingredients are selected or deselected.
- The fireplace loops a ready pulse only when the current selection can produce a real recipe.
- Stronger recipe extensions remain highlighted after a smaller recipe is already complete.
- Fallback recipes never cause ingredient glow or fireplace ready pulse.
- Focused unit tests cover the matching rules and UI class behavior.
- Manual visual verification confirms the glow pruning and fireplace pulse are visible in the campfire UI.
