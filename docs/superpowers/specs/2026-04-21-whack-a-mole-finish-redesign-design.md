# Whack-a-Mole Finish Screen Redesign

**Date:** 2026-04-21
**Status:** Approved

## Problem

The whack-a-mole end screen looks nothing like the rest of the game. `.wam-container` is `position: fixed; inset: 0; z-index: 1000` — a fullscreen overlay that covers the ExplorationScene. When the game ends, the same overlay stays up and renders a `.wam-results` card with:

- `タイムアップ!` (katakana, violates the i+1 / native-Japanese rule)
- Raw score number
- Hardcoded `+{n} XP to party` line
- Hardcoded `{name} Lv{old} → Lv{new}!` level-up lines
- A "Continue" button

The rest of the game delivers end-of-event feedback through the narration box (GM / NPC dialogue, click-to-dismiss) and sprite-based Pixi popups over the formation. The whack-a-mole finish screen uses neither.

## Solution

Tear down the fullscreen overlay at end-of-game and deliver results through the existing primitives:

1. **Narration 1 (Japanese)** — Game Master speaks an i+1 frame via `sceneModule.showNarration` with `speaker: 'Game Master'`. Click-to-dismiss, identical to every other NPC line.
2. **Narration 2 (English, no speaker)** — system line `"Your team gained {N} XP!"` for N > 0, or `"Your team gained 0 XP. Better luck next time!"` for N = 0. Sprite animations fire over the player formation the moment this narration appears (skipped when N = 0 since there is nothing to animate), reusing combat's XP popup + level-up popup + level-up burst.
3. On dismissal of Narration 2, advance via the standard `apiProceed()` → `playRoomTransition()` → `updateUI()` path.

## Flow

```
Game timer hits 0 (or manual end)
  │
  ├─ apiCompleteWhackAMole(score)
  │     └─ returns { score, xpGrants, levelUps, finishDialogue }
  │
  ├─ actions.setContent('')            // removes .wam-container overlay
  │                                    // ExplorationScene reappears: GM sprite + player formation
  │
  ├─ await sceneModule.showNarration(
  │     renderJpSentence(finishDialogue.tokens, knownWords, wordDict),
  │     { html: true, speaker: 'Game Master' }
  │   )
  │
  ├─ const perCreatureXp = xpGrants[0]?.xp ?? 0
  │
  ├─ if (perCreatureXp > 0):
  │     • fire pixiXpPopup(grant.xp, vfx.spritePos('player', i)) for each grant
  │     • setTimeout(pixiLevelUpPopup(lu.newLevel, ...), 400) for each level-up
  │     • setTimeout(animateLevelUpForScene(scene, 'player', i), 400) for each level-up
  │
  ├─ const xpLine = perCreatureXp > 0
  │     ? `Your team gained ${perCreatureXp} XP!`
  │     : `Your team gained 0 XP. Better luck next time!`
  ├─ await sceneModule.showNarration(xpLine, { html: true })   // no speaker → system-voice line
  │
  ├─ const result = await apiProceed()
  ├─ updateGameState(result.state)
  ├─ await playRoomTransition(result.state)
  └─ updateUI()
```

## Infrastructure Reuse Map

| Step | Existing Function | File | Line |
|------|------------------|------|------|
| Overlay teardown | `actions.setContent('')` | (existing) | — |
| Narration box | `sceneModule.showNarration(html, opts)` | `public/game.js` | 1970 |
| Japanese text | `renderJpSentence(tokens, knownWords, wordDict)` | `public/js/ui/bootstrap-client.js` | — |
| XP popup | `pixiXpPopup` (re-exported `showXpPopup`) | `public/js/pixi/banners.js` | — |
| Level-up popup | `pixiLevelUpPopup` (re-exported `showLevelUpPopup`) | `public/js/pixi/banners.js` | — |
| Level-up burst | `animateLevelUpForScene(scene, side, index)` | `public/js/pixi/formation.js` | 560 |
| Sprite position | `vfx.spritePos('player', index)` | (existing combat import) | — |
| Room advance | `apiProceed()` + `playRoomTransition()` + `updateUI()` | `public/js/ui/exploration.js` | 633-640 |
| i+1 frame select | `assembleFrame()` + `selectBestFrame()` | `src/game/token-format.js` | — |

Zero new UI functions. Zero new CSS. Zero new animation primitives.

## Dialogue Frames

New entries in `data/dialogue/frame-sources.json` with category `gameMaster_finish`. Native Japanese, no conjugations (no ます / past / て-form / volitional), no copula, scaling 1→3 content words:

| Content Words | Raw | Breakdown |
|---|---|---|
| 1 | `上手！` | 上手 (skillful) — interjection |
| 1 | `楽しい！` | 楽しい (fun) — plain i-adjective |
| 2 | `楽しい遊び！` | 楽しい + 遊び (play/game, noun) |
| 2 | `言葉の遊び！` | 言葉 + の + 遊び |
| 3 | `楽しい言葉の遊び！` | 楽しい + 言葉 + の + 遊び |

Only the particle の is introduced — the same particle already present in the `gameMaster_ask` pool. The server selects the best i+1-eligible frame using the existing pipeline (`assembleFrame` → `isEligible` → `scoreCandidate`). All words must exist in `data/dictionary.json` — per CLAUDE.md, the dictionary is not modified without explicit user confirmation. If any of the above words are absent, the implementation plan must surface that and pause for user review before edits to the dictionary.

## Backend Changes

### `data/dialogue/frame-sources.json`
Add the five `gameMaster_finish` entries above.

### Regenerate + validate
```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

### `src/game/dialogue-loader.js`
Add `_gameMasterFinishFrames` pool loader + `getGameMasterFinishFrames()` export, mirroring `getGameMasterAskFrames` at line 82. Same three-line pattern; category filter on `frame.category === 'gameMaster_finish'`.

### `src/routes/game/run.js` — `/whack-a-mole-complete`
Inside the existing handler at line 674, before responding:

```js
const knownWords = getKnownWordsFromFsrs(req.user.id);
const knownSet = new Set(knownWords);
const finishFrames = getGameMasterFinishFrames();
const candidates = finishFrames.map(frame => assembleFrame(frame, {}));
const finishDialogue = selectBestFrame(candidates, knownSet) || { tokens: [], words: [] };
```

Attach `finishDialogue` to the response payload alongside the existing `{ score, creditsAwarded, xpGrants, levelUps }`. Same imports / helpers the `/whack-a-mole-dialogue` route at line 686 already uses — no new helpers.

### SRS exposure (no code needed)
Exposure is now derived from rendering (commit `880f105b`, "render-is-exposure"). `public/js/ui/bootstrap-client.js:7,81` — `renderJpSentence` calls `recordExposure(tokens, wordDict, overrides)` via `public/js/ui/exposure-buffer.js` on every render. As soon as the client calls `renderJpSentence(finishDialogue.tokens, ...)`, the words are buffered and flushed to the server. No server-side `exposeWords` call is required in `/whack-a-mole-complete`.

## Frontend Changes

### `public/js/ui/whack-a-mole.js` — `_endGame()` (currently lines 327-363)

Replace the body entirely. The new body:

1. Mark `gameOver = true`, clear timers (unchanged).
2. `await this.apiCompleteWhackAMole(this.score)` and destructure `{ xpGrants, levelUps, finishDialogue }`. Update game state via `this.updateGameState(result.state)`.
3. `this.actions.setContent('')` — removes the `.wam-container` overlay so the scene is visible again.
4. Render + await the GM narration:
   - Build HTML via `renderJpSentence(finishDialogue.tokens, getKnownWords(), wordDict)`.
   - `await sceneModule.showNarration(html, { html: true, speaker: 'Game Master' })`.
5. Compute `perCreatureXp = xpGrants[0]?.xp ?? 0`.
6. If `perCreatureXp > 0`:
   - For each `grant` (map `creatureId` → active-party index): fire `pixiXpPopup(grant.xp, vfx.spritePos('player', index))`.
   - For each `lu` in `levelUps`: `setTimeout(() => pixiLevelUpPopup(lu.newLevel, vfx.spritePos('player', index)), 400)` and `setTimeout(() => animateLevelUpForScene(getSceneManager().currentScene, 'player', index), 400)`.
7. Always show the English narration (no speaker):
   - `perCreatureXp > 0` → `Your team gained {perCreatureXp} XP!`
   - `perCreatureXp === 0` → `Your team gained 0 XP. Better luck next time!`
   - `await sceneModule.showNarration(xpLine, { html: true })`.
8. `const result = await apiProceed(); updateGameState(result.state); await playRoomTransition(result.state); updateUI();`.

New dependencies the WhackAMoleGame class needs injected (added to its `deps` contract in the constructor + `startWhackAMoleGame` call site at `exploration.js:1493`): `sceneModule`, `apiProceed`, and either a passthrough of `renderJpSentence` / `getKnownWords` / `getSceneManager` / `vfx` / `pixiXpPopup` / `pixiLevelUpPopup` / `animateLevelUpForScene` / `playRoomTransition` or — simpler — direct imports at the top of `whack-a-mole.js`. Direct imports are preferred since every one of these is a pure module-level function; injection adds nothing.

### `public/js/ui/exploration.js` — already-interacted branch (lines 955-963)

Currently renders a `.wam-results` card with no exit. Replace with the same auto-proceed pattern as `renderQuiz()` at line 633. Note that `renderWhackAMole` now has a module-level `whackAMoleState` cache (lines 943-952) that resets on roomId change — the interacted-branch code runs AFTER that reset, so the auto-proceed slots in cleanly without touching the cache:

```js
if (room?.interacted) {
  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    await playRoomTransition(result.state);
    updateUI();
  }
  return;
}
```

If a player re-enters a completed whack-a-mole room (floor navigation, back-button-style state restore), just advance. No narration, no card.

## Deletions

- `public/js/ui/whack-a-mole.js:348-362` — the `.wam-results` HTML block and Continue button handler.
- `public/js/ui/exploration.js:955-963` — the interacted-branch `.wam-results` card.
- `public/game.css:4248+` — `.wam-results`, `.wam-results-title`, `.wam-results-score`, `.wam-results-xp`, `.wam-results-levelup`, `.wam-results-credits`, `.wam-continue-btn` blocks. All unreferenced after the above deletions.

## Testing

### Unit tests to add

- `tests/unit/game/whack-a-mole.test.js` — `POST /whack-a-mole-complete` response includes `finishDialogue` with `tokens` and `words` arrays.
- `src/game/dialogue-loader.test.js` (if present, otherwise add) — `getGameMasterFinishFrames()` returns only entries with `category === 'gameMaster_finish'`.

### Dialogue validation

`node scripts/validate-dialogue.js` must pass after regeneration — every content word in the new frames must exist in `data/dictionary.json`.

### Manual playtest (Playwright)

Follow `docs/playtest-guide.md`. Trigger a whack-a-mole room, let the timer expire, confirm:
- The `.wam-container` overlay disappears; GM sprite + player formation are visible.
- The GM narration box appears with the speaker "Game Master" and tokenized Japanese text.
- Dismissing GM narration triggers the English "Your team gained N XP!" line with XP popups floating above each party sprite and level-up bursts for any creatures that leveled up.
- Dismissing the English narration advances to the next room normally.
- Score = 0 path: sprite animations are skipped, but Narration 2 still fires with `"Your team gained 0 XP. Better luck next time!"`. Dismissal advances normally.
- Re-entering a completed whack-a-mole room (if reachable via navigation) auto-proceeds without showing the old results card.

## Edge Cases

- **Score = 0.** `xpGrants` is empty and `perCreatureXp` falls back to `0`. Sprite animations are skipped (nothing to animate), but Narration 2 still fires with `"Your team gained 0 XP. Better luck next time!"`. Dismissal then proceeds normally.
- **Missing finishDialogue on backend failure.** `selectBestFrame` returns `{ tokens: [], words: [] }` fallback — client-side `renderJpSentence([], ...)` produces empty HTML; `showNarration('', ...)` should be guarded with an empty-tokens check so we skip the narration instead of showing an empty box.
- **Scene disposed or not an ExplorationScene by the time `_endGame` runs.** Narration box still works (global), but sprite popups depend on `vfx.spritePos('player', i)` returning a valid position. The existing combat popups handle null positions gracefully — confirm that guard exists; if not, the implementation plan must add a null check before firing each popup.
- **Creature not in active party (XP granted to reserves).** `xpGrants` includes reserves (see `completeWhackAMole` in `exploration-service.js:595-611`). Sprite popups only fire for creatures whose `creatureId` matches an active-party slot — reserves get the XP silently, which matches how combat already handles bench XP.
