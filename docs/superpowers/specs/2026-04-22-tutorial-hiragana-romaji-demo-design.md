# Tutorial: Hiragana + Romaji Translator Demo in Prologue

**Date:** 2026-04-22
**Status:** Approved

## Problem

Cid hands the player a "Translator" in the prologue (`prologue-04-translator`) and then explains what it does across five talky abstract pages (`prologue-05-translator-on` through `prologue-09-partners`). At no point does she actually *show* it working — by the time the player sees their first Japanese word, Cid is gone and the demonstration moment has passed. New players hit real Japanese content cold, without having seen the visual pattern (ruby romaji above, English gloss below) that the rest of the game leans on.

## Scope

Replace the filler pages 07–09 with a concrete five-page teaching moment where Cid demonstrates the Translator by rendering `こんにちは` in the game's standard "pronunciation-above, definition-below" layout. Players can tap the word to see its dictionary entry, then tap outside to advance.

Keep pages 05 and 06 — they set up the "why" before the demo. Everything downstream of the demo (starter gift, first run, combat) is unchanged.

Out of scope: reworking any other prologue content, adding additional demo words, changing the Translator's runtime behavior anywhere else in the game.

## Final prologue sequence

```
prologue-01-garbled          (kept — "?????" unreadable)
prologue-02-garbled          (kept)
prologue-03-understand       (kept — "Do you understand me NOW?" yes-choice)
prologue-04-translator       (kept — "take this... the Translator")
prologue-05-translator-on    (kept — "Our world speaks Japanese...")
prologue-06-intro            (kept — "Every creature, human, and item here is Japanese...")

── NEW: five-page demo ──
prologue-translator-try      "Let's give it a try!"
prologue-translator-how      "The Translator will automatically show the pronunciation above any Japanese word, and the definition below."
prologue-translator-demo     (jpDemo — renders こんにちは via renderJpSentence)
prologue-translator-reaction "Cool, right?"
prologue-translator-click    "You can also tap any word in dialogue to see its full definition. Tap outside the box to continue."

── DELETED ──
prologue-07-world            (filler)
prologue-08-creatures        (filler)
prologue-09-partners         (filler)

── CONTINUES UNCHANGED ──
prologue-10-disruption       ("But enough talking — let's get right into your first adventure.")
prologue-11-calming
prologue-12-combat
prologue-13-exploration
prologue-starter-gift
prologue-lets-go
```

## Changes

### 1. New frame — `data/dialogue/frame-sources.json`

Add one `cid` category frame with group `tutorial-translator-demo`:

```json
{
  "id": "cid_tutorial-translator-demo_0",
  "category": "cid",
  "group": "tutorial-translator-demo",
  "raw": "こんにちは",
  "slots": []
}
```

Then regenerate and validate:

```bash
node scripts/tokenize-static.js
node scripts/validate-dialogue.js
```

`こんにちは` is already in `data/live-dictionary.json` (reading `こんにちは`, meaning `"hello / good day / good afternoon"`), so validation will pass.

### 2. Prologue content — `data/prologue.json`

- Insert five new entries between `prologue-06-intro` and `prologue-10-disruption`.
- Delete `prologue-07-world`, `prologue-08-creatures`, `prologue-09-partners`.
- The new `jpDemo` entry references the frame by `frameGroup`, not by inline tokens.

```json
{ "id": "prologue-translator-try",      "speaker": "Cid", "narration": "Let's give it a try!" },
{ "id": "prologue-translator-how",      "speaker": "Cid", "narration": "The Translator will automatically show the pronunciation above any Japanese word, and the definition below." },
{ "id": "prologue-translator-demo",     "speaker": "Cid", "type": "jpDemo", "frameGroup": "tutorial-translator-demo" },
{ "id": "prologue-translator-reaction", "speaker": "Cid", "narration": "Cool, right?" },
{ "id": "prologue-translator-click",    "speaker": "Cid", "narration": "You can also tap any word in dialogue to see its full definition. Tap outside the box to continue." }
```

Spelling note: intentionally using "pronunciation", "definition", "its" (not "it's") — these are player-facing and go into learning memory alongside the Japanese.

### 3. Server — resolve `jpDemo` in the prologue cache

**File:** `src/routes/game/misc.js` (lines 299–307 today)

Augment the existing lazy `_prologueCache` builder so `jpDemo` entries get their `tokens` field resolved from the dialogue-loader. Use the already-exported `getCidScripts()` from `src/game/dialogue-loader.js:80` (currently unused — this becomes its first consumer). Dialogue pools load synchronously at boot (`server.js:78` calls `loadDialoguePools` before routes mount), so lookup is guaranteed populated.

```js
import { getCidScripts } from '../../game/dialogue-loader.js';

let _prologueCache = null;
router.get('/prologue', (_req, res) => {
  if (!_prologueCache) {
    const filePath = join(__dirname, '../../../data/prologue.json');
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    _prologueCache = raw.map(scene => {
      if (scene.type === 'jpDemo' && scene.frameGroup) {
        const script = getCidScripts().find(s => s.id === scene.frameGroup);
        const tokens = script?.lines?.[0]?.tokens;
        return tokens ? { ...scene, tokens } : scene;
      }
      return scene;
    });
  }
  res.json(_prologueCache);
});
```

Not using `getEligibleFrameTokens` here: that wrapper applies i+1 eligibility against a `knownSet`, which is unnecessary for a new player (zero known words) rendering a frame with exactly one unknown content word — it would pass trivially. The raw `frame.tokens` are already the right shape for `renderJpSentence`.

If a future prologue ever adds a multi-entry or multi-word demo that needs filtering, swap the two-line lookup for `getEligibleFrameTokens(script.lines[0], new Set())`. Not worth the wrapper today.

### 4. Client — one new branch in `playPrologue`

**File:** `public/game.js` (lines 818–886 today)

Insert one branch inside the existing `for (const prologueScene of _prologueCache)` loop, **before** the `type === 'garbled'` check at line 854. All referenced symbols are already wired:

- `renderJpSentence`, `getKnownWords` — imported at line 120
- `narrationBox.show(html, { html: true, speaker })` — used two lines below at 883
- `window.gameState.wordDictionary` — populated at line 782 during `loadKnownWords()` (called at line 2101, before `playPrologue()` runs at 2113 or 2118)
- `wordDict` construction pattern mirrors `public/js/ui/speech-bubble.js:52-53` and `public/js/ui/exploration.js:969`

```js
if (prologueScene.type === 'jpDemo' && prologueScene.tokens) {
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  const html = renderJpSentence(prologueScene.tokens, getKnownWords(), wordDict, {}, false);
  await narrationBox.show(html, {
    html: true,
    speaker: prologueScene.speaker || undefined
  });
  continue;
}
```

`useKanji: false` is correct — the prologue is pre-Area-1, players are in the hiragana-first path.

## Why this design requires no new functions

Every piece of machinery the demo needs already exists and is already wired:

| Need | Already provided by |
|---|---|
| Word-in-dictionary validation | `scripts/validate-dialogue.js` |
| Japanese → tokens + meaning | `scripts/tokenize-static.js` + Sudachi pipeline |
| Server-side frame lookup by group | `getCidScripts()` at `dialogue-loader.js:80` |
| Tokens → HTML with ruby + stacked gloss | `renderJpSentence` at `bootstrap-client.js:78` |
| HTML → narration box with click-to-advance | `narrationBox.show(html, { html: true })` at `narration-box.js:169` |
| Tap word → dictionary popup | `dialogueLookup.attachWordClickHandlers` auto-invoked at `narration-box.js:218` |

The only code additions are (a) one augmented cache builder in `misc.js`, (b) one branch in `playPrologue`. Total net lines of logic: ~12.

## Verification

1. **Unit — dialogue loader.** Add a case in `tests/unit/dialogue-loader.test.js` asserting `getCidScripts()` returns a script with `id === 'tutorial-translator-demo'` and `lines[0].tokens` non-empty.
2. **Unit — prologue route resolution.** Add a test (new file or extend an existing `tests/unit/routes/…` if one exists for `misc.js`) that hits the `/prologue` handler and asserts the `prologue-translator-demo` entry in the response has a `tokens` array.
3. **Integration — tokenize pipeline.** `node scripts/tokenize-static.js && node scripts/validate-dialogue.js` must exit clean.
4. **Golden/smoke prologue test.** Before landing: grep for any existing prologue playtest or smoke test and confirm expected page count / entry IDs haven't hardcoded against the now-deleted 07–09. If such a test exists, update it alongside the content changes.
5. **Manual playtest.** Reset the prologue (`POST /api/game/prologue-reset`), reload `http://localhost:5173`, play through. Verify:
   - Pages 07–09 absent.
   - Five new pages appear after page 06, in order.
   - `こんにちは` renders with `konnichiwa` ruby above and `hello` stacked below.
   - Tapping `こんにちは` opens the dictionary popup with full definition.
   - Tapping outside the narration box advances to the next page.
   - Starter creature gift and first-run transition still function after the demo sequence.
6. **Visual screenshot.** Capture the demo page via Playwright per the "Visual Verification Rule" in CLAUDE.md.

## Risk

**Low.** Changes are content-driven plus two tiny code touchpoints, and the demo runs only once per account (prologue is gated behind `meta.prologueComplete`). The biggest practical risk is a golden/smoke test asserting exact prologue entry IDs — which is why verification step 4 is explicit. No downstream systems depend on pages 07–09 individually (confirmed by grep: no code references them by id).

## Not doing

- Not touching any other prologue entry text, flow, or structure.
- Not introducing a new `jpDemo` rendering path anywhere outside the prologue — if a future tutorial elsewhere wants this shape, it can reuse the same frame-resolution pattern, but that's a separate spec.
- Not changing `getEligibleFrameTokens` or any other already-shipped helper.
- Not adding a new client-side helper, module, or fetch.
