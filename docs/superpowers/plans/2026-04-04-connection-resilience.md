# Connection Resilience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Koto resilient to spotty mobile connections — fix acute stuck-player bugs, add retry/offline infrastructure, and harden PvP reconnection.

**Architecture:** Three phases. Phase A fixes three bugs stranding real players. Phase B adds a resilience layer to `apiCall` (retry, per-endpoint dedup, offline banner, 401 redirect). Phase C hardens PvP with Socket.IO auto-reconnect, forfeit/timeout, and match persistence.

**Tech Stack:** Vanilla JS frontend (ES modules), Node/Express backend, Socket.IO for PvP, file-based JSON persistence (migrating to Postgres later).

**Spec:** `docs/superpowers/specs/2026-04-04-connection-resilience-design.md`

---

## Chunk 1: Phase A — Fix Acute Bugs

### Task 1: Fix token key in loadKnownWords

**Files:**
- Modify: `public/game.js:636`

- [ ] **Step 1: Fix the token key**

In `public/game.js`, line 636, change `'token'` to `'authToken'`:

```javascript
// Before:
headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }

// After:
headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
```

- [ ] **Step 2: Verify no other wrong token keys exist**

Run: `grep -rn "localStorage.getItem('token')" public/`

Expected: zero results (every file should use `'authToken'`)

- [ ] **Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/game.js
git commit -m "fix: use correct authToken key in loadKnownWords

Was using localStorage.getItem('token') instead of 'authToken',
causing 401 on /api/game/known-words for every player."
```

---

### Task 2: Persist run + combat state to disk

**Files:**
- Modify: `src/game/manager-registry.js:88-100` (saveManager) and `src/game/manager-registry.js:19-82` (getManager)
- Test: `tests/unit/game/manager-registry.test.js`

- [ ] **Step 1: Write failing test — save includes run and combat**

Add to `tests/unit/game/manager-registry.test.js`:

```javascript
it('saves and restores run and combat state', () => {
  const manager = getManager('u_test123');
  manager.createPlayer('PersistTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });

  // Simulate active run + combat
  manager.run = { active: true, currentArea: 'starter_meadow', currentRoom: 2 };
  manager.combat = { active: true, npcId: 'npc_01', enemies: [{ id: 'c1', hp: 50 }] };
  saveManager('u_test123');

  // Remove from memory to force reload from disk
  removeManager('u_test123');
  const reloaded = getManager('u_test123');

  assert.deepStrictEqual(reloaded.run, { active: true, currentArea: 'starter_meadow', currentRoom: 2 });
  assert.deepStrictEqual(reloaded.combat, { active: true, npcId: 'npc_01', enemies: [{ id: 'c1', hp: 50 }] });
});

it('loads null run/combat from old save files without those fields', () => {
  const saveData = {
    version: 2,
    player: { name: 'OldSave', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, creatures: { active: [], reserves: [] } },
    meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} }
  };
  writeFileSync(testSaveFile, JSON.stringify(saveData));

  const manager = getManager('u_test123');
  assert.equal(manager.run, null);
  assert.equal(manager.combat, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "saves and restores run" 2>&1 | tail -5`

Expected: FAIL (run/combat not saved or restored)

- [ ] **Step 3: Update saveManager to include run + combat**

In `src/game/manager-registry.js`, update `saveManager()` at line 93-98:

```javascript
const state = {
  version: SAVE_VERSION,
  player: manager.player,
  meta: manager.getMeta(),
  run: manager.run || null,
  combat: manager.combat || null,
  savedAt: new Date().toISOString()
};
```

- [ ] **Step 4: Update getManager to restore run + combat**

In `src/game/manager-registry.js`, inside the `getManager()` function, after `manager.initMeta(data.meta)` (line 68), add:

```javascript
        if (data.run) manager.run = data.run;
        if (data.combat) manager.combat = data.combat;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/game/manager-registry.js tests/unit/game/manager-registry.test.js
git commit -m "feat: persist run + combat state to save file

Server restarts (Railway deploys) no longer lose active runs.
Old save files without run/combat fields load with null defaults."
```

---

### Task 3: Combat reload recovery

**Files:**
- Modify: `public/game.js` (updateScene, ~line 558)
- Modify: `public/js/ui/combat-loop.js` (startCombatLoop, ~line 1419)

- [ ] **Step 1: Add recovery mode to startCombatLoop**

In `public/js/ui/combat-loop.js`, change `startCombatLoop` at line 1419:

```javascript
export async function startCombatLoop(opts = {}) {
  if (combatActive) return;

  logger.info('[CombatLoop] Combat started', opts.recovery ? '(recovery)' : '');
  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // On recovery (page reload), re-render enemies before showing moves.
  // updateScene() already rendered enemy sprites, just need the move UI.
  if (opts.recovery && updateUI) {
    updateUI();
  }

  // Start move selection for the first turn
  startMoveSelection();
}
```

- [ ] **Step 2: Export isCombatActive from combat-loop**

Verify `isCombatActive` is already exported. Check:

Run: `grep -n "export.*isCombatActive" public/js/ui/combat-loop.js`

If it exists (it should — it's used in game.js already), no change needed.

- [ ] **Step 3: Add combat recovery handler to updateScene in game.js**

In `public/game.js`, add a recovery flag near the existing `npcDialogueRecoveryDone` (line 403):

```javascript
let npcDialogueRecoveryDone = false;
let combatRecoveryDone = false;
```

Update the phase reset at top of `updateScene()`:

```javascript
function updateScene() {
  if (gameState.phase !== 'npc_dialogue') npcDialogueRecoveryDone = false;
  if (gameState.phase !== 'combat') combatRecoveryDone = false;
```

Change the `combat` case in `updateGameContent()` (currently empty at ~line 558):

```javascript
    case 'combat':
      // On page reload, the combat loop isn't running. Re-initialize it
      // so the player sees their current combat state and can pick moves.
      if (!combatLoopUI.isCombatActive() && !combatRecoveryDone) {
        combatRecoveryDone = true;
        combatLoopUI.startCombatLoop({ recovery: true });
      }
      break;
```

- [ ] **Step 4: Syntax check both files**

Run: `node --check public/game.js && node --check public/js/ui/combat-loop.js && echo "OK"`

Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add public/game.js public/js/ui/combat-loop.js
git commit -m "fix: recover combat UI on page reload

When a player reloads mid-combat, the combat loop now restarts
from server state — skipping entrance animation, rendering current
HP/enemies, and showing move selection immediately."
```

---

## Chunk 2: Phase B — Resilience Layer

### Task 4: Retry with exponential backoff in apiCall

**Files:**
- Modify: `public/js/api.js:40-82`
- Modify: `public/game.js:808-813` (remove hardcoded startRun retry)

- [ ] **Step 1: Add retry logic to apiCall**

Replace the `apiCall` function in `public/js/api.js` (lines 40-82):

```javascript
async function apiCall(endpoint, method = 'POST', body = null, onError = null, opts = {}) {
  logger.debug('[API] Request:', { endpoint, method });
  const bypassGate = opts.bypassLoadingGate === true;

  // Per-endpoint dedup (Task 5 will refine this further)
  if (!bypassGate && inFlightRequests.has(endpoint)) {
    logger.warn('[API] Request deduped - in flight:', { endpoint });
    return null;
  }

  // Determine retry behavior: GETs always retry, POSTs only if opted in
  const maxAttempts = (method === 'GET' || opts.retryable) ? 3 : 1;

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const baseDelay = 500 * Math.pow(2, attempt - 1);
      const jitter = baseDelay * (0.8 + Math.random() * 0.4);
      await new Promise(r => setTimeout(r, jitter));
      logger.debug('[API] Retry:', { endpoint, attempt });
    }

    inFlightRequests.add(endpoint);
    const startedAt = performance.now();

    try {
      const options = {
        method,
        headers: getAuthHeaders()
      };
      if (method !== 'GET' && body) options.body = JSON.stringify(body);

      const response = await fetch(`${PLATFORM.apiBase}/api/game${endpoint}`, options);

      // 401: token expired — handle before parsing body
      if (response.status === 401) {
        // Task 7 will add redirect logic here
        throw new Error('Session expired');
      }

      const data = await response.json();

      if (!response.ok) {
        if (opts.returnErrorBody) {
          onApiSuccess();
          return { error: data.error || `HTTP ${response.status}` };
        }
        throw new Error(data.error || 'API call failed');
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      console.log(`[API Timing] ${method} /api/game${endpoint} -> ${response.status} in ${elapsedMs}ms`);

      onApiSuccess();
      return data;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      console.log(`[API Timing] ${method} /api/game${endpoint} -> error in ${elapsedMs}ms`);
      lastError = error;

      // Don't retry auth errors
      if (error.message === 'Session expired') break;

      onApiFailure();
    } finally {
      inFlightRequests.delete(endpoint);
    }
  }

  logger.error('[API] Request failed:', { endpoint, error: lastError?.message });
  if (onError) onError(lastError?.message);
  return null;
}
```

- [ ] **Step 2: Add module-level state for dedup and connection tracking**

At the top of `public/js/api.js`, replace the `isLoading` variable (line 16) with:

```javascript
// Per-endpoint deduplication (replaces global isLoading boolean)
const inFlightRequests = new Set();

// Connection health tracking (used by offline banner, Task 6)
let consecutiveFailures = 0;
let connectionCallbacks = { onOffline: null, onOnline: null };

export function setConnectionCallbacks(cbs) {
  connectionCallbacks = cbs;
}

function onApiSuccess() {
  if (consecutiveFailures > 0) {
    consecutiveFailures = 0;
    connectionCallbacks.onOnline?.();
  }
}

function onApiFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= 2) {
    connectionCallbacks.onOffline?.();
  }
}
```

- [ ] **Step 3: Update isApiLoading to use the new Set**

Replace `isApiLoading` (line 87-89) with:

```javascript
function isApiLoading() {
  return inFlightRequests.size > 0;
}
```

- [ ] **Step 4: Mark idempotent POSTs as retryable**

In `public/js/api.js`, update these functions to pass `retryable: true`:

`proceed()` (~line 128): already returns apiCall result, add opts:
```javascript
async function proceed() {
  return apiCall('/proceed', 'POST', null, null, { retryable: true });
}
```

Find and update `creatureCombatCycle` and `combatCycle` similarly. Search for their definitions and add `{ retryable: true }` as the opts parameter.

- [ ] **Step 5: Remove hardcoded retry in startRun**

In `public/game.js`, replace the retry loop at lines 808-813:

```javascript
// Before:
let result = null;
for (let attempt = 0; attempt < 3 && !result?.state; attempt++) {
  if (attempt > 0) await new Promise(r => setTimeout(r, 300));
  result = await apiStartRun({ starterIds });
}

// After:
const result = await apiStartRun({ starterIds });
```

And in `public/js/api.js`, mark `startRun` as retryable:

```javascript
async function startRun(data) {
  return apiCall('/start-run', 'POST', data, null, { retryable: true });
}
```

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/api.js && node --check public/game.js && echo "OK"`

Expected: `OK`

- [ ] **Step 7: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add public/js/api.js public/game.js
git commit -m "feat: add retry with exponential backoff to apiCall

GETs auto-retry up to 2 times. POSTs retry only when marked
retryable (server has idempotency guards). Replaces global
isLoading boolean with per-endpoint deduplication Set.
Removes hardcoded retry loop from startRun."
```

---

### Task 5: Verify per-endpoint dedup works correctly

**Files:**
- Modify: `public/js/api.js` (verify bypassLoadingGate still works)

- [ ] **Step 1: Verify bypassLoadingGate callers still work**

Search for all `bypassLoadingGate` usage:

Run: `grep -n "bypassLoadingGate" public/js/api.js`

Verify each caller that uses `bypassLoadingGate: true` still bypasses the new per-endpoint dedup. The current code already checks `bypassGate` before checking `inFlightRequests`, so this should work. Confirm the logic is correct.

- [ ] **Step 2: Verify returnErrorBody callers still work**

Run: `grep -n "returnErrorBody" public/js/api.js`

Confirm the `returnErrorBody` path still returns the error object correctly (it does — the new code calls `onApiSuccess()` before returning the error body since the HTTP request itself succeeded).

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`

Expected: `OK`

---

### Task 6: Offline detection banner

**Files:**
- Create: `public/js/ui/connection-banner.js`
- Modify: `public/game.css` (add banner styles)
- Modify: `public/game.js` (wire up callbacks)

- [ ] **Step 1: Create connection-banner.js**

Create `public/js/ui/connection-banner.js`:

```javascript
/**
 * Connection status banner.
 * Shows "Connection lost, retrying..." after 2+ consecutive API failures.
 * Auto-dismisses on next successful API call.
 */

let bannerEl = null;
let hideTimer = null;

function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement('div');
  bannerEl.className = 'connection-banner';
  bannerEl.textContent = 'Connection lost, retrying...';
  // Insert after area-header-pill, before scene content
  const sceneArea = document.getElementById('scene-area');
  if (sceneArea) {
    sceneArea.insertBefore(bannerEl, sceneArea.firstChild);
  } else {
    document.body.prepend(bannerEl);
  }
  return bannerEl;
}

export function showOffline() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const el = ensureBanner();
  el.textContent = 'Connection lost, retrying...';
  el.classList.add('visible');
  el.classList.remove('reconnected');
}

export function showOnline() {
  if (!bannerEl || !bannerEl.classList.contains('visible')) return;
  bannerEl.textContent = 'Reconnected';
  bannerEl.classList.add('reconnected');
  hideTimer = setTimeout(() => {
    bannerEl.classList.remove('visible', 'reconnected');
    hideTimer = null;
  }, 1500);
}
```

- [ ] **Step 2: Add banner CSS**

Append to `public/game.css`:

```css
/* ── Connection banner ─────────────────────────────────────── */
.connection-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(220, 53, 69, 0.92);
  color: #fff;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  transform: translateY(-100%);
  transition: transform 0.3s ease;
  pointer-events: none;
}
.connection-banner.visible {
  transform: translateY(0);
}
.connection-banner.reconnected {
  background: rgba(40, 167, 69, 0.92);
}
```

- [ ] **Step 3: Wire up callbacks in game.js**

In `public/game.js`, after the api imports, add:

```javascript
import { showOffline, showOnline } from './js/ui/connection-banner.js';
```

In the initialization section (near where `combatLoopUI.init()` is called), add:

```javascript
import { setConnectionCallbacks } from './js/api.js';
setConnectionCallbacks({ onOffline: showOffline, onOnline: showOnline });
```

Also add supplementary `navigator.onLine` listeners:

```javascript
window.addEventListener('online', showOnline);
window.addEventListener('offline', showOffline);
```

- [ ] **Step 4: Syntax check all files**

Run: `node --check public/game.js && node --check public/js/ui/connection-banner.js && echo "OK"`

Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/connection-banner.js public/game.css public/game.js public/js/api.js
git commit -m "feat: add offline detection banner

Shows 'Connection lost, retrying...' after 2+ consecutive API
failures. Auto-dismisses with 'Reconnected' on next success.
Non-blocking, positioned at top of scene area."
```

---

### Task 7: 401 auto-redirect to login

**Files:**
- Modify: `public/js/api.js` (inside the 401 block added in Task 4)

- [ ] **Step 1: Add 401 redirect logic**

In `public/js/api.js`, add a module-level flag:

```javascript
let hasRedirectedFor401 = false;
```

Update the 401 handling block inside `apiCall` (placed in Task 4):

```javascript
      // 401: token expired — redirect to login
      if (response.status === 401 && !hasRedirectedFor401) {
        hasRedirectedFor401 = true;
        localStorage.removeItem('authToken');
        // Store message for login page to display
        sessionStorage.setItem('sessionExpiredMsg', 'Session expired, please log in again');
        window.location.href = '/';
        throw new Error('Session expired');
      }
```

- [ ] **Step 2: Show toast on login page**

Check how the login page renders. If it uses `public/js/ui/auth.js`, add after DOM load:

```javascript
const expiredMsg = sessionStorage.getItem('sessionExpiredMsg');
if (expiredMsg) {
  sessionStorage.removeItem('sessionExpiredMsg');
  // Show as a toast or inline message on the login form
  const toast = document.createElement('div');
  toast.className = 'auth-toast';
  toast.textContent = expiredMsg;
  document.querySelector('.auth-container')?.prepend(toast);
  setTimeout(() => toast.remove(), 5000);
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`

Expected: `OK`

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/js/ui/auth.js
git commit -m "feat: auto-redirect to login on 401

When server returns 401 (expired token), clears authToken from
localStorage and redirects to login with a 'Session expired'
toast. Redirect-once guard prevents loops."
```

---

## Chunk 3: Phase C — PvP Hardening

### Task 8: PvP auto-reconnect via Socket.IO

**Files:**
- Modify: `public/js/pvp-socket.js:51-70`

- [ ] **Step 1: Enable Socket.IO reconnection and store matchCode**

In `public/js/pvp-socket.js`, update the `connect()` function:

```javascript
export function connect() {
  if (socket?.connected) return;
  const token = localStorage.getItem('authToken');
  if (!token) return;

  socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });

  const events = [
    'pvp:match-created', 'pvp:match-joined', 'pvp:opponent-joined',
    'pvp:opponent-ready', 'pvp:match-start',
    'pvp:opponent-submitted', 'pvp:round-result', 'pvp:match-end',
    'pvp:opponent-wants-rematch', 'pvp:rematch-start', 'pvp:rematch-cancelled',
    'pvp:opponent-disconnected', 'pvp:opponent-reconnected', 'pvp:reconnected',
    'pvp:match-forfeit',
    'pvp:error'
  ];
  for (const event of events) {
    socket.on(event, (data) => handlers[event]?.(data));
  }
  socket.on('connect_error', (err) => console.error('[PvP] Connection error:', err.message));

  // Auto-reconnect to active match
  socket.on('reconnect', () => {
    const code = currentMatchCode || sessionStorage.getItem('pvpMatchCode');
    if (code) {
      console.log('[PvP] Reconnecting to match:', code);
      socket.emit('pvp:reconnect', { code });
    }
  });
}
```

- [ ] **Step 2: Persist matchCode to sessionStorage**

Update the `joinMatch` function and the `pvp:match-created` handler:

```javascript
export function joinMatch(code) {
  currentMatchCode = code;
  sessionStorage.setItem('pvpMatchCode', code);
  socket?.emit('pvp:join-match', { code });
}

// Update the existing handler at line 121:
on('pvp:match-created', ({ code }) => {
  currentMatchCode = code;
  sessionStorage.setItem('pvpMatchCode', code);
});
```

Update `disconnect()` and `leaveMatch()` to clear sessionStorage:

```javascript
export function disconnect() {
  socket?.disconnect();
  socket = null;
  currentMatchCode = null;
  sessionStorage.removeItem('pvpMatchCode');
}

export function leaveMatch() {
  socket?.emit('pvp:leave-match');
  currentMatchCode = null;
  sessionStorage.removeItem('pvpMatchCode');
}
```

- [ ] **Step 3: Show reconnecting banner during PvP**

In `public/js/pvp-socket.js`, add after the `reconnect` handler:

```javascript
  socket.on('disconnect', () => {
    handlers['pvp:socket-disconnected']?.();
  });
  socket.on('reconnect', () => {
    handlers['pvp:socket-reconnected']?.();
  });
```

The PvP battle UI (`public/js/ui/pvp-battle.js`) should register handlers for these to show/hide the connection banner (same `showOffline`/`showOnline` from Task 6).

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/pvp-socket.js && echo "OK"`

Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/pvp-socket.js
git commit -m "feat: PvP auto-reconnect via Socket.IO

Enables built-in reconnection (5 attempts, 1-10s backoff).
Stores matchCode in sessionStorage for page reload recovery.
Emits pvp:reconnect automatically on socket reconnect."
```

---

### Task 9: PvP forfeit-on-timeout

**Files:**
- Modify: `src/pvp/socket-handler.js:268-291`
- Modify: `src/pvp/match-manager.js` (add forfeitMatch method)
- Test: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write failing test**

Add to `tests/unit/pvp/match-manager.test.js`:

```javascript
it('forfeitMatch awards victory to remaining player', () => {
  const mm = new MatchManager({ resolveRoundFn: () => {} });
  const match = mm.createMatch('socket1', 'user1');
  mm.joinMatch(match.code, 'socket2', 'user2');
  mm.selectTeam(match.code, 'user1', 0, [{ id: 'c1', hp: 100 }]);
  mm.selectTeam(match.code, 'user2', 0, [{ id: 'c2', hp: 100 }]);

  const result = mm.forfeitMatch(match.code, 'user1');

  assert.equal(result.winnerId, 'user2');
  assert.equal(result.reason, 'forfeit');
  assert.equal(mm.getMatch(match.code), undefined); // match cleaned up
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "forfeitMatch" 2>&1 | tail -5`

Expected: FAIL (forfeitMatch not defined)

- [ ] **Step 3: Implement forfeitMatch in match-manager.js**

Add to `MatchManager` class in `src/pvp/match-manager.js`:

```javascript
  /**
   * Forfeit a match — award victory to the other player.
   * @param {string} code - Match code
   * @param {string} forfeitUserId - The user who forfeits
   * @returns {{ winnerId: string, loserId: string, reason: string }|null}
   */
  forfeitMatch(code, forfeitUserId) {
    const match = this.matches.get(code);
    if (!match) return null;

    const winnerKey = match.player1?.userId === forfeitUserId ? 'player2' : 'player1';
    const winnerId = match[winnerKey]?.userId;
    if (!winnerId) return null;

    // Clean up socket mappings
    if (match.player1) this.socketToMatch.delete(match.player1.socketId);
    if (match.player2) this.socketToMatch.delete(match.player2.socketId);
    this.matches.delete(code);

    return { winnerId, loserId: forfeitUserId, reason: 'forfeit' };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "forfeitMatch" 2>&1 | tail -5`

Expected: PASS

- [ ] **Step 5: Wire forfeit into disconnect timeout**

In `src/pvp/socket-handler.js`, update the disconnect timeout handler (lines 268-291). Replace the `mm.leaveMatch(code, socket.userId)` call with:

```javascript
      const timeout = setTimeout(() => {
        disconnectTimers.delete(socket.userId);

        const match = mm.getMatch(code);
        if (!match) return;

        // Forfeit: award victory to the connected player
        const result = mm.forfeitMatch(code, socket.userId);
        if (!result) return;

        // Notify the remaining player they won by forfeit
        const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherPlayer = match[otherPlayerKey];
        if (otherPlayer) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('pvp:match-forfeit', {
              winnerId: result.winnerId,
              reason: 'opponent_disconnected'
            });
          }
        }
      }, 30000);
```

- [ ] **Step 6: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/pvp/match-manager.js src/pvp/socket-handler.js tests/unit/pvp/match-manager.test.js
git commit -m "feat: PvP forfeit-on-timeout awards victory to remaining player

When disconnect timer fires, calls forfeitMatch instead of
leaveMatch. Emits pvp:match-forfeit to the connected player
with winner info."
```

---

### Task 10: PvP move submission timeout

**Files:**
- Modify: `src/pvp/match-manager.js` (add round timer)
- Modify: `src/pvp/socket-handler.js` (start timer on round)
- Test: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write failing test**

Add to `tests/unit/pvp/match-manager.test.js`:

```javascript
it('startRoundTimer calls onTimeout after specified duration', (t) => {
  const mm = new MatchManager({ resolveRoundFn: () => {} });
  const match = mm.createMatch('socket1', 'user1');

  let timedOutCode = null;
  mm.startRoundTimer(match.code, 50, (code) => { timedOutCode = code; });

  // Timer should not have fired yet
  assert.equal(timedOutCode, null);

  return new Promise(resolve => {
    setTimeout(() => {
      assert.equal(timedOutCode, match.code);
      resolve();
    }, 100);
  });
});

it('clearRoundTimer cancels pending timeout', () => {
  const mm = new MatchManager({ resolveRoundFn: () => {} });
  const match = mm.createMatch('socket1', 'user1');

  let called = false;
  mm.startRoundTimer(match.code, 50, () => { called = true; });
  mm.clearRoundTimer(match.code);

  return new Promise(resolve => {
    setTimeout(() => {
      assert.equal(called, false);
      resolve();
    }, 100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern "RoundTimer" 2>&1 | tail -5`

Expected: FAIL

- [ ] **Step 3: Implement round timer in match-manager.js**

Add to `MatchManager` class:

```javascript
  constructor(options = {}) {
    this.matches = new Map();
    this.socketToMatch = new Map();
    this._resolveRound = options.resolveRoundFn || resolveRound;
    this._roundTimers = new Map(); // matchCode -> timeoutId
  }

  startRoundTimer(code, durationMs, onTimeout) {
    this.clearRoundTimer(code);
    const timer = setTimeout(() => {
      this._roundTimers.delete(code);
      onTimeout(code);
    }, durationMs);
    this._roundTimers.set(code, timer);
  }

  clearRoundTimer(code) {
    const timer = this._roundTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this._roundTimers.delete(code);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --test-name-pattern "RoundTimer" 2>&1 | tail -5`

Expected: PASS

- [ ] **Step 5: Wire round timer into socket handler**

In `src/pvp/socket-handler.js`, after a round resolves and both players are notified of the result (when the next round begins), start a 60-second timer:

```javascript
const ROUND_TIMEOUT_MS = 60000;

// After sending round result to both players:
mm.startRoundTimer(code, ROUND_TIMEOUT_MS, (timedOutCode) => {
  const match = mm.getMatch(timedOutCode);
  if (!match || match.phase !== 'battle') return;

  // Find who hasn't submitted — forfeit them
  const p1Submitted = match.player1?.moveSubmitted;
  const p2Submitted = match.player2?.moveSubmitted;
  const forfeitUserId = !p1Submitted ? match.player1?.userId : match.player2?.userId;
  if (!forfeitUserId) return;

  const result = mm.forfeitMatch(timedOutCode, forfeitUserId);
  if (!result) return;

  // Notify both players
  [match.player1, match.player2].forEach(p => {
    if (!p) return;
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.emit('pvp:match-forfeit', { winnerId: result.winnerId, reason: 'timeout' });
  });
});
```

Clear the timer when both players submit moves (before resolving the round):

```javascript
mm.clearRoundTimer(code);
```

- [ ] **Step 6: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/pvp/match-manager.js src/pvp/socket-handler.js tests/unit/pvp/match-manager.test.js
git commit -m "feat: PvP 60-second move submission timeout

Each round has a 60-second timer. If a player doesn't submit
moves in time, they forfeit. Timer clears when both submit."
```

---

### Task 11: PvP match persistence

**Files:**
- Modify: `src/pvp/match-manager.js` (add save/restore)
- Test: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write failing test**

```javascript
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import os from 'os';

it('saveMatch persists and restoreMatches loads match state', () => {
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'pvp-test-'));
  const mm = new MatchManager({ resolveRoundFn: () => {}, dataDir: tmpDir });
  const match = mm.createMatch('socket1', 'user1');
  mm.joinMatch(match.code, 'socket2', 'user2');

  mm.saveMatch(match.code);

  const matchFile = join(tmpDir, `.pvp-match-${match.code}.json`);
  assert.ok(existsSync(matchFile));

  // Create fresh manager and restore
  const mm2 = new MatchManager({ resolveRoundFn: () => {}, dataDir: tmpDir });
  const count = mm2.restoreMatches();
  assert.equal(count, 1);
  assert.ok(mm2.getMatch(match.code));

  rmSync(tmpDir, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "saveMatch" 2>&1 | tail -5`

Expected: FAIL

- [ ] **Step 3: Implement save/restore**

Add to `MatchManager`:

```javascript
  constructor(options = {}) {
    this.matches = new Map();
    this.socketToMatch = new Map();
    this._resolveRound = options.resolveRoundFn || resolveRound;
    this._roundTimers = new Map();
    this._dataDir = options.dataDir || null;
  }

  saveMatch(code) {
    if (!this._dataDir) return;
    const match = this.matches.get(code);
    if (!match) return;
    const filePath = join(this._dataDir, `.pvp-match-${code}.json`);
    writeFileSync(filePath, JSON.stringify(match, null, 2));
  }

  deleteMatchFile(code) {
    if (!this._dataDir) return;
    const filePath = join(this._dataDir, `.pvp-match-${code}.json`);
    try { unlinkSync(filePath); } catch {}
  }

  restoreMatches() {
    if (!this._dataDir) return 0;
    let count = 0;
    const files = readdirSync(this._dataDir).filter(f => f.startsWith('.pvp-match-') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(this._dataDir, file), 'utf-8'));
        if (data.code) {
          this.matches.set(data.code, data);
          count++;
        }
      } catch {}
    }
    return count;
  }
```

Add the necessary imports at top of file:

```javascript
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "saveMatch" 2>&1 | tail -5`

Expected: PASS

- [ ] **Step 5: Wire persistence into match lifecycle**

In `src/pvp/socket-handler.js`:
- After each round resolves: `mm.saveMatch(code)`
- In `forfeitMatch` / `leaveMatch`: `mm.deleteMatchFile(code)`
- On server startup (in `server.js`): `mm.restoreMatches()`

Pass `dataDir` when constructing MatchManager:

```javascript
import { DATA_DIR } from '../data-dir.js';
const mm = new MatchManager({ dataDir: DATA_DIR });
```

- [ ] **Step 6: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/pvp/match-manager.js src/pvp/socket-handler.js server.js tests/unit/pvp/match-manager.test.js
git commit -m "feat: persist PvP matches to disk

Saves match state after each round. Restores on server startup.
Cleans up files on match end. Server restarts no longer kill
active matches."
```

---

### Task 12: Post-combat shop reload recovery

**Files:**
- Modify: `public/game.js` (updateGameContent, ~line 558)
- Verify: server sets `run.postCombatShop.active` (check if this already happens or needs wiring)

- [ ] **Step 1: Check if server sets postCombatShop state**

Run: `grep -rn "postCombatShop" src/`

Determine if the server ever sets `run.postCombatShop = { active: true, ... }`. If not, the server-side wiring is needed first.

- [ ] **Step 2: Wire server-side state if missing**

If the server doesn't set `postCombatShop.active`, find the route that rolls the post-combat shop (`/api/game/roll-post-combat-shop` or similar) and ensure it sets:

```javascript
gameManager.run.postCombatShop = { active: true, items: shopItems };
req.saveGame();
```

And the select/dismiss endpoints should clear it:

```javascript
gameManager.run.postCombatShop = null;
req.saveGame();
```

- [ ] **Step 3: Add recovery handler in updateGameContent**

In `public/game.js`, add to the phase flags:

```javascript
let postCombatShopRecoveryDone = false;
```

Reset in `updateScene()`:

```javascript
if (gameState.phase !== 'post_combat_shop') postCombatShopRecoveryDone = false;
```

Add case in `updateGameContent()`:

```javascript
    case 'post_combat_shop':
      if (!postCombatShopRecoveryDone) {
        postCombatShopRecoveryDone = true;
        // Re-render shop from server state
        const shopData = gameState.run?.postCombatShop;
        if (shopData?.items?.length) {
          showPostCombatShopFlow();
        }
      }
      break;
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/game.js && echo "OK"`

Expected: `OK`

- [ ] **Step 5: Run tests**

Run: `npm test 2>&1 | tail -10`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add public/game.js src/routes/game/misc.js
git commit -m "fix: post-combat shop reload recovery

Server now persists postCombatShop state. Client re-renders
shop from server state on page reload."
```

---

## Final Verification

- [ ] **Run full test suite**

Run: `npm test 2>&1`

Expected: all tests pass, no regressions

- [ ] **Syntax check all modified client files**

Run: `node --check public/game.js && node --check public/js/api.js && node --check public/js/ui/combat-loop.js && node --check public/js/ui/connection-banner.js && node --check public/js/pvp-socket.js && echo "ALL OK"`

Expected: `ALL OK`
