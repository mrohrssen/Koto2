# Dialogue Bootstrap: Full Implementation Context

**Date:** 2026-04-04
**Purpose:** Everything a fresh agent (or human) needs to implement the dialogue graduation system. Assumes zero prior context.
**Related:** `2026-04-04-minimum-viable-i1-dialogue-findings.md` (detailed research data with 32 experiments and concrete dialogue examples)

---

## 1. The Problem We're Solving

New players know zero Japanese. The game teaches words through gameplay (creature names, combat moves, items, NPC names). After completing Area 1, a player knows ~80 Japanese words. The question: when can we switch from hardcoded NPC greetings ("こんにちわ!") to AI-generated i+1 Japanese dialogue?

**Answer from research:** Immediately at 80 words for simple greetings, and progressively richer dialogue as the player learns 20-50 additional "glue" words through the dialogue itself.

## 2. The Core Insight: Two Vocabulary Tracks

The game teaches two fundamentally different kinds of words:

| Track | What | Source | Examples |
|---|---|---|---|
| **Content vocab** | Nouns, action verbs | Gameplay (creatures, items, moves) | 火, 猫, 切る, りんご |
| **Functional vocab** | Adjectives, pronouns, common verbs, connectors | Creature barks + NPC dialogue | 強い, 私, 一緒, 思う |

**Content vocab gives you things to talk about. Functional vocab gives you the ability to talk.**

Adding 50 more creature names does NOT improve dialogue quality. Adding 10 functional "glue" words does. This was proven across 32 experiments — see the findings doc for concrete examples.

## 3. Area 1 Complete Vocabulary Inventory

### 3.1 Content Words from Gameplay (50 words)

**Creatures (13):** 火, 水, 木, 石, 鉄, 風, 虫, 花, 鳥, 魚, 猫, 犬, 火猫

Source: `data/creatures.json` — all stage 1 creatures.

**Combat Move Verbs (14):** 叩く, 炎, 燃える, 守る, 飛ぶ, 泣く, 眠る, 流す, 囲む, 握る, 切る, 呼ぶ, 飲む, 怒る

Source: `data/moves.json` — all stage 1 moves.

**NPC Skill Verbs (4):** 遊ぶ, 働く, 走る, 歌う

Source: `data/npc-skills.json`

**Items (13):** お茶, 豆腐, りんご, 卵, いちご, 酒, ラーメン, 弁当, 刀, 本, 靴, 鏡, 帽子

Source: `data/items.json` — all stage 1 items.

**NPC Names (4):** 子供, 大人, 男の子, 女の子

Source: `data/npcs.json` — all `area: "hajimari-no-hiroba"` NPCs.

**Area Words (2):** 始まり, 広場

Source: `data/areas.json` — hajimari-no-hiroba modifier + location words.

### 3.2 Functional Words from Creature Barks (30 words)

Source: `data/creature-speech.json` (8 categories × 3 barks) + `data/character-cards/creatures.json` (example dialogue phrases).

Players hear these every combat. They're the highest-exposure vocabulary in the game.

**Adjectives (8):** 痛い, 強い, 楽しい, 怖い, 危ない, 好き, きれい, 早い

**Common Verbs (8):** 行く, 見る, 待つ, 助ける, 負ける, 勝つ, 止める, 頑張る

**Emotional/State (9):** 嫌, すごい, ごめん, 無理, しまう, 大丈夫, いい, よい, ここ

**Other (5):** ゆっくり, しっかり, もっと, 雨, 音, 春, 準備

### 3.3 FREE Words (Always Allowed — ~80 words)

These never count as "known" or "unknown" — they're structural Japanese that the i+1 system always permits. Defined in `src/game/vocab-repair.js` lines 56-157 as `ALLOWED_WORDS`.

**Particles:** は, が, を, に, で, へ, と, も, の, か, よ, ね, や, から, まで, より, など, って, けど, でも, しか, ばかり, だけ, ほど, くらい, ぐらい, のに, ので, のは, のが, のを

**Grammar:** です, ます, ました, ません, だ, な, ない, ある, いる, する, なる, れる, られる, せる, させる, たい, てる, こと, もの, ところ, よう, そう, らしい, みたい

**Combined endings:** ですか, ますか, でした, ましたか, ませんか, ですね, ですよ, ますね, ますよ, だった, じゃない, ではない, かな, のか, んです, のです, んですか, のですか, でしょう, でしょうか

**Question words:** なに, 何, どう, どこ, いつ, だれ, 誰, なぜ, どれ, どの

**Expressions:** こんにちは, こんばんは, おはよう, ありがとう, すみません, ください, お願い, はい, いいえ, うん, ええ

### 3.4 The "Next 50" Glue Words (What NPCs Teach)

These are the functional words that NPC dialogue must introduce, in priority order. Experimentally validated — see findings doc for the exact experiments that determined this ordering.

**Priority 1 — Unlock Tier B (teach in Area 1):**
| Word | Reading | Meaning | Why critical |
|---|---|---|---|
| 私 | わたし | I/me | Self-reference |
| 一緒 | いっしょ | together | Social invitations |
| とても | とても | very | Emphasis |
| 今 | いま | now | Temporal grounding |
| 知る | しる | to know | Mental verb ("do you know...?") |
| 思う | おもう | to think | Opinions |
| これ | これ | this | Pointing (near) |
| それ | それ | that | Referencing |
| まだ | まだ | still/yet | Temporal nuance |
| 言う | いう | to say | Meta-communication |

**Priority 2 — Unlock Tier A (teach in Area 2):**
| Word | Reading | Meaning | Why critical |
|---|---|---|---|
| この | この | this (adj) | Pointing at specific things |
| あの | あの | that (adj) | Pointing at distant things |
| 来る | くる | to come | Motion, invitations |
| 友達 | ともだち | friend | Social vocabulary |
| 嬉しい | うれしい | happy | Emotional expression |
| 今日 | きょう | today | Time reference |
| 少し | すこし | a little | Hedging, softening |
| 出る | でる | to go out | Motion verb |
| 入る | はいる | to enter | Motion verb |
| 上手 | じょうず | skilled | Compliments |

**Priority 3 — Full fluency (teach in Area 3+):**
食べる, 小さい, 大きい, 新しい, 人, 前, 後, 時, 話, 方

**Priority 4:** 気, 手, 目, 声, 心, 力, 道, 明日, 分かる, 教える

**Priority 5:** 持つ, 使う, 作る, 出来る, 世界, 場所, 初めて, 元気, 名前, 色

## 4. Dialogue Graduation Tiers

### Tier C: Personalized Greeting (unlocks at ~80 words)

**When:** Player has completed Area 1 gameplay (all creature/item/bark words learned).

**Format:** Single `greeting` field, 1-2 sentences.

**Example (from Experiment 5, 80 words, Child NPC):**
```json
{ "greeting": "こんにちは！ここは楽しいよ！猫と遊びますか？すごいのがいるよ！" }
```

**What the AI has to work with:** 80 content words + 80 FREE grammar words. The creature bark adjectives (楽しい, すごい, きれい) and common verbs (行く, 見る, 待つ) make this possible. Without barks, greetings are flat noun-lists.

### Tier B: Greeting + 1-Round Exchange (unlocks at ~100 words)

**When:** Player has learned ~20 Priority 1 glue words through Tier C greetings.

**Format:** `greeting` + 1 round (`npcLine` + 3 `options` with tones).

**Example (from Experiment 16, 100 words, Child NPC — zero unknowns in every field):**
```json
{
  "greeting": "こんにちは！今日は一緒に遊ぶ？",
  "rounds": [{
    "npcLine": "広場で走るのはとても楽しいよ！来る？",
    "options": [
      { "text": "うん、行く！楽しそう！", "tone": "positive" },
      { "text": "少し待つ、まだ準備してる", "tone": "neutral" },
      { "text": "今日は嫌、ごめん", "tone": "negative" }
    ]
  }]
}
```

### Tier A: Full 3-Round Dialogue (unlocks at ~110-130 words)

**When:** Player has learned ~30-50 glue words through Tier B exchanges.

**Format:** Current full schema — `greeting`, `defeatLine`, `freedLine`, 3 rounds.

**Example (from Experiment 25, 130 words, Child NPC — zero unknowns in all 15 fields):**
```json
{
  "greeting": "こんにちは！元気？名前は何？一緒に遊ぶ？",
  "defeatLine": "私の方が強かった！でも楽しかった！",
  "freedLine": "友達になれて嬉しい！初めての友達だ！",
  "rounds": [
    {
      "npcLine": "この場所、知ってる？私が前に来た！きれいな花があるよ！",
      "options": [
        { "text": "すごい場所だね！とてもきれい！", "tone": "positive" },
        { "text": "どう知った？", "tone": "neutral" },
        { "text": "嫌だ。怖い場所だ。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "これ、見る？私が作った！手で作るのは楽しい！",
      "options": [
        { "text": "上手！私も作りたい！", "tone": "positive" },
        { "text": "何を使って作った？", "tone": "neutral" },
        { "text": "作るのは無理だ。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "明日も来る？一緒に遊べたら嬉しい！",
      "options": [
        { "text": "うん！明日も来る！", "tone": "positive" },
        { "text": "分からない。出来るかな。", "tone": "neutral" },
        { "text": "明日は無理だ。ごめん。", "tone": "negative" }
      ]
    }
  ]
}
```

## 5. The Handbuilt Dialogue Approach (Areas 1-2)

Instead of trusting the AI to get this right from day one, you can handcraft NPC dialogue for Areas 1 and 2 that perfectly guides a player to be ready for generative dialogue by Area 3.

### 5.1 Design Rules for Handbuilt Dialogue

1. **Every field must follow i+1.** Count words. Each field (greeting, npcLine, each option) can have at most 1 word not in the player's known list at that point. Use the ALLOWED_WORDS list as free.

2. **Conjugated forms of listed verbs are allowed.** 走る → 走った, 飲む → 飲んで, 楽しい → 楽しかった. But noun forms that are separate lexemes are NOT: 歌 (song) ≠ 歌う (to sing), 出す ≠ 出る.

3. **The i+1 word should be a glue word from the priority list.** Don't waste the teaching slot on rare nouns — use it to teach 私, 一緒, とても, etc.

4. **Reinforce nearly-learned words.** If the player has seen 強い 3 times, use it again. The system should prefer words approaching the 5-exposure graduation threshold.

5. **Each NPC visit should teach exactly 1 new glue word and reinforce 2-3 others.** This means handwriting multiple versions of each NPC's dialogue, keyed to the player's current glue vocabulary level.

6. **NPC personality must come through.** The Child uses 遊ぶ, 楽しい, すごい. The Adult uses 働く, 準備, しっかり. The Girl uses きれい, 花, ゆっくり. Word selection drives personality, not sentence complexity.

### 5.2 Area 1 NPC Dialogue Ladder

The player enters Area 1 knowing 0 words. As they play, they learn content vocab from creatures/items/moves and functional vocab from creature barks. NPC dialogue should be tiered to match:

**Visit 1 (0 words known):** Hardcoded English or tagged English with Japanese insertions (Phase 1 bootstrap from GDD Section 6).

**Visit 2-3 (~30-50 words, some bark exposure):** Tier C greeting. Introduce 1 Priority 1 glue word per visit.

Example ladder for Child NPC (子供):
```
Visit 2: "こんにちは！遊ぶ？楽しいよ！" 
  → i+1 word: none needed (all from gameplay + barks)

Visit 3: "こんにちは！私も遊ぶのが好き！" 
  → i+1 word: 私 (Priority 1)

Visit 4: "こんにちは！一緒に遊ぶ？"
  → i+1 word: 一緒 (Priority 1), reinforces: 遊ぶ

Visit 5: "こんにちは！今、とても楽しいよ！"
  → i+1 word: とても (Priority 1), reinforces: 楽しい, 今 nearly-learned
```

**Visit 6-10 (~80 words, Priority 1 glue partially learned):** Tier B exchanges. Each visit reinforces 2-3 glue words and introduces 1 new one.

**Visit 10+ (~100 words):** Tier A or transition to generative.

### 5.3 Area 2 NPC Dialogue Ladder

By Area 2, the player knows ~80-100 words (Area 1 content + Priority 1 glue). Area 2 NPCs teach Priority 2 glue words (この, あの, 来る, 友達, 嬉しい, 今日, 少し, 出る, 入る, 上手).

Area 2 NPCs start at Tier B and graduate to Tier A within the area.

### 5.4 Area 3: Generative Dialogue

By Area 3, the player knows ~110-130 words. This is the experimentally-validated threshold where AI can generate natural, personality-rich, fully i+1-compliant 3-round dialogues with zero unknowns in most fields. Generative dialogue takes over completely.

## 6. Current Codebase Architecture

### 6.1 Dialogue Generation Pipeline

```
Player visits NPC
    ↓
POST /npc-dialogue-start (src/routes/game/combat.js:478)
    ↓
Check cache: getNpcDialogueFromCache(userId, npcId)
    ↓ (miss)
Build vocab: getNarrationVocabularyForUser(userId) → word list
    ↓
Assemble prompt: assemblePrompt() (src/narration-engine/prompt-assembler.js)
  → Layer 1: System instructions (i+1 rules)
  → Layer 2: buildVocabSection(words, jlptLevel) (src/narration-engine/vocab-constraints.js)
  → Layer 3: Character card (personality, quirk, goals)
  → Layer 4: Lorebook entries (optional)
  → Layer 5: NPC memory (encounter history, bond)
  → Layer 6: Anti-repetition (previous lines)
  → Layer 7: Task prompt (JSON schema)
    ↓
Call AI: generateDialogue() (src/narration-engine/generation.js)
    ↓
Validate shape: npc.validateShape() (src/narration-engine/entity-types/npc.js)
    ↓
Enforce i+1: enforceDialogueVocab() (src/narration-engine/dialogue-repair.js)
  → Extract all 15 text fields
  → For each field: checkSentenceViolations() via JPDB parse
  → If >1 unknown per field: multi-turn repair conversation
  → Up to 3 repair attempts
    ↓
Cache result: cache.set(npcId, dialogue)
    ↓
Return to frontend (with options shuffled)
```

### 6.2 Key Files

| File | What it does |
|---|---|
| `src/narration-engine/index.js` | Main entry point — cache, memory, generation orchestration |
| `src/narration-engine/prompt-assembler.js` | Builds 7-layer prompt for AI |
| `src/narration-engine/vocab-constraints.js` | Formats vocab list + i+1 rules for prompt |
| `src/narration-engine/generation.js` | Calls AI, parses JSON response |
| `src/narration-engine/dialogue-repair.js` | i+1 enforcement — validate, repair loop |
| `src/narration-engine/entity-types/npc.js` | NPC-specific schema validation (15 fields, 3 rounds) |
| `src/narration-engine/text-cache.js` | Per-user dialogue cache (file-based JSON) |
| `src/narration-engine/npc-memory.js` | Per-user NPC memory (encounters, bond, flags) |
| `src/game/vocab-manager.js` | Per-user vocab state, JPDB caching, `getNarrationVocabularyForUser()` |
| `src/game/vocab-repair.js` | ALLOWED_WORDS set, `checkSentenceViolations()` |
| `src/jpdb.js` | JPDB API client (parse, lookup, review) |
| `src/routes/game/known-words.js` | Exposure tracking (5 exposures → SRS card) |
| `src/routes/game/combat.js` | `/npc-dialogue-start` endpoint (line 478) |
| `data/npcs.json` | NPC definitions (4 in Area 1) |
| `data/character-cards/npcs.json` | NPC character cards (personality, goals, example dialogue) |
| `data/creature-speech.json` | Combat barks (8 categories × 3 phrases) |

### 6.3 What Already Exists vs What Needs Building

**Already exists:**
- ✅ Full Tier A dialogue generation pipeline (prompt → AI → repair → cache)
- ✅ i+1 vocabulary enforcement with JPDB parsing
- ✅ Per-user vocab tracking and known-word determination
- ✅ NPC memory system (encounters, bond, flags)
- ✅ Character cards for all Area 1 NPCs
- ✅ Creature speech barks (creature-speech.json)
- ✅ Word exposure tracking (5-exposure threshold)
- ✅ Cache staleness detection (vocab growth triggers regen)
- ✅ TTS integration (VOICEVOX)

**Needs building (for handbuilt approach):**
- 📋 Handbuilt dialogue JSON files for Area 1 and 2 NPCs, keyed to player vocab level
- 📋 Tier detection logic: determine player's current tier (C/B/A) based on known functional vocab count
- 📋 Dialogue tier routing: serve Tier C/B/A format based on current tier
- 📋 Bark exposure tracking: ensure creature-speech.json words get counted as exposures
- 📋 Glue curriculum data: per-area list of target functional words

**Needs building (for fully generative approach):**
- 📋 All of the above, PLUS:
- 📋 Tier C/B prompt templates (currently only Tier A's 3-round schema exists in `prompt-assembler.js`)
- 📋 Reinforcement preference injection into `buildVocabSection()` ("prefer these words: ...")
- 📋 Compound word warnings in prompt ("今日≠今, 出す≠出る")
- 📋 Schema validation for Tier C (greeting only) and Tier B (1 round) formats
- 📋 Tier C/B entity type handlers (or extend the existing NPC handler)

### 6.4 NPC Dialogue JSON Schema by Tier

**Tier C:**
```json
{ "greeting": "one line in Japanese" }
```

**Tier B:**
```json
{
  "greeting": "one line",
  "rounds": [{
    "npcLine": "NPC speaks",
    "options": [
      { "text": "response", "tone": "positive" },
      { "text": "response", "tone": "neutral" },
      { "text": "response", "tone": "negative" }
    ]
  }]
}
```

**Tier A (current — already implemented):**
```json
{
  "greeting": "one line",
  "defeatLine": "one line",
  "freedLine": "one line",
  "rounds": [
    { "npcLine": "...", "options": [{ "text": "...", "tone": "..." }, ...] },
    { "npcLine": "...", "options": [...] },
    { "npcLine": "...", "options": [...] }
  ]
}
```

### 6.5 Current NPC Data (Area 1)

From `data/npcs.json`:

| ID | Name | Personality | Quirk | Skill |
|---|---|---|---|---|
| kodomo | 子供 (Child) | fun-loving, curious | Always looking for a game | 遊ぶ (Play) |
| otona | 大人 (Adult) | mature, composed | Always busy with something | 働く (Work) |
| otokonoko | 男の子 (Boy) | energetic, restless | Can never stand still | 走る (Run) |
| onnanoko | 女の子 (Girl) | shy, gentle | Hums to herself | 歌う (Sing) |

All currently have hardcoded `greeting: "こんにちわ!"`, `defeatLine: "いいね!"`.

### 6.6 Creature Bark Vocabulary (Exact Data)

From `data/creature-speech.json`:

| Category | Bark 1 | Bark 2 | Bark 3 |
|---|---|---|---|
| onHit | 痛い！(Ouch!) | 嫌だ！(No way!) | 強い！(Strong!) |
| onAttack | 頑張れ！(Do your best!) | 負けないぞ！(Won't lose!) | 行くぞ！(Here I go!) |
| onVictory | すごい！(Amazing!) | 勝った！(Won!) | よかった！(Thank goodness!) |
| onExplore | 楽しい！(Fun!) | 行くよ！(Let's go!) | 見て！(Look!) |
| onHeal | ありがとう！(Thanks!) | 助かる！(Helpful!) | 大丈夫！(I'm okay!) |
| onKO | ごめん…(Sorry) | 無理…(Can't) | 負けた…(Lost) |
| onStatus | しまった！(Oh no!) | 待って！(Wait!) | 止めて！(Stop!) |
| onLowHP | 危ない！(Dangerous!) | 助けて！(Help!) | 怖い！(Scary!) |

## 7. Prompt Engineering Notes

### 7.1 Verified Failure Modes (from experiments)

1. **Compound words treated as conjugations:** 今日 ≠ 今, 見つける ≠ 見る, 出す ≠ 出る. The AI frequently assumes these are related. Need explicit warning in prompt.

2. **Noun forms of verbs:** 歌 (song) ≠ 歌う (to sing), 話 (story) ≠ 話す (to speak). Separate lexemes, not conjugations.

3. **どっち used as if FREE:** The AI consistently generates どっち as a question word, but it's not in ALLOWED_WORDS. Either add it to the free list or accept it as a common i+1 word.

4. **Adjective transitivity:** The AI sometimes uses 忙しい, もちろん, or other common words it "knows should be free" but aren't on the wordlist. Strict enforcement catches this.

### 7.2 The Real Game Prompt Format

From `src/narration-engine/vocab-constraints.js`:
```
=== 使える言葉（重要）===
この言葉リストからだけ使う：
[comma-separated wordlist]

【ルール】
1. リストにない言葉は使わない。例外なし。
2. 助詞はOK：は、が、を、に、で、へ、と、も、の、か、よ、ね、や、から、まで、より
3. 数字OK。句読点OK。擬音OK。
4. 1文に知らない言葉は最大1つまで。
5. 表現できない場合はもっと簡単な言い方にする。

文法レベル：JLPT [level]
```

### 7.3 Reinforcement Prompt Addition (New)

When generating dialogue for a player with nearly-learned words, add after the vocab section:
```
=== 復習したい言葉 ===
この言葉を自然に使ってください（無理しないで）：
強い (あと2回), 楽しい (あと1回), 好き (あと3回)
```

This was tested in Experiments 30 and 32 — the AI successfully integrated 5/5 and 6/6 target words naturally.

## 8. Exposure Math and Timeline

### How fast does a player learn?

- **Per combat:** ~3-5 creature name exposures + ~2-3 move verb exposures + ~1-2 bark exposures
- **Per NPC visit:** 1 new glue word + 2-3 reinforced glue words
- **5 exposures = "known"** (per `src/routes/game/known-words.js`)

### Area 1 timeline (rough):

| Play sessions | Words known | Dialogue tier | What they see |
|---|---|---|---|
| 1-2 | 0-30 | Pre-C | English/tagged English (Phase 1 bootstrap) |
| 3-5 | 30-60 | Pre-C → C | Transition to Japanese greetings |
| 5-8 | 60-80 | C | Personalized greetings, 1 new glue word per visit |
| 8-12 | 80-100 | C → B | Exchanges unlock, deeper conversations |
| 12-20 | 100-130 | B → A | Full 3-round dialogue |

### Area 2 timeline:

| Play sessions | Words known | Dialogue tier | What they see |
|---|---|---|---|
| 20-25 | 130-160 | A | Full dialogue + Area 2 content words |
| 25-30 | 160-200 | A (richer) | Priority 2-3 glue integrated, more expressive |

### Area 3+: Fully generative

By ~200+ words with good glue coverage, the AI can generate any NPC dialogue without handholding.

## 9. NPC Personality Examples (What Good Dialogue Looks Like)

All from the same 80-word list, showing how personality drives word selection:

**Child (子供):**
```
こんにちは！ここは楽しいよ！猫と遊びますか？すごいのがいるよ！
```
*Exclamatory, game-seeking, uses 楽しい/すごい/遊ぶ.*

**Adult (大人):**
```
ここは広場です。準備はいいですか。
```
*Terse, businesslike, uses 準備/いい. Personality hides vocab limits via composure.*

**Girl (女の子):**
```
あ…こんにちは。ここの花、きれいですね。
```
*Hesitant (あ…), deflects to beauty (きれい/花), uses ね for softness.*

**Boy (男の子):**
```
おはよう！早く早く！すごいものを見つけたよ！
```
*Uses おはよう (not こんにちは), rapid repetition (早く早く), competitive energy.*

## 10. Complete Ordered Learning Sequence

This is the master reference: every word the player knows at each milestone, in the order they learn them. This combines content vocab (gameplay), bark vocab (combat), and glue vocab (NPC dialogue) into a single timeline.

### Milestone 1: First Few Combats (~15-20 words)

The player's starter creature + first wild encounters. They see creature names, their starter's moves, and hear barks.

**Content (from combat):**
- Starter creature name (1 of: 火, 水, 木)
- First move: 叩く (strike — all starters learn this at level 1)
- First wild creatures encountered: 石, 風, 虫, 花 (varies)

**Barks (high frequency — heard every fight):**
- onHit: 痛い, 強い
- onAttack: 行くぞ → teaches 行く
- onVictory: すごい, 勝った → teaches 勝つ
- onKO: ごめん

**The player can read:** Creature names on screen, move names when selecting actions, bark speech bubbles.
**Dialogue possible:** None yet. Hardcoded "こんにちわ!" from NPCs.

### Milestone 2: Area 1 Half-Complete (~40-50 words)

The player has fought several creatures, bought items, met NPCs.

**Content (accumulated):**
- Creatures seen: 火, 水, 木, 石, 風, 虫, 花, 鳥 (~8)
- Moves learned: 叩く, 守る, 飛ぶ, 眠る (~4-6 from learnset progression)
- Items seen in shop: お茶, りんご, 弁当, 卵 (~4-6)
- NPC names encountered: 子供, 大人 (~2)
- Area words: 広場

**Barks (most now familiar through repetition):**
- Adjectives sinking in: 痛い, 強い, 楽しい, 怖い
- Verbs sinking in: 行く, 見る (from 見て!), 待つ (from 待って!)
- Emotional: すごい, 大丈夫, ごめん

**Dialogue possible:** Tier C is approaching. A personalized greeting using only creature names + barks is feasible. Example: "こんにちは！ここは楽しいよ！"

### Milestone 3: Area 1 Complete (~80 words) — TIER C UNLOCKS

The player has encountered all Area 1 content and heard barks dozens of times.

**Full known vocabulary at this point:**

*Content (50):*
火, 水, 木, 石, 鉄, 風, 虫, 花, 鳥, 魚, 猫, 犬, 火猫, 叩く, 炎, 燃える, 守る, 飛ぶ, 泣く, 眠る, 流す, 囲む, 握る, 切る, 呼ぶ, 飲む, 怒る, 遊ぶ, 働く, 走る, 歌う, お茶, 豆腐, りんご, 卵, いちご, 酒, ラーメン, 弁当, 刀, 本, 靴, 鏡, 帽子, 子供, 大人, 男の子, 女の子, 始まり, 広場

*Barks (30):*
痛い, 強い, 楽しい, 怖い, 危ない, 好き, きれい, 早い, 行く, 見る, 待つ, 助ける, 負ける, 勝つ, 止める, 頑張る, 嫌, すごい, ごめん, 無理, しまう, 大丈夫, いい, よい, ゆっくり, しっかり, もっと, ここ, 雨, 音, 春, 準備

*Plus ~80 FREE grammar words always available.*

**What NPCs can now say (Tier C):**
- Child: "こんにちは！ここは楽しいよ！猫と遊びますか？すごいのがいるよ！"
- Adult: "ここは広場です。準備はいいですか。"
- Girl: "あ…こんにちは。ここの花、きれいですね。"

**What NPCs CAN'T yet say:** Anything with 私 (I), 一緒 (together), とても (very), 思う (think), 知る (know). These are the glue words that Tier C greetings will now teach.

### Milestone 4: Priority 1 Glue Learned (~90 words) — TIER B APPROACHING

After ~5-10 NPC visits at Tier C, each introducing 1 glue word:

**New words learned through NPC greetings (10):**
私, 一緒, とても, 今, 知る, 思う, これ, それ, まだ, 言う

**What these unlock (examples):**
- 「私は猫が好きです」 — self-expression (私)
- 「一緒に遊ぶ？」 — social invitation (一緒)
- 「とても楽しい」 — emphasis (とても)
- 「今、準備してる」 — temporal grounding (今)
- 「知ってる？」 — questions about knowledge (知る)
- 「楽しいと思う」 — opinions (思う)

**Dialogue now possible (Tier B):**
```
Greeting: "こんにちは！今日は一緒に遊ぶ？"
NPC: "広場で走るのはとても楽しいよ！来る？"  ← 来る is i+1
Options: "うん、行く！" / "少し待つ" / "今日は嫌、ごめん"  ← 少し, 今日 are i+1
```

### Milestone 5: Priority 2 Glue Learned (~100-110 words) — TIER A UNLOCKS

After Tier B exchanges in Area 1 + entering Area 2:

**New words learned through NPC exchanges (10):**
この, あの, 来る, 友達, 嬉しい, 今日, 少し, 出る, 入る, 上手

**What these unlock:**
- 「この花、きれいですね」 — pointing at specific things (この)
- 「友達になる？」 — social bonds (友達)
- 「嬉しい！」 — expressing happiness (嬉しい)
- 「今日は楽しかった」 — talking about today (今日)
- 「あの鳥、上手に歌うよ」 — complimenting (上手, あの)

**Full 3-round dialogue now possible.**

### Milestone 6: Priority 3+ Glue (~130+ words) — FULL FLUENCY

**New words (20+):**
食べる, 小さい, 大きい, 新しい, 人, 前, 後, 時, 話, 方, 気, 手, 目, 声, 心, 力, 道, 明日, 分かる, 教える

**What these unlock:**
- Storytelling: 「この前、大きい虫を見たよ！」
- Teaching: 「この道、知ってる？私が教える！」
- Planning: 「明日も来る？一緒に遊べたら嬉しい！」
- Description: 「小さい花がきれいだよ。新しいのもあるよ。」

**At this point, generative AI dialogue works with zero unknowns across all 15 fields.** The handbuilt training wheels come off.

### Master Word List: Complete Priority Order

For reference, here is every word in the order a player ideally learns it, grouped by source:

**Phase 1 — Gameplay teaches these (no NPC help needed):**
```
Creatures:  火 水 木 石 鉄 風 虫 花 鳥 魚 猫 犬 火猫
Moves:      叩く 炎 燃える 守る 飛ぶ 泣く 眠る 流す 囲む 握る 切る 呼ぶ 飲む 怒る
NPC skills: 遊ぶ 働く 走る 歌う
Items:      お茶 豆腐 りんご 卵 いちご 酒 ラーメン 弁当 刀 本 靴 鏡 帽子
NPCs:       子供 大人 男の子 女の子
Area:       始まり 広場
```

**Phase 2 — Creature barks teach these (through combat repetition):**
```
Adjectives: 痛い 強い 楽しい 怖い 危ない 好き きれい 早い
Verbs:      行く 見る 待つ 助ける 負ける 勝つ 止める 頑張る
Emotional:  嫌 すごい ごめん 無理 しまう 大丈夫 いい よい
Other:      ゆっくり しっかり もっと ここ 雨 音 春 準備
```

**Phase 3 — NPC dialogue teaches these (through i+1 greetings and exchanges):**
```
Priority 1: 私 一緒 とても 今 知る 思う これ それ まだ 言う
Priority 2: この あの 来る 友達 嬉しい 今日 少し 出る 入る 上手
Priority 3: 食べる 小さい 大きい 新しい 人 前 後 時 話 方
Priority 4: 気 手 目 声 心 力 道 明日 分かる 教える
Priority 5: 持つ 使う 作る 出来る 世界 場所 初めて 元気 名前 色
```

**Always available (FREE — never taught, always understood):**
```
Particles:    は が を に で へ と も の か よ ね や から まで より など って けど でも
Grammar:      です ます だ な ない ある いる する なる たい てる こと もの ところ
Questions:    なに 何 どう どこ いつ だれ なぜ どれ どの
Expressions:  こんにちは おはよう ありがとう すみません ください はい いいえ うん
```

## 11. Verification Checklist for Handbuilt Dialogue

When writing dialogue by hand, verify each field against these rules:

- [ ] Every content word is in the player's known list at that visit number
- [ ] Conjugated verb forms trace back to a listed dictionary form
- [ ] Noun forms are NOT treated as verb conjugations (歌 ≠ 歌う)
- [ ] At most 1 unknown word per field (greeting, npcLine, each option)
- [ ] The unknown word (if any) is from the Priority glue list
- [ ] FREE words (particles, grammar, expressions) are used correctly
- [ ] NPC personality comes through in word selection
- [ ] 2-3 nearly-learned words are reinforced (used but not new)
- [ ] The dialogue makes sense as a conversation (not just grammar exercises)
- [ ] Positive/neutral/negative tones are clearly differentiated in options
