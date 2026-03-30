/**
 * PvP Combat Resolver
 *
 * Orchestrates two-player combat using the existing creature combat engine.
 * Both sides submit move choices; creatures act in level-descending order.
 * No XP is awarded in PvP — pass null for creatureParty.
 */

import {
  tickAllEffects,
  processMoveTurn,
  handleCreatureKO,
  applyPartySkillsAfterPlayerAttacks
} from '../game/services/creature-combat-service.js';

/**
 * Build a turn-ordered list of creatures from both sides.
 * Sorted by level descending; ties broken randomly.
 * KO'd creatures (hp <= 0) are excluded.
 *
 * @param {object[]} sideA - Active creatures for side A
 * @param {object[]} sideB - Active creatures for side B
 * @returns {Array<{creature: object, creatureIndex: number, side: 'sideA'|'sideB', allies: object[], enemies: object[]}>}
 */
export function buildTurnOrder(sideA, sideB) {
  const entries = [];

  for (let i = 0; i < sideA.length; i++) {
    const c = sideA[i];
    if (c && c.hp > 0) {
      entries.push({
        creature: c,
        creatureIndex: i,
        side: 'sideA',
        allies: sideA,
        enemies: sideB
      });
    }
  }

  for (let i = 0; i < sideB.length; i++) {
    const c = sideB[i];
    if (c && c.hp > 0) {
      entries.push({
        creature: c,
        creatureIndex: i,
        side: 'sideB',
        allies: sideB,
        enemies: sideA
      });
    }
  }

  // Sort descending by level; ties broken randomly
  entries.sort((a, b) => {
    const levelDiff = (b.creature.level || 1) - (a.creature.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });

  return entries;
}

/**
 * Resolve one round of PvP combat.
 *
 * @param {object[]} sideA - Active creatures for side A
 * @param {object[]} sideB - Active creatures for side B
 * @param {object[]} movesA - Move choices for side A [{creatureIndex, moveId, targetIndex}]
 * @param {object[]} movesB - Move choices for side B [{creatureIndex, moveId, targetIndex}]
 * @param {object} [options]
 * @param {object[]} [options.partySkillsA] - Party skills for side A
 * @param {object[]} [options.partySkillsB] - Party skills for side B
 * @param {object} [options.itemBuffsA] - Item buffs for side A
 * @param {object} [options.itemBuffsB] - Item buffs for side B
 * @param {object} [options.partyA] - Creature party for side A (for KO swaps)
 * @param {object} [options.partyB] - Creature party for side B (for KO swaps)
 * @param {object} [options.combatA] - Combat state object for side A (party skill counters)
 * @param {object} [options.combatB] - Combat state object for side B (party skill counters)
 * @returns {object} Round result
 */
export function resolveRound(sideA, sideB, movesA, movesB, options = {}) {
  const {
    partySkillsA = null,
    partySkillsB = null,
    itemBuffsA = null,
    itemBuffsB = null,
    partyA = null,
    partyB = null,
    combatA = null,
    combatB = null
  } = options;

  // Step 1: Tick status effects for both sides
  // tickAllEffects(allies, enemies) ticks both arrays and labels them 'ally'/'enemy'.
  // We call it once with sideA as allies, sideB as enemies — this ticks all creatures.
  // Re-label the 'enemy' events as 'sideB' and 'ally' events as 'sideA' for clarity.
  const rawEffectEvents = tickAllEffects(sideA, sideB);
  const effectEvents = rawEffectEvents.map(e => ({
    ...e,
    pvpSide: e.targetSide === 'ally' ? 'sideA' : 'sideB'
  }));

  // Step 2: Process each side's moves
  // Pass null for creatureParty (5th arg) to skip XP awarding
  const resultA = processMoveTurn(sideA, sideB, movesA, itemBuffsA, null);
  const resultB = processMoveTurn(sideB, sideA, movesB, itemBuffsB, null);

  // Step 3: Apply party skills for each side
  if (partySkillsA && combatA) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: resultA.attacks,
      allies: sideA,
      enemies: sideB,
      runPartySkills: partySkillsA,
      combat: combatA
    });
  }
  if (partySkillsB && combatB) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: resultB.attacks,
      allies: sideB,
      enemies: sideA,
      runPartySkills: partySkillsB,
      combat: combatB
    });
  }

  // Step 4: Combine attacks ordered by creature level using buildTurnOrder
  const turnOrder = buildTurnOrder(sideA, sideB);
  const orderedAttacks = [];
  const allAttacks = [
    ...resultA.attacks.map(a => ({ ...a, side: 'sideA' })),
    ...resultB.attacks.map(a => ({ ...a, side: 'sideB' }))
  ];

  // Order attacks by the turn order of their attackers
  for (const entry of turnOrder) {
    const matching = allAttacks.filter(a => {
      if (entry.side === 'sideA') {
        return a.side === 'sideA' && a.attackerIndex === entry.creatureIndex;
      } else {
        return a.side === 'sideB' && a.attackerIndex === entry.creatureIndex;
      }
    });
    orderedAttacks.push(...matching);
  }

  // Add any attacks from creatures that are now KO'd (not in turnOrder)
  const inOrder = new Set(orderedAttacks);
  for (const a of allAttacks) {
    if (!inOrder.has(a)) orderedAttacks.push(a);
  }

  // Step 5: Handle KO swaps for both sides
  const koSwaps = [];
  if (partyA) {
    for (let i = 0; i < sideA.length; i++) {
      if (sideA[i] && sideA[i].hp <= 0) {
        const replacement = handleCreatureKO(partyA, i);
        if (replacement) {
          koSwaps.push({ side: 'sideA', index: i, replacement });
        }
      }
    }
  }
  if (partyB) {
    for (let i = 0; i < sideB.length; i++) {
      if (sideB[i] && sideB[i].hp <= 0) {
        const replacement = handleCreatureKO(partyB, i);
        if (replacement) {
          koSwaps.push({ side: 'sideB', index: i, replacement });
        }
      }
    }
  }

  // Step 6: Determine winner
  const allADead = sideA.every(c => c.hp <= 0);
  const allBDead = sideB.every(c => c.hp <= 0);
  let winner = null;
  if (allADead && allBDead) winner = 'draw';
  else if (allBDead) winner = 'sideA';
  else if (allADead) winner = 'sideB';

  // Step 7: Collect MP regens from both results
  const mpRegens = [
    ...resultA.mpRegens.map(r => ({ ...r, side: 'sideA' })),
    ...resultB.mpRegens.map(r => ({ ...r, side: 'sideB' }))
  ];

  // Step 8: Return result
  return {
    attacks: orderedAttacks,
    effectEvents,
    koSwaps,
    mpRegens,
    winner,
    updatedSideA: sideA,
    updatedSideB: sideB
  };
}
