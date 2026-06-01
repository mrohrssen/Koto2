import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHpColor, SC_NAMES, getCreatureStatusKeys } from '../../../public/js/ui/combat-ui-utils.js';

describe('getHpColor', () => {
  it('returns green when pct > 50', () => {
    assert.equal(getHpColor(51), 'var(--hp-green)');
    assert.equal(getHpColor(100), 'var(--hp-green)');
  });

  it('returns yellow when 25 < pct <= 50', () => {
    assert.equal(getHpColor(50), 'var(--hp-yellow)');
    assert.equal(getHpColor(26), 'var(--hp-yellow)');
  });

  it('returns red when pct <= 25', () => {
    assert.equal(getHpColor(25), 'var(--hp-red)');
    assert.equal(getHpColor(0), 'var(--hp-red)');
  });

  it('uses enemy red for enemy bars regardless of pct', () => {
    assert.equal(getHpColor(100, 'enemy'), 'var(--hp-enemy)');
    assert.equal(getHpColor(1, 'enemy'), 'var(--hp-enemy)');
  });
});

describe('stat stage display helpers', () => {
  it('includes DEX in shared stat display names', () => {
    assert.equal(SC_NAMES.dex, 'DEX');
  });

  it('emits dex status keys from positive and negative stat stages', () => {
    assert.deepEqual(
      getCreatureStatusKeys({ hp: 10, statStages: { dex: 2 } }),
      ['dex_up']
    );
    assert.deepEqual(
      getCreatureStatusKeys({ hp: 10, statStages: { dex: -1 } }),
      ['dex_down']
    );
  });
});
