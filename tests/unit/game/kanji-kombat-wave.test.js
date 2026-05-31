import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureSrs, clearSrsCache } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded } from '../../../src/game/script-srs.js';
import { createNewRun } from '../../../src/game/state.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';

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
});
