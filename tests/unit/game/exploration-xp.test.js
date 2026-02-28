import { describe, it } from 'node:test';
import assert from 'node:assert';
import { instantiateCreature, addXpToCreature, xpToNextLevel } from '../../../src/game/creatures.js';

describe('Exploration XP - Cubic Curve Integration', () => {
  it('shrine grants exactly 1 level when given xpToNextLevel(creatureLevel)', () => {
    const creature = instantiateCreature('hikaribon');
    creature.level = 5;
    creature.xp = 0;

    const xpNeeded = xpToNextLevel(creature.level); // L5->L6 = 91
    addXpToCreature(creature, xpNeeded);

    assert.strictEqual(creature.level, 6);
    assert.strictEqual(creature.xp, 0);
  });

  it('shrine grants exactly 1 level even at high levels', () => {
    const creature = instantiateCreature('hikaribon');
    creature.level = 20;
    creature.xp = 0;

    const xpNeeded = xpToNextLevel(creature.level);
    addXpToCreature(creature, xpNeeded);

    assert.strictEqual(creature.level, 21);
    assert.strictEqual(creature.xp, 0);
  });

});
