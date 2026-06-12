import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearSrsCache, configureSrs } from '../../../src/game/internal-srs.js';
import { createNewRun, createCombatState } from '../../../src/game/state.js';
import { createPveOpeningCursor } from '../../../src/game/combat/action-cursor.js';
import {
  KanjiKombatService,
  getKanjiKombatActivePrompt,
  getLocalDateKey,
  rotateKanjiKombatSessionEpoch,
  createInitialKanjiKombatState,
  ensureKanjiKombatTurnSeeds,
  advanceKanjiKombatTurnSeeds,
  PENDING_STREAK_REWARD_QUEUE_MAX,
} from '../../../src/game/services/kanji-kombat-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';
import { hashTranscript } from '../../../src/shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../../src/shared/combat/pve-turn-resolver.js';
import {
  applyKanjiKombatAnswerStreakProgress,
  applyKanjiKombatStreakReward,
  ensurePendingStreakRewardQueues,
  STREAK_HEAL_REWARDS,
} from '../../../src/shared/combat/kanji-kombat-streak.js';
import {
  snapshotGameManager,
  restoreGameManager,
} from '../../../src/routes/game/optimistic-action-response.js';

const TEST_USER = 'kk-streak-preroll-user';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-streak-'));
  configureSrs({ dataDir: tempDir });
  clearSrsCache(TEST_USER);
});

afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

function fakeCreature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

/**
 * Fully wired gm with an active Kanji Kombat run, filled prompt buffer, and
 * session epoch — same shape as kanji-kombat-session-sync.test.js.
 */
function buildGm() {
  const ally = fakeCreature('hi');
  const enemy = fakeCreature('mizu', { hp: 500, maxHp: 500 });
  const combat = createCombatState(enemy);
  combat.mode = 'kanjiKombat';
  combat.isCreatureCombat = true;
  combat.allies = [ally];
  combat.enemies = [enemy];
  combat.actionCursor = createPveOpeningCursor({ allies: [ally], enemies: [enemy] });
  combat.actionCount = 0;
  combat.cycleCount = 0;
  combat.optimistic = {
    combatId: 'cmb_streak_test',
    stateVersion: 0,
    nextTurnSeed: 'streak_seed_1',
    acceptedActionIds: {},
  };

  const kk = createInitialKanjiKombatState({ localDate: getLocalDateKey() });
  rotateKanjiKombatSessionEpoch(kk);

  const run = {
    active: true,
    mode: 'kanjiKombat',
    player: { credits: 0 },
    creatureParty: { active: [ally], reserves: [], maxTotal: 3, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1,
      hpMult: 1,
      elementEdge: 0,
      flatDamageReduction: 0,
      xpMultiplier: 1,
      xpBalanceStacks: 0,
      baseAttackBonus: 0,
      baseHpBonus: 0,
      baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: {},
    stats: {},
    kanjiKombat: kk,
  };

  const gm = {
    userId: TEST_USER,
    player: { name: 'Tester', hp: 100, maxHp: 100, credits: 0 },
    combat,
    run,
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'mizu'],
      creatureCounts: { hi: 1, mizu: 1 },
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    },
    emitState() {},
  };

  gm.combatCycleService = new CombatCycleService(gm);
  const service = new KanjiKombatService(gm);
  gm.kanjiKombatService = service;

  service.refillPromptBuffer();
  ensureKanjiKombatTurnSeeds(combat);

  return { gm, service };
}

function advanceToQuiz(service) {
  const kk = service.gm.run.kanjiKombat;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const head = getKanjiKombatActivePrompt(kk);
    if (!head || head.kind !== 'intro') break;
    service.submitIntroChoice(head.cardId, 'unknown', {
      promptId: head.promptId,
      sequence: head.sequence,
      cardId: head.cardId,
    });
  }
}

let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  return `run_st_${String(actionCounter).padStart(8, '0')}`;
}

function quizEntryFromHead(service, seq, { correct = true } = {}) {
  const kk = service.gm.run.kanjiKombat;
  const head = getKanjiKombatActivePrompt(kk);
  assert.equal(head.kind, 'quiz', `Expected quiz head but got ${head?.kind}`);
  const choice = head.quiz.choices.find(c => c.correct === correct);
  assert.ok(choice, `No choice with correct=${correct} in quiz`);
  const seed = service.gm.combat.optimistic.nextTurnSeed;
  const resolved = resolveKanjiKombatAnswerTurn(
    { combat: service.gm.combat, run: service.gm.run, answerCorrect: correct },
    { seed },
  );
  return {
    seq,
    actionId: nextActionId(),
    kind: 'quiz',
    promptId: head.promptId,
    sequence: head.sequence,
    cardId: head.cardId,
    answerId: choice.id,
    predictedHash: hashTranscript(resolved.transcript),
  };
}

function partyStateSummary(gm) {
  return (gm.run.creatureParty.active || []).map(c => ({
    id: c.id,
    hp: c.hp,
    maxHp: c.maxHp,
    level: c.level,
    xp: c.xp,
    statStages: c.statStages || null,
  }));
}

// ---------------------------------------------------------------------------
// Shared module: milestone cadence and reset semantics
// ---------------------------------------------------------------------------

test('shared streak module preserves milestone cadence: heal 3/9, statUp 6, allyJoin 12, level-up+reset 15', () => {
  const kk = { streak: 0, highestStreak: 0 };
  ensurePendingStreakRewardQueues(kk);
  const joiner = fakeCreature('mizu', { level: 2 });
  kk.pendingStreakRewards[6].push({ seq: 1, type: 'statUp', allyRoll: 0, stat: 'def' });
  kk.pendingStreakRewards[12].push({ seq: 2, type: 'allyJoin', creature: joiner });

  const ally = fakeCreature('hi', { hp: 10, maxHp: 100, level: 3, xp: 0 });
  const creatureParty = { active: [ally], reserves: [] };

  const rewards = [];
  for (let i = 0; i < 15; i++) {
    rewards.push(applyKanjiKombatAnswerStreakProgress({ kk, creatureParty, correct: true }));
  }

  assert.equal(rewards[2]?.type, 'teamHeal');
  assert.equal(rewards[2]?.healPercent, STREAK_HEAL_REWARDS[3]);
  assert.equal(rewards[5]?.type, 'statUp');
  assert.equal(rewards[5]?.stat, 'def');
  assert.equal(rewards[8]?.type, 'teamHeal');
  assert.equal(rewards[8]?.healPercent, STREAK_HEAL_REWARDS[9]);
  assert.equal(rewards[11]?.type, 'allyJoined');
  assert.equal(rewards[11]?.allyId, 'mizu');
  assert.equal(rewards[14]?.type, 'partyLevelUp');
  // Non-milestone answers produce no reward
  assert.equal(rewards[0], null);
  assert.equal(rewards[3], null);

  // statUp applied the pre-rolled payload verbatim
  assert.equal(ally.statStages?.def, 1);
  // allyJoin pushed the payload creature (cloned)
  assert.equal(creatureParty.active.length, 2);
  assert.equal(creatureParty.active[1].id, 'mizu');
  assert.notEqual(creatureParty.active[1], joiner, 'payload creature must be cloned on join');
  // both payloads consumed
  assert.equal(kk.pendingStreakRewards[6].length, 0);
  assert.equal(kk.pendingStreakRewards[12].length, 0);
  // streak reset at 15, highestStreak retained
  assert.equal(kk.streak, 0);
  assert.equal(kk.highestStreak, 15);
});

test('shared streak module resets the streak on a wrong answer without applying rewards', () => {
  const kk = { streak: 5, highestStreak: 5 };
  ensurePendingStreakRewardQueues(kk);
  kk.pendingStreakRewards[6].push({ seq: 1, type: 'statUp', allyRoll: 0, stat: 'atk' });
  const ally = fakeCreature('hi', { hp: 40, maxHp: 100 });
  const creatureParty = { active: [ally], reserves: [] };

  const reward = applyKanjiKombatAnswerStreakProgress({ kk, creatureParty, correct: false });

  assert.equal(reward, null);
  assert.equal(kk.streak, 0);
  assert.equal(ally.hp, 40, 'no heal on wrong answer');
  assert.equal(ally.statStages?.atk ?? 0, 0, 'no buff on wrong answer');
  assert.equal(kk.pendingStreakRewards[6].length, 1, 'payload must not be consumed');
});

test('statUp payload allyRoll selects among living allies only', () => {
  const kk = { streak: 6, highestStreak: 6 };
  ensurePendingStreakRewardQueues(kk);
  kk.pendingStreakRewards[6].push({ seq: 1, type: 'statUp', allyRoll: 0.9, stat: 'dex' });
  const dead = fakeCreature('dead', { hp: 0 });
  const a = fakeCreature('a');
  const b = fakeCreature('b');
  const creatureParty = { active: [dead, a, b], reserves: [] };

  const reward = applyKanjiKombatStreakReward({ kk, creatureParty });

  assert.equal(reward.type, 'statUp');
  assert.equal(reward.allyId, 'b', 'roll 0.9 over 2 living allies picks the second');
  assert.equal(b.statStages?.dex, 1);
  assert.equal(dead.statStages?.dex ?? 0, 0);
});

test('allyJoin payload degrades to fullHeal when the party is full', () => {
  const kk = { streak: 12, highestStreak: 12 };
  ensurePendingStreakRewardQueues(kk);
  kk.pendingStreakRewards[12].push({ seq: 1, type: 'allyJoin', creature: fakeCreature('mizu') });
  const active = [
    fakeCreature('a', { hp: 10, maxHp: 100 }),
    fakeCreature('b', { hp: 20, maxHp: 100 }),
    fakeCreature('c', { hp: 30, maxHp: 100 }),
  ];
  const creatureParty = { active, reserves: [] };

  const reward = applyKanjiKombatStreakReward({ kk, creatureParty });

  assert.equal(reward.type, 'fullHeal');
  assert.deepEqual(active.map(c => c.hp), [100, 100, 100]);
  assert.equal(active.length, 3, 'no ally joined');
  assert.equal(kk.pendingStreakRewards[12].length, 0, 'payload consumed deterministically');
});

// ---------------------------------------------------------------------------
// Service: pre-roll top-up / idempotency
// ---------------------------------------------------------------------------

test('ensurePendingStreakRewards tops up both queues and is append-only', () => {
  const { service } = buildGm();
  const kk = service.gm.run.kanjiKombat;
  const pending = service.ensurePendingStreakRewards();
  assert.equal(pending, kk.pendingStreakRewards);

  const quizCount = (kk.promptBuffer || []).filter(p => p?.kind === 'quiz').length;
  const expectedTarget = Math.min(PENDING_STREAK_REWARD_QUEUE_MAX, Math.ceil(quizCount / 3) + 1);
  assert.equal(pending[6].length, expectedTarget);
  assert.equal(pending[12].length, expectedTarget);

  for (const payload of pending[6]) {
    assert.equal(payload.type, 'statUp');
    assert.ok(Number.isFinite(payload.allyRoll));
    assert.ok(['atk', 'def', 'dex'].includes(payload.stat));
    assert.ok(Number.isInteger(payload.seq) && payload.seq > 0);
  }
  for (const payload of pending[12]) {
    assert.equal(payload.type, 'allyJoin');
    assert.ok(Number.isInteger(payload.seq) && payload.seq > 0);
  }
  // seqs are unique and monotonic across both queues
  const seqs = [...pending[6], ...pending[12]].map(p => p.seq);
  assert.equal(new Set(seqs).size, seqs.length);

  // Idempotent: a second call never re-rolls held payloads
  const before6 = pending[6].slice();
  const before12 = pending[12].slice();
  service.ensurePendingStreakRewards();
  for (let i = 0; i < before6.length; i++) {
    assert.equal(kk.pendingStreakRewards[6][i], before6[i], 'statUp payloads preserved by reference');
  }
  for (let i = 0; i < before12.length; i++) {
    assert.equal(kk.pendingStreakRewards[12][i], before12[i], 'allyJoin payloads preserved by reference');
  }

  // Consuming the head leaves the tail untouched and the next ensure appends only
  const consumedHead = kk.pendingStreakRewards[6].shift();
  service.ensurePendingStreakRewards();
  assert.equal(kk.pendingStreakRewards[6][0], before6[1], 'tail survives consumption untouched');
  assert.notEqual(kk.pendingStreakRewards[6].at(-1).seq, consumedHead.seq, 'new payload has a fresh seq');
});

test('rollAllyJoinReward excludes active and already-pending creature ids', () => {
  const { service } = buildGm();
  service.gm.meta.creatureCollection = ['hi', 'mizu'];
  // active contains 'hi'; an existing pending payload holds creature id 'mizu'
  const existing = [{ seq: 1, type: 'allyJoin', creature: { id: 'mizu' } }];
  const payload = service.rollAllyJoinReward(existing);
  assert.equal(payload.type, 'allyJoin');
  assert.equal(payload.creature, null, 'no candidates left → deterministic fullHeal payload');
});

// ---------------------------------------------------------------------------
// Live submit vs session replay equivalence
// ---------------------------------------------------------------------------

function applyEntryLive(service, entry) {
  const optimistic = service.gm.combat.optimistic;
  const seed = optimistic.nextTurnSeed;
  const committed = service.submitAnswer(entry.answerId, {
    promptRef: { promptId: entry.promptId, sequence: entry.sequence, cardId: entry.cardId },
    rng: createSeededRng(seed),
    xpRng: createSeededRng(`${seed}:xp`),
    deferXpAwards: true,
  });
  // Mirror applySessionEntry/verifyAndCommitOptimisticAnswer seed-chain handling
  const responseOptimistic = service.gm.combat?.optimistic || optimistic;
  if (responseOptimistic === optimistic) {
    advanceKanjiKombatTurnSeeds(optimistic);
  } else {
    ensureKanjiKombatTurnSeeds(service.gm.combat);
  }
  return committed;
}

test('live submit and session replay produce identical party state for a streak-3 heal', () => {
  const { gm, service } = buildGm();
  advanceToQuiz(service);
  const epoch = gm.run.kanjiKombat.sessionEpoch;
  gm.run.kanjiKombat.streak = 2; // next correct answer fires the streak-3 heal
  gm.run.creatureParty.active[0].hp = 40;
  gm.combat.allies[0].hp = 40;

  const entry = quizEntryFromHead(service, 1);
  const snapshot = snapshotGameManager(gm);

  const liveReward = applyEntryLive(service, entry).kanjiStreakReward;
  const liveParty = partyStateSummary(gm);
  const liveStreak = gm.run.kanjiKombat.streak;

  restoreGameManager(gm, snapshot);

  const replay = service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  assert.equal(replay.status, 'ok', `replay failed: ${replay.reason}`);

  assert.equal(liveReward?.type, 'teamHeal');
  assert.deepEqual(partyStateSummary(gm), liveParty, 'replayed party state must equal live party state');
  assert.equal(gm.run.kanjiKombat.streak, liveStreak);
  assert.ok(gm.run.creatureParty.active[0].hp > 40, 'streak-3 heal must have applied');
});

test('live submit and session replay consume the same pre-rolled statUp payload at streak 6', () => {
  const { gm, service } = buildGm();
  advanceToQuiz(service);
  const epoch = gm.run.kanjiKombat.sessionEpoch;
  gm.run.kanjiKombat.streak = 5; // next correct answer fires the streak-6 buff
  // Pin the payload head so the assertion is explicit
  service.ensurePendingStreakRewards();
  gm.run.kanjiKombat.pendingStreakRewards[6][0] = { seq: 9001, type: 'statUp', allyRoll: 0, stat: 'def' };

  const entry = quizEntryFromHead(service, 1);
  const snapshot = snapshotGameManager(gm);

  const liveReward = applyEntryLive(service, entry).kanjiStreakReward;
  const liveParty = partyStateSummary(gm);

  restoreGameManager(gm, snapshot);

  const replay = service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  assert.equal(replay.status, 'ok', `replay failed: ${replay.reason}`);

  assert.equal(liveReward?.type, 'statUp');
  assert.equal(liveReward?.stat, 'def', 'payload consumed verbatim');
  assert.deepEqual(partyStateSummary(gm), liveParty, 'replayed party state must equal live party state');
  assert.equal(gm.run.creatureParty.active[0].statStages?.def, 1);
  assert.equal(gm.run.kanjiKombat.pendingStreakRewards[6].find(p => p.seq === 9001), undefined,
    'pinned payload consumed during replay');
});

test('streak reward heal lands after the answer turn so the NEXT transcript reflects it', () => {
  const { gm, service } = buildGm();
  advanceToQuiz(service);
  const epoch = gm.run.kanjiKombat.sessionEpoch;
  gm.run.kanjiKombat.streak = 2;
  gm.run.creatureParty.active[0].hp = 40;
  gm.combat.allies[0].hp = 40;

  // entry1 hash was computed against pre-heal state and must verify cleanly;
  // entry2's hash (built after entry1 committed live on a clone) bakes in the heal.
  const entry1 = quizEntryFromHead(service, 1);
  const snapshot = snapshotGameManager(gm);
  applyEntryLive(service, entry1);
  advanceToQuiz(service);
  const entry2 = quizEntryFromHead(service, 2);
  restoreGameManager(gm, snapshot);

  const result = service.applySessionSync({ sessionEpoch: epoch, entries: [entry1, entry2] });
  assert.equal(result.status, 'ok', `batch replay failed: ${result.reason}`);
  assert.equal(result.confirmedThroughSeq, 2);
});

test('KK level-ups never learn moves server-side (full creature objects are hashed)', () => {
  const { gm, service } = buildGm();
  advanceToQuiz(service);
  const ally = gm.run.creatureParty.active[0];
  // CREATURES_BY_ID['hi'] has okoru in its learnset at level 7. Cross 6→7 via
  // deferred kill XP: enemy level 1 kill = floor(25*1*2) = 50 XP (single active
  // ally takes both shares); xpToNextLevel(6) = 127, so 100 + 50 levels up.
  ally.level = 6;
  ally.xp = 100;
  gm.combat.enemies[0].hp = 1; // next correct answer's strike kills it

  const entry = quizEntryFromHead(service, 1, { correct: true });
  applyEntryLive(service, entry);

  assert.equal(ally.level, 7, 'kill XP must cross the learnset boundary');
  assert.deepEqual(ally.moves, [],
    'server must NOT learn moves on KK level-ups — the transcript hash covers '
    + 'full creature objects (moves included) and the client cannot learn moves, '
    + 'so addXpToCreature here would break client/server hash parity');
});
