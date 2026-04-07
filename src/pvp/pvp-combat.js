/**
 * PvP Combat Resolver
 *
 * Orchestrates two-player combat using the existing creature combat engine.
 * Both sides submit moves; creatures act in level-descending initiative order
 * (ties random). Damage and HP updates happen in that same order so playback
 * matches mechanical resolution.
 */

import {
  tickAllEffects,
  handleCreatureKO,
  applyPartySkillsAfterPlayerAttacks,
  applyRoundStartSkills,
  applyAfterEnemyAttacks,
  executeSlotMoveTurn,
  computeInlineCounter,
  checkAfflictionBurstCounter
} from '../game/services/creature-combat-service.js';
import { hasHaste, consumeHaste, isIncapacitated } from '../game/combat/effects.js';
import { toActivePartySkillIdSet } from '../game/combat/party-skill-engine.js';

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

  entries.sort((a, b) => {
    const levelDiff = (b.creature.level || 1) - (a.creature.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });

  return entries;
}

function groupMovesBySlot(moves) {
  const m = new Map();
  for (const ch of moves || []) {
    if (typeof ch.creatureIndex !== 'number') continue;
    if (!m.has(ch.creatureIndex)) m.set(ch.creatureIndex, []);
    m.get(ch.creatureIndex).push(ch);
  }
  return m;
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

  const rawEffectEvents = tickAllEffects(sideA, sideB);
  const effectEvents = rawEffectEvents.map(e => ({
    ...e,
    pvpSide: e.targetSide === 'ally' ? 'sideA' : 'sideB'
  }));

  // Party skills: round-start (Erosion, Momentum, Overflow Vitality)
  const roundStartEventsA = (partySkillsA && combatA)
    ? applyRoundStartSkills({ allies: sideA, enemies: sideB, runPartySkills: partySkillsA, combat: combatA })
    : [];
  const roundStartEventsB = (partySkillsB && combatB)
    ? applyRoundStartSkills({ allies: sideB, enemies: sideA, runPartySkills: partySkillsB, combat: combatB })
    : [];
  const roundStartEvents = [
    ...roundStartEventsA.map(e => ({ ...e, pvpSide: e.targetSide === 'ally' ? 'sideA' : 'sideB' })),
    ...roundStartEventsB.map(e => ({ ...e, pvpSide: e.targetSide === 'ally' ? 'sideB' : 'sideA' }))
  ];

  const mapA = groupMovesBySlot(movesA);
  const mapB = groupMovesBySlot(movesB);

  const hastedA = new Set();
  for (let i = 0; i < sideA.length; i++) {
    const c = sideA[i];
    if (c && c.hp > 0 && hasHaste(c)) {
      hastedA.add(i);
      consumeHaste(c);
    }
  }
  const hastedB = new Set();
  for (let i = 0; i < sideB.length; i++) {
    const c = sideB[i];
    if (c && c.hp > 0 && hasHaste(c)) {
      hastedB.add(i);
      consumeHaste(c);
    }
  }

  const initiative = [];
  for (const idx of mapA.keys()) {
    const c = sideA[idx];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ side: 'sideA', index: idx, level: c.level || 1 });
    }
  }
  for (const idx of mapB.keys()) {
    const c = sideB[idx];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ side: 'sideB', index: idx, level: c.level || 1 });
    }
  }

  initiative.sort((a, b) => {
    const d = (b.level || 1) - (a.level || 1);
    if (d !== 0) return d;
    return Math.random() - 0.5;
  });

  const resultA = { attacks: [] };
  const resultB = { attacks: [] };
  const orderedAttacks = [];
  const defeatedDummy = new Set();
  let playbackCounter = 0;
  const inlineCountersA = [];
  const inlineCountersB = [];

  for (const slot of initiative) {
    if (slot.side === 'sideA') {
      const choices = mapA.get(slot.index);
      const { attacks: slotAttacks } = executeSlotMoveTurn(
        sideA,
        sideB,
        slot.index,
        choices,
        itemBuffsA,
        null,
        null,
        hastedA,
        defeatedDummy
      );
      for (const atk of slotAttacks) {
        atk.playbackIndex = playbackCounter++;
        atk.side = 'sideA';
        orderedAttacks.push(atk);
        resultA.attacks.push(atk);

        // Side B counters side A's attacks
        if (partySkillsB && combatB) {
          const counter = computeInlineCounter(atk, sideB, sideA, partySkillsB, combatB);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = 'sideB';
            orderedAttacks.push(counter);
            inlineCountersB.push(counter);
          }
        }
      }
    } else {
      const choices = mapB.get(slot.index);
      const { attacks: slotAttacks } = executeSlotMoveTurn(
        sideB,
        sideA,
        slot.index,
        choices,
        itemBuffsB,
        null,
        null,
        hastedB,
        defeatedDummy
      );
      for (const atk of slotAttacks) {
        atk.playbackIndex = playbackCounter++;
        atk.side = 'sideB';
        orderedAttacks.push(atk);
        resultB.attacks.push(atk);

        // Side A counters side B's attacks
        if (partySkillsA && combatA) {
          const counter = computeInlineCounter(atk, sideA, sideB, partySkillsA, combatA);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = 'sideA';
            orderedAttacks.push(counter);
            inlineCountersA.push(counter);
          }
        }
      }
    }
  }

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

  // Affliction Burst for inline counters
  if (partySkillsA && combatA && inlineCountersA.length > 0) {
    const activeA = toActivePartySkillIdSet(partySkillsA);
    if (activeA.has('afflictionBurst')) {
      checkAfflictionBurstCounter(sideB, combatA, inlineCountersA);
    }
  }
  if (partySkillsB && combatB && inlineCountersB.length > 0) {
    const activeB = toActivePartySkillIdSet(partySkillsB);
    if (activeB.has('afflictionBurst')) {
      checkAfflictionBurstCounter(sideA, combatB, inlineCountersB);
    }
  }

  // Backward compat: empty counterAttacks array
  const counterAttacks = [];

  const mpRegens = [];
  for (const c of sideA) {
    if (!c || c.hp <= 0) continue;
    const regen = Math.floor((c.maxMp || 0) * 0.05);
    c.mp = Math.min(c.maxMp || 0, (c.mp || 0) + regen);
    mpRegens.push({ creatureId: c.id, mp: c.mp, maxMp: c.maxMp, regen, side: 'sideA' });
  }
  for (const c of sideB) {
    if (!c || c.hp <= 0) continue;
    const regen = Math.floor((c.maxMp || 0) * 0.05);
    c.mp = Math.min(c.maxMp || 0, (c.mp || 0) + regen);
    mpRegens.push({ creatureId: c.id, mp: c.mp, maxMp: c.maxMp, regen, side: 'sideB' });
  }

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

  const allADead = sideA.every(c => c.hp <= 0);
  const allBDead = sideB.every(c => c.hp <= 0);
  let winner = null;
  if (allADead && allBDead) winner = 'draw';
  else if (allBDead) winner = 'sideA';
  else if (allADead) winner = 'sideB';

  return {
    attacks: orderedAttacks,
    effectEvents,
    roundStartEvents,
    counterAttacks,
    koSwaps,
    mpRegens,
    winner,
    sideA,
    sideB
  };
}
