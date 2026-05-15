import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectManifestWebpUrls,
  findUncachedUrls,
  shouldRunBackgroundAssetWarmup,
  toAbsoluteAssetUrl,
} from '../../../public/js/assets/asset-warmup.js';
import {
  SPRITE_VERSION,
  BACKGROUND_VERSION,
} from '../../../src/shared/asset-versions.js';

describe('asset background warmup', () => {
  it('collects canonical versioned webp URLs from the manifest', () => {
    const urls = collectManifestWebpUrls({
      creatures: {
        neko: {
          static: true,
          animated: {
            idle: '/assets/sprites/creatures-animated/neko/idle.webp?v=anim',
            walk: '/assets/sprites/creatures-animated/neko/walk.webp?v=anim',
          },
        },
        missingStatic: { static: false },
      },
      backgrounds: { starter_meadow: ['sky', 'battleground'] },
      actions: ['punch'],
      items: ['rice-ball'],
      npcs: ['cid'],
      objects: ['campfire'],
    });

    assert.deepEqual(urls.sort(), [
      `/assets/backgrounds/starter_meadow/battleground.webp?v=${BACKGROUND_VERSION}`,
      `/assets/backgrounds/starter_meadow/sky.webp?v=${BACKGROUND_VERSION}`,
      `/assets/sprites/actions/punch.webp?v=${SPRITE_VERSION}`,
      `/assets/sprites/creatures-animated/neko/idle.webp?v=anim`,
      `/assets/sprites/creatures-animated/neko/walk.webp?v=anim`,
      `/assets/sprites/creatures/neko.webp?v=${SPRITE_VERSION}`,
      `/assets/sprites/items/rice-ball.webp?v=${SPRITE_VERSION}`,
      `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`,
      `/assets/sprites/objects/campfire.webp?v=${SPRITE_VERSION}`,
    ].sort());
  });

  it('skips unsafe background warmup conditions', () => {
    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: true, connection: { effectiveType: '4g' } },
      cachesImpl: {},
      serviceWorkerLike: { controller: {} },
    }), false);

    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: true, connection: { effectiveType: '4g' } },
      cachesImpl: { match: async () => undefined },
      serviceWorkerLike: {},
    }), false);

    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: false, connection: {} },
      cachesImpl: { match: async () => undefined },
      serviceWorkerLike: { controller: {} },
    }), false);

    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: true, connection: { saveData: true } },
      cachesImpl: { match: async () => undefined },
      serviceWorkerLike: { controller: {} },
    }), false);

    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: true, connection: { effectiveType: '2g' } },
      cachesImpl: { match: async () => undefined },
      serviceWorkerLike: { controller: {} },
    }), false);

    assert.equal(shouldRunBackgroundAssetWarmup({
      navigatorLike: { onLine: true, connection: { effectiveType: '4g' } },
      cachesImpl: { match: async () => undefined },
      serviceWorkerLike: { controller: {} },
    }), true);
  });

  it('filters out URLs that already exist in Cache Storage', async () => {
    const origin = 'https://koto.test';
    const cachedUrl = toAbsoluteAssetUrl('/assets/sprites/creatures/neko.webp?v=test', origin);
    const cachesImpl = {
      match: async (request) => {
        const url = typeof request === 'string' ? request : request.url;
        return url === cachedUrl ? {} : undefined;
      },
    };

    const uncached = await findUncachedUrls([
      '/assets/sprites/creatures/neko.webp?v=test',
      '/assets/sprites/creatures/inu.webp?v=test',
    ], cachesImpl, origin);

    assert.deepEqual(uncached, [
      toAbsoluteAssetUrl('/assets/sprites/creatures/inu.webp?v=test', origin),
    ]);
  });
});
