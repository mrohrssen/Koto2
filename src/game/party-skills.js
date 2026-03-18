export const PARTY_SKILLS_CATALOG = {
  hardyCrew: {
    id: 'hardyCrew',
    name: 'Hardy Crew',
    desc: 'Increase party max HP by 10% for this run.',
    params: { hpMult: 1.1 }
  },
  sharpEdge: {
    id: 'sharpEdge',
    name: 'Sharp Edge',
    desc: 'Increase party damage by 8% for this run.',
    params: { damageMult: 1.08 }
  },
  steadyHands: {
    id: 'steadyHands',
    name: 'Steady Hands',
    desc: 'Increase accuracy for this run.',
    params: { accuracyBonus: 0.05 }
  },
  quickStudy: {
    id: 'quickStudy',
    name: 'Quick Study',
    desc: 'Gain 10% more XP for this run.',
    params: { xpMult: 1.1 }
  },
  thickHide: {
    id: 'thickHide',
    name: 'Thick Hide',
    desc: 'Reduce incoming damage by 1 for this run.',
    params: { flatDamageReduction: 1 }
  },
  luckyFinds: {
    id: 'luckyFinds',
    name: 'Lucky Finds',
    desc: 'Gain 10% more credits for this run.',
    params: { creditsMult: 1.1 }
  }
};

function toOwnedSet(ownedSkillIds) {
  if (!ownedSkillIds) return new Set();
  if (ownedSkillIds instanceof Set) return ownedSkillIds;
  if (Array.isArray(ownedSkillIds)) return new Set(ownedSkillIds.filter(Boolean));
  return new Set();
}

/**
 * Roll random distinct party-skill IDs for Skill Master offers.
 * Excludes already-owned IDs.
 */
export function rollSkillMasterOffers({ ownedSkillIds = [], count = 3 }) {
  const owned = toOwnedSet(ownedSkillIds);
  const eligible = Object.keys(PARTY_SKILLS_CATALOG).filter(id => !owned.has(id));
  if (eligible.length === 0) return [];

  // Fisher–Yates shuffle (in-place), then take first N
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const n = Math.max(0, Math.min(Number(count) || 0, eligible.length));
  return eligible.slice(0, n);
}

export function getPartySkillDisplay(id) {
  const def = PARTY_SKILLS_CATALOG[id];
  if (!def) return null;
  return { id: def.id, name: def.name, desc: def.desc, params: def.params };
}

