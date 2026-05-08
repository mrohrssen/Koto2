# Campfire Cooking UI Polish Design

**Date:** 2026-05-08  
**Status:** Approved in chat, awaiting implementation plan  
**Scope:** Replace the current plain-text campfire cooking controls with a fusion-inspired scene preview and compact ingredient/recipe cards.

## Goal

The campfire cooking screen should feel like a proper game interaction rather than a plain text list. It should borrow the elegance of the Fusion Lab while staying practical for selecting up to five run-scoped ingredient units.

The approved direction combines:

- The top `scene-area` from the first visual mockup: campfire scene plus five selected ingredient slots.
- The ingredient and recipe cards from the second visual mockup: compact, icon-first cards in the `action-area`.
- English UI chrome for the tab labels and primary cooking button.

## User-Facing Requirements

Ingredients tab:

- The tab label is `Ingredients`.
- The top scene shows a campfire and a five-slot cooking tray.
- Each selected ingredient slot shows:
  - ingredient image/icon when available;
  - kanji text fallback when the image is missing;
  - the ingredient name rendered through `renderJpSentence`, so it displays the same English/hiragana/romaji treatment as other learned vocabulary UI.
- The action area shows compact ingredient cards in a dense grid.
- Each ingredient card shows:
  - icon/image first, with kanji fallback;
  - rendered Japanese name through `renderJpSentence`;
  - selected/owned count, for example `1/3`.
- The main action button says `Cook`.
- The button is disabled unless 1-5 ingredient units are selected.

Recipes tab:

- The tab label is `Recipes`.
- Discovered recipes use the same card language as ingredient cards.
- Each recipe card shows:
  - dish icon/image first, with kanji fallback;
  - recipe name rendered through `renderJpSentence`;
  - ingredient requirement pills, using Japanese ingredient words where space allows;
  - an English availability badge such as `Ready` or `Need`.
- Selecting a recipe fills the top scene slots with that recipe's ingredient requirements, sets `activeTab` to `Ingredients`, and redraws the ingredient cards with the recipe quantities selected.
- Recipe card badges and any recipe action text use English labels.

Cooked dish result:

- After cooking, preserve the existing flow: show the dish, effect summary, and target creature selection.
- The result view should visually align with the new card language, but this pass does not need to redesign target selection beyond avoiding a jarring return to plain text.

## Rendering Rules

Ingredient and recipe names must use the existing Japanese rendering pipeline rather than handcrafted markup:

- Import `renderJpSentence` and `getKnownWords` from `public/js/ui/bootstrap-client.js`.
- Render an ingredient by adapting it to an entity token shape and passing it to `renderJpSentence(..., getKnownWords(), new Map())`.
- Do the same for recipes/dishes when their data has `word`, `reading`, and `nameEn`/`meaning`.
- Keep the existing `useKanji = false` behavior unless the surrounding area explicitly uses kanji mode.

Icon fallback should follow the existing item sprite pattern:

- Prefer an HTML helper that points at an ingredient/item sprite URL based on the ingredient id.
- On image load failure, replace the image with a `.text-sprite` or campfire-specific text-sprite using the ingredient `word`.
- Do not require new art assets for this implementation; missing assets must fall back cleanly to kanji.

## Layout

The screen keeps the live game frame:

- `scene-area` remains the top visual region.
- `action-area` remains the interactive lower region.

Scene area:

- Add a campfire-specific overlay, similar in spirit to `fusion-lab-scene`, but scoped to the campfire room.
- Use a warm campfire background, central fire/pot visual, and a translucent selected-slot panel near the bottom of the scene.
- Show exactly five slot positions because cooking accepts 1-5 ingredient units.
- Empty slots use English placeholders such as `Slot 3`.

Action area:

- Keep the existing campfire panel/tabs structure, but replace the plain row list with compact cards.
- Use a three-column grid when the action area has enough width.
- Each card must remain tappable with clear selected state.
- Counts must update immediately when the player taps a card.
- Keep the existing selection behavior: tapping increments selected count until owned count or five total selected units, then wraps/removes when maxed.

## Data Flow

No API or server behavior changes are required.

The frontend still consumes:

- `campfireState.ingredients`
- `campfireState.ingredientCatalog`
- `campfireState.discoveredRecipes`
- `campfireState.room.cookedDish`

The UI continues to call:

- `callbacks.apiGetCampfire()`
- `callbacks.apiCookAtCampfire(ingredients)`
- `callbacks.apiFeedCampfireDish(targetIndex)`

## Testing

Frontend unit coverage should be updated in `tests/unit/ui/campfire.test.js`:

- Ingredients and Recipes tab labels render in English.
- The Cook button label renders in English and remains disabled for zero or more than five selected ingredient units.
- Ingredient cards render an icon/fallback region.
- Ingredient names render as Japanese-rendered HTML rather than plain escaped `word` plus `nameEn`.
- Selected ingredients appear in the scene slot preview.
- Recipes render with English `Ready`/`Need` style labels and rendered recipe names.

Manual visual verification is required after implementation because this is a visual UI change. Ask before opening Playwright, run the dev server with `npm run dev`, and capture a screenshot of the campfire screen showing the new scene slots and compact cards.

## Non-Goals

This pass should not:

- Change cooking mechanics, recipes, ingredient drops, or API contracts.
- Add new ingredient data or edit `data/dictionary.json`.
- Require new sprite assets.
- Redesign the full target creature feeding flow beyond keeping it visually compatible.
- Change Fusion Lab behavior.

## Acceptance Criteria

The implementation is complete when:

- The campfire screen uses a fusion-inspired scene preview with five cooking slots.
- Ingredient and recipe tabs are labeled `Ingredients` and `Recipes`.
- The primary cooking action is labeled `Cook`.
- Ingredient and recipe cards use icon/image first, kanji fallback second.
- Ingredient and recipe names are rendered through `renderJpSentence`.
- Existing campfire behavior and tests still pass.
- Focused campfire UI tests cover the new labels, rendered names, and slot preview.
- Manual visual verification confirms the screen matches the approved composite direction.
