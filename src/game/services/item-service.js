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

function applyStat(field, value, itemBuffs) {
  if (field === 'flatDamageReduction') {
    itemBuffs[field] = (itemBuffs[field] || 0) + value;
  } else if (itemBuffs[field] !== undefined) {
    itemBuffs[field] = (itemBuffs[field] || 1.0) + value;
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
  const allCreatures = [...creatureParty.active, ...creatureParty.reserves].filter(Boolean);
  const targetCreature = targetIndex !== null ? creatureParty.active[targetIndex] : null;

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
    if (item.effect.field && item.effect.value) {
      const field = item.effect.field;
      const prevHpMult = itemBuffs.hpMult;
      applyStat(field, item.effect.value, itemBuffs);
      if (field === 'hpMult' && itemBuffs.hpMult !== prevHpMult) {
        scalePartyHpForBuffRatio(creatureParty, itemBuffs.hpMult / prevHpMult);
      }
    }
    if (item.effect.tempBoost) {
      const tb = item.effect.tempBoost;
      const targets = tb.target === 'all' ? allCreatures : [allCreatures[0]];
      for (const creature of targets.filter(Boolean)) {
        applyTempAttackFlat(creature, {
          value: tb.value,
          duration: tb.turns,
          sourceId: item.id,
        });
      }
    }
    return { applied: true };
  }

  if (item.type === 'mpRestore') {
    const alive = allCreatures.filter(r => r.hp > 0);
    for (const creature of alive) {
      const restore = Math.floor((creature.maxMp || 0) * (item.effect.mpRestorePercent || 0));
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + restore);
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
    itemBuffs.xpMultiplier = (itemBuffs.xpMultiplier || 1.0) * (1 + item.effect.value);
    return { applied: true };
  }

  if (item.type === 'xpBalance') {
    itemBuffs.xpBalanceStacks = (itemBuffs.xpBalanceStacks || 0) + item.effect.value;
    return { applied: true };
  }

  return { applied: false };
}

export function getBuffedAttack(baseAttack, itemBuffs) {
  return Math.floor(baseAttack * (itemBuffs?.attackMult || 1.0));
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
