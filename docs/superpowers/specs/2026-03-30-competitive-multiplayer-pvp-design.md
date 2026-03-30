# Competitive Multiplayer PvP

## Overview

Add 1v1 competitive multiplayer battles to Koto. Players save teams from completed runs and battle each other in real-time via Socket.IO. The core combat math is shared with PvE through a refactored pure combat resolver.

## Team Saving

### When & Where

On the `run_complete` screen, a "Save Team for PvP" button appears below the existing "ハブに戻る" (Return to Hub) button. This is optional — the player can tap "ハブに戻る" to skip saving.

### Save Slots

Each player has 3 PvP team slots stored on their meta-progression object:

```js
meta.pvpTeams: [null, null, null]  // 3 slots, null = empty
```

### What Gets Saved

A frozen snapshot of the full party state at run completion:

- `creatureParty` — active (up to 3) + reserves (up to 3), full creature objects with all stats, moves, equipment, and effects
- `partySkills` — cross-creature synergy effects
- `itemBuffs` — run-scoped stat multipliers
- All creatures restored to full HP and MP
- `savedAt` — timestamp

### Save Flow

1. Player taps "Save Team for PvP" on run complete screen
2. Sees 3 slots — each shows creature sprites/levels/elements, or "Empty"
3. Taps a slot to save (confirmation prompt if overwriting)
4. Returns to hub

### Endpoints

- `POST /api/game/save-pvp-team` — `{ slotIndex }` — saves current run's team to the specified slot
- `GET /api/game/pvp-teams` — returns the player's 3 slots

## Hub

New "Multiplayer Battle" button on the hub screen alongside Speed Review, Upgrades, and Infiltrate. Disabled (grayed out) if the player has no saved PvP teams.

## Matchmaking

### Challenge Code System (MVP)

No random matchmaking queue for MVP. Players create or join matches via 4-character codes shared out-of-band (text, Discord, etc.).

The architecture supports adding a live queue later — a queue is just automatic room creation/joining, same underlying match room system.

### Socket.IO Connection

Established when the player enters the PvP lobby. Authenticated via JWT (same `jsonwebtoken` library already in use). Disconnecting from the lobby returns to hub with no penalty.

### Flow

1. Player taps "Multiplayer Battle" on hub → enters `pvp_lobby` phase
2. Two options:
   - **Create Match** — server generates a 4-char room code (e.g. `A7K2`). Player sees "Waiting for opponent..." with the code displayed
   - **Join Match** — player enters a code received from a friend
3. Once both players are in the room → transition to team selection

### Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `pvp:create-match` | client → server | — | Create a new match room |
| `pvp:match-created` | server → client | `{ code }` | Return room code to creator |
| `pvp:join-match` | client → server | `{ code }` | Join an existing match |
| `pvp:match-joined` | server → client | — | Confirm join to joiner |
| `pvp:opponent-joined` | server → client | — | Notify both players |

## Team Selection

Once both players are in the match room:

1. Each player sees their 3 save slots — creature sprites, levels, elements. Empty slots grayed out.
2. Player taps a slot to select it (highlighted border).
3. Player taps "Ready."
4. While waiting: "Waiting for opponent..." with an indicator showing whether the opponent has readied up (without revealing which team they picked).
5. Both ready → match begins.

Team choice is blind — neither player sees the opponent's team until battle starts.

### Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `pvp:select-team` | client → server | `{ slotIndex }` | Choose a team slot |
| `pvp:ready` | client → server | — | Lock in team choice |
| `pvp:opponent-ready` | server → client | — | Opponent is ready (no team details) |
| `pvp:match-start` | server → client | `{ yourTeam, opponentTeam, opponentName }` | Battle begins |

## PvP Battle

### Setup

- Server creates PvP combat state with both teams' creatures (fully healed)
- Background: dedicated PvP arena asset
- Player sees their formation on the left, opponent's on the right (reuses existing `showFormation`)

### Round Flow

1. Both players select moves for their creatures simultaneously (move + target for each active creature)
2. Player submits moves → sees "Waiting for opponent..."
3. Once both have submitted, server resolves the round:
   - All creatures from both sides sorted by level descending
   - Ties broken randomly
   - Each creature executes its move in that order using the shared combat resolver
   - KO'd creatures auto-swap from reserves (same as PvE)
4. Server sends full round results to both players
5. Both players see attack animations play out (reuses existing attack card display)
6. Next round begins

### Status Effects

Status effects (poison, stun, sleep, etc.) tick between rounds exactly as in PvE. The shared combat resolver handles this — no PvP-specific logic needed.

### Victory Condition

All of the opponent's creatures (active + reserves) are KO'd.

### No Timer (MVP)

No move submission timer. Both players wait for each other. The 30-second disconnect timeout handles AFK players.

### Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `pvp:submit-moves` | client → server | `{ moveChoices }` | Submit move selections |
| `pvp:round-result` | server → client | `{ attacks, effects, kos, swaps, roundOrder, allies, enemies }` | Full round resolution |
| `pvp:match-end` | server → client | `{ winnerId, winnerName }` | Declare winner |

## End Screen & Rematch

### End Screen

- Display winner's username
- Two buttons: "Rematch" and "Return to Hub"

### Rematch Flow

- If a player clicks "Rematch" → they see "Waiting for opponent..." with option to cancel
- If both players click "Rematch" → both return to team selection (same match room, can pick a different team or the same one)
- If either player clicks "Return to Hub" or cancels their rematch request → server notifies the other player ("Opponent left"), both return to hub

### Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `pvp:request-rematch` | client → server | — | Request a rematch |
| `pvp:opponent-wants-rematch` | server → client | — | Notify other player |
| `pvp:rematch-start` | server → client | — | Both go to team selection |
| `pvp:leave-match` | client → server | — | Leave the match |
| `pvp:rematch-cancelled` | server → client | — | Other player left |

## Disconnect Handling

- If a player's socket drops for 30 seconds without reconnecting, they forfeit
- Server emits `pvp:opponent-disconnected` to the remaining player — they win
- Brief network hiccups within 30 seconds allow reconnection (player rejoins via match code stored in their client state)

### Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `pvp:opponent-disconnected` | server → client | — | Opponent forfeited (disconnect) |
| `pvp:reconnect` | client → server | `{ matchCode }` | Rejoin after disconnect |
| `pvp:reconnected` | server → client | `{ currentState }` | Restore match state |

## Server Architecture

### New Files

- `src/pvp/match-manager.js` — in-memory match state management. `Map<matchCode, MatchState>`. Create, join, team select, move submission, round resolution, rematch, cleanup.
- `src/pvp/pvp-combat.js` — PvP round resolution. Takes both players' move choices, sorts by creature level, calls shared combat resolver, returns round results.
- `src/pvp/socket-handler.js` — Socket.IO event handlers. JWT authentication, routes events to match manager, emits results.

### Match State

```js
{
  code: 'A7K2',
  player1: { userId, socketId, team: null, ready: false, movesSubmitted: null },
  player2: { userId, socketId, team: null, ready: false, movesSubmitted: null },
  phase: 'waiting' | 'team_select' | 'battle' | 'finished',
  combat: {
    sideA: [creatures],      // player1's team
    sideB: [creatures],      // player2's team
    round: 1
  },
  createdAt: timestamp
}
```

Matches are ephemeral — in-memory only, no file persistence. Cleaned up when both players leave or on server restart.

### Socket.IO Integration

Socket.IO server attaches to the existing HTTP server in `server.js`. Socket authentication middleware verifies JWT using the same `jsonwebtoken` library. Minimal changes to `server.js` (create socket server, pass to handler setup).

### Combat Resolver Refactor

Extract core combat math from `GameManager.creatureCombatCycle()` into a pure function:

```js
resolveRound(sideA, sideB, sideAMoves, sideBMoves)
  → { attacks, effects, kos, swaps, updatedSideA, updatedSideB, winner }
```

- Merges all creatures into a single execution queue sorted by level (descending), ties broken randomly
- Executes each creature's move in order using existing damage/effect logic from `creature-combat-service.js`
- Handles KO detection and auto-swap from reserves
- Returns full round results

**PvE** calls this with AI-generated enemy moves (replacing inline combat logic in `loop.js`).
**PvP** calls this with human-submitted moves from both players.

One combat engine. Bug fixes and balance changes apply to both modes automatically.

### What's Reused from PvE

- `creature-combat-service.js` — damage calculation, element effectiveness, STAB, status effects, effect ticking, accuracy, move categories (damage/drain/heal/buff/debuff/shield)
- `showFormation()` — creature display on battlefield
- Attack card animations — round result display
- Creature data structures — identical objects

### What's NOT in PvP

- `GameManager` / `loop.js` orchestration — PvP has its own flow via match manager
- Befriend mechanics — no capturing in PvP
- AI move selection — both sides are human
- XP, credits, rewards — none for MVP
- NPC companions — not applicable
- Party skills are included and functional in PvP (they're part of the saved team snapshot). All party skills work as in PvE — `battleRhythm`, `hasteSpark`, `guardPulse`, `finisherFeast`, `superEffectiveMend` all apply

## Frontend

### New Files

- `public/js/ui/pvp-lobby.js` — lobby screen (create/join match), team selection screen
- `public/js/ui/pvp-battle.js` — PvP battle UI. Move selection (reuses same move/target picker patterns), Socket.IO communication, round result animation playback
- `public/js/pvp-socket.js` — Socket.IO client. Connection management, event emitting/listening, reconnection handling

### New Game Phases

- `pvp_lobby` — matchmaking screen (create/join)
- `pvp_team_select` — team selection before battle
- `pvp_battle` — active PvP combat
- `pvp_result` — end screen (winner, rematch/leave)

### Socket.IO Client Library

Load the Socket.IO client library via the npm package (already bundled by Vite) or CDN fallback.

## Arena Background

Generate 10 radically different PvP arena background concepts via ComfyUI. Bright fantasy aesthetic with light sci-fi touches (not heavy sci-fi). Present all 10 for selection. Chosen background saved as `public/assets/backgrounds/pvp-arena.webp`.

## New Dependency

- `socket.io` (npm) — server and client packages

## Prerequisite Change

`areasToWin` in `src/game/state.js` changed from 10 to 1. A run is now a single area — beat one area and the run is complete. This makes team saving meaningful since players reach run completion regularly.

## Out of Scope (MVP)

- Live matchmaking queue (random opponent finding)
- Move submission timer
- Elo/rating system
- Win/loss tracking
- Rewards for winning
- Spectator mode
- Turn order by speed stat (using level for now)
- Chat/emotes during battle
