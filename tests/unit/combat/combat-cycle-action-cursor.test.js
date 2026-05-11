import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState } from '../../../src/game/state.js';

await mock.module('../../../src/game/loop.js', {
  exports: {
    applyDebugSuperAttack: () => {}
  }
});

const { CombatCycleService } = await import('../../../src/game/services/combat-cycle-service.js');

function makeCreature(id, overrides = {}) {
  return {
    id,
    name: id,
    nameEn: id,
    hp: 100,
    maxHp: 100,
    mp: 10,
    maxMp: 10,
    level: 5,
    dex: 10,
    statStages: { atk: 0, def: 0, dex: 0 },
    moves: [],
    ...overrides
  };
}

function makeGameManager() {
  const defeatedAlly = makeCreature('defeated-ally', { hp: 0 });
  const survivingAlly = makeCreature('surviving-ally', { dex: 20 });
  const enemy = makeCreature('enemy', { dex: 5 });
  const active = [defeatedAlly, survivingAlly];
  const combat = createCombatState(enemy);
  combat.allies = active;
  combat.enemies = [enemy];
  combat.actionCursor = { side: 'ally', index: 1, opening: false };
  combat.isCreatureCombat = true;

  return {
    combat,
    run: {
      active: true,
      creatureParty: {
        active,
        reserves: [],
        pendingCaptures: [],
        maxTotal: 3
      },
      itemBuffs: null,
      crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
      partySkills: []
    },
    meta: null,
    emitState() {},
    _onRunDefeat() {}
  };
}

describe('combat cycle action cursor', () => {
  it('keeps the PvE cursor on a surviving ally after KO removal compacts party slots', () => {
    const gm = makeGameManager();
    const service = new CombatCycleService(gm);

    const result = service.creatureCombatCycle('attack', [
      { creatureIndex: 1, action: 'rest' }
    ]);

    assert.equal(result.combatEnded, false);
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.active[0].id, 'surviving-ally');
    assert.deepEqual(gm.combat.actionCursor, {
      side: 'ally',
      index: 0,
      opening: false
    });
    assert.equal(gm.combat.allies[gm.combat.actionCursor.index].id, 'surviving-ally');
  });

  it('triggers the tutorial befriend quiz when the cursor action defeats the first cat', () => {
    const move = {
      id: 'hit',
      name: 'Hit',
      nameEn: 'Hit',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 999,
      mpCost: 0
    };
    const ally = makeCreature('hi', { attack: 100, element: 'fire', moves: [move] });
    const enemy = makeCreature('neko', {
      name: '猫',
      nameEn: 'Cat',
      hp: 1,
      defense: 1,
      element: 'neutral'
    });
    const combat = createCombatState(enemy);
    combat.allies = [ally];
    combat.enemies = [enemy];
    combat.actionCursor = { side: 'ally', index: 0, opening: false };
    combat.isCreatureCombat = true;

    const gm = {
      combat,
      run: {
        active: true,
        currentArea: { id: 'hajimari-no-hiroba' },
        currentRoom: 0,
        rooms: [{ type: 'encounter' }],
        creatureParty: {
          active: [ally],
          reserves: [],
          pendingCaptures: [],
          maxTotal: 3
        },
        itemBuffs: null,
        crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
        partySkills: []
      },
      meta: { tutorialStep: 1 },
      emitState() {},
      _onRunDefeat() {}
    };
    const service = new CombatCycleService(gm);

    const result = service.creatureCombatCycle('attack', [
      { creatureIndex: 0, moveId: 'hit', targetIndex: 0 }
    ]);

    assert.equal(result.befriendQuizTriggered, true);
    assert.equal(result.combatEnded, false);
    assert.equal(gm.combat.befriendQuiz?.creatureId, 'neko');
    assert.equal(gm.combat.enemies[0].hp, 1);
  });
});
