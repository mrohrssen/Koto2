/**
 * Handler for unrecognized room types.
 * Logs the unknown type and moves on.
 */
export async function handleUnknownRoom(simCall, room, context, logEvent) {
  const roomType = room.type || room.roomType || 'undefined';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType,
    outcome: 'unknown_type'
  });
  return { outcome: 'unknown_type' };
}
