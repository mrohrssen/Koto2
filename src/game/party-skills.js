export const PARTY_SKILL_TREE_IDS = Object.freeze([
  'arcStrike',
  'hpMaster',
  'counterMaster',
  'buffMaster',
  'expMaster',
  'debuffMaster'
]);

export const PARTY_SKILL_TREES = Object.freeze({
  arcStrike: {
    id: 'arcStrike',
    name: 'Arc Strike',
    levels: [
      { desc: 'Your attacks arc to another enemy for 30% damage.' },
      { desc: 'Arc strikes have a 50% chance to bounce one more time.' },
      { desc: 'Arc strike bounces deal 50% more damage per bounce.' },
      { desc: 'Arc strikes always bounce twice when possible.' },
      { desc: 'After the second bounce, arc strikes have a 25% chance to keep bouncing.' }
    ]
  },
  hpMaster: {
    id: 'hpMaster',
    name: 'HP Master',
    levels: [
      { desc: "All ally creatures' max HP increases by 25%." },
      { desc: 'After combat, ally creatures restore 100% more HP.' },
      { desc: 'Healing actions restore 50% more HP.' },
      { desc: 'Healing actions give the healed creature a random buff.' },
      { desc: "All ally creatures' max HP increases by another 100%." }
    ]
  },
  counterMaster: {
    id: 'counterMaster',
    name: 'Counter Master',
    levels: [
      { desc: 'When hit, ally creatures have a 50% chance to counterattack with 7 power.' },
      { desc: 'When hit, ally creatures have a 75% chance to counterattack.' },
      { desc: 'Ally creatures always counterattack when hit.' },
      { desc: 'Counterattacks deal double damage while the countering creature is below 50% HP.' },
      { desc: 'All counterattack damage is doubled.' }
    ]
  },
  buffMaster: {
    id: 'buffMaster',
    name: 'Buff Master',
    levels: [
      { desc: 'Each turn, ally creatures have a 25% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 50% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures have a 75% chance to gain a random buff.' },
      { desc: 'Each turn, ally creatures gain a random buff.' },
      { desc: 'When an ally creature acts, it has a 25% chance to give a random ally a random buff.' }
    ]
  },
  expMaster: {
    id: 'expMaster',
    name: 'Exp Master',
    levels: [
      { desc: 'Ally creatures gain 25% more XP.' },
      { desc: 'Ally creatures gain 50% more XP.' },
      { desc: 'Ally creatures gain 75% more XP.' },
      { desc: 'Ally creatures gain 100% more XP.' },
      { desc: 'When an ally creature levels up, it has a 10% chance to level up again.' }
    ]
  },
  debuffMaster: {
    id: 'debuffMaster',
    name: 'Debuff Master',
    levels: [
      { desc: 'Enemies hit by your attacks have a 20% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 40% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have a 60% chance to receive a random debuff.' },
      { desc: 'Enemies hit by your attacks have an 80% chance to receive a random debuff.' },
      { desc: 'When an enemy acts, it has a 50% chance to give one of its own allies a random debuff.' }
    ]
  }
});

export const OLD_PARTY_SKILL_ID_TO_TREE = Object.freeze({
  arcStrike: 'arcStrike',
  forkedArc: 'arcStrike',
  resonantArc: 'arcStrike',
  chainSurge: 'arcStrike',
  elementalCascade: 'arcStrike',
  retaliationStrike: 'counterMaster',
  hardenedRiposte: 'counterMaster',
  furyCounter: 'counterMaster',
  vengefulMark: 'counterMaster',
  lastStand: 'counterMaster',
  sharedVigor: 'buffMaster',
  momentum: 'buffMaster',
  diverseEmpowerment: 'buffMaster',
  overflowVitality: 'buffMaster',
  radiantAura: 'buffMaster',
  contagion: 'debuffMaster',
  erosion: 'debuffMaster',
  virulentChain: 'debuffMaster',
  afflictionBurst: 'debuffMaster',
  pandemic: 'debuffMaster',
  superEffectiveMend: 'hpMaster',
  guardPulse: 'hpMaster',
  hasteSpark: 'buffMaster',
  battleRhythm: 'buffMaster',
  finisherFeast: 'expMaster'
});

export const PARTY_SKILLS_CATALOG = PARTY_SKILL_TREES;
export const ACTIVE_PARTY_SKILL_IDS = new Set(PARTY_SKILL_TREE_IDS);

function clampLevel(level) {
  return Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
}

function clampOwnedLevel(level) {
  return Math.max(0, Math.min(5, Math.floor(Number(level) || 0)));
}

function treeIdForEntry(entry) {
  const rawId = typeof entry === 'string' ? entry : entry?.id || entry?.skillId;
  if (!rawId) return null;
  if (PARTY_SKILL_TREES[rawId]) return rawId;
  return OLD_PARTY_SKILL_ID_TO_TREE[rawId] || null;
}

export function canonicalPartySkillTreeId(entry) {
  return treeIdForEntry(entry);
}

export function normalizePartySkills(runPartySkills = []) {
  const levelsById = new Map();
  for (const entry of runPartySkills || []) {
    const id = treeIdForEntry(entry);
    if (!id) continue;
    const isCompact = typeof entry === 'object' && PARTY_SKILL_TREES[entry.id] && entry.level != null;
    const credit = isCompact ? clampLevel(entry.level) : 1;
    levelsById.set(id, Math.min(5, (levelsById.get(id) || 0) + credit));
  }
  return [...levelsById.entries()].map(([id, level]) => ({ id, level: clampLevel(level) }));
}

export function getPartySkillLevel(runPartySkills, id) {
  let level = 0;
  for (const entry of runPartySkills || []) {
    if (treeIdForEntry(entry) !== id) continue;
    const isCompact = typeof entry === 'object' && PARTY_SKILL_TREES[entry.id] && entry.level != null;
    level = Math.min(5, level + (isCompact ? clampOwnedLevel(entry.level) : 1));
  }
  return level;
}

export function getPartySkillDisplay(id, level = 1) {
  const tree = PARTY_SKILL_TREES[id];
  if (!tree) return null;
  const clamped = clampLevel(level);
  return {
    id,
    level: clamped,
    name: tree.name,
    title: `${tree.name} - Lvl. ${clamped}`,
    desc: tree.levels[clamped - 1].desc
  };
}

export function getPartySkillOfferDisplay(offer) {
  const id = canonicalPartySkillTreeId(offer);
  if (!id) return null;
  const level = typeof offer === 'object' && offer?.level != null ? offer.level : 1;
  return getPartySkillDisplay(id, level);
}

export function rollSkillMasterOffers({ ownedSkillIds = [], count = 3, rng = Math.random } = {}) {
  const normalized = normalizePartySkills(ownedSkillIds);
  const byId = new Map(normalized.map(skill => [skill.id, skill.level]));
  const eligible = PARTY_SKILL_TREE_IDS
    .map(id => ({ id, level: (byId.get(id) || 0) + 1 }))
    .filter(offer => offer.level <= 5);

  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const n = Math.max(0, Math.min(Number(count) || 0, eligible.length));
  return eligible.slice(0, n).map(offer => getPartySkillDisplay(offer.id, offer.level));
}

export function applyPartySkillChoice(runPartySkills, id) {
  id = canonicalPartySkillTreeId(id);
  if (!PARTY_SKILL_TREES[id]) throw new Error(`Unknown Party Skill tree: ${id}`);
  const normalized = normalizePartySkills(runPartySkills);
  const existing = normalized.find(skill => skill.id === id);
  if (existing && existing.level >= 5) throw new Error(`${PARTY_SKILL_TREES[id].name} is already at max level`);
  if (existing) existing.level += 1;
  else normalized.push({ id, level: 1 });
  normalized.sort((a, b) => PARTY_SKILL_TREE_IDS.indexOf(a.id) - PARTY_SKILL_TREE_IDS.indexOf(b.id));
  if (Array.isArray(runPartySkills)) {
    runPartySkills.splice(0, runPartySkills.length, ...normalized.map(skill => ({ ...skill })));
  }
  return normalized;
}

export function getHpMasterMaxHpMultiplier(runPartySkills) {
  const level = getPartySkillLevel(runPartySkills, 'hpMaster');
  return 1 + (level >= 1 ? 0.25 : 0) + (level >= 5 ? 1 : 0);
}

export function getPostCombatRecoveryMultiplier(runPartySkills) {
  return getPartySkillLevel(runPartySkills, 'hpMaster') >= 2 ? 2 : 1;
}

export function getHealingMultiplier(runPartySkills) {
  return getPartySkillLevel(runPartySkills, 'hpMaster') >= 3 ? 1.5 : 1;
}

export function getXpMultiplier(runPartySkills) {
  const level = getPartySkillLevel(runPartySkills, 'expMaster');
  if (level >= 4) return 2;
  if (level >= 3) return 1.75;
  if (level >= 2) return 1.5;
  if (level >= 1) return 1.25;
  return 1;
}
