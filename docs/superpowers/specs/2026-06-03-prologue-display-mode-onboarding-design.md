# Prologue Display Mode Onboarding Design

**Date:** 2026-06-03
**Status:** Proposed

## Problem

New players currently default into hiragana-first Japanese display without being asked whether they already know hiragana. Koto already has a per-player `meta.japaneseDisplayMode` field with two useful modes:

- `hiragana`: player-facing Hiragana mode. Main Japanese text uses hiragana readings, with romaji pronunciation guides.
- `natural`: player-facing Kanji mode. Main Japanese text uses natural Japanese surface forms when available, with hiragana pronunciation guides.

The missing piece is a simple onboarding choice and an easy per-player Settings toggle. This change should not become a broad rendering cleanup. Some surfaces still force hiragana today, and those can be handled later.

## Goals

- Add one Cid prologue question after the Translator is introduced.
- Let the player choose Hiragana mode or Kanji mode during onboarding.
- Save the choice on the current player's game meta, not in shared/global server settings.
- Add an **Enable Kanji mode** Settings toggle that updates the same per-player meta field.
- Keep the scope limited to setting the preference. Rendering gaps can be fixed in follow-up work.

## Non-Goals

- Do not add a Katakana question.
- Do not redesign the prologue.
- Do not convert every combat label, creature label, move label, or minigame surface to respect Kanji mode in this pass.
- Do not store this preference in `/api/settings` or `.jrpg-settings.json`, because those are shared server settings rather than per-player save state.
- Do not edit `data/dictionary.json`.

## Prologue Flow

The new question appears after `prologue-06-intro` and before `prologue-translator-try`, so the player chooses a display mode before the Translator demo renders.

Cid asks:

> Do you know the Japanese alphabet Hiragana?

Choices:

- `Yes, set Kanji mode`
- `No, set Hiragana mode until I learn it`

If the player chooses yes, Cid says:

> Great, I'll set the Translator to Kanji mode.

If the player chooses no, Cid says:

> Great, I'll set the Translator to Hiragana mode.

Then Cid says:

> You're all set! You can always adjust these settings yourself if you need to.

All new prologue copy is English, so it does not introduce new static Japanese text or dialogue-frame tokenization requirements.

## Data Model

Use the existing per-player meta field as the source of truth:

- `meta.japaneseDisplayMode = 'hiragana'` means Hiragana mode.
- `meta.japaneseDisplayMode = 'natural'` means player-facing Kanji mode.

Keep `meta.kanaMode` only as legacy compatibility. New code should read and write `meta.japaneseDisplayMode`.

## API

Add a clearly named per-player game endpoint:

`POST /api/game/japanese-display-mode`

Request body:

```json
{ "mode": "hiragana" }
```

or:

```json
{ "mode": "natural" }
```

Behavior:

- Requires the normal authenticated game route context.
- Validates that `mode` is exactly `hiragana` or `natural`.
- Writes `req.gameManager.getMeta().japaneseDisplayMode`.
- Updates legacy `meta.kanaMode` consistently for compatibility:
  - `hiragana` -> `kanaMode: true`
  - `natural` -> `kanaMode: false`
- Saves the game.
- Returns `{ ok: true, japaneseDisplayMode, kanaMode, state }`, where `state` is the enriched game state after saving.

The existing `/api/game/kana-mode` endpoint can remain for compatibility, but new onboarding and Settings code should use the new endpoint.

## Client Behavior

The prologue runner should support a choice side effect that calls the new display-mode endpoint immediately after the player picks one of the two answers. The local `gameState.meta.japaneseDisplayMode` should update from the response so subsequent UI can reflect the chosen mode.

Settings should show **Enable Kanji mode** near the learning settings at the top of the Settings panel:

- Toggle on: save `natural`.
- Toggle off: save `hiragana`.
- Initial checked state comes from `gameState.meta.japaneseDisplayMode === 'natural'`.

The Settings toggle should use the new game endpoint, not `saveServerSettings()`.

## Rendering Scope

This feature only establishes the per-player preference through onboarding and Settings. It does not promise full rendering parity across every surface.

Surfaces that already accept `japaneseDisplayMode` can continue to benefit from it. Surfaces that currently force hiragana can remain unchanged until a later rendering pass.

## Testing

Automated tests should cover:

- `POST /api/game/japanese-display-mode` accepts `hiragana` and `natural`, rejects invalid modes, saves meta, and returns updated state.
- New meta defaults remain safe for existing players.
- The prologue data includes the Hiragana question, both choices, the two conditional Cid responses, and the final settings reminder.
- The prologue client maps each choice to the correct endpoint mode.
- The Settings modal renders **Enable Kanji mode** and saves through the per-player endpoint rather than shared `/api/settings`.

Manual verification should cover:

- Fresh onboarding, choose **Yes, set Kanji mode**, then confirm Settings toggle is enabled.
- Fresh onboarding or reset prologue, choose **No, set Hiragana mode until I learn it**, then confirm Settings toggle is disabled.
- Toggle **Enable Kanji mode** in Settings and confirm the saved game state changes without requiring logout.
