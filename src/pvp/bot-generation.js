import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { instantiateCreatureForCombat } from '../game/creatures.js';
import { ACTIVE_PARTY_SKILL_IDS, PARTY_SKILLS_CATALOG } from '../game/party-skills.js';
import { applyItem, createItemBuffs } from '../game/services/item-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREATURES = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf8'));
const ITEMS = JSON.parse(readFileSync(join(__dirname, '../../data/items.json'), 'utf8'));

const STRENGTH_RATING_MIN = 900;
const STRENGTH_RATING_MAX = 1600;
const DEFAULT_SIGMA = 25 / 3;
const EQUIPMENT_PER_COMPLETED_RUN = { min: 3, max: 7 };

export function createSeededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function random() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function pickWeighted(entries, random) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries.at(-1).value;
}

function shuffle(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function rarityWeightsForStrength(strength) {
  const s = Math.max(1, Math.min(10, strength));
  return {
    common: Math.max(8, 72 - s * 6),
    uncommon: 22 + s,
    rare: Math.max(2, s * 4),
    epic: Math.max(0, s - 5),
    legendary: s >= 10 ? 2 : 0
  };
}

function levelForStrength(strength, random) {
  const base = 18 + strength;
  const variance = Math.floor(random() * 5) - 2;
  return Math.max(16, Math.min(32, base + variance));
}

function targetRatingForStrength(strength, random) {
  const t = (Math.max(1, Math.min(10, strength)) - 1) / 9;
  const base = STRENGTH_RATING_MIN + (STRENGTH_RATING_MAX - STRENGTH_RATING_MIN) * t;
  const noise = Math.floor(random() * 81) - 40;
  return Math.round(base + noise);
}

export function displayRatingToOpenSkillRating(displayRating) {
  return {
    mu: 25 + (displayRating - 1200) / 40,
    sigma: DEFAULT_SIGMA
  };
}

function pickCreatureTemplates({ strength, count, random }) {
  const picked = [];
  const used = new Set();
  const weights = rarityWeightsForStrength(strength);

  while (picked.length < count) {
    const rarity = pickWeighted(Object.entries(weights).map(([value, weight]) => ({ value, weight })), random);
    const rarityPool = CREATURES
      .filter(creature => creature.rarity === rarity && !used.has(creature.id))
      .sort((a, b) => (a.stage || 1) - (b.stage || 1) || (a.rank || 999999) - (b.rank || 999999));
    const fallbackPool = CREATURES.filter(creature => !used.has(creature.id));
    const source = rarityPool.length > 0 ? rarityPool : fallbackPool;
    const poolDepth = Math.max(3, Math.ceil(source.length * (0.35 + strength * 0.065)));
    const biasedPool = source.slice(0, poolDepth);
    const template = biasedPool[Math.floor(random() * biasedPool.length)];
    used.add(template.id);
    picked.push(template);
  }

  return picked;
}

function legalPartySkillIds(owned) {
  return Object.keys(PARTY_SKILLS_CATALOG).filter(id => {
    if (!ACTIVE_PARTY_SKILL_IDS.has(id)) return false;
    if (owned.has(id)) return false;
    const required = PARTY_SKILLS_CATALOG[id].requires;
    return !required || owned.has(required);
  });
}

function generatePartySkills(random) {
  const owned = new Set();
  const picked = [];
  for (let i = 0; i < 5; i++) {
    const eligible = legalPartySkillIds(owned);
    if (eligible.length === 0) break;
    const id = shuffle(eligible, random)[0];
    owned.add(id);
    picked.push({ id });
  }
  return picked;
}

function randomEquipmentCount(random) {
  const { min, max } = EQUIPMENT_PER_COMPLETED_RUN;
  return min + Math.floor(random() * (max - min + 1));
}

function applyEquipmentToCreature(item, creature) {
  if (!creature.itemBuffs) creature.itemBuffs = createItemBuffs();
  if (!creature.equippedItems) creature.equippedItems = [];
  applyItem(item, { active: [creature], reserves: [] }, {}, 0);
}

function applyRandomEquipment(team, random) {
  const equipment = ITEMS.filter(item => item.category === 'equipment');
  const creatures = [...team.creatureParty.active, ...team.creatureParty.reserves];
  const count = randomEquipmentCount(random);

  for (let i = 0; i < count; i++) {
    const item = { ...equipment[Math.floor(random() * equipment.length)] };
    const creature = creatures[Math.floor(random() * creatures.length)];
    applyEquipmentToCreature(item, creature);
  }
}

function assignDeterministicUid(creature, seed, index) {
  creature.uid = `bot-${seed}-${index}-${creature.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function generateRankedBotProfile({ index = 0, strength = 5, seed = 'ranked-bots-v1', username = null } = {}) {
  const random = createSeededRandom(`${seed}:${index}:${strength}`);
  const teamSize = 4 + Math.floor(random() * 3);
  const templates = pickCreatureTemplates({ strength, count: teamSize, random });
  const creatures = templates.map((template, creatureIndex) => {
    const creature = instantiateCreatureForCombat(template.id, levelForStrength(strength, random));
    assignDeterministicUid(creature, `${seed}-${index}`, creatureIndex);
    creature.itemBuffs = createItemBuffs();
    creature.equippedItems = [];
    return creature;
  });

  const team = {
    creatureParty: {
      active: creatures.slice(0, Math.min(3, creatures.length)),
      reserves: creatures.slice(3),
      maxTotal: 6
    },
    partySkills: generatePartySkills(random),
    itemBuffs: {},
    savedAt: 0
  };
  applyRandomEquipment(team, random);

  const displayRating = targetRatingForStrength(strength, random);
  return {
    index,
    username,
    strength,
    displayRating,
    ranked: {
      rating: displayRatingToOpenSkillRating(displayRating),
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      lastMatch: null
    },
    team
  };
}

export function generateRankedBotBatch({ count = 100, seed = 'ranked-bots-v1', usernames = [] } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const strength = (index % 10) + 1;
    return generateRankedBotProfile({
      index,
      strength,
      seed,
      username: usernames[index] || null
    });
  });
}

export function validateGeneratedBotProfile(bot) {
  const errors = [];
  const creatures = [
    ...(bot?.team?.creatureParty?.active || []),
    ...(bot?.team?.creatureParty?.reserves || [])
  ];
  if (creatures.length < 4 || creatures.length > 6) errors.push('team_size');
  if (new Set(creatures.map(c => c.id)).size !== creatures.length) errors.push('duplicate_creatures');
  if ((bot?.team?.partySkills || []).length !== 5) errors.push('party_skill_count');
  if (Object.keys(bot?.team?.itemBuffs || {}).length > 0) errors.push('party_item_buffs');
  for (const creature of creatures) {
    if (!creature.itemBuffs) errors.push(`missing_item_buffs:${creature.id}`);
    if (!Array.isArray(creature.equippedItems)) errors.push(`missing_equipped_items:${creature.id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function summarizeBotForReview(bot) {
  const creatures = [
    ...(bot.team.creatureParty.active || []),
    ...(bot.team.creatureParty.reserves || [])
  ];
  return {
    username: bot.username,
    strength: bot.strength,
    rating: bot.displayRating,
    teamSize: creatures.length,
    creatures: creatures.map(creature => ({
      id: creature.id,
      nameEn: creature.nameEn,
      level: creature.level,
      rarity: creature.rarity,
      items: (creature.equippedItems || []).map(item => item.nameEn || item.id)
    })),
    partySkills: bot.team.partySkills.map(skill => skill.id),
    validation: validateGeneratedBotProfile(bot)
  };
}
