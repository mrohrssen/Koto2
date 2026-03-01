import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadWordTracker,
  saveWordTracker,
  TRACKER_DIR
} from '../../../src/game/word-tracker.js';

describe('Word Tracker - Persistence', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-word-tracker');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('saves tracker to JSON file', () => {
    const tracker = { userId: 'u1', words: { '水': { exposures: 3, stage: 1, firstSeen: '2026-03-01', lastSeen: '2026-03-01' } }, totalWordsIntroduced: 1, phase: 'bootstrap' };
    saveWordTracker(tracker, testDir);
    const filePath = join(testDir, 'word-tracker-u1.json');
    assert.ok(existsSync(filePath));
    const loaded = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.strictEqual(loaded.words['水'].exposures, 3);
  });

  it('loads existing tracker from file', () => {
    const data = { userId: 'u2', words: { '火': { exposures: 5, stage: 2, firstSeen: '2026-03-01', lastSeen: '2026-03-01' } }, totalWordsIntroduced: 1, phase: 'bootstrap' };
    writeFileSync(join(testDir, 'word-tracker-u2.json'), JSON.stringify(data));
    const tracker = loadWordTracker('u2', testDir);
    assert.strictEqual(tracker.words['火'].exposures, 5);
    assert.strictEqual(tracker.phase, 'bootstrap');
  });

  it('returns fresh tracker when file does not exist', () => {
    const tracker = loadWordTracker('nonexistent', testDir);
    assert.strictEqual(tracker.userId, 'nonexistent');
    assert.deepStrictEqual(tracker.words, {});
  });
});
