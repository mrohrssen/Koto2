/**
 * Shared XP utilities for Kanji Kombat.
 *
 * This module is browser-safe: it does NOT import from src/game/creatures.js
 * (which uses readFileSync). It uses only the template fields already stored
 * on each creature object at runtime (baseHpTemplate, baseAttackTemplate, etc.).
 *
 * Used by both the server (via kanji-kombat-service.js) and the client
 * (via applyLocalKanjiKombatDeferredKillXp in combat-loop.js) so that
 * the client applies the same XP/level-up HP changes as the server when
 * predicting the hash for the first quiz of a new wave.
 */
import { getXpMultiplier, getPartySkillLevel } from '../../game/party-skills.js';

const RARITY_MULTIPLIERS = {
  common: 1.0,
  uncommon: 1.1,
  rare: 1.2,
  epic: 1.3,
  legendary: 1.4,
};

const LEVEL_UP_RESTORE_PERCENT = 0.10;

export const BASE_KILL_XP = 25;

/**
 * XP required to advance from `level` to `level + 1`.
 * Mirrors src/game/creatures.js::xpToNextLevel.
 */
export function xpToNextLevel(level) {
  return Math.pow(level + 1, 3) - Math.pow(level, 3);
}

/**
 * Stat block for a given level.
 * Mirrors src/game/creatures.js::getStatsForLevel.
 */
function getStatsForLevel(baseHp, baseAttack, baseMp, level, baseDefense = 5, baseDex) {
  const mult = 1 + (level - 1) * 0.1;
  return {
    maxHp: Math.floor(baseHp * mult),
    attack: Math.floor(baseAttack * mult),
    maxMp: Math.floor(baseMp * mult),
    defense: Math.max(1, Math.round(baseDefense * mult)),
    dex: Math.max(1, Math.round(baseDex * mult)),
  };
}

/**
 * Add `xp` to `creature`, triggering level-ups as needed.
 *
 * Browser-safe version of src/game/creatures.js::addXpToCreature.
 * Differences from the original:
 *  - Does NOT look up CREATURES_BY_ID (template fields must already be on the object).
 *  - Does NOT learn new moves. This is required for client/server hash parity,
 *    not just a simplification: the transcript hash covers full creature
 *    objects including move lists, and the client cannot learn moves on
 *    level-up (no CREATURES_BY_ID in the browser), so every server path that
 *    feeds the hash must use THIS routine too. KK party levels are run-scoped
 *    and KK allies never use their move lists (they attack via the synthetic
 *    strike), so skipping move learning is purely cosmetic.
 *  - getStatsForLevel's dex fallback is `baseDexTemplate ?? 5`; the original
 *    calls requireBaseDex(...) on the creature template, which can throw when
 *    the template lacks baseDex.
 *
 * Mutates `creature` in place. Returns an array of level-up descriptors.
 */
export function addXpToCreatureShared(creature, xp, metaMults = null, _itemBuffs = null) {
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
    const baseDex = Math.floor((creature.baseDexTemplate ?? 5) * rarityMult);
    const stats = getStatsForLevel(baseHp, baseAtk, baseMp, creature.level, baseDef, baseDex);
    const cBuffs = creature.itemBuffs || _itemBuffs;
    const lMult = 1 + (creature.level - 1) * 0.1;
    const equipHpBonus = cBuffs?.baseHpBonus ? Math.floor(cBuffs.baseHpBonus * lMult) : 0;
    const equipMpBonus = cBuffs?.baseMpBonus ? Math.floor(cBuffs.baseMpBonus * lMult) : 0;
    let hpDiff = (stats.maxHp + equipHpBonus) - creature.maxHp;
    const mpDiff = (stats.maxMp + equipMpBonus) - (creature.maxMp || 0);
    creature.maxHp = stats.maxHp + equipHpBonus;
    creature.attack = stats.attack;
    creature.defense = stats.defense;
    creature.dex = stats.dex;
    creature.maxMp = stats.maxMp + equipMpBonus;
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
      if (metaMults.dexMult > 1) {
        creature.dex = Math.max(1, Math.round(creature.dex * metaMults.dexMult));
      }
    }
    if (creature.hp > 0) {
      const hpRestore = Math.floor(creature.maxHp * LEVEL_UP_RESTORE_PERCENT);
      creature.hp = Math.min(creature.maxHp, creature.hp + hpDiff + hpRestore);
    }
    const mpRestore = Math.floor(creature.maxMp * LEVEL_UP_RESTORE_PERCENT);
    creature.mp = Math.min(creature.maxMp, (creature.mp || 0) + mpDiff + mpRestore);
    levelUps.push({
      level: creature.level,
      maxHp: stats.maxHp,
      attack: stats.attack,
      defense: stats.defense,
      dex: stats.dex,
      maxMp: stats.maxMp,
      hpGain: hpDiff,
      mpGain: mpDiff,
    });
  }
  return levelUps;
}

/**
 * Award kill XP to all creatures in `creatureParty`.
 *
 * Browser-safe version of creature-combat-service.js::awardKillXp.
 * Only difference from the original: uses addXpToCreatureShared (no
 * CREATURES_BY_ID lookup, no move learning). The Kanji Kombat server paths
 * (deferred kill XP + streak rewards) use THIS function too, so client and
 * server level-ups produce bit-identical creature objects for hashing.
 *
 * Mutates creatures in place. Returns { xpGrants, levelUps }.
 */
export function applyKillXpToParty(creatureParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0, metaMults = null, itemBuffs = null, runPartySkills = [], rng = Math.random) {
  const partySkillXpMult = getXpMultiplier(runPartySkills || []);
  const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * 2 * partySkillXpMult);
  const activeCreatures = (creatureParty.active || []).filter(r => r && r.hp > 0);
  const reserveCreatures = (creatureParty.reserves || []).filter(r => r != null);
  const totalShares = activeCreatures.length * 2 + reserveCreatures.length * 1;
  if (totalShares === 0) return { xpGrants: [], levelUps: [] };

  const perShare = baseXp / totalShares;

  const entries = [];
  for (const creature of activeCreatures) {
    const cMult = creature.itemBuffs?.xpMultiplier || xpMultiplier || 1.0;
    entries.push({ creature, xp: Math.floor(perShare * 2 * cMult) });
  }
  for (const creature of reserveCreatures) {
    const cMult = creature.itemBuffs?.xpMultiplier || xpMultiplier || 1.0;
    entries.push({ creature, xp: Math.floor(perShare * 1 * cMult) });
  }

  // EXP Balance redistribution
  if (xpBalanceStacks > 0 && entries.length > 1) {
    const totalLevel = entries.reduce((sum, e) => sum + e.creature.level, 0);
    const meanLevel = Math.floor(totalLevel / entries.length);
    const totalXp = entries.reduce((sum, e) => sum + e.xp, 0);
    const recipientCount = entries.filter(e => e.creature.level <= meanLevel).length;
    if (recipientCount > 0) {
      const splitXp = totalXp / recipientCount;
      const t = Math.min(0.2 * xpBalanceStacks, 0.8);
      for (const entry of entries) {
        const isRecipient = entry.creature.level <= meanLevel;
        const target = isRecipient ? splitXp : 0;
        entry.xp = Math.floor(entry.xp + (target - entry.xp) * t);
      }
    }
  }

  const xpGrants = [];
  const levelUps = [];
  const leveledCreatures = new WeakSet();

  for (const entry of entries) {
    const prevLevel = entry.creature.level;
    const creatureLevelUps = addXpToCreatureShared(entry.creature, entry.xp, metaMults, itemBuffs);
    xpGrants.push({ creatureId: entry.creature.id, creatureName: entry.creature.nameEn, xp: entry.xp });
    if (creatureLevelUps.length > 0) {
      leveledCreatures.add(entry.creature);
    }
    for (const lu of creatureLevelUps) {
      levelUps.push({
        creatureId: entry.creature.id,
        creatureName: entry.creature.nameEn,
        oldLevel: prevLevel,
        newLevel: lu.level,
        maxHp: lu.maxHp,
        attack: lu.attack,
        hpGain: lu.hpGain,
        maxMp: lu.maxMp,
        mpGain: lu.mpGain,
      });
    }
  }

  // expMaster level 5: 10% chance of bonus level-up for creatures that leveled.
  // Uses rng — the caller must pass the same xpRng used by the server for this to match.
  if (getPartySkillLevel(runPartySkills || [], 'expMaster') >= 5) {
    for (const entry of entries) {
      if (leveledCreatures.has(entry.creature) && rng() < 0.10) {
        const extra = addXpToCreatureShared(entry.creature, xpToNextLevel(entry.creature.level), metaMults, itemBuffs);
        for (const lu of extra) {
          levelUps.push({
            creatureId: entry.creature.id,
            creatureName: entry.creature.nameEn,
            oldLevel: lu.level - 1,
            newLevel: lu.level,
            maxHp: lu.maxHp,
            attack: lu.attack,
            hpGain: lu.hpGain,
            maxMp: lu.maxMp,
            mpGain: lu.mpGain,
            partySkillBonus: 'expMaster',
          });
        }
      }
    }
  }

  return { xpGrants, levelUps };
}
