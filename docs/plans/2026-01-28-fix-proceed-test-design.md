# Fix "proceed advances room counter" Test

**Date:** 2026-01-28
**Status:** Design Complete

---

## Problem

The test "proceed advances room counter" in `run-and-exploration.spec.ts` is broken.

**Original test (flaky):** Started a run, hoped first room had a proceed button. If not, fell back to just checking room counter exists (not actually testing proceed).

**Broken "fix":** Used `queueRooms(['encounter', ...])` but encounters don't have proceed buttons - they have Fight buttons. The test was rewritten to test combat completion instead, which doesn't match the test name.

**Room types with proceed buttons:**
- `shrine` - after selecting a reward
- `quiz` - after answering
- `wordDiscovery` - after discovering word

Encounters do NOT have proceed buttons - they have Fight buttons.

---

## Solution

Queue a shrine room (which has a proceed button), complete the shrine interaction, then test clicking proceed.

```typescript
test('proceed advances room counter', async ({ gameHelper, page }) => {
  await gameHelper.enableDebugMode();
  // Queue shrine - it has a proceed button after selecting reward
  await gameHelper.queueRooms(['shrine', 'encounter', 'boss']);
  await gameHelper.setupRun();

  // Wait for shrine phase
  await gameHelper.waitForPhase(['shrine'], 5000);

  const roomBefore = await gameHelper.getCurrentRoom();

  // Complete shrine (select a reward) - this should show proceed button
  await gameHelper.completeShrineRoom();

  // Click proceed
  const proceedBtn = page.locator(SELECTORS.proceedBtn);
  await proceedBtn.click();

  // Room counter should advance
  const roomAfter = await gameHelper.getCurrentRoom();
  expect(roomAfter).toBeGreaterThan(roomBefore);
});
```

---

## Implementation Steps

1. Revert `run-and-exploration.spec.ts` to original (git checkout)
2. Revert `playwright.config.ts` to original (legacy project removal was untested)
3. Keep `queueRooms()` additions in other files (`meta-progression.spec.ts`, `settings.spec.ts`, `shop.spec.ts`)
4. Check if `completeShrineRoom()` helper exists in game-helpers.ts
5. Rewrite "proceed advances room counter" test using shrine approach
6. Run full test suite to confirm fix
7. Commit with clear message

---

## Success Criteria

- [ ] All 56 tests pass
- [ ] "proceed advances room counter" actually tests the proceed button
- [ ] No API hacks or page reloads in the test
- [ ] Test name matches what it tests
