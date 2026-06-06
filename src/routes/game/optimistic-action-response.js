import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from '../../game/services/action-ledger-service.js';
import { isActionId } from '../../shared/action-protocol.js';

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function snapshotGameManager(gameManager) {
  if (!gameManager || typeof gameManager !== 'object') return null;
  return {
    player: cloneValue(gameManager.player),
    run: cloneValue(gameManager.run),
    combat: cloneValue(gameManager.combat),
    meta: cloneValue(gameManager.meta),
  };
}

export function restoreGameManager(gameManager, snapshot) {
  if (!gameManager || !snapshot) return;
  gameManager.player = cloneValue(snapshot.player);
  gameManager.run = cloneValue(snapshot.run);
  gameManager.combat = cloneValue(snapshot.combat);
  gameManager.meta = cloneValue(snapshot.meta);
}

export function getOptimisticActionLedgerOwner(req) {
  const gm = req?.gameManager;
  if (!gm || typeof gm !== 'object') return null;
  if (gm.meta && typeof gm.meta === 'object') return gm.meta;
  if (typeof gm.getMeta === 'function') {
    const meta = gm.getMeta();
    if (meta && typeof meta === 'object') {
      gm.meta = meta;
      return meta;
    }
  }
  return null;
}

function enrichedState(req) {
  try {
    return req.getEnrichedGameState?.() || null;
  } catch {
    return null;
  }
}

function forgetActionLedgerEntry(owner, actionId) {
  const ledger = owner?.actionLedger || owner?.optimisticActionLedger;
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
  if (!isActionId(actionId)) return payload;

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

  if (!isActionId(actionId)) {
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
    const hasValidActionId = isActionId(actionId);
    let recordedAction = false;

    if (hasValidActionId && ledgerOwner) {
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

    const gameManagerSnapshot = snapshotGameManager(req.gameManager);

    try {
      const payload = await perform();
      const response = withOptimisticActionStatus(req, payload, ledgerActionType);

      if (hasValidActionId && ledgerOwner) {
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
      restoreGameManager(req.gameManager, gameManagerSnapshot);
      return sendOptimisticActionError(
        req,
        res,
        error,
        hasValidActionId ? errorStatusCode : legacyErrorStatusCode
      );
    }
  };
}
