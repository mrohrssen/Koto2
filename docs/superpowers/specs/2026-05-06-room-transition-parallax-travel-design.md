# Room Transition Parallax Travel Design

## Goal

Make room-to-room movement feel like the party is crossing real land instead of hopping a few feet across a static backdrop. The approved target is option C from the visual companion, shortened to 2.7 seconds: a clear travel beat with fast ground coverage, but short enough to repeat across many rooms.

## Current Behavior

The current parallax system is always time-independent: `updateParallax()` scrolls every tick while the phase says the party is moving. The base speed is `60px/s`, exploration enters with a `0.6` multiplier, and the battleground layer uses a `1.0` layer speed. That means normal exploration travel currently reads as roughly `36px/s` of ground movement.

Room entry also calls `setScrollState('scrolling')` immediately, so there is no authored travel duration. The player proceeds, the room UI updates, and any room NPC can slide in almost immediately. Creature movement is only a small walking wobble tied to whether parallax is moving; the creatures do not currently advance through a travel beat.

## Approved Feel

Use the selected visual target:

- Travel duration: `2700ms`.
- Battleground coverage: about `620px` on a mobile viewport.
- Effective ground speed: about `230px/s`, or `3.8x` the current `BASE_SCROLL_SPEED` of `60px/s`.
- Sky should remain slower than the battleground so the scene reads as parallax, not a flat texture pan.
- Creatures should visibly travel during this beat, then settle before room-specific interaction starts.

This is intentionally much faster than current exploration scroll, but not as slow as a cinematic transition. It should read as "we crossed terrain" without making thirty-room runs feel sluggish.

## Transition Flow

When the player proceeds to the next room:

1. Hide stale enemy formation DOM as today.
2. Start a dedicated room-travel parallax mode using the approved `2700ms` duration and `3.8x` travel speed.
3. Keep the active party visible and walking while the battleground covers the target distance.
4. Delay room-specific arrivals, such as friendly NPC, shrine fox, whack-a-mole master, or dealer slide-in, until the travel beat completes.
5. Stop or decelerate the battleground according to the destination room phase. Combat and encounter phases should continue to freeze the battleground while allowing slow sky drift, preserving PvE/PvP parity.

The travel beat should be owned by `playRoomTransition()` because that function already coordinates the move from API state update to fresh `ExplorationScene` and room-specific sprite arrival.

## Motion Constants

Add named constants rather than burying numbers in room transition code:

- `ROOM_TRAVEL_DURATION_MS = 2700`
- `ROOM_TRAVEL_SCROLL_SPEED = 3.8`
- `ROOM_TRAVEL_GROUND_DISTANCE_PX = 620`

The distance constant documents the design target; the implementation can derive actual speed from duration plus distance if that is cleaner than using a raw multiplier. If viewport differences require scaling, preserve the design intent: roughly one-and-a-half mobile scene widths of battleground should pass during the transition.

Keep battle sky drift unchanged at `BATTLE_SKY_DRIFT_SPEED = 0.4`. The new travel speed is only for room-to-room movement, not combat idle, NPC dialogue, shops, or PvP combat.

## Creature Motion

The current walking wobble can remain the baseline animation, but it should be paired with enough visual translation to sell travel. The simplest acceptable version is:

- While room travel is active, keep `formation.walkingEnabled = true`.
- Move the party formation forward over the travel beat, then settle it back into the normal exploration anchor as the destination room arrives.
- Avoid changing combat formation positions or attack animation anchors.

If implementation risk is high, ship the faster parallax first and keep creature translation as a follow-up only if the visual check still feels like "sliding background behind stationary creatures." The success criterion is the playtest feel, not adding a complex locomotion system.

## Room-Specific Arrival Timing

NPC and support-room sprites should not slide in at the same time the party is still crossing the area. Their arrival should happen after the `2700ms` travel beat. This gives the transition a readable sequence:

1. Party travels.
2. Ground stops or slows.
3. Room resident appears.
4. Room UI/dialogue begins.

Plain completed rooms can reveal their action buttons after the travel beat with no extra flourish.

## Testing

Unit coverage should include:

- `playRoomTransition()` starts room travel with the approved duration/speed target before room-specific sprite arrival.
- Friendly NPC, shrine, whack-a-mole, and dealer sprite slide-ins occur after the travel wait.
- Combat and encounter phases still set the battleground to encounter/frozen behavior.
- Existing `ExplorationScene` reset behavior still preserves player sprites and clears old NPC sprites.

Manual verification should run the dev server and use a browser visual check. Because this is a visual/motion change, completion requires observing at least three consecutive room transitions and confirming:

- The party visibly covers more ground than before.
- The transition lasts about 2.7 seconds.
- The flow does not feel sluggish when repeated.
- NPC/support-room arrivals happen after travel, not during it.
