import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processMoveTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  awardBattleXp,
  awardKillXp,
  tickAllEffects,
  rollTalkAcceptance,
  executeNpcSkill,
  handleBefriendAnswer
} from '../../../src/game/services/creature-combat-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';

describe('Creature Combat - Move Turn', () => {
  it('each allied creature uses a move against the enemy', () => {
    const allies = [instantiateCreature('hi'), instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'tataku', targetIndex: 0 }
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
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'tataku', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // Only mizu (index 1) should attack
    assert.strictEqual(result.attacks.length, 1);
  });

  it('includes move fields in attack records', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('hi')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerId, 'mizu');
    assert.ok(atk.attackerNameJp, 'should have attacker Japanese name');
    assert.strictEqual(atk.moveId, 'tataku');
    assert.ok(atk.moveName, 'should have move Japanese name');
    assert.strictEqual(atk.moveNameEn, 'Strike');
    assert.ok(atk.targetNameJp, 'should have target Japanese name');
    assert.strictEqual(atk.targetId, 'hi');
  });

  it('deducts MP when using a move', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    const startMp = allies[0].mp;
    const moveCost = allies[0].moves.find(m => m.id === 'tataku').mpCost;
    const moveChoices = [
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }
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
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }
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
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'tataku', targetIndex: 1 }
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

describe('Creature Combat - Enemy Turn', () => {
  it('enemy attacks allied creatures using its first move', () => {
    const allies = [instantiateCreature('ki')];
    const enemies = [instantiateCreature('mizu')]; // mizu has 'tataku' (damage move)
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
    assert.strictEqual(atk.moveId, 'tataku');
    assert.ok(atk.moveName);
    assert.ok(atk.moveNameEn);
    assert.strictEqual(atk.targetNameJp, '\u6728');
    assert.strictEqual(atk.attackerIndex, 0);
    assert.strictEqual(atk.targetIndex, 0);
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
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned creature skips its move', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateCreature('ki')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('hasted creature attacks twice', () => {
    const allies = [instantiateCreature('mizu')];
    allies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 2, 'hasted creature should attack twice');
    assert.ok(!allies[0].activeEffects.some(e => e.type === 'haste'));
  });

  it('attack-buffed creature deals more damage', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const result1 = processMoveTurn(
      [{ ...allies[0], activeEffects: [] }],
      [{ ...enemies[0] }],
      [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }]
    );

    allies[0].activeEffects = [{ type: 'attack_buff', percent: 100, remainingTurns: 2, sourceId: 'x' }];
    const enemies2 = [instantiateCreature('ki')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processMoveTurn(allies, enemies2, moveChoices);

    assert.ok(result2.attacks[0].damage > result1.attacks[0].damage, 'buffed damage should exceed unbuffed damage');
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
    const enemies = [instantiateCreature('mizu')]; // has damage move 'tataku'
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetId, taunter.id);
  });

  it('shield reduces damage to ally', () => {
    // First, measure unshielded damage
    const unshieldedAlly = instantiateCreature('ki');
    unshieldedAlly.activeEffects = [];
    const unshieldedEnemies = [instantiateCreature('mizu')];
    const unshieldedResult = processEnemyTurn(unshieldedEnemies, [unshieldedAlly]);

    // Then, measure shielded damage
    const shieldedAlly = instantiateCreature('ki');
    shieldedAlly.activeEffects = [{ type: 'shield', percent: 50, remainingTurns: 2, sourceId: 'x' }];
    const shieldedEnemies = [instantiateCreature('mizu')];
    const shieldedResult = processEnemyTurn(shieldedEnemies, [shieldedAlly]);

    assert.strictEqual(shieldedResult.attacks.length, 1);
    assert.ok(shieldedResult.attacks[0].damage < unshieldedResult.attacks[0].damage,
      'shielded damage should be less than unshielded damage');
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

  it('hasted enemy attacks twice', () => {
    const allies = [instantiateCreature('ki')];
    allies[0].hp = 9999;
    allies[0].maxHp = 9999;
    const enemies = [instantiateCreature('mizu')];
    enemies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 2);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'haste'));
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

describe('Creature Combat - Shield in Move Turn', () => {
  it('shielded enemy takes reduced damage from player moves', () => {
    const allies = [instantiateCreature('mizu')]; // 'tataku' does damage
    const enemies = [instantiateCreature('ki')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    // 90% shield -- should drastically reduce damage
    enemies[0].activeEffects = [{ type: 'shield', percent: 90, remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // With 90% shield, damage should be very small
    assert.ok(result.attacks[0].damage < allies[0].attack);
  });

  it('player move wakes sleeping enemy', () => {
    const allies = [instantiateCreature('mizu')];
    const enemies = [instantiateCreature('ki')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
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

describe('Creature Combat - Temp Attack Flat Bonus', () => {
  it('processMoveTurn uses flat attack bonus from activeEffects', () => {
    // Measure unbuffed damage first
    const unbuffedAlly = instantiateCreature('mizu');
    unbuffedAlly.activeEffects = [];
    const unbuffedEnemy = instantiateCreature('ki');
    unbuffedEnemy.hp = 9999;
    unbuffedEnemy.maxHp = 9999;
    const moveChoices = [{ creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }];
    const unbuffedResult = processMoveTurn([unbuffedAlly], [unbuffedEnemy], moveChoices);

    // Measure buffed damage
    const buffedAlly = instantiateCreature('mizu');
    buffedAlly.activeEffects = [{ type: 'temp_attack_flat', value: 50, remainingTurns: 5 }];
    const buffedEnemy = instantiateCreature('ki');
    buffedEnemy.hp = 9999;
    buffedEnemy.maxHp = 9999;
    const buffedResult = processMoveTurn([buffedAlly], [buffedEnemy], moveChoices);

    assert.ok(buffedResult.attacks.length >= 1);
    assert.ok(buffedResult.attacks[0].damage > unbuffedResult.attacks[0].damage,
      'flat-buffed damage should exceed unbuffed damage');
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
    baseWord: '\u5B50\u4F9B',
    baseReading: '\u3053\u3069\u3082',
    baseMeaning: 'child'
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
    power: 25, mpCost: 0, statusEffect: 'attack_buff', statusChance: 100, statusDuration: 2
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

  it('AOE buff applies attack_buff to NPC creatures', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];

    const result = executeNpcSkill(npcData, buffSkill, allies, enemies);

    assert.ok(result.attacks.length >= 1, 'should produce attack records');
    // Buff targets "all_allies" from NPC perspective = enemies array
    const hasAttackBuff = enemies[0].activeEffects.some(e => e.type === 'attack_buff');
    assert.ok(hasAttackBuff, 'NPC creature should have attack_buff effect');
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
