import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { instantiateCreature } from '../../../src/game/creatures.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { applyLocalDeferredKillXp } from '../../../public/js/ui/combat-local-prediction.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';

/**
 * O2 (explore subway combat tier) — transcript_mismatch on multi-turn session
 * combats with a mid-fight level-up.
 *
 * The explore-session combat path defers kill-XP: enemies newly defeated by a
 * turn's ally attacks are awarded XP AFTER the turn (deferXpAwards:true). A
 * resulting level-up changes ally stats AND — crucially — the creature's MOVE
 * LIST used by the NEXT turn's transcript. The transcript hash
 * (buildStateSummary) covers full creature objects including `moves`, so both
 * sides must apply the SAME level-up.
 *
 * The client mirror (combat-local-prediction.js::applyLocalDeferredKillXp) uses
 * the browser-safe applyKillXpToParty (kanji-kombat-xp.js), which does NOT learn
 * moves on level-up (the browser has no MOVES_BY_ID / learnset lookup). The
 * server's PvE deferred path (_collectDeferredKillXpEvents) DEFAULTED to
 * awardKillXp, which DOES learn a move on level-up. So a mid-fight kill that
 * crosses a learnset level grows the creature's `moves` array server-side and
 * not on the client → the next turn hashes differently → transcript_mismatch (a
 * corrected sync). The fix routes the PvE deferred path through
 * applyKillXpToParty, matching the client mirror and the Kanji Kombat path.
 *
 * This test resolves the SAME kill-turn through the real server combat cycle
 * (deferXpAwards:true) and the client mirror, and asserts the ally ends up
 * hash-identical (same moves + stats). hi learns `okoru` at level 7, so an ally
 * starting at level 6 crossing to 7 exercises exactly the move-learning case.
 */

const AREA_ID = 'hajimari-no-hiroba';

const LETHAL_MOVE = Object.freeze({
  id: 'smash', name: '砕く', nameEn: 'Smash', reading: 'くだく',
  element: 'neutral', category: 'damage', target: 'single_enemy',
  power: 999, mpCost: 0, accuracy: 100,
  statusEffect: null, statusChance: 0, statusDuration: 0,
});

// A level-6 hi that will cross to level 7 (learning `okoru` server-side) on a
// single kill's worth of deferred XP. Fixed uid so the two sides share identity
// (the transcript hash covers uid; in the real flow both operate on the same
// creature built from the server's prepared payload).
function levelSixHi() {
  const hi = instantiateCreature('hi');
  hi.level = 6;
  hi.xp = 0;
  hi.uid = 'test-hi-uid';
  hi.moves = [LETHAL_MOVE];
  hi.hp = hi.maxHp;
  hi.mp = hi.maxMp;
  return hi;
}

function makeGm(ally) {
  const run = {
    active: true,
    mode: 'standard',
    currentArea: { id: AREA_ID, nameEn: 'Starting Meadow', bossCreatureId: 'mizu' },
    areaPath: [AREA_ID],
    currentRoom: 0,
    roomActionSeq: 0,
    exploreSessionEpoch: 'ese_2222222222222222',
    creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1, hpMult: 1, elementEdge: 0, flatDamageReduction: 0,
      xpMultiplier: 1, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: { itemsCollected: 0, creaturesBefriended: 0 },
    stats: { damageDealt: 0 },
    rooms: [createRoom(ROOM_TYPES.boss, AREA_ID, 1, 2), createRoom(ROOM_TYPES.friendlyNpc, AREA_ID, 2, 2)],
    bossesDefeated: [],
    currentAreaEncounters: 0,
  };
  run.rooms[0].boss = { creatureId: 'mizu', defeated: false };

  const gm = {
    player: { name: 'XpParity', credits: 0 },
    run,
    combat: null,
    meta: { creatureCollection: ['hi', 'ki'], befriendCount: {}, actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
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

  // Two-enemy wave: the ally one-shots enemy 0 this turn (deferred kill-XP →
  // level-up), enemy 1 survives so the fight does NOT end (a non-terminal turn
  // whose kill-XP feeds the next turn's hashed state). Weak, high-HP enemies so
  // enemy attacks never KO the level-500-hp ally.
  gm.combatCycleService._rollEncounterEnemies = () => {
    const mk = (hp) => {
      const enemy = instantiateCreature('mizu');
      enemy.moves = [{ ...LETHAL_MOVE, id: 'tap', power: 0, nameEn: 'Tap' }];
      enemy.hp = enemy.maxHp = hp;
      enemy.mp = enemy.maxMp = 100;
      enemy.level = 3; // enemyLevel 3 → one kill's XP crosses hi from 6 to 7
      return enemy;
    };
    return { enemies: [mk(1), mk(9999)], isBoss: true, isNpcBattle: false };
  };
  return gm;
}

function hashAlly(creature) {
  return hashTranscript({ actionSegments: [], allies: [creature], enemies: [] });
}

describe('deferred kill-XP parity — server PvE combat cycle vs client mirror', () => {
  it('a mid-fight level-up leaves the ally hash-identical across server and client', async () => {
    // --- SERVER: real combat cycle with deferred XP (the session path) ---
    const serverGm = makeGm(levelSixHi());
    serverGm.combatCycleService.startCreatureEncounter();
    const serverAlly = serverGm.run.creatureParty.active[0];
    assert.equal(serverAlly.level, 6, 'precondition: server ally starts at level 6');

    const seed = serverGm.combat.optimistic.nextTurnSeed;
    const committed = serverGm.combatCycleService.creatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: LETHAL_MOVE.id, targetIndex: 0 },
    ], {
      rng: createSeededRng(seed),
      verifiedSeed: seed,
      suppressBarks: true,
      deferXpAwards: true, // the session / shared-core prediction path
    });
    assert.equal(committed.combatEnded, false, 'enemy 1 survives — non-terminal turn');
    assert.equal(serverAlly.level, 7, 'server ally leveled to 7 on the kill');

    // --- CLIENT: mirror the same kill-turn's deferred XP over a matching state ---
    // Build a client state whose ally started identical (level 6) and whose
    // combat.enemies match the pre-XP enemy roll, then apply the client's
    // deferred-XP helper against the same transcript + seed.
    const clientAlly = levelSixHi();
    // The real client builds combat via buildLocalCombatFromStart, which resets
    // stat stages (the Task 10 statStages parity fix). Mirror that here so the
    // only variable under test is the deferred kill-XP level-up.
    clientAlly.statStages = { atk: 0, def: 0, dex: 0 };
    const clientState = {
      run: {
        creatureParty: { active: [clientAlly], reserves: [] },
        crestMults: serverGm.run.crestMults,
        itemBuffs: serverGm.run.itemBuffs,
        partySkills: [],
      },
      combat: {
        // enemy levels are what the client's helper reads for XP; index 0 is the
        // one defeated this turn (level 3), mirroring the server roll.
        enemies: [{ level: 3, hp: 0 }, { level: 3, hp: 9999 }],
        allies: [clientAlly],
      },
    };
    applyLocalDeferredKillXp(clientState, committed, seed);
    assert.equal(clientAlly.level, 7, 'client ally leveled to 7 on the kill');

    // The core invariant: after the SAME kill-XP level-up, both allies must hash
    // identically — same moves (no server-only learned move), same stats.
    assert.deepEqual(
      serverAlly.moves.map(m => m.id),
      clientAlly.moves.map(m => m.id),
      'server and client ally move lists must match after a mid-fight level-up',
    );
    assert.equal(
      hashAlly(serverAlly), hashAlly(clientAlly),
      'the leveled ally must hash identically across the server-cycle / client-mirror boundary — '
      + 'otherwise the next combat.cycle turn syncs into a transcript_mismatch correction',
    );
  });
});
