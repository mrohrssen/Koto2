# Minimum Viable Vocabulary for i+1 Generative Dialogue

**Date:** 2026-04-04
**Type:** Research (subagent stress testing, not code implementation)
**Goal:** Find the minimum vocabulary threshold where AI can generate natural i+1 Japanese NPC dialogue, and determine whether additional areas or targeted "glue words" are the better path to unlock generative dialogue.

## Problem

New players know zero Japanese. The game teaches words through gameplay (creature names, moves, items, NPC names, creature combat barks). After looping through Area 1, a player has ~80 content words. The question: **is that enough for generative i+1 dialogue, and if not, what specific words unlock it?**

## Core Hypothesis

Area 1's vocabulary is heavily weighted toward nouns (creature/item names) and combat verbs, but creature barks add critical "glue" — adjectives (強い, 楽しい, 怖い), common verbs (行く, 見る, 待つ), and emotional expressions (すごい, ごめん). This glue may be sufficient to unlock basic dialogue without teaching any additional words.

**Secondary hypothesis:** Adding a second area (50 more nouns) helps less than adding 10-20 curated "glue words" (adjectives, pronouns, time words).

## Vocabulary Inventory

### FREE Words (~80, always allowed per ALLOWED_WORDS in vocab-repair.js)

Particles, grammar auxiliaries, combined forms, question words, common expressions. These don't count as "known" — they're always permitted.

### Area 1 Core (50 content words)

| Category | Count | Words |
|----------|-------|-------|
| Creatures | 13 | 火, 水, 木, 石, 鉄, 風, 虫, 花, 鳥, 魚, 猫, 犬, 火猫 |
| Move verbs | 14 | 叩く, 炎, 燃える, 守る, 飛ぶ, 泣く, 眠る, 流す, 囲む, 握る, 切る, 呼ぶ, 飲む, 怒る |
| NPC skills | 4 | 遊ぶ, 働く, 走る, 歌う |
| Items | 13 | お茶, 豆腐, りんご, 卵, いちご, 酒, ラーメン, 弁当, 刀, 本, 靴, 鏡, 帽子 |
| NPCs | 4 | 子供, 大人, 男の子, 女の子 |
| Area | 2 | 始まり, 広場 |

### Creature Speech Words (~30 additional unique words)

From `creature-speech.json` barks:
| Category | Words |
|----------|-------|
| Adjectives | 痛い, 強い, 楽しい, 怖い, 危ない |
| Common verbs | 行く, 見る, 待つ, 助ける, 負ける, 勝つ, 止める, 頑張る |
| Emotional | 嫌, すごい, ごめん, 無理, しまう, 大丈夫 |
| Other | いい/よい |

From creature character card example dialogue:
| Category | Words |
|----------|-------|
| Adjectives | 好き, きれい, 早い |
| Adverbs | ゆっくり, しっかり, もっと |
| Nouns | 雨, 音, 春, 準備 |
| Deictics | ここ |

### Glue Word Batches (for progressive testing)

Curated by conversational utility, informed by JPDB frequency:

**Batch 1 (10):** 私, これ, それ, 思う, 言う, 知る, 今, まだ, とても, 一緒
**Batch 2 (+10=20):** あの, この, 来る, 出る, 入る, 上手, 少し, 今日, 友達, 嬉しい
**Batch 3 (+10=30):** 食べる, 小さい, 大きい, 新しい, 前, 後, 時, 人, 話, 方
**Batch 4 (+10=40):** 気, 手, 目, 声, 心, 力, 道, 明日, 分かる, 教える
**Batch 5 (+10=50):** 持つ, 使う, 作る, 出来る, 世界, 場所, 初めて, 元気, 名前, 色

### Hypothetical Area 2 (50 additional content words, no glue)

Same structure as Area 1: 13 creature names, 14 move verbs, 4 NPC skills, 13 items, 4 NPCs, 2 area words. All different words but same category distribution.

## Experiment Design

### Prompt Template

Uses the real game format from `prompt-assembler.js` and `vocab-constraints.js`, simplified for new-player context (no memory, lorebook, or anti-repetition layers):

**System prompt:**
```
You write dialogue for NPCs in Koto, a bright sci-fi fantasy Japanese-learning RPG where creatures and humans coexist.
Each NPC has a distinct personality.
Output valid JSON matching the schema below.
The player is learning Japanese. Use ONLY words from their known vocabulary list, plus at most 1 unknown word per sentence.

=== 使える言葉（重要）===
この言葉リストからだけ使う：
[WORDLIST]

【ルール】
1. リストにない言葉は使わない。例外なし。
2. 助詞はOK：は、が、を、に、で、へ、と、も、の、か、よ、ね、や、から、まで、より
3. 数字OK。句読点OK。擬音OK。
4. 1文に知らない言葉は最大1つまで。
5. 表現できない場合はもっと簡単な言い方にする。

文法レベル：JLPT N5

=== CHARACTER ===
Name: [NPC name] ([NPC nameEn])
Personality: [traits]
Quirk: [quirk]

Example speech:
- "[example1]"
- "[example2]"
```

**Tier C task (greeting):**
```
Generate a personalized greeting for this NPC meeting a new player for the first time.
Output JSON: { "greeting": "one line" }
Also output word_inventory: for each content word used, list the word and which wordlist entry it maps to.
All text in Japanese. Output ONLY valid JSON.
```

**Tier B task (greeting + 1 exchange):**
```
Generate a greeting and short exchange.
Output JSON: { "greeting": "...", "rounds": [{ "npcLine": "...", "options": [{ "text": "...", "tone": "positive" }, { "text": "...", "tone": "neutral" }, { "text": "...", "tone": "negative" }] }] }
Generate exactly 1 round. Also output word_inventory. All text in Japanese. Output ONLY valid JSON.
```

**Tier A task (full 3-round dialogue):**
```
[Same as real game prompt — greeting, defeatLine, freedLine, 3 rounds with 3 options each]
Also output word_inventory. All text in Japanese. Output ONLY valid JSON.
```

### Three-Agent Pipeline

1. **Generator** — receives real prompt + wordlist + NPC card + tier. Outputs dialogue JSON + word inventory.
2. **Verifier** (separate agent, no shared context) — receives dialogue output + exact wordlist + ALLOWED_WORDS. Parses every sentence word-by-word. Reports ✅ on-list, 🟢 free/particle, ❌ violation for each word. PASS/FAIL per field.
3. **Scorer** (separate agent) — receives dialogue + NPC personality + tier. Does NOT see wordlist. Rates: naturalness (1-5), personality (1-5), engagement (1-5), teaching value (1-5). Total /20.

### The 32 Experiments

#### Block 1: Tier C — Personalized Greeting (1-2 sentences)
| # | Wordlist | NPC | Question |
|---|----------|-----|----------|
| 1 | FREE only (0 content) | Child | Absolute baseline |
| 2 | FREE + creature names (13) | Child | Nouns only |
| 3 | FREE + area 1 core (50) | Child | Base game, no barks |
| 4 | FREE + area 1 core (50) | Adult | Same vocab, different personality |
| 5 | FREE + area 1 + barks (80) | Child | Do barks unlock greetings? |
| 6 | FREE + area 1 + barks (80) | Adult | Barks + different personality |
| 7 | FREE + area 1 + barks (80) | Girl | Hardest personality for limited vocab |
| 8 | FREE + area 1 + barks + 10 glue (90) | Child | +10 glue improvement |
| 9 | FREE + areas 1+2 no barks (100) | Child | 100 nouns vs 80 mixed |
| 10 | FREE + area 1 + barks + 10 glue (90) | Child | Variety test (2nd gen of #8) |

#### Block 2: Tier B — Greeting + 1-Round Exchange
| # | Wordlist | NPC | Question |
|---|----------|-----|----------|
| 11 | FREE + area 1 core (50) | Child | Exchange without barks? |
| 12 | FREE + area 1 + barks (80) | Child | Do barks unlock exchanges? |
| 13 | FREE + area 1 + barks (80) | Girl | Personality at exchange level |
| 14 | FREE + area 1 + barks (80) | Boy | Energetic personality |
| 15 | FREE + area 1 + barks + 10 glue (90) | Child | +10 glue |
| 16 | FREE + area 1 + barks + 20 glue (100) | Child | +20 glue |
| 17 | FREE + area 1 + barks + 20 glue (100) | Adult | Same vocab, calm NPC |
| 18 | FREE + areas 1+2 no barks (100) | Child | 100 nouns vs 100 mixed |
| 19 | FREE + area 1 + barks + 20 glue (100) | Child | Variety test |

#### Block 3: Tier A — Full 3-Round Dialogue
| # | Wordlist | NPC | Question |
|---|----------|-----|----------|
| 20 | FREE + area 1 + barks (80) | Child | Can 80 words carry full dialogue? |
| 21 | FREE + area 1 + barks + 10 glue (90) | Child | Minimum full dialogue? |
| 22 | FREE + area 1 + barks + 20 glue (100) | Child | Medium glue |
| 23 | FREE + area 1 + barks + 30 glue (110) | Child | Large glue |
| 24 | FREE + area 1 + barks + 40 glue (120) | Child | Near target |
| 25 | FREE + area 1 + barks + 50 glue (130) | Child | Full "next 50" |
| 26 | FREE + area 1 + barks + 50 glue (130) | Adult | Different NPC |
| 27 | FREE + area 1 + barks + 50 glue (130) | Girl | Hardest personality |
| 28 | FREE + areas 1+2 + barks + 20 glue (150) | Child | Does area 2 help? |
| 29 | FREE + areas 1+2+3 no glue (150) | Child | 150 nouns vs 130 mixed |

#### Block 4: Reinforcement & Edge Cases
| # | Wordlist | Special | Question |
|---|----------|---------|----------|
| 30 | Area 1 + barks + 30 glue (110) | Reinforcement: "prefer 強い, 楽しい, 好き" | Does reinforcement work? |
| 31 | Area 1 + barks + 30 glue (110) | Generate 3 greetings same NPC | Variety/repetition test |
| 32 | Area 1 + barks + 50 glue (130) | Full dialogue + reinforcement | End-to-end simulation |

## Expected Outputs

1. **Threshold map**: Word count where each tier (C/B/A) unlocks
2. **Glue vs nouns**: Whether 10 adjectives outperform 50 extra creature names
3. **Critical glue words**: The specific 15-20 words that make the biggest difference
4. **Area scaling verdict**: Whether more areas help or are filler
5. **The "next 50" list**: Prioritized curriculum for dialogue-taught words
6. **NPC personality viability**: Whether character comes through at low vocab
7. **Reinforcement effectiveness**: Whether exposure-preference instructions work

## Graduation System (Preliminary)

Based on results, design a 3-tier system:
- **Tier C** (earliest): NPC greetings are personalized i+1 Japanese
- **Tier B** (mid): NPC greetings + 1 exchange round in Japanese
- **Tier A** (target): Full 3-round generative dialogue, all Japanese

Each tier unlocks when the player's known vocab crosses the experimentally-determined threshold.

## NPC Teaching Role

NPCs don't just use i+1 — they actively teach. The "next 50" target list informs word selection:
- Each NPC greeting introduces 1 new word from the target list
- Words the player has seen 1-4 times are preferred for re-use (reinforcement toward 5-exposure threshold)
- Once a word hits 5 exposures, it graduates to "known" and the system targets the next word
