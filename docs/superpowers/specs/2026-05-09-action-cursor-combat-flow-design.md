# Action Cursor Combat Flow Design

**Date:** 2026-05-09  
**Status:** Approved design, awaiting implementation plan  
**Scope:** Change creature combat from full-round move collection to immediate action-by-action resolution in both PvE and PvP.

## Goal

Combat currently asks the player to submit every allied creature's move, then resolves all ally and enemy actions in dex order as one full round. This makes battles feel slow because the player may choose three moves even when the first action would end the fight.

The new flow should resolve each submitted primary action immediately. Combat remains turn-based and dex-driven, but the commitment unit becomes one creature action instead of one whole-team round.

This should:

- Reduce unnecessary move entry when a battle ends early.
- Make combat feel more dynamic by alternating choice and resolution.
- Preserve dex as the main initiative system.
- Preserve PvE/PvP parity by using the same action-cursor model in both modes.

## Existing Architecture

PvE already resolves ally and enemy turns in a combined initiative order inside `processInterleavedPvERound()` in `src/game/services/creature-combat-service.js`. The mismatch is that the frontend gathers all allied choices before calling the server.

PvP also resolves by shared combat primitives, but `MatchManager.submitMoves()` waits for both players to submit full-team move batches before resolving a round.

Important current behavior that must be re-homed rather than accidentally multiplied:

- Status and duration ticking currently happen at round boundaries.
- MP regen currently happens once at the end of a resolved round.
- `turnCount` currently increments once per full PvE combat cycle.
- Party skills and counters can trigger inline during attacks.
- PvE and PvP share resolution primitives and should remain mechanically aligned.

## Core Model

Combat should use an action cursor.

The action cursor identifies the next required primary actor:

```js
{
  side: 'ally' | 'enemy' | 'sideA' | 'sideB',
  index: 0,
  opening: false
}
```

The exact shape can be adjusted during implementation, but the state needs to answer:

- Which creature is currently expected to submit or execute a primary action?
- Which player owns that creature?
- Whether the battle is still in a special opening sequence.
- Which living combatants are eligible for the next action.

The server, not the client, is authoritative for the cursor. The client may display the active actor and request input, but submitted actions must be validated against the current cursor.

## Primary Action Resolution

A submitted primary action resolves immediately:

1. Validate that the submitted actor matches the current action cursor.
2. Resolve the action through the shared move execution path.
3. Resolve any inline counters, chain effects, swaps, barks, XP events, victory checks, or defeat checks created by that action.
4. If combat continues, run the acting creature's mini-round tick.
5. Advance the action cursor to the next living eligible actor.
6. Emit state and return only the events needed to animate this action.

Counters, interrupts, chain hits, and other reactive effects are part of the submitted action's resolution. They do not create their own mini-round and do not advance the action cursor independently.

For action-counting purposes, a server-generated skipped action for an incapacitated creature is treated as a primary action opportunity. It advances that creature's own mini-round tick and cursor position, but it is not treated as a player-submitted move.

## Player-Facing Playback

The UI must show combat as one primary action at a time.

The player-facing sequence should be:

1. The current player-owned creature chooses one move.
2. That move animates and resolves.
3. If the next cursor belongs to an enemy, that enemy action animates and resolves.
4. If the next cursor belongs to the player, that creature's move choices appear.

The UI should not queue several allied and enemy primary actions, then play them back as one long batch. Even if the server resolves consecutive enemy-owned actions in one response for efficiency, the response should preserve action boundaries and the frontend should play each primary action segment separately before showing the next prompt.

Move controls must stay hidden or disabled while an action segment is animating. The next player prompt should appear only after all prior animation, mini-round tick events, KO swaps, and victory/defeat transitions for the previous action have completed.

## Actor-Scoped Mini-Rounds

Every submitted primary action counts as a mini-round only for the creature that acted.

After the submitted action resolves, everything currently round-based that can be scoped to one creature should happen for that actor:

- Actor status ticks, such as poison damage.
- Actor status duration changes, such as sleep, stun, confuse, and similar turn-duration effects.
- Actor MP regen.
- Actor-owned passive turn hooks, if the passive can be interpreted as belonging to that creature's turn.

No other creature's status durations, poison damage, MP regen, or actor-owned passive turn hooks should advance from that action.

Example: if a poisoned creature uses `Flame`, it attacks first. After the attack and any reactive effects finish, poison damages that same creature. The other allies and enemies are unaffected by that poison tick.

If the acting creature is defeated by its own end-of-action tick, normal KO, swap, victory, and defeat checks should run after the tick.

## Initiative And Cursor Advancement

Outside special opening rules, the next actor is chosen from living eligible combatants by the existing initiative rule:

```js
effectiveDex descending
level descending
random tie-break
```

The action cursor should skip defeated, missing, befriended, or otherwise ineligible combatants. Incapacitated creatures still need a turn opportunity if their status duration should advance on their own mini-round. If an incapacitated creature cannot choose or execute a move, the server should resolve a no-op primary action for that creature, then run its actor-scoped mini-round tick and advance the cursor.

This preserves the meaning of duration-based statuses: a sleeping or stunned creature loses its own action, but its duration advances only when its own action opportunity arrives.

## Opening Rules

### PvE

At the start of every PvE battle, the player's highest-effective-dex living creature acts first. This is a manual opening override, even if an enemy has higher dex.

After that first player action and mini-round tick resolve, cursor advancement returns to the normal initiative rule.

### PvP

At the start of every PvP battle, both players simultaneously submit the opening move for their own highest-effective-dex living creature.

Those two opening actions resolve by the normal initiative sort between the two opening actors:

```js
effectiveDex descending
level descending
random tie-break
```

Each opening action still receives its own actor-scoped mini-round tick after that action resolves. If the first opening action ends the battle, the second opening action should not resolve.

After the opening exchange completes, PvP becomes sequential. The server exposes the current action cursor, and only the owner of that active creature may submit the next action while the opponent waits.

## PvE Data Flow

The PvE frontend should no longer collect all ally moves before calling the server.

Instead:

1. The combat state identifies the current actor.
2. If the actor is player-owned, the UI shows move choices for that creature only.
3. The player selects one move and target.
4. The client submits one action to the combat endpoint.
5. The server resolves that action, applies the actor mini-round, advances the cursor, and returns animation events.
6. If the next actor is enemy-owned, the server auto-resolves enemy-owned cursor actions until combat ends or the next player-owned actor is reached.

This keeps PvE interaction simple: the player acts when prompted, then watches any enemy actions that naturally occur before the next player prompt.

## PvP Data Flow

PvP needs a protocol change because the current model waits for both players to submit full move batches.

Opening:

1. Server marks both players' highest-dex living creature as the required opening actor for that side.
2. Each player submits one opening action.
3. Once both opening actions are present, the server resolves them by dex, applies each actor mini-round, then initializes the normal sequential cursor.

Sequential play:

1. Server broadcasts the active cursor to both players.
2. The active creature's owner sees move controls.
3. The non-owner sees a waiting state.
4. The owner submits one action.
5. Server validates ownership and actor identity, resolves the action, applies the actor mini-round, advances the cursor, and broadcasts the result.

The server must reject submissions from the wrong player, wrong creature index, stale cursor, or already-ended combat.

## Round Count And Naming

The old `turnCount` field is overloaded because it currently means full combat rounds. The action-cursor model needs clearer naming.

Recommended state fields:

- `actionCount`: increments after each submitted primary action that actually resolves, plus server-generated skipped opportunities for incapacitated actors.
- `cycleCount`: optional, increments only after every living eligible combatant has had one action opportunity.
- `turnCount`: retained during migration as a backwards-compatible alias of `actionCount`; new combat code should read `actionCount`.

Tutorials and UI that currently check `turnCount === 1` should move to an opening-action check so the first combat tutorial still targets the intended starter creature.

## Edge Cases

If an action defeats the last enemy, combat ends immediately. No later queued or implied actions resolve.

If an action defeats the acting creature through recoil, self-damage, poison, or another actor-scoped tick, cursor advancement should process KO swaps and then choose the next eligible actor from the updated battle state.

If a target selected by the client is invalid by the time the action reaches the server, the server should reject the action for player-owned actors rather than silently retargeting. Enemy AI can choose targets at resolution time from the current board.

If a creature is incapacitated, its action opportunity should still be consumed so its own status durations can advance. That no-op should count as a primary action opportunity for cursor advancement, but not as a submitted player move.

If a PvP player disconnects or times out while owning the active cursor, existing PvP timeout/forfeit behavior should decide the outcome. This design does not add AI takeover for PvP.

## Testing

Unit tests should cover:

- Cursor initialization for PvE opening override.
- PvP simultaneous opening actor selection and dex resolution.
- Sequential cursor advancement by effective dex, level, and tie-break.
- Actor-only poison/status duration ticks after a primary action.
- MP regen applying only to the acting creature.
- Counters and reactive effects not creating extra mini-round ticks.
- Incapacitated creature no-op opportunities advancing only that creature's durations.
- Victory preventing later actions in an opening pair or sequence.

Integration tests should cover:

- PvE submitting one ally action and resolving immediately.
- PvE ending combat after the first action without asking for remaining allied moves.
- PvE enemy actions auto-resolving until the next player-owned cursor.
- PvP opening requiring both players' opening submissions.
- PvP sequential play allowing only the active actor's owner to submit.
- Rejection of stale or wrong-owner PvP submissions.

Frontend tests or manual playtests should verify:

- The UI highlights the current actor, not slot order.
- Move controls appear for only the current player-owned actor.
- Player and enemy primary actions animate one at a time, with no full-round playback batch.
- Enemy actions animate between player prompts in PvE.
- PvP waiting state is clear for the non-active player.
- The first-combat tutorial still appears on the intended opening creature.

## Non-Goals

This design does not rebalance poison, status durations, MP regen amounts, dex formulas, move power, or enemy AI strategy. It only changes when actions are submitted and which creature receives turn-based processing afterward.

This design does not add new combat moves or new passive skill types. Any existing round-based passive that cannot be cleanly scoped to one acting creature should be reviewed during implementation rather than generalized silently.
