# Chippy Door Labels

## Problem

Chippy narrates two hints sequentially, but the player can't tell which hint maps to which door. The hints describe room vibes without referencing a specific door.

## Solution

Prepend natural Japanese transition phrases that reference 左 (left) and 右 (right) to each hint. Rotate through 20 phrase pairs so Chippy stays fresh across runs.

Update door button labels from 扉1/扉2 to 左のドア/右のドア to match Chippy's language.

## Changes

**`public/js/ui/exploration.js`** (only file changed):

1. Add `DOOR_INTROS` — 20 `{ left, right }` phrase pairs at module scope
2. In `renderBranchSelection()`, pick a random pair and prepend to each hint before narration
3. Change door button labels from 扉1/扉2 to 左のドア/右のドア (both greyed-out and active states)

No backend, API, seed phrase, or TTS changes.
