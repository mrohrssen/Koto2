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
  rollTalkAcceptance
} from '../../../src/game/services/creature-combat-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';

describe('Creature Combat - Move Turn', () => {
  it('each allied creature uses a move against the enemy', () => {
    // kazenoko has 'fuku' (damage, all_enemies, pow=15)
    const allies = [instantiateCreature('kazenoko'), instantiateCreature('kamedor')];
    const enemies = [instantiateCreature('hikaribon')];
    // kamedor has 'kamu' (damage, single_enemy, pow=18)
    const moveChoices = [
      { creatureIndex: 0, moveId: 'fuku', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.attacks.length >= 1);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateCreature('kazenoko'), instantiateCreature('kamedor')];
    allies[0].hp = 0;
    const enemies = [instantiateCreature('hikaribon')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'fuku', targetIndex: 0 },
      { creatureIndex: 1, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // Only kamedor (index 1) should attack
    assert.strictEqual(result.attacks.length, 1);
  });

  it('includes move fields in attack records', () => {
    const allies = [instantiateCreature('kamedor')];
    const enemies = [instantiateCreature('kazenoko')];
    const moveChoices = [
      { creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerId, 'kamedor');
    assert.ok(atk.attackerNameJp, 'should have attacker Japanese name');
    assert.strictEqual(atk.moveId, 'kamu');
    assert.ok(atk.moveName, 'should have move Japanese name');
    assert.strictEqual(atk.moveNameEn, 'Bite');
    assert.ok(atk.targetNameJp, 'should have target Japanese name');
    assert.strictEqual(atk.targetId, 'kazenoko');
  });

  it('deducts MP when using a move', () => {
    const allies = [instantiateCreature('kamedor')];
    const enemies = [instantiateCreature('hikaribon')];
    const startMp = allies[0].mp;
    const moveCost = allies[0].moves.find(m => m.id === 'kamu').mpCost;
    const moveChoices = [
      { creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }
    ];
    processMoveTurn(allies, enemies, moveChoices);
    // MP should decrease by move cost, then regen 12% of maxMp
    const expectedMp = Math.min(allies[0].maxMp, startMp - moveCost + Math.floor(allies[0].maxMp * 0.12));
    assert.strictEqual(allies[0].mp, expectedMp);
  });

  it('skips move if insufficient MP', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].mp = 0;
    const enemies = [instantiateCreature('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [
      { creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    // Enemy should not take damage (move skipped)
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('returns mpRegens for alive allies', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].mp = 0;
    const enemies = [instantiateCreature('hikaribon')];
    const moveChoices = [];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(result.mpRegens[0].regen > 0, 'should regen some MP');
  });
});

describe('Creature Combat - Defend Turn', () => {
  it('all creatures gain MP regen on defend', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].mp = 10;
    const result = processDefendTurn(allies);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(allies[0].mp > 10, 'MP should increase from defend regen');
  });
});

describe('Creature Combat - Enemy Turn', () => {
  it('enemy attacks allied creatures using its first move', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('kamedor')]; // kamedor has 'kamu' (damage move)
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });

  it('includes move fields in enemy attack records', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('kamedor')];
    const result = processEnemyTurn(enemies, allies);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerNameJp, '\u30AB\u30E1\u30C9\u30EB');
    assert.strictEqual(atk.moveId, 'kamu');
    assert.ok(atk.moveName);
    assert.ok(atk.moveNameEn);
    assert.strictEqual(atk.targetNameJp, '\u30D2\u30AB\u30EA\u30DC\u30F3');
  });
});

describe('Creature Combat - Befriend', () => {
  it('captures enemy at <=50% HP (marks befriended, hp=0)', () => {
    const enemies = [instantiateCreature('kazenoko')];
    enemies[0].hp = 20;
    const party = { active: [instantiateCreature('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(result.success);
    // Enemy stays in array but is marked as befriended with 0 HP
    assert.strictEqual(enemies[0].hp, 0);
    assert.strictEqual(enemies[0].befriended, true);
    assert.strictEqual(party.pendingCaptures.length, 1);
  });

  it('rejects befriend if no enemy <=50% HP', () => {
    const enemies = [instantiateCreature('kazenoko')];
    enemies[0].hp = Math.floor(enemies[0].maxHp * 0.6); // 60% HP -- above threshold
    const party = { active: [instantiateCreature('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('captures the specified target by index instead of lowest HP', () => {
    const enemies = [instantiateCreature('kazenoko'), instantiateCreature('kamedor')];
    enemies[0].hp = 10; // lower ratio
    enemies[1].hp = 50; // higher ratio but this is the target
    const party = { active: [instantiateCreature('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party, 1); // target index 1
    assert.ok(result.success);
    // Should capture index 1 (kamedor), NOT index 0 (kazenoko)
    assert.strictEqual(enemies[1].befriended, true);
    assert.strictEqual(enemies[1].hp, 0);
    assert.ok(!enemies[0].befriended); // index 0 should be untouched
  });

  it('rejects befriend if party full (6)', () => {
    const enemies = [instantiateCreature('kazenoko')];
    enemies[0].hp = 20;
    const party = {
      active: [instantiateCreature('hikaribon'), instantiateCreature('tsukimochi'), instantiateCreature('hanatchi')],
      reserves: [instantiateCreature('nekotto'), instantiateCreature('kazenoko'), instantiateCreature('kaminarion')],
      maxTotal: 6
    };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('rejects befriend if party + pendingCaptures reaches maxTotal', () => {
    const enemies = [instantiateCreature('kazenoko'), instantiateCreature('kamedor')];
    enemies[0].hp = 20;
    enemies[1].hp = 20;
    const party = {
      active: [instantiateCreature('hikaribon'), instantiateCreature('tsukimochi'), instantiateCreature('hanatchi')],
      reserves: [instantiateCreature('nekotto'), instantiateCreature('kazenoko')],
      pendingCaptures: [instantiateCreature('kaminarion')], // 5 in party + 1 pending = 6 = maxTotal
      maxTotal: 6
    };
    const result = processBefriend(enemies, party, 0);
    assert.ok(!result.success);
    assert.strictEqual(result.reason, 'Party full');
  });
});

describe('Creature Combat - Status Effects in Move Turn', () => {
  it('sleeping creature skips its move', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateCreature('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned creature skips its move', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateCreature('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('hasted creature attacks twice', () => {
    const allies = [instantiateCreature('kamedor')];
    allies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const enemies = [instantiateCreature('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 2, 'hasted creature should attack twice');
    assert.ok(!allies[0].activeEffects.some(e => e.type === 'haste'));
  });

  it('attack-buffed creature deals more damage', () => {
    const allies = [instantiateCreature('kamedor')];
    const enemies = [instantiateCreature('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result1 = processMoveTurn(
      [{ ...allies[0], activeEffects: [] }],
      [{ ...enemies[0] }],
      [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }]
    );

    allies[0].activeEffects = [{ type: 'attack_buff', percent: 100, remainingTurns: 2, sourceId: 'x' }];
    const enemies2 = [instantiateCreature('hikaribon')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processMoveTurn(allies, enemies2, moveChoices);

    assert.ok(result2.attacks[0].damage > result1.attacks[0].damage, 'buffed damage should exceed unbuffed damage');
  });
});

describe('Creature Combat - Status Effects in Enemy Turn', () => {
  it('sleeping enemy skips its attack', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('kamedor')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const startHp = allies[0].hp;
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(allies[0].hp, startHp);
  });

  it('enemy respects taunt and targets taunting ally', () => {
    const taunter = instantiateCreature('hikaribon');
    taunter.activeEffects = [{ type: 'taunt', remainingTurns: 2, sourceId: 'self' }];
    const other = instantiateCreature('tsukimochi');
    const allies = [other, taunter];
    const enemies = [instantiateCreature('kamedor')]; // has damage move 'kamu'
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetId, taunter.id);
  });

  it('shield reduces damage to ally', () => {
    // First, measure unshielded damage
    const unshieldedAlly = instantiateCreature('hikaribon');
    unshieldedAlly.activeEffects = [];
    const unshieldedEnemies = [instantiateCreature('kamedor')];
    const unshieldedResult = processEnemyTurn(unshieldedEnemies, [unshieldedAlly]);

    // Then, measure shielded damage
    const shieldedAlly = instantiateCreature('hikaribon');
    shieldedAlly.activeEffects = [{ type: 'shield', percent: 50, remainingTurns: 2, sourceId: 'x' }];
    const shieldedEnemies = [instantiateCreature('kamedor')];
    const shieldedResult = processEnemyTurn(shieldedEnemies, [shieldedAlly]);

    assert.strictEqual(shieldedResult.attacks.length, 1);
    assert.ok(shieldedResult.attacks[0].damage < unshieldedResult.attacks[0].damage,
      'shielded damage should be less than unshielded damage');
  });

  it('damage wakes up sleeping ally', () => {
    const ally = instantiateCreature('hikaribon');
    ally.activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateCreature('kamedor')];
    processEnemyTurn(enemies, allies);
    assert.ok(!ally.activeEffects.some(e => e.type === 'sleep'));
  });

  it('confused enemy can hit its own allies', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('kamedor'), instantiateCreature('kazenoko')];
    enemies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
  });

  it('hasted enemy attacks twice', () => {
    const allies = [instantiateCreature('hikaribon')];
    allies[0].hp = 9999;
    allies[0].maxHp = 9999;
    const enemies = [instantiateCreature('kamedor')];
    enemies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 2);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'haste'));
  });
});

describe('Creature Combat - XP', () => {
  it('awardBattleXp grants one full level to each creature', () => {
    const party = {
      active: [instantiateCreature('hikaribon')],
      reserves: [instantiateCreature('tsukimochi')]
    };
    awardBattleXp(party);
    // Both should be L6 (each gets xpToNextLevel which is 1 full level)
    assert.strictEqual(party.active[0].level, 6);
    assert.strictEqual(party.reserves[0].level, 6);
  });
});

describe('Creature Combat - Kill XP Scaling', () => {
  it('awardKillXp scales with enemy level (BASE_KILL_XP + enemyLevel*2)', () => {
    const party = {
      active: [instantiateCreature('hikaribon')],
      reserves: []
    };
    // 1 active (2 shares), 0 reserves = 2 total shares
    // enemyLevel 5: (10 + 5*2) = 20 base XP, perShare = 20/2 = 10, active gets floor(10*2) = 20
    const result = awardKillXp(party, 5);
    assert.strictEqual(result.xpGrants[0].xp, 20);
  });

  it('awardKillXp applies xpMultiplier', () => {
    const party = {
      active: [instantiateCreature('hikaribon')],
      reserves: []
    };
    // enemyLevel 5, multiplier 1.25: (10 + 5*2) * 1.25 = 25, perShare = 25/2 = 12.5, active = floor(12.5*2)=25
    const result = awardKillXp(party, 5, 1.25);
    assert.strictEqual(result.xpGrants[0].xp, 25);
  });

  it('awardKillXp returns levelUps from cubic curve', () => {
    const party = {
      active: [instantiateCreature('hikaribon')],
      reserves: []
    };
    // enemyLevel 10: (10 + 10*2) = 30 base, perShare = 30/2 = 15, active = 30
    // L5 needs 91 XP to level up, so 30 XP won't level up
    // Use higher enemy level to guarantee a level-up
    const result = awardKillXp(party, 50);
    assert.ok(result.levelUps.length > 0);
    assert.ok(party.active[0].level > 5);
  });

  it('awardKillXp defaults xpMultiplier to 1.0', () => {
    const party = {
      active: [instantiateCreature('hikaribon')],
      reserves: []
    };
    // enemyLevel 1: (10 + 1*2) * 1.0 = 12, perShare = 12/2 = 6, active = floor(6*2) = 12
    const result = awardKillXp(party, 1);
    assert.strictEqual(result.xpGrants[0].xp, 12);
  });
});

describe('Creature Combat - Effect Ticking', () => {
  it('tickAllEffects processes poison on enemies', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('tsukimochi')];
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const startHp = enemies[0].hp;
    const events = tickAllEffects(allies, enemies);
    assert.ok(enemies[0].hp < startHp);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'poison');
  });

  it('ticks effects on allies too', () => {
    const allies = [instantiateCreature('hikaribon')];
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 8, sourceId: 'enemy' }
    ];
    const startHp = allies[0].hp;
    const events = tickAllEffects(allies, []);
    assert.ok(allies[0].hp < startHp);
    assert.strictEqual(allies[0].activeEffects.length, 0);
  });

  it('skips dead creatures', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('tsukimochi')];
    enemies[0].hp = 0;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });

  it('returns empty array when no effects exist', () => {
    const allies = [instantiateCreature('hikaribon')];
    const enemies = [instantiateCreature('tsukimochi')];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });
});

describe('Creature Combat - Shield in Move Turn', () => {
  it('shielded enemy takes reduced damage from player moves', () => {
    const allies = [instantiateCreature('kamedor')]; // 'kamu' does damage
    const enemies = [instantiateCreature('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    // 90% shield -- should drastically reduce damage
    enemies[0].activeEffects = [{ type: 'shield', percent: 90, remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // With 90% shield, damage should be very small
    assert.ok(result.attacks[0].damage < allies[0].attack);
  });

  it('player move wakes sleeping enemy', () => {
    const allies = [instantiateCreature('kamedor')];
    const enemies = [instantiateCreature('hikaribon')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    processMoveTurn(allies, enemies, moveChoices);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'sleep'));
  });
});

describe('Creature Combat - XP Balance Redistribution', () => {
  it('redistributes XP toward lower-leveled creatures with 1 stack', () => {
    const highLevel = instantiateCreature('hikaribon');
    highLevel.level = 10;
    highLevel.xp = 0;

    const lowLevel = instantiateCreature('tsukimochi');
    lowLevel.level = 3;
    lowLevel.xp = 0;

    const party = {
      active: [highLevel, lowLevel],
      reserves: []
    };

    // enemyLevel 10: base = (10+10*2)*1.0 = 30
    // Without balance: 2 active = 4 shares, perShare=7.5, each gets 15
    // With 1 stack (t=0.2): low-level gets more, high-level gets less
    const result = awardKillXp(party, 10, 1.0, 1);

    const highGrant = result.xpGrants.find(g => g.creatureId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.creatureId === lowLevel.id);
    assert.ok(lowGrant.xp > highGrant.xp, 'lower-level creature should receive more XP');
  });

  it('no redistribution with 0 balance stacks', () => {
    const highLevel = instantiateCreature('hikaribon');
    highLevel.level = 10;
    const lowLevel = instantiateCreature('tsukimochi');
    lowLevel.level = 3;

    const party = { active: [highLevel, lowLevel], reserves: [] };
    const result = awardKillXp(party, 10, 1.0, 0);

    const highGrant = result.xpGrants.find(g => g.creatureId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.creatureId === lowLevel.id);
    assert.strictEqual(highGrant.xp, lowGrant.xp, 'both should get equal shares');
  });

  it('higher stacks redistribute more aggressively', () => {
    const highLevel = instantiateCreature('hikaribon');
    highLevel.level = 10;
    const lowLevel = instantiateCreature('tsukimochi');
    lowLevel.level = 3;

    // 1 stack
    const party1 = { active: [{ ...highLevel }, { ...lowLevel }], reserves: [] };
    const result1 = awardKillXp(party1, 10, 1.0, 1);
    const low1 = result1.xpGrants.find(g => g.creatureId === lowLevel.id).xp;

    // 3 stacks
    const party3 = { active: [instantiateCreature('hikaribon'), instantiateCreature('tsukimochi')], reserves: [] };
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
    const unbuffedAlly = instantiateCreature('kamedor');
    unbuffedAlly.activeEffects = [];
    const unbuffedEnemy = instantiateCreature('hikaribon');
    unbuffedEnemy.hp = 9999;
    unbuffedEnemy.maxHp = 9999;
    const moveChoices = [{ creatureIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const unbuffedResult = processMoveTurn([unbuffedAlly], [unbuffedEnemy], moveChoices);

    // Measure buffed damage
    const buffedAlly = instantiateCreature('kamedor');
    buffedAlly.activeEffects = [{ type: 'temp_attack_flat', value: 50, remainingTurns: 5 }];
    const buffedEnemy = instantiateCreature('hikaribon');
    buffedEnemy.hp = 9999;
    buffedEnemy.maxHp = 9999;
    const buffedResult = processMoveTurn([buffedAlly], [buffedEnemy], moveChoices);

    assert.ok(buffedResult.attacks.length >= 1);
    assert.ok(buffedResult.attacks[0].damage > unbuffedResult.attacks[0].damage,
      'flat-buffed damage should exceed unbuffed damage');
  });
});

describe('rollTalkAcceptance', () => {
  it('returns accepted boolean and computed chance (common at 30% HP → 80)', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.hp = Math.round(enemy.maxHp * 0.3);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(typeof result.accepted, 'boolean');
    assert.strictEqual(typeof result.chance, 'number');
    assert.strictEqual(result.chance, 80); // common base, 30% HP = no bonus
  });

  it('gives higher chance at lower HP (common at 1 HP → 95)', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.hp = 1; // ~1% HP, hpBonus = 15 → 80+15=95 capped at 95
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 95);
  });

  it('gives lower chance for rarer creatures (legendary at 40% HP → 20)', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.rarity = 'legendary';
    enemy.hp = Math.round(enemy.maxHp * 0.4);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 20); // legendary base, 40% HP = no bonus
  });

  it('applies mid-bracket HP bonus (rare at 20% HP → 60)', () => {
    const enemy = instantiateCreature('hikaribon');
    enemy.rarity = 'rare';
    enemy.hp = Math.round(enemy.maxHp * 0.2); // 20% HP → hpBonus = 10
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 60); // rare 50 + 10 bonus
  });

  it('caps chance at 95', () => {
    const enemy = instantiateCreature('hikaribon');
    // common base 80, set HP to 1% for +15 bonus = 95 (already at cap)
    enemy.hp = 1;
    const result = rollTalkAcceptance(enemy);
    assert.ok(result.chance <= 95, 'chance should never exceed 95');
    assert.strictEqual(result.chance, 95);
  });

  it('defaults to common rarity if rarity is missing', () => {
    const enemy = instantiateCreature('hikaribon');
    delete enemy.rarity;
    enemy.hp = Math.round(enemy.maxHp * 0.5);
    const result = rollTalkAcceptance(enemy);
    assert.strictEqual(result.chance, 80); // common base, 50% HP = no bonus
  });

  it('does not mutate enemy object (pure function check)', () => {
    const enemy = instantiateCreature('hikaribon');
    const originalHp = enemy.hp;
    const originalMaxHp = enemy.maxHp;
    const originalRarity = enemy.rarity;
    rollTalkAcceptance(enemy);
    assert.strictEqual(enemy.hp, originalHp);
    assert.strictEqual(enemy.maxHp, originalMaxHp);
    assert.strictEqual(enemy.rarity, originalRarity);
  });
});
