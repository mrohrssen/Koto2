/**
 * Handler for boss encounter rooms.
 */
import { runCombat } from '../combat.js';

export async function handleBoss(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'boss',
    outcome: 'started'
  });

  const startResult = await simCall('POST', '/api/game/start-creature-encounter', null, 'boss start');

  if (!startResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
      roomType: 'boss',
      outcome: 'error',
      error: startResult.error
    });
    return { outcome: 'error' };
  }

  const combat = await runCombat(simCall, startResult.data, context.combatSkill, context, logEvent);

  const outcome = combat.won ? 'cleared' : 'wiped';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'boss',
    outcome,
    rounds: combat.rounds
  });

  return { outcome, combat };
}
