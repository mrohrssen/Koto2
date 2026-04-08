# Universal Tokenization Pipeline

> Pre-tokenize all Japanese game text into a universal format so that rendering, i+1 selection, and exposure tracking share a single data contract — with zero tokenization at runtime.

## Problem

The game shows Japanese text everywhere — NPC dialogue, item names, creature names, combat barks, AI narration. Each of these currently handles tokenization, vocab checking, and rendering differently. The shop system tokenizes at offer time via Sudachi. The dialogue filter calls JPDB `/parse` at runtime. AI narration goes through vocab-repair. Creature/item names are rendered ad-hoc.

We need a unified system where every piece of Japanese text the player sees is pre-tokenized into the same format, enabling consistent i+1 selection, rendering, and exposure tracking regardless of the text's origin.

## Universal Token Format

Every piece of Japanese text — handwritten or AI-generated — is stored as a `TokenizedText` object:

```json
{
  "tokens": [
    {"surface": "薬草", "base": "薬草", "reading": "やくそう", "meaning": "Medicinal Herb", "entity": true},
    {"surface": "を"},
    {"surface": "一つ", "base": "一つ", "reading": "ひとつ", "meaning": "one (thing)"},
    {"surface": "ください", "base": "くださる", "reading": "ください", "meaning": "please give"}
  ],
  "words": ["薬草", "一つ", "くださる"]
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
- **Grammatical demotions:** Certain words that Sudachi tokenizes with a base form are demoted to surface-only (non-content) because they function as grammar, not vocabulary. The tokenizer post-processing step demotes: auxiliary verbs in compound constructions (いる/ある/しまう in ている/てある/てしまう), copulas (だ, です), and other grammatical auxiliaries (ます, ない, た, etc.). These are always-known grammar the player doesn't need to "learn" as vocabulary.
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

## Three Tokenization Pipelines

All three pipelines produce the same `TokenizedText` format. The renderer and exposure tracker don't know which pipeline produced it.

### Pipeline 1: Game Entities (no tokenizer)

Items, creatures, moves, and NPCs already contain all token data in their JSON definitions. A simple field mapping constructs the token — no Sudachi needed:

```js
function entityToToken(entity) {
  return {
    surface: entity.word,     // or baseWord, name — varies by entity type
    base: entity.word,
    reading: entity.reading,  // or baseReading
    meaning: entity.nameEn,   // or baseMeaning
    entity: true
  };
}
```

This runs at the point of use (assembly time). Entity JSON fields are the source of truth — forge skills (`/creature-forge`, `/item-forge`, etc.) already produce these fields at creation time.

### Pipeline 2: Handwritten Frames (Sudachi at build time)

Dialogue frames are templates with slot markers for entities. The frame text (everything except the slot) is tokenized by Sudachi at build/deploy time.

**Example source frame:**
```
"{item}を一つください"
```

**Tokenized output (stored in `data/dialogue/frames.json`):**
```json
{
  "id": "buy_polite_counting",
  "category": "shop",
  "raw": "{item}を一つください",
  "tokens": [
    {"slot": "item"},
    {"surface": "を"},
    {"surface": "一つ", "base": "一つ", "reading": "ひとつ", "meaning": "one (thing)"},
    {"surface": "ください", "base": "くださる", "reading": "ください", "meaning": "please give"}
  ],
  "words": ["一つ", "くださる"]
}
```

A build script (`scripts/tokenize-static.js`) reads all frame sources, runs them through Sudachi, enriches with meanings, and writes the tokenized JSON. A content-hash cache makes re-runs fast and idempotent — unchanged frames skip re-tokenization.

**Why Sudachi for handwritten frames:** Consistency. If the handwritten base form for ください is "くださる" but Sudachi would produce something different for the same word in AI-generated text, exposure counters diverge. Sudachi as the single authority for all base forms prevents this.

### Pipeline 3: AI-Generated Dialogue (Sudachi in daily batch)

AI dialogue is generated per-user once every 24 hours. After generation, the raw text is tokenized by Sudachi and enriched with meanings:

1. Daily batch generates raw Japanese text per user (NPC lines, narration, descriptions)
2. Batch pipes generated text through Sudachi → gets `{surface, base, reading}` per token
3. Enrichment adds `meaning`: entity override table first, then JP→EN dictionary
4. Tokenized output stored per-user alongside the raw text
5. At runtime, fetch pre-tokenized version — no tokenization needed

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
  let unknownsInSentence = 0;
  let hasEntity = false;
  for (const token of tokens) {
    if (!token.base) {
      if ('。！？'.includes(token.surface)) {
        const max = hasEntity ? 2 : 1;
        if (unknownsInSentence > max) return false;
        unknownsInSentence = 0;
        hasEntity = false;
      }
      continue;
    }
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknownsInSentence++;
  }
  const max = hasEntity ? 2 : 1;
  return unknownsInSentence <= max;
}
```

**Per-sentence rules:**
- Sentence with a game entity: max 2 unknowns (entity has visual context support)
- Sentence without entity: max 1 unknown (standard i+1)
- Sentence boundaries: 。！？

Selection is pure set math on pre-computed data — microseconds per candidate, can evaluate hundreds of lines instantly.

**Scoring preference:** Score = total unknown content words across all sentences. Among eligible lines, prefer highest score (teaches the most). Tiebreakers: prefer lines containing entity tokens (reinforces game vocabulary), then prefer longer lines (more context). Fall back to 0 unknowns (pure reinforcement) if no i+1 candidates exist.

### Rendering

The client receives the assembled token array + user's known words set. For each token:

- **No `base` field** → render surface as-is (particles, punctuation)
- **`base` exists, word is known** → show surface with furigana reading above (reinforcement)
- **`base` exists, word is unknown** → show surface with reading above and meaning below (teaching)

Same `renderJpSentence()` pattern currently used by the shop system, generalized to all game text.

### Exposure Tracking

When the user **actually views** a line, its `words` array is sent to `exposeWords()`. Same system as today — increment exposure count per base form, create FSRS card at threshold (5 exposures). Exposure is tracked on view, not on generation or selection.

## Concrete Examples

### Example 1: Shop — buying 薬草

**User knows:** 一つ, くださる. **Doesn't know:** 薬草.

Item: `{word: "薬草", reading: "やくそう", nameEn: "Medicinal Herb"}`

Three candidate frames evaluated:

| Frame | Assembled words | Unknowns | Entity? | Max | Eligible? |
|-------|----------------|----------|---------|-----|-----------|
| `{item}をください` | 薬草, くださる | 1 (薬草) | yes | 2 | yes |
| `{item}を一つください` | 薬草, 一つ, くださる | 1 (薬草) | yes | 2 | yes |
| `{item}を買いたいのですが` | 薬草, 買う | 2 (薬草, 買う) | yes | 2 | yes |

All three are eligible (entity allows 2 unknowns). Scoring prefers the one teaching the most — frame 3 teaches 買う alongside the item name.

### Example 2: Combat bark with conjugation

**User knows:** 火竜, 逃げる. **Doesn't know:** 怒る.

Creature: `{baseWord: "火竜", baseReading: "かりゅう", baseMeaning: "Fire Dragon"}`

Frame: `"{creature}が怒っている！逃げろ！"`

Assembled tokens:
```json
{
  "tokens": [
    {"surface": "火竜", "base": "火竜", "reading": "かりゅう", "meaning": "Fire Dragon", "entity": true},
    {"surface": "が"},
    {"surface": "怒っ", "base": "怒る", "reading": "おこっ", "meaning": "get angry"},
    {"surface": "て"},
    {"surface": "いる"},
    {"surface": "！"},
    {"surface": "逃げろ", "base": "逃げる", "reading": "にげろ", "meaning": "run away"},
    {"surface": "！"}
  ],
  "words": ["火竜", "怒る", "逃げる"]
}
```

Sentence 1 `火竜が怒っている！` → 1 unknown (怒る), has entity → max 2 → eligible
Sentence 2 `逃げろ！` → 0 unknowns → eligible

Overall: eligible. Teaches 怒る. Renderer shows 怒っ with "get angry" beneath it, everything else as reinforcement.

### Example 3: i+1 selection across candidates

**User knows:** 強い, 火竜. **Doesn't know:** 気, つける, 暴れる, 危険.

| Line | Sentence analysis | Eligible? |
|------|-------------------|-----------|
| `{creature}は強い！気をつけろ！` | S1: 0 unknown (entity+強い known), S2: 2 unknown (気, つける), no entity → max 1 | **no** |
| `{creature}が暴れている！危険だ！` | S1: 1 unknown (暴れる), has entity → max 2. S2: 1 unknown (危険), no entity → max 1 | **yes** |
| `敵だ！戦え！` | S1: 1 unknown (敵), S2: 1 unknown (戦う), no entity → max 1 each | **yes** |

Lines B and C are eligible. Both teach 2 unknown words (score = 2). Tiebreaker: B contains an entity token (火竜), C does not → B wins.

## Infrastructure: Python on Railway

The Railway deployment currently runs Node.js only. Sudachi requires Python.

**Approach:** Add Python + SudachiPy to the Railway build. Modify the Dockerfile (or Nixpacks config) to install:
- Python 3.x
- SudachiPy + SudachiDict-core (~100MB)

Sudachi only runs in the daily batch job and the deploy-time build script — never on the request path. The extra image size does not affect request performance.

## Integration with Existing Code

### Modified files

| File | Change |
|------|--------|
| `src/tokenizer.js` | Add post-processing: katakana→hiragana reading conversion, meaning enrichment (entity overrides → dictionary), output universal token format |
| `src/game/dialogue-filter.js` | Replace runtime JPDB `/parse` calls with pre-computed token eligibility checks (set math on `words` arrays) |
| `public/js/ui/bootstrap-client.js` | Adapt `renderJpSentence()` to universal format: check `base` field presence instead of POS, handle `entity` flag |
| `Dockerfile` / Railway config | Add Python + SudachiPy layer |

### New files

| File | Purpose |
|------|---------|
| `scripts/tokenize-static.js` | Build script: tokenizes all handwritten frames via Sudachi, writes tokenized JSON. Content-hash cache for idempotency. |
| `src/game/dialogue-assembly.js` | Frame + entity assembly: splice entity tokens into slots, merge word sets, return `TokenizedText` |
| `data/dialogue/frames.json` | Tokenized frame templates (output of build script) |

### Unchanged systems

- JPDB integration for word states / FSRS — untouched
- Vocab manager / suggestion system — untouched
- Entity JSON structure (items, creatures, moves, NPCs) — fields already have what we need
- Exposure tracking (`exposeWords()`) — same interface, fed `words` arrays from TokenizedText
- Forge skills — already produce the entity fields needed for `entityToToken()`
