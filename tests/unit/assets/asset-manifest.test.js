import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAssetManifestSnapshot,
  normalizeAssetManifest,
  resetAssetManifestForTests,
  startAssetManifestLoad,
} from '../../../public/js/assets/asset-manifest.js';

describe('asset manifest client cache', () => {
  beforeEach(() => resetAssetManifestForTests());

  it('loads once and exposes the simplified manifest shape', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          version: 'test',
          creatures: {
            inu: { static: true },
            neko: {
              static: true,
              animated: {
                idle: '/assets/sprites/creatures-animated/neko/idle.webp?v=test',
                walk: '/assets/sprites/creatures-animated/neko/walk.webp?v=test',
              },
            },
          },
          backgrounds: { starter_meadow: ['sky'] },
          actions: ['punch'],
          items: ['rice-ball'],
          npcs: ['cid'],
          objects: ['campfire'],
        }),
      };
    };

    await startAssetManifestLoad(fetchImpl);
    await startAssetManifestLoad(fetchImpl);

    assert.equal(calls, 1);
    assert.deepEqual(getAssetManifestSnapshot(), {
      version: 'test',
      creatures: {
        inu: { static: true },
        neko: {
          static: true,
          animated: {
            idle: '/assets/sprites/creatures-animated/neko/idle.webp?v=test',
            walk: '/assets/sprites/creatures-animated/neko/walk.webp?v=test',
          },
        },
      },
      backgrounds: { starter_meadow: ['sky'] },
      actions: ['punch'],
      items: ['rice-ball'],
      npcs: ['cid'],
      objects: ['campfire'],
    });
  });

  it('normalizes missing sections to empty containers', () => {
    assert.deepEqual(normalizeAssetManifest(null), {
      version: '',
      creatures: {},
      backgrounds: {},
      actions: [],
      items: [],
      npcs: [],
      objects: [],
    });
  });

  it('returns null before manifest load', () => {
    assert.equal(getAssetManifestSnapshot(), null);
  });
});
