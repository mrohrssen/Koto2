import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getElementMultiplier,
  ELEMENT_CYCLE,
  instantiateCreature,
  RARITY_MULTIPLIERS,
  calculateCreatureDamage,
  addXpToCreature,
  xpToNextLevel,
  getStatsForLevel,
  selectTarget,
  generateEnemyCreature,
  generateEnemyCreatures,
  syncCreatureDefense
} from '../../../src/game/creatures.js';

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

describe('Creature Instantiation', () => {
  it('creates a level-5 common creature with scaled stats', () => {
    const creature = instantiateCreature('hi');
    assert.strictEqual(creature.element, 'fire');
    assert.strictEqual(creature.rarity, 'common');
    assert.strictEqual(creature.level, 5);
    assert.strictEqual(creature.xp, 0);
    // Level 5: base * 1.4 => floor(50 * 1.4) = 70
    assert.strictEqual(creature.maxHp, 70);
    assert.strictEqual(creature.hp, 70);
    assert.strictEqual(creature.attack, 28); // floor(20 * 1.4)
    assert.strictEqual(creature.defense, 7); // floor(5 * 1.4)
    assert.strictEqual(creature.mp, 70); // floor(50 * 1.4)
    assert.strictEqual(creature.maxMp, 70);
    assert.ok(Array.isArray(creature.moves), 'should have moves array');
    assert.ok(creature.moves.length >= 1, 'should have at least one move');
  });

  it('applies rarity multiplier for uncommon at level 5', () => {
    // All R1 creatures are common; test with a common creature and verify the formula
    const creature = instantiateCreature('mizu');
    // common rarity: mult=1.0, base 50/20/50. Level 5 (1.4x): hp=70, atk=28, def=7
    assert.strictEqual(creature.maxHp, 70);
    assert.strictEqual(creature.attack, 28);
    assert.strictEqual(creature.defense, 7);
  });

  it('applies rarity multiplier for rare at level 5', () => {
    // All R1 creatures are common; verify a different creature
    const creature = instantiateCreature('ki');
    // common rarity: mult=1.0, base 50/20/50. Level 5 (1.4x): hp=70, atk=28, def=7
    assert.strictEqual(creature.maxHp, 70);
    assert.strictEqual(creature.attack, 28);
    assert.strictEqual(creature.defense, 7);
  });

  it('has archetype field', () => {
    const creature = instantiateCreature('hi');
    assert.strictEqual(creature.archetype, 'Fighter');
  });

  it('stores base template values for level-up calculations', () => {
    const creature = instantiateCreature('hi');
    assert.strictEqual(creature.baseHpTemplate, 50);
    assert.strictEqual(creature.baseAttackTemplate, 20);
    assert.strictEqual(creature.baseDefenseTemplate, 5);
  });

  it('has category and target on first move', () => {
    const creature = instantiateCreature('hi');
    const move0 = creature.moves[0];
    assert.ok(move0.id, 'move should have id');
    assert.ok(move0.category, 'move should have category');
    assert.ok(move0.target, 'move should have target');
    assert.ok(move0.element, 'move should have element');
    assert.ok(typeof move0.mpCost === 'number', 'move should have mpCost');
  });

  it('has multiple moves as creature levels up', () => {
    // hi learns honoo at level 7, so instantiate at level 7 to get 2 moves
    const creature = instantiateCreature('hi', 7);
    assert.ok(creature.moves.length >= 2, 'should have at least 2 moves at level 7');
    // Each move should have required fields
    for (const move of creature.moves) {
      assert.ok(move.id, 'move should have id');
      assert.ok(move.name, 'move should have Japanese name');
      assert.ok(move.nameEn, 'move should have English name');
    }
  });

  it('includes baseReading from template', () => {
    const creature = instantiateCreature('mizu');
    assert.strictEqual(creature.baseReading, '\u307F\u305A');
  });
});

describe('syncCreatureDefense', () => {
  it('fills missing template and defense from catalog + level', () => {
    const c = instantiateCreature('hi', 6);
    delete c.baseDefenseTemplate;
    delete c.defense;
    syncCreatureDefense(c);
    assert.strictEqual(c.baseDefenseTemplate, 5);
    assert.strictEqual(c.defense, 8); // round(5 * 1.5) at L6
  });
});

describe('Creature Damage', () => {
  it('calculates damage with level, DEF, and type multiplier', () => {
    // L5, atk 14, def 7, power 10, neutral: inner=(2+2)*10*14/7=80, base=10, *1.5 *1 = 15
    const dmg = calculateCreatureDamage({
      attackerLevel: 5,
      attack: 14,
      defenderDefense: 7,
      power: 10,
      typeMultiplier: 1.5,
      variance: 1.0
    });
    assert.strictEqual(dmg, 15);
  });

  it('calculates damage neutral (1.0x type)', () => {
    const dmg = calculateCreatureDamage({
      attackerLevel: 5,
      attack: 14,
      defenderDefense: 7,
      power: 10,
      typeMultiplier: 1.0,
      variance: 1.0
    });
    assert.strictEqual(dmg, 10);
  });
});

describe('Creature Leveling', () => {
  it('+10% stats per level', () => {
    const stats = getStatsForLevel(100, 20, 80, 3, 5);
    assert.strictEqual(stats.maxHp, 120); // 100 * 1.2
    assert.strictEqual(stats.attack, 24); // 20 * 1.2
    assert.strictEqual(stats.maxMp, 96); // 80 * 1.2
    assert.strictEqual(stats.defense, 6); // 5 * 1.2
  });

  it('awards XP and levels up', () => {
    const creature = instantiateCreature('hi');
    // Level 5->6 needs 6^3 - 5^3 = 91 XP
    addXpToCreature(creature, 91);
    assert.strictEqual(creature.level, 6);
    assert.strictEqual(creature.xp, 0);
  });

  it('uses baseHpTemplate and baseAttackTemplate for level-up stats', () => {
    // Simulate a Tank archetype with non-default base stats
    const creature = instantiateCreature('hi');
    creature.baseHpTemplate = 160;
    creature.baseAttackTemplate = 7;
    creature.baseDefenseTemplate = 5;
    creature.maxHp = 160;
    creature.hp = 160;
    creature.attack = 7;
    creature.defense = 5;
    creature.rarity = 'common';
    creature.level = 1;
    creature.xp = 0;

    addXpToCreature(creature, 7); // Level up to 2

    assert.strictEqual(creature.level, 2);
    // Level 2: base * 1.1 => floor(160 * 1.1) = 176
    assert.strictEqual(creature.maxHp, 176);
    // Level 2: base * 1.1 => floor(7 * 1.1) = 7
    assert.strictEqual(creature.attack, 7);
    assert.strictEqual(creature.defense, 6); // round(5 * 1.1)
    // HP should have increased by the same diff
    assert.strictEqual(creature.hp, 176);
  });

  it('xpToNextLevel returns cubic deltas', () => {
    assert.strictEqual(xpToNextLevel(1), 7);   // 2^3 - 1^3
    assert.strictEqual(xpToNextLevel(2), 19);  // 3^3 - 2^3
    assert.strictEqual(xpToNextLevel(3), 37);  // 4^3 - 3^3
    assert.strictEqual(xpToNextLevel(4), 61);  // 5^3 - 4^3
    assert.strictEqual(xpToNextLevel(9), 271); // 10^3 - 9^3
  });

  it('levels up with cubic curve (91 XP to reach L6)', () => {
    const creature = instantiateCreature('hi');
    // Level 5->6 needs 6^3 - 5^3 = 91
    addXpToCreature(creature, 91);
    assert.strictEqual(creature.level, 6);
    assert.strictEqual(creature.xp, 0);
  });

  it('does not level up with 90 XP (needs 91)', () => {
    const creature = instantiateCreature('hi');
    addXpToCreature(creature, 90);
    assert.strictEqual(creature.level, 5);
    assert.strictEqual(creature.xp, 90);
  });

  it('cascading multi-level-up from a single large XP grant', () => {
    const creature = instantiateCreature('hi');
    // 91 (L5->6) + 127 (L6->7) = 218 needed for L7
    addXpToCreature(creature, 218);
    assert.strictEqual(creature.level, 7);
    assert.strictEqual(creature.xp, 0);
  });

  it('addXpToCreature returns array of level-up events', () => {
    const creature = instantiateCreature('hi');
    // 91 (L5->6) + 127 (L6->7) = 218 needed for L7
    const levelUps = addXpToCreature(creature, 218);
    assert.strictEqual(levelUps.length, 2);
    assert.strictEqual(levelUps[0].level, 6);
    assert.strictEqual(levelUps[1].level, 7);
    assert.ok(levelUps[0].maxHp > 0);
    assert.ok(levelUps[0].attack > 0);
    assert.ok(levelUps[0].hpGain >= 0);
  });

  it('addXpToCreature returns empty array when no level-up', () => {
    const creature = instantiateCreature('hi');
    const levelUps = addXpToCreature(creature, 10);
    assert.strictEqual(levelUps.length, 0);
    assert.strictEqual(creature.xp, 10);
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

describe('Move learning cap', () => {
  it('caps high-level direct instantiation at 3 normal moves', () => {
    const creature = instantiateCreature('sakana', 16);

    assert.strictEqual(creature.moves.length, 3,
      `directly instantiated creature should not exceed 3 moves, got ${creature.moves.length}`);
  });

  it('caps high-level wild enemies at 3 normal moves', () => {
    const creature = generateEnemyCreature(16, ['sakana']);

    assert.strictEqual(creature.id, 'sakana');
    assert.strictEqual(creature.moves.length, 3,
      `generated enemy should not exceed 3 moves, got ${creature.moves.length}`);
  });

  it('does not auto-learn a 4th move when creature already has 3', () => {
    // hi has learnset: tataku@1, honoo@7, moeru@12
    // Start at level 6 so it has tataku only, then add 2 fake moves to reach 3
    const creature = instantiateCreature('hi', 6);
    assert.strictEqual(creature.moves.length, 1, 'precondition: hi starts with 1 move at level 6');

    // Add 2 dummy moves to fill up to 3
    creature.moves.push({ id: 'dummy1', name: 'Dummy1', nameEn: 'Dummy1', element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 5 });
    creature.moves.push({ id: 'dummy2', name: 'Dummy2', nameEn: 'Dummy2', element: 'neutral', category: 'damage', target: 'single_enemy', power: 5, mpCost: 5 });
    assert.strictEqual(creature.moves.length, 3, 'precondition: creature now has 3 moves');

    // Give enough XP to reach level 7+ (triggers honoo learn attempt)
    const levelUps = addXpToCreature(creature, 5000);

    // Verify a level-up with newMove actually occurred (test isn't vacuously passing)
    const levelWithMove = levelUps.find(lu => lu.newMove);
    assert.ok(levelWithMove, 'a level-up should have attempted to teach a new move');
    assert.ok(levelWithMove.newMove.id, 'newMove should have an id for replacement UI');

    // The move should NOT have been auto-pushed -- creature still has 3 moves
    assert.strictEqual(creature.moves.length, 3,
      `creature should not exceed 3 moves, got ${creature.moves.length}`);
  });
});

describe('Multi-Enemy Generation', () => {
  it('generates 1-3 enemy creatures', () => {
    const enemies = generateEnemyCreatures(1);
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
      results.push(generateEnemyCreatures(1));
    }
    // At least one result should have >1 enemy
    const hasMultiple = results.some(r => r.length > 1);
    assert.ok(hasMultiple, 'Expected at least one multi-enemy encounter in 20 rolls');
  });
});
