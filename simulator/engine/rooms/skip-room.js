/**
 * Handler for room types the simulator intentionally skips.
 * (shrine, quiz, dealer, skillMaster, and as fallback for null handlers)
 */
export async function handleSkipRoom(simCall, room, context, logEvent) {
  const roomType = room.type || room.roomType || 'skipped';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType,
    outcome: 'skipped'
  });
  return { outcome: 'skipped' };
}
