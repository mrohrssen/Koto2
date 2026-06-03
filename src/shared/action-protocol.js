function isUnsupportedJsonValue(value) {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

export const PVE_CORE_PREDICTION_MODE = 'shared-pve-turn-v1';
export const KANJI_KOMBAT_PREDICTION_MODE = 'shared-kanji-kombat-v1';

function stableStringify(value) {
  if (typeof value === 'bigint') {
    throw new TypeError('Cannot canonicalize BigInt value in action protocol transcript');
  }
  if (isUnsupportedJsonValue(value)) {
    throw new TypeError('Cannot canonicalize unsupported top-level value in action protocol transcript');
  }
  return stableStringifyJsonValue(value);
}

function stableStringifyJsonValue(value) {
  if (typeof value === 'bigint') {
    throw new TypeError('Cannot canonicalize BigInt value in action protocol transcript');
  }
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i++) {
      const item = Object.hasOwn(value, i) ? value[i] : undefined;
      items.push(isUnsupportedJsonValue(item) ? 'null' : stableStringifyJsonValue(item));
    }
    return `[${items.join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = [];
  for (const key of keys) {
    const item = value[key];
    if (isUnsupportedJsonValue(item)) continue;
    entries.push(`${JSON.stringify(key)}:${stableStringifyJsonValue(item)}`);
  }
  return `{${entries.join(',')}}`;
}

function fnv1aHex(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createActionId(prefix = 'act') {
  const random = Math.random().toString(36).slice(2, 10);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${random}`;
}

export function isActionId(value) {
  return typeof value === 'string'
    && value.length <= 96
    && /^[a-z][a-z0-9-]{0,31}_[a-z0-9]{1,16}_[a-z0-9]{1,16}$/i.test(value);
}

export function hashTranscript(transcript) {
  return fnv1aHex(stableStringify(transcript));
}

export function buildActionEnvelope({
  combatId,
  stateVersion,
  actionType,
  seed,
  payload,
  predictedTranscript,
  actionId = createActionId(),
}) {
  return {
    actionId,
    combatId,
    stateVersion,
    actionType,
    seed,
    payload,
    predictedHash: hashTranscript(predictedTranscript),
  };
}

export function verifyActionEnvelope(envelope, expected) {
  if (!envelope?.actionId) return { ok: false, reason: 'missing_action_id' };
  if (envelope.combatId !== expected.combatId) {
    return { ok: false, reason: 'combat_id_mismatch' };
  }
  if (envelope.stateVersion !== expected.stateVersion) {
    return { ok: false, reason: 'state_version_mismatch' };
  }
  if (envelope.seed !== expected.seed) {
    return { ok: false, reason: 'seed_mismatch' };
  }
  return { ok: true };
}

export function buildAcceptedResponse({ stateVersion, nextSeed }) {
  return { status: 'accepted', stateVersion, nextSeed };
}

export function buildCorrectedResponse({
  reason,
  authoritativeTranscript,
  authoritativeState,
  stateVersion,
  nextSeed,
}) {
  return {
    status: 'corrected',
    reason,
    authoritativeTranscript,
    authoritativeState,
    stateVersion,
    nextSeed,
  };
}
