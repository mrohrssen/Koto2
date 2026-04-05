# Hardcoded Dialogue Bootstrap System

**Date:** 2026-04-05
**Status:** Design (revised 2026-04-05)
**Depends on:** [Minimum Viable i+1 Dialogue Findings](2026-04-04-minimum-viable-i1-dialogue-findings.md)

---

## 1. Problem

New players know zero Japanese. The game teaches words through gameplay (creature names, moves, items, barks), but AI-generated dialogue requires ~130+ known words to produce natural, personality-rich, i+1-compliant Japanese. Between 0 and 130 words, the AI is unreliable — it produces flat noun-lists, violates i+1 constraints, and wastes teaching slots on survival vocabulary instead of interesting words.

We need a bridge: handcrafted dialogue for Areas 1-3 that guarantees quality while teaching the glue words (pronouns, adjectives, common verbs) that make AI dialogue possible by Area 4.

## 2. Core Design Decisions

### 2.1 Full Japanese Display (renderJpFirst) — Hiragana-Only for Areas 1-3

All hardcoded dialogue renders as **full Japanese with vertical stacks on unknown words**.

- Known words: displayed as hiragana only (inline, no box) in Areas 1-3. Kanji display unlocks in Area 4.
- Unknown words: vertical stack card — hiragana on top, English definition below, blue border
- Grammar words (particles, copulas): shown with vertical stacks and English until the player has graduated them through exposure. No words are "free" — every word shown to the player is tracked.
- Prologue: uses `renderEnFirst` (English with Japanese highlights) to introduce the very first batch of grammar words (は, が, を, に, です, こんにちは, はい, いいえ). This is the only place `renderEnFirst` is used.

**Hiragana-only mode:** The renderer takes a `useKanji: boolean` flag. For Areas 1-3 this is `false` — all words display as their hiragana readings, never kanji. わたし not 私, いっしょ not 一緒, いたい not 痛い. Area 4 unlocks kanji, so words the player already knows now appear in kanji form — itself a learning moment that reinforces recognition.

Every word in every hardcoded line must be carefully chosen. There is no English safety net. A word the player doesn't know appears as a stack card; a word not in the dictionary at all is an unreadable glyph.

### 2.2 Plain Japanese Data Format

Dialogue is stored as plain Japanese strings. No `{en|ja|reading}` tags.

```json
"こんにちは！一緒に遊ぶ？"
```

A tokenizer breaks the text into morphemes, looks up each token's dictionary form in the word dictionary, and the renderer builds the display. This format is identical whether the content is hand-authored or AI-generated — the system doesn't care about the source.

### 2.3 Word-Gated Filtering

Every dialogue line declares nothing about itself — the system is smart enough to figure it out. At load time, each line is tokenized and its content words are extracted. At runtime, the system compares those words against the player's known set (queried from FSRS) and checks the i+1 rule: each sentence may contain at most 1 unknown word.

Lines that the player can read are eligible. Lines they can't read are filtered out. As the player learns more words, more lines become eligible. Progression is smooth — no arbitrary thresholds.

**Grammar constraint (authoring rule):** All hardcoded dialogue for Areas 1-3 must use **N5 grammar only**, with light N4 where unavoidable. Specifically: です/ます polite forms, simple て-form, basic い/な adjective conjugation, の connector, question particles (か, ね, よ). No casual contractions (じゃん, っけ), no conditionals (ば, たら), no passive/causative. This is enforced at content authoring time, not at runtime — grammar checking in the filter would be too complex and brittle. Simple is better. Do not overwhelm the player.

### 2.4 Tokenizer Interface

A single `tokenize(text)` function wraps the morphological analyzer. **Day-1 implementation uses `lindera-wasm-unidic-nodejs`** (Rust→WASM, UniDic dictionary, zero external dependencies, runs locally). JPDB's parse API rate-limits aggressively and is an external dependency — unsuitable for a critical startup path. JPDB parse remains available as a verification/lookup tool but is not in the hot path.

```js
// src/tokenizer.js
export async function tokenize(text) → [{ surface, baseForm, pos, reading }]
```

This tokenizer replaces JPDB parsing everywhere — hardcoded dialogue, AI-generated dialogue, bark filtering, i+1 enforcement. One tokenizer for the whole game.

**Pre-tokenization:** Hardcoded dialogue lines are pre-tokenized at authoring/build time and stored alongside the JSON. Server startup loads pre-tokenized data directly. Live tokenization is only needed for dynamically generated content (Area 4+ AI lines).

### 2.5 Definition Overrides

A word like 切る can mean "to cut" or "to turn off." The tokenizer identifies the word; it doesn't know which meaning is intended. For most words, the dictionary's primary definition (first in the definitions array) is correct. For ambiguous cases, the dialogue author (human or AI) provides an override:

```json
{
  "text": "電気を切る",
  "overrides": { "切る": "to turn off" }
}
```

No override = use primary dictionary definition. Override = use this meaning in the vertical stack display. The jpdb lookup popup (tap-to-expand) always shows all definitions regardless.

## 3. Architecture

### 3.1 Word Dictionary

A centralized dictionary loaded at server startup, held in memory:

```
Map<baseForm, {
  reading: string,
  definitions: [
    { en: string, primary: true },
    { en: string },
    ...
  ]
}>
```

**Scale: 30,000-50,000 entries.** The dictionary must cover every Japanese word the tokenizer can produce. Any word not in the dictionary becomes an unreadable glyph — the renderer can't display an English stack for a word it doesn't know. A 200-word dictionary breaks the moment any NPC, bark, or AI line uses an unlisted word.

**Day-1 source:** A comprehensive base dictionary sourced from JMdict or JPDB frequency data. Game content words (creatures, moves, items, NPCs, areas, glue words) are a tagged subset within this larger dictionary, not the dictionary itself.

**Multi-definition entries:** Each word stores an array of definitions. The first definition is primary (used by default in vertical stacks). The override system (section 2.5) selects a non-primary definition when dialogue context requires it.

**Source priority for conflicts:** Game data files (creatures.json, moves.json, etc.) override the base dictionary's definitions for their specific words. This ensures game-themed definitions appear first (e.g., 火 shows "fire" not "Tuesday").

**Loading at startup:**
1. Load base dictionary (30-50k entries from JMdict/JPDB export)
2. Overlay game data: `data/creatures.json`, `data/moves.json`, `data/items.json`, `data/npcs.json`, `data/npc-skills.json`, `data/areas.json`, `data/creature-speech.json`, `data/glue-words.json`
3. Game data entries replace the base dictionary entry for their word, ensuring game definitions take priority

### 3.2 Dialogue Data Files

```
data/dialogue/
  cid-scripts.json    — CID run-start scripts
  npc-lines.json      — NPC per-slot dialogue pools
  barks.json          — bark pool by trigger category
data/glue-words.json  — glue word curriculum
data/grammar-words.json — graduated grammar introduction schedule
```

### 3.3 CID Run-Start Scripts

CID speaks 2-4 lines at the start of each roguelike run. Scripts are grouped — multiple lines that form a coherent mini-pep-talk. The system picks the highest-tier eligible script. **Not skippable** — CID's greeting is core immersion, the player's companion welcoming them to adventure.

```json
[
  {
    "id": "cid-welcome-0",
    "lines": [
      "こんにちは！",
      "いっしょに いく？"
    ]
  },
  {
    "id": "cid-welcome-1",
    "lines": [
      "おはよう！きょうは とても たのしい ところを しってるよ！",
      "わたしと いっしょに いく？すごい ものを みせたい！"
    ]
  }
]
```

**Script eligibility:** A script is eligible if every line passes the per-sentence i+1 check against the player's known words (queried from FSRS).

**Selection priority:**
1. Pick eligible script with the most teaching words (pushes player forward)
2. Deprioritize scripts the player has already seen (tracked in player state)
3. If all eligible scripts have been seen, repeat the one seen longest ago

**Tone:** CID is your buddy welcoming you to adventure. Teaching happens naturally — not a flashcard drill.

**Content scope:** ~15-20 scripts for Area 1, covering 0 words through Priority 1 complete. Later areas add more scripts to the same pool. With ~10-15 runs through Areas 1-3, 15-20 scripts ensures the player rarely sees the same greeting twice.

### 3.4 NPC Dialogue Lines

Each NPC has three dialogue slots, each with a pool of lines:

- `shopGreeting` — shown when the player enters the NPC's shop
- `fightStart` — shown when NPC combat begins
- `defeatLine` — shown when the player wins

```json
{
  "kodomo": {
    "shopGreeting": [
      "こんにちは！あそぶ？",
      "こんにちは！わたしも あそぶのが すき！",
      "いっしょに あそぶ？たのしいよ！"
    ],
    "fightStart": [
      "がんばれ！",
      "まけないよ！"
    ],
    "defeatLine": [
      "つよい！",
      "すごい！"
    ]
  }
}
```

**Selection logic:** Same word-gated filtering as CID. Among eligible lines, prefer ones that teach the next curriculum glue word. Avoid repeating the line from last visit.

**Personality through word selection** (validated by research):
- Child (こども): あそぶ, たのしい, すごい — exclamatory, game-seeking
- Adult (おとな): はたらく, じゅんび, しっかり — measured, practical
- Girl (おんなのこ): hesitation (あ…), きれい, はな, ね — shy, gentle
- Boy (おとこのこ): おはよう, はやい, もっと — competitive, energetic

**Content scope:** ~5-8 lines per slot per NPC for Area 1 (~60-100 lines total). Later areas add their own NPC pools.

**Quiz system (Area 3):** The existing NPC dialogue system — 3 rounds, 3 options per round (positive/neutral/negative tone), bond tracking via `updateBond` in `src/game/services/npc-service.js` — serves as the comprehension quiz for Area 3. The player must demonstrate understanding by choosing contextually appropriate responses. Not TBD — already implemented.

### 3.5 Bark Pool

One large JSON object keyed by trigger category. Each category contains an array of plain Japanese strings.

```json
{
  "onHit": [
    "いたい！",
    "つよい！",
    "いやだ！"
  ],
  "onVictory": [
    "すごい！",
    "かった！",
    "やった！"
  ],
  "onAttack": [
    "いくぞ！",
    "がんばれ！",
    "まけない！"
  ]
}
```

**Barks are 1-3 words maximum.** A creature yelling in combat is an exclamation, not a speech. Even at Area 3 vocabulary levels, barks stay short. Multi-sentence barks clutter the combat UI and distract from the action.

**Replaces `creature-speech.json`.** The current 8x3 bark grid becomes seed data for the new pool. The pool grows over time — more barks become eligible as the player learns more words, but each bark remains short.

**Runtime behavior:**
1. Filter by trigger category (onHit, onVictory, etc.)
2. Filter to eligible barks (per-sentence i+1 check against FSRS known words)
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

### 3.7 Grammar Word Introduction (No "Free" Words)

Words previously treated as "free" (particles, copulas, greetings, question words from the ALLOWED_WORDS list in `vocab-repair.js`) are **not free**. They are real Japanese words that must be tracked, shown with vertical stacks and English translations, and graduated through exposure like everything else. A total beginner does not magically know what は does or what です means.

Grammar words are introduced gradually through a defined schedule:

**Prologue (~10-12 words, taught via `renderEnFirst`):**
- Core particles: は, が, を, に
- Copula: です
- Greeting: こんにちは
- Yes/no: はい, いいえ
- Basic: うん, ね, よ, か

**Area 1 early runs (~15-20 more words):**
- More particles: で, へ, と, も, の
- Question words: なに/何, どこ
- Polite forms: ます
- Expressions: ありがとう, ください, おはよう, すみません

**Area 1 mid-late runs (remaining grammar as needed):**
- Compound grammar: から, まで, けど, でも, だけ
- Auxiliaries: ない, ある, いる, する, なる
- Sentence endings: ですか, ますか, でしょう
- Patterns: こと, もの, よう

Each grammar word gets the same vertical stack treatment as content words until graduated. The old ALLOWED_WORDS list in `vocab-repair.js` remains for AI prompt constraints (telling the AI which grammar it can use), but it **no longer means "skip tracking on the client."** Every word shown to the player gets exposure counted and fed into FSRS.

`data/grammar-words.json` defines the introduction schedule with the same format as glue words, using `stage` instead of `priority` to indicate when they unlock:

```json
[
  { "word": "は", "reading": "は", "en": "topic marker", "stage": "prologue" },
  { "word": "が", "reading": "が", "en": "subject marker", "stage": "prologue" },
  { "word": "です", "reading": "です", "en": "is/am/are", "stage": "prologue" },
  { "word": "で", "reading": "で", "en": "at/by (location/means)", "stage": "area1-early" },
  { "word": "から", "reading": "から", "en": "from/because", "stage": "area1-mid" }
]
```

## 4. End-to-End Pipeline

### 4.1 Server Startup

```
Server boots
  ↓
loadWordDictionary()
  → loads base dictionary (30-50k entries from JMdict/JPDB export)
  → overlays game data: creatures.json, moves.json, items.json,
    npcs.json, npc-skills.json, areas.json, glue-words.json,
    grammar-words.json
  → game entries replace base entries for their words
  → held in memory as Map<baseForm, {reading, definitions[]}>
  ↓
loadDialoguePools()
  → reads data/dialogue/cid-scripts.json (with pre-tokenized data)
  → reads data/dialogue/npc-lines.json (with pre-tokenized data)
  → reads data/dialogue/barks.json (with pre-tokenized data)
  → loads pre-tokenized content words for each line
  → caches in memory: each line → { raw, tokens[], contentWords[] }
  ↓
Server ready
```

Pre-tokenized data avoids any external API calls at startup. Only Area 4+ AI-generated lines require live tokenization via lindera-wasm.

### 4.2 CID Run-Start

```
Player starts run
  ↓
Server queries FSRS for player's known words
  (all vocab cards with "known" status from internal-srs.js)
  ↓
filterEligibleScripts(cidScripts, knownWords)
  → for each script:
    for each line:
      for each sentence (split on 。！？):
        count words where baseForm NOT in knownWords
        sentence passes if unknowns ≤ 1
    script eligible if ALL lines pass
  ↓
rankScripts(eligible, knownWords, seenScripts)
  → prefer script with most teaching words
  → deprioritize scripts player has seen (tracked in player state)
  ↓
selectedScript = highest-ranked eligible
  ↓
Response: {
  cidLines: ["こんにちは！いっしょに あそぶ？", ...],
  overrides: {},
  useKanji: false  // Areas 1-3
}
  ↓
Frontend receives lines
  ↓
For each line:
  load pre-tokenized data → tokens with baseForm
  → look up each token in wordDictionary for reading/definitions
  → check overrides for context-specific definitions
  → renderJpSentence(tokens, knownWords, wordDict, overrides, useKanji)
    → known word: hiragana only (inline, no box) [kanji in Area 4+]
    → unknown word: vertical stack (hiragana + English)
    → grammar words: same as above — stack if unknown, inline if known
  ↓
  narrationBox.show(html, { speaker: "CID", html: true })
  → player taps to advance through lines
  ↓
  flushExposures()
  → unknown words shown get exposure +1 on server
  → FSRS card created at 5 exposures
```

### 4.3 NPC Shop Greeting

```
Player encounters NPC (e.g. こども)
  ↓
Server queries FSRS for known words
  ↓
filterEligibleLines(npcLines["kodomo"]["shopGreeting"], knownWords)
  → same per-sentence i+1 check
  ↓
selectLine(eligible, knownWords, curriculum, lastSeen)
  → prefer lines teaching the next curriculum glue word
  → avoid repeating the line from last visit
  ↓
Response: { greeting: "こんにちは！わたしも あそぶのが すき！", overrides: {} }
  ↓
Frontend: renderJpSentence → narrationBox → flushExposures
```

### 4.4 NPC Combat Lines

```
NPC combat begins
  ↓
Server selects fightStart line (same filtering as greeting)
  → Response: { fightStart: "がんばれ！" }
  → Frontend renders in narration box before combat starts
  ↓
...combat happens...
  ↓
Player wins
  ↓
Server selects defeatLine (same filtering)
  → Response: { defeatLine: "つよい！" }
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
renderJpSentence → show speech bubble above creature sprite
  → addExposure() for any unknown words
  → bubble auto-dismisses after ~2 seconds
```

Barks are always 1-3 words: いたい！, つよい！, まけない！

### 4.6 Tokenization Detail

Japanese has no spaces. Given `一緒に遊ぶ？楽しいよ！`, the tokenizer returns:

```js
[
  { surface: "一緒", baseForm: "一緒", pos: "名詞", reading: "いっしょ" },
  { surface: "に",   baseForm: "に",   pos: "助詞", reading: "に" },
  { surface: "遊ぶ", baseForm: "遊ぶ", pos: "動詞", reading: "あそぶ" },
  { surface: "？",   baseForm: "？",   pos: "記号", reading: "" },
  { surface: "楽しい", baseForm: "楽しい", pos: "形容詞", reading: "たのしい" },
  { surface: "よ",   baseForm: "よ",   pos: "助詞", reading: "よ" },
  { surface: "！",   baseForm: "！",   pos: "記号", reading: "" }
]
```

The renderer then:
1. Looks up baseForm in wordDictionary → gets reading and definitions
2. Queries FSRS for baseForm → known or unknown
3. If known: display reading as inline hiragana (Areas 1-3) or kanji surface form (Area 4+)
4. If unknown: vertical stack — hiragana reading on top, primary English definition below
5. Punctuation: rendered as-is

**No "free" category.** Every word — particles, copulas, greetings — goes through the same known/unknown check. The difference is that grammar words are introduced on a defined schedule (section 3.7) so they become available for dialogue filtering at the right time.

Conjugated forms resolve naturally: 遊んで → baseForm: 遊ぶ → finds "to play" in dictionary. The author writes natural Japanese; the tokenizer handles the rest.

## 5. The Player's Journey: Zero to Full AI

### Run 1 — First Contact (0 words known)

The player has just finished the prologue (which uses `renderEnFirst` — English with Japanese highlights). They know ~10-12 grammar words from the prologue: は, が, を, に, です, こんにちは, はい, いいえ, うん, ね, よ, か. They know zero content words. CID hasn't spoken in Japanese yet.

**CID run-start:** The simplest eligible script fires. CID speaks in very basic Japanese:

> こんにちは！

One line. こんにちは was taught in the prologue — the player has graduated it. They see pure hiragana with no stacks. This is their first moment of "I can read Japanese."

**First combats:** The player fights wild creatures. Barks fire — simple ones like:

> いたい！

> いくぞ！

Each bark is a single word with a vertical stack (hiragana on top, English below). The player sees the word, hears the TTS, and starts building exposure. After 5 exposures of いたい across multiple fights, it enters their Speed Review deck.

**NPC shop visit:** The player encounters こども (Child). The simplest eligible shopGreeting fires:

> こんにちは！

The NPC speaks with their personality. The player is in a fully Japanese environment, reading real Japanese, even though the vocabulary is tiny.

**What the player is learning:** Creature names (ひ, みず, き), move verbs (たたく), bark words (いたい, つよい, いく). All rendered in hiragana. All through gameplay exposure, not dialogue.

### Runs 2-5 — Building the Base (~20-50 words known)

The player has fought many creatures, heard barks dozens of times, and bought items from shops. They've done several Speed Reviews, graduating words from "seen" to "known." Grammar words from the prologue are solid. New grammar words (で, と, も, の, ます, ありがとう) are being introduced through dialogue stacks.

**CID run-start:** A richer script becomes eligible as bark words graduate:

> こんにちは！たのしいよ！
> ここは ひろばです。いく？

Two lines. たのしい and ここ are bark words the player has graduated. ひろば is the area word. いく might still be learning — it shows as a stack.

**Barks expand:** The player now qualifies for 2-word barks:

> すごい！かった！

> つよい！いたい！

These are reinforcement barks — all known words, no stacks. Occasionally a teaching bark appears:

> まけない！

まけない uses まける (to lose), which may be a new word shown as a vertical stack.

**NPC greetings personalize:** The Child now says:

> こんにちは！あそぶ？

あそぶ is their NPC skill word (high exposure from shop visits). The player reads a full sentence in Japanese without help.

### Runs 5-8 — Glue Words Arrive (~50-80 words known)

The player has completed most of Area 1's content. Creature names, move verbs, item names, bark words — all graduating through Speed Review. The vocabulary is heavily nouns and action verbs.

**CID run-start:** CID starts using Priority 1 glue words:

> こんにちは！わたしと いっしょに いく？

わたし (I) and いっしょ (together) appear as vertical stacks — these are the teaching words. After seeing わたし from CID, from NPCs, and across visits, it hits 5 exposures and enters Speed Review.

**NPC greetings teach glue:** The Child says:

> こんにちは！わたしも あそぶのが すき！

わたし is the i+1 teaching word. The player sees the stack: わたし on top, "I/me" below.

**The Adult says:**

> ここは ひろばです。じゅんびは いいですか。

No teaching word needed — the Adult's personality naturally produces sentences with all-known words.

**The Girl says:**

> あ…こんにちは。ここの はな、きれいですね。

きれい is already known from barks. The Girl's personality comes through in word selection and hesitation, not vocabulary complexity.

### Runs 8-10 — Functional Vocabulary (~80-100 words known)

The player has graduated Priority 1 glue words through Speed Review: わたし, いっしょ, とても, いま, しる, おもう, これ, それ, まだ, いう. They can express themselves.

**CID run-start:** Richer scripts unlock:

> おはよう！きょうは とても たのしい ところに いく！
> わたしは ここが すき。いっしょに いくと たのしいと おもう！

きょう (today) is a Priority 2 word appearing as a stack. Everything else is known. The player reads two full sentences of natural Japanese with only one unknown word. CID sounds like a real friend.

**NPC fight lines:** The Child challenges you:

> まけないよ！

Short, confident, fully known. The player reads it instantly.

**NPC defeat lines:** After losing:

> つよい！

Defeat is a brief moment, not a lesson.

### Runs 10-15 — Areas 2-3 (~100-160 words known)

Area 2 introduces new creatures, items, moves, and NPCs. Priority 2 glue words (この, あの, くる, ともだち, うれしい, きょう, すこし, でる, はいる, じょうず) are being taught through NPC dialogue. Area 3 adds Priority 3-5.

**Same system, no code changes.** Area 2-3 NPCs have their own line pools in `npc-lines.json`. CID scripts reference new vocabulary. Barks in the pool that require new words become eligible.

**NPC quiz (Area 3):** The existing NPC dialogue system — 3 rounds of questions with 3 response options (positive/neutral/negative), bond tracking via `updateBond` in `src/game/services/npc-service.js` — becomes the comprehension check. The player demonstrates understanding by choosing contextually appropriate responses in Japanese. Friendship progression is the reward.

**Barks stay short at every level:**

> まけない！

> すごい！

> がんばれ！

All hiragana, all 1-3 words, even as the player's vocabulary grows past 100 words.

### Area 4+ — Full Generative Dialogue (~160+ words known)

The AI dialogue system (narration engine) takes over completely. **Kanji display unlocks.** Words the player already knows now appear in their kanji forms — 私, 一緒, 痛い — which is itself a learning moment.

**What changes:** The dialogue source switches from JSON pools to AI generation. Everything else stays the same — same tokenizer, same `renderJpSentence`, same word-gated i+1 enforcement, same FSRS tracking. The rendering pipeline is identical; the player doesn't notice the transition.

**What the AI produces (validated by research at 130 words):**

> こんにちは！元気？名前は何？一緒に遊ぶ？

> この場所、知ってる？私が前に来た！きれいな花があるよ！

> 明日も来る？一緒に遊べたら嬉しい！

Full 3-round NPC dialogues with personality, narrative arcs, emotional expression, and zero unknown words in most fields. The AI system has been tested extensively and produces high-quality output at this vocabulary level. The i+1 budget goes toward genuinely interesting new vocabulary, not survival glue.

The Japanese just keeps getting richer.

## 6. Area Progression Summary

| Area | Dialogue Source | Script | Teaching Focus | New System |
|------|----------------|--------|----------------|------------|
| **Prologue** | Tutorial screens | renderEnFirst | Core grammar (は, が, です, こんにちは...) | Prologue teaching flow |
| **1** | Hardcoded JSON pools | Hiragana only | Priority 1 glue (わたし, いっしょ, とても...) + grammar words | Word-gated filtering, bark pool, CID scripts |
| **2** | Hardcoded JSON pools | Hiragana only | Priority 2 glue (この, ともだち, うれしい...) | None — just new JSON content |
| **3** | Hardcoded JSON pools | Hiragana only | Priority 3-5 glue + NPC quiz (existing 3-round dialogue + bond) | None — existing quiz system |
| **4+** | AI-generated (narration engine) | Kanji unlocked | Full vocabulary | None — existing system takes over |

Areas 2-3 require zero new systems — content additions only (JSON files). Area 4 is the existing generative pipeline, gated behind the vocabulary threshold. ~10-15 runs total to reach Area 4.

## 7. What Changes in Existing Code

### New Code
- `src/tokenizer.js` — `tokenize()` interface wrapping lindera-wasm-unidic-nodejs (local, no external API)
- `src/game/word-dictionary.js` — loads base dictionary (30-50k) + game data overlays
- `src/game/dialogue-filter.js` — word-gated filtering, line selection, script ranking
- `renderJpSentence()` in `bootstrap-client.js` — sentence-level renderer using tokenizer + dictionary, with `useKanji` flag
- `data/dialogue/*.json` — dialogue pool data files (with pre-tokenized content)
- `data/glue-words.json` — curriculum data
- `data/grammar-words.json` — grammar word introduction schedule
- Base dictionary data file (JMdict/JPDB export, 30-50k entries)

### Modified Code
- `speech-bubble.js` — uses `renderJpSentence` instead of `renderJpFirst(jp, reading, en)`
- NPC encounter endpoint — returns word-gated lines instead of hardcoded "こんにちわ!"
- Game loop — adds CID run-start hook
- `narration-box.js` — renders dialogue HTML from `renderJpSentence`
- `vocab-repair.js` — ALLOWED_WORDS remains for AI prompt constraints but no longer exempts words from client-side tracking. Every word shown to the player gets exposure counted.
- `internal-srs.js` / known-words routes — FSRS becomes the **single source of truth** for word knowledge. The parallel `word-knowledge-{userId}.json` `known` map is deprecated. A word is "known" when its FSRS card has been reviewed successfully via speed review.

### New Dependencies
- `lindera-wasm-unidic-nodejs` — local morphological analyzer (Rust→WASM)

### Unchanged
- Speed Review system
- Exposure → SRS pipeline (5 exposures → FSRS card creation → review → known)
- jpdb lookup popup
- TTS integration (VOICEVOX)
- AI dialogue generation for Area 4+ (narration engine, uses `tokenize()` for validation)
- NPC dialogue state machine (3 rounds, 3 options, bond tracking)

## 8. Content Authoring Scope (This Implementation)

Only Area 1 content is authored now. The system is built so adding Area 2-3 content is a JSON-only task.

| Content | Count | Description |
|---------|-------|-------------|
| CID scripts | ~15-20 | Progression-gated run-start pep talks |
| NPC shopGreeting lines | ~5-8 per NPC (x4 NPCs) | Word-gated greeting pools |
| NPC fightStart lines | ~3-5 per NPC (x4 NPCs) | Pre-combat lines |
| NPC defeatLine lines | ~3-5 per NPC (x4 NPCs) | Post-victory lines |
| Barks | ~50-100 | 1-3 words each, expanding the current 24 to a proper pool |
| Glue words | 50 | Priority 1-5 curriculum (data file, not dialogue) |
| Grammar words | ~50-60 | Graduated introduction schedule for particles, copulas, etc. |

Total: ~200-250 lines of Japanese dialogue + 50 curriculum entries + ~50-60 grammar entries.

**Authoring constraints:**
- N5 grammar only (light N4 where unavoidable)
- All dialogue in hiragana-aware natural Japanese (authors may write in kanji — the dictionary provides readings)
- Barks: 1-3 words maximum, no exceptions
- Each line must be tokenizable by lindera-wasm and all words must exist in the dictionary

## 9. Conjugation Handling

The tokenizer resolves conjugated forms to dictionary form: 遊んで → 遊ぶ, 楽しかった → 楽しい, 負けない → 負ける. This means:

- Dialogue authors write natural Japanese with any conjugation
- The word dictionary only stores dictionary forms
- The filter checks baseForm against knownWords (from FSRS)
- The renderer looks up baseForm in the dictionary for reading/English
- The display shows the actual surface form's reading in hiragana (Areas 1-3) or kanji (Area 4+)

**Hiragana-only advantage for conjugation:** In Areas 1-3, conjugated forms display in hiragana. The player sees あそんで (surface reading) and the stack shows あそぶ = "to play." This is actually clearer in hiragana than in kanji because the stem is visually similar (あそ-). The player naturally absorbs conjugation patterns through repeated exposure to variant forms of the same base word.

**Known risk:** Some conjugated surface forms may still confuse early learners (they learned あそぶ but see あそんで). The vertical stack shows the English meaning, and the jpdb popup shows the full word entry.

## 10. Open Questions

1. **Sentence boundary detection:** Japanese doesn't always use clear sentence-ending punctuation. How do we split multi-sentence lines for the per-sentence i+1 check? Proposed: split on 。！？ and treat each segment independently.

2. **Bark pool size:** Starting with ~50-100 barks (1-3 words each). Is this enough variety? Can be expanded over time without system changes.

3. **CID seen-tracking storage:** Where does "which CID scripts has this player seen" live? Proposed: in the existing NPC memory system (player state).

4. **Grammar word introduction schedule:** The proposed graduated introduction (prologue → area 1 early → area 1 mid) needs playtesting. Exact pacing of particle/copula introduction should be tuned based on how quickly players absorb grammar through stacks vs. explicit teaching.

5. **Dictionary source:** JMdict (open source, comprehensive) vs JPDB frequency export vs custom curation for the 30-50k base dictionary. Needs evaluation for definition quality, multi-reading handling, and licensing.

6. **FSRS migration:** Moving from the dual system (word-knowledge `known` map + FSRS) to FSRS-only requires a migration path for existing players. Existing `known` entries should seed FSRS cards with appropriate initial state.
