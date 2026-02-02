# Credit Pickup Bug Fix - Retrospective

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Document the investigation and fix for the 500 error when collecting credits during Phaser exploration.

**Architecture:** The `/api/game/collect-credits` endpoint had two bugs: (1) called a non-existent `updatePlayer()` method, (2) used `player.gold` instead of `player.credits`. Fix was direct mutation following established codebase patterns.

**Tech Stack:** Express.js, GameManager class, direct state mutation pattern

---

## The Bug

**Symptoms:**
- Browser console: `500 Internal Server Error` on `/api/game/collect-credits`
- Followed by: `SyntaxError: The string did not match the expected pattern` (Safari's JSON parse error)
- Credits collected in Phaser exploration were not persisted

**Root Cause Analysis:**

The endpoint in `src/routes/game/economy.js` (commit `00535f4`) had two issues:

```javascript
// ORIGINAL BUGGY CODE (lines 126-128):
state.player.gold = (state.player.gold || 0) + amount;
gameManager.updatePlayer({ gold: state.player.gold });
```

**Bug 1:** `gameManager.updatePlayer()` does not exist
- GameManager class has 44 methods - `updatePlayer` is not one of them
- Calling it throws `TypeError: gameManager.updatePlayer is not a function`
- No try/catch in endpoint, so this becomes a 500 error
- Express returns HTML error page, client tries to parse as JSON, causing SyntaxError

**Bug 2:** Wrong property name - `gold` vs `credits`
- Entire codebase uses `player.credits` for currency
- This endpoint used `player.gold` - inconsistent and would store to wrong property

---

## Investigation Process

### Step 1: Identify the failing endpoint

Searched for `collect-credits` to find server and client code:
- Server: `src/routes/game/economy.js:112-136`
- Client: `public/game.js:500-516`

### Step 2: Verify middleware chain (confirmed working)

Used subagent to trace:
1. `requireAuth` middleware runs first
2. `gameManager` injection middleware attaches `req.gameManager`
3. Route handler receives valid gameManager

**Result:** Middleware was not the issue.

### Step 3: Check if updatePlayer exists

Searched entire codebase for `updatePlayer` definition:
- Zero definitions found
- One call found (the buggy line)

**Result:** Method does not exist - confirmed root cause.

### Step 4: Verify established pattern for credit mutations

Searched all places where `player.credits` is modified:

| Location | Pattern |
|----------|---------|
| `combat/rewards.js:17` | `player.credits += credits` |
| `exploration-service.js:514` | `player.credits -= price` |
| `exploration-service.js:599` | `player.credits -= REFRESH_COST` |
| `exploration-service.js:662` | `player.credits += sellPrice` |
| `loop.js:562` | `player.credits -= REFRESH_COST` |
| `loop.js:285` | `player.credits += effects.startingCredits` |

**Result:** All use direct mutation. No wrapper method needed.

### Step 5: Verify mutation persistence

Confirmed that `gameManager.getState()` returns direct references (not copies):
- `state.player` is a reference to `this.run.player`
- Mutations persist to GameManager's internal state
- `req.saveGame()` serializes `manager.player` directly

**Result:** Direct mutation + `saveGame()` is sufficient.

---

## The Fix

**File:** `src/routes/game/economy.js`

**Changed from:**
```javascript
// Add credits to player gold
state.player.gold = (state.player.gold || 0) + amount;
gameManager.updatePlayer({ gold: state.player.gold });

req.saveGame();
res.json({
  success: true,
  amount,
  newTotal: state.player.gold
});
```

**Changed to:**
```javascript
// Add credits to player
state.player.credits = (state.player.credits || 0) + amount;

req.saveGame();
res.json({
  success: true,
  amount,
  newTotal: state.player.credits
});
```

**Why this works:**
1. Uses correct property name (`credits` not `gold`)
2. Follows established direct mutation pattern
3. `req.saveGame()` persists the change to disk
4. No non-existent method calls

---

## Approaches Considered

### Approach 1: Implement the missing `updatePlayer()` method (Rejected)

Could have added to GameManager:
```javascript
updatePlayer(updates) {
  Object.assign(this.run.player, updates);
}
```

**Rejected because:**
- No other code uses this pattern
- Would introduce inconsistency
- YAGNI - unnecessary abstraction

### Approach 2: Direct mutation (Chosen)

Follow the established pattern used everywhere else in the codebase.

**Chosen because:**
- Consistent with existing code
- Simpler
- Already proven to work (combat rewards, shop purchases, etc.)

---

## Verification

To verify the fix works:

1. Start the game server: `npm run dev`
2. Start a new run
3. Enter exploration mode
4. Pick up credit items
5. Verify no console errors
6. Verify credits increase in player state
7. Refresh page - credits should persist

---

## Lessons Learned

1. **Check for method existence before assuming it works** - The code called a method that was never implemented
2. **Property naming consistency matters** - `gold` vs `credits` caused silent failures
3. **Follow established patterns** - Don't invent new abstractions when the codebase has a working pattern
4. **Safari error messages are cryptic** - "The string did not match the expected pattern" means JSON parse failed
