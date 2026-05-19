# Learn TTS Replay Design

**Date:** 2026-05-19  
**Status:** Approved design

## Goal

Add audio replay controls to the dialogue Learn overlay so players can replay:

- The full Japanese sentence being explained.
- Each Japanese word or phrase in the lesson breakdown.

The controls should reuse the existing dialogue audio system and cache on a neutral `speakerId + text` basis. The Learn lesson is generated dynamically from JSON, so audio should be derived from the rendered lesson data rather than added to the AI schema.

## Approved UI Direction

The approved preview is:

`/Users/michiarohrssen/.cursor/projects/Users-michiarohrssen-Documents-Claude-koto-dev/canvases/learn-tts-replay-preview.canvas.tsx`

The implementation should match these decisions:

- Use the exact same visible audio button as the dialogue replay control: the `♪` square button styled by `npc-dialogue-tool npc-dialogue-audio`.
- Do not introduce a separate labeled `Listen`, `Play word`, or pill-style control.
- Right-align every replay button in a fixed action column.
- Put one replay button in the `Sentence` section header.
- Put one replay button at the right edge of each breakdown item.
- Do not add a separate replay button to the `Pronunciation` section; replaying the sentence already covers sentence pronunciation.

The Learn-specific CSS may add layout classes for placement, but it should not duplicate or visually fork the audio button styling. If a Learn button needs a contextual class, it should be additive, for example:

```html
<button class="npc-dialogue-tool npc-dialogue-audio npc-dialogue-learn-audio" type="button" aria-label="Play sentence audio">♪</button>
```

## Current Context

The Learn overlay is rendered inside `public/js/ui/npc-dialogue-card.js`.

Relevant existing pieces:

- `renderLearnTakeover()` renders the Learn lesson sections from dynamic lesson JSON.
- `learnDialogue()` in `public/js/api.js` calls `POST /api/dialogue/learn`.
- `generateDialogueLearnLesson()` returns a lesson with `sourceText`, `pronunciation`, `translation`, `breakdown`, `grammarHints`, and `otherTips`.
- `playDialogueLineAudio({ text, speakerId })` in `public/js/tts.js` calls `POST /api/tts/dialogue-line`, then plays the returned cached URL.
- `TtsDialogueCache` in `src/services/tts-dialogue-cache.js` stores files by `MD5(speakerId:text).slice(0, 12) + ".wav"`.
- `TtsWordCache` exists, but it keys by `speakerId:speed:text`, which is not the desired cache shape for this feature.

## Audio Voice And Cache Policy

All Learn replay audio should use one neutral pronunciation voice, not the NPC or creature speaker voice.

Use the existing neutral dictionary/pronunciation speaker (`11`, currently `WORD_SPEAKER_ID` in `public/js/tts.js`) as the Learn replay speaker. The implementation should avoid scattering magic numbers by exporting or centralizing a named constant such as:

```js
export const NEUTRAL_PRONUNCIATION_SPEAKER_ID = 11;
```

Both sentence replay and breakdown-item replay should go through the shared dialogue line cache, not the word cache:

- Sentence: `speakerId=11 + lesson.sourceText`
- Breakdown item: `speakerId=11 + item.text`

This intentionally produces one reusable file for the same Learn text across all NPCs, users, and lessons. It also keeps the cache key aligned with the requested `speakerId + text` behavior.

Do not include NPC identity, lesson cache key, user ID, page index, pronunciation text, translation, or AI provider metadata in the audio cache key.

## Dynamic Lesson Data

Do not change the Learn lesson AI schema for audio.

Audio source text should be derived from existing lesson fields:

- Full sentence button uses `lesson.sourceText || sourceText`.
- Breakdown buttons use each `lesson.breakdown[].text`.

If a field is empty or missing, omit that specific replay button. The rest of the lesson should still render.

The implementation should not ask the model to provide audio keys, speaker IDs, filenames, or TTS metadata. Audio is a deterministic client/server concern.

## Client Integration

Add a small Learn-friendly helper in `public/js/tts.js` so the neutral speaker choice is centralized and tests can assert the behavior directly.

Preferred shape:

```js
export async function playNeutralLearnAudio(text) {
  return playDialogueLineAudio({
    text,
    speakerId: NEUTRAL_PRONUNCIATION_SPEAKER_ID
  });
}
```

`npc-dialogue-card.js` should import that helper and attach click handlers after the Learn takeover is inserted.

Because Learn replay buttons intentionally share the visible `npc-dialogue-audio` class, event hookup should target a Learn-specific class or data attribute such as `npc-dialogue-learn-audio`. Do not use a broad `actionArea.querySelector('.npc-dialogue-audio')` for Learn replay wiring, because the main dialogue card already has its own replay button.

Button behavior:

- Stop any currently playing TTS through the existing `playDialogueLineAudio()` / `playAudioUrl()` path.
- Disable only the clicked replay button while its request is in flight.
- Re-enable the button after playback request resolution unless the dialogue card has been resolved or the Learn overlay has been closed.
- Failure should be quiet and non-blocking, consistent with current TTS behavior.
- Audio replay should not spend crystals, advance dialogue, mutate lesson state, mark words known, or regenerate the lesson.

## Layout

The Learn overlay should use a fixed right-side action column for replay controls.

Sentence section:

- Header row becomes a two-column layout: section title on the left, audio button on the right.
- The audio button should align with the right edge of the section content.

Breakdown item:

- Each item becomes a two-column layout: token explanation on the left, audio button on the right.
- The right column width should match the existing dialogue audio button width (`34px`) plus appropriate gap.
- Long explanations should wrap inside the left column without pushing the audio button out of alignment.

Suggested class names:

- `npc-dialogue-learn-section-head`
- `npc-dialogue-learn-section-action`
- `npc-dialogue-learn-token-grid`
- `npc-dialogue-learn-token-copy`
- `npc-dialogue-learn-token-action`

These classes are for alignment only. Button visuals should still come from `npc-dialogue-tool npc-dialogue-audio`.

## Accessibility

Use clear aria labels because all visible buttons share the `♪` glyph:

- Sentence button: `aria-label="Play sentence audio"`
- Breakdown item button: `aria-label="Play audio for 花"` or equivalent with the item text.

Buttons should be real `<button type="button">` elements so keyboard activation works.

If the text is missing, disabled buttons should not be focusable unless there is a clear accessible reason to render them. Prefer omitting the button for missing text.

## Testing

Add or update unit tests around `public/js/ui/npc-dialogue-card.js`:

- Successful Learn render includes a sentence replay button with `npc-dialogue-tool npc-dialogue-audio`.
- Successful Learn render includes breakdown replay buttons with the same audio button classes.
- Replay buttons call the neutral Learn audio helper with `lesson.sourceText` and `breakdown[].text`.
- Replay buttons do not call `learnDialogue()` again and do not change crystal state.
- Missing breakdown text omits only that item's replay button.
- Buttons remain right-column aligned in the rendered markup through class assertions.

Add or update `public/js/tts.js` tests if a new helper is introduced:

- `playNeutralLearnAudio(text)` delegates to `/api/tts/dialogue-line` with `speakerId: 11`.
- The helper returns the existing audio metadata from `playDialogueLineAudio()`.

Server-side tests are only needed if the `/api/tts/dialogue-line` contract changes. The preferred implementation should not require server changes.

## Out Of Scope

- No change to `data/dialogue/frames.json` or the static frames pipeline.
- No change to the Learn lesson AI prompt or schema.
- No new audio cache directory.
- No per-NPC Learn voices.
- No autoplay for Learn lessons.
- No audio for English translations, grammar hints, or other tips.
- No visual redesign of the Learn overlay beyond aligned replay controls.

