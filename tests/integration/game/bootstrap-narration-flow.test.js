import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadWordTracker, saveWordTracker, recordExposure } from '../../../src/game/word-tracker.js';
import { getBootstrapPhaseForNarration } from '../../../src/game/bootstrap-api.js';

describe('Bootstrap Narration Flow Integration', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-flow');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('bootstrap phase user gets bootstrap narration flag', () => {
    const tracker = loadWordTracker('flow-test', testDir);
    recordExposure(tracker, '水');
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test', testDir);
    assert.strictEqual(phase, 'bootstrap');
  });

  it('transition phase user gets transition flag', () => {
    const tracker = loadWordTracker('flow-test-2', testDir);
    for (let i = 0; i < 100; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test-2', testDir);
    assert.strictEqual(phase, 'transition');
  });

  it('full-japanese phase user gets full-japanese flag', () => {
    const tracker = loadWordTracker('flow-test-3', testDir);
    for (let i = 0; i < 250; i++) {
      const word = `word${i}`;
      for (let j = 0; j < 4; j++) recordExposure(tracker, word);
    }
    saveWordTracker(tracker, testDir);

    const phase = getBootstrapPhaseForNarration('flow-test-3', testDir);
    assert.strictEqual(phase, 'full-japanese');
  });
});
