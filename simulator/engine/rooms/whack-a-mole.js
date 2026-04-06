/**
 * Handler for whack-a-mole minigame rooms.
 * Simulates a score based on combat skill and submits it.
 */
export async function handleWhackAMole(simCall, room, context, logEvent) {
  const score = Math.round(5 + context.combatSkill * 15);

  // Submit score (may fail — that's fine)
  await simCall('POST', '/api/game/whack-a-mole-complete', { score }, 'whack-a-mole complete');

  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'whackAMole',
    outcome: 'cleared',
    score
  });

  return { outcome: 'cleared' };
}
