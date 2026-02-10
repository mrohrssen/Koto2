import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../../data/items.json'), 'utf8'));

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
  const pool = [...ITEMS];
  const selected = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    selected.push({ ...pool[idx] });
    pool.splice(idx, 1);
    if (pool.length === 0) break;
  }
  return selected;
}

export function applyItem(item, robotParty, itemBuffs) {
  const allRobots = [...robotParty.active, ...robotParty.reserves].filter(Boolean);

  if (item.type === 'stat') {
    const { field, value } = item.effect;
    if (field === 'flatDamageReduction') {
      itemBuffs[field] = (itemBuffs[field] || 0) + value;
    } else {
      itemBuffs[field] = (itemBuffs[field] || 1.0) + value;
    }
    if (field === 'hpMult') {
      for (const robot of allRobots) {
        const hpGain = Math.floor(robot.maxHp * value);
        robot.hp = Math.min(robot.maxHp + hpGain, robot.hp + hpGain);
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
      return { applied: true };
    }
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
