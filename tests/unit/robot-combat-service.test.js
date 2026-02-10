import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  processAttackTurn,
  processDefendTurn,
  processEnemyTurn,
  processBefriend,
  processUltimate,
  awardBattleXp
} from '../../src/game/services/robot-combat-service.js';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Robot Combat - Attack Turn', () => {
  it('each allied robot attacks the enemy sequentially', () => {
    const allies = [instantiateRobot('fire-common'), instantiateRobot('water-common')];
    const enemies = [instantiateRobot('earth-common')];
    const result = processAttackTurn(allies, enemies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(result.attacks.length <= allies.length);
    assert.ok(enemies[0].hp < enemies[0].maxHp, 'enemy should have taken damage');
  });

  it('skips KOd allies', () => {
    const allies = [instantiateRobot('fire-common'), instantiateRobot('water-common')];
    allies[0].hp = 0;
    const enemies = [instantiateRobot('earth-common')];
    const result = processAttackTurn(allies, enemies);
    assert.strictEqual(result.attacks.length, 1);
  });
});

describe('Robot Combat - Defend Turn', () => {
  it('all robots gain +1 ultimate charge', () => {
    const allies = [instantiateRobot('fire-common')];
    processDefendTurn(allies);
    assert.strictEqual(allies[0].ultimate.charges, 1);
  });
});

describe('Robot Combat - Enemy Turn', () => {
  it('enemy attacks allied robots using targeting AI', () => {
    const allies = [instantiateRobot('fire-common')];
    const enemies = [instantiateRobot('water-common')];
    const result = processEnemyTurn(enemies, allies);
    assert.ok(result.attacks.length >= 1);
    assert.ok(allies[0].hp < allies[0].maxHp);
  });
});

describe('Robot Combat - Befriend', () => {
  it('captures enemy at <=30% HP', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = 20;
    const party = { active: [instantiateRobot('fire-common')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(result.success);
    assert.strictEqual(enemies.length, 0);
  });

  it('rejects befriend if no enemy <=50% HP', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = Math.floor(enemies[0].maxHp * 0.6); // 60% HP — above threshold
    const party = { active: [instantiateRobot('fire-common')], reserves: [], maxTotal: 6 };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });

  it('rejects befriend if party full (6)', () => {
    const enemies = [instantiateRobot('earth-common')];
    enemies[0].hp = 20;
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common'), instantiateRobot('wood-common')],
      reserves: [instantiateRobot('metal-common'), instantiateRobot('earth-common'), instantiateRobot('fire-uncommon')],
      maxTotal: 6
    };
    const result = processBefriend(enemies, party);
    assert.ok(!result.success);
  });
});

describe('Robot Combat - XP', () => {
  it('active robots get 2x shares, reserves get 1x share', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')]
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
      active: [instantiateRobot('fire-common')],
      reserves: []
    };
    // 1 active (2 shares), 0 reserves = 2 total shares
    // perShare = 150/2 = 75 → active gets floor(75*2)=150 → level up (100 XP), 50 remaining
    awardBattleXp(party, 150);
    assert.strictEqual(party.active[0].xp, 50);
    assert.strictEqual(party.active[0].level, 2);
  });
});
