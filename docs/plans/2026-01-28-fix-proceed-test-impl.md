# Fix "proceed advances room counter" Test - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken test by renaming it to match actual game behavior - rooms auto-advance after completion, there is no proceed button.

**Architecture:** Revert broken changes, then rewrite the test to verify that completing a shrine room auto-advances the room counter.

**Tech Stack:** Playwright, TypeScript

---

## Task 1: Revert Broken Test File

**Files:**
- Revert: `tests/e2e/specs/features/run-and-exploration.spec.ts`

**Step 1: Revert to committed version**

```bash
git checkout HEAD -- tests/e2e/specs/features/run-and-exploration.spec.ts
```

**Step 2: Verify revert worked**

```bash
git diff tests/e2e/specs/features/run-and-exploration.spec.ts
```

Expected: No output (file matches committed version)

---

## Task 2: Revert Playwright Config

**Files:**
- Revert: `tests/e2e/playwright.config.ts`

**Step 1: Revert to committed version**

```bash
git checkout HEAD -- tests/e2e/playwright.config.ts
```

**Step 2: Verify revert worked**

```bash
git diff tests/e2e/playwright.config.ts
```

Expected: No output (file matches committed version)

---

## Task 3: Rewrite the Test

**Files:**
- Modify: `tests/e2e/specs/features/run-and-exploration.spec.ts` (lines 32-47)

**Step 1: Read current test to confirm structure**

Read lines 30-50 of the file to see the original flaky test.

**Step 2: Replace the test with shrine-based version**

Replace the test at line 32 with:

```typescript
  test('completing room advances room counter', async ({ gameHelper, page }) => {
    await gameHelper.enableDebugMode();
    // Queue shrine - completing it auto-advances to next room
    await gameHelper.queueRooms(['shrine', 'encounter', 'boss']);
    await gameHelper.setupRun();

    // Wait for shrine phase
    await gameHelper.waitForPhase(['shrine'], 8000);

    const roomBefore = await gameHelper.getCurrentRoom();

    // Complete shrine (select a chip reward) - this auto-advances
    await gameHelper.completeShrineRoom();
    await page.waitForTimeout(1000);

    // Room counter should have advanced automatically
    const roomAfter = await gameHelper.getCurrentRoom();
    expect(roomAfter).toBeGreaterThan(roomBefore);
  });
```

**Key changes:**
- Renamed from "proceed advances room counter" to "completing room advances room counter"
- No proceed button click - shrine auto-advances after selection
- Tests actual game behavior

---

## Task 4: Run Test Suite

**Files:** None (bash only)

**Step 1: Run the specific test first**

```bash
./scripts/e2e-test.sh specs/features/run-and-exploration.spec.ts
```

Expected: All 6 tests in run-and-exploration.spec.ts pass

**Step 2: Run full test suite**

```bash
./scripts/e2e-test.sh
```

Expected: 56/56 tests pass (or close - note any unrelated failures)

---

## Task 5: Commit the Fix

**Files:**
- `tests/e2e/specs/features/run-and-exploration.spec.ts`

**Step 1: Stage and commit**

```bash
git add tests/e2e/specs/features/run-and-exploration.spec.ts
git commit -m "fix(test): rename proceed test to match actual behavior

The game auto-advances rooms after completion - there is no proceed
button in normal room flow. Renamed test to 'completing room advances
room counter' and updated to test shrine room completion."
```

---

## Success Criteria

- [ ] run-and-exploration.spec.ts reverted then fixed properly
- [ ] playwright.config.ts reverted to original
- [ ] Test renamed to "completing room advances room counter"
- [ ] Test uses shrine completion (no proceed button)
- [ ] All 56 tests pass
- [ ] Clean commit with descriptive message
