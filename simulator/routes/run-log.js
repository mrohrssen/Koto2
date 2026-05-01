function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericOrDefault(value, fallback) {
  const number = numericOrNull(value);
  return number === null ? fallback : number;
}

function runKey(day, run) {
  return `${day}:${run}`;
}

function summarizeRounds(rounds, bossCombatRounds) {
  const combatCount = rounds.length;
  const totalRounds = rounds.reduce((sum, value) => sum + value, 0);
  return {
    combatCount,
    avgCombatRounds: combatCount > 0 ? Math.round((totalRounds / combatCount) * 10) / 10 : 0,
    maxCombatRounds: combatCount > 0 ? Math.max(...rounds) : 0,
    bossCombatRounds
  };
}

function roomReachedOrDefault(value, fallback) {
  const number = numericOrNull(value);
  if (number === null || number <= 0) return fallback;
  return Math.max(Math.trunc(number), fallback);
}

function deriveCombatByRun(events) {
  const byRun = new Map();

  for (const event of events) {
    if (event.event_type !== 'room_entered') continue;
    const rounds = numericOrNull(event.data?.rounds);
    if (rounds === null || rounds <= 0) continue;

    const key = runKey(event.day, event.run);
    if (!byRun.has(key)) {
      byRun.set(key, { regularRounds: [], bossCombatRounds: null });
    }

    const metrics = byRun.get(key);
    if (event.data?.roomType === 'boss') {
      metrics.bossCombatRounds = rounds;
    } else {
      metrics.regularRounds.push(rounds);
    }
  }

  const summaries = new Map();
  for (const [key, metrics] of byRun.entries()) {
    summaries.set(key, summarizeRounds(metrics.regularRounds, metrics.bossCombatRounds));
  }
  return summaries;
}

function deriveFurthestRoomByRun(events) {
  const byRun = new Map();

  for (const event of events) {
    if (event.event_type !== 'room_entered') continue;
    const roomIndex = numericOrNull(event.room);
    if (roomIndex === null || roomIndex < 0) continue;

    const key = runKey(event.day, event.run);
    const playerFacingRoom = Math.trunc(roomIndex) + 1;
    byRun.set(key, Math.max(byRun.get(key) ?? 0, playerFacingRoom));
  }

  return byRun;
}

function normalizeWordsMastered(wordsMastered) {
  return Array.isArray(wordsMastered) ? wordsMastered : [];
}

export function buildRunLogRows(events = []) {
  const combatByRun = deriveCombatByRun(events);
  const furthestRoomByRun = deriveFurthestRoomByRun(events);

  return events
    .filter(event => event.event_type === 'run_summary')
    .map(event => {
      const data = event.data || {};
      const fallbackCombat = combatByRun.get(runKey(event.day, event.run)) || {
        combatCount: 0,
        avgCombatRounds: 0,
        maxCombatRounds: 0,
        bossCombatRounds: null
      };
      const fallbackFurthestRoom = furthestRoomByRun.get(runKey(event.day, event.run)) ?? 0;
      const wordsMastered = normalizeWordsMastered(data.wordsMastered);
      const bossRounds = data.bossCombatRounds === null
        ? null
        : numericOrNull(data.bossCombatRounds);

      return {
        day: event.day,
        run: event.run,
        areaId: data.areaId ?? null,
        areaName: data.areaName ?? data.areaId ?? 'Unknown',
        areaNameJa: data.areaNameJa ?? null,
        completed: Boolean(data.completed),
        wiped: Boolean(data.wiped),
        creaturesBefriended: numericOrDefault(data.creaturesBefriended, 0),
        itemsCollected: numericOrDefault(data.itemsCollected, 0),
        wordsMastered,
        wordsMasteredCount: wordsMastered.length,
        combatCount: numericOrDefault(data.combatCount, fallbackCombat.combatCount),
        avgCombatRounds: numericOrDefault(data.avgCombatRounds, fallbackCombat.avgCombatRounds),
        maxCombatRounds: numericOrDefault(data.maxCombatRounds, fallbackCombat.maxCombatRounds),
        bossCombatRounds: bossRounds ?? fallbackCombat.bossCombatRounds,
        furthestRoomReached: roomReachedOrDefault(data.furthestRoomReached, fallbackFurthestRoom)
      };
    });
}
