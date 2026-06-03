# Tiered Optimistic Game Actions Design

## Goal

Make player actions throughout Koto feel as fast as the new optimistic combat turns while keeping server-side validation authoritative for anti-cheat and data integrity.

The design uses four action patterns:

- Predictive combat: the client predicts exact combat outcomes and the server verifies the prediction.
- Server-prepared reveal buffer: the server prepares the run spine and sends a small rolling window so room travel can advance instantly without exposing the full future run.
- Optimistic commit: the client immediately reflects the player's intent and later reconciles with the authoritative server state.
- Confirmed save: the UI stays locally responsive, but it does not claim final success until the server confirms.

The player-facing rule is simple: optimistic actions should be silent on the happy path. Only failures that require user action should show copy, and the copy should not imply the player did something wrong.

## Current Optimistic Actions

Koto already has two optimistic systems.

Predictive combat optimism:

- PvE creature combat attacks, including move and target choices.
- PvE creature combat defend turns.
- Kanji Kombat quiz answer turns.

These use shared deterministic combat logic, seed, state version, and transcript hash verification.

Optimistic run commits:

- Room proceed when the next room already exists locally.
- Shrine reward choice.
- Skill Master skill choice, including tutorial and initial skill pick.
- Friendly NPC item choice, including target selection.

These use an action ID and local draft state, then reconcile with server `accepted` or `corrected` responses.

Creature dealer buy/sell actions also have optimistic wiring today, but the creature dealer is not currently used in the game. They are out of scope for this rollout and do not need additional planning or migration work.

Older local optimism:

- Speed Review card swipes advance immediately with an undo window. Room-mode commits are serialized and retried before completion.

## Action Patterns

### Predictive Combat

Use this when the client must show the exact resulting outcome before the server replies.

Predictive combat is appropriate when an action has meaningful derived consequences such as damage rolls, KOs, status ticks, enemy responses, skill triggers, reward branches, or combat end state.

The client:

1. Builds a predicted transcript using shared deterministic logic.
2. Sends action ID, combat ID, state version, seed, payload, and predicted hash.
3. Plays the predicted transcript immediately.
4. Reconciles after the server accepts or corrects.

The server:

1. Validates combat ID, state version, and seed against canonical state.
2. Recomputes the turn.
3. Accepts matching predictions.
4. Returns authoritative correction when validation or hash matching fails.

### Optimistic Commit

Use this for deterministic or low-regret game actions where the client only needs to show the player's intent immediately, not predict a complex hidden outcome.

The client:

1. Creates a pending action with an `actionId`.
2. Applies a local draft state immediately.
3. Sends the normal endpoint request with the `actionId`.
4. Replaces local state with the server state on success or correction.

The server:

1. Performs the same validation and mutation it would for a normal request.
2. Returns the legacy response shape when no `actionId` is present.
3. Returns `{ status: "accepted", actionId, state }` when the action succeeds with an `actionId`.
4. Returns `{ status: "corrected", actionId, authoritativeState, reason }` when validation fails.

Client local state is never trusted by the server. It is only a preview.

### Server-Prepared Reveal Buffer

Use this for the run spine: room progression, room transitions, and server-derived room content.

This is better than generic optimistic drafting for rooms because the client does not invent the next room locally. The server prepares the canonical run structure, stores it, and sends only the currently allowed reveal window to the client.

The server:

1. Creates the canonical run structure or run seed at run start.
2. Stores the full run truth server-side.
3. Sends the client the current room plus a small next-room buffer.
4. Validates every proceed/room action with `actionId` and a monotonic action sequence.
5. Rejects skipped, duplicated, stale, or out-of-order commits.
6. Refreshes the next reveal buffer after each accepted commit.

The client:

1. Uses the reveal buffer to animate room transitions immediately.
2. Sends the proceed/action commit in the background.
3. Never sees the full future run or unrevealed future rewards.
4. Reconciles to the server state and refreshed buffer after each accepted commit.

The reveal buffer is for latency, not authority. The server still decides which room exists, which action is legal, and which rewards are committed.

### Confirmed Save

Use this when a false success state would feel like lost progress.

PvP team saving belongs here. The editor can be instant while the player arranges the team, but the final save button should show `Saving team...` and only show `Team saved!` after the server validates and stores the canonical team.

Matchmaking must use only confirmed server-saved teams.

## Data Flow

Reveal-buffer room flow:

1. Server starts a run and stores the canonical run structure.
2. Server returns current room data plus a limited reveal buffer, such as the next room or next few rooms.
3. Player taps proceed.
4. Client starts the room transition immediately using buffered data.
5. Client sends `actionId`, run action sequence, current room index, and requested proceed action.
6. Server validates sequence, room index, phase, action order, and canonical run state.
7. Server commits the room advance.
8. Server returns accepted/corrected state plus the refreshed reveal buffer.
9. Client replaces local state with authoritative state and buffer.

Optimistic commit flow:

1. Player taps an action.
2. UI disables repeat taps for that action.
3. Client applies the local draft and advances the view immediately.
4. Client sends the action with `actionId`.
5. Server validates against canonical state.
6. Server saves authoritative state.
7. Server returns accepted or corrected state.
8. Client replaces local state with authoritative state.

If the network fails:

1. Client attempts to fetch `/api/game/state`.
2. If state is available, client reconciles to it.
3. If state is unavailable, client leaves the player on a stable screen and relies on the existing connection banner/retry affordance.
4. If the player must repeat a choice, show explicit retry copy.

Duplicate `actionId`s should be idempotent where practical, especially for spending, reward, and inventory actions.

## Coverage

### Add Server-Prepared Reveal Buffer

Run setup:

- Start run.
- Select area.
- Confirm creatures / starter team.
- First-run auto setup.

Run spine / reveal buffer:

- Proceed through rooms using server-prepared room data.
- Completed-room auto-proceed.
- Area-complete continue.
- Room transition travel animations.
- Start encounter where the immediate UX is only transition/start feedback. Exact combat outcomes remain predictive combat.

### Add Optimistic Commit

Reward and item choices:

- Post-combat shop item selection.
- Shrine reward choice.
- Skill Master choice.
- NPC battle skill reward choice.
- Friendly NPC item choice.

Campfire:

- Cook.
- Feed dish.
- Skip.

Learning and minigames:

- Word Discovery review/progress commits.
- Word Discovery completion.
- Speed Review room completion.
- Whack-a-Mole skip.
- Whack-a-Mole completion.
- Kanji Kombat intro known/unknown choice.
- Kanji Kombat completion keep-going/stop choice.

Hub and meta actions:

- Daily crystal claim.
- Chest open.
- Crest equip.
- Crest unequip.
- Fusion start.
- Tutorial fusion core claim.
- Tutorial fusion completion.

### Keep Predictive Combat

- Existing PvE attack.
- Existing PvE defend.
- Existing Kanji Kombat quiz answer.

### Use Confirmed Save

- PvP team save.

### Keep Local Only

These interactions should remain local until a separate commit action happens:

- Picking a move before target selection.
- Highlighting or selecting cards before confirmation.
- Selecting campfire ingredients.
- Selecting a fusion recipe tile.
- Selecting a chest element tab.
- Drafting a starter/team selection before pressing confirm.

## Random Reveals

Some actions reveal random or server-derived results. The client should not reveal exact results before the server confirms unless those results were server-prepared.

Examples:

- Chest open can start the opening animation immediately, but it should reveal the real crest only after the server returns.
- Room generation should use the server-prepared reveal buffer. Travel can start immediately from buffered room data, but the client should not receive the full future run.
- Post-combat shop roll remains server-derived; item selection can be optimistic once the offered items are already known.
- Fusion can start immediately if the result is deterministic. If fusion ever gains random variants, the reveal must wait for the server or use server-prepared outcome data.

## UX Rules

Optimistic commits are silent on the happy path:

- No "Choosing..." message.
- No "Syncing..." message during normal success.
- No "Synced with server" message after success.

The UI should just advance.

Only show copy when failure requires user action.

Failure copy should be direct and non-blaming:

- `Skill choice did not save. Please choose again.`
- `Reward choice did not save. Please choose again.`
- `Item choice did not save. Please choose again.`
- `Campfire choice did not save. Please try again.`
- `Chest did not open. Please try again.`
- `Fusion did not start. Please try again.`
- `Team was not saved. Your draft is still here.`

Avoid validation-flavored or player-blaming copy:

- Do not say `Invalid choice`.
- Do not say `That reward is no longer available`.
- Do not say `Could not enter that room`.
- Do not say `Synced with the server` unless a future flow needs explicit sync status for debugging.

Confirmed-save copy is different because the UI intentionally waits for server confirmation:

- PvP team save starts with `Saving team...`.
- PvP team save success says `Team saved!`.
- PvP team save failure says `Team was not saved. Your draft is still here.`

## Anti-Cheat And Validation

Every state-changing endpoint remains server-authoritative.

For optimistic commits and reveal-buffer commits, the submitted client payload is only a requested action. The server must validate:

- The user owns any referenced creature, item, crest, or team member.
- The action is legal in the current phase and room.
- The run action sequence is monotonic and matches canonical server state.
- The current room index and requested room transition match the server's run spine.
- The target indices and IDs are valid for canonical state.
- Costs can be paid from canonical balances.
- Rewards, inventory, collection, and progression mutations are derived by server services.
- PvP teams are stored as normalized snapshots built from server-owned records, not trusted client creature objects.

Optimistic UI never creates durable state unless the server accepts and saves it.

## Architecture

The room progression architecture should use a server-prepared rolling reveal buffer instead of a generic local draft wherever possible.

Reveal-buffer responsibilities:

- Server stores the full run structure or deterministic seed as canonical state.
- Server sends only the current reveal window to the client.
- Client can render and transition through buffered rooms instantly.
- Client commits progress with `actionId` and action sequence.
- Server validates sequence, room index, action legality, and reward commitment before refreshing the buffer.

The existing `public/js/ui/optimistic-run-action.js` should become the standard helper for non-combat optimistic commits.

Client responsibilities:

- Create action IDs.
- Clone current state.
- Apply local draft state.
- Lock repeat taps while pending.
- Reconcile accepted/corrected responses.
- Roll back or re-render when a retry is required.

API responsibilities:

- Accept optional `{ actionId }` on optimistic-capable endpoints.
- Use a bypass loading gate for action verification requests where duplicate endpoint deduplication would be harmful.
- Preserve legacy response shapes when no `actionId` is present.

Server responsibilities:

- Add shared route helpers for accepted and corrected optimistic responses.
- Add run-spine helpers for reveal-buffer responses and action-sequence validation.
- Keep validation in existing services where possible.
- Return authoritative state after every optimistic response.
- Return a refreshed reveal buffer after accepted room-spine commits.
- Make duplicate action IDs idempotent where practical.

The implementation should not introduce a giant centralized action registry in the first pass. Koto's UI is already split by gameplay module, so each module should define its own small local draft behavior while sharing the same helper and response contract.

## Rollout Plan

Implement in focused batches:

1. Strengthen the shared optimistic action helper and standard failure copy.
2. Add server-prepared reveal-buffer support for the run spine.
3. Migrate run setup and room transitions onto the reveal buffer.
4. Migrate reward, item, and campfire choices.
5. Migrate learning and minigame commits.
6. Migrate hub and meta actions.
7. Add confirmed-save PvP team UX.

Each batch should keep legacy no-`actionId` behavior working so routes remain backwards-compatible during rollout.

## Testing

Unit tests:

- Optimistic helper accepted response.
- Optimistic helper corrected response.
- Network failure handling.
- Duplicate tap prevention.
- Stale action response ignored.

Route tests:

- Reveal-buffer proceed accepts correct action sequence and room index.
- Reveal-buffer proceed corrects stale, duplicate, skipped, or out-of-order room commits.
- Reveal-buffer responses expose only the intended current/next room window.
- Each optimistic route keeps legacy response shape without `actionId`.
- Each optimistic route returns accepted response with `actionId`.
- Each optimistic route returns corrected response with authoritative state on validation failure.
- Spending and reward routes do not double-apply duplicate action IDs where idempotency is implemented.

UI tests:

- Room transition starts immediately from buffered room data.
- Room transition reconciles to the refreshed server buffer after accepted proceed.
- Skill choice advances silently on success.
- Failed skill choice returns to choice UI and shows `Skill choice did not save. Please choose again.`
- Reward and item failure copy uses the approved "did not save" pattern.
- PvP team save shows `Saving team...`, then `Team saved!` after server confirmation.
- PvP team save failure keeps the draft visible.

Manual playtest:

- Room transitions.
- Skill choice.
- Shrine or reward choice.
- Post-combat shop item choice.
- Campfire cook/feed/skip.
- Chest open reveal timing.
- PvP team save.

Visual changes must be verified with screenshots before reporting implementation complete.
