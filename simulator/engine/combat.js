/**
 * Move-by-move combat loop for the simulator.
 * Drives the game server's creature-combat-cycle endpoint.
 */
import { pickMove, pickTarget } from './decisions.js';
import {
  collectAttackExposures,
  collectTokenExposures,
  syncExposureBatch
} from './exposure-sync.js';

const MAX_ROUNDS = 100;

/**
 * Run a full combat encounter through the game server API.
 *
 * @param {Function} simCall - Resilient HTTP caller
 * @param {Object} encounterData - Response from start-creature-encounter
 * @param {number} combatSkill - 0-1 probability of optimal move selection
 * @param {Object} context - { day, run, roomIndex }
 * @param {Function} logEvent - (day, run, room, eventType, data)
 * @returns {{ rounds: number, won: boolean, wiped: boolean, barks: Array, dialogueSeen: Array }}
 */
export async function runCombat(simCall, encounterData, combatSkill, context, logEvent) {
  // Extract allies/enemies — handle different response shapes
  let allies = encounterData.encounter?.allies ?? encounterData.allies ?? [];
  let enemies = encounterData.encounter?.enemies ?? encounterData.enemies ?? [];

  const barks = [];
  const dialogueSeen = [];

  let rounds = 0;
  let won = false;
  let wiped = false;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // Find all alive allies and enemies
    const aliveAllies = [];
    for (let i = 0; i < allies.length; i++) {
      if (allies[i] && allies[i].hp > 0) aliveAllies.push(i);
    }

    let enemyIdx = -1;
    for (let i = 0; i < enemies.length; i++) {
      if (enemies[i] && enemies[i].hp > 0) { enemyIdx = i; break; }
    }

    if (aliveAllies.length === 0) { wiped = true; break; }
    if (enemyIdx === -1) { won = true; break; }

    // Build moveChoices for ALL alive active creatures
    const moveChoices = [];
    for (const allyIdx of aliveAllies) {
      const moveChoice = pickMove(allies, allyIdx, enemies, enemyIdx, combatSkill);
      let { moveId } = moveChoice;

      if (moveId == null && allies[allyIdx]?.moves?.length > 0) {
        moveId = allies[allyIdx].moves[0].id ?? allies[allyIdx].moves[0].moveId;
      }

      moveChoices.push({
        creatureIndex: allyIdx,
        moveId,
        targetIndex: pickTarget(enemies)
      });
    }

    // Execute combat cycle
    const cycleResult = await simCall('POST', '/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices
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
    const exposureWords = [];

    // Log the round
    logEvent(context.day, context.run, context.roomIndex, 'combat_round', {
      round: rounds,
      moveChoices: moveChoices.map(m => m.moveId),
      attacks: cycle.playerAttacks ?? cycle.attacks ?? cycle.results ?? []
    });

    collectAttackExposures(exposureWords, cycle.playerAttacks);
    collectAttackExposures(exposureWords, cycle.enemyAttacks);
    collectAttackExposures(exposureWords, cycle.npcSkillAttacks);

    // Log barks as dialogue and mirror the same tokens the client bubble would render.
    if (cycle.barks) {
      for (const bark of cycle.barks) {
        barks.push(bark);
        collectTokenExposures(exposureWords, bark.tokens);
        if (bark.text) {
          dialogueSeen.push(bark);
          logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
            source: 'combat_bark',
            trigger: bark.trigger,
            line: bark.text
          });
        }
      }
    }

    // Update allies/enemies from response
    if (cycle.allies) allies = cycle.allies;
    if (cycle.enemies) enemies = cycle.enemies;

    // Handle befriend quiz — the game pauses combat to offer befriending
    if (cycle.befriendQuizTriggered && cycle.befriendQuiz) {
      const quiz = cycle.befriendQuiz;

      // Log befriend prompts as dialogue and mirror the same token payload the
      // browser sends when these lines render.
      for (const key of ['waitPrompt', 'namePrompt', 'successPrompt', 'wrongPrompt']) {
        const prompt = quiz[key];
        if (prompt) {
          collectTokenExposures(exposureWords, prompt.tokens, prompt.overrides || {});
          const line = prompt.text || prompt.tokens?.map(t => t.surface).join('') || '';
          dialogueSeen.push({ type: key, line });
          logEvent(context.day, context.run, context.roomIndex, 'dialogue_seen', {
            source: 'befriend_prompt',
            promptType: key,
            line
          });
        }
      }

      await syncExposureBatch(simCall, exposureWords, `combat round ${rounds} exposure`);

      // Pick the correct answer (matching the creature being befriended)
      const correctOption = quiz.options?.find(o => o.id === quiz.creatureId);
      const answerId = correctOption?.id ?? quiz.options?.[0]?.id ?? quiz.creatureId;

      const quizResult = await simCall('POST', '/api/game/befriend-quiz-answer', {
        action: 'talk',
        answerId
      }, `befriend quiz round ${rounds}`);

      if (quizResult.ok) {
        logEvent(context.day, context.run, context.roomIndex, 'creature_befriended', {
          creatureName: quiz.creatureName,
          creatureNameEn: quiz.creatureNameEn,
          creatureId: quiz.creatureId
        });

        // Update state from quiz result
        if (quizResult.data?.allies) allies = quizResult.data.allies;
        if (quizResult.data?.enemies) enemies = quizResult.data.enemies;
        if (quizResult.data?.combatEnded) {
          const allEnemiesDead = enemies.every(e => !e || e.hp <= 0);
          won = allEnemiesDead || quizResult.data.combatResult === 'win';
          wiped = !won;
          break;
        }
      }
      // Continue combat whether quiz succeeded or not
      continue;
    }

    await syncExposureBatch(simCall, exposureWords, `combat round ${rounds} exposure`);

    // Check combat end
    if (cycle.combatEnded) {
      // Determine outcome: check if all enemies are dead
      const allEnemiesDead = enemies.every(e => !e || e.hp <= 0);
      won = allEnemiesDead;
      wiped = !allEnemiesDead;
      break;
    }

    // Check if any active ally was KO'd — try to swap from reserves
    for (const allyIdx of aliveAllies) {
      if (allies[allyIdx] && allies[allyIdx].hp <= 0) {
        const stateResult = await simCall('GET', '/api/game/state', null, `state for swap round ${rounds}`);
        const reserves = stateResult.data?.run?.creatureParty?.reserves || [];
        const reserveIdx = reserves.findIndex(r => r && r.hp > 0);

        if (reserveIdx === -1) break; // No reserves, will check aliveAllies next iteration

        const swapResult = await simCall('POST', '/api/game/swap-creature', {
          activeIndex: allyIdx,
          reserveIndex: reserveIdx
        }, `swap after KO round ${rounds}`);

        if (swapResult.ok) {
          if (swapResult.data?.allies) allies = swapResult.data.allies;
          else if (swapResult.data?.state?.run?.creatureParty?.active) {
            allies = swapResult.data.state.run.creatureParty.active;
          }
        }
      }
    }
  }

  // Safety: if we hit MAX_ROUNDS without resolution, treat as wiped
  if (!won && !wiped) {
    wiped = true;
  }

  return { rounds, won, wiped, barks, dialogueSeen };
}
