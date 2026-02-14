# Creature Forge Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Claude Code skill that turns English words into game creatures with Japanese vocabulary, JPDB frequency data, and visual descriptions.

**Architecture:** Single SKILL.md file containing all instructions. No helper scripts — JPDB lookups happen via `curl` in Bash. Approved creatures append to a staging JSON file.

**Tech Stack:** Claude Code skill (YAML frontmatter + Markdown), JPDB REST API, JSON staging file

---

### Task 1: Create the skill directory and SKILL.md

**Files:**
- Create: `~/.claude/skills/creature-forge/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p ~/.claude/skills/creature-forge
```

**Step 2: Write the SKILL.md file**

Write the file at `~/.claude/skills/creature-forge/SKILL.md` with the full content specified below.

#### SKILL.MD CONTENT

The skill file has these major sections, each documented in detail below:

**A. Frontmatter**

```yaml
---
name: creature-forge
description: Design a new game creature from an English word. Generates Japanese vocab, attack skills, ultimate ability, archetype, element, and visual description with JPDB frequency data. Triggers on "creature forge", "new creature", "design creature", "creature from word".
---
```

**B. Header & Overview**

Explain the skill's purpose: turn any word into a cute Pokemon-like creature for the JRPG. Three input modes (direct word, discovery, thematic). Emphasize vocabulary frequency philosophy — prefer common (low rank) words for skills, base word can be any frequency.

**C. Input Mode Detection**

Instructions for Claude to detect which mode based on args:
- `<word>` → Direct mode
- No args → Discovery mode
- `[Theme]` (brackets) → Thematic mode

**D. Discovery Mode**

Instructions to:
1. Read `data/creatures.json` and `data/new-creatures-staging.json`
2. Extract all `baseWord` values to build exclusion set
3. Identify vocabulary gaps (common everyday nouns — animals, tools, food, body parts, school items, nature, household objects)
4. Suggest 5 candidates as a table
5. Batch JPDB lookup for all 5 (see JPDB section below)
6. Present table: English | Japanese | Reading | JPDB Rank
7. User picks one → proceed to 7 sections

**E. Thematic Mode**

Instructions to:
1. Read exclusion set (same as discovery)
2. Brainstorm 5 objects/animals fitting the theme in brackets
3. Same JPDB batch lookup and table presentation
4. User picks one → proceed to 7 sections

**F. JPDB API Integration**

This section must contain the exact curl commands Claude will use.

Read API key:
```bash
cat data/.creature-forge-jpdb-key
```

Step 1 — Parse words to get vid/sid (batch all words at once):
```bash
curl -s -X POST "https://jpdb.io/api/v1/parse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <KEY>" \
  -d '{"text": "word1 word2 word3", "token_fields": ["vocabulary_index"], "vocabulary_fields": ["spelling", "reading", "vid", "sid"]}'
```

Step 2 — Lookup frequency ranks:
```bash
curl -s -X POST "https://jpdb.io/api/v1/lookup-vocabulary" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <KEY>" \
  -d '{"list": [[vid1, sid1], [vid2, sid2]], "fields": ["spelling", "frequency_rank"]}'
```

Rules:
- ALWAYS batch all words into one parse call + one lookup call
- If any word returns rank 30000+, discard it, pick alternatives, wait 1 second (`sleep 1`), then re-batch
- If a する compound doesn't resolve, strip する and retry the root
- 500ms minimum between API calls

**G. The 7 Numbered Sections**

Instructions for generating each section:

**Section 1 — Name:** Use romaji of the Japanese word. Capitalize first letter. If a compound form sounds better as a creature name, present both options.

**Section 2 — Japanese Vocab:** Show dictionary form, reading (hiragana), English meaning, JPDB rank. If multiple valid writings exist (kanji vs kana, different kanji), present all with ranks and recommend one.

**Section 3 — Attack Skills:** Generate 3 verb candidates. Each must:
- Be a real Japanese verb in dictionary form
- Have JPDB rank < 5000 (prefer < 3000)
- Make thematic sense for the creature
- Show: Japanese | Reading | English | JPDB Rank
- For compound verbs, show component frequencies too

**Section 4 — Ultimate Ability:** Generate 3 candidates, same format. Must feel more dramatic/powerful than attack skills. Prefer different vocabulary from section 3 (minimize overlap). Same frequency rules.

**Section 5 — Archetype:** Suggest Fighter, Tank/Healer, Mage, or Trickster with 1-sentence reasoning based on the creature's nature.

**Section 6 — Element:** Suggest Fire, Wood, Earth, Metal, or Water with 1-sentence reasoning.

**Section 7 — Description:** Generate 3 descriptions, each 5-8 sentences. Requirements:
- Chibi/Pokemon aesthetic — cute but with personality
- Vivid enough for a concept artist to draw
- Include: body shape, colors, textures, distinctive features, personality traits, any glowing/particle effects
- Reference the base word's object/animal in the design (scissors creature has blade-like features, etc.)
- Label each option A, B, C

**H. Summary Table**

After all 7 sections, present a table of EVERY Japanese word used across all candidates:

| Word | Reading | Meaning | JPDB Rank | Used In |
|------|---------|---------|-----------|---------|
| 切る | きる | cut | 89 | Attack 1 |

**I. Approval Prompt**

After presenting everything, show exactly:
> Type Y to approve or give me #'s of sections to redo OR tell me what's missing in plain english

**J. Re-roll Handling**

- Parse user input for section numbers (e.g., "redo 3 and 7", "redo 4 but more water-themed")
- Regenerate only the requested sections, keep everything else
- New JPDB batch call for any new words introduced (wait 1s between calls)
- Re-display the updated summary table
- Show approval prompt again

**K. Save to Staging JSON**

On user typing "Y" or "approve":

1. Read `data/new-creatures-staging.json` (or initialize `[]` if it doesn't exist)
2. Build creature object:

```json
{
  "id": "<lowercase-romaji>",
  "name": "<katakana-name>",
  "nameEn": "<Romaji-Name>",
  "baseWord": "<kanji-or-kana>",
  "baseReading": "<hiragana>",
  "baseMeaning": "<english>",
  "baseRank": <jpdb-rank>,
  "element": "<chosen-element>",
  "archetype": "<chosen-archetype>",
  "description": "<chosen-description>",
  "autoSkill": {
    "word": "<japanese>",
    "reading": "<hiragana>",
    "meaning": "<English>",
    "rank": <jpdb-rank>
  },
  "ultimate": {
    "word": "<japanese>",
    "reading": "<hiragana>",
    "meaning": "<English>",
    "rank": <jpdb-rank>
  },
  "createdAt": "<YYYY-MM-DD>"
}
```

3. Append to array (never overwrite existing entries)
4. Write back to `data/new-creatures-staging.json`
5. Confirm: "Saved [Name] to staging! [N] creatures now in `data/new-creatures-staging.json`."

**Step 3: Verify the skill is detected**

```bash
ls -la ~/.claude/skills/creature-forge/SKILL.md
```

Expected: File exists with appropriate size (should be several KB).

**Step 4: Commit**

Note: The skill file is in `~/.claude/skills/` which is outside the git repo. No git commit needed for the skill itself.

---

### Task 2: Verify API key file exists

**Files:**
- Verify: `data/.creature-forge-jpdb-key`

**Step 1: Confirm the key file exists and is gitignored**

```bash
cat data/.creature-forge-jpdb-key | head -c 5
git check-ignore data/.creature-forge-jpdb-key
```

Expected: First 5 chars of the key visible, and the file shows as gitignored.

**Step 2: Test the JPDB API with the key**

```bash
KEY=$(cat data/.creature-forge-jpdb-key)
curl -s -X POST "https://jpdb.io/api/v1/parse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"text": "花 猫 走る", "token_fields": ["vocabulary_index"], "vocabulary_fields": ["spelling", "reading", "vid", "sid"]}'
```

Expected: JSON response with vocabulary array containing 花, 猫, 走る with vid/sid values.

---

### Task 3: Initialize the staging JSON

**Files:**
- Create: `data/new-creatures-staging.json`

**Step 1: Create empty staging file**

Write `data/new-creatures-staging.json` with content `[]`.

**Step 2: Verify it's tracked by git**

```bash
git check-ignore data/new-creatures-staging.json
```

Expected: No output (file is NOT ignored — `!data/*.json` re-includes it).

**Step 3: Commit**

```bash
git add data/new-creatures-staging.json
git commit -m "chore: initialize creature staging file for creature-forge skill"
```

---

### Task 4: End-to-end test — invoke the skill

**Step 1: Start a new Claude Code conversation and run `/creature-forge scissors`**

Verify:
- Skill triggers correctly
- JPDB API calls succeed (real frequency data returned)
- All 7 sections are presented with frequency tables
- Re-roll works ("redo 3")
- Approval writes to `data/new-creatures-staging.json`
- JSON is valid and matches the schema

If testing isn't possible in-session, do a dry run: manually execute the JPDB curl commands from the skill to verify they work, and manually verify the JSON append logic.
