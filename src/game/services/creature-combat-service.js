import {
  calculateCreatureDamage,
  getElementMultiplier,
  rollVariance,
  addXpToCreature,
  generateEnemyCreature,
  xpToNextLevel,
  MOVES_BY_ID,
  CREATURES_BY_ID
} from '../creatures.js';
import {
  getBuffedAttack,
  getBuffedElementMultiplier,
  applyDamageReduction
} from './item-service.js';
import {
  applyHeal, applyPoison, tickEffects,
  applySleep, applyStun, applyConfuse,
  applyTaunt, applyCleanse,
  applyStatChange, applyStatChanges, initStatStages, resetStatStages,
  isIncapacitated, isConfused,
  getAttackMultiplier, getDefenseMultiplier, getTauntTarget, breakSleep, getEffectiveDex,
  rollCritical, rollDodge
} from '../combat/effects.js';
import {
  applyAfterPlayerAttacks as _applyAfterPlayerAttacks,
  applyAfterEnemyAttacks,
  applyRoundStartSkills,
  applyEnemySelfSabotage,
  computeInlineCounter,
  checkAfflictionBurstCounter,
  toActivePartySkillIdSet
} from '../combat/party-skill-engine.js';
import { getHealingMultiplier, getPartySkillLevel, getXpMultiplier } from '../party-skills.js';
import { REST_MOVE, computeRestMpGain } from '../rest-move.js';
export { applyAfterEnemyAttacks, applyRoundStartSkills, applyEnemySelfSabotage, computeInlineCounter, checkAfflictionBurstCounter } from '../combat/party-skill-engine.js';
export const CREDITS_PER_KILL = 15;

/** Player/NPC move damage: applies ATK buffs, STAB, element mult, item element edge, level, and defender DEF. */
function rollMoveDamage(attacker, target, move, _itemBuffs, variance) {
  const stab = move.element !== 'neutral' && move.element === attacker.element;
  const stabMult = stab ? 1.5 : 1.0;
  const elemMult = getElementMultiplier(move.element, target.element);
  let typeMult = elemMult * stabMult;
  // Use per-creature itemBuffs (fall back to passed itemBuffs for backward compat)
  const buffs = attacker.itemBuffs || _itemBuffs;
  if (buffs) typeMult = getBuffedElementMultiplier(typeMult, buffs);

  let buffedAttack = buffs ? getBuffedAttack(attacker.attack, buffs, attacker.level) : attacker.attack;
  buffedAttack = Math.floor(buffedAttack * getAttackMultiplier(attacker));

  return calculateCreatureDamage({
    attackerLevel: Math.max(1, attacker.level || 1),
    attack: buffedAttack,
    defenderDefense: Math.floor((target.defense ?? 5) * getDefenseMultiplier(target)),
    power: move.power,
    typeMultiplier: typeMult,
    variance
  });
}
export const BASE_KILL_XP = 25;

function creatureVocabFields(creature = {}, prefix) {
  return {
    [`${prefix}Word`]: creature.name || '',
    [`${prefix}Reading`]: creature.reading || '',
    [`${prefix}Meaning`]: creature.meaning || creature.nameEn || ''
  };
}

export function applyPartySkillsAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat, resetTurnCounters = true, rng = Math.random }) {
  // All party skills are now handled by the v2 engine
  _applyAfterPlayerAttacks({ attacks, allies, enemies, runPartySkills, combat, resetTurnCounters, rng });
}

/**
 * Build a standard attack-result record used in the attacks[] array.
 */
function buildAttackRecord(creature, creatureIndex, move, target, targetIndex, overrides = {}) {
  return {
    attackerIndex: creatureIndex,
    attackerId: creature.id,
    attackerName: creature.nameEn,
    attackerNameJp: creature.name,
    attackerElement: creature.element,
    ...creatureVocabFields(creature, 'attacker'),
    attackerSkillName: move.name,
    attackerSkillReading: move.reading,
    attackerSkillEn: move.nameEn,
    moveId: move.id,
    moveName: move.name,
    moveNameEn: move.nameEn,
    moveElement: move.element,
    category: move.category,
    targetIndex,
    targetId: target.id,
    targetName: target.nameEn,
    targetNameJp: target.name,
    ...creatureVocabFields(target, 'target'),
    targetElement: target.element,
    damage: 0,
    healAmount: 0,
    effectApplied: null,
    critical: false,
    critChance: null,
    dodged: false,
    hitChance: 1,
    dodgeChance: 0,
    stab: false,
    elementMultiplier: 1.0,
    targetDefeated: false,
    ...overrides
  };
}

/**
 * Resolve targets for a move based on its target type.
 * @param {string} targetType - Move target type (single_enemy, all_enemies, single_ally, all_allies, self)
 * @param {object[]} allies - Player's active creatures
 * @param {object[]} enemies - Enemy creatures
 * @param {number} targetIndex - Index provided by the player's choice
 * @param {object} caster - The creature casting the move
 * @returns {{ targets: object[], indices: number[] }} Resolved targets and their indices
 */
function resolveTargets(targetType, allies, enemies, targetIndex, caster) {
  switch (targetType) {
    case 'single_enemy': {
      const t = enemies[targetIndex];
      if (t && t.hp > 0) return { targets: [t], indices: [targetIndex] };
      // Fallback: pick first alive enemy
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) return { targets: [enemies[i]], indices: [i] };
      }
      return { targets: [], indices: [] };
    }
    case 'all_enemies': {
      const targets = [];
      const indices = [];
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) { targets.push(enemies[i]); indices.push(i); }
      }
      return { targets, indices };
    }
    case 'single_ally': {
      const t = allies[targetIndex];
      if (t && t.hp > 0) return { targets: [t], indices: [targetIndex] };
      // Fallback: pick first alive ally
      for (let i = 0; i < allies.length; i++) {
        if (allies[i].hp > 0) return { targets: [allies[i]], indices: [i] };
      }
      return { targets: [], indices: [] };
    }
    case 'all_allies': {
      const targets = [];
      const indices = [];
      for (let i = 0; i < allies.length; i++) {
        if (allies[i].hp > 0) { targets.push(allies[i]); indices.push(i); }
      }
      return { targets, indices };
    }
    case 'self': {
      const idx = allies.indexOf(caster);
      return { targets: [caster], indices: [idx >= 0 ? idx : 0] };
    }
    default:
      return { targets: [], indices: [] };
  }
}

/**
 * Try to apply a move's status effect based on statusChance.
 * Returns the effect name if applied, null otherwise.
 */
function tryApplyStatus(move, target, caster, allies, rng = Math.random) {
  if (!move.statusEffect || !move.statusChance) return null;
  if (rng() * 100 >= move.statusChance) return null;

  const sourceId = caster.id;
  const duration = move.statusDuration || 2;

  switch (move.statusEffect) {
    case 'poison': {
      const damagePerTurn = Math.max(1, Math.floor((caster.attack / 10) * move.power * 0.2));
      applyPoison(target, { damagePerTurn, duration, sourceId });
      return 'poison';
    }
    case 'sleep':
      applySleep(target, { duration, sourceId });
      return 'sleep';
    case 'stun':
      applyStun(target, { sourceId });
      return 'stun';
    case 'confuse':
      applyConfuse(target, { duration, sourceId });
      return 'confuse';
    case 'taunt':
      applyTaunt(target, { duration, sourceId });
      return 'taunt';
    case 'cleanse':
      applyCleanse(target);
      return 'cleanse';
    default:
      return null;
  }
}

/**
 * Apply stat stage changes from a move's statChanges field.
 * @returns {object|null} Applied changes map or null if none applied
 */
function tryApplyStatChanges(move, target, rng = Math.random) {
  if (!move.statChanges) return null;
  if (move.statusChance && move.statusChance < 100) {
    if (rng() * 100 >= move.statusChance) return null;
  }
  return applyStatChanges(target, move.statChanges);
}

function isHostileTarget(target, enemies) {
  return Array.isArray(enemies) && enemies.includes(target);
}

function canMoveBeDodged(move, target, enemies) {
  if (!isHostileTarget(target, enemies)) return false;
  return move.category === 'damage' || move.category === 'drain' || move.category === 'debuff';
}

function resolveDodge(attacker, target, move, enemies, rng = Math.random) {
  if (!canMoveBeDodged(move, target, enemies)) {
    return { dodged: false, hitChance: 1, dodgeChance: 0 };
  }
  return rollDodge(attacker, target, rng);
}

function applyCriticalDamage(attacker, move, damage, rng = Math.random) {
  if (move.category !== 'damage' && move.category !== 'drain') {
    return { damage, critical: false, critChance: null };
  }
  const crit = rollCritical(attacker, rng);
  return {
    damage: crit.critical ? Math.floor(damage * 1.5) : damage,
    critical: crit.critical,
    critChance: crit.critChance
  };
}

function applyHpMasterHeal({ target, amount, runPartySkills, rng = Math.random }) {
  const boosted = Math.floor(amount * getHealingMultiplier(runPartySkills));
  const healed = applyHeal(target, boosted);
  if (healed > 0 && getPartySkillLevel(runPartySkills, 'hpMaster') >= 4) {
    const stats = ['atk', 'def', 'dex'];
    const stat = stats[Math.floor(rng() * stats.length)];
    initStatStages(target);
    applyStatChange(target, stat, 1);
  }
  return healed;
}

/**
 * Execute a single move for one creature. Returns array of attack records and xpEvents.
 */
function executeMove(creature, creatureIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults = null, defenderItemBuffs = null, rng = Math.random, runPartySkills = [], xpRng = rng, deferKillXp = false) {
  const attacks = [];
  const xpEvents = [];
  const stab = move.element !== 'neutral' && move.element === creature.element;

  switch (move.category) {
    case 'damage': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const dodge = resolveDodge(creature, target, move, enemies, rng);
        if (dodge.dodged) {
          attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
            dodged: true,
            hitChance: dodge.hitChance,
            dodgeChance: dodge.dodgeChance,
            stab,
            elementMultiplier: getElementMultiplier(move.element, target.element)
          }));
          continue;
        }
        const variance = rollVariance(rng);
        let damage = rollMoveDamage(creature, target, move, itemBuffs, variance);
        const crit = applyCriticalDamage(creature, move, damage, rng);
        damage = crit.damage;

        if (defenderItemBuffs) {
          damage = applyDamageReduction(damage, defenderItemBuffs);
        }

        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) breakSleep(target);

        const targetDefeated = target.hp <= 0;
        const effectApplied = (!targetDefeated && move.statusEffect) ? tryApplyStatus(move, target, creature, allies, rng) : null;
        const statChangesApplied = targetDefeated ? null : tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          damage, critical: crit.critical, critChance: crit.critChance, stab, elementMultiplier: getElementMultiplier(move.element, target.element), targetDefeated, effectApplied, statChangesApplied
        }));

        if (targetDefeated && creatureParty && !deferKillXp) {
          const enemyIdx = enemies.indexOf(target);
          if (enemyIdx >= 0 && !defeatedEnemyIndices.has(enemyIdx)) {
            defeatedEnemyIndices.add(enemyIdx);
            const xpEvent = awardKillXp(creatureParty, target.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks, metaMults, itemBuffs, runPartySkills, xpRng);
            xpEvents.push({ enemyId: target.id, enemyIndex: enemyIdx, enemyName: target.nameEn, ...xpEvent });
          }
        }
      }
      break;
    }

    case 'drain': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const dodge = resolveDodge(creature, target, move, enemies, rng);
        if (dodge.dodged) {
          attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
            dodged: true,
            hitChance: dodge.hitChance,
            dodgeChance: dodge.dodgeChance,
            stab,
            elementMultiplier: getElementMultiplier(move.element, target.element)
          }));
          continue;
        }
        const variance = rollVariance(rng);
        let damage = rollMoveDamage(creature, target, move, itemBuffs, variance);
        const crit = applyCriticalDamage(creature, move, damage, rng);
        damage = crit.damage;

        if (defenderItemBuffs) {
          damage = applyDamageReduction(damage, defenderItemBuffs);
        }

        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) breakSleep(target);

        // Heal attacker for 50% of damage dealt
        const healAmount = applyHpMasterHeal({
          target: creature,
          amount: Math.floor(damage * 0.5),
          runPartySkills,
          rng
        });

        const targetDefeated = target.hp <= 0;
        const effectApplied = (!targetDefeated && move.statusEffect) ? tryApplyStatus(move, target, creature, allies, rng) : null;
        const statChangesApplied = targetDefeated ? null : tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          damage, healAmount, critical: crit.critical, critChance: crit.critChance, stab, elementMultiplier: getElementMultiplier(move.element, target.element), targetDefeated, effectApplied, statChangesApplied
        }));

        if (targetDefeated && creatureParty && !deferKillXp) {
          const enemyIdx = enemies.indexOf(target);
          if (enemyIdx >= 0 && !defeatedEnemyIndices.has(enemyIdx)) {
            defeatedEnemyIndices.add(enemyIdx);
            const xpEvent = awardKillXp(creatureParty, target.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks, metaMults, itemBuffs, runPartySkills, xpRng);
            xpEvents.push({ enemyId: target.id, enemyIndex: enemyIdx, enemyName: target.nameEn, ...xpEvent });
          }
        }
      }
      break;
    }

    case 'heal': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const variance = rollVariance(rng);
        const healAmount = applyHpMasterHeal({
          target,
          amount: Math.floor((creature.attack / 10) * move.power * variance),
          runPartySkills,
          rng
        });
        const effectApplied = move.statusEffect ? tryApplyStatus(move, target, creature, allies, rng) : null;
        const statChangesApplied = tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          healAmount, effectApplied, statChangesApplied
        }));
      }
      break;
    }

    case 'buff': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const effectApplied = tryApplyStatus(move, target, creature, allies, rng);
        const statChangesApplied = tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          effectApplied, statChangesApplied
        }));
      }
      break;
    }

    case 'debuff': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const effectApplied = tryApplyStatus(move, target, creature, allies, rng);
        const statChangesApplied = tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          effectApplied, statChangesApplied
        }));
      }
      break;
    }

    default:
      break;
  }

  return { attacks, xpEvents };
}

/**
 * Build a synthetic "attack" object for a rest action so the client's
 * attack-card orchestrator can play it alongside real attacks. The client
 * branches on `category: 'rest'` to render `+N MP` in the number slot
 * and skip damage/effectiveness rendering.
 */
function buildRestAttack(creature, creatureIndex, mpGained) {
  return {
    category: 'rest',
    isRest: true,
    attackerId: creature.id,
    attackerIndex: creatureIndex,
    attackerName: creature.nameEn || creature.name || '',
    attackerNameJp: creature.name || '',
    ...creatureVocabFields(creature, 'attacker'),
    attackerElement: creature.element || 'neutral',
    attackerMp: creature.mp,
    attackerMaxMp: creature.maxMp || 0,
    targetSide: 'player',
    targetId: creature.id,
    targetIndex: creatureIndex,
    targetName: creature.nameEn || creature.name || '',
    targetNameJp: creature.name || '',
    ...creatureVocabFields(creature, 'target'),
    targetElement: creature.element || 'neutral',
    moveName: REST_MOVE.name,
    moveNameEn: REST_MOVE.nameEn,
    moveElement: 'neutral',
    attackerSkillName: REST_MOVE.name,
    attackerSkillReading: REST_MOVE.reading,
    attackerSkillEn: REST_MOVE.nameEn,
    damage: 0,
    mpGained,
    elementMultiplier: 1,
  };
}

/**
 * Process a move-based attack turn. Each ally creature uses a specific move
 * chosen by the player against a specific target.
 *
 * @param {object[]} allies - Player's active creatures
 * @param {object[]} enemies - Enemy creatures
 * @param {object[]} moveChoices - Array of { creatureIndex, moveId, targetIndex }
 * @param {object|null} itemBuffs - Active item buffs
 * @param {object|null} creatureParty - Full creature party (for XP awards)
 * @returns {object} { attacks, allEnemiesDefeated, xpEvents, mpRegens }
 */
export function processMoveTurn(allies, enemies, moveChoices, itemBuffs = null, creatureParty = null, metaMults = null, rng = Math.random, runPartySkills = [], xpRng = rng) {
  const attacks = [];
  const xpEvents = [];
  const defeatedEnemyIndices = new Set();

  // Process each move choice
  const restedCreatureIndices = new Set();
  for (const choice of moveChoices) {
    const creature = allies[choice.creatureIndex];
    if (!creature || creature.hp <= 0) continue;
    if (isIncapacitated(creature)) continue;

    // Rest pseudo-move — restore 20% MP and skip attack resolution entirely.
    // Resting creatures do NOT also receive the 5% baseline regen below (PvP parity).
    if (choice.action === 'rest') {
      const mpGained = computeRestMpGain(creature);
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + mpGained);
      attacks.push(buildRestAttack(creature, choice.creatureIndex, mpGained));
      restedCreatureIndices.add(choice.creatureIndex);
      continue;
    }

    // If all enemies are dead, stop processing damage-oriented moves
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (creature.moves || []).find(m => m.id === choice.moveId);
    if (!move) continue;

    // Check MP
    if ((creature.mp || 0) < move.mpCost) continue;

    // Deduct MP
    creature.mp = (creature.mp || 0) - move.mpCost;

    // Execute the move
    const result = executeMove(creature, choice.creatureIndex, move, choice.targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults, null, rng, runPartySkills, xpRng);
    // Annotate attacks with post-deduction MP so frontend can update bars immediately
    for (const atk of result.attacks) {
      atk.attackerMp = creature.mp;
      atk.attackerMaxMp = creature.maxMp || 0;
    }
    attacks.push(...result.attacks);
    xpEvents.push(...result.xpEvents);

  }

  // MP regen: each alive ally gets 5% of maxMp back, EXCEPT creatures that rested this turn
  // (resting already grants 20%; stacking would give 25% and diverge from PvP).
  const mpRegens = [];
  for (let i = 0; i < allies.length; i++) {
    const creature = allies[i];
    if (!creature || creature.hp <= 0) continue;
    if (restedCreatureIndices.has(i)) continue;
    const regen = Math.floor((creature.maxMp || 0) * 0.05);
    creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + regen);
    mpRegens.push({ creatureId: creature.id, mp: creature.mp, maxMp: creature.maxMp, regen });
  }

  return {
    attacks,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0),
    xpEvents,
    mpRegens
  };
}

/**
 * Execute an NPC companion's skill during the NPC skill phase.
 * NPC skills behave like creature moves but are fired by the NPC, not a party member.
 *
 * @param {object} npcData - NPC combat data { id, name, nameEn, reading, meaning, attack, element }
 * @param {object} skill - Skill object with move-like fields { id, name, nameEn, element, power, category, target, ... }
 * @param {object[]} allies - Player's active creatures
 * @param {object[]} enemies - Enemy creatures
 * @returns {{ attacks: object[] }}
 */
export function executeNpcSkill(npcData, skill, allies, enemies, rng = Math.random) {
  const pseudoCreature = {
    id: npcData.id,
    name: npcData.name,
    nameEn: npcData.nameEn,
    element: npcData.element || 'neutral',
    attack: npcData.attack || 10,
    level: npcData.level || 5,
    defense: npcData.defense ?? 5,
    reading: npcData.reading || '',
    meaning: npcData.meaning || npcData.nameEn || '',
    activeEffects: [],
    hp: 999,
    maxHp: 999
  };

  // Flip perspective: NPC's "allies" are the enemies array, NPC's "enemies" are allies array
  // executeMove resolveTargets uses: allies = caster's team, enemies = opposing team
  const npcAllies = enemies;   // NPC's team (enemies from player perspective)
  const npcEnemies = allies;   // NPC's opponents (player's creatures)

  // executeMove needs defeatedEnemyIndices — NPC skills don't award XP
  const defeatedEnemyIndices = new Set();

  // Pick random alive ally for single_ally targeting (e.g. buff skills)
  let targetIdx = 0;
  if (skill.target === 'single_ally') {
    const aliveIndices = npcAllies.map((c, i) => c.hp > 0 ? i : -1).filter(i => i >= 0);
    if (aliveIndices.length > 0) {
      targetIdx = aliveIndices[Math.floor(rng() * aliveIndices.length)];
    }
  }
  const result = executeMove(pseudoCreature, -1, skill, targetIdx, npcAllies, npcEnemies, null, null, defeatedEnemyIndices, null, null, rng);

  return { attacks: result.attacks };
}

export function processDefendTurn(allies) {
  // MP regen on defend (12% of maxMp)
  const mpRegens = [];
  for (const creature of allies) {
    if (creature.hp <= 0) continue;
    const regen = Math.floor((creature.maxMp || 0) * 0.12);
    creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + regen);
    mpRegens.push({ creatureId: creature.id, mp: creature.mp, maxMp: creature.maxMp, regen });
  }
  return { mpRegens };
}

function getStrongestDamageMove(enemy) {
  if (!enemy.moves?.length) return null;
  const damageMoves = enemy.moves.filter(m => m.category === 'damage' || m.category === 'drain');
  if (damageMoves.length === 0) return null;
  return damageMoves.reduce((best, m) => ((m.power || 0) > (best.power || 0) ? m : best));
}

function getRandomMove(enemy, rng = Math.random) {
  if (!enemy.moves?.length) return null;
  return enemy.moves[Math.floor(rng() * enemy.moves.length)];
}

/**
 * Enemy AI step 1: pick a move and decision mode (once per turn).
 * - Taunt: strongest damage move against taunter
 * - Confused: random move against random creature
 * - 2/3 smart: strongest damage move against super-effective target
 * - 1/3 random: random move; buff/heal→allies, damage/debuff→random enemy
 */
export function pickEnemyMoveChoice(enemy, allies, enemies, rng = Math.random) {
  if (!enemy.moves?.length) return null;
  const aliveAllies = allies.filter(c => c.hp > 0);
  if (aliveAllies.length === 0) return null;

  const taunter = getTauntTarget(aliveAllies);
  if (taunter) {
    return { move: getStrongestDamageMove(enemy) || getRandomMove(enemy, rng), mode: 'taunted' };
  }

  if (isConfused(enemy)) {
    return { move: getRandomMove(enemy, rng), mode: 'confused' };
  }

  if (rng() < 2 / 3) {
    const strongest = getStrongestDamageMove(enemy);
    if (strongest) return { move: strongest, mode: 'smart' };
  }

  return { move: getRandomMove(enemy, rng), mode: 'random' };
}

/**
 * Enemy AI step 2: pick a target for the chosen move/mode (per strike, for haste re-targeting).
 */
export function pickEnemyTarget(enemy, move, mode, allies, enemies, rng = Math.random) {
  const aliveAllies = allies.filter(c => c.hp > 0);

  switch (mode) {
    case 'taunted': {
      const taunter = getTauntTarget(aliveAllies);
      return { target: taunter || aliveAllies[0], targetSide: 'player' };
    }
    case 'confused': {
      const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c !== enemy);
      if (allAlive.length === 0) return null;
      const target = allAlive[Math.floor(rng() * allAlive.length)];
      return { target, targetSide: allies.includes(target) ? 'player' : 'enemy' };
    }
    case 'smart': {
      const superEffective = aliveAllies.filter(c => getElementMultiplier(enemy.element, c.element) > 1.0);
      const pool = superEffective.length > 0 ? superEffective : aliveAllies;
      return { target: pool[Math.floor(rng() * pool.length)], targetSide: 'player' };
    }
    case 'random': {
      if (['buff', 'heal'].includes(move.category)) {
        if (move.target === 'self') return { target: enemy, targetSide: 'enemy' };
        const aliveTeam = enemies.filter(c => c.hp > 0);
        return { target: aliveTeam[Math.floor(rng() * aliveTeam.length)] || enemy, targetSide: 'enemy' };
      }
      return { target: aliveAllies[Math.floor(rng() * aliveAllies.length)], targetSide: 'player' };
    }
    default:
      return null;
  }
}

/**
 * Build an enemy action record for any move category. Shared by processEnemyTurn and initiative interleave.
 * Target is pre-selected by pickEnemyTarget.
 * @returns {object|null} Attack record or null if skipped
 */
export function buildEnemyActionRecord(enemy, attackerIndex, move, target, targetSide, allies, enemies, defendActive = false, itemBuffs = null, rng = Math.random) {
  if (!enemy || enemy.hp <= 0) return null;
  if (!target || target.hp <= 0) return null;

  const targetIndex = targetSide === 'player' ? allies.indexOf(target) : enemies.indexOf(target);

  const rec = {
    attackerIndex,
    attackerId: enemy.id,
    attackerName: enemy.nameEn,
    attackerNameJp: enemy.name,
    attackerElement: enemy.element,
    ...creatureVocabFields(enemy, 'attacker'),
    attackerSkillName: move.name,
    attackerSkillReading: move.reading,
    attackerSkillEn: move.nameEn,
    moveId: move.id,
    moveName: move.name,
    moveNameEn: move.nameEn,
    moveElement: move.element,
    category: move.category,
    targetIndex,
    targetSide,
    targetId: target.id,
    targetName: target.nameEn,
    targetNameJp: target.name,
    ...creatureVocabFields(target, 'target'),
    targetElement: target.element,
    damage: 0,
    healAmount: 0,
    effectApplied: null,
    statChangesApplied: null,
    elementMultiplier: 1.0,
    targetDefeated: false
  };

  switch (move.category) {
    case 'damage':
    case 'drain': {
      const dodge = resolveDodge(enemy, target, move, targetSide === 'player' ? allies : [], rng);
      if (dodge.dodged) {
        rec.dodged = true;
        rec.hitChance = dodge.hitChance;
        rec.dodgeChance = dodge.dodgeChance;
        rec.elementMultiplier = getElementMultiplier(move.element, target.element);
        break;
      }

      const variance = rollVariance(rng);
      const stab = move.element !== 'neutral' && move.element === enemy.element;
      const stabMult = stab ? 1.5 : 1.0;
      const elemMult = getElementMultiplier(move.element, target.element);
      const typeMult = elemMult * stabMult;
      const buffedAttack = Math.floor(enemy.attack * getAttackMultiplier(enemy));
      let damage = calculateCreatureDamage({
        attackerLevel: Math.max(1, enemy.level || 1),
        attack: buffedAttack,
        defenderDefense: Math.floor((target.defense ?? 5) * getDefenseMultiplier(target)),
        power: move.power,
        typeMultiplier: typeMult,
        variance
      });
      const crit = applyCriticalDamage(enemy, move, damage, rng);
      damage = crit.damage;
      rec.critical = crit.critical;
      rec.critChance = crit.critChance;

      if (defendActive) damage = Math.floor(damage * 0.5);
      if (itemBuffs) damage = applyDamageReduction(damage, itemBuffs);

      target.hp = Math.max(0, target.hp - damage);
      if (damage > 0) breakSleep(target);

      rec.damage = damage;
      rec.elementMultiplier = elemMult;
      rec.targetDefeated = target.hp <= 0;

      if (move.category === 'drain') {
        rec.healAmount = applyHeal(enemy, Math.floor(damage * 0.5));
      }

      if (!rec.targetDefeated) {
        if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
        rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      }
      break;
    }

    case 'heal': {
      const variance = rollVariance(rng);
      rec.healAmount = applyHeal(target, Math.floor((enemy.attack / 10) * move.power * variance));
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
      rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      break;
    }

    case 'buff': {
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
      rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      break;
    }

    case 'debuff': {
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
      rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      break;
    }

  }

  return rec;
}

/**
 * Run all submitted choices for one allied creature slot vs an opposing team.
 * Used by PvE initiative rounds and PvP.
 *
 * @param {Set|null} defeatedEnemyIndices - Kill/XP tracking (empty Set in PvP)
 */
export function executeSlotMoveTurn(allies, enemies, slotIndex, choices, options = {}) {
  const {
    itemBuffs = null,
    creatureParty = null,
    metaMults = null,
    defeatedIndices = null,
    defenderItemBuffs = null,
    onAttack = null,
    rng = Math.random,
    xpRng = rng,
    deferKillXp = false,
    runPartySkills = []
  } = options;

  const attacks = [];
  const xpEvents = [];
  const defeated = defeatedIndices || new Set();

  const creature = allies[slotIndex];
  if (!creature || creature.hp <= 0 || isIncapacitated(creature)) {
    return { attacks, xpEvents };
  }
  if (!choices?.length) {
    return { attacks, xpEvents };
  }

  for (const choice of choices) {
    // Rest pseudo-move — restore 20% MP and skip attack resolution entirely.
    if (choice.action === 'rest') {
      const mpGained = computeRestMpGain(creature);
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + mpGained);
      const restAtk = buildRestAttack(creature, choice.creatureIndex ?? slotIndex, mpGained);
      attacks.push(restAtk);
      if (onAttack && onAttack(restAtk) === false) break;
      continue;
    }

    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (creature.moves || []).find(m => m.id === choice.moveId);
    if (!move) continue;
    if ((creature.mp || 0) < move.mpCost) continue;

    creature.mp = (creature.mp || 0) - move.mpCost;

    let stopped = false;

    const runOneExecute = () => {
      const result = executeMove(
        creature,
        choice.creatureIndex,
        move,
        choice.targetIndex,
        allies,
        enemies,
        itemBuffs,
        creatureParty,
        defeated,
        metaMults,
        defenderItemBuffs,
        rng,
        runPartySkills,
        xpRng,
        deferKillXp
      );
      for (const atk of result.attacks) {
        atk.attackerMp = creature.mp;
        atk.attackerMaxMp = creature.maxMp || 0;
        attacks.push(atk);
        if (onAttack && onAttack(atk) === false) {
          stopped = true;
          return;
        }
      }
      xpEvents.push(...result.xpEvents);
    };

    runOneExecute();
    if (stopped) break;
    if (creature.hp <= 0) break;
  }

  return { attacks, xpEvents };
}

/**
 * PvE combat round: allies and enemies act in one combined initiative order
 * (highest effective dex first; level breaks ties), same initiative rule as PvP.
 *
 * Each creature's full turn (all move choices for that ally or one enemy strike)
 * runs when its initiative slot comes up.
 *
 * @returns Same shape as processMoveTurn for player phase plus enemy attacks.
 */
function looksLikePvERoundOptions(value) {
  if (!value || typeof value !== 'object') return false;
  return typeof value.rng === 'function'
    || Object.prototype.hasOwnProperty.call(value, 'runPartySkills')
    || Object.prototype.hasOwnProperty.call(value, 'combat')
    || Object.prototype.hasOwnProperty.call(value, 'creatureParty')
    || Object.prototype.hasOwnProperty.call(value, 'metaMults')
    || Object.prototype.hasOwnProperty.call(value, 'itemBuffs');
}

export function processInterleavedPvERound(
  allies,
  enemies,
  moveChoices,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  options = {}
) {
  if (
    looksLikePvERoundOptions(itemBuffs)
    && creatureParty == null
    && metaMults == null
    && (!options || Object.keys(options).length === 0)
  ) {
    options = itemBuffs;
    itemBuffs = options.itemBuffs ?? null;
    creatureParty = options.creatureParty ?? null;
    metaMults = options.metaMults ?? null;
  }
  options = options || {};
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const xpRng = typeof options.xpRng === 'function' ? options.xpRng : rng;
  const deferKillXp = options.deferKillXp === true;
  const playerAttacks = [];
  const enemyAttacks = [];
  const inlineCounters = [];
  const effectEvents = [];
  const xpEvents = [];
  const defeatedEnemyIndices = new Set();
  const pb = { n: 0 };
  const applyInlinePartySkills = Boolean(options.runPartySkills && options.combat);

  const tagPlayback = (atk, side) => {
    atk.playbackIndex = pb.n++;
    atk.combatSide = side;
  };

  if (applyInlinePartySkills) {
    options.combat.chainHitsThisTurn = 0;
    options.combat.chainSurgeTriggeredThisTurn = false;
  }

  const choicesByAlly = new Map();
  for (const choice of moveChoices || []) {
    if (typeof choice.creatureIndex !== 'number') continue;
    if (!choicesByAlly.has(choice.creatureIndex)) choicesByAlly.set(choice.creatureIndex, []);
    choicesByAlly.get(choice.creatureIndex).push(choice);
  }

  // Pre-select enemy moves before initiative loop
  const enemyChoicesMap = new Map();
  for (let ei = 0; ei < enemies.length; ei++) {
    const enemy = enemies[ei];
    if (!enemy || enemy.hp <= 0 || isIncapacitated(enemy)) continue;
    const choice = pickEnemyMoveChoice(enemy, allies, enemies, rng);
    if (!choice) continue;
    const { move, mode } = choice;
    const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies, rng);
    if (!targeting) continue;
    const targetIndex = targeting.targetSide === 'player'
      ? allies.indexOf(targeting.target)
      : enemies.indexOf(targeting.target);
    enemyChoicesMap.set(ei, [{ creatureIndex: ei, moveId: move.id, targetIndex }]);
  }

  const initiative = [];

  for (const [allyIndex] of choicesByAlly) {
    const c = allies[allyIndex];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ kind: 'ally', index: allyIndex, level: c.level || 1, dex: getEffectiveDex(c) });
    }
  }

  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei];
    if (e && e.hp > 0 && !isIncapacitated(e) && e.moves?.length > 0) {
      initiative.push({ kind: 'enemy', index: ei, level: e.level || 1, dex: getEffectiveDex(e) });
    }
  }

  initiative.sort((a, b) => {
    const dexDiff = (b.dex || 1) - (a.dex || 1);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return rng() - 0.5;
  });

  for (const slot of initiative) {
    const isAlly = slot.kind === 'ally';
    let selfSabotageApplied = false;

    const result = executeSlotMoveTurn(
      isAlly ? allies : enemies,
      isAlly ? enemies : allies,
      slot.index,
      isAlly ? choicesByAlly.get(slot.index) : enemyChoicesMap.get(slot.index),
      {
        itemBuffs,
        creatureParty: isAlly ? creatureParty : null,
        metaMults: isAlly ? metaMults : null,
        defeatedIndices: defeatedEnemyIndices,
        defenderItemBuffs: isAlly ? null : itemBuffs,
        rng,
        xpRng,
        deferKillXp,
        runPartySkills: isAlly ? (options.runPartySkills || []) : [],
        onAttack(atk) {
          tagPlayback(atk, isAlly ? 'player' : 'enemy');
          (isAlly ? playerAttacks : enemyAttacks).push(atk);

          // Inline counter from defending side (only when enemy attacks ally)
          if (!isAlly && options.runPartySkills && options.combat) {
            if (!selfSabotageApplied) {
              selfSabotageApplied = true;
              const sabotage = applyEnemySelfSabotage({
                actingIndex: atk.attackerIndex,
                enemies,
                runPartySkills: options.runPartySkills,
                rng
              });
              if (sabotage) {
                tagPlayback(sabotage, 'enemy');
                effectEvents.push(sabotage);
              }
            }

            const counter = computeInlineCounter(atk, allies, enemies, options.runPartySkills, options.combat, rng);
            if (counter) {
              tagPlayback(counter, 'player');
              playerAttacks.push(counter);
              inlineCounters.push(counter);
            }
          }

          const attacker = isAlly ? allies : enemies;
          return attacker[slot.index]?.hp > 0;
        }
      }
    );
    if (isAlly && applyInlinePartySkills && result.attacks.length > 0) {
      applyPartySkillsAfterPlayerAttacks({
        attacks: result.attacks,
        allies,
        enemies,
        runPartySkills: options.runPartySkills,
        combat: options.combat,
        resetTurnCounters: false,
        rng
      });
    }
    if (isAlly) xpEvents.push(...result.xpEvents);
  }

  // Affliction Burst check for inline counters
  if (options.runPartySkills && options.combat && inlineCounters.length > 0) {
    const active = toActivePartySkillIdSet(options.runPartySkills);
    if (active.has('afflictionBurst')) {
      checkAfflictionBurstCounter(enemies, options.combat, inlineCounters);
    }
  }

  const mpRegens = [];
  for (const creature of allies) {
    if (creature.hp <= 0) continue;
    const regen = Math.floor((creature.maxMp || 0) * 0.05);
    creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + regen);
    mpRegens.push({ creatureId: creature.id, mp: creature.mp, maxMp: creature.maxMp, regen });
  }
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const regen = Math.floor((enemy.maxMp || 0) * 0.12);
    enemy.mp = Math.min(enemy.maxMp || 0, (enemy.mp || 0) + regen);
  }

  return {
    attacks: playerAttacks,
    playerAttacks,
    enemyAttacks,
    inlineCounters,
    allEnemiesDefeated: enemies.every(e => !e || e.hp <= 0),
    partySkillsAppliedInline: applyInlinePartySkills,
    xpEvents,
    effectEvents,
    mpRegens
  };
}

export function resolveSingleActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  choices = [],
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  runPartySkills = null,
  combat = null,
  playbackStart = 0,
  rng = Math.random,
  xpRng = rng,
  deferKillXp = false,
  onActionRecord = null
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList[actorIndex];
  const inlineCounters = [];
  let playbackIndex = playbackStart;

  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false
  };

  if (!actor || actor.hp <= 0) {
    segment.skipped = true;
    return { actionSegments: [segment], inlineCounters, xpEvents: [], playbackNext: playbackIndex };
  }

  if (combat && runPartySkills) {
    combat.chainHitsThisTurn = 0;
    combat.chainSurgeTriggeredThisTurn = false;
  }

  let selfSabotageApplied = false;
  const slotResult = executeSlotMoveTurn(actorList, defenderList, actorIndex, choices, {
    itemBuffs: isAlly ? itemBuffs : null,
    creatureParty: isAlly ? creatureParty : null,
    metaMults: isAlly ? metaMults : null,
    defenderItemBuffs: isAlly ? null : itemBuffs,
    defeatedIndices: new Set(),
    rng,
    xpRng,
    deferKillXp,
    runPartySkills: isAlly ? (runPartySkills || []) : [],
    onAttack(atk) {
      atk.playbackIndex = playbackIndex++;
      atk.combatSide = isAlly ? 'player' : 'enemy';
      segment.attacks.push(atk);

      if (typeof onActionRecord === 'function') {
        const responses = onActionRecord(atk) || [];
        for (const response of responses) {
          if (typeof response.playbackIndex !== 'number') {
            response.playbackIndex = playbackIndex++;
          }
          if (response.type === 'counter') {
            segment.counterAttacks.push(response);
            inlineCounters.push(response);
          } else {
            segment.effectEvents.push(response);
          }
        }
      }

      if (!isAlly && runPartySkills && combat) {
        if (!selfSabotageApplied) {
          selfSabotageApplied = true;
          const sabotage = applyEnemySelfSabotage({
            actingIndex: atk.attackerIndex,
            enemies: actorList,
            runPartySkills,
            rng
          });
          if (sabotage) {
            sabotage.playbackIndex = playbackIndex++;
            sabotage.combatSide = 'enemy';
            segment.effectEvents.push(sabotage);
          }
        }

        const counter = computeInlineCounter(atk, allies, enemies, runPartySkills, combat, rng);
        if (counter) {
          counter.playbackIndex = playbackIndex++;
          counter.combatSide = 'player';
          segment.counterAttacks.push(counter);
          inlineCounters.push(counter);
        }
      }

      return actorList[actorIndex]?.hp > 0;
    }
  });

  segment.xpEvents.push(...(slotResult.xpEvents || []));

  if (isAlly && runPartySkills && combat && slotResult.attacks.length > 0) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: slotResult.attacks,
      allies,
      enemies,
      runPartySkills,
      combat,
      resetTurnCounters: false,
      rng
    });
  }

  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);

  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: segment.counterAttacks,
    inlineCounters,
    xpEvents: segment.xpEvents,
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackIndex
  };
}

export function resolveSyntheticActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  syntheticMove,
  targetIndex,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  runPartySkills = [],
  playbackStart = 0,
  rng = Math.random,
  xpRng = rng,
  deferKillXp = false,
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList[actorIndex];
  let playbackIndex = playbackStart;
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false,
    synthetic: true,
  };

  if (!actor || actor.hp <= 0 || isIncapacitated(actor)) {
    segment.skipped = true;
    return { actionSegments: [segment], attacks: [], xpEvents: [], playbackNext: playbackIndex };
  }

  const move = {
    category: 'damage',
    target: 'single_enemy',
    mpCost: 0,
    ...syntheticMove,
  };
  const result = executeMove(
    actor,
    actorIndex,
    move,
    targetIndex,
    actorList,
    defenderList,
    isAlly ? itemBuffs : null,
    isAlly ? creatureParty : null,
    new Set(),
    isAlly ? metaMults : null,
    isAlly ? null : itemBuffs,
    rng,
    isAlly ? (runPartySkills || []) : [],
    xpRng,
    deferKillXp
  );

  for (const atk of result.attacks) {
    atk.playbackIndex = playbackIndex++;
    atk.combatSide = isAlly ? 'player' : 'enemy';
    atk.synthetic = true;
    segment.attacks.push(atk);
  }
  segment.xpEvents.push(...(result.xpEvents || []));
  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);
  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: segment.xpEvents,
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackIndex,
  };
}

export function resolveNoopActorAction({ actorSide, actorIndex, allies, enemies, playbackStart = 0 }) {
  const actor = actorSide === 'ally' || actorSide === 'sideA'
    ? allies?.[actorIndex]
    : enemies?.[actorIndex];
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: !actor || actor.hp <= 0 || isIncapacitated(actor),
    noop: true,
  };

  if (!segment.skipped) {
    const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
    segment.effectEvents.push(...miniRound.effectEvents);
    segment.mpRegens.push(...miniRound.mpRegens);
  }

  return {
    actionSegments: [segment],
    attacks: [],
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: [],
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackStart,
  };
}

export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null, rng = Math.random) {
  const attacks = [];
  for (let attackerIndex = 0; attackerIndex < enemies.length; attackerIndex++) {
    const enemy = enemies[attackerIndex];
    if (enemy.hp <= 0) continue;
    if (isIncapacitated(enemy)) continue;

    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const choice = pickEnemyMoveChoice(enemy, allies, enemies, rng);
    if (!choice) continue;
    const { move, mode } = choice;

    const attackCount = 1;

    for (let strike = 0; strike < attackCount; strike++) {
      if (enemy.hp <= 0) break;

      const currentAliveAllies = allies.filter(a => a.hp > 0);
      if (currentAliveAllies.length === 0) break;

      const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies, rng);
      if (!targeting) break;

      const rec = buildEnemyActionRecord(enemy, attackerIndex, move, targeting.target, targeting.targetSide, allies, enemies, defendActive, itemBuffs, rng);
      if (rec) attacks.push(rec);
    }
  }

  // MP regen for enemies (12% of maxMp)
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const regen = Math.floor((enemy.maxMp || 0) * 0.12);
    enemy.mp = Math.min(enemy.maxMp || 0, (enemy.mp || 0) + regen);
  }

  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0) };
}

/**
 * Tick active effects on all creatures (allies and enemies) at start of a combat round.
 * Wraps tickEffects for each alive creature and collects all events.
 *
 * @param {object[]} allies - Player's active creatures
 * @param {object[]} enemies - Enemy creatures
 * @returns {object[]} Array of effect events (poison damage, etc.)
 */
export function tickAllEffects(allies, enemies) {
  const events = [];
  const appendWithIndex = (creature, side, index) => {
    if (creature && creature.hp > 0) {
      const creatureEvents = tickEffects(creature);
      for (const ev of creatureEvents) {
        events.push({ ...ev, targetSide: side, targetIndex: index });
      }
    }
  };
  (allies || []).forEach((c, i) => appendWithIndex(c, 'ally', i));
  (enemies || []).forEach((c, i) => appendWithIndex(c, 'enemy', i));
  return events;
}

export function resolveActorMiniRound(actor, cursor) {
  if (!actor) {
    return { effectEvents: [], mpRegens: [] };
  }

  const effectEvents = tickEffects(actor).map(event => ({
    ...event,
    targetSide: cursor.side,
    targetIndex: cursor.index
  }));

  const maxMp = actor.maxMp || 0;
  const regenRate = cursor.side === 'enemy' || cursor.side === 'sideB' ? 0.12 : 0.05;
  const regen = actor.hp > 0 ? Math.floor(maxMp * regenRate) : 0;
  if (regen > 0) {
    actor.mp = Math.min(maxMp, (actor.mp || 0) + regen);
  }

  const mpRegens = actor.hp > 0
    ? [{
        creatureId: actor.id,
        mp: actor.mp || 0,
        maxMp,
        regen,
        side: cursor.side,
        index: cursor.index
      }]
    : [];

  return { effectEvents, mpRegens };
}

// ============ BEFRIEND NAME QUIZ (Koto2) ============

const BEFRIEND_QUIZ_CHANCE = 0.25; // 25% chance on killing blow to last enemy

/**
 * Check if the befriend quiz should trigger when all enemies are defeated.
 * Returns true if the roll succeeds and the quiz should fire.
 * @param {object[]} enemies - Enemy creatures array
 * @param {object} [options]
 * @param {boolean} [options.guaranteed] - If true, always trigger (new player protection)
 * @param {boolean} [options.force] - If true, always trigger (debug-only)
 * @returns {boolean}
 */
export function shouldTriggerBefriendQuiz(enemies, { guaranteed = false, force = false } = {}) {
  // Find the last enemy that just died (hp === 0, was alive this turn)
  const justDefeated = enemies.filter(e => e.hp <= 0 && !e.befriended);
  if (justDefeated.length === 0) return false;
  if (force) return true;
  if (guaranteed) return true;
  return Math.random() < BEFRIEND_QUIZ_CHANCE;
}

/**
 * Generate a name quiz for a creature. Returns 3 English name options (1 correct, 2 wrong).
 * Prefers wrong answers from encounter creatures for contextual relevance,
 * falls back to global creature catalog.
 * @param {object} creature - The enemy creature to quiz about
 * @param {object[]} [encounterCreatures] - Other creatures in the encounter (preferred for wrong answers)
 * @returns {{ creatureId: string, creatureName: string, options: Array<{ id: string, name: string, correct: boolean }> }}
 */
export function generateBefriendQuiz(creature, encounterCreatures = []) {
  // Prefer wrong answers from encounter creatures
  let wrongCandidates = encounterCreatures
    .filter(c => c.id !== creature.id)
    .map(c => c.nameEn)
    .filter(Boolean);

  // Deduplicate
  wrongCandidates = [...new Set(wrongCandidates)];

  // Fall back to global catalog if not enough encounter creatures
  if (wrongCandidates.length < 2) {
    const allCreatureIds = Object.keys(CREATURES_BY_ID);
    const catalogCandidates = allCreatureIds
      .filter(id => id !== creature.id)
      .map(id => CREATURES_BY_ID[id])
      .filter(Boolean)
      .map(c => c.nameEn)
      .filter(name => !wrongCandidates.includes(name));
    const shuffled = catalogCandidates.sort(() => Math.random() - 0.5);
    wrongCandidates.push(...shuffled);
  }

  // Shuffle and take 2
  const shuffled = wrongCandidates.sort(() => Math.random() - 0.5);
  const wrongNames = shuffled.slice(0, 2);

  // If not enough wrong options (empty creature data), use generic names
  while (wrongNames.length < 2) {
    wrongNames.push(wrongNames.length === 0 ? 'Unknown Creature' : 'Mystery Beast');
  }

  // Build options array (shuffled)
  const options = [
    { id: creature.id, name: creature.nameEn, correct: true },
    { id: 'wrong-1', name: wrongNames[0], correct: false },
    { id: 'wrong-2', name: wrongNames[1], correct: false }
  ].sort(() => Math.random() - 0.5);

  return {
    creatureId: creature.id,
    creatureName: creature.name,
    creatureNameEn: creature.nameEn,
    creatureReading: creature.reading,
    options
  };
}

/**
 * Process the player's answer to a befriend quiz.
 * @param {string} answerId - The id from the selected option
 * @param {object} combat - The combat state object
 * @param {object} creatureParty - The player's creature party
 * @returns {{ correct: boolean, befriended?: boolean, counterAttack?: object }}
 */
export function processBefriendQuizAnswer(answerId, combat, creatureParty, options = {}) {
  const quiz = combat.befriendQuiz;
  if (!quiz) return { error: 'No active befriend quiz' };

  const targetIndex = quiz.targetIndex;
  const target = combat.enemies[targetIndex];
  if (!target) return { error: 'Target creature not found' };

  // Check if the answer is correct
  const correctOption = quiz.options.find(o => o.correct);
  const isCorrect = answerId === correctOption?.id;

  if (isCorrect) {
    // Befriend the creature: mark as captured, add to pending
    target.hp = 0;
    target.befriended = true;

    // Fresh uid: the party-bound copy is a new conceptual instance, not an alias
    // of the defeated enemy shell still sitting in combat.enemies[].
    const capturedCopy = { ...target, uid: crypto.randomUUID(), hp: target.maxHp, mp: target.maxMp, befriended: false };

    if (!creatureParty.pendingCaptures) creatureParty.pendingCaptures = [];
    creatureParty.pendingCaptures.push(capturedCopy);

    // Clear quiz state
    combat.befriendQuiz = null;

    return {
      correct: true,
      befriended: true,
      capturedId: target.id,
      capturedIndex: targetIndex,
      capturedName: target.nameEn,
      allEnemiesDefeated: combat.enemies.every(e => e.hp <= 0 || e.befriended)
    };
  }

  // Tutorial protection: wrong answer = no damage, keep quiz alive
  if (options.tutorialProtect) {
    return { correct: false, tutorialRetry: true };
  }

  // Wrong answer: creature fights back
  // Give the creature a free attack on a random alive ally
  const aliveAllies = (combat.allies || []).filter(a => a && a.hp > 0);
  let counterAttack = null;

  if (aliveAllies.length > 0 && target.moves?.length > 0) {
    const move = target.moves[0];
    const allyTarget = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
    const variance = rollVariance();
    let damage = rollMoveDamage(target, allyTarget, move, null, variance);
    allyTarget.hp = Math.max(0, allyTarget.hp - damage);
    const elemMult = getElementMultiplier(move.element, allyTarget.element);

    counterAttack = {
      attackerIndex: targetIndex,
      attackerId: target.id,
      attackerName: target.nameEn,
      attackerNameJp: target.name,
      attackerElement: target.element,
      ...creatureVocabFields(target, 'attacker'),
      attackerSkillName: move.name,
      attackerSkillReading: move.reading,
      attackerSkillEn: move.nameEn,
      moveId: move.id,
      moveName: move.name,
      moveNameEn: move.nameEn,
      moveElement: move.element,
      category: 'damage',
      targetIndex: (combat.allies || []).indexOf(allyTarget),
      targetId: allyTarget.id,
      targetName: allyTarget.nameEn,
      targetNameJp: allyTarget.name,
      ...creatureVocabFields(allyTarget, 'target'),
      targetElement: allyTarget.element,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: allyTarget.hp <= 0
    };
  }

  // Reset quiz state — combat resumes normally
  combat.befriendQuiz = null;

  return {
    correct: false,
    counterAttack: counterAttack ? [counterAttack] : [],
    allies: combat.allies,
    enemies: combat.enemies
  };
}

/**
 * Resolve the "Fight" choice in befriend quiz — kill the creature, finalize victory.
 * @param {object} combat - The combat state
 * @returns {{ killed: true }}
 */
export function resolveBefriendFight(combat) {
  const quiz = combat.befriendQuiz;
  if (!quiz) return { error: 'No active befriend quiz' };

  const target = combat.enemies[quiz.targetIndex];
  if (target) {
    target.hp = 0;
  }

  combat.befriendQuiz = null;

  return {
    killed: true,
    allEnemiesDefeated: combat.enemies.every(e => e.hp <= 0 || e.befriended)
  };
}

// ============ OLD BEFRIEND (DISABLED) ============

export function processBefriend(enemies, creatureParty, targetEnemyIndex) {
  // Old befriend mechanic disabled in Koto2 — replaced by name quiz on kill
  return { success: false, reason: 'Befriend mechanic disabled in Koto2' };

  /* eslint-disable no-unreachable */
  const totalCreatures = creatureParty.active.length + creatureParty.reserves.length + (creatureParty.pendingCaptures?.length || 0);
  if (totalCreatures >= creatureParty.maxTotal) {
    return { success: false, reason: 'Party full' };
  }

  let captured;
  if (typeof targetEnemyIndex === 'number' && targetEnemyIndex >= 0) {
    const target = enemies[targetEnemyIndex];
    if (!target || target.hp <= 0 || target.befriended || (target.hp / target.maxHp) > 0.5) {
      return { success: false, reason: 'Target not eligible' };
    }
    captured = target;
  } else {
    // Fallback: pick lowest HP eligible (legacy behavior)
    const eligible = enemies
      .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (eligible.length === 0) {
      return { success: false, reason: 'No enemy at <=50% HP' };
    }
    captured = eligible[0];
  }

  // Mark as captured but don't remove from array (preserve indices for frontend targeting)
  captured.hp = 0;
  captured.befriended = true;

  // Reset for when it joins the party after combat.
  // Fresh uid: the party-bound copy is a new conceptual instance, not an alias
  // of the defeated enemy shell still sitting in combat.enemies[].
  const capturedCopy = { ...captured, uid: crypto.randomUUID(), hp: captured.maxHp, mp: captured.maxMp, befriended: false };

  // Store in pending list — added to party AFTER combat ends
  if (!creatureParty.pendingCaptures) creatureParty.pendingCaptures = [];
  creatureParty.pendingCaptures.push(capturedCopy);

  return {
    success: true,
    captured,
    capturedId: captured.id,
    allEnemiesDefeated: enemies.filter(e => e.hp > 0 && !e.befriended).length === 0
  };
}

/**
 * Roll whether a creature accepts the player's talk attempt before befriending.
 * Base chance depends on rarity; low HP gives a bonus. Capped at 95%.
 * Pure function — does not mutate the enemy object.
 * @param {Object} enemy - The enemy creature (needs hp, maxHp, rarity)
 * @returns {{ accepted: boolean, chance: number }}
 */
const TALK_BASE_CHANCE = { common: 80, uncommon: 65, rare: 50, epic: 35, legendary: 20 };

export function rollTalkAcceptance(enemy) {
  const rarity = enemy.rarity || 'common';
  const base = TALK_BASE_CHANCE[rarity] ?? TALK_BASE_CHANCE.common;
  const hpPct = Math.round((enemy.hp / enemy.maxHp) * 100);
  const hpBonus = hpPct <= 10 ? 15 : hpPct <= 25 ? 10 : 0;
  const chance = Math.min(95, base + hpBonus);
  const roll = Math.random() * 100;
  return { accepted: roll < chance, chance };
}

/**
 * Award XP to all alive equipped creatures when an enemy is killed during combat.
 * XP scales with enemy level: BASE_KILL_XP * enemyLevel * 2 * xpMultiplier.
 * Active creatures get 2 shares, reserves get 1 share.
 * When xpBalanceStacks > 0, XP is redistributed from overleveled to underleveled creatures.
 * Returns per-creature XP amounts and any level-ups that occurred.
 */
export function awardKillXp(creatureParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0, metaMults = null, itemBuffs = null, runPartySkills = [], rng = Math.random) {
  const partySkillXpMultiplier = getXpMultiplier(runPartySkills);
  const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * 2 * partySkillXpMultiplier);
  const activeCreatures = creatureParty.active.filter(r => r && r.hp > 0);
  const reserveCreatures = creatureParty.reserves.filter(r => r != null);
  const totalShares = activeCreatures.length * 2 + reserveCreatures.length * 1;
  if (totalShares === 0) return { xpGrants: [], levelUps: [] };

  const perShare = baseXp / totalShares;

  // Compute initial XP shares per creature (apply per-creature xpMultiplier)
  const entries = [];
  for (const creature of activeCreatures) {
    const cMult = creature.itemBuffs?.xpMultiplier || xpMultiplier || 1.0;
    entries.push({ creature, xp: Math.floor(perShare * 2 * cMult) });
  }
  for (const creature of reserveCreatures) {
    const cMult = creature.itemBuffs?.xpMultiplier || xpMultiplier || 1.0;
    entries.push({ creature, xp: Math.floor(perShare * 1 * cMult) });
  }

  // Apply EXP Balance redistribution
  if (xpBalanceStacks > 0 && entries.length > 1) {
    const totalLevel = entries.reduce((sum, e) => sum + e.creature.level, 0);
    const meanLevel = Math.floor(totalLevel / entries.length);
    const totalXp = entries.reduce((sum, e) => sum + e.xp, 0);
    const recipientCount = entries.filter(e => e.creature.level <= meanLevel).length;

    if (recipientCount > 0) {
      const splitXp = totalXp / recipientCount;
      const t = Math.min(0.2 * xpBalanceStacks, 0.8);

      for (const entry of entries) {
        const isRecipient = entry.creature.level <= meanLevel;
        const target = isRecipient ? splitXp : 0;
        entry.xp = Math.floor(entry.xp + (target - entry.xp) * t);
      }
    }
  }

  // Award XP to creatures and collect results
  const xpGrants = [];
  const levelUps = [];
  const leveledCreatures = new WeakSet();

  for (const entry of entries) {
    const prevLevel = entry.creature.level;
    const creatureLevelUps = addXpToCreature(entry.creature, entry.xp, metaMults, itemBuffs);
    xpGrants.push({ creatureId: entry.creature.id, creatureName: entry.creature.nameEn, xp: entry.xp });
    if (creatureLevelUps.length > 0) {
      leveledCreatures.add(entry.creature);
    }
    for (const lu of creatureLevelUps) {
      levelUps.push({
        creatureId: entry.creature.id,
        creatureName: entry.creature.nameEn,
        oldLevel: prevLevel,
        newLevel: lu.level,
        maxHp: lu.maxHp,
        attack: lu.attack,
        hpGain: lu.hpGain,
        maxMp: lu.maxMp,
        mpGain: lu.mpGain,
        newMove: lu.newMove
      });
    }
  }

  if (getPartySkillLevel(runPartySkills, 'expMaster') >= 5) {
    for (const entry of entries) {
      if (leveledCreatures.has(entry.creature) && rng() < 0.10) {
        const extra = addXpToCreature(entry.creature, xpToNextLevel(entry.creature.level), metaMults, itemBuffs);
        for (const lu of extra) {
          levelUps.push({
            creatureId: entry.creature.id,
            creatureName: entry.creature.nameEn,
            oldLevel: lu.level - 1,
            newLevel: lu.level,
            maxHp: lu.maxHp,
            attack: lu.attack,
            hpGain: lu.hpGain,
            maxMp: lu.maxMp,
            mpGain: lu.mpGain,
            newMove: lu.newMove,
            partySkillBonus: 'expMaster'
          });
        }
      }
    }
  }

  return { xpGrants, levelUps };
}

export function awardBattleXp(creatureParty, metaMults = null, itemBuffs = null) {
  // Befriend victory: each creature gains 1 full level worth of XP
  for (const creature of creatureParty.active) {
    if (creature) addXpToCreature(creature, xpToNextLevel(creature.level), metaMults, itemBuffs);
  }
  for (const creature of creatureParty.reserves) {
    if (creature) addXpToCreature(creature, xpToNextLevel(creature.level), metaMults, itemBuffs);
  }
}

export function handleCreatureKO(creatureParty, koCreatureIndex) {
  // Clear transient combat state off the dying creature before it leaves the
  // active slot. Without this a later resurrect/capture path could restore a
  // creature with lingering stun/poison effects, and any client still holding
  // a reference (e.g. KO animation, attack record) would show stale status
  // pills on the corpse.
  const dying = creatureParty.active[koCreatureIndex];
  if (dying) {
    dying.activeEffects = [];
    resetStatStages(dying);
  }

  if (creatureParty.reserves.length === 0) {
    // No reserve — permanently remove dead creature from party
    creatureParty.active[koCreatureIndex] = null;
    return null;
  }
  const replacement = creatureParty.reserves.shift();
  creatureParty.active[koCreatureIndex] = replacement;
  resetStatStages(replacement);
  return replacement;
}

/**
 * Process a befriend conversation answer.
 * Pure game logic extracted from the /befriend-answer route.
 *
 * @param {object} gameManager - The GameManager instance
 * @param {object} params - { roundIndex, selectedIndex }
 * @returns {object} Result object with response data, or { error, statusCode } on validation failure
 */
export function handleBefriendAnswer(gameManager, { roundIndex, selectedIndex }) {
  const combat = gameManager.combat;

  if (!combat?.active || !combat.befriendConversation?.active) {
    return { error: 'No active befriend conversation', statusCode: 400 };
  }

  const convo = combat.befriendConversation;
  const targetEnemy = combat.enemies[convo.targetEnemyIndex];

  if (roundIndex !== convo.currentRound) {
    return { error: 'Wrong round index', statusCode: 400 };
  }

  const round = convo.rounds[roundIndex];
  if (!round) {
    return { error: 'Invalid round', statusCode: 400 };
  }

  const correct = selectedIndex === round.correctIndex;

  if (!correct) {
    // Failure: clear conversation; initiator's slot stays marked (turn spent)
    combat.befriendConversation = null;

    const enemyResult = processEnemyTurn(
      combat.enemies, combat.allies, false, gameManager.run?.itemBuffs
    );

    // Handle KO'd allies — swap reserves in or permanently remove
    const koSwaps = [];
    const koRemovals = [];
    for (let i = 0; i < combat.allies.length; i++) {
      if (combat.allies[i] && combat.allies[i].hp <= 0) {
        const deadName = combat.allies[i].nameEn || combat.allies[i].name;
        const replacement = handleCreatureKO(gameManager.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
        } else {
          koRemovals.push({ slot: i, name: deadName });
        }
      }
    }
    gameManager.run.creatureParty.active = gameManager.run.creatureParty.active.filter(c => c != null);
    combat.allies = gameManager.run.creatureParty.active;

    const allAlliesKO = combat.allies.length === 0 || combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      combat.active = false;
      gameManager.run.active = false;
    }

    return {
      correct: false,
      correctIndex: round.correctIndex,
      enemyAttacks: enemyResult.attacks || [],
      koSwaps,
      koRemovals,
      combatEnded: allAlliesKO,
      victory: false,
      allies: combat.allies,
      enemies: combat.enemies,
      targetEnemy,
      needsDialogueRegen: true
    };
  }

  // Correct answer
  convo.currentRound++;

  if (convo.currentRound >= 3) {
    // Preserve target BEFORE clearing convo — _handleCreatureBefriendTurn runs after convo is nulled
    combat.lastBefriendTargetIndex = convo.targetEnemyIndex;
    combat.befriendConversation = null;

    const result = gameManager.creatureCombatCycle('befriend');

    return {
      correct: true,
      correctIndex: round.correctIndex,
      conversationComplete: true,
      befriend: result.befriend,
      combatEnded: result.combatEnded || false,
      victory: result.victory || false,
      creatureParty: result.creatureParty,
      enemies: combat.enemies,
      targetEnemy,
      needsDialogueRegen: true
    };
  }

  // Correct but more rounds to go
  return {
    correct: true,
    correctIndex: round.correctIndex,
    conversationComplete: false,
    currentRound: convo.currentRound
  };
}
