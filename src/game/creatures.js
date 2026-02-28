import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURE_DATA = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf8'));
const MOVES_DATA = JSON.parse(readFileSync(join(__dirname, '../../data/moves.json'), 'utf8'));

export const MOVES_BY_ID = {};
for (const m of MOVES_DATA) {
  MOVES_BY_ID[m.id] = m;
}

export const CREATURES_BY_ID = {};
const CREATURES_BY_ELEMENT_RARITY = {};
for (const r of CREATURE_DATA) {
  CREATURES_BY_ID[r.id] = r;
  const key = `${r.element}-${r.rarity}`;
  if (!CREATURES_BY_ELEMENT_RARITY[key]) CREATURES_BY_ELEMENT_RARITY[key] = [];
  CREATURES_BY_ELEMENT_RARITY[key].push(r);
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

export function xpToNextLevel(level) {
  return Math.pow(level + 1, 3) - Math.pow(level, 3);
}

export function getElementMultiplier(attackerElement, defenderElement) {
  const ai = ELEMENT_CYCLE.indexOf(attackerElement);
  const di = ELEMENT_CYCLE.indexOf(defenderElement);
  if (ai === -1 || di === -1) return 1.0;
  if ((ai + 1) % ELEMENT_CYCLE.length === di) return 1.5;
  if ((di + 1) % ELEMENT_CYCLE.length === ai) return 0.67;
  return 1.0;
}

export function instantiateCreature(templateId) {
  const template = CREATURES_BY_ID[templateId];
  if (!template) throw new Error(`Creature template not found: ${templateId}`);

  const mult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const hp = Math.floor(template.baseHp * mult);
  const attack = Math.floor(template.baseAttack * mult);
  const mp = Math.floor((template.baseMp || 80) * mult);

  // Get moves learned at level 1
  const moves = (template.learnset || [])
    .filter(entry => entry.level <= 1)
    .map(entry => {
      const moveData = MOVES_BY_ID[entry.moveId];
      if (!moveData) return null;
      return { ...moveData };
    })
    .filter(Boolean);

  return {
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: template.rarity,
    archetype: template.archetype || 'Fighter',
    baseWord: template.baseWord,
    baseReading: template.baseReading,
    baseMeaning: template.baseMeaning,
    level: 1,
    xp: 0,
    hp,
    maxHp: hp,
    attack,
    mp,
    maxMp: mp,
    baseHpTemplate: template.baseHp,
    baseAttackTemplate: template.baseAttack,
    baseMpTemplate: template.baseMp || 80,
    moves
  };
}

export function getStatsForLevel(baseHp, baseAttack, baseMp, level) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult),
    maxMp: Math.floor(baseMp * mult)
  };
}

export function addXpToCreature(creature, xp) {
  creature.xp += xp;
  const levelUps = [];
  while (creature.xp >= xpToNextLevel(creature.level)) {
    creature.xp -= xpToNextLevel(creature.level);
    creature.level++;
    const rarityMult = RARITY_MULTIPLIERS[creature.rarity] || 1.0;
    const baseHp = Math.floor((creature.baseHpTemplate || 100) * rarityMult);
    const baseAtk = Math.floor((creature.baseAttackTemplate || 10) * rarityMult);
    const baseMp = Math.floor((creature.baseMpTemplate || 80) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, baseMp, creature.level);
    const hpDiff = stats.maxHp - creature.maxHp;
    const mpDiff = stats.maxMp - (creature.maxMp || 0);
    creature.maxHp = stats.maxHp;
    creature.attack = stats.attack;
    creature.maxMp = stats.maxMp;
    creature.hp += hpDiff;
    creature.mp = (creature.mp || 0) + mpDiff;

    // Check for new move at this level
    const template = CREATURES_BY_ID[creature.id];
    const newMoveEntry = template?.learnset?.find(e => e.level === creature.level);
    let newMove = null;
    if (newMoveEntry) {
      const moveData = MOVES_BY_ID[newMoveEntry.moveId];
      if (moveData && !(creature.moves || []).find(m => m.id === moveData.id)) {
        newMove = { ...moveData };
        if (!creature.moves) creature.moves = [];
        if (creature.moves.length < 4) {
          // Auto-learn if under max moves
          creature.moves.push(newMove);
        }
        // If at max moves, the UI will need to handle replacement
      }
    }

    levelUps.push({
      level: creature.level,
      maxHp: stats.maxHp,
      attack: stats.attack,
      maxMp: stats.maxMp,
      hpGain: hpDiff,
      mpGain: mpDiff,
      newMove  // null if no new move, or the move object if one was learned
    });
  }
  return levelUps;
}

export function calculateCreatureDamage(attack, abilityPower, elementMultiplier, variance) {
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

export function generateEnemyCreature(highestAllyLevel = 1, creaturePool = null) {
  let group;

  if (creaturePool && creaturePool.length > 0) {
    // Area-restricted: only spawn creatures from this area's pool
    group = CREATURE_DATA.filter(r => creaturePool.includes(r.id));
    if (group.length === 0) group = CREATURE_DATA; // fallback if pool IDs don't match
  } else {
    // Random element+rarity selection (legacy/fallback)
    const elements = ['wood', 'fire', 'earth', 'metal', 'water'];
    for (let attempts = 0; attempts < 20; attempts++) {
      const rarity = rollRarity();
      const element = elements[Math.floor(Math.random() * elements.length)];
      group = CREATURES_BY_ELEMENT_RARITY[`${element}-${rarity}`];
      if (group && group.length > 0) break;
    }
    if (!group || group.length === 0) {
      group = CREATURE_DATA;
    }
  }

  const template = group[Math.floor(Math.random() * group.length)];
  const creature = instantiateCreature(template.id);

  const levelVariance = Math.floor(Math.random() * 3) - 1;
  const targetLevel = Math.max(1, highestAllyLevel + levelVariance);
  while (creature.level < targetLevel) {
    addXpToCreature(creature, xpToNextLevel(creature.level));
  }

  // Ensure enemy has ALL moves up to its level (addXpToCreature only auto-adds if < 4)
  const tmpl = CREATURES_BY_ID[creature.id];
  if (tmpl?.learnset) {
    if (!creature.moves) creature.moves = [];
    for (const entry of tmpl.learnset) {
      if (entry.level <= creature.level) {
        const moveData = MOVES_BY_ID[entry.moveId];
        if (moveData && !creature.moves.find(m => m.id === moveData.id)) {
          creature.moves.push({ ...moveData });
        }
      }
    }
  }

  return creature;
}

const ENEMY_COUNT_WEIGHTS = [
  { count: 1, weight: 60 },
  { count: 2, weight: 30 },
  { count: 3, weight: 10 }
];

export function generateEnemyCreatures(highestAllyLevel = 1, { maxEnemies, creaturePool } = {}) {
  // Roll enemy count
  const totalWeight = ENEMY_COUNT_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of ENEMY_COUNT_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }
  if (maxEnemies) enemyCount = Math.min(enemyCount, maxEnemies);

  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push(generateEnemyCreature(highestAllyLevel, creaturePool));
  }
  return enemies;
}

const CREATURE_PRICES = {
  common: 20,
  uncommon: 40,
  rare: 70,
  epic: 120,
  legendary: 200
};

export function getCreatureBuyPrice(rarity) {
  return CREATURE_PRICES[rarity] || 20;
}

export function getCreatureSellPrice(rarity, level) {
  const base = Math.floor((CREATURE_PRICES[rarity] || 20) * 0.6);
  return base + (level - 1) * 5;
}

export function generateDealerCreatures(collectionIds = []) {
  const collectionSet = new Set(collectionIds);
  const allTemplates = Object.values(CREATURES_BY_ID);
  const uncaptured = allTemplates.filter(t => !collectionSet.has(t.id));

  // If all captured, offer random ones anyway
  const pool = uncaptured.length >= 1 ? uncaptured : allTemplates;

  // Pick 1 random creature for sale
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 1).map(template => ({
    ...instantiateCreature(template.id),
    buyPrice: getCreatureBuyPrice(template.rarity)
  }));
}

