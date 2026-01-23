/**
 * Chip Skills System
 *
 * PURPOSE: Manages chip skill activation (instant effects + buff placement)
 * and buff lifecycle (add, consume by type, clear).
 *
 * BUFF TYPES:
 * - PRE_PIPELINE: Flat bonuses added to baseDamage before pipeline
 * - POST_PIPELINE: Multipliers applied to finalDamage after pipeline
 * - PIPELINE_MODIFIER: Changes how pipeline executes (runTwice, nextChipDouble)
 * - DEFENSIVE: Checked when player takes lethal damage
 *
 * KEY EXPORTS:
 * Constants:
 * - BUFF_TYPES - Enum of buff type strings
 *
 * Functions:
 * - addBuff(player, buff) - Push a buff onto player._activeBuffs
 * - consumeBuffsByType(player, type) - Remove and return all buffs of given type
 * - clearAllBuffs(player) - Remove all active buffs
 * - hasDefensiveBuff(player) - Check if any DEFENSIVE buff exists
 * - executeInstantSkill(player, enemy, chip) - Execute instant skill effects
 * - activateBuffSkill(player, chip) - Place a buff from chip skill
 * - useChipSkill(player, enemy, chipId) - Top-level skill use (validates + executes)
 *
 * DEPENDENCIES:
 * - ../items/chips.js - getChip, isChipSkillReady, resetChipCharge
 */

import { getChip, resetChipCharge, isChipSkillReady } from '../items/chips.js';

// ============ BUFF TYPE CONSTANTS ============

export const BUFF_TYPES = {
  PRE_PIPELINE: 'PRE_PIPELINE',
  POST_PIPELINE: 'POST_PIPELINE',
  PIPELINE_MODIFIER: 'PIPELINE_MODIFIER',
  DEFENSIVE: 'DEFENSIVE'
};

// ============ BUFF MANAGEMENT ============

/**
 * Add a buff to the player's active buff list.
 * Initializes _activeBuffs array if not present.
 */
export function addBuff(player, buff) {
  if (!player._activeBuffs) player._activeBuffs = [];
  player._activeBuffs.push(buff);
}

/**
 * Remove and return all buffs matching the given type.
 * Returns empty array if no matching buffs found.
 */
export function consumeBuffsByType(player, type) {
  if (!player._activeBuffs) return [];
  const matching = player._activeBuffs.filter(b => b.buffType === type);
  player._activeBuffs = player._activeBuffs.filter(b => b.buffType !== type);
  return matching;
}

/**
 * Remove all active buffs from the player.
 */
export function clearAllBuffs(player) {
  player._activeBuffs = [];
}

/**
 * Check if the player has any DEFENSIVE buff active.
 */
export function hasDefensiveBuff(player) {
  return (player._activeBuffs || []).some(b => b.buffType === BUFF_TYPES.DEFENSIVE);
}

// ============ INSTANT SKILL EXECUTION ============

/**
 * Execute an instant-type chip skill.
 * Applies damage to enemy and/or healing to player immediately.
 *
 * Supported effect fields:
 * - damage: flat damage dealt to enemy
 * - heal: flat HP restored to player
 * - damageFromStacks: use combat stacks * stackMultiplier as damage
 * - damageFromKills: use run kills * killMultiplier as damage
 * - damageFromAttack: use player.attack * attackMultiplier as damage
 */
export function executeInstantSkill(player, enemy, chip) {
  const skill = chip.skill;
  const result = { damage: 0, heal: 0 };

  if (skill.effect.damage) {
    result.damage = skill.effect.damage;
  }
  if (skill.effect.heal) {
    result.heal = skill.effect.heal;
  }
  if (skill.effect.damageFromStacks) {
    const stacks = player._combatStacks?.[chip.id] || 0;
    result.damage = skill.effect.stackMultiplier * stacks;
  }
  if (skill.effect.damageFromKills) {
    result.damage = (player._runKills || 0) * skill.effect.killMultiplier;
  }
  if (skill.effect.damageFromAttack) {
    result.damage = player.attack * skill.effect.attackMultiplier;
  }

  // Apply effects
  if (result.damage > 0 && enemy) {
    enemy.hp = Math.max(0, enemy.hp - result.damage);
  }
  if (result.heal > 0) {
    player.hp = Math.min(player.maxHp, player.hp + result.heal);
  }

  return result;
}

// ============ BUFF SKILL ACTIVATION ============

/**
 * Activate a buff-type chip skill.
 * Creates a buff object and adds it to the player's active buffs.
 * The buff effect is shallow-copied to avoid mutating chip data.
 */
export function activateBuffSkill(player, chip) {
  const skill = chip.skill;
  const buff = {
    id: skill.id,
    chipId: chip.id,
    buffType: skill.buffType,
    effect: { ...skill.effect },
    condition: skill.condition || null
  };
  addBuff(player, buff);
  return buff;
}

// ============ TOP-LEVEL SKILL USE ============

/**
 * Use a chip's skill. Validates the chip is equipped and charged,
 * then dispatches to instant or buff execution.
 *
 * Returns { success, error? } on failure, or
 * { success, skillName, skillNameEn, chipId, skillType, ...effectResults } on success.
 */
export function useChipSkill(player, enemy, chipId) {
  const equippedChips = player.equipment?.weapon?.equippedChips || [];
  if (!equippedChips.includes(chipId)) {
    return { success: false, error: 'Chip not equipped' };
  }

  const chip = getChip(chipId);
  if (!chip?.skill) {
    return { success: false, error: 'Chip has no skill' };
  }

  if (!isChipSkillReady(player, chipId)) {
    return { success: false, error: 'Skill not charged' };
  }

  let result;
  if (chip.skill.type === 'instant') {
    const instantResult = executeInstantSkill(player, enemy, chip);
    result = { skillType: 'instant', ...instantResult };
  } else if (chip.skill.type === 'buff') {
    const buff = activateBuffSkill(player, chip);
    result = { skillType: 'buff', buffApplied: buff };
  } else {
    return { success: false, error: 'Unknown skill type' };
  }

  resetChipCharge(player, chipId);

  return {
    success: true,
    skillName: chip.skill.name,
    skillNameEn: chip.skill.nameEn,
    chipId,
    ...result
  };
}
