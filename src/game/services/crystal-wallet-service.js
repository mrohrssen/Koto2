export const DAILY_CRYSTAL_BONUS = 500;

export const CRYSTAL_COSTS = {
  startRun: 25,
  translate: 5,
  learn: 15
};

export const CRYSTAL_REASONS = {
  startRun: 'start_run',
  translate: 'translate',
  learn: 'learn'
};

const MAX_CHARGE_RECORDS = 100;
const inFlightCrystalActions = new Map();

export function createUtcDateString(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString().slice(0, 10);
}

export function ensureCrystalMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('meta is required');
  }
  if (!Number.isFinite(meta.crystals) || meta.crystals < 0) {
    meta.crystals = 0;
  }
  meta.crystals = Math.floor(meta.crystals);
  if (typeof meta.lastCrystalLoginDate !== 'string') {
    meta.lastCrystalLoginDate = null;
  }
  if (!meta.crystalCharges || typeof meta.crystalCharges !== 'object' || Array.isArray(meta.crystalCharges)) {
    meta.crystalCharges = {};
  }
  return meta;
}

export function getCrystalBalance(meta) {
  ensureCrystalMeta(meta);
  return meta.crystals;
}

export function awardDailyLoginCrystals(meta, now = new Date()) {
  ensureCrystalMeta(meta);
  const today = createUtcDateString(now);
  if (meta.lastCrystalLoginDate === today) {
    return { awarded: false, amount: 0, balance: meta.crystals, today };
  }
  meta.crystals += DAILY_CRYSTAL_BONUS;
  meta.lastCrystalLoginDate = today;
  return { awarded: true, amount: DAILY_CRYSTAL_BONUS, balance: meta.crystals, today };
}

function chargeIdFor(reason, key) {
  return `${reason}:${String(key || '').trim()}`;
}

function hasCharge(meta, reason, key) {
  return !!meta.crystalCharges[chargeIdFor(reason, key)];
}

function pruneChargeRecords(meta) {
  const entries = Object.entries(meta.crystalCharges)
    .sort((a, b) => String(a[1].chargedAt || '').localeCompare(String(b[1].chargedAt || '')));
  while (entries.length > MAX_CHARGE_RECORDS) {
    const [oldestKey] = entries.shift();
    delete meta.crystalCharges[oldestKey];
  }
}

export function prepareCrystalSpend(meta, { reason, key, cost }) {
  ensureCrystalMeta(meta);
  const numericCost = Number(cost);
  if (!reason || !key || !Number.isFinite(numericCost) || numericCost <= 0) {
    throw new Error('reason, key, and positive cost are required');
  }
  if (hasCharge(meta, reason, key)) {
    return {
      ok: true,
      crystals: {
        cost: numericCost,
        charged: false,
        alreadyCharged: true,
        balance: meta.crystals
      }
    };
  }
  if (meta.crystals < numericCost) {
    return {
      ok: false,
      error: 'insufficient_crystals',
      cost: numericCost,
      balance: meta.crystals
    };
  }
  return {
    ok: true,
    crystals: {
      cost: numericCost,
      charged: false,
      alreadyCharged: false,
      balance: meta.crystals
    }
  };
}

export function recordCrystalSpend(meta, { reason, key, cost, now = new Date() }) {
  ensureCrystalMeta(meta);
  const prepared = prepareCrystalSpend(meta, { reason, key, cost });
  if (!prepared.ok || prepared.crystals.alreadyCharged) return prepared;

  meta.crystals -= cost;
  meta.crystalCharges[chargeIdFor(reason, key)] = {
    reason,
    key,
    cost,
    chargedAt: new Date(now).toISOString()
  };
  pruneChargeRecords(meta);

  return {
    ok: true,
    crystals: {
      cost,
      charged: true,
      alreadyCharged: false,
      balance: meta.crystals
    }
  };
}

export async function withCrystalActionInFlight({ userId, reason, key, action }) {
  if (!userId || !reason || !key || typeof action !== 'function') {
    throw new Error('userId, reason, key, and action are required');
  }

  const inFlightKey = `${userId}:${reason}:${key}`;
  if (inFlightCrystalActions.has(inFlightKey)) {
    return inFlightCrystalActions.get(inFlightKey);
  }

  const task = Promise.resolve()
    .then(action)
    .finally(() => inFlightCrystalActions.delete(inFlightKey));
  inFlightCrystalActions.set(inFlightKey, task);
  return task;
}

export function clearCrystalInFlightForTest() {
  inFlightCrystalActions.clear();
}
