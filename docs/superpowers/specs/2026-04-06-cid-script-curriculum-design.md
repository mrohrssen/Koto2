# CID Script Curriculum Design

**Date:** 2026-04-06
**Status:** Approved

## Problem

The existing CID welcome scripts use grammar words (particles, copula, pronouns) that nothing in the game teaches. Even a player who knows all teachable words can only pass i+1 on ~1 script. CID should be a proper conversational moment — 2-3 dialogue boxes of 1-2 sentences each — that reinforces known vocabulary while teaching 1 grammar word per run.

## Solution

### Phase 1: Simulator data collection

Run the learning simulator to discover which words players learn earliest and most reliably:
- Create a default profile: 30 days, 2 runs/day
- Run 10 simulations (10 separate users)
- Query `word_learned` events across all users
- Rank words by reliability (how many users learned it) and earliness (median day)
- Output a ranked confidence list of words safe to use in early CID scripts

### Phase 2: Author 15 CID scripts

Using the confidence list from Phase 1:

- **Format:** Each script has 2-3 lines, each line is 1-2 sentences
- **Content:** All dialogue authored in kanji using only words from the teachable pool (creatures, moves, items, barks, grammar-words, glue-words)
- **Teaching:** Each script's i+1 word is a grammar particle or common function word (は, よ, も, に, が, と, か, で, を, の, etc.)
- **No prerequisites declared:** The existing `filterEligibleScripts` + `selectCidScript` system handles eligibility and selection automatically
- **No system changes needed:** i+1 filter, script selection, word exposure pipeline all work as-is

### Phase 3: Tokenize, validate, simulate

- Replace existing cid-scripts.json with the new 15 scripts
- Run `scripts/pre-tokenize-dialogue.js` to tokenize with SudachiPy
- Run `scripts/validate-dialogue.js` to verify all words are in the dictionary
- Run the simulator again (10 users, 30 days) to verify:
  - CID scripts get selected at appropriate times
  - Players see varied scripts (not the same one every run)
  - Grammar words are being taught through CID exposure

The simulator output from Phase 3 is the artifact for manual review. Further script batches will be authored based on what the data shows.

## Scope

**In scope:**
- Running simulator to collect word learning data
- Analyzing simulator output to build confidence list
- Writing 15 new CID scripts
- Tokenizing and validating the scripts
- Running simulator to verify scripts work

**Out of scope:**
- System/code changes (none needed)
- Scripts beyond the initial 15 (future iteration)
- NPC dialogue rewrite (separate concern)

## Notes

- Players learn ~8-10 words per run, so by run 3-4 they know 25-40 words — enough for multi-sentence CID dialogue
- Scripts using fewer/more-common words naturally become eligible earlier; scripts with rarer words later
- Players do ~2 runs/day, so 15 scripts provides ~1 week of unique CID encounters before repeats
