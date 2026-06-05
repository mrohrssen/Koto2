import {
  tickAllEffects,
  applyPartySkillsAfterPlayerAttacks,
  applyRoundStartSkills,
  applyAfterEnemyAttacks,
  executeSlotMoveTurn,
  resolveSingleActorAction,
  computeInlineCounter,
  applyEnemySelfSabotage,
  checkAfflictionBurstCounter
} from '../game/services/creature-combat-service.js';
import { processKOSwaps, checkAllDefeated } from '../game/combat/resolution.js';
import { getEffectiveDex, isIncapacitated } from '../game/combat/effects.js';
import { toActivePartySkillIdSet } from '../game/combat/party-skill-engine.js';
import {
  compareActionActors,
  createPvpOpeningCursors,
  getNextActionCursor
} from '../game/combat/action-cursor.js';

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
    const dexDiff = getEffectiveDex(b.creature) - getEffectiveDex(a.creature);
    if (dexDiff !== 0) return dexDiff;
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

function winnerForSides(sideA, sideB) {
  const aDown = checkAllDefeated(sideA);
  const bDown = checkAllDefeated(sideB);
  if (aDown && bDown) return 'draw';
  if (aDown) return 'sideB';
  if (bDown) return 'sideA';
  return null;
}

function remapSegmentForPvp(segment, side) {
  const remapAttack = atk => ({ ...atk, side: atk.side || side });
  return {
    ...segment,
    actor: { ...segment.actor, side },
    attacks: (segment.attacks || []).map(remapAttack),
    counterAttacks: (segment.counterAttacks || []).map(remapAttack),
    effectEvents: (segment.effectEvents || []).map(event => ({
      ...event,
      targetSide: side
    })),
    mpRegens: (segment.mpRegens || []).map(regen => ({
      ...regen,
      side
    }))
  };
}

function flattenSegments(segments) {
  return {
    attacks: segments.flatMap(segment => [
      ...(segment.attacks || []),
      ...(segment.counterAttacks || [])
    ]).sort((a, b) => (a.playbackIndex ?? 0) - (b.playbackIndex ?? 0)),
    effectEvents: segments.flatMap(segment => segment.effectEvents || []),
    mpRegens: segments.flatMap(segment => segment.mpRegens || []),
    xpEvents: segments.flatMap(segment => segment.xpEvents || [])
  };
}

export function resolvePvpCursorAction({
  sideA,
  sideB,
  cursor,
  action,
  partyA = null,
  partyB = null,
  partySkillsA = null,
  partySkillsB = null,
  combatA = null,
  combatB = null,
  playbackStart = 0
}) {
  if (!cursor) throw new Error('No active PvP cursor');
  if (!action || action.creatureIndex !== cursor.index) {
    throw new Error('Submitted action does not match active PvP cursor');
  }

  const isA = cursor.side === 'sideA';
  const attackerSide = isA ? sideA : sideB;
  const defenderSide = isA ? sideB : sideA;
  const defenderPartySkills = isA ? partySkillsB : partySkillsA;
  const defenderCombat = isA ? combatB : combatA;
  let selfSabotageApplied = false;
  const result = resolveSingleActorAction({
    actorSide: 'ally',
    actorIndex: cursor.index,
    allies: attackerSide,
    enemies: defenderSide,
    choices: [action],
    creatureParty: isA ? partyA : partyB,
    runPartySkills: isA ? partySkillsA : partySkillsB,
    combat: isA ? combatA : combatB,
    playbackStart,
    onActionRecord(atk) {
      const responses = [];
      if (defenderPartySkills && !selfSabotageApplied) {
        selfSabotageApplied = true;
        const sabotage = applyEnemySelfSabotage({
          actingIndex: atk.attackerIndex,
          enemies: attackerSide,
          runPartySkills: defenderPartySkills
        });
        if (sabotage) responses.push({ ...sabotage, side: cursor.side });
      }

      if (defenderPartySkills && defenderCombat) {
        const counter = computeInlineCounter(atk, defenderSide, attackerSide, defenderPartySkills, defenderCombat);
        if (counter) responses.push({ ...counter, side: isA ? 'sideB' : 'sideA' });
      }
      return responses;
    }
  });

  const actionSegments = result.actionSegments.map(segment => remapSegmentForPvp(segment, cursor.side));
  const winner = winnerForSides(sideA, sideB);
  const nextCursor = winner ? null : getNextActionCursor({ sideA, sideB, previousCursor: cursor });
  const flat = flattenSegments(actionSegments);

  return {
    ...flat,
    actionSegments,
    sideA,
    sideB,
    winner,
    nextCursor,
    playbackNext: result.playbackNext
  };
}

export function resolveOpeningActions({ sideA, sideB, actionA, actionB, options = {} }) {
  const opening = createPvpOpeningCursors({ sideA, sideB });
  const entries = [
    opening.sideA && { ...opening.sideA, creature: sideA[opening.sideA.index] },
    opening.sideB && { ...opening.sideB, creature: sideB[opening.sideB.index] }
  ].filter(Boolean).map(entry => ({
    ...entry,
    dex: getEffectiveDex(entry.creature),
    level: entry.creature.level || 1
  })).sort(compareActionActors);

  const segments = [];
  let playbackStart = 0;
  let winner = null;

  for (const cursor of entries) {
    const action = cursor.side === 'sideA' ? actionA : actionB;
    const result = resolvePvpCursorAction({
      sideA,
      sideB,
      cursor,
      action,
      ...options,
      playbackStart
    });
    segments.push(...result.actionSegments);
    playbackStart = result.playbackNext || playbackStart + result.actionSegments.length;
    winner = result.winner;
    if (winner) break;
  }

  const nextCursor = winner ? null : getNextActionCursor({ sideA, sideB, previousCursor: entries.at(-1) });
  const flat = flattenSegments(segments);

  return {
    ...flat,
    actionSegments: segments,
    sideA,
    sideB,
    winner,
    nextCursor,
    openingResolved: true
  };
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

  // Party skills: round-start
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

  const initiative = [];
  for (const idx of mapA.keys()) {
    const c = sideA[idx];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ side: 'sideA', index: idx, level: c.level || 1, dex: getEffectiveDex(c) });
    }
  }
  for (const idx of mapB.keys()) {
    const c = sideB[idx];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ side: 'sideB', index: idx, level: c.level || 1, dex: getEffectiveDex(c) });
    }
  }

  initiative.sort((a, b) => {
    const dexDiff = (b.dex || 1) - (a.dex || 1);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });

  const resultA = { attacks: [] };
  const resultB = { attacks: [] };
  const orderedAttacks = [];
  const defeatedDummy = new Set();
  let playbackCounter = 0;
  const inlineCountersA = [];
  const inlineCountersB = [];
  const inlinePartySkillsA = Boolean(partySkillsA && combatA);
  const inlinePartySkillsB = Boolean(partySkillsB && combatB);

  if (inlinePartySkillsA) {
    combatA.chainHitsThisTurn = 0;
    combatA.chainSurgeTriggeredThisTurn = false;
  }
  if (inlinePartySkillsB) {
    combatB.chainHitsThisTurn = 0;
    combatB.chainSurgeTriggeredThisTurn = false;
  }

  for (const slot of initiative) {
    const isA = slot.side === 'sideA';
    const attackerSide = isA ? sideA : sideB;
    const defenderSide = isA ? sideB : sideA;
    const choices = isA ? mapA.get(slot.index) : mapB.get(slot.index);
    const attackerResult = isA ? resultA : resultB;
    const sideLabel = isA ? 'sideA' : 'sideB';
    const defenderPartySkills = isA ? partySkillsB : partySkillsA;
    const defenderCombat = isA ? combatB : combatA;
    const defenderCounters = isA ? inlineCountersB : inlineCountersA;
    let selfSabotageApplied = false;

    const slotResult = executeSlotMoveTurn(attackerSide, defenderSide, slot.index, choices, {
      itemBuffs: isA ? itemBuffsA : itemBuffsB,
      defeatedIndices: defeatedDummy,
      runPartySkills: isA ? (partySkillsA || []) : (partySkillsB || []),
      onAttack(atk) {
        atk.playbackIndex = playbackCounter++;
        atk.side = sideLabel;
        orderedAttacks.push(atk);
        attackerResult.attacks.push(atk);

        if (defenderPartySkills && !selfSabotageApplied) {
          selfSabotageApplied = true;
          const sabotage = applyEnemySelfSabotage({
            actingIndex: atk.attackerIndex,
            enemies: attackerSide,
            runPartySkills: defenderPartySkills
          });
          if (sabotage) {
            orderedAttacks.push({ ...sabotage, side: sideLabel, playbackIndex: playbackCounter++ });
          }
        }

        // Opposing side counters
        if (defenderPartySkills && defenderCombat) {
          const counter = computeInlineCounter(atk, defenderSide, attackerSide, defenderPartySkills, defenderCombat);
          if (counter) {
            counter.playbackIndex = playbackCounter++;
            counter.side = isA ? 'sideB' : 'sideA';
            orderedAttacks.push(counter);
            defenderCounters.push(counter);
          }
        }

        return attackerSide[slot.index]?.hp > 0;
      }
    });

    if (isA && inlinePartySkillsA && slotResult.attacks.length > 0) {
      applyPartySkillsAfterPlayerAttacks({
        attacks: slotResult.attacks,
        allies: sideA,
        enemies: sideB,
        runPartySkills: partySkillsA,
        combat: combatA,
        resetTurnCounters: false
      });
    } else if (!isA && inlinePartySkillsB && slotResult.attacks.length > 0) {
      applyPartySkillsAfterPlayerAttacks({
        attacks: slotResult.attacks,
        allies: sideB,
        enemies: sideA,
        runPartySkills: partySkillsB,
        combat: combatB,
        resetTurnCounters: false
      });
    }
  }

  if (partySkillsA && combatA && !inlinePartySkillsA) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: resultA.attacks,
      allies: sideA,
      enemies: sideB,
      runPartySkills: partySkillsA,
      combat: combatA
    });
  }
  if (partySkillsB && combatB && !inlinePartySkillsB) {
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
  const koRemovals = [];
  if (partyA) {
    const resultA = processKOSwaps(sideA, partyA);
    koSwaps.push(...resultA.koSwaps.map(s => ({ side: 'sideA', index: s.index, replacement: s.replacement })));
    koRemovals.push(...resultA.koRemovals.map(r => ({ side: 'sideA', index: r.index, name: r.name })));
  }
  if (partyB) {
    const resultB = processKOSwaps(sideB, partyB);
    koSwaps.push(...resultB.koSwaps.map(s => ({ side: 'sideB', index: s.index, replacement: s.replacement })));
    koRemovals.push(...resultB.koRemovals.map(r => ({ side: 'sideB', index: r.index, name: r.name })));
  }

  const allADead = checkAllDefeated(sideA);
  const allBDead = checkAllDefeated(sideB);
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
    koRemovals,
    mpRegens,
    winner,
    sideA,
    sideB
  };
}
