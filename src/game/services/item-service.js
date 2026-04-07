import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { applyTempAttackFlat } from '../combat/effects.js';
import { awardKillXp } from './creature-combat-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../../data/items.json'), 'utf8'));

// Rarity weights for shop rolling — common items appear more often
const RARITY_WEIGHTS = {
  common: 40,
  uncommon: 30,
  rare: 18,
  epic: 9,
  legendary: 3
};

export function createItemBuffs() {
  return {
    attackMult: 1.0,
    hpMult: 1.0,
    elementEdge: 0,
    flatDamageReduction: 0,
    xpMultiplier: 1.0,
    xpBalanceStacks: 0,
    baseAttackBonus: 0,
    baseHpBonus: 0,
    baseMpBonus: 0
  };
}

export function rollShopItems() {
  // Build weighted pool
  const pool = [];
  for (const item of ITEMS) {
    const weight = RARITY_WEIGHTS[item.rarity] || RARITY_WEIGHTS.common;
    for (let i = 0; i < weight; i++) {
      pool.push(item);
    }
  }

  const selected = [];
  const usedIds = new Set();
  for (let i = 0; i < 3; i++) {
    // Filter out already-selected items
    const available = pool.filter(item => !usedIds.has(item.id));
    if (available.length === 0) break;
    const idx = Math.floor(Math.random() * available.length);
    const pick = available[idx];
    selected.push({ ...pick });
    usedIds.add(pick.id);
  }
  return selected;
}

const MULT_FIELDS = new Set(['attackMult', 'hpMult', 'xpMultiplier']);
const BASE_BONUS_FIELDS = new Set(['baseAttackBonus', 'baseHpBonus', 'baseMpBonus']);

function applyStat(field, value, itemBuffs) {
  if (!itemBuffs || value == null || Number.isNaN(Number(value))) return;
  const delta = Number(value);
  if (field === 'flatDamageReduction') {
    itemBuffs[field] = (itemBuffs[field] || 0) + delta;
    return;
  }
  if (BASE_BONUS_FIELDS.has(field)) {
    itemBuffs[field] = (itemBuffs[field] || 0) + delta;
    return;
  }
  if (MULT_FIELDS.has(field)) {
    const prev = itemBuffs[field] ?? 1.0;
    itemBuffs[field] = prev + delta;
    return;
  }
  if (field === 'elementEdge') {
    itemBuffs.elementEdge = (itemBuffs.elementEdge || 0) + delta;
    return;
  }
  if (itemBuffs[field] !== undefined) {
    itemBuffs[field] = (itemBuffs[field] || 1.0) + delta;
  }
}

/** Merge missing keys so old/partial saves still receive food & equipment boosts */
function ensureItemBuffShape(itemBuffs) {
  if (!itemBuffs || typeof itemBuffs !== 'object') return;
  const defaults = createItemBuffs();
  for (const key of Object.keys(defaults)) {
    if (itemBuffs[key] === undefined) itemBuffs[key] = defaults[key];
  }
}

/**
 * Scale all party creatures' HP when itemBuffs.hpMult changes (equipment HP boosts).
 * Combat still uses raw maxHp on the creature object; this keeps stored HP in sync with the multiplier.
 * @param {{ active: Array, reserves: Array }} creatureParty
 * @param {number} ratio - newHpMult / oldHpMult (e.g. 1.1 / 1.0 after +10%)
 */
export function scalePartyHpForBuffRatio(creatureParty, ratio) {
  if (!creatureParty || !Number.isFinite(ratio) || ratio <= 0 || ratio === 1) return;
  const all = [...(creatureParty.active || []), ...(creatureParty.reserves || [])].filter(Boolean);
  for (const c of all) {
    c.maxHp = Math.max(1, Math.floor(c.maxHp * ratio));
    c.hp = Math.min(c.maxHp, Math.max(0, Math.floor(c.hp * ratio)));
  }
}


/** Level multiplier matching getStatsForLevel in creatures.js */
function levelMult(level) {
  return 1 + ((level || 1) - 1) * 0.1;
}

/**
 * Adjust a single creature's maxHp/maxMp when its base bonus changes.
 */
function applyBaseBonusToCreature(creature, itemBuffs, prevHpBonus, prevMpBonus) {
  if (!creature) return;
  const mult = levelMult(creature.level);
  const hpDelta = (itemBuffs.baseHpBonus || 0) - prevHpBonus;
  const mpDelta = (itemBuffs.baseMpBonus || 0) - prevMpBonus;
  if (hpDelta !== 0) {
    const gain = Math.floor(hpDelta * mult);
    creature.maxHp = Math.max(1, creature.maxHp + gain);
    if (gain > 0) creature.hp = Math.min(creature.maxHp, creature.hp + gain);
    else creature.hp = Math.min(creature.maxHp, Math.max(0, creature.hp));
  }
  if (mpDelta !== 0) {
    const gain = Math.floor(mpDelta * mult);
    creature.maxMp = Math.max(0, (creature.maxMp || 0) + gain);
    if (gain > 0) creature.mp = Math.min(creature.maxMp, (creature.mp || 0) + gain);
    else creature.mp = Math.min(creature.maxMp, Math.max(0, creature.mp || 0));
  }
}

/** Ensure target creature has an itemBuffs object, create if missing */
function ensureCreatureBuffs(creature) {
  if (!creature.itemBuffs) creature.itemBuffs = createItemBuffs();
  ensureItemBuffShape(creature.itemBuffs);
  if (!creature.equippedItems) creature.equippedItems = [];
}

export function applyItem(item, creatureParty, _itemBuffs, targetIndex = null, context = null) {
  if (!creatureParty) return { applied: false };
  const allCreatures = [...creatureParty.active, ...creatureParty.reserves].filter(Boolean);
  const targetCreature = targetIndex !== null ? creatureParty.active[targetIndex] : allCreatures[0];
  if (targetCreature) ensureCreatureBuffs(targetCreature);

  if (item.type === 'heal') {
    if (item.effect.healPercent) {
      const target = targetCreature && targetCreature.hp > 0 ? targetCreature : (() => {
        const alive = allCreatures.filter(r => r.hp > 0);
        return alive.length > 0 ? alive.reduce((min, r) => r.hp < min.hp ? r : min, alive[0]) : null;
      })();
      if (target && target.hp > 0) {
        const heal = Math.floor(target.maxHp * item.effect.healPercent);
        target.hp = Math.min(target.maxHp, target.hp + heal);
      }
    }
    if (item.effect.healAllPercent) {
      const alive = allCreatures.filter(r => r.hp > 0);
      for (const creature of alive) {
        const heal = Math.floor(creature.maxHp * item.effect.healAllPercent);
        creature.hp = Math.min(creature.maxHp, creature.hp + heal);
      }
    }
    if (item.effect.healMostDamaged) {
      const alive = allCreatures.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const mostDamaged = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        mostDamaged.hp = mostDamaged.maxHp;
      }
    }
    return { applied: true };
  }

  if (item.type === 'boost') {
    if (!targetCreature) return { applied: false };
    const buffs = targetCreature.itemBuffs;
    const prevHpBonus = buffs.baseHpBonus || 0;
    const prevMpBonus = buffs.baseMpBonus || 0;
    const prevHpMult = buffs.hpMult ?? 1.0;
    // Single stat: { field, value }
    if (item.effect.field != null && item.effect.value != null) {
      applyStat(item.effect.field, item.effect.value, buffs);
    }
    // Multi stat: { stats: [{ field, value }, ...] }
    if (item.effect.stats) {
      for (const { field, value } of item.effect.stats) {
        applyStat(field, value, buffs);
      }
    }
    // Scale this creature's HP/MP for base bonus changes
    if ((buffs.baseHpBonus || 0) !== prevHpBonus || (buffs.baseMpBonus || 0) !== prevMpBonus) {
      applyBaseBonusToCreature(targetCreature, buffs, prevHpBonus, prevMpBonus);
    }
    // Scale creature HP when hpMult changes (food items)
    const newHpMult = buffs.hpMult ?? 1.0;
    if (newHpMult !== prevHpMult) {
      const ratio = newHpMult / prevHpMult;
      targetCreature.maxHp = Math.max(1, Math.floor(targetCreature.maxHp * ratio));
      targetCreature.hp = Math.min(targetCreature.maxHp, Math.max(0, Math.floor(targetCreature.hp * ratio)));
    }
    if (item.effect.tempBoost) {
      const tb = item.effect.tempBoost;
      applyTempAttackFlat(targetCreature, {
        value: tb.value,
        duration: tb.turns,
        sourceId: item.id,
      });
    }
    // Track equipment
    if (item.category === 'equipment') {
      targetCreature.equippedItems.push({ id: item.id, word: item.word, reading: item.reading, nameEn: item.nameEn, meaning: item.meaning, description: item.description });
    }
    return { applied: true };
  }

  if (item.type === 'mpRestore') {
    const target = targetCreature && targetCreature.hp > 0 ? targetCreature : (() => {
      const alive = allCreatures.filter(r => r.hp > 0);
      return alive.length > 0 ? alive.reduce((min, r) => (r.mp / (r.maxMp || 1)) < (min.mp / (min.maxMp || 1)) ? r : min, alive[0]) : null;
    })();
    if (target) {
      const restore = Math.floor((target.maxMp || 0) * (item.effect.mpRestorePercent || 0));
      target.mp = Math.min(target.maxMp || 0, (target.mp || 0) + restore);
    }
    return { applied: true };
  }

  if (item.type === 'revive') {
    if (item.effect.revivePercent) {
      const kos = allCreatures.filter(r => r.hp <= 0);
      const target = (targetCreature && targetCreature.hp <= 0) ? targetCreature
        : (kos.length > 0 ? kos[Math.floor(Math.random() * kos.length)] : null);
      if (target) {
        target.hp = Math.floor(target.maxHp * item.effect.revivePercent);
      }
    }
    return { applied: true };
  }

  if (item.type === 'keepsake') {
    if (!targetCreature) return { applied: false };
    const buffs = targetCreature.itemBuffs;
    for (const [field, value] of Object.entries(item.effect)) {
      applyStat(field, value, buffs);
    }
    return { applied: true };
  }

  if (item.type === 'xpCharm') {
    if (!targetCreature) return { applied: false };
    const buffs = targetCreature.itemBuffs;
    buffs.xpMultiplier = (buffs.xpMultiplier || 1.0) * (1 + item.effect.value);
    return { applied: true };
  }

  if (item.type === 'xpBalance') {
    if (!targetCreature) return { applied: false };
    const buffs = targetCreature.itemBuffs;
    buffs.xpBalanceStacks = (buffs.xpBalanceStacks || 0) + item.effect.value;
    return { applied: true };
  }

  if (item.type === 'xpGrant') {
    if (!context?.enemyLevel) return { applied: false };
    if (item.effect.xpGrant === 'killEquivalent') {
      const result = awardKillXp(creatureParty, context.enemyLevel);
      return { applied: true, xpGrants: result.xpGrants, levelUps: result.levelUps };
    }
    return { applied: false };
  }

  return { applied: false };
}

/**
 * Attack used in combat after run-scoped item buffs (food % + equipment base bonus).
 * baseAttackBonus is scaled by creature level so it compounds like natural stats.
 * @param {number} baseAttack - Creature's leveled attack stat
 * @param {object} itemBuffs - Run-scoped item buff object
 * @param {number} [level] - Creature level (for scaling base bonus)
 */
export function getBuffedAttack(baseAttack, itemBuffs, level) {
  let n = Math.max(1, Math.floor(Number(baseAttack) || 0));
  // Flat base bonus scaled by level (equipment)
  const bonus = itemBuffs?.baseAttackBonus || 0;
  if (bonus && level) {
    n += Math.floor(bonus * levelMult(level));
  }
  // % multiplier (food items)
  const mult = itemBuffs?.attackMult ?? 1.0;
  if (!(mult > 0) || mult === 1.0) return n;
  const raw = n * mult;
  if (mult <= 1) return Math.max(1, Math.floor(raw));
  let out = Math.floor(raw);
  if (out === n && raw > n + 1e-9) out = n + 1;
  return Math.max(1, out);
}

export function getBuffedElementMultiplier(baseMult, itemBuffs) {
  if (baseMult > 1.0 && itemBuffs?.elementEdge) {
    return +(baseMult + itemBuffs.elementEdge).toFixed(2);
  }
  return baseMult;
}

export function applyDamageReduction(damage, itemBuffs) {
  if (itemBuffs?.flatDamageReduction) {
    return Math.max(1, damage - itemBuffs.flatDamageReduction);
  }
  return damage;
}
