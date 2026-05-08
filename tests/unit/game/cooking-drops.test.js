import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rollRoomIngredientDrops } from '../../../src/game/services/cooking-service.js';

function sequenceRng(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('room transition ingredient drops', () => {
  it('can roll zero ingredients', () => {
    assert.deepEqual(rollRoomIngredientDrops({ rng: () => 0.49 }), []);
  });

  it('can roll three ingredients for demo mode', () => {
    const drops = rollRoomIngredientDrops({ rng: sequenceRng([0.50, 0, 0, 0, 0, 0, 0]) });

    assert.equal(drops.length, 3);
    assert.ok(drops.every(drop => drop.quantity === 1 && drop.id));
  });

  it('can roll six separate ingredient drops for demo mode', () => {
    const drops = rollRoomIngredientDrops({ rng: sequenceRng([0.85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });

    assert.equal(drops.length, 6);
    assert.ok(drops.every(drop => drop.quantity === 1));
  });
});
