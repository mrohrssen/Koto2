import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewRun } from '../../../src/game/state.js';
import {
  KanjiKombatService,
  PREROLL_TURN_SEED_COUNT,
  PENDING_WAVE_QUEUE_MAX,
  TURN_SEED_CHAIN_TARGET,
} from '../../../src/game/services/kanji-kombat-service.js';

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
    promptBuffer: [],
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

/** Fills kk.promptBuffer with `quiz` quiz prompts plus optional non-quiz entries. */
function setPromptBuffer(service, { quiz = 0, intro = 0, dailyCompletePrompt = 0 } = {}) {
  const buffer = [];
  let seq = 1;
  for (let i = 0; i < quiz; i++) {
    buffer.push({ kind: 'quiz', promptId: `kkp_q${i}`, sequence: seq++, cardId: `card-${i}`, quiz: {} });
  }
  for (let i = 0; i < intro; i++) {
    buffer.push({ kind: 'intro', promptId: `kkp_i${i}`, sequence: seq++, cardId: `icard-${i}`, intro: { card: {} } });
  }
  for (let i = 0; i < dailyCompletePrompt; i++) {
    buffer.push({ kind: 'dailyCompletePrompt', promptId: `kkp_c${i}`, sequence: seq++, cardId: null });
  }
  service.gm.run.kanjiKombat.promptBuffer = buffer;
}

// ---------------------------------------------------------------------------

test('ensurePendingNextWaves tops the queue up to the quiz prompt count', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 5, intro: 2, dailyCompletePrompt: 1 });
  const queue = service.ensurePendingNextWaves();
  assert.equal(queue, service.gm.run.kanjiKombat.pendingNextWaves,
    'returned queue should be the kk.pendingNextWaves array');
  assert.equal(queue.length, 5,
    'queue depth should match the number of quiz prompts (non-quiz prompts excluded)');
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    assert.equal(entry.wave, 2 + i, 'queued waves must be consecutive starting at wave + 1');
    assert.ok(Array.isArray(entry.enemies) && entry.enemies.length > 0,
      'each queued wave should have enemies');
    assert.ok(entry.combat.combatId.startsWith('cmb_'),
      'each queued wave should carry a fresh combat envelope');
    assert.equal(entry.combat.stateVersion, 0);
    assert.equal(entry.combat.turnSeeds.length, PREROLL_TURN_SEED_COUNT,
      'queued waves use the short per-wave seed chain');
    assert.equal(entry.combat.turnSeeds[0], entry.combat.nextTurnSeed,
      'seed chain invariant: turnSeeds[0] === nextTurnSeed');
  }
});

test('ensurePendingNextWaves caps the queue depth', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: PENDING_WAVE_QUEUE_MAX + 10 });
  const queue = service.ensurePendingNextWaves();
  assert.equal(queue.length, PENDING_WAVE_QUEUE_MAX,
    `queue depth should be capped at ${PENDING_WAVE_QUEUE_MAX}`);
});

test('ensurePendingNextWaves is append-only and never re-rolls held entries', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 3 });
  const first = service.ensurePendingNextWaves().slice();
  assert.equal(first.length, 3);

  // Re-running with the same buffer is a no-op.
  const second = service.ensurePendingNextWaves();
  assert.deepEqual(second.map(w => w.combat.combatId), first.map(w => w.combat.combatId),
    'repeated calls must not re-roll queued waves');
  for (let i = 0; i < first.length; i++) {
    assert.equal(second[i], first[i], 'queued wave objects must be preserved by reference');
  }

  // Growing the buffer appends new consecutive waves after the existing tail.
  setPromptBuffer(service, { quiz: 5 });
  const grown = service.ensurePendingNextWaves();
  assert.equal(grown.length, 5);
  for (let i = 0; i < first.length; i++) {
    assert.equal(grown[i], first[i], 'existing entries must survive a top-up untouched');
  }
  assert.equal(grown[3].wave, first[2].wave + 1, 'new entries continue from the tail');
  assert.equal(grown[4].wave, first[2].wave + 2);
});

test('ensurePendingNextWaves with no quiz prompts leaves the queue unchanged', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 2 });
  const before = service.ensurePendingNextWaves().slice();
  setPromptBuffer(service, { intro: 3 });
  const after = service.ensurePendingNextWaves();
  assert.deepEqual(after, before, 'existing queue entries are never discarded by ensure');
});

test('spawnNextWave consumes queue entries in order across multiple boundaries', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 3 });
  const queued = service.ensurePendingNextWaves().slice();
  assert.equal(queued.length, 3);

  // First boundary: wave 1 -> 2 consumes the head.
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.equal(service.gm.combat.optimistic.combatId, queued[0].combat.combatId,
    'first boundary should consume the queue head verbatim');
  assert.deepEqual(
    service.gm.combat.enemies.map(e => e.id),
    queued[0].enemies.map(e => e.id),
  );
  assert.equal(service.gm.run.kanjiKombat.pendingNextWaves.length, 2,
    'remaining queue entries must survive the consumption');
  assert.equal(service.gm.run.kanjiKombat.pendingNextWaves[0], queued[1]);

  // Second boundary: wave 2 -> 3 consumes the next entry.
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.equal(service.gm.combat.optimistic.combatId, queued[1].combat.combatId,
    'second boundary should consume the next queue entry');
  assert.equal(service.gm.run.kanjiKombat.pendingNextWaves.length, 1);
  assert.equal(service.gm.run.kanjiKombat.pendingNextWaves[0], queued[2]);
});

test('spawnNextWave extends an adopted 12-seed chain to the full server target', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 1 });
  const [pending] = service.ensurePendingNextWaves();
  const headSeed = pending.combat.nextTurnSeed;
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.equal(service.gm.combat.optimistic.nextTurnSeed, headSeed,
    'adopting the pre-roll must preserve the chain head seed');
  assert.equal(service.gm.combat.optimistic.turnSeeds.length, TURN_SEED_CHAIN_TARGET,
    'the adopted chain is extended to the full active-combat target');
  assert.equal(service.gm.combat.optimistic.turnSeeds[0], headSeed);
});

test('ensurePendingNextWaves shields a queue head for the current wave', () => {
  // Between recordWaveClear's increment and spawnNextWave's consumption, the queue
  // head is for the CURRENT wave.  ensure must not drop or replace it — the client
  // already received it and will simulate against it verbatim.
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 2 });
  const queued = service.ensurePendingNextWaves().slice();
  service.gm.run.kanjiKombat.wave += 1; // recordWaveClear ran; spawnNextWave has not
  setPromptBuffer(service, { quiz: 3 });
  const after = service.ensurePendingNextWaves();
  assert.equal(after[0], queued[0], 'head for the current wave must be preserved');
  assert.equal(after[1], queued[1]);
  assert.equal(after.length, 3, 'top-up still appends from the tail');
  assert.equal(after[2].wave, queued[1].wave + 1);
});

test('spawnNextWave clears a divergent queue and falls back to a fresh roll', () => {
  const service = createKanjiKombatTestService();
  service.spawnNextWave();
  setPromptBuffer(service, { quiz: 2 });
  const queued = service.ensurePendingNextWaves().slice();
  queued[0].wave = 999; // corrupt the head so the wave number no longer matches
  service.gm.run.kanjiKombat.wave += 1;
  service.spawnNextWave();
  assert.notEqual(service.gm.combat.optimistic.combatId, queued[0].combat.combatId,
    'should have generated a fresh combatId, not used the stale head');
  assert.equal(service.gm.run.kanjiKombat.pendingNextWaves.length, 0,
    'a divergent queue must be cleared entirely');
});
