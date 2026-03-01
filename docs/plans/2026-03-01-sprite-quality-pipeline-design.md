# Sprite Quality Pipeline — "70% Gets Rejected"

**Date:** 2026-03-01
**Inspiration:** [Ultrathink: 70% of Everything Gets Rejected](https://ultrathink.art/blog/seventy-percent-of-everything-gets-rejected)

## Problem

AI-generated sprites are unpredictable in quality across every dimension: concept accuracy, art style consistency, and technical correctness. Since Koto is a language-learning game, every icon must be instantly recognizable to a player who doesn't know the word yet — the icon IS the visual clue. Our current pipeline generates once, hopes for the best, and manually flags failures.

## Solution

A three-gate rejection pipeline that auto-rejects bad sprites and presents only survivors for human selection. Applies to all sprite types.

## Sprite Types & Sizes

| Type | Size | Readability context |
|------|------|-------------------|
| Actions | 128×128 | Tiny icons on mobile |
| Items | 128×128 | Tiny icons on mobile |
| Creatures | 1024×1024 | Full character art |
| Bosses | 1024×1024 | Full character art |
| NPCs | 1024×1024 | Full character art |
| Backgrounds | 1536×1024 | Full scene, landscape |

## Pipeline Flow

```
Generate 2-3 candidates per sprite (white backgrounds)
         │
         ▼
   ┌─────────────┐
   │  Gate 1:     │  Automated, no AI cost
   │  Technical   │  Background purity, dimensions,
   │  Validation  │  edge quality, visual complexity
   └──────┬──────┘
          │ survivors
          ▼
   ┌─────────────┐
   │  Gate 2:     │  Multimodal AI call
   │  Vision      │  Concept clarity for language learners,
   │  Judge       │  style consistency, readability
   └──────┬──────┘
          │ survivors (scored + annotated)
          ▼
   ┌─────────────┐
   │  Gate 3:     │  "Needs Review" tab in dev dashboard
   │  Human       │  Shows all survivors with scores/reasons
   │  Selection   │  User picks the winner
   └──────┬──────┘
          │ selected
          ▼
    Production sprite
```

**Retry rules:**
- Gate 1 kills all candidates → auto-regenerate (max 2 rounds), then flag as "generation failed"
- Gate 2 kills all candidates → regenerate with critique in prompt (max 2 rounds)
- Only 1 survivor → still goes to dashboard but pre-marked as "only option"
- Zero human review needed for rejections — user only sees what's worth looking at

## Gate 1: Technical Validation

Pure code (Python/Pillow). No AI cost. Catches the 30-40% of generations that are technically broken.

| Check | What it catches | How |
|-------|----------------|-----|
| Background purity | Wrong BG color, dirty background | Sample corners + edges, verify white (±tolerance) |
| Content presence | Empty/near-empty generations | Reject if < 5% of canvas is content |
| Content overflow | Bleeding off edges | No content pixels within 2px of border |
| Dimensions | Wrong size after slicing | Must match type-specific target |
| Fake transparency | Light gray pixels pretending to be transparent on white | After BG removal, reject any pixel with alpha 1-254. Real content is fully opaque (255), real background is fully transparent (0). Anything in between = fail |
| Visual complexity | Flat blobs or noisy messes | Reject if <8 color clusters (too simple) or >200 (too noisy) |

**Type-specific rules:**
- **Creatures/Bosses/NPCs**: Content roughly centered
- **Items**: Single connected silhouette (one region, not scattered fragments)
- **Actions**: Looser complexity thresholds (effects are OK)
- **Backgrounds**: Complexity thresholds scaled up for 1536×1024

All thresholds scale with image size — a 1024×1024 creature naturally has more color clusters than a 128×128 icon.

**Output:** JSON report per image: `{passed: bool, checks: [{name, passed, detail}]}`. Failed candidates moved to `rejected/` subfolder with report attached.

## Gate 2: AI Vision Judge

Multimodal model evaluates each surviving candidate. One API call per candidate (no batching, to avoid comparison bias).

**Three criteria, each scored 1-5. Fail if any < 3:**

### Concept Clarity (most important)

> "You are helping a language learner who does NOT know this word. They will see only this icon and the word in a foreign script. Can they guess the meaning?"

- 5 = Instantly recognizable (a running figure for "dash")
- 3 = Ambiguous but plausible (could be "dash" or "jump")
- 1 = No connection (abstract swirl for "dash")

For creatures: less about guessing a word, more about "does this look like a distinct, memorable creature" (creature names are proper nouns).

For backgrounds: "does this look like the described environment."

### Style Consistency

Judge receives 4-6 reference sprites from `data/quality-refs/<type>/`. These are hand-curated by the user — the pipeline will not run without them.

- 5 = Cohesive, same palette/linework/detail level
- 3 = Passable but noticeably different
- 1 = Completely different art style

If no references exist for a type, the pipeline stops and asks the user to curate them first.

### Readability at Target Size

Evaluated at actual display size.

- 5 = Clear at target size
- 3 = Squint and you can tell
- 1 = Unreadable blob

Context varies by type: 128px on a phone screen (actions/items) vs full display (creatures) vs scene art (backgrounds).

**Ranking:** Total score = sum of 3 criteria (max 15). Used for ordering in the dashboard.

**On total failure:** Highest-scoring reject's critique is fed back into the generation prompt. E.g., "Previous attempt looked like 'jumping' not 'dashing' — emphasize horizontal speed lines and forward lean."

**Model:** Whatever multimodal model is configured in `ai-providers.js` (likely Gemini Flash for cost efficiency).

## Gate 3: Human Selection (Dashboard)

Extends the existing dev sprite dashboard (`/dev/sprites`) with a "Needs Review" tab.

### What the user sees

Each pending sprite shows:
- All surviving candidates displayed at full size with their Gate 2 scores
- Rejected candidates shown as small thumbnails with rejection reasons
- Per-candidate breakdown: concept / style / readability scores

### Actions available

- **Pick** — selected sprite moves to production (`public/assets/sprites/<type>/`)
- **Reject All → Regen** — queues for regeneration with an optional note (e.g., "needs more motion lines")
- **Accept all top-scored** — batch action for when you trust the pipeline's ranking
- **Sort** — by score (lowest first), by name, by sprite type
- **Count badge** — tab shows pending review count

### Data storage

Review queue: `data/sprite-review-queue.json` (gitignored)

```json
{
  "pending": [
    {
      "id": "dash",
      "type": "action",
      "word": "走る",
      "wordEn": "Dash",
      "candidates": [
        {
          "file": "dash-a.png",
          "gate1": "pass",
          "gate2": { "concept": 5, "style": 4, "readability": 4 },
          "total": 13
        }
      ],
      "rejected": [
        {
          "file": "dash-c.png",
          "gate1": "fail",
          "reason": "fake transparency: 847 pixels with alpha 1-254"
        }
      ],
      "generatedAt": "2026-03-01T...",
      "attempt": 1
    }
  ]
}
```

## Claude Code Skill

**Name:** `sprite-quality-pipeline`
**Type:** Rigid (follow exactly, no shortcuts)

**Enforced workflow:**

1. **PREPARE** — Confirm sprite type and icons to generate. Verify reference images exist in `data/quality-refs/<type>/`. If none, stop and ask user to curate them first.
2. **GENERATE** — Generate 2-3 candidates per icon on white backgrounds. Save to `data/sprite-staging/<type>/`.
3. **GATE 1** — Run `python3 scripts/sprite-gate1.py --type <type>`. If all candidates fail, auto-regen (max 2 rounds).
4. **GATE 2** — Run `node scripts/sprite-gate2.mjs --type <type>`. If all fail, regen with critique (max 2 rounds).
5. **QUEUE** — Run `node scripts/sprite-queue-review.mjs --type <type>`. Tell user: "N icons ready for review at /dev/sprites → Needs Review."
6. **NEVER auto-deploy.** Only the user picks winners from the dashboard.

**What the skill prevents:**
- Generating sprites without reference images
- Skipping gates
- Auto-selecting winners without human review
- Deploying sprites that haven't been through the pipeline

## File Structure

```
scripts/
  sprite-gate1.py              # Gate 1: Technical validation (Python/Pillow)
  sprite-gate2.mjs             # Gate 2: AI vision judge
  sprite-queue-review.mjs      # Populate review queue from gate results
data/
  quality-refs/                # User-curated reference images
    actions/                   #   4-6 gold-standard action icons
    creatures/                 #   4-6 gold-standard creature sprites
    items/                     #   4-6 gold-standard item icons
    bosses/                    #   4-6 gold-standard boss sprites
    npcs/                      #   4-6 gold-standard NPC sprites
    backgrounds/               #   4-6 gold-standard backgrounds
  sprite-staging/<type>/       # Candidates in progress
  sprite-review-queue.json     # Review queue (gitignored)
```

## Migration from Current Pipeline

Existing generation scripts (`generate-action-icons.mjs`, `regen-action-icons.mjs`, etc.) continue to work as the generation step — they just need to:
1. Switch from magenta to white backgrounds
2. Output to `data/sprite-staging/` instead of directly to production
3. Generate 2-3 candidates instead of 1

The gates and review queue are new additions that wrap around the existing generation.
