# Competitive Multiplayer PvP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1v1 PvP battles where players save teams from completed runs and fight each other in real-time via Socket.IO, sharing the same combat math as PvE.

**Architecture:** Socket.IO handles real-time match communication (lobby, team select, move submission, round results). PvP combat reuses existing functions from `creature-combat-service.js` with a new interleaved-turn orchestrator. Match state is ephemeral (in-memory only). Team saves persist on the user's meta-progression object.

**Tech Stack:** Socket.IO (server + client), existing Express/Node.js server, existing Vite frontend build

**Spec:** `docs/superpowers/specs/2026-03-30-competitive-multiplayer-pvp-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/pvp/match-manager.js` | In-memory match state: create, join, team select, move submit, round resolve, rematch, cleanup |
| `src/pvp/pvp-combat.js` | PvP round resolution: interleave creatures by level, execute moves via existing combat functions |
| `src/pvp/socket-handler.js` | Socket.IO event routing: JWT auth, dispatch to match-manager, emit results |
| `src/routes/game/pvp.js` | REST endpoints for team saving (`save-pvp-team`, `pvp-teams`) |
| `public/js/pvp-socket.js` | Socket.IO client: connect, emit, listen, reconnect |
| `public/js/ui/pvp-lobby.js` | Lobby UI: create/join match, team selection, ready-up |
| `public/js/ui/pvp-battle.js` | PvP battle UI: move selection, round result animation, end screen, rematch |
| `tests/unit/pvp/pvp-combat.test.js` | PvP combat resolver tests |
| `tests/unit/pvp/match-manager.test.js` | Match manager tests |
| `tests/unit/pvp/socket-handler.test.js` | Socket handler tests |
| `tests/unit/routes/pvp.test.js` | PvP REST endpoint tests |

### Modified Files

| File | Change |
|------|--------|
| `server.js` | Wrap `app` in `http.createServer()`, attach Socket.IO, pass `io` to socket handler |
| `src/game/state.js` | Add `pvpTeams: [null, null, null]` to `createMetaProgression()`, change `areasToWin` to 1 |
| `src/game/phase-machine.js` | Add PvP phases to `PHASES` and `VALID_TRANSITIONS` |
| `src/routes/game/index.js` | Mount PvP REST routes |
| `public/game.js` | Add PvP phase cases to `updateGameContent()` switch, import PvP modules |
| `public/js/ui/exploration.js` | Add "Save Team for PvP" button to `renderRunComplete()`, add "Multiplayer Battle" button to `renderHub()` |
| `public/js/api.js` | Add `savePvpTeam()` and `getPvpTeams()` API functions |
| `package.json` | Add `socket.io` dependency |

---

## Task 1: Install Socket.IO and Wire to HTTP Server

**Files:**
- Modify: `package.json`
- Modify: `server.js:181,783-790`

- [ ] **Step 1: Install socket.io**

```bash
npm install socket.io
```

- [ ] **Step 2: Modify server.js to create HTTP server and attach Socket.IO**

In `server.js`, add the import at the top (after existing imports, around line 30):

```js
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
```

After `const app = express();` (line 181), create the HTTP server:

```js
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
```

At the bottom, change `app.listen` (line 783) to `httpServer.listen`:

```js
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('[Server] Started:', { port: PORT, env: process.env.NODE_ENV || 'development' });
  logger.info('[Server] Log level:', logger.getLevel());
  console.log(`JRPG server running at http://localhost:${PORT}`);
  console.log('[TTS] Prefetch:', settings.gameTtsEnabled ? 'enabled' : 'disabled');
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to play');
});
```

- [ ] **Step 3: Verify server starts**

```bash
node --check server.js && echo "OK"
npm run dev:server &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat: install socket.io, attach to HTTP server"
```

---

## Task 2: Prerequisite — Change areasToWin to 1

**Files:**
- Modify: `src/game/state.js:148`

- [ ] **Step 1: Change areasToWin default**

In `src/game/state.js`, line 148, change:

```js
    areasToWin: 10,              // win condition threshold
```

to:

```js
    areasToWin: 1,               // win condition threshold
```

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All tests pass. If `phase-machine.test.js` hardcodes `areasToWin: 10` in its fixture, update it to `1` as well.

- [ ] **Step 3: Commit**

```bash
git add src/game/state.js
git commit -m "feat: single-area runs (areasToWin: 1)"
```

---

## Task 3: PvP Combat Resolver

The heart of shared combat. This module takes two teams and their move choices, interleaves creatures by level, and executes moves using existing functions from `creature-combat-service.js`.

**Files:**
- Create: `src/pvp/pvp-combat.js`
- Create: `tests/unit/pvp/pvp-combat.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pvp/pvp-combat.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRound, buildTurnOrder } from '../../../src/pvp/pvp-combat.js';

function makeCreature(overrides = {}) {
  return {
    id: `creature-${Math.random().toString(36).slice(2, 6)}`,
    name: 'テスト', nameEn: 'Test',
    element: 'neutral', level: 5,
    hp: 100, maxHp: 100, mp: 20, maxMp: 20,
    attack: 15, defense: 5,
    baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
    activeEffects: [],
    moves: [{
      id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
      element: 'neutral', category: 'damage', power: 40,
      target: 'single_enemy', mpCost: 3, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }],
    ...overrides
  };
}

describe('buildTurnOrder', () => {
  it('sorts creatures by level descending', () => {
    const sideA = [makeCreature({ id: 'a1', level: 3 })];
    const sideB = [makeCreature({ id: 'b1', level: 7 })];
    const order = buildTurnOrder(sideA, sideB);
    assert.equal(order[0].creature.id, 'b1');
    assert.equal(order[1].creature.id, 'a1');
  });

  it('skips KO creatures', () => {
    const sideA = [makeCreature({ id: 'a1', level: 5, hp: 0 })];
    const sideB = [makeCreature({ id: 'b1', level: 5 })];
    const order = buildTurnOrder(sideA, sideB);
    assert.equal(order.length, 1);
    assert.equal(order[0].creature.id, 'b1');
  });
});

describe('resolveRound', () => {
  it('executes moves and deals damage', () => {
    const sideA = [makeCreature({ id: 'a1', level: 5 })];
    const sideB = [makeCreature({ id: 'b1', level: 5 })];
    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.attacks.length >= 2, 'Both creatures should attack');
    assert.ok(sideA[0].hp < 100 || sideB[0].hp < 100, 'At least one creature took damage');
    assert.equal(result.winner, null, 'No winner after one round');
  });

  it('declares winner when all of one side is KO', () => {
    const sideA = [makeCreature({ id: 'a1', level: 10, attack: 999 })];
    const sideB = [makeCreature({ id: 'b1', level: 1, hp: 1, maxHp: 1 })];
    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.equal(result.winner, 'sideA');
  });

  it('handles party skills', () => {
    const sideA = [makeCreature({ id: 'a1', level: 5 })];
    const sideB = [makeCreature({ id: 'b1', level: 5 })];
    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const partySkillsA = [{ id: 'battleRhythm' }];

    const result = resolveRound(sideA, sideB, movesA, movesB, {
      partySkillsA, partySkillsB: []
    });

    assert.ok(result.attacks.length >= 2);
  });

  it('ticks status effects at start of round', () => {
    const sideA = [makeCreature({ id: 'a1', level: 5, activeEffects: [{ type: 'poison', remainingTurns: 2, damagePerTurn: 5 }] })];
    const sideB = [makeCreature({ id: 'b1', level: 5 })];
    const movesA = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const movesB = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

    const result = resolveRound(sideA, sideB, movesA, movesB);

    assert.ok(result.effectEvents.length > 0, 'Poison should tick');
    assert.ok(sideA[0].hp < 100, 'Poison should deal damage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/pvp/pvp-combat.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pvp-combat.js**

Create `src/pvp/pvp-combat.js`:

```js
import {
  tickAllEffects,
  processMoveTurn,
  handleCreatureKO,
  applyPartySkillsAfterPlayerAttacks
} from '../game/services/creature-combat-service.js';
import {
  isIncapacitated, hasHaste, consumeHaste
} from '../game/combat/effects.js';

/**
 * Build turn order: all alive creatures from both sides, sorted by level desc.
 * Ties broken randomly.
 *
 * @param {object[]} sideA - Team A creatures (active)
 * @param {object[]} sideB - Team B creatures (active)
 * @returns {Array<{creature, creatureIndex, side, allies, enemies}>}
 */
export function buildTurnOrder(sideA, sideB) {
  const entries = [];

  for (let i = 0; i < sideA.length; i++) {
    if (sideA[i] && sideA[i].hp > 0) {
      entries.push({ creature: sideA[i], creatureIndex: i, side: 'A', allies: sideA, enemies: sideB });
    }
  }
  for (let i = 0; i < sideB.length; i++) {
    if (sideB[i] && sideB[i].hp > 0) {
      entries.push({ creature: sideB[i], creatureIndex: i, side: 'B', allies: sideB, enemies: sideA });
    }
  }

  entries.sort((a, b) => {
    const diff = (b.creature.level || 1) - (a.creature.level || 1);
    if (diff !== 0) return diff;
    return Math.random() - 0.5;
  });

  return entries;
}

/**
 * Resolve one PvP round. Both sides' moves interleaved by creature level.
 *
 * Uses existing combat functions from creature-combat-service.js:
 * - tickAllEffects for status effect ticking
 * - processMoveTurn for executing a side's move choices (called per-creature via executeMove)
 * - handleCreatureKO for auto-swapping reserves
 * - applyPartySkillsAfterPlayerAttacks for party skill procs
 *
 * @param {object[]} sideA - Team A active creatures
 * @param {object[]} sideB - Team B active creatures
 * @param {object[]} movesA - Team A move choices [{creatureIndex, moveId, targetIndex}]
 * @param {object[]} movesB - Team B move choices [{creatureIndex, moveId, targetIndex}]
 * @param {object} [options]
 * @param {object[]} [options.partySkillsA] - Team A party skills
 * @param {object[]} [options.partySkillsB] - Team B party skills
 * @param {object}   [options.itemBuffsA] - Team A item buffs
 * @param {object}   [options.itemBuffsB] - Team B item buffs
 * @param {object}   [options.partyA] - Team A full creatureParty (for KO swaps)
 * @param {object}   [options.partyB] - Team B full creatureParty (for KO swaps)
 * @returns {{ attacks, effectEvents, koSwaps, mpRegens, winner, updatedSideA, updatedSideB }}
 */
export function resolveRound(sideA, sideB, movesA, movesB, options = {}) {
  const {
    partySkillsA = [], partySkillsB = [],
    itemBuffsA = null, itemBuffsB = null,
    partyA = null, partyB = null
  } = options;

  // 1. Tick status effects at start of round
  const effectEvents = tickAllEffects(sideA, sideB);

  // 2. Process each side's moves using processMoveTurn
  //    Pass null for creatureParty to skip XP awarding (PvP has no XP)
  //    KO swaps are handled separately below
  const resultA = processMoveTurn(sideA, sideB, movesA, itemBuffsA, null);
  const resultB = processMoveTurn(sideB, sideA, movesB, itemBuffsB, null);

  // 3. Apply party skills for each side
  applyPartySkillsAfterPlayerAttacks({
    attacks: resultA.attacks,
    allies: sideA,
    enemies: sideB,
    runPartySkills: partySkillsA,
    combat: { partyHitCounter: 0 }
  });
  applyPartySkillsAfterPlayerAttacks({
    attacks: resultB.attacks,
    allies: sideB,
    enemies: sideA,
    runPartySkills: partySkillsB,
    combat: { partyHitCounter: 0 }
  });

  // 4. Combine attacks in turn order (by level)
  const allAttacks = [];
  const turnOrder = buildTurnOrder(sideA, sideB);

  // Map attacks to their executing creature for ordering
  const attacksByCreatureA = groupAttacksByCreature(resultA.attacks);
  const attacksByCreatureB = groupAttacksByCreature(resultB.attacks);

  for (const entry of turnOrder) {
    const attackMap = entry.side === 'A' ? attacksByCreatureA : attacksByCreatureB;
    const creatureAttacks = attackMap.get(entry.creatureIndex) || [];
    allAttacks.push(...creatureAttacks);
  }

  // If any attacks weren't matched to turn order (edge case), append them
  const orderedIds = new Set(allAttacks.map(a => a));
  for (const atk of [...resultA.attacks, ...resultB.attacks]) {
    if (!orderedIds.has(atk)) allAttacks.push(atk);
  }

  // 5. Handle KO swaps
  const koSwaps = [];
  for (let i = 0; i < sideA.length; i++) {
    if (sideA[i] && sideA[i].hp <= 0 && partyA) {
      const swapped = handleCreatureKO(partyA, i);
      if (swapped) {
        sideA[i] = partyA.active[i];
        koSwaps.push({ side: 'A', slot: i, replacement: sideA[i]?.nameEn });
      }
    }
  }
  for (let i = 0; i < sideB.length; i++) {
    if (sideB[i] && sideB[i].hp <= 0 && partyB) {
      const swapped = handleCreatureKO(partyB, i);
      if (swapped) {
        sideB[i] = partyB.active[i];
        koSwaps.push({ side: 'B', slot: i, replacement: sideB[i]?.nameEn });
      }
    }
  }

  // 6. Determine winner
  const allADead = sideA.every(c => !c || c.hp <= 0) && (!partyA?.reserves?.length || partyA.reserves.every(c => !c || c.hp <= 0));
  const allBDead = sideB.every(c => !c || c.hp <= 0) && (!partyB?.reserves?.length || partyB.reserves.every(c => !c || c.hp <= 0));

  let winner = null;
  if (allBDead && !allADead) winner = 'sideA';
  else if (allADead && !allBDead) winner = 'sideB';
  else if (allADead && allBDead) winner = 'draw';

  // 7. Collect MP regens
  const mpRegens = [...(resultA.mpRegens || []), ...(resultB.mpRegens || [])];

  return {
    attacks: allAttacks,
    effectEvents,
    koSwaps,
    mpRegens,
    winner,
    updatedSideA: sideA,
    updatedSideB: sideB
  };
}

/** Group attack records by their attackerIndex (creatureIndex in the attacker's team). */
function groupAttacksByCreature(attacks) {
  const map = new Map();
  for (const atk of attacks) {
    const key = atk.attackerIndex ?? -1;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(atk);
  }
  return map;
}
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/unit/pvp/pvp-combat.test.js
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pvp/pvp-combat.js tests/unit/pvp/pvp-combat.test.js
git commit -m "feat: PvP combat resolver with interleaved turn order"
```

---

## Task 4: Match Manager

In-memory match lifecycle: create, join, team select, move submission, round resolution, rematch, cleanup.

**Files:**
- Create: `src/pvp/match-manager.js`
- Create: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pvp/match-manager.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MatchManager } from '../../../src/pvp/match-manager.js';

function makeTeam() {
  return {
    creatureParty: {
      active: [{
        id: 'c1', name: 'テスト', nameEn: 'Test', element: 'neutral', level: 5,
        hp: 100, maxHp: 100, mp: 20, maxMp: 20, attack: 15, defense: 5,
        baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
        activeEffects: [],
        moves: [{ id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
          element: 'neutral', category: 'damage', power: 40,
          target: 'single_enemy', mpCost: 3, accuracy: 100 }]
      }],
      reserves: []
    },
    partySkills: [],
    itemBuffs: {},
    savedAt: Date.now()
  };
}

describe('MatchManager', () => {
  let mm;
  beforeEach(() => { mm = new MatchManager(); });

  it('creates a match and returns a 4-char code', () => {
    const code = mm.createMatch('user1', 'socket1');
    assert.equal(code.length, 4);
    const match = mm.getMatch(code);
    assert.equal(match.player1.userId, 'user1');
    assert.equal(match.phase, 'waiting');
  });

  it('allows a second player to join', () => {
    const code = mm.createMatch('user1', 'socket1');
    const joined = mm.joinMatch(code, 'user2', 'socket2');
    assert.ok(joined);
    const match = mm.getMatch(code);
    assert.equal(match.player2.userId, 'user2');
    assert.equal(match.phase, 'team_select');
  });

  it('rejects joining a full match', () => {
    const code = mm.createMatch('user1', 'socket1');
    mm.joinMatch(code, 'user2', 'socket2');
    const joined = mm.joinMatch(code, 'user3', 'socket3');
    assert.equal(joined, false);
  });

  it('rejects invalid match code', () => {
    const joined = mm.joinMatch('ZZZZ', 'user2', 'socket2');
    assert.equal(joined, false);
  });

  it('handles team selection and ready up', () => {
    const code = mm.createMatch('user1', 'socket1');
    mm.joinMatch(code, 'user2', 'socket2');

    mm.selectTeam(code, 'user1', makeTeam());
    mm.setReady(code, 'user1');
    const match1 = mm.getMatch(code);
    assert.equal(match1.player1.ready, true);
    assert.equal(match1.phase, 'team_select'); // not both ready yet

    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user2');
    const match2 = mm.getMatch(code);
    assert.equal(match2.phase, 'battle');
  });

  it('submits moves and resolves round when both submit', () => {
    const code = mm.createMatch('user1', 'socket1');
    mm.joinMatch(code, 'user2', 'socket2');
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
    const r1 = mm.submitMoves(code, 'user1', moves);
    assert.equal(r1, null); // waiting for other player

    const r2 = mm.submitMoves(code, 'user2', moves);
    assert.ok(r2, 'Round should resolve when both submit');
    assert.ok(r2.attacks.length > 0);
  });

  it('handles rematch flow', () => {
    const code = mm.createMatch('user1', 'socket1');
    mm.joinMatch(code, 'user2', 'socket2');
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    // Force match to finished
    const match = mm.getMatch(code);
    match.phase = 'finished';

    const r1 = mm.requestRematch(code, 'user1');
    assert.equal(r1, 'waiting');
    const r2 = mm.requestRematch(code, 'user2');
    assert.equal(r2, 'rematch');
    assert.equal(mm.getMatch(code).phase, 'team_select');
  });

  it('cleans up match on leave', () => {
    const code = mm.createMatch('user1', 'socket1');
    mm.leaveMatch(code, 'user1');
    assert.equal(mm.getMatch(code), null);
  });

  it('finds match by socket ID', () => {
    const code = mm.createMatch('user1', 'socket1');
    const found = mm.findMatchBySocket('socket1');
    assert.equal(found.code, code);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/pvp/match-manager.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement match-manager.js**

Create `src/pvp/match-manager.js`:

```js
import { resolveRound } from './pvp-combat.js';

/**
 * In-memory PvP match state management.
 * Matches are ephemeral — lost on server restart.
 */
export class MatchManager {
  constructor() {
    /** @type {Map<string, object>} code → match state */
    this.matches = new Map();
    /** @type {Map<string, string>} socketId → match code */
    this.socketToMatch = new Map();
  }

  /** Generate a unique 4-character alphanumeric code. */
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for readability
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (this.matches.has(code));
    return code;
  }

  /** Create a new match room. Returns the match code. */
  createMatch(userId, socketId) {
    const code = this._generateCode();
    this.matches.set(code, {
      code,
      player1: { userId, socketId, team: null, ready: false, movesSubmitted: null, wantsRematch: false },
      player2: null,
      phase: 'waiting', // waiting | team_select | battle | finished
      combat: null,
      createdAt: Date.now()
    });
    this.socketToMatch.set(socketId, code);
    return code;
  }

  /** Join an existing match. Returns true on success, false if full/not found. */
  joinMatch(code, userId, socketId) {
    const match = this.matches.get(code);
    if (!match || match.player2 || match.phase !== 'waiting') return false;
    match.player2 = { userId, socketId, team: null, ready: false, movesSubmitted: null, wantsRematch: false };
    match.phase = 'team_select';
    this.socketToMatch.set(socketId, code);
    return true;
  }

  /** Get match by code. */
  getMatch(code) {
    return this.matches.get(code) || null;
  }

  /** Find match by socket ID. Returns { code, match, playerKey } or null. */
  findMatchBySocket(socketId) {
    const code = this.socketToMatch.get(socketId);
    if (!code) return null;
    const match = this.matches.get(code);
    if (!match) return null;
    const playerKey = match.player1?.socketId === socketId ? 'player1'
      : match.player2?.socketId === socketId ? 'player2' : null;
    return { code, match, playerKey };
  }

  /** Select a team for a player. */
  selectTeam(code, userId, teamData) {
    const match = this.matches.get(code);
    if (!match) return false;
    const player = this._getPlayer(match, userId);
    if (!player) return false;
    player.team = teamData;
    return true;
  }

  /** Mark a player as ready. If both ready, transition to battle. */
  setReady(code, userId) {
    const match = this.matches.get(code);
    if (!match || match.phase !== 'team_select') return false;
    const player = this._getPlayer(match, userId);
    if (!player || !player.team) return false;
    player.ready = true;

    if (match.player1?.ready && match.player2?.ready) {
      this._startBattle(match);
    }
    return true;
  }

  /** Submit moves for a player. Returns round result if both submitted, null otherwise. */
  submitMoves(code, userId, moveChoices) {
    const match = this.matches.get(code);
    if (!match || match.phase !== 'battle') return null;
    const player = this._getPlayer(match, userId);
    if (!player) return null;
    player.movesSubmitted = moveChoices;

    // Check if both submitted
    if (!match.player1.movesSubmitted || !match.player2.movesSubmitted) return null;

    // Resolve round
    const result = resolveRound(
      match.combat.sideA,
      match.combat.sideB,
      match.player1.movesSubmitted,
      match.player2.movesSubmitted,
      {
        partySkillsA: match.player1.team.partySkills || [],
        partySkillsB: match.player2.team.partySkills || [],
        itemBuffsA: match.player1.team.itemBuffs || null,
        itemBuffsB: match.player2.team.itemBuffs || null,
        partyA: match.combat.partyA,
        partyB: match.combat.partyB
      }
    );

    // Clear move submissions for next round
    match.player1.movesSubmitted = null;
    match.player2.movesSubmitted = null;
    match.combat.round++;

    // Check for winner
    if (result.winner) {
      match.phase = 'finished';
      match.winnerId = result.winner === 'sideA' ? match.player1.userId : match.player2.userId;
      match.winnerName = result.winner === 'sideA'
        ? match.player1.username
        : match.player2.username;
    }

    return result;
  }

  /** Request rematch. Returns 'waiting' | 'rematch'. */
  requestRematch(code, userId) {
    const match = this.matches.get(code);
    if (!match || match.phase !== 'finished') return null;
    const player = this._getPlayer(match, userId);
    if (!player) return null;
    player.wantsRematch = true;

    if (match.player1?.wantsRematch && match.player2?.wantsRematch) {
      // Reset for new match
      match.phase = 'team_select';
      match.player1.ready = false;
      match.player1.team = null;
      match.player1.movesSubmitted = null;
      match.player1.wantsRematch = false;
      match.player2.ready = false;
      match.player2.team = null;
      match.player2.movesSubmitted = null;
      match.player2.wantsRematch = false;
      match.combat = null;
      match.winnerId = null;
      match.winnerName = null;
      return 'rematch';
    }
    return 'waiting';
  }

  /** Remove a player from their match. Cleans up empty matches. */
  leaveMatch(code, userId) {
    const match = this.matches.get(code);
    if (!match) return null;
    const otherPlayer = match.player1?.userId === userId ? match.player2 : match.player1;

    // Clean up socket mapping
    if (match.player1?.userId === userId) this.socketToMatch.delete(match.player1.socketId);
    if (match.player2?.userId === userId) this.socketToMatch.delete(match.player2.socketId);

    // If other player exists, they get notified (by caller)
    this.matches.delete(code);
    if (otherPlayer) this.socketToMatch.delete(otherPlayer.socketId);

    return otherPlayer;
  }

  /** Update socket ID for a reconnecting player. */
  reconnect(code, userId, newSocketId) {
    const match = this.matches.get(code);
    if (!match) return null;
    const player = this._getPlayer(match, userId);
    if (!player) return null;

    this.socketToMatch.delete(player.socketId);
    player.socketId = newSocketId;
    this.socketToMatch.set(newSocketId, code);
    return match;
  }

  /** Get the player object for a userId in a match. */
  _getPlayer(match, userId) {
    if (match.player1?.userId === userId) return match.player1;
    if (match.player2?.userId === userId) return match.player2;
    return null;
  }

  /** Initialize battle state from both teams. */
  _startBattle(match) {
    match.phase = 'battle';

    // Deep-clone teams so combat mutations don't affect saved team data
    const teamA = JSON.parse(JSON.stringify(match.player1.team));
    const teamB = JSON.parse(JSON.stringify(match.player2.team));

    // Restore full HP/MP on all creatures
    const healAll = (party) => {
      for (const c of [...party.creatureParty.active, ...(party.creatureParty.reserves || [])]) {
        if (c) { c.hp = c.maxHp; c.mp = c.maxMp; c.activeEffects = []; }
      }
    };
    healAll(teamA);
    healAll(teamB);

    match.combat = {
      sideA: teamA.creatureParty.active,
      sideB: teamB.creatureParty.active,
      partyA: teamA.creatureParty,
      partyB: teamB.creatureParty,
      round: 1
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/unit/pvp/match-manager.test.js
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pvp/match-manager.js tests/unit/pvp/match-manager.test.js
git commit -m "feat: PvP match manager with lobby, team select, combat, rematch"
```

---

## Task 5: Socket Handler

Socket.IO event routing with JWT authentication. Bridges socket events to match manager.

**Files:**
- Create: `src/pvp/socket-handler.js`

- [ ] **Step 1: Implement socket-handler.js**

Create `src/pvp/socket-handler.js`:

```js
import { MatchManager } from './match-manager.js';
import { verifyToken } from '../auth/middleware.js';
import { findUserById } from '../auth/users.js';

const DISCONNECT_TIMEOUT_MS = 30000;

/**
 * Set up Socket.IO event handlers for PvP multiplayer.
 * @param {import('socket.io').Server} io - Socket.IO server instance
 */
export function setupPvpSockets(io) {
  const mm = new MatchManager();
  const disconnectTimers = new Map(); // socketId → timeout

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    socket.userId = payload.id;
    socket.username = payload.username;
    next();
  });

  io.on('connection', (socket) => {
    // Check if this is a reconnection
    const existingTimer = disconnectTimers.get(socket.userId);
    if (existingTimer) {
      clearTimeout(existingTimer.timeout);
      disconnectTimers.delete(socket.userId);
    }

    socket.on('pvp:create-match', () => {
      const code = mm.createMatch(socket.userId, socket.id);
      // Store username on match for winner display
      const match = mm.getMatch(code);
      match.player1.username = socket.username;
      socket.join(code);
      socket.emit('pvp:match-created', { code });
    });

    socket.on('pvp:join-match', ({ code }) => {
      const joined = mm.joinMatch(code, socket.userId, socket.id);
      if (!joined) {
        socket.emit('pvp:error', { message: 'Match not found or full' });
        return;
      }
      const match = mm.getMatch(code);
      match.player2.username = socket.username;
      socket.join(code);
      socket.emit('pvp:match-joined');
      io.to(code).emit('pvp:opponent-joined');
    });

    socket.on('pvp:select-team', ({ slotIndex, teamData }) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;
      mm.selectTeam(found.code, socket.userId, teamData);
    });

    socket.on('pvp:ready', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;
      mm.setReady(found.code, socket.userId);

      const match = mm.getMatch(found.code);
      if (match.phase === 'battle') {
        // Both ready — send match start to each player with their perspective
        const p1Socket = io.sockets.sockets.get(match.player1.socketId);
        const p2Socket = io.sockets.sockets.get(match.player2.socketId);

        p1Socket?.emit('pvp:match-start', {
          yourTeam: match.combat.sideA,
          opponentTeam: match.combat.sideB,
          opponentName: match.player2.username
        });
        p2Socket?.emit('pvp:match-start', {
          yourTeam: match.combat.sideB,
          opponentTeam: match.combat.sideA,
          opponentName: match.player1.username
        });
      } else {
        // Notify opponent that this player is ready
        const otherKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherSocket = match[otherKey]?.socketId;
        if (otherSocket) {
          io.to(otherSocket).emit('pvp:opponent-ready');
        }
      }
    });

    socket.on('pvp:submit-moves', ({ moveChoices }) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const result = mm.submitMoves(found.code, socket.userId, moveChoices);
      if (!result) {
        // Notify opponent that this player submitted (without revealing moves)
        const match = mm.getMatch(found.code);
        const otherKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherSocket = match[otherKey]?.socketId;
        if (otherSocket) {
          io.to(otherSocket).emit('pvp:opponent-submitted');
        }
        return;
      }

      // Round resolved — send results to both players
      const match = mm.getMatch(found.code);
      const p1Socket = io.sockets.sockets.get(match.player1.socketId);
      const p2Socket = io.sockets.sockets.get(match.player2.socketId);

      // Each player gets their perspective (their side = allies, other = enemies)
      p1Socket?.emit('pvp:round-result', {
        attacks: result.attacks,
        effectEvents: result.effectEvents,
        koSwaps: result.koSwaps,
        mpRegens: result.mpRegens,
        allies: match.combat.sideA,
        enemies: match.combat.sideB,
        round: match.combat.round
      });
      p2Socket?.emit('pvp:round-result', {
        attacks: result.attacks,
        effectEvents: result.effectEvents,
        koSwaps: result.koSwaps,
        mpRegens: result.mpRegens,
        allies: match.combat.sideB,
        enemies: match.combat.sideA,
        round: match.combat.round
      });

      if (result.winner) {
        io.to(found.code).emit('pvp:match-end', {
          winnerId: match.winnerId,
          winnerName: match.winnerName
        });
      }
    });

    socket.on('pvp:request-rematch', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;
      const result = mm.requestRematch(found.code, socket.userId);
      if (result === 'rematch') {
        io.to(found.code).emit('pvp:rematch-start');
      } else if (result === 'waiting') {
        const match = mm.getMatch(found.code);
        const otherKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherSocket = match[otherKey]?.socketId;
        if (otherSocket) {
          io.to(otherSocket).emit('pvp:opponent-wants-rematch');
        }
      }
    });

    socket.on('pvp:leave-match', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;
      const otherPlayer = mm.leaveMatch(found.code, socket.userId);
      if (otherPlayer) {
        io.to(otherPlayer.socketId).emit('pvp:rematch-cancelled');
      }
      socket.leave(found.code);
    });

    socket.on('pvp:reconnect', ({ matchCode }) => {
      const match = mm.reconnect(matchCode, socket.userId, socket.id);
      if (match) {
        socket.join(matchCode);
        socket.emit('pvp:reconnected', { currentState: match });
        // Notify opponent
        const otherKey = match.player1?.userId === socket.userId ? 'player2' : 'player1';
        const otherSocket = match[otherKey]?.socketId;
        if (otherSocket) {
          io.to(otherSocket).emit('pvp:opponent-reconnected');
        }
      } else {
        socket.emit('pvp:error', { message: 'Match not found' });
      }
    });

    socket.on('disconnect', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      // Start 30-second disconnect timer
      const timer = setTimeout(() => {
        const match = mm.getMatch(found.code);
        if (!match) return;
        // Forfeit: other player wins
        const otherKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherSocket = match[otherKey]?.socketId;
        if (otherSocket) {
          io.to(otherSocket).emit('pvp:opponent-disconnected');
        }
        mm.leaveMatch(found.code, socket.userId);
        disconnectTimers.delete(socket.userId);
      }, DISCONNECT_TIMEOUT_MS);

      disconnectTimers.set(socket.userId, { timeout: timer, matchCode: found.code });
    });
  });

  return { mm, io };
}
```

- [ ] **Step 2: Wire socket handler into server.js**

In `server.js`, after the Socket.IO server creation (added in Task 1), add:

```js
import { setupPvpSockets } from './src/pvp/socket-handler.js';
```

And after the `io` creation:

```js
setupPvpSockets(io);
```

- [ ] **Step 3: Verify server starts**

```bash
node --check server.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add src/pvp/socket-handler.js server.js
git commit -m "feat: Socket.IO event handler with JWT auth and match lifecycle"
```

---

## Task 6: Team Saving — Backend

Add PvP team slots to meta-progression and REST endpoints for save/load.

**Files:**
- Modify: `src/game/state.js:39-82` (add `pvpTeams` to meta)
- Create: `src/routes/game/pvp.js`
- Modify: `src/routes/game/index.js` (mount PvP routes)
- Create: `tests/unit/routes/pvp.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routes/pvp.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock GameManager with meta that has pvpTeams
function makeGameManager() {
  return {
    meta: { pvpTeams: [null, null, null] },
    run: {
      creatureParty: {
        active: [{
          id: 'c1', name: 'テスト', nameEn: 'Test', element: 'neutral', level: 5,
          hp: 80, maxHp: 100, mp: 10, maxMp: 20, attack: 15, defense: 5,
          baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
          activeEffects: [{ type: 'poison', remainingTurns: 2 }],
          moves: [{ id: 'slash', name: '斬る', nameEn: 'Slash' }]
        }],
        reserves: []
      },
      partySkills: [{ id: 'battleRhythm' }],
      itemBuffs: { attackMult: 1.2 }
    }
  };
}

describe('PvP team saving', () => {
  it('savePvpTeam snapshots team with full HP/MP and no effects', async () => {
    // Inline test of the save logic
    const { savePvpTeam } = await import('../../../src/routes/game/pvp.js');
    const gm = makeGameManager();
    const result = savePvpTeam(gm, 0);

    assert.ok(result);
    assert.equal(gm.meta.pvpTeams[0].creatureParty.active[0].hp, 100, 'HP should be max');
    assert.equal(gm.meta.pvpTeams[0].creatureParty.active[0].mp, 20, 'MP should be max');
    assert.deepEqual(gm.meta.pvpTeams[0].creatureParty.active[0].activeEffects, [], 'Effects cleared');
    assert.deepEqual(gm.meta.pvpTeams[0].partySkills, [{ id: 'battleRhythm' }]);
    assert.ok(gm.meta.pvpTeams[0].savedAt);
  });

  it('rejects invalid slot index', async () => {
    const { savePvpTeam } = await import('../../../src/routes/game/pvp.js');
    const gm = makeGameManager();
    const result = savePvpTeam(gm, 5);
    assert.equal(result, false);
  });

  it('rejects when no active run', async () => {
    const { savePvpTeam } = await import('../../../src/routes/game/pvp.js');
    const gm = makeGameManager();
    gm.run = null;
    const result = savePvpTeam(gm, 0);
    assert.equal(result, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/routes/pvp.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Add pvpTeams to meta-progression**

In `src/game/state.js`, inside `createMetaProgression()`, add after `kanaMode: false`:

```js
    pvpTeams: [null, null, null]  // 3 saved PvP team slots
```

- [ ] **Step 4: Implement pvp.js routes**

Create `src/routes/game/pvp.js`:

```js
import { Router } from 'express';

/**
 * Save the current run's team to a PvP slot.
 * Deep-clones, restores full HP/MP, clears effects.
 *
 * @param {object} gm - GameManager instance
 * @param {number} slotIndex - 0, 1, or 2
 * @returns {boolean} success
 */
export function savePvpTeam(gm, slotIndex) {
  if (slotIndex < 0 || slotIndex > 2) return false;
  if (!gm.run?.creatureParty) return false;

  // Ensure pvpTeams exists on meta
  if (!gm.meta.pvpTeams) gm.meta.pvpTeams = [null, null, null];

  // Deep clone the team snapshot
  const snapshot = JSON.parse(JSON.stringify({
    creatureParty: gm.run.creatureParty,
    partySkills: gm.run.partySkills || [],
    itemBuffs: gm.run.itemBuffs || {}
  }));

  // Restore full HP/MP and clear effects on all creatures
  const allCreatures = [
    ...(snapshot.creatureParty.active || []),
    ...(snapshot.creatureParty.reserves || [])
  ];
  for (const c of allCreatures) {
    if (!c) continue;
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    c.activeEffects = [];
  }

  snapshot.savedAt = Date.now();
  gm.meta.pvpTeams[slotIndex] = snapshot;
  return true;
}

export function createPvpRoutes() {
  const router = Router();

  // Save current run team to a PvP slot
  router.post('/save-pvp-team', (req, res) => {
    const { slotIndex } = req.body;
    const gm = req.gameManager;

    if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex > 2) {
      return res.status(400).json({ error: 'Invalid slot index (0-2)' });
    }

    const saved = savePvpTeam(gm, slotIndex);
    if (!saved) {
      return res.status(400).json({ error: 'No active run to save' });
    }

    req.saveGame();
    res.json({ ok: true, pvpTeams: gm.meta.pvpTeams });
  });

  // Get all PvP team slots
  router.get('/pvp-teams', (req, res) => {
    const gm = req.gameManager;
    const pvpTeams = gm.meta?.pvpTeams || [null, null, null];
    res.json({ pvpTeams });
  });

  return router;
}
```

- [ ] **Step 5: Mount PvP routes**

In `src/routes/game/index.js`, import and mount the PvP routes alongside existing routes:

```js
import { createPvpRoutes } from './pvp.js';
```

Inside the router setup function, add:

```js
router.use('/pvp', createPvpRoutes());
```

This makes the endpoints available at `/api/game/pvp/save-pvp-team` and `/api/game/pvp/pvp-teams`.

- [ ] **Step 6: Run tests**

```bash
node --test tests/unit/routes/pvp.test.js
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/state.js src/routes/game/pvp.js src/routes/game/index.js tests/unit/routes/pvp.test.js
git commit -m "feat: PvP team saving with REST endpoints"
```

---

## Task 7: Frontend API Functions

Add API helper functions for PvP team saving.

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: Add PvP API functions**

In `public/js/api.js`, add near the other export functions:

```js
export async function savePvpTeam(slotIndex) {
  return apiCall('/pvp/save-pvp-team', 'POST', { slotIndex });
}

export async function getPvpTeams() {
  return apiCall('/pvp/pvp-teams', 'GET');
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/api.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: frontend API functions for PvP team saving"
```

---

## Task 8: Run Complete UI — Save Team Button

Add the optional "Save Team for PvP" button to the run complete screen.

**Files:**
- Modify: `public/js/ui/exploration.js:479-489`

- [ ] **Step 1: Update renderRunComplete()**

In `public/js/ui/exploration.js`, replace the `renderRunComplete()` function (lines 479-489):

```js
export function renderRunComplete() {
  const gameState = getGameState();

  actions.setContent(`
    <p style="text-align:center;color:var(--accent-primary);margin-bottom:0.5rem">
      ゲームクリア！おめでとう！
    </p>
    <div style="display:flex;flex-direction:column;gap:12px;max-width:340px;margin:0 auto">
      <button class="action-btn action-btn-primary" id="victory-hub-btn">ハブに戻る</button>
      <button class="action-btn action-btn-secondary" id="save-pvp-team-btn">Save Team for PvP</button>
    </div>
  `);

  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    apiReturnToHub();
  });

  document.getElementById('save-pvp-team-btn')?.addEventListener('click', async () => {
    playSFX('button-tap');
    await showPvpTeamSaveSlots();
  });
}
```

- [ ] **Step 2: Add the team save slot picker**

In the same file, add the `showPvpTeamSaveSlots` function. Import `savePvpTeam`, `getPvpTeams` from `../api.js` at the top of the file.

```js
async function showPvpTeamSaveSlots() {
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];

  const slotsHtml = teams.map((team, i) => {
    const label = team
      ? team.creatureParty.active.map(c => c?.nameEn || '?').join(', ')
      : 'Empty';
    const levelInfo = team
      ? `Lv ${team.creatureParty.active.map(c => c?.level || '?').join('/')}`
      : '';
    return `
      <button class="action-btn action-btn-secondary pvp-save-slot" data-slot="${i}" style="text-align:left">
        <div><strong>Team ${i + 1}</strong> ${levelInfo}</div>
        <div style="font-size:0.85em;color:var(--text-secondary)">${label}</div>
      </button>
    `;
  }).join('');

  actions.setContent(`
    <p style="text-align:center;color:var(--text-secondary);margin-bottom:0.5rem">
      Select a slot to save your team
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;max-width:340px;margin:0 auto">
      ${slotsHtml}
      <button class="action-btn action-btn-tertiary" id="pvp-save-cancel">Cancel</button>
    </div>
  `);

  document.querySelectorAll('.pvp-save-slot').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slot = parseInt(btn.dataset.slot);
      const existing = teams[slot];
      if (existing) {
        if (!confirm(`Overwrite Team ${slot + 1}?`)) return;
      }
      playSFX('button-tap');
      await savePvpTeam(slot);
      // Return to run complete screen after saving
      renderRunComplete();
    });
  });

  document.getElementById('pvp-save-cancel')?.addEventListener('click', () => {
    renderRunComplete();
  });
}
```

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: Save Team for PvP button on run complete screen"
```

---

## Task 9: Hub UI — Multiplayer Battle Button

Add the "Multiplayer Battle" button to the hub, disabled if no saved teams.

**Files:**
- Modify: `public/js/ui/exploration.js:330-362`

- [ ] **Step 1: Update renderHub()**

In `public/js/ui/exploration.js`, modify the `renderHub()` function. The existing hub renders 3 buttons (Speed Review, Upgrades, Infiltrate). Add a 4th button between Upgrades and Infiltrate.

Find the button container HTML in `renderHub()` and add the Multiplayer Battle button:

```js
<button class="action-btn action-btn-secondary" id="pvp-btn" ${hasPvpTeams ? '' : 'disabled'}>
  ⚔️ Multiplayer Battle
</button>
```

Before the HTML rendering, compute whether the user has any saved PvP teams:

```js
const pvpTeams = gameState.meta?.pvpTeams || [null, null, null];
const hasPvpTeams = pvpTeams.some(t => t !== null);
```

Add the click handler after existing button handlers:

```js
document.getElementById('pvp-btn')?.addEventListener('click', () => {
  playSFX('button-tap');
  // Will be wired to PvP lobby in Task 11
  import('../pvp-socket.js').then(pvp => pvp.enterLobby());
});
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: Multiplayer Battle button on hub screen"
```

---

## Task 10: Socket.IO Client

Frontend Socket.IO connection management.

**Files:**
- Create: `public/js/pvp-socket.js`

- [ ] **Step 1: Create pvp-socket.js**

```js
import { io } from 'socket.io-client';

let socket = null;
let currentMatchCode = null;

/** Event callback registry — set by UI modules. */
const handlers = {};

export function on(event, fn) { handlers[event] = fn; }
export function off(event) { delete handlers[event]; }
export function getMatchCode() { return currentMatchCode; }

/** Connect to PvP socket server with JWT auth. */
export function connect() {
  if (socket?.connected) return;

  const token = localStorage.getItem('authToken');
  if (!token) return;

  socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  // Route all pvp: events to registered handlers
  const events = [
    'pvp:match-created', 'pvp:match-joined', 'pvp:opponent-joined',
    'pvp:opponent-ready', 'pvp:match-start',
    'pvp:opponent-submitted', 'pvp:round-result', 'pvp:match-end',
    'pvp:opponent-wants-rematch', 'pvp:rematch-start', 'pvp:rematch-cancelled',
    'pvp:opponent-disconnected', 'pvp:opponent-reconnected', 'pvp:reconnected',
    'pvp:error'
  ];

  for (const event of events) {
    socket.on(event, (data) => {
      handlers[event]?.(data);
    });
  }

  socket.on('connect_error', (err) => {
    console.error('[PvP] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[PvP] Disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server forced disconnect — don't auto-reconnect
      socket.connect();
    }
  });
}

/** Disconnect from PvP socket. */
export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentMatchCode = null;
}

/** Emit: create a new match. */
export function createMatch() {
  socket?.emit('pvp:create-match');
}

/** Emit: join an existing match. */
export function joinMatch(code) {
  currentMatchCode = code;
  socket?.emit('pvp:join-match', { code });
}

/** Emit: select team and send team data. */
export function selectTeam(slotIndex, teamData) {
  socket?.emit('pvp:select-team', { slotIndex, teamData });
}

/** Emit: ready up. */
export function ready() {
  socket?.emit('pvp:ready');
}

/** Emit: submit move choices. */
export function submitMoves(moveChoices) {
  socket?.emit('pvp:submit-moves', { moveChoices });
}

/** Emit: request rematch. */
export function requestRematch() {
  socket?.emit('pvp:request-rematch');
}

/** Emit: leave match. */
export function leaveMatch() {
  socket?.emit('pvp:leave-match');
  currentMatchCode = null;
}

/** Emit: reconnect to a match. */
export function reconnect(matchCode) {
  socket?.emit('pvp:reconnect', { matchCode });
}

/** Enter the PvP lobby — connects socket and triggers lobby UI. */
export function enterLobby() {
  connect();
  handlers['pvp:enter-lobby']?.();
}

// Store match code when we create/join
on('pvp:match-created', ({ code }) => { currentMatchCode = code; });
```

- [ ] **Step 2: Syntax check**

```bash
node --check public/js/pvp-socket.js && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add public/js/pvp-socket.js
git commit -m "feat: Socket.IO client for PvP multiplayer"
```

---

## Task 11: PvP Lobby UI

Create/join match screen, team selection, and ready-up.

**Files:**
- Create: `public/js/ui/pvp-lobby.js`
- Modify: `public/game.js` (add PvP phase cases)

- [ ] **Step 1: Create pvp-lobby.js**

```js
import * as pvpSocket from '../pvp-socket.js';
import * as actions from './actions.js';
import { getGameState, updateGameState } from '../../game.js';
import { getPvpTeams } from '../api.js';
import { playSFX } from '../audio.js';

/** Render the PvP lobby — create or join a match. */
export function renderLobby() {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:12px;max-width:340px;margin:0 auto;padding:1rem 0">
      <p style="text-align:center;color:var(--text-primary);font-weight:600;font-size:1.1em">
        Multiplayer Battle
      </p>
      <button class="action-btn action-btn-primary" id="pvp-create-btn">Create Match</button>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="pvp-code-input" maxlength="4" placeholder="Code"
          style="flex:1;padding:12px;border-radius:var(--card-radius);border:1px solid var(--text-muted);
          font-size:1.2em;text-align:center;text-transform:uppercase;font-family:inherit;
          background:var(--bg-elevated);color:var(--text-primary)" />
        <button class="action-btn action-btn-secondary" id="pvp-join-btn" style="flex:1">Join Match</button>
      </div>
      <button class="action-btn action-btn-tertiary" id="pvp-back-btn">Back</button>
    </div>
  `);

  document.getElementById('pvp-create-btn').addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.createMatch();
  });

  document.getElementById('pvp-join-btn').addEventListener('click', () => {
    playSFX('button-tap');
    const code = document.getElementById('pvp-code-input').value.toUpperCase().trim();
    if (code.length !== 4) return;
    pvpSocket.joinMatch(code);
  });

  document.getElementById('pvp-back-btn').addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.disconnect();
    updateGameState({ ...getGameState(), phase: 'hub' });
  });

  // Socket event handlers
  pvpSocket.on('pvp:match-created', ({ code }) => {
    renderWaitingForOpponent(code);
  });

  pvpSocket.on('pvp:match-joined', () => {
    // We joined someone else's match — wait for opponent-joined
  });

  pvpSocket.on('pvp:opponent-joined', () => {
    renderTeamSelect();
  });

  pvpSocket.on('pvp:error', ({ message }) => {
    alert(message);
  });
}

/** Show waiting screen with match code. */
function renderWaitingForOpponent(code) {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:2rem 0">
      <p style="color:var(--text-secondary)">Share this code with your opponent:</p>
      <div style="font-size:2.5em;font-weight:700;letter-spacing:0.3em;color:var(--accent-cyan);
        background:var(--bg-elevated);padding:16px 32px;border-radius:var(--card-radius)">
        ${code}
      </div>
      <p style="color:var(--text-muted);font-size:0.9em">Waiting for opponent...</p>
      <button class="action-btn action-btn-tertiary" id="pvp-cancel-btn">Cancel</button>
    </div>
  `);

  document.getElementById('pvp-cancel-btn').addEventListener('click', () => {
    pvpSocket.leaveMatch();
    pvpSocket.disconnect();
    updateGameState({ ...getGameState(), phase: 'hub' });
  });
}

/** Render team selection screen. */
export async function renderTeamSelect() {
  const result = await getPvpTeams();
  const teams = result?.pvpTeams || [null, null, null];

  let selectedSlot = null;

  const slotsHtml = teams.map((team, i) => {
    if (!team) {
      return `<div class="action-btn" style="opacity:0.4;pointer-events:none;text-align:left">
        <div><strong>Team ${i + 1}</strong></div>
        <div style="font-size:0.85em;color:var(--text-muted)">Empty</div>
      </div>`;
    }
    const names = team.creatureParty.active.map(c => c?.nameEn || '?').join(', ');
    const levels = team.creatureParty.active.map(c => c?.level || '?').join('/');
    return `
      <button class="action-btn action-btn-secondary pvp-team-slot" data-slot="${i}" style="text-align:left">
        <div><strong>Team ${i + 1}</strong> — Lv ${levels}</div>
        <div style="font-size:0.85em;color:var(--text-secondary)">${names}</div>
      </button>
    `;
  }).join('');

  actions.setContent(`
    <div style="display:flex;flex-direction:column;gap:8px;max-width:340px;margin:0 auto;padding:1rem 0">
      <p style="text-align:center;color:var(--text-primary);font-weight:600">Select Your Team</p>
      ${slotsHtml}
      <button class="action-btn action-btn-primary" id="pvp-ready-btn" disabled>Ready</button>
      <p id="pvp-opponent-status" style="text-align:center;color:var(--text-muted);font-size:0.85em"></p>
    </div>
  `);

  document.querySelectorAll('.pvp-team-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      // Clear previous selection
      document.querySelectorAll('.pvp-team-slot').forEach(b => b.style.border = '');
      btn.style.border = '2px solid var(--accent-cyan)';
      selectedSlot = parseInt(btn.dataset.slot);
      document.getElementById('pvp-ready-btn').disabled = false;
    });
  });

  document.getElementById('pvp-ready-btn').addEventListener('click', () => {
    if (selectedSlot === null) return;
    playSFX('button-tap');
    const teamData = teams[selectedSlot];
    pvpSocket.selectTeam(selectedSlot, teamData);
    pvpSocket.ready();
    document.getElementById('pvp-ready-btn').disabled = true;
    document.getElementById('pvp-ready-btn').textContent = 'Waiting...';
  });

  pvpSocket.on('pvp:opponent-ready', () => {
    const status = document.getElementById('pvp-opponent-status');
    if (status) status.textContent = 'Opponent is ready!';
  });
}

// Export for game.js phase switch
export { renderLobby as renderPvpLobby, renderTeamSelect as renderPvpTeamSelect };
```

- [ ] **Step 2: Add PvP phases to game.js**

In `public/game.js`, import the PvP lobby module at the top:

```js
import { renderPvpLobby, renderPvpTeamSelect } from './js/ui/pvp-lobby.js';
```

In the `updateGameContent()` switch statement, add cases:

```js
    case 'pvp_lobby':
      renderPvpLobby();
      break;
    case 'pvp_team_select':
      renderPvpTeamSelect();
      break;
```

- [ ] **Step 3: Wire the hub button to PvP lobby**

In `public/js/ui/exploration.js`, update the hub button handler to set the phase:

```js
document.getElementById('pvp-btn')?.addEventListener('click', () => {
  playSFX('button-tap');
  updateGameState({ ...getGameState(), phase: 'pvp_lobby' });
  updateUI();
});
```

Import `updateGameState` and `updateUI` from `../../game.js` and `getGameState` from the store if not already imported.

- [ ] **Step 4: Syntax check all modified files**

```bash
node --check public/js/ui/pvp-lobby.js && echo "OK"
node --check public/game.js && echo "OK"
node --check public/js/ui/exploration.js && echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/pvp-lobby.js public/game.js public/js/ui/exploration.js
git commit -m "feat: PvP lobby UI with create/join match and team selection"
```

---

## Task 12: PvP Battle UI

Move selection, round result display, end screen with rematch.

**Files:**
- Create: `public/js/ui/pvp-battle.js`
- Modify: `public/game.js` (add pvp_battle and pvp_result phase cases)

- [ ] **Step 1: Create pvp-battle.js**

```js
import * as pvpSocket from '../pvp-socket.js';
import * as actions from './actions.js';
import * as scene from './scene.js';
import { buildSplitAttackCard, insertAttackCard } from './combat-loop.js';
import { playSFX } from '../audio.js';
import { getGameState, updateGameState, updateUI } from '../../game.js';

let pvpState = null;

/**
 * Initialize PvP battle.
 * Called when pvp:match-start is received.
 * @param {{ yourTeam, opponentTeam, opponentName }} data
 */
export function startPvpBattle(data) {
  pvpState = {
    allies: data.yourTeam,
    enemies: data.opponentTeam,
    opponentName: data.opponentName,
    round: 1,
    waitingForOpponent: false
  };

  // Set arena background
  scene.setBackground('/assets/backgrounds/pvp-arena.webp');

  // Show formations
  scene.showFormation('player', pvpState.allies);
  scene.showFormation('enemy', pvpState.enemies);

  // Show move selection
  renderMoveSelection();

  // Register socket handlers
  pvpSocket.on('pvp:opponent-submitted', () => {
    const status = document.getElementById('pvp-wait-status');
    if (status) status.textContent = 'Opponent has submitted!';
  });

  pvpSocket.on('pvp:round-result', (result) => {
    handleRoundResult(result);
  });

  pvpSocket.on('pvp:match-end', ({ winnerId, winnerName }) => {
    renderResult(winnerName);
  });

  pvpSocket.on('pvp:opponent-disconnected', () => {
    renderResult('You (opponent disconnected)');
  });
}

/** Render move selection UI for all active ally creatures. */
function renderMoveSelection() {
  const allies = pvpState.allies.filter(c => c && c.hp > 0);
  if (allies.length === 0) return;

  const moveChoices = [];
  let currentCreatureIdx = 0;

  function showCreatureMoves(idx) {
    const creature = pvpState.allies[idx];
    if (!creature || creature.hp <= 0) {
      // Skip KO'd creatures
      if (idx + 1 < pvpState.allies.length) {
        showCreatureMoves(idx + 1);
      } else {
        submitAllMoves();
      }
      return;
    }

    const movesHtml = creature.moves.map(move => {
      const canAfford = (creature.mp || 0) >= (move.mpCost || 0);
      return `
        <button class="action-btn action-btn-secondary pvp-move-btn"
          data-move-id="${move.id}" ${canAfford ? '' : 'disabled'}
          style="text-align:left">
          <div><strong>${move.nameEn}</strong> <span style="color:var(--text-muted)">${move.name}</span></div>
          <div style="font-size:0.8em;color:var(--text-secondary)">
            ${move.element} · ${move.category} · Power ${move.power} · MP ${move.mpCost}
          </div>
        </button>
      `;
    }).join('');

    actions.setContent(`
      <div style="max-width:340px;margin:0 auto;padding:0.5rem 0">
        <p style="text-align:center;color:var(--text-primary);font-weight:600;margin-bottom:8px">
          ${creature.nameEn}'s Move (${idx + 1}/${pvpState.allies.filter(c => c?.hp > 0).length})
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${movesHtml}
        </div>
      </div>
    `);

    document.querySelectorAll('.pvp-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSFX('button-tap');
        const moveId = btn.dataset.moveId;

        // For single-target moves, pick target
        const move = creature.moves.find(m => m.id === moveId);
        if (move && (move.target === 'single_enemy' || move.target === 'single_ally')) {
          showTargetSelection(idx, moveId, move.target);
        } else {
          // All-target or self-target: auto-target index 0
          moveChoices.push({ creatureIndex: idx, moveId, targetIndex: 0 });
          const nextIdx = findNextAlive(idx + 1);
          if (nextIdx !== null) {
            showCreatureMoves(nextIdx);
          } else {
            submitAllMoves();
          }
        }
      });
    });
  }

  function showTargetSelection(creatureIdx, moveId, targetType) {
    const targets = targetType === 'single_enemy' ? pvpState.enemies : pvpState.allies;
    const targetLabel = targetType === 'single_enemy' ? 'enemy' : 'ally';

    const targetsHtml = targets.map((t, i) => {
      if (!t || t.hp <= 0) return '';
      return `
        <button class="action-btn action-btn-secondary pvp-target-btn" data-target="${i}">
          ${t.nameEn} (HP: ${t.hp}/${t.maxHp})
        </button>
      `;
    }).join('');

    actions.setContent(`
      <div style="max-width:340px;margin:0 auto;padding:0.5rem 0">
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:8px">
          Select ${targetLabel} target
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${targetsHtml}
        </div>
      </div>
    `);

    document.querySelectorAll('.pvp-target-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSFX('button-tap');
        const targetIndex = parseInt(btn.dataset.target);
        moveChoices.push({ creatureIndex: creatureIdx, moveId, targetIndex });
        const nextIdx = findNextAlive(creatureIdx + 1);
        if (nextIdx !== null) {
          showCreatureMoves(nextIdx);
        } else {
          submitAllMoves();
        }
      });
    });
  }

  function findNextAlive(startIdx) {
    for (let i = startIdx; i < pvpState.allies.length; i++) {
      if (pvpState.allies[i] && pvpState.allies[i].hp > 0) return i;
    }
    return null;
  }

  function submitAllMoves() {
    pvpSocket.submitMoves(moveChoices);
    pvpState.waitingForOpponent = true;
    actions.setContent(`
      <div style="text-align:center;padding:2rem 0">
        <p style="color:var(--text-secondary)">Moves submitted!</p>
        <p id="pvp-wait-status" style="color:var(--text-muted);font-size:0.9em">Waiting for opponent...</p>
      </div>
    `);
  }

  // Start with first alive creature
  const firstAlive = findNextAlive(0);
  if (firstAlive !== null) {
    showCreatureMoves(firstAlive);
  }
}

/** Handle round result — animate attacks, update state, then show next move selection or end. */
async function handleRoundResult(result) {
  // Update local creature state
  pvpState.allies = result.allies;
  pvpState.enemies = result.enemies;
  pvpState.round = result.round;
  pvpState.waitingForOpponent = false;

  // Update formations with new HP
  scene.showFormation('player', pvpState.allies);
  scene.showFormation('enemy', pvpState.enemies);

  // Display attacks sequentially
  for (const atk of result.attacks) {
    await displayAttack(atk);
  }

  // If no winner, show next round's move selection
  // (pvp:match-end handler will fire separately if there's a winner)
  if (!result.winner) {
    renderMoveSelection();
  }
}

/** Display a single attack with a brief pause. */
function displayAttack(atk) {
  return new Promise(resolve => {
    const card = insertAttackCard(atk, false);
    if (atk.damage > 0) playSFX('attack');
    if (atk.healAmount > 0) playSFX('heal');
    setTimeout(resolve, 1200);
  });
}

/** Render the match result screen. */
function renderResult(winnerName) {
  actions.setContent(`
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:2rem 0;max-width:340px;margin:0 auto">
      <p style="font-size:1.3em;font-weight:700;color:var(--accent-cyan)">
        ${winnerName} wins!
      </p>
      <button class="action-btn action-btn-primary" id="pvp-rematch-btn">Rematch</button>
      <button class="action-btn action-btn-secondary" id="pvp-return-hub-btn">Return to Hub</button>
      <p id="pvp-rematch-status" style="color:var(--text-muted);font-size:0.85em"></p>
    </div>
  `);

  document.getElementById('pvp-rematch-btn').addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.requestRematch();
    document.getElementById('pvp-rematch-btn').disabled = true;
    document.getElementById('pvp-rematch-btn').textContent = 'Waiting...';
    document.getElementById('pvp-rematch-status').textContent = 'Waiting for opponent...';
  });

  document.getElementById('pvp-return-hub-btn').addEventListener('click', () => {
    playSFX('button-tap');
    pvpSocket.leaveMatch();
    pvpSocket.disconnect();
    updateGameState({ ...getGameState(), phase: 'hub' });
    updateUI();
  });

  pvpSocket.on('pvp:opponent-wants-rematch', () => {
    document.getElementById('pvp-rematch-status').textContent = 'Opponent wants a rematch!';
  });

  pvpSocket.on('pvp:rematch-start', () => {
    // Go back to team selection
    import('./pvp-lobby.js').then(m => m.renderPvpTeamSelect());
  });

  pvpSocket.on('pvp:rematch-cancelled', () => {
    document.getElementById('pvp-rematch-status').textContent = 'Opponent left.';
    setTimeout(() => {
      pvpSocket.disconnect();
      updateGameState({ ...getGameState(), phase: 'hub' });
      updateUI();
    }, 2000);
  });
}

export { startPvpBattle, renderMoveSelection, renderResult };
```

- [ ] **Step 2: Wire match-start event to battle UI**

In `public/js/ui/pvp-lobby.js`, add the match-start handler. Import `startPvpBattle` from `./pvp-battle.js` and register:

```js
pvpSocket.on('pvp:match-start', (data) => {
  startPvpBattle(data);
});
```

- [ ] **Step 3: Syntax check**

```bash
node --check public/js/ui/pvp-battle.js && echo "OK"
node --check public/js/ui/pvp-lobby.js && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/pvp-battle.js public/js/ui/pvp-lobby.js
git commit -m "feat: PvP battle UI with move selection, round display, and rematch"
```

---

## Task 13: Phase Machine Updates

Add PvP phases so the phase machine recognizes them.

**Files:**
- Modify: `src/game/phase-machine.js`

- [ ] **Step 1: Add PvP phase constants**

In `src/game/phase-machine.js`, add to the `PHASES` object (after existing entries around line 46):

```js
  PVP_LOBBY: 'pvp_lobby',
  PVP_TEAM_SELECT: 'pvp_team_select',
  PVP_BATTLE: 'pvp_battle',
  PVP_RESULT: 'pvp_result',
```

- [ ] **Step 2: Add valid transitions**

In `VALID_TRANSITIONS`, add:

```js
  [PHASES.HUB]: [...existingTransitions, PHASES.PVP_LOBBY],
  [PHASES.PVP_LOBBY]: [PHASES.PVP_TEAM_SELECT, PHASES.HUB],
  [PHASES.PVP_TEAM_SELECT]: [PHASES.PVP_BATTLE, PHASES.HUB],
  [PHASES.PVP_BATTLE]: [PHASES.PVP_RESULT, PHASES.HUB],
  [PHASES.PVP_RESULT]: [PHASES.PVP_TEAM_SELECT, PHASES.HUB],
```

Note: PvP phases are managed client-side (set directly via `updateGameState`), not derived by `derivePhase()`. The phase machine just needs to recognize them as valid.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: All existing tests pass. PvP phases don't affect `derivePhase()` logic.

- [ ] **Step 4: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat: add PvP phases to phase machine"
```

---

## Task 14: Arena Background Generation

Generate 10 PvP arena background concepts via ComfyUI.

**Files:**
- Create: `public/assets/backgrounds/pvp-arena.webp` (final chosen image)

- [ ] **Step 1: Generate 10 arena concepts**

Use the ComfyUI API at `http://127.0.0.1:8188` to generate 10 radically different arena backgrounds:

Prompt style: `"fantasy battle arena, [unique theme], bright colors, game background, wide angle, no characters, light sci-fi touches"`.

Themes to try:
1. Crystal colosseum floating in clouds
2. Ancient forest clearing with glowing runes
3. Volcanic crater with lava rivers
4. Frozen lake arena surrounded by ice pillars
5. Moonlit rooftop garden in a fantasy city
6. Underwater dome with coral and bioluminescence
7. Desert canyon with sandstone pillars
8. Floating island chain connected by energy bridges
9. Cherry blossom courtyard with stone walls
10. Storm-lit mountain peak arena

Generate at 1024x576 (16:9 landscape) to match existing background aspect ratios.

- [ ] **Step 2: Present all 10 to user for selection**

Serve the images via the Express static server or a temporary HTTP server. Show all 10 in the Playwright browser for user to compare.

- [ ] **Step 3: Save chosen background**

Convert the selected image to `.webp` and save as `public/assets/backgrounds/pvp-arena.webp`.

- [ ] **Step 4: Commit**

```bash
git add public/assets/backgrounds/pvp-arena.webp
git commit -m "feat: add PvP arena background"
```

---

## Task 15: Integration Test — Full PvP Flow

End-to-end test of the complete PvP flow.

**Files:**
- Create: `tests/integration/pvp/flow.test.js`

- [ ] **Step 1: Write integration test**

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MatchManager } from '../../../src/pvp/match-manager.js';

function makeTeam() {
  return {
    creatureParty: {
      active: [{
        id: 'c1', name: 'テスト', nameEn: 'TestA', element: 'fire', level: 5,
        hp: 100, maxHp: 100, mp: 20, maxMp: 20, attack: 15, defense: 5,
        baseWord: '火', baseReading: 'ひ', baseMeaning: 'fire',
        activeEffects: [],
        moves: [{ id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
          element: 'fire', category: 'damage', power: 40,
          target: 'single_enemy', mpCost: 3, accuracy: 100,
          statusEffect: null, statusChance: 0, statusDuration: 0 }]
      }],
      reserves: []
    },
    partySkills: [],
    itemBuffs: {}
  };
}

describe('PvP full flow', () => {
  let mm;
  beforeEach(() => { mm = new MatchManager(); });

  it('runs a complete match from create to winner', () => {
    // 1. Create + join
    const code = mm.createMatch('user1', 's1');
    mm.joinMatch(code, 'user2', 's2');

    // 2. Team select + ready
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    const match = mm.getMatch(code);
    assert.equal(match.phase, 'battle');

    // 3. Play rounds until someone wins
    let result = null;
    let rounds = 0;
    const maxRounds = 50;
    while (rounds < maxRounds) {
      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      mm.submitMoves(code, 'user1', moves);
      result = mm.submitMoves(code, 'user2', moves);
      rounds++;
      if (result?.winner) break;
    }

    assert.ok(result?.winner, `Should have a winner within ${maxRounds} rounds`);
    assert.equal(match.phase, 'finished');
  });

  it('runs rematch flow after match', () => {
    const code = mm.createMatch('user1', 's1');
    mm.joinMatch(code, 'user2', 's2');
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    // Force finish
    const match = mm.getMatch(code);
    match.phase = 'finished';

    // Rematch
    mm.requestRematch(code, 'user1');
    const r = mm.requestRematch(code, 'user2');
    assert.equal(r, 'rematch');
    assert.equal(match.phase, 'team_select');
    assert.equal(match.player1.ready, false);
    assert.equal(match.player2.ready, false);
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
node --test tests/integration/pvp/flow.test.js
```

Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All existing + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/pvp/flow.test.js
git commit -m "test: PvP integration test for full match flow"
```

---

## Task 16: Final Wiring and Smoke Test

Connect all pieces and manually verify end-to-end.

- [ ] **Step 1: Ensure socket.io-client is available in frontend**

The Vite build will bundle `socket.io-client` from `node_modules` since `pvp-socket.js` imports it. Verify:

```bash
node -e "require.resolve('socket.io-client')" && echo "OK"
```

If not installed as a separate package, `socket.io` includes the client. If needed:

```bash
npm install socket.io-client
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

- [ ] **Step 3: Start dev server and verify socket connection**

```bash
npm run dev:server &
sleep 3
# Test socket.io is serving its client library
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/socket.io/socket.io.js
# Expected: 200
kill %1
```

- [ ] **Step 4: Playtest with browser**

If Playwright is available, test the full flow:
1. Open two browser tabs
2. Log in as two different users
3. Complete a run in each → save team
4. Create match in tab 1 → get code
5. Join match in tab 2 with code
6. Select teams and ready up
7. Pick moves and submit in both tabs
8. Verify round resolves and displays
9. Play until winner declared
10. Test rematch flow

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "feat: PvP multiplayer complete — end-to-end wiring"
```
