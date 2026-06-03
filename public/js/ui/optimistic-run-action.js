import { createActionId } from '../../../src/shared/action-protocol.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createPendingRunAction({
  state,
  actionType,
  applyLocal,
  actionId = createActionId('run'),
}) {
  const draft = clone(state);
  applyLocal(draft);
  return {
    actionId,
    actionType,
    state: draft,
    originalState: clone(state),
  };
}

export function isMatchingRunActionResponse(pending, response) {
  if (!pending || !response?.actionId) return false;
  return response.actionId === pending.actionId;
}

export function confirmPendingRunAction(pending, response) {
  if (!isMatchingRunActionResponse(pending, response)) return pending.state;
  return response?.state || pending.state;
}

export function correctPendingRunAction(pending, response) {
  if (!isMatchingRunActionResponse(pending, response)) return pending.originalState;
  return response?.authoritativeState || pending.originalState;
}
