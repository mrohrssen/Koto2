# Gate 2: Subagent-Based Vision Judging

**Date:** 2026-03-01
**Status:** Approved

## Problem

Gate 2 (`scripts/sprite-gate2.mjs`) uses the Gemini API for vision-based sprite quality judging. Per project rules, we should use free Claude Code subagents for AI tasks instead of paid external APIs.

## Design: Score Import Mode

Add a `--scores <file>` flag to `sprite-gate2.mjs`. When provided, the script reads pre-computed scores from a JSON file instead of calling Gemini. All other logic (manifest matching, pass/fail determination, output formatting) stays the same.

### Score File Format

```json
[
  {
    "file": "dash.png",
    "concept": 4,
    "style": 5,
    "readability": 4,
    "reasoning": "Clear depiction of running motion..."
  }
]
```

### Subagent Workflow

1. Claude Code dispatches parallel Agent subagents in batches of ~10
2. Each subagent reads reference images from `data/quality-refs/<type>/` and candidate images using the Read tool (which has multimodal vision)
3. Subagent evaluates using the same prompt from `buildJudgePrompt()`
4. Subagent returns JSON scores for its batch
5. Scores are collected into a single JSON file
6. `sprite-gate2.mjs --scores scores.json` produces the final gate2 results

### Script Changes

- **New flag:** `--scores <path>` — path to pre-computed scores JSON
- **Behavior:** When `--scores` is provided, skip Gemini initialization and API calls. Instead, match score entries to candidate files and produce the same output format.
- **Gemini code stays** as a fallback for non-Claude-Code environments.

### Skill Update

Update `.claude/skills/sprite-quality-pipeline.md` Gate 2 step to document the subagent approach as the primary method.

## Scope

- `scripts/sprite-gate2.mjs` — add `--scores` flag
- `.claude/skills/sprite-quality-pipeline.md` — update Gate 2 instructions
- No changes to `sprite-gate2-lib.mjs` (pure functions stay the same)
