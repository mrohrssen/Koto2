import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAnimatedCreatureEntry,
  normalizeAnimationManifest,
} from '../../../public/js/pixi/creature-animation-manifest.js';

describe('creature animation manifest', () => {
  it('normalizes runtime animation settings', () => {
    const manifest = normalizeAnimationManifest({
      version: 'test',
      frameWidth: 128,
      frameHeight: 128,
      columns: 4,
      frames: 16,
      fps: 8,
      renderScale: 1.5,
      animations: {
        neko: { idle: '/idle.webp', walk: '/walk.webp' },
      },
    });

    assert.equal(manifest.version, 'test');
    assert.equal(manifest.frameWidth, 128);
    assert.equal(manifest.frameHeight, 128);
    assert.equal(manifest.columns, 4);
    assert.equal(manifest.frames, 16);
    assert.equal(manifest.fps, 8);
    assert.equal(manifest.renderScale, 1.5);
  });

  it('returns null when creature is absent', () => {
    const manifest = normalizeAnimationManifest({
      version: 'test',
      animations: {},
    });

    assert.equal(getAnimatedCreatureEntry(manifest, 'missing'), null);
  });

  it('hydrates creature entries with global sheet metadata', () => {
    const manifest = normalizeAnimationManifest({
      version: 'test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1.85,
      animations: {
        neko: { idle: '/idle.webp', walk: '/walk.webp' },
      },
    });

    assert.deepEqual(getAnimatedCreatureEntry(manifest, 'neko'), {
      idle: '/idle.webp',
      walk: '/walk.webp',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1.85,
    });
  });
});
