# Creature Forge Skill Design

**Date:** 2026-02-14
**Purpose:** A Claude Code skill that turns any English word into a fully designed game creature with Japanese vocabulary, attack skills, and visual descriptions — optimized for language learning.

## Input Modes

| Invocation | Behavior |
|---|---|
| `/creature-forge scissors` | Direct word — translate to Japanese, proceed through 7 sections |
| `/creature-forge` (no args) | Discovery mode — scan existing creatures, suggest 5 gap-filling candidates with JPDB frequencies |
| `/creature-forge [Schoolyard]` | Thematic mode — brainstorm 5 objects/animals fitting the theme with JPDB frequencies |

Discovery and thematic modes filter out words already in `creatures.json` or `new-creatures-staging.json`.

## 7 Numbered Output Sections

1. **Name** — Romaji of the base word. Compound forms presented if relevant.
2. **Japanese Vocab** — Dictionary form + reading + meaning + JPDB rank. Multiple valid forms shown if they exist.
3. **Attack Skills (pick 1 of 3)** — 3 verb candidates, each with Japanese word + reading + English meaning + JPDB rank. Prefer rank < 5000. Compound verbs show frequency for each component and the compound.
4. **Ultimate Ability (pick 1 of 3)** — 3 candidates, same format. More dramatic. Different vocabulary from attack candidates where possible.
5. **Archetype** — One of Fighter | Tank/Healer | Mage | Trickster with reasoning. User can override.
6. **Element** — One of Fire | Wood | Earth | Metal | Water with reasoning. User can override.
7. **Description (pick 1 of 3)** — 3 visual descriptions, 5-8 sentences each. Chibi/Pokemon aesthetic, vivid enough for concept art. Personality + visual features.

After all sections: a summary table of every Japanese word used and its JPDB rank.

## Re-roll Flow

After presenting all 7 sections, prompt:
> Type Y to approve or give me #'s of sections to redo OR tell me what's missing in plain english

- "redo 3" regenerates only attack skills
- "redo 4 but more fire-themed" for guided re-rolls
- "redo 3 and 7" for multiple sections at once
- New JPDB batch call for any new words introduced

## JPDB API Integration

- **API key location:** `data/.creature-forge-jpdb-key` (gitignored, single line, just the key)
- **Batch rule:** Collect ALL words needing lookup, send in one `parse` call + one `lookup-vocabulary` call
- **30k+ rule:** If any word comes back at rank 30k+, discard it, pick better alternatives, wait 1 second, batch-lookup replacements
- **Endpoint:** `https://jpdb.io/api/v1/parse` then `https://jpdb.io/api/v1/lookup-vocabulary`

## Output Format

On "approve", append creature to `data/new-creatures-staging.json`:

```json
{
  "id": "hasami",
  "name": "ハサミ",
  "nameEn": "Hasami",
  "baseWord": "鋏",
  "baseReading": "はさみ",
  "baseMeaning": "scissors",
  "baseRank": 1234,
  "element": "metal",
  "archetype": "fighter",
  "description": "...",
  "autoSkill": { "word": "切る", "reading": "きる", "meaning": "Cut", "rank": 89 },
  "ultimate": { "word": "断つ", "reading": "たつ", "meaning": "Sever", "rank": 1502 },
  "createdAt": "2026-02-14"
}
```

- Array format — new creatures appended, never overwritten
- No `rarity` or `area` fields (assigned in a later step)
- File is committed to git (matches `!data/*.json` in .gitignore)

## File Locations

- **Skill file:** `~/.claude/skills/creature-forge/SKILL.md`
- **API key:** `data/.creature-forge-jpdb-key`
- **Staging output:** `data/new-creatures-staging.json`
- **Existing creatures:** `data/creatures.json` (64 creatures, read-only reference)

## Vocabulary Philosophy

Prefer HIGH frequency (LOW rank number) words. A language learner needs common words. Rank < 5000 is ideal for skills. The creature's base word can be any frequency since that's the word being taught — but attack/ultimate vocabulary should be common verbs the learner will encounter often.
