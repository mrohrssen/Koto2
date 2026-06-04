import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureSrs, clearSrsCache } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded } from '../../../src/game/script-srs.js';
import { createNewRun } from '../../../src/game/state.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';

function withMathRandom(values, fn) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function makeRewardCreature(id, hp = 20, maxHp = 20) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp,
    maxHp,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
  };
}

function gmWithMode(userId = 'wave-user') {
  const gm = {
    userId,
    player: { name: 'Tester', hp: 100, maxHp: 100, credits: 0 },
    meta: { levels: { highestUnlocked: 1 }, creatureCollection: ['hi'], creatureCounts: { hi: 1 } },
    emitState() {},
  };
  gm.run = createNewRun(gm.player);
  gm.run.mode = 'kanjiKombat';
  gm.run.areaSelectionRequired = false;
  gm.run.currentAreaEncounters = 0;
  gm.run.rooms = [{ type: 'encounter', interacted: false }];
  gm.run.creatureParty.active = [{
    id: 'hi', uid: 'hi-1', element: 'fire', level: 1, hp: 20, maxHp: 20, mp: 10, maxMp: 10, attack: 5, defense: 5, dex: 5, moves: [],
  }];
  gm.run.kanjiKombat = {
    wave: 1,
    streak: 0,
    highestStreak: 0,
    currentWaveIsMiniboss: false,
    localDate: '2026-05-31',
    report: {
      wavesCleared: 0,
      minibossesDefeated: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      cardsReviewed: 0,
      newCardsIntroduced: 0,
      scriptDeck: 'hiragana',
      completedDaily: false,
    },
  };
  gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [{ hp: 0, id: 'enemy' }] };
  return gm;
}

function rewardGm({ collection = ['hi', 'mizu', 'ki'], active = [makeRewardCreature('hi')] } = {}) {
  const gm = gmWithMode();
  gm.meta.creatureCollection = collection;
  gm.run.creatureParty.active = active;
  gm.combat.allies = gm.run.creatureParty.active;
  gm.kanjiKombatService = new KanjiKombatService(gm);
  return gm;
}

describe('Kanji Kombat wave completion', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-wave-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('wave-user');
    ensureScriptDeckSeeded('wave-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('does not mark room interacted or increment area counters on wave clear', () => {
    const gm = gmWithMode();
    gm.kanjiKombatService = new KanjiKombatService(gm);
    const result = gm.kanjiKombatService.completeWaveAndMaybeStartNext({
      actionSegments: [],
      flatPlayerAttacks: [],
      flatEnemyAttacks: [],
      xpEvents: [],
    });
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.rooms[0].interacted, false);
    assert.equal(gm.run.kanjiKombat.report.wavesCleared, 1);
    assert.equal(result.actionType, 'kanjiKombat');
  });

  it('finalizes defeat as Kanji Kombat report without pending capture flush', () => {
    const gm = gmWithMode();
    gm.run.creatureParty.pendingCaptures = [{ id: 'neko' }];
    gm.kanjiKombatService = new KanjiKombatService(gm);
    const result = gm.kanjiKombatService.finalizeDefeat({
      actionSegments: [],
      flatPlayerAttacks: [],
      flatEnemyAttacks: [],
      xpEvents: [],
    });
    assert.equal(gm.run.active, false);
    assert.equal(gm.run.creatureParty.pendingCaptures.length, 1);
    assert.equal(result.kanjiKombatReport.wavesCleared, 0);
  });

  it('reports the last spawned wave instead of the next queued wave', () => {
    const gm = gmWithMode();
    gm.run.kanjiKombat.wave = 6;
    gm.run.kanjiKombat.waveReached = 5;
    gm.kanjiKombatService = new KanjiKombatService(gm);

    const report = gm.kanjiKombatService.buildReport();

    assert.equal(report.wave, 5);
  });

  it('heals all living allies at 3 and 9 correct answer streaks', () => {
    const gm = rewardGm({
      active: [
        makeRewardCreature('hi', 10, 20),
        makeRewardCreature('mizu', 5, 40),
      ],
    });

    gm.run.kanjiKombat.streak = 2;
    gm.kanjiKombatService.recordCorrectAnswer();

    assert.equal(gm.run.creatureParty.active[0].hp, 12);
    assert.equal(gm.run.creatureParty.active[1].hp, 9);

    gm.run.kanjiKombat.streak = 8;
    gm.kanjiKombatService.recordCorrectAnswer();

    assert.equal(gm.run.creatureParty.active[0].hp, 19);
    assert.equal(gm.run.creatureParty.active[1].hp, 23);
  });

  it('applies a random stat-stage buff at a 6 correct answer streak and keeps it across waves', () => {
    const gm = rewardGm({
      active: [
        makeRewardCreature('hi', 20, 20),
        makeRewardCreature('mizu', 40, 40),
      ],
    });

    withMathRandom([0.1, 0.4], () => {
      gm.run.kanjiKombat.streak = 5;
      gm.kanjiKombatService.recordCorrectAnswer();
    });

    const buffed = gm.run.creatureParty.active.flatMap(ally =>
      Object.entries(ally.statStages || {})
        .filter(([, value]) => value > 0)
        .map(([stat, value]) => ({ id: ally.id, stat, value }))
    );
    assert.deepEqual(buffed, [{ id: 'hi', stat: 'def', value: 1 }]);

    gm.kanjiKombatService.spawnNextWave();

    assert.equal(gm.run.creatureParty.active[0].statStages.def, 1);
    assert.strictEqual(gm.combat.allies, gm.run.creatureParty.active);
  });

  it('adds a random unlocked ally at a 12 streak and keeps the reward cycle active', () => {
    const gm = rewardGm({
      collection: ['hi', 'mizu', 'ki'],
      active: [makeRewardCreature('hi', 20, 20)],
    });

    withMathRandom([0], () => {
      gm.run.kanjiKombat.streak = 11;
      gm.kanjiKombatService.recordCorrectAnswer();
    });

    assert.equal(gm.run.creatureParty.active.length, 2);
    assert.equal(gm.run.creatureParty.active[1].id, 'mizu');
    assert.equal(gm.combat.allies.length, 2);
    assert.equal(gm.run.kanjiKombat.streak, 12);
  });

  it('full-heals all allies at a 12 streak when the party is already full', () => {
    const gm = rewardGm({
      collection: ['hi', 'mizu', 'ki'],
      active: [
        makeRewardCreature('hi', 1, 20),
        makeRewardCreature('mizu', 2, 30),
        makeRewardCreature('ki', 3, 40),
      ],
    });

    gm.run.kanjiKombat.streak = 11;
    gm.kanjiKombatService.recordCorrectAnswer();

    assert.deepEqual(gm.run.creatureParty.active.map(ally => ally.hp), [20, 30, 40]);
    assert.equal(gm.run.creatureParty.active.length, 3);
    assert.equal(gm.run.kanjiKombat.streak, 12);
  });
});
