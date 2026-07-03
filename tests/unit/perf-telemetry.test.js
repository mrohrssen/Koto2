import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createFrameStats, createTextureSampler } =
  await import('../../public/js/perf-telemetry.js');

describe('createFrameStats', () => {
  it('buckets frame deltas by threshold', () => {
    const stats = createFrameStats();
    const nowMs = 30_000; // all within minute 0
    stats.onFrame(10, nowMs);
    stats.onFrame(17, nowMs); // boundary: healthy
    stats.onFrame(18, nowMs); // 17–25
    stats.onFrame(25, nowMs);
    stats.onFrame(26, nowMs); // 25–33
    stats.onFrame(33, nowMs);
    stats.onFrame(34, nowMs); // 33–50
    stats.onFrame(50, nowMs);
    stats.onFrame(51, nowMs); // over
    assert.deepEqual(stats.toArray(), [
      { m: 0, f: 9, b17: 2, b25: 2, b33: 2, b50: 2, over: 1 },
    ]);
  });

  it('rolls over to a new record each minute', () => {
    const stats = createFrameStats();
    stats.onFrame(16, 59_000);
    stats.onFrame(16, 61_000);
    const arr = stats.toArray();
    assert.equal(arr.length, 2);
    assert.equal(arr[0].m, 0);
    assert.equal(arr[1].m, 1);
  });

  it('evicts oldest minutes beyond maxMinutes', () => {
    const stats = createFrameStats({ maxMinutes: 2 });
    stats.onFrame(16, 0);
    stats.onFrame(16, 60_000);
    stats.onFrame(16, 120_000);
    assert.deepEqual(stats.toArray().map((r) => r.m), [1, 2]);
  });

  it('ignores app-suspend gaps entirely', () => {
    const stats = createFrameStats();
    stats.onFrame(16, 1_000);
    stats.onFrame(2_500, 3_500); // resumed from background
    assert.deepEqual(stats.toArray(), [
      { m: 0, f: 1, b17: 1, b25: 0, b33: 0, b50: 0, over: 0 },
    ]);
  });
});

describe('createTextureSampler', () => {
  it('samples at most once per interval', () => {
    let count = 10;
    const s = createTextureSampler({ getCount: () => count, intervalMs: 30_000 });
    s.maybeSample(0);
    count = 20;
    s.maybeSample(15_000); // too soon — skipped
    s.maybeSample(30_000);
    assert.deepEqual(s.toArray(), [{ t: 0, n: 10 }, { t: 30, n: 20 }]);
  });

  it('skips samples when PIXI is not booted', () => {
    const s = createTextureSampler({ getCount: () => null, intervalMs: 30_000 });
    s.maybeSample(0);
    assert.deepEqual(s.toArray(), []);
  });

  it('survives a throwing getCount', () => {
    const s = createTextureSampler({
      getCount: () => { throw new Error('no renderer'); },
    });
    s.maybeSample(0);
    assert.deepEqual(s.toArray(), []);
  });

  it('evicts oldest samples beyond maxSamples', () => {
    const s = createTextureSampler({ getCount: () => 1, intervalMs: 10, maxSamples: 2 });
    s.maybeSample(0);
    s.maybeSample(1_000);
    s.maybeSample(2_000);
    assert.deepEqual(s.toArray().map((x) => x.t), [1, 2]);
  });
});
