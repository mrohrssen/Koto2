import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHpColor } from '../../../public/js/ui/combat-ui-utils.js';

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
});
