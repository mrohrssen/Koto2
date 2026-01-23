/**
 * Enemy Combat System
 * Enemy turn execution, abilities, and related functions
 */

import { calculateEquipmentBonuses } from '../items.js';
import { ENEMY_ABILITIES, getEnemyAbility } from '../enemies.js';
import {
  breakDamageEffects,
  getDamageTakenMultiplier
} from './status-effects.js';
import {
  getPlayerCombatStats,
  getEnemyCombatStats,
  resolvePhysicalAttack,
  resolveMagicAttack
} from './mechanics.js';

// ============ ENEMY TURN EXECUTION ============

/**
 * Execute enemy turn based on their current intent
 * @param {object} enemy - The enemy
 * @param {object} player - The player
 * @param {object} intent - The enemy's current intent (from INTENT_TYPES)
 * @param {function} processCounterAttack - Counter-attack processor function
 */
export function executeEnemyTurn(enemy, player, intent = null, processCounterAttack = null) {
  const playerStats = getPlayerCombatStats(player);
  const enemyStats = getEnemyCombatStats(enemy);

  // EXPOSED status is now handled via getDamageTakenMultiplier() in damage calculations

  // Check if player is defending
  const isDefending = (player.statuses || []).some(s => s.id === 'defending');

  // Default to attack intent if none provided (backwards compatibility)
  const currentIntent = intent || { id: 'attack', damageMultiplier: 1.0 };

  let result = {
    action: 'enemy_attack',
    intent: currentIntent,
    hit: false,
    miss: false,
    dodge: false,
    perfectDodge: false,
    critical: false,
    damage: 0,
    originalDamage: 0,
    wasDefending: isDefending,
    playerDefeated: false
  };

  // Execute based on intent type
  switch (currentIntent.id) {
    case 'defend':
      // Enemy defends - no attack, gains defense buff
      result.action = 'enemy_defend';
      result.defending = true;
      enemy.statuses = enemy.statuses || [];
      enemy.statuses.push({
        id: 'defending',
        effect: 'damageReduction',
        amount: 0.5,
        turnsRemaining: 1
      });
      break;

    case 'special':
      // Special ability - handled separately, for now treat as magic attack
      result.action = 'enemy_special';
      const specialResult = resolveMagicAttack(enemyStats, playerStats, 1.2);
      result.hit = true;
      result.damage = specialResult.damage;
      result.originalDamage = specialResult.damage;

      // Apply defending damage reduction
      if (isDefending) {
        result.damage = Math.floor(result.damage * 0.5);
      }

      player.hp = Math.max(0, player.hp - result.damage);
      result.playerDefeated = player.hp <= 0;

      // Process counter-attack if player took damage and survived
      if (result.damage > 0 && !result.playerDefeated && processCounterAttack) {
        const counterResult = processCounterAttack(player, enemy, result.damage);
        if (counterResult) {
          result.counterAttack = counterResult;
        }
      }
      break;

    case 'attack':
    case 'heavy':
    case 'rage':
    default:
      // Physical attack with damage multiplier from intent
      const damageMultiplier = currentIntent.damageMultiplier || 1.0;
      const attackResult = resolvePhysicalAttack(enemyStats, playerStats, damageMultiplier);

      result.hit = attackResult.hit;
      result.miss = attackResult.miss;
      result.dodge = attackResult.dodge;
      result.perfectDodge = attackResult.perfectDodge;
      result.critical = attackResult.critical;
      result.hitChance = attackResult.hitChance;
      result.critChance = attackResult.critChance;
      result.originalDamage = attackResult.damage;

      let finalDamage = attackResult.damage;

      // Apply defending damage reduction
      if (isDefending && attackResult.hit) {
        finalDamage = Math.floor(finalDamage * 0.5);
      }

      result.damage = finalDamage;

      // Apply damage to player
      player.hp = Math.max(0, player.hp - finalDamage);
      result.playerDefeated = player.hp <= 0;

      // Break damage-sensitive status effects on player (like SLEEP)
      if (finalDamage > 0) {
        const brokenEffects = breakDamageEffects(player);
        if (brokenEffects.length > 0) {
          result.playerWoken = brokenEffects.some(e => e.id === 'sleep');
        }
      }

      // Track if this was a heavy/rage attack for narration
      result.isHeavy = currentIntent.id === 'heavy';
      result.isRage = currentIntent.id === 'rage';

      // Process counter-attack if player took damage and survived
      if (finalDamage > 0 && !result.playerDefeated && processCounterAttack) {
        const counterResult = processCounterAttack(player, enemy, finalDamage);
        if (counterResult) {
          result.counterAttack = counterResult;
        }
      }
      break;
  }

  return result;
}

/**
 * Check if enemy is defending (takes reduced damage)
 */
export function isEnemyDefending(enemy) {
  if (!enemy.statuses) return false;
  return enemy.statuses.some(s => s.id === 'defending');
}

/**
 * Apply damage to enemy, accounting for their defense status and EXPOSED multiplier
 */
export function applyDamageToEnemy(enemy, damage) {
  let finalDamage = damage;

  // Apply EXPOSED status damage multiplier (takes more damage when exposed)
  const damageMultiplier = getDamageTakenMultiplier(enemy);
  if (damageMultiplier > 1.0) {
    finalDamage = Math.floor(finalDamage * damageMultiplier);
  }

  // Check for defending status (reduces damage by 50%)
  if (isEnemyDefending(enemy)) {
    finalDamage = Math.floor(finalDamage * 0.5);
  }

  enemy.hp = Math.max(0, enemy.hp - finalDamage);

  return {
    originalDamage: damage,
    finalDamage,
    wasDefending: isEnemyDefending(enemy),
    wasExposed: damageMultiplier > 1.0,
    enemyDefeated: enemy.hp <= 0
  };
}

// ============ ENEMY ABILITIES ============

/**
 * Check and trigger enemy abilities based on the current trigger type
 * @param {object} enemy - The enemy
 * @param {object} player - The player
 * @param {string} trigger - The trigger type ('onLowHp', 'onTurn', 'onDeath', 'onDefend', 'special', 'passive')
 * @param {object} context - Additional context (turnCount, damage dealt, etc.)
 * @returns {object|null} Ability result or null if no ability triggered
 */
export function checkEnemyAbility(enemy, player, trigger, context = {}) {
  const ability = getEnemyAbility(enemy.id);
  if (!ability || ability.trigger !== trigger) {
    return null;
  }

  // Check if ability already used (for one-time abilities)
  if (ability.uses && (enemy.abilityUsed?.[ability.id] >= ability.uses)) {
    return null;
  }

  // Check specific trigger conditions
  switch (trigger) {
    case 'onLowHp': {
      const hpPercent = enemy.hp / enemy.maxHp;
      if (hpPercent > ability.threshold) {
        return null;
      }
      // Only trigger once when crossing threshold
      if (enemy.lowHpAbilityTriggered) {
        return null;
      }
      enemy.lowHpAbilityTriggered = true;
      break;
    }

    case 'onTurn': {
      const turn = context.turnCount || 1;
      // Check for specific turn trigger
      if (ability.turnNumber && turn !== ability.turnNumber) {
        return null;
      }
      // Check for interval trigger
      if (ability.turnInterval && turn % ability.turnInterval !== 0) {
        return null;
      }
      break;
    }

    case 'onDeath': {
      if (enemy.hp > 0) {
        return null;
      }
      break;
    }

    case 'onDefend': {
      // Only triggers when enemy is defending
      if (!context.isDefending) {
        return null;
      }
      break;
    }

    case 'special': {
      // Only triggers during special intent
      if (context.intent?.id !== 'special') {
        return null;
      }
      break;
    }

    case 'passive': {
      // Always active - handled differently in damage calculations
      return { type: 'passive', ability };
    }
  }

  // Execute the ability
  return executeEnemyAbility(enemy, player, ability, context);
}

/**
 * Execute an enemy ability
 */
function executeEnemyAbility(enemy, player, ability, context) {
  // Track ability use
  enemy.abilityUsed = enemy.abilityUsed || {};
  enemy.abilityUsed[ability.id] = (enemy.abilityUsed[ability.id] || 0) + 1;

  const result = {
    type: 'ability',
    ability: ability,
    effects: []
  };

  switch (ability.effect) {
    case 'split': {
      // Slime splits into two mini-slimes
      result.split = true;
      result.newEnemies = [
        { ...enemy, hp: Math.floor(enemy.maxHp * 0.4), maxHp: Math.floor(enemy.maxHp * 0.4), name: 'ミニスライム' },
        { ...enemy, hp: Math.floor(enemy.maxHp * 0.4), maxHp: Math.floor(enemy.maxHp * 0.4), name: 'ミニスライム' }
      ];
      result.effects.push({ type: 'split', message: `${enemy.name}が分裂した！` });
      break;
    }

    case 'summon': {
      // Call for backup - summon another enemy
      result.summon = true;
      result.summonId = ability.summonId;
      result.effects.push({ type: 'summon', message: `${enemy.name}が仲間を呼んだ！` });
      break;
    }

    case 'buff': {
      // Apply a buff to self (e.g., wolf cornered)
      const buffAmount = Math.floor(enemy.atk * ability.buffAmount);
      enemy.atk += buffAmount;
      enemy.buffed = true;
      result.effects.push({
        type: 'buff',
        stat: ability.buffType,
        amount: buffAmount,
        message: `${enemy.name}の攻撃力が上がった！`
      });
      break;
    }

    case 'revive': {
      // Revive with percentage HP (skeleton)
      const reviveHp = Math.floor(enemy.maxHp * ability.revivePercent);
      enemy.hp = reviveHp;
      result.revive = true;
      result.effects.push({
        type: 'revive',
        hp: reviveHp,
        message: `${enemy.name}が復活した！`
      });
      break;
    }

    case 'berserk': {
      // Double attack, halve defense (orc)
      enemy.atk = Math.floor(enemy.atk * ability.atkMultiplier);
      enemy.def = Math.floor(enemy.def * ability.defMultiplier);
      enemy.berserk = true;
      result.effects.push({
        type: 'berserk',
        message: `${enemy.name}が狂暴化した！攻撃力上昇、防御力低下！`
      });
      break;
    }

    case 'barrier': {
      // Create magic barrier (mage)
      enemy.barrier = true;
      enemy.barrierStrength = 1; // Absorbs 1 hit
      result.effects.push({
        type: 'barrier',
        message: `${enemy.name}が魔法障壁を張った！`
      });
      break;
    }

    case 'counter': {
      // Counter attack (knight riposte)
      const counterDamage = Math.floor(context.damageReceived * ability.counterDamage);
      player.hp = Math.max(0, player.hp - counterDamage);
      result.effects.push({
        type: 'counter',
        damage: counterDamage,
        message: `${enemy.name}の反撃！${counterDamage}ダメージ！`
      });
      result.counterDamage = counterDamage;
      break;
    }

    case 'magic': {
      // Magic attack (demon hellfire)
      const magicDamage = Math.floor(enemy.matk * ability.magicMultiplier);
      player.hp = Math.max(0, player.hp - magicDamage);
      result.effects.push({
        type: 'magic',
        damage: magicDamage,
        message: `${enemy.name}の業火！${magicDamage}ダメージ！`
      });
      result.damage = magicDamage;
      result.playerDefeated = player.hp <= 0;
      break;
    }

    case 'vanish': {
      // Become untargetable (shadow)
      enemy.vanished = true;
      enemy.vanishTurns = 1;
      result.effects.push({
        type: 'vanish',
        message: `${enemy.name}が姿を消した！`
      });
      break;
    }

    case 'breath': {
      // Dragon breath attack
      const breathDamage = Math.floor(enemy.matk * ability.breathMultiplier);
      player.hp = Math.max(0, player.hp - breathDamage);
      result.effects.push({
        type: 'breath',
        damage: breathDamage,
        message: `${enemy.name}の竜の息！${breathDamage}ダメージ！`
      });
      result.damage = breathDamage;
      result.playerDefeated = player.hp <= 0;
      break;
    }

    case 'resistance': {
      // Passive damage resistance (golem) - handled in damage calculation
      result.effects.push({
        type: 'resistance',
        message: `${enemy.name}は岩の体で攻撃を軽減した！`
      });
      break;
    }
  }

  return result;
}

/**
 * Check for passive ability damage reduction
 */
export function getPassiveDamageReduction(enemy) {
  const ability = getEnemyAbility(enemy.id);
  if (!ability || ability.trigger !== 'passive') {
    return 0;
  }

  if (ability.effect === 'resistance' && ability.physicalResist) {
    return ability.physicalResist;
  }

  return 0;
}

/**
 * Check if enemy has barrier up
 */
export function checkEnemyBarrier(enemy) {
  return enemy.barrier && enemy.barrierStrength > 0;
}

/**
 * Break enemy barrier
 */
export function breakEnemyBarrier(enemy) {
  if (enemy.barrier && enemy.barrierStrength > 0) {
    enemy.barrierStrength--;
    if (enemy.barrierStrength <= 0) {
      enemy.barrier = false;
    }
    return true; // Barrier absorbed the hit
  }
  return false;
}

/**
 * Check if enemy is vanished (untargetable)
 */
export function isEnemyVanished(enemy) {
  return enemy.vanished && enemy.vanishTurns > 0;
}

/**
 * Tick vanish duration
 */
export function tickEnemyVanish(enemy) {
  if (enemy.vanished && enemy.vanishTurns > 0) {
    enemy.vanishTurns--;
    if (enemy.vanishTurns <= 0) {
      enemy.vanished = false;
      return true; // Vanish ended
    }
  }
  return false;
}
