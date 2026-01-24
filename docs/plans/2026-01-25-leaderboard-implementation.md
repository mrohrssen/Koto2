# Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a daily/weekly leaderboard showing cards reviewed per user, accessible from the bottom utility row.

**Architecture:** Review events stored as timestamps in each user's record in `.jrpg-users.json`. A new GET endpoint calculates rankings on-the-fly using Tokyo time (UTC+9) boundaries. Frontend uses a takeover view (existing pattern) with daily/weekly tab toggle.

**Tech Stack:** Express.js backend, vanilla JS frontend, existing `.jrpg-users.json` file storage.

---

### Task 1: Add review tracking functions to users.js

**Files:**
- Modify: `src/auth/users.js`

**Step 1: Add `addReview` function**

Append to the end of `src/auth/users.js`:

```javascript
/**
 * Record a review timestamp for a user and prune old entries (>7 days)
 * @param {string} userId
 * @param {string} filePath
 */
export function addReview(userId, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const user = data.users.find(u => u.id === userId);
  if (!user) return;

  if (!user.reviews) user.reviews = [];
  user.reviews.push({ ts: Date.now() });

  // Prune entries older than 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  user.reviews = user.reviews.filter(r => r.ts > sevenDaysAgo);

  saveUsers(data, filePath);
}

/**
 * Get leaderboard data for a given period
 * @param {'daily'|'weekly'} period
 * @param {string} currentUserId - The requesting user's ID
 * @param {string} filePath
 * @returns {{ period: string, entries: Array, currentUser: object }}
 */
export function getLeaderboard(period, currentUserId, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const now = Date.now();

  // Tokyo time (UTC+9) boundaries
  const tokyoOffset = 9 * 60 * 60 * 1000;
  const nowTokyo = new Date(now + tokyoOffset);

  let cutoff;
  if (period === 'weekly') {
    // Monday 00:00 JST this week
    const day = nowTokyo.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mondayTokyo = new Date(nowTokyo);
    mondayTokyo.setUTCDate(nowTokyo.getUTCDate() - daysSinceMonday);
    mondayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = mondayTokyo.getTime() - tokyoOffset; // Convert back to UTC ms
  } else {
    // Today 00:00 JST
    const todayTokyo = new Date(nowTokyo);
    todayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = todayTokyo.getTime() - tokyoOffset; // Convert back to UTC ms
  }

  const entries = data.users
    .map(u => ({
      username: u.username,
      userId: u.id,
      count: (u.reviews || []).filter(r => r.ts >= cutoff).length
    }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((e, i) => ({ rank: i + 1, username: e.username, count: e.count, isCurrentUser: e.userId === currentUserId }));

  const currentUser = entries.find(e => e.isCurrentUser) || { rank: null, count: 0 };

  // Remove isCurrentUser flag from entries
  entries.forEach(e => delete e.isCurrentUser);

  return { period, entries, currentUser: { rank: currentUser.rank, count: currentUser.count } };
}
```

**Step 2: Verify syntax**

Run: `node --check src/auth/users.js`
Expected: No output (clean)

**Step 3: Commit**

```bash
git add src/auth/users.js
git commit -m "feat: add review tracking and leaderboard functions to users.js"
```

---

### Task 2: Hook review tracking into the JPDB review route

**Files:**
- Modify: `src/routes/vocab.js`

**Step 1: Import addReview and requireAuth**

At the top of `src/routes/vocab.js`, add to the imports:

```javascript
import { addReview } from '../auth/users.js';
import { requireAuth } from '../auth/middleware.js';
```

**Step 2: Add requireAuth middleware and review tracking to the /jpdb/review route**

In `src/routes/vocab.js`, modify the `/jpdb/review` handler (around line 88). Add `requireAuth` as route-level middleware and add the `addReview` call after successful JPDB review:

Replace:
```javascript
  // Review vocabulary in JPDB
  router.post('/jpdb/review', async (req, res) => {
    const { vid, sid, grade, jpdbApiKey } = req.body;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const result = await reviewVocabulary(jpdbApiKey, vid, sid, grade);

      // Invalidate local cache so this word won't reappear as "due" immediately
      invalidateWordStateCache(parseInt(vid, 10));

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
```

With:
```javascript
  // Review vocabulary in JPDB
  router.post('/jpdb/review', requireAuth, async (req, res) => {
    const { vid, sid, grade, jpdbApiKey } = req.body;

    if (!jpdbApiKey) {
      return res.status(400).json({ error: 'JPDB API key not configured' });
    }

    try {
      const result = await reviewVocabulary(jpdbApiKey, vid, sid, grade);

      // Invalidate local cache so this word won't reappear as "due" immediately
      invalidateWordStateCache(parseInt(vid, 10));

      // Track review for leaderboard
      addReview(req.user.id);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
```

**Step 3: Verify syntax**

Run: `node --check src/routes/vocab.js`
Expected: No output (clean)

**Step 4: Commit**

```bash
git add src/routes/vocab.js
git commit -m "feat: track reviews for leaderboard on each JPDB review"
```

---

### Task 3: Add the leaderboard API endpoint

**Files:**
- Modify: `src/routes/game/index.js`

**Step 1: Import getLeaderboard**

Add to the imports at the top of `src/routes/game/index.js`:

```javascript
import { getLeaderboard } from '../../auth/users.js';
```

**Step 2: Add the leaderboard route**

After the middleware block (after line 59, before the route mounts), add:

```javascript
  // Leaderboard route
  router.get('/leaderboard', (req, res) => {
    const period = req.query.period === 'weekly' ? 'weekly' : 'daily';
    const result = getLeaderboard(period, req.user.id);
    res.json(result);
  });
```

**Step 3: Verify syntax**

Run: `node --check src/routes/game/index.js`
Expected: No output (clean)

**Step 4: Commit**

```bash
git add src/routes/game/index.js
git commit -m "feat: add GET /api/game/leaderboard endpoint"
```

---

### Task 4: Add leaderboard button to the utility row

**Files:**
- Modify: `public/game.html`

**Step 1: Add leaderboard button**

In `public/game.html`, inside the `.utility-row` div (line 58-78), add a leaderboard button after the settings button (after line 64, before the reset-run-btn):

```html
      <button class="util-btn" id="leaderboard-btn" aria-label="Leaderboard">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
          <path d="M4 22h16"/>
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        </svg>
      </button>
```

**Step 2: Add leaderboard takeover view**

After the existing takeover views (after line 99, the gameover-view closing div), add:

```html
  <div class="takeover" id="leaderboard-view">
    <button class="takeover-close" id="leaderboard-close">&times;</button>
    <div class="takeover-content" id="leaderboard-content"></div>
  </div>
```

**Step 3: Add script import**

Before the `game.js` script tag (before `<script type="module" src="game.js">`), add:

```html
  <script type="module" src="js/ui/leaderboard.js"></script>
```

Note: Actually, since `game.js` uses ES module imports, we'll import leaderboard.js from game.js instead. Skip this step — the import will be added in Task 5.

**Step 4: Commit**

```bash
git add public/game.html
git commit -m "feat: add leaderboard button and takeover view to game.html"
```

---

### Task 5: Create the leaderboard UI module

**Files:**
- Create: `public/js/ui/leaderboard.js`
- Modify: `public/game.js` (add import and init call)

**Step 1: Create `public/js/ui/leaderboard.js`**

```javascript
/**
 * Leaderboard UI Module
 *
 * Displays daily/weekly review leaderboard in a takeover panel.
 * Uses existing takeover view pattern and styling.
 */

import { getAuthHeaders } from '../api.js';
import { playSFX } from '../audio.js';

let currentPeriod = 'daily';
let leaderboardView;
let leaderboardContent;
let leaderboardClose;

/** Initialize leaderboard UI */
export function init() {
  leaderboardView = document.getElementById('leaderboard-view');
  leaderboardContent = document.getElementById('leaderboard-content');
  leaderboardClose = document.getElementById('leaderboard-close');

  document.getElementById('leaderboard-btn').addEventListener('click', open);
  leaderboardClose.addEventListener('click', close);
}

/** Open leaderboard panel and fetch data */
export async function open() {
  leaderboardView.classList.add('active');
  playSFX('takeover-open');
  await render();
}

/** Close leaderboard panel */
export function close() {
  leaderboardView.classList.remove('active');
  playSFX('takeover-close');
}

/** Fetch leaderboard data from API */
async function fetchLeaderboard(period) {
  try {
    const response = await fetch(`/api/game/leaderboard?period=${period}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return await response.json();
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return null;
  }
}

/** Render the leaderboard content */
async function render() {
  leaderboardContent.innerHTML = `
    <h2 style="margin: 0 0 16px; font-size: 20px; color: var(--text-primary);">Leaderboard</h2>
    <div class="leaderboard-tabs" style="display: flex; gap: 0; margin-bottom: 16px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--text-secondary);">
      <button class="leaderboard-tab${currentPeriod === 'daily' ? ' active' : ''}" data-period="daily" style="flex: 1; padding: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; background: ${currentPeriod === 'daily' ? 'var(--accent-green)' : 'transparent'}; color: ${currentPeriod === 'daily' ? 'white' : 'var(--text-secondary)'};">Daily</button>
      <button class="leaderboard-tab${currentPeriod === 'weekly' ? ' active' : ''}" data-period="weekly" style="flex: 1; padding: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; background: ${currentPeriod === 'weekly' ? 'var(--accent-green)' : 'transparent'}; color: ${currentPeriod === 'weekly' ? 'white' : 'var(--text-secondary)'};">Weekly</button>
    </div>
    <div class="leaderboard-list" id="leaderboard-list" style="display: flex; flex-direction: column; gap: 4px;">
      <p style="color: var(--text-secondary); text-align: center;">Loading...</p>
    </div>
  `;

  // Attach tab listeners
  leaderboardContent.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      currentPeriod = tab.dataset.period;
      await render();
    });
  });

  // Fetch and display data
  const data = await fetchLeaderboard(currentPeriod);
  const list = document.getElementById('leaderboard-list');

  if (!data) {
    list.innerHTML = `<p style="color: var(--accent-red); text-align: center;">Failed to load leaderboard</p>`;
    return;
  }

  if (data.entries.length === 0) {
    list.innerHTML = `<p style="color: var(--text-secondary); text-align: center;">No reviews yet ${currentPeriod === 'daily' ? 'today' : 'this week'}</p>`;
    return;
  }

  list.innerHTML = data.entries.map(entry => {
    const isMe = entry.rank === data.currentUser.rank && entry.username === data.currentUser.username;
    return `
      <div style="display: flex; align-items: center; padding: 10px 12px; border-radius: var(--radius-sm); background: ${isMe ? 'var(--bg-card-hover)' : 'var(--bg-card)'}; ${isMe ? 'border: 1px solid var(--accent-orange);' : ''}">
        <span style="font-weight: 700; width: 32px; color: ${entry.rank <= 3 ? 'var(--accent-orange)' : 'var(--text-secondary)'};">#${entry.rank}</span>
        <span style="flex: 1; font-weight: ${isMe ? '700' : '400'}; color: var(--text-primary);">${entry.username}</span>
        <span style="font-weight: 600; color: var(--accent-green);">${entry.count}</span>
      </div>
    `;
  }).join('');
}
```

**Step 2: Import and initialize in game.js**

In `public/game.js`, add the import (after the existing ui imports, around line 19):

```javascript
import * as leaderboard from './js/ui/leaderboard.js';
```

Find the initialization section where other UI modules are initialized (look for `auth.init()` or `takeover.init()` calls) and add:

```javascript
leaderboard.init();
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/leaderboard.js && node --check public/game.js`
Expected: No output (clean)

**Step 4: Commit**

```bash
git add public/js/ui/leaderboard.js public/game.js
git commit -m "feat: add leaderboard UI with daily/weekly toggle"
```

---

### Task 6: End-to-end verification

**Step 1: Run syntax check on all modified files**

```bash
node --check src/auth/users.js && node --check src/routes/vocab.js && node --check src/routes/game/index.js && node --check public/js/ui/leaderboard.js && node --check public/game.js && echo "All OK"
```

Expected: `All OK`

**Step 2: Run the e2e tests**

```bash
./scripts/e2e-test.sh
```

Expected: 80+/87 tests passing (existing threshold). The leaderboard doesn't break existing functionality since it's additive.

**Step 3: Manual smoke test**

1. Start server: `npm run dev`
2. Login as a user
3. Click the trophy icon in the bottom utility row — leaderboard modal opens
4. Verify "Daily" tab is active by default, shows "No reviews yet today" if fresh
5. Do a vocab review in combat
6. Reopen leaderboard — count should be 1
7. Toggle to "Weekly" — same count appears
8. Close modal with X button

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: leaderboard adjustments from smoke test"
```
