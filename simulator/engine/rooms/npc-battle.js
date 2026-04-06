/**
 * Handler for NPC battle rooms.
 * Starts encounter, logs NPC dialogue, runs combat.
 */
import { runCombat } from '../combat.js';

export async function handleNpcBattle(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'npcBattle',
    outcome: 'started'
  });

  const startResult = await simCall('POST', '/api/game/start-creature-encounter', null, 'npc battle start');

  if (!startResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
      roomType: 'npcBattle',
      outcome: 'error',
      error: startResult.error
    });
    return { outcome: 'error' };
  }

  const data = startResult.data;

  // Log NPC dialogue lines (greeting, fightStart, defeatLine)
  const npcDialogue = data.npcDialogue ?? data.npc ?? {};
  const dialogueKeys = ['greeting', 'fightStart', 'defeatLine'];
  for (const key of dialogueKeys) {
    const line = npcDialogue[key];
    if (line) {
      logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
        source: 'npc_battle',
        dialogueType: key,
        line: typeof line === 'string' ? line : line.text ?? line.line ?? JSON.stringify(line)
      });
    }
  }

  const combat = await runCombat(simCall, data, context.combatSkill, context, logEvent);

  const outcome = combat.won ? 'cleared' : 'wiped';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'npcBattle',
    outcome,
    rounds: combat.rounds
  });

  return { outcome, combat };
}
