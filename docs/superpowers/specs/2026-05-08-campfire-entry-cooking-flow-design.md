# Campfire Entry Cooking Flow Design

**Date:** 2026-05-08  
**Status:** Draft for review  
**Scope:** Add an explicit campfire room entry prompt, campfire scene sprite, and zoomed cooking transition before the existing cooking UI.

## Goal

Cooking rooms should feel like a discovered room interaction instead of an abrupt phase switch. When the player enters a campfire room, they should first see a campfire in the scene where an NPC would normally appear, then choose whether to cook. If they choose to cook, the scene should zoom into that same campfire while keeping the current exploration background. The existing cooking controls remain in the lower action area.

This design extends the existing campfire UI polish direction in `docs/superpowers/specs/2026-05-08-campfire-cooking-ui-polish-design.md`. It does not change cooking recipes, ingredient mechanics, or reward behavior.

## User-Facing Flow

1. The player proceeds into a support room that resolves to a campfire.
2. The scene remains in the exploration room presentation.
3. A transparent pixel-art campfire sprite appears in the same scene position normally used by NPCs or support-room characters.
4. The action area shows an English question header:

   `Would you like to cook?`

5. Below the header are two normal game buttons, matching the simple Game Master yes/no button style:

   - `はい`
   - `いいえ`

6. The `はい` and `いいえ` labels must be rendered with `renderJpSentence`, not inserted as plain text. They should use the existing `gm_yes` and `gm_no` frame token data where possible.
7. If the player chooses `はい`, the current scene stays visible, player creatures and HP bars fade out, and the campfire image moves/zooms into the center of the scene area.
8. The zoomed cooking scene shows the existing five-slot ingredient preview (`Cooking slots`, `0 / 5`, and five ingredient boxes).
9. The existing campfire UI below the scene remains visible and reused, including the ingredient selection area and its ingredient slots/cards. This project is not replacing the cooking module; it is adding a new scene-area presentation and campfire animation around it.
10. The player uses the existing cooking module.
11. When the player chooses `いいえ`, clicks `Skip` inside the cooking module, or finishes by feeding a cooked dish, the campfire fades away, the player creatures fade back in, and the flow immediately proceeds to the next room through the existing proceed path.

## Entry Prompt Rendering

The entry prompt should reuse existing UI helpers. Do not introduce a new shared prompt component or a new choice system.

Recommended structure:

- Render the English header into the existing `action-area`.
- Render the two yes/no buttons with the existing `renderButtons` helper used for simple vertical game buttons.
- Use existing static frame token data for `gm_yes` and `gm_no`.
- Convert those tokens to HTML with `renderJpSentence(..., getKnownWords(), null, overrides, false)`.
- Pass the resulting HTML labels into the existing button renderer.

The header stays English on purpose. Only the yes/no answers are Japanese exposure.

## Campfire Asset

Create a new transparent campfire/fireplace sprite asset for this room.

Requirements:

- Generate the image through the scenario MCP, using the same visual prompt style used for the current creature and scenario sprite work.
- Remove the background through the scenario MCP so the final asset is transparent.
- Store the final runtime asset under the normal public asset tree, for example `public/assets/sprites/objects/campfire.webp` or another existing project-appropriate sprite directory.
- The sprite should read clearly at mobile scale, match the pixel-art game style, and be warm/bright enough to become the focus during the zoomed cooking state.
- If the final asset is a `.webp` served from `public/assets`, bump `SPRITE_VERSION` in `public/js/ui/sprite-utils.js` as part of implementation so browsers do not keep a stale cached image.

## Scene Behavior

Room entry:

- When `playRoomTransition` reaches a campfire room, it should place the campfire sprite through the same scene-owned NPC sprite path used by Shrine Fox, Game Master, dealer, and friendly NPCs.
- The campfire should occupy the NPC/support-object position, not an overlay unrelated to the room.
- The player formation remains visible while the entry question is shown.

Cooking start:

- Choosing `はい` switches the campfire UI from entry prompt state to cooking state.
- The background/parallax scene remains intact.
- The campfire visual animates toward center and scales up. If implementation uses a DOM overlay during cooking, it must visually align with the scene sprite and must not show a second conflicting fire.
- Player creatures and HP bars fade out for cooking focus.
- The five ingredient slots are visible in the scene area immediately after entering cooking mode.
- The existing campfire ingredient UI below the scene also remains visible. The implementation should reuse the current campfire UI structure for ingredient selection, recipes, skip, cook, and dish feeding, changing only the entry prompt plus the scene-area campfire presentation/animation.

Cooking completion:

- `Skip` continues to use the existing campfire skip endpoint.
- Feeding a dish continues to use the existing campfire feed endpoint.
- On any completion path (`いいえ`, `Skip`, or feed), clear the cooking overlay, fade the campfire out, restore player formation visibility, then trigger the same proceed behavior currently used by the normal room `進む` button. This preserves existing room transition, area-complete, ingredient-drop, and end-of-run behavior.

## Data Flow

No new endpoint is required.

The existing campfire state endpoint should include enough label data for the frontend to render the yes/no buttons correctly:

- Add `yesTokens` and `noTokens` to the existing `GET /campfire` response, using the same `getGameMasterYesFrame()` and `getGameMasterNoFrame()` token eligibility path already used by Whack-a-Mole.
- Keep the English header client-owned as static UI copy.
- Continue returning the existing campfire state fields:
  - `ingredients`
  - `ingredientCatalog`
  - `discoveredRecipes`
  - `room`
  - `state`

Frontend campfire UI keeps local display state:

- `entry` before the player chooses yes/no.
- `cooking` after choosing yes.
- Existing cooked-dish state when `room.cookedDish` exists.

This display state is client-only. Server truth remains `room.campfire.completed`, `room.campfire.cookedDish`, and existing skip/feed behavior. After a completion response marks the campfire complete, the frontend should call the existing proceed flow instead of leaving the player on a completed campfire room with a separate proceed button.

## Constraints

- Do not add a new prompt helper or a new shared choice-rendering function for this flow.
- Do not hand-write tokenized Japanese data.
- Do not edit `data/dialogue/frames.json` directly.
- Do not edit `data/dictionary.json`.
- Do not change cooking mechanics, recipe resolution, ingredient drops, or dish effects.
- Do not make cooking a Game Master narration. There is no Game Master speaker for this prompt.
- Keep the question header English: `Would you like to cook?`
- Keep the yes/no buttons visually simple. They are normal game buttons, not cards with subtitles/icons.

## Error Handling

- If `GET /campfire` fails, show a small retry action in the action area rather than dropping the player into a blank cooking UI.
- If token data for `はい` or `いいえ` is unavailable, fall back to the literal Japanese strings only as a last resort and log a warning. The intended path is frame tokens rendered through `renderJpSentence`.
- If the campfire image fails to load, show a minimal text or CSS fallback so the room remains playable.
- If `Skip`, cook, or feed fails, keep the player in the cooking UI and show the existing lightweight error/narration style used by nearby campfire failures.

## Testing

Unit tests should cover:

- Campfire entry initially renders the English header `Would you like to cook?`.
- Entry buttons render `はい` and `いいえ` through `renderJpSentence` output when token data is present.
- Entry buttons are simple button UI, not choice cards with subtitles or icons.
- Choosing `はい` renders the cooking scene with the five-slot ingredient preview.
- Choosing `はい` keeps the existing campfire ingredient UI below the scene visible and functional.
- Choosing `いいえ` calls the existing campfire skip/completion path, then triggers the existing proceed flow.
- Existing ingredient selection, recipe selection, cooking, skip, and feed tests continue to pass.
- The campfire API state includes `yesTokens` and `noTokens`.

Manual verification is required because this is a visual flow:

- Generate and use the transparent campfire asset.
- Run the dev server with `npm run dev`.
- Open the affected room on mobile-sized viewport.
- Capture screenshots for:
  - campfire room entry with campfire sprite, party visible, English header, and rendered `はい` / `いいえ` buttons;
  - cooking zoom state with the campfire centered, party hidden, and five ingredient boxes visible;
  - post-skip or post-feed return/proceed state.

Ask before opening Playwright for manual verification.

## Acceptance Criteria

The design is implemented when:

- Campfire rooms no longer jump directly into the cooking module on entry.
- A generated transparent campfire sprite appears in the scene where NPCs/support objects normally appear.
- The action area asks `Would you like to cook?`.
- The answer buttons are simple game buttons labeled with `renderJpSentence`-rendered `はい` and `いいえ`.
- Choosing `はい` zooms/focuses the campfire in the existing scene area and shows the five ingredient slots.
- The existing campfire ingredient UI below the scene is reused rather than rebuilt.
- Choosing `いいえ`, clicking `Skip`, or completing dish feeding all finish the campfire room and immediately advance through the existing room progression flow.
- Existing cooking behavior remains intact.
- Focused automated tests pass.
- Manual screenshot verification confirms the entry and zoom states.
