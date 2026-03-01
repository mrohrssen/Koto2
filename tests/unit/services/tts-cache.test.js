import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TtsCache } from '../../../src/services/tts-cache.js';

const TEST_DIR = join(import.meta.dirname, '../../../tmp/test-tts-cache');

describe('TtsCache', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns null when manifest does not exist', () => {
    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 11, 0.9), null);
  });

  it('returns cached WAV buffer on exact match', () => {
    const fakeWav = Buffer.from('RIFF fake wav data');
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), fakeWav);

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    const result = cache.lookup('走る', 11, 0.9);
    assert.deepEqual(result, fakeWav);
  });

  it('returns null for wrong speakerId', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 39, 0.9), null);
  });

  it('returns null for wrong speedScale', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 11, 1.0), null);
  });

  it('reports stats', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    const stats = cache.getStats();
    assert.equal(stats.loaded, true);
    assert.equal(stats.generating, false);
    assert.equal(stats.wordCount, 1);
  });
});
