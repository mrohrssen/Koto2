/**
 * Combat System - Re-export for backwards compatibility
 * All combat functions are now in the combat/ directory
 */

export {
  // Status effects
  STATUS_EFFECTS,
  applyStatusEffect,
  hasStatusEffect,
  removeStatusEffect,
  getActiveStatusEffects,
  breakDamageEffects,
  tickStatusEffects,
  tickEnemyStatusEffects,

  // Combat mechanics
  PLAYER_ATTACK_TYPES,
  determineTurnOrder,
  getAttackPreview,
  getEnemyAttackPreview,

  // Player actions
  executePlayerAttack,

  // Enemy combat
  executeEnemyTurn,
  isEnemyDefending,
  applyDamageToEnemy,
  checkEnemyAbility,
  getPassiveDamageReduction,
  checkEnemyBarrier,
  breakEnemyBarrier,
  isEnemyVanished,
  tickEnemyVanish,

  // Rewards
  processVictory,
  processBossVictory
} from './combat/index.js';
