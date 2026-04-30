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
  it('uses regular solo enemy level scaling instead of matching the starter level', (t) => {
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
        totalEncounters: 1,
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
    const expectedLevel = getEnemyLevel({ totalEncounters: 1, enemyCount: 1 });

    assert.equal(result.enemies.length, 1);
    assert.equal(result.enemy.id, 'neko');
    assert.equal(result.enemy.level, expectedLevel);
    assert.notEqual(result.enemy.level, starter.level);
  });
});

describe('Starting Meadow Hineko boss override', () => {
  it('forces Hineko to level 7 without boss double HP', (t) => {
    const random = mock.method(Math, 'random', () => 0.5);
    t.after(() => random.mock.restore());

    const gm = {
      run: {
        active: true,
        currentArea: { id: 'hajimari-no-hiroba', stage: 1 },
        currentRoom: 9,
        currentAreaEncounters: 5,
        totalEncounters: 10,
        rooms: [
          null, null, null, null, null, null, null, null, null,
          { type: 'boss', boss: { creatureId: 'hineko' } }
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
    const expectedHineko = generateEnemyCreature(7, ['hineko'], 1);

    assert.equal(result.enemy.id, 'hineko');
    assert.equal(result.enemy.level, 7);
    assert.equal(result.enemy.maxHp, expectedHineko.maxHp);
    assert.equal(result.enemy.hp, expectedHineko.maxHp);
  });
});
