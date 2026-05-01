/**
 * Pure helpers for simulator run selection and run_summary metrics.
 */

// Areas the simulator should never progress into. School is excluded so the
// simulated player caps out at Wild Plains until we're ready to validate
// school content under the simulator.
export const SIMULATOR_EXCLUDED_AREA_IDS = new Set(['school']);

export function getAreaOptionsFromResponse(data) {
  const areas = data?.areas ?? data ?? [];
  return Array.isArray(areas) ? areas : [];
}

export function selectLatestAreaOption(data) {
  const areas = getAreaOptionsFromResponse(data);
  const eligible = areas.filter(area => !SIMULATOR_EXCLUDED_AREA_IDS.has(getAreaId(area)));
  return eligible.length > 0 ? eligible[eligible.length - 1] : null;
}

export function getAreaId(area) {
  return area?.id ?? area?.areaId ?? null;
}

export function summarizeArea(area) {
  return {
    areaId: getAreaId(area),
    areaName: area?.nameEn ?? area?.name ?? getAreaId(area) ?? 'Unknown',
    areaNameJa: area?.name ?? null
  };
}

export function createRunCombatMetrics() {
  return {
    regularRounds: [],
    bossCombatRounds: null
  };
}

function readPositiveRoundCount(result) {
  const rounds = Number(result?.combat?.rounds);
  return Number.isFinite(rounds) && rounds > 0 ? rounds : null;
}

export function recordCombatResult(metrics, roomType, result) {
  const rounds = readPositiveRoundCount(result);
  if (rounds === null) return metrics;

  if (roomType === 'boss') {
    metrics.bossCombatRounds = rounds;
  } else {
    metrics.regularRounds.push(rounds);
  }

  return metrics;
}

export function summarizeRunCombatMetrics(metrics) {
  const regularRounds = Array.isArray(metrics?.regularRounds) ? metrics.regularRounds : [];
  const combatCount = regularRounds.length;
  const totalRounds = regularRounds.reduce((sum, rounds) => sum + rounds, 0);
  const avgCombatRounds = combatCount > 0
    ? Math.round((totalRounds / combatCount) * 10) / 10
    : 0;
  const maxCombatRounds = combatCount > 0 ? Math.max(...regularRounds) : 0;
  const bossRounds = Number(metrics?.bossCombatRounds);

  return {
    combatCount,
    avgCombatRounds,
    maxCombatRounds,
    bossCombatRounds: Number.isFinite(bossRounds) && bossRounds > 0 ? bossRounds : null
  };
}

function normalizeFurthestRoomReached(value) {
  const room = Number(value);
  return Number.isFinite(room) && room > 0 ? Math.trunc(room) : 0;
}

export function buildRunSummaryEventData(serverRunSummary = {}, selectedArea = null, combatMetrics = createRunCombatMetrics(), runWiped = false, furthestRoomReached = 0) {
  return {
    ...summarizeArea(selectedArea),
    wiped: runWiped,
    completed: !runWiped,
    wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
    wordsMastered: serverRunSummary.wordsMastered ?? [],
    creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
    creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
    itemsCollected: serverRunSummary.itemsCollected ?? 0,
    ...summarizeRunCombatMetrics(combatMetrics),
    furthestRoomReached: normalizeFurthestRoomReached(furthestRoomReached)
  };
}
