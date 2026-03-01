import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQueueEntry,
  mergeIntoQueue,
} from '../../../scripts/sprite-queue-review-lib.mjs';

// ---------------------------------------------------------------------------
// buildQueueEntry
// ---------------------------------------------------------------------------

describe('Queue — buildQueueEntry', () => {
  it('builds correct entry from mixed gate1+gate2 results', () => {
    const gate1Results = [
      {
        file: 'dash-a.png',
        passed: true,
        checks: [{ name: 'dimensions', passed: true, detail: '128x128' }],
      },
      {
        file: 'dash-b.png',
        passed: true,
        checks: [{ name: 'dimensions', passed: true, detail: '128x128' }],
      },
      {
        file: 'dash-c.png',
        passed: false,
        checks: [
          { name: 'dimensions', passed: true, detail: '128x128' },
          { name: 'fake_transparency', passed: false, detail: '847 bad pixels' },
        ],
      },
    ];

    const gate2Results = [
      {
        file: 'dash-a.png',
        passed: true,
        concept: 5,
        style: 4,
        readability: 4,
        total: 13,
        reasoning: 'Clear dash icon.',
      },
      {
        file: 'dash-b.png',
        passed: true,
        concept: 4,
        style: 5,
        readability: 3,
        total: 12,
        reasoning: 'Decent dash icon.',
      },
    ];

    const entry = buildQueueEntry({
      id: 'dash',
      type: 'action',
      word: '走る',
      wordEn: 'dash',
      gate1Results,
      gate2Results,
    });

    assert.equal(entry.id, 'dash');
    assert.equal(entry.type, 'action');
    assert.equal(entry.word, '走る');
    assert.equal(entry.wordEn, 'dash');

    // 2 candidates (both passed gate1 and gate2)
    assert.equal(entry.candidates.length, 2);
    // Sorted by total descending — dash-a (13) before dash-b (12)
    assert.equal(entry.candidates[0].file, 'dash-a.png');
    assert.equal(entry.candidates[0].total, 13);
    assert.equal(entry.candidates[0].gate1, 'pass');
    assert.deepEqual(entry.candidates[0].gate2, { concept: 5, style: 4, readability: 4 });
    assert.equal(entry.candidates[0].reasoning, 'Clear dash icon.');

    assert.equal(entry.candidates[1].file, 'dash-b.png');
    assert.equal(entry.candidates[1].total, 12);

    // 1 rejected (dash-c failed gate1)
    assert.equal(entry.rejected.length, 1);
    assert.equal(entry.rejected[0].file, 'dash-c.png');
    assert.equal(entry.rejected[0].gate, 'gate1');
    assert.equal(entry.rejected[0].reason, 'Gate 1: fake_transparency — 847 bad pixels');

    // Metadata
    assert.equal(entry.attempt, 1);
    assert.ok(entry.generatedAt);
  });

  it('handles missing gate2 result for a gate1 pass', () => {
    const gate1Results = [
      {
        file: 'heal-a.png',
        passed: true,
        checks: [{ name: 'dimensions', passed: true, detail: '128x128' }],
      },
    ];

    // No gate2 results at all
    const gate2Results = [];

    const entry = buildQueueEntry({
      id: 'heal',
      type: 'action',
      word: '治す',
      wordEn: 'heal',
      gate1Results,
      gate2Results,
    });

    // Should be rejected since gate2 was not evaluated
    assert.equal(entry.candidates.length, 0);
    assert.equal(entry.rejected.length, 1);
    assert.equal(entry.rejected[0].file, 'heal-a.png');
    assert.equal(entry.rejected[0].gate, 'gate2');
    assert.equal(entry.rejected[0].reason, 'Gate 2: not evaluated');
  });
});

// ---------------------------------------------------------------------------
// mergeIntoQueue
// ---------------------------------------------------------------------------

describe('Queue — mergeIntoQueue', () => {
  it('merges new entries into existing queue, replacing duplicates', () => {
    const existingQueue = {
      pending: [
        { id: 'heal', type: 'action', word: '治す', wordEn: 'heal', candidates: [{ file: 'heal-a.png' }], rejected: [] },
      ],
    };

    const newEntries = [
      { id: 'dash', type: 'action', word: '走る', wordEn: 'dash', candidates: [{ file: 'dash-a.png' }], rejected: [] },
      { id: 'heal', type: 'action', word: '治す', wordEn: 'heal', candidates: [{ file: 'heal-b.png' }], rejected: [] },
    ];

    const merged = mergeIntoQueue(existingQueue, newEntries);

    assert.equal(merged.pending.length, 2);

    // heal should be updated (not duplicated)
    const healEntries = merged.pending.filter(e => e.id === 'heal');
    assert.equal(healEntries.length, 1);
    assert.equal(healEntries[0].candidates[0].file, 'heal-b.png');

    // dash should be present
    const dashEntries = merged.pending.filter(e => e.id === 'dash');
    assert.equal(dashEntries.length, 1);
  });

  it('preserves entries not in new batch', () => {
    const existingQueue = {
      pending: [
        { id: 'heal', type: 'action', word: '治す', wordEn: 'heal', candidates: [], rejected: [] },
        { id: 'bite', type: 'action', word: '噛む', wordEn: 'bite', candidates: [], rejected: [] },
      ],
    };

    const newEntries = [
      { id: 'dash', type: 'action', word: '走る', wordEn: 'dash', candidates: [], rejected: [] },
    ];

    const merged = mergeIntoQueue(existingQueue, newEntries);

    assert.equal(merged.pending.length, 3);

    // All three should be present
    const ids = merged.pending.map(e => e.id);
    assert.ok(ids.includes('heal'));
    assert.ok(ids.includes('bite'));
    assert.ok(ids.includes('dash'));
  });
});
