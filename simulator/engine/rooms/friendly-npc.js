/**
 * Handler for friendly NPC rooms.
 * Logs any NPC dialogue found in room data.
 */
export async function handleFriendlyNpc(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'friendlyNpc',
    outcome: 'started'
  });

  // Check various places dialogue might live
  const npc = room.npc ?? room.encounter?.npc ?? null;
  if (npc) {
    const dialogueLines = npc.dialogue ?? npc.lines ?? [];
    const lines = Array.isArray(dialogueLines) ? dialogueLines : [dialogueLines];
    for (const line of lines) {
      if (line) {
        logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
          source: 'friendly_npc',
          npcName: npc.name ?? 'unknown',
          line: typeof line === 'string' ? line : line.text ?? line.line ?? JSON.stringify(line)
        });
      }
    }
  }

  return { outcome: 'cleared' };
}
