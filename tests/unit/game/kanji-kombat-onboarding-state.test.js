import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createKanjiKombatOnboardingState,
  createMetaProgression,
  ensureKanjiKombatOnboardingState,
} from '../../../src/game/state.js';
import { GameManager } from '../../../src/game/loop.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { resetDataDirForTest, setDataDirForTest } from '../../../src/data-dir.js';

describe('kanji kombat onboarding meta state', () => {
  let tempDir = null;

  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('createMetaProgression defaults kanji kombat onboarding as incomplete and unanswered', () => {
    const meta = createMetaProgression();

    assert.deepEqual(meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
  });

  it('ensureKanjiKombatOnboardingState adds an incomplete object to existing meta', () => {
    const meta = {};

    const onboarding = ensureKanjiKombatOnboardingState(meta);

    assert.deepEqual(onboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
    assert.equal(onboarding, meta.kanjiKombatOnboarding);
  });

  it('normalizes malformed values safely', () => {
    const meta = {
      kanjiKombatOnboarding: {
        completed: 'yes',
        knowsHiragana: 'true',
        knowsKatakana: false,
      },
    };

    assert.deepEqual(ensureKanjiKombatOnboardingState(meta), {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: false,
    });
  });

  it('createKanjiKombatOnboardingState preserves explicit booleans', () => {
    assert.deepEqual(createKanjiKombatOnboardingState({
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    }), {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: false,
    });
  });

  it('GameManager exposes normalized kanji kombat onboarding state', () => {
    const gm = new GameManager();
    const meta = createMetaProgression();
    meta.kanjiKombatOnboarding = {
      completed: 'yes',
      knowsHiragana: true,
      knowsKatakana: 'no',
    };

    gm.initMeta(meta);

    assert.deepEqual(gm.getState().meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: true,
      knowsKatakana: null,
    });
  });

  it('manager registry saves normalized onboarding state for existing saves', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kanji-kombat-onboarding-'));
    setDataDirForTest(tempDir);
    const meta = createMetaProgression();
    delete meta.kanjiKombatOnboarding;

    const savePath = join(tempDir, '.jrpg-save-user-1.json');
    writeFileSync(savePath, JSON.stringify({
      version: 2,
      player: null,
      meta,
      run: null,
      combat: null,
    }, null, 2));

    const originalLog = console.log;
    console.log = () => {};
    let gm;
    try {
      gm = getManager('user-1');
    } finally {
      console.log = originalLog;
    }
    const saved = JSON.parse(readFileSync(savePath, 'utf-8'));

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
    assert.deepEqual(saved.meta.kanjiKombatOnboarding, gm.meta.kanjiKombatOnboarding);
  });
});
