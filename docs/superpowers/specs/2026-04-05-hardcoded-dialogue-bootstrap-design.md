# Hardcoded Dialogue Bootstrap System

**Date:** 2026-04-05
**Status:** Design
**Depends on:** [Minimum Viable i+1 Dialogue Findings](2026-04-04-minimum-viable-i1-dialogue-findings.md)

---

## 1. Problem

New players know zero Japanese. The game teaches words through gameplay (creature names, moves, items, barks), but AI-generated dialogue requires ~130+ known words to produce natural, personality-rich, i+1-compliant Japanese. Between 0 and 130 words, the AI is unreliable — it produces flat noun-lists, violates i+1 constraints, and wastes teaching slots on survival vocabulary instead of interesting words.

We need a bridge: handcrafted dialogue for Areas 1-3 that guarantees quality while teaching the glue words (pronouns, adjectives, common verbs) that make AI dialogue possible by Area 4.

## 2. Core Design Decisions

### 2.1 Full Japanese Display (renderJpFirst)

All hardcoded dialogue renders as **full Japanese with vertical stacks on unknown words**. The `renderEnFirst` pattern (English with Japanese swapped in) is retired for all dialogue except the prologue.

- Known words: displayed as Japanese only (inline, no box)
- Unknown words: vertical stack card — Japanese on top, English definition below, blue border
- Prologue: unchanged, keeps `renderEnFirst` since the player knows 0 words

This means every word in every hardcoded line must be carefully chosen. There is no English safety net. A word the player doesn't know appears as a stack card; a word not in the dictionary at all is an unreadable glyph.

### 2.2 Plain Japanese Data Format

Dialogue is stored as plain Japanese strings. No `{en|ja|reading}` tags.

```json
"こんにちは！一緒に遊ぶ？"
```

A tokenizer breaks the text into morphemes, looks up each token's dictionary form in the word dictionary, and the renderer builds the display. This format is identical whether the content is hand-authored or AI-generated — the system doesn't care about the source.

### 2.3 Word-Gated Filtering

Every dialogue line declares nothing about itself — the system is smart enough to figure it out. At load time, each line is tokenized and its content words are extracted. At runtime, the system compares those words against the player's known set and checks the i+1 rule: each sentence may contain at most 1 unknown word.

Lines that the player can read are eligible. Lines they can't read are filtered out. As the player learns more words, more lines become eligible. Progression is smooth — no arbitrary thresholds.

### 2.4 Tokenizer Interface

A single `tokenize(text)` function wraps the morphological analyzer. Day 1 implementation uses the existing JPDB parse API. Future swap to `lindera-wasm-unidic-nodejs` (Rust→WASM, UniDic dictionary, zero external dependencies). No consumer code changes on swap.

```js
// src/tokenizer.js
export async function tokenize(text) → [{ surface, baseForm, pos }]
```

This tokenizer replaces JPDB parsing everywhere — hardcoded dialogue, AI-generated dialogue, bark filtering, i+1 enforcement. One tokenizer for the whole game.

### 2.5 Definition Overrides

A word like 切る can mean "to cut" or "to turn off." The tokenizer identifies the word; it doesn't know which meaning is intended. For most words, the dictionary's primary definition is correct. For ambiguous cases, the dialogue author (human or AI) provides an override:

```json
{
  "text": "電気を切る",
  "overrides": { "切る": "to turn off" }
}
```

No override = use primary dictionary definition. Override = use this meaning in the vertical stack display. The jpdb lookup popup (tap-to-expand) always shows all definitions regardless.

## 3. Architecture

### 3.1 Word Dictionary

A centralized `Map<kanji, {reading, en}>` built at server startup from all game data sources:

1. `data/creatures.json` — creature names
2. `data/moves.json` — move verbs
3. `data/items.json` — item names
4. `data/npcs.json` + `data/npc-skills.json` — NPC names, skill verbs
5. `data/areas.json` — area words
6. `data/creature-speech.json` — bark vocabulary (current 30 words)
7. `data/glue-words.json` — **new file**, Priority 1-5 curriculum words

The dictionary is small (~200-300 entries for Areas 1-3) and held in memory. Conflicts are resolved by source priority (game data files win).

### 3.2 Dialogue Data Files

```
data/dialogue/
  cid-scripts.json    — CID run-start scripts
  npc-lines.json      — NPC per-slot dialogue pools
  barks.json          — bark pool by trigger category
data/glue-words.json  — glue word curriculum
```

### 3.3 CID Run-Start Scripts

CID speaks 2-4 lines at the start of each roguelike run. Scripts are grouped — multiple lines that form a coherent mini-pep-talk. The system picks the highest-tier eligible script.

```json
[
  {
    "id": "cid-welcome-0",
    "lines": [
      "こんにちは！",
      "一緒に行く？楽しいよ！"
    ]
  },
  {
    "id": "cid-welcome-1",
    "lines": [
      "おはよう！今日はとても楽しいところを知ってるよ！",
      "私と一緒に行く？すごいものを見せたい！"
    ]
  }
]
```

**Script eligibility:** A script is eligible if every line passes the per-sentence i+1 check against the player's known words.

**Selection priority:**
1. Pick eligible script with the most teaching words (pushes player forward)
2. Deprioritize scripts the player has already seen (tracked in player state)
3. If all eligible scripts have been seen, repeat the one seen longest ago

**Tone:** CID is your buddy welcoming you to adventure. Teaching happens naturally — not a flashcard drill.

**Content scope:** ~6-8 scripts for Area 1, covering 0 glue words through Priority 1 complete. Later areas add more scripts to the same pool.

### 3.4 NPC Dialogue Lines

Each NPC has three dialogue slots, each with a pool of lines:

- `shopGreeting` — shown when the player enters the NPC's shop
- `fightStart` — shown when NPC combat begins
- `defeatLine` — shown when the player wins

```json
{
  "kodomo": {
    "shopGreeting": [
      "こんにちは！遊ぶ？",
      "こんにちは！私も遊ぶのが好き！",
      "一緒に遊ぶ？とても楽しいよ！"
    ],
    "fightStart": [
      "頑張れ！",
      "負けないよ！楽しい！"
    ],
    "defeatLine": [
      "強い！",
      "すごい！強い！"
    ]
  }
}
```

**Selection logic:** Same word-gated filtering as CID. Among eligible lines, prefer ones that teach the next curriculum glue word. Avoid repeating the line from last visit.

**Personality through word selection** (validated by research):
- Child (子供): 遊ぶ, 楽しい, すごい — exclamatory, game-seeking
- Adult (大人): 働く, 準備, しっかり — measured, practical
- Girl (女の子): hesitation (あ…), きれい, 花, ね — shy, gentle
- Boy (男の子): おはよう, 早い, もっと — competitive, energetic

**Content scope:** ~5-8 lines per slot per NPC for Area 1 (~60-100 lines total). Later areas add their own NPC pools.

### 3.5 Bark Pool

One large JSON object keyed by trigger category. Each category contains an array of plain Japanese strings.

```json
{
  "onHit": [
    "痛い！",
    "強い！痛い！",
    "とても強い…まだ負けない！"
  ],
  "onVictory": [
    "すごい！勝った！",
    "やった！楽しかった！"
  ],
  "onAttack": [
    "行くぞ！",
    "頑張れ！負けないぞ！"
  ]
}
```

**Replaces `creature-speech.json`.** The current 8x3 bark grid becomes seed data for the new pool. The pool grows over time — more complex barks become eligible as the player learns more words.

**Runtime behavior:**
1. Filter by trigger category (onHit, onVictory, etc.)
2. Filter to eligible barks (per-sentence i+1 check)
3. 80/20 roll: 80% reinforcement bark (all words known), 20% teaching bark (1 unknown)
4. Pick randomly, avoid repeats within same combat

### 3.6 Glue Word Curriculum

`data/glue-words.json` defines the functional words that NPC dialogue and CID scripts teach. Ordered by priority (validated by 32 experiments — see findings doc).

```json
[
  { "word": "私", "reading": "わたし", "en": "I/me", "priority": 1 },
  { "word": "一緒", "reading": "いっしょ", "en": "together", "priority": 1 },
  { "word": "とても", "reading": "とても", "en": "very", "priority": 1 },
  { "word": "今", "reading": "いま", "en": "now", "priority": 1 },
  { "word": "知る", "reading": "しる", "en": "to know", "priority": 1 },
  { "word": "思う", "reading": "おもう", "en": "to think", "priority": 1 },
  { "word": "これ", "reading": "これ", "en": "this", "priority": 1 },
  { "word": "それ", "reading": "それ", "en": "that", "priority": 1 },
  { "word": "まだ", "reading": "まだ", "en": "still/yet", "priority": 1 },
  { "word": "言う", "reading": "いう", "en": "to say", "priority": 1 },
  { "word": "この", "reading": "この", "en": "this (adj)", "priority": 2 },
  { "word": "あの", "reading": "あの", "en": "that (adj)", "priority": 2 },
  { "word": "来る", "reading": "くる", "en": "to come", "priority": 2 },
  { "word": "友達", "reading": "ともだち", "en": "friend", "priority": 2 },
  { "word": "嬉しい", "reading": "うれしい", "en": "happy", "priority": 2 },
  { "word": "今日", "reading": "きょう", "en": "today", "priority": 2 },
  { "word": "少し", "reading": "すこし", "en": "a little", "priority": 2 },
  { "word": "出る", "reading": "でる", "en": "to go out", "priority": 2 },
  { "word": "入る", "reading": "はいる", "en": "to enter", "priority": 2 },
  { "word": "上手", "reading": "じょうず", "en": "skilled", "priority": 2 },
  { "word": "食べる", "reading": "たべる", "en": "to eat", "priority": 3 },
  { "word": "小さい", "reading": "ちいさい", "en": "small", "priority": 3 },
  { "word": "大きい", "reading": "おおきい", "en": "big", "priority": 3 },
  { "word": "新しい", "reading": "あたらしい", "en": "new", "priority": 3 },
  { "word": "人", "reading": "ひと", "en": "person", "priority": 3 },
  { "word": "前", "reading": "まえ", "en": "before/front", "priority": 3 },
  { "word": "後", "reading": "あと", "en": "after/behind", "priority": 3 },
  { "word": "時", "reading": "とき", "en": "when/time", "priority": 3 },
  { "word": "話", "reading": "はなし", "en": "story/talk", "priority": 3 },
  { "word": "方", "reading": "ほう", "en": "direction/way", "priority": 3 },
  { "word": "気", "reading": "き", "en": "spirit/feeling", "priority": 4 },
  { "word": "手", "reading": "て", "en": "hand", "priority": 4 },
  { "word": "目", "reading": "め", "en": "eye", "priority": 4 },
  { "word": "声", "reading": "こえ", "en": "voice", "priority": 4 },
  { "word": "心", "reading": "こころ", "en": "heart/mind", "priority": 4 },
  { "word": "力", "reading": "ちから", "en": "power/strength", "priority": 4 },
  { "word": "道", "reading": "みち", "en": "road/path", "priority": 4 },
  { "word": "明日", "reading": "あした", "en": "tomorrow", "priority": 4 },
  { "word": "分かる", "reading": "わかる", "en": "to understand", "priority": 4 },
  { "word": "教える", "reading": "おしえる", "en": "to teach", "priority": 4 },
  { "word": "持つ", "reading": "もつ", "en": "to hold/have", "priority": 5 },
  { "word": "使う", "reading": "つかう", "en": "to use", "priority": 5 },
  { "word": "作る", "reading": "つくる", "en": "to make", "priority": 5 },
  { "word": "出来る", "reading": "できる", "en": "to be able to", "priority": 5 },
  { "word": "世界", "reading": "せかい", "en": "world", "priority": 5 },
  { "word": "場所", "reading": "ばしょ", "en": "place", "priority": 5 },
  { "word": "初めて", "reading": "はじめて", "en": "first time", "priority": 5 },
  { "word": "元気", "reading": "げんき", "en": "healthy/energetic", "priority": 5 },
  { "word": "名前", "reading": "なまえ", "en": "name", "priority": 5 },
  { "word": "色", "reading": "いろ", "en": "color", "priority": 5 }
]
```

Priority 1 is taught in Area 1 (via CID + NPC dialogue). Priority 2 in Area 2. Priority 3-5 in Area 3. By Area 4, all 50 glue words are known and AI dialogue takes over.

## 4. End-to-End Pipeline

### 4.1 Server Startup

```
Server boots
  ↓
loadWordDictionary()
  → reads creatures.json, moves.json, items.json, npcs.json,
    npc-skills.json, areas.json, glue-words.json
  → merges into Map<kanji, {reading, en}>
  → held in memory
  ↓
loadDialoguePools()
  → reads data/dialogue/cid-scripts.json
  → reads data/dialogue/npc-lines.json
  → reads data/dialogue/barks.json
  → for each unique line, calls tokenize(text)
  → extracts content words (tokens whose baseForm is in the word dictionary)
  → caches tokenized results in memory:
     each line → { raw, tokens[], contentWords[] }
  ↓
Server ready
```

### 4.2 CID Run-Start

```
Player starts run
  ↓
Server fetches player's knownWords set
  ↓
filterEligibleScripts(cidScripts, knownWords)
  → for each script:
    for each line:
      for each sentence (split on Japanese period/exclamation):
        count content words where baseForm NOT in knownWords
        sentence passes if unknowns ≤ 1
    script eligible if ALL lines pass
  ↓
rankScripts(eligible, knownWords, seenScripts)
  → count total teaching words across all lines
  → prefer script with most teaching words
  → deprioritize scripts player has seen (tracked in player state)
  ↓
selectedScript = highest-ranked eligible
  ↓
Response: { cidLines: ["こんにちは！一緒に遊ぶ？", ...], overrides: {} }
  ↓
Frontend receives lines
  ↓
For each line:
  tokenize(line) → tokens with baseForm
  → look up each token in wordDictionary for reading/en
  → check overrides for context-specific definitions
  → renderJpSentence(tokens, knownWords, wordDict, overrides)
    → known word: Japanese only (inline, no box)
    → unknown word: vertical stack (Japanese + English)
    → particles/grammar: plain text
  ↓
  narrationBox.show(html, { speaker: "CID", html: true })
  → player taps to advance through lines
  ↓
  flushExposures()
  → unknown words shown get exposure +1 on server
```

### 4.3 NPC Shop Greeting

```
Player encounters NPC (e.g. 子供)
  ↓
Server fetches knownWords
  ↓
filterEligibleLines(npcLines["kodomo"]["shopGreeting"], knownWords)
  → same per-sentence i+1 check
  ↓
selectLine(eligible, knownWords, curriculum, lastSeen)
  → prefer lines teaching the next curriculum glue word the player hasn't learned
  → among ties, prefer lines that reinforce near-threshold words
    (words at 3-4 exposures, approaching the 5-exposure SRS trigger)
  → avoid repeating the line from last visit
  ↓
Response: { greeting: "こんにちは！私も遊ぶのが好き！", overrides: {} }
  ↓
Frontend: tokenize → renderJpSentence → narrationBox → flushExposures
```

### 4.4 NPC Combat Lines

```
NPC combat begins
  ↓
Server selects fightStart line (same filtering as greeting)
  → Response: { fightStart: "頑張れ！負けないよ！" }
  → Frontend renders in narration box before combat starts
  ↓
...combat happens...
  ↓
Player wins
  ↓
Server selects defeatLine (same filtering)
  → Response: { defeatLine: "強い！すごい！" }
  → Frontend renders in narration box after victory
  → flushExposures()
```

### 4.5 Combat Barks

```
Player's creature attacks, lands a hit
  ↓
Frontend emits combatEvents 'creatureHit'
  ↓
pickBark("onHit", knownWords)
  → filter barks["onHit"] to eligible (per-sentence i+1 check)
  → roll 80/20:
     80% → pick from fully-readable barks (all words known)
     20% → pick from teachable barks (exactly 1 unknown word)
  → pick randomly from selected pool, avoid repeats in same combat
  ↓
tokenize → renderJpSentence → show speech bubble above creature sprite
  → addExposure() for any unknown words
  → bubble auto-dismisses after ~2 seconds
```

### 4.6 Tokenization Detail

Japanese has no spaces. Given `一緒に遊ぶ？楽しいよ！`, the tokenizer returns:

```js
[
  { surface: "一緒", baseForm: "一緒", pos: "名詞" },
  { surface: "に",   baseForm: "に",   pos: "助詞" },
  { surface: "遊ぶ", baseForm: "遊ぶ", pos: "動詞" },
  { surface: "？",   baseForm: "？",   pos: "記号" },
  { surface: "楽しい", baseForm: "楽しい", pos: "形容詞" },
  { surface: "よ",   baseForm: "よ",   pos: "助詞" },
  { surface: "！",   baseForm: "！",   pos: "記号" }
]
```

The renderer then:
1. Checks if baseForm is in wordDictionary → if yes, it's a content word
2. Checks if baseForm is in knownWords → known or unknown
3. Checks if baseForm is in ALLOWED_WORDS (particles, grammar) → always free
4. Builds the appropriate display (inline Japanese, vertical stack, or plain text)

Conjugated forms resolve naturally: 遊んで → baseForm: 遊ぶ → finds "play" in dictionary. The author writes natural Japanese; the tokenizer handles the rest.

## 5. The Player's Journey: Zero to Full AI

### Run 1 — First Contact (0 words known)

The player has just finished the prologue (which uses `renderEnFirst` — English with Japanese highlights). They know zero content words. CID hasn't spoken in Japanese yet.

**CID run-start:** The simplest eligible script fires. CID speaks in very basic Japanese — mostly FREE words (greetings, particles) with 1-2 content words from the player's first creatures.

> こんにちは！

One line. Fully readable because こんにちは is a FREE expression. The player sees pure Japanese with no stacks (all known/free). This is their first moment of "I can read Japanese."

**First combats:** The player fights wild creatures. Barks fire — simple ones like:

> 痛い！

> 行くぞ！

Each bark is a single word with a vertical stack (Japanese on top, English below). The player sees the word, hears the TTS, and starts building exposure. After 5 exposures of 痛い across multiple fights, it enters their Speed Review deck.

**NPC shop visit:** The player encounters 子供 (Child). The simplest eligible shopGreeting fires:

> こんにちは！

Same as CID — just a greeting. But it's the NPC speaking with their personality. The player is in a fully Japanese environment, reading real Japanese, even though the vocabulary is tiny.

**What the player is learning:** Creature names (火, 水, 木), move verbs (叩く), bark words (痛い, 強い, 行く). All through gameplay exposure, not dialogue.

### Runs 2-5 — Building the Base (~20-50 words known)

The player has fought many creatures, heard barks dozens of times, and bought items from shops. They've done several Speed Reviews, graduating words from "seen" to "known."

**CID run-start:** A richer script becomes eligible as bark words graduate to known:

> こんにちは！楽しいよ！
> ここは広場です。行く？

Two lines. 楽しい and ここ are bark words the player has graduated. 広場 is the area word. No vertical stacks needed — the player reads it all. Maybe 行く is still learning — it shows as a stack card.

**Barks expand:** The player now qualifies for 2-word barks:

> 強い！痛い！

> すごい！勝った！

These are reinforcement barks — all known words, no stacks. Occasionally (20% of the time) a teaching bark appears:

> まだ負けない！

まだ is a Priority 1 glue word. It appears as a vertical stack in the speech bubble. The player sees it 2-3 times across combats, building exposure.

**NPC greetings personalize:** The Child now says:

> こんにちは！遊ぶ？楽しいよ！

遊ぶ is their NPC skill word (high exposure from shop visits). 楽しい is from barks. The player reads a full sentence in Japanese without help. The NPC feels like a character, not a textbook.

### Runs 5-10 — Glue Words Arrive (~50-80 words known)

The player has completed most of Area 1's content. Creature names, move verbs, item names, bark words — all graduating through Speed Review. The vocabulary is heavily nouns and action verbs.

**CID run-start:** CID starts using Priority 1 glue words:

> こんにちは！私と一緒に行く？
> とても楽しいところを知ってるよ！

私 (I) and 一緒 (together) appear as vertical stacks — these are the teaching words. The player has seen 一緒 in a bark before (1 exposure) but hasn't graduated it yet. CID reinforces it.

**NPC greetings teach glue:** The Child says:

> こんにちは！私も遊ぶのが好き！

私 is the i+1 teaching word. The player sees the stack card: わたし on top, "I/me" below. After seeing 私 from CID, from this NPC, and from another NPC across visits, it hits 5 exposures and enters Speed Review.

**The Adult says:**

> ここは広場です。準備はいいですか。

No teaching word needed — the Adult's personality naturally produces sentences with all-known words. Personality hides vocabulary limits via composure.

**The Girl says:**

> あ…こんにちは。ここの花、きれいですね。

きれい is already known from barks. The Girl's personality comes through in word selection and hesitation markers, not vocabulary complexity.

### Runs 10-15 — Functional Vocabulary (~80-100 words known)

The player has graduated Priority 1 glue words through Speed Review: 私, 一緒, とても, 今, 知る, 思う, これ, それ, まだ, 言う. They can express themselves.

**CID run-start:** Richer scripts unlock:

> おはよう！今日はとても楽しいところに行く！
> 私はここが好き。一緒に行くと楽しいと思う！

今日 (today) is a Priority 2 word appearing as a stack. Everything else is known. The player reads two full sentences of natural Japanese with only one unknown word. CID sounds like a real friend.

**NPC fight lines:** The Child challenges you:

> 一緒に遊ぶ？負けないよ！

The player reads this instantly — no stacks. They're reading Japanese fluently at this level.

**NPC defeat lines:** After losing, the Child says:

> 強い！すごい！

Short, emotional, fully known. Defeat is a brief moment, not a lesson.

**Barks are getting complex:**

> もっと頑張る！まだ負けない！

> とても楽しかった！すごい！

Full short sentences, all known words. The player doesn't even notice they're reading Japanese — it just makes sense.

### Runs 15-25 — Area 2 Content (~100-130 words known)

Area 2 introduces new creatures, items, moves, and NPCs. The content vocabulary expands. Priority 2 glue words (この, あの, 来る, 友達, 嬉しい, 今日, 少し, 出る, 入る, 上手) are being taught through NPC dialogue.

**Same system, no code changes.** Area 2 NPCs have their own line pools in `npc-lines.json`. CID scripts reference Area 2 vocabulary. Barks in the pool that require Area 2 words become eligible.

**NPC greetings in Area 2:**

> この場所、知ってる？友達と来たよ！

この (this) and 友達 (friend) are Priority 2 teaching words. The player reads most of it and learns two new words from one visit.

### Runs 25-35 — Area 3 Japanese Quizzes (~130-160 words known)

Same dialogue system as Areas 1-2 for greetings and fight lines. The new addition: **NPC defeat lines include hardcoded comprehension quizzes**, entirely in Japanese. The player must demonstrate they understood what the NPC said.

Quiz format is TBD (separate future design). The system architecture doesn't change.

Priority 3-5 glue words are being taught. The player's vocabulary now includes storytelling words (前, 後, 時), description words (大きい, 小さい, 新しい), and teaching words (教える, 分かる).

**Barks at this level:**

> この前、大きい虫を見た！すごかった！

Full multi-clause sentences with temporal references and descriptions. The player reads them without thinking about it.

### Area 4+ — Full Generative Dialogue (~160+ words known)

The handcrafted training wheels come off. The AI dialogue system (narration engine) takes over completely.

**What changes:** The dialogue source switches from JSON pools to AI generation. Everything else stays the same — same tokenizer, same `renderJpSentence`, same word-gated i+1 enforcement, same exposure tracking.

**What the AI can now produce (validated by research at 130 words):**

> こんにちは！元気？名前は何？一緒に遊ぶ？

> この場所、知ってる？私が前に来た！きれいな花があるよ！

> 明日も来る？一緒に遊べたら嬉しい！

Full 3-round NPC dialogues with personality, narrative arcs, emotional expression, and zero unknown words in most fields. The i+1 budget goes toward genuinely interesting new vocabulary, not survival glue.

The player doesn't notice the transition. The Japanese just keeps getting richer.

## 6. Area Progression Summary

| Area | Dialogue Source | Display Mode | Teaching Focus | New System |
|------|----------------|-------------|----------------|------------|
| **1** | Hardcoded JSON pools | renderJpFirst | Priority 1 glue (私, 一緒, とても...) | Word-gated filtering, bark pool, CID scripts |
| **2** | Hardcoded JSON pools | renderJpFirst | Priority 2 glue (この, 友達, 嬉しい...) | None — just new JSON content |
| **3** | Hardcoded JSON pools | renderJpFirst | Priority 3-5 glue + Japanese quizzes | Quiz system (future design) |
| **4+** | AI-generated (narration engine) | renderJpFirst | Full vocabulary | None — existing system takes over |

Areas 2-4 require zero new systems. Area 2-3 are content additions (JSON files). Area 4 is the existing generative pipeline, gated behind the vocabulary threshold.

## 7. What Changes in Existing Code

### New Code
- `src/tokenizer.js` — `tokenize()` interface wrapping JPDB parse (swap to lindera later)
- `src/game/word-dictionary.js` — builds and serves the centralized word dictionary
- `src/game/dialogue-filter.js` — word-gated filtering, line selection, script ranking
- `renderJpSentence()` in `bootstrap-client.js` — sentence-level renderer using tokenizer + dictionary
- `data/dialogue/*.json` — dialogue pool data files
- `data/glue-words.json` — curriculum data

### Modified Code
- `speech-bubble.js` — uses `renderJpSentence` instead of `renderJpFirst(jp, reading, en)`
- NPC encounter endpoint — returns word-gated lines instead of hardcoded "こんにちわ!"
- Game loop — adds CID run-start hook
- `narration-box.js` — renders dialogue HTML from `renderJpSentence`

### Unchanged
- Prologue (`renderEnFirst`, tagged format)
- Speed Review system
- Exposure → known pipeline (5 exposures → SRS → review → known)
- jpdb lookup popup
- TTS integration (VOICEVOX)
- AI dialogue generation for Area 4+ (narration engine, uses `tokenize()` for validation)

## 8. Content Authoring Scope (This Implementation)

Only Area 1 content is authored now. The system is built so adding Area 2-3 content is a JSON-only task.

| Content | Count | Description |
|---------|-------|-------------|
| CID scripts | ~6-8 | Progression-gated run-start pep talks |
| NPC shopGreeting lines | ~5-8 per NPC (x4 NPCs) | Word-gated greeting pools |
| NPC fightStart lines | ~3-5 per NPC (x4 NPCs) | Pre-combat lines |
| NPC defeatLine lines | ~3-5 per NPC (x4 NPCs) | Post-victory lines |
| Barks | ~50-100 | Expanding the current 24 to a proper pool |
| Glue words | 50 | Priority 1-5 curriculum (data file, not dialogue) |

Total: ~150-200 lines of Japanese dialogue + 50 curriculum entries.

## 9. Conjugation Handling

The tokenizer resolves conjugated forms to dictionary form: 遊んで → 遊ぶ, 楽しかった → 楽しい, 負けない → 負ける. This means:

- Dialogue authors write natural Japanese with any conjugation
- The word dictionary only stores dictionary forms
- The filter checks baseForm against knownWords (which also stores dictionary forms)
- The renderer looks up baseForm in the dictionary for reading/English
- The display shows the actual surface form (遊んで), not the dictionary form

**Known risk:** Some conjugated surface forms may confuse early learners (they learned 遊ぶ but see 遊んで). This is acceptable — the vertical stack shows the English meaning, and the jpdb popup shows the full word entry. Learning conjugation patterns is part of Japanese acquisition.

## 10. Open Questions

1. **Sentence boundary detection:** Japanese doesn't always use clear sentence-ending punctuation. How do we split multi-sentence lines for the per-sentence i+1 check? Proposed: split on 。！？ and treat each segment independently.

2. **Bark pool size:** Starting with ~50-100 barks. Is this enough variety? Can be expanded over time without system changes.

3. **CID seen-tracking storage:** Where does "which CID scripts has this player seen" live? Proposed: in the existing NPC memory system (player state).

4. **Frontend tokenization:** The pipeline shows tokenize() being called on the frontend for rendering. Should we tokenize server-side and send pre-tokenized data to the frontend instead? This avoids JPDB API calls from the client.

5. **Area 3 quiz design:** Deferred to a separate spec. The dialogue system architecture supports it — quizzes are just another dialogue slot with a different frontend display.
