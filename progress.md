Original prompt: PLEASE IMPLEMENT THIS PLAN:
## Vocab-Ready Existing Narration Only (No New Narration)

### Summary
Restore the old vocab/grammar adaptation behavior, but only as a post-process on text that already exists in the current game flow.  
No new narration events, no new narrator lines, no extra dialogue injections.

Notes:
- Worktree created: /Users/michia/Documents/jrpg/.worktrees/codex-vocab-ready-narration
- Goal: adapt existing narration text only; skip Quiz Master's actual question text.
- Guardrails: no new narration sources/triggers, no speaker-role additions.

TODO:
- Fix server vocab repair integration + event-key normalization.
- Add per-user narration vocabulary helper from vocab-manager cache states.
- Add /api/game/rewrite-narration endpoint (adapt existing text only).
- Add frontend rewrite API helper + narration-box central adaptation with timeout fallback.
- Skip rewrite for quiz question display.
- Run syntax + targeted tests + required e2e wrapper runs.
