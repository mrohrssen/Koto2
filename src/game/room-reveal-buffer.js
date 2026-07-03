const DEFAULT_ROOM_REVEAL_AHEAD = 1;
const MAX_ROOM_REVEAL_AHEAD = 3;

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
