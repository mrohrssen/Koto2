# Reorder Game Loop: Area Select Before Creature Select

**Date:** 2026-04-13
**Status:** Approved

## Problem

The current game loop has the player select their creature team before choosing an area. This means they pick blind — they don't know what area they're heading into. Swapping the order lets the player choose their team based on the area, which is a better gameplay loop.

## Current Flow

HUB → Infiltrate → Creature Select (modal) → Area Select (phase) → Explore

## New Flow

HUB → Infiltrate → Area Select (phase) → Creature Select (modal) → Explore

## Changes

### 1. `startNewRun()` in `public/game.js`

Currently fetches the creature collection and shows the creature select modal. Change to: call `apiStartRun()` with no starterIds, which creates a run and enters the `area_selection` phase.

### 2. `startRun()` in `src/game/loop.js`

Currently expects `starterIds` to initialize the creature party during run creation. Change to: create the run with `areaSelectionRequired = true` but defer creature party initialization until after area is selected.

### 3. `selectArea()` flow

After the player picks an area, instead of transitioning to `exploring`, the server returns state indicating creature selection is needed. The frontend shows the creature select modal at this point.

### 4. Creature selection confirmation

After the player picks creatures, a call sends the chosen `starterIds` to the server, which initializes the creature party and transitions to `exploring`.

### 5. Phase machine

Transition: `HUB → AREA_SELECTION → (creature select modal, client-side) → EXPLORING`

No new phases needed. Creature selection remains a client-side modal that fires between area selection resolution and the exploring phase.

## Non-Goals

- No new UI or features
- No area info shown during creature selection (beyond what the player already knows from picking)
- No changes to creature selection UI itself
- No changes to area selection UI itself
