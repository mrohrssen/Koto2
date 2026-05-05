---
name: sprite-quality-pipeline
description: "[DEPRECATED — DO NOT USE] Stale skill — do not invoke. Original (for reference only): Three-gate sprite quality pipeline for generated sprites."
user_invocable: false
---

> **DEPRECATED — DO NOT USE**
>
> This skill is stale and should not be invoked. Its tables, workflows, and
> assumptions reflect an older version of the game systems and may produce
> incorrect content. Do not run `/sprite-quality-pipeline`. See current
> reference docs (e.g. `docs/move-system-reference.md`) for the actual
> design space.

# Sprite Quality Pipeline

**Type:** Rigid — follow exactly, no shortcuts.

## When to Use

Any time you are generating or regenerating sprites of any type.

## Pre-flight Checks

Before generating, verify:

1. Reference images exist in `data/quality-refs/<type>/` (at least 4 images)
2. If no refs exist, STOP and tell the user: "No reference images found for <type>. Please add 4-6 gold-standard sprites to `data/quality-refs/<type>/` before generating."
3. Confirm which sprites to generate and how many candidates (default: 3)

## Workflow

### Step 1: Generate Candidates

- Generate 2-3 candidates per sprite on **white backgrounds** (#FFFFFF)
- Use the type-specific generation script
- Save all candidates to `data/sprite-staging/<type>/`
- Name candidates with suffix: `<id>-a.png`, `<id>-b.png`, `<id>-c.png`

### Step 2: Gate 1 — Technical Validation

```bash
python3 scripts/sprite-gate1.py --input data/sprite-staging/<type> --type <type> --json --move-rejected
```

- Review the output
- If all candidates for a sprite fail, regenerate with adjusted prompts (max 2 rounds)
- After max retries, the sprite goes to the review queue as "generation failed"

### Step 3: Gate 2 — AI Vision Judge (Subagents)

Dispatch parallel Claude Code subagents to evaluate Gate 1 survivors. Each subagent:
1. Reads reference images from `data/quality-refs/<type>/` using the Read tool (vision)
2. Reads the candidate image
3. Evaluates concept clarity, style consistency, and readability (1-5 each)
4. Returns JSON: `{ "file": "name.png", "concept": N, "style": N, "readability": N, "reasoning": "..." }`

Collect all scores into a single JSON array and run:

```bash
node scripts/sprite-gate2.mjs \
  --input data/sprite-staging/<type> \
  --type <type> \
  --manifest <manifest.json> \
  --scores <scores.json> \
  [--output <path>]
```

**Fallback (Gemini, when subagents unavailable):**
```bash
node scripts/sprite-gate2.mjs \
  --input data/sprite-staging/<type> \
  --type <type> \
  --refs data/quality-refs/<type> \
  --manifest <manifest.json>
```

- If all candidates for a sprite fail, regenerate with critique feedback from the judge (max 2 rounds)
- The judge's critique for the highest-scoring reject is fed back into the generation prompt

### Step 4: Queue for Review

```bash
node scripts/sprite-queue-review.mjs --type <type> --staging data/sprite-staging/<type>
```

Tell the user: **"N icons ready for review at /dev/sprites -> Needs Review tab."**

## Rules

- **NEVER auto-deploy to production.** Only the user picks winners from the dashboard.
- **NEVER skip gates.** Every candidate goes through Gate 1 -> Gate 2 -> Review.
- **NEVER generate without reference images.** The style target must be intentional.
- **NEVER copy files directly to `public/assets/sprites/`.** The dashboard handles deployment.

## Sprite Type Reference

| Type | Size | Gate 1 extras | Gate 2 concept prompt |
|------|------|--------------|----------------------|
| action | 128x128 | Loose complexity | "Can a language learner guess the meaning?" |
| item | 128x128 | Single silhouette check | "Can a language learner guess the meaning?" |
| creature | 1024x1024 | Centering check | "Distinct, memorable creature?" |
| boss | 1024x1024 | Centering check | "Distinct, memorable creature?" |
| npc | 1024x1024 | Centering check | "Distinct, memorable character?" |
| background | 1536x1024 | Scaled thresholds | "Does this look like the described environment?" |

## Manifest Format

Gate 2 requires a manifest JSON to map filenames to words. Format:

```json
[
  { "id": "dash", "word": "走る", "wordEn": "Dash" },
  { "id": "heal", "word": "治す", "wordEn": "Heal" }
]
```

Generate this from the appropriate data file (`data/moves.json`, `data/creatures.json`, etc.) before running Gate 2.
