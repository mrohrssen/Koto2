import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getElementMultiplier,
  ELEMENT_CYCLE,
  instantiateRobot,
  RARITY_MULTIPLIERS,
  calculateRobotDamage,
  addXpToRobot,
  getStatsForLevel,
  selectTarget,
  generateEnemyRobots
} from '../../src/game/robots.js';

describe('Element Cycle', () => {
  it('wood beats earth (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('wood', 'earth'), 1.5);
  });
  it('earth beats water (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('earth', 'water'), 1.5);
  });
  it('water beats fire (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('water', 'fire'), 1.5);
  });
  it('fire beats metal (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('fire', 'metal'), 1.5);
  });
  it('metal beats wood (1.5x)', () => {
    assert.strictEqual(getElementMultiplier('metal', 'wood'), 1.5);
  });
  it('reverse is 0.67x', () => {
    assert.strictEqual(getElementMultiplier('earth', 'wood'), 0.67);
  });
  it('neutral is 1.0x', () => {
    assert.strictEqual(getElementMultiplier('fire', 'earth'), 1.0);
  });
});

describe('Robot Instantiation', () => {
  it('creates a level-1 common robot with base stats', () => {
    const robot = instantiateRobot('sizzlit');
    assert.strictEqual(robot.element, 'fire');
    assert.strictEqual(robot.rarity, 'common');
    assert.strictEqual(robot.level, 1);
    assert.strictEqual(robot.xp, 0);
    assert.strictEqual(robot.maxHp, 100);
    assert.strictEqual(robot.hp, 100);
    assert.strictEqual(robot.attack, 10);
    assert.strictEqual(robot.ultimate.charges, 0);
    assert.strictEqual(robot.ultimate.chargesRequired, 5);
  });

  it('applies rarity multiplier for uncommon', () => {
    const robot = instantiateRobot('glitchi');
    assert.strictEqual(robot.maxHp, 110); // 100 * 1.1
    assert.strictEqual(robot.attack, 11); // 10 * 1.1
  });

  it('applies rarity multiplier for legendary', () => {
    const robot = instantiateRobot('gilden');
    assert.strictEqual(robot.maxHp, 140); // 100 * 1.4
    assert.strictEqual(robot.attack, 14); // 10 * 1.4
  });

  it('has archetype field', () => {
    const robot = instantiateRobot('sizzlit');
    assert.strictEqual(robot.archetype, 'Fighter');
  });

  it('stores base template values for level-up calculations', () => {
    const robot = instantiateRobot('sizzlit');
    assert.strictEqual(robot.baseHpTemplate, 100);
    assert.strictEqual(robot.baseAttackTemplate, 10);
  });

  it('has type and target on autoSkill', () => {
    const robot = instantiateRobot('sizzlit');
    assert.strictEqual(robot.autoSkill.type, 'damage');
    assert.strictEqual(robot.autoSkill.target, 'single_enemy');
  });

  it('has type and target on ultimate', () => {
    const robot = instantiateRobot('sizzlit');
    assert.strictEqual(robot.ultimate.type, 'damage');
    assert.strictEqual(robot.ultimate.target, 'all_enemies');
  });
});

describe('Robot Damage', () => {
  it('calculates damage with element multiplier (seeded)', () => {
    const dmg = calculateRobotDamage(20, 20, 1.5, 1.0);
    assert.strictEqual(dmg, 60); // (20/10) * 20 * 1.5 * 1.0
  });

  it('calculates damage neutral (1.0x)', () => {
    const dmg = calculateRobotDamage(20, 20, 1.0, 1.0);
    assert.strictEqual(dmg, 40); // (20/10) * 20 * 1.0 * 1.0
  });
});

describe('Robot Leveling', () => {
  it('+10% stats per level', () => {
    const stats = getStatsForLevel(100, 20, 3);
    assert.strictEqual(stats.maxHp, 120); // 100 * 1.2
    assert.strictEqual(stats.attack, 24); // 20 * 1.2
  });

  it('awards XP and levels up', () => {
    const robot = instantiateRobot('sizzlit');
    addXpToRobot(robot, 100);
    assert.strictEqual(robot.level, 2);
    assert.strictEqual(robot.xp, 0);
  });

  it('uses baseHpTemplate and baseAttackTemplate for level-up stats', () => {
    // Simulate a Tank archetype with non-default base stats
    const robot = instantiateRobot('sizzlit');
    robot.baseHpTemplate = 160;
    robot.baseAttackTemplate = 7;
    robot.maxHp = 160;
    robot.hp = 160;
    robot.attack = 7;
    robot.rarity = 'common';
    robot.level = 1;
    robot.xp = 0;

    addXpToRobot(robot, 100); // Level up to 2

    assert.strictEqual(robot.level, 2);
    // Level 2: base * 1.1 => floor(160 * 1.1) = 176
    assert.strictEqual(robot.maxHp, 176);
    // Level 2: base * 1.1 => floor(7 * 1.1) = 7
    assert.strictEqual(robot.attack, 7);
    // HP should have increased by the same diff
    assert.strictEqual(robot.hp, 176);
  });
});

describe('Targeting AI', () => {
  it('picks type-disadvantaged target first', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'wood', hp: 50, maxHp: 100 },
      { element: 'metal', hp: 80, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.element, 'metal');
  });

  it('picks lowest %HP among disadvantaged targets', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'metal', hp: 80, maxHp: 100 },
      { element: 'metal', hp: 30, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.hp, 30);
  });

  it('falls back to neutral target', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'water', hp: 50, maxHp: 100 },
      { element: 'earth', hp: 80, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.element, 'earth');
  });

  it('falls back to lowest %HP if all have advantage', () => {
    const attacker = { element: 'fire' };
    const targets = [
      { element: 'water', hp: 50, maxHp: 100 },
      { element: 'water', hp: 20, maxHp: 100 }
    ];
    const target = selectTarget(attacker, targets);
    assert.strictEqual(target.hp, 20);
  });
});

describe('Multi-Enemy Generation', () => {
  it('generates 1-3 enemy robots', () => {
    const enemies = generateEnemyRobots(1);
    assert.ok(enemies.length >= 1 && enemies.length <= 3);
    for (const e of enemies) {
      assert.ok(e.element);
      assert.ok(e.hp > 0);
      assert.ok(e.maxHp > 0);
    }
  });

  it('each enemy is independently generated', () => {
    // Run multiple times to check variety
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(generateEnemyRobots(1));
    }
    // At least one result should have >1 enemy
    const hasMultiple = results.some(r => r.length > 1);
    assert.ok(hasMultiple, 'Expected at least one multi-enemy encounter in 20 rolls');
  });
});
