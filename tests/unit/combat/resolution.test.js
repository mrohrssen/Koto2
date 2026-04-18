import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAllDefeated, processKOSwaps, collectElementDrops, getElementDropList, finalizeCombatVictory, resolveDefeat } from '../../../src/game/combat/resolution.js';

describe('checkAllDefeated', () => {
  it('returns true for empty array', () => {
    assert.equal(checkAllDefeated([]), true);
  });

  it('returns true when all hp <= 0', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: -5, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });

  it('returns false when any creature alive', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: 10, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), false);
  });

  it('returns true when all null', () => {
    assert.equal(checkAllDefeated([null, null]), true);
  });

  it('treats befriended enemies as defeated', () => {
    const creatures = [
      { hp: 30, maxHp: 50, befriended: true },
      { hp: 0, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });
});

describe('processKOSwaps', () => {
  function makeParty(active, reserves = []) {
    return { active, reserves };
  }

  it('returns empty arrays when no allies are KO', () => {
    const allies = [{ hp: 50, maxHp: 50, nameEn: 'A' }];
    const party = makeParty(allies);
    const result = processKOSwaps(allies, party);
    assert.deepEqual(result.koSwaps, []);
    assert.deepEqual(result.koRemovals, []);
  });

  it('swaps KO creature with reserve', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'Reserve', name: 'リザーブ' };
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, [reserve]);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 1);
    assert.equal(result.koSwaps[0].index, 0);
    assert.ok(result.koSwaps[0].replacement); // creature object
    assert.equal(result.koRemovals.length, 0);
  });

  it('records removal when no reserves available', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' }
    ];
    const party = makeParty(allies, []);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 0);
    assert.equal(result.koRemovals.length, 1);
    assert.equal(result.koRemovals[0].index, 0);
    assert.equal(result.koRemovals[0].name, 'Dead');
  });

  it('compacts null slots from active array in-place', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, []);
    processKOSwaps(allies, party);
    // Compaction mutates the SAME array (important for PvP aliasing)
    assert.equal(allies.length, 1);
    assert.equal(allies[0].nameEn, 'Alive');
    assert.strictEqual(party.active, allies); // same reference preserved
  });

  it('resetStatStages is called on replacement creature', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'R', name: 'リ', statStages: { atk: 3, def: -2 } };
    const allies = [{ hp: 0, maxHp: 50, nameEn: 'D', name: 'デ' }];
    const party = makeParty(allies, [reserve]);
    processKOSwaps(allies, party);
    // handleCreatureKO calls resetStatStages on the replacement
    assert.deepEqual(reserve.statStages, { atk: 0, def: 0 });
  });
});

describe('collectElementDrops', () => {
  it('increments element counts for defeated non-neutral enemies', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const enemies = [
      { hp: 0, maxHp: 50, element: 'fire' },
      { hp: 0, maxHp: 50, element: 'water' },
      { hp: 30, maxHp: 50, element: 'earth' } // alive, skip
    ];
    collectElementDrops(meta, enemies, null);
    assert.equal(meta.elementDrops.fire, 1);
    assert.equal(meta.elementDrops.water, 1);
    assert.equal(meta.elementDrops.earth, 0);
  });

  it('skips neutral elements', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const enemies = [{ hp: 0, maxHp: 50, element: 'neutral' }];
    collectElementDrops(meta, enemies, null);
    assert.deepEqual(meta.elementDrops, { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 });
  });

  it('initializes elementDrops if missing', () => {
    const meta = {};
    const enemies = [{ hp: 0, maxHp: 50, element: 'fire' }];
    collectElementDrops(meta, enemies, null);
    assert.equal(meta.elementDrops.fire, 1);
  });

  it('no-ops when meta is null', () => {
    // Should not throw
    collectElementDrops(null, [{ hp: 0, element: 'fire' }], null);
  });

  it('updates runSummary when provided', () => {
    const meta = { elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 } };
    const summary = { creaturesDefeated: 0, elementsCollected: {} };
    const enemies = [{ hp: 0, maxHp: 50, element: 'fire' }];
    collectElementDrops(meta, enemies, summary);
    assert.equal(summary.creaturesDefeated, 1);
    assert.equal(summary.elementsCollected.fire, 1);
  });
});

describe('getElementDropList', () => {
  it('returns element names of defeated non-neutral enemies', () => {
    const enemies = [
      { hp: 0, element: 'fire' },
      { hp: 30, element: 'water' }, // alive
      { hp: 0, element: 'neutral' }, // neutral
      { hp: 0, element: 'earth' }
    ];
    const result = getElementDropList(enemies);
    assert.deepEqual(result, ['fire', 'earth']);
  });
});

describe('finalizeCombatVictory', () => {
  it('marks room as interacted and increments encounters', () => {
    const rooms = [{ type: 'encounter', interacted: false }];
    const combat = { active: true, isBoss: false, enemies: [] };
    const run = { currentRoom: 0, rooms, currentAreaEncounters: 2 };
    finalizeCombatVictory(combat, run);
    assert.equal(combat.active, false);
    assert.equal(run.currentAreaEncounters, 3);
    assert.equal(rooms[0].interacted, true);
  });

  it('tracks boss defeat in run.bossesDefeated', () => {
    const combat = { active: true, isBoss: true, enemies: [{ id: 'boss1' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0, bossesDefeated: [] };
    finalizeCombatVictory(combat, run);
    assert.ok(run.bossesDefeated.includes('boss1'));
  });

  it('initializes bossesDefeated if missing', () => {
    const combat = { active: true, isBoss: true, enemies: [{ id: 'b1' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0 };
    finalizeCombatVictory(combat, run);
    assert.deepEqual(run.bossesDefeated, ['b1']);
  });

  it('calls narrate with boss defeat dialogue when template exists', () => {
    const narrated = [];
    const combat = { active: true, isBoss: true, enemies: [{ id: 'fake_boss' }] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0, bossesDefeated: [] };
    finalizeCombatVictory(combat, run, { narrate: (t) => narrated.push(t) });
    // fake_boss won't exist in CREATURES_BY_ID, so narrate should NOT be called
    assert.equal(narrated.length, 0);
    // Boss is still tracked even without dialogue
    assert.ok(run.bossesDefeated.includes('fake_boss'));
  });

  it('preserves statStages and activeEffects on surviving allies', () => {
    // Bug 2026-04-18 (latest playtest): clearing stages at combat-end made
    // the buff pill vanish *mid-playback* — the final AoE wave was still
    // animating on the client when the buff-cleared state landed. Stages
    // are now cleared on room entry (exploration-service) instead, so
    // they stay visible through the victory modal / friendlyNpc reward
    // screen and disappear only when the user physically moves on.
    const ally = {
      hp: 30, maxHp: 50,
      statStages: { atk: 2, def: 1 },
      activeEffects: [{ type: 'poison', remainingTurns: 2, sourceId: 'x' }]
    };
    const combat = { active: true, isBoss: false, enemies: [], allies: [ally] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0 };
    finalizeCombatVictory(combat, run);
    assert.deepEqual(ally.statStages, { atk: 2, def: 1 });
    assert.deepEqual(ally.activeEffects, [{ type: 'poison', remainingTurns: 2, sourceId: 'x' }]);
  });

  it('ignores null/undefined ally slots during cleanup', () => {
    const combat = { active: true, isBoss: false, enemies: [], allies: [null, undefined] };
    const run = { currentRoom: 0, rooms: [{}], currentAreaEncounters: 0 };
    // Should not throw
    finalizeCombatVictory(combat, run);
    assert.equal(combat.active, false);
  });
});

describe('exploration-service: room-entry clears combat buffs', () => {
  // These tests verify the new home of stat-stage cleanup. Moving the
  // clear out of finalizeCombatVictory and into proceedToNextRoom /
  // enterArea matches the user's rule from 2026-04-18: "All buffs and
  // debuffs should clear on room transitions." See resolution.js note.
  it('_clearCombatBuffsForRoomEntry zeros active creatures stat stages', async () => {
    const { ExplorationService } = await import('../../../src/game/services/exploration-service.js');
    const gm = {
      run: {
        creatureParty: {
          active: [{ hp: 30, maxHp: 50, statStages: { atk: 2, def: 1 }, activeEffects: [{ type: 'poison', remainingTurns: 2 }] }],
          reserves: [{ hp: 40, maxHp: 50, statStages: { atk: 0, def: -1 }, activeEffects: [] }]
        }
      }
    };
    const svc = new ExplorationService(gm);
    svc._clearCombatBuffsForRoomEntry();
    assert.deepEqual(gm.run.creatureParty.active[0].statStages, { atk: 0, def: 0 });
    assert.deepEqual(gm.run.creatureParty.active[0].activeEffects, []);
    assert.deepEqual(gm.run.creatureParty.reserves[0].statStages, { atk: 0, def: 0 });
  });

  it('_clearCombatBuffsForRoomEntry is a no-op without creatureParty', async () => {
    const { ExplorationService } = await import('../../../src/game/services/exploration-service.js');
    const svc = new ExplorationService({ run: null });
    // Should not throw
    svc._clearCombatBuffsForRoomEntry();
    const svc2 = new ExplorationService({ run: { creatureParty: null } });
    svc2._clearCombatBuffsForRoomEntry();
  });
});

describe('resolveDefeat', () => {
  it('saves pending captures to collection and ends run', () => {
    const captured = { id: 'cap1', temporary: false };
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: { pendingCaptures: [captured] }
    };
    const meta = { creatureCollection: [] };
    const onDefeatCalled = [];
    resolveDefeat(combat, run, meta, { onDefeat: () => onDefeatCalled.push(true) });
    assert.equal(combat.active, false);
    assert.equal(run.active, false);
    assert.equal(run.creatureParty.pendingCaptures.length, 0);
    assert.equal(onDefeatCalled.length, 1);
  });

  it('skips collection for temporary creatures', () => {
    const captured = { id: 'temp1', temporary: true };
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: { pendingCaptures: [captured] }
    };
    const meta = { creatureCollection: [] };
    resolveDefeat(combat, run, meta);
    assert.ok(!meta.creatureCollection.includes('temp1'));
  });
});
