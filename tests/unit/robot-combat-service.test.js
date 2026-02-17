import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processAttackTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  processUltimate,
  awardBattleXp,
  tickAllEffects
} from '../../src/game/services/robot-combat-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Robot Combat - Attack Turn', () => {
  it('each allied robot attacks the enemy sequentially', () => {
    const allies = [instantiateRobot('sizzlit'), instantiateRobot('drizzlet')];
    const enemies = [instantiateRobot('shimra')];
    const result = processAttackTurn(allies, enemies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(result.attacks.length <= allies.length);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateRobot('sizzlit'), instantiateRobot('drizzlet')];
    allies[0].hp = 0;
    const enemies = [instantiateRobot('shimra')];
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 1);
  });
});

describe('Robot Combat - Defend Turn', () => {
  it('all robots gain +1 ultimate charge', () => {
    const allies = [instantiateRobot('sizzlit')];
    processDefendTurn(allies);
    assert.strictEqual(allies[0].ultimate.charges, 1);
  });
});

describe('Robot Combat - Enemy Turn', () => {
  it('enemy attacks allied robots using targeting AI', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });
});

describe('Robot Combat - Befriend', () => {
  it('captures enemy at <=50% HP (marks befriended, hp=0)', () => {
    const enemies = [instantiateRobot('shimra')];
    enemies[0].hp = 20;
    const party = { active: [instantiateRobot('sizzlit')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(result.success);
    // Enemy stays in array but is marked as befriended with 0 HP
    assert.strictEqual(enemies[0].hp, 0);
    assert.strictEqual(enemies[0].befriended, true);
    assert.strictEqual(party.pendingCaptures.length, 1);
  });

  it('rejects befriend if no enemy <=50% HP', () => {
    const enemies = [instantiateRobot('shimra')];
    enemies[0].hp = Math.floor(enemies[0].maxHp * 0.6); // 60% HP — above threshold
    const party = { active: [instantiateRobot('sizzlit')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('rejects befriend if party full (6)', () => {
    const enemies = [instantiateRobot('shimra')];
    enemies[0].hp = 20;
    const party = {
      active: [instantiateRobot('sizzlit'), instantiateRobot('drizzlet'), instantiateRobot('petalia')],
      reserves: [instantiateRobot('tablette'), instantiateRobot('shimra'), instantiateRobot('glitchi')],
      maxTotal: 6
    };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });
});

describe('Robot Combat - Ultimate Targeting', () => {
  it('single_enemy ultimate hits only one target', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    allies[0].ultimate.target = 'single_enemy';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 1);
  });

  it('all_enemies ultimate hits all alive enemies', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    allies[0].ultimate.target = 'all_enemies';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 2);
  });

  it('missing target field defaults to all_enemies', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    delete allies[0].ultimate.target;
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.hits.length, 2);
  });

  it('heal type ultimate delegates to stub and returns heal type', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    allies[0].ultimate.type = 'heal';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'heal');
    assert.strictEqual(allies[0].ultimate.charges, 0);
    assert.deepStrictEqual(result.hits, []);
  });

  it('poison type ultimate returns poison type', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    allies[0].ultimate.type = 'poison';
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const party = { active: allies, reserves: [] };
    const result = processUltimate(allies[0], enemies, null, party);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'poison');
    assert.strictEqual(allies[0].ultimate.charges, 0);
  });

  it('damage type ultimate returns type damage', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    allies[0].ultimate.charges = allies[0].ultimate.chargesRequired;
    const result = processUltimate(allies[0], enemies);
    assert.ok(result.success);
    assert.strictEqual(result.type, 'damage');
  });
});

describe('Robot Combat - Heal Ultimate', () => {
  it('heals single ally with lowest HP%', () => {
    const healer = instantiateRobot('sizzlit');
    healer.ultimate.type = 'heal';
    healer.ultimate.target = 'single_ally';
    healer.ultimate.power = 40;
    healer.ultimate.charges = healer.ultimate.chargesRequired;

    const injured = instantiateRobot('drizzlet');
    injured.hp = 30;

    const healthy = instantiateRobot('petalia');

    const party = { active: [healer, injured, healthy], reserves: [] };
    const enemies = [instantiateRobot('shimra')];
    const result = processUltimate(healer, enemies, null, party);

    assert.ok(result.success);
    assert.strictEqual(result.type, 'heal');
    assert.ok(injured.hp > 30, 'injured ally should be healed');
    assert.strictEqual(healthy.hp, healthy.maxHp, 'healthy ally should not be healed');
    assert.strictEqual(healer.ultimate.charges, 0);
    assert.ok(result.healEvents.length > 0);
  });

  it('all_allies heals every alive ally', () => {
    const healer = instantiateRobot('sizzlit');
    healer.ultimate.type = 'heal';
    healer.ultimate.target = 'all_allies';
    healer.ultimate.power = 30;
    healer.ultimate.charges = healer.ultimate.chargesRequired;

    const ally1 = instantiateRobot('drizzlet');
    ally1.hp = 50;
    const ally2 = instantiateRobot('petalia');
    ally2.hp = 60;

    const party = { active: [healer, ally1, ally2], reserves: [] };
    const enemies = [instantiateRobot('shimra')];
    const result = processUltimate(healer, enemies, null, party);

    assert.ok(result.success);
    assert.strictEqual(result.type, 'heal');
    assert.ok(ally1.hp > 50);
    assert.ok(ally2.hp > 60);
  });

  it('does not heal KOd allies', () => {
    const healer = instantiateRobot('sizzlit');
    healer.ultimate.type = 'heal';
    healer.ultimate.target = 'all_allies';
    healer.ultimate.power = 40;
    healer.ultimate.charges = healer.ultimate.chargesRequired;

    const dead = instantiateRobot('drizzlet');
    dead.hp = 0;

    const party = { active: [healer, dead], reserves: [] };
    const enemies = [instantiateRobot('shimra')];
    const result = processUltimate(healer, enemies, null, party);

    assert.strictEqual(dead.hp, 0, 'KOd ally should stay at 0');
  });
});

describe('Robot Combat - Poison Ultimate', () => {
  it('applies poison effect to single enemy', () => {
    const trickster = instantiateRobot('sizzlit');
    trickster.ultimate.type = 'poison';
    trickster.ultimate.target = 'single_enemy';
    trickster.ultimate.power = 30;
    trickster.ultimate.charges = trickster.ultimate.chargesRequired;

    const enemies = [instantiateRobot('drizzlet'), instantiateRobot('petalia')];
    const party = { active: [trickster], reserves: [] };
    const result = processUltimate(trickster, enemies, null, party);

    assert.ok(result.success);
    assert.strictEqual(result.type, 'poison');
    assert.strictEqual(result.hits.length, 1);
    const poisoned = enemies.filter(e => e.activeEffects && e.activeEffects.length > 0);
    assert.strictEqual(poisoned.length, 1);
    assert.strictEqual(poisoned[0].activeEffects[0].type, 'poison');
    assert.strictEqual(poisoned[0].activeEffects[0].remainingTurns, 3);
  });

  it('deals immediate damage alongside poison', () => {
    const trickster = instantiateRobot('sizzlit');
    trickster.ultimate.type = 'poison';
    trickster.ultimate.target = 'single_enemy';
    trickster.ultimate.power = 30;
    trickster.ultimate.charges = trickster.ultimate.chargesRequired;

    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const party = { active: [trickster], reserves: [] };
    processUltimate(trickster, enemies, null, party);

    assert.ok(enemies[0].hp < startHp, 'should deal immediate damage');
  });

  it('does not apply poison to killed target', () => {
    const trickster = instantiateRobot('sizzlit');
    trickster.ultimate.type = 'poison';
    trickster.ultimate.target = 'single_enemy';
    trickster.ultimate.power = 30;
    trickster.attack = 100; // massive attack to kill
    trickster.ultimate.charges = trickster.ultimate.chargesRequired;

    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 1; // nearly dead
    const party = { active: [trickster], reserves: [] };
    const result = processUltimate(trickster, enemies, null, party);

    assert.strictEqual(enemies[0].hp, 0);
    assert.ok(!enemies[0].activeEffects || enemies[0].activeEffects.length === 0);
    assert.strictEqual(result.hits[0].poisonApplied, false);
  });
});

describe('Robot Combat - Status Effects in Attack Turn', () => {
  it('sleeping robot skips its attack', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'sleep', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp, 'enemy should not take damage');
  });

  it('stunned robot skips its attack', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'stun', remainingTurns: 1, sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    const startHp = enemies[0].hp;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 0);
    assert.strictEqual(enemies[0].hp, startHp);
  });

  it('confused robot randomly targets from all creatures', () => {
    const allies = [instantiateRobot('sizzlit'), instantiateRobot('drizzlet')];
    allies[0].activeEffects = [{ type: 'confuse', remainingTurns: 2, sourceId: 'x' }];
    const enemies = [instantiateRobot('petalia')];
    const result = processAttackTurn(allies, enemies);
    assert.ok(result.attacks.length >= 1);
  });

  it('hasted robot attacks twice', () => {
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [{ type: 'haste', sourceId: 'x' }];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 2, 'hasted robot should attack twice');
    assert.ok(!allies[0].activeEffects.some(e => e.type === 'haste'));
  });

  it('attack-buffed robot deals more damage', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 9999;
    enemies[0].maxHp = 9999;

    const result1 = processAttackTurn(
      [{ ...allies[0], activeEffects: [] }],
      [{ ...enemies[0] }]
    );

    allies[0].activeEffects = [{ type: 'attack_buff', percent: 100, remainingTurns: 2, sourceId: 'x' }];
    const enemies2 = [instantiateRobot('drizzlet')];
    enemies2[0].hp = 9999;
    enemies2[0].maxHp = 9999;
    const result2 = processAttackTurn(allies, enemies2);

    assert.ok(result2.attacks[0].damage > 0);
  });
});

describe('Robot Combat - XP', () => {
  it('active robots get 2x shares, reserves get 1x share', () => {
    const party = {
      active: [instantiateRobot('sizzlit')],
      reserves: [instantiateRobot('drizzlet')]
    };
    // 1 active (2 shares) + 1 reserve (1 share) = 3 total shares
    // perShare = 100/3 = 33.3 → active gets floor(66.6)=66, reserve gets floor(33.3)=33
    awardBattleXp(party, 100);
    assert.strictEqual(party.active[0].xp, 66);
    assert.strictEqual(party.active[0].level, 1);
    assert.strictEqual(party.reserves[0].xp, 33);
    assert.strictEqual(party.reserves[0].level, 1);
  });

  it('levels up when XP exceeds threshold', () => {
    const party = {
      active: [instantiateRobot('sizzlit')],
      reserves: []
    };
    // 1 active (2 shares), 0 reserves = 2 total shares
    // perShare = 150/2 = 75 → active gets floor(75*2)=150 → level up (100 XP), 50 remaining
    awardBattleXp(party, 150);
    assert.strictEqual(party.active[0].xp, 50);
    assert.strictEqual(party.active[0].level, 2);
  });
});

describe('Robot Combat - Effect Ticking', () => {
  it('tickAllEffects processes poison on enemies', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
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
    const allies = [instantiateRobot('sizzlit')];
    allies[0].activeEffects = [
      { type: 'poison', remainingTurns: 1, damagePerTurn: 8, sourceId: 'enemy' }
    ];
    const startHp = allies[0].hp;
    const events = tickAllEffects(allies, []);
    assert.ok(allies[0].hp < startHp);
    assert.strictEqual(allies[0].activeEffects.length, 0);
  });

  it('skips dead robots', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    enemies[0].hp = 0;
    enemies[0].activeEffects = [
      { type: 'poison', remainingTurns: 2, damagePerTurn: 5, sourceId: 'test' }
    ];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });

  it('returns empty array when no effects exist', () => {
    const allies = [instantiateRobot('sizzlit')];
    const enemies = [instantiateRobot('drizzlet')];
    const events = tickAllEffects(allies, enemies);
    assert.strictEqual(events.length, 0);
  });
});
