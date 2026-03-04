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

const STAGE_RARITY_TABLE = {
  early:  { common: 80, uncommon: 18, rare: 2, epic: 0 },   // stage 1-3
  mid:    { common: 50, uncommon: 35, rare: 12, epic: 3 },   // stage 4-6
  late:   { common: 30, uncommon: 30, rare: 25, epic: 15 },  // stage 7-9
  endgame: { common: 20, uncommon: 30, rare: 30, epic: 20 }  // stage 10
};

export function getRarityWeightsForStage(stage) {
  const s = stage || 1;
  if (s <= 3) return { ...STAGE_RARITY_TABLE.early };
  if (s <= 6) return { ...STAGE_RARITY_TABLE.mid };
  if (s <= 9) return { ...STAGE_RARITY_TABLE.late };
  return { ...STAGE_RARITY_TABLE.endgame };
}

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

const STARTING_LEVEL = 5;

export function instantiateCreature(templateId) {
  const template = CREATURES_BY_ID[templateId];
  if (!template) throw new Error(`Creature template not found: ${templateId}`);

  const rarityMult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const baseMp = template.baseMp || 80;
  const { maxHp, attack, maxMp } = getStatsForLevel(
    Math.floor(template.baseHp * rarityMult),
    Math.floor(template.baseAttack * rarityMult),
    Math.floor(baseMp * rarityMult),
    STARTING_LEVEL
  );

  // Get all moves learned up to starting level
  const moves = (template.learnset || [])
    .filter(entry => entry.level <= STARTING_LEVEL)
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
    level: STARTING_LEVEL,
    xp: 0,
    hp: maxHp,
    maxHp,
    attack,
    mp: maxMp,
    maxMp,
    baseHpTemplate: template.baseHp,
    baseAttackTemplate: template.baseAttack,
    baseMpTemplate: baseMp,
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

export function rollRarity(stage) {
  const weights = stage != null ? getRarityWeightsForStage(stage) : RARITY_WEIGHTS;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (const [rarity, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

const PARTY_SIZE_MULTIPLIERS = {
  1: 1.2,
  2: 1.0,
  3: 0.85
};

export function getEnemyLevel({ stage = 1, encounterIndex = 0, enemyCount = 1, playerLevel = 1 }) {
  const stageBaseline = stage * 3;
  const encounterBonus = stageBaseline * (encounterIndex * 0.08);
  const rawLevel = stageBaseline + encounterBonus;
  const sizeMultiplier = PARTY_SIZE_MULTIPLIERS[enemyCount] || 1.0;
  const adjustedLevel = Math.round(rawLevel * sizeMultiplier);
  const minLevel = Math.max(1, playerLevel - 5);
  const maxLevel = playerLevel + 5;
  return Math.max(minLevel, Math.min(adjustedLevel, maxLevel));
}

export function generateEnemyCreature(targetLevel, creaturePool = null, stage = null) {
  let group;

  if (creaturePool && creaturePool.length > 0) {
    // Area-restricted: only spawn creatures from this area's pool
    group = CREATURE_DATA.filter(r => creaturePool.includes(r.id));
    if (group.length === 0) group = CREATURE_DATA;

    // When stage is provided, filter pool by rolled rarity
    if (stage != null) {
      const rarity = rollRarity(stage);
      const rarityFiltered = group.filter(r => r.rarity === rarity);
      if (rarityFiltered.length > 0) group = rarityFiltered;
    }
  } else if (stage != null) {
    // Stage-based without pool: filter all creatures by rolled rarity
    const rarity = rollRarity(stage);
    const rarityGroup = CREATURE_DATA.filter(r => r.rarity === rarity);
    group = rarityGroup.length > 0 ? rarityGroup : CREATURE_DATA;
  } else {
    // Legacy: random element+rarity selection
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

const ENCOUNTER_COUNT_TABLE = {
  early: [   // encounterIndex 0-2
    { count: 1, weight: 50 },
    { count: 2, weight: 40 },
    { count: 3, weight: 10 }
  ],
  mid: [     // encounterIndex 3-4
    { count: 1, weight: 40 },
    { count: 2, weight: 35 },
    { count: 3, weight: 25 }
  ],
  late: [    // encounterIndex 5+
    { count: 1, weight: 30 },
    { count: 2, weight: 35 },
    { count: 3, weight: 35 }
  ]
};

export function getEnemyCountWeights(encounterIndex = 0) {
  if (encounterIndex <= 2) return ENCOUNTER_COUNT_TABLE.early;
  if (encounterIndex <= 4) return ENCOUNTER_COUNT_TABLE.mid;
  return ENCOUNTER_COUNT_TABLE.late;
}

export function generateEnemyCreatures(highestAllyLevel = 1, { maxEnemies, creaturePool, stage, encounterIndex } = {}) {
  // Determine enemy count using encounter-aware weights when available
  const countWeights = encounterIndex != null ? getEnemyCountWeights(encounterIndex) : ENEMY_COUNT_WEIGHTS;
  const totalWeight = countWeights.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let enemyCount = 1;
  for (const { count, weight } of countWeights) {
    roll -= weight;
    if (roll <= 0) { enemyCount = count; break; }
  }
  if (maxEnemies) enemyCount = Math.min(enemyCount, maxEnemies);

  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    let targetLevel;
    if (stage != null) {
      targetLevel = getEnemyLevel({
        stage,
        encounterIndex: encounterIndex || 0,
        enemyCount,
        playerLevel: highestAllyLevel
      });
    } else {
      // Legacy: highestAllyLevel +/- 1
      const levelVariance = Math.floor(Math.random() * 3) - 1;
      targetLevel = Math.max(1, highestAllyLevel + levelVariance);
    }
    enemies.push(generateEnemyCreature(targetLevel, creaturePool, stage));
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

