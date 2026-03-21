# Room Transition Animations

## Overview

Animated transitions between rooms to make exploration feel lively. Player creatures bounce in place while new room content (NPCs, enemy creatures) enters from the right side of the screen. Fast-paced — the longest transition (3-creature encounter) takes ~3.5s total.

## NPC Sprites

Five NPC sprites generated via ComfyUI (Nova v16, RMBG-2.0, 1024x1024 RGBA WebP):

| NPC ID | Label | Notes |
|--------|-------|-------|
| `kodomo` | 子供 (Child) | Boy, selected candidate #4 |
| `otona` | 大人 (Adult) | Man, candidate #4 mirrored |
| `otokonoko` | 男の子 (Boy) | Boy, candidate #3 |
| `onnanoko` | 女の子 (Girl) | Girl, candidate #3 |
| `game-master` | Game Master | Man, candidate #5 mirrored, whack-a-mole host |

Sprites saved to `public/assets/sprites/npcs/{id}.webp`. Already complete.

## Animation Library

All animations use the existing anime.js library (`public/js/lib/anime.esm.min.js`), imported as `animate as anime`. Same patterns already used in `combat-effects.js` for screen shake, recoil, particles, etc.

## Reusable Animation Primitives

Three primitives cover all transition needs:

### `bouncePlayerParty(duration = 500)`
- Targets: all `.formation-slot` elements in `#player-formation`
- Animation: `translateY: [0, -8, 0]` looping for the given duration
- Used by: every room type (skipped when `gameState.run?.creatureParty?.active?.length` is 0 or undefined, e.g. prologue)

### `slideFromRight(element)` / `slideToRight(element)`
- Slide in: `translateX` from off-screen right to final position, `ease: 'outBack'`, ~0.4s
- Slide out: `translateX` from current position to off-screen right, `ease: 'inQuad'`, ~0.3s
- Used by: NPC entrances, NPC exits, enemy creature entrances

### `fadeIn(element)` / `fadeOut(element)`
- `opacity` transition, ~0.3s each
- Used by: NPC skill activation only (enemy creatures fade out/in while NPC appears)

## Per-Room-Type Flows

### Regular Encounter / Boss
1. Player creatures bounce (0.5s)
2. Bouncing stops
3. Call `showFormation('enemy', enemies)` to render all enemy slots, then immediately set all `.formation-slot` elements in `#enemy-formation` to `translateX(100vw)`. Animate them in sequentially (top→bottom) with staggered `slideFromRight` per slot.
   - Each: `slideFromRight` into slot (~0.4s), TTS announces creature name via `playWord(creature.baseReading || creature.baseWord)`
   - ~0.7s stagger between creatures
   - ~3s total for 3 creatures
4. Brief settle (0.2s)
5. Normal room UI renders (narration, fight button)

### NPC Battle
1. Player creatures bounce (0.5s), stop
2. NPC displayed via `showNpcTrainer(npc.name, npc.id, npc)`, then animated in with `slideFromRight` on `#npc-display` (0.4s)
3. NPC greeting displayed in narration box + TTS via NPC's `speakerId` — click-to-continue
4. NPC slides out to right via `slideToRight` on `#npc-display` (0.3s)
5. Enemy creatures bounce in one-by-one with TTS name announcements (same as encounter)
6. Normal combat UI renders

**Mid-combat NPC skill activation (wraps around existing `showNpcSkillAttacksAnimated()`):**
1. Enemy formation fades out via `fadeOut('#enemy-formation')` (0.3s)
2. NPC displayed via `showNpcTrainer()`, slides in from right (0.4s)
3. Existing `showNpcSkillAttacksAnimated()` runs (attack cards, damage numbers, HP updates)
4. NPC slides out to right (0.3s)
5. Enemy formation fades back in via `fadeIn('#enemy-formation')` (0.3s)

### Friendly NPC
1. Player creatures bounce (0.5s), stop
2. Area NPC displayed via `showNpcTrainer()`, slides in from right (0.4s)
3. Normal friendlyNpc UI renders (item cards)

### Whack-a-Mole
1. Player creatures bounce (0.5s), stop
2. Game Master displayed via `showNpcInDisplay('Game Master', '/assets/sprites/npcs/game-master.webp')`, slides in (0.4s)
3. Normal whack-a-mole UI renders

### Dealer
1. Player creatures bounce (0.5s), stop
2. Traveling Merchant displayed via existing `showDealer()`, slides in (0.4s)
3. Normal dealer UI renders

### Speed Review / Word Discovery
1. Player creatures bounce (0.5s), stop
2. No NPC slide-in — these rooms have no NPC character
3. Normal phase UI renders

### Prologue (no creatures)
No bounce — NPC/content appears immediately.

## NPC Assignments

- `npcBattle` rooms: NPC selected from area pool via existing `selectNpcForEncounter()`
- `friendlyNpc` rooms: same area NPC pool — NPCs have a dual relationship (sometimes battle, sometimes help)
- `whackAMole` rooms: dedicated Game Master NPC (hardcoded, not in area pool)
- `dealer` rooms: existing Traveling Merchant (hardcoded sprite at `/assets/sprites/traveling_merchant.webp`)
- `skillMaster` rooms: not generated in the 30-room layout; if encountered in legacy saves, no transition plays
- `speedReviewRoom` / `wordDiscovery`: no NPC, bounce-only transition

## New Module

**`public/js/ui/room-transition.js`** (~150-250 lines)

Exports:
- `playRoomTransition(roomType, { playerCreatures, enemies, npc })` — main orchestrator
- `playNpcSkillAnimation(npc, skillEffect)` — mid-combat NPC skill visual

Internally composes the three animation primitives with timing/sequencing logic.

## Integration Points

### `exploration.js` — Transition before UI render

Every `apiProceed()` call site must be modified to: `apiProceed()` → `await playRoomTransition(...)` → `updateUI()`. The transition must complete before `updateUI()` runs, otherwise `updateScene()` will immediately process the new phase (e.g., `room_encounter` triggers `startEncounter()` which overwrites the DOM).

Affected call sites in `exploration.js`:
- Line ~450: main proceed button handler
- Line ~510: secondary proceed path
- Line ~586: alternative proceed path
- Line ~632: another proceed path

Pattern change at each site:
```js
// Before:
const result = await apiProceed();
if (result?.state) { updateGameState(result.state); updateUI(); }

// After:
const result = await apiProceed();
if (result?.state) {
  updateGameState(result.state);
  await playRoomTransition(result.state);  // blocks until transition completes
  updateUI();
}
```

### `game.js` — `updateScene()` must preserve NPC sprites

`updateScene()` currently calls `scene.hideEnemies()` for `friendlyNpc` and `whackAMole` phases, which would destroy NPC sprites placed by the transition. Add explicit cases for these phases:
- `friendlyNpc`: call `showNpcTrainer()` instead of falling through to `hideEnemies()`
- `whackAMole`: call `showNpcInDisplay('Game Master', ...)` instead of falling through

This ensures the NPC sprite persists across `updateUI()` re-renders.

### `combat-loop.js` — NPC skill wrapper

When NPC skill triggers during combat, wrap the existing `showNpcSkillAttacksAnimated()` call:
```js
await playNpcSkillAnimation(npc, async () => {
  await showNpcSkillAttacksAnimated(attacks, ...);
});
```

### `scene.js`
- No structural changes needed — reuse existing `showNpcTrainer()`, `showDealer()`, `showFormation()`

### `game.css`
- Add `.off-right` utility class: `transform: translateX(100vw)` for initial off-screen positioning

## Game Master NPC Data

The Game Master is a hardcoded special-case NPC (like the dealer). Not added to `npcs.json` since it has no battle stats, skills, or bond tracking. The whack-a-mole room references it directly:
- Display name: "Game Master"
- Sprite: `/assets/sprites/npcs/game-master.webp`
- No `speakerId` (no TTS greeting for whack-a-mole)

## TTS Integration

- **Creature name announcements**: Use `playWord(creature.baseReading || creature.baseWord)` from `public/js/tts.js` to speak each creature's name as it enters. Fire-and-forget — the stagger timer continues while TTS plays.
- **NPC greeting**: Use existing TTS dialogue system with the NPC's `speakerId` to speak the `greeting` field. Plays while greeting text is shown in narration box. Click-to-continue dismisses both.

## Timing Summary

| Scenario | Total Duration |
|----------|---------------|
| NPC room (no battle) | ~1.0s (0.5s bounce + 0.4s slide) |
| NPC battle entrance | ~4.5s (0.5s bounce + 0.4s NPC in + greeting click + 0.3s NPC out + ~3s creatures) |
| 3-creature encounter | ~3.5s (0.5s bounce + ~3s creatures) |
| 1-creature encounter | ~1.5s (0.5s bounce + ~0.7s creature + 0.2s settle) |
| NPC skill (mid-combat) | ~1.6s (0.3s fade + 0.4s NPC in + skill + 0.3s NPC out + 0.3s fade) |
| Speed review / word discovery | ~0.5s (bounce only) |
