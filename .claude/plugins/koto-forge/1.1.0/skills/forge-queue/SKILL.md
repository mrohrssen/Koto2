---
name: forge-queue
description: Process pending forge jobs from the dashboard queue. Spawns Opus subagents to generate creatures, moves, items, NPCs, NPC skills, and areas from theme pool words. Triggers on "forge queue", "forge-queue", "process forge jobs".
---

# Forge Queue Processor

Read `data/forge-queue.json`, process all pending jobs by spawning Opus subagents, and write results to `data/forge-results.json`. The user reviews and approves results via the Forge Workbench dashboard at `/forge.html`.

## Quick Reference

```
1. Read data/forge-queue.json → filter status: "pending"
2. If none → "No pending forge jobs." → exit
3. Sort by dependency: moves + npc-skills → creatures → areas → NPCs → items
4. For each group: spawn Opus subagents (up to 3 parallel)
5. Each subagent → generates content → returns JSON
6. Write results to data/forge-results.json
7. Update job status in queue: pending → complete
8. Report summary
```

## Step 1: Read the Queue

```js
// Read and filter
const queue = JSON.parse(readFileSync('data/forge-queue.json', 'utf8'));
const pending = queue.jobs.filter(j => j.status === 'pending');
```

If no pending jobs, say **"No pending forge jobs. Submit some from the Forge Workbench at /forge.html"** and stop.

Show the user what's queued:

| # | Word | Role | Theme | Notes |
|---|------|------|-------|-------|
| 1 | 教える | creature | school | owl-like teacher |

## Step 2: Load Context

Before spawning subagents, read the shared context they all need:

1. **Existing creatures:** `data/creatures.json` + `data/new-creatures-staging.json` — for name collision checks
2. **Existing moves:** `data/moves.json` + `data/new-moves-staging.json` — for learnset building and dedup
3. **Existing items:** `data/new-items-staging.json` — for dedup
4. **Existing NPCs:** `data/npcs.json` + `data/new-npcs-staging.json` — for name collision checks
5. **Existing NPC skills:** `data/npc-skills.json` + `data/new-npc-skills-staging.json` — for dedup
6. **Theme pool:** `language/themes/<themeId>.json` — for stage, area context, other assigned words

Summarize the context (don't paste entire files into prompts — extract what's needed):
- List of existing creature IDs and names
- List of existing move IDs
- List of existing item IDs
- List of existing NPC IDs and names
- List of existing NPC skill IDs
- Theme stage, area word, area meaning

## Step 3: Process by Dependency Group

**Order matters.** Process groups sequentially because later groups depend on earlier ones:

1. **Moves + NPC Skills** — no dependencies
2. **Creatures** — need moves for learnsets
3. **Areas** — need creatures for rosters
4. **NPCs** — need areas for context
5. **Items** — no strict dependencies

Within each group, spawn up to 3 subagents in parallel using the Agent tool.

## Step 4: Spawn Subagents

For each pending job, dispatch an **Opus subagent** using the Agent tool with `model: "opus"`.

### Subagent Prompt Template

Every subagent prompt follows this structure:

```
You are forging a [ROLE] for the Koto Japanese vocabulary RPG.

## Input
- Word: [word] ([reading]) — "[meaning]"
- JPDB Rank: [rank]
- Theme: [themeId] (Stage [stage], Area: [areaWord] "[areaMeaning]")
- User Notes: [notes]
[If re-forging] Previous Result: [previousResult JSON]
[If re-forging] Guidance: [reforge notes]

## Context
- Existing [role] IDs: [list]
- [role-specific context]

## Rules
[role-specific rules — see below]

## Output
Return ONLY a valid JSON object matching this schema:
[role-specific schema]

Do NOT wrap in markdown code fences. Return raw JSON only.
```

### Role-Specific Rules & Schemas

---

#### NPC-SKILL Rules

**Identical to MOVE rules** — NPC skills use the same verb-based design and the same schema fields. The only differences:

1. **No `stage` or `tier` field** — NPC skills are not stage-gated
2. **ID dedup** against `data/npc-skills.json` instead of `data/moves.json`
3. **Target distribution** — NPC skills should have a mix: some `all_enemies`, some `all_allies`, some `single_enemy`, some `single_ally`, some `self`

**Element:** Same as moves — based on verb semantics.

**Category:** Same as moves — from verb type.

**Power/Cost:**
| Power Range | MP Cost Range |
|-------------|---------------|
| 5–30 | 0 |

(NPC skills don't use MP — set mpCost to 0.)

**Schema:**
```json
{
  "id": "string (kebab-case from reading)",
  "name": "string (Japanese verb)",
  "nameEn": "string (1-2 word English)",
  "reading": "string (hiragana)",
  "meaning": "string (dictionary-accurate)",
  "rank": "number (JPDB rank)",
  "element": "fire|water|earth|wood|metal|neutral",
  "category": "damage|buff|debuff|heal|shield|drain",
  "target": "single_enemy|all_enemies|self|single_ally|all_allies",
  "power": "number",
  "mpCost": 0,
  "statusEffect": "string|null",
  "statusChance": "number|null",
  "statusDuration": "number|null",
  "description": "string (1 sentence)"
}
```

---

#### CREATURE Rules

**Naming:**
- The ENTIRE base word's romaji must appear as a contiguous substring in the creature name
- Example: はさみ = "hasami" → "Hasamaw" valid, "Hasaw" invalid
- Never use raw romaji alone — stylize with suffix/prefix/blend
- Output name in katakana + romanized form
- No collision with existing creature IDs/names

**Frequency-Rarity Tier:**
| Rank | Tier |
|------|------|
| 1–3000 | Common |
| 3001–6000 | Uncommon |
| 6001–12000 | Rare |
| 12001–20000 | Epic |
| 20001–30000 | Legendary |

**Element:** Choose one: fire, water, earth, wood, metal, neutral. Based on creature's nature.

**Archetype & Stats:**
| Archetype | baseHp | baseAttack | baseMp |
|-----------|--------|------------|--------|
| Fighter | 100 | 10 | 60 |
| Mage | 75 | 8 | 120 |
| Trickster | 85 | 9 | 90 |
| Tank/Healer | 160 | 8 | 80 |

**Modifier:** A Japanese adjective/descriptor that works as "[modifier]の[base]". JPDB rank must be reasonable for the tier.

**Learnset:** 4–6 moves from existing `data/moves.json`, matching:
- At least 1 STAB move (same element)
- Archetype determines mix (Fighter: mostly damage, Mage: damage+buff+heal, etc.)
- All moves must have `stage <= creature's stage`

**Visual Description:** 3–5 sentences describing appearance. The creature must visually BE the concept (not a related animal). Bright fantasy style, no cyberpunk.

**Schema:**
```json
{
  "id": "string (lowercase, from nameEn)",
  "name": "string (katakana)",
  "nameEn": "string",
  "baseWord": "string (Japanese)",
  "baseReading": "string (hiragana)",
  "baseMeaning": "string",
  "baseRank": "number",
  "modifier": { "word": "string", "reading": "string", "meaning": "string", "rank": "number" },
  "element": "fire|water|earth|wood|metal|neutral",
  "archetype": "Fighter|Mage|Trickster|Tank/Healer",
  "description": "string (visual description)",
  "autoSkill": { "word": "string", "reading": "string", "meaning": "string", "rank": "number" },
  "ultimate": { "word": "string", "reading": "string", "meaning": "string", "rank": "number" },
  "createdAt": "string (YYYY-MM-DD)"
}
```

---

#### MOVE Rules

**Element:** Based on verb semantics — physical force→earth, speed/cutting→metal, growth/nature→wood, heat/energy→fire, flow/cold→water, generic→neutral.

**Category:** From verb type — physical action→damage, protective→shield, mental/status→debuff, enhancement→buff, caring/restoring→heal, consuming→drain.

**Tier/Power/Cost:**
| Tier | Power | MP Cost |
|------|-------|---------|
| 1 | 15–30 | 8–18 |
| 2 | 28–50 | 18–26 |
| 3 | 50–65 | 30–42 |

**Status Effects (if verb implies):** poison (3 turns, 50-80%), sleep (2 turns, 40-60%), stun (1 turn, 30-50%), confuse (2 turns, 40-60%), attack_buff (2-3 turns, 80-100%), haste (1 turn, 100%), shield (2 turns, 100%).

**nameEn:** 1–2 words, dictionary-accurate. No embellishment.

**Schema:**
```json
{
  "id": "string (from reading, lowercase)",
  "name": "string (Japanese verb)",
  "nameEn": "string (1-2 word English)",
  "reading": "string (hiragana)",
  "meaning": "string (dictionary-accurate)",
  "rank": "number",
  "element": "fire|water|earth|wood|metal|neutral",
  "category": "damage|buff|debuff|heal|shield|drain",
  "target": "single_enemy|all_enemies|self|single_ally|all_allies",
  "power": "number",
  "mpCost": "number",
  "statusEffect": "string|null",
  "statusChance": "number|null",
  "statusDuration": "number|null",
  "tier": "number (1-3)",
  "description": "string (1 sentence)",
  "stage": "number (1-10)"
}
```

---

#### ITEM Rules

**Compound words preferred.** Brainstorm a compound Japanese word related to the theme seed word. Each component is separately JPDB-verified.

**Rarity from rarest component rank:**
| Rarest Component Rank | Rarity |
|----------------------|--------|
| 1–3000 | common |
| 3001–6000 | uncommon |
| 6001–12000 | rare |
| 12001–20000 | epic |
| 20001–30000 | legendary |

**Effect by rarity:**
- common: healPercent 0.15–0.20
- uncommon: healAllPercent 0.10–0.15 or attackMult +0.02
- rare: healMostDamaged or chargeBoost
- epic: revivePercent 0.50
- legendary: revivePercent 1.0

**Schema:**
```json
{
  "id": "string (kebab-case)",
  "word": "string (Japanese compound)",
  "reading": "string",
  "meaning": "string",
  "components": [{ "word": "string", "reading": "string", "meanings": ["string"], "rank": "number" }],
  "compoundRank": "number (product of component ranks / 1000, capped at 50000)",
  "rank": "number (rank of rarest component)",
  "rarity": "common|uncommon|rare|epic|legendary",
  "type": "heal|buff|revive|cure",
  "effect": {},
  "description": "string (English, what it does)",
  "descriptionJa": "string (Japanese description)"
}
```

---

#### NPC Rules

**Base word MUST be a person noun** — occupation, social role, or person type. NOT objects or nature words.

**Name:** Natural Japanese given name in katakana. Mix of masculine/feminine/neutral. No collision with existing NPC names.

**Modifier:** Japanese adjective/descriptor, JPDB-verified.

**Personality:** traits (array of 3-4 adjectives), speechStyle (1 sentence), quirk (1 sentence).

**Schema:**
```json
{
  "id": "string (from nameEn, lowercase)",
  "name": "string (katakana)",
  "nameEn": "string",
  "baseWord": "string (Japanese)",
  "baseReading": "string",
  "baseMeaning": "string",
  "baseRank": "number",
  "modifier": { "word": "string", "reading": "string", "meaning": "string", "rank": "number" },
  "area": "string (area id from theme)",
  "tier": "number",
  "personality": {
    "traits": ["string"],
    "speechStyle": "string",
    "quirk": "string"
  },
  "createdAt": "string (YYYY-MM-DD)"
}
```

---

#### AREA Rules

(Areas are complex — if an area job appears, note that area forging is best done interactively via `/area-forge`. Write a basic area scaffold with sub-area names but flag it for manual review.)

---

## Step 5: Write Results

After each subagent completes, write the result to `data/forge-results.json`:

```js
import { writeResult, updateJobStatus } from './src/forge/forge-data.js';

writeResult('data/forge-results.json', {
  jobId: job.id,
  status: 'complete',
  forgedAt: new Date().toISOString(),
  role: job.role,
  word: job.word,
  themeId: job.themeId,
  data: subagentResult,  // The JSON the subagent returned
  agentNotes: "Explanation of choices..."
});

updateJobStatus('data/forge-queue.json', job.id, 'complete');
```

## Step 6: Report Summary

After all jobs are processed:

```
Forge Queue Complete!
━━━━━━━━━━━━━━━━━━━━
✅ 2 creatures forged
✅ 1 move forged
✅ 1 item forged
❌ 0 errors

Review results at /forge.html
```

## Error Handling

If a subagent returns invalid JSON or fails:
1. Write an error result: `{ jobId, status: 'error', error: 'description' }`
2. Update job status to `'error'`
3. Continue with remaining jobs
4. Report errors in summary

## Re-forge Jobs

Jobs with `previousResult` set are re-forges. Include the previous result in the subagent prompt so it can iterate:

```
## Previous Result (improve on this)
[previousResult JSON]

## User's New Guidance
[notes from reforgeHistory + current notes]
```

The subagent should use the previous result as a starting point and apply the new guidance, not start from scratch.
