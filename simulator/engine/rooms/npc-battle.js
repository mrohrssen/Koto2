/**
 * Handler for NPC battle rooms.
 * Starts encounter, logs NPC dialogue, runs combat.
 */
import { runCombat } from '../combat.js';
import { collectTokenExposures, syncExposureBatch } from '../exposure-sync.js';

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
  const openingExposureWords = [];

  // Mirror the bootstrap fightStart line the client renders during room transition.
  const npcDialogue = data.npcDialogue ?? data.npc ?? {};
  const fightStart = npcDialogue.fightStart;
  if (fightStart) {
    collectTokenExposures(openingExposureWords, fightStart.tokens, fightStart.overrides || {});
    logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
      source: 'npc_battle',
      dialogueType: 'fightStart',
      line: typeof fightStart === 'string' ? fightStart : fightStart.text ?? fightStart.line ?? JSON.stringify(fightStart)
    });
  }
  await syncExposureBatch(simCall, openingExposureWords, 'npc battle intro exposure');

  const combat = await runCombat(simCall, data, context.combatSkill, context, logEvent);

  if (combat.won) {
    const dialogueStart = await simCall('POST', '/api/game/npc-dialogue-start', null, 'npc defeat line');
    const defeatLine = dialogueStart.data?.mode === 'defeat_line'
      ? dialogueStart.data?.line
      : null;

    if (defeatLine) {
      logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
        source: 'npc_battle',
        dialogueType: 'defeatLine',
        line: defeatLine.text ?? defeatLine.line ?? JSON.stringify(defeatLine)
      });
      const defeatExposureWords = [];
      collectTokenExposures(defeatExposureWords, defeatLine.tokens, defeatLine.overrides || {});
      await syncExposureBatch(simCall, defeatExposureWords, 'npc defeat line exposure');
    }
  }

  const outcome = combat.won ? 'cleared' : 'wiped';
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'npcBattle',
    outcome,
    rounds: combat.rounds
  });

  return { outcome, combat };
}
