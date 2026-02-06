# E2E Test Verification Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the E2E test suite is robust, trustworthy, not cheating, and actually tests game functionality.

**Architecture:** Systematic audit of test helpers, assertions, and debug shortcuts. Run determinism checks. Add negative tests to prove tests can fail. Verify UI assertions match real gameplay.

**Tech Stack:** Playwright, TypeScript, bash scripts for automation.

---

## Summary of Concerns to Verify

| Concern | Risk | Verification Approach |
|---------|------|----------------------|
| Tests pass by accident | High | Run 5x consecutive, check consistency |
| `setEnemyHp(1)` bypasses combat | Medium | Add test that wins without debug HP |
| Room queue may not actually work | Medium | Add test that proves queue order matters |
| Assertions too weak | Medium | Add negative tests that should fail |
| `winCombat()` is hardcoded | Low | Trace through helper, verify it does real swipes |
| Tests skip on edge cases | Medium | Audit `test.skip()` calls, verify they're legitimate |
| Duplicated `dismissNarration` | Low | Consolidate and verify behavior |

---

## Task 1: Run Determinism Check (5 Consecutive Runs)

**Files:** None (bash only)

**Step 1: Kill any running servers**

```bash
pkill -f "node server.js" 2>/dev/null || true
```

**Step 2: Run test suite 5 times, capture results**

```bash
cd /Users/michia/Documents/jrpg
for i in 1 2 3 4 5; do
  echo "=== Run $i ===" >> /tmp/e2e-determinism.log
  ./scripts/e2e-test.sh 2>&1 | tail -20 >> /tmp/e2e-determinism.log
  echo "" >> /tmp/e2e-determinism.log
done
```

**Step 3: Analyze results**

```bash
grep -E "(passed|failed|flaky)" /tmp/e2e-determinism.log
```

**Expected:** Same pass/fail count all 5 runs. If flaky, note which tests.

**Step 4: Document findings**

Record pass rates in this file under "Verification Results" section.

---

## Task 2: Verify Room Queue Actually Works

**Files:**
- Create: `tests/e2e/specs/rooms/queue-verification.spec.ts`

**Step 1: Write test that proves queue order matters**

```typescript
// tests/e2e/specs/rooms/queue-verification.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';

test.describe('Room Queue Verification', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
  });

  test('queued rooms appear in exact order', async ({ gameHelper, page }) => {
    // Queue specific order: shrine -> quiz -> encounter -> boss
    await gameHelper.queueRooms(['shrine', 'quiz', 'encounter', 'boss']);
    await gameHelper.setupRun();

    // Room 1: Should be shrine
    const phase1 = await gameHelper.getPhase();
    expect(phase1).toBe('shrine');

    // Complete shrine
    await gameHelper.completeShrineRoom();
    await page.waitForTimeout(500);
    const proceedBtn = page.locator('#proceed-btn');
    if (await proceedBtn.isVisible().catch(() => false)) {
      await proceedBtn.click();
      await page.waitForTimeout(500);
    }

    // Room 2: Should be quiz
    await gameHelper.waitForPhase(['quiz', 'exploring'], 5000);
    const phase2 = await gameHelper.getPhase();
    expect(phase2).toBe('quiz');
  });

  test('without queue, rooms are random (probabilistic)', async ({ gameHelper }) => {
    // Don't queue anything - let random generation happen
    await gameHelper.setupRun();

    const phase = await gameHelper.getPhase();
    // Should be some valid room phase (not guaranteed which one)
    expect(['room_encounter', 'exploring', 'shrine', 'quiz', 'wordDiscovery', 'boss_ready']).toContain(phase);
  });
});
```

**Step 2: Run the test**

```bash
./scripts/e2e-test.sh specs/rooms/queue-verification.spec.ts
```

**Expected:** Both tests pass. First test proves queue works. Second proves random still works.

**Step 3: Commit**

```bash
git add tests/e2e/specs/rooms/queue-verification.spec.ts
git commit -m "test(e2e): add room queue verification tests

Proves that queueRooms() actually controls room order."
```

---

## Task 3: Add Negative Test (Prove Tests Can Fail)

**Files:**
- Create: `tests/e2e/specs/rooms/negative-verification.spec.ts`

**Step 1: Write tests that SHOULD fail, then invert assertions**

```typescript
// tests/e2e/specs/rooms/negative-verification.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Negative Verification (Assertions Work)', () => {
  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    await gameHelper.enableDebugMode();
  });

  test('enemy HP decreases after correct swipe (not hardcoded)', async ({ gameHelper, page }) => {
    await gameHelper.queueRooms(['encounter', 'boss']);
    await gameHelper.setupRun();

    // Navigate to combat without setting enemy HP
    await gameHelper.proceedToEncounter(10);
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      await fightBtn.click();
      await gameHelper.waitForPhase(['combat'], 5000);
    }

    // Dismiss narration
    const narrationBox = page.locator(SELECTORS.narrationBox);
    for (let i = 0; i < 5; i++) {
      if (await narrationBox.isVisible().catch(() => false)) {
        await narrationBox.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Get enemy HP before
    const hpBefore = await gameHelper.getEnemyHp();
    console.log('Enemy HP before:', hpBefore);
    expect(hpBefore).toBeGreaterThan(0);

    // Do ONE swipe right (correct answer deals damage)
    await gameHelper.waitForFlashCard(8000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('right');
    await page.waitForTimeout(2000);

    // HP should have decreased (damage dealt)
    const hpAfter = await gameHelper.getEnemyHp();
    console.log('Enemy HP after:', hpAfter);

    // This assertion would fail if swipeCard was fake
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  test('wrong swipe does NOT kill enemy', async ({ gameHelper, page }) => {
    await gameHelper.queueRooms(['encounter', 'boss']);
    await gameHelper.setupRun();

    await gameHelper.proceedToEncounter(10);
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      await fightBtn.click();
      await gameHelper.waitForPhase(['combat'], 5000);
    }

    // Dismiss narration
    const narrationBox = page.locator(SELECTORS.narrationBox);
    for (let i = 0; i < 5; i++) {
      if (await narrationBox.isVisible().catch(() => false)) {
        await narrationBox.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Get enemy HP before
    const hpBefore = await gameHelper.getEnemyHp();

    // Swipe LEFT (wrong answer - should NOT deal damage)
    await gameHelper.waitForFlashCard(8000);
    await gameHelper.flipCard();
    await gameHelper.swipeCard('left');
    await page.waitForTimeout(2000);

    // Enemy should still be alive
    const hpAfter = await gameHelper.getEnemyHp();

    // HP should NOT have decreased (or decreased only due to player taking damage)
    // Actually - wrong swipe may trigger enemy attack, but shouldn't kill enemy
    expect(hpAfter).toBeGreaterThan(0);
    // Should still be in combat
    const phase = await gameHelper.getPhase();
    expect(phase).toBe('combat');
  });
});
```

**Step 2: Run the test**

```bash
./scripts/e2e-test.sh specs/rooms/negative-verification.spec.ts
```

**Expected:** Both tests pass. First test proves damage is real. Second proves wrong answers don't auto-win.

**Step 3: Commit**

```bash
git add tests/e2e/specs/rooms/negative-verification.spec.ts
git commit -m "test(e2e): add negative verification tests

Proves assertions are real - damage happens, wrong answers don't win."
```

---

## Task 4: Verify winCombat() Isn't Cheating

**Files:**
- Read: `tests/e2e/fixtures/game-helpers.ts`

**Step 1: Trace winCombat implementation**

Read lines 306-317 of game-helpers.ts:

```typescript
async winCombat(maxRounds = 30): Promise<void> {
  for (let i = 0; i < maxRounds; i++) {
    const phase = await this.getPhase();
    if (phase !== 'combat') return;
    const hp = await this.getEnemyHp();
    if (hp <= 0) return;
    try {
      await this.completeCombatRound();
    } catch { return; }
  }
}
```

**Step 2: Trace completeCombatRound**

```typescript
async completeCombatRound(): Promise<void> {
  await this.waitForFlashCard(8000);
  await this.flipCard();
  await this.swipeCard('right');
  await this.page.waitForTimeout(1000);
}
```

**Step 3: Trace swipeCard**

```typescript
async swipeCard(direction: 'left' | 'right'): Promise<void> {
  await this.page.evaluate((dir) => {
    document.dispatchEvent(new CustomEvent('test-swipe', { detail: dir }));
  }, direction);
  await this.page.waitForTimeout(300);
}
```

**Analysis:** `winCombat()` uses real UI interactions via `test-swipe` custom event. Need to verify game listens to this event.

**Step 4: Verify game handles test-swipe event**

Search in frontend code:

```bash
grep -r "test-swipe" public/js/
```

**Expected:** Find event listener in game code that treats 'test-swipe' same as real swipe.

**Step 5: Document findings**

If test-swipe is handled by game code, winCombat is legitimate. If not, it's cheating.

---

## Task 5: Audit test.skip() Calls

**Files:**
- Read: All spec files in `tests/e2e/specs/`

**Step 1: Find all test.skip calls**

```bash
grep -rn "test.skip" tests/e2e/specs/
```

**Step 2: Review each skip reason**

For each skip found, verify:
1. Is the skip conditional (based on game state)?
2. Is the condition legitimate (e.g., "no words available")?
3. Could this hide a broken test?

**Step 3: Document findings**

List each skip and whether it's justified.

---

## Task 6: Consolidate dismissNarration Helper

**Files:**
- Modify: `tests/e2e/fixtures/game-helpers.ts`
- Modify: `tests/e2e/specs/rooms/encounter.spec.ts`
- Modify: `tests/e2e/specs/rooms/quiz.spec.ts`
- Modify: `tests/e2e/specs/integration/full-playthrough.spec.ts`

**Step 1: Add dismissNarration to GameHelper class**

Add to game-helpers.ts after line 400:

```typescript
/** Dismiss narration boxes that require clicking to continue */
async dismissNarration(maxAttempts = 10): Promise<boolean> {
  let dismissed = false;
  for (let i = 0; i < maxAttempts; i++) {
    const narrationBox = this.page.locator(SELECTORS.narrationBox);
    const narrationIndicator = this.page.locator(SELECTORS.narrationIndicator);

    const boxVisible = await narrationBox.isVisible().catch(() => false);
    const indicatorVisible = await narrationIndicator.isVisible().catch(() => false);

    if (boxVisible && indicatorVisible) {
      await narrationBox.click({ force: true });
      await this.page.waitForTimeout(500);
      dismissed = true;
      continue;
    }
    break;
  }
  return dismissed;
}
```

**Step 2: Update encounter.spec.ts to use helper**

Remove the local `dismissNarration` function and use `gameHelper.dismissNarration()`.

**Step 3: Update quiz.spec.ts to use helper**

Remove the local `dismissNarration` function and use `gameHelper.dismissNarration()`.

**Step 4: Update full-playthrough.spec.ts to use helper**

Remove the local `dismissNarration` function and use `gameHelper.dismissNarration()`.

**Step 5: Run tests to verify refactor works**

```bash
./scripts/e2e-test.sh specs/rooms/ specs/integration/
```

**Step 6: Commit**

```bash
git add tests/e2e/fixtures/game-helpers.ts tests/e2e/specs/
git commit -m "refactor(test): consolidate dismissNarration into GameHelper

Removes duplicate helper functions from individual spec files."
```

---

## Task 7: Verify setEnemyHp Debug Endpoint

**Files:**
- Read: `src/routes/game/misc.js`

**Step 1: Find debug-set-enemy-hp endpoint**

```bash
grep -A 20 "debug-set-enemy-hp" src/routes/game/misc.js
```

**Step 2: Verify it's guarded by debug mode**

Should have check: `if (process.env.NODE_ENV !== 'test' && !getDebugMode())`

**Step 3: Verify it actually modifies game state**

Endpoint should modify `state.combat.enemy.hp` in the actual game state.

**Step 4: Document findings**

If properly guarded and modifies real state, it's a legitimate test helper. If it doesn't modify state, tests are lying.

---

## Task 8: Add Full Combat Test Without Debug Shortcuts

**Files:**
- Create: `tests/e2e/specs/integration/real-combat.spec.ts`

**Step 1: Write test that wins combat without setEnemyHp**

```typescript
// tests/e2e/specs/integration/real-combat.spec.ts
import { test, expect, setupCharacter } from '../../fixtures/test-fixtures';
import { SELECTORS } from '../../utils/selectors';

test.describe('Real Combat (No Debug Shortcuts)', () => {
  // These tests take longer - real combat
  test.setTimeout(120000);

  test.beforeEach(async ({ gameHelper }) => {
    await setupCharacter(gameHelper);
    // Note: NOT enabling debug mode for most operations
  });

  test('can defeat enemy through normal combat', async ({ gameHelper, page }) => {
    // Enable debug only for room queue (determinism), not for HP manipulation
    await gameHelper.enableDebugMode();
    await gameHelper.queueRooms(['encounter', 'boss']);

    await gameHelper.setupRun();

    // Navigate to combat
    await gameHelper.proceedToEncounter(10);
    const fightBtn = page.locator(SELECTORS.fightBtn);
    if (await fightBtn.isVisible().catch(() => false)) {
      await fightBtn.click();
      await gameHelper.waitForPhase(['combat'], 5000);
    }

    // Dismiss narration
    await gameHelper.dismissNarration(5);

    // Get initial enemy HP
    const initialHp = await gameHelper.getEnemyHp();
    console.log('Enemy HP:', initialHp);
    expect(initialHp).toBeGreaterThan(0);

    // Fight for real - NO setEnemyHp
    // Keep swiping right until enemy dies or we've done 50 rounds
    let rounds = 0;
    const maxRounds = 50;

    while (rounds < maxRounds) {
      const phase = await gameHelper.getPhase();
      if (phase !== 'combat') break;

      const hp = await gameHelper.getEnemyHp();
      if (hp <= 0) break;

      try {
        await gameHelper.waitForFlashCard(5000);
        await gameHelper.flipCard();
        await gameHelper.swipeCard('right');
        await page.waitForTimeout(1500);
        rounds++;
      } catch {
        // Flash card didn't appear - combat may have ended
        break;
      }
    }

    console.log(`Combat ended after ${rounds} rounds`);

    // Verify combat ended (enemy dead or phase changed)
    const finalPhase = await gameHelper.getPhase();
    const finalHp = await gameHelper.getEnemyHp();

    expect(finalPhase !== 'combat' || finalHp <= 0).toBe(true);
    expect(rounds).toBeGreaterThan(0); // Should have done at least some fighting
    expect(rounds).toBeLessThan(maxRounds); // Should have won before max
  });
});
```

**Step 2: Run the test**

```bash
./scripts/e2e-test.sh specs/integration/real-combat.spec.ts
```

**Expected:** Test passes by actually fighting (may take longer).

**Step 3: Commit**

```bash
git add tests/e2e/specs/integration/real-combat.spec.ts
git commit -m "test(e2e): add real combat test without debug shortcuts

Proves combat can be won through actual gameplay, not just HP manipulation."
```

---

## Task 9: Final Test Suite Run and Documentation

**Files:**
- Modify: This file (add results section)

**Step 1: Run full test suite**

```bash
./scripts/e2e-test.sh 2>&1 | tee /tmp/final-e2e-run.log
```

**Step 2: Record results**

Add "Verification Results" section to this document with:
- Total pass/fail counts
- Any flaky tests identified
- Determinism check results (from Task 1)
- Audit findings (from Tasks 4, 5, 7)

**Step 3: Commit updated plan**

```bash
git add docs/plans/2026-01-28-e2e-test-verification.md
git commit -m "docs: complete E2E test verification

Documented verification results and audit findings."
```

---

## Verification Results

*(To be filled in during execution)*

### Determinism Check (5 Runs)

| Run | Passed | Failed | Notes |
|-----|--------|--------|-------|
| 1   |        |        |       |
| 2   |        |        |       |
| 3   |        |        |       |
| 4   |        |        |       |
| 5   |        |        |       |

### test-swipe Event Audit

- [ ] Found in frontend code: ___
- [ ] Properly integrated with swipe handling: ___
- [ ] Conclusion: ___

### test.skip() Audit

| File | Skip Reason | Justified? |
|------|-------------|------------|
|      |             |            |

### Debug Endpoint Audit

- [ ] `debug-set-enemy-hp` guarded by debug mode: ___
- [ ] Actually modifies game state: ___
- [ ] Conclusion: ___

### Overall Assessment

- [ ] Tests are deterministic
- [ ] Tests use real UI interactions
- [ ] Assertions are meaningful
- [ ] Debug shortcuts are legitimate
- [ ] **Final verdict:** TRUSTWORTHY / NEEDS WORK

---

## Success Criteria

- [ ] 5 consecutive runs show consistent results (±1 test for known flakiness)
- [ ] Room queue verification test passes
- [ ] Negative verification tests pass
- [ ] Real combat test passes without debug HP manipulation
- [ ] test-swipe event is properly integrated in game code
- [ ] All test.skip() calls are justified
- [ ] Debug endpoints are properly guarded
