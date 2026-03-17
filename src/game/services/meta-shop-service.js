/**
 * @fileoverview Meta progression shop service
 *
 * Handles upgrade queries, purchases, and bonus multiplier calculation.
 * Pure functions that operate on meta state — no side effects.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPGRADES = JSON.parse(readFileSync(join(__dirname, '../../../data/meta-upgrades.json'), 'utf-8'));
const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

/**
 * Get current meta shop state for display
 * @param {object} meta - Player's meta-progression object
 * @returns {{ progressionTokens: number, upgrades: Array }}
 */
export function getMetaShopState(meta) {
  const upgrades = UPGRADES.map(def => {
    const currentLevel = meta.upgrades?.[def.id] || 0;
    const isMaxed = currentLevel >= def.maxLevel;
    return {
      id: def.id,
      nameEn: def.nameEn,
      description: def.description,
      currentLevel,
      maxLevel: def.maxLevel,
      currentValue: currentLevel > 0 ? def.valuesPerLevel[currentLevel - 1] : 0,
      nextCost: isMaxed ? null : def.costsPerLevel[currentLevel],
      nextValue: isMaxed ? null : def.valuesPerLevel[currentLevel]
    };
  });

  return {
    progressionTokens: meta.progressionTokens || 0,
    upgrades
  };
}

/**
 * Purchase an upgrade level. Mutates meta state.
 * @param {object} meta - Player's meta-progression object
 * @param {string} upgradeId - Upgrade to purchase
 * @returns {{ success: boolean, error?: string }}
 */
export function buyUpgrade(meta, upgradeId) {
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return { success: false, error: 'Upgrade not found' };

  const currentLevel = meta.upgrades?.[upgradeId] || 0;
  if (currentLevel >= def.maxLevel) return { success: false, error: 'Already at max level' };

  const cost = def.costsPerLevel[currentLevel];
  if ((meta.progressionTokens || 0) < cost) return { success: false, error: 'Not enough tokens' };

  meta.progressionTokens -= cost;
  if (!meta.upgrades) meta.upgrades = {};
  meta.upgrades[upgradeId] = currentLevel + 1;
  return { success: true };
}

/**
 * Calculate meta bonus multipliers from current upgrade levels
 * @param {object} meta - Player's meta-progression object
 * @returns {{ hpMult: number, atkMult: number, xpMult: number }}
 */
export function getMetaMultipliers(meta) {
  if (!meta) return { hpMult: 1.0, atkMult: 1.0, xpMult: 1.0 };
  const upgrades = meta.upgrades || {};
  const hpLevel = upgrades.hp_boost || 0;
  const atkLevel = upgrades.atk_boost || 0;
  const xpLevel = upgrades.xp_boost || 0;

  const hpDef = UPGRADES_BY_ID['hp_boost'];
  const atkDef = UPGRADES_BY_ID['atk_boost'];
  const xpDef = UPGRADES_BY_ID['xp_boost'];

  return {
    hpMult: hpLevel > 0 ? 1 + hpDef.valuesPerLevel[hpLevel - 1] / 100 : 1.0,
    atkMult: atkLevel > 0 ? 1 + atkDef.valuesPerLevel[atkLevel - 1] / 100 : 1.0,
    xpMult: xpLevel > 0 ? 1 + xpDef.valuesPerLevel[xpLevel - 1] / 100 : 1.0
  };
}
