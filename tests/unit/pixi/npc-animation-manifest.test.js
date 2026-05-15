import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  getAnimatedNpcEntry,
  normalizeNpcAnimationManifest,
} from '../../../public/js/pixi/npc-animation-manifest.js';

describe('NPC animation manifest', () => {
  it('normalizes runtime animation settings', () => {
    const manifest = normalizeNpcAnimationManifest({
      version: 'test',
      frameWidth: 128,
      frameHeight: 128,
      columns: 4,
      frames: 16,
      fps: 8,
      renderScale: 1.25,
      animations: {
        cid: { idle: '/idle.webp', walk: '/walk.webp' },
      },
    });

    assert.equal(manifest.version, 'test');
    assert.equal(manifest.frameWidth, 128);
    assert.equal(manifest.frameHeight, 128);
    assert.equal(manifest.columns, 4);
    assert.equal(manifest.frames, 16);
    assert.equal(manifest.fps, 8);
    assert.equal(manifest.renderScale, 1.25);
  });

  it('returns null when NPC is absent', () => {
    const manifest = normalizeNpcAnimationManifest({
      version: 'test',
      animations: {},
    });

    assert.equal(getAnimatedNpcEntry(manifest, 'missing'), null);
  });

  it('hydrates NPC entries with global sheet metadata', () => {
    const manifest = normalizeNpcAnimationManifest({
      version: 'test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1,
      animations: {
        cid: { idle: '/idle.webp', walk: '/walk.webp' },
      },
    });

    assert.deepEqual(getAnimatedNpcEntry(manifest, 'cid'), {
      idle: '/idle.webp',
      walk: '/walk.webp',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1,
    });
  });

  it('allows an NPC entry to override the global render scale', () => {
    const manifest = normalizeNpcAnimationManifest({
      version: 'test',
      renderScale: 1.6,
      animations: {
        shrine_fox: { idle: '/idle.png', walk: '/walk.png', renderScale: 0.8 },
      },
    });

    assert.equal(getAnimatedNpcEntry(manifest, 'shrine_fox').renderScale, 0.8);
  });

  it('keeps the shrine fox smaller than normal NPCs without halving her size', () => {
    const rawManifest = JSON.parse(readFileSync(
      join(process.cwd(), 'public/assets/sprites/npcs-animated/manifest.json'),
      'utf8'
    ));
    const manifest = normalizeNpcAnimationManifest(rawManifest);

    assert.equal(getAnimatedNpcEntry(manifest, 'shrine_fox').renderScale, 1.2);
  });
});
