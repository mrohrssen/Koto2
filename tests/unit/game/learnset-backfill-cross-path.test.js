import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { instantiateCreature } from '../../../src/game/creatures.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { applyLocalDeferredKillXp } from '../../../public/js/ui/combat-local-prediction.js';
import { backfillPartyLearnset } from '../../../src/shared/combat/learnset-backfill.js';
import { buildLocalCombatFromStart } from '../../../src/shared/combat/local-combat-start.js';
import { resolvePveCursorTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';

/**
 * O2c — deterministic learnset backfill at combat end restores mid-run move
 * learning WITHOUT reintroducing the O2 transcript_mismatch.
 *
 * The O2 fix routed the explore-session deferred kill-XP through the browser-safe
 * applyKillXpToParty (no move learning) on both sides, killing the mid-fight
 * auto-learn. This restores it via a SHARED, DETERMINISTIC backfill applied at
 * combat end on BOTH the client (localStateAfterSessionPveTurn) and the server
 * (verifyCreatureCombatCycle / replayCombatCycleEntry), AFTER the terminal turn's
 * transcript hash is computed.
 *
 * The load-bearing case is an OFFLINE multi-fight chain: a client can finish
 * fight 1 and start fight 2 with no server round-trip in between. If only the
 * server backfilled, fight-2's turn-1 transcript (which embeds full ally objects
 * incl. `moves`) would diverge → transcript_mismatch. This test drives fight 1 to
 * a terminal VICTORY that levels `hi` L6→L7 (learning `okoru`), applies each
 * side's own combat-end backfill, then resolves fight-2 turn 1 on each side and
 * asserts the hashes agree AND both allies carry the backfilled move.
 *
 * hi's learnset: honoo@1, okoru@7. A level-6 hi crossing to 7 on the kill's
 * deferred XP exercises exactly the auto-learn threshold.
 */

const AREA_ID = 'hajimari-no-hiroba';
const LIVE_EPOCH = 'ese_3333333333333333';

const LETHAL_MOVE = Object.freeze({
  id: 'smash', name: '砕く', nameEn: 'Smash', reading: 'くだく',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 999, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});
const WEAK_MOVE = Object.freeze({
  id: 'tap', name: '触る', nameEn: 'Tap', reading: 'さわる',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 0, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

// A level-6 hi holding honoo (its L1 move) + a lethal test move, so exactly ONE
// slot is free and `okoru`@7 is the sole backfill candidate — mirroring a real
// starter that knows honoo and learns okoru at L7. Fixed uid so both sides share
// creature identity (the transcript hash covers uid; in the real flow both
// operate on the server's prepared party payload).
const HONOO_MOVE = Object.freeze({
  id: 'honoo', name: '炎', nameEn: 'Flame', reading: 'ほのお',
  meaning: 'flame / blaze', rank: 1600, element: 'fire', category: 'damage',
  target: 'single_enemy', power: 10, mpCost: 12,
  statusEffect: null, statusChance: 0, statusDuration: 0,
  tier: 1, description: 'Flame deals 10 fire damage to one enemy.', stage: 1, createdAt: '2026-03-20',
});
function levelSixHi() {
  const hi = instantiateCreature('hi');
  hi.level = 6;
  hi.xp = 0;
  hi.uid = 'xpath-hi-uid';
  hi.moves = [{ ...HONOO_MOVE }, { ...LETHAL_MOVE }];
  hi.hp = hi.maxHp;
  hi.mp = hi.maxMp;
  return hi;
}

// Two single-enemy combat rooms so fight 1 and fight 2 each resolve to a terminal
// victory on one lethal cycle. enemyLevel 3 → one kill's deferred XP crosses hi
// 6→7. High-HP, zero-power enemy so it never KOs the ally before the kill lands.
function makeGm() {
  const ally = levelSixHi();
  const run = {
    active: true,
    mode: 'standard',
    currentArea: { id: AREA_ID, nameEn: 'Starting Meadow', bossCreatureId: 'mizu' },
    areaPath: [AREA_ID],
    currentRoom: 0,
    roomActionSeq: 0,
    exploreSessionEpoch: LIVE_EPOCH,
    creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1, hpMult: 1, elementEdge: 0, flatDamageReduction: 0,
      xpMultiplier: 1, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: { itemsCollected: 0, creaturesBefriended: 0 },
    stats: { damageDealt: 0 },
    rooms: [
      createRoom(ROOM_TYPES.boss, AREA_ID, 1, 3),
      createRoom(ROOM_TYPES.boss, AREA_ID, 2, 3),
      createRoom(ROOM_TYPES.friendlyNpc, AREA_ID, 3, 3),
    ],
    bossesDefeated: [],
    currentAreaEncounters: 0,
  };
  run.rooms[0].boss = { creatureId: 'mizu', defeated: false };
  run.rooms[1].boss = { creatureId: 'mizu', defeated: false };

  const gm = {
    player: { name: 'XPath', credits: 0 },
    run,
    combat: null,
    meta: { creatureCollection: ['hi'], befriendCount: {}, actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
    userId: null,
    narrations: [],
    narrate(text) { this.narrations.push(text); },
    emitState() {},
    getState() {
      return {
        phase: this.combat?.active ? 'combat' : 'room',
        run: { currentRoom: run.currentRoom, roomActionSeq: run.roomActionSeq },
        combat: this.combat ? { active: this.combat.active } : null,
        room: run.rooms[run.currentRoom] || null,
      };
    },
    _onRunDefeat() {},
  };
  gm.explorationService = new ExplorationService(gm);
  gm.combatCycleService = new CombatCycleService(gm);
  gm.startCreatureEncounter = () => gm.combatCycleService.startCreatureEncounter();

  // Deterministic single-enemy roll: boss room so befriend never fires (isBoss).
  // Low HP so the power-999 lethal move one-shots it (terminal victory in one
  // cycle); zero-power enemy move so even a stray enemy action deals no damage.
  gm.combatCycleService._rollEncounterEnemies = () => {
    const enemy = instantiateCreature('mizu');
    enemy.moves = [{ ...WEAK_MOVE }];
    enemy.hp = enemy.maxHp = 10;
    enemy.mp = enemy.maxMp = 100;
    enemy.level = 3;
    return { enemies: [enemy], isBoss: true, isNpcBattle: false };
  };
  return gm;
}

// Resolve fight-N turn 1 on a freshly-started server combat and return its hash +
// the move choice used. Uses the live server party (post any prior backfill).
function serverStartAndHashTurn1(gm) {
  gm.combatCycleService.startCreatureEncounter();
  const seed = gm.combat.optimistic.nextTurnSeed;
  const moveChoices = [{ creatureIndex: 0, moveId: LETHAL_MOVE.id, targetIndex: 0 }];
  const resolved = resolvePveCursorTurn(
    { combat: gm.combat, run: gm.run, moveChoices },
    { actionType: 'attack', seed },
  );
  return { hash: hashTranscript(resolved.transcript), seed, moveChoices };
}

function hashAllyMoves(creature) {
  // A move-list-sensitive hash (buildStateSummary omits moves, but the real turn
  // transcript embeds full ally objects — hash those to prove move parity).
  return hashTranscript({ actionSegments: [], allies: [creature], enemies: [] });
}

describe('learnset backfill — cross-path fight-2 hash parity (offline chain)', () => {
  it('client (session + backfill) and server (replay + backfill) agree on fight-2 turn 1, both carrying the learned move', () => {
    // ============ SERVER SIDE ============
    const serverGm = makeGm();

    // --- Fight 1: terminal victory levels hi 6→7 and backfills `okoru`, driven
    // through the OFFLINE replay path (replayCombatCycleEntry) — the exact path
    // the explore-session drain uses, and where the server-side backfill runs. ---
    serverGm.combatCycleService.startCreatureEncounter();
    const serverAlly = serverGm.run.creatureParty.active[0];
    assert.equal(serverAlly.level, 6, 'precondition: server ally starts at L6');
    assert.deepEqual(serverAlly.moves.map(m => m.id), ['honoo', 'smash'], 'precondition: honoo + lethal, one free slot');

    const f1Seed = serverGm.combat.optimistic.nextTurnSeed;
    const f1MoveChoices = [{ creatureIndex: 0, moveId: LETHAL_MOVE.id, targetIndex: 0 }];
    const f1Resolved = resolvePveCursorTurn(
      { combat: serverGm.combat, run: serverGm.run, moveChoices: f1MoveChoices },
      { actionType: 'attack', seed: f1Seed },
    );
    const committed = serverGm.combatCycleService.replayCombatCycleEntry({
      actionType: 'attack',
      moveChoices: f1MoveChoices,
      predictedHash: hashTranscript(f1Resolved.transcript),
    });
    assert.equal(committed.combatEnded, true, 'fight 1 ended (single enemy killed)');
    assert.equal(committed.victory, true, 'fight 1 was a victory');
    assert.equal(serverAlly.level, 7, 'server ally leveled to 7 on the kill');
    assert.ok(Array.isArray(committed.learnsetBackfill), 'server emits learnsetBackfill on the committed result');
    assert.deepEqual(
      committed.learnsetBackfill.map(b => b.move.id), ['okoru'],
      'server backfilled okoru at L7',
    );
    assert.deepEqual(serverAlly.moves.map(m => m.id), ['honoo', 'smash', 'okoru'], 'server ally carries the backfilled move');

    // --- Fight 2: advance room, start against the LIVE leveled party ---
    serverGm.combat = null;
    serverGm.run.currentRoom = 1;
    const serverF2 = serverStartAndHashTurn1(serverGm);

    // ============ CLIENT SIDE ============
    // Fight 1: the session path predicted the terminal-victory turn, committed the
    // deferred kill-XP locally (applyLocalDeferredKillXp), then the combat-end
    // backfill ran (localStateAfterSessionPveTurn). Reproduce that here on an
    // independent client party — the client NEVER sees the server's leveled party.
    const clientAlly = levelSixHi();
    clientAlly.statStages = { atk: 0, def: 0, dex: 0 };
    const clientState = {
      run: {
        // Mirror the FULL server-provided party shape (maxTotal + pendingCaptures):
        // resolvePveCursorTurn embeds run.creatureParty in the transcript, so the
        // client party object must match the server's field-for-field or the
        // fight-2 hash diverges on scaffold shape rather than the move under test.
        creatureParty: { active: [clientAlly], reserves: [], maxTotal: 6, pendingCaptures: [] },
        crestMults: serverGm.run.crestMults,
        itemBuffs: serverGm.run.itemBuffs,
        partySkills: [],
      },
      combat: {
        enemies: [{ level: 3, hp: 0 }],
        allies: [clientAlly],
      },
    };
    // Deferred kill-XP for the terminal kill (mirrors the server's post-turn award).
    applyLocalDeferredKillXp(clientState, committed, f1Seed);
    assert.equal(clientAlly.level, 7, 'client ally leveled to 7 on the kill');
    assert.deepEqual(clientAlly.moves.map(m => m.id), ['honoo', 'smash'], 'client mirror does NOT learn the move (browser-safe XP)');
    // Combat-end backfill (the fix under test).
    backfillPartyLearnset(clientState.run.creatureParty);
    assert.deepEqual(clientAlly.moves.map(m => m.id), ['honoo', 'smash', 'okoru'], 'client combat-end backfill added okoru');

    // Fight 2: build local combat from the server-prepared payload (same ENEMIES +
    // seed the runway would deliver) but the CLIENT's own leveled+backfilled ally.
    // Capture the exact enemies + seed the server's fight-2 start rolled, mirroring
    // the prepared combatStart payload the client would receive.
    const serverF2Combat = serverGm.combat; // startCreatureEncounter set this
    const clientCombat = buildLocalCombatFromStart(
      {
        enemies: serverF2Combat.enemies,
        isBoss: true,
        optimistic: { combatId: 'c', stateVersion: 0, nextTurnSeed: serverF2.seed },
      },
      serverF2Combat.optimistic.turnSeeds,
      { fallbackAllies: clientState.run.creatureParty.active },
    );
    const clientResolved = resolvePveCursorTurn(
      { combat: clientCombat, run: clientState.run, moveChoices: serverF2.moveChoices },
      { actionType: 'attack', seed: serverF2.seed },
    );
    const clientF2Hash = hashTranscript(clientResolved.transcript);

    // ============ THE INVARIANTS ============
    assert.deepEqual(
      serverAlly.moves.map(m => m.id), clientAlly.moves.map(m => m.id),
      'server and client allies carry the same moves after the combat-end backfill',
    );
    assert.equal(
      hashAllyMoves(serverAlly), hashAllyMoves(clientAlly),
      'the backfilled ally hashes identically move-for-move across the two paths',
    );
    assert.equal(
      clientF2Hash, serverF2.hash,
      'fight-2 turn-1 hash agrees across the client-session / server-replay boundary — '
      + 'without the backfill the client ally would lack okoru and this would diverge (transcript_mismatch)',
    );
  });

  it('the fight-1 terminal-victory turn hash is UNAFFECTED by the backfill (backfill runs after the hash)', () => {
    // The terminal turn's predictedHash is computed from the PRE-turn state (what
    // replayCombatCycleEntry hashes before committing). The backfill runs AFTER
    // that, mutating the live party's moves. Prove the two are independent: commit
    // through the real replay path (backfill fires) and confirm the pre-turn hash
    // equals a re-resolution on a fresh identical GM the backfill never touched.
    const gm = makeGm();
    gm.combatCycleService.startCreatureEncounter();
    const seed = gm.combat.optimistic.nextTurnSeed;
    const moveChoices = [{ creatureIndex: 0, moveId: LETHAL_MOVE.id, targetIndex: 0 }];

    const preHash = hashTranscript(
      resolvePveCursorTurn(
        { combat: gm.combat, run: gm.run, moveChoices },
        { actionType: 'attack', seed },
      ).transcript,
    );
    // Snapshot the exact pre-turn combat + party BEFORE the commit mutates them, so
    // we can re-resolve the identical turn afterwards. resolvePveCursorTurn clones
    // internally, so this deep clone is untouched by the commit and the backfill.
    const preTurnSnapshot = structuredClone({ combat: gm.combat, run: gm.run });

    // Commit through the OFFLINE replay path with the honest predictedHash →
    // triggers the level-up + combat-end backfill (mutating the live party moves).
    const committed = gm.combatCycleService.replayCombatCycleEntry({
      actionType: 'attack', moveChoices, predictedHash: preHash,
    });
    assert.equal(committed.victory, true);
    assert.ok(committed.learnsetBackfill?.length > 0, 'backfill fired on this victory');
    assert.deepEqual(
      gm.run.creatureParty.active[0].moves.map(m => m.id), ['honoo', 'smash', 'okoru'],
      'the live party DID gain the backfilled move (post-hash mutation happened)',
    );

    // Re-resolve the SAME pre-turn transcript from the untouched snapshot: identical
    // to preHash proves the terminal-turn hash is a pure function of pre-turn state,
    // unaffected by the post-hash backfill that grew the live party's move list.
    const rehash = hashTranscript(
      resolvePveCursorTurn(
        { combat: preTurnSnapshot.combat, run: preTurnSnapshot.run, moveChoices },
        { actionType: 'attack', seed },
      ).transcript,
    );
    assert.equal(rehash, preHash, 'terminal-victory turn hash is unaffected by the combat-end backfill');
  });
});
