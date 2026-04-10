# Simulator Exposure Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant word exposure shadow-tracking from the simulator and use the game server as the single source of truth for learning metrics.

**Architecture:** The simulator drives real game server APIs. The server already tracks word exposure via `GameManager.exposeWords()` and produces per-run summaries via `buildRunSummary()`. We strip local `word_exposure`/`word_learned` event logging from all simulator files and instead capture the server's `runSummary` from the forfeit response plus known-words snapshots at day boundaries.

**Tech Stack:** Node.js, Express, SQLite (better-sqlite3), game server REST API

**Spec:** `docs/superpowers/specs/2026-04-10-simulator-exposure-alignment-design.md`

---

## Chunk 1: Strip exposure events from room handlers

### Task 1: Simplify friendly-npc handler

**Files:**
- Modify: `simulator/engine/rooms/friendly-npc.js:21-45`

- [ ] **Step 1: Remove word_exposure logging from friendly-npc.js**

Remove the `exposedWords` array, the item word exposure loop (lines 21-33), and the NPC name exposure block (lines 35-45). Keep the `room_entered`, `item_acquired` events and all API calls intact.

The file should go from:

```js
  const offered = offersResult.data.offered;

  // Track word exposures for ALL offered items (player sees all 3)
  const exposedWords = [];
  for (const item of offered) {
    if (item.word) {
      logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
        word: item.word,
        reading: item.reading || '',
        meaning: item.nameEn || '',
        source: 'npc_shop_item'
      });
      exposedWords.push({ word: item.word, meaning: item.nameEn || '' });
    }
  }

  // Track NPC name as word exposure
  const npc = offersResult.data.state?.room?.npc;
  if (npc?.name && npc?.nameEn) {
    logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
      word: npc.name,
      reading: '',
      meaning: npc.nameEn,
      source: 'npc_name'
    });
    exposedWords.push({ word: npc.name, meaning: npc.nameEn });
  }

  const chosen = offered[0];
```

To:

```js
  const offered = offersResult.data.offered;

  const chosen = offered[0];
```

Also update the module doc comment (line 5) from "Tracks all offered item words as exposures (mirrors frontend behavior)." to "Server handles word exposure natively."

- [ ] **Step 2: Run syntax check**

Run: `node --check simulator/engine/rooms/friendly-npc.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add simulator/engine/rooms/friendly-npc.js
git commit -m "refactor(simulator): strip word_exposure from friendly-npc handler

Server handles exposure natively via GameManager.exposeWords()."
```

### Task 2: Simplify word-discovery handler

**Files:**
- Modify: `simulator/engine/rooms/word-discovery.js:25-44`

- [ ] **Step 1: Remove word_exposure and word_learned logging**

Remove the exposure loop (lines 25-31) and the `word_learned` logging inside the accuracy block (lines 37-43). Keep the API calls (`discovery-words`, `complete-discovery`) and `room_entered` event.

The file should go from:

```js
  const wordList = Array.isArray(words) ? words : [];

  // Log exposure for each word
  for (const word of wordList) {
    logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
      word: word.word ?? word.spelling ?? word,
      source: 'discovery'
    });
  }

  // Simulate player accuracy
  if (Math.random() < context.wordDiscoveryAccuracy) {
    const completeResult = await simCall('POST', '/api/game/complete-discovery', null, 'word discovery complete');

    if (completeResult.ok) {
      for (const word of wordList) {
        logEvent(context.day, context.run, context.roomIndex, 'word_learned', {
          word: word.word ?? word.spelling ?? word,
          source: 'discovery'
        });
      }
    }
  }
```

To:

```js
  const wordList = Array.isArray(words) ? words : [];

  // Simulate player accuracy — server handles exposure tracking
  if (Math.random() < context.wordDiscoveryAccuracy) {
    await simCall('POST', '/api/game/complete-discovery', null, 'word discovery complete');
  }
```

- [ ] **Step 2: Run syntax check**

Run: `node --check simulator/engine/rooms/word-discovery.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add simulator/engine/rooms/word-discovery.js
git commit -m "refactor(simulator): strip word_exposure from word-discovery handler"
```

### Task 3: Simplify speed-review handler

**Files:**
- Modify: `simulator/engine/rooms/speed-review.js:46-58`

- [ ] **Step 1: Remove word_exposure and word_learned logging**

Remove the `word_exposure` logEvent (lines 46-50) and the `word_learned` logEvent (lines 53-57). The API call to `/api/game/known-words/review` is the real review — keep it. The `reviewed` counter stays.

The review loop body should go from:

```js
    // Submit review
    const reviewResult = await simCall('POST', '/api/game/known-words/review', { word, grade }, `speed review grade ${i}`);

    logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
      word,
      grade,
      source: 'speed_review'
    });

    // Check if word was mastered
    if (reviewResult.ok && reviewResult.data?.mastered) {
      logEvent(context.day, context.run, context.roomIndex, 'word_learned', {
        word,
        source: 'speed_review'
      });
    }

    reviewed++;
```

To:

```js
    // Submit review — server handles exposure/mastery tracking
    await simCall('POST', '/api/game/known-words/review', { word, grade }, `speed review grade ${i}`);

    reviewed++;
```

- [ ] **Step 2: Run syntax check**

Run: `node --check simulator/engine/rooms/speed-review.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add simulator/engine/rooms/speed-review.js
git commit -m "refactor(simulator): strip word_exposure from speed-review handler"
```

## Chunk 2: Simplify combat.js

### Task 4: Strip word_exposure from combat, simplify barks, add befriend prompt logging

**Files:**
- Modify: `simulator/engine/combat.js:24-25, 105-140, 147-177`

- [ ] **Step 1: Remove `wordsExposed` tracking array and update JSDoc**

On line 17, update the `@returns` JSDoc to remove `wordsExposed`:

```js
 * @returns {{ rounds: number, won: boolean, wiped: boolean, barks: Array, dialogueSeen: Array }}
```

On line 25, remove the `wordsExposed` array declaration. On line 217, remove `wordsExposed` from the return value.

Line 24-26 changes from:

```js
  const barks = [];
  const wordsExposed = [];
  const dialogueSeen = [];
```

To:

```js
  const barks = [];
  const dialogueSeen = [];
```

Line 217 changes from:

```js
  return { rounds, won, wiped, barks, wordsExposed, dialogueSeen };
```

To:

```js
  return { rounds, won, wiped, barks, dialogueSeen };
```

- [ ] **Step 2: Remove word_exposure logging from attack data extraction**

Remove the entire block at lines 105-132 (the `allAttacks` loop that logs `word_exposure` events for creature names and move names). The server's `GameManager.exposeWords()` already handles this during the combat cycle.

Delete lines 105-132:

```js
    // Extract word exposures from attack data
    const allAttacks = [...(cycle.playerAttacks ?? []), ...(cycle.enemyAttacks ?? [])];
    for (const atk of allAttacks) {
      if (atk.attackerBaseWord) {
        const word = atk.attackerBaseWord;
        if (!wordsExposed.includes(word)) {
          wordsExposed.push(word);
          logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
            word,
            reading: atk.attackerBaseReading,
            meaning: atk.attackerBaseMeaning,
            source: 'combat_creature'
          });
        }
      }
      if (atk.moveName && atk.moveName !== atk.attackerBaseWord) {
        const word = atk.moveName;
        if (!wordsExposed.includes(word)) {
          wordsExposed.push(word);
          logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
            word,
            reading: atk.attackerSkillReading,
            meaning: atk.attackerSkillEn,
            source: 'combat_move'
          });
        }
      }
    }
```

- [ ] **Step 3: Replace bark handling with dialogue logging**

Replace lines 134-140:

```js
    // Collect barks (legacy field)
    if (cycle.barks) {
      for (const bark of cycle.barks) {
        barks.push(bark);
        if (bark.word) wordsExposed.push(bark.word);
      }
    }
```

With:

```js
    // Log barks as dialogue (server handles word exposure)
    if (cycle.barks) {
      for (const bark of cycle.barks) {
        barks.push(bark);
        if (bark.text) {
          dialogueSeen.push(bark);
          logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
            source: 'combat_bark',
            trigger: bark.trigger,
            line: bark.text
          });
        }
      }
    }
```

- [ ] **Step 4: Add befriend prompt dialogue logging**

Inside the befriend quiz block (after `if (cycle.befriendQuizTriggered && cycle.befriendQuiz) {` on line 147), add prompt logging before the quiz answer. Insert right after `const quiz = cycle.befriendQuiz;` (line 148):

```js
      // Log befriend prompts as dialogue (server handles word exposure)
      for (const key of ['waitPrompt', 'namePrompt', 'successPrompt', 'wrongPrompt']) {
        const prompt = quiz[key];
        if (prompt?.tokens) {
          dialogueSeen.push({ type: key, tokens: prompt.tokens });
          logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
            source: 'befriend_prompt',
            promptType: key,
            tokens: prompt.tokens
          });
        }
      }
```

- [ ] **Step 5: Run syntax check**

Run: `node --check simulator/engine/combat.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add simulator/engine/combat.js
git commit -m "refactor(simulator): strip word_exposure from combat, add bark/befriend dialogue logging

Barks now logged as dialogue_seen with trigger and text.
Befriend prompts logged as dialogue_seen with token data.
Server handles all word exposure natively."
```

## Chunk 3: Rewrite runner.js metrics

### Task 5: Remove CID dead code and hub review exposure logging

**Files:**
- Modify: `simulator/engine/runner.js:140-152, 244-256`

- [ ] **Step 1: Remove dead CID script processing**

Remove lines 140-152 (the `cidScript` block). Server returns `cidScript: null`.

Delete:

```js
        // Log CID dialogue from cidScript
        const cidScript = startRunResult.data?.cidScript;
        if (cidScript) {
          const lines = cidScript.lines || (Array.isArray(cidScript) ? cidScript : [cidScript]);
          for (const line of lines) {
            if (line) {
              logEvent(day, run, 0, 'dialogue_seen', {
                source: 'cid',
                line: typeof line === 'string' ? line : line.text ?? JSON.stringify(line)
              });
            }
          }
        }
```

- [ ] **Step 2: Strip word_exposure/word_learned from hub speed reviews**

Replace the review call and event logging (lines 243-256):

```js
            const reviewResult = await simCall('POST', '/api/game/known-words/review', { word, grade }, `hub review ${word}`);

            logEvent(day, run, 0, 'word_exposure', {
              word,
              grade,
              source: 'speed_review'
            });

            if (reviewResult.ok && reviewResult.data?.mastered) {
              logEvent(day, run, 0, 'word_learned', {
                word,
                source: 'speed_review'
              });
            }
```

With:

```js
            await simCall('POST', '/api/game/known-words/review', { word, grade }, `hub review ${word}`);
            hubReviewsToday++;
```

The `reviewResult` variable is no longer needed (server handles mastery tracking). The `hubReviewsToday` counter is declared at day scope in Task 7 Step 1.

- [ ] **Step 3: Run syntax check**

Run: `node --check simulator/engine/runner.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add simulator/engine/runner.js
git commit -m "refactor(simulator): remove dead CID code, strip hub review exposure logging"
```

### Task 6: Always forfeit with runSummary capture

**Files:**
- Modify: `simulator/engine/runner.js:218-227`

- [ ] **Step 1: Replace conditional forfeit + manual run_summary**

Replace lines 218-227:

```js
        // If wiped, forfeit the run to clean up combat/run state
        if (runWiped) {
          await simCall('POST', '/api/game/forfeit', null, `day ${day} run ${run} forfeit`);
        }

        // Log run summary
        logEvent(day, run, 0, 'run_summary', {
          wiped: runWiped,
          completed: !runWiped
        });
```

With:

```js
        // Always forfeit to close the run and capture server's runSummary
        const forfeitResult = await simCall('POST', '/api/game/forfeit',
          { isVictory: !runWiped }, `day ${day} run ${run} forfeit`);

        const serverRunSummary = forfeitResult.data?.runSummary ?? {};
        logEvent(day, run, 0, 'run_summary', {
          wiped: runWiped,
          completed: !runWiped,
          wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
          wordsMastered: serverRunSummary.wordsMastered ?? [],
          creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
          creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
          itemsCollected: serverRunSummary.itemsCollected ?? 0,
        });
```

- [ ] **Step 2: Run syntax check**

Run: `node --check simulator/engine/runner.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add simulator/engine/runner.js
git commit -m "refactor(simulator): always forfeit runs, capture server runSummary"
```

### Task 7: Replace daily snapshot metrics with server-derived data

**Files:**
- Modify: `simulator/engine/runner.js:97-316` (day loop)

- [ ] **Step 1: Add known-words snapshot at day start**

After `pos.day = day;` (line 98) and the `effectiveRuns` calculation (lines 99-102), add:

```js
      // Snapshot known words at day start
      const dayStartResult = await simCall('GET', '/api/game/known-words', null, `day ${day} start snapshot`);
      const dayStartCount = dayStartResult.ok ? (dayStartResult.data?.words?.length ?? 0) : 0;
```

Also add accumulators after the `crestDaily` block (after line 111):

```js
      let wordsImmersedToday = 0;
      let hubReviewsToday = 0;
```

Note: `hubReviewsToday` is incremented directly in the hub review loop (see Task 5 Step 2), eliminating the need for a per-run counter.

- [ ] **Step 2: Accumulate wordsImmersed from each run's summary**

After the `run_summary` logEvent from Task 6, add:

```js
        wordsImmersedToday += serverRunSummary.wordsImmersed ?? 0;
```

`hubReviewsToday` is already incremented directly in the hub review loop (Task 5 Step 2). No per-run accumulation needed.

- [ ] **Step 3: Replace daily snapshot metrics**

Replace lines 282-314 (everything from "Get total known words" through the `saveDailySnapshot` call):

```js
      // Get total known words
      let totalKnownWords = 0;
      const knownWordsResult = await simCall('GET', '/api/game/known-words', null, `day ${day} known words`);
      if (knownWordsResult.ok) {
        const kw = knownWordsResult.data;
        // Game server returns { words: [...] } from GET /api/game/known-words
        totalKnownWords = kw?.words?.length ?? kw?.total ?? kw?.count ?? (Array.isArray(kw) ? kw.length : 0);
      }

      // Count today's events
      const dayEvents = store.getEvents(simId, { day });
      const newWordsToday = dayEvents.filter(e => e.event_type === 'word_learned').length;
      const wordsExposedToday = dayEvents.filter(e => e.event_type === 'word_exposure').length;
      const dialogueLines = dayEvents.filter(e => e.event_type === 'dialogue_seen').length;
      const roomsExplored = dayEvents.filter(e => e.event_type === 'room_entered').length;
      const speedReviews = dayEvents.filter(e =>
        e.event_type === 'word_exposure' && e.data?.source === 'speed_review'
      ).length;

      // Save daily snapshot
      store.saveDailySnapshot(simId, day, {
        total_known_words: totalKnownWords,
        new_words_today: newWordsToday,
        words_exposed_today: wordsExposedToday,
        dialogue_lines_encountered: dialogueLines,
        runs_completed: runsCompleted,
        runs_wiped: runsWiped,
        rooms_explored: roomsExplored,
        speed_reviews_completed: speedReviews,
        unknown_words_in_dialogue: 0,
        snapshot_data: {
          crest: crestDaily
        }
      });
```

With:

```js
      // Snapshot known words at day end (server is source of truth)
      const dayEndResult = await simCall('GET', '/api/game/known-words', null, `day ${day} end snapshot`);
      const totalKnownWords = dayEndResult.ok ? (dayEndResult.data?.words?.length ?? 0) : 0;
      const newWordsToday = Math.max(0, totalKnownWords - dayStartCount);

      // Count dialogue and room events (simulator-only analytics)
      const dayEvents = store.getEvents(simId, { day });
      const dialogueLines = dayEvents.filter(e => e.event_type === 'dialogue_seen').length;
      const roomsExplored = dayEvents.filter(e => e.event_type === 'room_entered').length;

      // Save daily snapshot
      store.saveDailySnapshot(simId, day, {
        total_known_words: totalKnownWords,
        new_words_today: newWordsToday,
        words_exposed_today: wordsImmersedToday,
        dialogue_lines_encountered: dialogueLines,
        runs_completed: runsCompleted,
        runs_wiped: runsWiped,
        rooms_explored: roomsExplored,
        speed_reviews_completed: hubReviewsToday,
        unknown_words_in_dialogue: 0,
        snapshot_data: {
          crest: crestDaily
        }
      });
```

- [ ] **Step 4: Run syntax check**

Run: `node --check simulator/engine/runner.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add simulator/engine/runner.js
git commit -m "refactor(simulator): replace event-counting metrics with server snapshots

- Known words: server snapshot diff at day boundaries
- Words exposed: sum of wordsImmersed from run summaries
- Speed reviews: count of successful hub review API calls
- new_words_today clamped to 0 (FSRS can demote words)"
```

## Chunk 4: Dashboard cleanup and tests

### Task 8: Remove legacy word_learned fallback in dashboard results.js

**Files:**
- Modify: `simulator/public/js/results.js:101-112`

- [ ] **Step 1: Simplify creatures befriended count**

Replace lines 101-112:

```js
  // Count new event type + legacy (befriends were logged as word_learned with source:befriend)
  let creaturesBefriended = eventCounts.creature_befriended || 0;
  if (creaturesBefriended === 0 && eventCounts.word_learned) {
    // Fall back: count word_learned events with befriend source
    try {
      const wlEvents = await results.events(simId, { type: 'word_learned', limit: 1000 });
      creaturesBefriended = wlEvents.filter(e => {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        return d.source === 'befriend';
      }).length;
    } catch { /* ignore */ }
  }
```

With:

```js
  const creaturesBefriended = eventCounts.creature_befriended || 0;
```

- [ ] **Step 2: Commit**

```bash
git add simulator/public/js/results.js
git commit -m "refactor(simulator): remove legacy word_learned befriend fallback in dashboard"
```

### Task 9: Verify existing tests still pass

**Files:**
- Check: `simulator/tests/unit/store.test.js`
- Check: `simulator/tests/unit/room-dispatch.test.js`

- [ ] **Step 1: Run simulator unit tests**

Run: `cd /root/Koto2 && node --test simulator/tests/unit/*.test.js`
Expected: All tests pass. The store tests use `word_learned` as a test event type string but that's the store layer testing generic event storage — the string is just data, not a contract.

- [ ] **Step 2: Run full test suite**

Run: `cd /root/Koto2 && npm test`
Expected: All Tier 1 + Tier 2 tests pass.

- [ ] **Step 3: Commit if any test fixes were needed**

Only if tests failed and required fixes.
