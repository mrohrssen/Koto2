# Tiered Optimistic Actions Stability Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the optimistic-action rollout without destabilizing Koto by closing shipped partials first, then migrating remaining actions in risk order.

**Architecture:** The server remains authoritative for every mutation. Client optimism is allowed only through one of the approved contracts: predictive combat with shared deterministic verification, server-prepared room reveal buffers, optimistic commit with action-ledger idempotency, or confirmed save. Each phase is gated by tests, manual evidence where UI changes are visible, and an update to this tracking plan.

**Tech Stack:** Node.js, Express, ES modules, browser JS modules, Socket.IO PvP, `node:test`, existing Koto game state/services.

---

## Current Status - 2026-06-04

Phase 1 implementation has landed on `origin/dev` through `2483eb824ae4e097dc112bf9324f1357f15a4a25`.
Phase 2 implementation is complete through Task 2.5.
Phase 3 high-impact hub/meta optimistic actions are skipped for now by product decision: crystals, chest rewards, crest equip/unequip, and fusion remain server-authoritative.

Completed Phase 1 commits:

- `cd612d76` and `06c1d7b0`: PvP matchmaking selects teams from confirmed server-saved `gm.meta.pvpTeams`, ignores browser-held team snapshots, deep-clones selected teams, and rejects malformed/null selection payloads.
- `42b6538b`: post-combat shop reload recovery and selection use the same persisted active `run.postCombatShop.items` source when present; the random post-victory shop remains disabled for MVP.
- `4b1fb759`: cursor-era PvE defend prediction uses the full shared deterministic PvE resolver while cursor attacks continue using the cursor resolver.
- `0bfffe31` and `166d30e5`: remaining completed-room proceed edges use the reveal-buffer proceed envelope; Whack-a-Mole completion avoids duplicate room-transition playback.
- `93c77712` and `2483eb82`: Phase 1 finish plan added and updated with the post-implementation status.

Verification passed before push:

- Focused optimistic-action gate: `npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/pvp/socket-handler-team-selection.test.js tests/unit/game/post-combat-shop-service.test.js`
- Touched-area gate: `npm run test:unit -- tests/unit/routes/pvp.test.js tests/unit/pvp/match-manager.test.js tests/unit/ui/pvp-team-save-feedback.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/post-combat-shop.test.js tests/unit/game/combat-action-state.test.js`
- Full merge gate: `npm test`

Visual verification:

- User played the game and confirmed the Phase 1 UI was visually verified on 2026-06-04.

## Executor Protocol

Future agents must use this plan as the source of truth for progress.

- Pick exactly one task from the first non-complete phase.
- Do not work on later phases until every blocker in the current phase is complete.
- Before editing code, create an isolated worktree from `/Users/michiarohrssen/Documents/Claude/koto-dev` on `dev`.
- Before changing a task, update this plan in the worktree: set that task to `in_progress` and add a Progress Log row.
- Write or update failing tests first, run them, then implement the minimal code to pass.
- After implementation, run the task's verification commands exactly.
- Update this plan again: mark completed steps, set task status to `complete`, add commit SHA, test commands, and manual screenshot/playtest evidence when applicable.
- Commit the code and the plan update together.
- Stop after one task unless the user explicitly asks for another task in the same session.

Worktree setup for every task uses the `Branch:` and `Worktree:` values listed under that task:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../WORKTREE_FROM_TASK -b BRANCH_FROM_TASK
cd ../WORKTREE_FROM_TASK
```

Plan update format for each task:

```markdown
Status: in_progress
Owner: agent name and thread title
Started: YYYY-MM-DD HH:MM TZ
Completed: -
Commit: -
Evidence: -
```

Completion update format:

```markdown
Status: complete
Owner: agent name and thread title
Started: YYYY-MM-DD HH:MM TZ
Completed: YYYY-MM-DD HH:MM TZ
Commit: final commit SHA
Evidence: `npm run test:unit -- ...` PASS; `npm test` PASS; screenshot/playtest notes if visual.
```

## Progress Log

| Date | Agent | Task | Update |
|---|---|---|---|
| 2026-06-03 | Codex | Plan | Created stability roadmap from the tiered optimistic-action review. No source code changed. |
| 2026-06-04 | Codex | Phase 1 | Phase 1 stability blockers landed on `origin/dev` through `2483eb82`. Focused optimistic-action gate, touched-area gate, and `npm test` passed before push. User played the game and confirmed visual verification. |
| 2026-06-04 | Codex | Task 2.1 | Started campfire cook/feed/skip optimistic commit implementation in `koto-wt-optimistic-campfire-actions`. |
| 2026-06-04 | Codex | Task 2.1 | Completed campfire cook/feed/skip optimistic commit with route idempotency, client correction handling, focused gate, `npm test`, and browser harness visual verification. |
| 2026-06-04 | Codex | Task 2.2 | Started Word Discovery progress/completion optimistic commit implementation in `.worktrees/optimistic-word-discovery-actions`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-word-discovery-actions.md`. |
| 2026-06-04 | Codex | Task 2.2 | Completed Word Discovery review/progress and completion optimistic commit with route idempotency, client correction handling, focused unit gate, syntax check, and `npm test`. |
| 2026-06-04 | Codex | Task 2.3 | Started Speed Review room completion optimistic commit implementation in `.worktrees/optimistic-speed-review-room`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-speed-review-room.md`. |
| 2026-06-04 | Codex | Task 2.3 | Completed Speed Review room completion optimistic commit with route idempotency, empty-snapshot action-id coverage, client correction handling, focused unit gate, syntax check, and `npm test`. |
| 2026-06-04 | Codex | Task 2.4 | Started Whack-a-Mole complete/skip optimistic commit implementation in `.worktrees/optimistic-whack-a-mole-actions`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-whack-a-mole-actions.md`. |
| 2026-06-04 | Codex | Task 2.4 | Completed Whack-a-Mole complete/skip optimistic commit with route idempotency, client correction handling, focused unit gate, syntax check, and `npm test`. Browser prompt and decline path were partially verified; completion-path browser verification was skipped at user request. |
| 2026-06-04 | Codex | Task 2.5 | Started Kanji Kombat intro/completion optimistic commit implementation in `.worktrees/optimistic-kanji-kombat-choices`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-kanji-kombat-choices.md`. |
| 2026-06-04 | Codex | Task 2.5 | Completed Kanji Kombat intro/completion optimistic commit with route idempotency, client correction handling, stale response regression coverage, focused Kanji Kombat gates, syntax check, and `npm test`. |
| 2026-06-04 | Codex | Phase 3 | Skipped high-impact hub/meta optimistic actions by product decision. Daily crystals, chest rewards, crest equip/unequip, and fusion stay server-authoritative for now. |
| 2026-06-04 | Codex | Task 4.1 | Started full optimistic-action release gate in `.worktrees/optimistic-actions-release-gate`; detailed plan saved to `docs/superpowers/plans/2026-06-04-optimistic-actions-release-gate.md`. |
| 2026-06-04 | Codex | Task 4.1 | Completed automated optimistic-action release gate with `npm test` and focused optimistic-action unit gate passing; browser/manual gate was not run because approval was not available during execution. |

## Overall Status

| Phase | Status | Gate To Advance |
|---|---|---|
| Phase 1: Shipped Stability Blockers | complete | Automated Phase 1 gate passed; user playtest visually verified the UI. |
| Phase 2: Medium-Risk Room And Minigame Actions | complete | Tasks 2.1 through 2.5 complete with automated verification. |
| Phase 3: High-Impact Hub And Meta Actions | de-scoped | Product decision: leave crystals, chest rewards, crest equip/unequip, and fusion server-authoritative for now. |
| Phase 4: Release Gate And Monitoring | complete | Automated release gate passed; browser/manual gate status is recorded in Task 4.1 evidence. |

Status values: `pending`, `in_progress`, `blocked`, `complete`, `de-scoped`.

---

## Phase 1: Shipped Stability Blockers

Do this phase before adding optimism to any new game surface.

### Task 1.1: Enforce Server-Saved PvP Teams In Matchmaking

Status: complete
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: `cd612d76`, `06c1d7b0`
Evidence: PvP socket selection helper and match-manager tests passed in the Phase 1 finish gate; malformed/null payload coverage added. Focused optimistic-action gate, touched-area gate, and `npm test` passed before push through `2483eb82`.
Branch: `fix/optimistic-pvp-saved-teams`
Worktree: `koto-wt-optimistic-pvp-saved-teams`

**Why:** PvP team save now uses confirmed-save copy, but casual matchmaking still accepts browser-sent `teamData`. This is a data-integrity and anti-cheat blocker.

**Files:**

- Modify: `src/pvp/socket-handler.js`
- Modify: `src/pvp/match-manager.js` only if the team selection API needs a safer signature or clone behavior
- Modify: `public/js/pvp-socket.js`
- Modify: `public/js/ui/pvp-lobby.js`
- Test: `tests/unit/pvp/match-manager.test.js`
- Test: create or modify `tests/unit/pvp/socket-handler.test.js` if a socket-handler helper is exported
- Test: `tests/unit/routes/pvp.test.js`

- [x] **Step 1: Claim this task in this plan**

Set this task status to `in_progress` and add a Progress Log row.

- [x] **Step 2: Write failing tests**

Add coverage proving:

- `pvp:select-team` selects by `slotIndex`, not by browser-provided `teamData`.
- A tampered payload such as `{ teamData: { creatureParty: { active: [{ id: "fake" }] } } }` is ignored.
- Invalid, empty, or unsaved `slotIndex` emits `pvp:error` and does not set `player.team`.
- The selected team is cloned before entering the match, so later `gm.meta.pvpTeams[slotIndex]` mutation does not mutate the active match.

Preferred helper shape if direct Socket.IO tests are too heavy:

```js
export function resolveSavedPvpTeamForSocketSelection(gm, slotIndex) {
  const index = Number.isInteger(slotIndex) ? slotIndex : -1;
  const team = gm?.meta?.pvpTeams?.[index] || null;
  return team ? structuredClone(team) : null;
}
```

- [x] **Step 3: Run the failing tests**

Run:

```bash
npm run test:unit -- tests/unit/pvp/match-manager.test.js tests/unit/routes/pvp.test.js
```

If `tests/unit/pvp/socket-handler.test.js` is added, include it in the same command.

Expected: FAIL because current socket code still passes `teamData` directly.

- [x] **Step 4: Implement server-owned selection**

Required behavior:

- `public/js/pvp-socket.js` emits only `{ slotIndex }` for `pvp:select-team`.
- `public/js/ui/pvp-lobby.js` passes only `selectedSlot` into `pvpSocket.selectTeam(...)`.
- `src/pvp/socket-handler.js` loads the user's `GameManager` with `getManager(socket.userId)`, resolves `gm.meta.pvpTeams[slotIndex]`, and passes that saved snapshot to `mm.selectTeam(...)`.
- Browser-sent `teamData` must not be read by `socket-handler.js`.
- `mm.selectTeam(...)` must store a deep clone.

- [x] **Step 5: Verify**

Run:

```bash
npm run test:unit -- tests/unit/pvp/match-manager.test.js tests/unit/routes/pvp.test.js
node --check src/pvp/socket-handler.js && node --check src/pvp/match-manager.js && node --check public/js/pvp-socket.js && node --check public/js/ui/pvp-lobby.js
```

Then run the broader gate:

```bash
npm test
```

- [x] **Step 6: Update this plan and commit**

Mark this task `complete`, add evidence and commit SHA, then commit:

```bash
/usr/bin/git add docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md src/pvp/socket-handler.js src/pvp/match-manager.js public/js/pvp-socket.js public/js/ui/pvp-lobby.js tests/unit/pvp/match-manager.test.js tests/unit/routes/pvp.test.js tests/unit/pvp/socket-handler.test.js
/usr/bin/git commit -m "fix: use saved server pvp teams for matchmaking"
```

If `tests/unit/pvp/socket-handler.test.js` was not created, omit it from `git add`.

### Task 1.2: Resolve Post-Combat Shop Optimism

Status: complete
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: `42b6538b`
Evidence: Path B source-alignment subset completed for active persisted shops. `tests/unit/game/post-combat-shop-service.test.js`, route coverage, focused optimistic-action gate, touched-area gate, and `npm test` passed before push through `2483eb82`. Random post-victory shop remains disabled for MVP.
Branch: `fix/post-combat-shop-optimism`
Worktree: `koto-wt-post-combat-shop-optimism`

**Why:** Post-combat shop selection is optimistically wired, but the live roll path currently returns `null` and `selectShopItem()` reads `run._pendingShopItems`, while reload recovery reads `run.postCombatShop.items`. This is a mismatch.

**Decision required:** Choose exactly one path and document it in this task evidence.

- Path A, recommended if shop remains disabled: de-scope post-combat shop optimism, remove optimistic UI/route expectations, and keep all shop routes conservative.
- Path B, only if re-enabling shop now: align `rollPostCombatShop()` and `selectShopItem()` on `run.postCombatShop.items`, add recovery tests, and verify the live flow visually.

**Files:**

- Modify: `src/game/services/combat-cycle-service.js`
- Modify: `src/routes/game/combat.js`
- Modify: `public/game.js`
- Modify: `public/js/api.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`
- Test: create or modify `tests/unit/game/post-combat-shop-service.test.js`
- Test: `tests/unit/ui/post-combat-shop.test.js`

- [x] **Step 1: Claim this task in this plan**

Set this task status to `in_progress` and write whether the agent is taking Path A or Path B.

- [x] **Step 2: Write failing tests for the chosen path**

Path A tests must prove:

- `rollPostCombatShop()` remains disabled and returns `null`.
- `creature-shop-select` without an active `run.postCombatShop` returns an error.
- UI source no longer hides the shop optimistically for disabled shop paths.
- The design spec and this roadmap mark post-combat shop optimism `de-scoped` or `blocked`, not complete.

Path B tests must prove:

- `rollPostCombatShop()` creates `run.postCombatShop = { active: true, items: [...] }`.
- `selectShopItem()` reads `run.postCombatShop.items`, applies exactly one item, clears `run.postCombatShop`, and records idempotent duplicate `actionId` responses without double-applying.
- Reload recovery from phase `post_combat_shop` displays the existing saved items.
- A corrected/failed selection restores or keeps a retryable shop only when `state.run.postCombatShop.active === true`.

- [x] **Step 3: Run the failing tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/post-combat-shop.test.js
```

If `tests/unit/game/post-combat-shop-service.test.js` is added, include it.

- [x] **Step 4: Implement the chosen path**

Path A implementation constraints:

- Do not leave a UI that appears to grant an item before the server confirms if the shop cannot be reached in live play.
- Remove or relax tests that imply post-combat shop optimism is complete.
- Update `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md` to say post-combat shop is de-scoped until re-enabled.

Path B implementation constraints:

- Never reveal a random item before the server created `run.postCombatShop.items`.
- Persist the offered items before the client can choose one.
- Use the optimistic action ledger for duplicate selection.
- Preserve legacy no-`actionId` response shape.

- [x] **Step 5: Verify**

Run:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/post-combat-shop.test.js
node --check src/game/services/combat-cycle-service.js && node --check src/routes/game/combat.js && node --check public/game.js && node --check public/js/api.js
npm test
```

If Path B changes visible UI, request browser/playtest approval before launching a browser and capture screenshots per repo rules.

- [x] **Step 6: Update this plan and commit**

Mark this task `complete` or `de-scoped`, add evidence and commit SHA, then commit.

### Task 1.3: Convert Or Justify Bare Room Proceed Paths

Status: complete
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: `0bfffe31`, `166d30e5`
Evidence: Completed-room proceed edges use `proceedWithRevealBuffer(...)`, optimistic proceed still starts verification before transition, and Whack-a-Mole no longer double-plays the room transition. Focused optimistic-action gate, touched-area gate, and `npm test` passed before push through `2483eb82`. User playtest visually verified the UI on 2026-06-04.
Branch: `fix/reveal-buffer-proceed-edges`
Worktree: `koto-wt-reveal-buffer-proceed-edges`

**Why:** The main reveal-buffer proceed path is protected by `{ actionId, fromRoom, actionSeq }`, but several room-specific flows still call bare `apiProceed()`.

**Known call sites to audit first:**

- `public/game.js`, auto-proceed fallback around `apiProceed()`
- `public/js/ui/exploration.js`, `renderQuiz()`
- `public/js/ui/exploration.js`, Word Discovery completed-room proceed
- `public/js/ui/exploration.js`, Whack-a-Mole already-completed auto-proceed
- `public/js/ui/whack-a-mole.js`, completion/skip dependencies that call injected `apiProceed`

**Files:**

- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/whack-a-mole.js` if injected proceed behavior changes
- Test: `tests/unit/ui/auto-proceed-room-transition.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`
- Test: `tests/unit/ui/exploration-whack-a-mole.test.js`
- Test: `tests/unit/ui/room-reveal-buffer-client.test.js`

- [x] **Step 1: Claim this task in this plan**

Set status to `in_progress`.

- [x] **Step 2: Add source-level and behavior tests**

Tests must prove:

- Completed-room auto-proceed paths use the same reveal-buffer helper as the main proceed path when a next room is buffered.
- Optimistic calls send `{ actionId, fromRoom, actionSeq }`.
- Corrections apply `correctPendingRunAction(...)`.
- Legacy bare `apiProceed()` remains only where no buffered next room exists or where the plan explicitly documents why optimism is unsafe.

- [x] **Step 3: Run failing tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/room-reveal-buffer-client.test.js
```

- [x] **Step 4: Implement a shared client helper**

Preferred shape:

```js
async function proceedWithRevealBuffer({ state, apiProceed, playRoomTransition, updateGameState, updateUI, actions }) {
  // Create a pending run action only when getNextRoom(state) exists.
  // Start verification before travel.
  // Commit or correct only after travel finishes.
}
```

Keep the behavior from the 2026-06-03 room-travel fix: do not call `updateGameState(pending.state)` before `playRoomTransition(...)`.

- [x] **Step 5: Verify**

Run:

```bash
npm run test:unit -- tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/room-reveal-buffer-client.test.js
node --check public/game.js && node --check public/js/ui/exploration.js && node --check public/js/ui/whack-a-mole.js
npm test
```

Manual browser verification was covered by user playtest on 2026-06-04.

- [x] **Step 6: Update this plan and commit**

Mark complete with test and screenshot/playtest evidence.

### Task 1.4: Finish Or De-Scope Combat Partial Optimism

Status: complete
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: `4b1fb759`
Evidence: Cursor-era PvE defend prediction now uses the shared deterministic full-turn resolver; cursor attacks still use the cursor resolver. Optimistic combat-turn tests, combat action-state tests, combat hardening tests, focused optimistic-action gate, touched-area gate, and `npm test` passed before push through `2483eb82`. Visible pending combat-end shell remains deferred outside this Phase 1 blocker.
Branch: `fix/combat-optimism-partials`
Worktree: `koto-wt-combat-optimism-partials`

**Why:** Combat prediction is the highest-risk optimistic surface. The current code supports safe enemy final-hit prediction, but cursor-era defend prediction and visible pending combat-end shell are still partial.

**Decision required:** Choose one:

- Path A: implement visible pending combat-end shell and cursor-era defend prediction with blockers.
- Path B: explicitly de-scope cursor-era defend prediction and pending shell, keeping defend server-confirmed and only final-hit visuals optimistic.

**Files:**

- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/optimistic-combat-turn.js`
- Modify: `src/shared/combat/pve-prediction-contract.js` only if blockers change
- Modify: `src/game/services/combat-cycle-service.js` only if server verification rules change
- Test: `tests/unit/ui/combat-network-hardening.test.js`
- Test: `tests/unit/ui/optimistic-combat-turn.test.js`
- Test: `tests/unit/combat/pve-prediction-contract.test.js`
- Test: `tests/unit/game/combat-action-state.test.js`

- [x] **Step 1: Claim this task in this plan**

Set status to `in_progress` and write Path A or Path B in Evidence.

- [x] **Step 2: Write failing tests**

Path A tests must prove:

- A predicted terminal turn renders visible pending copy or a visible shell before accepted verification.
- XP, rewards, room completion, move-learn prompts, post-combat shop, and permanent progression do not appear until accepted server state.
- Defend prediction refuses unsafe action-cursor states, KO swaps/removals, befriend-eligible terminal fights, next-wave events, and any server-owned feedback.

Path B tests must prove:

- Cursor-era defend returns `null` from the optimistic builder and uses server-confirmed flow.
- `pendingCombatEnd` is not advertised as complete in the design spec.
- Final-hit prediction remains allowed only for tested safe enemy KO cases.

- [x] **Step 3: Run failing tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/combat/pve-prediction-contract.test.js tests/unit/game/combat-action-state.test.js
```

- [x] **Step 4: Implement the chosen path**

Required for both paths:

- Do not loosen `hasUnsafeSharedPveOptimisticPrediction(...)` without adding blocker tests.
- Do not expose `choice.correct` or any hidden answer truth to client predictions unless the server intentionally included it in visible state.
- Do not make PvP combat prediction changes in this task.

- [x] **Step 5: Verify**

Run:

```bash
npm run test:unit -- tests/unit/ui/combat-network-hardening.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/combat/pve-prediction-contract.test.js tests/unit/game/combat-action-state.test.js
node --check public/js/ui/combat-loop.js && node --check public/js/ui/optimistic-combat-turn.js && node --check src/shared/combat/pve-prediction-contract.js && node --check src/game/services/combat-cycle-service.js
npm test
```

Manual browser verification was covered by user playtest on 2026-06-04.

- [x] **Step 6: Update this plan and commit**

Mark complete or de-scoped with evidence.

### Task 1.5: Baseline Regression Gate For Existing Optimism

Status: complete
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: `2483eb82`
Evidence: Focused optimistic-action gate PASS; touched-area gate PASS; `npm test` PASS. Phase 1 finish plan was updated with the evidence. User playtest visually verified the UI on 2026-06-04.
Branch: `fix/optimistic-actions-baseline-gate`
Worktree: `koto-wt-optimistic-actions-baseline-gate`

**Why:** Before adding more optimistic actions, verify the shipped optimistic foundation still passes as a group.

**Files:**

- Modify: this plan only, unless tests expose a regression

- [x] **Step 1: Claim this task in this plan**

Set status to `in_progress`.

- [x] **Step 2: Run focused optimistic-action tests**

Run:

```bash
npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js
```

- [x] **Step 3: Run broader touched-area tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/pvp.test.js tests/unit/ui/pvp-team-save-feedback.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/post-combat-shop.test.js
```

- [x] **Step 4: Run integration gate**

Run:

```bash
npm test
```

- [x] **Step 5: Update this plan and commit**

If all commands pass, mark Phase 1 complete. If any command fails, add a Progress Log row with the failing command and create a new Phase 1 blocker task before any Phase 2 work.

---

## Phase 2: Medium-Risk Room And Minigame Actions

Start this phase only after every Phase 1 task is complete.

General contract for every Phase 2 action:

- Add optional `actionId` to the API wrapper.
- Server route keeps legacy response shape without `actionId`.
- Server route returns `{ status: "accepted", actionId, actionType, state }` for valid optimistic requests.
- Server route returns `{ status: "corrected", actionId, authoritativeState, reason }` for invalid optimistic requests.
- Duplicate `actionId` does not re-run the mutation.
- Client UI advances silently on success.
- Client failure copy uses the approved non-blaming pattern.
- The task must include source or behavior tests for duplicate taps and stale/corrected responses.

### Task 2.1: Campfire Cook, Feed, And Skip Optimistic Commit

Status: complete
Owner: Codex
Started: 2026-06-04 16:21 JST
Completed: 2026-06-04 17:20 JST
Commit: `0f645f2f`
Evidence: `npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/campfire.test.js` PASS; `node --check public/js/ui/campfire.js && node --check public/js/api.js && node --check src/routes/game/cooking.js` PASS; `npm test` PASS; browser visual harness PASS for entry prompt, optimistic cook target picker, optimistic feed completion, corrected skip retry copy, and console error/warn health.
Branch: `feature/optimistic-campfire-actions`
Worktree: `koto-wt-optimistic-campfire-actions`

**Files:**

- Modify: `src/routes/game/run.js` or the route file that owns campfire endpoints
- Modify: `public/js/api.js`
- Modify: `public/js/ui/campfire.js`
- Modify: `public/game.js` if `completeCampfireAndProceed` changes
- Test: `tests/unit/ui/campfire.test.js` if present, otherwise create it
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`

Required actions:

- Cook dish.
- Feed dish to target creature.
- Skip campfire.

Approved failure copy:

- `Campfire choice did not save. Please try again.`

Required verification:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/campfire.test.js
node --check public/js/ui/campfire.js && node --check public/js/api.js
npm test
```

Manual browser verification is required because campfire UI changes are visible.

### Task 2.2: Word Discovery Progress And Completion Optimistic Commit

Status: complete
Owner: Codex
Started: 2026-06-04 17:52 JST
Completed: 2026-06-04 18:07 JST
Commit: `5a5580b1e848bfad2c3cea74481cbfaf75d34fb9`
Evidence: `node --experimental-test-module-mocks --test tests/unit/known-words-review.test.js tests/unit/routes/optimistic-run-routes.test.js` PASS; `node --test tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js` PASS; `npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js tests/unit/known-words-review.test.js` PASS; `node --check public/js/ui/exploration.js && node --check public/js/api.js && node --check public/game.js && node --check src/routes/game/run.js && node --check src/routes/game/known-words.js` PASS; `npm test` PASS. No browser session was launched because this task changed route/API/action commit behavior and source-covered UI retry copy, not CSS, animation, or rendering.
Branch: `feature/optimistic-word-discovery-actions`
Worktree: `.worktrees/optimistic-word-discovery-actions`

**Files:**

- Modify: `src/routes/game/run.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/exploration.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`
- Test: create or modify `tests/unit/ui/word-discovery-room.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`

Required actions:

- Word review/progress commit.
- Word Discovery completion.
- Completed-room proceed must use reveal-buffer proceed from Task 1.3.

Approved failure copy:

- `Word discovery did not save. Please try again.`

Required verification:

```bash
npm run test:unit -- tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/word-discovery-room.test.js
node --check public/js/ui/exploration.js && node --check public/js/api.js
npm test
```

### Task 2.3: Speed Review Room Completion Optimistic Commit

Status: complete
Owner: Codex
Started: 2026-06-04 19:58 JST
Completed: 2026-06-04 20:06 JST
Commit: `ff027139`
Evidence: `node --experimental-test-module-mocks --test tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `node --experimental-test-module-mocks --test tests/unit/ui/speed-review.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `npm run test:unit -- tests/unit/game/speed-review-room.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/speed-review.test.js` PASS; `node --check public/js/ui/speed-review.js && node --check public/js/ui/exploration.js && node --check public/js/api.js && node --check src/routes/game/run.js` PASS; `npm test` PASS. No browser session was launched because this task changed route/API/action commit behavior and source-covered retry copy, not CSS, animation, or rendering.
Branch: `feature/optimistic-speed-review-room`
Worktree: `.worktrees/optimistic-speed-review-room`

**Files:**

- Modify: `src/routes/game/run.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/speed-review.js`
- Modify: `public/js/ui/exploration.js`
- Test: `tests/unit/game/speed-review-room.test.js`
- Test: `tests/unit/ui/speed-review.test.js` if present, otherwise create it
- Test: `tests/unit/routes/optimistic-run-routes.test.js`

Special rule:

- Do not mark the room complete until all in-flight card commits are confirmed or retried successfully.

Approved failure copy:

- `Speed review did not save. Please try again.`

Required verification:

```bash
npm run test:unit -- tests/unit/game/speed-review-room.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/speed-review.test.js
node --check public/js/ui/speed-review.js && node --check public/js/ui/exploration.js && node --check public/js/api.js
npm test
```

### Task 2.4: Whack-A-Mole Complete And Skip Optimistic Commit

Status: complete
Owner: Codex
Started: 2026-06-04 20:41 JST
Completed: 2026-06-04 21:56 JST
Commit: `463d131c`
Evidence: `npm run test:unit -- tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js` PASS; `node --check public/js/ui/whack-a-mole.js && node --check public/js/ui/exploration.js && node --check public/js/api.js && node --check src/routes/game/run.js` PASS; `npm test` PASS. Final subagent code quality review found no issues. Browser prompt and decline path were partially verified with the in-app Browser; completion-path browser verification was skipped at user request on 2026-06-04.
Branch: `feature/optimistic-whack-a-mole-actions`
Worktree: `.worktrees/optimistic-whack-a-mole-actions`

**Files:**

- Modify: `src/routes/game/run.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/whack-a-mole.js`
- Modify: `public/js/ui/exploration.js`
- Test: `tests/unit/ui/whack-a-mole-client.test.js`
- Test: `tests/unit/ui/exploration-whack-a-mole.test.js`
- Test: `tests/unit/routes/optimistic-run-routes.test.js`

Required actions:

- Completion with score.
- Skip/decline.
- Already-completed auto-proceed must use Task 1.3 reveal-buffer proceed behavior.

Approved failure copy:

- `Game Master choice did not save. Please try again.`

Required verification:

```bash
npm run test:unit -- tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/routes/optimistic-run-routes.test.js
node --check public/js/ui/whack-a-mole.js && node --check public/js/ui/exploration.js && node --check public/js/api.js
npm test
```

Manual browser verification is required because the minigame UI changes are visible.

### Task 2.5: Kanji Kombat Intro And Completion Choices Optimistic Commit

Status: complete
Owner: Codex
Started: 2026-06-04 22:12 JST
Completed: 2026-06-04 22:41 JST
Commit: `536b0bf2`, `ef574178`, `d74fc560`
Evidence: Baseline `npm test` PASS before implementation. RED route/UI tests failed before implementation; GREEN route/UI tests passed after implementation. `node --experimental-test-module-mocks --test tests/unit/routes/kanji-kombat-routes.test.js` PASS; `node --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js` PASS; `node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js` PASS; `npm run test:unit -- tests/unit/routes/kanji-kombat-routes.test.js tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js` PASS; `node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js && node --check public/js/ui/kanji-kombat.js` PASS; `npm test` PASS. Final subagent code quality review found no Critical or Important issues; the Minor stale completion-response and thrown intro-response coverage gaps were patched and passed. No browser session was launched because this task changed route/API/action commit behavior and source-covered retry copy, not CSS, animation, or rendering.
Branch: `feature/optimistic-kanji-kombat-choices`
Worktree: `.worktrees/optimistic-kanji-kombat-choices`

**Files:**

- Modify: `src/routes/game/kanji-kombat.js`
- Modify: `public/js/api.js`
- Modify: `public/js/ui/kanji-kombat.js`
- Test: `tests/unit/ui/kanji-kombat-ui.test.js`
- Test: `tests/unit/routes/kanji-kombat-routes.test.js`
- Test: `tests/unit/ui/optimistic-run-integration.test.js`

Required actions:

- Intro known/unknown choice.
- Completion keep-going/stop choice.

Safety rule:

- Do not expose hidden quiz answer correctness to the client. This task is about non-answer choices only.

Approved failure copy:

- `Kanji Kombat choice did not save. Please try again.`

Required verification:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/kanji-kombat-routes.test.js
node --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/optimistic-run-integration.test.js
node --experimental-test-module-mocks --test tests/unit/game/kanji-kombat-run.test.js tests/unit/game/kanji-kombat-optimistic.test.js
node --check src/routes/game/kanji-kombat.js && node --check public/js/api.js && node --check public/js/ui/kanji-kombat.js
npm test
```

---

## Phase 3: High-Impact Hub And Meta Actions

Start this phase only after Phase 2 is complete and no new optimistic-action regressions are open.

General contract for Phase 3:

- Every action that spends, awards, reveals, equips, fuses, or mutates meta progression must use persisted action-ledger idempotency.
- Random or server-derived reveals must not show exact results before server confirmation unless the result was server-prepared.
- If an action can double-spend or double-award on retry, duplicate `actionId` tests are mandatory before implementation.

### Task 3.1: Daily Crystal Claim Idempotency Decision

Status: de-scoped
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: No implementation commit; roadmap-only de-scope.
Evidence: User product decision on 2026-06-04: leave daily crystal claim server-authoritative for now.
Branch: `feature/daily-crystal-idempotency`
Worktree: `koto-wt-daily-crystal-idempotency`

**Files:**

- Modify only if needed after audit: crystal claim route/service files
- Test: `tests/unit/game/crystal-wallet-service.test.js`
- Test: route tests for daily crystal claim

Decision:

- If current once-per-day service is already naturally idempotent and safe, document it and mark this task `de-scoped`.
- If duplicate request risk remains, add action-ledger idempotency.

Required verification:

```bash
npm run test:unit -- tests/unit/game/crystal-wallet-service.test.js
npm test
```

### Task 3.2: Chest Open With Immediate Animation And Delayed Crest Reveal

Status: de-scoped
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: No implementation commit; roadmap-only de-scope.
Evidence: User product decision on 2026-06-04: leave chest rewards server-confirmed/server-authoritative for now.
Branch: `feature/optimistic-chest-open`
Worktree: `koto-wt-optimistic-chest-open`

**Files:**

- Modify: chest route/service files found by `rg -n "chest|crest" src public tests`
- Modify: chest UI files found by the same search
- Test: create focused route tests for duplicate chest open
- Test: create focused UI tests for delayed reveal

Rules:

- The chest can animate open immediately.
- The crest identity must appear only after server confirmation.
- Duplicate `actionId` must not grant two crests.

Required verification:

```bash
rg -n "chest|crest" src public tests
npm test
```

Manual browser verification is required.

### Task 3.3: Crest Equip And Unequip Optimistic Commit

Status: de-scoped
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: No implementation commit; roadmap-only de-scope.
Evidence: User product decision on 2026-06-04: leave crest equip and unequip server-confirmed/server-authoritative for now.
Branch: `feature/optimistic-crest-equip`
Worktree: `koto-wt-optimistic-crest-equip`

**Files:**

- Modify: crest route/service/UI files found by `rg -n "crest" src public tests`
- Test: focused route tests for duplicate equip and unequip
- Test: focused UI tests for corrected state rollback

Rules:

- Server validates crest ownership.
- Server validates target creature ownership.
- Duplicate equip/unequip does not corrupt inventory or equipment state.

Required verification:

```bash
rg -n "crest" src public tests
npm test
```

### Task 3.4: Fusion Start And Tutorial Fusion Optimistic Commit

Status: de-scoped
Owner: Codex
Started: 2026-06-04
Completed: 2026-06-04
Commit: No implementation commit; roadmap-only de-scope.
Evidence: User product decision on 2026-06-04: leave normal fusion and tutorial fusion server-confirmed/server-authoritative for now.
Branch: `feature/optimistic-fusion-actions`
Worktree: `koto-wt-optimistic-fusion-actions`

**Files:**

- Modify: `public/js/ui/fusion-lab.js`
- Modify: fusion route/service files found by `rg -n "fusion" src public tests`
- Test: focused route tests for duplicate fusion start
- Test: focused UI tests for corrected rollback

Rules:

- If fusion result is deterministic, the client may show start/progress immediately.
- If fusion ever has random variants, the fused result must wait for server confirmation or server-prepared result data.
- Duplicate `actionId` must not consume materials twice or create two creatures.
- Tutorial fusion core claim and tutorial fusion completion must be covered separately from normal fusion.

Required verification:

```bash
rg -n "fusion" src public tests
npm test
```

Manual browser verification is required.

---

## Phase 4: Release Gate And Monitoring

Run this only after all intended phases are complete or explicitly de-scoped.

### Task 4.1: Full Optimistic Action Release Gate

Status: complete
Owner: Codex
Started: 2026-06-04 23:03 JST
Completed: 2026-06-04 23:15 JST
Commit: -
Evidence: `npm test` PASS on 2026-06-04 23:09 JST; focused optimistic-action gate PASS on 2026-06-04 23:14 JST; browser/manual playtest was not run because repo instructions require explicit approval before browser launch and approval was not available during execution.
Branch: `fix/optimistic-actions-release-gate`
Worktree: `.worktrees/optimistic-actions-release-gate`

**Files:**

- Modify: `docs/playtest-guide.md` if new interaction patterns were discovered
- Modify: this plan with final status

- [x] **Step 1: Run full automated verification**

Run:

```bash
npm test
```

- [x] **Step 2: Run focused optimistic-action verification**

Run:

```bash
npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js
```

- [x] **Step 3: Record manual playtest gate status**

Browser/manual playtest was not run in this session because repo instructions require explicit approval before browser launch and approval was not available during execution.

Read `docs/playtest-guide.md` before playtesting. Ask before launching a browser.

Verify:

- Normal room proceed.
- Completed-room proceed edge.
- Skill Master choice.
- Shrine choice.
- Friendly NPC item choice.
- NPC battle skill reward.
- PvP team save and PvP team selection.
- Every Phase 2 action completed in this plan.
- Every Phase 3 action completed in this plan.

- [x] **Step 4: Update docs**

If new interaction patterns or browser-playtest findings were discovered, update `docs/playtest-guide.md`.

No browser/playtest findings were discovered because the browser gate was not run, so `docs/playtest-guide.md` was not changed.

- [x] **Step 5: Final plan update**

Set all completed/de-scoped task statuses, add final evidence, and add a Progress Log row summarizing release readiness.

## Advancement Rules

- Do not start Phase 2 while any Phase 1 task is `pending`, `in_progress`, or `blocked`.
- Do not start Phase 3 while any Phase 2 task is `pending`, `in_progress`, or `blocked`.
- A task can be marked `de-scoped` only if the design spec is also updated to say why.
- Any production bug caused by optimistic actions creates a new Phase 1 blocker task and pauses later phases.
- Visual/CSS/animation/rendering changes require screenshots before completion.
- PvE/PvP parity must be preserved for combat changes; if a combat behavior cannot apply to both, document why before shipping.
