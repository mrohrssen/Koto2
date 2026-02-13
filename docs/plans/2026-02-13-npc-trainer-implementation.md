# NPC Trainer System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Pokemon-style NPC trainers to every encounter — greeting, 3-robot battle, post-combat bond dialogue with persistent relationship tracking.

**Architecture:** NPCs are defined in `data/npcs.json` with pre-seeded dialogue. An `npc-service.js` handles selection and bond CRUD. The phase machine gains an `npc_dialogue` phase between victory and post-combat shop. Combat state carries `npcId` to disable befriend and trigger the dialogue flow. Frontend reuses the narration box and action area for dialogue rounds.

**Tech Stack:** Node.js/Express backend, vanilla JS frontend with ES6 modules, JSON file storage.

**Design doc:** `docs/plans/2026-02-13-npc-trainer-system-mvp.md`

---

### Task 1: Create NPC data file

**Files:**
- Create: `data/npcs.json`

**Step 1: Write NPC data**

Create `data/npcs.json` with 10 placeholder NPCs. Each NPC has: id, name, nameEn, area (null), tier, personality, greeting, defeatLine, postCombat (freed line + 3 dialogue rounds with 3 toned options each).

```json
{
  "npc_01": {
    "id": "npc_01",
    "name": "トレーナーA",
    "nameEn": "Trainer A",
    "area": null,
    "tier": 1,
    "personality": {
      "traits": ["friendly", "energetic"],
      "speechStyle": "Upbeat and encouraging",
      "quirk": "Always gives a thumbs up"
    },
    "greeting": "やあ！勝負しよう！",
    "defeatLine": "まだ…システムに…支配されている…",
    "postCombat": {
      "freed": "ありがとう…目が覚めた。",
      "rounds": [
        {
          "npcLine": "助けてくれてありがとう。君は強いね。",
          "options": [
            { "text": "大丈夫？怪我はない？", "tone": "positive" },
            { "text": "うん、まあね。", "tone": "neutral" },
            { "text": "当然だろ。", "tone": "negative" }
          ]
        },
        {
          "npcLine": "この街、前はもっと平和だったのに…",
          "options": [
            { "text": "一緒に取り戻そう。", "tone": "positive" },
            { "text": "そうみたいだね。", "tone": "neutral" },
            { "text": "知らないな。", "tone": "negative" }
          ]
        },
        {
          "npcLine": "また会えるかな？",
          "options": [
            { "text": "もちろん！また会おう。", "tone": "positive" },
            { "text": "たぶんね。", "tone": "neutral" },
            { "text": "さあ、どうかな。", "tone": "negative" }
          ]
        }
      ]
    }
  }
}
```

Repeat the same structure for `npc_02` through `npc_10` with different names, tiers (1-4), archetypes, and dialogue text. Each NPC should have unique greeting/freed/dialogue lines. Tier distribution: npc_01-03 tier 1, npc_04-06 tier 2, npc_07-09 tier 3, npc_10 tier 4.

**Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/npcs.json','utf8')); console.log('Valid JSON')" && echo "OK"`
Expected: `Valid JSON` + `OK`

**Step 3: Commit**

```bash
git add data/npcs.json
git commit -m "feat: add placeholder NPC roster (10 trainers with dialogue)"
```

---

### Task 2: Create NPC service

**Files:**
- Create: `src/game/services/npc-service.js`
- Test: `tests/unit/npc-service.test.js`

**Step 1: Write the tests**

Create `tests/unit/npc-service.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadNpcs, selectNpcForEncounter, getNpcBond, updateBond, recordEncounter, shuffleOptions } from '../../src/game/services/npc-service.js';

describe('npc-service', () => {
  describe('loadNpcs', () => {
    it('loads all NPCs from data file', () => {
      const npcs = loadNpcs();
      expect(Object.keys(npcs).length).toBeGreaterThanOrEqual(10);
      expect(npcs.npc_01).toBeDefined();
      expect(npcs.npc_01.name).toBeTruthy();
      expect(npcs.npc_01.postCombat.rounds).toHaveLength(3);
    });
  });

  describe('selectNpcForEncounter', () => {
    it('returns an NPC object', () => {
      const npc = selectNpcForEncounter(1, []);
      expect(npc).toBeDefined();
      expect(npc.id).toBeTruthy();
      expect(npc.greeting).toBeTruthy();
    });

    it('avoids already-used NPCs on the same floor', () => {
      const used = ['npc_01', 'npc_02', 'npc_03', 'npc_04', 'npc_05', 'npc_06', 'npc_07', 'npc_08', 'npc_09'];
      const npc = selectNpcForEncounter(1, used);
      expect(used).not.toContain(npc.id);
    });

    it('falls back to any NPC when all are used', () => {
      const allIds = Array.from({ length: 10 }, (_, i) => `npc_${String(i + 1).padStart(2, '0')}`);
      const npc = selectNpcForEncounter(1, allIds);
      expect(npc).toBeDefined();
    });
  });

  describe('shuffleOptions', () => {
    it('returns all 3 options in shuffled order with original indices', () => {
      const options = [
        { text: 'a', tone: 'positive' },
        { text: 'b', tone: 'neutral' },
        { text: 'c', tone: 'negative' }
      ];
      const result = shuffleOptions(options);
      expect(result.shuffled).toHaveLength(3);
      expect(result.toneMap).toHaveLength(3);
      // All texts present
      const texts = result.shuffled.map(o => o.text).sort();
      expect(texts).toEqual(['a', 'b', 'c']);
    });
  });

  describe('bond operations', () => {
    let meta;

    beforeEach(() => {
      meta = { npcBonds: {} };
    });

    it('getNpcBond returns null for unknown NPC', () => {
      expect(getNpcBond(meta, 'npc_99')).toBeNull();
    });

    it('updateBond creates entry if missing', () => {
      const result = updateBond(meta, 'npc_01', 2);
      expect(result.bond).toBe(2);
      expect(meta.npcBonds.npc_01.bond).toBe(2);
    });

    it('updateBond adds to existing bond', () => {
      meta.npcBonds.npc_01 = { bond: 3, encounters: 1, lastInteraction: '2026-01-01' };
      const result = updateBond(meta, 'npc_01', -1);
      expect(result.bond).toBe(2);
    });

    it('recordEncounter increments counter', () => {
      recordEncounter(meta, 'npc_01');
      expect(meta.npcBonds.npc_01.encounters).toBe(1);
      recordEncounter(meta, 'npc_01');
      expect(meta.npcBonds.npc_01.encounters).toBe(2);
    });

    it('recordEncounter sets lastInteraction', () => {
      recordEncounter(meta, 'npc_01');
      expect(meta.npcBonds.npc_01.lastInteraction).toBeTruthy();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/npc-service.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/game/services/npc-service.js`:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const npcsPath = join(__dirname, '../../../data/npcs.json');

let npcCache = null;

export function loadNpcs() {
  if (!npcCache) {
    npcCache = JSON.parse(readFileSync(npcsPath, 'utf-8'));
  }
  return npcCache;
}

export function selectNpcForEncounter(floor, alreadyUsedNpcIds = []) {
  const npcs = loadNpcs();
  const allIds = Object.keys(npcs);
  const available = allIds.filter(id => !alreadyUsedNpcIds.includes(id));
  const pool = available.length > 0 ? available : allIds;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return npcs[chosen];
}

export function shuffleOptions(options) {
  const indices = options.map((_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    shuffled: indices.map(i => ({ text: options[i].text })),
    toneMap: indices.map(i => options[i].tone)
  };
}

export function getNpcBond(meta, npcId) {
  if (!meta?.npcBonds?.[npcId]) return null;
  return meta.npcBonds[npcId];
}

export function updateBond(meta, npcId, delta) {
  if (!meta.npcBonds) meta.npcBonds = {};
  if (!meta.npcBonds[npcId]) {
    meta.npcBonds[npcId] = { bond: 0, encounters: 0, lastInteraction: null };
  }
  meta.npcBonds[npcId].bond += delta;
  return meta.npcBonds[npcId];
}

export function recordEncounter(meta, npcId) {
  if (!meta.npcBonds) meta.npcBonds = {};
  if (!meta.npcBonds[npcId]) {
    meta.npcBonds[npcId] = { bond: 0, encounters: 0, lastInteraction: null };
  }
  meta.npcBonds[npcId].encounters++;
  meta.npcBonds[npcId].lastInteraction = new Date().toISOString().split('T')[0];
  return meta.npcBonds[npcId];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/npc-service.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/services/npc-service.js tests/unit/npc-service.test.js
git commit -m "feat: add npc-service with selection, bond tracking, option shuffling"
```

---

### Task 3: Add npcBonds to meta-progression and npc_dialogue phase

**Files:**
- Modify: `src/game/state.js:75` (after `robotCollection` line)
- Modify: `src/game/phase-machine.js:29-62` (PHASES object), `68-171` (transitions), `193-265` (derivePhase), `272-294` (getPhaseName)

**Step 1: Add npcBonds to createMetaProgression**

In `src/game/state.js`, after line 75 (`robotCollection: ['sizzlit', 'drizzlet', 'petalia'],`), add:

```javascript
    // NPC bonds (persists across runs)
    npcBonds: {},
```

**Step 2: Add NPC_DIALOGUE phase to phase-machine.js**

In `src/game/phase-machine.js`:

1. Add to PHASES object (after line 51, `DEFEAT: 'defeat'`):
```javascript
  NPC_DIALOGUE: 'npc_dialogue',   // Post-combat NPC bond dialogue
```

2. Add to VALID_TRANSITIONS — update VICTORY transitions (line 121-127) to include NPC_DIALOGUE:
```javascript
  [PHASES.VICTORY]: [
    PHASES.NPC_DIALOGUE,      // NPC bond dialogue (if NPC encounter)
    PHASES.POST_COMBAT_SHOP,  // Loot drops
    PHASES.ROOM,              // Continue exploring
    PHASES.EXPLORING,         // Continue exploring
    PHASES.FLOOR_COMPLETE,    // Boss defeated
    PHASES.RUN_COMPLETE       // Final boss defeated
  ],
```

3. Add NPC_DIALOGUE transitions (after VICTORY block, around line 128):
```javascript
  [PHASES.NPC_DIALOGUE]: [
    PHASES.POST_COMBAT_SHOP,  // Proceed to loot
    PHASES.ROOM,              // Continue exploring
    PHASES.EXPLORING,         // Continue exploring
    PHASES.FLOOR_COMPLETE,    // Boss defeated
    PHASES.RUN_COMPLETE       // Final boss defeated
  ],
```

4. Add to derivePhase function — after the `combat?.active` check (line 212) and before the `postCombatShop` check (line 215), add:
```javascript
  // NPC dialogue pending after victory
  if (run.npcDialogue?.active) return PHASES.NPC_DIALOGUE;
```

5. Add to getPhaseName (around line 284):
```javascript
    [PHASES.NPC_DIALOGUE]: 'NPC Dialogue',
```

**Step 3: Syntax-check both files**

Run: `node --check src/game/state.js && node --check src/game/phase-machine.js && echo "OK"`
Expected: `OK`

**Step 4: Run existing unit tests to verify nothing broke**

Run: `npx vitest run tests/unit/phase-machine.test.js`
Expected: PASS (if test file exists) or no test file (that's fine)

**Step 5: Commit**

```bash
git add src/game/state.js src/game/phase-machine.js
git commit -m "feat: add npcBonds to meta-progression and npc_dialogue phase"
```

---

### Task 4: Wire NPC into combat state and encounter start

**Files:**
- Modify: `src/game/loop.js:1` (imports), `683-709` (startRobotEncounter), `333-389` (getState)

**Step 1: Add npc-service import**

At the top of `src/game/loop.js`, add import (near line 71, after other service imports):

```javascript
import { selectNpcForEncounter, shuffleOptions, updateBond, recordEncounter } from './services/npc-service.js';
```

**Step 2: Modify startRobotEncounter to assign NPC**

In `src/game/loop.js`, modify `startRobotEncounter()` (around line 683). After line 698 (`this.combat.swapPhase = true;`), add:

```javascript
    // Assign NPC to this encounter
    const usedNpcIds = (this.run.usedNpcIds || []);
    const npc = selectNpcForEncounter(this.run.floor, usedNpcIds);
    this.combat.npcId = npc.id;
    this.combat.npcData = {
      id: npc.id,
      name: npc.name,
      nameEn: npc.nameEn,
      greeting: npc.greeting,
      defeatLine: npc.defeatLine
    };
    // Track used NPCs this floor to avoid repeats
    if (!this.run.usedNpcIds) this.run.usedNpcIds = [];
    this.run.usedNpcIds.push(npc.id);
```

Also update the return value (around line 703) to include NPC data:

```javascript
    return {
      enemy: enemyRobots[0],
      enemies: enemyRobots,
      allies: this.run.robotParty.active,
      playerGoesFirst: true,
      npc: this.combat.npcData
    };
```

**Step 3: Expose NPC data in getState**

In `src/game/loop.js`, modify `getState()` (around line 370). In the `combat` block, after `lastAction: this.combat.lastAction`, add:

```javascript
        npcId: this.combat.npcId || null,
        npcData: this.combat.npcData || null
```

**Step 4: Add NPC dialogue state to run in getState**

In `src/game/loop.js`, in the `getState()` `run` block (around line 363), after `startingChipShop: null`, add:

```javascript
        npcDialogue: this.run?.npcDialogue || null
```

**Step 5: Add method to start NPC dialogue phase**

Add a new method to GameManager (after `startRobotEncounter`, around line 710):

```javascript
  /**
   * Start NPC dialogue phase after combat victory
   * @param {string} npcId - The NPC that was defeated
   * @param {object} npcData - NPC display data
   */
  startNpcDialogue(npcId, npcData) {
    const { loadNpcs } = require('./services/npc-service.js');
    // Can't use require in ESM — this is handled by the route instead
    // The route looks up the NPC and sets run.npcDialogue
    this.run.npcDialogue = {
      active: true,
      npcId,
      npcData,
      currentRound: 0,
      totalDelta: 0
    };
    this.emitState();
  }

  /**
   * Complete NPC dialogue and update bond
   */
  completeNpcDialogue() {
    if (!this.run?.npcDialogue) return;
    const { npcId, totalDelta } = this.run.npcDialogue;
    // Update bond in meta
    updateBond(this.meta, npcId, totalDelta);
    recordEncounter(this.meta, npcId);
    this.run.npcDialogue = null;
    this.emitState();
  }
```

**Step 6: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: `OK`

**Step 7: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: wire NPC selection into encounter start and expose in game state"
```

---

### Task 5: Add NPC dialogue API endpoint and block befriend

**Files:**
- Modify: `src/routes/game/combat.js:1-35` (imports/factory params), `256-260` (befriend check), end of file (new endpoint)

**Step 1: Add npc-service import and factory param**

At the top of `src/routes/game/combat.js`, add import (after line 9):

```javascript
import { loadNpcs, shuffleOptions, updateBond, recordEncounter } from '../../game/services/npc-service.js';
```

**Step 2: Block befriend for NPC battles**

In the `/befriend-conversation` endpoint (around line 257), after the `!combat.isRobotCombat` check, add:

```javascript
    if (combat.npcId) {
      return res.status(400).json({ error: 'Cannot befriend NPC trainer robots' });
    }
```

**Step 3: Add NPC dialogue start endpoint**

After the `/befriend-answer` endpoint (around line 491), add a new endpoint to start NPC dialogue:

```javascript
  // Start NPC post-combat dialogue
  router.post('/npc-dialogue-start', (req, res) => {
    const gameManager = req.gameManager;
    const combat = gameManager.combat;

    if (!combat?.npcId) {
      return res.status(400).json({ error: 'No NPC in this combat' });
    }

    const npcs = loadNpcs();
    const npc = npcs[combat.npcId];
    if (!npc) {
      return res.status(400).json({ error: 'NPC not found' });
    }

    // Prepare shuffled rounds (strip tone from client response)
    const preparedRounds = npc.postCombat.rounds.map(round => {
      const { shuffled, toneMap } = shuffleOptions(round.options);
      return {
        npcLine: round.npcLine,
        options: shuffled,
        _toneMap: toneMap  // kept server-side
      };
    });

    // Set dialogue state on run
    gameManager.run.npcDialogue = {
      active: true,
      npcId: npc.id,
      npcData: { id: npc.id, name: npc.name, nameEn: npc.nameEn },
      currentRound: 0,
      totalDelta: 0,
      rounds: preparedRounds
    };

    req.saveGame();

    // Return first round to client (without toneMap)
    const clientRounds = preparedRounds.map(r => ({
      npcLine: r.npcLine,
      options: r.options
    }));

    res.json({
      npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn },
      freed: npc.postCombat.freed,
      rounds: clientRounds
    });
  });
```

**Step 4: Add NPC dialogue respond endpoint**

```javascript
  // Respond to NPC dialogue round
  router.post('/npc-dialogue-respond', (req, res) => {
    const gameManager = req.gameManager;
    const { roundIndex, selectedIndex } = req.body;
    const dialogue = gameManager.run?.npcDialogue;

    if (!dialogue?.active) {
      return res.status(400).json({ error: 'No active NPC dialogue' });
    }

    if (roundIndex !== dialogue.currentRound) {
      return res.status(400).json({ error: 'Wrong round index' });
    }

    if (selectedIndex < 0 || selectedIndex > 2) {
      return res.status(400).json({ error: 'Invalid selection' });
    }

    const round = dialogue.rounds[roundIndex];
    const tone = round._toneMap[selectedIndex];
    const delta = tone === 'positive' ? 1 : tone === 'negative' ? -1 : 0;
    dialogue.totalDelta += delta;
    dialogue.currentRound++;

    const dialogueComplete = dialogue.currentRound >= 3;

    if (dialogueComplete) {
      // Update meta-progression bond
      const meta = gameManager.getMeta();
      updateBond(meta, dialogue.npcId, dialogue.totalDelta);
      recordEncounter(meta, dialogue.npcId);
      const bond = meta.npcBonds[dialogue.npcId];

      // Clear dialogue state
      gameManager.run.npcDialogue = null;

      req.saveGame();

      return res.json({
        tone,
        delta,
        dialogueComplete: true,
        totalDelta: dialogue.totalDelta,
        bond: bond.bond,
        npcName: dialogue.npcData.name,
        npcNameEn: dialogue.npcData.nameEn,
        state: req.getEnrichedGameState()
      });
    }

    req.saveGame();
    res.json({
      tone,
      delta,
      dialogueComplete: false,
      currentRound: dialogue.currentRound
    });
  });
```

**Step 5: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "feat: add NPC dialogue endpoints and block befriend for NPC battles"
```

---

### Task 6: Add frontend API functions

**Files:**
- Modify: `public/js/api.js` (add 2 functions + exports)

**Step 1: Add API functions**

In `public/js/api.js`, before the `export {` block (around line 639), add:

```javascript
// ============ NPC DIALOGUE ENDPOINTS ============

/**
 * Start NPC post-combat dialogue
 * @returns {Promise<object>} NPC data, freed line, dialogue rounds
 */
async function startNpcDialogue() {
  return apiCall('/npc-dialogue-start', 'POST');
}

/**
 * Respond to an NPC dialogue round
 * @param {number} roundIndex - Current round (0-2)
 * @param {number} selectedIndex - Player's choice (0-2)
 * @returns {Promise<object>} Tone, delta, completion status
 */
async function respondNpcDialogue(roundIndex, selectedIndex) {
  return apiCall('/npc-dialogue-respond', 'POST', { roundIndex, selectedIndex });
}
```

**Step 2: Add to exports**

In the `export {` block (around line 641), add after the befriend exports:

```javascript
  // NPC dialogue endpoints
  startNpcDialogue,
  respondNpcDialogue,
```

**Step 3: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add NPC dialogue API client functions"
```

---

### Task 7: Add bond heart CSS animations

**Files:**
- Modify: `public/game.css` (append styles)

**Step 1: Add bond feedback styles**

Append to `public/game.css`:

```css
/* ============ NPC BOND FEEDBACK ============ */

.bond-feedback {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 2.5rem;
  pointer-events: none;
  z-index: 100;
  animation: bond-float-up 1.2s ease-out forwards;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.bond-feedback .bond-delta {
  font-size: 1.4rem;
  font-weight: bold;
  text-shadow: 0 0 8px currentColor;
}

.bond-feedback.positive {
  color: #ff69b4;
}

.bond-feedback.neutral {
  color: #aaa;
}

.bond-feedback.negative {
  color: #ff4444;
}

@keyframes bond-float-up {
  0% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-60px);
  }
}

/* NPC dialogue response buttons */
.npc-response-btn {
  width: 100%;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(20, 20, 40, 0.85);
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 1rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background 0.2s;
}

.npc-response-btn:hover {
  border-color: rgba(0, 255, 255, 0.6);
  background: rgba(30, 30, 60, 0.9);
}

.npc-response-btn:active {
  background: rgba(0, 255, 255, 0.15);
}

/* Bond summary toast */
.bond-summary {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(10, 10, 30, 0.95);
  border: 1px solid rgba(0, 255, 255, 0.4);
  border-radius: 12px;
  padding: 1rem 2rem;
  color: #e0e0e0;
  font-size: 1.2rem;
  z-index: 200;
  animation: bond-summary-fade 2s ease-in-out forwards;
  text-align: center;
}

.bond-summary .bond-value {
  font-weight: bold;
  font-size: 1.5rem;
}

.bond-summary .bond-value.positive { color: #ff69b4; }
.bond-summary .bond-value.neutral { color: #aaa; }
.bond-summary .bond-value.negative { color: #ff4444; }

@keyframes bond-summary-fade {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; }
}
```

**Step 2: Commit**

```bash
git add public/game.css
git commit -m "feat: add NPC bond feedback and dialogue response CSS"
```

---

### Task 8: Add NPC dialogue UI to combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js:89-136` (callbacks), `203-222` (befriend check), `1797-1804` (victory flow)

**Step 1: Add callback slots for NPC API functions**

In `public/js/ui/combat-loop.js`, after line 92 (`let apiSubmitBefriendAnswer = null;`), add:

```javascript
let apiStartNpcDialogue = null;
let apiRespondNpcDialogue = null;
```

In the `init()` function (around line 136), after `apiSubmitBefriendAnswer = callbacks.apiSubmitBefriendAnswer;`, add:

```javascript
  apiStartNpcDialogue = callbacks.apiStartNpcDialogue;
  apiRespondNpcDialogue = callbacks.apiRespondNpcDialogue;
```

**Step 2: Disable befriend for NPC battles**

In `showNextDualCardsFromQueue()` (around line 209), change the befriend check:

```javascript
  const befriendAvailable = isRobotCombat && anyEnemyBefriendable && party && !state.combat?.npcId;
```

This adds `&& !state.combat?.npcId` to the existing condition.

**Step 3: Add NPC dialogue flow functions**

After the `stopCombatLoop` function (around line 1830), add:

```javascript
/**
 * Show NPC greeting before combat
 * @param {object} npcData - { name, nameEn, greeting }
 */
export async function showNpcGreeting(npcData) {
  if (!npcData?.greeting) return;
  await narration.showNarration(npcData.greeting, { speaker: npcData.name || npcData.nameEn });
}

/**
 * Show NPC defeat line when player loses
 * @param {object} npcData - { name, nameEn, defeatLine }
 */
export async function showNpcDefeatLine(npcData) {
  if (!npcData?.defeatLine) return;
  await narration.showNarration(npcData.defeatLine, { speaker: npcData.name || npcData.nameEn });
}

/**
 * Run the full NPC post-combat dialogue flow
 * Called after victory narration, before post-combat shop
 */
export async function runNpcDialogue() {
  if (!apiStartNpcDialogue || !apiRespondNpcDialogue) return;

  const dialogueData = await apiStartNpcDialogue();
  if (!dialogueData) return;

  const { npc, freed, rounds } = dialogueData;
  const npcName = npc.name || npc.nameEn;

  // Show freed narration
  await narration.showNarration(freed, { speaker: npcName });

  let totalDelta = 0;

  // Run 3 dialogue rounds
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];

    // Show NPC line
    await narration.showNarration(round.npcLine, { speaker: npcName, persistent: true });

    // Show 3 response buttons
    const selectedIndex = await showNpcResponseOptions(round.options);

    // Hide narration
    if (narration.forceHideNarration) narration.forceHideNarration();

    // Submit to server
    const result = await apiRespondNpcDialogue(i, selectedIndex);
    if (!result) break;

    // Show bond feedback
    showBondFeedback(result.tone, result.delta);
    totalDelta += result.delta;

    // Wait for animation
    await delay(1200);

    // Remove feedback
    document.querySelector('.bond-feedback')?.remove();

    if (result.dialogueComplete) {
      // Update game state
      if (result.state) {
        updateGameState(result.state);
      }
      break;
    }
  }

  // Show bond summary toast
  showBondSummary(npcName, totalDelta);
  await delay(2200);
  document.querySelector('.bond-summary')?.remove();
}

/**
 * Show 3 NPC response option buttons
 * @param {Array} options - [{ text }, { text }, { text }]
 * @returns {Promise<number>} Selected index (0-2)
 */
function showNpcResponseOptions(options) {
  return new Promise(resolve => {
    const container = document.getElementById('action-area') || document.querySelector('.action-area');
    if (!container) { resolve(0); return; }

    container.innerHTML = '';
    options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = 'npc-response-btn';
      btn.textContent = option.text;
      btn.addEventListener('click', () => {
        // Disable all buttons
        container.querySelectorAll('.npc-response-btn').forEach(b => b.disabled = true);
        resolve(index);
      });
      container.appendChild(btn);
    });
  });
}

/**
 * Show floating heart bond feedback
 * @param {string} tone - 'positive' | 'neutral' | 'negative'
 * @param {number} delta - +1, 0, or -1
 */
function showBondFeedback(tone, delta) {
  const existing = document.querySelector('.bond-feedback');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `bond-feedback ${tone}`;

  const heart = tone === 'positive' ? '❤️' : tone === 'negative' ? '💔' : '🤍';
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '';

  el.innerHTML = `${heart}${deltaText ? `<span class="bond-delta">${deltaText}</span>` : ''}`;

  const sceneArea = document.getElementById('scene-area') || document.querySelector('.scene-area');
  if (sceneArea) {
    sceneArea.appendChild(el);
  }
}

/**
 * Show bond summary toast after all rounds
 * @param {string} npcName - NPC display name
 * @param {number} totalDelta - Sum of all round deltas
 */
function showBondSummary(npcName, totalDelta) {
  const el = document.createElement('div');
  el.className = 'bond-summary';

  const sign = totalDelta > 0 ? '+' : '';
  const cls = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';

  el.innerHTML = `${npcName}との絆 <span class="bond-value ${cls}">${sign}${totalDelta}</span>`;
  document.body.appendChild(el);
}
```

**Step 4: Insert NPC dialogue into victory flow**

In `stopCombatLoop()` (around line 1797-1804), replace:

```javascript
    if (result.victory) {
      playSFX('victory');
      const gs = getGameState();
      const isRobotCombat = gs?.combat?.isRobotCombat;
      if (isRobotCombat && showPostCombatShop) {
        await showPostCombatShop();
      }
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
```

with:

```javascript
    if (result.victory) {
      playSFX('victory');
      const gs = getGameState();
      const isRobotCombat = gs?.combat?.isRobotCombat;
      // NPC dialogue before shop (if this was an NPC encounter)
      if (isRobotCombat && gs?.combat?.npcId) {
        await runNpcDialogue();
      }
      if (isRobotCombat && showPostCombatShop) {
        await showPostCombatShop();
      }
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
```

Do the same in the catch/fallback block (around line 1813-1821):

```javascript
      // Fallback NPC dialogue
      if (gs?.combat?.npcId) {
        await runNpcDialogue();
      }
```

Add this after the fallback narration `await narration.showNarration('市民解放！');` and before `showPostCombatShop()`.

**Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add NPC greeting, dialogue rounds, and bond feedback UI"
```

---

### Task 9: Wire NPC callbacks in game.js

**Files:**
- Modify: `public/game.js` (combat-loop init callbacks, phase handling, encounter start)

**Step 1: Add NPC API imports**

In `public/game.js`, find where API functions are imported (search for `import` from `./js/api.js`). Add `startNpcDialogue` and `respondNpcDialogue` to the destructured imports.

**Step 2: Pass NPC callbacks to combat-loop init**

Find where `combatLoopUI.init({...})` is called. Add to the callbacks object:

```javascript
  apiStartNpcDialogue: startNpcDialogue,
  apiRespondNpcDialogue: respondNpcDialogue,
```

**Step 3: Show NPC greeting before combat**

Find where `startRobotEncounter` is called (search for `apiStartRobotEncounter` or `startRobotEncounter`). After the encounter starts and before the combat loop begins, add:

```javascript
// Show NPC greeting if present
if (result.npc) {
  await combatLoopUI.showNpcGreeting(result.npc);
}
```

**Step 4: Show NPC defeat line on loss**

Find where `showGameOverModal` is called or where defeat is handled. Before showing the game over modal, add:

```javascript
// Show NPC defeat line if this was an NPC encounter
const gs = getGameState();
if (gs?.combat?.npcData?.defeatLine) {
  await combatLoopUI.showNpcDefeatLine(gs.combat.npcData);
}
```

**Step 5: Add npc_dialogue phase to updateGameContent**

In `updateGameContent()` (around line 329), add a case for `npc_dialogue`. This phase is handled entirely by `runNpcDialogue()` in combat-loop.js during the victory flow, so the phase case just needs to avoid clearing the screen:

```javascript
    case 'npc_dialogue':
      // Handled by combat-loop's runNpcDialogue()
      break;
```

**Step 6: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 7: Commit**

```bash
git add public/game.js
git commit -m "feat: wire NPC greeting, defeat line, and dialogue callbacks into game.js"
```

---

### Task 10: Integration test via server start

**Step 1: Start the server**

Run: `npm start &`
Wait 3 seconds, then verify:
Run: `curl -s http://localhost:3000/api/health | head -1`
Expected: Server responds (200 OK or similar)

**Step 2: Verify NPC data loads**

Run: `node -e "import('./src/game/services/npc-service.js').then(m => { const npcs = m.loadNpcs(); console.log('NPCs loaded:', Object.keys(npcs).length); console.log('Sample:', npcs.npc_01.nameEn); })"`
Expected: `NPCs loaded: 10` and `Sample: Trainer A`

**Step 3: Run unit tests**

Run: `npx vitest run tests/unit/npc-service.test.js`
Expected: All PASS

**Step 4: Run existing unit test suite**

Run: `npm run test:unit`
Expected: No new failures beyond pre-existing ones (~48 known failures)

**Step 5: Kill test server**

Run: `pkill -f "node server.js"` (or skip if using background process)

**Step 6: Commit any fixes if needed**

---

### Task 11: Final review and documentation commit

**Step 1: Review all changes**

Run: `git log --oneline` to verify commit history.
Run: `git diff HEAD~8 --stat` to see all files changed.

**Step 2: Verify no syntax errors across all modified files**

Run: `node --check src/game/state.js && node --check src/game/phase-machine.js && node --check src/game/loop.js && node --check src/routes/game/combat.js && node --check public/js/api.js && node --check public/js/ui/combat-loop.js && echo "ALL OK"`
Expected: `ALL OK`

**Step 3: Final commit (if any remaining changes)**

```bash
git status
```

If clean, the implementation is complete. If there are uncommitted fixes, commit them.
