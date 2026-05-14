import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAssetManifestSnapshot,
  hasCreatureIdle,
  resetAssetManifestForTests,
  startAssetManifestLoad,
} from '../../../public/js/assets/asset-manifest.js';

describe('asset manifest client cache', () => {
  beforeEach(() => resetAssetManifestForTests());

  it('loads once and exposes creature idle availability', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          version: 'test',
          creatures: {
            inu: { static: true, idle: true },
            neko: { static: true, idle: false },
          },
        }),
      };
    };

    await startAssetManifestLoad(fetchImpl);
    await startAssetManifestLoad(fetchImpl);

    assert.equal(calls, 1);
    assert.equal(hasCreatureIdle('inu'), true);
    assert.equal(hasCreatureIdle('neko'), false);
    assert.equal(getAssetManifestSnapshot().version, 'test');
  });

  it('returns safe static-oriented answers before manifest load', () => {
    assert.equal(getAssetManifestSnapshot(), null);
    assert.equal(hasCreatureIdle('inu'), false);
  });
});
