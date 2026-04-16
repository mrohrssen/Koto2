# Expand Universal Tokenization: NPC Greetings + Item Names

> Extend the universal tokenization pipeline (Phase 1: shop purchase text) to cover friendly NPC greetings and item name display on shop cards.

## Problem

The friendly NPC shop has two untokenized text displays:

1. **NPC greeting** — picks a random raw string from `npc.shopGreetings || ['こんにちは！']` and renders it as plain text. No i+1 selection, no furigana, no exposure tracking.
2. **Item names on cards** — rendered as `${item.word} (${item.reading})` plain text. No known/unknown styling, no exposure tracking from seeing the card.

Meanwhile, the purchase dialogue (what the player "says" when buying) already uses the full universal pipeline: pre-tokenized frames, i+1 selection, `renderJpSentence()`, exposure tracking. The greeting and item cards should use the same system.

## Design

### New Greeting Frames

Add 5 greeting frames to `data/dialogue/frame-sources.json` with `category: "greeting"`, `slots: []`. Each greeting is a single comma-joined sentence so the i+1 budget (max 1 unknown per sentence) forces a learning chain:

| ID | Raw | Teaches | Requires known |
|----|-----|---------|----------------|
| `greet_hello` | こんにちは！ | こんにちは (hello) | — |
| `greet_hello_please` | こんにちは、どうぞ！ | どうぞ (go ahead / please) | こんにちは |
| `greet_welcome_please` | いらっしゃいませ、どうぞ！ | いらっしゃいませ (welcome) | どうぞ |
| `greet_welcome_slow` | いらっしゃいませ、ゆっくりどうぞ！ | ゆっくり (take your time / slowly) | いらっしゃいませ, どうぞ |
| `greet_welcome_browse` | いらっしゃいませ、ゆっくり見てください！ | 見る (to look / to see) | いらっしゃいませ, ゆっくり, くださる* |

*くださる is learned from the shop purchase frames.

No slots — greetings are standalone sentences. Tokenized at build time by the existing `scripts/tokenize-static.js` pipeline (Sudachi + dictionary merge). No new build steps.

### Item Name Tokens

Item names don't need frames — they're single game entities. `entityToToken()` (already in `src/game/token-format.js`) constructs the token from existing item fields:

```json
{"surface": "薬草", "base": "薬草", "reading": "やくそう", "meaning": "Medicinal Herb", "entity": true}
```

Wrapped in a one-element token array and rendered through `renderJpSentence()` — same renderer as everything else.

### Server Changes: `/friendly-npc-offers`

This endpoint already assembles purchase tokens. Two additions:

**Greeting selection:** Load greeting frames by category via `getGreetingFrames()` in `run.js` (same pattern as `getShopFrames()`). Since greeting frames have no slots, they don't need `assembleFrame()` — they're already complete `TokenizedText` objects from the build script. Run i+1 selection (same `isEligible`/`scoreCandidate` used for shop frames), attach the winning greeting to the response.

**Item name tokens:** For each offered item, call `entityToToken(item)` and attach as `item.nameToken`.

**Exposure tracking:** Include greeting content words in the existing `exposeWords()` call alongside item words.

Response shape change:

```json
{
  "offered": [
    { "id": "yakusou", "word": "薬草", "nameToken": {...}, "tokens": [...], ... }
  ],
  "greeting": { "tokens": [...], "words": [...] },
  "state": { ... }
}
```

### Client Changes: `exploration.js`

**Greeting (lines 1199-1207):** Replace random raw string with tokenized rendering:

```js
// Before: raw string, no learning value
const greeting = greetings[Math.floor(Math.random() * greetings.length)];
sceneModule.showNarration(greeting, { speaker: npc.nameEn });

// After: universal token rendering
const html = renderJpSentence(greeting.tokens, getKnownWords(), wordDict, {}, false);
sceneModule.showNarration(html, { html: true, speaker: npc.nameEn });
```

**Item card titles (lines 1211-1217):** Replace plain text with tokenized rendering:

```js
// Before: plain text
title: `${item.word} (${item.reading})`

// After: universal token rendering
title: item.nameToken
  ? renderJpSentence([item.nameToken], getKnownWords(), wordDict, {}, false)
  : `${item.word} (${item.reading})`
```

Same `renderJpSentence()` call used by the purchase dialogue. Furigana and known/unknown styling come for free.

### What We Don't Touch

- **Combat NPC dialogue** — stays on the legacy `dialogue-filter.js` / `npc-lines.json` system. Separate migration.
- **Post-combat shop** — currently disabled (`rollPostCombatShop` returns null). Will use universal tokens when re-enabled.
- **`npcs.json` data** — `shopGreetings` field stays in the file but is no longer read by the client.
- **Build pipeline** — no new scripts or dependencies. Existing `tokenize-static.js` handles the new frames.

## Files Changed

| File | Change |
|------|--------|
| `data/dialogue/frame-sources.json` | Add 5 greeting frames (`category: "greeting"`) |
| `data/dialogue/frames.json` | Rebuilt by existing build script (generated) |
| `src/routes/game/run.js` | Add `getGreetingFrames()` loader + greeting selection + `nameToken` attachment in `/friendly-npc-offers` |
| `public/js/ui/exploration.js` | Render greeting + item card titles via `renderJpSentence()` |

No new files. No new dependencies. No new build steps.
