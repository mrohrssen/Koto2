import { beforeEach, describe, it, mock } from 'node:test';
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

describe('diagnostics init', () => {
  let originalWarn;

  beforeEach(() => {
    originalWarn = console.warn;
    console.warn = () => {};
    global.window = {
      fetch: async () => ({ status: 200 }),
      addEventListener: () => {},
    };
    global.requestAnimationFrame = () => 1;
  });

  it('does not wrap console or start frame tracking more than once', () => {
    let rafCount = 0;
    global.requestAnimationFrame = () => {
      rafCount++;
      return rafCount;
    };

    diagnostics.init();
    diagnostics.init();

    console.warn('single warning');

    const warningCount = diagnostics.snapshot().consoleErrors
      .filter(entry => entry.message === 'single warning')
      .length;

    console.warn = originalWarn;

    assert.equal(rafCount, 1);
    assert.equal(warningCount, 1);
  });
});
