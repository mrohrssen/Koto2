# Game Master Transition Redesign

**Date:** 2026-04-13
**Status:** Approved

## Problem

The Game Master (whack-a-mole room) transition is clunky. The sprite slides in, and the full-screen mini-game start screen launches immediately after the animation completes. The player has no idea what's happening — there's no greeting, no interaction, no pacing.

## Solution

Add an i+1 dialogue moment between the sprite slide-in and the mini-game launch. The Game Master asks the player if they want to play (in Japanese, using the existing i+1 pipeline), and the player responds with はい or いいえ via buttons. Saying no skips the mini-game and advances to the next room.

Also: remove "credits earned" from the game-finished screen (unused system).

## Design Constraints

- **Zero new UI functions or custom button code.** Every piece reuses existing infrastructure.
- **No katakana loan words.** Use native Japanese only (遊ぶ not ゲーム).
- **Simple endings only.** ます/です forms. No conjugations beyond polite present.
- **Same glue particles as shop dialogue.** を、に、の、で、と — no new grammar patterns.
- **i+1 validated.** All dialogue goes through the existing `isEligible()` + `scoreCandidate()` pipeline.

## Current Flow

1. Player enters a `whackAMole` room
2. `room-transition.js` calls `showNpcSprite({ slideIn: true })` — 400ms tween
3. `renderWhackAMole()` fires immediately — shows start screen with プレイ button
4. No greeting, no dialogue, no interaction

## New Flow

1. Player enters a `whackAMole` room
2. `room-transition.js` calls `showNpcSprite(spritePath, { slideIn: true })` — 400ms tween (unchanged)
3. `renderWhackAMole()` fetches GM dialogue tokens from the server (BEFORE pool fetch — no wasted request on decline)
4. `await sceneModule.showNarration(renderJpSentence(tokens, getKnownWords(), wordDict), { html: true, speaker: 'Game Master' })` — player taps to dismiss
5. `renderButtons()` shows two buttons with `renderJpSentence` HTML labels: はい (primary) / いいえ
6. **Yes path:** fetch pool → launch `startWhackAMoleGame(pool)` directly (the existing start screen with プレイ button is removed — the yes/no dialogue replaces it)
7. **No path:** `hideNpcSprite({ slideOut: true })` → call skip endpoint → `updateUI()` advances to next room

## Infrastructure Reuse Map

| Step | Existing Function | File | Line |
|------|------------------|------|------|
| Sprite slide in | `showNpcSprite(path, { slideIn: true })` | `public/js/pixi/formation.js` | 417 |
| Narration box | `sceneModule.showNarration(html, opts)` (wraps `narrationBox.show`) | `public/game.js` | 1745 |
| Yes/No buttons | `renderButtons([{label, onClick}])` | `public/js/ui/ui-components.js` | 9 |
| Japanese text | `renderJpSentence(tokens, knownWords, wordDict)` | `public/js/ui/bootstrap-client.js` | 79 |
| Sprite slide out | `hideNpcSprite({ slideOut: true })` | `public/js/pixi/formation.js` | 457 |
| i+1 frame select | `assembleFrame()` + `isEligible()` + `scoreCandidate()` | `src/game/token-format.js` | 26-88 |
| Frame pool | Category filter (same as `getShopGreetingFrames()`) | `src/game/dialogue-loader.js` | — |
| Room skip | `room.interacted = true` + `proceedToNextRoom()` | `src/game/services/exploration-service.js` | 248 |

## Dialogue Frames

New entries in `frame-sources.json` with category `gameMaster_ask`. Native Japanese, scaling from 1 to 4 content words:

| Content Words | Raw | Breakdown |
|--------------|-----|-----------|
| 1 | 遊びますか？ | 遊ぶ(play) + ますか？ |
| 2 | 一緒に遊びますか？ | 一緒(together) + に + 遊ぶ(play) + ますか？ |
| 3 | 楽しい言葉の遊びです！ | 楽しい(fun) + 言葉(word) + の + 遊び(play) + です！ |
| 4 | 私と一緒に言葉で遊びますか？ | 私(I) + と + 一緒(together) + に + 言葉(word) + で + 遊ぶ(play) + ますか？ |

The server selects the best i+1-eligible frame using the existing pipeline: `assembleFrame()` → `isEligible(tokens, knownSet)` → `scoreCandidate(tokens, knownSet)`.

## Server-Side Changes

### dialogue-loader.js
- Add `_gameMasterAskFrames` pool, filtered by `category === 'gameMaster_ask'`
- Export `getGameMasterAskFrames()` — same pattern as `getShopGreetingFrames()`

### frame-sources.json + frames.json
- Add `gameMaster_ask` entries to `frame-sources.json`
- Run `node scripts/tokenize-static.js` to regenerate `frames.json`
- Run `node scripts/validate-dialogue.js` to validate

### New endpoint (in existing routes file)
- `GET /api/game/whack-a-mole-dialogue` — returns `{ dialogue: { tokens, words } }` for the GM question
- Same pattern as the greeting selection in `/friendly-npc-offers`
- Gets player's known words, filters frames by i+1 eligibility, returns best candidate

### Skip endpoint
- `POST /api/game/skip-whack-a-mole` — sets `room.interacted = true`, calls `proceedToNextRoom()`, returns new state
- Must set `room.interacted = true` before calling `proceedToNextRoom()` — currently `proceedToNextRoom` has no guard for whackAMole rooms (unlike encounter/skillMaster), so marking interacted keeps the data consistent even though it's not enforced

## Credits Removal

Delete the `<div class="wam-results-credits">` line from `public/js/ui/whack-a-mole.js:373`. One line removal — the credits system is unused.

## Button Tokens

はい and いいえ are rendered through `renderJpSentence` as button labels. Their tokens:

```json
[{ "surface": "はい", "base": "はい", "reading": "はい", "meaning": "yes" }]
[{ "surface": "いいえ", "base": "いいえ", "reading": "いいえ", "meaning": "no" }]
```

These are passed through `renderJpSentence()` so the player sees furigana/romaji/meaning annotations consistent with every other piece of Japanese in the game.
