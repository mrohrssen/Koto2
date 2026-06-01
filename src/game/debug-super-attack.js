import { createItemBuffs } from './services/item-service.js';

/**
 * Apply +100 baseAttackBonus to all creatures that haven't received it yet.
 * Uses a _debugAtkApplied flag to prevent stacking across combats.
 */
export function applyDebugSuperAttack(creatures) {
  for (const c of creatures) {
    if (!c || c._debugAtkApplied) continue;
    if (!c.itemBuffs) c.itemBuffs = createItemBuffs();
    c.itemBuffs.baseAttackBonus = (c.itemBuffs.baseAttackBonus || 0) + 100;
    c._debugAtkApplied = true;
  }
}

/**
 * Revert lingering +100 ATK debug buffs on creatures previously marked
 * with _debugAtkApplied. Returns true if any creature was changed.
 */
export function cleanupDebugSuperAttack(creatures) {
  let changed = false;
  for (const c of creatures || []) {
    if (!c?._debugAtkApplied) continue;
    if (c.itemBuffs) {
      c.itemBuffs.baseAttackBonus = Math.max(0, (c.itemBuffs.baseAttackBonus || 0) - 100);
    }
    delete c._debugAtkApplied;
    changed = true;
  }
  return changed;
}
