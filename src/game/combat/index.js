/**
 * Combat System - Main Entry Point
 * Re-exports all combat functions from submodules
 */

// Combat mechanics
export {
  getPlayerCombatStats,
  getEnemyCombatStats,
  resolvePhysicalAttack,
  resolveMagicAttack,
  PLAYER_ATTACK_TYPES,
  determineTurnOrder,
  getAttackPreview,
  getEnemyAttackPreview
} from './mechanics.js';

// Player actions
export {
  executePlayerAttack
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

// Rewards
export {
  processVictory,
  processBossVictory
} from './rewards.js';
