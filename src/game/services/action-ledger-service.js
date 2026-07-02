import { isActionId } from '../../shared/action-protocol.js';

const ACTION_LEDGER_LIMIT = 100;

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createEntriesMap() {
  return Object.create(null);
}

const STRIPPED_RESPONSE_FIELDS = ['state', 'authoritativeState'];

function slimResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const slim = { ...response };
  for (const field of STRIPPED_RESPONSE_FIELDS) delete slim[field];
  return slim;
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
  const normalizedEntries = createEntriesMap();
  for (const actionId of ledger.order) {
    normalizedEntries[actionId] = ledger.entries[actionId];
  }
  ledger.entries = normalizedEntries;
}

export function normalizeActionLedger(owner) {
  if (!owner || typeof owner !== 'object') {
    throw new Error('Action ledger owner is required');
  }

  if (!isObject(owner.actionLedger) && isObject(owner.optimisticActionLedger)) {
    owner.actionLedger = owner.optimisticActionLedger;
    delete owner.optimisticActionLedger;
  }

  if (!isObject(owner.actionLedger)) {
    owner.actionLedger = { entries: createEntriesMap(), order: [] };
  }

  const ledger = owner.actionLedger;
  if (!isObject(ledger.entries)) {
    ledger.entries = createEntriesMap();
  }

  const rawOrder = Array.isArray(ledger.order)
    ? ledger.order
    : Object.keys(ledger.entries);
  const seen = new Set();
  ledger.order = rawOrder.filter(actionId => {
    if (!isActionId(actionId) || !Object.hasOwn(ledger.entries, actionId) || seen.has(actionId)) {
      return false;
    }
    seen.add(actionId);
    return true;
  });

  pruneLedger(ledger);
  syncEntriesToOrder(ledger);
  for (const actionId of ledger.order) {
    const entry = ledger.entries[actionId];
    if (entry && entry.response) entry.response = slimResponse(entry.response);
  }
  return ledger;
}

export function getActionLedgerEntry(owner, actionId) {
  if (!isActionId(actionId)) {
    return null;
  }

  const ledger = normalizeActionLedger(owner);
  const entry = ledger.entries[actionId];
  return entry ? cloneValue(entry) : null;
}

export function rememberActionLedgerResult(owner, { actionId, actionType, response } = {}) {
  if (!owner || typeof owner !== 'object' || !isActionId(actionId)) {
    return response;
  }

  const ledger = normalizeActionLedger(owner);
  if (!ledger.order.includes(actionId)) {
    ledger.order.push(actionId);
  }
  ledger.entries[actionId] = {
    actionId,
    actionType: actionType || 'unknown',
    response: cloneValue(slimResponse(response)),
    recordedAt: Date.now(),
  };

  pruneLedger(ledger);
  return response;
}
