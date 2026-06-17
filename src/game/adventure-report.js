import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURES = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf-8'));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../data/items.json'), 'utf-8'));

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildKanjiKombatReport(run) {
  const kk = run.kanjiKombat || {};
  const source = kk.finalReport || kk.report || {};
  const correctAnswers = numberOr(source.correctAnswers);
  const wrongAnswers = numberOr(source.wrongAnswers);
  const totalAnswers = correctAnswers + wrongAnswers;
  const sourceAccuracy = Number(source.accuracy);
  const accuracy = totalAnswers > 0
    ? Math.round((correctAnswers / totalAnswers) * 100)
    : Number.isFinite(sourceAccuracy) ? sourceAccuracy : 0;
  const activeParty = Array.isArray(run.creatureParty?.active) ? run.creatureParty.active : [];

  return {
    ...source,
    wave: Math.max(1, Math.floor(numberOr(
      source.wave ?? kk.waveReached ?? kk.wave,
      numberOr(source.wavesCleared) + 1
    ))),
    highestStreak: numberOr(source.highestStreak ?? kk.highestStreak),
    accuracy,
    temporaryLevels: Array.isArray(source.temporaryLevels)
      ? source.temporaryLevels
      : activeParty.map(c => ({
        id: c.id,
        nameEn: c.nameEn,
        level: c.level || 1
      })),
  };
}

/**
 * Build the adventure report summary object from run and meta state.
 * Called just before run state is cleared.
 */
export function buildRunSummary(run, meta) {
  if (run.mode === 'kanjiKombat') {
    const report = buildKanjiKombatReport(run);
    return {
      mode: 'kanjiKombat',
      isVictory: report.completedDaily === true && report.defeated !== true,
      kanjiKombat: report,
    };
  }

  const rs = run.runSummary || {};
  return {
    areasCompleted: run.areasCompleted || 0,
    areasToWin: run.areasToWin || 1,
    creaturesBefriended: rs.creaturesBefriended || 0,
    creaturesDefeated: rs.creaturesDefeated || 0,
    itemsCollected: rs.itemsCollected || 0,
    elementsCollected: rs.elementsCollected || { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
    wordsImmersed: (rs.wordsExposed || []).length,
    wordsMastered: (rs.wordsMastered || []).sort((a, b) => (b.exposures || 0) - (a.exposures || 0)).slice(0, 5),
    runNumber: meta?.lifetimeStats?.totalRuns || 0,
    durationMs: (run.stats?.endTime && run.stats?.startTime)
      ? run.stats.endTime - run.stats.startTime
      : 0,
    creaturesDiscovered: (meta?.creatureCollection || []).length,
    totalCreatures: CREATURES.length,
    itemsDiscoveredCount: (meta?.itemsDiscovered || []).length,
    totalItems: ITEMS.length,
  };
}
