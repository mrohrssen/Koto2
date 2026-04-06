/**
 * Move-by-move combat loop for the simulator.
 * Drives the game server's creature-combat-cycle endpoint.
 */
import { pickMove, pickTarget, pickSwap } from './decisions.js';

const MAX_ROUNDS = 100;

/**
 * Run a full combat encounter through the game server API.
 *
 * @param {Function} simCall - Resilient HTTP caller
 * @param {Object} encounterData - Response from start-creature-encounter
 * @param {number} combatSkill - 0-1 probability of optimal move selection
 * @param {Object} context - { day, run, roomIndex }
 * @param {Function} logEvent - (day, run, room, eventType, data)
 * @returns {{ rounds: number, won: boolean, wiped: boolean, barks: Array, wordsExposed: Array, dialogueSeen: Array }}
 */
export async function runCombat(simCall, encounterData, combatSkill, context, logEvent) {
  // Extract allies/enemies — handle different response shapes
  let allies = encounterData.encounter?.allies ?? encounterData.allies ?? [];
  let enemies = encounterData.encounter?.enemies ?? encounterData.enemies ?? [];

  const barks = [];
  const wordsExposed = [];
  const dialogueSeen = [];

  // Log any NPC dialogue that came with the encounter
  if (encounterData.npcDialogue) {
    const dialogue = encounterData.npcDialogue;
    const lines = Array.isArray(dialogue) ? dialogue : [dialogue];
    for (const line of lines) {
      if (line) {
        dialogueSeen.push(line);
        logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
          source: 'npc_combat',
          line: typeof line === 'string' ? line : line.text ?? line.line ?? JSON.stringify(line)
        });
      }
    }
  }

  let rounds = 0;
  let won = false;
  let wiped = false;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Find first alive ally
    let allyIdx = -1;
    for (let i = 0; i < allies.length; i++) {
      if (allies[i] && allies[i].hp > 0) { allyIdx = i; break; }
    }

    // Find first alive enemy
    let enemyIdx = -1;
    for (let i = 0; i < enemies.length; i++) {
      if (enemies[i] && enemies[i].hp > 0) { enemyIdx = i; break; }
    }

    if (allyIdx === -1) { wiped = true; break; }
    if (enemyIdx === -1) { won = true; break; }

    // Pick a move
    const moveChoice = pickMove(allies, allyIdx, enemies, enemyIdx, combatSkill);
    let { moveId } = moveChoice;

    // Fallback: if moveId is null but creature has moves, use the first one
    if (moveId == null && allies[allyIdx]?.moves?.length > 0) {
      moveId = allies[allyIdx].moves[0].id ?? allies[allyIdx].moves[0].moveId;
    }

    // Execute combat cycle
    const cycleResult = await simCall('POST', '/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{
        creatureIndex: allyIdx,
        moveId,
        targetIndex: enemyIdx
      }]
    }, `combat round ${rounds}`);

    if (!cycleResult.ok) {
      wiped = true;
      logEvent(context.day, context.run, context.roomIndex, 'combat_round', {
        round: rounds,
        error: cycleResult.error ?? 'api_failure'
      });
      break;
    }

    const cycle = cycleResult.data;

    // Log the round
    logEvent(context.day, context.run, context.roomIndex, 'combat_round', {
      round: rounds,
      moveId,
      attacks: cycle.attacks ?? cycle.results ?? []
    });

    // Collect barks
    if (cycle.barks) {
      for (const bark of cycle.barks) {
        barks.push(bark);
        if (bark.word) wordsExposed.push(bark.word);
      }
    }

    // Update allies/enemies from response
    if (cycle.allies) allies = cycle.allies;
    if (cycle.enemies) enemies = cycle.enemies;

    // Check combat end
    if (cycle.combatEnded) {
      // Determine outcome: check if all enemies are dead
      const allEnemiesDead = enemies.every(e => !e || e.hp <= 0);
      won = allEnemiesDead;
      wiped = !allEnemiesDead;
      break;
    }

    // Check if active ally was KO'd — try to swap
    if (allies[allyIdx] && allies[allyIdx].hp <= 0) {
      const swapIdx = pickSwap(allies);
      if (swapIdx === null) {
        wiped = true;
        break;
      }
      const swapResult = await simCall('POST', '/api/game/swap-creature', {
        activeIndex: allyIdx,
        reserveIndex: swapIdx
      }, `swap after KO round ${rounds}`);

      if (!swapResult.ok) {
        wiped = true;
        break;
      }

      // Update allies from swap response if provided
      if (swapResult.data?.allies) allies = swapResult.data.allies;
    }
  }

  // Safety: if we hit MAX_ROUNDS without resolution, treat as wiped
  if (!won && !wiped) {
    wiped = true;
  }

  return { rounds, won, wiped, barks, wordsExposed, dialogueSeen };
}
