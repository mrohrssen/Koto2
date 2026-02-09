import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getStarterRobots } from '../../src/game/robots.js';

describe('Starter Selection', () => {
  it('returns 3 common starters: fire, water, wood', () => {
    const starters = getStarterRobots();
    assert.strictEqual(starters.length, 3);
    const elements = starters.map(s => s.element).sort();
    assert.deepStrictEqual(elements, ['fire', 'water', 'wood']);
    assert.ok(starters.every(s => s.rarity === 'common'));
  });
});
