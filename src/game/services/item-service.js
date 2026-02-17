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
    flatDamageReduction: 0
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

function applyChargeBoost(allRobots, amount) {
  for (const robot of allRobots) {
    robot.ultimate.charges = Math.min(
      robot.ultimate.charges + amount,
      robot.ultimate.chargesRequired
    );
  }
}

export function applyItem(item, robotParty, itemBuffs) {
  const allRobots = [...robotParty.active, ...robotParty.reserves].filter(Boolean);

  if (item.type === 'heal') {
    if (item.effect.healPercent) {
      const alive = allRobots.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const lowest = alive.reduce((min, r) => r.hp < min.hp ? r : min, alive[0]);
        const heal = Math.floor(lowest.maxHp * item.effect.healPercent);
        lowest.hp = Math.min(lowest.maxHp, lowest.hp + heal);
      }
    }
    if (item.effect.healAllPercent) {
      const alive = allRobots.filter(r => r.hp > 0);
      for (const robot of alive) {
        const heal = Math.floor(robot.maxHp * item.effect.healAllPercent);
        robot.hp = Math.min(robot.maxHp, robot.hp + heal);
      }
    }
    if (item.effect.healMostDamaged) {
      const alive = allRobots.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const mostDamaged = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        mostDamaged.hp = mostDamaged.maxHp;
      }
    }
    // Combo: some heal items also grant charges (e.g. strawberry milk)
    if (item.effect.chargeBoost) {
      applyChargeBoost(allRobots, item.effect.chargeBoost);
    }
    return { applied: true };
  }

  if (item.type === 'boost') {
    // Permanent stat boost (e.g. green tea: +2% attack)
    if (item.effect.field && item.effect.value) {
      applyStat(item.effect.field, item.effect.value, itemBuffs);
    }
    // Temporary boost (e.g. miso soup: +3 attack for 5 turns)
    if (item.effect.tempBoost) {
      const tb = item.effect.tempBoost;
      const targets = tb.target === 'all' ? allRobots : [allRobots[0]];
      for (const robot of targets.filter(Boolean)) {
        applyTempAttackFlat(robot, {
          value: tb.value,
          duration: tb.turns,
          sourceId: item.id,
        });
      }
    }
    return { applied: true };
  }

  if (item.type === 'charge') {
    if (item.effect.chargeBoost) {
      applyChargeBoost(allRobots, item.effect.chargeBoost);
    }
    return { applied: true };
  }

  if (item.type === 'revive') {
    if (item.effect.revivePercent) {
      const kos = allRobots.filter(r => r.hp <= 0);
      if (kos.length > 0) {
        const target = kos[Math.floor(Math.random() * kos.length)];
        target.hp = Math.floor(target.maxHp * item.effect.revivePercent);
      }
    }
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
