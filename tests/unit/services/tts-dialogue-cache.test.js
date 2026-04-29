import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { TtsDialogueCache } from '../../../src/services/tts-dialogue-cache.js';

const TEST_DIR = join(import.meta.dirname, '../../../tmp/test-tts-dialogue');

/** Deterministic fake synthesizer that returns a buffer tagged with the input. */
async function fakeSynth(text, speakerId) {
  return Buffer.from(`WAV:${speakerId}:${text}`);
}

function expectedFilename(speakerId, text) {
  return createHash('md5').update(`${speakerId}:${text}`).digest('hex').slice(0, 12) + '.wav';
}

describe('TtsDialogueCache', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates user directory on synthesize', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    await cache.synthesizeLine('user1', 'こんにちは', 11, fakeSynth);
    assert.ok(existsSync(join(TEST_DIR, 'user1')));
  });

  it('returns consistent filename for same text+speaker', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    const f1 = await cache.synthesizeLine('user1', 'テスト', 11, fakeSynth);
    const f2 = await cache.synthesizeLine('user1', 'テスト', 11, fakeSynth);
    assert.equal(f1, f2);
    assert.equal(f1, expectedFilename(11, 'テスト'));
  });

  it('returns different filenames for different speakers', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    const f1 = await cache.synthesizeLine('user1', 'テスト', 11, fakeSynth);
    const f2 = await cache.synthesizeLine('user1', 'テスト', 39, fakeSynth);
    assert.notEqual(f1, f2);
  });

  it('serves cached WAV buffer via lookup', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    const filename = await cache.synthesizeLine('user1', 'hello', 11, fakeSynth);
    const buf = cache.lookup('user1', filename);
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.toString(), 'WAV:11:hello');
  });

  it('returns null for missing file', () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    const result = cache.lookup('user1', 'nonexistent.wav');
    assert.equal(result, null);
  });

  it('deletes files for an entity', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    const f1 = await cache.synthesizeLine('user1', 'a', 11, fakeSynth);
    const f2 = await cache.synthesizeLine('user1', 'b', 11, fakeSynth);

    // Files exist before delete
    assert.ok(cache.lookup('user1', f1) !== null);
    assert.ok(cache.lookup('user1', f2) !== null);

    cache.deleteFiles('user1', [f1, f2]);

    assert.equal(cache.lookup('user1', f1), null);
    assert.equal(cache.lookup('user1', f2), null);
  });

  it('deleteFiles ignores missing files without throwing', () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    // Should not throw
    cache.deleteFiles('user1', ['nonexistent.wav', 'also-missing.wav']);
  });

  it('clears all cached dialogue audio for one user only', async () => {
    const cache = new TtsDialogueCache(TEST_DIR);
    await cache.synthesizeLine('user1', 'hello', 11, fakeSynth);
    await cache.synthesizeLine('user2', 'hello', 11, fakeSynth);

    cache.clearUser('user1');

    assert.equal(existsSync(join(TEST_DIR, 'user1')), false);
    assert.equal(existsSync(join(TEST_DIR, 'user2')), true);
  });

  describe('synthesizeDialogue (NPC)', () => {
    it('generates TTS for all NPC lines', async () => {
      const cache = new TtsDialogueCache(TEST_DIR);
      const dialogue = {
        greeting: 'やあ',
        defeatLine: '負けた',
        freedLine: '自由だ',
        rounds: [{
          npcLine: '元気？',
          options: [
            { text: 'はい', tone: 'positive' },
            { text: 'いいえ', tone: 'negative' },
            { text: 'わからない', tone: 'neutral' }
          ]
        }]
      };

      const result = await cache.synthesizeDialogue('user1', dialogue, 'npc', {
        entitySpeakerId: 11,
        playerSpeakerId: 39,
        synthesizeFn: fakeSynth
      });

      // Top-level NPC lines use entitySpeakerId (11)
      assert.equal(result.greetingTts, expectedFilename(11, 'やあ'));
      assert.equal(result.defeatLineTts, expectedFilename(11, '負けた'));
      assert.equal(result.freedLineTts, expectedFilename(11, '自由だ'));

      // Round npcLine uses entitySpeakerId (11)
      assert.equal(result.rounds[0].npcLineTts, expectedFilename(11, '元気？'));

      // Options use playerSpeakerId (39)
      assert.equal(result.rounds[0].options[0].tts, expectedFilename(39, 'はい'));
      assert.equal(result.rounds[0].options[1].tts, expectedFilename(39, 'いいえ'));
      assert.equal(result.rounds[0].options[2].tts, expectedFilename(39, 'わからない'));

      // Original dialogue is not mutated
      assert.equal(dialogue.greetingTts, undefined);
    });
  });

  describe('synthesizeDialogue (creature)', () => {
    it('generates TTS for all creature lines', async () => {
      const cache = new TtsDialogueCache(TEST_DIR);
      const dialogue = {
        rounds: [{
          speaker: 'ニャー',
          options: ['走る', '歩く', '飛ぶ'],
          correctIndex: 0
        }]
      };

      const result = await cache.synthesizeDialogue('user1', dialogue, 'creature', {
        entitySpeakerId: 11,
        playerSpeakerId: 39,
        synthesizeFn: fakeSynth
      });

      // Speaker uses entitySpeakerId (11)
      assert.equal(result.rounds[0].speakerTts, expectedFilename(11, 'ニャー'));

      // Options use playerSpeakerId (39)
      assert.deepEqual(result.rounds[0].optionsTts, [
        expectedFilename(39, '走る'),
        expectedFilename(39, '歩く'),
        expectedFilename(39, '飛ぶ')
      ]);

      // Original dialogue is not mutated
      assert.equal(dialogue.rounds[0].speakerTts, undefined);
    });
  });

  describe('collectTtsFiles (NPC)', () => {
    it('extracts all filenames from NPC dialogue', () => {
      const cache = new TtsDialogueCache(TEST_DIR);
      const enriched = {
        greeting: 'やあ',
        greetingTts: 'aaa.wav',
        defeatLine: '負けた',
        defeatLineTts: 'bbb.wav',
        freedLine: '自由だ',
        freedLineTts: 'ccc.wav',
        rounds: [{
          npcLine: '元気？',
          npcLineTts: 'ddd.wav',
          options: [
            { text: 'はい', tts: 'eee.wav', tone: 'positive' },
            { text: 'いいえ', tts: 'fff.wav', tone: 'negative' },
            { text: 'わからない', tts: 'ggg.wav', tone: 'neutral' }
          ]
        }]
      };

      const files = cache.collectTtsFiles(enriched, 'npc');
      assert.deepEqual(files, [
        'aaa.wav', 'bbb.wav', 'ccc.wav',
        'ddd.wav', 'eee.wav', 'fff.wav', 'ggg.wav'
      ]);
    });
  });

  describe('collectTtsFiles (creature)', () => {
    it('extracts all filenames from creature dialogue', () => {
      const cache = new TtsDialogueCache(TEST_DIR);
      const enriched = {
        rounds: [{
          speaker: 'ニャー',
          speakerTts: 'aaa.wav',
          options: ['走る', '歩く', '飛ぶ'],
          optionsTts: ['bbb.wav', 'ccc.wav', 'ddd.wav'],
          correctIndex: 0
        }]
      };

      const files = cache.collectTtsFiles(enriched, 'creature');
      assert.deepEqual(files, ['aaa.wav', 'bbb.wav', 'ccc.wav', 'ddd.wav']);
    });
  });
});
