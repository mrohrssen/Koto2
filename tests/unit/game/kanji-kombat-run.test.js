import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearSrsCache, configureSrs } from '../../../src/game/internal-srs.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
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

  it('marks a run as Kanji Kombat and starts with one selected creature', () => {
    const gm = buildGm();
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
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi', { hp: 10, maxHp: 20 }));
    for (let i = 0; i < 20; i++) service.recordCorrectAnswer();
    assert.equal(gm.run.kanjiKombat.streak, 0);
    assert.equal(gm.run.creatureParty.active.length > 1 || gm.run.creatureParty.active[0].hp === 20, true);
  });

  it('records wave completion without room fields', () => {
    const gm = buildGm();
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
    gm.meta.crests = [];
    gm.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
    const service = new KanjiKombatService(gm);

    service.startRunWithCreatureId('hi');

    const ally = gm.run.creatureParty.active[0];
    assert.equal(ally.id, 'hi');
    assert.equal(typeof ally.uid, 'string');
    assert.equal(Array.isArray(ally.moves), true);
    assert.equal(ally.hp, ally.maxHp);
    assert.equal(ally.mp, ally.maxMp);
  });
});
