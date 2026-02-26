# Daily Word Discovery Limit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a per-user daily word discovery limit with tracking and quiz master narration.

**Architecture:** Server-side tracking in `.jrpg-word-tracking.json`, new settings field `dailyWordLimit`, modified JPDB review endpoint to count discovery reviews, and frontend changes to show progress in discovery room narration.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend, Tokyo timezone for daily reset.

---

## Task 1: Create Word Tracking Module

**Files:**
- Create: `src/word-tracking.js`

**Step 1: Create the word tracking module**

```javascript
/**
 * @fileoverview Word discovery tracking
 *
 * Tracks daily, weekly, and lifetime word discoveries per user.
 * Uses Tokyo timezone (JST, UTC+9) for daily reset.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPath } from './data-dir.js';

const TRACKING_FILE = dataPath('.jrpg-word-tracking.json');

// In-memory cache
let trackingData = null;

/**
 * Get current Tokyo date string (YYYY-MM-DD)
 */
function getTokyoDateString() {
  const now = new Date();
  // Tokyo is UTC+9
  const tokyoTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return tokyoTime.toISOString().split('T')[0];
}

/**
 * Get current Tokyo day of week (0 = Sunday, 1 = Monday, etc.)
 */
function getTokyoDayOfWeek() {
  const now = new Date();
  const tokyoTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return tokyoTime.getUTCDay();
}

/**
 * Load tracking data from file
 */
function loadTracking() {
  if (trackingData !== null) return trackingData;

  if (existsSync(TRACKING_FILE)) {
    try {
      trackingData = JSON.parse(readFileSync(TRACKING_FILE, 'utf-8'));
    } catch (e) {
      console.warn('[WordTracking] Failed to load tracking file:', e.message);
      trackingData = {};
    }
  } else {
    trackingData = {};
  }
  return trackingData;
}

/**
 * Save tracking data to file
 */
function saveTracking() {
  if (trackingData === null) return;
  try {
    writeFileSync(TRACKING_FILE, JSON.stringify(trackingData, null, 2));
  } catch (e) {
    console.warn('[WordTracking] Failed to save tracking file:', e.message);
  }
}

/**
 * Get or initialize user tracking data
 * Handles daily and weekly resets automatically
 */
function getUserTracking(userId) {
  const data = loadTracking();
  const today = getTokyoDateString();
  const dayOfWeek = getTokyoDayOfWeek();

  if (!data[userId]) {
    data[userId] = {
      today: { date: today, count: 0 },
      weekly: 0,
      weekStartDate: today,
      lifetime: 0
    };
    saveTracking();
    return data[userId];
  }

  const user = data[userId];

  // Check for daily reset
  if (user.today.date !== today) {
    user.today = { date: today, count: 0 };

    // Check for weekly reset (Monday = day 1 in Tokyo)
    if (dayOfWeek === 1) {
      user.weekly = 0;
      user.weekStartDate = today;
    }

    saveTracking();
  }

  return user;
}

/**
 * Get discovery status for a user
 * @param {string} userId - User ID
 * @param {number} dailyLimit - Daily word limit from settings
 * @returns {{ todayCount: number, dailyLimit: number, atLimit: boolean }}
 */
export function getDiscoveryStatus(userId, dailyLimit) {
  const user = getUserTracking(userId);
  const atLimit = dailyLimit === 0 || user.today.count >= dailyLimit;

  return {
    todayCount: user.today.count,
    dailyLimit,
    atLimit
  };
}

/**
 * Increment discovery count for a user
 * @param {string} userId - User ID
 * @returns {{ todayCount: number, atLimit: boolean }} Updated counts
 */
export function incrementDiscoveryCount(userId, dailyLimit) {
  const user = getUserTracking(userId);

  user.today.count++;
  user.weekly++;
  user.lifetime++;

  saveTracking();

  const atLimit = dailyLimit === 0 || user.today.count >= dailyLimit;

  return {
    todayCount: user.today.count,
    weekly: user.weekly,
    lifetime: user.lifetime,
    atLimit
  };
}

/**
 * Get full tracking stats for a user (for future leaderboard)
 */
export function getTrackingStats(userId) {
  const user = getUserTracking(userId);
  return {
    today: user.today.count,
    weekly: user.weekly,
    lifetime: user.lifetime
  };
}
```

**Step 2: Verify the file was created correctly**

Run: `node --check src/word-tracking.js`
Expected: No output (syntax is valid)

**Step 3: Commit**

```bash
git add src/word-tracking.js
git commit -m "feat: add word discovery tracking module

Tracks daily/weekly/lifetime word discoveries per user.
Uses Tokyo timezone for daily reset (midnight JST)."
```

---

## Task 2: Add Daily Limit to Settings

**Files:**
- Modify: `server.js:179-191` (loadSettings defaults)
- Modify: `src/routes/settings.js:40-48` (GET response)
- Modify: `src/routes/settings.js:52-82` (POST handler)

**Step 1: Add dailyWordLimit to server.js defaults**

In `server.js`, find the `loadSettings()` function defaults object (~line 181-191) and add `dailyWordLimit`:

```javascript
const defaults = {
  jpdbDeckId: 'all',
  jlptLevel: 'N5',
  // Game TTS Settings (narrator voice)
  gameTtsEnabled: true,
  gameTtsSpeakerId: 13,
  gameTtsSpeed: 0.9,
  gameTtsVolume: 1.0,
  // Word Review Settings
  reviewType: 'typing',
  // Word Discovery Settings
  dailyWordLimit: 10  // 0-50, 0 = skip discovery rooms
};
```

**Step 2: Add dailyWordLimit to settings GET response**

In `src/routes/settings.js`, modify the GET `/settings` response (~line 40-48) to include:

```javascript
res.json({
  jpdbDeckId: settings.jpdbDeckId || '',
  jlptLevel: settings.jlptLevel || 'N4',
  gameTtsEnabled: settings.gameTtsEnabled ?? true,
  gameTtsSpeakerId: settings.gameTtsSpeakerId || 13,
  gameTtsSpeed: settings.gameTtsSpeed || 0.9,
  gameTtsVolume: settings.gameTtsVolume || 1.0,
  reviewType: settings.reviewType || 'dialog',
  dailyWordLimit: settings.dailyWordLimit ?? 10
});
```

**Step 3: Add dailyWordLimit to settings POST handler**

In `src/routes/settings.js`, add to the POST handler destructuring (~line 54) and save logic:

After line 69 (`if (reviewType !== undefined) settings.reviewType = reviewType;`), add:

```javascript
if (dailyWordLimit !== undefined) {
  // Validate: must be integer 0-50
  const limit = parseInt(dailyWordLimit, 10);
  if (!isNaN(limit) && limit >= 0 && limit <= 50) {
    settings.dailyWordLimit = limit;
  }
}
```

Also add `dailyWordLimit` to the destructuring on line 54-56:

```javascript
const { jpdbDeckId, jlptLevel,
        gameTtsEnabled, gameTtsSpeakerId, gameTtsSpeed, gameTtsVolume,
        reviewType, dailyWordLimit } = req.body;
```

**Step 4: Verify syntax**

Run: `node --check server.js && node --check src/routes/settings.js`
Expected: No output (syntax valid)

**Step 5: Commit**

```bash
git add server.js src/routes/settings.js
git commit -m "feat: add dailyWordLimit setting (0-50, default 10)"
```

---

## Task 3: Add Discovery Status Endpoint

**Files:**
- Modify: `src/routes/game/run.js` (add new endpoint)

**Step 1: Import word tracking module**

At the top of `src/routes/game/run.js`, after the existing imports (~line 13), add:

```javascript
import { getDiscoveryStatus } from '../../word-tracking.js';
```

**Step 2: Add the discovery-status endpoint**

After the `/discovery-words` endpoint (~line 358), add the new endpoint:

```javascript
// Get discovery status (daily limit tracking)
router.get('/discovery-status', (req, res) => {
  try {
    const userId = req.user?.id || 'default';
    const settings = req.getSettings?.() || {};
    const dailyLimit = settings.dailyWordLimit ?? 10;

    const status = getDiscoveryStatus(userId, dailyLimit);
    res.json(status);
  } catch (error) {
    console.error('[Discovery] Error getting status:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Verify syntax**

Run: `node --check src/routes/game/run.js`
Expected: No output (syntax valid)

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: add GET /api/game/discovery-status endpoint"
```

---

## Task 4: Modify Review Endpoint for Discovery Tracking

**Files:**
- Modify: `src/routes/vocab.js:68-89` (review endpoint)

**Step 1: Import word tracking and add isDiscovery handling**

At the top of `src/routes/vocab.js`, after existing imports (~line 17), add:

```javascript
import { incrementDiscoveryCount, getDiscoveryStatus } from '../word-tracking.js';
```

**Step 2: Modify the review endpoint**

Replace the existing `/jpdb/review` handler (~lines 68-89) with:

```javascript
// Review vocabulary in JPDB
router.post('/jpdb/review', requireAuth, attachUserKeys, async (req, res) => {
  const { vid, sid, grade, isDiscovery } = req.body;
  const jpdbApiKey = req.userKeys?.jpdbApiKey;

  if (!jpdbApiKey) {
    return res.status(400).json({ error: 'JPDB API key not configured' });
  }

  const userId = req.user?.id || 'default';
  const settings = req.getSettings?.() || {};
  const dailyLimit = settings.dailyWordLimit ?? 10;

  // If discovery mode, check limit before processing
  if (isDiscovery) {
    const status = getDiscoveryStatus(userId, dailyLimit);
    if (status.atLimit) {
      return res.json({
        success: false,
        atLimit: true,
        todayCount: status.todayCount
      });
    }
  }

  try {
    const result = await reviewVocabulary(jpdbApiKey, vid, sid, grade);

    // Invalidate local cache so this word won't reappear as "due" immediately
    invalidateWordStateCache(parseInt(vid, 10));

    // Track review for leaderboard
    addReview(req.user.id);

    // If discovery mode, increment counter
    if (isDiscovery) {
      const counts = incrementDiscoveryCount(userId, dailyLimit);
      return res.json({
        ...result,
        success: true,
        todayCount: counts.todayCount,
        atLimit: counts.atLimit
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Pass getSettings to vocab routes**

The vocab routes need access to `getSettings`. In `src/routes/index.js`, find where `createVocabRoutes` is called and ensure it receives `getSettings`:

Check `src/routes/index.js` to see how routes are wired. The function already receives `{ getSettings }` in the dependencies, so we just need to ensure it's passed through correctly.

**Step 4: Verify syntax**

Run: `node --check src/routes/vocab.js`
Expected: No output (syntax valid)

**Step 5: Commit**

```bash
git add src/routes/vocab.js
git commit -m "feat: add isDiscovery flag to review endpoint for daily tracking"
```

---

## Task 5: Wire getSettings to Vocab Routes

**Files:**
- Modify: `src/routes/index.js` (pass getSettings to vocab routes)

**Step 1: Check current index.js implementation**

Read `src/routes/index.js` to see how routes are wired and ensure `getSettings` is passed to vocab routes.

**Step 2: Add getSettings to vocab routes if missing**

In `src/routes/index.js`, ensure the vocab routes creation includes `getSettings`:

```javascript
const vocabRoutes = createVocabRoutes({ getSettings });
```

**Step 3: Verify syntax**

Run: `node --check src/routes/index.js`
Expected: No output (syntax valid)

**Step 4: Commit (if changes made)**

```bash
git add src/routes/index.js
git commit -m "fix: pass getSettings to vocab routes for daily limit access"
```

---

## Task 6: Add Frontend API Functions

**Files:**
- Modify: `public/js/api.js` (add getDiscoveryStatus, modify sendJpdbReview)

**Step 1: Add getDiscoveryStatus function**

After the `getDiscoveryWords` function (~line 500), add:

```javascript
/** Get discovery status (daily limit tracking)
 * @returns {Promise<Object>} { todayCount, dailyLimit, atLimit }
 */
async function getDiscoveryStatus() {
  try {
    const response = await fetch('/api/game/discovery-status', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get discovery status:', error.message);
    return { todayCount: 0, dailyLimit: 10, atLimit: false };
  }
}
```

**Step 2: Modify sendJpdbReview to accept isDiscovery parameter**

Replace the existing `sendJpdbReview` function (~lines 418-430) with:

```javascript
/** Send JPDB review
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @param {number} grade - Review grade (1-5)
 * @param {boolean} isDiscovery - Whether this is a discovery room review
 */
async function sendJpdbReview(vid, sid, grade, isDiscovery = false) {
  try {
    const response = await fetch('/api/jpdb/review', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vid, sid, grade, isDiscovery })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to send JPDB review:', error.message);
    return { error: 'Network error' };
  }
}
```

**Step 3: Add getDiscoveryStatus to exports**

Add `getDiscoveryStatus` to the export list at the bottom (~line 552).

**Step 4: Verify syntax**

Run: `node --check public/js/api.js`
Expected: No output (syntax valid)

**Step 5: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add getDiscoveryStatus API, add isDiscovery param to review"
```

---

## Task 7: Update Discovery Room Frontend

**Files:**
- Modify: `public/js/ui/exploration.js` (~lines 506-646)

**Step 1: Import getDiscoveryStatus**

At the top of the file where API imports are (~around line 10-20), add `getDiscoveryStatus` to the imports from api.js:

Find the line that imports from api.js and add `getDiscoveryStatus`:

```javascript
import { ..., getDiscoveryStatus, ... } from '../api.js';
```

**Step 2: Modify renderWordDiscovery function**

Replace the `renderWordDiscovery` function (lines ~507-646) with updated version that:
1. Fetches discovery status first
2. Shows "You've learned XX new words today!" narration
3. Handles at-limit state with "come back tomorrow" message
4. Passes `isDiscovery: true` to review calls
5. Stops mid-room if limit is reached

```javascript
/** Word Discovery phase - show flash cards for new words */
export async function renderWordDiscovery() {
  const gameState = getGameState();
  const room = gameState.room;

  // Clear stale content immediately before any async operations
  actions.setContent('');

  if (!room) return;

  // Reset module-level discovery state when entering a new room
  const roomId = room.id || room.type || 'unknown';
  if (discoveryState.roomId !== roomId) {
    discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: roomId,
      statusChecked: false,
      atLimit: false
    };
  }

  // Stage tracking from server state
  const discovery = room.wordDiscovery || {
    wordsToLearn: 2,
    wordsLearned: 0,
    wordIds: [],
    completed: false
  };

  // If completed on server, show proceed
  if (discovery.completed) {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="proceed-btn">続ける</button>
    `);
    document.getElementById('proceed-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    });
    return;
  }

  // Check discovery status first (only once per room)
  if (!discoveryState.statusChecked) {
    discoveryState.statusChecked = true;
    const status = await getDiscoveryStatus();
    discoveryState.todayCount = status.todayCount;
    discoveryState.dailyLimit = status.dailyLimit;
    discoveryState.atLimit = status.atLimit;

    // Show today's count
    await sceneModule.showNarration(
      `今日は ${status.todayCount} 個の新しい言葉を学びました！`,
      { speaker: 'Quiz Master' }
    );

    // If at limit, show "come back tomorrow" and skip room
    if (status.atLimit) {
      await sceneModule.showNarration(
        'また明日来てね！',
        { speaker: 'Quiz Master' }
      );

      // Mark room complete and proceed
      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
      return;
    }
  }

  // If we hit the limit mid-room, stop
  if (discoveryState.atLimit) {
    await sceneModule.showNarration(
      'また明日来てね！',
      { speaker: 'Quiz Master' }
    );

    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }
    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  // Fetch words if not already fetched
  if (!discoveryState.fetched) {
    discoveryState.fetched = true;

    // Show intro narration
    await sceneModule.showNarration('新しい言葉を発見しよう！', { speaker: 'Quiz Master' });

    const result = await apiGetDiscoveryWords(discovery.wordsToLearn);

    if (!result.available || result.words.length === 0) {
      await sceneModule.showNarration('今は新しい言葉がないようだ。また来よう！', { speaker: 'Quiz Master' });
      const completeResult = await apiCompleteDiscovery();
      if (completeResult?.state) {
        updateGameState(completeResult.state);
      }
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
      return;
    }

    discoveryState.words = result.words;
  }

  const words = discoveryState.words;
  const currentIndex = discoveryState.wordsLearned;

  if (currentIndex >= words.length) {
    const completeResult = await apiCompleteDiscovery();
    if (completeResult?.state) {
      updateGameState(completeResult.state);
    }

    const learnedWords = words.map(w => w.word);
    apiPostCombatRefresh?.(learnedWords).catch(() => {});

    await sceneModule.showNarration('素晴らしい！新しい言葉を覚えた！', { speaker: 'Quiz Master' });

    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  const currentWord = words[currentIndex];

  sceneModule.showNarration(`${currentIndex + 1}/${words.length}: スワイプして覚えよう`, {
    speaker: 'Quiz Master',
    persistent: true
  });

  actions.showFlashCard(currentWord, { discoveryMode: true });

  const handleDiscoverySwipe = async (direction) => {
    console.log(`[Discovery] Swiped ${direction} on "${currentWord.word}" (vid=${currentWord.vid}, sid=${currentWord.sid})`);
    try {
      // Pass isDiscovery: true to track the discovery
      const reviewResult = await apiSwipeWord(currentWord.vid, currentWord.sid, 1, true);
      console.log(`[Discovery] Review sent: vid=${currentWord.vid}, grade=1 (learning)`);

      // Check if we hit the limit
      if (reviewResult.atLimit) {
        discoveryState.atLimit = true;
        discoveryState.todayCount = reviewResult.todayCount;
      }
    } catch (e) {
      console.warn('[Discovery] Failed to submit review:', e);
    }

    discoveryState.wordsLearned++;
    console.log(`[Discovery] Progress: ${discoveryState.wordsLearned}/${discoveryState.words.length} words learned`);

    renderWordDiscovery();
  };

  document.addEventListener('discovery-card-swiped', async function handler(e) {
    document.removeEventListener('discovery-card-swiped', handler);
    await handleDiscoverySwipe(e.detail);
  }, { once: true });

  const testSwipeHandler = async (e) => {
    document.dispatchEvent(new CustomEvent('discovery-card-swiped', { detail: e.detail }));
  };
  document.addEventListener('test-swipe', testSwipeHandler, { once: true });
}
```

**Step 3: Update apiSwipeWord call**

Find where `apiSwipeWord` is defined/used in this file. It likely wraps `sendJpdbReview`. We need to ensure it passes the `isDiscovery` parameter.

Look for the import and usage. It's likely `apiSwipeWord` is an alias. Check if it's imported from api.js or defined locally.

If `apiSwipeWord` is `sendJpdbReview`, update the call to pass 4th parameter.

**Step 4: Verify syntax**

Run: `node --check public/js/ui/exploration.js`
Expected: No output (syntax valid)

**Step 5: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add daily limit UI to word discovery room

Shows 'You've learned XX words today!' on entry.
Stops mid-room if limit reached with 'come back tomorrow' message."
```

---

## Task 8: Add Settings UI for Daily Word Limit

**Files:**
- Modify: `public/js/ui/modals.js`

**Step 1: Add daily word limit input to settings HTML**

In `openSettings()` function (~line 52), after the reviewType section and before the `<hr>` for audio, add:

```html
<label class="settings-label" style="margin-top:12px">
  Daily Word Limit
  <input type="number" id="settings-daily-limit" class="settings-input"
    min="0" max="50" value="${keyInfo.dailyWordLimit ?? 10}">
  <small style="color:#888;font-size:0.85em">0 = skip discovery rooms, max 50</small>
</label>
```

**Step 2: Add dailyWordLimit to the save handler**

In the save button click handler (~line 123), add:

```javascript
const dailyWordLimit = parseInt(document.getElementById('settings-daily-limit')?.value || '10');
```

And add it to the `keysToSave` object:

```javascript
if (dailyWordLimit !== undefined && !isNaN(dailyWordLimit)) {
  keysToSave.dailyWordLimit = dailyWordLimit;
}
```

**Step 3: Ensure keyInfo includes dailyWordLimit**

The `loadApiKeysFromServer()` function should already include `dailyWordLimit` in its response since we added it to the settings GET endpoint. Verify the settings module properly exposes this.

**Step 4: Verify syntax**

Run: `node --check public/js/ui/modals.js`
Expected: No output (syntax valid)

**Step 5: Commit**

```bash
git add public/js/ui/modals.js
git commit -m "feat: add daily word limit setting to UI (0-50 number input)"
```

---

## Task 9: End-to-End Testing

**Step 1: Start the server**

```bash
npm start &
sleep 3
```

**Step 2: Test discovery status endpoint**

```bash
curl -s http://localhost:3000/api/game/discovery-status | jq
```

Expected: `{ "todayCount": 0, "dailyLimit": 10, "atLimit": false }`

**Step 3: Test settings include dailyWordLimit**

```bash
curl -s http://localhost:3000/api/settings | jq
```

Expected: Response includes `"dailyWordLimit": 10`

**Step 4: Test updating dailyWordLimit**

```bash
curl -s -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"dailyWordLimit": 5}' | jq
```

Expected: `{ "success": true }`

**Step 5: Verify setting was saved**

```bash
curl -s http://localhost:3000/api/settings | jq '.dailyWordLimit'
```

Expected: `5`

**Step 6: Run E2E tests**

```bash
cd tests/e2e && npx playwright test --workers=1 -x specs/rooms/word-discovery.spec.ts
```

Expected: Tests pass (may need updates for new narration)

**Step 7: Cleanup**

```bash
pkill -f "node server.js"
```

**Step 8: Commit test fixes if needed**

```bash
git add -A
git commit -m "test: update e2e tests for daily word limit feature"
```

---

## Task 10: Final Verification and Merge

**Step 1: Run full E2E test suite**

```bash
./scripts/e2e-test.sh
```

Expected: 80+/87 tests pass (known flakiness acceptable)

**Step 2: Review all changes**

```bash
git log --oneline feature/daily-word-limit ^master
git diff master...feature/daily-word-limit --stat
```

**Step 3: Merge to master**

```bash
cd /Users/michia/Documents/jrpg
git checkout master
git pull origin master
git merge feature/daily-word-limit
git push origin master
```

**Step 4: Cleanup worktree**

```bash
git worktree remove ../jrpg-wt-daily-word-limit
git branch -d feature/daily-word-limit
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create word tracking module | `src/word-tracking.js` |
| 2 | Add dailyWordLimit to settings | `server.js`, `src/routes/settings.js` |
| 3 | Add discovery-status endpoint | `src/routes/game/run.js` |
| 4 | Add isDiscovery to review endpoint | `src/routes/vocab.js` |
| 5 | Wire getSettings to vocab routes | `src/routes/index.js` |
| 6 | Add frontend API functions | `public/js/api.js` |
| 7 | Update discovery room frontend | `public/js/ui/exploration.js` |
| 8 | Add settings UI | `public/js/ui/modals.js` |
| 9 | End-to-end testing | - |
| 10 | Final verification and merge | - |
