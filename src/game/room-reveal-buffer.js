export const DEFAULT_ROOM_REVEAL_AHEAD = 1;
const MAX_ROOM_REVEAL_AHEAD = 3;

function cloneValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function clampRevealAhead(value) {
  if (!Number.isInteger(value)) return DEFAULT_ROOM_REVEAL_AHEAD;
  return Math.max(0, Math.min(MAX_ROOM_REVEAL_AHEAD, value));
}

export function ensureRoomActionSeq(run) {
  if (!run || typeof run !== 'object') return 0;
  if (!Number.isSafeInteger(run.roomActionSeq) || run.roomActionSeq < 0) {
    run.roomActionSeq = 0;
  }
  return run.roomActionSeq;
}

export function getRoomRevealAhead(run) {
  return clampRevealAhead(run?.roomRevealBufferSize);
}

export function getRoomFromRevealBuffer(run, roomIndex = run?.currentRoom) {
  if (!Number.isInteger(roomIndex) || !Array.isArray(run?.revealedRooms)) {
    return null;
  }

  const entry = run.revealedRooms.find(candidate => candidate?.index === roomIndex);
  return entry?.room || null;
}

export function buildClientRoomReveal(run, { ahead = getRoomRevealAhead(run) } = {}) {
  if (!run || typeof run !== 'object') {
    return {
      roomActionSeq: 0,
      revealBufferSize: DEFAULT_ROOM_REVEAL_AHEAD,
      revealedRooms: [],
    };
  }

  const roomActionSeq = ensureRoomActionSeq(run);
  const revealBufferSize = clampRevealAhead(ahead);
  const currentRoom = Number.isInteger(run.currentRoom) ? run.currentRoom : 0;
  const canonicalRooms = Array.isArray(run.rooms) ? run.rooms : [];
  const lastIndex = Math.min(canonicalRooms.length - 1, currentRoom + revealBufferSize);
  const revealedRooms = [];

  for (let index = currentRoom; index <= lastIndex; index += 1) {
    const room = canonicalRooms[index];
    if (!room) continue;
    revealedRooms.push({
      index,
      room: cloneValue(room),
    });
  }

  return {
    roomActionSeq,
    revealBufferSize,
    revealedRooms,
  };
}
