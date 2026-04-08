# Universal Tokenization Pipeline

> Pre-tokenize all Japanese game text into a universal format so that rendering, i+1 selection, and exposure tracking share a single data contract — with zero tokenization at runtime.

## Problem

The game shows Japanese text everywhere — NPC dialogue, item names, creature names, combat barks, AI narration. Each of these currently handles tokenization, vocab checking, and rendering differently. The shop system tokenized at offer time via Sudachi. The dialogue filter calls JPDB `/parse` at runtime. AI narration goes through vocab-repair. Creature/item names are rendered ad-hoc.

We need a unified system where every piece of Japanese text the player sees is pre-tokenized into the same format, enabling consistent i+1 selection, rendering, and exposure tracking regardless of the text's origin.

## Status

**Phase 1 (Shop proof-of-concept): COMPLETE and TESTED.**

Validated locally on 2026-04-08 with live playtesting. The shop system uses pre-tokenized frames with i+1 selection, universal token rendering, and base-form exposure tracking. All 1183 unit tests + 17 integration tests passing.

## Universal Token Format

Every piece of Japanese text — handwritten or AI-generated — is stored as a `TokenizedText` object:

```json
{
  "tokens": [
    {"surface": "すみません", "base": "すみません", "reading": "すみません", "meaning": "excuse me/sorry"},
    {"surface": "、"},
    {"surface": "薬草", "base": "薬草", "reading": "やくそう", "meaning": "Medicinal Herb", "entity": true},
    {"surface": "を"},
    {"surface": "ください", "base": "くださる", "reading": "ください", "meaning": "to give / to confer / to bestow"}
  ],
  "words": ["すみません", "薬草", "くださる"]
}
```

### Token types

| Type | Fields | Example |
|------|--------|---------|
| Content word | `surface`, `base`, `reading`, `meaning` | `{"surface": "怒っ", "base": "怒る", "reading": "おこっ", "meaning": "get angry"}` |
| Game entity | Same + `entity: true` | `{"surface": "火竜", "base": "火竜", "reading": "かりゅう", "meaning": "Fire Dragon", "entity": true}` |
| Punctuation / particle | `surface` only | `{"surface": "を"}` or `{"surface": "！"}` |
| Slot (frames only) | `slot` | `{"slot": "item"}` |

### Rules

- **Content words:** All four fields required. `base` is the dictionary form (what gets tracked for exposure). `reading` is the surface form's pronunciation in hiragana (converted from Sudachi's katakana). `meaning` comes from game entity override first, then JP→EN dictionary.
- **Punctuation and particles:** `surface` only. Absence of `base` means "not a trackable word." Particles (が, を, に, て, etc.) are treated the same as punctuation in this format.
- **Grammatical demotions:** Certain words that Sudachi tokenizes with a base form are demoted to surface-only because they function as grammar, not vocabulary. The tokenizer post-processing step demotes: auxiliary verbs in compound constructions (いる/ある/しまう in ている/てある/てしまう), copulas (だ, です), grammatical auxiliaries (ます, ない, た, する, etc.), counter suffixes (接尾辞 like つ in 一つ), and honorific prefixes (接頭辞 like お in お願い).
- **Game entities:** Same as content words plus `entity: true`. Used by the selection logic to allow 2 unknowns per sentence instead of 1.
- **Slot tokens:** Only appear in frame templates before assembly. Replaced with entity tokens at runtime.
- **`words` array:** Pre-extracted base forms of all content words (including entities). Flat list — no sentence grouping. Used for exposure tracking.

### Conjugation handling

Surface form may differ from base form for conjugated verbs/adjectives. The renderer shows the surface (as written), the tracker uses the base (dictionary form):

| Surface (displayed) | Base (tracked) | Reading | Meaning |
|---------------------|----------------|---------|---------|
| 怒っ | 怒る | おこっ | get angry |
| 逃げろ | 逃げる | にげろ | run away |
| 買いたい | 買う | かいたい | buy |
| 強い | 強い | つよい | strong |

## Tokenization Pipeline: Sudachi + Dictionary Merge

### Why not Sudachi alone?

Sudachi is a morphological analyzer — it correctly decomposes Japanese morphology, but language learners think in vocabulary units, not morphemes. Sudachi Mode A splits:

| Phrase | Sudachi output | Learner expects |
|--------|---------------|----------------|
| すみません | すむ + ます + ぬ | すみません (excuse me) |
| お茶 | お + 茶 | お茶 (tea) |
| 一つ | 一 + つ | 一つ (one thing) |
| おはようございます | おはよう + ござる + ます | おはようございます (good morning) |
| お願いします | お + 願い + し + ます | お願いします (please) |
| ありがとうございます | ありがとう + ござい + ます | ありがとうございます (thank you) |

**All three Sudachi modes (A, B, C) produce the same splits** for these phrases — switching modes does not fix the problem. Only Mode C improves おはようございます.

### The merge step

After Sudachi tokenizes, we scan adjacent tokens and check if their concatenated surfaces match a dictionary entry. If so, merge them into a single token with the dictionary's reading and meaning. Greedy longest-match, up to 5 adjacent tokens.

The dictionary (`data/dictionary.json`, 38k entries from JPDB data) serves as the merge lookup. Any compound that a learner treats as one word should be a dictionary entry.

**Validated merges in production:**
- すみ + ませ + ん → すみません (3 tokens merged)
- ありがとう + ござい + ます → ありがとうございます (3 tokens merged)
- お + 願い + し + ます → お願いします (4 tokens merged)
- 一 + つ → 一つ (2 tokens merged)
- お + 茶 → お茶 (2 tokens merged)

Merged tokens are marked with `pos: '_merged'` internally so they skip the demotion step (they're always content words by definition — they matched a dictionary entry).

### Comparison: Sudachi+Merge vs JPDB `/parse`

Tested 20 sentences ranging from beginner to advanced, including slang, keigo, Kansai dialect, and edge cases:

| Category | Sudachi+Merge | JPDB |
|----------|--------------|------|
| Common set phrases (すみません, ありがとう, etc.) | Correct (via merge) | Correct |
| Compounds in dictionary (外国人, 参政権, かもしれない) | Correct (via merge) | Correct |
| Compounds NOT in dictionary (申し訳ございません) | Fails — stays split | Correct |
| Slang (マジパネェ, あざっす) | Correct | Partially fails |
| Half-width katakana (ｱﾘｶﾞﾄｺﾞｻﾞｲﾏｽ) | Correct | Fails (empty result) |
| Kansai dialect (行かへんかったら) | Partially correct | Fails |
| Grammar stripping (ている, させられる) | Keeps morphemes visible | Aggressively collapses |

**For our use case** (handwritten game dialogue for beginners), Sudachi+Merge is sufficient. The cases where JPDB is better (keigo, advanced compounds) won't appear in early game content.

### Planned upgrade: JMDict dictionary

Our current `dictionary.json` has 38k entries. JMDict (the open-source Japanese-English dictionary that JPDB itself builds on) has **216k entries / 458k unique surface forms**. CC-BY-SA licensed, updated daily.

Every compound we tested that our dictionary missed (申し訳ございません, 東日本, etc.) exists in JMDict. Upgrading the merge lookup from 38k to 458k surface forms would dramatically improve compound coverage.

JMDict has meanings + readings but no frequency data. Combine with the JPDB v2.2 frequency CSV (274k entries with frequency ranks) for the complete picture.

**Status:** Design in progress. Will replace `dictionary.json` with JMDict + JPDB frequency after Phase 1 is validated on Railway.

## Three Tokenization Pipelines

All three pipelines produce the same `TokenizedText` format. The renderer and exposure tracker don't know which pipeline produced it.

### Pipeline 1: Game Entities (no tokenizer)

Items, creatures, moves, and NPCs already contain all token data in their JSON definitions. A simple field mapping constructs the token — no Sudachi needed:

```js
function entityToToken(entity) {
  const surface = entity.word || entity.baseWord || entity.name;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.nameEn || entity.baseMeaning;
  return { surface, base: surface, reading, meaning, entity: true };
}
```

### Pipeline 2: Handwritten Frames (Sudachi at build time)

Dialogue frames are hand-curated templates with slot markers for entities. The frame text is tokenized by Sudachi + dictionary merge at build/deploy time.

**Current shop frames (hand-curated):**

| ID | Raw | Content words |
|----|-----|---------------|
| buy_polite | `{item}をください` | くださる |
| buy_excuse_me | `すみません、{item}をください` | すみません, くださる |
| buy_thanks | `{item}をください。ありがとうございます。` | くださる, ありがとうございます |

Build script (`scripts/tokenize-static.js`) reads `data/dialogue/frame-sources.json`, splits at slot markers, batch-tokenizes segments via Sudachi, merges adjacent tokens against the dictionary, enriches with meanings, and writes `data/dialogue/frames.json`.

**Why Sudachi for handwritten frames:** Consistency. If the handwritten base form for ください is "くださる" but Sudachi would produce something different for the same word in AI-generated text, exposure counters diverge. Sudachi as the single authority for all base forms prevents this.

### Pipeline 3: AI-Generated Dialogue (Sudachi in daily batch)

AI dialogue is generated per-user once every 24 hours. After generation, the raw text is tokenized by Sudachi + dictionary merge and enriched with meanings:

1. Daily batch generates raw Japanese text per user (NPC lines, narration, descriptions)
2. Batch pipes generated text through Sudachi → dictionary merge → meaning enrichment
3. Tokenized output stored per-user alongside the raw text
4. At runtime, fetch pre-tokenized version — no tokenization needed

**Status:** Not yet implemented. Designed for Phase 2+.

## Runtime Operations

At runtime, no tokenization happens. Three operations use pre-computed data:

### Frame Assembly

When the game needs dialogue with an entity (shop item, creature bark, NPC greeting), it assembles a frame + entity:

1. Look up the entity from game data (e.g., item from `items.json`)
2. Construct entity token via `entityToToken()`
3. Splice entity token into the frame's slot position
4. Merge entity's base form into the `words` array

Result: a complete `TokenizedText` ready for selection and rendering.

### Selection (i+1 filtering)

For each dialogue point, evaluate all candidate lines against the user's known words:

```js
function isEligible(tokens, knownWords) {
  let unknowns = 0;
  let hasEntity = false;
  for (const token of tokens) {
    if (!token.base) {
      if (SENTENCE_ENDERS.includes(token.surface)) {
        const max = hasEntity ? 2 : 1;
        if (unknowns > max) return false;
        unknowns = 0;
        hasEntity = false;
      }
      continue;
    }
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknowns++;
  }
  const max = hasEntity ? 2 : 1;
  return unknowns <= max;
}
```

**Per-sentence rules:**
- Sentence with a game entity: max 2 unknowns (entity has visual context support)
- Sentence without entity: max 1 unknown (standard i+1)
- Sentence boundaries: 。！？!?

**Scoring:** Score = total unknown content words across all sentences. Among eligible lines, prefer highest score (teaches the most). Tiebreakers: prefer lines containing entity tokens (reinforces game vocabulary), then prefer longer lines (more context). Fall back to 0 unknowns (pure reinforcement) if no i+1 candidates exist.

### Rendering

The client receives the assembled token array + user's known words set. For each token:

- **No `base` field** → render surface as-is (particles, punctuation)
- **`base` exists, word is known** → show surface with furigana reading above (reinforcement)
- **`base` exists, word is unknown** → show surface with reading above and meaning below (teaching)

`renderJpSentence()` supports both the universal token format (uses `base` field) and legacy format (uses `baseForm` + `pos` fields) for backwards compatibility with in-progress game states.

### Exposure Tracking

When the user **actually views** a line, its content tokens are sent to `exposeWords()` with meanings preserved from the tokens:

```js
const exposures = item.tokens
  .filter(t => t.base)
  .map(t => ({ word: t.base, meaning: t.meaning || '' }));
req.gameManager.exposeWords(exposures);
```

Same system as before — increment exposure count per base form, create FSRS card at threshold (5 exposures). Exposure is tracked on view, not on generation or selection.

**Note:** Offer-time exposure (when items are shown to the user) still uses the old code path — exposes `item.word` directly. Purchase-time exposure uses the new token-based path with meanings preserved.

## Test Results (2026-04-08)

### Automated Tests

- **1183 unit tests passing**, 0 failures
- **17 integration tests passing**, 0 failures
- Test files: `tests/unit/token-format.test.js` (18 tests), `tests/unit/tokenize-static.test.js` (7 tests), `tests/unit/sentence-renderer.test.js` (11 tests)

### Live Playtest Results

Two playtest sessions on local dev server, user played through multiple shop encounters.

**Session 1 (initial validation):**
- Bought items: 刀 (katana), 卵 (egg)
- Frame word `くださる` tracked correctly as base form (not surface `ください`)
- Entity words (刀, 鏡, 教科書, リュック, 辞書, 卵) tracked correctly
- Offer-time exposure works (items exposed when shown, not just when purchased)

**Session 2 (after curated frames):**
- 3 curated frames deployed: buy_polite, buy_excuse_me, buy_thanks
- `ありがとうございます` tracked as single merged token (6 exposures after multiple purchases)
- `くださる` accumulated to 9 exposures across sessions
- `すみません` at 0 — i+1 selector correctly waited until user knew enough words
- Dictionary merge confirmed working: すみません and ありがとうございます both merged from Sudachi fragments

**Final exposure counts (session 2):**

| Word | Exposures | Source |
|------|-----------|--------|
| 叩く | 57 | Combat (pre-existing) |
| 火 | 28 | Combat (pre-existing) |
| くださる | 9 | Shop frames (new pipeline) |
| ありがとうございます | 6 | Shop frames (new pipeline, merged) |
| すみません | 0 | Not yet selected by i+1 |

### i+1 Selection Validation

The selector correctly chose frames based on the user's vocabulary:
- Early purchases: `buy_polite` ({item}をください) — simplest frame, only teaches くださる
- After くださる was learned: `buy_thanks` ({item}をください。ありがとうございます。) — adds ありがとうございます as the +1
- `buy_excuse_me` (すみません、{item}をください) eligible once くださる is known (entity + すみません = 2 unknowns, entity present → max 2)

## Infrastructure

### Python on Railway

The Railway deployment needs Python + SudachiPy for the build script (runs at deploy time).

- `requirements.txt` added with `sudachipy>=0.6.8` and `sudachidict-core>=20240109`
- Build script chained in `package.json`: `"build": "node scripts/tokenize-static.js && vite build"`
- SudachiPy + dictionary adds ~100MB to the build image
- Sudachi never runs on the request path — only at build time

**Status:** Configured but not yet deployed to Railway.

## Files

### New files (Phase 1)

| File | Purpose |
|------|---------|
| `src/game/token-format.js` | Core pipeline: `entityToToken()`, `assembleFrame()`, `isEligible()`, `scoreCandidate()` |
| `data/dialogue/frame-sources.json` | Hand-curated frame templates (3 shop frames) |
| `data/dialogue/frames.json` | Tokenized frame output (generated by build script) |
| `scripts/tokenize-static.js` | Build script: Sudachi + dictionary merge + meaning enrichment |
| `tests/unit/token-format.test.js` | 18 tests for core pipeline functions |
| `tests/unit/tokenize-static.test.js` | 7 tests for build script output validation |
| `requirements.txt` | Python dependencies for Railway |

### Modified files (Phase 1)

| File | Change |
|------|--------|
| `src/tokenizer.js` | Added `tokenizeBatch(texts)` export |
| `src/routes/game/run.js` | Replaced inline Sudachi with frame assembly + i+1 selection |
| `public/js/ui/bootstrap-client.js` | `renderJpSentence()` supports both universal and legacy token formats |
| `public/js/ui/exploration.js` | Client reads `item.tokens` (new) with `item.shopTokens` fallback (legacy) |
| `tests/unit/sentence-renderer.test.js` | Added 4 tests for universal token format |
| `package.json` | Build script chained before vite build |

### Unchanged systems

- JPDB integration for word states / FSRS — untouched
- Vocab manager / suggestion system — untouched
- Entity JSON structure (items, creatures, moves, NPCs) — fields already have what we need
- Exposure tracking (`exposeWords()`) — same interface, fed from tokens
- Forge skills — already produce the entity fields needed for `entityToToken()`

## Known Limitations

### Exposure tracking key collisions
Exposure is tracked by base form string only. If two words share the same base form but different meanings (e.g., はし = bridge vs chopsticks), they collide. Low risk for Phase 1 (shop items are unique words). For Phase 2+, consider compound key `word::meaning` or JPDB vocabulary IDs.

### Dictionary coverage
Current `dictionary.json` has 38k entries. Some learner-friendly compounds are missing (申し訳ございません, 東日本). Planned upgrade to JMDict (458k surface forms) will address this.

### Offer-time vs purchase-time exposure
Items get exposed twice — once at offer time (old code, `item.word` only) and once at purchase time (new code, all content tokens with meanings). The double-exposure is intentional (seeing the item name in the offer list is a real exposure), but the offer-time path doesn't use the universal token format yet.

## Implementation Scope

**Phase 1 (COMPLETE): Shop item purchase proof-of-concept.**

Proves the full pipeline end-to-end: pre-tokenized frames, entity-to-token mapping, frame assembly, i+1 selection, rendering, and exposure tracking.

**Phase 2 (planned): Dictionary upgrade to JMDict + JPDB frequency.**

Replace `dictionary.json` with JMDict (458k surface forms, CC-BY-SA) for dramatically better merge coverage. Add JPDB v2.2 frequency CSV (274k entries) for word ranking. Rename current dictionary to `old-jpdb-dictionary.json`.

**Phase 3+ (future): Roll out to other systems.**

Extend to combat barks, NPC greetings, creature names, AI-generated dialogue, and other game text. The token format and runtime operations are designed for this — Phase 3+ is content migration, not architecture work.
