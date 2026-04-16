# Debug Tools: Tutorial Reset & 100 ATK Toggle — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two always-visible debug features to the settings panel — a tutorial reset button and a +100 ATK toggle — for faster playtesting.

**Architecture:** Tutorial reset adds a `resetTutorial()` helper in the tutorial service and a POST endpoint mirroring the existing prologue-reset pattern. The ATK toggle stores a `debugSuperAttack` boolean in global settings, and injects +100 into each player creature's `itemBuffs.baseAttackBonus` at combat start (PvE in `loop.js`, PvP in `match-manager.js`). A per-creature `_debugAtkApplied` flag prevents stacking across PvE combats; PvP deep-clones creatures so no flag is needed there.

**Tech Stack:** Node.js, Express, Socket.IO, vanilla JS frontend

**Spec:** `docs/superpowers/specs/2026-04-13-debug-tools-tutorial-reset-super-attack.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/game/services/tutorial-service.js` | Modify | Add `resetTutorial(meta)` function |
| `src/routes/game/misc.js` | Modify | Add `POST /tutorial-reset` endpoint |
| `server.js` | Modify | Add `debugSuperAttack: false` to settings defaults |
| `src/routes/settings.js` | Modify | Add `debugSuperAttack` to GET/POST |
| `src/routes/game/combat.js` | Modify | Set `gameManager._debugSuperAttack` from settings |
| `src/game/loop.js` | Modify | Apply +100 `baseAttackBonus` in `startCreatureEncounter()` |
| `src/pvp/socket-handler.js` | Modify | Pass `getSettings` to MatchManager |
| `src/pvp/match-manager.js` | Modify | Accept `getSettings`, apply +100 in `_startBattle()` |
| `public/js/ui/modals.js` | Modify | Add reset button + ATK toggle to settings panel |
| `tests/unit/game/tutorial-service.test.js` | Modify | Add `resetTutorial` test |
| `tests/unit/combat/debug-super-attack.test.js` | Create | Test +100 injection in combat |

---

### Task 1: Tutorial Reset — Service + Route + Test

**Files:**
- Modify: `src/game/services/tutorial-service.js` (add export near line 106)
- Modify: `src/routes/game/misc.js:395-402` (add endpoint after prologue-reset)
- Modify: `tests/unit/game/tutorial-service.test.js` (add test)

- [ ] **Step 1: Write the failing test for `resetTutorial`**

In `tests/unit/game/tutorial-service.test.js`, add at the end of the file:

```javascript
describe('resetTutorial', () => {
  it('resets tutorialStep to 0 and tutorialFireDropsGifted to false', () => {
    const meta = createMetaProgression();
    meta.tutorialStep = 5;
    meta.tutorialFireDropsGifted = true;
    resetTutorial(meta);
    assert.equal(meta.tutorialStep, 0);
    assert.equal(meta.tutorialFireDropsGifted, false);
  });

  it('preserves other meta fields', () => {
    const meta = createMetaProgression();
    meta.tutorialStep = 7;
    meta.prologueComplete = true;
    meta.lifetimeStats = { totalRuns: 5 };
    resetTutorial(meta);
    assert.equal(meta.prologueComplete, true);
    assert.deepEqual(meta.lifetimeStats, { totalRuns: 5 });
  });
});
```

Also add `resetTutorial` to the import at line 1-17.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: FAIL — `resetTutorial` is not exported

- [ ] **Step 3: Implement `resetTutorial` in tutorial-service.js**

Add at the end of `src/game/services/tutorial-service.js`, before any closing braces:

```javascript
/** Reset tutorial state so it replays from the beginning. */
export function resetTutorial(meta) {
  meta.tutorialStep = 0;
  meta.tutorialFireDropsGifted = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/tutorial-service.test.js`
Expected: PASS

- [ ] **Step 5: Add the route endpoint**

In `src/routes/game/misc.js`, after the `prologue-reset` endpoint (line ~402), add:

```javascript
  // Reset tutorial so it replays from scratch
  router.post('/tutorial-reset', (req, res) => {
    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    resetTutorial(meta);
    req.saveGame();
    res.json({ ok: true });
  });
```

Also add `resetTutorial` to the imports at the top of `misc.js`. Find the existing import from `tutorial-service.js` and add `resetTutorial` to it.

- [ ] **Step 6: Syntax check**

Run: `node --check src/game/services/tutorial-service.js && node --check src/routes/game/misc.js && echo "OK"`
Expected: OK

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/game/services/tutorial-service.js src/routes/game/misc.js tests/unit/game/tutorial-service.test.js
git commit -m "feat: add tutorial reset endpoint and service function"
```

---

### Task 2: Debug Super Attack — Settings Plumbing

**Files:**
- Modify: `server.js:200-214` (add default)
- Modify: `src/routes/settings.js:40-50` (GET) and `src/routes/settings.js:54-98` (POST)

- [ ] **Step 1: Add `debugSuperAttack` to settings defaults**

In `server.js`, inside the `loadSettings()` defaults object (line ~213, after `dailyWordLimit`), add:

```javascript
    debugSuperAttack: false
```

- [ ] **Step 2: Add to GET `/api/settings`**

In `src/routes/settings.js`, inside the `res.json({...})` response (line ~49, after `dailyWordLimit`), add:

```javascript
      debugSuperAttack: settings.debugSuperAttack ?? false
```

- [ ] **Step 3: Add to POST `/api/settings`**

In `src/routes/settings.js`, after the `dailyWordLimit` validation block (line ~85), before the TTS config update block, add:

```javascript
    if (req.body.debugSuperAttack !== undefined) {
      settings.debugSuperAttack = !!req.body.debugSuperAttack;
    }
```

- [ ] **Step 4: Syntax check**

Run: `node --check server.js && node --check src/routes/settings.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server.js src/routes/settings.js
git commit -m "feat: add debugSuperAttack to server settings"
```

---

### Task 3: Debug Super Attack — PvE Combat Injection + Test

**Files:**
- Modify: `src/routes/game/combat.js:59-63` (set flag before combat)
- Modify: `src/game/loop.js:624-634` (apply bonus in `startCreatureEncounter`)
- Create: `tests/unit/combat/debug-super-attack.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/debug-super-attack.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { createItemBuffs } from '../../../src/game/services/item-service.js';
import { applyDebugSuperAttack } from '../../../src/game/loop.js';

describe('debug super attack', () => {
  it('adds +100 baseAttackBonus to creatures without itemBuffs', () => {
    const ally = instantiateCreature('hi');
    delete ally.itemBuffs;
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 100);
  });

  it('adds +100 on top of existing baseAttackBonus', () => {
    const ally = instantiateCreature('hi');
    ally.itemBuffs = createItemBuffs();
    ally.itemBuffs.baseAttackBonus = 5; // from equipment
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 105);
  });

  it('does not stack on repeated calls (uses _debugAtkApplied flag)', () => {
    const ally = instantiateCreature('hi');
    applyDebugSuperAttack([ally]);
    applyDebugSuperAttack([ally]);
    assert.equal(ally.itemBuffs.baseAttackBonus, 100);
  });

  it('applies to newly befriended creatures on subsequent calls', () => {
    const original = instantiateCreature('hi');
    applyDebugSuperAttack([original]);
    // Simulate befriending a new creature mid-run
    const newCreature = instantiateCreature('mizu');
    applyDebugSuperAttack([original, newCreature]);
    assert.equal(original.itemBuffs.baseAttackBonus, 100); // not 200
    assert.equal(newCreature.itemBuffs.baseAttackBonus, 100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/debug-super-attack.test.js`
Expected: FAIL — `applyDebugSuperAttack` is not exported from loop.js

- [ ] **Step 3: Implement `applyDebugSuperAttack` in loop.js**

In `src/game/loop.js`, add a top-level exported helper function (before the `GameManager` class, after the imports):

```javascript
import { createItemBuffs } from './services/item-service.js';
```

(Add `createItemBuffs` to the existing item-service import if one exists, or add a new import line.)

Then add the function:

```javascript
/**
 * Apply +100 baseAttackBonus to all creatures that haven't received it yet.
 * Uses a _debugAtkApplied flag to prevent stacking across combats.
 */
export function applyDebugSuperAttack(creatures) {
  for (const c of creatures) {
    if (!c || c._debugAtkApplied) continue;
    if (!c.itemBuffs) c.itemBuffs = createItemBuffs();
    c.itemBuffs.baseAttackBonus = (c.itemBuffs.baseAttackBonus || 0) + 100;
    c._debugAtkApplied = true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/combat/debug-super-attack.test.js`
Expected: PASS

- [ ] **Step 5: Wire into `startCreatureEncounter`**

In `src/game/loop.js`, inside `startCreatureEncounter()`, after the stat stages reset loop (line ~634), add:

```javascript
    // Debug: +100 ATK mode
    if (this._debugSuperAttack) {
      applyDebugSuperAttack(this.combat.allies);
    }
```

- [ ] **Step 6: Set the flag from the route handler**

In `src/routes/game/combat.js`, inside the `/start-creature-encounter` handler (line ~60), before `gameManager.startCreatureEncounter()`, add:

```javascript
      const settings = req.getSettings?.() || {};
      gameManager._debugSuperAttack = !!settings.debugSuperAttack;
```

- [ ] **Step 7: Syntax check**

Run: `node --check src/game/loop.js && node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add src/game/loop.js src/routes/game/combat.js tests/unit/combat/debug-super-attack.test.js
git commit -m "feat: inject +100 ATK in PvE combat when debug toggle is on"
```

---

### Task 4: Debug Super Attack — PvP Combat Injection

**Files:**
- Modify: `src/pvp/socket-handler.js:20-21` (pass getSettings)
- Modify: `src/pvp/match-manager.js:427-461` (apply in `_startBattle`)
- Modify: `server.js:189` (pass getSettings to setupPvpSockets)

- [ ] **Step 1: Pass `getSettings` through to MatchManager**

In `server.js`, at line 189, change:
```javascript
setupPvpSockets(io);
```
to:
```javascript
setupPvpSockets(io, { getSettings: () => settings });
```

In `src/pvp/socket-handler.js`, change the function signature (line ~20):
```javascript
export function setupPvpSockets(io, { getSettings } = {}) {
```

And pass it to MatchManager (line ~21):
```javascript
  const mm = new MatchManager({ dataDir: DATA_DIR, getSettings });
```

In `src/pvp/match-manager.js`, accept it in the constructor (line ~26-29 area):
```javascript
  constructor(options = {}) {
    this.dataDir = options.dataDir || '.';
    this._resolveRound = options.resolveRoundFn || resolveRound;
    this._getSettings = options.getSettings || null;
```

- [ ] **Step 2: Apply +100 in `_startBattle`**

In `src/pvp/match-manager.js`, inside `_startBattle()`, after the HP/MP reset loop (line ~441) and before `match.phase = 'battle'` (line ~443), add:

```javascript
    // Debug: +100 ATK mode
    if (this._getSettings?.()?.debugSuperAttack) {
      for (const creatures of [sideA, sideB]) {
        for (const c of creatures) {
          if (!c.itemBuffs) c.itemBuffs = { attackMult: 1.0, hpMult: 1.0, elementEdge: 0, flatDamageReduction: 0, xpMultiplier: 1.0, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0 };
          c.itemBuffs.baseAttackBonus = (c.itemBuffs.baseAttackBonus || 0) + 100;
        }
      }
    }
```

No `_debugAtkApplied` flag needed here — PvP deep-clones creatures fresh each match.

- [ ] **Step 3: Syntax check**

Run: `node --check server.js && node --check src/pvp/socket-handler.js && node --check src/pvp/match-manager.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server.js src/pvp/socket-handler.js src/pvp/match-manager.js
git commit -m "feat: inject +100 ATK in PvP combat when debug toggle is on"
```

---

### Task 5: Settings Panel UI — Both Features

**Files:**
- Modify: `public/js/ui/modals.js` (HTML template ~line 221-231, save handler ~line 327-430, event handlers ~line 286-325)

- [ ] **Step 1: Add "Reset Tutorial" button to HTML template**

In `public/js/ui/modals.js`, after the "Reset Prologue" button and its `<small>` (line ~228), add:

```html
      <button class="ui-btn" id="settings-reset-tutorial-btn"
        style="width:100%;background:var(--surface-2);color:var(--text);margin-top:10px">Reset Tutorial</button>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">Replay the tutorial on next run.</small>
```

- [ ] **Step 2: Add "100 ATK" toggle to HTML template**

After the Reset Tutorial button and its `<small>`, add:

```html
      <h4 style="margin:20px 0 8px;color:var(--accent)">Debug</h4>
      <label class="settings-label" style="margin-top:8px">
        <input type="checkbox" id="settings-debug-super-attack"
          ${serverSettings.debugSuperAttack ? 'checked' : ''}>
        100 ATK (Debug)
      </label>
      <small style="color:#888;font-size:0.85em;display:block;margin-top:4px">All your creatures get +100 ATK in combat.</small>
```

- [ ] **Step 3: Add Reset Tutorial click handler**

After the existing prologue-reset click handler (line ~325), add:

```javascript
  document.getElementById('settings-reset-tutorial-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    try {
      const resp = await fetch(apiUrl('/api/game/tutorial-reset'), { method: 'POST', headers: getAuthHeaders() });
      if (resp.ok) {
        btn.textContent = 'Done — start a new run to replay';
        setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 3000);
      } else {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 2000);
      }
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Reset Tutorial'; btn.disabled = false; }, 2000);
    }
  });
```

- [ ] **Step 4: Save the 100 ATK toggle in the save handler**

In the save handler (the `settings-save-btn` click listener), after the voice gender save block (line ~411), add:

```javascript
    // Save debug super attack toggle
    const debugSuperAttack = document.getElementById('settings-debug-super-attack')?.checked ?? false;
    if (debugSuperAttack !== (serverSettings.debugSuperAttack ?? false)) {
      await saveServerSettings({ debugSuperAttack });
    }
```

Note: `serverSettings` is captured at the top of `openSettings()` — it's in scope for the save handler since the handler is defined inside the same function.

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/modals.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/modals.js
git commit -m "feat: add tutorial reset button and 100 ATK toggle to settings UI"
```

---

### Task 6: Manual Verification

- [ ] **Step 1: Start dev server and verify settings panel**

Run: `npm run dev` (or `npm start`)

Open the game in Playwright, navigate to Settings. Verify:
- "Reset Tutorial" button appears in the Data section
- "100 ATK (Debug)" checkbox appears under a Debug heading
- Both are below the existing "Reset Prologue" button

- [ ] **Step 2: Test tutorial reset**

1. Click "Reset Tutorial" — should show "Resetting..." then "Done — start a new run to replay"
2. Start a new run — tutorial should replay from skill selection (step 0)

- [ ] **Step 3: Test 100 ATK toggle**

1. Check the "100 ATK (Debug)" box, click Save
2. Enter combat — creatures should deal significantly more damage than usual
3. Uncheck the box, save, enter new combat — damage should return to normal

- [ ] **Step 4: Delete any screenshots taken during verification**
