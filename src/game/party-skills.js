export const PARTY_SKILLS_CATALOG = {
  // ── Loop 1: Chain Combo ──
  arcStrike: {
    id: 'arcStrike', name: 'Arc Strike', loop: 'chain',
    desc: 'Attacks chain to another enemy for 30% damage, matching your element.',
    params: { chainDamagePct: 0.30, maxBounces: 1 }
  },
  forkedArc: {
    id: 'forkedArc', name: 'Forked Arc', loop: 'chain',
    desc: 'Chain bounces have a 50% chance to bounce again (up to 4 total).',
    requires: 'arcStrike',
    params: { bounceChance: 0.50, maxBounces: 4 }
  },
  resonantArc: {
    id: 'resonantArc', name: 'Resonant Arc', loop: 'chain',
    desc: 'Each successive chain bounce deals +15% more than the previous.',
    requires: 'forkedArc',
    params: { escalation: 0.15 }
  },
  chainSurge: {
    id: 'chainSurge', name: 'Chain Surge', loop: 'chain',
    desc: '3+ chain hits in a turn: all creatures gain ATK +1 stage.',
    requires: 'arcStrike',
    params: { threshold: 3, stageDelta: 1 }
  },
  elementalCascade: {
    id: 'elementalCascade', name: 'Elemental Cascade', loop: 'chain',
    desc: 'Super-effective chains deal 2x and may apply ATK -1 stage.',
    requires: 'arcStrike',
    params: { debuffChance: 0.30, stageDelta: -1 }
  },

  // ── Loop 2: Counter Attack ──
  retaliationStrike: {
    id: 'retaliationStrike', name: 'Retaliation Strike', loop: 'counter',
    desc: '50% chance to counter when hit for 25% ATK, element-matched.',
    params: { procChance: 0.50, damagePct: 0.25 }
  },
  hardenedRiposte: {
    id: 'hardenedRiposte', name: 'Hardened Riposte', loop: 'counter',
    desc: 'Counters deal +50% when you have a shield or positive DEF stage.',
    requires: 'retaliationStrike',
    params: { bonusMult: 0.50 }
  },
  furyCounter: {
    id: 'furyCounter', name: 'Fury Counter', loop: 'counter',
    desc: 'Each counter permanently adds +10% counter damage (up to 10 stacks).',
    requires: 'retaliationStrike',
    params: { stackBonus: 0.10, maxStacks: 10 }
  },
  vengefulMark: {
    id: 'vengefulMark', name: 'Vengeful Mark', loop: 'counter',
    desc: 'Counters apply ATK -1 stage to the attacker.',
    requires: 'retaliationStrike',
    params: { stageDelta: -1 }
  },
  lastStand: {
    id: 'lastStand', name: 'Last Stand', loop: 'counter',
    desc: 'Below 30% HP: counters deal double damage.',
    requires: 'retaliationStrike',
    params: { hpThreshold: 0.30, damageMult: 2.0 }
  },

  // ── Loop 3: Debuff Spread ──
  contagion: {
    id: 'contagion', name: 'Contagion', loop: 'debuff',
    desc: '35% chance applied debuffs spread to another enemy.',
    params: { spreadChance: 0.35 }
  },
  erosion: {
    id: 'erosion', name: 'Erosion', loop: 'debuff',
    desc: 'Each round, all negative stat stages on enemies deepen by 1.',
    params: { tickAmount: -1 }
  },
  virulentChain: {
    id: 'virulentChain', name: 'Virulent Chain', loop: 'debuff',
    desc: 'Contagion spreads can chain up to 3 times.',
    requires: 'contagion',
    params: { maxChains: 3 }
  },
  afflictionBurst: {
    id: 'afflictionBurst', name: 'Affliction Burst', loop: 'debuff',
    desc: '3+ debuff types on an enemy: burst for 20% max HP. 2-turn cooldown.',
    params: { threshold: 3, burstPct: 0.20, cooldown: 2 }
  },
  pandemic: {
    id: 'pandemic', name: 'Pandemic', loop: 'debuff',
    desc: 'Defeated debuffed enemies spread ALL debuffs to all survivors.',
    params: {}
  },

  // ── Loop 4: Buff Spread ──
  sharedVigor: {
    id: 'sharedVigor', name: 'Shared Vigor', loop: 'buff',
    desc: '50% chance buffs chain to a random ally.',
    params: { spreadChance: 0.50 }
  },
  momentum: {
    id: 'momentum', name: 'Momentum', loop: 'buff',
    desc: 'Each round, all positive stat stages on your party grow by 1.',
    params: { tickAmount: 1 }
  },
  diverseEmpowerment: {
    id: 'diverseEmpowerment', name: 'Diverse Empowerment', loop: 'buff',
    desc: '+8% damage per different buff type on the attacker.',
    params: { bonusPerType: 0.08 }
  },
  overflowVitality: {
    id: 'overflowVitality', name: 'Overflow Vitality', loop: 'buff',
    desc: '3+ buff types: regenerate 8% max HP at turn start.',
    params: { threshold: 3, regenPct: 0.08 }
  },
  radiantAura: {
    id: 'radiantAura', name: 'Radiant Aura', loop: 'buff',
    desc: '3+ buff types on any creature: +15% team damage. Two at 3+: +30%.',
    params: { threshold: 3, singleBonus: 0.15, doubleBonus: 0.30 }
  }
};

// Allowlist of skills that are currently offered to players. Skills outside
// this set remain in the catalog (so already-acquired skills keep working in
// combat) but are filtered out of new offers. Trim or extend this list to
// change what the Skill Master can hand out.
export const ACTIVE_PARTY_SKILL_IDS = new Set([
  'arcStrike',
  'retaliationStrike',
  'furyCounter',
  'vengefulMark',
  'contagion',
  'sharedVigor',
  'momentum',
  'diverseEmpowerment'
]);

function toOwnedSet(ownedSkillIds) {
  if (!ownedSkillIds) return new Set();
  if (ownedSkillIds instanceof Set) return ownedSkillIds;
  if (Array.isArray(ownedSkillIds)) return new Set(ownedSkillIds.filter(Boolean));
  return new Set();
}

export function rollSkillMasterOffers({ ownedSkillIds = [], count = 3 }) {
  const owned = toOwnedSet(ownedSkillIds);
  const eligible = Object.keys(PARTY_SKILLS_CATALOG).filter(id => {
    if (!ACTIVE_PARTY_SKILL_IDS.has(id)) return false;
    if (owned.has(id)) return false;
    const req = PARTY_SKILLS_CATALOG[id].requires;
    if (req && !owned.has(req)) return false;
    return true;
  });
  if (eligible.length === 0) return [];

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
  return { id: def.id, name: def.name, desc: def.desc, loop: def.loop, params: def.params };
}
