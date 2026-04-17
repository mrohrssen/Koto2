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

export function instantiateCreature(templateId, startingLevel = STARTING_LEVEL) {
  const template = CREATURES_BY_ID[templateId];
  if (!template) throw new Error(`Creature template not found: ${templateId}`);

  const rarityMult = RARITY_MULTIPLIERS[template.rarity] || 1.0;
  const baseMp = template.baseMp || 80;
  const baseDef = template.baseDefense ?? 5;
  const { maxHp, attack, maxMp, defense } = getStatsForLevel(
    Math.floor(template.baseHp * rarityMult),
    Math.floor(template.baseAttack * rarityMult),
    Math.floor(baseMp * rarityMult),
    startingLevel,
    Math.floor(baseDef * rarityMult)
  );

  // Get all moves learned up to starting level
  const moves = (template.learnset || [])
    .filter(entry => entry.level <= startingLevel)
    .map(entry => {
      const moveData = MOVES_BY_ID[entry.moveId];
      if (!moveData) return null;
      return { ...moveData };
    })
    .filter(Boolean);

  return {
    uid: crypto.randomUUID(),
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: template.rarity,
    archetype: template.archetype || 'Fighter',
    baseWord: template.baseWord,
    baseReading: template.baseReading,
    baseMeaning: template.baseMeaning,
    level: startingLevel,
    xp: 0,
    hp: maxHp,
    maxHp,
    attack,
    defense,
    mp: maxMp,
    maxMp,
    baseHpTemplate: template.baseHp,
    baseAttackTemplate: template.baseAttack,
    baseDefenseTemplate: baseDef,
    baseMpTemplate: baseMp,
    moves,
    itemBuffs: null,
    equippedItems: []
  };
}

export function getStatsForLevel(baseHp, baseAttack, baseMp, level, baseDefense = 5) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult),
    maxMp: Math.floor(baseMp * mult),
    // Round DEF so low baseDefense (e.g. 5) still bumps most levels (floor caused long plateaus vs ATK).
    defense: Math.max(1, Math.round(baseDefense * mult))
  };
}

/**
 * Recompute `creature.defense` from level + templates (and fill missing `baseDefenseTemplate`).
 * Call after load/resume so older saves and pre-DEF creatures match combat math.
 */
export function syncCreatureDefense(creature) {
  if (!creature || !creature.id) return;
  const template = CREATURES_BY_ID[creature.id];
  if (creature.baseDefenseTemplate == null) {
    creature.baseDefenseTemplate = template?.baseDefense ?? 5;
  }
  const rarityMult = RARITY_MULTIPLIERS[creature.rarity] || 1.0;
  const baseDef = Math.floor((creature.baseDefenseTemplate ?? 5) * rarityMult);
  const level = Math.max(1, creature.level || 1);
  const mult = 1 + (level - 1) * 0.1;
  creature.defense = Math.max(1, Math.round(baseDef * mult));
}

/** Apply {@link syncCreatureDefense} to all slots in a party (active + reserves). */
export function syncPartyCreatureDefense(party) {
  if (!party) return;
  for (const c of party.active || []) {
    if (c) syncCreatureDefense(c);
  }
  for (const c of party.reserves || []) {
    if (c) syncCreatureDefense(c);
  }
}

export function addXpToCreature(creature, xp, metaMults = null, _itemBuffs = null) {
  creature.xp += xp;
  const levelUps = [];
  while (creature.xp >= xpToNextLevel(creature.level)) {
    creature.xp -= xpToNextLevel(creature.level);
    creature.level++;
    const rarityMult = RARITY_MULTIPLIERS[creature.rarity] || 1.0;
    const baseHp = Math.floor((creature.baseHpTemplate || 100) * rarityMult);
    const baseAtk = Math.floor((creature.baseAttackTemplate || 10) * rarityMult);
    const baseMp = Math.floor((creature.baseMpTemplate || 80) * rarityMult);
    const baseDef = Math.floor((creature.baseDefenseTemplate ?? 5) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, baseMp, creature.level, baseDef);
    // Equipment base bonuses scale with level (per-creature)
    const cBuffs = creature.itemBuffs || _itemBuffs;
    const lMult = 1 + (creature.level - 1) * 0.1;
    const equipHpBonus = cBuffs?.baseHpBonus ? Math.floor(cBuffs.baseHpBonus * lMult) : 0;
    const equipMpBonus = cBuffs?.baseMpBonus ? Math.floor(cBuffs.baseMpBonus * lMult) : 0;
    let hpDiff = (stats.maxHp + equipHpBonus) - creature.maxHp;
    const mpDiff = (stats.maxMp + equipMpBonus) - (creature.maxMp || 0);
    creature.maxHp = stats.maxHp + equipHpBonus;
    creature.attack = stats.attack;
    creature.defense = stats.defense;
    creature.maxMp = stats.maxMp + equipMpBonus;
    // Re-apply meta progression bonuses after level-up stat recalculation
    if (metaMults) {
      if (metaMults.hpMult > 1) {
        creature.maxHp = Math.floor(creature.maxHp * metaMults.hpMult);
        hpDiff = Math.floor(hpDiff * metaMults.hpMult);
      }
      if (metaMults.atkMult > 1) {
        creature.attack = Math.floor(creature.attack * metaMults.atkMult);
      }
      if (metaMults.mpMult > 1) {
        creature.maxMp = Math.floor(creature.maxMp * metaMults.mpMult);
      }
      if (metaMults.defMult > 1) {
        creature.defense = Math.max(1, Math.round(creature.defense * metaMults.defMult));
      }
    }
    if (creature.hp > 0) {
      creature.hp += hpDiff;
    }
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
        if (creature.moves.length < 3) {
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
      defense: stats.defense,
      maxMp: stats.maxMp,
      hpGain: hpDiff,
      mpGain: mpDiff,
      newMove  // null if no new move, or the move object if one was learned
    });
  }
  return levelUps;
}

/**
 * Damage formula (level-aware, DEF mitigates):
 * floor(((2*Lv/5 + 2) * Power * ATK / DEF) / 10 + 2) * typeMult * variance
 * typeMult combines element effectiveness × STAB (and item element edge when applied upstream).
 */
export function calculateCreatureDamage({
  attackerLevel,
  attack,
  defenderDefense,
  power,
  typeMultiplier,
  variance
}) {
  const def = Math.max(1, Math.floor(Number(defenderDefense) || 1));
  const atk = Math.max(1, Math.floor(Number(attack) || 1));
  const lvl = Math.max(1, Number(attackerLevel) || 1);
  const pow = Math.max(1, Number(power) || 1);
  const inner = (2 * lvl / 5 + 2) * pow * atk / def;
  const base = Math.floor(inner / 10 + 2);
  const tm = Number(typeMultiplier) > 0 ? typeMultiplier : 1;
  const v = Number(variance) > 0 ? variance : 1;
  return Math.max(1, Math.floor(base * tm * v));
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

export function getEnemyLevel({ totalEncounters = 0, enemyCount = 1 } = {}) {
  // Base ~1 for totalEncounters 0–1 (first exploration steps), so party multipliers + variance
  // naturally land on Lv 1–2 early. Linear ramp uses (totalEncounters - 1) so scaling kicks in
  // from the second counted room onward; quadratic term adds late-run acceleration.
  const quad = Math.pow(totalEncounters / 25, 2);
  const linear = Math.max(0, totalEncounters - 1) / 2;
  const base = 1 + linear + quad;
  const sizeMultiplier = PARTY_SIZE_MULTIPLIERS[enemyCount] || 1.0;
  // Keep some randomness, but small enough that "later fights feel harder"
  // instead of occasionally regressing due to variance overwhelming the +0.5/encounter slope.
  const variance = Math.floor(Math.random() * 3) - 1; // -1 to +1
  return Math.max(1, Math.round(base * sizeMultiplier + variance));
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
  // Enemies should be able to start below the player-party starting level.
  // Instantiate at level 1 and level up to the target.
  const creature = instantiateCreature(template.id, 1);

  while (creature.level < targetLevel) {
    addXpToCreature(creature, xpToNextLevel(creature.level));
  }

  // Ensure enemy has ALL moves up to its level (addXpToCreature only auto-adds if < 3)
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

export function generateEnemyCreatures(highestAllyLevel = 1, { maxEnemies, creaturePool, stage, encounterIndex, totalEncounters } = {}) {
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
    const targetLevel = getEnemyLevel({
      totalEncounters: totalEncounters || 0,
      enemyCount
    });
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

/**
 * Assign a uid to a creature object if it doesn't have one.
 * Idempotent — preserves an existing uid.
 * @param {object|null} creature
 * @returns {object|null} the creature (mutated), or the input unchanged for null
 */
export function backfillCreatureUid(creature) {
  if (creature && typeof creature === 'object' && !creature.uid) {
    creature.uid = crypto.randomUUID();
  }
  return creature;
}

/**
 * Walk an array of creatures and backfill uids on each. Tolerates non-array
 * input (undefined/null/object) by silently no-oping — useful for save-load
 * paths where a property may not exist on older save formats.
 * @param {*} list
 */
export function backfillCreatureListUids(list) {
  if (!Array.isArray(list)) return list;
  for (const c of list) backfillCreatureUid(c);
  return list;
}

