/**
 * Handler for encounter (wild creature) rooms.
 */
import { runCombat } from '../combat.js';

export async function handleEncounter(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'encounter',
    outcome: 'started'
  });

  const startResult = await simCall('POST', '/api/game/start-creature-encounter', null, 'encounter start');

  if (!startResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
      roomType: 'encounter',
      outcome: 'error',
      error: startResult.error
    });
    return { outcome: 'error' };
  }

  const combat = await runCombat(simCall, startResult.data, context.combatSkill, context, logEvent);

  const outcome = combat.won ? 'cleared' : 'wiped';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'encounter',
    outcome,
    rounds: combat.rounds
  });

  return { outcome, combat };
}
