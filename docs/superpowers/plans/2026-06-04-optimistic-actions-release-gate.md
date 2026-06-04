# Optimistic Actions Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Phase 4 Task 4.1 from the optimistic actions roadmap: verify the completed and de-scoped optimistic-action rollout, record final evidence, and leave the release gate ready for the next shipping decision.

**Architecture:** This phase does not add new optimistic behavior. It validates that the shipped optimistic contracts still pass the full automated suite and focused optimistic-action gate, keeps browser/manual playtesting approval-gated per repo instructions, and updates the original roadmap with evidence rather than changing game runtime code.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, `node:test`, npm scripts, Superpowers subagent review.

---

## Source Roadmap

Source roadmap: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`, Phase 4 Task 4.1.

The roadmap currently states:

- Phase 1 is complete.
- Phase 2 is complete through Task 2.5.
- Phase 3 is de-scoped by product decision.
- Phase 4 is blocked until release-gate work is explicitly requested.

The explicit user request on 2026-06-04 unblocks Phase 4 execution.

## File Structure

- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md` - claim Task 4.1, then record final release-gate evidence.
- Create: `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md` - this implementation plan and execution ledger.
- Modify only if browser playtesting discovers new interaction patterns: `docs/playtest-guide.md`.

Runtime source files must not be modified in this phase. If automated verification exposes a regression, stop, mark Task 4.1 blocked, and create a separate Phase 1 blocker/follow-up plan before any runtime-code fix.

## Task 1: Claim Phase 4 In The Roadmap

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md`

- [x] **Step 1: Set Task 4.1 to in progress**

In the roadmap, set:

```markdown
Status: in_progress
Owner: Codex
Started: 2026-06-04 23:03 JST
Completed: -
Commit: -
Evidence: Automated release-gate verification in progress; browser/manual playtest requires explicit approval before launch.
```

- [x] **Step 2: Add a Progress Log row**

Add:

```markdown
| 2026-06-04 | Codex | Task 4.1 | Started full optimistic-action release gate in `.worktrees/optimistic-actions-release-gate`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md`. |
```

- [x] **Step 3: Mark the phase in progress**

In the Overall Status table, set Phase 4 to:

```markdown
| Phase 4: Release Gate And Monitoring | in_progress | Automated gates running; browser/manual playtest remains approval-gated. |
```

- [x] **Step 4: Verify the roadmap claim diff**

Run:

```bash
/usr/bin/git status --short docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md
/usr/bin/git diff -- docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md
```

Expected: status shows the new release-gate plan file as untracked before staging, and diff shows the roadmap Task 4.1 claim, progress-log row, and phase status update. After staging, use `/usr/bin/git diff --cached -- docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md` to inspect the new plan content.

## Task 2: Run Automated Release Gates

**Files:**
- No source files should be modified.
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md` with command evidence.

- [x] **Step 1: Run the full automated gate**

Run:

```bash
npm test
```

Expected: PASS. If this fails, do not mark Task 4.1 complete. Add a Phase 1 blocker task to the roadmap with the failing command, failure summary, and suspected owner area.

- [x] **Step 2: Run the focused optimistic-action gate**

Run:

```bash
npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js
```

Expected: PASS. If this fails, do not mark Task 4.1 complete. Add a Phase 1 blocker task to the roadmap with the failing command, failure summary, and suspected owner area.

- [x] **Step 3: Record automated evidence**

In this plan, append an Execution Evidence section with:

```markdown
## Execution Evidence

- `npm test` PASS on 2026-06-04.
- `npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js` PASS on 2026-06-04.
```

## Execution Evidence

- `npm test` PASS on 2026-06-04 23:09 JST.
- `npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js` PASS on 2026-06-04 23:14 JST.
- Browser/manual playtest was not run in this session because repo instructions require explicit approval before browser launch and approval was not available during execution.

## Task 3: Browser And Manual Playtest Decision

**Files:**
- Modify only if approved playtesting discovers new instructions: `docs/playtest-guide.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md`
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`

- [x] **Step 1: Ask before launching browser automation**

Ask the user whether they approve opening a browser/playtest session for the Phase 4 manual gate.

Required wording:

```text
Do you approve launching a browser/playtest session for the Phase 4 optimistic-action manual gate?
```

- [ ] **Step 2: If approved, read the playtest guide**

Not run in this execution because browser/playtest approval was not available.

Run:

```bash
sed -n '1,260p' docs/playtest-guide.md
```

Then run the local dev server with the repo-preferred command:

```bash
npm run dev
```

Verify the Vite URL before sharing or opening:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 3: If approved, verify the manual checklist**

Manual checklist:

- Normal room proceed.
- Completed-room proceed edge.
- Skill Master choice.
- Shrine choice.
- Friendly NPC item choice.
- NPC battle skill reward.
- PvP team save and PvP team selection.
- Campfire cook/feed/skip.
- Word Discovery review/progress and completion.
- Speed Review room completion.
- Whack-a-Mole complete/skip.
- Kanji Kombat intro known/unknown choice and completion keep-going/stop choice.

If new browser instructions are discovered, update `docs/playtest-guide.md`. If no new instructions are discovered, do not edit it.

- [x] **Step 4: If not approved, record the skipped manual gate explicitly**

Record:

```markdown
Browser/manual playtest was not run in this session because repo instructions require explicit approval before browser launch and approval was not available during execution.
```

Do not claim visual/manual verification passed unless it was actually run.

## Task 4: Final Roadmap Update And Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md`
- Modify only if changed: `docs/playtest-guide.md`

- [x] **Step 1: Set Task 4.1 final status**

If both automated gates passed, set Task 4.1 in the roadmap to:

```markdown
Status: complete
Owner: Codex
Started: 2026-06-04 23:03 JST
Completed: the current JST timestamp from `date '+%Y-%m-%d %H:%M %Z'`
Commit: the commit SHA printed by `/usr/bin/git rev-parse --short HEAD` after the final commit
Evidence: `npm test` PASS; focused optimistic-action gate PASS; browser/manual playtest approved and PASS, or browser/manual playtest not run because approval was not available.
```

If either automated gate failed, set Task 4.1 to `blocked` instead and create a Phase 1 blocker task before committing.

- [x] **Step 2: Add a Progress Log completion row**

Add either the passing completion row:

```markdown
| 2026-06-04 | Codex | Task 4.1 | Completed automated optimistic-action release gate with `npm test` and focused optimistic-action unit gate passing; browser/manual gate status recorded in Task 4.1 evidence. |
```

Or, if blocked:

```markdown
| 2026-06-04 | Codex | Task 4.1 | Blocked release gate because the failing verification command did not pass; Phase 1 blocker task added for follow-up with the command name and failure summary. |
```

- [x] **Step 3: Update Overall Status**

If complete, set:

```markdown
| Phase 4: Release Gate And Monitoring | complete | Automated release gate passed; manual/browser gate status is recorded in Task 4.1 evidence. |
```

If blocked, set:

```markdown
| Phase 4: Release Gate And Monitoring | blocked | Release gate failed; see Task 4.1 evidence and new Phase 1 blocker task. |
```

- [x] **Step 4: Verify final diff**

Run:

```bash
/usr/bin/git status --short docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md
/usr/bin/git diff -- docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md docs/playtest-guide.md
```

Expected: status shows the new release-gate plan file until it is staged, diff shows final roadmap evidence, and playtest-guide changes appear only if new browser instructions were discovered. After staging, use `/usr/bin/git diff --cached -- docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md` to inspect the new plan content.

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git add docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md
/usr/bin/git add docs/playtest-guide.md
/usr/bin/git commit -m "docs: complete optimistic actions release gate"
```

If `docs/playtest-guide.md` was not changed, omit it from `git add`.

## Review Checklist

- [x] The roadmap source phase was identified as Phase 4 Task 4.1.
- [x] Runtime source files were not modified in this phase; any automated verification failure would block Task 4.1 and require a separate Phase 1 blocker/follow-up plan.
- [x] `npm test` evidence was recorded exactly.
- [x] Focused optimistic-action gate evidence was recorded exactly.
- [x] Browser/manual playtest status was recorded honestly.
- [x] Original roadmap was updated with final status, evidence, and progress log.
