import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreature, getEnemyLevel, generateEnemyCreature } from '../../../src/game/creatures.js';

await mock.module('../../../src/game/loop.js', {
  exports: {
    applyDebugSuperAttack: () => {}
  }
});

const { CombatCycleService } = await import('../../../src/game/services/combat-cycle-service.js');

describe('Starting Meadow forced Cat encounter', () => {
  it('uses regular solo enemy level scaling reduced by 2 levels', (t) => {
    const random = mock.method(Math, 'random', () => 0.5);
    t.after(() => random.mock.restore());

    const starter = instantiateCreature('hi');
    assert.equal(starter.level, 5, 'test setup expects starters to default to level 5');

    const gm = {
      run: {
        active: true,
        currentArea: { id: 'hajimari-no-hiroba', stage: 1 },
        currentRoom: 0,
        currentAreaEncounters: 0,
        totalEncounters: 8,
        rooms: [{ type: 'encounter' }],
        creatureParty: {
          active: [starter],
          reserves: [],
          pendingCaptures: [],
          maxTotal: 6
        }
      },
      meta: {},
      combat: null,
      emitState() {},
      narrate() {}
    };

    const result = new CombatCycleService(gm).startCreatureEncounter();
    const regularSoloLevel = getEnemyLevel({ totalEncounters: 8, enemyCount: 1 });
    const expectedLevel = Math.max(1, regularSoloLevel - 2);

    assert.equal(result.enemies.length, 1);
    assert.equal(result.enemy.id, 'neko');
    assert.equal(result.enemy.level, expectedLevel);
    assert.notEqual(result.enemy.level, starter.level);
  });
});

describe('Starting Meadow NPC battle', () => {
  it('reduces all NPC battle enemies by 2 levels', (t) => {
    const random = mock.method(Math, 'random', () => 0.5);
    t.after(() => random.mock.restore());

    const totalEncounters = 8;
    const gm = {
      run: {
        active: true,
        currentArea: {
          id: 'hajimari-no-hiroba',
          stage: 1,
          creatures: ['neko', 'inu']
        },
        currentRoom: 3,
        currentAreaEncounters: 3,
        totalEncounters,
        rooms: [
          null, null, null,
          { type: 'npcBattle' }
        ],
        creatureParty: {
          active: [instantiateCreature('hi')],
          reserves: [],
          pendingCaptures: [],
          maxTotal: 6
        }
      },
      meta: {},
      combat: null,
      emitState() {},
      narrate() {}
    };

    const result = new CombatCycleService(gm).startCreatureEncounter();
    const baseLevel = getEnemyLevel({ totalEncounters, enemyCount: 3 });
    const regularNpcLevel = Math.round(baseLevel * 1.1);
    const expectedLevel = Math.max(1, regularNpcLevel - 2);

    assert.equal(result.enemies.length, 3);
    assert.deepEqual(result.enemies.map(enemy => enemy.level), [
      expectedLevel,
      expectedLevel,
      expectedLevel
    ]);
  });
});

describe('Starting Meadow Hinoneko boss override', () => {
  it('keeps Hinoneko at level 5 but still applies boss double HP', (t) => {
    const random = mock.method(Math, 'random', () => 0.5);
    t.after(() => random.mock.restore());

    const gm = {
      run: {
        active: true,
        currentArea: { id: 'hajimari-no-hiroba', stage: 1 },
        currentRoom: 6,
        currentAreaEncounters: 6,
        totalEncounters: 7,
        rooms: [
          null, null, null, null, null, null,
          { type: 'boss', boss: { creatureId: 'hinoneko' } }
        ],
        creatureParty: {
          active: [instantiateCreature('hi')],
          reserves: [],
          pendingCaptures: [],
          maxTotal: 6
        }
      },
      meta: {},
      combat: null,
      emitState() {},
      narrate() {}
    };

    const result = new CombatCycleService(gm).startCreatureEncounter();
    const expectedHinoneko = generateEnemyCreature(5, ['hinoneko'], 1);

    assert.equal(result.enemy.id, 'hinoneko');
    assert.equal(result.enemy.level, 5);
    assert.equal(result.enemy.maxHp, expectedHinoneko.maxHp * 2);
    assert.equal(result.enemy.hp, expectedHinoneko.maxHp * 2);
  });
});
