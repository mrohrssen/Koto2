import { derivePhase } from '../../../src/game/phase-machine.js';

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function getBufferedRoom(state, roomIndex) {
  if (!state || !Number.isInteger(roomIndex)) return null;
  if (state.run?.currentRoom === roomIndex && state.room) {
    return state.room;
  }

  const entry = state.run?.revealedRooms?.find(candidate => candidate?.index === roomIndex);
  return entry?.room || null;
}

export function getCurrentRoom(state) {
  const currentRoom = state?.run?.currentRoom;
  return getBufferedRoom(state, currentRoom);
}

export function getNextRoom(state) {
  const currentRoom = state?.run?.currentRoom;
  if (!Number.isInteger(currentRoom)) return null;
  return getBufferedRoom(state, currentRoom + 1);
}

export function advanceStateToBufferedNextRoom(draft) {
  const currentRoom = draft?.run?.currentRoom;
  if (!Number.isInteger(currentRoom)) return false;

  const nextRoom = getBufferedRoom(draft, currentRoom + 1);
  if (!nextRoom) return false;

  draft.run.currentRoom = currentRoom + 1;
  draft.room = cloneValue(nextRoom);
  draft.phase = derivePhase(draft);
  return true;
}

export function applyOptimisticRoomAdvance(state) {
  const draft = cloneValue(state);
  return advanceStateToBufferedNextRoom(draft) ? draft : null;
}
