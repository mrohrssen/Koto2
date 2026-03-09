# Bootstrap Language System: Teaching the First 100 Words

**Status:** Design draft
**Depends on:** Curated word curriculum, prologue/guided run content authoring
**Related:** [Initial Language Learning.md](Initial%20Language%20Learning.md) (research)

---

## Problem

Koto's i+1 system assumes the player already has a base vocabulary. For someone who knows zero Japanese, there is no "i" — only "+1". The JPDB integration, AI narration, and vocab repair all build on words the player already knows. Absolute beginners have nothing to scaffold from.

## Solution

A self-contained bootstrap phase that teaches absolute beginners their first ~100 Japanese words through hand-authored narration with progressive word replacement (the "Clockwork Orange" model). After bootstrap, players transition through a mixed-language AI narration phase, then into pure Japanese narration with i+1.

---

## Three-Phase Narration Model

### Phase 1 — Bootstrap (0–100 words)

- Hand-authored English narration with tagged Japanese word replacements
- Short prologue (~20 words) + 3 guided runs (~80 words)
- Kanji introduced from day one with furigana scaffold
- Progressive annotation scaffolding per word (see Scaffolding Stages below)
- Words curated from WaniKani levels + JPDB frequency + game relevance
- Simple internal word tracking (exposure counts per word per player)
- Combat uses move-based vocab reinforcement (already built)

### Phase 2 — Transition (100–~250 words)

- AI narration takes over, generates English text with strategic Japanese insertions
- AI knows the player's known words and uses them in narration
- Introduces 1 new word per narration block (i+1)
- Same progressive annotation rendering applies to new words
- English naturally decreases as vocab grows — more words are known, fewer English words remain in any given sentence

### Phase 3 — Full Japanese (~250+ words)

- Pure Japanese narration using i+1
- Only known words + 1 unknown per sentence
- Furigana on all kanji, no English, no romaji
- The existing vocab-repair system catches violations
- This is the steady state for the rest of the game
- ~250 words aligns with Tadoku Pre-Starter/Level 0 territory (200–350 word pools), designed for simple short-sentence storytelling
- With sentences of 5–10 words, i+1 means the player knows 4–9 words and is learning 1 — well within the 95–98% comprehension ceiling from Nation's research

**Key insight:** Phase 2 is temporary and self-eliminating. As the player learns more words, there are fewer English words left in any given sentence. Around ~250 words, the AI can construct full short Japanese sentences from the player's vocabulary. Phase 2 dissolves into Phase 3 naturally.

---

## Scaffolding Stages

Every word — whether introduced in bootstrap or later via AI — goes through the same lifecycle. Kanji is shown from day one. Furigana is the last scaffold to drop, matching how native Japanese materials work (children's books use furigana everywhere, adult texts drop it for common kanji).

| Stage | Exposures | Display | Annotations |
|-------|-----------|---------|-------------|
| 1 | 1–3 | 風 (kanji, or hiragana if no kanji) | furigana かぜ above + romaji kaze + English "wind" below |
| 2 | 4–9 | 風 | furigana かぜ above + English "wind" below (romaji gone) |
| 3 | 10+ | 風 | furigana かぜ above only (English gone) |
| 4 | Future/FSRS | 風 | no annotations (furigana gone) |

**Research backing:**
- Aggressive romaji removal (by exposure 4) matches strong consensus that romaji creates a crutch that slows kana acquisition
- Multimodal reinforcement (narration text + combat moves + TTS audio) supports learning in as few as 2–3 exposures
- Stage 4 is a future target for when FSRS-based tracking can determine true mastery; fixed exposure counts are an MVP approximation
- The 2–5% unknown word density ceiling from Nation's research is maintained: in short game sentences (5–10 words), at most 1 word is unknown (i+1)

**For hiragana-only words** (particles, words commonly written without kanji): kanji field = hiragana field, renderer skips furigana since it would duplicate the main text.

---

## Tagged Authoring Format

Bootstrap narration uses a tagged format for Japanese word replacement:

```
{english|kanji|hiragana|romaji}
```

Examples:
```
A cold {wind|風|かぜ|kaze} blew through the {forest|森|もり|mori}.
You {go|いく|いく|iku} toward the {mountain|山|やま|yama}.
The {person|人|ひと|hito} offered you a glass of {water|水|みず|mizu}.
```

**Rules:**
- Only curriculum words get tagged — everything else stays as plain English
- Each narration block introduces at most 3–5 new tagged words
- Previously introduced words reappear tagged in later narrations to build exposures toward 10+
- When kanji = hiragana (e.g., いく), the renderer skips furigana display
- This format is bootstrap-only — Phase 2+ uses AI-generated narration, not tagged authoring

---

## Word Curriculum (~100 words)

The bootstrap word list is curated for three qualities simultaneously:

1. **High frequency** — appear often in natural Japanese (JPDB/WaniKani frequency data)
2. **Game relevant** — useful in Koto's sci-fi fantasy context (creatures, exploration, combat)
3. **Narratively useful** — can appear naturally in prologue/run narration

### Rough category breakdown

| Category | ~Count | Examples |
|---|---|---|
| Core verbs | 20 | 行く (go), 見る (see), 食べる (eat), 使う (use), 聞く (hear) |
| Common nouns | 25 | 水 (water), 火 (fire), 森 (forest), 町 (town), 人 (person) |
| Creatures/nature | 15 | 空 (sky), 星 (star), 風 (wind), 月 (moon), 光 (light) |
| Adjectives | 15 | 強い (strong), 大きい (big), 小さい (small), 新しい (new) |
| Game actions | 10 | 戦う (fight), 守る (protect), 逃げる (escape), 探す (search) |
| Social/greetings | 10 | 友達 (friend), 名前 (name), はい (yes), ありがとう (thanks) |
| Particles/grammar | 5 | の, は, を, に, と |

**Particles are critical** — without them, the player can't parse even simple Japanese phrases when Phase 3 kicks in. They're also among the highest-frequency items in Japanese.

The exact list will be built by cross-referencing WaniKani Level 1–5 vocabulary with JPDB frequency rankings, then filtering for words that fit naturally into Koto's world.

---

## Bootstrap Content Structure

### Prologue (~15 min, introduces ~20 words)

- Short scripted sequence: the player wakes up, meets their first creature, learns about the world
- Narration is hand-written English with tagged Japanese words
- Each scene introduces 3–5 new tagged words, reusing words from prior scenes
- By the end, the player has their starter creature and enters the hub

### Guided Runs 1–3 (~80 more words across 3 runs)

- Same roguelike structure as the main game (rooms, encounters, shops)
- Narration is pre-written instead of AI-generated
- Room narrations are curated to introduce curriculum words at the right pace
- Words from the prologue keep appearing (hitting 10+ exposures)
- Each run introduces ~25–30 new words while reinforcing old ones
- Run narrations organized in a pool — the system picks narrations that match the player's current word exposure needs

### Transition to AI narration (Run 4+)

- Player has ~100 words at various mastery stages
- AI narration system activates using the player's known word list for i+1
- Tagged authoring format is no longer used — AI generates mixed English/Japanese directly
- Progressive annotation rendering continues for newly introduced words

---

## Word Tracker (MVP)

Simple per-player, per-word tracking stored server-side:

```json
{
  "userId": "...",
  "words": {
    "水": { "exposures": 7, "stage": 2, "firstSeen": "...", "lastSeen": "..." },
    "森": { "exposures": 3, "stage": 1, "firstSeen": "...", "lastSeen": "..." }
  },
  "totalWordsLearned": 42,
  "phase": "bootstrap"
}
```

- `phase`: `"bootstrap"` | `"transition"` | `"full-japanese"`
- Exposure increments each time the word appears in rendered narration
- Combat move usage counts as 2x exposure (active recall > passive reading)
- TTS playback of a word counts as 1 additional exposure
- Stage transitions are automatic based on exposure count
- Phase transitions: bootstrap → transition at 100 words learned to Stage 2+, transition → full-japanese at ~250 words

**Future:** Replace fixed exposure counts with custom FSRS (via [open-spaced-repetition](https://github.com/open-spaced-repetition)). Also replaces JPDB dependency entirely for vocab tracking.

---

## How This Relates to Existing Systems

| Existing system | Bootstrap phase impact |
|---|---|
| **DM narration (dm.js)** | Not used during bootstrap (Phase 1). Adapts for Phase 2 (mixed English/Japanese). Returns to current behavior for Phase 3. |
| **Vocab repair** | Not needed during bootstrap (content is hand-authored). Active during Phase 2–3. |
| **JPDB integration** | Not required for bootstrap. Players can optionally connect JPDB later. Word tracker operates independently. |
| **Combat moves** | Already works — move-based vocab reinforcement continues. Combat exposures count 2x toward word mastery. |
| **TTS (VOICEVOX)** | Used during all phases. TTS exposure counts toward word mastery. |

---

## Open Questions

1. **Exact word list** — Needs WaniKani + JPDB cross-reference to finalize the ~100 words
2. **Prologue narrative** — Story content needs to be written; should be engaging enough to hook players while introducing curriculum words naturally
3. **Phase 2 AI prompting** — How exactly does the AI narration system generate mixed English/Japanese? What does the prompt look like?
4. **Furigana rendering** — HTML ruby annotations on mobile (the primary platform); need to verify rendering quality on small screens
5. **Player agency** — Can players skip bootstrap if they already know Japanese? JPDB account connection could auto-detect vocabulary level
6. **Stage 4 timing** — When does furigana drop? This is the FSRS question — parking it for later
