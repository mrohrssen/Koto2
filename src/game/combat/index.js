/**
 * Combat System - Main Entry Point
 * Re-exports all combat functions from submodules
 */

// Status effects
export {
  STATUS_EFFECTS,
  getStatusEffectDef,
  applyStatusEffect,
  hasStatusEffect,
  removeStatusEffect,
  getActiveStatusEffects,
  breakDamageEffects,
  tickStatusEffects,
  tickEnemyStatusEffects
} from './status-effects.js';

// Combat mechanics
export {
  getPlayerCombatStats,
  getEnemyCombatStats,
  resolvePhysicalAttack,
  resolveMagicAttack,
  PLAYER_ATTACK_TYPES,
  calculateStaggerChance,
  calculateExhaustChance,
  determineTurnOrder,
  getAttackPreview,
  getEnemyAttackPreview
} from './mechanics.js';

// Player actions
export {
  executePlayerAttack,
  executeAttack,
  executeMagic,
  executeDefend,
  executeItem,
  attemptFlee,
  hasTeleportAbility,
  applyPassiveRegen
} from './player-actions.js';

// Enemy combat
export {
  executeEnemyTurn,
  isEnemyDefending,
  applyDamageToEnemy,
  checkEnemyAbility,
  getPassiveDamageReduction,
  checkEnemyBarrier,
  breakEnemyBarrier,
  isEnemyVanished,
  tickEnemyVanish
} from './enemy.js';

// Rewards and refinement
export {
  processVictory,
  processBossVictory,
  attemptRefinement,
  getRefinementPreview,
  processCounterAttack
} from './rewards.js';
