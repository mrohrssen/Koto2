import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectLabel } from '../../../public/js/ui/move-effect-label.js';

describe('effectLabel', () => {
  it('damage move returns sword + power number', () => {
    const move = { category: 'damage', power: 15, mpCost: 12, statusEffect: null };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '15' });
  });

  it('damage move with zero power still returns sword + "0"', () => {
    const move = { category: 'damage', power: 0, mpCost: 5, statusEffect: null };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '0' });
  });

  it('buff with single statChange returns chevron-up + formatted label', () => {
    const move = { category: 'buff', power: 0, statChanges: { atk: 1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Atk +1' });
  });

  it('buff with multiple statChanges picks largest magnitude', () => {
    const move = { category: 'buff', power: 0, statChanges: { atk: 1, def: 2 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Def +2' });
  });

  it('buff with tied magnitude tie-breaks atk > def > spd', () => {
    const move = { category: 'buff', power: 0, statChanges: { def: 1, atk: 1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Atk +1' });
  });

  it('renders dex stat changes', () => {
    const move = { category: 'buff', statChanges: { dex: 1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-up', text: 'Dex +1' });
  });

  it('buff with empty statChanges falls through to default', () => {
    const move = { category: 'buff', power: 0, statChanges: {} };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '0' });
  });

  it('debuff returns chevron-down with negative label', () => {
    const move = { category: 'debuff', power: 0, statChanges: { atk: -1 } };
    assert.deepEqual(effectLabel(move), { iconType: 'chevron-down', text: 'Atk -1' });
  });

  it('heal returns heart + Heal <power>', () => {
    const move = { category: 'heal', power: 25, mpCost: 8 };
    assert.deepEqual(effectLabel(move), { iconType: 'heart', text: 'Heal 25' });
  });

  it('status-only non-damage returns star + effect + duration', () => {
    const move = { category: 'status', power: 0, statusEffect: 'poison', statusDuration: 3 };
    assert.deepEqual(effectLabel(move), { iconType: 'star', text: 'Poison 3T' });
  });

  it('damage with status effect still returns sword + power (status visible in help popup)', () => {
    const move = { category: 'damage', power: 20, statusEffect: 'stun', statusDuration: 1 };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '20' });
  });

  it('unknown category falls through to default damage behavior', () => {
    const move = { category: 'mystery', power: 7 };
    assert.deepEqual(effectLabel(move), { iconType: 'sword', text: '7' });
  });
});
