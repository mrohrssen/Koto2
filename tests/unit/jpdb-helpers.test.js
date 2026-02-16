import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tierFromRank, sleep } from '../../scripts/lib/jpdb-helpers.mjs';

describe('tierFromRank', () => {
  it('returns common for rank 1-3000', () => {
    assert.equal(tierFromRank(1), 'common');
    assert.equal(tierFromRank(1500), 'common');
    assert.equal(tierFromRank(3000), 'common');
  });
  it('returns uncommon for rank 3001-6000', () => {
    assert.equal(tierFromRank(3001), 'uncommon');
    assert.equal(tierFromRank(6000), 'uncommon');
  });
  it('returns rare for rank 6001-12000', () => {
    assert.equal(tierFromRank(6001), 'rare');
    assert.equal(tierFromRank(12000), 'rare');
  });
  it('returns epic for rank 12001-20000', () => {
    assert.equal(tierFromRank(12001), 'epic');
    assert.equal(tierFromRank(20000), 'epic');
  });
  it('returns legendary for rank 20001-30000', () => {
    assert.equal(tierFromRank(20001), 'legendary');
    assert.equal(tierFromRank(30000), 'legendary');
  });
  it('returns rejected for rank 30001+', () => {
    assert.equal(tierFromRank(30001), 'rejected');
    assert.equal(tierFromRank(99999), 'rejected');
  });
  it('returns rejected for null/undefined', () => {
    assert.equal(tierFromRank(null), 'rejected');
    assert.equal(tierFromRank(undefined), 'rejected');
  });
});

describe('sleep', () => {
  it('resolves after specified ms', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
  });
});
