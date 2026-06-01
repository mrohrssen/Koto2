import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURES = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf-8'));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../data/items.json'), 'utf-8'));

/**
 * Build the adventure report summary object from run and meta state.
 * Called just before run state is cleared.
 */
export function buildRunSummary(run, meta) {
  if (run.mode === 'kanjiKombat') {
    const report = run.kanjiKombat?.finalReport || run.kanjiKombat?.report || {};
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
