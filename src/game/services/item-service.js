import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

function applyHpHeal(allRobots, value) {
  for (const robot of allRobots) {
    const hpGain = Math.floor(robot.maxHp * value);
    robot.hp = Math.min(robot.maxHp + hpGain, robot.hp + hpGain);
  }
}

// Pick a random stat field to boost
const RANDOM_STAT_FIELDS = ['attackMult', 'hpMult', 'autoPowerMult', 'ultimatePowerMult'];

function applyRandomStat(value, itemBuffs) {
  const field = RANDOM_STAT_FIELDS[Math.floor(Math.random() * RANDOM_STAT_FIELDS.length)];
  applyStat(field, value, itemBuffs);
}

export function applyItem(item, robotParty, itemBuffs) {
  const allRobots = [...robotParty.active, ...robotParty.reserves].filter(Boolean);

  if (item.type === 'stat') {
    const { field, value, penalty, bonus, random: isRandom } = item.effect;

    // Random stat item (e.g. money, thing)
    if (field === 'random' || isRandom) {
      applyRandomStat(value || 0.02, itemBuffs);
      return { applied: true };
    }

    // Apply primary stat
    applyStat(field, value, itemBuffs);

    // HP mult also heals
    if (field === 'hpMult') {
      applyHpHeal(allRobots, value);
    }

    // Apply bonus compound effect (e.g. parents: HP + damage reduction)
    if (bonus) {
      applyStat(bonus.field, bonus.value, itemBuffs);
      if (bonus.field === 'hpMult') {
        applyHpHeal(allRobots, bonus.value);
      }
    }

    // Apply penalty (e.g. sake: +attack, -HP)
    if (penalty) {
      applyStat(penalty.field, penalty.value, itemBuffs);
    }

    // allStats boosts all multiplier fields (legendary time item)
    if (item.effect.allStats) {
      const boost = item.effect.allStats;
      for (const f of RANDOM_STAT_FIELDS) {
        applyStat(f, boost, itemBuffs);
      }
    }

    return { applied: true };
  }

  if (item.type === 'heal') {
    if (item.effect.healPercent) {
      const alive = allRobots.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const lowest = alive.reduce((min, r) => r.hp < min.hp ? r : min, alive[0]);
        const heal = Math.floor(lowest.maxHp * item.effect.healPercent);
        lowest.hp = Math.min(lowest.maxHp, lowest.hp + heal);
      }
      return { applied: true };
    }
    if (item.effect.healAllPercent) {
      const alive = allRobots.filter(r => r.hp > 0);
      for (const robot of alive) {
        const heal = Math.floor(robot.maxHp * item.effect.healAllPercent);
        robot.hp = Math.min(robot.maxHp, robot.hp + heal);
      }
      return { applied: true };
    }
    if (item.effect.healMostDamaged) {
      const alive = allRobots.filter(r => r.hp > 0);
      if (alive.length > 0) {
        const mostDamaged = alive.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
        mostDamaged.hp = mostDamaged.maxHp;
      }
      return { applied: true };
    }
    if (item.effect.revivePercent) {
      const kos = allRobots.filter(r => r.hp <= 0);
      if (kos.length > 0) {
        const target = kos[Math.floor(Math.random() * kos.length)];
        target.hp = Math.floor(target.maxHp * item.effect.revivePercent);
      }
      return { applied: true };
    }
  }

  if (item.type === 'utility') {
    if (item.effect.chargeBoost) {
      for (const robot of allRobots) {
        robot.ultimate.charges = Math.min(
          robot.ultimate.charges + item.effect.chargeBoost,
          robot.ultimate.chargesRequired
        );
      }
    }

    // Random utility items resolve to a random beneficial effect
    if (item.effect.random || item.effect.randomLarge || item.effect.randomEpic) {
      const magnitude = item.effect.randomEpic ? 0.05 : item.effect.randomLarge ? 0.03 : 0.02;
      // Boost 1-3 random stats depending on tier
      const count = item.effect.randomEpic ? 3 : item.effect.randomLarge ? 2 : 1;
      for (let i = 0; i < count; i++) {
        applyRandomStat(magnitude, itemBuffs);
      }
    }

    // allStats for legendary utility items
    if (item.effect.allStats) {
      const boost = item.effect.allStats;
      for (const f of RANDOM_STAT_FIELDS) {
        applyStat(f, boost, itemBuffs);
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
