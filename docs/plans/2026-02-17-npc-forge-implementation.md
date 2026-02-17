# NPC Forge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Claude Code skill that generates batches of 5 area-matched NPCs with JPDB-verified names, rich personalities, and character cards for the AI dialogue system.

**Architecture:** Three markdown skill files — a main orchestrator (`SKILL.md`) and two subagent skills (`concept-naming.md`, `character-cards.md`). The orchestrator handles user interaction, area selection, JPDB lookup, and file I/O. Subagents handle creative generation (NPC concepts/names and character card content). Output writes to two staging JSON files matching the existing `npcs.json` and `character-cards/npcs.json` formats.

**Tech Stack:** Claude Code skills (markdown), JPDB API via `scripts/lib/jpdb-helpers.mjs`, JSON staging files.

---

### Task 1: Create the Concept & Naming Subagent Skill

**Files:**
- Create: `~/.claude/skills/npc-forge/skills/concept-naming.md`

**Step 1: Create directory structure**

```bash
mkdir -p ~/.claude/skills/npc-forge/skills
```

**Step 2: Write the concept-naming subagent skill**

Create `~/.claude/skills/npc-forge/skills/concept-naming.md` with the following content:

```markdown
# NPC Concept & Naming Generator (Subagent 1)

You are generating 5 NPC concepts with names and vocab for a Japanese vocabulary learning RPG.

## Input

Read the baton JSON file at the path provided to you. It contains:

\`\`\`json
{
  "area": {
    "id": "suizokukan",
    "name": "水族館",
    "nameEn": "Aquarium",
    "theme": "...",
    "description": "..."
  },
  "existingNpcIds": ["mizuha", "ryourika"],
  "existingNpcNames": ["Mizuha", "Ryourika"]
}
\`\`\`

## Your Task

Produce **5 NPC concepts**, each with:
1. A base word (JPDB-verified)
2. A modifier word (JPDB-verified)
3. 3 name candidates (portmanteau style)
4. A one-line personality summary

### Concept Guidelines

- NPCs should feel like they **belong** in this area — their occupation, hobby, or role connects naturally to the location.
- Base words can be **occupations, personality traits, or area-themed nouns** — whatever creates the most memorable character.
- Modifier words can be **personality adjectives, role nouns, or descriptors** — whatever complements the base word and creates a vivid title.
- Aim for **diversity**: vary ages, personalities, speech styles, and roles across the 5 NPCs. Don't make them all the same type.
- These are **humans**, not creatures. Names should sound like they could be Japanese given names while embedding the vocab word.

### Name Rules

1. **The ENTIRE base reading's romaji must be present as a contiguous substring.** みず = "mizu" must appear in full. "Mizuha" (mizu present) is valid. "Miha" (dropped "zu") is invalid. No rearranging, splitting, or partial inclusion.

2. **Never offer raw romaji as-is** — always stylize into a human-sounding name. Techniques: add suffix/prefix (-ha, -ka, -ne, -ki, -ro, -mi), blend with another syllable. The name should sound like it could be a Japanese given name.

3. **No name collisions** — check `existingNpcNames` in the baton and don't reuse any existing name.

### JPDB Lookup

Write a temp script to `/tmp/npc-concept-lookup.mjs` and run it:

\`\`\`javascript
#!/usr/bin/env node
import { resolveCommonForms } from '/Users/michia/Documents/jrpg/scripts/lib/jpdb-helpers.mjs';
import { readFile } from 'fs/promises';

const words = ['水', '優しい', '料理', '元気', '静か', '店', '古い', '守る', '深い', '笑う'];
const apiKey = (await readFile('/Users/michia/Documents/jrpg/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
\`\`\`

Replace the words array with your actual base word + modifier candidates (10 total: 5 base + 5 modifier). Run with `node /tmp/npc-concept-lookup.mjs`.

**Hard discard any word with rank 30000+.**

### Translation Accuracy

**NON-NEGOTIABLE:**
- Use primary dictionary definitions from JPDB
- NEVER change transitivity or embellish meanings
- Show raw JPDB `meanings` array for every word
- If the accurate translation feels weak, pick a different word — never bend the translation

## Output

Read the baton JSON, add your output fields, write it back. Append:

\`\`\`json
{
  "npcConcepts": [
    {
      "index": 1,
      "baseWord": "水",
      "baseReading": "みず",
      "baseMeaning": "water",
      "baseRank": 580,
      "rawBaseMeanings": [["water"]],
      "allBaseForms": "水(580)",
      "modifier": {
        "word": "優しい",
        "reading": "やさしい",
        "meaning": "Gentle",
        "rank": 1200,
        "rawMeanings": [["gentle", "kind", "tender"]],
        "allForms": "優しい(1,200)"
      },
      "nameCandidates": [
        {
          "label": "A",
          "name": "Mizuha",
          "nameKatakana": "ミズハ",
          "thesis": "みず (mizu) + '-ha' suffix — sounds like a gentle female given name"
        },
        { "label": "B", "name": "...", "nameKatakana": "...", "thesis": "..." },
        { "label": "C", "name": "...", "nameKatakana": "...", "thesis": "..." }
      ],
      "oneLiner": "Soft-spoken aquarium caretaker who talks to the fish like old friends"
    }
  ]
}
\`\`\`

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
```

**Step 3: Verify the file was created**

```bash
cat ~/.claude/skills/npc-forge/skills/concept-naming.md | head -5
```

Expected: First 5 lines of the skill file.

**Step 4: Commit**

```bash
# Skill files are in ~/.claude/skills/ (outside the repo), no git commit needed for this step
```

---

### Task 2: Create the Character Cards Subagent Skill

**Files:**
- Create: `~/.claude/skills/npc-forge/skills/character-cards.md`

**Step 1: Write the character-cards subagent skill**

Create `~/.claude/skills/npc-forge/skills/character-cards.md` with the following content:

```markdown
# NPC Character Card Generator (Subagent 2)

You are generating rich character card data for 5 NPCs in a Japanese vocabulary learning RPG. These character cards drive the AI dialogue generation system — they determine how each NPC speaks, what motivates them, and how they react to being possessed, glitching, and liberated.

## Input

Read the baton JSON file at the path provided to you. It contains the area info and locked NPC identities:

\`\`\`json
{
  "area": { "id": "suizokukan", "name": "水族館", "nameEn": "Aquarium", "theme": "...", "description": "..." },
  "npcs": [
    {
      "id": "mizuha",
      "name": "ミズハ",
      "nameEn": "Mizuha",
      "baseWord": "水",
      "baseMeaning": "water",
      "modifier": { "word": "優しい", "meaning": "Gentle" },
      "oneLiner": "Soft-spoken aquarium caretaker who talks to the fish like old friends"
    }
  ]
}
\`\`\`

## Your Task

For each of the 5 NPCs, generate a complete character card. Read the existing character cards at `/Users/michia/Documents/jrpg/data/character-cards/npcs.json` for style reference — match their tone, depth, and structure exactly.

### What You Generate Per NPC

**Game personality data:**
- `traits` — array of 2-4 personality trait words (e.g., ["gentle", "nurturing"])
- `speechStyle` — how they talk: formality level, dialect, verbal tics, characteristic expressions
- `quirk` — one signature behavior that makes them memorable and fun to interact with

**Character card data:**
- `description` — 1-2 sentences. Mention: who they are, what they were doing when the System took them, a visual detail (clothing or appearance), which area they belong to. Match the style of existing cards.
- `personality` — comma-separated string of traits (same content as traits array, plus speech descriptors)
- `quirk` — same as game data quirk, can be slightly more detailed
- `goals.possessed` — 1-2 sentences. How the System twisted THIS person's specific nature/skills/role into something harmful. Should feel like a dark mirror of who they really are.
- `goals.glitching` — 1-2 sentences. What breaks through during moments of clarity. Should reveal something personal — a memory, a habit, a concern for someone/something in the area.
- `goals.liberated` — 1-2 sentences. What they want after being freed. Should connect to their role in the area and open conversation hooks for future encounters.
- `knowledge.personal` — 2-3 sentences of backstory. Their history, connection to the area, what they know or care about. This is used by the AI to generate contextual dialogue.
- `knowledge.world` — array of lorebook keys. ALWAYS include "the_system" and "liberation". Add others as relevant:
  - "the_liberator" — if they would have strong opinions about the player
  - "corruption" — if they witnessed or understand the corruption process
  - "neo_tokyo" — if they have knowledge about the broader city
  - "ward_1" through "ward_4" — if they belong to or know about a specific ward
- `exampleDialogue` — exactly 3 lines of Japanese dialogue showing their voice:
  - Line 1: possessed greeting (challenging/hostile, but flavored by their personality)
  - Line 2: freed reaction (the moment they snap out of it)
  - Line 3: post-liberation conversation (their true personality shining through)

### Critical Rules

1. **Diversity across the batch.** Vary: age, gender presentation, formality level, emotional range, speech patterns. Don't make 5 versions of the same personality.

2. **Area connection is mandatory.** Every NPC must have a clear, specific reason for being in this area — they work there, live nearby, were visiting, study there, etc.

3. **Goals must be specific to the person.** Don't write generic "The System made them aggressive" — explain HOW their specific nature was twisted. A chef's perfectionism becomes obsessive quality control. A guard's protectiveness becomes territorial aggression.

4. **Example dialogue must match the personality.** A shy character uses polite forms and stammers. A kid uses casual speech and exclamation marks. A gruff old man uses blunt, short sentences.

5. **No English in dialogue lines.** All example dialogue is Japanese. It doesn't need to be i+1 validated (the runtime system handles that) — these are style reference examples.

## Output

Read the baton JSON, add your output fields, write it back. Append a `characterCards` array:

\`\`\`json
{
  "characterCards": [
    {
      "id": "mizuha",
      "gamePersonality": {
        "traits": ["gentle", "nurturing"],
        "speechStyle": "Soft-spoken, uses polite forms, speaks slowly as if calming a nervous fish",
        "quirk": "Talks to the fish like old friends, names every creature in the tanks"
      },
      "card": {
        "description": "A former marine biologist who stayed behind when the aquarium closed under System control. Wears a faded lab coat over a wetsuit. Encountered in the Aquarium area.",
        "personality": "gentle, nurturing, soft-spoken, uses polite forms, speaks slowly",
        "quirk": "Talks to the fish like old friends, names every creature in the tanks",
        "goals": {
          "possessed": "Protect the tanks at all costs. The System turned her caretaking instinct into territorial aggression — she attacks anyone who comes near her fish.",
          "glitching": "Pauses mid-attack to murmur a fish's name, briefly lucid as she remembers feeding schedules, before the System snaps her back.",
          "liberated": "Worried about the fish surviving without her care. Grateful to be freed but immediately asks the player to help check on the deeper tanks."
        },
        "knowledge": {
          "personal": "Was a marine biologist who studied at the aquarium for years. Knows the behavior of every species in the tanks. When the System arrived, she refused to leave her fish behind.",
          "world": ["the_system", "liberation"]
        },
        "exampleDialogue": [
          "この水槽に近づかないで。私の…私たちの魚なの。",
          "あ…私、何を…？魚たちは大丈夫？ごはんの時間は…？",
          "助けてくれてありがとう。でも…奥の水槽、見てくれませんか？"
        ]
      }
    }
  ]
}
\`\`\`

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
```

**Step 2: Verify the file was created**

```bash
cat ~/.claude/skills/npc-forge/skills/character-cards.md | head -5
```

Expected: First 5 lines of the skill file.

---

### Task 3: Create the Main NPC Forge Orchestrator Skill

**Files:**
- Create: `~/.claude/skills/npc-forge/SKILL.md`

**Step 1: Write the main orchestrator skill**

Create `~/.claude/skills/npc-forge/SKILL.md`. This is the largest file — it handles:
- Input mode detection (no-args vs direct)
- Phase 0: Area selection with NPC count table
- Phase 1: Dispatch concept-naming subagent, JPDB lookup, present candidates
- Phase 2: User picks names, dispatch character-cards subagent, present results
- Phase 3: Save to both staging files
- Re-roll handling
- Pre-save checklist

The full content follows. Key sections:

**Header & trigger:**
```markdown
---
name: npc-forge
description: Generate 5 area-matched NPCs with JPDB names, personalities, and character cards. Triggers on "npc forge", "new npcs", "forge npcs".
---
```

**Phase 0 — Area Selection:**
- Read `data/new-areas-staging.json` (error if missing — need areas first)
- Read `data/new-npcs-staging.json` (init `[]` if missing)
- Count NPCs per area, display table, user picks

**Phase 1 — Concept & Naming:**
- Build baton with area info + existing NPC ids/names
- Write baton to `/tmp/npc-forge-{areaId}-baton.json`
- Dispatch concept-naming subagent (sonnet)
- Read baton, present candidate table with raw meanings
- User picks name A/B/C for each NPC, can adjust concepts

**Phase 2 — Character Cards:**
- Build locked identities from user picks
- Write to `/tmp/npc-forge-{areaId}-locked.json`
- Dispatch character-cards subagent (opus)
- Read baton, present all 5 character cards for review
- User can reroll individual NPCs

**Phase 3 — Save:**
- Read both staging files
- Append game data to `data/new-npcs-staging.json`
- Append character cards to `data/character-cards/new-npcs-staging.json`
- Confirm with count

See design doc at `docs/plans/2026-02-17-npc-forge-design.md` for complete data shapes, naming rules, and checklist.

**Step 2: Verify the file was created and skill is discoverable**

```bash
cat ~/.claude/skills/npc-forge/SKILL.md | head -10
```

Expected: Skill header with name and description.

**Step 3: Commit design doc update (if any changes)**

```bash
cd /Users/michia/Documents/jrpg
git status
```

---

### Task 4: Smoke Test the Skill

**Step 1: Verify skill appears in Claude Code skill list**

The skill should auto-discover from `~/.claude/skills/npc-forge/SKILL.md`. Start a new Claude Code session or check if `/npc-forge` is recognized.

**Step 2: Run a test invocation**

Requires at least one area in `data/new-areas-staging.json`. If no areas exist yet, create a test area first using `/area-forge`, then test `/npc-forge`.

**Step 3: Verify output files**

After a successful run, check:
- `data/new-npcs-staging.json` has 5 new entries
- `data/character-cards/new-npcs-staging.json` has 5 new entries
- All JPDB ranks are real (from API)
- All names contain base reading as contiguous substring
- Character cards have all required fields (goals x3, knowledge, exampleDialogue x3)
