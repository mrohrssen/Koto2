/**
 * Player Actions
 * All player combat action execution
 */

import { executeChipPipeline, getWeaponPipelineChips } from '../items.js';
import {
  breakDamageEffects
} from './status-effects.js';
import {
  getPlayerCombatStats,
  getEnemyCombatStats,
  resolvePhysicalAttack,
  PLAYER_ATTACK_TYPES
} from './mechanics.js';
import { consumeBuffsByType } from './chip-skills.js';

// ============ PLAYER ATTACK EXECUTION ============

/**
 * Execute player physical attack
 * @param {object} player - The player
 * @param {object} enemy - The enemy
 * @param {string} attackType - Attack type (only 'normal' supported)
 */
export function executePlayerAttack(player, enemy, attackType = 'normal') {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);
  const attackDef = PLAYER_ATTACK_TYPES[attackType] || PLAYER_ATTACK_TYPES.normal;

  let result = {
    action: 'attack',
    attackType: attackDef,
    hits: [],
    totalDamage: 0,
    anyHit: false,
    anyCritical: false,
    anyDodge: false,
    anyPerfectDodge: false,
    hitChance: 0,
    critChance: 0,
    enemyDefeated: false
  };

  const attackResult = resolvePhysicalAttack(playerStats, enemyStats, attackDef.damageMultiplier);
  result.hits.push(attackResult);
  result.hitChance = attackResult.hitChance;
  result.critChance = attackResult.critChance;

  if (attackResult.hit) {
    result.anyHit = true;

    // --- PRE_PIPELINE buffs: add flat bonuses to base damage ---
    let baseDamage = attackResult.damage;
    const preBuffs = consumeBuffsByType(player, 'PRE_PIPELINE');
    for (const buff of preBuffs) {
      if (buff.condition === 'emptySlots>=2') {
        const weapon = player.equipment?.weapon;
        const empty = 5 - (weapon?.equippedChips?.length || 0);
        if (empty >= 2) baseDamage += buff.effect.flatBonus;
      } else if (buff.effect.flatBonusPerEmpty) {
        const weapon = player.equipment?.weapon;
        const empty = 5 - (weapon?.equippedChips?.length || 0);
        baseDamage += buff.effect.flatBonusPerEmpty * empty;
      } else if (buff.effect.flatBonusPerEquipped) {
        const weapon = player.equipment?.weapon;
        const equipped = weapon?.equippedChips?.length || 0;
        baseDamage += buff.effect.flatBonusPerEquipped * equipped;
      } else if (buff.effect.flatBonus) {
        baseDamage += buff.effect.flatBonus;
      }
    }

    // --- PIPELINE_MODIFIER buffs: alter pipeline execution ---
    const modBuffs = consumeBuffsByType(player, 'PIPELINE_MODIFIER');
    const runTwice = modBuffs.some(b => b.effect.runTwice);
    const nextChipDouble = modBuffs.some(b => b.effect.nextChipDouble);
    const nextChipAmplifyBuff = modBuffs.find(b => b.effect.nextChipAmplify);
    const nextChipAmplify = nextChipAmplifyBuff ? nextChipAmplifyBuff.effect.nextChipAmplify : null;

    // Get weapon chips in slot order and execute pipeline
    const weaponChips = getWeaponPipelineChips(player);
    if (weaponChips.length > 0) {
      const weapon = player.equipment?.weapon;
      const weaponMaxSlots = 5;
      const weaponUsedSlots = weapon?.equippedChips?.length || 0;

      const pipelineContext = {
        baseDamage,
        isCrit: attackResult.critical,
        critChance: attackResult.critChance,
        target: enemy,
        combatStacks: player._combatStacks || {},
        weaponMaxSlots,
        weaponUsedSlots,
        runKills: player._runKills || 0,
        runChipsDestroyed: player._runChipsDestroyed || 0,
        player,
        nextChipDouble,
        nextChipAmplify
      };

      const pipelineResult = executeChipPipeline(weaponChips, pipelineContext);

      if (runTwice) {
        const secondResult = executeChipPipeline(weaponChips, {
          ...pipelineContext,
          combatStacks: pipelineResult.combatStacks
        });
        pipelineResult.finalDamage += secondResult.finalDamage;
        pipelineResult.healPlayer = (pipelineResult.healPlayer || 0) + (secondResult.healPlayer || 0);
        pipelineResult.secondRunFiredChips = secondResult.firedChips;
      }

      player._combatStacks = pipelineResult.combatStacks;
      result.totalDamage = pipelineResult.finalDamage;
      result.pipelineResult = pipelineResult;
    } else {
      result.totalDamage = baseDamage;
    }

    // --- POST_PIPELINE buffs: multiply final damage ---
    const postBuffs = consumeBuffsByType(player, 'POST_PIPELINE');
    for (const buff of postBuffs) {
      if (buff.condition === 'enemyBelow30' && enemy.hp / enemy.maxHp >= 0.3) continue;
      if (buff.condition === 'isBoss' && !enemy.isBoss) continue;
      result.totalDamage = Math.floor(result.totalDamage * buff.effect.multiplier);
    }
  }
  if (attackResult.critical) {
    result.anyCritical = true;
  }
  if (attackResult.dodge) result.anyDodge = true;
  if (attackResult.perfectDodge) result.anyPerfectDodge = true;

  // Apply damage to enemy
  enemy.hp = Math.max(0, enemy.hp - result.totalDamage);
  result.enemyDefeated = enemy.hp <= 0;

  // Break damage-sensitive status effects (like SLEEP)
  if (result.totalDamage > 0) {
    const brokenEffects = breakDamageEffects(enemy);
    if (brokenEffects.length > 0) {
      result.wokenFromSleep = brokenEffects.some(e => e.id === 'sleep');
    }
  }

  return result;
}

