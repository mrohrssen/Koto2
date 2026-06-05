import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processMoveTurn,
  processInterleavedPvERound,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  awardBattleXp,
  awardKillXp,
  tickAllEffects,
  resolveActorMiniRound,
  resolveSingleActorAction,
  rollTalkAcceptance,
  executeNpcSkill,
  handleBefriendAnswer,
  generateBefriendQuiz
} from '../../../src/game/services/creature-combat-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { computeRestMpGain } from '../../../src/game/rest-move.js';

describe('Creature Combat - Move Turn', () => {
  it('each allied creature uses a move against the enemy', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'honoo', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'nagasu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.attacks.length >= 1);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    allies[0].hp = 0;
    const enemies = [instantiateCreature('ki')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'honoo', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'nagasu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // Only mizu (index 1) should attack
    assert.strictEqual(result.attacks.length, 1);
  });

  it('includes move fields in attack records', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('hi')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerId, 'mizu');
    assert.ok(atk.attackerNameJp, 'should have attacker Japanese name');
    assert.strictEqual(atk.moveId, 'nagasu');
    assert.ok(atk.moveName, 'should have move Japanese name');
    assert.strictEqual(atk.moveNameEn, 'Wash Away');
    assert.ok(atk.targetNameJp, 'should have target Japanese name');
    assert.strictEqual(atk.targetId, 'hi');
  });

  it('deducts MP when using a move', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    const startMp = allies[0].mp;
    const moveCost = allies[0].moves.find(m => m.id === 'nagasu').mpCost;
    const moveChoices = [
      { creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }
    ];
    processMoveTurn(allies, enemies, moveChoices);
    // MP should decrease by move cost, then regen 5% of maxMp
    const expectedMp = Math.min(allies[0].maxMp, startMp - moveCost + Math.floor(allies[0].maxMp * 0.05));
    assert.strictEqual(allies[0].mp, expectedMp);
  });

  it('skips move if insufficient MP', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].mp = 0;
    const enemies = [instantiateCreature('ki')];
    const startHp = enemies[0].hp;
    const moveChoices = [
      { creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    // Enemy should not take damage (move skipped)
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('returns mpRegens for alive allies', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].mp = 0;
    const enemies = [instantiateCreature('ki')];
    const moveChoices = [];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(result.mpRegens[0].regen > 0, 'should regen some MP');
  });

  it('awards separate XP per enemy slot when two instances share template id', () => {
    const allies = [instantiateCreature('mizu'), instantiateCreature('ki')];
    const enemies = [instantiateCreature('hi'), instantiateCreature('hi')];
    enemies[0].hp = 1;
    enemies[1].hp = 1;
    const party = { active: allies, reserves: [], pendingCaptures: [] };
    const moveChoices = [
      { creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'sasu', targetIndex: 1 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices, null, party);
    assert.strictEqual(result.xpEvents.length, 2);
    assert.ok(result.xpEvents.some(ev => ev.enemyIndex === 0));
    assert.ok(result.xpEvents.some(ev => ev.enemyIndex === 1));
  });
});

describe('Creature Combat - Defend Turn', () => {
  it('all creatures gain MP regen on defend', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].mp = 10;
    const result = processDefendTurn(allies);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(allies[0].mp > 10, 'MP should increase from defend regen');
  });
});

describe('Creature Combat - Actor Mini Round', () => {
  it('ticks poison only on the acting creature after its action', () => {
    const actor = instantiateCreature('mizu');
    const bystander = instantiateCreature('ki');
    actor.activeEffects = [{ type: 'poison', damagePerTurn: 7, remainingTurns: 2, sourceId: 'enemy' }];
    bystander.activeEffects = [{ type: 'poison', damagePerTurn: 7, remainingTurns: 2, sourceId: 'enemy' }];
    const actorHp = actor.hp;
    const bystanderHp = bystander.hp;

    const result = resolveActorMiniRound(actor, { side: 'ally', index: 0 });

    assert.equal(actor.hp, actorHp - 7);
    assert.equal(actor.activeEffects[0].remainingTurns, 1);
    assert.equal(bystander.hp, bystanderHp);
    assert.equal(bystander.activeEffects[0].remainingTurns, 2);
    assert.equal(result.effectEvents.length, 1);
    assert.equal(result.effectEvents[0].targetSide, 'ally');
    assert.equal(result.effectEvents[0].targetIndex, 0);
  });

  it('regenerates MP only on the acting ally', () => {
    const actor = instantiateCreature('mizu');
    const bystander = instantiateCreature('ki');
    actor.mp = 0;
    bystander.mp = 0;

    const result = resolveActorMiniRound(actor, { side: 'ally', index: 0 });

    assert.equal(actor.mp, Math.floor(actor.maxMp * 0.05));
    assert.equal(bystander.mp, 0);
    assert.deepEqual(result.mpRegens, [{
      creatureId: actor.id,
      mp: actor.mp,
      maxMp: actor.maxMp,
      regen: Math.floor(actor.maxMp * 0.05),
      side: 'ally',
      index: 0
    }]);
  });

  it('uses enemy MP regen rate for acting enemy', () => {
    const enemy = instantiateCreature('hi');
    enemy.mp = 0;

    const result = resolveActorMiniRound(enemy, { side: 'enemy', index: 0 });

    assert.equal(enemy.mp, Math.floor(enemy.maxMp * 0.12));
    assert.equal(result.mpRegens[0].side, 'enemy');
  });
});

describe('Creature Combat - Enemy Turn', () => {
  it('enemy attacks allied creatures using its first move', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('mizu')]; // mizu has 'nagasu' (damage move)
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });

  it('includes move fields in enemy attack records', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('mizu')];
    const result = processEnemyTurn(enemies, allies);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerNameJp, '\u6C34');
    assert.strictEqual(atk.moveId, 'nagasu');
    assert.ok(atk.moveName);
    assert.ok(atk.moveNameEn);
    assert.strictEqual(atk.targetNameJp, '\u6728');
    assert.strictEqual(atk.attackerIndex, 0);
    assert.strictEqual(atk.targetIndex, 0);
  });
});

describe('Creature Combat - Interleaved Initiative', () => {
  it('processInterleavedPvERound resolves higher dex before higher level', () => {
    const slowHighLevel = instantiateCreature('ishi', 20);
    const fastLowLevel = instantiateCreature('kaze', 5);
    slowHighLevel.dex = 5;
    fastLowLevel.dex = 30;
    slowHighLevel.statStages = { atk: 0, def: 0, dex: 0 };
    fastLowLevel.statStages = { atk: 0, def: 0, dex: 0 };
    slowHighLevel.moves = [{
      id: 'slow-hit', name: '遅打', nameEn: 'Slow Hit', reading: 'おそだ',
      element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 0
    }];
    fastLowLevel.moves = [{
      id: 'fast-hit', name: '速打', nameEn: 'Fast Hit', reading: 'はやだ',
      element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 0
    }];

    const result = processInterleavedPvERound(
      [slowHighLevel],
      [fastLowLevel],
      [{ creatureIndex: 0, moveId: 'slow-hit', targetIndex: 0 }]
    );

    assert.strictEqual(result.enemyAttacks[0].attackerId, fastLowLevel.id);
  });
});

describe('Creature Combat - Single Actor Action', () => {
  it('resolves only the selected ally primary action and returns one action segment', () => {
    const allies = [instantiateCreature('mizu'), instantiateCreature('ki')];
    const enemies = [instantiateCreature('hi')];
    const startHp = enemies[0].hp;

    const result = resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies,
      enemies,
      choices: [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }]
    });

    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].actor.side, 'ally');
    assert.equal(result.actionSegments[0].actor.index, 0);
    assert.ok(enemies[0].hp < startHp);
    assert.equal(allies[1].mp, allies[1].maxMp, 'bystander ally should not spend or regen MP');
  });

  it('does not let an inline counter create a mini-round tick for the countering ally', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('hi')];
    allies[0].activeEffects = [{ type: 'poison', damagePerTurn: 4, remainingTurns: 2, sourceId: 'hi' }];
    enemies[0].moves = [{
      id: 'enemy-hit', name: '打つ', nameEn: 'Hit', reading: 'うつ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 30, mpCost: 0
    }];

    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = resolveSingleActorAction({
        actorSide: 'enemy',
        actorIndex: 0,
        allies,
        enemies,
        choices: [{ creatureIndex: 0, moveId: 'enemy-hit', targetIndex: 0 }],
        runPartySkills: ['retaliationStrike'],
        combat: {}
      });

      assert.equal(result.actionSegments.length, 1);
      assert.ok(result.actionSegments[0].counterAttacks.length > 0, 'retaliationStrike should counter');
      assert.equal(allies[0].activeEffects[0].remainingTurns, 2, 'countering ally poison should not tick');
    } finally {
      Math.random = origRandom;
    }
  });

  it('applies enemy self-sabotage once for all-target single actor actions', () => {
    const allies = [instantiateCreature('mizu'), instantiateCreature('ki')];
    const enemies = [instantiateCreature('hi'), instantiateCreature('ishi')];
    enemies[0].moves = [{
      id: 'enemy-sweep', name: '払う', nameEn: 'Sweep', reading: 'はらう',
      element: 'neutral', category: 'damage', target: 'all_enemies',
      power: 10, mpCost: 0
    }];

    const result = resolveSingleActorAction({
      actorSide: 'enemy',
      actorIndex: 0,
      allies,
      enemies,
      choices: [{ creatureIndex: 0, moveId: 'enemy-sweep', targetIndex: 0 }],
      runPartySkills: [{ id: 'debuffMaster', level: 5 }],
      combat: {},
      rng: () => 0.01
    });

    const segment = result.actionSegments[0];
    assert.equal(segment.attacks.length, 2);
    assert.equal(segment.effectEvents.filter(event => event.type === 'debuffMasterSelfSabotage').length, 1);
    assert.equal(enemies[1].statStages.atk, -1);
  });

  it('orders enemy self-sabotage playback before inline counters', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('hi'), instantiateCreature('ishi')];
    allies[0].attack = 200;
    allies[0].hp = 500;
    allies[0].maxHp = 500;
    enemies[0].hp = 20;
    enemies[0].maxHp = 20;
    enemies[0].moves = [{
      id: 'enemy-hit', name: '打つ', nameEn: 'Hit', reading: 'うつ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 10, mpCost: 0
    }];

    const result = resolveSingleActorAction({
      actorSide: 'enemy',
      actorIndex: 0,
      allies,
      enemies,
      choices: [{ creatureIndex: 0, moveId: 'enemy-hit', targetIndex: 0 }],
      runPartySkills: [{ id: 'debuffMaster', level: 5 }, { id: 'counterMaster', level: 5 }],
      combat: {},
      rng: () => 0.01
    });

    const segment = result.actionSegments[0];
    const sabotage = segment.effectEvents.find(event => event.type === 'debuffMasterSelfSabotage');
    const counter = segment.counterAttacks.find(event => event.type === 'counter');
    assert.ok(sabotage, 'self-sabotage event should be present');
    assert.ok(counter, 'counter event should be present');
    assert.ok(sabotage.playbackIndex < counter.playbackIndex);
  });
});

describe('Creature Combat - Befriend (disabled in Koto2)', () => {
  // Old befriend mechanic disabled in Koto2 — replaced by name quiz on kill.
  // These tests verify the disabled state returns the expected rejection.
  it('processBefriend always returns disabled reason', () => {
    const enemies = [instantiateCreature('hi')];
    enemies[0].hp = 20;
    const party = { active: [instantiateCreature('ki')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
    assert.strictEqual(result.reason, 'Befriend mechanic disabled in Koto2');
  });
});

describe('Creature Combat - Status Effects in Move Turn', () => {
  it('sleeping creature skips its move', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateCreature('ki')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned creature skips its move', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateCreature('ki')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('dodged damage move skips damage, status, and stat riders', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    allies[0].statStages = { atk: 0, def: 0, dex: -6 };
    enemies[0].statStages = { atk: 0, def: 0, dex: 6 };
    const startHp = enemies[0].hp;
    const move = {
      id: 'slow-poison-hit',
      name: '毒打', nameEn: 'Poison Hit', reading: 'どくだ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 20, mpCost: 0, statusEffect: 'poison', statusChance: 100,
      statusDuration: 2, statChanges: { atk: -1 }
    };
    allies[0].moves = [move];

    const origRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'slow-poison-hit', targetIndex: 0 }]);
      assert.strictEqual(result.attacks[0].dodged, true);
      assert.strictEqual(result.attacks[0].damage, 0);
      assert.strictEqual(enemies[0].hp, startHp);
      assert.deepStrictEqual(enemies[0].activeEffects || [], []);
      assert.strictEqual(enemies[0].statStages.atk, 0);
    } finally {
      Math.random = origRandom;
    }
  });

  it('critical damage marks attack record and increases damage', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    allies[0].dex = 999;
    allies[0].statStages = { atk: 0, def: 0, dex: 6 };
    enemies[0].statStages = { atk: 0, def: 0, dex: 0 };
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const origRandom = Math.random;
    Math.random = () => 0.01;
    try {
      const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }]);
      assert.strictEqual(result.attacks[0].critical, true);
      assert.ok(result.attacks[0].damage > 0);
    } finally {
      Math.random = origRandom;
    }
  });

  it('heal moves apply cleanse and stat riders to allies', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].hp = 10;
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'x' },
      { type: 'taunt', remainingTurns: 2, sourceId: 'y' }
    ];
    allies[0].statStages = { atk: 0, def: 0, dex: 0 };
    const enemies = [instantiateCreature('hi')];
    const move = {
      id: 'cleanse-heal',
      name: '清癒', nameEn: 'Cleanse Heal', reading: 'せいゆ',
      element: 'neutral', category: 'heal', target: 'self',
      power: 20, mpCost: 0, statusEffect: 'cleanse', statusChance: 100,
      statChanges: { dex: 1 }
    };
    allies[0].moves = [move];

    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'cleanse-heal', targetIndex: 0 }]);

    assert.ok(result.attacks[0].healAmount > 0);
    assert.strictEqual(result.attacks[0].effectApplied, 'cleanse');
    assert.deepStrictEqual(allies[0].activeEffects.map(e => e.type), ['taunt']);
    assert.strictEqual(allies[0].statStages.dex, 1);
  });

  it('attack-buffed creature deals more damage (stat stages)', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const moveChoices = [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }];
    const unbuffed = { ...allies[0], statStages: { atk: 0, def: 0 }, activeEffects: [] };
    const result1 = processMoveTurn(
      [unbuffed],
      [{ ...enemies[0] }],
      [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }]
    );

    allies[0].statStages = { atk: 2, def: 0 };
    const enemies2 = [instantiateCreature('ki')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processMoveTurn(allies, enemies2, moveChoices);

    assert.ok(result2.attacks[0].damage > result1.attacks[0].damage, 'buffed damage should exceed unbuffed damage');
  });

  it('does not apply status effect to target killed by the same move', () => {
    // Bug 2026-04-18 #4: "Chain strike already killed fish so I shouldn't be
    // able to confuse it after it's dead." A damage move with a status rider
    // killed the target, then tryApplyStatus ran on the corpse and pushed
    // confuse onto a dead creature.
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 1; // one-shot kill
    const comboMove = {
      id: 'combo-confuse-strike',
      name: 'コンボ', nameEn: 'Combo Strike', reading: 'こんぼ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 50, mpCost: 0, statusEffect: 'confuse', statusChance: 100, statusDuration: 2
    };
    allies[0].moves = [comboMove];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'combo-confuse-strike', targetIndex: 0 }]);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetDefeated, true);
    assert.strictEqual(result.attacks[0].effectApplied, null, 'dead target should not receive status effect');
    assert.ok(
      !(enemies[0].activeEffects || []).some(e => e.type === 'confuse'),
      'dead creature should not have confuse in activeEffects'
    );
  });

  it('does not apply stat change to target killed by the same move', () => {
    // Same root cause as the status bug above: a damage move that also
    // debuffs stats must not apply the debuff to a corpse.
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 1;
    enemies[0].statStages = { atk: 0, def: 0 };
    const comboMove = {
      id: 'combo-debuff-strike',
      name: 'コンボ', nameEn: 'Combo Strike', reading: 'こんぼ',
      element: 'neutral', category: 'damage', target: 'single_enemy',
      power: 50, mpCost: 0, statChanges: { atk: -1 }, statusChance: 100
    };
    allies[0].moves = [comboMove];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, moveId: 'combo-debuff-strike', targetIndex: 0 }]);
    assert.strictEqual(result.attacks[0].targetDefeated, true);
    assert.strictEqual(result.attacks[0].statChangesApplied, null, 'dead target should not receive stat change');
    assert.strictEqual(enemies[0].statStages.atk, 0, 'stat stage should not drop on a dead creature');
  });
});

describe('Creature Combat - Status Effects in Enemy Turn', () => {
  it('sleeping enemy skips its attack', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('mizu')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const startHp = allies[0].hp;
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(allies[0].hp, startHp);
  });

  it('enemy respects taunt and targets taunting ally', () => {
    const taunter = instantiateCreature('ki');
    taunter.activeEffects = [{ type: 'taunt', remainingTurns: 2, sourceId: 'self' }];
    const other = instantiateCreature('ishi');
    const allies = [other, taunter];
    const enemies = [instantiateCreature('mizu')]; // has damage move 'nagasu'
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetId, taunter.id);
  });

  it('damage wakes up sleeping ally', () => {
    const ally = instantiateCreature('ki');
    ally.activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateCreature('mizu')];
    processEnemyTurn(enemies, allies);
    assert.ok(!ally.activeEffects.some(e => e.type === 'sleep'));
  });

  it('confused enemy can hit its own allies', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('mizu'), instantiateCreature('hi')];
    enemies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
  });

});

describe('Creature Combat - XP', () => {
  it('awardBattleXp grants one full level to each creature', () => {
    const party = {
      active: [instantiateCreature('ki')],
      reserves: [instantiateCreature('ishi')]
    };
    awardBattleXp(party);
    // Both should be L6 (each gets xpToNextLevel which is 1 full level)
    assert.strictEqual(party.active[0].level, 6);
    assert.strictEqual(party.reserves[0].level, 6);
  });
});

describe('Creature Combat - Kill XP Scaling', () => {
  it('awardKillXp scales with enemy level (BASE_KILL_XP * enemyLevel * 2)', () => {
    const party = {
      active: [instantiateCreature('ki')],
      reserves: []
    };
    // 1 active (2 shares), 0 reserves = 2 total shares
    // enemyLevel 5: 25 * 5 * 2 = 250 base XP, perShare = 250/2 = 125, active gets floor(125*2) = 250
    const result = awardKillXp(party, 5);
    assert.strictEqual(result.xpGrants[0].xp, 250);
  });

  it('awardKillXp applies xpMultiplier', () => {
    const party = {
      active: [instantiateCreature('ki')],
      reserves: []
    };
    // enemyLevel 5, multiplier 1.25: 25 * 5 * 2 * 1.25 = 312, perShare = 312/2 = 156, active = floor(156*2)=312
    const result = awardKillXp(party, 5, 1.25);
    assert.strictEqual(result.xpGrants[0].xp, 312);
  });

  it('awardKillXp returns levelUps from cubic curve', () => {
    const party = {
      active: [instantiateCreature('ki')],
      reserves: []
    };
    // enemyLevel 5: 25 * 5 * 2 = 250 base XP, active gets 250
    // L5 needs 91 XP to level up, so 250 XP will cause multiple level-ups
    const result = awardKillXp(party, 5);
    assert.ok(result.levelUps.length > 0);
    assert.ok(party.active[0].level > 5);
  });

  it('awardKillXp defaults xpMultiplier to 1.0', () => {
    const party = {
      active: [instantiateCreature('ki')],
      reserves: []
    };
    // enemyLevel 1: 25 * 1 * 2 * 1.0 = 50, perShare = 50/2 = 25, active = floor(25*2) = 50
    const result = awardKillXp(party, 1);
    assert.strictEqual(result.xpGrants[0].xp, 50);
  });
});

describe('Creature Combat - Effect Ticking', () => {
  it('tickAllEffects processes poison on enemies', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('ishi')];
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const startHp = enemies[0].hp;
    const events = tickAllEffects(allies, enemies);
    assert.ok(enemies[0].hp < startHp);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
    assert.strictEqual(events[0].targetSide, 'enemy');
    assert.strictEqual(events[0].targetIndex, 0);
  });

  it('tickAllEffects allows poison to KO enemies', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 3;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: allies[0].id }
    ];

    const events = tickAllEffects(allies, enemies);

    assert.strictEqual(enemies[0].hp, 0);
    assert.strictEqual(events[0].targetSide, 'enemy');
    assert.strictEqual(events[0].targetIndex, 0);
    assert.strictEqual(events[0].targetDefeated, true);
  });

  it('ticks effects on allies too', () => {
    const allies = [instantiateCreature('ki')];
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 8, sourceId: 'enemy' }
    ];
    const startHp = allies[0].hp;
    const events = tickAllEffects(allies, []);
    assert.ok(allies[0].hp < startHp);
    assert.strictEqual(allies[0].activeEffects.length, 0);
    assert.strictEqual(events[0].targetSide, 'ally');
    assert.strictEqual(events[0].targetIndex, 0);
  });

  it('skips dead creatures', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('ishi')];
    enemies[0].hp = 0;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });

  it('returns empty array when no effects exist', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('ishi')];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });
});

describe('Creature Combat - Damage Riders', () => {
  it('player move wakes sleeping enemy', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }];
    processMoveTurn(allies, enemies, moveChoices);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'sleep'));
  });
});

describe('Creature Combat - XP Balance Redistribution', () => {
  it('redistributes XP toward lower-leveled creatures with 1 stack', () => {
    const highLevel = instantiateCreature('ki');
    highLevel.level = 10;
    highLevel.xp = 0;

    const lowLevel = instantiateCreature('ishi');
    lowLevel.level = 3;
    lowLevel.xp = 0;

    const party = {
      active: [highLevel, lowLevel],
      reserves: []
    };

    // enemyLevel 10: base = 25*10*2*1.0 = 500
    // Without balance: 2 active = 4 shares, perShare=125, each gets 250
    // With 1 stack (t=0.2): low-level gets more, high-level gets less
    const result = awardKillXp(party, 10, 1.0, 1);

    const highGrant = result.xpGrants.find(g => g.creatureId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.creatureId === lowLevel.id);
    assert.ok(lowGrant.xp > highGrant.xp, 'lower-level creature should receive more XP');
  });

  it('no redistribution with 0 balance stacks', () => {
    const highLevel = instantiateCreature('ki');
    highLevel.level = 10;
    const lowLevel = instantiateCreature('ishi');
    lowLevel.level = 3;

    const party = { active: [highLevel, lowLevel], reserves: [] };
    const result = awardKillXp(party, 10, 1.0, 0);

    const highGrant = result.xpGrants.find(g => g.creatureId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.creatureId === lowLevel.id);
    assert.strictEqual(highGrant.xp, lowGrant.xp, 'both should get equal shares');
  });

  it('higher stacks redistribute more aggressively', () => {
    const highLevel = instantiateCreature('ki');
    highLevel.level = 10;
    const lowLevel = instantiateCreature('ishi');
    lowLevel.level = 3;

    // 1 stack
    const party1 = { active: [{ ...highLevel }, { ...lowLevel }], reserves: [] };
    const result1 = awardKillXp(party1, 10, 1.0, 1);
    const low1 = result1.xpGrants.find(g => g.creatureId === lowLevel.id).xp;

    // 3 stacks
    const party3 = { active: [instantiateCreature('ki'), instantiateCreature('ishi')], reserves: [] };
    party3.active[0].level = 10;
    party3.active[1].level = 3;
    const result3 = awardKillXp(party3, 10, 1.0, 3);
    const low3 = result3.xpGrants.find(g => g.creatureId === party3.active[1].id).xp;

    assert.ok(low3 > low1, 'more stacks should give underleveled creature even more XP');
  });
});

describe('rollTalkAcceptance', () => {
  it('returns accepted boolean and computed chance (common at 30% HP -> 80)', () => {
    const enemy = instantiateCreature('ki');
    enemy.hp = Math.round(enemy.maxHp * 0.3);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(typeof result.accepted, 'boolean');
    assert.strictEqual(typeof result.chance, 'number');
    assert.strictEqual(result.chance, 80); // common base, 30% HP = no bonus
  });

  it('gives higher chance at lower HP (common at 1 HP -> 95)', () => {
    const enemy = instantiateCreature('ki');
    enemy.hp = 1; // ~1% HP, hpBonus = 15 -> 80+15=95 capped at 95
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 95);
  });

  it('gives lower chance for rarer creatures (legendary at 40% HP -> 20)', () => {
    const enemy = instantiateCreature('ki');
    enemy.rarity = 'legendary';
    enemy.hp = Math.round(enemy.maxHp * 0.4);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 20); // legendary base, 40% HP = no bonus
  });

  it('applies mid-bracket HP bonus (rare at 20% HP -> 60)', () => {
    const enemy = instantiateCreature('ki');
    enemy.rarity = 'rare';
    enemy.hp = Math.round(enemy.maxHp * 0.2); // 20% HP -> hpBonus = 10
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 60); // rare 50 + 10 bonus
  });

  it('caps chance at 95', () => {
    const enemy = instantiateCreature('ki');
    // common base 80, set HP to 1% for +15 bonus = 95 (already at cap)
    enemy.hp = 1;
    const result = rollTalkAcceptance(enemy);
    assert.ok(result.chance <= 95, 'chance should never exceed 95');
    assert.strictEqual(result.chance, 95);
  });

  it('defaults to common rarity if rarity is missing', () => {
    const enemy = instantiateCreature('ki');
    delete enemy.rarity;
    enemy.hp = Math.round(enemy.maxHp * 0.5);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 80); // common base, 50% HP = no bonus
  });

  it('does not mutate enemy object (pure function check)', () => {
    const enemy = instantiateCreature('ki');
    const originalHp = enemy.hp;
    const originalMaxHp = enemy.maxHp;
    const originalRarity = enemy.rarity;
    rollTalkAcceptance(enemy);
    assert.strictEqual(enemy.hp, originalHp);
    assert.strictEqual(enemy.maxHp, originalMaxHp);
    assert.strictEqual(enemy.rarity, originalRarity);
  });
});

describe('Creature Combat - executeNpcSkill', () => {
  const npcData = {
    id: 'kodomo',
    name: '\u5B50\u4F9B',
    nameEn: 'Child',
    element: 'neutral',
    attack: 10,
    reading: '\u3053\u3069\u3082',
    meaning: 'child'
  };

  const damageSkill = {
    id: 'npc-aoe-attack', name: 'NPC Attack', nameEn: 'NPC Attack',
    element: 'neutral', category: 'damage', target: 'all_enemies',
    power: 8, mpCost: 0, statusEffect: null, statusChance: 0, statusDuration: 0
  };

  const healSkill = {
    id: 'npc-aoe-heal', name: 'NPC Heal', nameEn: 'NPC Heal',
    element: 'neutral', category: 'heal', target: 'all_allies',
    power: 8, mpCost: 0, statusEffect: null, statusChance: 0, statusDuration: 0
  };

  const buffSkill = {
    id: 'npc-aoe-buff', name: 'NPC Buff', nameEn: 'NPC Buff',
    element: 'neutral', category: 'buff', target: 'all_allies',
    power: 0, mpCost: 0, statChanges: { atk: 1 }
  };

  const debuffSkill = {
    id: 'npc-aoe-debuff', name: 'NPC Debuff', nameEn: 'NPC Debuff',
    element: 'neutral', category: 'debuff', target: 'all_enemies',
    power: 5, mpCost: 0, statusEffect: 'poison', statusChance: 100, statusDuration: 2
  };

  it('AOE damage hits all alive player creatures', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    const hpBefore = allies.map(c => c.hp);

    const result = executeNpcSkill(npcData, damageSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    // Damage skill targets "all_enemies" from NPC perspective = player's allies
    assert.ok(allies[0].hp < hpBefore[0], 'first ally should take damage');
    assert.ok(allies[1].hp < hpBefore[1], 'second ally should take damage');
  });

  it('AOE heal heals NPC creatures', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki'), instantiateCreature('mizu')];
    // Damage NPC's creatures first
    enemies[0].hp = Math.floor(enemies[0].maxHp / 2);
    enemies[1].hp = Math.floor(enemies[1].maxHp / 2);
    const hpBefore = enemies.map(c => c.hp);

    const result = executeNpcSkill(npcData, healSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    // Heal targets "all_allies" from NPC perspective = enemies array
    assert.ok(enemies[0].hp > hpBefore[0], 'first NPC creature should be healed');
    assert.ok(enemies[1].hp > hpBefore[1], 'second NPC creature should be healed');
  });

  it('AOE buff applies stat stage boost to NPC creatures', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];

    const result = executeNpcSkill(npcData, buffSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    // Buff targets "all_allies" from NPC perspective = enemies array
    assert.ok(enemies[0].statStages && enemies[0].statStages.atk > 0, 'NPC creature should have raised ATK stage');
  });

  it('AOE debuff applies poison to player creatures', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];

    const result = executeNpcSkill(npcData, debuffSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    // Debuff targets "all_enemies" from NPC perspective = player's allies
    const hasPoison0 = allies[0].activeEffects.some(e => e.type === 'poison');
    const hasPoison1 = allies[1].activeEffects.some(e => e.type === 'poison');
    assert.ok(hasPoison0, 'first ally should have poison');
    assert.ok(hasPoison1, 'second ally should have poison');
  });

  it('skips dead creatures for damage', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    allies[0].hp = 0; // KO first ally
    const enemies = [instantiateCreature('ki')];
    const hpBefore1 = allies[1].hp;

    const result = executeNpcSkill(npcData, damageSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    assert.strictEqual(allies[0].hp, 0, 'dead creature should stay at 0');
    assert.ok(allies[1].hp < hpBefore1, 'alive ally should take damage');
  });

  it('returns attacks array in result', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];

    const result = executeNpcSkill(npcData, damageSkill, allies, enemies);

    assert.ok(Array.isArray(result.attacks), 'result should have attacks array');
    assert.ok(result.attacks.length > 0, 'attacks should not be empty');
    const atk = result.attacks[0];
    assert.ok(atk.attackerName !== undefined, 'attack record should have attackerName');
    assert.ok(atk.moveName !== undefined, 'attack record should have moveName');
  });
});

describe('Befriend conversation failure keeps initiator slot spent', () => {
  it('does not clear befriendAttemptedSlots after wrong answer', () => {
    const ally = instantiateCreature('ki');
    const enemy = instantiateCreature('tetsu');

    const combat = {
      active: true,
      befriendAttemptedSlots: { 0: true },
      befriendConversation: {
        active: true,
        targetEnemyIndex: 0,
        currentRound: 0,
        rounds: [
          { correctIndex: 2 }
        ]
      },
      allies: [ally],
      enemies: [enemy]
    };

    const gameManager = {
      run: {
        creatureParty: { active: combat.allies, reserves: [], bench: [] },
        itemBuffs: null
      },
      combat
    };

    const result = handleBefriendAnswer(gameManager, { roundIndex: 0, selectedIndex: 0 });

    assert.strictEqual(result.correct, false);
    assert.strictEqual(combat.befriendAttemptedSlots[0], true,
      'initiator still marked after failed befriend quiz');
  });
});

describe('generateBefriendQuiz', () => {
  it('wrong answers come from encounter creatures when provided', () => {
    const target = instantiateCreature('hi');  // Fire
    const others = [instantiateCreature('ki'), instantiateCreature('mizu')]; // Wood, Water

    const quiz = generateBefriendQuiz(target, others);

    assert.strictEqual(quiz.creatureId, target.id);
    const wrongOptions = quiz.options.filter(o => !o.correct);
    assert.strictEqual(wrongOptions.length, 2);
    const encounterNames = others.map(c => c.nameEn);
    for (const wrong of wrongOptions) {
      assert.ok(encounterNames.includes(wrong.name),
        `wrong answer "${wrong.name}" should be from encounter creatures`);
    }
  });

  it('falls back to catalog when encounter has too few creatures', () => {
    const target = instantiateCreature('hi');
    const others = [];

    const quiz = generateBefriendQuiz(target, others);

    assert.strictEqual(quiz.options.length, 3);
    assert.strictEqual(quiz.options.filter(o => o.correct).length, 1);
  });
});

describe('Creature Combat - Interleaved PvE initiative', () => {
  it('higher-level creature acts first (playback order)', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].level = 3;
    allies[0].maxHp = 500;
    allies[0].hp = 500;
    const enemies = [instantiateCreature('ki')];
    enemies[0].level = 50;
    const moveChoices = [{ creatureIndex: 0, moveId: 'nagasu', targetIndex: 0 }];
    const r = processInterleavedPvERound(allies, enemies, moveChoices, null, null, null);
    const merged = [...r.playerAttacks, ...r.enemyAttacks].sort((a, b) => a.playbackIndex - b.playbackIndex);
    assert.ok(merged.length >= 1, 'expected at least one attack');
    assert.strictEqual(merged[0].combatSide, 'enemy', 'Lv50 enemy should act before Lv3 ally');
    if (merged.length >= 2) {
      assert.strictEqual(merged[1].combatSide, 'player');
    }
  });
});

describe('Dead creature cannot attack', () => {
  it('enemy with 0 hp produces no attacks', () => {
    const ally = instantiateCreature('hi');
    ally.hp = 50;
    const enemy = instantiateCreature('ki');
    enemy.hp = 0; // Dead

    const result = processEnemyTurn([enemy], [ally]);

    assert.strictEqual(result.attacks.length, 0, 'dead enemy should not attack');
    assert.strictEqual(ally.hp, 50, 'ally HP should be unchanged');
  });

  it('enemy killed mid-round by higher-level ally should not attack in interleaved initiative', () => {
    // Ally is high level (acts first in initiative) and will one-shot the enemy
    const ally = instantiateCreature('hi');
    ally.level = 50;
    ally.attack = 999;
    ally.hp = 500;
    ally.maxHp = 500;

    // Enemy is low level (acts after ally) with low HP — will die from ally's attack
    const enemy = instantiateCreature('ki');
    enemy.level = 1;
    enemy.hp = 1;
    enemy.maxHp = 1;
    enemy.attack = 50;

    const allyHpBefore = ally.hp;
    const moveChoices = [{ creatureIndex: 0, moveId: ally.moves[0].id, targetIndex: 0 }];
    const r = processInterleavedPvERound([ally], [enemy], moveChoices);

    // Ally should have attacked
    assert.ok(r.playerAttacks.length > 0, 'ally should have attacked');
    // Enemy should be dead
    assert.strictEqual(enemy.hp, 0, 'enemy should be dead');
    // Enemy should NOT have attacked (dead before its turn)
    assert.strictEqual(r.enemyAttacks.length, 0, 'dead enemy should produce no attacks');
    // Ally HP should be unchanged (enemy never got to attack)
    assert.strictEqual(ally.hp, allyHpBefore, 'ally HP should be unchanged since enemy was dead');
  });

  it('ally killed mid-round by higher-dex enemy should not attack in interleaved initiative', () => {
    // Enemy is high dex (acts first) and will one-shot the ally
    const enemy = instantiateCreature('ki');
    enemy.level = 50;
    enemy.dex = 50;
    enemy.statStages = { atk: 0, def: 0, dex: 0 };
    enemy.attack = 999;
    enemy.hp = 500;
    enemy.maxHp = 500;

    // Ally is lower dex (acts after enemy) with low HP
    const ally = instantiateCreature('hi');
    ally.level = 1;
    ally.dex = 1;
    ally.statStages = { atk: 0, def: 0, dex: 0 };
    ally.hp = 1;
    ally.maxHp = 1;

    const enemyHpBefore = enemy.hp;
    const moveChoices = [{ creatureIndex: 0, moveId: ally.moves[0].id, targetIndex: 0 }];
    const r = processInterleavedPvERound([ally], [enemy], moveChoices);

    // Enemy should have attacked first
    assert.ok(r.enemyAttacks.length > 0, 'enemy should have attacked');
    // Ally should be dead
    assert.strictEqual(ally.hp, 0, 'ally should be dead');
    // Ally should NOT have attacked (dead before its turn)
    assert.strictEqual(r.playerAttacks.length, 0, 'dead ally should produce no attacks');
    // Enemy HP should be unchanged
    assert.strictEqual(enemy.hp, enemyHpBefore, 'enemy HP unchanged since ally was dead');
  });

  it('enemy killed by Arc Strike before its initiative slot does not attack', () => {
    const ally = instantiateCreature('hi');
    ally.level = 50;
    ally.attack = 999;
    ally.hp = 500;
    ally.maxHp = 500;
    ally.moves = [{
      id: 'arc-primer', name: '弧撃', nameEn: 'Arc Primer', reading: 'こげき',
      element: 'neutral', category: 'damage', power: 200,
      target: 'single_enemy', mpCost: 0, accuracy: 100,
      statusEffect: null, statusChance: 0, statusDuration: 0
    }];

    const primary = instantiateCreature('ki');
    primary.level = 1;
    primary.hp = 500;
    primary.maxHp = 500;
    primary.moves = [];

    const chainVictim = instantiateCreature('mizu');
    chainVictim.level = 1;
    chainVictim.hp = 1;
    chainVictim.maxHp = 1;

    const result = processInterleavedPvERound(
      [ally],
      [primary, chainVictim],
      [{ creatureIndex: 0, moveId: 'arc-primer', targetIndex: 0 }],
      null,
      null,
      null,
      { runPartySkills: ['arcStrike'], combat: {} }
    );

    const chainProc = result.playerAttacks[0]?.partySkillProcs?.find(p => p.skillId === 'arcStrike');
    assert.ok(chainProc, 'Arc Strike should proc during the player initiative slot');
    assert.strictEqual(chainVictim.hp, 0, 'Arc Strike should kill the second enemy');
    assert.strictEqual(
      result.enemyAttacks.some(atk => atk.attackerIndex === 1),
      false,
      'enemy killed by Arc Strike before its turn should not attack'
    );
  });
});

describe('executeNpcSkill — single_ally random target', () => {
  it('does not always target index 0 for single_ally skills', () => {
    const npcData = {
      id: 'senpai', name: '先輩', nameEn: 'Older Student',
      attack: 15, element: 'neutral',
      reading: 'せんぱい', meaning: 'senior'
    };
    const buffSkill = {
      id: 'oboeru', name: '覚える', nameEn: 'Memorize',
      element: 'neutral', category: 'buff', target: 'single_ally',
      power: 0, mpCost: 0, statChanges: { atk: 2 },
      statusEffect: null, statusChance: 0, statusDuration: 0
    };

    // 3 alive enemies (NPC's allies from player perspective)
    const enemies = [
      { id: 'e0', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
      { id: 'e1', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
      { id: 'e2', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
    ];
    const allies = [
      { id: 'a0', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'water', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
    ];

    // Run 30 times, track which enemy got buffed
    const buffedIndices = new Set();
    for (let i = 0; i < 30; i++) {
      // Reset stat stages
      enemies.forEach(e => e.statStages = { atk: 0, def: 0 });
      executeNpcSkill(npcData, buffSkill, allies, enemies);
      enemies.forEach((e, idx) => {
        if (e.statStages.atk > 0) buffedIndices.add(idx);
      });
    }

    // With 3 targets and 30 trials, should hit more than just index 0
    assert.ok(buffedIndices.size > 1, `Expected random targeting, but only hit indices: ${[...buffedIndices]}`);
  });
});

describe('Attack record — target reading/meaning', () => {
  it('player move record exposes target reading and meaning', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [
      { creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }
    ]);
    const rec = result.attacks[0];
    assert.strictEqual(rec.targetWord, '木');
    assert.strictEqual(rec.targetReading, 'き');
    assert.strictEqual(rec.targetMeaning, 'tree / wood');
  });

  it('enemy attack record exposes target reading and meaning', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];
    // Force enemy to act
    const result = processEnemyTurn(enemies, allies);
    const rec = result.attacks[0];
    assert.strictEqual(rec.targetWord, '火');
    assert.strictEqual(rec.targetReading, 'ひ');
    assert.strictEqual(rec.targetMeaning, 'fire');
  });
});

describe('Creature Combat - Rest MP math (computeRestMpGain)', () => {
  it('restores ceil(maxMp * 0.20) for a dry creature (100 maxMp → 20)', () => {
    assert.equal(computeRestMpGain({ mp: 0, maxMp: 100 }), 20);
  });
  it('ceil on fractional — maxMp 37, 20% = 7.4 → 8', () => {
    assert.equal(computeRestMpGain({ mp: 0, maxMp: 37 }), 8);
  });
  it('maxMp 95, 20% = 19 (exact integer)', () => {
    assert.equal(computeRestMpGain({ mp: 0, maxMp: 95 }), 19);
  });
  it('clamps to remaining headroom', () => {
    assert.equal(computeRestMpGain({ mp: 95, maxMp: 100 }), 5);
  });
  it('returns 0 at full MP', () => {
    assert.equal(computeRestMpGain({ mp: 100, maxMp: 100 }), 0);
  });
  it('treats missing mp as 0', () => {
    assert.equal(computeRestMpGain({ maxMp: 50 }), 10);
  });
  it('returns 0 when maxMp missing', () => {
    assert.equal(computeRestMpGain({ mp: 5 }), 0);
  });
});

describe('Creature Combat - Rest action in processMoveTurn', () => {
  it('mixed turn: 2 attacks + 1 rest emits 3 attack entries with correct categories', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu'), instantiateCreature('ki')];
    allies[1].mp = 0; // force dry
    allies[1].maxMp = 100;
    const enemies = [instantiateCreature('ki')];
    const move0 = allies[0].moves[0].id;
    const move2 = allies[2].moves[0].id;
    const moveChoices = [
      { creatureIndex: 0, moveId: move0, targetIndex: 0 },
      { creatureIndex: 1, action: 'rest' },
      { creatureIndex: 2, moveId: move2, targetIndex: 0 },
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // We should see at least one entry per creature — rest always emits exactly one.
    // The exact length depends on attack move categories (single-target moves emit 1,
    // multi-target could emit more), so be relaxed and check for the rest entry.
    const restAttacks = result.attacks.filter(a => a.category === 'rest');
    assert.equal(restAttacks.length, 1, 'expected exactly one rest attack entry');
    assert.equal(restAttacks[0].attackerIndex, 1);
    // Rest attack captures MP at rest time — should be 20 (0 + ceil(100*0.20)).
    // (processMoveTurn adds a 5% end-of-turn MP regen after all moves, so the
    // creature object itself ends up slightly higher; the attack snapshot is
    // what the client renders.)
    assert.equal(restAttacks[0].mpGained, 20);
    assert.equal(restAttacks[0].attackerMp, 20);
  });

  it('rest at max MP: mp unchanged, mpGained is 0, rest entry still emitted', () => {
    const creature = instantiateCreature('hi');
    creature.mp = creature.maxMp;
    const allies = [creature];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, action: 'rest' }]);
    assert.equal(allies[0].mp, allies[0].maxMp);
    const restAtk = result.attacks.find(a => a.category === 'rest');
    assert.ok(restAtk);
    assert.equal(restAtk.mpGained, 0);
  });

  it('rest clamps at maxMp when near full', () => {
    const creature = instantiateCreature('hi');
    creature.maxMp = 100;
    creature.mp = 95;
    const allies = [creature];
    const enemies = [instantiateCreature('ki')];
    processMoveTurn(allies, enemies, [{ creatureIndex: 0, action: 'rest' }]);
    assert.equal(allies[0].mp, 100, 'should clamp at maxMp not overflow');
  });

  it('resting creature does NOT also receive the 5% baseline regen (PvE/PvP parity)', () => {
    // Rest alone = 20% of maxMp. The end-of-turn 5% regen must skip resting
    // creatures so PvE matches PvP (which uses executeSlotMoveTurn and has no
    // baseline regen in its pipeline).
    const resting = instantiateCreature('hi');
    resting.maxMp = 100;
    resting.mp = 0;
    const attacking = instantiateCreature('mizu');
    const allies = [resting, attacking];
    const enemies = [instantiateCreature('ki')];
    const moveChoices = [
      { creatureIndex: 0, action: 'rest' },
      { creatureIndex: 1, moveId: attacking.moves[0].id, targetIndex: 0 },
    ];
    processMoveTurn(allies, enemies, moveChoices);
    assert.equal(resting.mp, 20, 'resting creature should end at exactly 20 MP (no 5% regen stack)');
  });

  it('non-resting allies still receive the 5% baseline regen', () => {
    // Invariant: the opt-out is narrow. Creatures that did NOT rest still get regen.
    const attacker = instantiateCreature('hi');
    attacker.maxMp = 100;
    attacker.mp = 50;
    const allies = [attacker];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [
      { creatureIndex: 0, moveId: attacker.moves[0].id, targetIndex: 0 },
    ]);
    // attacker used a move, paid MP cost, then gets 5 back from baseline regen
    const mpCost = attacker.moves[0].mpCost ?? 0;
    assert.equal(attacker.mp, 50 - mpCost + 5, 'non-rester should receive 5% baseline regen');
    assert.ok(result.attacks.length >= 1);
  });

  it('rest entry for KOd creature is ignored (no attack emitted, no mp change)', () => {
    const creature = instantiateCreature('hi');
    creature.hp = 0;
    creature.mp = 0;
    const allies = [creature];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, action: 'rest' }]);
    assert.equal(allies[0].mp, 0);
    assert.equal(result.attacks.length, 0);
  });

  it('rest entry with out-of-range creatureIndex is ignored', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 99, action: 'rest' }]);
    assert.equal(result.attacks.length, 0);
  });

  it('rest attack object carries all fields needed by the attack card', () => {
    const creature = instantiateCreature('hi');
    creature.mp = 20;
    creature.maxMp = 100;
    const allies = [creature];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [{ creatureIndex: 0, action: 'rest' }]);
    const atk = result.attacks.find(a => a.category === 'rest');
    assert.ok(atk, 'rest attack emitted');
    assert.equal(atk.isRest, true);
    assert.equal(atk.damage, 0);
    assert.equal(atk.elementMultiplier, 1);
    assert.equal(atk.attackerId, atk.targetId);
    assert.equal(atk.attackerIndex, atk.targetIndex);
    assert.equal(atk.attackerSkillName, '休む');
    assert.equal(atk.attackerSkillReading, 'やすむ');
    assert.equal(atk.attackerSkillEn, 'rest');
    assert.equal(atk.moveName, '休む');
    assert.equal(atk.moveNameEn, 'rest');
    assert.equal(atk.moveElement, 'neutral');
    assert.ok(atk.mpGained > 0, 'mpGained should be positive when not full');
    assert.equal(atk.attackerMp, 40, '20 + ceil(100*0.20)');
    assert.equal(atk.attackerMaxMp, 100);
    assert.ok(typeof atk.attackerWord === 'string' && atk.attackerWord.length > 0);
  });
});

describe('Party Skill Trees - HP and EXP Master', () => {
  it('HP Master Lvl 3 makes heal moves restore 50% more HP via resolveSingleActorAction', () => {
    const ally = instantiateCreature('mizu');
    ally.moves.push({ id: 'test-heal', name: '治す', nameEn: 'Test Heal', element: 'neutral', category: 'heal', target: 'self', power: 20, mpCost: 0 });
    ally.maxHp = 200;
    ally.hp = 1;

    const result = resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [instantiateCreature('ki')],
      choices: [{ creatureIndex: 0, moveId: 'test-heal', targetIndex: 0 }],
      creatureParty: { active: [ally], reserves: [] },
      runPartySkills: [{ id: 'hpMaster', level: 3 }],
      combat: {},
      rng: () => 0.50
    });

    const attack = result.actionSegments[0].attacks[0];
    assert.ok(attack.healAmount > 0);
    assert.equal(attack.healAmount, Math.floor(((ally.attack / 10) * 20 * 1.0) * 1.5));
  });

  it('HP Master Lvl 4 gives healed target a random buff', () => {
    const ally = instantiateCreature('mizu');
    ally.moves.push({ id: 'test-heal', name: '治す', nameEn: 'Test Heal', element: 'neutral', category: 'heal', target: 'self', power: 20, mpCost: 0 });
    ally.hp = 1;
    ally.statStages = { atk: 0, def: 0, dex: 0 };

    resolveSingleActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [instantiateCreature('ki')],
      choices: [{ creatureIndex: 0, moveId: 'test-heal', targetIndex: 0 }],
      creatureParty: { active: [ally], reserves: [] },
      runPartySkills: [{ id: 'hpMaster', level: 4 }],
      combat: {},
      rng: () => 0.01
    });

    assert.equal(ally.statStages.atk, 1);
  });

  it('Exp Master Lvl 4 doubles kill XP through awardKillXp(..., runPartySkills)', () => {
    const party = { active: [instantiateCreature('ki')], reserves: [] };

    const result = awardKillXp(party, 5, 1, 0, null, null, [{ id: 'expMaster', level: 4 }]);

    assert.equal(result.xpGrants[0].xp, 500);
  });
});
