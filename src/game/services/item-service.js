import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { applyTempAttackFlat } from '../combat/effects.js';

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
    autoPowerMult: 1.0,
    ultimatePowerMult: 1.0,
    elementEdge: 0,
    flatDamageReduction: 0,
    xpMultiplier: 1.0,
    xpBalanceStacks: 0
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

const MULT_FIELDS = new Set(['attackMult', 'hpMult', 'autoPowerMult', 'ultimatePowerMult', 'xpMultiplier']);

function applyStat(field, value, itemBuffs) {
  if (!itemBuffs || value == null || Number.isNaN(Number(value))) return;
  const delta = Number(value);
  if (field === 'flatDamageReduction') {
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


export function applyItem(item, creatureParty, itemBuffs, targetIndex = null) {
  if (!creatureParty) return { applied: false };
  // Note: `itemBuffs` is currently used for combat-time modifiers like XP multiplier.
  // Equipment/food stat effects (ATK/HP/MP/HEAL/REVIVE) are single-creature gifts in Koto2,
  // so we apply those directly to the target creature instead of broadcasting to the party.
  if (itemBuffs) ensureItemBuffShape(itemBuffs);
  const allCreatures = [...creatureParty.active, ...creatureParty.reserves].filter(Boolean);
  const targetCreature = targetIndex !== null ? creatureParty.active[targetIndex] : null;
  const aliveCreatures = allCreatures.filter(r => r.hp > 0);
  const defaultTarget = (creatureParty.active || []).find(c => c && c.hp > 0)
    || aliveCreatures.find(c => c) || null;

  if (item.type === 'heal') {
    // All heal variants are single-creature gifts.
    // If a specific target is provided, heal only that creature (when eligible).
    // Otherwise, fall back to "most damaged" (or first alive).
    if (item.effect.healPercent) {
      const target = (targetCreature && targetCreature.hp > 0)
        ? targetCreature
        : (() => {
          if (!aliveCreatures.length) return null;
          // Most damaged by HP ratio.
          return aliveCreatures
            .slice()
            .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || aliveCreatures[0];
        })();
      if (target) {
        const heal = Math.floor(target.maxHp * item.effect.healPercent);
        target.hp = Math.min(target.maxHp, target.hp + heal);
        return { applied: true };
      }
    }

    if (item.effect.healAllPercent) {
      // Backward compatibility for older item schemas:
      // treat "all" as "the chosen creature".
      const target = (targetCreature && targetCreature.hp > 0) ? targetCreature : defaultTarget;
      if (target) {
        const heal = Math.floor(target.maxHp * item.effect.healAllPercent);
        target.hp = Math.min(target.maxHp, target.hp + heal);
        return { applied: true };
      }
    }

    if (item.effect.healMostDamaged) {
      const target = (targetCreature && targetCreature.hp > 0)
        ? targetCreature
        : (() => {
          if (!aliveCreatures.length) return null;
          return aliveCreatures
            .slice()
            .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || aliveCreatures[0];
        })();
      if (target) {
        target.hp = target.maxHp;
        return { applied: true };
      }
    }

    return { applied: false };
  }

  if (item.type === 'boost') {
    const itemBuffsSafe = itemBuffs || null;
    // Single-creature boosts: apply directly to the chosen creature stats.
    // (Do not broadcast via `itemBuffs`, since combat-time `itemBuffs` are party-wide today.)
    const target = targetCreature || defaultTarget;
    if (!target) return { applied: false };

    if (item.effect.field != null && item.effect.value != null) {
      const field = item.effect.field;
      const value = Number(item.effect.value);
      if (Number.isFinite(value)) {
        if (field === 'attackMult') {
          const prevMult = Number.isFinite(target._itemAttackMult) ? target._itemAttackMult : 1.0;
          const nextMult = prevMult + value;
          if (prevMult > 0 && nextMult > 0) {
            const ratio = nextMult / prevMult;
            const attack = Number(target.attack) || 0;
            target.attack = Math.max(1, Math.floor(attack * ratio));
            target._itemAttackMult = nextMult;
          }
        } else if (field === 'hpMult') {
          const prevMult = Number.isFinite(target._itemHpMult) ? target._itemHpMult : 1.0;
          const nextMult = prevMult + value;
          if (prevMult > 0 && nextMult > 0) {
            const ratio = nextMult / prevMult;
            target.maxHp = Math.max(1, Math.floor(target.maxHp * ratio));
            target.hp = Math.min(target.maxHp, Math.max(0, Math.floor(target.hp * ratio)));
            target._itemHpMult = nextMult;
          }
        } else {
          // Unsupported single-creature stat field; fall back to run-scoped itemBuffs.
          // This keeps older items working, but may still behave like a party buff.
          if (itemBuffsSafe) applyStat(field, value, itemBuffsSafe);
        }
      }
    }

    if (item.effect.tempBoost) {
      // Temporary flat attack bonuses are also single-target in Koto2 gifts.
      const tb = item.effect.tempBoost;
      applyTempAttackFlat(target, {
        value: tb.value,
        duration: tb.turns,
        sourceId: item.id,
      });
    }

    return { applied: true };
  }

  if (item.type === 'mpRestore') {
    const target = (targetCreature && targetCreature.hp > 0) ? targetCreature : defaultTarget;
    if (!target) return { applied: false };
    const restore = Math.floor((target.maxMp || 0) * (item.effect.mpRestorePercent || 0));
    target.mp = Math.min(target.maxMp || 0, (target.mp || 0) + restore);
    return { applied: true };
  }

  if (item.type === 'revive') {
    if (item.effect.revivePercent) {
      const reviveTarget = (() => {
        // If user selected a target, revive only that creature (when KO'd).
        if (targetCreature) {
          return targetCreature.hp <= 0 ? targetCreature : null;
        }
        // No explicit target: revive one random KO'd creature (legacy fallback).
        const kos = allCreatures.filter(r => r.hp <= 0);
        return kos.length > 0 ? kos[Math.floor(Math.random() * kos.length)] : null;
      })();

      if (reviveTarget) {
        reviveTarget.hp = Math.floor(reviveTarget.maxHp * item.effect.revivePercent);
        return { applied: true };
      }
    }
    return { applied: false };
  }

  if (item.type === 'keepsake') {
    if (!itemBuffs) return { applied: false };
    const prevHpMult = itemBuffs.hpMult;
    for (const [field, value] of Object.entries(item.effect)) {
      applyStat(field, value, itemBuffs);
    }
    if (itemBuffs.hpMult !== prevHpMult) {
      scalePartyHpForBuffRatio(creatureParty, itemBuffs.hpMult / prevHpMult);
    }
    return { applied: true };
  }

  if (item.type === 'xpCharm') {
    if (!itemBuffs) return { applied: false };
    itemBuffs.xpMultiplier = (itemBuffs.xpMultiplier || 1.0) * (1 + item.effect.value);
    return { applied: true };
  }

  if (item.type === 'xpBalance') {
    if (!itemBuffs) return { applied: false };
    itemBuffs.xpBalanceStacks = (itemBuffs.xpBalanceStacks || 0) + item.effect.value;
    return { applied: true };
  }

  return { applied: false };
}

/**
 * Attack used in combat after run-scoped item multipliers (food, equipment).
 * Small % boosts (e.g. +2% at ATK 20) must still increase damage vs pure floor(20*1.02)=20.
 */
export function getBuffedAttack(baseAttack, itemBuffs) {
  const mult = itemBuffs?.attackMult ?? 1.0;
  const n = Math.max(1, Math.floor(Number(baseAttack) || 0));
  if (!(mult > 0)) return n;
  const raw = n * mult;
  if (mult <= 1) return Math.max(1, Math.floor(raw));
  let out = Math.floor(raw);
  if (out === n && raw > n + 1e-9) out = n + 1;
  return Math.max(1, out);
}

export function getBuffedAutoPower(basePower, itemBuffs) {
  return Math.floor(basePower * (itemBuffs?.autoPowerMult || 1.0));
}

export function getBuffedUltimatePower(basePower, itemBuffs) {
  return Math.floor(basePower * (itemBuffs?.ultimatePowerMult || 1.0));
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
