const ACTION_LEDGER_LIMIT = 100;

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function isValidActionId(actionId) {
  return typeof actionId === 'string' && actionId.length > 0;
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pruneLedger(ledger) {
  while (ledger.order.length > ACTION_LEDGER_LIMIT) {
    const oldestActionId = ledger.order.shift();
    delete ledger.entries[oldestActionId];
  }
}

function syncEntriesToOrder(ledger) {
  const normalizedEntries = {};
  for (const actionId of ledger.order) {
    normalizedEntries[actionId] = ledger.entries[actionId];
  }
  ledger.entries = normalizedEntries;
}

export function normalizeActionLedger(owner) {
  if (!owner || typeof owner !== 'object') {
    throw new Error('Action ledger owner is required');
  }

  if (!isObject(owner.optimisticActionLedger)) {
    owner.optimisticActionLedger = { entries: {}, order: [] };
  }

  const ledger = owner.optimisticActionLedger;
  if (!isObject(ledger.entries)) {
    ledger.entries = {};
  }

  const rawOrder = Array.isArray(ledger.order)
    ? ledger.order
    : Object.keys(ledger.entries);
  const seen = new Set();
  ledger.order = rawOrder.filter(actionId => {
    if (!isValidActionId(actionId) || !Object.hasOwn(ledger.entries, actionId) || seen.has(actionId)) {
      return false;
    }
    seen.add(actionId);
    return true;
  });

  pruneLedger(ledger);
  syncEntriesToOrder(ledger);
  return ledger;
}

export function getActionLedgerEntry(owner, actionId) {
  if (!isValidActionId(actionId)) {
    return null;
  }

  const ledger = normalizeActionLedger(owner);
  const entry = ledger.entries[actionId];
  return entry ? cloneValue(entry) : null;
}

export function rememberActionLedgerResult(owner, { actionId, actionType, response } = {}) {
  if (!owner || typeof owner !== 'object' || !isValidActionId(actionId)) {
    return response;
  }

  const ledger = normalizeActionLedger(owner);
  if (!ledger.order.includes(actionId)) {
    ledger.order.push(actionId);
  }
  ledger.entries[actionId] = {
    actionId,
    actionType: actionType || 'unknown',
    response: cloneValue(response),
    recordedAt: Date.now(),
  };

  pruneLedger(ledger);
  return response;
}
