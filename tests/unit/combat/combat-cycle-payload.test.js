import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { createCombatState } from '../../../src/game/state.js';

await mock.module('../../../src/game/loop.js', {
  namedExports: {
    applyDebugSuperAttack: () => {}
  }
});

const {
  CombatCycleService,
  serializeBefriendPrompt,
} = await import('../../../src/game/services/combat-cycle-service.js');

function createEncounterGameManager() {
  const ally = instantiateCreature('hi');
  ally.level = 5;
  ally.hp = ally.maxHp;

  return {
    combat: null,
    run: {
      active: true,
      rooms: [{ type: 'combat' }],
      currentRoom: 0,
      currentArea: { id: 'test-area', creatures: ['mizu'], stage: 1 },
      currentAreaEncounters: 1,
      totalEncounters: 4,
      creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
      partySkills: [],
    },
    meta: {},
    emitState() {},
    narrate() {},
  };
}

describe('CombatCycleService attack response payloads', () => {
  it('serializes befriend prompt overrides into quiz payloads', () => {
    const prompt = {
      raw: '私の名前は？',
      tokens: [
        { surface: '私', base: '私', reading: 'わたし', pos: 'Pronoun', meaning: 'my', meanings: ['I/me'] },
        { surface: 'の' },
        { surface: '名前', base: '名前', reading: 'なまえ', pos: 'Noun', meaning: 'name', meanings: ['name'] },
        { surface: 'は' },
        { surface: '？' },
      ],
      words: ['私', '名前'],
      overrides: { '私': 'my' },
    };

    assert.deepEqual(serializeBefriendPrompt(prompt), {
      text: '私の名前は？',
      tokens: prompt.tokens,
      words: ['私', '名前'],
      overrides: { '私': 'my' },
    });
    assert.equal(serializeBefriendPrompt(null), null);
  });

  it('preserves enemy attacks when a later player action ends combat', () => {
    const strongMove = {
      id: 'debug-hit', name: '試す', nameEn: 'Debug Hit', reading: 'ためす',
      element: 'neutral', category: 'damage', power: 1000,
      target: 'single_enemy', mpCost: 0, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    };
    const weakMove = {
      id: 'poke', name: '突く', nameEn: 'Poke', reading: 'つく',
      element: 'neutral', category: 'damage', power: 20,
      target: 'single_enemy', mpCost: 0, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    };

    const opener = instantiateCreature('hi');
    opener.level = 12;
    opener.attack = 100;
    opener.hp = 200;
    opener.maxHp = 200;
    opener.moves = [strongMove];

    const finisher = instantiateCreature('tetsu');
    finisher.level = 10;
    finisher.attack = 100;
    finisher.hp = 200;
    finisher.maxHp = 200;
    finisher.moves = [strongMove];

    const primary = instantiateCreature('mizu');
    primary.level = 1;
    primary.hp = 1;
    primary.maxHp = 1;
    primary.moves = [];

    const attacker = instantiateCreature('ki');
    attacker.level = 11;
    attacker.attack = 10;
    attacker.hp = 100;
    attacker.maxHp = 100;
    attacker.moves = [weakMove];

    const allies = [opener, finisher];
    const enemies = [primary, attacker];
    const combat = createCombatState(primary);
    combat.allies = allies;
    combat.enemies = enemies;
    combat.isBoss = true; // Skip befriend branching; this test is about victory payload shape.

    const gm = {
      combat,
      run: {
        active: true,
        player: { credits: 0 },
        creatureParty: { active: allies, reserves: [], maxTotal: 6, pendingCaptures: [] },
        partySkills: [],
        itemBuffs: {
          attackMult: 1, hpMult: 1, elementEdge: 0, flatDamageReduction: 0,
          xpMultiplier: 1, xpBalanceStacks: 0, baseAttackBonus: 0, baseHpBonus: 0, baseMpBonus: 0
        },
        crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
        rooms: [],
        currentRoom: 0,
        runSummary: {}
      },
      meta: null,
      userId: null,
      emitState() {},
      narrate() {}
    };

    const service = new CombatCycleService(gm);
    const result = service._handleCreatureAttackTurn([], [
      { creatureIndex: 0, moveId: 'debug-hit', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'debug-hit', targetIndex: 1 }
    ]);

    assert.equal(result.combatEnded, true);
    assert.equal(result.victory, true);
    assert.equal(result.enemyAttacks?.length, 1, 'enemy attack must be returned for playback');
    assert.equal(result.enemyAttacks[0].attackerIndex, 1);
    assert.ok(['hi', 'tetsu'].includes(result.enemyAttacks[0].targetId));
    assert.ok(allies.some(a => a.hp < a.maxHp), 'ally HP changed because the returned enemy attack happened');
  });

  it('start creature encounter exposes optimistic combat metadata', () => {
    const gm = createEncounterGameManager();
    const service = new CombatCycleService(gm);

    const result = service.startCreatureEncounter();

    assert.equal(typeof gm.combat.optimistic.combatId, 'string');
    assert.equal(gm.combat.optimistic.stateVersion, 0);
    assert.equal(typeof gm.combat.optimistic.nextTurnSeed, 'string');
    assert.equal(result.optimistic.combatId, gm.combat.optimistic.combatId);
    assert.equal(result.optimistic.stateVersion, 0);
    assert.equal(result.optimistic.nextTurnSeed, gm.combat.optimistic.nextTurnSeed);
  });
});
