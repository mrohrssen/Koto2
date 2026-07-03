# Tiered Optimistic Game Actions Design

> **Status 2026-07-03:** this doc carries the 2026-06-03 implementation audit inline. For explore-mode room actions, the per-action optimistic commit contract has since been subsumed by the explore session log (`2026-06-15-explore-session-runway-sync-design.md` → `2026-07-03-explore-subway-stability-design.md`). The persisted action ledger remains the idempotency mechanism. Hub/meta migrations listed under "Still Needed" remain open and are NOT part of the explore subway arc.

## Goal

Make player actions throughout Koto feel as fast as the new optimistic combat turns while keeping server-side validation authoritative for anti-cheat and data integrity.

The design uses four action patterns:

- Predictive combat: the client predicts exact combat outcomes and the server verifies the prediction.
- Server-prepared reveal buffer: the server prepares the run spine and sends a small rolling window so room travel can advance instantly without exposing the full future run.
- Optimistic commit: the client immediately reflects the player's intent and later reconciles with the authoritative server state.
- Confirmed save: the UI stays locally responsive, but it does not claim final success until the server confirms.

The player-facing rule is simple: optimistic actions should be silent on the happy path. Only failures that require user action should show copy, and the copy should not imply the player did something wrong.

## Current Optimistic Actions

Status note: this section reflects the implementation audit on 2026-06-03.

Predictive combat optimism:

- PvE creature combat attacks, including action-cursor move and target choices.
- Kanji Kombat quiz answer turns.

These use shared deterministic combat logic, seed, state version, and transcript hash verification.

PvE creature combat defend optimism is only partially current. The optimistic builder still supports legacy non-action-cursor defend turns, but normal creature encounters now initialize an action cursor and cursor-based defend prediction is not yet enabled.

Optimistic run commits:

- Room proceed through the server-prepared reveal buffer.
- Shrine reward choice.
- Skill Master skill choice, including tutorial and initial skill pick.
- Friendly NPC item choice, including target selection.
- NPC battle skill reward choice.
- Post-combat shop item selection wiring.

These use an action ID and local draft state, then reconcile with server `accepted` or `corrected` responses.

Post-combat shop selection is wired through the optimistic route, API, UI, and tests, but the live shop roll path appears dormant or mismatched. Treat it as partial until the generated offer source and selection source are aligned.

Server-prepared reveal buffer:

- Client state exposes `revealedRooms` and `roomActionSeq`, not the full `run.rooms` array.
- The default reveal window is current room plus one future room.
- Proceed sends `actionId`, `fromRoom`, and `actionSeq`, starts buffered travel immediately, and reconciles to server state.

The core reveal-buffer proceed path is implemented. Some edge paths still need work: room-specific completion/recovery paths that call bare `apiProceed()`, area-complete continue semantics, and start-encounter transition feedback before the encounter API returns.

Confirmed save:

- PvP team save shows `Saving team...`, then `Team saved!` only after server confirmation.
- Failure copy is `Team was not saved. Your draft is still here.`

Matchmaking still needs to be updated to use only server-confirmed saved teams; the current lobby path can still pass browser-sent `teamData` into match selection.

Creature dealer buy/sell actions also have optimistic wiring today, but the creature dealer is not currently used in the game. They are out of scope for this rollout and do not need additional planning or migration work.

Older local optimism:

- Speed Review card swipes advance immediately with an undo window. Room-mode commits are serialized and retried before completion.

Medium-risk room, learning, and minigame flows are mostly still legacy or older local optimism. Campfire, Word Discovery completion/progress, Speed Review room completion, Whack-a-Mole completion/skip, and Kanji Kombat intro/completion choices still need the optimistic commit contract if they remain in scope.

## Implementation Status

### Completed

- Persisted action ledger service for migrated optimistic actions, including old-ledger migration, response cloning, pruning, and duplicate `actionId` replay.
- Shared route helper for legacy responses, accepted optimistic responses, corrected optimistic responses, duplicate replay, mismatched duplicate correction, and save-failure rollback.
- Optimistic deterministic choices for Skill Master, shrine rewards, friendly NPC item choices, and NPC battle skill rewards.
- Core server-prepared reveal-buffer proceed flow: current/next-only client exposure, `roomActionSeq`, `fromRoom` validation, duplicate proceed protection, buffered client transition, and server reconciliation.
- PvE attack and Kanji Kombat quiz-answer predictive combat using shared deterministic resolvers, seed, state version, action ID, and transcript hash verification.
- Combat return-to-control polish for the main optimistic attack path: arbitrary fixed `600ms` control-gating waits are removed or reduced, and control waits on playback plus server verification.
- Safe enemy final-hit and KO visual prediction for supported PvE cases while stripping server-owned reward/progression fields from local visual transcripts.
- Confirmed-save PvP team save feedback.
- Local-only draft controls for move targeting, campfire ingredient selection, fusion recipe tile selection, chest element tabs, and starter/team drafting.

### Partial

- Post-combat shop item selection has optimistic wiring, but the live offer source should be fixed or re-enabled before treating it as complete.
- Server-prepared reveal buffer is complete for the main proceed path, but not yet complete for every room-completion path, area-complete continue flow, or start-encounter transition feedback.
- PvE defend prediction is partial because cursor-era defend actions are not predicted.
- Combat pending end is partial: local transcripts can mark `pendingCombatEnd`, but there is no visible pending victory/defeat shell before server confirmation.
- Ally defeated summary prediction is still limited by safe-prediction blockers such as KO swaps/removals.
- Daily crystal claim is server-authoritative and naturally once-per-day idempotent, but it is not an optimistic/action-ledger flow.
- Chest open, crest equip/unequip, fusion start, and tutorial fusion actions are server-authoritative and conservative, but not optimistic/action-ledger flows.

### Still Needed

- Migrate medium-risk optimistic commits:
  - Campfire cook, feed dish, and skip.
  - Word Discovery review/progress commits and completion.
  - Speed Review room completion.
  - Whack-a-Mole skip and completion.
  - Kanji Kombat intro known/unknown choice and completion keep-going/stop choice.
- Migrate high-impact hub/meta optimistic commits:
  - Daily crystal claim.
  - Chest open, with immediate opening animation but delayed crest reveal.
  - Crest equip and unequip.
  - Fusion start.
  - Tutorial fusion core claim and tutorial fusion completion.
- Add duplicate `actionId` idempotency for every action that spends, awards, reveals, advances room state, or mutates persistent/meta state.
- Make PvP matchmaking load confirmed server-saved teams instead of trusting browser-sent `teamData`.
- Implement cursor-era PvE defend prediction or document that defend is intentionally server-confirmed.
- Add a visible pending victory/defeat shell for optimistic terminal combat turns, or update this spec if the intended behavior is only final-hit/KO playback while awaiting verification.
- Add focused tests for skipped/future/out-of-order reveal-buffer proceeds, setup endpoint reveal buffers, remaining optimistic routes, hub/meta duplicate protection, PvP tampered-team rejection, and chest/fusion reveal timing.

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

Duplicate `actionId`s must be idempotent for any action that spends, awards, reveals, advances room state, or mutates persistent/meta state. This includes crystals, chests, fusion, rewards, inventory, room advancement, and any future persistent progression actions.

The first implementation has added a persisted action ledger for migrated run actions. Continue applying it to every high-impact action where a reload, retry, or duplicate request could otherwise double-spend, double-award, or reveal a different outcome.

## Coverage

### Add Server-Prepared Reveal Buffer

Run setup:

- Start run.
- Select area.
- Confirm creatures / starter team.
- First-run auto setup.

Status: setup endpoints now return enriched/sanitized state, but add focused tests that assert reveal-buffer presence for each setup path.

Run spine / reveal buffer:

- Proceed through rooms using server-prepared room data.
- Completed-room auto-proceed.
- Area-complete continue.
- Room transition travel animations.
- Start encounter where the immediate UX is only transition/start feedback. Exact combat outcomes remain predictive combat.

Status: the main proceed and room-transition path is implemented. Remaining work is to convert or justify room-specific bare `apiProceed()` paths, add skipped/future/out-of-order proceed tests, decide area-complete continue semantics, and add immediate start-encounter transition/start feedback if that remains required.

### Add Optimistic Commit

Reward and item choices:

- Post-combat shop item selection.
- Shrine reward choice.
- Skill Master choice.
- NPC battle skill reward choice.
- Friendly NPC item choice.

Status: shrine, Skill Master, NPC battle skill reward, and friendly NPC item choice are complete. Post-combat shop selection is wired but partial until its live offer source is fixed or re-enabled.

Campfire:

- Cook.
- Feed dish.
- Skip.

Status: not migrated.

Learning and minigames:

- Word Discovery review/progress commits.
- Word Discovery completion.
- Speed Review room completion.
- Whack-a-Mole skip.
- Whack-a-Mole completion.
- Kanji Kombat intro known/unknown choice.
- Kanji Kombat completion keep-going/stop choice.

Status: not migrated to optimistic commits. Speed Review and Word Discovery have older local optimism/retry behavior, but not the action-ledger accepted/corrected contract.

Hub and meta actions:

- Daily crystal claim.
- Chest open.
- Crest equip.
- Crest unequip.
- Fusion start.
- Tutorial fusion core claim.
- Tutorial fusion completion.

Status: not migrated to optimistic commits. Daily crystals are naturally once-per-day idempotent; chest/fusion reveal timing is conservative; none of these use the persisted optimistic action ledger yet.

### Keep Predictive Combat

- Existing PvE attack.
- Existing PvE defend, partial until cursor-era defend prediction is implemented or explicitly de-scoped.
- Existing Kanji Kombat quiz answer.

Recent predictive-combat polish removed or reduced fixed post-turn dead-air delays from the main optimistic attack path. Combat should continue to return control as soon as local playback is finished and the server has accepted or corrected the prediction. If the server has already confirmed during animation playback, move selection should return immediately. If playback finishes first, the only remaining wait should be for server verification/correction. Animation-owned waits such as attack impacts, KO fades, and readable transition promises can remain, but arbitrary `600ms` control-gating pauses should stay out of control-return paths.

The same combat polish phase partially expanded safe visual prediction for final-hit moments:

- Final-hit and KO visuals can be predicted locally for supported safe cases: show the hit, HP reaching 0, and KO animation immediately, then let the server confirm or correct.
- Enemy defeated state summaries can be reflected visually when the shared resolver predicts enemy HP at 0.
- Ally defeated state summaries still need care around KO swaps/removals.
- Combat end can mark a local `pendingCombatEnd`, but a visible pending victory/defeat shell is still needed if this remains part of the desired UX. XP, rewards, room completion, move-learn prompts, shop state, and permanent progression must wait for server confirmation.

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

Original implementation constraints made the reveal buffer a real architecture change, not a small UX patch. Current status:

- `GameManager.getState()` no longer exposes full `run.rooms` to the client.
- Area entry still generates the server-side room list before play begins, with future flexible slots represented as unresolved `randomRoom` placeholders.
- Support and random rooms are still finalized server-side before entering the reveal window, including when state preparation refreshes the reveal buffer.

The remaining reveal-buffer work must preserve narrowed client exposure, preserve server-side room finalization, and prevent future room/reward inspection while tightening edge flows and tests.

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
- Persist action ledger entries for actions that spend, award, reveal, advance rooms, or mutate persistent/meta state.
- Keep validation in existing services where possible.
- Return authoritative state after every optimistic response.
- Return a refreshed reveal buffer after accepted room-spine commits.
- Make duplicate action IDs idempotent for every high-impact action class.

The implementation should not introduce a giant centralized action registry in the first pass. Koto's UI is already split by gameplay module, so each module should define its own small local draft behavior while sharing the same helper and response contract.

## Rollout Plan

Implement in focused batches:

1. Done: harden the shared optimistic action contract, standard failure copy, and persisted idempotency ledger.
2. Done/partial: migrate already-known deterministic choices. Skill Master, shrine, friendly NPC item, and NPC battle skill reward are done; post-combat shop item selection is wired but needs the live offer source fixed or re-enabled.
3. Partial: add confirmed-save PvP team UX. Save feedback is done; matchmaking must still use only confirmed server-saved teams.
4. Partial: tighten combat responsiveness. Main attack-path delay removal and safe enemy KO prediction are done; cursor-era defend prediction and visible pending combat-end shell remain.
5. Next: migrate medium-risk room-adjacent choices: campfire, Word Discovery completion/progress, Speed Review room completion, Whack-a-Mole completion/skip, and Kanji Kombat intro/completion choices.
6. Core done/edge cleanup: build server-prepared reveal-buffer travel. Main proceed and buffered transition are done; room-specific proceed paths, setup tests, area-complete semantics, and start-encounter feedback remain.
7. Later: migrate high-impact hub/meta actions last: daily crystals, chest open, crest equip/unequip, fusion start, and tutorial fusion actions.

Each batch should keep legacy no-`actionId` behavior working so routes remain backwards-compatible during rollout.

Risk order:

- Low risk: PvP confirmed-save UX, failure-copy cleanup, local-only controls, and already-known deterministic choice flows.
- Medium risk: Campfire, Word Discovery, Speed Review room completion, Whack-a-Mole, and NPC battle skill rewards.
- Medium-high risk: Hub/meta actions such as daily crystals, chests, crests, and fusion.
- High risk: Reveal-buffer room spine, especially area-complete routing, room sequence validation, random/support room finalization, and not exposing future content.

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
- Duplicate `actionId`s are idempotent for spending, award, reveal, room-advance, and persistent/meta mutation actions.
- Each optimistic route keeps legacy response shape without `actionId`.
- Each optimistic route returns accepted response with `actionId`.
- Each optimistic route returns corrected response with authoritative state on validation failure.
- Spending, reward, reveal, room-advance, and persistent/meta mutation routes do not double-apply duplicate action IDs.

UI tests:

- Room transition starts immediately from buffered room data.
- Room transition reconciles to the refreshed server buffer after accepted proceed.
- Optimistic combat move selection returns as soon as playback and verification are both complete.
- Optimistic combat does not wait on fixed `600ms` post-turn delays when verification has already completed.
- Slow server verification can still hold move selection until accepted/corrected state arrives.
- Optimistic final-hit playback can show predicted HP reaching 0 and KO animation before server confirmation.
- Optimistic combat-end playback can show a pending victory/defeat shell but does not grant XP, rewards, room completion, or move-learn prompts until accepted server state arrives.
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
