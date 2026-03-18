export const PARTY_SKILLS_CATALOG = {
  superEffectiveMend: {
    id: 'superEffectiveMend',
    name: 'Super-Effective Mend',
    desc: 'On a proc, heal a small portion of max HP.',
    params: { procChance: 0.20, healPct: 0.10 }
  },
  hasteSpark: {
    id: 'hasteSpark',
    name: 'Haste Spark',
    desc: 'On a proc, gain a burst of speed.',
    params: { procChance: 0.25 }
  },
  guardPulse: {
    id: 'guardPulse',
    name: 'Guard Pulse',
    desc: 'On a proc, grant a small shield for a short duration.',
    params: { procChance: 0.20, shieldPct: 0.10, durationTurns: 2 }
  },
  battleRhythm: {
    id: 'battleRhythm',
    name: 'Battle Rhythm',
    desc: 'Every Nth hit deals bonus damage.',
    params: { everyNthHit: 5, bonusDamageMult: 0.5 }
  },
  finisherFeast: {
    id: 'finisherFeast',
    name: 'Finisher Feast',
    desc: 'Heal a small portion of max HP after finishing an enemy.',
    params: { healPct: 0.05 }
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

