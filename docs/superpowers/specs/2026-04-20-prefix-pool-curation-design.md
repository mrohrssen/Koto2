# Prefix Pool Curation — Design

**Date:** 2026-04-20
**Status:** Spec — awaiting implementation plan
**Scope:** Data-only; no runtime integration

## 1. Goal

Produce a curated JSON file, `data/prefixes.json`, containing every Japanese adjective/descriptor that is (a) ranked ≤ JPDB 15,000, (b) grammatically usable as a creature modifier, and (c) semantically suitable for describing a game creature. Expected output: 250-700 entries.

This pool will later feed a creature fusion system where each fused creature rolls a random prefix (e.g., "Energetic Fire", "Lazy Water Cat", "Mighty Steel Bird"). Prefix selection at fusion is universal — every prefix can roll on every creature.

## 2. In Scope / Out of Scope

### In scope

- Curation pipeline (auto-filter → AI review → optional human spot-check → final JSON)
- Output schema for `data/prefixes.json`
- Tooling script (`scripts/curate-prefixes.mjs`)
- Intermediate audit artifacts under `output/prefix-curation/`
- JPDB rank verification for every entry

### Out of scope (each becomes a separate future plan)

- **Compound creature grammar.** How `Fire` + `Bird` produces "Fire Bird" / 火鳥 / 火の鳥 in Japanese and English.
- **Fusion mechanics.** When prefixes roll, probability weights, valid input combinations.
- **Stat effects per prefix.** Pokemon-nature-style modifiers (+attack / -speed / etc.).
- **Creature data migration.** Existing per-creature `modifier` field in `data/creatures.json` becomes legacy; fused instances gain a new `prefixId` reference.
- **Prefix rarity tiers.** Optional overlay where rare prefixes only roll from high-JPDB-rank entries.
- **UI surfaces.** Collection display, fusion screen, combat nameplate.

## 3. Input Sources

Three files under `language/categories/`, all pre-JPDB-ranked:

| File | Approx entries | Role |
|------|----------------|------|
| `descriptors.json` | ~2,700 | Primary — size, quality, state, character traits |
| `emotions.json` | ~1,900 | Secondary — temperament words |
| `colors.json` | ~200 | Specialty |

Combined: ~4,800 raw candidates. These files were curated for other purposes and contain noise for prefix use (e.g., `descriptors.json` includes 母 "mother" and 内容 "contents", which are nouns, not prefixes). POS filtering in Stage 1 handles this.

## 4. Pipeline

Four stages. Each writes intermediate output to `output/prefix-curation/` (gitignored) for audit. Script is resumable: a stage is skipped if its output already exists, and can be forced with `--stage N --force`.

### Stage 1 — Auto-filter

1. Merge the three input files into one candidate list, deduped by `word`.
2. Drop entries with `rank > 15000`.
3. Run each word through Sudachi POS tagging (reuse the pattern in `scripts/tokenize-static.js`).
4. Keep entries with at least one of these POS tags:
   - `形容詞` (i-adjective)
   - `形状詞` (na-adjective)
   - `連体詞` (prenominal adjectival)
   - Descriptor-noun that the dictionary shows with adjectival usage (`の`-adjective pattern)
5. Drop everything else: pure nouns, verbs, particles, proper nouns.

**Expected yield:** 1,500-2,000 candidates.
**Output:** `output/prefix-curation/1-filtered.json`

### Stage 2 — AI semantic review

1. Batch candidates in groups of 50.
2. For each batch, prompt Claude with per-word `{word, reading, meaning, rawMeanings}`.
3. Prompt template:

   > "You are curating a pool of Japanese prefix-words for a vocabulary-learning creature-collection game. Each prefix will prepend a creature name at fusion time (e.g., 'Energetic Fire', 'Mighty Steel Bird').
   >
   > For each word below, rate whether it could meaningfully describe a game creature's personality, appearance, size, age, or state. Rate: `yes` / `maybe` / `no`. Give a one-sentence reason.
   >
   > Reject words that are purely abstract ('public', 'reverse'), domain-specific ('bureaucratic', 'photovoltaic'), or are nouns the source file misclassified ('mother', 'contents').
   >
   > Accept words that describe physical traits ('small', 'strong'), temperament ('lazy', 'brave'), appearance ('shiny', 'rusty'), age ('ancient', 'young'), or emotional state ('happy', 'angry')."

4. Output per word: `{ word, verdict: "yes"|"maybe"|"no", reason: "..." }`
5. Use Haiku or Sonnet — full curation of ~1,500 candidates = ~30 API calls, under $2.

**Expected yield:** 400-700 `yes`, ~200 `maybe`.
**Output:** `output/prefix-curation/2-reviewed.json`

### Stage 3 — Human spot-check (optional)

1. Render all `maybe` verdicts as an HTML table at `output/prefix-curation/3-review.html` (the `yes` and `no` tiers are not re-reviewed by default).
2. Each row has include/exclude toggle; page saves selections to `output/prefix-curation/3-approved.json` on submit.
3. If user skips this stage, all `yes` verdicts flow through automatically; all `maybe` and `no` are excluded.
4. To review a `no` entry that looks wrongly rejected, the user can edit `2-reviewed.json` directly and rerun stage 3.

**Output:** `output/prefix-curation/3-approved.json`

### Stage 4 — Final write

1. Sort approved entries by JPDB rank ascending.
2. Assign stable `id` field — kebab-case slug of the primary English meaning.
3. Resolve collisions by suffixing (`ancient-2`) — shouldn't happen often but the script must handle it.
4. Write `data/prefixes.json`.

## 5. Output Schema

```json
[
  {
    "id": "energetic",
    "word": "元気",
    "reading": "げんき",
    "meaning": "Energetic",
    "rank": 892,
    "rawMeanings": ["healthy", "vigorous", "spirited"],
    "pos": "na-adjective",
    "source": "emotions"
  }
]
```

### Field reference

- `id` — kebab-case slug of English meaning; stable identifier for future cross-referencing from fused-creature records.
- `word` — Japanese spelling (kanji or kana, whichever JPDB returned as most common form).
- `reading` — hiragana reading.
- `meaning` — dictionary-accurate primary English translation per CLAUDE.md rules (no embellishment, no transitivity flips).
- `rank` — JPDB frequency rank.
- `rawMeanings` — full array from JPDB `meanings` response, for downstream tools that want alternate glosses.
- `pos` — one of `"i-adjective"`, `"na-adjective"`, `"descriptor-noun"`, `"prenominal"`. Downstream display code uses this to choose between 〜な, 〜い, 〜の attachment.
- `source` — `"descriptors"` | `"emotions"` | `"colors"`. For audit only.

## 6. Tooling

### New files

- `scripts/curate-prefixes.mjs` — four-stage pipeline, resumable, `--stage N --force` to rerun a specific stage.

### Reused infrastructure

- `scripts/lib/jpdb-helpers.mjs` — existing JPDB API wrapper (`resolveCommonForms`, `tierFromRank`). Every final entry must have its rank re-verified via this helper in Stage 4, even though the input files are already ranked — the ranks may be stale.
- `scripts/tokenize-static.js` — Sudachi integration pattern to copy for Stage 1 POS tagging.
- `src/ai-providers.js` — Claude API wrapper for Stage 2.

### Output directories

- `output/prefix-curation/` — intermediate stage outputs (gitignored).
- `data/prefixes.json` — final output (committed).

## 7. Success Criteria

- `data/prefixes.json` exists and parses as a JSON array.
- Every entry has `rank ≤ 15000`.
- Every entry has a non-empty `reading`, `meaning`, `id`, and valid `pos` tag.
- No duplicate `id` values.
- No duplicate `word` values.
- Pool size is between 250 and 700 entries. The script hard-fails with a summary if the final count is outside that range, requiring human decision (widen filters, relax rank cap, or loosen AI review criteria).
- Dictionary-accuracy check: a random sample of 30 passes a manual sniff test — "[prefix] [creature]" reads naturally in both English and Japanese.
- Every entry's English meaning matches the CLAUDE.md accuracy rules (primary dictionary definition, no transitivity changes, no embellishment).

## 8. Open Questions (deferred to later plans)

1. How are compound creature names formed? (e.g., 火 + 鳥 → 火鳥 / 火の鳥, English "Fire Bird")
2. How do we handle creatures whose `baseMeaning` itself is already a prefix-like word (e.g., 火 "Fire", 古代 "Ancient")? Can they both be a creature *and* appear in the prefix pool?
3. Do we add a rarity-tier column to the pool later for weighted rolling, or is flat random-roll sufficient?
4. Migration path for the existing per-creature `modifier` field in `data/creatures.json`.
5. Does fusion always produce a prefix, or can a fusion yield a "plain" unprefixed result as the common outcome?

These are captured here so future plans have a clear starting point.

## 9. Risks

- **Sudachi POS tags may be unreliable** for words that function as both noun and adjective (e.g., 元気 is a na-adjective but primary POS is 名詞). Stage 1 must accept any candidate where JPDB or the dictionary shows descriptor-noun usage, not just formal adjective POS.
- **AI review drift** — Claude may be inconsistent across batches. Mitigation: include a stable set of 5-10 canary words in every batch and flag runs where canary verdicts disagree across batches.
- **Pool size out of expected range** — if we end up with 50 or 1,500, something upstream is wrong. The script hard-fails with a summary if the final count is outside [250, 700].
