function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
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
