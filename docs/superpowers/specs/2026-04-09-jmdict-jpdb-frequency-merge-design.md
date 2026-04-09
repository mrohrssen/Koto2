# JMDict + JPDB v2.2 Frequency Merge

> Replace the current 37k-entry dictionary with a merged JMDict (216k entries / 458k surface forms) + JPDB v2.2 frequency data (274k entries), using a two-tier merge strategy that prevents false positives like ました being misidentified as 真下 ("right below").

**Status:** Design in progress. Stress testing complete — two-tier strategy validated.

## Problem

The current `data/dictionary.json` (37k entries, built from JMDict common-only) is the merge lookup for the tokenization pipeline. When Sudachi over-splits compounds (すみません → すむ+ます+ぬ), the merge step recombines them by checking if adjacent tokens' concatenated surfaces exist in the dictionary.

37k entries miss many real compounds. The universal tokenization spec (2026-04-08) identified this: 申し訳ございません, 東日本, 読み込む, and other learner-friendly compounds aren't in the dictionary. The full JMDict has 216k entries (458k surface forms) and covers all of these.

However, naively expanding the dictionary introduces **catastrophic false merges** where common grammar sequences accidentally match obscure dictionary entries.

## Data Sources

### Full JMDict (downloaded 2026-04-09)
- **File:** `tmp/jmdict-eng-3.6.2.json` (111MB)
- **Source:** [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) v3.6.2+20260406125001
- **Stats:** 216,173 entries, 458,475 unique surface forms (kanji + kana variants)
- **License:** CC-BY-SA (from JMdict project)
- **Format:** JSON with `id`, `kanji[]`, `kana[]`, `sense[]` per entry. Each kanji/kana form has a `common: boolean` flag. Each sense has `partOfSpeech[]` and `gloss[]`.

### JPDB v2.2 Frequency List (downloaded 2026-04-09)
- **File:** `tmp/jpdb_v2.2_freq_list.csv` (11MB)
- **Source:** [Kuuuube/yomitan-dictionaries](https://github.com/Kuuuube/yomitan-dictionaries) `data/jpdb_v2.2_freq_list_2024-10-13.csv`
- **Stats:** 278,946 entries (274,218 unique terms)
- **Format:** TSV with columns: `term`, `reading`, `frequency`, `kana_frequency`
- **No vid/sid** — keyed on term+reading, not JMDict IDs

### Current Dictionary
- **File:** `data/dictionary.json` (5.4MB)
- **Stats:** 37,961 keys
- **Built from:** JMDict common-only via `scripts/build-dictionary.js`
- **Filter:** Only entries where at least one kanji or kana form is `common: true`

### Existing JPDB Wordlist
- **File:** `language/dictionaries/jpdb-wordlist.csv` (3MB)
- **Stats:** 26,995 entries with `vid`, `sid`, `rank`, `word`, `reading`, `part_of_speech`, `meanings`
- **Note:** Has vid/sid for precise JMDict ID matching, but only 27k entries vs 274k in v2.2

## The False Merge Problem

### What goes wrong with naive expansion

The greedy longest-match merge algorithm concatenates adjacent Sudachi tokens and checks if the result exists in the dictionary. With 458k surface forms, common grammar sequences accidentally match real but wrong entries:

| Sentence | Sudachi tokens | False merge | Wrong meaning | Correct parse |
|----------|---------------|-------------|---------------|---------------|
| 食べました | 食べ + まし(助動詞) + た(助動詞) | ました → 真下 | "right below" | past tense marker |
| どれがいいですか | どれ + が(助詞) + いい(形容詞) | がいい → 外衣 | "outer garment" | particle + adjective |
| 天気はどうですか | 天気 + は(助詞) + どう(副詞) | はどう → 波動 | "wave motion" | particle + adverb |
| これはいくらですか | これ + は(助詞) + いくら | これは → 此れは | "as for this" | pronoun + particle |

**The ました problem is the worst** — every single past-tense polite sentence in the game would teach the player that ました means "right below" (真下). This defeats the game's reason for existing.

### Why filtering doesn't help

We tested two filtering strategies:

**Common-only filter:** Only include JMDict entries with `common: true` on at least one form.
- Result: Blocks これは (not common) but passes ました, がいい, はどう — their kana forms aren't common, but...

**Common-OR-frequency filter:** Include entries that are common OR have a JPDB v2.2 frequency rank.
- Result: Only blocks これは. The others have JPDB frequency ranks (ました=104220, がいい=137855, はどう=220168) because they ARE real words — just not the right parse in context.

The fundamental issue: **surface-form matching is context-blind.** When まし+た appears after a verb stem, it's grammar. 真下 (ました) is a real word that happens to share the same kana. No amount of filtering the dictionary can fix this — the dictionary correctly contains both.

## Solution: Two-Tier Merge Strategy

### How it works

The merge step uses two tiers of lookup with different trust levels:

**Tier 1 — Curated allowlist (always merge):**
The current 37k dictionary entries merge unconditionally, exactly as they do today. This preserves all existing behavior including grammar-containing compounds that have been explicitly vetted:
- すみません (consumes auxiliaries ます+ぬ → always merged)
- ありがとうございます (consumes auxiliaries → always merged)
- お願いします, おはようございます, 気に入る, 間に合う, 手に入れる, etc.

**Tier 2 — Expanded lookup (content-only merge):**
New entries from full JMDict (193k additional keys) only merge when **ALL consumed Sudachi tokens have content POS tags**. If any consumed token is grammar (particle, auxiliary, suffix, prefix), the merge is blocked.

Content POS (safe to merge): 名詞 (noun), 動詞 (verb), 形容詞 (i-adj), 形状詞 (na-adj), 副詞 (adverb), 連体詞 (adnominal), 感動詞 (interjection), 接続詞 (conjunction)

Grammar POS (blocks tier-2 merge): 助詞 (particle), 助動詞 (auxiliary), 接尾辞 (suffix), 接頭辞 (prefix), 補助記号 (punctuation), 記号 (symbol)

### Why this works

The insight: **false merges almost always consume grammar tokens.** 

- ました = まし(助動詞) + た(助動詞) → blocked (both are auxiliaries)
- がいい = が(助詞) + いい(形容詞) → blocked (が is a particle)
- はどう = は(助詞) + どう(副詞) → blocked (は is a particle)

Meanwhile, legitimate new compounds are content+content:
- 東日本 = 東(名詞) + 日本(名詞) → merged ✅
- 読み込む = 読み(動詞) + 込む(動詞) → merged ✅
- 走り回る = 走り(動詞) + 回る(動詞) → merged ✅

Grammar-containing set phrases that ARE real compounds (手を上げる, 気を付ける, 目が見える) are blocked by tier 2 — which is correct. To enable them, add them to the curated allowlist explicitly. This is the same workflow as today.

### Stress test results (2026-04-09)

Tested 67 sentences across four strategies. Scripts in `tmp/stress-test-merge-v*.js`.

| Strategy | False positives | Existing merges preserved | New content merges | Grammar set phrases |
|----------|----------------|--------------------------|-------------------|-------------------|
| **Current (37k)** | 0 | All | N/A (baseline) | Curated only |
| **Naive full (458k)** | 9 catastrophic | All | All | All (including wrong ones) |
| **POS-aware (block all grammar)** | 0 | All | 2 only | All blocked |
| **Two-tier (recommended)** | **0** | **All** | **All** | **Blocked (opt-in via curated dict)** |

Specific results for two-tier strategy:

**False positives blocked (8/8):**
- ✅ これはいくらですか — no merge on これは
- ✅ どれがいいですか — no merge on がいい
- ✅ 天気はどうですか — no merge on はどう
- ✅ 食べました, 飲みました, 分かりました — no merge on ました
- ✅ 行きませんでした — no merge on ませんでした
- ✅ お金が足りません — no merge on ません

**Existing merges preserved (7/7):**
- ✅ すみません, ありがとうございます, お願いします, おはようございます
- ✅ 気に入る, 間に合う, 手に入れる

**New content merges gained:**
- ✅ 東日本 (noun+noun)
- ✅ 読み込む (verb+verb)
- ✅ 走り回る (verb+verb)
- Note: 食べ物 — Sudachi already outputs this as a single token, no merge needed

**Grammar set phrases correctly blocked (opt-in via curated dict):**
- 手を上げる, 目が見える, 気を付ける — contain particles
- 端から端まで, だからと言って, 行かなくてもいい — contain particles/auxiliaries
- 申し訳ございません — contains auxiliaries (ませ+ん)

## Homophone Disambiguation (Bridge vs Chopsticks)

### The concern
はし has three meanings: 橋 (bridge), 箸 (chopsticks), 端 (edge). If the dictionary keys on reading alone, these collide.

### Why it's not a problem for us

**Kanji-first authoring rule:** All game text is authored with kanji. Sudachi produces kanji surface forms (橋, 箸, 端) which are naturally unique dictionary keys. The collision only happens with kana-only text (はし), which we don't use for ambiguous words.

**JPDB v2.2 confirms this:** The frequency list has separate entries with distinct ranks:

| Term | Reading | Frequency |
|------|---------|-----------|
| 端 | はし | 2,039 |
| 橋 | はし | 2,218 |
| 箸 | はし | 5,008 |

The dictionary lookup matches on the kanji surface form from Sudachi, not the reading.

### Where it could matter (future consideration)

If we ever support kana-only input (player typing, AI-generated text without kanji), we'd need sense disambiguation. Options for that future:
- Use Sudachi's normalized form + POS to disambiguate
- Use the existing `jpdb-wordlist.csv` vid/sid for precise JMDict ID matching
- Use compound key `word::pos` or `word::meaning` for exposure tracking

For now: not needed. Kanji-first authoring makes this a non-issue.

## Dictionary Build Pipeline

### Entry inclusion criteria

A JMDict entry is included if ANY of:
1. At least one kanji form has `common: true`
2. At least one kana form has `common: true`  
3. Any form (kanji or kana) has a JPDB v2.2 frequency rank

A specific surface form key is added if:
1. That form has `common: true`, OR
2. That form has a JPDB v2.2 frequency rank

This filters 216k JMDict entries down to ~155k included entries with ~231k surface form keys.

### Output format

The merged dictionary keeps the current format for compatibility:

```json
{
  "東日本": {
    "reading": "ひがしにほん",
    "definitions": [
      {"en": "eastern Japan (usu. east of the Chūbu region)", "primary": true}
    ],
    "freq": 38853,
    "jmdict_id": "1925410",
    "tier": 2
  }
}
```

New fields vs current format:
- `freq` — JPDB v2.2 frequency rank (lower = more common). Absent if no JPDB data.
- `jmdict_id` — JMDict entry ID for traceability. Matches JPDB `vid` when available.
- `tier` — `1` for curated (always-merge), `2` for expanded (content-only merge). Tier is used by the merge algorithm at runtime, not just metadata.

### Merge algorithm change

```js
// Current: unconditional merge
if (dict.get(combined)) { merge(); }

// New: two-tier merge
const entry = dict.get(combined);
if (entry) {
  if (entry.tier === 1) {
    merge(); // curated — always merge
  } else {
    // tier 2 — only merge if all consumed tokens are content
    const allContent = consumed.every(t => !GRAMMAR_POS.has(t.pos));
    if (allContent) merge();
  }
}
```

### Frequency data integration

JPDB v2.2 frequency ranks are stored per-entry in the dictionary. Uses:
- **i+1 selection scoring:** Prefer teaching higher-frequency words first
- **Merge disambiguation:** If two dictionary entries match the same surface (rare with kanji-first), prefer the higher-frequency one
- **Future:** Inform FSRS card scheduling priority

## Coverage Analysis

### JMDict × JPDB overlap

| Category | Count |
|----------|-------|
| In both JMDict + JPDB v2.2 | 227,313 |
| JMDict only (no frequency data) | 231,162 |
| JPDB only (not in JMDict) | 46,905 |

The 46k JPDB-only terms are likely inflected forms, proper nouns, or slang not in JMDict. These can be kept in the existing `jpdb-wordlist.csv` for frequency lookups without being merge candidates.

### New merge coverage

- Current dictionary: 37,961 keys
- Merged dictionary: ~231,091 keys  
- New keys available for content-only merges: ~193,000
- Grammar-containing entries: remain curated (add to tier 1 explicitly)

## Open Questions

### 1. How to add grammar-containing set phrases to tier 1

Currently these are blocked by tier 2:
- 申し訳ございません (freq 4,941 — very common)
- 手を上げる (freq 6,318)
- 気を付ける (freq 3,664)
- なくてもいい (freq 34,798)
- 端から端まで (freq 27,354)

Options:
- **A) Manual curation:** Add them to the curated dict as we encounter them in authored text. Same workflow as today — no change.
- **B) Frequency threshold:** Auto-promote tier 2 → tier 1 if JPDB frequency rank < N (e.g., < 50,000). Risk: reintroduces some false positives (ました at 104,220 would still be blocked, but lower thresholds need testing).
- **C) Grammar-aware promotion:** Auto-promote if the JMDict entry's POS is "expression" (exp) or "idiom" — these are explicitly set phrases, not accidental surface matches.

### 2. Full JMDict vs common+frequency subset

The current plan uses common+frequency filtering (231k keys). The full unfiltered JMDict has 458k keys. The extra 227k keys are obscure entries with no frequency data. Including them would:
- Increase dictionary size from ~25MB to ~50MB (build-time only, not runtime)
- Add very rare compounds that might never appear in game text
- Increase false merge risk for obscure kana readings
- Recommendation: **Start with common+frequency, expand later if needed**

### 3. Replacing `data/dictionary.json` vs new file

Options:
- **A) Replace in-place:** Update `scripts/build-dictionary.js` to produce the new format. Simple but loses the old dictionary.
- **B) New file:** `data/dictionary-v2.json` alongside the old one. Allows A/B comparison and gradual migration.
- **C) Rename old:** Move current to `data/dictionary-v1.json`, new one takes `data/dictionary.json`. Clean but requires updating the build script.

### 4. Build-time vs checked-in dictionary

The merged dictionary is deterministic (JMDict + JPDB are versioned inputs). Options:
- **Build at deploy time:** Download JMDict + JPDB, run merge script. Adds ~30s to build, needs network access.
- **Check in the result:** Run merge script locally, commit `data/dictionary.json`. Simpler deploys, larger repo.
- Current approach checks in `data/dictionary.json` — probably keep doing that.

## Files

### Source data (in `tmp/`, gitignored)
- `tmp/jmdict-eng-3.6.2.json` — Full JMDict (111MB)
- `tmp/jmdict-eng-common-3.6.2.json` — Common-only JMDict (16MB, previously downloaded)
- `tmp/jpdb_v2.2_freq_list.csv` — JPDB v2.2 frequency list (11MB)
- `tmp/stress-test-merge-v*.js` — Stress test scripts (4 versions)

### To modify
- `scripts/build-dictionary.js` — Update to read full JMDict + JPDB v2.2, produce two-tier dictionary
- `scripts/tokenize-static.js` — Update merge function to respect tier field
- `src/game/word-dictionary.js` — Load tier field, pass to merge algorithm
- `data/dictionary.json` — Rebuilt output (~231k entries)

### Unchanged
- `src/tokenizer.js` — Sudachi wrapper, no changes needed
- `src/game/token-format.js` — Token format unchanged
- `scripts/sudachi-tokenize.py` — POS tags already provided, no changes needed
