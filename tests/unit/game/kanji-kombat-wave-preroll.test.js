import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewRun } from '../../../src/game/state.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';

/**
 * Builds a minimal gm object with a kanjiKombat run already initialised to wave 1.
 * Mirrors the gmWithMode helper in kanji-kombat-wave.test.js.
 */
function buildGm(userId = 'preroll-user') {
  const gm = {
    userId,
    player: { name: 'Tester', hp: 100, maxHp: 100, credits: 0 },
    meta: { levels: { highestUnlocked: 1 }, creatureCollection: ['hi'], creatureCounts: { hi: 1 } },
    emitState() {},
  };
  gm.run = createNewRun(gm.player);
  gm.run.mode = 'kanjiKombat';
  gm.run.areaSelectionRequired = false;
  gm.run.creatureParty.active = [{
    id: 'hi', uid: 'hi-1', element: 'fire', level: 1,
    hp: 20, maxHp: 20, mp: 10, maxMp: 10,
    attack: 5, defense: 5, dex: 5, moves: [],
  }];
  gm.run.kanjiKombat = {
    wave: 1,
    waveReached: 1,
    streak: 0,
    highestStreak: 0,
    currentWaveIsMiniboss: false,
    localDate: '2026-06-11',
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
  gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [] };
  return gm;
}

/**
 * Creates a KanjiKombatService on a fresh gm that already has a wave 1 spawned
 * (i.e. spawnNextWave() is callable and ready for pre-roll tests).
 */
function createKanjiKombatTestService() {
  const gm = buildGm();
  const service = new KanjiKombatService(gm);
  // Expose gm so tests can inspect/mutate state directly.
  service.gm = gm;
  return service;
}

// ---------------------------------------------------------------------------

test('prerollNextWave stores a complete pending wave', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  assert.ok(Array.isArray(pending.enemies) && pending.enemies.length > 0,
    'pending.enemies should be a non-empty array');
  assert.equal(pending.wave, service.gm.run.kanjiKombat.wave + 1,
    'pending.wave should be current wave + 1');
  assert.ok(pending.combat.combatId.startsWith('cmb_'),
    'pending.combat.combatId should start with cmb_');
  assert.equal(pending.combat.stateVersion, 0,
    'pending.combat.stateVersion should be 0');
  assert.ok(pending.combat.turnSeeds.length > 0,
    'pending.combat.turnSeeds should be non-empty');
  assert.equal(service.gm.run.kanjiKombat.pendingNextWave, pending,
    'pendingNextWave on kk state should reference returned object');
});

test('prerollNextWave is idempotent for the same upcoming wave', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const first = service.prerollNextWave();
  const second = service.prerollNextWave();
  assert.equal(second, first,
    'second prerollNextWave call should return the same object reference');
});

test('spawnNextWave consumes a matching pre-rolled wave verbatim', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  service.gm.run.kanjiKombat.wave += 1; // simulate wave-clear increment
  service.spawnNextWave();
  assert.equal(service.gm.combat.optimistic.combatId, pending.combat.combatId,
    'combatId should match the pre-rolled value');
  assert.deepEqual(
    service.gm.combat.enemies.map(e => e.id),
    pending.enemies.map(e => e.id),
    'enemy ids should match the pre-rolled enemies',
  );
  assert.equal(service.gm.run.kanjiKombat.pendingNextWave, null,
    'pendingNextWave should be cleared after consumption');
});

test('spawnNextWave discards a stale pre-roll for a different wave number', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  const pending = service.prerollNextWave();
  pending.wave = 999; // corrupt the pre-roll so wave number no longer matches
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.notEqual(service.gm.combat.optimistic.combatId, pending.combat.combatId,
    'should have generated a fresh combatId, not used the stale pre-roll');
});
