# Kanji Kombat Combat Reuse Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kanji Kombat feel like normal creature combat by reusing the shared combat playback, KO, status, and run setup paths while preserving mode-specific script SRS, quiz, streak, and wave rules.

**Architecture:** Keep Kanji Kombat's separate learning controller and wave lifecycle, because normal room victory cleanup is intentionally wrong for this mode. Move combat presentation and actor consequences back into shared combat-loop and combat-service primitives. Treat the quiz answer as a different input source for the same action-result pipeline, not as a second client combat loop.

**Tech Stack:** Node.js ES modules, Express routes, vanilla frontend JS, existing Koto combat services, Node test runner.

**Execution Note:** Do not create git commits while executing this plan unless the user explicitly asks for commits. The commit snippets below are retained only as optional checkpoints for a human operator.

---

## File Structure

- Modify `public/js/ui/combat-loop.js` - extract shared server-result playback and add a Kanji Kombat answer executor that uses it.
- Modify `public/js/ui/kanji-kombat.js` - keep rendering quiz/intro UI, but delegate answer playback to combat-loop instead of doing state-sync-only updates.
- Modify `public/game.js` - inject the combat-loop Kanji Kombat executor into the quiz UI.
- Modify `src/game/services/creature-combat-service.js` - make synthetic/no-op actor actions apply the same actor mini-round effects and MP regen as regular cursor actions.
- Modify `src/game/services/combat-cycle-service.js` - apply shared KO processing in Kanji Kombat result finalization.
- Modify `src/game/services/kanji-kombat-service.js` - snapshot cleared-wave enemies for playback before spawning the next wave; use shared run creature instantiation invariants.
- Modify `tests/unit/ui/kanji-kombat-ui.test.js` - assert quiz answers are delegated to the injected playback handler.
- Modify `tests/unit/combat/kanji-kombat-action.test.js` - cover synthetic/no-op mini-round behavior.
- Create `tests/unit/combat/kanji-kombat-finalization.test.js` - cover KO removal and old-enemy playback snapshots on wave clear.
- Modify `tests/integration/flows/kanji-kombat.test.js` - cover answer payload shape for shared playback.

## Task 1: Lock In The Desired Client Contract

**Files:**
- Modify: `tests/unit/ui/kanji-kombat-ui.test.js`
- Modify: `public/js/ui/kanji-kombat.js`

- [ ] **Step 1: Write a failing UI delegation test**

Add this test to `tests/unit/ui/kanji-kombat-ui.test.js`:

```javascript
it('delegates quiz answers to the injected combat playback handler', async () => {
  const quiz = {
    prompt: '火',
    choices: [
      { id: 'fire', answer: 'Fire' },
      { id: 'water', answer: 'Water' },
    ],
  };
  const calls = [];

  renderKanjiKombatQuiz(quiz, {
    onAnswer: async answerId => {
      calls.push(answerId);
      return { handledByCombatLoop: true };
    },
  });

  const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
  await first.click();

  assert.deepEqual(calls, ['fire']);
});
```

Add this test to the same file to document that `renderKanjiKombatAction()` no longer does its own state-only combat update after answers:

```javascript
it('uses submitAnswer as the owner of quiz result playback', async () => {
  const state = {
    run: {
      mode: 'kanjiKombat',
      kanjiKombat: {
        currentQuiz: {
          prompt: '火',
          choices: [{ id: 'fire', answer: 'Fire' }],
        },
      },
    },
    combat: { actionCursor: { side: 'ally', index: 0 } },
  };
  let updateUICalls = 0;
  const submitted = [];

  const { initKanjiKombatUI, renderKanjiKombatAction } = await import('../../../public/js/ui/kanji-kombat.js');
  initKanjiKombatUI({
    submitAnswer: async answerId => {
      submitted.push(answerId);
      return { handledByCombatLoop: true };
    },
    submitIntro: async () => ({}),
    updateGameState: () => {},
    updateUI: () => { updateUICalls += 1; },
  });

  assert.equal(renderKanjiKombatAction(state), true);
  const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
  await first.click();

  assert.deepEqual(submitted, ['fire']);
  assert.equal(updateUICalls, 0);
});
```

- [ ] **Step 2: Run the UI test to verify failure**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: FAIL because `renderKanjiKombatAction()` still calls `api.updateGameState()` and `api.updateUI()` after `submitAnswer()`.

- [ ] **Step 3: Make answer playback owned by the injected submitter**

Modify the `kk.currentQuiz` branch in `public/js/ui/kanji-kombat.js` to this exact structure:

```javascript
  if (kk.currentQuiz) {
    renderKanjiKombatQuiz(kk.currentQuiz, {
      onAnswer: async answerId => {
        const result = await api.submitAnswer(answerId);
        if (result?.handledByCombatLoop) return;
        if (result?.state) api.updateGameState(result.state);
        api.updateUI();
      },
    });
    return true;
  }
```

Leave the intro branch state-sync-only for now. Intro grading intentionally does not resolve combat.

- [ ] **Step 4: Run the UI test**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 5: Optional commit checkpoint**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Route Kanji Kombat quiz answers through playback

EOF
)"
```

## Task 2: Extract Shared Combat Result Playback

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Test: existing combat UI/unit tests

- [ ] **Step 1: Identify the exact code to extract**

In `public/js/ui/combat-loop.js`, inside `executeCreatureMovesTurn(choices)`, keep request submission and error handling in place, but extract only the deterministic result-playback section that starts immediately after:

```javascript
      if (result.state) {
        updateGameState(mergeAuthoritativeCombatState(getGameState(), result));
      }
```

and ends immediately after the existing next-selection path:

```javascript
      playerAttackPending = false;

      // Start next turn's move selection
      await delay(600);
      logCombatTurnTiming(turnTiming, result, 'next_selection');
      startMoveSelection();
```

Do not move the surrounding `try/catch`, request submission, null/error recovery, or pre-request intent logging. The extracted function must preserve behavior for normal PvE before Kanji Kombat uses it.

- [ ] **Step 2: Add the shared playback function shell**

Add this function above `executeCreatureMovesTurn()`:

```javascript
async function playCreatureCombatResult(result, turnTiming, options = {}) {
  const { choices = [], logMoveIntent = true, nextSelectionDelayMs = 600 } = options;

  if (result.state) {
    updateGameState(mergeAuthoritativeCombatState(getGameState(), result));
  }

  // Move the existing post-response playback body from executeCreatureMovesTurn()
  // into this function. Preserve animation and state-sync order.
}
```

When moving the body, keep these two small adaptations:

```javascript
      if (logMoveIntent && _log) {
        const gs = getGameState();
        const allies = gs?.combat?.allies || gs?.run?.creatureParty?.active || [];
        const enemies = gs?.combat?.enemies || [];
        const moveDesc = choices.map(c => {
          const creature = allies[c.creatureIndex];
          const moveName = creature?.moves?.find(m => m.id === c.moveId)?.nameEn || '?';
          const target = c.targetIndex >= 0 ? (enemies[c.targetIndex]?.nameEn || '?') : 'AoE/Self';
          return `${creature?.nameEn || '?'}->${moveName}->${target}`;
        }).join(', ');
        _log.act(`Attack: ${moveDesc}`);
      }
```

Do not change animation order in this task.

- [ ] **Step 3: Replace the original playback body with a call**

Inside `executeCreatureMovesTurn(choices)`, after successful result/error handling, call:

```javascript
      await playCreatureCombatResult(result, turnTiming, {
        choices,
        logMoveIntent: false,
      });
```

Keep the pre-request intent log at the top of `executeCreatureMovesTurn()` as-is. The `logMoveIntent: false` flag prevents duplicate intent entries.

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check public/js/ui/combat-loop.js
```

Expected: exit 0.

- [ ] **Step 5: Run focused combat UI regressions**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/befriend.test.js tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS. If this repo does not have a focused playback unit test, rely on syntax plus the full combat regression suite in Task 8.

- [ ] **Step 6: Optional commit checkpoint**

```bash
/usr/bin/git add public/js/ui/combat-loop.js
/usr/bin/git commit -m "$(cat <<'EOF'
Extract shared creature combat playback

EOF
)"
```

## Task 3: Use Shared Playback For Kanji Kombat Answers

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/game.js`
- Test: `tests/unit/ui/kanji-kombat-ui.test.js`

- [ ] **Step 1: Add the Kanji Kombat API dependency to combat-loop**

In `public/js/ui/combat-loop.js`, add module state near the other API callbacks:

```javascript
let apiSubmitKanjiKombatAnswer = null;
```

In `init(callbacks)`, assign:

```javascript
  apiSubmitKanjiKombatAnswer = callbacks.apiSubmitKanjiKombatAnswer;
```

- [ ] **Step 2: Add the Kanji Kombat answer executor**

Add this exported function near `executeCreatureMovesTurn()`:

```javascript
export async function executeKanjiKombatAnswer(answerId) {
  if (!combatActive || playerAttackPending || getEnemyDialogueActive()) {
    return { handledByCombatLoop: true, skipped: true };
  }
  if (typeof apiSubmitKanjiKombatAnswer !== 'function') {
    throw new Error('Kanji Kombat API is not configured');
  }

  playerAttackPending = true;
  const turnTiming = createCombatTurnTiming('kanjiKombat');

  return withAnimationActive(async () => {
    try {
      const log = getLog();
      if (log) {
        log.act('Kanji Kombat answer submitted');
        log.expect('Quiz answer resolves through normal combat playback.');
      }

      const requestStartedAt = performance.now();
      const result = await apiSubmitKanjiKombatAnswer(answerId);
      markCombatAnimationStart(turnTiming, requestStartedAt);

      if (!result) {
        const recovery = await recoverFromNullCombatPost('attack');
        logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
        if (recovery.recovered) return { handledByCombatLoop: true, recovered: true };
        throw new Error('Kanji Kombat sync failed');
      }

      if (result.error) {
        if (result.state) {
          const recovery = recoverFromCombatErrorState(result, 'attack');
          logCombatTurnTiming(turnTiming, result, recovery.outcome, !recovery.recovered);
          if (recovery.recovered) return { handledByCombatLoop: true, recovered: true };
        }
        console.error('Kanji Kombat answer error:', result.error);
        playerAttackPending = false;
        if (combatActive) startMoveSelection();
        logCombatTurnTiming(turnTiming, result, 'server_error', true);
        return { handledByCombatLoop: true, error: result.error };
      }

      await playCreatureCombatResult(result, turnTiming, {
        actionType: 'kanjiKombat',
        choices: [],
        logMoveIntent: false,
      });

      return { handledByCombatLoop: true, result };
    } catch (error) {
      console.error('Kanji Kombat answer error:', error);
      playerAttackPending = false;
      if (!turnTiming.logged) {
        logCombatTurnTiming(turnTiming, null, 'exception', true);
      }
      if (combatActive) startMoveSelection();
      return { handledByCombatLoop: true, error: error.message };
    }
  });
}
```

- [ ] **Step 3: Wire the API into combat-loop init**

In `public/game.js`, where `combatLoopUI.init({ ... })` is called, add:

```javascript
    apiSubmitKanjiKombatAnswer,
```

- [ ] **Step 4: Pass the combat-loop executor to Kanji Kombat UI**

In `public/game.js`, change the Kanji Kombat UI initialization from:

```javascript
    submitAnswer: apiSubmitKanjiKombatAnswer,
```

to:

```javascript
    submitAnswer: combatLoopUI.executeKanjiKombatAnswer,
```

Keep:

```javascript
    submitIntro: apiSubmitKanjiKombatIntro,
```

because intro choices do not resolve combat.

- [ ] **Step 5: Run syntax checks**

Run:

```bash
node --check public/js/ui/combat-loop.js
node --check public/game.js
```

Expected: both exit 0.

- [ ] **Step 6: Run UI tests**

Run:

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 7: Optional commit checkpoint**

```bash
/usr/bin/git add public/js/ui/combat-loop.js public/game.js tests/unit/ui/kanji-kombat-ui.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Play Kanji Kombat answers through combat loop

EOF
)"
```

## Task 4: Make Synthetic And No-Op Actions Use Actor Mini-Rounds

**Files:**
- Modify: `src/game/services/creature-combat-service.js`
- Modify: `tests/unit/combat/kanji-kombat-action.test.js`

- [ ] **Step 1: Add failing mini-round tests**

Add these tests to `tests/unit/combat/kanji-kombat-action.test.js`:

```javascript
it('applies ally mini-round MP regen after a synthetic action', () => {
  const ally = creature('ally', { mp: 0, maxMp: 100 });
  const enemy = creature('enemy', { hp: 20, maxHp: 20 });
  const result = resolveSyntheticActorAction({
    actorSide: 'ally',
    actorIndex: 0,
    allies: [ally],
    enemies: [enemy],
    syntheticMove: {
      id: 'kanji-kombat-strike',
      name: 'Kanji Kombat Strike',
      power: 15,
      element: 'fire',
      target: 'single_enemy',
      mpCost: 0,
    },
    targetIndex: 0,
  });

  assert.equal(ally.mp, 5);
  assert.equal(result.actionSegments[0].mpRegens[0].regen, 5);
});

it('applies ally mini-round MP regen after a no-op action', () => {
  const ally = creature('ally', { mp: 0, maxMp: 100 });
  const enemy = creature('enemy');
  const result = resolveNoopActorAction({
    actorSide: 'ally',
    actorIndex: 0,
    allies: [ally],
    enemies: [enemy],
  });

  assert.equal(ally.mp, 5);
  assert.equal(result.actionSegments[0].mpRegens[0].regen, 5);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-action.test.js
```

Expected: FAIL because synthetic/no-op actions currently do not call `resolveActorMiniRound()`.

- [ ] **Step 3: Update `resolveSyntheticActorAction()`**

In `src/game/services/creature-combat-service.js`, inside `resolveSyntheticActorAction()`, after pushing attacks and XP events, add:

```javascript
  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);
```

Then return the segment's effect and MP arrays:

```javascript
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
```

- [ ] **Step 4: Update `resolveNoopActorAction()`**

Replace the current implementation of `resolveNoopActorAction()` with:

```javascript
export function resolveNoopActorAction({ actorSide, actorIndex, allies, enemies, playbackStart = 0 }) {
  const actor = actorSide === 'ally' || actorSide === 'sideA'
    ? allies?.[actorIndex]
    : enemies?.[actorIndex];
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: !actor || actor.hp <= 0 || isIncapacitated(actor),
    noop: true,
  };

  if (!segment.skipped) {
    const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
    segment.effectEvents.push(...miniRound.effectEvents);
    segment.mpRegens.push(...miniRound.mpRegens);
  }

  return {
    actionSegments: [segment],
    attacks: [],
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: [],
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackStart,
  };
}
```

- [ ] **Step 5: Run action tests**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-action.test.js
```

Expected: PASS.

- [ ] **Step 6: Optional commit checkpoint**

```bash
/usr/bin/git add src/game/services/creature-combat-service.js tests/unit/combat/kanji-kombat-action.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Apply mini-round effects to Kanji Kombat actions

EOF
)"
```

## Task 5: Reuse Shared KO Handling In Kanji Kombat Finalization

**Files:**
- Modify: `src/game/services/combat-cycle-service.js`
- Create: `tests/unit/combat/kanji-kombat-finalization.test.js`

- [ ] **Step 1: Write failing KO finalization tests**

Create `tests/unit/combat/kanji-kombat-finalization.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';

function creature(id, hp = 20) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp,
    maxHp: 20,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
  };
}

function buildGm() {
  const allyA = creature('ally-a', 0);
  const allyB = creature('ally-b', 20);
  const gm = {
    run: {
      mode: 'kanjiKombat',
      active: true,
      creatureParty: {
        active: [allyA, allyB],
        reserves: [],
        maxTotal: 3,
      },
      kanjiKombat: {
        report: {
          wavesCleared: 0,
          minibossesDefeated: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          cardsReviewed: 0,
          newCardsIntroduced: 0,
        },
      },
    },
    combat: {
      active: true,
      allies: [allyA, allyB],
      enemies: [creature('enemy', 20)],
    },
    emitState() {},
    kanjiKombatService: {
      finalizeDefeat(args) {
        return { actionType: 'kanjiKombat', combatEnded: true, victory: false, ...args };
      },
      completeWaveAndMaybeStartNext(args) {
        return { actionType: 'kanjiKombat', nextWave: true, ...args };
      },
    },
  };
  gm.combatCycleService = new CombatCycleService(gm);
  return gm;
}

describe('Kanji Kombat combat finalization', () => {
  it('removes KO allies using shared KO processing before continuing', () => {
    const gm = buildGm();
    const result = gm.combatCycleService._finalizeKanjiKombatActionResult({
      actionSegments: [],
    });

    assert.equal(result.combatEnded, false);
    assert.deepEqual(gm.run.creatureParty.active.map(c => c.id), ['ally-b']);
    assert.deepEqual(gm.combat.allies.map(c => c.id), ['ally-b']);
    assert.deepEqual(result.koRemovals, [{ slot: 0, name: 'ally-a' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-finalization.test.js
```

Expected: FAIL because `_finalizeKanjiKombatActionResult()` does not call `processKOSwaps()` or return KO metadata.

- [ ] **Step 3: Apply shared KO handling**

In `src/game/services/combat-cycle-service.js`, inside `_finalizeKanjiKombatActionResult(result)`, after computing flattened attacks and before `allEnemiesDown` / `allAlliesDown`, add:

```javascript
    const { koSwaps: rawKoSwaps, koRemovals: rawKoRemovals } = processKOSwaps(
      this.gm.combat.allies,
      this.gm.run.creatureParty
    );
    const koSwaps = rawKoSwaps.map(s => ({ slot: s.index, replacement: s.replacement.nameEn }));
    const koRemovals = rawKoRemovals.map(r => ({ slot: r.index, name: r.name }));
    this.gm.combat.allies = this.gm.run.creatureParty.active;
```

Include `koSwaps` and `koRemovals` in every return object from `_finalizeKanjiKombatActionResult()`, including calls into `finalizeDefeat()` and `completeWaveAndMaybeStartNext()`:

```javascript
      return this.gm.kanjiKombatService.finalizeDefeat({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals
      });
```

and:

```javascript
      return this.gm.kanjiKombatService.completeWaveAndMaybeStartNext({
        actionSegments,
        flatPlayerAttacks,
        flatEnemyAttacks,
        xpEvents,
        koSwaps,
        koRemovals
      });
```

In the non-terminal return, add:

```javascript
      koSwaps,
      koRemovals,
```

- [ ] **Step 4: Update Kanji Kombat service method signatures**

In `src/game/services/kanji-kombat-service.js`, update both methods to accept and return KO metadata:

```javascript
  completeWaveAndMaybeStartNext({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
```

and:

```javascript
  finalizeDefeat({
    actionSegments = [],
    flatPlayerAttacks = [],
    flatEnemyAttacks = [],
    xpEvents = [],
    koSwaps = [],
    koRemovals = []
  } = {}) {
```

Add these fields to their result objects:

```javascript
        koSwaps,
        koRemovals,
```

- [ ] **Step 5: Run finalization tests**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-finalization.test.js
```

Expected: PASS.

- [ ] **Step 6: Run existing Kanji Kombat wave tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-wave.test.js
```

Expected: PASS.

- [ ] **Step 7: Optional commit checkpoint**

```bash
/usr/bin/git add src/game/services/combat-cycle-service.js src/game/services/kanji-kombat-service.js tests/unit/combat/kanji-kombat-finalization.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Reuse KO handling for Kanji Kombat

EOF
)"
```

## Task 6: Preserve Cleared-Wave Enemies For Playback

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/combat/kanji-kombat-finalization.test.js`
- Modify: `tests/integration/flows/kanji-kombat.test.js`

- [ ] **Step 1: Add a failing playback snapshot test**

Add this test to `tests/unit/combat/kanji-kombat-finalization.test.js`:

```javascript
it('returns defeated wave enemies for playback while state advances to next wave', () => {
  const oldEnemy = creature('old-enemy', 0);
  const newEnemy = creature('new-enemy', 20);
  const gm = {
    userId: 'wave-snapshot-user',
    run: {
      mode: 'kanjiKombat',
      active: true,
      creatureParty: { active: [creature('ally', 20)], reserves: [], maxTotal: 3 },
      kanjiKombat: {
        wave: 1,
        currentWaveIsMiniboss: false,
        localDate: '2026-05-31',
        report: {
          wavesCleared: 0,
          minibossesDefeated: 0,
          correctAnswers: 1,
          wrongAnswers: 0,
          cardsReviewed: 1,
          newCardsIntroduced: 0,
          completedDaily: false,
        },
      },
    },
    combat: {
      active: true,
      allies: [],
      enemies: [oldEnemy],
    },
    emitState() {},
  };

  const service = new KanjiKombatService(gm);
  service.spawnNextWave = () => {
    gm.combat.enemies = [newEnemy];
    gm.combat.allies = gm.run.creatureParty.active;
  };

  const result = service.completeWaveAndMaybeStartNext({
    actionSegments: [],
    flatPlayerAttacks: [],
    flatEnemyAttacks: [],
    xpEvents: [],
  });

  assert.deepEqual(result.enemies.map(e => e.id), ['old-enemy']);
  assert.deepEqual(result.nextWaveEnemies.map(e => e.id), ['new-enemy']);
});
```

Import `KanjiKombatService` at the top of `tests/unit/combat/kanji-kombat-finalization.test.js`:

```javascript
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-finalization.test.js
```

Expected: FAIL because `completeWaveAndMaybeStartNext()` currently returns the new wave enemies as `result.enemies`.

- [ ] **Step 3: Snapshot old enemies before spawning**

In `src/game/services/kanji-kombat-service.js`, add this helper near `cloneCreature()`:

```javascript
function cloneCombatants(combatants = []) {
  return JSON.parse(JSON.stringify(combatants || []));
}
```

At the top of `completeWaveAndMaybeStartNext()`, before `recordWaveClear()` or `spawnNextWave()`, capture:

```javascript
    const clearedEnemies = cloneCombatants(this.gm.combat?.enemies || []);
```

In the `work.kind === 'complete'` return, use:

```javascript
        enemies: clearedEnemies,
```

In the next-wave branch, after `this.spawnNextWave();`, capture:

```javascript
    const nextWaveEnemies = cloneCombatants(this.gm.combat.enemies);
```

Return both:

```javascript
      enemies: clearedEnemies,
      nextWaveEnemies,
```

Do not put `nextWaveEnemies` into normal PvE responses. It is only a hint for Kanji Kombat UI/debugging. Authoritative state still comes from `result.state`.

- [ ] **Step 4: Add integration assertion**

In `tests/integration/flows/kanji-kombat.test.js`, after submitting a correct answer, add:

```javascript
    assert.equal(Array.isArray(result.actionSegments), true);
    assert.equal(Array.isArray(result.enemies), true);
```

If the answer clears a wave in the fixture, also assert:

```javascript
    if (result.nextWave) {
      assert.equal(Array.isArray(result.nextWaveEnemies), true);
    }
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/unit/combat/kanji-kombat-finalization.test.js tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 6: Optional commit checkpoint**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/combat/kanji-kombat-finalization.test.js tests/integration/flows/kanji-kombat.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Preserve Kanji Kombat wave playback enemies

EOF
)"
```

## Task 7: Share Run-Scoped Creature Initialization Invariants

**Files:**
- Modify: `src/game/services/kanji-kombat-service.js`
- Modify: `tests/unit/game/kanji-kombat-run.test.js`

- [ ] **Step 1: Add a failing crest/debug-invariant test**

Add this test to `tests/unit/game/kanji-kombat-run.test.js`:

```javascript
it('starts with a run-scoped creature that has normal combat fields', () => {
  const gm = buildGm();
  gm.meta.crests = [];
  gm.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
  const service = new KanjiKombatService(gm);

  service.startRunWithCreatureId('hi');

  const ally = gm.run.creatureParty.active[0];
  assert.equal(ally.id, 'hi');
  assert.equal(typeof ally.uid, 'string');
  assert.equal(Array.isArray(ally.moves), true);
  assert.equal(ally.hp, ally.maxHp);
  assert.equal(ally.mp, ally.maxMp);
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js
```

Expected: PASS may already happen. If it passes, keep the test as a guard before the refactor.

- [ ] **Step 3: Replace enemy-generation starter creation with creature instantiation**

In `src/game/services/kanji-kombat-service.js`, change imports from:

```javascript
import { generateEnemyCreature, generateEnemyCreatures, getEnemyLevel } from '../creatures.js';
```

to:

```javascript
import {
  generateEnemyCreature,
  generateEnemyCreatures,
  getEnemyLevel,
  instantiateCreatureForCombat
} from '../creatures.js';
import { getCrestMultipliers, applyCrestBonuses } from './crest-service.js';
```

Update `startRunWithCreatureId(creatureId)`:

```javascript
  startRunWithCreatureId(creatureId) {
    const collection = this.gm.meta?.creatureCollection || [];
    if (!collection.includes(creatureId)) {
      throw new Error('Selected creature is not unlocked');
    }
    const starter = instantiateCreatureForCombat(creatureId, 1);
    return this.startRunWithCreature(starter);
  }
```

Update `startRunWithCreature(creature)` after `this.gm.run = createNewRun(this.gm.player);`:

```javascript
    const crestMults = getCrestMultipliers(this.gm.meta);
    this.gm.run.crestMults = crestMults;
    this.gm.run.itemBuffs.xpMultiplier = crestMults.xpMult;
```

After assigning active party:

```javascript
    for (const ally of this.gm.run.creatureParty.active) {
      applyCrestBonuses(ally, crestMults);
    }
```

Do not import `applyDebugSuperAttack` from `../loop.js`; that would create a service-to-GameManager circular dependency. Debug super attack parity can be handled in a later small follow-up by moving the helper into a neutral module if needed.

- [ ] **Step 4: Run run lifecycle tests**

Run:

```bash
node --test tests/unit/game/kanji-kombat-run.test.js
```

Expected: PASS.

- [ ] **Step 5: Optional commit checkpoint**

```bash
/usr/bin/git add src/game/services/kanji-kombat-service.js tests/unit/game/kanji-kombat-run.test.js
/usr/bin/git commit -m "$(cat <<'EOF'
Share Kanji Kombat creature run setup

EOF
)"
```

## Task 8: Regression Verification

**Files:**
- No source edits unless tests expose regressions.

- [ ] **Step 1: Run Kanji Kombat targeted tests**

Run:

```bash
node --test \
  tests/unit/game/script-decks.test.js \
  tests/unit/game/script-srs.test.js \
  tests/unit/game/kanji-kombat-deck.test.js \
  tests/unit/game/kanji-kombat-run.test.js \
  tests/unit/game/kanji-kombat-wave.test.js \
  tests/unit/combat/kanji-kombat-action.test.js \
  tests/unit/combat/kanji-kombat-finalization.test.js \
  tests/unit/routes/kanji-kombat-routes.test.js \
  tests/unit/ui/kanji-kombat-ui.test.js \
  tests/unit/game/kanji-kombat-report.test.js \
  tests/integration/flows/kanji-kombat.test.js
```

Expected: PASS.

- [ ] **Step 2: Run combat cursor and payload regressions**

Run:

```bash
node --test \
  tests/unit/combat/action-cursor.test.js \
  tests/unit/combat/kanji-kombat-action.test.js \
  tests/unit/combat/kanji-kombat-finalization.test.js \
  tests/unit/routes/kanji-kombat-routes.test.js \
  tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS.

- [ ] **Step 3: Syntax-check touched frontend files**

Run:

```bash
node --check public/js/ui/combat-loop.js
node --check public/js/ui/kanji-kombat.js
node --check public/game.js
```

Expected: all exit 0.

- [ ] **Step 4: Run full suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Optional commit checkpoint for regression fixes**

Only if Step 1-4 required fixes:

```bash
/usr/bin/git add public/js/ui/combat-loop.js public/js/ui/kanji-kombat.js public/game.js src/game/services/creature-combat-service.js src/game/services/combat-cycle-service.js src/game/services/kanji-kombat-service.js tests
/usr/bin/git commit -m "$(cat <<'EOF'
Stabilize Kanji Kombat combat reuse

EOF
)"
```

## Task 9: Visual Verification

**Files:**
- No planned source edits unless visual verification reveals a defect.

- [ ] **Step 1: Ask before Playwright**

Project rules require asking before opening Playwright. Ask the user:

```text
Can I open Playwright to visually verify Kanji Kombat combat playback?
```

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite and Express dev server starts.

- [ ] **Step 3: Verify local server health**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 4: Playtest the fixed flow**

After user approval, use Playwright MCP:

1. Navigate to `http://localhost:5173`.
2. Reach the hub.
3. Start `Kanji Kombat`.
4. Select one unlocked creature.
5. Answer a quiz correctly.
6. Verify the normal attack card, lunge/VFX, HP drain, KO animation, and enemy response playback occur.
7. Answer a quiz incorrectly.
8. Verify no ally attack occurs, but the consumed turn and subsequent enemy turns play through the same combat-loop presentation.
9. Clear a wave.
10. Verify old enemies animate out before the new wave appears.
11. End by defeat or daily completion if practical and verify the adapted report appears without a defeat-flavored false title for daily completion.

- [ ] **Step 5: Delete screenshots immediately**

If screenshots are created under `tmp/`, delete them in the same verification pass:

```bash
rm -f tmp/kanji-kombat-*.png
```

Expected: no screenshots remain.

## Self-Review Checklist

- Spec coverage:
  - Keep separate script SRS and daily cadence: no changes to those boundaries.
  - Correct answer remains server-owned synthetic action: Task 3 uses existing `/kanji-kombat/answer`.
  - Wrong answer remains server-owned no-op: Task 4 only adds normal actor mini-round consequences.
  - Combat turn order remains shared action cursor: unchanged.
  - Combat rendering/VFX reused: Tasks 2 and 3.
  - KO handling reused: Task 5.
  - Wave lifecycle remains separate from room victory cleanup: Task 6 keeps custom wave handler.
  - Run-scoped creature setup shares normal invariants: Task 7.
- Placeholder scan:
  - No task uses "TBD", "TODO", or "add appropriate handling".
  - The one extraction task names the exact source block to move and the exact function shell.
- Type consistency:
  - `handledByCombatLoop` is returned only by the injected client executor, not by the server.
  - Server result remains `actionType: 'kanjiKombat'`.
  - `nextWaveEnemies` is additive and Kanji Kombat-only.
  - `koSwaps` and `koRemovals` match existing PvE response shapes.

