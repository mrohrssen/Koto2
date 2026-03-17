---
name: creature-forge
description: Design a new game creature from an English word. Generates name, Japanese vocab, learnset, archetype, element, modifier, visual description, and concept art preview with JPDB frequency data. Triggers on "creature forge", "new creature", "design creature", "creature from word".
---

# Creature Forge — Orchestrator

Turn any English word into a collectible creature for Koto, a Japanese vocabulary learning RPG.

This skill is a **thin orchestrator**. It fires 4 subagents sequentially, each reading its own mini-skill file and a shared baton JSON. You (the main agent) handle input, JPDB base lookup, user interaction, image generation, and saving.

## Quick Reference: The Flow

```
Phase 0: Foundation (you)        → build baton
Phase 1: Subagent relay (3 agents) → name, combat, identity candidates
Phase 2: User picks (you)        → consolidated selection
Phase 3: Visual design (1 agent)  → descriptions + art briefs
Phase 4: Image generation (you)  → Gemini Flash + preview
Phase 5: Save (you)              → staging JSON
```

## Input Mode Detection

Parse skill arguments:

- **Direct mode:** `/creature-forge scissors` — word provided. Go to Phase 0.
- **Discovery mode:** `/creature-forge` (no args) — help user find a word. See Discovery Mode below.
- **Thematic mode:** `/creature-forge [Schoolyard]` (brackets) — brainstorm words for a theme. See Thematic Mode below.

## Discovery Mode (no arguments)

1. **Check stage gaps.** Run `node scripts/forge-discovery.mjs --gaps creature` to see which stages need creatures most.
2. **Pick target stage.** Auto-pick the stage with the largest deficit, or let user specify.
3. **Discover candidates.** Run `node scripts/forge-discovery.mjs --type creature-base --stage N --limit 10` to get stage-filtered noun candidates from `animals.json`, `objects.json`, and `nature.json`.
4. Read `data/creatures.json` and `data/new-creatures-staging.json`. The discovery script already excludes existing baseWords.
5. Present selection table:

| # | Word | Reading | Meaning | JPDB Rank | WK Level | Stage | Source |
|---|------|---------|---------|-----------|----------|-------|--------|

6. User picks or provides their own word. Proceed to Phase 0.

## Thematic Mode (brackets)

Same as Discovery but brainstorm 5 words fitting the theme (e.g., `[Schoolyard]` → chalk, backpack, bell, jump rope, swing).

## Theme Pool Mode: `/creature-forge --theme school`

When `--theme <themeId>` is provided, draw the base word from the theme pool instead of category files:

1. Run `node scripts/forge-discovery.mjs --theme school --role creature --limit 10` to get unassigned creature-role words from the theme pool.
2. Present candidates to user. User picks one.
3. Continue with Phase 0 JPDB lookup as normal.
4. **After Phase 5 (Save):** Mark the word as assigned in the theme file. Run a temp script:
   ```javascript
   import { markAssigned } from './scripts/lib/theme-utils.mjs';
   markAssigned('school', '亀', 'creature:kamedor');
   ```

### Move Thematic Discovery (Theme Mode only)

After the creature's concept and element are locked (Phase 2), suggest thematically fitting verb concepts for its learnset:

1. Read `data/moves.json` for existing moves.
2. Based on the creature's concept (e.g., fox → bite, sneak, howl, trick), identify verbs that match thematically.
3. Cross-reference against existing moves — if matches exist, prioritize them for the learnset.
4. If gaps exist (needed verbs don't have moves yet), flag them for future `/move-forge`.
5. Pass the suggested move list to the learnset-builder subagent via the baton.

## Frequency-Rarity Tier System

| Tier | JPDB Rank | Visual Style | Skill Preferred | Skill Ceiling | Mod Preferred | Mod Ceiling |
|------|-----------|--------------|-----------------|---------------|---------------|-------------|
| Common | 1–3000 | Cute mascot | < 2000 | 4000 | < 3000 | 6000 |
| Uncommon | 3001–6000 | Stylish companion | < 4000 | 7000 | < 5000 | 10000 |
| Rare | 6001–12000 | Striking, impressive | < 6000 | 12000 | < 8000 | 15000 |
| Epic | 12001–20000 | Grand, powerful | < 10000 | 20000 | < 12000 | 20000 |
| Legendary | 20001–30000 | Mythical, awe-inspiring | < 15000 | 25000 | < 18000 | 25000 |

Hard discard: rank 30000+.

### Concept-Visual Alignment (Mouse Rule)

After determining frequency tier, apply a concept check. The visual tier is the **lower** of frequency tier and concept's max visual tier:

| Concept Scale | Examples | Max Visual Tier |
|---------------|----------|-----------------|
| Tiny/Cute | mouse, hamster, sparrow, ladybug | Uncommon |
| Small/Mundane | scissors, pencil, sock, eraser | Rare |
| Medium/Neutral | dog, cat, horse, desk, clock | Epic |
| Large/Impressive | bear, eagle, shark, volcano | Legendary |
| Mythical/Abstract | dragon, phoenix, void, time | Legendary |

## JPDB API Integration

Use the helper module at `scripts/lib/jpdb-helpers.mjs`. Write a temp script to `/tmp/` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms, tierFromRank } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['鋏']; // use kanji/katakana, NOT short hiragana
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);
for (const r of results) {
  console.log(JSON.stringify(r));
}
```

Save to `/tmp/creature-jpdb-lookup.mjs` and run with `node /tmp/creature-jpdb-lookup.mjs`.

**Always show raw JPDB `meanings` array.** Never paraphrase.

---

## Phase 0: Foundation (Main Agent)

1. **JPDB lookup** for the base word. Resolve most common form.
2. **Determine tiers:** frequency tier from rank, visual tier from concept-visual alignment.
3. **Read roster** from `data/creatures.json` and `data/new-creatures-staging.json` (skip if missing).
4. **Extract slim roster data:**
   - `rosterNames`: flat array of all existing `nameEn` values
5. **Compute tier ceilings** from the tier table above.
6. **Build baton JSON** and write to `/tmp/creature-forge-{id}-baton.json`:
7. **Compute stage** — Run: `node -e "import {getWordStrictStage} from './language/stage-utils.js'; console.log(getWordStrictStage('BASE_WORD', BASE_RANK))"` Or use WK level: `Math.ceil(wkLevel / 6)`

```json
{
  "baseWord": "ハサミ",
  "baseReading": "はさみ",
  "baseMeaning": "scissors",
  "baseRank": 13900,
  "frequencyTier": "epic",
  "visualTier": "rare",
  "allForms": [{"spelling": "ハサミ", "rank": 13900}, {"spelling": "鋏", "rank": 17000}],
  "meanings": [["scissors"]],
  "tierCeilings": {
    "skillPreferred": 10000,
    "skillCeiling": 20000,
    "modPreferred": 12000,
    "modCeiling": 20000
  },
  "rosterNames": ["Kamedor", "Irukami", "Chouri"],
  "stage": 6,
  "baseMp": 80
}
```

The `id` is a kebab-case slug of the base meaning (e.g., "scissors").

**Announce the tiers before proceeding:**

When visual tier = frequency tier:
> **Rarity Tier: [Tier]** (base rank [N])

When visual tier is lower:
> **Rarity Tier: [Frequency Tier]** (base rank [N]) — encounter rate and skill vocab
> **Visual Tier: [Visual Tier]** (concept: [scale]) — [thing] is inherently [small/cute/mundane]

---

## Phase 1: Subagent Relay (Sequential)

Fire 3 subagents one at a time. Each reads its mini-skill and the baton, does its work, and writes output back to the baton.

### Subagent 1: Name & Vocab

```
Task tool (general-purpose, model: sonnet):
  description: "Generate name candidates for [baseMeaning]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/name-vocab.md
    Then read the baton at /tmp/creature-forge-{id}-baton.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `nameCandidates` was added.

### Subagent 2: Learnset Builder

```
Task tool (general-purpose, model: sonnet):
  description: "Build learnset for [baseMeaning]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/learnset-builder.md
    Then read the baton at /tmp/creature-forge-{id}-baton.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `learnset` and `learnsetSummary` were added.

### Subagent 3: Identity & Modifier

```
Task tool (general-purpose, model: sonnet):
  description: "Generate identity + modifier for [baseMeaning]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/identity-modifier.md
    Then read the baton at /tmp/creature-forge-{id}-baton.json
    Follow the skill instructions exactly.
    Write your output back to the baton file (read it, add your fields, write it back).
```

Wait for completion. Read the baton to verify `archetype`, `element`, and `modifierCandidates` were added.

---

## Phase 2: User Picks (Main Agent)

Read the completed baton. Present ALL candidates in one consolidated view:

### Name (pick A/B/C)
| # | Name | Katakana | Language Thesis |
|---|------|----------|-----------------|

### Base Word
| Word | Reading | Meaning | Rank | All Forms |
|------|---------|---------|------|-----------|

### Learnset (review)
| Lv | Move | Japanese | Element | Category | Tier | Reason |
|----|------|----------|---------|----------|------|--------|

Summary: [N] total, [M] STAB, tier spread: T1: X, T2: Y, T3: Z

User can request move swaps: "replace the level 12 move with something defensive"

### Archetype
[Suggestion with reasoning — confirm or change]

### Element
[Suggestion with reasoning — confirm or change]

### Modifier (pick A/B/C)
| # | Japanese | Reading | Meaning | JPDB Rank | Appearance Sketch |
|---|----------|---------|---------|-----------|-------------------|

The user makes all picks in one message.

**Build locked identity** and write to `/tmp/creature-forge-{id}-locked.json`:

```json
{
  "id": "hasamaw",
  "name": "Hasamaw",
  "nameKatakana": "ハサマウ",
  "baseWord": "ハサミ",
  "baseReading": "はさみ",
  "baseMeaning": "scissors",
  "baseRank": 13900,
  "frequencyTier": "epic",
  "visualTier": "rare",
  "stage": 6,
  "baseMp": 80,
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "nomu", "level": 5 }
  ],
  "archetype": "Fighter",
  "element": "metal",
  "modifier": {
    "word": "古代",
    "reading": "こだい",
    "meaning": "Ancient",
    "rank": 5500,
    "appearanceSketch": "Crumbling temple-dome shell, oxidized bronze plates..."
  }
}
```

---

## Phase 3: Visual Design (Subagent 4)

```
Task tool (general-purpose, model: opus):
  description: "Design visuals for [name]"
  prompt: |
    Read the skill file at $CLAUDE_PROJECT_DIR/.claude/plugins/koto-forge/1.1.0/skills/creature-forge/subskills/visual-designer.md
    Then read the locked identity at /tmp/creature-forge-{id}-locked.json
    Follow the skill instructions exactly.
    Write your output to /tmp/creature-forge-{id}-visuals.json
```

Wait for completion. Read the visuals JSON to verify `richDescriptions` and `artBriefs` exist.

---

## Phase 4: Image Generation (Main Agent)

1. **Build meta JSON** for the generation scripts. Read the locked identity and visuals, combine into `/tmp/creature-forge-{id}-meta.json`:

```json
{
  "name": "Hasamaw",
  "modifier": "Ancient",
  "baseMeaning": "scissors",
  "element": "metal",
  "archetype": "Fighter",
  "visualTier": "rare",
  "a": "[art brief A]",
  "b": "[art brief B]",
  "c": "[art brief C]",
  "artBriefs": { "a": "...", "b": "...", "c": "..." },
  "richDescriptions": { "a": "...", "b": "...", "c": "..." },
  "descriptions": { "a": "[rich desc A]", "b": "[rich desc B]", "c": "[rich desc C]" }
}
```

The `a/b/c` top-level keys use art briefs. The `descriptions` object uses rich descriptions (for the preview HTML). The `artBriefs` and `richDescriptions` objects are also included for scripts that read them directly.

2. **Generate images:**

```bash
node scripts/creature-gemini-gen.mjs \
  --id ${ID} \
  --visual-tier ${VISUAL_TIER} \
  --descriptions /tmp/creature-forge-${ID}-meta.json \
  --use-art-briefs
```

If `data/.creature-forge-gemini-key` doesn't exist, skip images: "No API key — pick based on descriptions."

3. **Show preview:**

```bash
node scripts/creature-preview.mjs --id ${ID} --metadata /tmp/creature-forge-${ID}-meta.json &
```

Use Playwright MCP:
- `browser_navigate` to the URL from script output
- `browser_take_screenshot` (jpeg, fullPage)
- `rm <filename>` after showing

4. **User picks A/B/C.**

5. **Save selected image:**

```bash
mkdir -p data/creature-staging-images
cp /tmp/creature-forge-${ID}-${VARIANT}.png data/creature-staging-images/${ID}.png
```

---

## Phase 5: Save (Main Agent)

1. Read `data/new-creatures-staging.json` (or initialize `[]`).
2. Build creature object:

```json
{
  "id": "<lowercase-romaji>",
  "name": "<katakana-name>",
  "nameEn": "<Romaji-Name>",
  "baseWord": "<kanji-or-kana>",
  "baseReading": "<hiragana>",
  "baseMeaning": "<english>",
  "baseRank": 1234,
  "rarity": "<common|uncommon|rare|epic|legendary>",
  "baseHp": 100,
  "baseAttack": 10,
  "baseMp": 60,
  "modifier": {
    "word": "<japanese>",
    "reading": "<hiragana>",
    "meaning": "<English-capitalized>",
    "rank": 1234
  },
  "element": "<lowercase>",
  "archetype": "<capitalized>",
  "description": "<chosen rich description>",
  "learnset": [
    { "moveId": "kamu", "level": 1 },
    { "moveId": "nomu", "level": 5 }
  ],
  "stage": 6,
  "createdAt": "YYYY-MM-DD"
}
```

**baseMp by archetype:**
| Archetype | baseHp | baseAttack | baseMp |
|-----------|--------|------------|--------|
| Fighter | 100 | 10 | 60 |
| Mage | 75 | 8 | 120 |
| Trickster | 85 | 9 | 90 |
| Tank/Healer | 160 | 8 | 80 |

3. Append. Write back. Confirm: **"Saved [Name] to staging! [N] creatures now in data/new-creatures-staging.json."**

## Re-roll Handling

When the user requests changes:

1. Parse for section references and feedback:
   - "redo names" → re-dispatch Subagent 1
   - "redo learnset" → re-dispatch Subagent 2
   - "redo modifiers" → re-dispatch Subagent 3
   - "redo descriptions" / "redo visuals" → re-dispatch Subagent 4, then re-run Phase 4
   - "new images" → re-run Phase 4 only (with current descriptions)
2. Re-dispatch only the relevant subagent with the current baton.
3. Re-present updated candidates.

## Checklist Before Saving

- [ ] All JPDB ranks are real (from API calls)
- [ ] All ranks use the most common spelling form
- [ ] Modifier within tier modifier ceiling
- [ ] **All English translations dictionary-accurate** — no embellishment, no transitivity changes
- [ ] Concept-visual alignment applied (Mouse Rule)
- [ ] Description visual tone matches **visual tier**, not frequency tier
- [ ] Mnemonic Clarity (Firefly Rule) — creature IS the concept
- [ ] Name preserves full base reading as contiguous romaji substring
- [ ] Katakana name correctly renders the romaji
- [ ] "[Modifier]の[Base]" reads naturally in Japanese
- [ ] No duplicate id with existing creatures
- [ ] Selected image saved to `data/creature-staging-images/{id}.png`
- [ ] Learnset contains 4-6 moves from moves.json
- [ ] At least 1 STAB move (same element as creature)
- [ ] Learnset tier spread: mix of T1, T2, and T3 moves
- [ ] All learnset moves have stage <= creature's stage
- [ ] baseMp matches archetype (Fighter=60, Mage=120, Trickster=90, Tank/Healer=80)
- [ ] stage field computed from baseWord + baseRank
