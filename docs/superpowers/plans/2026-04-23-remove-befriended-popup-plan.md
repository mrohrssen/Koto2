# Remove "Befriended!" Action-Area Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the redundant green `BEFRIENDED [Name]!` banner that replaces the action area for 1200ms after a successful befriend, along with the now-orphaned `befriended` i18n entry.

**Architecture:** Pure presentation-layer deletion. Three identical `actionArea.innerHTML = ...` + `await ctx.delay(1200)` blocks in `public/js/ui/befriend.js` are removed. The single consumer of the `befriended` i18n key is these blocks, so `public/js/ui/i18n.js` L40–41 is also removed. No state, server, test fixture, or AI path is touched. The preceding `じゃあ、友達になろう！` narration bubble and the `popupBuff('New Ally!', ...)` floating label already convey the outcome.

**Tech Stack:** Vanilla ES6 modules, plain DOM, existing i18n helper (`t` from `public/js/ui/i18n.js`), Node's built-in test runner, Playwright MCP for manual visual verification.

**Spec:** `docs/superpowers/specs/2026-04-23-remove-befriended-popup-design.md`

---

## File Structure

**Modify:**
- `public/js/ui/befriend.js` — delete three popup blocks (L535–539, L743–746 + L759, L820–824)
- `public/js/ui/i18n.js` — delete L40–41 (`befriended` entry)

**Not touched:**
- `public/game.css` — `.combat-defend-indicator` stays; still used by `combat-loop.js`, `combat-vfx.js`, and the `letItGo` variant in `befriend.js`
- `tests/` — no existing test asserts on the popup text or action-area innerHTML (verified via `grep` in the planning phase). No test additions are warranted for a pure UI deletion; synthetic "the popup is absent" assertions would be low-signal because the action area is overwritten by subsequent move-selection UI anyway.

---

## Task 1: Create isolated worktree and baseline

**Files:** None modified yet.

- [ ] **Step 1: Confirm main repo root and create worktree**

Run from the main repo:

```bash
PROJECT_ROOT=$(/usr/bin/git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"
/usr/bin/git fetch origin
/usr/bin/git worktree add ../koto-wt-remove-befriend-popup -b fix/remove-befriended-popup
cd ../koto-wt-remove-befriend-popup
```

Expected: new directory at `../koto-wt-remove-befriend-popup` on branch `fix/remove-befriended-popup`.

- [ ] **Step 2: Install dependencies if needed**

Run:

```bash
npm install
```

Expected: completes without errors. Skip if `node_modules` already present from a shared cache.

- [ ] **Step 3: Confirm baseline grep targets**

Run:

```bash
grep -n "t('befriended'" public/js/ui/befriend.js
grep -n "befriended:" public/js/ui/i18n.js
```

Expected output (exactly):

```
public/js/ui/befriend.js:537:      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', answerResult.capturedName || quizData.creatureNameEn || quizData.creatureName || '')}</div>`;
public/js/ui/befriend.js:745:                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
public/js/ui/befriend.js:822:          actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', captured.nameEn)}</div>`;
```

And:

```
40:  befriended:       { en: 'BEFRIENDED {0}!',         ja: '{0}と友達になった！',
```

Line numbers on your copy must match. If they don't, re-check the spec — the file may have drifted and the task line numbers below will need adjustment.

- [ ] **Step 4: Run the test suite to confirm a green baseline**

Run:

```bash
npm test
```

Expected: all Tier 1 + Tier 2 tests pass. If baseline is red, stop — baseline failures must be unrelated and triaged separately before this change proceeds.

---

## Task 2: Remove popup at name-quiz success path

**Files:**
- Modify: `public/js/ui/befriend.js:535-539`

- [ ] **Step 1: Locate the block**

Read `public/js/ui/befriend.js` around L520–545. The exact current block is:

```javascript
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', answerResult.capturedName || quizData.creatureNameEn || quizData.creatureName || '')}</div>`;
    }
    await ctx.delay(1200);
```

It sits between the `slot.classList.add('befriended')` enemy-slot update (L532) and `if (answerResult.state) { ctx.updateGameState(answerResult.state); }` (L541).

- [ ] **Step 2: Delete the block**

Use Edit to remove the five lines above (the whole `const actionArea = ...` through `await ctx.delay(1200);` including the blank line that follows).

The new adjacency must be:

```javascript
      if (slot) slot.classList.add('befriended');
    }

    if (answerResult.state) {
      ctx.updateGameState(answerResult.state);
    }
```

(i.e., one blank line between the closing `}` of the slot-update block and the `if (answerResult.state)` check).

- [ ] **Step 3: Syntax check**

Run:

```bash
node --check public/js/ui/befriend.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Confirm one site remaining**

Run:

```bash
grep -c "t('befriended'" public/js/ui/befriend.js
```

Expected: `2` (Tasks 3 and 4 will take these to 1 and 0).

---

## Task 3: Remove popup at 3-round conversation success path

**Files:**
- Modify: `public/js/ui/befriend.js:820-824`

- [ ] **Step 1: Locate the block**

Read `public/js/ui/befriend.js` around L810–830 (note: line numbers will have shifted down by ~5 after Task 2; use the grep in Step 4 of Task 2 to relocate). The exact current block is:

```javascript
        const actionArea = document.getElementById('action-area');
        if (actionArea && captured) {
          actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', captured.nameEn)}</div>`;
        }
        await ctx.delay(1200);
```

It sits between the `slot.classList.add('befriended')` enemy-slot update (L817 pre-Task-2) and `if (answerResult.state) { ctx.updateGameState(answerResult.state); }`.

- [ ] **Step 2: Delete the block**

Use Edit to remove the five lines (`const actionArea = ...` through `await ctx.delay(1200);`) plus the blank line that follows.

The new adjacency must be:

```javascript
          if (slot) slot.classList.add('befriended');
        }

        if (answerResult.state) {
          ctx.updateGameState(answerResult.state);
        } else {
```

- [ ] **Step 3: Syntax check**

Run:

```bash
node --check public/js/ui/befriend.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Confirm one site remaining**

Run:

```bash
grep -c "t('befriended'" public/js/ui/befriend.js
```

Expected: `1` (only the party-full swap site at what was L745 remains).

---

## Task 4: Remove popup at party-full swap success path

**Files:**
- Modify: `public/js/ui/befriend.js` (original L743–746 and L759)

This path is structurally different from Tasks 2–3: `playSFX('creature-skill')` runs **between** the `actionArea.innerHTML = ...` block and the enemy-slot classList update, and the `await ctx.delay(1200)` is **after** the slot update, not adjacent to the popup. Delete both the popup block and the delay; keep everything else (the SFX call, the slot update, all downstream state handling).

- [ ] **Step 1: Locate the block**

The exact current code (line numbers will have shifted from earlier deletions; use grep to locate: `grep -n "t('befriended'" public/js/ui/befriend.js`):

```javascript
          if (releaseChoice && ctx.apiBefriendReplace) {
            const replaceResult = await ctx.apiBefriendReplace(releaseChoice);
            if (replaceResult?.success) {
              const actionArea = document.getElementById('action-area');
              if (actionArea) {
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
              }
              playSFX('creature-skill');

              const capturedId = replaceResult.captured?.id;
              const capturedIdx = replaceResult.capturedIndex;
              if (capturedId != null || capturedIdx != null) {
                const slot = (typeof capturedIdx === 'number'
                  ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIdx}"]`)
                  : null) || (capturedId
                  ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
                  : null);
                if (slot) slot.classList.add('befriended');
              }
              await ctx.delay(1200);

              if (replaceResult.combatEnded) {
```

- [ ] **Step 2: Delete the popup block**

Use Edit to remove these four lines (the `const actionArea = ...` block):

```javascript
              const actionArea = document.getElementById('action-area');
              if (actionArea) {
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
              }
```

New adjacency — the success branch now opens directly with the SFX call:

```javascript
            if (replaceResult?.success) {
              playSFX('creature-skill');

              const capturedId = replaceResult.captured?.id;
```

- [ ] **Step 3: Delete the trailing delay**

Use Edit to remove this line (including the blank line that follows it, so the closing `}` of the slot-update block is directly followed by a single blank line and then `if (replaceResult.combatEnded)`):

```javascript
              await ctx.delay(1200);
```

New adjacency:

```javascript
                if (slot) slot.classList.add('befriended');
              }

              if (replaceResult.combatEnded) {
```

- [ ] **Step 4: Syntax check**

Run:

```bash
node --check public/js/ui/befriend.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Confirm no sites remaining**

Run:

```bash
grep -c "t('befriended'" public/js/ui/befriend.js
grep -c "combat-defend-indicator.*befriended" public/js/ui/befriend.js
```

Expected:

```
0
0
```

---

## Task 5: Remove orphaned `befriended` i18n entry

**Files:**
- Modify: `public/js/ui/i18n.js:40-41`

- [ ] **Step 1: Confirm the key is orphaned**

Run:

```bash
grep -rn "t('befriended'\|'befriended'" public/js/ src/ tests/ 2>/dev/null | grep -v "i18n.js"
```

Expected: no matches. (The `befriended:` entry in `i18n.js` itself will be excluded by the grep filter; property accesses on state like `enemy.befriended` have no quotes so they don't match the pattern.)

If this returns any matches outside `i18n.js`, stop — an earlier task missed a site. Go back and delete it before continuing.

- [ ] **Step 2: Delete the entry**

The current block at `public/js/ui/i18n.js:40-41` is:

```javascript
  befriended:       { en: 'BEFRIENDED {0}!',         ja: '{0}と友達になった！',
                      tagged: '{BEFRIENDED|友達になった|ともだちになった} {0}!' },
```

Use Edit to remove both lines. The surrounding adjacency must go from:

```javascript
  wasDefeated:      { en: '{0} was defeated!',       ja: '{0}が倒れた！' },
  befriended:       { en: 'BEFRIENDED {0}!',         ja: '{0}と友達になった！',
                      tagged: '{BEFRIENDED|友達になった|ともだちになった} {0}!' },
  letItGo:          { en: 'Let it go...',             ja: '見送った…',
```

to:

```javascript
  wasDefeated:      { en: '{0} was defeated!',       ja: '{0}が倒れた！' },
  letItGo:          { en: 'Let it go...',             ja: '見送った…',
```

- [ ] **Step 3: Syntax check**

Run:

```bash
node --check public/js/ui/i18n.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Confirm the key is gone**

Run:

```bash
grep -n "befriended:" public/js/ui/i18n.js
```

Expected: no output.

---

## Task 6: Run the test suite

**Files:** None modified.

- [ ] **Step 1: Run Tier 1 + Tier 2**

Run:

```bash
npm test
```

Expected: all tests pass, same count and names as the Task 1 baseline. Nothing new should fail.

If any test fails, read the failure — the most likely cause is a test that stubs `t()` and asserts on a specific call that no longer happens, in which case delete the obsolete assertion. Do not add new tests to "cover" the deletion; the grep verification in Task 5 Step 1 is the authoritative check that no call sites remain.

---

## Task 7: Manual Playwright visual verification

**Files:** None modified.

This change is visual. Per `CLAUDE.md` — "All visual/CSS/animation/rendering changes MUST be verified with screenshots before reporting completion." — the agent MUST NOT skip this task.

**Before launching Playwright, ask the user for confirmation** (per `CLAUDE.md`: "Don't launch Playwright without asking first").

- [ ] **Step 1: Ask the user before launching Playwright**

Post a message to the user:

> "Ready to verify visually. I'll start the dev server and open Playwright to play through a befriend. OK to launch, or do you have Chrome/Playwright state I should avoid clobbering?"

Wait for user approval before continuing.

- [ ] **Step 2: Start the dev server**

Run (from the worktree):

```bash
npm run dev
```

Run in background. Wait ~5 seconds, then confirm:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 3: Navigate and reach a befriend**

Follow `docs/playtest-guide.md` to log in and reach combat. Drive one enemy to ≤50% HP (so it becomes befriend-eligible), then trigger the befriend flow (は`なす` / the name-quiz flash-card path — whichever the tutorial/current state surfaces).

After the `じゃあ、友達になろう！` dialogue is dismissed:

- [ ] **Step 4: Take a screenshot of the transition**

Use `browser_take_screenshot` to capture the moment immediately after the dialogue closes.

Expected observations in the screenshot:
- **No green `BEFRIENDED [Name]!` banner** in the action area — this is the core verification.
- The enemy formation slot shows the `befriended` visual state (faded/recolored sprite).
- Either (a) the "New Ally!" floating label is visible over the new player formation slot, or (b) it has already animated out and combat has resumed with a fresh move-selection UI.

**On path coverage:** the spec listed all three paths (name-quiz, 3-round conversation, party-full swap) for manual verification. In practice only the path reachable from the current save state can be exercised in one session — party-full requires a saved party of 6, and name-quiz vs. conversation is gated by tutorial progression. The three deletion sites are syntactically identical (`actionArea.innerHTML = ...` + `await ctx.delay(1200)`), so visual verification on whichever path is reachable is sufficient. Note in the user handoff which path was exercised and which were verified by grep+syntax-check only.

- [ ] **Step 5: Clean up the screenshot**

Per `CLAUDE.md` ("Delete screenshots immediately"):

```bash
rm <screenshot-filename>
```

- [ ] **Step 6: Stop the dev server**

Kill the background `npm run dev` process.

---

## Task 8: Commit and open PR

**Files:** None modified.

Per `CLAUDE.md` auto-memory: **PR before push — never direct to master/dev**. Open PRs to both `master` and `dev` branches.

- [ ] **Step 1: Stage and commit**

From the worktree:

```bash
/usr/bin/git add public/js/ui/befriend.js public/js/ui/i18n.js
/usr/bin/git status
```

Expected: only those two files staged, no other changes.

Commit with a HEREDOC message:

```bash
/usr/bin/git commit -m "$(cat <<'EOF'
refactor(ui): remove redundant befriended action-area popup

The green BEFRIENDED [Name]! banner held the action area for 1200ms
after a successful befriend, duplicating the じゃあ、友達になろう！
dialogue and the New Ally! floating label. Dropped the three popup
sites in befriend.js (name-quiz success, 3-round conversation success,
party-full swap success) along with the now-orphaned `befriended`
i18n entry. Befriend flow is ~1.2s snappier with no information loss.

Spec: docs/superpowers/specs/2026-04-23-remove-befriended-popup-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push the branch**

```bash
/usr/bin/git push -u origin fix/remove-befriended-popup
```

- [ ] **Step 3: Open PR against `master`**

```bash
gh pr create --base master --title "fix(ui): remove redundant befriended action-area popup" --body "$(cat <<'EOF'
## Summary
- Removes the green `BEFRIENDED [Name]!` banner that held the action area for 1200ms after a successful befriend — duplicated the `じゃあ、友達になろう！` dialogue and `New Ally!` floating label.
- Three popup sites deleted in `public/js/ui/befriend.js` (name-quiz, 3-round dialogue, party-full swap).
- Orphaned `befriended` entry removed from `public/js/ui/i18n.js`.
- Befriend flow is ~1.2s snappier with no information loss.

Spec: `docs/superpowers/specs/2026-04-23-remove-befriended-popup-design.md`

## Test plan
- [x] `npm test` — Tier 1 + Tier 2 green
- [x] `node --check public/js/ui/befriend.js` — OK
- [x] `node --check public/js/ui/i18n.js` — OK
- [x] `grep "t('befriended'" public/js/ui/befriend.js` — 0 matches
- [x] Manual Playwright run of a successful befriend — no green banner, `New Ally!` float still fires, enemy slot still gains `befriended` class

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Open PR against `dev`**

```bash
gh pr create --base dev --title "fix(ui): remove redundant befriended action-area popup" --body "Same change as the master PR — mirroring to dev per repo workflow. See master PR for details."
```

- [ ] **Step 5: Report PR URLs to the user**

Post both PR URLs back to the user so they can review.

- [ ] **Step 6: (After merge) Clean up the worktree**

Once the PRs are merged, from the main repo:

```bash
PROJECT_ROOT=$(/usr/bin/git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"
/usr/bin/git worktree remove ../koto-wt-remove-befriend-popup
/usr/bin/git branch -d fix/remove-befriended-popup
```

---

## Completion criteria

- `grep "t('befriended'" public/js/ui/befriend.js` → 0 matches
- `grep "befriended:" public/js/ui/i18n.js` → 0 matches
- `node --check` clean for both modified files
- `npm test` green
- Playwright screenshot shows no green banner in the action area after a successful befriend
- Two PRs open (one to `master`, one to `dev`)
