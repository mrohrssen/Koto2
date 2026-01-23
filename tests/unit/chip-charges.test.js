import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getChipCharge,
  incrementAllEquippedCharges,
  resetChipCharge,
  isChipSkillReady
} from '../../src/game/items/chips.js';

describe('Chip Charge Helpers', () => {
  function makePlayer(charges = {}, equippedChips = ['battery', 'speaker']) {
    return {
      _chipCharges: charges,
      equipment: { weapon: { equippedChips } }
    };
  }

  it('getChipCharge returns 0 for uncharged chip', () => {
    const player = makePlayer();
    assert.strictEqual(getChipCharge(player, 'battery'), 0);
  });

  it('getChipCharge returns stored charge', () => {
    const player = makePlayer({ battery: 3 });
    assert.strictEqual(getChipCharge(player, 'battery'), 3);
  });

  it('incrementAllEquippedCharges increments all equipped chips by 1', () => {
    const player = makePlayer({ battery: 2 });
    incrementAllEquippedCharges(player);
    assert.strictEqual(player._chipCharges.battery, 3);
    assert.strictEqual(player._chipCharges.speaker, 1);
  });

  it('resetChipCharge sets charge to 0', () => {
    const player = makePlayer({ battery: 5 });
    resetChipCharge(player, 'battery');
    assert.strictEqual(player._chipCharges.battery, 0);
  });

  it('isChipSkillReady returns true at 5 charges', () => {
    const player = makePlayer({ battery: 5 });
    assert.strictEqual(isChipSkillReady(player, 'battery'), true);
  });

  it('isChipSkillReady returns false below required charges', () => {
    const player = makePlayer({ battery: 4 });
    assert.strictEqual(isChipSkillReady(player, 'battery'), false);
  });

  it('incrementAllEquippedCharges skips chips not in weapon', () => {
    const player = makePlayer({}, ['battery']);
    incrementAllEquippedCharges(player);
    assert.strictEqual(player._chipCharges.battery, 1);
    assert.strictEqual(player._chipCharges.speaker, undefined);
  });
});
