import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../public/js/analytics.js', {
  namedExports: {
    setCrashContext: () => {},
    trackMilestone: () => {},
    recordNonFatal: () => {},
  },
});

await mock.module('../../public/js/analytics-core.js', {
  namedExports: {
    extractGameContext: () => ({}),
  },
});

const diagnostics = await import('../../public/js/diagnostics.js');

describe('snapshot performance telemetry', () => {
  it('reports frame buckets and texture timeline from the rAF tick', () => {
    let rafCb = null;
    global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
    global.window = {
      fetch: async () => ({ status: 200 }),
      addEventListener: () => {},
      __pixiApp: () => ({
        app: { renderer: { texture: { managedTextures: { length: 42 } } } },
      }),
    };

    let fakeNow = 0;
    const realPerformance = globalThis.performance;
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => fakeNow },
      configurable: true,
    });

    try {
      diagnostics.init();

      fakeNow = 16;  // healthy frame (delta 16ms); sampler takes baseline
      rafCb();
      fakeNow = 56;  // jank frame (delta 40ms)
      rafCb();

      const perf = diagnostics.snapshot().performance;
      assert.equal(perf.frameBuckets.length, 1);
      assert.deepEqual(perf.frameBuckets[0], {
        m: 0, f: 2, b17: 1, b25: 0, b33: 0, b50: 1, over: 0,
      });
      assert.deepEqual(perf.textureTimeline, [{ t: 0, n: 42 }]);
      // Continuity: legacy fields still present
      assert.equal(perf.totalFrames, 2);
      assert.equal(perf.slowFrames, 1);
    } finally {
      Object.defineProperty(globalThis, 'performance', {
        value: realPerformance,
        configurable: true,
      });
    }
  });
});
