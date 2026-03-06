---
name: npc-forge
description: Generate 5 area-matched NPCs with JPDB names, personalities, and character cards for the AI dialogue system. Triggers on "npc forge", "new npcs", "forge npcs", "npc from area".
---

# NPC Forge — Orchestrator

Turn a game area into 5 personality-filled, JPDB-verified NPCs for Koto, a Japanese vocabulary learning RPG.

This skill is an **orchestrator**. The main agent handles area selection, user interaction, JPDB lookups, and saves. Subagents handle creative generation (concepts/naming and character cards).

## Quick Reference: The Flow

```
Phase 0: Area Selection    → list areas with NPC counts, user picks
Phase 1: Concept & Naming  → subagent brainstorms, JPDB lookup, name candidates
Phase 2: Character Cards    → user picks names, subagent generates personality + cards
Phase 3: Save              → write to both staging files
```

## Input Mode Detection

Parse skill arguments:

- **No-args mode:** `/npc-forge` — list areas with NPC counts, user picks one. Go to Phase 0.
- **Direct mode:** `/npc-forge suizokukan` — skip Phase 0, jump to Phase 1 for that area.

---

## Phase 0: Area Selection (no-args only)

1. **Read area data** from both `data/areas.json` (production) and `data/new-areas-staging.json` (staging). Combine into a single list. If both are empty/missing, tell the user: **"No areas found. Run `/area-forge` first to create areas."** and stop.

2. **Read existing NPCs** from two sources:
   - `data/npcs.json` — existing production NPCs (object keyed by id). Extract all ids and `nameEn` values.
   - `data/new-npcs-staging.json` — staging NPCs (array). Initialize `[]` if file is missing. Extract all `id` and `nameEn` values.

3. **Count NPCs per area.** For each area in the areas staging file, count how many NPCs (from both production and staging) have `"area": "<area-id>"`. Target is 10 NPCs per area.

4. **Display selection table:**

```
| # | Area           | Japanese  | NPCs  | Needs |
|---|----------------|-----------|-------|-------|
| 1 | Deep Forest    | 奥の森    | 0/10  | 10    |
| 2 | Peaceful Park  | 静かな公園 | 2/10  | 8     |
| 3 | Secret Library | 秘密の図書館 | 5/10 | 5    |
```

5. User picks an area by number or name. Proceed to Phase 1.

### Stage-Aware NPC Discovery

After area selection, discover occupation words for the area's stage:

```bash
node scripts/forge-discovery.mjs --type npc --stage ${AREA_STAGE} --limit 20
```

This returns person-nouns (occupations, social roles) from `occupations.json` and `social.json` filtered to the area's stage.

Pass these candidates to the concept-naming subagent via the baton as `discoveredOccupations`.

---

## Phase 1: Concept & Naming

### 1.1 Build Baton

Read the selected area object from `data/areas.json` or `data/new-areas-staging.json` (whichever contains it). Collect all existing NPC ids and names from both `data/npcs.json` and `data/new-npcs-staging.json`.

Build baton JSON:

```json
{
  "area": {
    "id": "suizokukan",
    "name": "水族館",
    "nameEn": "Aquarium",
    "theme": "Marine life, water, oceanic serenity",
    "description": "A vast public aquarium with floor-to-ceiling tanks..."
  },
  "existingNpcIds": ["yuki", "takashi", "haruka"],
  "existingNpcNames": ["Yuki", "Takashi", "Haruka"]
}
```

Write to `/tmp/npc-forge-{areaId}-baton.json`.

### 1.2 Dispatch Concept-Naming Subagent

```
Task tool (general-purpose, model: sonnet):
  description: "Generate NPC concepts for [areaNameEn]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.0.0/skills/npc-forge/subskills/concept-naming.md
    Then read the baton at /tmp/npc-forge-{areaId}-baton.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `npcConcepts` array was added with 5 entries.

### 1.3 JPDB Verification

The subagent performs JPDB lookups as part of its work. After reading the baton, verify that every concept has:
- `baseRank` — a real JPDB rank (not 0 or null)
- `rawBaseMeanings` — raw meanings array from JPDB
- `modifier.rank` — a real JPDB rank
- `modifier.rawMeanings` — raw meanings array from JPDB
- `nameCandidates` — array of 3 name options (A, B, C) — natural Japanese given names
- `baseWord` is a **person noun** (occupation, social role, or person type) — NOT a nature word or abstract concept

If any are missing, or if a base word is not a person noun, report the gap and re-dispatch the subagent.

### 1.4 Present Consolidated Candidate Table

For each of the 5 NPCs, present:

```
### NPC 1: [one-liner]

| Name Option | Katakana |
|-------------|----------|
| **A** Haruka | ハルカ |
| **B** Shiori | シオリ |
| **C** Natsumi | ナツミ |

| Field | Value |
|-------|-------|
| Base Word (occupation) | 研究者 (けんきゅうしゃ) |
| Base Rank | 2,400 |
| Base Meanings | [["researcher; investigator"]] |
| Modifier | 優しい (やさしい) |
| Modifier Rank | 600 |
| Modifier Meanings | [["tender; kind; gentle; graceful; affectionate; amiable"]] |
```

After all 5 NPCs, prompt:

> **Pick a name (A/B/C) for each NPC.** You can also:
> - Request concept rerolls: "redo NPC 3" or "redo all concepts"
> - Suggest a different occupation: "use 案内人 instead of 研究者 for NPC 1"

### 1.5 User Picks Names

User responds with picks like "A, B, A, C, B" or "1A 2B 3A 4C 5B".

Parse the picks. For each NPC, lock in the chosen name candidate.

---

## Phase 2: Character Cards

### 2.1 Build Locked Identity Baton

From the user's picks, build the locked NPC list:

```json
{
  "area": {
    "id": "suizokukan",
    "name": "水族館",
    "nameEn": "Aquarium",
    "theme": "Marine life, water, oceanic serenity",
    "description": "A vast public aquarium with floor-to-ceiling tanks..."
  },
  "npcs": [
    {
      "id": "haruka",
      "name": "ハルカ",
      "nameEn": "Haruka",
      "baseWord": "研究者",
      "baseMeaning": "researcher",
      "modifier": { "word": "優しい", "meaning": "Gentle" },
      "oneLiner": "Soft-spoken aquarium researcher who talks to the fish like old friends"
    },
    { /* NPC 2 */ },
    { /* NPC 3 */ },
    { /* NPC 4 */ },
    { /* NPC 5 */ }
  ]
}
```

The `id` for each NPC is the **lowercase romaji** of the chosen name (e.g., "Haruka" -> "haruka"). Verify no collision with existing NPC ids from both `data/npcs.json` and `data/new-npcs-staging.json`.

Write to `/tmp/npc-forge-{areaId}-locked.json`.

### 2.2 Dispatch Character-Cards Subagent

```
Task tool (general-purpose, model: opus):
  description: "Generate character cards for [areaNameEn] NPCs"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.0.0/skills/npc-forge/subskills/character-cards.md
    Then read the baton at /tmp/npc-forge-{areaId}-locked.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `characterCards` array was added with 5 entries.

### 2.3 Present Character Cards for Review

For each of the 5 NPCs, present a formatted summary:

```
### NPC 1: Haruka the Gentle Researcher (ハルカ / 研究者)

**Personality:** gentle, nurturing, soft-spoken, uses polite forms, speaks slowly
**Quirk:** Talks to the fish like old friends, names every creature in the tanks

**Goals:**
- Default: Worried about the fish — asks the player if they've seen anything strange in the deeper tanks.
- High Bond: Wants to share her marine biology knowledge and teach the player about ocean conservation.

**Bond Hints:**
- Bond 3: Shares the story of how she first fell in love with the ocean as a child.
- Bond 5: Offers to give the player a rare item she found while cleaning the deep tanks.
- Bond 10: Teaches the player a rare marine biology term and invites them to help name a new fish.

**Backstory:** Was a marine biologist who studied at the aquarium for years. Knows the behavior of every species in the tanks.

**World Knowledge:** the_system, liberation

**Example Dialogue:**
1. あ、こんにちは。水族館に来てくれたんですね。
2. この魚、名前はまだないんです。一緒に考えてくれませんか？
3. 助けてくれてありがとう。でも…奥の水槽、見てくれませんか？
```

After all 5:

> **Review the character cards.** You can:
> - Approve all: "looks good" / "save"
> - Reroll specific NPCs: "redo NPC 2 and NPC 4"
> - Reroll all cards: "redo characters"
> - Request changes: "make NPC 3 more gruff" / "NPC 1 should be younger"

---

## Phase 3: Save

### 3.1 Read Staging Files

- Read `data/new-npcs-staging.json` (initialize `[]` if missing).
- Read `data/character-cards/new-npcs-staging.json` (initialize `{}` if missing).

### 3.2 Build Game Data Objects

For each of the 5 NPCs, build a game data object from the locked baton + character card data:

```json
{
  "id": "haruka",
  "name": "ハルカ",
  "nameEn": "Haruka",
  "baseWord": "研究者",
  "baseReading": "けんきゅうしゃ",
  "baseMeaning": "researcher",
  "baseRank": 2400,
  "modifier": {
    "word": "優しい",
    "reading": "やさしい",
    "meaning": "Gentle",
    "rank": 600
  },
  "area": "suizokukan",
  "stage": 7,
  "personality": {
    "traits": ["gentle", "nurturing"],
    "speechStyle": "Soft-spoken, uses polite forms, speaks slowly",
    "quirk": "Talks to the fish like old friends"
  },
  "createdAt": "2026-02-17"
}
```

**Stage assignment:** NPCs inherit their stage from their area. Set `stage` to the area's stage number (1-10). This replaces the old tier system.

### 3.3 Build Character Card Objects

For each of the 5 NPCs, build a character card object:

```json
{
  "haruka": {
    "id": "haruka",
    "name": "ハルカ",
    "nameEn": "Haruka",
    "description": "A marine researcher (研究者) who works at the aquarium caring for the tanks. Wears a faded lab coat over a wetsuit. Stage 7 — encountered in the Aquarium area.",
    "personality": "gentle, nurturing, soft-spoken, uses polite forms, speaks slowly",
    "quirk": "Talks to the fish like old friends, names every creature in the tanks",
    "goals": {
      "default": "Worried about the fish — asks the player if they've seen anything strange in the deeper tanks.",
      "highBond": "Wants to share her marine biology knowledge and teach the player about ocean conservation."
    },
    "bondHints": {
      "3": "Shares the story of how she first fell in love with the ocean as a child.",
      "5": "Offers to give the player a rare item she found while cleaning the deep tanks.",
      "10": "Teaches the player a rare marine biology term and invites them to help name a new fish."
    },
    "knowledge": {
      "personal": "Was a marine biologist who studied at the aquarium for years. Knows the behavior of every species in the tanks.",
      "world": ["the_system", "liberation"]
    },
    "exampleDialogue": [
      "あ、こんにちは。水族館に来てくれたんですね。",
      "この魚、名前はまだないんです。一緒に考えてくれませんか？",
      "助けてくれてありがとう。でも…奥の水槽、見てくれませんか？"
    ]
  }
}
```

### 3.4 Write Staging Files

1. **Append game data:** Add all 5 NPC objects to the `data/new-npcs-staging.json` array.
2. **Merge character cards:** Merge all 5 character card objects into the `data/character-cards/new-npcs-staging.json` object (spread into existing keys).
3. **Write both files back.**

### 3.5 Confirm

> **Saved 5 NPCs to staging!**
> - [AreaNameEn] now has [N]/10 NPCs
> - [M] total NPCs in `data/new-npcs-staging.json`
> - [K] total character cards in `data/character-cards/new-npcs-staging.json`

---

## JPDB API Integration

Use the helper module at `scripts/lib/jpdb-helpers.mjs`. Write a temp script to `/tmp/` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['水', '優しい']; // use kanji/katakana, NOT short hiragana
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
```

Save to `/tmp/npc-jpdb-lookup.mjs` and run with `node /tmp/npc-jpdb-lookup.mjs`.

**Always show raw JPDB `meanings` array.** Never paraphrase or summarize meanings.

---

## Re-roll Handling

When the user requests changes after seeing results:

| User says | Action |
|-----------|--------|
| "redo names" / "redo concepts" | Re-dispatch concept-naming subagent (Phase 1) |
| "redo NPC 3 concept" | Re-dispatch concept-naming for just that NPC (pass feedback in baton) |
| "redo characters" / "redo cards" | Re-dispatch character-cards subagent (Phase 2) |
| "redo NPC 2 card" | Re-dispatch character-cards for just that NPC (pass feedback in baton) |
| "redo all" | Restart from Phase 1 |
| "make NPC 1 more [trait]" | Add feedback to baton, re-dispatch character-cards for that NPC |
| "use [word] for NPC 3" | Update baton with new word, re-run JPDB lookup, regenerate names for that NPC |

For partial rerolls, preserve the approved NPCs and only regenerate the requested ones. Update the baton with any user feedback before re-dispatching.

---

## Translation Accuracy (NON-NEGOTIABLE)

This is a language learning game. Every translation the player sees becomes something they memorize.

- **Use primary dictionary definitions** from JPDB. Show raw `meanings` arrays.
- **NEVER change transitivity.** 狂う = "go mad" (intransitive), NOT "drive mad."
- **No embellishment.** If "water" is the meaning, show "water" — not "aquatic essence."
- **If accurate translation feels weak**, pick a different word. Never bend the translation.
- **Always show raw JPDB `meanings` array** so the user can verify every translation against source data.

---

## Name Rules

1. **Use natural Japanese given names.** Pick names a real Japanese person might have: ユキ, タカシ, ハルカ, ミサキ, ケンタ, マユ, リン, ソラ, アキラ, サクラ, ヒロト, カエデ, ナオ, レイ, シンジ, アオイ, etc. Given name only, no surname.

2. **No name collisions** with existing NPCs (check both `data/npcs.json` and `data/new-npcs-staging.json`).

3. **Variety** — mix masculine, feminine, and gender-neutral names. Don't reuse the same name endings.

4. **Write in katakana** — all NPC names use katakana in this game.

---

## Checklist Before Saving

Run through this checklist before writing to staging files:

- [ ] All JPDB ranks from API calls (not guessed)
- [ ] Raw meanings arrays shown to user and verified
- [ ] English translations dictionary-accurate — no embellishment, no transitivity changes
- [ ] Every base word is a person noun (occupation, social role, or person type) — NO nature words or abstract concepts
- [ ] Names are natural Japanese given names written in katakana
- [ ] No duplicate ids with existing NPCs (checked both `data/npcs.json` and `data/new-npcs-staging.json`)
- [ ] All 5 NPCs assigned to the chosen area (same `area` field)
- [ ] Stage inherited from area
- [ ] Character card has default + highBond goals and bondHints for levels 3, 5, 10
- [ ] `knowledge.world` includes relevant lorebook keys (always includes `the_system` and `liberation`)
- [ ] 3 example dialogue lines per NPC (all Japanese, no English)
- [ ] Example dialogue matches personality (formality, speech patterns, verbal tics)
- [ ] `createdAt` set to today's date
- [ ] Game data written to `data/new-npcs-staging.json`
- [ ] Character cards written to `data/character-cards/new-npcs-staging.json`

---

## File Paths Reference

| File | Format | Purpose |
|------|--------|---------|
| `data/areas.json` | Array of area objects | Production areas (read-only) |
| `data/new-areas-staging.json` | Array of area objects | Staging areas (new, not yet promoted) |
| `data/npcs.json` | Object keyed by id | Existing production NPCs (read-only) |
| `data/new-npcs-staging.json` | Array of NPC objects | Staging file for new NPC game data |
| `data/character-cards/npcs.json` | Object keyed by id | Existing production character cards (read-only, reference for style) |
| `data/character-cards/new-npcs-staging.json` | Object keyed by id | Staging file for new character cards |
| `data/.creature-forge-jpdb-key` | Plain text | JPDB API key |
| `scripts/lib/jpdb-helpers.mjs` | ES module | JPDB lookup helper functions |
| `/tmp/npc-forge-{areaId}-baton.json` | JSON | Shared baton for concept-naming subagent |
| `/tmp/npc-forge-{areaId}-locked.json` | JSON | Locked identity baton for character-cards subagent |

All `data/` paths are relative to the project root: ``.
