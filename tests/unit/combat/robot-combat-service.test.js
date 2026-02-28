import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processMoveTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  awardBattleXp,
  awardKillXp,
  tickAllEffects
} from '../../../src/game/services/robot-combat-service.js';
import { instantiateRobot } from '../../../src/game/robots.js';

describe('Robot Combat - Move Turn', () => {
  it('each allied robot uses a move against the enemy', () => {
    // kazenoko has 'fuku' (damage, all_enemies, pow=15)
    const allies = [instantiateRobot('kazenoko'), instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('hikaribon')];
    // kamedor has 'kamu' (damage, single_enemy, pow=18)
    const moveChoices = [
      { robotIndex: 0, moveId: 'fuku', targetIndex: 0 },
      { robotIndex: 1, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.attacks.length >= 1);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateRobot('kazenoko'), instantiateRobot('kamedor')];
    allies[0].hp = 0;
    const enemies = [instantiateRobot('hikaribon')];
    const moveChoices = [
      { robotIndex: 0, moveId: 'fuku', targetIndex: 0 },
      { robotIndex: 1, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // Only kamedor (index 1) should attack
    assert.strictEqual(result.attacks.length, 1);
  });

  it('includes move fields in attack records', () => {
    const allies = [instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('kazenoko')];
    const moveChoices = [
      { robotIndex: 0, moveId: 'kamu', targetIndex: 0 }
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
    const allies = [instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('hikaribon')];
    const startMp = allies[0].mp;
    const moveCost = allies[0].moves.find(m => m.id === 'kamu').mpCost;
    const moveChoices = [
      { robotIndex: 0, moveId: 'kamu', targetIndex: 0 }
    ];
    processMoveTurn(allies, enemies, moveChoices);
    // MP should decrease by move cost, then regen 12% of maxMp
    const expectedMp = Math.min(allies[0].maxMp, startMp - moveCost + Math.floor(allies[0].maxMp * 0.12));
    assert.strictEqual(allies[0].mp, expectedMp);
  });

  it('skips move if insufficient MP', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].mp = 0;
    const enemies = [instantiateRobot('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [
      { robotIndex: 0, moveId: 'kamu', targetIndex: 0 }
    ];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    // Enemy should not take damage (move skipped)
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('returns mpRegens for alive allies', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].mp = 0;
    const enemies = [instantiateRobot('hikaribon')];
    const moveChoices = [];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(result.mpRegens[0].regen > 0, 'should regen some MP');
  });
});

describe('Robot Combat - Defend Turn', () => {
  it('all robots gain MP regen on defend', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].mp = 10;
    const result = processDefendTurn(allies);
    assert.ok(result.mpRegens.length >= 1);
    assert.ok(allies[0].mp > 10, 'MP should increase from defend regen');
  });
});

describe('Robot Combat - Enemy Turn', () => {
  it('enemy attacks allied robots using its first move', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('kamedor')]; // kamedor has 'kamu' (damage move)
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });

  it('includes move fields in enemy attack records', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('kamedor')];
    const result = processEnemyTurn(enemies, allies);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerNameJp, '\u30AB\u30E1\u30C9\u30EB');
    assert.strictEqual(atk.moveId, 'kamu');
    assert.ok(atk.moveName);
    assert.ok(atk.moveNameEn);
    assert.strictEqual(atk.targetNameJp, '\u30D2\u30AB\u30EA\u30DC\u30F3');
  });
});

describe('Robot Combat - Befriend', () => {
  it('captures enemy at <=50% HP (marks befriended, hp=0)', () => {
    const enemies = [instantiateRobot('kazenoko')];
    enemies[0].hp = 20;
    const party = { active: [instantiateRobot('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(result.success);
    // Enemy stays in array but is marked as befriended with 0 HP
    assert.strictEqual(enemies[0].hp, 0);
    assert.strictEqual(enemies[0].befriended, true);
    assert.strictEqual(party.pendingCaptures.length, 1);
  });

  it('rejects befriend if no enemy <=50% HP', () => {
    const enemies = [instantiateRobot('kazenoko')];
    enemies[0].hp = Math.floor(enemies[0].maxHp * 0.6); // 60% HP -- above threshold
    const party = { active: [instantiateRobot('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('captures the specified target by index instead of lowest HP', () => {
    const enemies = [instantiateRobot('kazenoko'), instantiateRobot('kamedor')];
    enemies[0].hp = 10; // lower ratio
    enemies[1].hp = 50; // higher ratio but this is the target
    const party = { active: [instantiateRobot('hikaribon')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party, 1); // target index 1
    assert.ok(result.success);
    // Should capture index 1 (kamedor), NOT index 0 (kazenoko)
    assert.strictEqual(enemies[1].befriended, true);
    assert.strictEqual(enemies[1].hp, 0);
    assert.ok(!enemies[0].befriended); // index 0 should be untouched
  });

  it('rejects befriend if party full (6)', () => {
    const enemies = [instantiateRobot('kazenoko')];
    enemies[0].hp = 20;
    const party = {
      active: [instantiateRobot('hikaribon'), instantiateRobot('tsukimochi'), instantiateRobot('hanatchi')],
      reserves: [instantiateRobot('nekotto'), instantiateRobot('kazenoko'), instantiateRobot('kaminarion')],
      maxTotal: 6
    };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('rejects befriend if party + pendingCaptures reaches maxTotal', () => {
    const enemies = [instantiateRobot('kazenoko'), instantiateRobot('kamedor')];
    enemies[0].hp = 20;
    enemies[1].hp = 20;
    const party = {
      active: [instantiateRobot('hikaribon'), instantiateRobot('tsukimochi'), instantiateRobot('hanatchi')],
      reserves: [instantiateRobot('nekotto'), instantiateRobot('kazenoko')],
      pendingCaptures: [instantiateRobot('kaminarion')], // 5 in party + 1 pending = 6 = maxTotal
      maxTotal: 6
    };
    const result = processBefriend(enemies, party, 0);
    assert.ok(!result.success);
    assert.strictEqual(result.reason, 'Party full');
  });
});

describe('Robot Combat - Status Effects in Move Turn', () => {
  it('sleeping robot skips its move', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateRobot('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned robot skips its move', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateRobot('hikaribon')];
    const startHp = enemies[0].hp;
    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('hasted robot attacks twice', () => {
    const allies = [instantiateRobot('kamedor')];
    allies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const enemies = [instantiateRobot('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    assert.strictEqual(result.attacks.length, 2, 'hasted robot should attack twice');
    assert.ok(!allies[0].activeEffects.some(e => e.type === 'haste'));
  });

  it('attack-buffed robot deals more damage', () => {
    const allies = [instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result1 = processMoveTurn(
      [{ ...allies[0], activeEffects: [] }],
      [{ ...enemies[0] }],
      [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }]
    );

    allies[0].activeEffects = [{ type: 'attack_buff', percent: 100, remainingTurns: 2, sourceId: 'x' }];
    const enemies2 = [instantiateRobot('hikaribon')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processMoveTurn(allies, enemies2, moveChoices);

    assert.ok(result2.attacks[0].damage > 0);
  });
});

describe('Robot Combat - Status Effects in Enemy Turn', () => {
  it('sleeping enemy skips its attack', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('kamedor')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const startHp = allies[0].hp;
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(allies[0].hp, startHp);
  });

  it('enemy respects taunt and targets taunting ally', () => {
    const taunter = instantiateRobot('hikaribon');
    taunter.activeEffects = [{ type: 'taunt', remainingTurns: 2, sourceId: 'self' }];
    const other = instantiateRobot('tsukimochi');
    const allies = [other, taunter];
    const enemies = [instantiateRobot('kamedor')]; // has damage move 'kamu'
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.strictEqual(result.attacks[0].targetId, taunter.id);
  });

  it('shield reduces damage to ally', () => {
    const ally = instantiateRobot('hikaribon');
    ally.activeEffects = [{ type: 'shield', percent: 50, remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateRobot('kamedor')];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 1);
    assert.ok(result.attacks[0].damage >= 0);
  });

  it('damage wakes up sleeping ally', () => {
    const ally = instantiateRobot('hikaribon');
    ally.activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const allies = [ally];
    const enemies = [instantiateRobot('kamedor')];
    processEnemyTurn(enemies, allies);
    assert.ok(!ally.activeEffects.some(e => e.type === 'sleep'));
  });

  it('confused enemy can hit its own allies', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('kamedor'), instantiateRobot('kazenoko')];
    enemies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
  });

  it('hasted enemy attacks twice', () => {
    const allies = [instantiateRobot('hikaribon')];
    allies[0].hp = 9999;
    allies[0].maxHp = 9999;
    const enemies = [instantiateRobot('kamedor')];
    enemies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const result = processEnemyTurn(enemies, allies);
    assert.strictEqual(result.attacks.length, 2);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'haste'));
  });
});

describe('Robot Combat - XP', () => {
  it('awardBattleXp grants one full level to each robot', () => {
    const party = {
      active: [instantiateRobot('hikaribon')],
      reserves: [instantiateRobot('tsukimochi')]
    };
    awardBattleXp(party);
    // Both should be L2 (each gets xpToNextLevel which is 1 full level)
    assert.strictEqual(party.active[0].level, 2);
    assert.strictEqual(party.reserves[0].level, 2);
  });
});

describe('Robot Combat - Kill XP Scaling', () => {
  it('awardKillXp scales with enemy level (BASE_KILL_XP * enemyLevel)', () => {
    const party = {
      active: [instantiateRobot('hikaribon')],
      reserves: []
    };
    // 1 active (2 shares), 0 reserves = 2 total shares
    // enemyLevel 5: 10 * 5 = 50 base XP, perShare = 50/2 = 25, active gets floor(25*2) = 50
    const result = awardKillXp(party, 5);
    assert.strictEqual(result.xpGrants[0].xp, 50);
  });

  it('awardKillXp applies xpMultiplier', () => {
    const party = {
      active: [instantiateRobot('hikaribon')],
      reserves: []
    };
    // enemyLevel 5, multiplier 1.25: 10 * 5 * 1.25 = 62, perShare = 62/2 = 31, active = floor(31*2)=62
    const result = awardKillXp(party, 5, 1.25);
    assert.strictEqual(result.xpGrants[0].xp, 62);
  });

  it('awardKillXp returns levelUps from cubic curve', () => {
    const party = {
      active: [instantiateRobot('hikaribon')],
      reserves: []
    };
    // enemyLevel 10: 10 * 10 = 100 base, perShare = 100/2 = 50, active = 100
    // L1 needs 7 XP -> should level up multiple times
    const result = awardKillXp(party, 10);
    assert.ok(result.levelUps.length > 0);
    assert.ok(party.active[0].level > 1);
  });

  it('awardKillXp defaults xpMultiplier to 1.0', () => {
    const party = {
      active: [instantiateRobot('hikaribon')],
      reserves: []
    };
    // enemyLevel 1: 10 * 1 * 1.0 = 10, perShare = 10/2 = 5, active = floor(5*2) = 10
    const result = awardKillXp(party, 1);
    assert.strictEqual(result.xpGrants[0].xp, 10);
  });
});

describe('Robot Combat - Effect Ticking', () => {
  it('tickAllEffects processes poison on enemies', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('tsukimochi')];
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
    const allies = [instantiateRobot('hikaribon')];
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 8, sourceId: 'enemy' }
    ];
    const startHp = allies[0].hp;
    const events = tickAllEffects(allies, []);
    assert.ok(allies[0].hp < startHp);
    assert.strictEqual(allies[0].activeEffects.length, 0);
  });

  it('skips dead robots', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('tsukimochi')];
    enemies[0].hp = 0;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });

  it('returns empty array when no effects exist', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('tsukimochi')];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });
});

describe('Robot Combat - Shield in Move Turn', () => {
  it('shielded enemy takes reduced damage from player moves', () => {
    const allies = [instantiateRobot('kamedor')]; // 'kamu' does damage
    const enemies = [instantiateRobot('hikaribon')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    // 90% shield -- should drastically reduce damage
    enemies[0].activeEffects = [{ type: 'shield', percent: 90, remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn(allies, enemies, moveChoices);
    // With 90% shield, damage should be very small
    assert.ok(result.attacks[0].damage < allies[0].attack);
  });

  it('player move wakes sleeping enemy', () => {
    const allies = [instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('hikaribon')];
    enemies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    processMoveTurn(allies, enemies, moveChoices);
    assert.ok(!enemies[0].activeEffects.some(e => e.type === 'sleep'));
  });
});

describe('Robot Combat - XP Balance Redistribution', () => {
  it('redistributes XP toward lower-leveled robots with 1 stack', () => {
    const highLevel = instantiateRobot('hikaribon');
    highLevel.level = 10;
    highLevel.xp = 0;

    const lowLevel = instantiateRobot('tsukimochi');
    lowLevel.level = 3;
    lowLevel.xp = 0;

    const party = {
      active: [highLevel, lowLevel],
      reserves: []
    };

    // enemyLevel 10: base = 10*10*1.0 = 100
    // Without balance: 2 active = 4 shares, perShare=25, each gets 50
    // With 1 stack (t=0.2): low-level gets more, high-level gets less
    const result = awardKillXp(party, 10, 1.0, 1);

    const highGrant = result.xpGrants.find(g => g.robotId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.robotId === lowLevel.id);
    assert.ok(lowGrant.xp > highGrant.xp, 'lower-level robot should receive more XP');
  });

  it('no redistribution with 0 balance stacks', () => {
    const highLevel = instantiateRobot('hikaribon');
    highLevel.level = 10;
    const lowLevel = instantiateRobot('tsukimochi');
    lowLevel.level = 3;

    const party = { active: [highLevel, lowLevel], reserves: [] };
    const result = awardKillXp(party, 10, 1.0, 0);

    const highGrant = result.xpGrants.find(g => g.robotId === highLevel.id);
    const lowGrant = result.xpGrants.find(g => g.robotId === lowLevel.id);
    assert.strictEqual(highGrant.xp, lowGrant.xp, 'both should get equal shares');
  });

  it('higher stacks redistribute more aggressively', () => {
    const highLevel = instantiateRobot('hikaribon');
    highLevel.level = 10;
    const lowLevel = instantiateRobot('tsukimochi');
    lowLevel.level = 3;

    // 1 stack
    const party1 = { active: [{ ...highLevel }, { ...lowLevel }], reserves: [] };
    const result1 = awardKillXp(party1, 10, 1.0, 1);
    const low1 = result1.xpGrants.find(g => g.robotId === lowLevel.id).xp;

    // 3 stacks
    const party3 = { active: [instantiateRobot('hikaribon'), instantiateRobot('tsukimochi')], reserves: [] };
    party3.active[0].level = 10;
    party3.active[1].level = 3;
    const result3 = awardKillXp(party3, 10, 1.0, 3);
    const low3 = result3.xpGrants.find(g => g.robotId === party3.active[1].id).xp;

    assert.ok(low3 > low1, 'more stacks should give underleveled robot even more XP');
  });
});

describe('Robot Combat - Temp Attack Flat Bonus', () => {
  it('processMoveTurn uses flat attack bonus from activeEffects', () => {
    const ally = instantiateRobot('kamedor'); // has 'kamu' damage move
    ally.activeEffects = [{ type: 'temp_attack_flat', value: 50, remainingTurns: 5 }];
    const enemy = instantiateRobot('hikaribon');
    const baseHp = enemy.hp;

    const moveChoices = [{ robotIndex: 0, moveId: 'kamu', targetIndex: 0 }];
    const result = processMoveTurn([ally], [enemy], moveChoices);
    assert.ok(result.attacks.length >= 1);
    assert.ok(enemy.hp < baseHp, 'enemy should take damage with flat buff');
  });
});
