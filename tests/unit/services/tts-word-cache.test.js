import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TtsWordCache } from '../../../src/services/tts-word-cache.js';

const TEST_DIR = join(import.meta.dirname, '../../../tmp/test-tts-word-cache');

describe('TtsWordCache', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('reuses clicked word audio globally for the same text speaker and speed', async () => {
    const synthCalls = [];
    const cache = new TtsWordCache(TEST_DIR);
    const synthesizeFn = async (text, speakerId, speedScale) => {
      synthCalls.push({ text, speakerId, speedScale });
      return Buffer.from(`WAV:${speakerId}:${speedScale}:${text}`);
    };

    const first = await cache.synthesizeWord('ください', 11, 0.9, synthesizeFn);
    const second = await cache.synthesizeWord('ください', 11, 0.9, synthesizeFn);

    assert.match(first.filename, /^[a-f0-9]{12}\.wav$/);
    assert.equal(second.filename, first.filename);
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(synthCalls, [{ text: 'ください', speakerId: 11, speedScale: 0.9 }]);
    assert.equal(cache.lookup(first.filename).toString(), 'WAV:11:0.9:ください');
  });

  it('separates clicked word audio by speaker and speed', async () => {
    const cache = new TtsWordCache(TEST_DIR);
    const synthesizeFn = async (text, speakerId, speedScale) => (
      Buffer.from(`WAV:${speakerId}:${speedScale}:${text}`)
    );

    const base = await cache.synthesizeWord('ください', 11, 0.9, synthesizeFn);
    const differentSpeaker = await cache.synthesizeWord('ください', 13, 0.9, synthesizeFn);
    const differentSpeed = await cache.synthesizeWord('ください', 11, 0.8, synthesizeFn);

    assert.notEqual(differentSpeaker.filename, base.filename);
    assert.notEqual(differentSpeed.filename, base.filename);
  });

  it('evicts oldest generated word audio when the cache exceeds its entry limit', async () => {
    const cache = new TtsWordCache(TEST_DIR, { maxEntries: 2 });
    const synthesizeFn = async (text, speakerId, speedScale) => (
      Buffer.from(`WAV:${speakerId}:${speedScale}:${text}`)
    );

    const first = await cache.synthesizeWord('一', 11, 0.9, synthesizeFn);
    const second = await cache.synthesizeWord('二', 11, 0.9, synthesizeFn);
    const third = await cache.synthesizeWord('三', 11, 0.9, synthesizeFn);

    assert.equal(cache.lookup(first.filename), null);
    assert.equal(cache.lookup(second.filename).toString(), 'WAV:11:0.9:二');
    assert.equal(cache.lookup(third.filename).toString(), 'WAV:11:0.9:三');
  });
});
