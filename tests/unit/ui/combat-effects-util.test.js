import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDamageTier, getTierClassName, TIER_EFFECTS } from '../../../public/js/pixi/combat-effects-util.js';

describe('getDamageTier', () => {
  it('returns tier 0 for < 10% damage', () => {
    assert.equal(getDamageTier(5, 100), 0);
  });
  it('returns tier 1 for 10-19% damage', () => {
    assert.equal(getDamageTier(15, 100), 1);
  });
  it('returns tier 2 for 20-34% damage', () => {
    assert.equal(getDamageTier(25, 100), 2);
  });
  it('returns tier 3 for 35-49% damage', () => {
    assert.equal(getDamageTier(40, 100), 3);
  });
  it('returns tier 4 for 50%+ damage', () => {
    assert.equal(getDamageTier(60, 100), 4);
  });
  it('returns tier 1 for zero maxHp', () => {
    assert.equal(getDamageTier(10, 0), 1);
  });
  it('handles exact threshold boundaries', () => {
    assert.equal(getDamageTier(10, 100), 1);
    assert.equal(getDamageTier(20, 100), 2);
    assert.equal(getDamageTier(35, 100), 3);
    assert.equal(getDamageTier(50, 100), 4);
  });
});

describe('getTierClassName', () => {
  it('maps tiers to names', () => {
    assert.equal(getTierClassName(0), 'light');
    assert.equal(getTierClassName(4), 'massive');
  });
  it('defaults to normal for out-of-range', () => {
    assert.equal(getTierClassName(99), 'normal');
  });
});

describe('TIER_EFFECTS', () => {
  it('has 5 tiers', () => {
    assert.equal(TIER_EFFECTS.length, 5);
  });
  it('particles increase with tier', () => {
    for (let i = 1; i < TIER_EFFECTS.length; i++) {
      assert.ok(TIER_EFFECTS[i].particles > TIER_EFFECTS[i - 1].particles);
    }
  });
});
