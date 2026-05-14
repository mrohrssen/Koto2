export const ANALYTICS_EVENTS = Object.freeze({
  login: 'koto_login',
  signUp: 'koto_sign_up',
  playerCreated: 'koto_player_created',
  prologueStarted: 'koto_prologue_started',
  prologueCompleted: 'koto_prologue_completed',
  firstRunStarted: 'koto_first_run_started',
  areaSelected: 'koto_area_selected',
  partyConfirmed: 'koto_party_confirmed',
  firstRoomSeen: 'koto_first_room_seen',
  firstCombatStarted: 'koto_first_combat_started',
  firstCombatEnded: 'koto_first_combat_ended',
  firstRunEnded: 'koto_first_run_ended'
});

export const MILESTONE_ORDER = Object.freeze([
  'sign_up',
  'player_created',
  'prologue_started',
  'prologue_completed',
  'first_run_started',
  'area_selected',
  'party_confirmed',
  'first_room_seen',
  'first_combat_started',
  'first_combat_ended',
  'first_run_ended'
]);

const ALLOWED_PARAM_KEYS = new Set([
  'method',
  'area_id',
  'party_size',
  'room_number',
  'rooms_reached',
  'duration_sec',
  'is_boss',
  'outcome',
  'turn_count',
  'phase',
  'tutorial_step',
  'run_number',
  'highest_area',
  'platform'
]);

const REQUIRED_FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];

export function isAnalyticsEnabled(env = {}) {
  if (env.VITE_FIREBASE_ANALYTICS_ENABLED !== 'true') return false;
  return REQUIRED_FIREBASE_KEYS.every(key => typeof env[key] === 'string' && env[key].length > 0);
}

export function buildFirebaseConfig(env = {}) {
  if (!isAnalyticsEnabled(env)) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
  };
}

export function sanitizeParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!ALLOWED_PARAM_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.length <= 80) out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

export function createMilestoneStore(storage, analyticsId) {
  const key = analyticsId ? `koto_analytics_milestones:${analyticsId}` : 'koto_analytics_milestones:anonymous';

  function read() {
    try {
      const raw = storage?.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function write(set) {
    try {
      storage?.setItem(key, JSON.stringify([...set]));
    } catch {
      // Analytics storage must never break gameplay.
    }
  }

  return {
    has(eventName) {
      return read().has(eventName);
    },
    mark(eventName) {
      const set = read();
      set.add(eventName);
      write(set);
    }
  };
}

export function extractGameContext(state = {}) {
  const run = state.run || {};
  const combat = state.combat || {};
  const meta = state.meta || {};
  const areaId = run.currentArea?.id || run.areaId || null;
  const roomNumber = Number.isFinite(run.currentRoom) ? run.currentRoom + 1 : null;

  return sanitizeParams({
    phase: state.phase,
    area_id: areaId,
    room_number: roomNumber,
    rooms_reached: run.roomsExplored,
    is_boss: combat.isBoss === true,
    turn_count: combat.turnCount,
    tutorial_step: meta.tutorialStep,
    run_number: meta.lifetimeStats?.totalRuns,
    highest_area: meta.levels?.highestUnlocked
  });
}

export function extractRunEndContext(state = {}, outcome = 'unknown') {
  const run = state.run || {};
  const startedAt = run.stats?.startTime;
  const endedAt = run.stats?.endTime || Date.now();
  const durationSec = Number.isFinite(startedAt)
    ? Math.max(0, Math.round((endedAt - startedAt) / 1000))
    : null;

  return sanitizeParams({
    outcome,
    area_id: run.currentArea?.id || run.areaId,
    rooms_reached: run.roomsExplored,
    duration_sec: durationSec
  });
}

export function normalizeCombatOutcome(result = {}) {
  if (result.befriend?.success === true) return 'befriend';
  if (result.victory === true) return 'victory';
  if (result.combatEnded === true && result.victory === false) return 'defeat';
  return 'unknown';
}

export function nextFurthestStep(currentStep, candidateStep) {
  const currentIdx = MILESTONE_ORDER.indexOf(currentStep);
  const candidateIdx = MILESTONE_ORDER.indexOf(candidateStep);
  if (candidateIdx < 0) return currentStep || null;
  if (currentIdx < 0 || candidateIdx > currentIdx) return candidateStep;
  return currentStep;
}
