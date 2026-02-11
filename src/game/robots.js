import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROBOT_DATA = JSON.parse(readFileSync(join(__dirname, '../../data/robots.json'), 'utf8'));

const ROBOTS_BY_ID = {};
const ROBOTS_BY_ELEMENT_RARITY = {};
for (const r of ROBOT_DATA) {
  ROBOTS_BY_ID[r.id] = r;
  const key = `${r.element}-${r.rarity}`;
  if (!ROBOTS_BY_ELEMENT_RARITY[key]) ROBOTS_BY_ELEMENT_RARITY[key] = [];
  ROBOTS_BY_ELEMENT_RARITY[key].push(r);
}

// Element cycle: each element beats the next in the array
// Wood -> Earth -> Water -> Fire -> Metal -> Wood
export const ELEMENT_CYCLE = ['wood', 'earth', 'water', 'fire', 'metal'];

export const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.1,
  rare: 1.2,
  epic: 1.3,
  legendary: 1.4
};

const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1
};

const XP_PER_LEVEL = 100;

export function getElementMultiplier(attackerElement, defenderElement) {
  const ai = ELEMENT_CYCLE.indexOf(attackerElement);
  const di = ELEMENT_CYCLE.indexOf(defenderElement);
  if (ai === -1 || di === -1) return 1.0;
  if ((ai + 1) % ELEMENT_CYCLE.length === di) return 1.5;
  if ((di + 1) % ELEMENT_CYCLE.length === ai) return 0.67;
  return 1.0;
}

export function instantiateRobot(templateId) {
  const template = ROBOTS_BY_ID[templateId];
  if (!template) throw new Error(`Robot template not found: ${templateId}`);

  const mult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const hp = Math.floor(template.baseHp * mult);
  const attack = Math.floor(template.baseAttack * mult);

  return {
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: template.rarity,
    level: 1,
    xp: 0,
    hp,
    maxHp: hp,
    attack,
    autoSkill: { ...template.autoSkill },
    ultimate: {
      ...template.ultimate,
      charges: 0
    }
  };
}

export function getStatsForLevel(baseHp, baseAttack, level) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult)
  };
}

export function addXpToRobot(robot, xp) {
  robot.xp += xp;
  while (robot.xp >= XP_PER_LEVEL) {
    robot.xp -= XP_PER_LEVEL;
    robot.level++;
    const rarityMult = RARITY_MULTIPLIERS[robot.rarity] || 1.0;
    const baseHp = Math.floor(100 * rarityMult);
    const baseAtk = Math.floor(10 * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, robot.level);
    const hpDiff = stats.maxHp - robot.maxHp;
    robot.maxHp = stats.maxHp;
    robot.attack = stats.attack;
    robot.hp += hpDiff;
  }
}

export function calculateRobotDamage(attack, abilityPower, elementMultiplier, variance) {
  return Math.max(1, Math.floor((attack / 10) * abilityPower * elementMultiplier * variance));
}

export function rollVariance() {
  return 0.8 + Math.random() * 0.4;
}

export function selectTarget(attacker, targets) {
  const alive = targets.filter(t => t.hp > 0);
  if (alive.length === 0) return null;
  if (alive.length === 1) return alive[0];

  const byHpPct = (a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp);

  const disadvantaged = alive.filter(t => getElementMultiplier(attacker.element, t.element) > 1.0);
  if (disadvantaged.length > 0) return disadvantaged.sort(byHpPct)[0];

  const neutral = alive.filter(t => getElementMultiplier(attacker.element, t.element) === 1.0);
  if (neutral.length > 0) return neutral.sort(byHpPct)[0];

  return alive.sort(byHpPct)[0];
}

export function rollRarity() {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

export function generateEnemyRobot(highestAllyLevel = 1) {
  const elements = ['wood', 'fire', 'earth', 'metal', 'water'];
  let group;
  // Re-roll if the element+rarity combo has no creatures
  for (let attempts = 0; attempts < 20; attempts++) {
    const rarity = rollRarity();
    const element = elements[Math.floor(Math.random() * elements.length)];
    group = ROBOTS_BY_ELEMENT_RARITY[`${element}-${rarity}`];
    if (group && group.length > 0) break;
  }
  if (!group || group.length === 0) {
    // Ultimate fallback: pick any creature
    group = ROBOT_DATA;
  }
  const template = group[Math.floor(Math.random() * group.length)];
  const robot = instantiateRobot(template.id);

  const levelVariance = Math.floor(Math.random() * 3) - 1;
  const targetLevel = Math.max(1, highestAllyLevel + levelVariance);
  while (robot.level < targetLevel) {
    addXpToRobot(robot, XP_PER_LEVEL);
  }

  return robot;
}

const ENEMY_COUNT_WEIGHTS = [
  { count: 1, weight: 60 },
  { count: 2, weight: 30 },
  { count: 3, weight: 10 }
];

export function generateEnemyRobots(highestAllyLevel = 1) {
  // Roll enemy count
  const totalWeight = ENEMY_COUNT_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of ENEMY_COUNT_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }

  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push(generateEnemyRobot(highestAllyLevel));
  }
  return enemies;
}

export function getAllRobots() {
  return ROBOT_DATA;
}

