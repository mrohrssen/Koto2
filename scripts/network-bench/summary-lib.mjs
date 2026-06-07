export function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(sorted.length * ratio);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[index];
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDuration(record) {
  return normalizeNumber(record.durationMs);
}

function normalizeStatus(record) {
  return normalizeNumber(record.status);
}

function isFailure(record) {
  const status = normalizeStatus(record);
  return Boolean(record.injectedFailure) || status >= 500 || status === 0;
}

function parseTimingObject(line) {
  const match = line.match(/\{.*\}$/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function summarizeCombatTiming(lines = []) {
  const summary = {
    requestCount: 0,
    turnCount: 0,
    serverCount: 0,
    failedTurns: 0,
    outcomes: {},
    maxRequestMs: 0,
    maxTurnTotalMs: 0,
    maxServerTotalMs: 0,
    maxServerResolveMs: 0,
    maxServerSaveMs: 0,
  };

  for (const line of lines) {
    const parsed = parseTimingObject(line);
    if (!parsed) {
      continue;
    }

    if (line.includes('[Combat Timing] request')) {
      summary.requestCount += 1;
      summary.maxRequestMs = Math.max(summary.maxRequestMs, normalizeNumber(parsed.requestMs));
      continue;
    }

    if (line.includes('[Combat Timing] turn')) {
      summary.turnCount += 1;
      summary.maxRequestMs = Math.max(summary.maxRequestMs, normalizeNumber(parsed.requestMs));
      summary.maxTurnTotalMs = Math.max(summary.maxTurnTotalMs, normalizeNumber(parsed.totalMs));
      if (parsed.failed) {
        summary.failedTurns += 1;
      }
      if (parsed.outcome) {
        summary.outcomes[parsed.outcome] = (summary.outcomes[parsed.outcome] || 0) + 1;
      }
      continue;
    }

    if (line.includes('[Combat Timing] server')) {
      summary.serverCount += 1;
      summary.maxServerTotalMs = Math.max(summary.maxServerTotalMs, normalizeNumber(parsed.totalMs));
      summary.maxServerResolveMs = Math.max(summary.maxServerResolveMs, normalizeNumber(parsed.resolveMs));
      summary.maxServerSaveMs = Math.max(summary.maxServerSaveMs, normalizeNumber(parsed.saveMs));
    }
  }

  return summary;
}

function isCombatSyncPath(record) {
  const path = String(record.path || '');
  return path.startsWith('/api/game/creature-combat-cycle')
    || path.startsWith('/api/game/state')
    || path.startsWith('/api/game/kanji-kombat/answer');
}

function isAssetChunkMedia(record) {
  return ['javascript', 'image', 'audio', 'tts'].includes(record.category);
}

export function classifyDelayBuckets(records = [], logSummary = {}) {
  const combat = logSummary.combat || summarizeCombatTiming([]);
  const combatSyncRecords = records.filter(isCombatSyncPath);
  const assetChunkMediaRecords = records.filter(isAssetChunkMedia);
  const recoveryCount = Object.entries(combat.outcomes || {})
    .filter(([outcome]) => outcome.includes('recovery'))
    .reduce((total, [, count]) => total + normalizeNumber(count), 0);

  return {
    network_request: {
      count: combatSyncRecords.length,
      maxMs: combatSyncRecords.length ? Math.max(...combatSyncRecords.map(normalizeDuration)) : 0,
    },
    server_resolve_save: {
      count: normalizeNumber(combat.serverCount),
      maxMs: normalizeNumber(combat.maxServerTotalMs),
    },
    verification_gap: {
      count: normalizeNumber(combat.turnCount),
      maxMs: normalizeNumber(combat.maxRequestMs),
    },
    asset_chunk_media: {
      count: assetChunkMediaRecords.length,
      maxMs: assetChunkMediaRecords.length ? Math.max(...assetChunkMediaRecords.map(normalizeDuration)) : 0,
    },
    recovery_fetch: {
      count: recoveryCount,
      maxMs: recoveryCount ? normalizeNumber(combat.maxRequestMs) : 0,
    },
    ui_control_gap: {
      count: 0,
      maxMs: 0,
    },
    unknown: {
      count: 0,
      maxMs: 0,
    },
  };
}

export function summarizeCategories(records) {
  const grouped = new Map();

  for (const record of records) {
    const category = record.category || 'other';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category).push(record);
  }

  return Object.fromEntries([...grouped.entries()].map(([category, categoryRecords]) => {
    const durations = categoryRecords.map(normalizeDuration);

    return [category, {
      count: categoryRecords.length,
      failures: categoryRecords.filter(isFailure).length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      maxMs: durations.length ? Math.max(...durations) : 0,
    }];
  }));
}

export function rankSlowRequests(records, limit = 20) {
  return [...records]
    .sort((a, b) => normalizeDuration(b) - normalizeDuration(a))
    .slice(0, limit)
    .map((record) => ({
      method: record.method,
      path: record.path,
      category: record.category,
      status: normalizeStatus(record),
      durationMs: normalizeDuration(record),
      injectedDelayMs: normalizeNumber(record.injectedDelayMs),
      injectedFailure: Boolean(record.injectedFailure),
    }));
}

export function summarizeLogLines(lines = []) {
  const combatTiming = lines.filter((line) => line.includes('[Combat Timing]'));

  return {
    apiTiming: lines.filter((line) => line.includes('[API Timing]')),
    combatTiming,
    connection: lines.filter((line) => line.includes('Connection lost') || line.includes('retrying')),
    combat: summarizeCombatTiming(combatTiming),
  };
}

export function aggregateProfile(profile, records, logLines = []) {
  const appLog = summarizeLogLines(logLines);

  return {
    profile,
    requestCount: records.length,
    failureCount: records.filter(isFailure).length,
    categories: summarizeCategories(records),
    slowestRequests: rankSlowRequests(records),
    appLog,
    delayBuckets: classifyDelayBuckets(records, appLog),
  };
}

export function aggregateRun(profileSummaries) {
  return {
    generatedAt: new Date().toISOString(),
    profiles: profileSummaries,
  };
}
