import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankedMatchQueue } from '../../../src/pvp/ranked-match-queue.js';

function entry(overrides = {}) {
  return {
    userId: overrides.userId || 'user-a',
    username: overrides.username || 'A',
    socketId: overrides.socketId || 'sock-a',
    rating: overrides.rating || { mu: 25, sigma: 25 / 3 },
    displayRating: overrides.displayRating ?? 1200,
    enqueuedAt: overrides.enqueuedAt ?? 1000
  };
}

describe('RankedMatchQueue', () => {
  it('enqueues one entry per user', () => {
    const queue = new RankedMatchQueue();
    assert.strictEqual(queue.enqueue(entry()), true);
    assert.strictEqual(queue.enqueue(entry({ socketId: 'sock-b' })), false);
    assert.strictEqual(queue.hasUser('user-a'), true);
  });

  it('pairs close ratings immediately', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'close', socketId: 's2', displayRating: 1260, enqueuedAt: 2000 }));
    const pair = queue.findMatch(3000);
    assert.deepStrictEqual(pair.map(p => p.userId), ['old', 'close']);
    assert.strictEqual(queue.hasUser('old'), false);
    assert.strictEqual(queue.hasUser('close'), false);
  });

  it('does not pair outside the current search window', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'far', socketId: 's2', displayRating: 1400, enqueuedAt: 2000 }));
    assert.strictEqual(queue.findMatch(5000), null);
  });

  it('widens search after waiting', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'old', socketId: 's1', displayRating: 1200, enqueuedAt: 1000 }));
    queue.enqueue(entry({ userId: 'far', socketId: 's2', displayRating: 1400, enqueuedAt: 2000 }));
    const pair = queue.findMatch(25000);
    assert.deepStrictEqual(pair.map(p => p.userId), ['old', 'far']);
  });

  it('removes by user and socket', () => {
    const queue = new RankedMatchQueue();
    queue.enqueue(entry({ userId: 'a', socketId: 's1' }));
    queue.enqueue(entry({ userId: 'b', socketId: 's2' }));
    assert.strictEqual(queue.dequeue('a'), true);
    assert.strictEqual(queue.removeBySocket('s2'), true);
    assert.strictEqual(queue.size, 0);
  });
});
