# Creature Forge Redesign: Subagent Relay + Art Consistency

**Date:** 2026-02-17
**Status:** Approved

## Problems

1. **Context bloat** — The current skill runs 9 sections in a single agent conversation. By sections 8-9, the agent carries hundreds of lines of JPDB responses, roster data, and candidate history, and degrades in quality.
2. **Over-indexed roster balancing** — The skill reads the entire roster and tries to balance elements, archetypes, modifiers, naming patterns, attack verbs, and description motifs. With ~20 creatures out of a target 1000+, this is premature.
3. **Inconsistent art** — Gemini produces wildly varied art because the prompt is vague ("Pokemon meets Genshin Impact"), descriptions are long prose with poetic material descriptions, and no visual reference anchors are used.

## Solution: Relay Chain Architecture

The creature-forge skill becomes a thin orchestrator that fires subagents sequentially. Each subagent reads its own mini-skill file and receives a slim "baton" JSON.

### Directory Structure

```
~/.claude/skills/creature-forge/
  SKILL.md                    ← rewritten as orchestrator (slim)
  skills/
    name-vocab.md             ← Subagent 1: names + vocab table
    combat-vocab.md           ← Subagent 2: attack + ultimate candidates
    identity-modifier.md      ← Subagent 3: archetype + element + modifier
    visual-designer.md        ← Subagent 4: rich descriptions + art briefs
```

### The Baton

A JSON object written to `/tmp/creature-forge-{id}-baton.json`. It starts small and grows as each subagent appends its output:

```
Phase 0 baton (~30 lines):
  baseWord, baseReading, baseMeaning, baseRank, frequencyTier, visualTier,
  allForms, tierCeilings, rosterNames[], rosterVerbs[]

After Subagent 1:
  + nameCandidates[3]

After Subagent 2:
  + attackCandidates[3], ultimateCandidates[3]

After Subagent 3:
  + archetype, element, modifierCandidates[3]

After user picks → separate file: /tmp/creature-forge-{id}-locked.json
  locked = { name, attack, ultimate, archetype, element, modifier }

Subagent 4 receives ONLY locked (~15 lines)
  → outputs: richDescriptions[3], artBriefs[3]
```

### Orchestrator Flow

```
1. USER INPUT
   User provides a word (or discovery/thematic mode, handled by main agent)

2. PHASE 0: FOUNDATION (main agent)
   - JPDB lookup for base word via scripts/lib/jpdb-helpers.mjs
   - Read creatures.json + new-creatures-staging.json
   - Extract: name list, verb usage counts
   - Build initial baton → write to /tmp/creature-forge-{id}-baton.json

3. SUBAGENT RELAY (sequential)
   For each of [name-vocab, combat-vocab, identity-modifier]:
     - Fire subagent: "Read skill at skills/{name}.md, read baton, do task, write output back"
     - Wait for completion
     - Main agent reads updated baton (sanity check)

4. USER PICKS (main agent)
   - Present all candidates in one consolidated view
   - User picks name, attack, ultimate, confirms archetype+element, picks modifier
   - Write locked identity to /tmp/creature-forge-{id}-locked.json

5. VISUAL DESIGN (subagent 4)
   - Fire subagent: "Read visual-designer.md, read locked identity, produce descriptions"
   - Writes rich descriptions + art briefs to /tmp/creature-forge-{id}-visuals.json

6. IMAGE GENERATION (main agent)
   - Run creature-gemini-gen.mjs with art briefs + style references
   - Run creature-preview.mjs, display in browser
   - User picks A/B/C

7. SAVE (main agent)
   - Assemble final creature from locked identity + chosen description
   - Append to new-creatures-staging.json
```

## Simplified Roster Awareness

### What stays:
- **Name collision check** — flat list of existing names passed in baton
- **Combat verb tracking** — list of `{word, count}` pairs. Subagent 2 avoids verbs used 3+ times but allows some repetition.

### What gets removed:
- Element distribution tracking
- Archetype distribution tracking
- Modifier reuse tracking
- Description motif tracking
- Naming pattern/suffix analysis

A small helper in the orchestrator reads both JSON files and extracts just names and verb lists (~20 lines of roster context instead of hundreds).

## Art Consistency

Three changes working together.

### Style Reference Images

User provides curated art style exemplar images (not game creatures — art in the target style):

```
data/creature-forge-style-refs/
  ref-1.png
  ref-2.png
  ref-3.png
```

The `creature-gemini-gen.mjs` script reads all images from this directory, base64-encodes them, and passes them as `inlineData` parts before the text prompt. Zero SDK changes — the existing `@google/generative-ai` SDK supports this via multi-part content arrays.

### Rigid Style Block

Replace the vague "Pokemon meets Genshin Impact" with a hyper-specific frozen style spec used verbatim for every creature:

```
ART STYLE (match the reference images exactly):
- Crisp black outlines, uniform weight
- Cel-shaded flat coloring: base color + one shadow tone per surface
- No gradients, no soft brushwork, no painterly textures
- Large expressive eyes with single white catchlight
- 5-6 colors per creature maximum plus black outlines
- Clean readable silhouette, suitable as a game UI thumbnail
- Compact appealing proportions — not hyper-detailed or realistic
```

Exact wording tuned based on the user's reference images. The key constraint: this block is frozen and never varies per creature.

### Two-Tier Descriptions

Subagent 4 (visual designer) produces two outputs per variant:

- **Rich description** (5-8 sentences) — shown to user as flavor text. Material descriptions, personality, atmosphere.
- **Art brief** (1-3 sentences) — sent to Gemini. Structural only: shape, colors, key features, pose. No poetic material descriptions.

Example:
- Rich: "An ancient turtle creature carries a shell resembling a crumbling temple dome, its surface covered in overlapping plates of oxidized bronze and deep jade stone..."
- Art brief: "Ancient turtle. Domed shell with cracked jade-green and bronze plates. Glowing amber eyes. Small horns. Stocky legs."

## Mini-Skill Content Summary

### name-vocab.md (Subagent 1)
- Name construction rules (romaji contiguous substring rule)
- 3 candidates with different naming strategies
- Vocab table format (all forms, readings, ranks, raw JPDB meanings)
- Output: `nameCandidates[]`

### combat-vocab.md (Subagent 2)
- Tier ceiling table for attack/ultimate verb frequency ranks
- Translation accuracy rules (transitivity, dictionary-first, no embellishment)
- Roster verb awareness (avoid 3+ reuse)
- 3 attack + 3 ultimate candidates with JPDB lookups, no overlap
- Output: `attackCandidates[]`, `ultimateCandidates[]`

### identity-modifier.md (Subagent 3)
- Archetype and element definitions
- Modifier rules: natural as "[Modifier]の[Base]"
- 3 modifier candidates with JPDB lookup + appearance sketch
- Concept-visual alignment (Mouse Rule)
- Output: `archetype`, `element`, `modifierCandidates[]`

### visual-designer.md (Subagent 4)
- Firefly Rule (creature must BE the concept)
- Visual tier directives
- 3 wildly different visual concepts
- Two-tier output: rich descriptions + art briefs
- Output: `richDescriptions[]`, `artBriefs[]`

Shared rules (translation accuracy, JPDB raw meanings, i+1) are duplicated into each mini-skill that needs them — subagents start fresh with no inherited context.
