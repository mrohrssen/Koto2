# Minimum Viable Vocabulary for i+1 Dialogue — Research Findings

**Date:** 2026-04-04
**Method:** 32 experiments across 8 Sonnet subagents + independent verification agent
**Source data:** Area 1 creatures, moves, items, NPCs, creature-speech.json barks, character cards

## Executive Summary

**A player who completes Area 1 learns ~80 content words.** This is enough for Tier C (personalized i+1 greetings) immediately. Teaching 20-30 additional "glue words" through those greetings unlocks Tier B (exchanges) and then Tier A (full 3-round dialogue). A second area is NOT needed to unlock generative dialogue — the real bottleneck is glue words (adjectives, pronouns, common verbs), not more nouns.

## Threshold Map

| Tier | Words Needed | What Unlocks | Source |
|------|-------------|--------------|--------|
| **C** (greeting) | **~80** | Personalized NPC greetings in Japanese | Area 1 gameplay alone |
| **B** (exchange) | **~100** | Greeting + 1-round NPC exchange | Area 1 + ~20 glue from dialogue |
| **A** (full dialogue) | **~110-130** | Full 3-round NPC conversations | Area 1 + ~30-50 glue from dialogue |

## The Critical Finding: Glue > Nouns

**Experiment 16 vs 18** (both 100 words, Tier B):
- 80 base + 20 glue → natural, playful, emotionally expressive
- 100 pure nouns/verbs → terse, action-heavy, emotionally flat

**Experiment 25 vs 29** (130 vs 150 words, Tier A):
- 80 base + 50 glue (130 total) → full fluency, 15/15 fields zero unknowns
- 150 pure nouns from 3 areas → impoverished despite higher count, no personality expression

**Verdict:** 10 glue words outperform 50 additional creature/item names for dialogue quality. Adding a second area helps world-building vocabulary but does NOT unlock better dialogue. The unlock comes from teaching functional language through dialogue itself.

## Area 1 Vocabulary Inventory (80 words)

### Game Content (50 words)
- **Creatures (13):** 火, 水, 木, 石, 鉄, 風, 虫, 花, 鳥, 魚, 猫, 犬, 火猫
- **Move verbs (14):** 叩く, 炎, 燃える, 守る, 飛ぶ, 泣く, 眠る, 流す, 囲む, 握る, 切る, 呼ぶ, 飲む, 怒る
- **NPC skills (4):** 遊ぶ, 働く, 走る, 歌う
- **Items (13):** お茶, 豆腐, りんご, 卵, いちご, 酒, ラーメン, 弁当, 刀, 本, 靴, 鏡, 帽子
- **NPCs (4):** 子供, 大人, 男の子, 女の子
- **Area (2):** 始まり, 広場

### Creature Speech (30 words) — from creature-speech.json + character cards
- **Adjectives:** 痛い, 強い, 楽しい, 怖い, 危ない, 好き, きれい, 早い
- **Common verbs:** 行く, 見る, 待つ, 助ける, 負ける, 勝つ, 止める, 頑張る
- **Emotional:** 嫌, すごい, ごめん, 無理, しまう, 大丈夫, いい, よい
- **Other:** ゆっくり, しっかり, もっと, ここ, 雨, 音, 春, 準備

### FREE Words (~80) — always allowed, per ALLOWED_WORDS
Particles, grammar, question words, greetings (こんにちは, ありがとう, etc.)

## The "Next 50" Glue Words — Prioritized Teaching Curriculum

These are the words that made the biggest difference across all experiments, ordered by impact on dialogue quality. Informed by JPDB frequency and conversational utility.

### Priority 1: Critical (unlock Tier B comfort) — teach first
| Word | Reading | Meaning | Why it matters |
|------|---------|---------|---------------|
| 私 | わたし | I/me | Enables self-reference, personal statements |
| 一緒 | いっしょ | together | Unlocks invitations, social dialogue |
| とても | とても | very | Adds emphasis, emotional intensity |
| 今 | いま | now | Temporal grounding |
| 知る | しる | to know | Mental verb, enables "do you know...?" |
| 思う | おもう | to think | Mental verb, enables opinions |
| これ | これ | this | Deictic, enables pointing at things |
| それ | それ | that | Deictic, enables referencing |
| まだ | まだ | still/yet | Temporal nuance |
| 言う | いう | to say | Meta-communication |

### Priority 2: Important (unlock Tier A) — teach next
| Word | Reading | Meaning | Why it matters |
|------|---------|---------|---------------|
| この | この | this (adj) | Pointing at specific things |
| あの | あの | that (adj) | Pointing at distant things |
| 来る | くる | to come | Motion verb, invitations |
| 友達 | ともだち | friend | Social vocabulary, huge for child NPC |
| 嬉しい | うれしい | happy | Emotional expression |
| 今日 | きょう | today | Time reference |
| 少し | すこし | a little | Hedging, softening |
| 出る | でる | to go out | Motion verb |
| 入る | はいる | to enter | Motion verb |
| 上手 | じょうず | skilled | Compliments |

### Priority 3: Valuable (unlock storytelling)
| Word | Reading | Meaning | Why it matters |
|------|---------|---------|---------------|
| 食べる | たべる | to eat | Food scenes, daily life |
| 大きい | おおきい | big | Description |
| 小さい | ちいさい | small | Description |
| 新しい | あたらしい | new | Description |
| 人 | ひと | person | Social reference |
| 前 | まえ | before/front | Temporal + spatial |
| 後 | あと | after/behind | Temporal + spatial |
| 時 | とき | when/time | Temporal framing |
| 話 | はなし | story/talk | Meta-conversation |
| 方 | ほう | direction/way | Comparison |

### Priority 4: Enriching (unlock teaching/guiding)
気, 手, 目, 声, 心, 力, 道, 明日, 分かる, 教える

### Priority 5: Full fluency
持つ, 使う, 作る, 出来る, 世界, 場所, 初めて, 元気, 名前, 色

## Verification Results

Independent verifier agent checked experiments 1, 3, 5, 8, 12, and 15:
- **13/14 fields PASSED** — all words on-list or valid conjugations
- **1 field FAILED** — Experiment 15 greeting used 今日 (a compound, not a conjugation of 今)
- **Recurring issue:** Generators treat どっち as FREE when it's not (passes i+1 but is systematic)
- **Transitivity traps identified:** 出る/出す, 見る/見つける, 歌う/歌(noun), 話/話す, 色/色んな

**Reliability:** Generator self-checking caught most violations before output. The main risk is compound words (今日≠今, 見つける≠見る) — these need explicit prompt guidance.

## Reinforcement Results (Experiments 30, 32)

| Experiment | Target words | Used | Natural? |
|------------|-------------|------|----------|
| 30 (110 words) | 強い, 楽しい, 好き, 行く, 見る | 5/5 | Yes — verbs easiest to reinforce via conjugation variety |
| 32 (130 words) | 元気, 友達, 明日, 教える, 作る, 場所 | 6/6 | Yes — semantically connected targets produce coherent narrative |

**Key insight:** Reinforcement instructions ("prefer these words") work well and don't degrade naturalness. The AI integrates target words smoothly, especially when they share a theme (e.g., 教える + 道 → "I'll teach you the way").

## Variety Results (Experiment 31)

With 110 words, the Child NPC can produce ~4-5 meaningfully different greetings before topics start repeating. The action-verb pool (遊ぶ, 走る, 見る, 歌う, 行く) is the limiting factor — there are only so many activities a child can propose.

Adding 友達, 嬉しい, 新しい significantly expands variety by enabling social and emotional themes.

## NPC Personality Differentiation

Tested at 80 and 130 words:
- **Child (子供):** Gravitates toward 遊ぶ, 走る, 楽しい, すごい. Short exclamatory sentences. Game-seeking.
- **Adult (大人):** Gravitates toward 働く, 準備, しっかり. Measured sentences, practical topics.
- **Girl (女の子):** Uses hesitation (あ…), ellipsis, ね particles. Gravitates toward きれい, 花, 春, 歌う.
- **Boy (男の子):** Uses おはよう over こんにちは, 早く, もっと. Competitive, creature-focused.

**Personality works even at 80 words.** The differentiator is word SELECTION from the shared pool, not word count.

## Graduation System Design

### Tier C: Personalized Greetings (unlocks at ~80 words)
- Player completes Area 1 → all game content learned
- NPC greetings switch from hardcoded "こんにちわ!" to AI-generated i+1 Japanese
- Each greeting contains known words + 1 new word from Priority 1 list
- Format: 1-2 sentences, single `greeting` field

### Tier B: Short Exchanges (unlocks at ~100 words)
- After player learns ~20 glue words from Tier C greetings
- NPC dialogue expands to greeting + 1 round (NPC line + 3 player options)
- Reinforcement: prefer words at 3-4/5 exposures to push them to "known"

### Tier A: Full Dialogue (unlocks at ~110+ words)
- After player learns ~30+ glue words
- Full 3-round dialogue: greeting, defeatLine, freedLine, 3 rounds
- i+1 budget used for interesting new vocabulary, not survival glue

### Teaching Loop
1. Player visits NPC → sees Tier C greeting with 1 new word
2. Word auto-tracked as "exposure 1"
3. Next visit → same NPC reinforces that word + introduces another
4. After 5 exposures → word graduates to "known"
5. After 20 graduated words → Tier B unlocks
6. Tier B dialogue reinforces 2-3 nearly-learned words per visit
7. After 30 graduated words → Tier A unlocks
8. Tier A dialogue reinforces broadly + introduces new words naturally

### Exposure Math
- 4 NPCs in Area 1, each visited multiple times
- ~5 visits per NPC to graduate 1 word = 20 visits for Priority 1
- Player also gains exposure from creature barks, items, moves
- Realistic timeline: 10-20 play sessions to reach Tier A from zero

## Implications for Future Areas

1. **New areas should add ~10-15 glue words** alongside their content (creatures, items, moves)
2. **Area 2 nouns help world-building** but don't improve dialogue until combined with glue
3. **NPC dialogue is the primary vehicle** for teaching non-game vocabulary
4. **The game's vocab loop**: gameplay teaches nouns/verbs → dialogue teaches glue → more glue enables richer dialogue → richer dialogue teaches more vocab

## Prompt Engineering Recommendations

Based on verification failures:
1. **Add to FREE list:** どっち (appeared naturally in 3+ experiments, too common to burn i+1 on)
2. **Add compound word warning:** "注意：今日≠今、見つける≠見る、出す≠出る. These are separate words."
3. **Reinforce noun/verb distinction:** "歌 (song, noun) is NOT a conjugation of 歌う (to sing, verb)"
4. **Strengthen reinforcement prompt:** "These words are nearly learned — use them if natural: [word list with exposure counts]"

---

## Appendix: Concrete Dialogue Examples

### A. The Tier C Progression (0 → 80 → 90 words)

**Experiment 1 — 0 content words (FREE grammar only)**
Child NPC. The absolute floor.
```json
{ "greeting": "こんにちは！何をしますか？" }
```
*Technically valid Japanese, but completely generic. No personality, no world, no teaching value.*

**Experiment 2 — 13 words (creature names only)**
Child NPC. Only nouns available.
```json
{ "greeting": "こんにちは！猫と犬と鳥、好きですか？" }
```
*Note: 好き is the i+1 word here (not in the 13-word list). Without it, the child could only list nouns: "猫！犬！鳥！花も！ね？" — excited pointing, not real dialogue. One adjective (好き) transforms a word-list into a question.*

**Experiment 3 — 50 words (Area 1 core: creatures + moves + items + NPCs)**
Child NPC. Verbs now available.
```json
{ "greeting": "こんにちは！子供です！広場で遊びますか？" }
```
*Verbs unlock real sentences. The child can now invite the player to DO something. But no adjectives = no emotion.*

**Experiment 5 — 80 words (Area 1 + creature barks)**
Child NPC. Adjectives and common verbs now available.
```json
{ "greeting": "こんにちは！ここは楽しいよ！猫と遊びますか？すごいのがいるよ！" }
```
*Personality shines through. "It's fun here! Want to play with the cats? There's an amazing one!" — the creature bark words (楽しい, すごい, ここ) are the emotional glue. This is the Tier C threshold.*

**Experiment 8 — 90 words (Area 1 + barks + 10 glue)**
Child NPC. Added: 私, 一緒, とても, 今, 知る, etc.
```json
{ "greeting": "こんにちは！一緒に遊ぶ？今、とても楽しいところを知ってるよ！" }
```
*Dramatic improvement. "Want to play together? I know a really fun place right now!" — 一緒 (together), 今 (now), とても (very), 知ってる (I know) transform the child from pointing at things to expressing relationships and knowledge.*

### B. Personality Differentiation (same 80 words, different NPCs)

**Experiment 5 — Child (80 words)**
```json
{ "greeting": "こんにちは！ここは楽しいよ！猫と遊びますか？すごいのがいるよ！" }
```

**Experiment 6 — Adult (80 words)**
```json
{ "greeting": "ここは広場です。準備はいいですか。" }
```

**Experiment 7 — Girl (80 words)**
```json
{ "greeting": "あ…こんにちは。ここの花、きれいですね。" }
```

*Same vocabulary, completely different characters. The child is exclamatory and game-seeking. The adult is terse and businesslike. The girl is hesitant, uses ellipsis, and deflects to flowers. Word SELECTION from the shared pool, not word count, drives personality.*

### C. The Definitive Test: Glue vs Nouns

**Experiment 8 — 90 words (80 base + 10 glue), Tier C, Child**
```json
{ "greeting": "こんにちは！一緒に遊ぶ？今、とても楽しいところを知ってるよ！" }
```

**Experiment 9 — 100 words (Areas 1+2, all nouns/verbs, zero glue), Tier C, Child**
```json
{ "greeting": "こんにちは！ここの森で遊ぶ？川も石橋もあるよ！" }
```

*Experiment 8 has FEWER total words but BETTER dialogue. The child in Exp 8 expresses knowledge and social connection ("I know a fun place, let's go together!"). The child in Exp 9 is a tour guide listing scenery ("There's a forest, river, and stone bridge!"). 10 glue words > 50 extra nouns.*

### D. Tier B at Different Vocab Levels

**Experiment 11 — 50 words, Tier B, Child**
Every field burns its i+1 slot on basic glue words:
```json
{
  "greeting": "こんにちは！遊ぶのが好きですか？",
  "rounds": [{
    "npcLine": "広場で猫と遊ぶのは楽しいですよ！",
    "options": [
      { "text": "うん、猫が好きです！", "tone": "positive" },
      { "text": "猫はここにいますか？", "tone": "neutral" },
      { "text": "いいえ、眠るのがいいです", "tone": "negative" }
    ]
  }]
}
```
*好き, 楽しい, ここ, いい are all i+1 words (not in the 50-word list). Every field NEEDS its unknown-word budget just for basic adjectives. No room to teach interesting vocabulary.*

**Experiment 12 — 80 words, Tier B, Child**
Those same words are now known. i+1 budget freed for real teaching:
```json
{
  "greeting": "こんにちは！ここで遊ぶのは楽しいですよ！",
  "rounds": [{
    "npcLine": "猫と犬が走るのを見るのが好きです！もっと早く走れるかな？",
    "options": [
      { "text": "すごい！私も走るのが好きです", "tone": "positive" },
      { "text": "猫と犬、どっちが勝つかな？", "tone": "neutral" },
      { "text": "走るのは嫌です", "tone": "negative" }
    ]
  }]
}
```
*Now the npcLine has zero unknowns and reads naturally. The i+1 slots go to 私 and どっち — genuinely useful new vocabulary instead of survival words.*

**Experiment 16 — 100 words (80 + 20 glue), Tier B, Child**
All fields zero unknowns:
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
*100% known vocabulary, natural Japanese, personality intact. This is the Tier B comfort zone.*

### E. Tier A: Full Dialogue at 80 vs 130 words

**Experiment 20 — 80 words, Tier A, Child**
Works, but heavily recycled vocabulary:
```json
{
  "greeting": "遊ぶ？楽しいよ！",
  "defeatLine": "勝つ！すごいでしょう？",
  "freedLine": "ごめんね。もっと遊ぶ！",
  "rounds": [
    {
      "npcLine": "ここで遊ぶ？楽しいよ！",
      "options": [
        { "text": "うん、遊ぶ！", "tone": "positive" },
        { "text": "待って。準備する。", "tone": "neutral" },
        { "text": "嫌だ。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "虫、見る？花もあるよ！",
      "options": [
        { "text": "すごい！見る！", "tone": "positive" },
        { "text": "花はきれいですね。", "tone": "neutral" },
        { "text": "虫は怖い。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "走る？子供は早いよ！",
      "options": [
        { "text": "頑張る！走る！", "tone": "positive" },
        { "text": "ゆっくり行く。", "tone": "neutral" },
        { "text": "無理だ。", "tone": "negative" }
      ]
    }
  ]
}
```
*15/15 fields pass with zero unknowns. But notice: 遊ぶ appears 4 times, 楽しい 2 times, 走る 2 times. The dialogue works for a child character (short exclamations are natural), but it reads like a very simple picture book. Responses are 1-3 words.*

**Experiment 25 — 130 words, Tier A, Child**
Full fluency:
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
*15/15 fields, zero unknowns. The child asks your name, shows you a secret place, proudly presents something they made, and asks you to come back tomorrow. Real narrative arc. Real friendship progression. This is the target.*

### F. The Nouns-Only Disaster (150 words, zero glue)

**Experiment 29 — 150 words (Areas 1+2+3, NO barks, NO glue), Tier A, Child**
```json
{
  "greeting": "こんにちは！遊ぶ？",
  "defeatLine": "ああ…",
  "freedLine": "ありがとう！",
  "rounds": [
    {
      "npcLine": "森に虫がいるよ！走る？",
      "options": [
        { "text": "うん！走る！", "tone": "positive" },
        { "text": "何の虫ですか。", "tone": "neutral" },
        { "text": "いいえ。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "川で魚が泳ぐよ。桃も流れる。",
      "options": [
        { "text": "うん！川へ走ろう！", "tone": "positive" },
        { "text": "桃ですか。どこから？", "tone": "neutral" },
        { "text": "いいえ。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "山に登る？空と星がある！",
      "options": [
        { "text": "うん！登る！", "tone": "positive" },
        { "text": "山に何がありますか。", "tone": "neutral" },
        { "text": "いいえ。眠る。", "tone": "negative" }
      ]
    }
  ]
}
```
*150 words and the defeatLine is literally "ああ…" because there are no adjectives to express feelings. The freedLine is just "ありがとう！" (a FREE word — the 150 content words contributed nothing). The negative options are all "いいえ" because there's no 嫌, no 無理, no 怖い. World-rich (森, 川, 山, 星, 桃) but emotionally dead. Compare to Experiment 25's "友達になれて嬉しい！初めての友達だ！" with only 130 words.*

### G. Reinforcement Working Naturally

**Experiment 32 — 130 words + reinforcement targets, Tier A, Child**
Targets: 元気(2x), 友達(3x), 明日(1x), 教える(2x), 作る(4x), 場所(1x)
```json
{
  "greeting": "こんにちは！元気？友達と一緒に遊ぶ場所を探してるの！",
  "defeatLine": "ああ… 負けた。でも、すごかった！",
  "freedLine": "ありがとう！嬉しい！友達になる？",
  "rounds": [
    {
      "npcLine": "ここで友達と何か作ったよ！見る？私が教えてあげる！",
      "options": [
        { "text": "見たい！教えてください！", "tone": "positive" },
        { "text": "何を作りましたか。", "tone": "neutral" },
        { "text": "いいえ。今は無理です。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "この前、新しいものを作ったの。友達にも教えるよ。",
      "options": [
        { "text": "すごい！私にも教えて！", "tone": "positive" },
        { "text": "何を作ったの？", "tone": "neutral" },
        { "text": "嫌です。", "tone": "negative" }
      ]
    },
    {
      "npcLine": "明日、一緒にここに来る？もっと楽しいものを作りたい！",
      "options": [
        { "text": "うん！行く！作ろう！", "tone": "positive" },
        { "text": "何を作りますか。", "tone": "neutral" },
        { "text": "明日は無理です。ごめん。", "tone": "negative" }
      ]
    }
  ]
}
```
*All 6 target words appear naturally: 元気 (greeting), 友達 (greeting + freedLine + R1 + R2), 場所 (greeting), 作る (R1 + R2 + R3, multiple conjugations), 教える (R1 + R2), 明日 (R3 + negative option). The reinforcement creates a coherent narrative theme: making things with friends, teaching each other, planning tomorrow. Not forced — the targets cluster naturally around a crafting/friendship story.*

### H. Variety Test (3 greetings, same vocab)

**Experiment 31 — 110 words, Child NPC, 3 different greetings**
```json
{ "greeting": "こんにちは！今日は楽しいことをする？一緒に遊ぼう！" }
```
```json
{ "greeting": "あ！来た来た！私の友達？遊ぶ？" }
```
```json
{ "greeting": "おはよう！走る？歌う？何がいい？" }
```
*Three distinct approaches: (1) enthusiastic invitation, (2) excited recognition, (3) rapid-fire activity menu. Different greetings (こんにちは vs おはよう), different structures, different emotional registers. 110 words provides enough combinatorial space for ~4-5 distinct greetings before repetition.*
