import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPercent, sortBalanceRows } from '../../public/js/balance.js';

describe('balance view helpers', () => {
  it('formats rates as percentages', () => {
    assert.equal(formatPercent(0.625), '62.5%');
    assert.equal(formatPercent(0), '0%');
  });

  it('sorts by win rate descending by default', () => {
    const rows = [
      { nameEn: 'Weak', winRate: 0.2, appearances: 10 },
      { nameEn: 'Strong', winRate: 0.8, appearances: 10 },
      { nameEn: 'Medium', winRate: 0.5, appearances: 10 }
    ];

    const sorted = sortBalanceRows(rows, 'winRate', 'desc');

    assert.deepEqual(sorted.map(row => row.nameEn), ['Strong', 'Medium', 'Weak']);
  });

  it('sorts text columns ascending', () => {
    const rows = [
      { nameEn: 'Water', rarity: 'rare' },
      { nameEn: 'Fire', rarity: 'common' }
    ];

    const sorted = sortBalanceRows(rows, 'nameEn', 'asc');

    assert.deepEqual(sorted.map(row => row.nameEn), ['Fire', 'Water']);
  });
});
