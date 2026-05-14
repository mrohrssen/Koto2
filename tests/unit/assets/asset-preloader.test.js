import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetPreloader,
} from '../../../public/js/assets/asset-preloader.js';

describe('asset preloader', () => {
  it('dedupes URLs and respects concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const loaded = [];
    const preloader = createAssetPreloader({
      concurrency: 2,
      loadImage: async (url) => {
        active++;
        maxActive = Math.max(maxActive, active);
        loaded.push(url);
        await Promise.resolve();
        active--;
      },
      scheduleIdle: (fn) => fn(),
    });

    preloader.enqueue(['/a.webp', '/b.webp', '/a.webp', '/c.webp']);
    await preloader.flushForTests();

    assert.deepEqual(loaded.sort(), ['/a.webp', '/b.webp', '/c.webp']);
    assert.equal(maxActive <= 2, true);
  });
});
