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
  executeAttack,
  executeMagic,
  executeDefend,
  executeItem,
  attemptFlee,
  hasTeleportAbility,
  applyPassiveRegen,

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

  // Rewards and refinement
  processVictory,
  processBossVictory,
  attemptRefinement,
  getRefinementPreview,
  processCounterAttack
} from './combat/index.js';
