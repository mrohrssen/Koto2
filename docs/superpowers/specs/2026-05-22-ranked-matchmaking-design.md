# Ranked Matchmaking

## Overview

Add a ranked auto-queue to Koto's existing PvP system while keeping challenge-code rooms as casual matches. Ranked uses the same Socket.IO match room, team selection, and battle flow as current PvP. The new work is limited to matchmaking, ranked rating persistence, and UI states around entering the queue and showing rating changes.

Player-facing language should use **Ranked Rating**, not Elo. The rating math is powered by the MIT-licensed `openskill` package, which stores skill as `{ mu, sigma }`. Koto displays a simple numeric ladder rating derived from that internal rating so the feature still feels like a familiar ranked ladder.

## Goals

- Let players press **Find Ranked Match** and be paired automatically against a reasonably close opponent.
- Preserve existing casual challenge-code matches and keep them unrated.
- Show the player's Ranked Rating on the multiplayer page.
- Show the latest ranked result and rating transition after a ranked match.
- Reuse the current PvP match lifecycle instead of creating a second battle system.

## Non-Goals

- Named tiers such as Bronze, Silver, or Gold.
- Ranked rewards, seasons, leaderboards, or decay.
- Cross-process matchmaking with Redis or another shared queue.
- Rating changes for challenge-code casual matches.
- Changes to PvP combat math or PvE/PvP combat parity.

## Open Source Rating Choice

Use `openskill` (`philihp/openskill.js`) for rating updates.

Why:

- MIT license permits commercial use.
- Active TypeScript/JavaScript package.
- Handles uncertainty through `sigma`, which is better for new ranked players than fixed classic Elo.
- Supports future team or non-1v1 modes without changing the persisted rating model.

Rejected alternatives:

- `elo-rank`: tiny and MIT-licensed on npm/readme, but classic Elo only and less future-proof.
- `simple-matchmaker` and similar queue packages: small/old and do not map cleanly onto Koto's existing Socket.IO room lifecycle.
- Colyseus ranked queue examples: useful reference, but tied to a framework Koto does not use.

## Ranked Rating Model

Persist OpenSkill's rating data as the source of truth:

```js
meta.pvpRanked = {
  rating: { mu: 25, sigma: 8.333333333333334 },
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  lastMatch: null
};
```

Display rating is derived from `mu`:

```js
displayRating = Math.round(1200 + (mu - 25) * 40);
```

This gives every new ranked player a visible `1200` rating. Wins normally raise the visible number and losses normally lower it, while OpenSkill still uses `sigma` internally to make early ratings adjust faster.

API responses should return `displayRating` for UI convenience, but `{ mu, sigma }` is the persisted source of truth.

## Ranked Match Result Record

After a ranked match finishes, store a compact last-match summary for the multiplayer page:

```js
lastMatch: {
  result: 'win',
  opponentName: 'IllegalIcarus',
  opponentRatingBefore: 1211,
  ratingBefore: 1222,
  ratingAfter: 1240,
  finishedAt: '2026-05-22T04:00:00.000Z'
}
```

For a loss, `result` is `'loss'`. Challenge-code matches do not write `lastMatch`.

Opponent names can be longer than the UI can show. The UI should give the result line flexible width and truncate with ellipsis before it can collide with rating numbers.

## Match Types

### Casual Challenge-Code Matches

Existing create/join code behavior remains casual:

- `Create Casual` creates a 4-character challenge-code room.
- `Join Casual` opens a room-code entry sub-state.
- Casual matches do not read or update Ranked Rating.
- Casual matches still use saved PvP teams, team selection, battle, rematch, leave, and reconnect behavior.

### Ranked Auto-Queue Matches

Ranked matches are only created through **Find Ranked Match**:

- The server checks that the user has at least one saved PvP team.
- The user must not already be queued or in another PvP match.
- The queue pairs two compatible players.
- The server creates a normal PvP match room and marks it `ranked: true`.
- Both sockets join that room and proceed to the existing team-selection flow.
- At match end or forfeit, the server updates both players' ranked records.

## Queue Algorithm

Use a small in-process queue module for the first version:

```js
QueueEntry = {
  userId,
  username,
  socketId,
  rating: { mu, sigma },
  displayRating,
  enqueuedAt
}
```

Matchmaking compares `displayRating`, because that is what players understand.

Search window:

- 0-10 seconds: ±75 rating
- 10-20 seconds: ±150 rating
- 20-40 seconds: ±250 rating
- 40+ seconds: uncapped within the current queue

On each matchmaking tick, scan queued players oldest-first. Pair the oldest player with the closest compatible opponent inside their current window. If multiple opponents qualify, choose the smallest rating gap.

This favors fairness at first, then widens naturally so players do not wait forever.

## Queue Lifecycle

New socket events:

| Event | Direction | Payload | Purpose |
| --- | --- | --- | --- |
| `pvp:ranked-enqueue` | client -> server | none | Enter ranked queue |
| `pvp:ranked-dequeue` | client -> server | none | Leave ranked queue |
| `pvp:ranked-queued` | server -> client | `{ rating, searchRange }` | Confirm queued state |
| `pvp:ranked-queue-update` | server -> client | `{ elapsedMs, searchRange }` | Update widening search display |
| `pvp:ranked-match-found` | server -> client | `{ code, opponentName, opponentRating }` | Queue matched; transition to team select |

After match creation, existing events take over:

- `pvp:opponent-joined`
- `pvp:select-team`
- `pvp:ready`
- `pvp:match-start`
- `pvp:submit-action`
- `pvp:match-end`
- `pvp:match-forfeit`

The match state should include:

```js
ranked: true,
rankedRatingBefore: {
  [player1.userId]: { rating, displayRating },
  [player2.userId]: { rating, displayRating }
}
```

Storing the before-values on the match prevents incorrect rating deltas if user metadata changes while the match is in progress.

## MatchManager Integration

The queue should reuse `MatchManager` instead of duplicating battle state.

Add this helper:

```js
createPairedMatch(player1, player2, options)
```

This should create a match equivalent to `createMatch` followed by `joinMatch`, set usernames, set `ranked`, and return the match code. Existing challenge-code creation can keep using `createMatch`.

The queue must enforce one active PvP context per user:

- A user cannot queue twice.
- A user cannot enter ranked queue while already in a match.
- A user cannot create or join a casual match while queued.
- If a queued socket disconnects, remove it from the queue immediately.
- If a ranked match starts, remove both users from the queue before emitting match-found.

## Rating Update

Only update rating when `match.ranked === true`.

For normal match end:

1. Determine winner and loser from the finished match.
2. Read both players' ranked ratings from the snapshot captured at match start.
3. Call OpenSkill `rate([[winnerRating], [loserRating]])`.
4. Persist the new `{ mu, sigma }` for both users.
5. Increment `wins`, `losses`, and `matchesPlayed`.
6. Store each player's `lastMatch` with rating before/after and opponent info.

For forfeit:

- Treat the non-forfeiting player as the winner.
- Use the same rating update path.
- Store the result as a normal win/loss unless the product later wants a distinct label.

For rematch:

- Ranked rematch should not be available in the first version.
- After a ranked match, the primary action is **Return to Multiplayer**.
- Players can queue again from the multiplayer page.

This avoids abuse where two players repeatedly rematch each other for ranked movement.

## Multiplayer UI

The UI should match the current PvP lobby style:

- Centered narrow stack, max width around the current `340px`.
- Muted small header label.
- White elevated cards/buttons on the existing light background.
- Cyan primary action button.
- Amber rating number.
- Bottom `Back`/`Cancel` buttons following the existing lobby pattern.

### Main Multiplayer Page

Show:

- Header: `PvP Battle Lobby`
- Ranked Rating card:
  - `Ranked Rating`
  - visible numeric rating, e.g. `1240`
  - ranked record, e.g. `8W - 5L`
- Primary button: `Find Ranked Match`
  - Sublabel: `Estimated range: 1165 - 1315`
- Casual actions:
  - `Create Casual`
  - `Join Casual`
- Last ranked match card, when available:
  - `Last Ranked Match`
  - `Victory vs IllegalIcarus` or `Defeat vs IllegalIcarus`
  - `Opponent rating 1211`
  - `1222 -> 1240`
- Bottom button: `Back`

Do not show a redundant `+18` delta. The old-to-new rating line communicates the change.

### Join Casual Sub-State

Clicking `Join Casual` replaces the lobby body with a focused code-entry panel:

- Header: `Join Casual Match`
- Card with `Room Code`
- 4-character uppercase code input, matching the current inline input style.
- Helper text: `Enter the 4-character code from your friend. Casual matches do not affect ranked rating.`
- Primary button: `Join Match`
- Inline error state for missing, invalid, full, or not-found rooms.
- Bottom button: `Cancel`

`Cancel` returns to the main multiplayer page, not the hub.

### Ranked Queue State

Clicking `Find Ranked Match` replaces the lobby body with a queue panel:

- Header: `Finding Ranked Match`
- Current rating.
- Current search range.
- Elapsed time or a subtle waiting indicator.
- Button: `Cancel`

`Cancel` emits `pvp:ranked-dequeue` and returns to the main multiplayer page.

### Post-Match Result

After a ranked match ends:

- Show the normal PvP result context.
- Include the rating transition, e.g. `1222 -> 1240`.
- Button: `Return to Multiplayer`.
- Returning to the multiplayer page shows the updated rating card and last ranked match card.

The rating transition should animate by counting from the old value to the new value. The implementation can use CSS/JS animation in the UI layer, but the server should send both values explicitly.

## Persistence and API Shape

Extend the existing `/api/game/pvp/pvp-teams` endpoint to return ranked summary data alongside team slots. The multiplayer page already fetches this endpoint, so extending it avoids an extra request.

Preferred response shape for the multiplayer page:

```js
{
  pvpTeams: [/* existing team slots */],
  ranked: {
    rating: 1240,
    wins: 8,
    losses: 5,
    matchesPlayed: 13,
    lastMatch: { /* compact result record */ }
  }
}
```

The socket handler still needs access to the same ranked metadata for enqueueing and match result persistence.

## Error Handling

Ranked queue should emit `pvp:error` with clear messages for:

- No saved PvP team.
- Already queued.
- Already in a PvP match.
- Socket no longer authenticated.
- Server failed to persist ranked result.

If rating persistence fails after a ranked match, the match result should still be shown, but the server should log the failure and the client should avoid claiming a rating update happened.

## Reconnect and Disconnect

Queued players:

- Disconnect removes the player from the queue.
- Reconnecting does not auto-requeue.

Ranked matches:

- Use the existing PvP disconnect grace and forfeit behavior.
- Fix the known reconnect payload mismatch before relying on reconnect for ranked matches: the client currently sends `{ code }`, while the server expects `{ matchCode }`.

## Testing

Add focused tests before implementation:

- Rating utility tests:
  - default rating displays as `1200`
  - winner rating increases
  - loser rating decreases
  - before/after values are recorded correctly
- Queue tests:
  - pairs close ratings immediately
  - does not pair outside the current search window
  - widens search after elapsed time
  - removes users on cancel/disconnect
  - prevents duplicate queue entries
- MatchManager tests:
  - paired ranked match enters `team_select`
  - ranked flag and rating snapshots are stored
  - casual matches remain unrated
- Socket handler tests:
  - enqueue emits queued state
  - match-found moves both players into the same room
  - queue cancellation returns cleanly
- Route/meta tests:
  - ranked summary initializes for old users
  - ranked result persists wins/losses/lastMatch

Manual visual verification is required for the multiplayer page, Join Casual sub-state, ranked queue state, and post-match rating animation.

## Rollout

1. Add ranked data defaults for existing users.
2. Add OpenSkill dependency and rating utility.
3. Add queue module and MatchManager paired-match helper.
4. Add socket events for ranked queue.
5. Update multiplayer lobby UI with ranked rating, queue, casual sub-states, and last result.
6. Add post-ranked-match rating transition.
7. Run unit/integration tests and perform visual verification.

## Product Decisions Made

- Visible numeric ranked ladder, not hidden skill matching.
- OpenSkill internals with Koto `Ranked Rating` display.
- Expanding search window for queue fairness and reasonable wait times.
- Challenge-code rooms are casual and unrated.
- Current PvP lobby visual style should be preserved.
- Last-match UI shows old rating to new rating, without an explicit delta such as `+18`.
