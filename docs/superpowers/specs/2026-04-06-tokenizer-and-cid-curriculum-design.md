# Tokenizer Switch & CID Script Curriculum Design

**Date:** 2026-04-06
**Status:** Approved

## Problem

The current tokenizer (Lindera/UniDic) produces incorrect `baseForm` values that break i+1 filtering:

- こんにちは → `今日は` (hello ≠ today)
- すき → `隙` in context (like ≠ gap — should be 好き)
- はな → `端` in context (flower ≠ edge — should be 花)
- おはよう → `御早う` (archaic kanji)
- とても → `迚も` (archaic kanji)

Additionally, the existing CID welcome scripts were written without regard to the teachable word pool. Even a player who knows all 105 teachable words can only pass i+1 on ~1 script. The scripts use common grammar words (particles, copula, pronouns) that nothing in the game teaches.

## Solution

Two changes:

### 1. Switch tokenizer from Lindera/UniDic to SudachiPy

**Why Sudachi:**
- Actively maintained dictionary (UniDic + NEologd, daily updates)
- `dictionary_form` field preserves input script and gets greetings right
- Correct homophone disambiguation (すき → 好き, not 隙)
- Recommended by NLP community for accuracy over Kuromoji (IPAdic from 2007) and raw MeCab
- Used as a build-step only (pre-tokenize script), not runtime — Python dependency is fine

**Field mapping:**
- `baseForm` → Sudachi `dictionary_form()` (replaces UniDic `detail[7]` lemma)
- `reading` → Sudachi `reading_form()` (katakana, convert to hiragana)
- `pos` → Sudachi `part_of_speech()[0]` (major POS category)
- `surface` → Sudachi `surface()` (unchanged)

**What changes:**
- `scripts/pre-tokenize-dialogue.js` calls SudachiPy via subprocess instead of Lindera
- `src/tokenizer.js` switches to SudachiPy for any runtime tokenization needs
- All dialogue JSON files re-tokenized with new tokenizer
- `_contentWords` arrays regenerated with correct `dictionary_form` values

**What doesn't change:**
- `src/game/dialogue-filter.js` (i+1 logic) — same interface, better data
- `src/game/dialogue-loader.js` — same token format
- Client-side rendering — same token structure

### 2. Rewrite CID scripts as a particle-teaching curriculum

**Authoring principle:** All dialogue is written in kanji. The renderer converts to hiragana using the reading field. This is a display concern, not a content concern.

**Design:**
- Each CID script uses only words from the teachable pool (creature baseWords, move names, item words, bark words, previously-taught grammar words)
- Each script's i+1 word is a grammar particle or common function word
- Scripts are ordered by prerequisite vocabulary — the filter picks the best eligible one per run
- Zero seed — players learn all words through gameplay, starting from nothing

**Teaching progression (approximate):**

| Phase | Player knows | CID teaches | Example |
|-------|-------------|-------------|---------|
| Run 1 | nothing | こんにちは | こんにちは！ |
| Run 2-3 | greeting + combat words | は (topic) | 火は 強い！ |
| Run 4-5 | above + は | よ (emphasis) | すごいよ！ |
| Run 5-6 | above + よ | も (also) | 水も 強いよ！ |
| Run 6+ | growing vocab | に, と, が, か, etc. | 一緒に 行く！ |

The exact scripts and progression will be designed during implementation against the actual teachable word pool. The system (i+1 filter + script selection) already handles picking the right script for each player's vocabulary level.

## Scope

**In scope:**
- Replace Lindera with SudachiPy in pre-tokenize build step
- Re-tokenize all existing dialogue (CID scripts, NPC lines, barks)
- Rewrite CID scripts against teachable word pool with particle curriculum
- Verify i+1 filter works correctly with new token data

**Out of scope:**
- Kanji mode rendering (area 4+) — separate concern
- NPC dialogue rewrite — CID scripts only for now
- Runtime tokenizer changes beyond the build step
- JPDB integration changes

## Technical Notes

- SudachiPy uses Mode A (finest granularity) for maximum segmentation
- Pre-tokenize script calls Python via `child_process.execSync` or similar
- Sudachi core dictionary (~72MB) installed as Python package
- `lindera-wasm-unidic-nodejs` dependency can be removed after migration
