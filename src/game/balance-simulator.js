import { CREATURES_BY_ID, instantiateCreatureForCombat } from './creatures.js';
import { pickEnemyMoveChoice, pickEnemyTarget } from './services/creature-combat-service.js';
import { resolveRound } from '../pvp/pvp-combat.js';

export const DEFAULT_BALANCE_MAX_ROUNDS = 100;
const DEFAULT_YIELD_EVERY = 100;

function nowIso() {
  return new Date().toISOString();
}

function makeJobId() {
  return `balance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function sampleUniqueCreatureIds(creatureIds, random = Math.random) {
  if (!Array.isArray(creatureIds) || creatureIds.length < 6) {
    throw new Error('Balance simulations require at least 6 creatures');
  }
  const shuffled = [...creatureIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 6);
}

export function createInitialBalanceResults(templates = Object.values(CREATURES_BY_ID)) {
  const rows = new Map();
  for (const template of templates) {
    rows.set(template.id, {
      creatureId: template.id,
      name: template.name,
      nameEn: template.nameEn,
      rarity: template.rarity,
      appearances: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      lossRate: 0
    });
  }
  return rows;
}

function incrementAppearance(rows, creatureId) {
  const row = rows.get(creatureId);
  if (!row) return;
  row.appearances++;
}

export function recordBattleOutcome(rows, sideAIds, sideBIds, winner) {
  for (const id of [...sideAIds, ...sideBIds]) incrementAppearance(rows, id);

  if (winner === 'draw') {
    for (const id of [...sideAIds, ...sideBIds]) rows.get(id).draws++;
    return;
  }

  const winningIds = winner === 'sideA' ? sideAIds : sideBIds;
  const losingIds = winner === 'sideA' ? sideBIds : sideAIds;
  for (const id of winningIds) rows.get(id).wins++;
  for (const id of losingIds) rows.get(id).losses++;
}

export function serializeResultRows(rows) {
  return [...rows.values()]
    .map(row => ({
      ...row,
      winRate: row.appearances > 0 ? row.wins / row.appearances : 0,
      lossRate: row.appearances > 0 ? row.losses / row.appearances : 0
    }))
    .sort((a, b) => b.winRate - a.winRate || b.appearances - a.appearances || a.nameEn.localeCompare(b.nameEn));
}

export function chooseAiMovesForSide(myTeam, theirTeam) {
  const choices = [];
  for (let i = 0; i < myTeam.length; i++) {
    const creature = myTeam[i];
    if (!creature || creature.hp <= 0) continue;

    const choice = pickEnemyMoveChoice(creature, theirTeam, myTeam);
    if (!choice?.move) continue;

    const target = pickEnemyTarget(creature, choice.move, choice.mode, theirTeam, myTeam);
    if (!target?.target) continue;

    const targetIndex = target.targetSide === 'player'
      ? theirTeam.indexOf(target.target)
      : myTeam.indexOf(target.target);

    choices.push({ creatureIndex: i, moveId: choice.move.id, targetIndex: Math.max(0, targetIndex) });
  }
  return choices;
}

export function runBalanceBattle(sideA, sideB, options = {}) {
  const maxRounds = options.maxRounds || DEFAULT_BALANCE_MAX_ROUNDS;
  for (let round = 1; round <= maxRounds; round++) {
    const movesA = chooseAiMovesForSide(sideA, sideB);
    const movesB = chooseAiMovesForSide(sideB, sideA);
    const result = resolveRound(sideA, sideB, movesA, movesB, {
      combatA: {},
      combatB: {}
    });
    if (result.winner) return { winner: result.winner, rounds: round, reason: 'resolved' };
  }
  return { winner: 'draw', rounds: maxRounds, reason: 'max_rounds' };
}

export async function runBalanceSimulation(config) {
  const {
    job,
    battleCount,
    creatureLevel,
    random = Math.random,
    maxRounds = DEFAULT_BALANCE_MAX_ROUNDS,
    yieldEvery = DEFAULT_YIELD_EVERY,
    shouldCancel = () => false,
    onProgress = () => {}
  } = config;

  assertPositiveInteger(battleCount, 'battleCount');
  assertPositiveInteger(creatureLevel, 'creatureLevel');

  const templates = Object.values(CREATURES_BY_ID);
  const templateIds = templates.map(template => template.id);
  const rows = job.resultRows || createInitialBalanceResults(templates);
  job.resultRows = rows;

  for (let i = job.completedBattles; i < battleCount; i++) {
    if (shouldCancel()) {
      job.status = 'cancelled';
      job.completedAt = nowIso();
      return job;
    }

    const picked = sampleUniqueCreatureIds(templateIds, random);
    const sideAIds = picked.slice(0, 3);
    const sideBIds = picked.slice(3, 6);
    const sideA = sideAIds.map(id => instantiateCreatureForCombat(id, creatureLevel));
    const sideB = sideBIds.map(id => instantiateCreatureForCombat(id, creatureLevel));
    const battle = runBalanceBattle(sideA, sideB, { maxRounds });

    recordBattleOutcome(rows, sideAIds, sideBIds, battle.winner);
    if (battle.winner === 'draw') job.draws++;
    job.completedBattles++;
    onProgress(job);

    if (job.completedBattles % yieldEvery === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  job.status = 'completed';
  job.completedAt = nowIso();
  return job;
}

export function serializeBalanceJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    status: job.status,
    battleCount: job.battleCount,
    creatureLevel: job.creatureLevel,
    completedBattles: job.completedBattles,
    draws: job.draws,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage || null,
    results: serializeResultRows(job.resultRows || new Map())
  };
}

export function createBalanceSimulationManager(options = {}) {
  const runSimulation = options.runSimulation || runBalanceSimulation;
  let activeJob = null;
  let latestJob = null;
  let activePromise = null;

  function start({ battleCount, creatureLevel }) {
    assertPositiveInteger(battleCount, 'battleCount');
    assertPositiveInteger(creatureLevel, 'creatureLevel');
    if (activeJob && activeJob.status === 'running') {
      throw new Error('A balance simulation is already running');
    }

    const job = {
      jobId: makeJobId(),
      status: 'running',
      battleCount,
      creatureLevel,
      completedBattles: 0,
      draws: 0,
      startedAt: nowIso(),
      completedAt: null,
      errorMessage: null,
      cancelled: false,
      resultRows: createInitialBalanceResults()
    };

    activeJob = job;
    latestJob = job;
    activePromise = Promise.resolve()
      .then(() => runSimulation({
        job,
        battleCount,
        creatureLevel,
        shouldCancel: () => job.cancelled
      }))
      .catch(error => {
        job.status = 'errored';
        job.errorMessage = error.message;
        job.completedAt = nowIso();
      })
      .finally(() => {
        if (activeJob === job) activeJob = null;
      });

    return serializeBalanceJob(job);
  }

  function current() {
    return serializeBalanceJob(activeJob || latestJob);
  }

  function cancel() {
    if (!activeJob || activeJob.status !== 'running') {
      throw new Error('No active balance simulation');
    }
    activeJob.cancelled = true;
    activeJob.status = 'cancelled';
    activeJob.completedAt = nowIso();
    return serializeBalanceJob(activeJob);
  }

  async function waitForIdle() {
    if (activePromise) await activePromise;
  }

  return { start, current, cancel, waitForIdle };
}
