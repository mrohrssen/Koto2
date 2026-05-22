# Ranked Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible Ranked Rating ladder and auto-queue matchmaking to existing PvP while preserving challenge-code matches as casual and unrated.

**Architecture:** Keep the current Socket.IO PvP room and battle lifecycle. Add a focused rating utility, an in-process ranked queue, a MatchManager paired-match helper, and ranked result persistence through per-user GameManager saves. The client remains in `pvp_lobby` but gains sub-states for main lobby, join casual, ranked queue, and ranked post-match rating display.

**Tech Stack:** Node.js ES modules, Socket.IO, OpenSkill (`openskill` npm package), native `node:test`, current `public/js` UI modules.

---

## File Structure

- Create `src/pvp/ranked-rating.js`: OpenSkill wrapper, default ranked state, display rating calculation, public summary, and match-result update helpers.
- Create `src/pvp/ranked-match-queue.js`: In-memory queue keyed by `userId`, widening search window, pair selection, cancel/disconnect cleanup.
- Create `src/pvp/ranked-result-service.js`: Applies ranked results to both users' meta saves using `getManager` and `saveManager`.
- Modify `src/game/state.js`: Add `pvpRanked` defaults to new meta saves.
- Modify `src/game/manager-registry.js`: Ensure older saves receive `pvpRanked` during lazy migration.
- Modify `src/routes/game/pvp.js`: Return ranked summary from `/api/game/pvp/pvp-teams`.
- Modify `src/pvp/match-manager.js`: Add user exclusivity helper and paired-match helper.
- Modify `src/pvp/socket-handler.js`: Add ranked queue events, match-found room wiring, ranked result persistence, and reconnect payload compatibility.
- Modify `server.js`: Pass manager registry functions into `setupPvpSockets`.
- Modify `public/js/api.js`: Accept ranked summary returned by `getPvpTeams`.
- Modify `public/js/pvp-socket.js`: Add ranked events/functions and fix reconnect payload to `{ matchCode }`.
- Modify `public/js/ui/pvp-lobby.js`: Render current-style ranked lobby, join casual sub-state, ranked queue sub-state, and last ranked match card.
- Modify `public/js/ui/pvp-battle.js`: Render ranked result without rematch, show old-to-new rating animation, and return to multiplayer page.
- Modify `public/game.css`: Add small PvP ranked card, label, transition, and inline-error styles matching current UI.
- Add tests:
  - `tests/unit/pvp/ranked-rating.test.js`
  - `tests/unit/pvp/ranked-match-queue.test.js`
  - `tests/unit/pvp/ranked-result-service.test.js`
  - Extend `tests/unit/pvp/match-manager.test.js`
  - Extend `tests/unit/routes/pvp.test.js`
  - Add `tests/unit/pvp/socket-handler-ranked.test.js` for the injected Socket.IO setup contract.

## Task 1: Ranked Rating Utility and Defaults

**Files:**
- Create: `tests/unit/pvp/ranked-rating.test.js`
- Create: `src/pvp/ranked-rating.js`
- Modify: `src/game/state.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing rating utility tests**

Create `tests/unit/pvp/ranked-rating.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultRankedState,
  getDisplayRating,
  normalizeRankedState,
  toPublicRankedSummary,
  updateRankedAfterMatch
} from '../../../src/pvp/ranked-rating.js';

describe('ranked-rating', () => {
  it('creates a default ranked state that displays as 1200', () => {
    const ranked = createDefaultRankedState();
    assert.deepStrictEqual(ranked.rating, { mu: 25, sigma: 25 / 3 });
    assert.strictEqual(getDisplayRating(ranked.rating), 1200);
    assert.strictEqual(ranked.wins, 0);
    assert.strictEqual(ranked.losses, 0);
    assert.strictEqual(ranked.matchesPlayed, 0);
    assert.strictEqual(ranked.lastMatch, null);
  });

  it('normalizes missing or partial ranked state', () => {
    const ranked = normalizeRankedState({ wins: 2 });
    assert.strictEqual(getDisplayRating(ranked.rating), 1200);
    assert.strictEqual(ranked.wins, 2);
    assert.strictEqual(ranked.losses, 0);
    assert.strictEqual(ranked.matchesPlayed, 0);
    assert.strictEqual(ranked.lastMatch, null);
  });

  it('returns a public ranked summary', () => {
    const summary = toPublicRankedSummary({
      rating: { mu: 26, sigma: 7 },
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
      lastMatch: { result: 'win' }
    });
    assert.strictEqual(summary.rating, 1240);
    assert.strictEqual(summary.wins, 3);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.matchesPlayed, 4);
    assert.deepStrictEqual(summary.lastMatch, { result: 'win' });
  });

  it('updates winner and loser ratings and stores perspective-specific last matches', () => {
    const beforeWinner = createDefaultRankedState();
    const beforeLoser = createDefaultRankedState();
    const result = updateRankedAfterMatch({
      winnerRanked: beforeWinner,
      loserRanked: beforeLoser,
      winnerName: 'WinnerName',
      loserName: 'IllegalIcarus',
      finishedAt: '2026-05-22T04:00:00.000Z'
    });

    const winnerBeforeDisplay = getDisplayRating(beforeWinner.rating);
    const loserBeforeDisplay = getDisplayRating(beforeLoser.rating);
    const winnerAfterDisplay = getDisplayRating(result.winner.ranked.rating);
    const loserAfterDisplay = getDisplayRating(result.loser.ranked.rating);

    assert.ok(winnerAfterDisplay > winnerBeforeDisplay);
    assert.ok(loserAfterDisplay < loserBeforeDisplay);
    assert.strictEqual(result.winner.ranked.wins, 1);
    assert.strictEqual(result.winner.ranked.losses, 0);
    assert.strictEqual(result.loser.ranked.wins, 0);
    assert.strictEqual(result.loser.ranked.losses, 1);
    assert.strictEqual(result.winner.ranked.matchesPlayed, 1);
    assert.strictEqual(result.loser.ranked.matchesPlayed, 1);
    assert.deepStrictEqual(result.winner.ranked.lastMatch, {
      result: 'win',
      opponentName: 'IllegalIcarus',
      opponentRatingBefore: loserBeforeDisplay,
      ratingBefore: winnerBeforeDisplay,
      ratingAfter: winnerAfterDisplay,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });
    assert.deepStrictEqual(result.loser.ranked.lastMatch, {
      result: 'loss',
      opponentName: 'WinnerName',
      opponentRatingBefore: winnerBeforeDisplay,
      ratingBefore: loserBeforeDisplay,
      ratingAfter: loserAfterDisplay,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/unit/pvp/ranked-rating.test.js
```

Expected: FAIL with `Cannot find module` for `src/pvp/ranked-rating.js`.

- [ ] **Step 3: Add OpenSkill dependency**

Run:

```bash
npm install openskill
```

Expected: `package.json` and `package-lock.json` include `openskill`.

- [ ] **Step 4: Implement ranked rating utility**

Create `src/pvp/ranked-rating.js`:

```js
import { rating as createOpenSkillRating, rate } from 'openskill';

export const DEFAULT_DISPLAY_RATING = 1200;
export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = 25 / 3;
export const DISPLAY_SCALE = 40;

export function createDefaultRankedState() {
  return {
    rating: createOpenSkillRating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA }),
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    lastMatch: null
  };
}

export function normalizeRankedState(value = {}) {
  const defaults = createDefaultRankedState();
  const rating = value?.rating || defaults.rating;
  const mu = Number.isFinite(rating.mu) ? rating.mu : DEFAULT_MU;
  const sigma = Number.isFinite(rating.sigma) ? rating.sigma : DEFAULT_SIGMA;
  return {
    rating: { mu, sigma },
    wins: Number.isFinite(value?.wins) ? value.wins : 0,
    losses: Number.isFinite(value?.losses) ? value.losses : 0,
    matchesPlayed: Number.isFinite(value?.matchesPlayed) ? value.matchesPlayed : 0,
    lastMatch: value?.lastMatch || null
  };
}

export function getDisplayRating(rating) {
  const normalized = normalizeRankedState({ rating });
  return Math.round(DEFAULT_DISPLAY_RATING + (normalized.rating.mu - DEFAULT_MU) * DISPLAY_SCALE);
}

export function toPublicRankedSummary(value = {}) {
  const ranked = normalizeRankedState(value);
  return {
    rating: getDisplayRating(ranked.rating),
    wins: ranked.wins,
    losses: ranked.losses,
    matchesPlayed: ranked.matchesPlayed,
    lastMatch: ranked.lastMatch
  };
}

export function updateRankedAfterMatch({
  winnerRanked,
  loserRanked,
  winnerName,
  loserName,
  finishedAt = new Date().toISOString()
}) {
  const winnerBefore = normalizeRankedState(winnerRanked);
  const loserBefore = normalizeRankedState(loserRanked);
  const winnerRatingBefore = getDisplayRating(winnerBefore.rating);
  const loserRatingBefore = getDisplayRating(loserBefore.rating);
  const [[winnerRatingAfter], [loserRatingAfter]] = rate([
    [winnerBefore.rating],
    [loserBefore.rating]
  ]);
  const winnerRatingAfterDisplay = getDisplayRating(winnerRatingAfter);
  const loserRatingAfterDisplay = getDisplayRating(loserRatingAfter);

  return {
    winner: {
      ranked: {
        rating: winnerRatingAfter,
        wins: winnerBefore.wins + 1,
        losses: winnerBefore.losses,
        matchesPlayed: winnerBefore.matchesPlayed + 1,
        lastMatch: {
          result: 'win',
          opponentName: loserName,
          opponentRatingBefore: loserRatingBefore,
          ratingBefore: winnerRatingBefore,
          ratingAfter: winnerRatingAfterDisplay,
          finishedAt
        }
      }
    },
    loser: {
      ranked: {
        rating: loserRatingAfter,
        wins: loserBefore.wins,
        losses: loserBefore.losses + 1,
        matchesPlayed: loserBefore.matchesPlayed + 1,
        lastMatch: {
          result: 'loss',
          opponentName: winnerName,
          opponentRatingBefore: winnerRatingBefore,
          ratingBefore: loserRatingBefore,
          ratingAfter: loserRatingAfterDisplay,
          finishedAt
        }
      }
    }
  };
}
```

- [ ] **Step 5: Add ranked defaults to fresh meta saves**

In `src/game/state.js`, add the import at the top:

```js
import { createDefaultRankedState } from '../pvp/ranked-rating.js';
```

In `createMetaProgression()`, immediately after `pvpTeams: [null, null, null],` add:

```js
    pvpRanked: createDefaultRankedState(),
```

- [ ] **Step 6: Run rating tests**

Run:

```bash
node --test tests/unit/pvp/ranked-rating.test.js
```

Expected: PASS.

- [ ] **Step 7: Syntax-check changed modules**

Run:

```bash
node --check src/pvp/ranked-rating.js && node --check src/game/state.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/pvp/ranked-rating.js src/game/state.js tests/unit/pvp/ranked-rating.test.js
git commit -m "$(cat <<'EOF'
Add ranked rating model

EOF
)"
```

## Task 2: Ranked Summary on PvP Teams Route

**Files:**
- Modify: `src/routes/game/pvp.js`
- Modify: `tests/unit/routes/pvp.test.js`
- Modify: `src/game/manager-registry.js`

- [ ] **Step 1: Write failing route summary tests**

Append to `tests/unit/routes/pvp.test.js`:

```js
import { createDefaultRankedState } from '../../../src/pvp/ranked-rating.js';
import { getPvpSummary } from '../../../src/routes/game/pvp.js';

describe('getPvpSummary', () => {
  it('returns team slots and default ranked summary', () => {
    const gm = makeGm();
    const summary = getPvpSummary(gm);
    assert.deepStrictEqual(summary.pvpTeams, [null, null, null]);
    assert.deepStrictEqual(summary.ranked, {
      rating: 1200,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      lastMatch: null
    });
  });

  it('normalizes existing ranked state for older saves', () => {
    const gm = makeGm({
      meta: {
        pvpTeams: [null, { savedAt: 1 }, null],
        pvpRanked: {
          ...createDefaultRankedState(),
          wins: 4,
          losses: 2,
          matchesPlayed: 6,
          lastMatch: { result: 'win' }
        }
      }
    });
    const summary = getPvpSummary(gm);
    assert.strictEqual(summary.ranked.rating, 1200);
    assert.strictEqual(summary.ranked.wins, 4);
    assert.strictEqual(summary.ranked.losses, 2);
    assert.strictEqual(summary.ranked.matchesPlayed, 6);
    assert.deepStrictEqual(summary.ranked.lastMatch, { result: 'win' });
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
node --test tests/unit/routes/pvp.test.js
```

Expected: FAIL because `getPvpSummary` is not exported.

- [ ] **Step 3: Implement route summary helper**

In `src/routes/game/pvp.js`, add the import:

```js
import { normalizeRankedState, toPublicRankedSummary } from '../../pvp/ranked-rating.js';
```

Add this function after `savePvpTeam`:

```js
export function getPvpSummary(gm) {
  if (!gm.meta) gm.meta = {};
  if (!gm.meta.pvpTeams) gm.meta.pvpTeams = [null, null, null];
  gm.meta.pvpRanked = normalizeRankedState(gm.meta.pvpRanked);
  return {
    pvpTeams: gm.meta.pvpTeams,
    ranked: toPublicRankedSummary(gm.meta.pvpRanked)
  };
}
```

Replace the `/pvp-teams` handler body with:

```js
  router.get('/pvp-teams', (req, res) => {
    const summary = getPvpSummary(req.gameManager);
    res.json(summary);
  });
```

- [ ] **Step 4: Migrate old saves in manager registry**

In `src/game/manager-registry.js`, add:

```js
import { normalizeRankedState } from '../pvp/ranked-rating.js';
```

Inside `getManager`, in the `if (data.meta) { ... }` block before `manager.initMeta(data.meta);`, add:

```js
        const beforeRanked = JSON.stringify(data.meta.pvpRanked || null);
        data.meta.pvpRanked = normalizeRankedState(data.meta.pvpRanked);
        if (JSON.stringify(data.meta.pvpRanked) !== beforeRanked) {
          needsSave = true;
        }
```

- [ ] **Step 5: Run route tests**

Run:

```bash
node --test tests/unit/routes/pvp.test.js
```

Expected: PASS.

- [ ] **Step 6: Syntax-check changed modules**

Run:

```bash
node --check src/routes/game/pvp.js && node --check src/game/manager-registry.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/pvp.js src/game/manager-registry.js tests/unit/routes/pvp.test.js
git commit -m "$(cat <<'EOF'
Expose ranked PvP summary

EOF
)"
```

## Task 3: Ranked Match Queue

**Files:**
- Create: `tests/unit/pvp/ranked-match-queue.test.js`
- Create: `src/pvp/ranked-match-queue.js`

- [ ] **Step 1: Write failing queue tests**

Create `tests/unit/pvp/ranked-match-queue.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankedMatchQueue } from '../../../src/pvp/ranked-match-queue.js';

function entry(overrides = {}) {
  return {
    userId: overrides.userId || 'user-a',
    username: overrides.username || 'A',
    socketId: overrides.socketId || 'sock-a',
    rating: overrides.rating || { mu: 25, sigma: 25 / 3 },
    displayRating: overrides.displayRating ?? 1200,
    enqueuedAt: overrides.enqueuedAt ?? 1000
  };
}

describe('RankedMatchQueue', () => {
  it('enqueues one entry per user', () => {
    const queue = new RankedMatchQueue();
    assert.strictEqual(queue.enqueue(entry()), true);
    assert.strictEqual(queue.enqueue(entry({ socketId: 'sock-b' })), false);
    assert.strictEqual(queue.hasUser('user-a'), true);
  });

  it('pairs close ratings immediately', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'close', socketId: 's2', displayRating: 1260, enqueuedAt: 2000 }));
    const pair = queue.findMatch(3000);
    assert.deepStrictEqual(pair.map(p => p.userId), ['old', 'close']);
    assert.strictEqual(queue.hasUser('old'), false);
    assert.strictEqual(queue.hasUser('close'), false);
  });

  it('does not pair outside the current search window', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'far', socketId: 's2', displayRating: 1400, enqueuedAt: 2000 }));
    assert.strictEqual(queue.findMatch(5000), null);
  });

  it('widens search after waiting', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'far', socketId: 's2', displayRating: 1400, enqueuedAt: 2000 }));
    const pair = queue.findMatch(25000);
    assert.deepStrictEqual(pair.map(p => p.userId), ['old', 'far']);
  });

  it('removes by user and socket', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'a', socketId: 's1' }));
    queue.enqueue(entry({ userId: 'b', socketId: 's2' }));
    assert.strictEqual(queue.dequeue('a'), true);
    assert.strictEqual(queue.removeBySocket('s2'), true);
    assert.strictEqual(queue.size, 0);
  });
});
```

- [ ] **Step 2: Run queue tests to verify failure**

Run:

```bash
node --test tests/unit/pvp/ranked-match-queue.test.js
```

Expected: FAIL because `src/pvp/ranked-match-queue.js` does not exist.

- [ ] **Step 3: Implement the queue**

Create `src/pvp/ranked-match-queue.js`:

```js
export const SEARCH_WINDOWS = [
  { afterMs: 0, range: 75 },
  { afterMs: 10000, range: 150 },
  { afterMs: 20000, range: 250 },
  { afterMs: 40000, range: Infinity }
];

export class RankedMatchQueue {
  constructor() {
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  enqueue(entry) {
    if (!entry?.userId || !entry?.socketId) return false;
    if (this.entries.has(entry.userId)) return false;
    this.entries.set(entry.userId, { ...entry });
    return true;
  }

  dequeue(userId) {
    return this.entries.delete(userId);
  }

  removeBySocket(socketId) {
    for (const [userId, entry] of this.entries) {
      if (entry.socketId === socketId) {
        this.entries.delete(userId);
        return true;
      }
    }
    return false;
  }

  hasUser(userId) {
    return this.entries.has(userId);
  }

  getSearchRange(entry, now = Date.now()) {
    const elapsedMs = Math.max(0, now - entry.enqueuedAt);
    let range = SEARCH_WINDOWS[0].range;
    for (const window of SEARCH_WINDOWS) {
      if (elapsedMs >= window.afterMs) range = window.range;
    }
    return {
      elapsedMs,
      range,
      min: range === Infinity ? null : entry.displayRating - range,
      max: range === Infinity ? null : entry.displayRating + range
    };
  }

  findMatch(now = Date.now()) {
    const ordered = [...this.entries.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    for (const seeker of ordered) {
      const search = this.getSearchRange(seeker, now);
      let best = null;
      let bestGap = Infinity;
      for (const candidate of ordered) {
        if (candidate.userId === seeker.userId) continue;
        const gap = Math.abs(candidate.displayRating - seeker.displayRating);
        if (gap > search.range) continue;
        if (gap < bestGap) {
          best = candidate;
          bestGap = gap;
        }
      }
      if (best) {
        this.dequeue(seeker.userId);
        this.dequeue(best.userId);
        return [seeker, best];
      }
    }
    return null;
  }

  getEntries() {
    return [...this.entries.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }
}
```

- [ ] **Step 4: Run queue tests**

Run:

```bash
node --test tests/unit/pvp/ranked-match-queue.test.js
```

Expected: PASS.

- [ ] **Step 5: Syntax-check queue module**

Run:

```bash
node --check src/pvp/ranked-match-queue.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/pvp/ranked-match-queue.js tests/unit/pvp/ranked-match-queue.test.js
git commit -m "$(cat <<'EOF'
Add ranked match queue

EOF
)"
```

## Task 4: MatchManager Paired Ranked Matches

**Files:**
- Modify: `src/pvp/match-manager.js`
- Modify: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Add failing MatchManager tests**

Append to `tests/unit/pvp/match-manager.test.js` inside the top-level `describe('MatchManager', ...)` block:

```js
  describe('createPairedMatch', () => {
    it('creates a full team_select match for two queued players', () => {
      const code = mgr.createPairedMatch(
        { userId: 'user1', username: 'Alpha', socketId: 'sock1' },
        { userId: 'user2', username: 'Beta', socketId: 'sock2' },
        { ranked: true, rankedRatingBefore: { user1: { displayRating: 1200 }, user2: { displayRating: 1210 } } }
      );

      const match = mgr.getMatch(code);
      assert.strictEqual(match.phase, 'team_select');
      assert.strictEqual(match.ranked, true);
      assert.deepStrictEqual(match.rankedRatingBefore, {
        user1: { displayRating: 1200 },
        user2: { displayRating: 1210 }
      });
      assert.strictEqual(match.player1.username, 'Alpha');
      assert.strictEqual(match.player2.username, 'Beta');
      assert.strictEqual(mgr.findMatchBySocket('sock1').code, code);
      assert.strictEqual(mgr.findMatchBySocket('sock2').code, code);
    });

    it('reports whether a user is already in any match', () => {
      const code = mgr.createMatch('user1', 'sock1');
      assert.strictEqual(mgr.isUserInMatch('user1'), true);
      assert.strictEqual(mgr.isUserInMatch('user2'), false);
      mgr.joinMatch(code, 'user2', 'sock2');
      assert.strictEqual(mgr.isUserInMatch('user2'), true);
    });
  });
```

- [ ] **Step 2: Run MatchManager tests to verify failure**

Run:

```bash
node --test tests/unit/pvp/match-manager.test.js
```

Expected: FAIL because `createPairedMatch` and `isUserInMatch` do not exist.

- [ ] **Step 3: Implement user exclusivity helper**

In `src/pvp/match-manager.js`, add this method after `getMatch(code)`:

```js
  isUserInMatch(userId) {
    for (const match of this.matches.values()) {
      if (match.player1?.userId === userId || match.player2?.userId === userId) {
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 4: Implement paired match helper**

In `src/pvp/match-manager.js`, add this method after `createMatch(userId, socketId)`:

```js
  createPairedMatch(player1, player2, options = {}) {
    const code = this._generateCode();
    const match = {
      code,
      player1: {
        userId: player1.userId,
        username: player1.username,
        socketId: player1.socketId,
        team: null,
        ready: false,
        movesSubmitted: null,
        wantsRematch: false
      },
      player2: {
        userId: player2.userId,
        username: player2.username,
        socketId: player2.socketId,
        team: null,
        ready: false,
        movesSubmitted: null,
        wantsRematch: false
      },
      phase: 'team_select',
      combat: null,
      winnerId: null,
      winnerName: null,
      ranked: options.ranked === true,
      rankedRatingBefore: options.rankedRatingBefore || null,
      createdAt: Date.now()
    };
    this.matches.set(code, match);
    this.socketToMatch.set(player1.socketId, code);
    this.socketToMatch.set(player2.socketId, code);
    return code;
  }
```

- [ ] **Step 5: Run MatchManager tests**

Run:

```bash
node --test tests/unit/pvp/match-manager.test.js
```

Expected: PASS.

- [ ] **Step 6: Syntax-check MatchManager**

Run:

```bash
node --check src/pvp/match-manager.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/pvp/match-manager.js tests/unit/pvp/match-manager.test.js
git commit -m "$(cat <<'EOF'
Support paired ranked PvP matches

EOF
)"
```

## Task 5: Ranked Result Persistence Service

**Files:**
- Create: `tests/unit/pvp/ranked-result-service.test.js`
- Create: `src/pvp/ranked-result-service.js`

- [ ] **Step 1: Write failing result service tests**

Create `tests/unit/pvp/ranked-result-service.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultRankedState } from '../../../src/pvp/ranked-rating.js';
import { applyRankedMatchResult } from '../../../src/pvp/ranked-result-service.js';

function manager(name, ranked = createDefaultRankedState()) {
  return {
    player: { name },
    meta: { pvpRanked: ranked },
    getMeta() {
      return this.meta;
    }
  };
}

describe('applyRankedMatchResult', () => {
  it('updates both players when a ranked match has a winner', () => {
    const managers = new Map([
      ['winner', manager('WinnerName')],
      ['loser', manager('IllegalIcarus')]
    ]);
    const saveManager = mock.fn();
    const result = applyRankedMatchResult({
      match: {
        ranked: true,
        player1: { userId: 'winner', username: 'WinnerName' },
        player2: { userId: 'loser', username: 'IllegalIcarus' },
        rankedRatingBefore: {
          winner: { rating: createDefaultRankedState().rating },
          loser: { rating: createDefaultRankedState().rating }
        }
      },
      winnerId: 'winner',
      getManager: (userId) => managers.get(userId),
      saveManager,
      finishedAt: '2026-05-22T04:00:00.000Z'
    });

    assert.strictEqual(result.winner.userId, 'winner');
    assert.strictEqual(result.loser.userId, 'loser');
    assert.strictEqual(managers.get('winner').meta.pvpRanked.wins, 1);
    assert.strictEqual(managers.get('loser').meta.pvpRanked.losses, 1);
    assert.strictEqual(saveManager.mock.callCount(), 2);
    assert.deepStrictEqual(saveManager.mock.calls.map(c => c.arguments[0]).sort(), ['loser', 'winner']);
  });

  it('returns null for casual matches', () => {
    const saveManager = mock.fn();
    const result = applyRankedMatchResult({
      match: { ranked: false },
      winnerId: 'winner',
      getManager: () => manager('Any'),
      saveManager
    });
    assert.strictEqual(result, null);
    assert.strictEqual(saveManager.mock.callCount(), 0);
  });
});
```

- [ ] **Step 2: Run result service tests to verify failure**

Run:

```bash
node --test tests/unit/pvp/ranked-result-service.test.js
```

Expected: FAIL because `src/pvp/ranked-result-service.js` does not exist.

- [ ] **Step 3: Implement result service**

Create `src/pvp/ranked-result-service.js`:

```js
import { normalizeRankedState, updateRankedAfterMatch, toPublicRankedSummary } from './ranked-rating.js';

function findPlayerKey(match, userId) {
  if (match.player1?.userId === userId) return 'player1';
  if (match.player2?.userId === userId) return 'player2';
  return null;
}

export function applyRankedMatchResult({
  match,
  winnerId,
  getManager,
  saveManager,
  finishedAt = new Date().toISOString()
}) {
  if (!match?.ranked || !winnerId || winnerId === 'draw') return null;
  const winnerKey = findPlayerKey(match, winnerId);
  const loserKey = winnerKey === 'player1' ? 'player2' : winnerKey === 'player2' ? 'player1' : null;
  if (!winnerKey || !loserKey || !match[loserKey]) return null;

  const winnerPlayer = match[winnerKey];
  const loserPlayer = match[loserKey];
  const winnerManager = getManager(winnerPlayer.userId);
  const loserManager = getManager(loserPlayer.userId);
  const winnerMeta = winnerManager.getMeta ? winnerManager.getMeta() : winnerManager.meta;
  const loserMeta = loserManager.getMeta ? loserManager.getMeta() : loserManager.meta;

  const beforeWinner = normalizeRankedState(
    match.rankedRatingBefore?.[winnerPlayer.userId] || winnerMeta.pvpRanked
  );
  const beforeLoser = normalizeRankedState(
    match.rankedRatingBefore?.[loserPlayer.userId] || loserMeta.pvpRanked
  );

  const update = updateRankedAfterMatch({
    winnerRanked: beforeWinner,
    loserRanked: beforeLoser,
    winnerName: winnerPlayer.username || winnerManager.player?.name || 'Winner',
    loserName: loserPlayer.username || loserManager.player?.name || 'Opponent',
    finishedAt
  });

  winnerMeta.pvpRanked = update.winner.ranked;
  loserMeta.pvpRanked = update.loser.ranked;
  saveManager(winnerPlayer.userId);
  saveManager(loserPlayer.userId);

  return {
    winner: {
      userId: winnerPlayer.userId,
      ranked: toPublicRankedSummary(winnerMeta.pvpRanked)
    },
    loser: {
      userId: loserPlayer.userId,
      ranked: toPublicRankedSummary(loserMeta.pvpRanked)
    }
  };
}

export function rankedResultForUser(result, userId) {
  if (!result) return null;
  if (result.winner.userId === userId) return result.winner.ranked;
  if (result.loser.userId === userId) return result.loser.ranked;
  return null;
}
```

- [ ] **Step 4: Run result service tests**

Run:

```bash
node --test tests/unit/pvp/ranked-result-service.test.js
```

Expected: PASS.

- [ ] **Step 5: Syntax-check result service**

Run:

```bash
node --check src/pvp/ranked-result-service.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/pvp/ranked-result-service.js tests/unit/pvp/ranked-result-service.test.js
git commit -m "$(cat <<'EOF'
Persist ranked PvP results

EOF
)"
```

## Task 6: Ranked Socket Queue Integration

**Files:**
- Modify: `src/pvp/socket-handler.js`
- Modify: `server.js`
- Create: `tests/unit/pvp/socket-handler-ranked.test.js`

- [ ] **Step 1: Add a focused socket unit test for injected dependencies**

Create `tests/unit/pvp/socket-handler-ranked.test.js` with a minimal fake that verifies `setupPvpSockets` accepts injected manager functions and returns a queue-backed handler object:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupPvpSockets } from '../../../src/pvp/socket-handler.js';

function fakeIo() {
  return {
    middlewares: [],
    handlers: new Map(),
    sockets: { sockets: new Map() },
    use(fn) {
      this.middlewares.push(fn);
    },
    on(event, fn) {
      this.handlers.set(event, fn);
    },
    to() {
      return { emit: mock.fn() };
    }
  };
}

describe('setupPvpSockets ranked dependencies', () => {
  it('returns ranked queue state for tests and production wiring', () => {
    const io = fakeIo();
    const getManager = mock.fn();
    const saveManager = mock.fn();
    const result = setupPvpSockets(io, { getManager, saveManager, getSettings: () => ({}) });
    assert.ok(result.mm);
    assert.ok(result.rankedQueue);
    assert.strictEqual(io.middlewares.length, 1);
    assert.strictEqual(typeof io.handlers.get('connection'), 'function');
  });
});
```

- [ ] **Step 2: Run the socket test to verify failure**

Run:

```bash
node --test tests/unit/pvp/socket-handler-ranked.test.js
```

Expected: FAIL because `rankedQueue` is not returned.

- [ ] **Step 3: Add socket handler imports and injected manager dependencies**

In `src/pvp/socket-handler.js`, add imports:

```js
import { getManager as defaultGetManager, saveManager as defaultSaveManager } from '../game/manager-registry.js';
import { RankedMatchQueue } from './ranked-match-queue.js';
import { normalizeRankedState, getDisplayRating } from './ranked-rating.js';
import { applyRankedMatchResult, rankedResultForUser } from './ranked-result-service.js';
```

Change the setup signature:

```js
export function setupPvpSockets(io, { getSettings, getManager = defaultGetManager, saveManager = defaultSaveManager } = {}) {
  const mm = new MatchManager({ dataDir: getDataDir(), getSettings });
  const rankedQueue = new RankedMatchQueue();
```

Change the return at the bottom:

```js
  return { mm, io, rankedQueue };
```

- [ ] **Step 4: Add ranked pairing helper and queue update tick**

Inside `setupPvpSockets`, after `disconnectTimers` is declared and before `io.use(...)`, add:

```js
  function createRankedMatchForPair(player1, player2) {
    const code = mm.createPairedMatch(player1, player2, {
      ranked: true,
      rankedRatingBefore: {
        [player1.userId]: { rating: player1.rating, displayRating: player1.displayRating },
        [player2.userId]: { rating: player2.rating, displayRating: player2.displayRating }
      }
    });
    const p1Socket = io.sockets.sockets.get(player1.socketId);
    const p2Socket = io.sockets.sockets.get(player2.socketId);
    p1Socket?.join(code);
    p2Socket?.join(code);
    p1Socket?.emit('pvp:ranked-match-found', {
      code,
      opponentName: player2.username,
      opponentRating: player2.displayRating
    });
    p2Socket?.emit('pvp:ranked-match-found', {
      code,
      opponentName: player1.username,
      opponentRating: player1.displayRating
    });
  }

  function tryCreateRankedPair(now = Date.now()) {
    const pair = rankedQueue.findMatch(now);
    if (!pair) return false;
    createRankedMatchForPair(pair[0], pair[1]);
    return true;
  }

  const queueTick = setInterval(() => {
    const now = Date.now();
    for (const entry of rankedQueue.getEntries()) {
      const queuedSocket = io.sockets.sockets.get(entry.socketId);
      queuedSocket?.emit('pvp:ranked-queue-update', {
        elapsedMs: Math.max(0, now - entry.enqueuedAt),
        searchRange: rankedQueue.getSearchRange(entry, now)
      });
    }
    tryCreateRankedPair(now);
  }, 1000);
  queueTick.unref?.();
```

- [ ] **Step 5: Add ranked enqueue/dequeue handlers**

Inside `io.on('connection', socket => { ... })`, before `pvp:create-match`, add:

```js
    socket.on('pvp:ranked-enqueue', () => {
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Already in ranked queue' });
        return;
      }
      if (mm.isUserInMatch(socket.userId)) {
        socket.emit('pvp:error', { message: 'Already in a PvP match' });
        return;
      }

      const gm = getManager(socket.userId);
      const meta = gm.getMeta ? gm.getMeta() : gm.meta;
      const hasTeam = (meta.pvpTeams || []).some(Boolean);
      if (!hasTeam) {
        socket.emit('pvp:error', { message: 'Save a PvP team before entering ranked queue' });
        return;
      }

      meta.pvpRanked = normalizeRankedState(meta.pvpRanked);
      const entry = {
        userId: socket.userId,
        username: socket.username,
        socketId: socket.id,
        rating: meta.pvpRanked.rating,
        displayRating: getDisplayRating(meta.pvpRanked.rating),
        enqueuedAt: Date.now()
      };
      rankedQueue.enqueue(entry);
      socket.emit('pvp:ranked-queued', {
        rating: entry.displayRating,
        searchRange: rankedQueue.getSearchRange(entry)
      });
      tryCreateRankedPair();
    });

    socket.on('pvp:ranked-dequeue', () => {
      rankedQueue.dequeue(socket.userId);
      socket.emit('pvp:ranked-dequeued');
    });
```

- [ ] **Step 6: Block casual creation/join while queued**

At the top of the existing `pvp:create-match` handler, add:

```js
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Leave ranked queue before creating a casual match' });
        return;
      }
```

At the top of the existing `pvp:join-match` handler, add:

```js
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Leave ranked queue before joining a casual match' });
        return;
      }
```

- [ ] **Step 7: Persist ranked results before emitting match end**

In the `pvp:submit-action` winner block, replace the room-wide emit:

```js
          io.to(found.code).emit('pvp:match-end', { winnerId, winnerName });
```

with per-socket ranked-aware emits:

```js
          let rankedUpdate = null;
          try {
            rankedUpdate = applyRankedMatchResult({
              match,
              winnerId,
              getManager,
              saveManager
            });
          } catch (error) {
            console.warn('[PvP] Failed to persist ranked result:', error.message);
          }
          if (p1Socket) {
            p1Socket.emit('pvp:match-end', {
              winnerId,
              winnerName,
              rankedResult: rankedResultForUser(rankedUpdate, match.player1.userId)
            });
          }
          if (p2Socket) {
            p2Socket.emit('pvp:match-end', {
              winnerId,
              winnerName,
              rankedResult: rankedResultForUser(rankedUpdate, match.player2.userId)
            });
          }
```

Apply the same ranked result pattern to the legacy `pvp:submit-moves` winner block and to disconnect-forfeit emit paths. For the legacy block, use the existing `p1Socket` and `p2Socket` variables already in scope. For disconnect forfeit, read `match` before `mm.forfeitMatch`, call `applyRankedMatchResult` with `winnerId: forfeitResult.winnerId`, and emit `rankedResult` to each connected player.

- [ ] **Step 8: Remove queued users on disconnect**

At the beginning of the existing `disconnect` handler, add:

```js
      rankedQueue.removeBySocket(socket.id);
```

- [ ] **Step 9: Fix reconnect payload compatibility**

Change the reconnect handler signature from:

```js
    socket.on('pvp:reconnect', ({ matchCode } = {}) => {
```

to:

```js
    socket.on('pvp:reconnect', ({ matchCode, code } = {}) => {
      matchCode ||= code;
```

- [ ] **Step 10: Wire server dependencies**

In `server.js`, add:

```js
import { getManager, saveManager } from './src/game/manager-registry.js';
```

Change the setup call:

```js
setupPvpSockets(io, { getSettings: () => settings, getManager, saveManager });
```

- [ ] **Step 11: Run socket and PvP unit tests**

Run:

```bash
node --test tests/unit/pvp/socket-handler-ranked.test.js tests/unit/pvp/match-manager.test.js tests/unit/pvp/ranked-result-service.test.js
```

Expected: PASS.

- [ ] **Step 12: Syntax-check server-side PvP files**

Run:

```bash
node --check src/pvp/socket-handler.js && node --check server.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 13: Commit**

```bash
git add src/pvp/socket-handler.js server.js tests/unit/pvp/socket-handler-ranked.test.js
git commit -m "$(cat <<'EOF'
Wire ranked PvP queue sockets

EOF
)"
```

## Task 7: Client Socket Wrapper

**Files:**
- Modify: `public/js/pvp-socket.js`

- [ ] **Step 1: Add ranked events to the wrapper**

In `public/js/pvp-socket.js`, add these events to the `events` array:

```js
    'pvp:ranked-queued', 'pvp:ranked-dequeued', 'pvp:ranked-queue-update',
    'pvp:ranked-match-found',
```

The array should still include `pvp:error`.

- [ ] **Step 2: Add queue functions and ranked match code tracking**

After `joinMatch(code)`, add:

```js
export function enqueueRanked() {
  socket?.emit('pvp:ranked-enqueue');
}

export function dequeueRanked() {
  socket?.emit('pvp:ranked-dequeue');
}
```

At the bottom of the file, add:

```js
on('pvp:ranked-match-found', ({ code }) => {
  currentMatchCode = code;
  sessionStorage.setItem('pvpMatchCode', code);
});
```

- [ ] **Step 3: Fix reconnect payload**

Change:

```js
      socket.emit('pvp:reconnect', { code });
```

to:

```js
      socket.emit('pvp:reconnect', { matchCode: code });
```

- [ ] **Step 4: Syntax-check wrapper**

Run:

```bash
node --check public/js/pvp-socket.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add public/js/pvp-socket.js
git commit -m "$(cat <<'EOF'
Add ranked PvP socket client events

EOF
)"
```

## Task 8: Multiplayer Lobby UI

**Files:**
- Modify: `public/js/ui/pvp-lobby.js`
- Modify: `public/js/api.js`
- Modify: `public/game.css`

- [ ] **Step 1: Preserve ranked summary from `getPvpTeams`**

In `public/js/api.js`, keep `getPvpTeams` returning the full JSON response. If it currently narrows the response, change it so the caller receives both `pvpTeams` and `ranked`.

Expected shape:

```js
{
  pvpTeams: [null, null, null],
  ranked: {
    rating: 1200,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    lastMatch: null
  }
}
```

- [ ] **Step 2: Add lobby state render helpers**

In `public/js/ui/pvp-lobby.js`, add module-scoped state near the existing module references:

```js
let latestPvpSummary = null;
```

Add these helpers above `renderPvpLobby()`:

```js
function rankedRecordText(ranked) {
  return `${ranked?.wins || 0}W - ${ranked?.losses || 0}L`;
}

function lastMatchHtml(lastMatch) {
  if (!lastMatch) return '';
  const resultText = lastMatch.result === 'win' ? 'Victory' : 'Defeat';
  const resultColor = lastMatch.result === 'win' ? 'var(--accent-green)' : 'var(--accent-red)';
  return `
    <div class="pvp-ranked-card">
      <div class="pvp-ranked-label">Last Ranked Match</div>
      <div class="pvp-last-match-result" style="color:${resultColor};">
        ${resultText} vs ${escapeHtml(lastMatch.opponentName || 'Opponent')}
      </div>
      <div class="pvp-ranked-muted">Opponent rating ${Number(lastMatch.opponentRatingBefore) || 1200}</div>
      <div class="pvp-rating-transition">
        <span>${Number(lastMatch.ratingBefore) || 1200}</span>
        <span aria-hidden="true">→</span>
        <strong>${Number(lastMatch.ratingAfter) || 1200}</strong>
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Replace main lobby content with current-style ranked layout**

Change `renderPvpLobby()` to fetch summary before `actions.setContent`:

```js
  const summary = await getPvpTeams();
  latestPvpSummary = summary || { pvpTeams: [null, null, null], ranked: { rating: 1200, wins: 0, losses: 0, matchesPlayed: 0, lastMatch: null } };
  const ranked = latestPvpSummary.ranked;
```

Change the function declaration:

```js
export async function renderPvpLobby() {
```

Replace the `actions.setContent` body with:

```js
  actions.setContent(`
    <div class="pvp-lobby" style="display:flex;flex-direction:column;align-items:stretch;gap:14px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:4px;">
        PvP Battle Lobby
      </div>
      <div class="pvp-ranked-card">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;">
          <div>
            <div class="pvp-ranked-label">Ranked Rating</div>
            <div class="pvp-ranked-rating">${Number(ranked?.rating) || 1200}</div>
          </div>
          <div style="text-align:right;">
            <div class="pvp-ranked-label">Record</div>
            <div class="pvp-ranked-record">${escapeHtml(rankedRecordText(ranked))}</div>
          </div>
        </div>
      </div>
      <button class="action-btn action-btn-primary" id="pvp-ranked-btn">
        Find Ranked Match
        <span class="pvp-btn-subtitle">Estimated range: ${(Number(ranked?.rating) || 1200) - 75} - ${(Number(ranked?.rating) || 1200) + 75}</span>
      </button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button class="action-btn" id="pvp-create-btn">Create Casual</button>
        <button class="action-btn" id="pvp-join-casual-btn">Join Casual</button>
      </div>
      ${lastMatchHtml(ranked?.lastMatch)}
      <button class="action-btn action-btn-tertiary" id="pvp-back-btn">
        Back
      </button>
    </div>
  `);
```

- [ ] **Step 4: Add event handlers for ranked and casual sub-state**

Replace the old join-code button/input handlers with:

```js
  document.getElementById('pvp-ranked-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    renderRankedQueue();
    pvpSocket.enqueueRanked();
  });

  document.getElementById('pvp-join-casual-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    renderJoinCasual();
  });
```

Keep `pvp-create-btn` but it now means casual:

```js
  document.getElementById('pvp-create-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.createMatch();
  });
```

- [ ] **Step 5: Add Join Casual sub-state**

Add this function below `renderPvpLobby()`:

```js
function renderJoinCasual(errorMessage = '') {
  actions.setContent(`
    <div class="pvp-lobby" style="display:flex;flex-direction:column;align-items:stretch;gap:14px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:4px;">
        Join Casual Match
      </div>
      <div class="pvp-ranked-card">
        <div class="pvp-ranked-label" style="text-align:center;margin-bottom:10px;">Room Code</div>
        <input type="text" id="pvp-join-code" placeholder="Enter code"
          maxlength="4" autocapitalize="characters" autocomplete="off"
          style="width:100%;padding:10px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--bg-panel);color:var(--text-primary);font-size:1.1em;text-transform:uppercase;text-align:center;letter-spacing:4px;font-weight:600;box-sizing:border-box;">
        <div class="pvp-ranked-muted" style="text-align:center;margin-top:10px;">
          Enter the 4-character code from your friend. Casual matches do not affect ranked rating.
        </div>
      </div>
      <button class="action-btn action-btn-primary" id="pvp-join-btn">Join Match</button>
      ${errorMessage ? `<div class="pvp-inline-error">${escapeHtml(errorMessage)}</div>` : ''}
      <button class="action-btn action-btn-tertiary" id="pvp-join-cancel-btn">Cancel</button>
    </div>
  `);

  document.getElementById('pvp-join-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    const code = document.getElementById('pvp-join-code')?.value?.trim().toUpperCase();
    if (!code || code.length !== 4) {
      renderJoinCasual('Enter a 4-character match code');
      return;
    }
    pvpSocket.joinMatch(code);
  });

  document.getElementById('pvp-join-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pvp-join-btn')?.click();
  });

  document.getElementById('pvp-join-cancel-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    renderPvpLobby();
  });
}
```

- [ ] **Step 6: Add Ranked Queue sub-state**

Add this function below `renderJoinCasual`:

```js
function renderRankedQueue(searchRange = null) {
  const rating = Number(latestPvpSummary?.ranked?.rating) || 1200;
  const rangeText = searchRange?.range === Infinity
    ? 'Any available rating'
    : `${searchRange?.min ?? rating - 75} - ${searchRange?.max ?? rating + 75}`;
  actions.setContent(`
    <div class="pvp-lobby" style="display:flex;flex-direction:column;align-items:stretch;gap:14px;width:100%;max-width:340px;margin:0 auto;padding:8px 0;">
      <div style="text-align:center;color:var(--text-secondary);font-size:0.9em;margin-bottom:4px;">
        Finding Ranked Match
      </div>
      <div class="pvp-ranked-card" style="text-align:center;">
        <div class="pvp-ranked-label">Your Ranked Rating</div>
        <div class="pvp-ranked-rating">${rating}</div>
        <div class="pvp-ranked-muted">Searching: ${escapeHtml(rangeText)}</div>
      </div>
      <div style="text-align:center;color:var(--text-secondary);font-size:0.85em;animation:pulse 2s ease-in-out infinite;">
        Looking for an opponent...
      </div>
      <button class="action-btn action-btn-tertiary" id="pvp-ranked-cancel-btn">Cancel</button>
    </div>
  `);
  document.getElementById('pvp-ranked-cancel-btn')?.addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.dequeueRanked();
    renderPvpLobby();
  });
}
```

- [ ] **Step 7: Register ranked lobby socket handlers**

In `renderPvpLobby()`, after existing socket handlers:

```js
  pvpSocket.on('pvp:ranked-queued', ({ searchRange }) => {
    renderRankedQueue(searchRange);
  });

  pvpSocket.on('pvp:ranked-queue-update', ({ searchRange }) => {
    renderRankedQueue(searchRange);
  });

  pvpSocket.on('pvp:ranked-match-found', () => {
    renderPvpTeamSelect();
  });
```

Change the existing `pvp:error` handler from `alert(message)` to:

```js
    const joinInput = document.getElementById('pvp-join-code');
    if (joinInput) renderJoinCasual(message);
    else alert(message);
```

- [ ] **Step 8: Add small CSS classes**

At the bottom of `public/game.css`, add:

```css
.pvp-ranked-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--card-radius);
  padding: 12px 14px;
  box-shadow: var(--shadow-soft);
}
.pvp-ranked-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.3px;
  color: var(--text-secondary);
}
.pvp-ranked-rating {
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
  color: var(--accent-amber);
  margin-top: 3px;
}
.pvp-ranked-record {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 4px;
}
.pvp-ranked-muted {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
}
.pvp-btn-subtitle {
  display: block;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.88;
  margin-top: 2px;
}
.pvp-last-match-result {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 4px;
}
.pvp-rating-transition {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-weight: 600;
}
.pvp-rating-transition strong {
  color: var(--accent-amber);
  font-size: 26px;
  font-weight: 800;
}
.pvp-inline-error {
  background: rgba(239, 83, 80, 0.08);
  border: 1px solid rgba(239, 83, 80, 0.18);
  border-radius: var(--card-radius);
  padding: 10px 12px;
  color: var(--accent-red);
  font-size: 12px;
  text-align: center;
  font-weight: 600;
}
```

- [ ] **Step 9: Syntax-check client files**

Run:

```bash
node --check public/js/api.js && node --check public/js/ui/pvp-lobby.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 10: Commit**

```bash
git add public/js/api.js public/js/ui/pvp-lobby.js public/game.css
git commit -m "$(cat <<'EOF'
Add ranked multiplayer lobby UI

EOF
)"
```

## Task 9: Ranked Battle Result UI

**Files:**
- Modify: `public/js/ui/pvp-battle.js`
- Modify: `src/pvp/socket-handler.js`

- [ ] **Step 1: Store ranked match metadata on battle start**

In `startPvpBattle(data)`, add these fields to `pvpState`:

```js
    ranked: data.ranked === true,
    rankedResult: null,
```

In `socket-handler.js`, include `ranked: match.ranked === true` in both `pvp:match-start` payloads.

- [ ] **Step 2: Pass ranked result into result rendering**

Change `handleMatchEnd(data)`:

```js
  pvpState.rankedResult = data.rankedResult || null;
  renderResult(resultText, resultColor, winnerName, data.rankedResult || null);
```

Change the render function signature:

```js
function renderResult(resultText, resultColor, winnerName, rankedResult = null) {
```

- [ ] **Step 3: Add rating transition HTML helper**

Add above `renderResult`:

```js
function rankedResultHtml(rankedResult) {
  const lastMatch = rankedResult?.lastMatch;
  if (!lastMatch) return '';
  const before = Number(lastMatch.ratingBefore) || Number(rankedResult.rating) || 1200;
  const after = Number(lastMatch.ratingAfter) || Number(rankedResult.rating) || before;
  return `
    <div class="pvp-ranked-card" style="width:100%;">
      <div class="pvp-ranked-label">Ranked Rating</div>
      <div class="pvp-rating-transition" data-rating-before="${before}" data-rating-after="${after}">
        <span class="pvp-rating-before">${before}</span>
        <span aria-hidden="true">→</span>
        <strong class="pvp-rating-after">${before}</strong>
      </div>
    </div>
  `;
}
```

Add below `renderResult`:

```js
function animateRankedRating() {
  const el = document.querySelector('.pvp-rating-transition');
  const afterEl = el?.querySelector('.pvp-rating-after');
  if (!el || !afterEl) return;
  const before = Number(el.dataset.ratingBefore);
  const after = Number(el.dataset.ratingAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return;
  const duration = 700;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const value = Math.round(before + (after - before) * progress);
    afterEl.textContent = String(value);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

- [ ] **Step 4: Render ranked result without rematch**

Inside `renderResult`, before `actions.setContent`, define:

```js
  const isRanked = !!rankedResult;
```

Replace the button block in the result HTML with:

```js
      ${rankedResultHtml(rankedResult)}
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
        ${isRanked ? '' : `<button class="action-btn action-btn-primary" id="pvp-rematch-btn">Rematch</button>`}
        <button class="action-btn action-btn-tertiary" id="pvp-result-hub-btn">
          ${isRanked ? 'Return to Multiplayer' : 'Return to Hub'}
        </button>
      </div>
```

Guard the rematch listener:

```js
  if (!isRanked) {
    document.getElementById('pvp-rematch-btn')?.addEventListener('click', () => {
      playSFX('button-tap');
      pvpSocket.requestRematch();
      const btn = document.getElementById('pvp-rematch-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Waiting for opponent...';
      }
    });
  }
```

After registering listeners, call:

```js
  animateRankedRating();
```

- [ ] **Step 5: Return ranked players to multiplayer page**

Rename `returnToHub` to:

```js
function returnFromPvp({ toMultiplayer = false } = {}) {
  pvpSocket.leaveMatch();
  pvpSocket.disconnect();
  pvpState = null;

  const gameState = getGameState();
  gameState.phase = toMultiplayer ? 'pvp_lobby' : 'hub';
  updateUI();
}
```

Update calls:

```js
returnFromPvp();
returnFromPvp({ toMultiplayer: isRanked });
```

- [ ] **Step 6: Syntax-check battle UI**

Run:

```bash
node --check public/js/ui/pvp-battle.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/pvp-battle.js src/pvp/socket-handler.js
git commit -m "$(cat <<'EOF'
Show ranked PvP result changes

EOF
)"
```

## Task 10: Full Verification and Visual QA

**Files:**
- Read: `docs/playtest-guide.md`
- No planned source edits unless verification finds issues.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
node --test tests/unit/pvp/ranked-rating.test.js tests/unit/pvp/ranked-match-queue.test.js tests/unit/pvp/ranked-result-service.test.js tests/unit/pvp/match-manager.test.js tests/unit/routes/pvp.test.js tests/unit/pvp/socket-handler-ranked.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full unit and integration suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Syntax-check all changed frontend modules**

Run:

```bash
node --check public/js/pvp-socket.js && node --check public/js/ui/pvp-lobby.js && node --check public/js/ui/pvp-battle.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Start dev server for visual verification**

Before starting a new server, check existing terminals for an active `npm run dev`. If none is running, run:

```bash
npm run dev
```

Use `block_until_ms: 0` if running through an agent shell. After startup, verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 5: Ask user before opening Playwright**

Ask for permission before opening a Playwright browser session. After permission, follow `docs/playtest-guide.md`.

- [ ] **Step 6: Visually verify multiplayer page**

Navigate to the game, reach the hub, open Multiplayer, and capture screenshots proving:

- Ranked Rating card uses current Koto style.
- `Find Ranked Match` is visible with estimated range.
- `Create Casual` and `Join Casual` are visible.
- Last ranked match card truncates long names like `IllegalIcarus` cleanly.

Delete any screenshot files immediately after they have been shown.

- [ ] **Step 7: Visually verify Join Casual sub-state**

Click `Join Casual` and capture screenshots proving:

- Code entry screen uses current input and card styles.
- `Cancel` returns to the main Multiplayer page.
- Invalid or missing code shows inline error text.

Delete screenshots immediately after they have been shown.

- [ ] **Step 8: Verify ranked queue and result flow**

With two authenticated sessions or a controlled test setup:

- Queue both users.
- Confirm they are matched into team select.
- Complete a ranked match.
- Confirm the result screen shows old rating to new rating.
- Confirm no rematch button appears for ranked.
- Click `Return to Multiplayer`.
- Confirm the Multiplayer page shows updated rating and last ranked match.

Delete screenshots immediately after they have been shown.

- [ ] **Step 9: Final commit**

```bash
git status --short
git add docs/superpowers/specs/2026-05-22-ranked-matchmaking-design.md docs/superpowers/plans/2026-05-22-ranked-matchmaking.md
git commit -m "$(cat <<'EOF'
Plan ranked PvP matchmaking

EOF
)"
```

Only run this commit step if the implementation branch policy says docs should be committed with the feature work. If the user wants docs committed separately, commit the spec and plan before implementation begins.
