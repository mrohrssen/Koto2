# Shrine Room Encounter Design

## Goal

Bring shrine rooms back as a normal run encounter that happens during PixiJS parallax walking. The shrine should feel like a friendly NPC-style room: a sprite slides in, speaks one short i+1 greeting, then presents three reward choices.

Do not reuse the old shrine layout, old shrine background swap, or hub-style exploration framing. The shrine is a regular room encounter inside the walking flow.

## Room Frequency

Shrines are a support room type in the normal room pool with a 5% spawn chance. They should sit alongside existing non-combat support rooms such as friendly NPC and whack-a-mole rooms, while preserving scripted boss and NPC battle slots.

Existing saved shrine rooms remain valid. New shrine rooms use the modern encounter flow.

## Encounter Flow

When the player enters a shrine room:

1. The game transitions into an `ExplorationScene` using the current parallax area layers.
2. A temporary shrine NPC sprite slides into the scene using `public/assets/sprites/shrine_fox.webp` for now.
3. The shrine NPC displays a short static dialogue card selected through the i+1 frame pipeline.
4. The action area shows three modern choice cards:
   - Heal all creatures by 50%.
   - Restore MP for all creatures.
   - Level up one creature.
5. After the player chooses and the reward is applied, the room is marked complete and returns to the normal completed-room auto-proceed behavior.

The Pixi NPC sprite is scene-owned and should be cleaned up by the normal room transition lifecycle, matching friendly NPC rooms.

## Reward Rules

Rewards apply to active party creatures plus reserves.

Heal all creatures by 50%:
- Only living creatures with `hp > 0` are affected.
- Each affected creature heals by `floor(maxHp * 0.5)`.
- Healing is capped at `maxHp`.
- Fainted creatures remain at `0 HP`.

Restore MP for all creatures:
- Only living creatures with `hp > 0` are affected.
- Each affected creature is restored to `maxMp`.
- Fainted creatures do not receive MP recovery.

Level up one creature:
- The player chooses one living active or reserve creature.
- Fainted creatures are not selectable.
- The level-up uses the same XP/stat progression as existing shrine level-up behavior.
- The reward must not revive a fainted creature through HP stat gains.

Each shrine can grant exactly one reward. Re-entering or refreshing an already completed shrine room should not allow a second reward.

## Dialogue

Add a new static dialogue frame category for shrine greetings rather than reusing shop greetings. The greeting pool should be beginner-friendly and focus on high-impact Japanese words, for example:

- `こんにちは！`
- `元気ですか？`
- `いい日ですね！`
- `少し休みますか？`

The exact lines must be authored in `data/dialogue/frame-sources.json`, regenerated into `data/dialogue/frames.json`, and validated through the existing dialogue pipeline. No hand-edits to `frames.json`.

The frontend should render the selected frame through `showNpcDialogueCard()` with token data when available, falling back only to a minimal safe greeting if no frame is returned.

## API And State

Keep the shrine as a room phase, but replace the old single-purpose shrine upgrade contract with modern shrine room actions.

Server behavior:
- Provide an idempotent endpoint to fetch shrine greeting/options for the current shrine room.
- Provide an endpoint to choose a shrine reward.
- For level-up, accept a creature identifier only after the player has selected that option.
- Mark `room.shrine.completed = true` and `room.interacted = true` after a successful reward.

Frontend behavior:
- Replace `renderShrine()` with an encounter-style renderer that mirrors `renderFriendlyNpc()`: per-room state guard, sprite slide-in, dialogue card, then choice cards.
- Use modern `renderChoices()` cards rather than the old shrine creature roster layout.
- For level-up, render a second target-selection step using the same choice-card pattern.

## Testing

Unit coverage should include:

- Room generation includes shrine at a 5% support-room chance without replacing scripted boss or NPC battle slots.
- Shrine reward endpoint applies HP and MP rewards to active plus reserve living creatures only.
- Shrine level-up rejects or omits fainted creatures.
- A completed shrine cannot be claimed twice.
- `renderShrine()` shows a dialogue card before choices and uses the active scene's NPC sprite layer.

Manual verification should use the dev server and browser only after asking before opening Playwright. Because this is a visual/Pixi encounter change, completion requires screenshots showing the shrine sprite in the parallax walking scene and the three reward choices in the action area.
