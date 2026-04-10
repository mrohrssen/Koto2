# Glue Word i+1 Dialogue Curriculum

**Date:** 2026-04-10
**Type:** Design spec
**Goal:** Teach all 50 glue words through i+1 dialogue sentences across every exposure method, enabling players to transition to pure AI dialogue after ~2 weeks of play.

## Background

Research (see `2026-04-04-minimum-viable-i1-dialogue-findings.md`) proved that 10 glue words outperform 50 extra nouns for dialogue quality. A player who completes Area 1 learns ~80 content words — enough for simple greetings. But richer dialogue requires ~50 functional "glue" words (pronouns, common verbs, adjectives, time words) that gameplay alone doesn't teach.

Currently, dialogue frames are a mix of 1-word exclamations and multi-sentence fragments. Many frames bypass the i+1 filter because they're too short to filter meaningfully, or they contain multiple sentences that each burn an i+1 slot independently.

## Core Rule

**Every non-bark frame = one sentence, one `isEligible` filter pass.** No multi-sentence frames. No 1-word frames outside barks. This lets the filter do its job: at most 1 unknown word per frame shown to the player.

Barks remain 1-2 words — they're combat exclamations and serve as the seed layer that teaches foundational vocabulary.

## The 50 Glue Words (JPDB-Validated)

All 50 words confirmed via JPDB API. Rank = JPDB frequency rank (lower = more common).

### Priority 1: Critical (10 words)
| Word | Reading | Rank | Meaning |
|------|---------|------|---------|
| 私 | わたし | 100 | I/me |
| 一緒 | いっしょ | 900 | together |
| とても | とても | 300 | very |
| 今 | いま | 100 | now |
| 知る | しる | 100 | to know |
| 思う | おもう | 100 | to think |
| これ | これ | 100 | this |
| それ | それ | 100 | that |
| まだ | まだ | 100 | still/yet |
| 言う | いう | 100 | to say |

### Priority 2: Important (10 words)
| Word | Reading | Rank | Meaning |
|------|---------|------|---------|
| この | この | 100 | this (adj) |
| あの | あの | 100 | that (adj) |
| 来る | くる | 100 | to come |
| 友達 | ともだち | 700 | friend |
| 嬉しい | うれしい | 1300 | happy |
| 今日 | きょう | 200 | today |
| 少し | すこし | 200 | a little |
| 出る | でる | 100 | to go out |
| 入る | はいる | 200 | to enter |
| 上手 | じょうず | 2600 | skilled |

### Priority 3: Valuable (10 words)
| Word | Reading | Rank | Meaning |
|------|---------|------|---------|
| 食べる | たべる | 200 | to eat |
| 大きい | おおきい | 300 | big |
| 小さい | ちいさい | 400 | small |
| 新しい | あたらしい | 400 | new |
| 人 | ひと | 100 | person |
| 前 | まえ | 100 | before/front |
| 後 | あと | 300 | after/behind |
| 時 | とき | 200 | when/time |
| 話 | はなし | 100 | story/talk |
| 方 | ほう | 200 | direction/way |

### Priority 4: Enriching (10 words)
| Word | Reading | Rank | Meaning |
|------|---------|------|---------|
| 気 | き | 300 | spirit/mind |
| 手 | て | 200 | hand |
| 目 | め | 200 | eye |
| 声 | こえ | 200 | voice |
| 心 | こころ | 300 | heart/mind |
| 力 | ちから | 200 | strength |
| 道 | みち | 400 | road/path |
| 明日 | あした | 600 | tomorrow |
| 分かる | わかる | 500 | to understand |
| 教える | おしえる | 300 | to teach |

### Priority 5: Full Fluency (10 words)
| Word | Reading | Rank | Meaning |
|------|---------|------|---------|
| 持つ | もつ | 200 | to hold/have |
| 使う | つかう | 200 | to use |
| 作る | つくる | 200 | to make |
| 出来る | できる | 100 | to be able |
| 世界 | せかい | 200 | world |
| 場所 | ばしょ | 200 | place |
| 初めて | はじめて | 300 | for the first time |
| 元気 | げんき | 400 | lively/healthy |
| 名前 | なまえ | 300 | name |
| 色 | いろ | 700 | color |

## Cleanup: Category Renames & Wiring

Current dialogue categories have misleading names and dead code.

### Changes

| Old | New | Action |
|-----|-----|--------|
| `npc` `shopGreeting` slot | Remove | Best lines folded into `fightStart` |
| `npc` `fightStart` slot | Keep, wire to frontend | Currently selected on backend but never rendered |
| `npc` `defeatLine` slot | Keep | No change |
| `greeting` category | Rename to `shopGreeting` | Currently used in `run.js` for friendly NPC shops via `getGreetingFrames()` — rename category, not remove |
| `shop` category | Rename to `shopPurchase` | Clarity — this is the purchase action |
| (new) `shopGreeting` category | Add | Friendly NPC shopkeeper greeting |

### Frontend Wiring

`fightStart` must be rendered when the trainer NPC encounter begins. Currently:
- Backend (`combat.js`): selects from `shopGreeting` pool → maps to `npcDialogue.greeting`; also selects `fightStart` but frontend ignores it
- Frontend (`room-transition.js`): renders `npcDialogue.greeting`

After cleanup:
- Backend (`combat.js`): remove `shopGreeting` selection entirely, populate `npcDialogue.fightStart` (already selected, just stop sending `.greeting`)
- Frontend (`room-transition.js`): render `npcDialogue.fightStart` instead of `npcDialogue.greeting`
- Frontend (`public/game.js`): update `npcDialogue` pass-through to `playNpcBattleIntro`

### Loader Changes

`dialogue-loader.js` changes:
- Remove `shopGreeting` from NPC line parsing (lines grouped by `<npcId>_<slot>`)
- Rename `greeting` category to `shopGreeting` (rename getter from `getGreetingFrames()` to `getShopGreetingFrames()`)
- Rename `shop` → `shopPurchase` in category filter

## Exposure Surfaces

After cleanup, the player encounters Japanese text in these scenarios:

| Category | Context | Who Speaks | Length | Count (approx) |
|----------|---------|------------|--------|-----------------|
| `bark_*` (8 types) | Combat rounds | Player's creatures | 1-2 words | ~63 |
| `befriend_wait` | Creature collection prompt | Creature | 1-4 words | ~8 |
| `befriend_name` | Name guessing prompt | Creature | 1-4 words | ~8 |
| `befriend_success` | Correct answer | Creature | 1-4 words | ~8 |
| `befriend_wrong` | Wrong answer | Creature | 1-4 words | ~8 |
| `npc` `fightStart` | Trainer NPC encounter | Trainer NPC | 2-6 words | ~30 |
| `npc` `defeatLine` | Trainer NPC loses | Trainer NPC | 2-6 words | ~25 |
| `shopGreeting` | Friendly NPC shop opens | Shopkeeper | 2-5 words | ~15 |
| `shopPurchase` | Player buys item | Player character | 2-4 words | ~10 |

Rough total: ~175 frames.

## Sentence Authoring Strategy

### Approach: Scenario-First with Glue Word Priority

1. For each exposure category, write the most natural sentences for that context at multiple lengths
2. Prioritize using glue words as content — every sentence should teach or reinforce a glue word where it fits naturally
3. Each glue word appears in 3+ sentences across different contexts and lengths
4. Run the validation script to find gaps, fill only where needed

### Grammar Constraint: N5 Only

All sentences use basic grammar:
- Dictionary form verbs (食べる, not 食べている)
- Basic い/な adjectives
- です/ます where NPC personality fits (otona, onnanoko)
- No て-form chaining, no conditionals, no passive/causative
- Particles are FREE (は, が, の, に, を, etc.) — handled by tokenizer

### Single Sentence Rule

Every non-bark frame is exactly one sentence. This is an **authoring constraint**, not a runtime one — `isEligible` actually permits multi-sentence frames (it resets its unknown counter at sentence boundaries 。！？, so each sentence gets its own i+1 budget independently). That means a frame with two sentences could show the player 2 unknown words at once, which defeats the pedagogical purpose. By keeping every frame to one sentence, we guarantee at most 1 unknown per frame shown.

**Before (bad):** "友達だ！嬉しい！" — two sentences, `isEligible` allows it (1 unknown each), but player sees 2 unknowns.
**After (good):** "嬉しい友達だ！" — one sentence, one unknown max.

### Bark Audit

Barks stay 1-2 words. Audit for:
- Do barks teach words that are needed as building blocks for longer sentences?
- Any gaps where a common foundation word isn't covered by barks?
- Minor rewrites only where it serves the curriculum.

## Progression Model

The `isEligible` filter handles all selection at runtime. We don't control order — we just need enough sentences at each length tier so something is always newly eligible.

### Phase 1: Combat Foundations (sessions 1-3)
Player fights creatures, sees barks. Learns ~15-20 words: 強い, 楽しい, 痛い, 怖い, 嬉しい, 元気, 新しい, etc. Some bark words are also glue words — these are the seed layer.

### Phase 2: First Sentences Unlock (sessions 3-6)
With bark words known, short befriend/NPC frames become eligible. 2-3 content word sentences teach Priority 1 glue words using known bark vocabulary as the foundation.

### Phase 3: Sentence Growth (sessions 6-12)
With Priority 1 glue words + bark words + gameplay vocab (creature names, item names), 4-5 word sentences become eligible. shopGreeting and shopPurchase frames start appearing. Priority 2 glue words get introduced.

### Phase 4: Full Coverage (sessions 12-20)
6-8 word sentences eligible. Priority 3-5 glue words taught. Player has the vocabulary foundation for AI dialogue transition.

### Reinforcement

Same glue word appears across multiple contexts. Player learns 私 from a fightStart line, sees it reinforced in a befriend reaction and a shopPurchase frame. 5 exposures = "known" in the word-knowledge tracking system, which then creates an FSRS vocab card for SRS review.

## Validation Script

A new script (`scripts/validate-glue-progression.js`) that simulates player progression:

1. Start with 0 known words
2. Progressively add gameplay vocab (creature names, item words, bark words) to simulate play sessions
3. At each step, check which frames from `frames.json` become eligible via `isEligible`
4. "Learn" the unknown word from each eligible frame (simulating exposure)
5. Track which of the 50 glue words get taught and at what step
6. Report:
   - Unreachable glue words (no sentence ever becomes eligible to teach them)
   - Dead zones (vocabulary levels where no new frames become eligible)
   - Coverage: how many glue words are teachable by session N

Uses existing tokenized `frames.json` and the `isEligible` function from `token-format.js`. No new data format or manual tagging.

## Implementation Workstreams

### 1. Cleanup (code changes)
- `dialogue-loader.js`: Remove `shopGreeting` NPC slot, add `shopGreeting` category, rename `shop` → `shopPurchase`
- `room-transition.js`: Wire `fightStart` to frontend display
- `combat.js`: Remove `shopGreeting` selection, keep `fightStart` + `defeatLine`
- `run.js`: Update shop frame references from `shop` → `shopPurchase`, replace `getGreetingFrames()` with `getShopGreetingFrames()`
- `frame-sources.json`: Update IDs and categories to match new naming
- Update tests

### 2. Content authoring (frame-sources.json)
- Audit barks, selective rewrites
- Rewrite existing befriend frames as proper single sentences at varying lengths
- Write new fightStart/defeatLine frames per NPC with glue words
- Write new shopGreeting frames
- Expand shopPurchase frames with glue word variants
- Run `node scripts/tokenize-static.js`
- Run `node scripts/validate-dialogue.js`

### 3. Validation script (new)
- `scripts/validate-glue-progression.js`
- Iterates content until all 50 glue words are reachable
- Run after every content change to verify no regressions

## Files Changed

### Core changes
- `data/dialogue/frame-sources.json` — Content authoring (add/remove/rename frames)
- `data/dialogue/frames.json` — Regenerated by tokenizer
- `src/game/dialogue-loader.js` — Category renames, rename `getGreetingFrames()` → `getShopGreetingFrames()`, rename `getShopFrames()` → `getShopPurchaseFrames()`
- `src/routes/game/combat.js` — Remove `shopGreeting` selection, stop sending `npcDialogue.greeting`
- `src/routes/game/run.js` — Update to use `getShopGreetingFrames()` and `getShopPurchaseFrames()`
- `public/js/ui/room-transition.js` — Render `npcDialogue.fightStart` instead of `npcDialogue.greeting`
- `public/game.js` — Update npcDialogue pass-through
- `public/js/ui/exploration.js` — Update `friendlyNpcState.greeting` references for new shopGreeting category
- `src/game/services/exploration-service.js` — Update `shopGreetings` reference on NPC data

### Downstream / simulator
- `simulator/engine/rooms/npc-battle.js` — Update dialogue field names in logging
- `src/narration-engine/entity-types/npc.js` — Update greeting field references
- `src/services/tts-dialogue-cache.js` — Update if greeting field cached

### New
- `scripts/validate-glue-progression.js` — Progression validation script

### Tests
- `tests/unit/dialogue-loader.test.js` — Update for renamed categories/getters
- `tests/unit/dialogue-filter.test.js` — Update if needed
- `tests/unit/tokenize-static.test.js` — Update category assertions
- `tests/integration/dialogue-bootstrap.test.js` — Update category assertions
- `tests/unit/narration-engine/entity-types/npc.test.js` — Update greeting references

### No changes expected
- `src/game/dialogue-filter.js` — Filter logic is generic
- `src/game/token-format.js` — `isEligible` unchanged
