# First Run Tutorial — Cid Guided Experience

**Date:** 2026-04-07
**Status:** Approved

## Overview

A gacha-style guided tutorial where Cid walks new players through their first run and first hub return, teaching the core game loop: skills → combat → befriend → items → death → chests → crests → party formation → run again.

Triggered after prologue completion. Uses a step counter (`meta.tutorialStep`, 0–7) so players can quit and resume mid-tutorial.

## Data Model

### New State Fields

- `meta.tutorialStep` (number, default 0 for new accounts, 7 for existing accounts)
- `meta.tutorialFireDropsGifted` (boolean, default false — idempotency flag for step 3 fire drop gift)
- Derived: `meta.tutorialComplete` = `tutorialStep >= 7`

### Required State Changes

1. **`src/game/state.js`** — Add `tutorialStep: 0` and `tutorialFireDropsGifted: false` to `createMetaProgression()`
2. **`src/game/loop.js` `getState()`** — Add `tutorialStep: this.meta.tutorialStep ?? 7` to the meta whitelist so the client can read it
3. **`src/game/manager-registry.js`** — Add migration: if `meta.prologueComplete === true && (meta.lifetimeStats?.totalRuns ?? 0) > 0`, set `tutorialStep: 7`. This uses `totalRuns` as the proxy for "has played before" since run history is not persisted.

### Step Definitions

| Step | Phase | Cid Narration | Override |
|------|-------|---------------|----------|
| 0 | Skill selection | P1: "Each run you can get skills to make your party stronger." / P2: "Let's just pick the first one." | Offer only `retaliationStrike` |
| 1 | First combat victory → befriend | P1: "Wow! This creature wants to talk!" / P2: "Let's try to befriend them." / On wrong: "No, I don't think that's it... try again." | No damage on wrong answer, re-present quiz |
| 2 | Friendly NPC room | "Here you'll be offered items to power up. Choose wisely!" | Just narration |
| 3 | Death → hub | P1: "That was tough huh?" / P2: "Don't worry, no one gets past the Starting Meadow on their first try." / P3: "We need to get stronger." / P4: "Here, let me show you how. Click Chests!" | Gift 3 fire drops, pulse Chests button |
| 4 | Chests screen | P1: "Every run you can use your resources to get stronger." / P2: "I'll give you 3 Fire Elements." / P3: "Let's open that fire chest!" | Hardcode common fire crest reward, dim non-fire chests |
| 5 | Crests screen | "Now let's equip that crest to power up!" | Pulse fire crest slot |
| 6 | Creature formation | P1: "Now you have [N] creatures!" / P2: "Each creature costs points." / P3: "Select your best party and let's go back to the Starting Meadow!" | Require selecting all available (up to 3) |
| 7 | Complete | — | Normal gameplay |

## Architecture

### New File: `src/game/services/tutorial-service.js`

Pure functions consumed by existing services:

- `getTutorialStep(meta)` — returns current step
- `advanceTutorial(meta)` — increments step, returns new step
- `isTutorialActive(meta)` — step < 7
- `getTutorialNarration(step)` — returns Cid narration pages for the given step
- `shouldOverrideSkillOffers(meta)` — true at step 0
- `shouldProtectBefriend(meta)` — true at step 1
- `shouldFixRoomSequence(meta)` — true at step < 3
- `shouldGiftFireDrops(meta)` — true at step 3
- `shouldHardcodeCrestReward(meta)` — true at step 4

### Integration Points (existing files, minimal changes)

1. **`src/game/services/exploration-service.js`** — skill offer override (step 0) in `getSkillMasterOffers()`, step advance hook in `chooseSkillMasterOffer()`
2. **`src/game/rooms.js`** — tutorial room sequence override in `generateAreaRooms()`: when `tutorialStep < 3`, force room 0 to `encounter` and room 1 to `friendlyNpc` via post-generation mutation of the rooms array (the current 30-room template has no override path, so mutate after generation)
3. **`src/game/services/creature-combat-service.js`** — befriend retry protection in `processBefriendQuizAnswer()`: when `tutorialStep === 1`, skip the counter-attack damage, keep `combat.befriendQuiz` intact instead of clearing it, return `tutorialRetry: true`
4. **`src/game/loop.js`** — advance tutorial step at phase transitions (death → step 3), inject narration into state, add `tutorialStep` to `getState()` meta whitelist
5. **`public/js/ui/exploration.js`** — render Cid narrations, pulse/highlight buttons (steps 3-6)
6. **`src/routes/game/tutorial.js`** (new file) — `POST /api/game/tutorial-advance` for hub-side step advances (steps 3-6), mounted alongside other game routes

### Client-Side

No new UI components. Uses:

- **Existing narration box** for all Cid dialogue (multi-page support already built)
- **`.tutorial-highlight` CSS class** — glow/pulse animation on target buttons
- **State-driven rendering** — client reads `tutorialStep` from game state and conditionally shows narrations / highlights

### New Endpoint

`POST /api/game/tutorial-advance` — called by client when player completes a hub-side tutorial action (clicks Chests, opens chest, equips crest, confirms formation). Server validates the step transition is legal, performs any side effects (gift drops, hardcode reward), advances the step.

## Step-by-Step Flow

### Step 0 — Skill Selection
- Player starts run, hits `SKILL_MASTER` phase
- Server: in `getSkillMasterOffers()`, when `tutorialStep === 0`, override `pick.offered` to contain only `retaliationStrike` (before the idempotent guard caches offers)
- Client: Cid narration before skill picker (2 pages)
- Player dismisses narration, picks the only option
- Server: in `chooseSkillMasterOffer()`, after successful pick, call `advanceTutorial(meta)` to advance to step 1

### Step 1 — Befriend
- Player wins first combat, befriend quiz triggers (guaranteed: party ≤ 1 via existing `guaranteeBefriend` logic)
- Client: Cid narration before quiz (2 pages)
- Wrong answer → in `processBefriendQuizAnswer()`, when `tutorialStep === 1`: skip counter-attack damage, do NOT clear `combat.befriendQuiz`, return `{ correct: false, tutorialRetry: true }` so client re-presents quiz
- Client: Cid says "No, I don't think that's it... try again." Quiz re-presents with same options
- Correct answer → befriend succeeds, advance to step 2

### Step 2 — Item Shop
- Fixed room sequence puts `friendlyNpc` as room 2
- Client: Cid narration before shop (1 page)
- Player picks item (or not), room completes
- Step advances to 3 on death (not on room completion)

### Step 3 — Death & Hub
- Player dies naturally, returns to hub
- Server advances to step 3, gifts 3 fire drops to `meta.elementDrops.fire`
- Client: Cid narration (4 pages), Chests button gets `.tutorial-highlight`
- Player clicks Chests → client calls `tutorial-advance`, advance to step 4

### Step 4 — Chest Opening
- Client: Cid narration inside chest screen (3 pages)
- Fire chest highlighted, other chests dimmed/disabled
- Player opens fire chest → server hardcodes reward to common fire crest
- Advance to step 5

### Step 5 — Crest Equip
- Client navigates to Crests screen
- Cid narration (1 page), fire crest slot highlighted
- Player equips crest → advance to step 6

### Step 6 — Creature Formation
- Creature formation screen opens
- Cid narration (3 pages)
- Player selects all available creatures (up to 3)
- On confirmation → advance to step 7

### Step 7 — Tutorial Complete
Player hits Infiltrate and starts run 2 with crests, full party, and a skill.

## First-Run Room Generation

When `meta.tutorialStep < 3`, override room generation for the starting area via post-generation mutation in `generateAreaRooms()`. The current room generator uses a fixed 30-room template with hardcoded indices — it has no override parameter. Instead, after the rooms array is generated, mutate:

1. `rooms[0].type = 'encounter'` (creature befriend eligible)
2. `rooms[1].type = 'friendlyNpc'` with appropriate offer data

Rooms 2+ remain as procedurally generated. This guarantees the befriend and item shop moments occur before the player dies. The `generateAreaRooms` function needs to accept an optional `tutorialMode` flag (or the caller mutates the result).

## Edge Cases

- **Existing accounts:** Migration sets `tutorialStep: 7` for any account with `meta.prologueComplete === true && (meta.lifetimeStats?.totalRuns ?? 0) > 0`. Uses `totalRuns` as proxy since run history is not persisted. Accounts with prologue done but zero runs also get step 7 (conservative — don't re-tutorial returning players).
- **Quit mid-run (steps 0-2):** Step persisted on each advance. Next run re-triggers current step's overrides. Fixed room sequence still applies.
- **Quit mid-hub (steps 3-6):** Return to hub, Cid picks up at current step. Fire drops gifted idempotently via `meta.tutorialFireDropsGifted` boolean — step 3 gift only fires if this flag is false, then sets it true.
- **Player already has fire drops:** Gift adds 3 on top. No conflict.
- **Variable creature count at step 6:** Dynamically reads `meta.creatureCollection` count, Cid says "[N] creatures", UI adapts to up to 3.
- **Prologue reset:** `tutorialStep` does not reset on prologue reset. Only resets on full account wipe.
- **Concurrent tabs:** Since Node.js is single-threaded and GameManager is shared in memory per user, step advances are atomic within a single event loop tick. The `tutorialFireDropsGifted` flag prevents double-gifting even if two tabs race on step 3. The `tutorial-advance` endpoint validates `currentStep === expectedStep` before advancing.
