import { describe, it } from 'node:test';
import assert from 'node:assert';
import { instantiateRobot } from '../../src/game/robots.js';

describe('Robot Swap', () => {
  it('swaps active robot with reserve', () => {
    const party = {
      active: [instantiateRobot('fire-common'), instantiateRobot('water-common'), instantiateRobot('wood-common')],
      reserves: [instantiateRobot('metal-common'), instantiateRobot('earth-common')],
      maxTotal: 6
    };
    const swappedOut = party.active[1]; // water
    const swappedIn = party.reserves[0]; // metal

    // Perform swap
    party.active[1] = swappedIn;
    party.reserves[0] = swappedOut;

    assert.strictEqual(party.active[1].element, 'metal');
    assert.strictEqual(party.reserves[0].element, 'water');
  });

  it('can swap a KO robot out for a healthy reserve', () => {
    const party = {
      active: [instantiateRobot('fire-common')],
      reserves: [instantiateRobot('water-common')],
      maxTotal: 6
    };
    party.active[0].hp = 0; // KO

    const swappedIn = party.reserves[0];
    party.reserves[0] = party.active[0];
    party.active[0] = swappedIn;

    assert.ok(party.active[0].hp > 0);
    assert.strictEqual(party.reserves[0].hp, 0);
  });
});
