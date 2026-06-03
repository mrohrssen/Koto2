import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State } from 'ts-fsrs';
import { clearSrsCache, configureSrs, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded,
  getScriptDailyState,
  SCRIPT_DECK,
} from '../../../src/game/script-srs.js';
import { getLocalDateKey, KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
import { createNewRun } from '../../../src/game/state.js';

function fakeCreature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 20,
    maxHp: 20,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

function buildGm() {
  const player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
  const gm = {
    userId: 'kk-run-user',
    player,
    run: null,
    combat: null,
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'neko', 'inu'],
      creatureCounts: { hi: 1, neko: 1, inu: 1 },
      kanjiKombatOnboarding: { completed: false, knowsHiragana: null, knowsKatakana: null },
    },
    emitState() {},
  };
  gm.run = createNewRun(player);
  gm.run.creatureParty.active = [fakeCreature('hi')];
  return gm;
}

describe('KanjiKombatService run lifecycle helpers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-run-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('kk-run-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('starts an onboarding-pending run without queueing a prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    service.startRunWithCreature(fakeCreature('hi'));

    assert.equal(gm.run.kanjiKombat.onboardingPending, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.combat.mode, 'kanjiKombat');
  });

  it('submits onboarding, saves reversible preferences, and queues first prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    const result = service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: true,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.ok(gm.run.kanjiKombat.currentQuiz || gm.run.kanjiKombat.pendingIntro);
    assert.equal(gm.run.kanjiKombat.report.scriptDeck, 'kanji');
    assert.equal(result.onboarding.completed, true);
    assert.equal(result.kanjiKombat, gm.run.kanjiKombat);
  });

  it('rejects onboarding submit outside a pending Kanji Kombat run', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    assert.throws(
      () => service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true }),
      /No pending Kanji Kombat onboarding/
    );
  });

  it('keeps onboarding pending when submit finds the daily deck already complete', () => {
    const gm = buildGm();
    saveSrsData(gm.userId, {
      kana: { cards: [] },
      kanjiKombatDaily: { date: getLocalDateKey(), introducedCount: 0, completed: true },
    });
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    assert.throws(
      () => service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true }),
      /Kanji Kombat is complete for the day/
    );

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
  });

  it('does not complete onboarding or daily progress when the submit probe finds no work', () => {
    const gm = buildGm();
    ensureScriptDeckSeeded(gm.userId);
    const data = loadSrsData(gm.userId);
    for (const card of data[SCRIPT_DECK].cards.filter(candidate => candidate.type === 'kanji')) {
      card.reps = 1;
      card.state = State.Learning;
      card.due = new Date('2100-01-01T00:00:00Z');
    }
    saveSrsData(gm.userId, data);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    let error = null;
    try {
      service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });
    } catch (caught) {
      error = caught;
    }

    assert.equal(
      getScriptDailyState(gm.userId, getLocalDateKey()).completed,
      false,
      'pre-commit probe must not persist daily completion'
    );
    assert.match(error?.message || '', /Kanji Kombat is complete for the day/);
    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: false,
      knowsHiragana: null,
      knowsKatakana: null,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
  });

  it('marks a run as Kanji Kombat and starts with one selected creature', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('neko'));
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.active[0].id, 'neko');
    assert.equal(gm.run.initialSkillPick.chosenId, 'kanjiKombat');
    assert.equal(gm.combat.mode, 'kanjiKombat');
  });

  it('applies streak thresholds and resets after 20', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi', { hp: 10, maxHp: 20 }));
    for (let i = 0; i < 20; i++) service.recordCorrectAnswer();
    assert.equal(gm.run.kanjiKombat.streak, 0);
    assert.equal(gm.run.creatureParty.active.length > 1 || gm.run.creatureParty.active[0].hp === 20, true);
  });

  it('records wave completion without room fields', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.currentAreaEncounters = 0;
    gm.run.rooms = [{ type: 'encounter', interacted: false }];
    service.recordWaveClear({ miniboss: true });
    assert.equal(gm.run.kanjiKombat.wave, 2);
    assert.equal(gm.run.kanjiKombat.report.wavesCleared, 1);
    assert.equal(gm.run.kanjiKombat.report.minibossesDefeated, 1);
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.rooms[0].interacted, false);
  });

  it('starts with a run-scoped creature that has normal combat fields', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    gm.meta.crests = [];
    gm.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
    const service = new KanjiKombatService(gm);

    service.startRunWithCreatureId('hi');

    const ally = gm.run.creatureParty.active[0];
    assert.equal(ally.id, 'hi');
    assert.equal(ally.level, 5);
    assert.equal(typeof ally.uid, 'string');
    assert.equal(Array.isArray(ally.moves), true);
    assert.equal(ally.hp, ally.maxHp);
    assert.equal(ally.mp, ally.maxMp);
  });
});
