import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from '../../game/services/action-ledger-service.js';

function enrichedState(req) {
  try {
    return req.getEnrichedGameState?.() || null;
  } catch {
    return null;
  }
}

function forgetActionLedgerEntry(owner, actionId) {
  const ledger = owner?.optimisticActionLedger;
  if (!ledger || typeof ledger !== 'object') return;

  if (ledger.entries && typeof ledger.entries === 'object') {
    delete ledger.entries[actionId];
  }
  if (Array.isArray(ledger.order)) {
    ledger.order = ledger.order.filter(id => id !== actionId);
  }
}

export function withOptimisticActionStatus(req, payload = {}, actionType = null) {
  const actionId = req.body?.actionId;
  if (!actionId) return payload;

  return {
    ...payload,
    status: 'accepted',
    actionId,
    ...(actionType ? { actionType } : {}),
    state: enrichedState(req),
  };
}

export function sendOptimisticActionError(req, res, error, statusCode = 409) {
  const actionId = req.body?.actionId;
  const message = error?.message || 'action_failed';

  if (!actionId) {
    return res.status(statusCode).json({ error: message });
  }

  return res.status(statusCode).json({
    status: 'corrected',
    actionId,
    reason: message,
    authoritativeState: enrichedState(req),
  });
}

export function createOptimisticActionRunner({ owner }) {
  return async function runOptimisticAction(req, res, {
    actionType,
    perform,
    successStatusCode = 200,
    errorStatusCode = 409,
    legacyErrorStatusCode = 400,
  }) {
    const actionId = req.body?.actionId;
    const ledgerOwner = typeof owner === 'function' ? owner(req) : owner;
    const ledgerActionType = actionType || 'unknown';
    let recordedAction = false;

    if (actionId && ledgerOwner) {
      const existing = getActionLedgerEntry(ledgerOwner, actionId);
      if (existing?.response) {
        if (existing.actionType !== ledgerActionType) {
          return sendOptimisticActionError(
            req,
            res,
            new Error('Action ID already used for another action'),
            errorStatusCode
          );
        }

        // Replay action-specific fields, but refresh global state when the current state is available.
        return res.status(successStatusCode).json({
          ...existing.response,
          state: enrichedState(req) || existing.response.state || null,
        });
      }
    }

    try {
      const payload = await perform();
      const response = withOptimisticActionStatus(req, payload, ledgerActionType);

      if (actionId && ledgerOwner) {
        rememberActionLedgerResult(ledgerOwner, {
          actionId,
          actionType: ledgerActionType,
          response,
        });
        recordedAction = true;
      }

      await req.saveGame?.();
      return res.status(successStatusCode).json(response);
    } catch (error) {
      if (recordedAction) {
        forgetActionLedgerEntry(ledgerOwner, actionId);
      }
      return sendOptimisticActionError(
        req,
        res,
        error,
        actionId ? errorStatusCode : legacyErrorStatusCode
      );
    }
  };
}
