import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addXpToCreature } from '../../../src/game/creatures.js';
import {
  awardKillXp,
  BASE_KILL_XP as SERVER_BASE_KILL_XP,
} from '../../../src/game/services/creature-combat-service.js';
import {
  addXpToCreatureShared,
  applyKillXpToParty,
  BASE_KILL_XP as SHARED_BASE_KILL_XP,
} from '../../../src/shared/combat/kanji-kombat-xp.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';

// Drift-equivalence tests: src/shared/combat/kanji-kombat-xp.js deliberately
// mirrors the level/XP math of src/game/creatures.js::addXpToCreature and
// creature-combat-service.js::awardKillXp (it only skips move learning — see
// the module doc for why). If anyone edits a formula or constant in one copy
// but not the other, these tests must fail.
//
// IMPORTANT: creature levels in these fixtures are positioned AWAY from the
// learnset boundaries of the real creature template used ('hi' learns moves at
// levels 1/7/12/18/24), so move learning never fires and the only legitimate
// behavioral difference between the two implementations is inert. A real
// creature id is required because the original addXpToCreature may consult
// CREATURES_BY_ID (learnset lookup, requireBaseDex fallback).

// 'hi' from data/creatures.json: learnset levels 1, 7, 12, 18, 24.
const REAL_CREATURE_ID = 'hi';

function makeCreature(overrides = {}) {
  return {
    id: REAL_CREATURE_ID,
    nameEn: 'Hino',
    rarity: 'common',
    level: 3,
    xp: 0,
    hp: 40,
    maxHp: 60,
    mp: 30,
    maxMp: 60,
    attack: 24,
    defense: 6,
    dex: 14,
    moves: [{ id: 'honoo', power: 40 }],
    baseHpTemplate: 50,
    baseAttackTemplate: 20,
    baseMpTemplate: 50,
    baseDefenseTemplate: 5,
    baseDexTemplate: 12,
    ...overrides,
  };
}

/**
 * The original implementations attach `newMove` (null when nothing is learned)
 * to each level-up descriptor; the shared versions omit the key entirely.
 * Assert no move was actually learned, then strip the key so the remaining
 * fields can be compared deep-equal.
 */
function normalizeLevelUps(levelUps) {
  return levelUps.map(lu => {
    const { newMove, ...rest } = lu;
    assert.equal(newMove ?? null, null, 'fixture drifted onto a learnset boundary — a move was learned');
    return rest;
  });
}

describe('kanji-kombat-xp parity with server XP implementations', () => {
  it('exports the same BASE_KILL_XP as creature-combat-service', () => {
    assert.equal(SHARED_BASE_KILL_XP, SERVER_BASE_KILL_XP);
  });

  it('addXpToCreatureShared matches addXpToCreature across multi-level-ups', () => {
    // 108 XP from level 3: 3→4 costs 37, 4→5 costs 61, leaving 10 — two
    // level-ups, ending at level 5, safely below the next learnset entry (7).
    const original = makeCreature();
    const shared = makeCreature();
    const metaMults = { hpMult: 1.2, atkMult: 1.1, mpMult: 1, defMult: 1.15, dexMult: 1.1 };
    const itemBuffs = { baseHpBonus: 8, baseMpBonus: 4 };

    const originalLevelUps = addXpToCreature(original, 108, metaMults, itemBuffs);
    const sharedLevelUps = addXpToCreatureShared(shared, 108, metaMults, itemBuffs);

    assert.equal(original.level, 5);
    assert.equal(originalLevelUps.length, 2);
    assert.deepEqual(shared, original);
    assert.deepEqual(normalizeLevelUps(sharedLevelUps), normalizeLevelUps(originalLevelUps));
  });

  it('addXpToCreatureShared matches addXpToCreature with no meta/item modifiers', () => {
    const original = makeCreature({ level: 4, xp: 20, hp: 66 });
    const shared = makeCreature({ level: 4, xp: 20, hp: 66 });

    const originalLevelUps = addXpToCreature(original, 50, null, null);
    const sharedLevelUps = addXpToCreatureShared(shared, 50, null, null);

    assert.equal(original.level, 5);
    assert.deepEqual(shared, original);
    assert.deepEqual(normalizeLevelUps(sharedLevelUps), normalizeLevelUps(originalLevelUps));
  });

  it('applyKillXpToParty matches awardKillXp with identical seeded rng', () => {
    // enemyLevel 3 with expMaster 5 (xp multiplier 2): baseXp = 300, shares
    // 2+2+1 — XP-balance redistribution then shifts XP toward the level-3
    // creatures. Max reachable level (including a possible expMaster bonus
    // level) stays below the 'hi' learnset boundary at 7; guarded below.
    function makeParty() {
      return {
        active: [
          makeCreature({ nameEn: 'Alpha', level: 3, hp: 40 }),
          makeCreature({ nameEn: 'Beta', level: 5, hp: 70, maxHp: 84, xp: 12, itemBuffs: { xpMultiplier: 1.5 } }),
        ],
        reserves: [
          makeCreature({ nameEn: 'Gamma', level: 3, hp: 55 }),
          null,
        ],
      };
    }
    const enemyLevel = 3;
    const xpMultiplier = 1.0;
    const xpBalanceStacks = 2;
    const metaMults = { hpMult: 1.2, atkMult: 1.1, mpMult: 1, defMult: 1, dexMult: 1 };
    const itemBuffs = { baseHpBonus: 5 };
    const runPartySkills = [{ id: 'expMaster', level: 5 }];

    const serverParty = makeParty();
    const sharedParty = makeParty();

    const serverResult = awardKillXp(
      serverParty, enemyLevel, xpMultiplier, xpBalanceStacks,
      metaMults, itemBuffs, runPartySkills, createSeededRng('kk-xp-parity'),
    );
    const sharedResult = applyKillXpToParty(
      sharedParty, enemyLevel, xpMultiplier, xpBalanceStacks,
      metaMults, itemBuffs, runPartySkills, createSeededRng('kk-xp-parity'),
    );

    // Guard the fixture itself: stay away from the level-7 learnset boundary.
    for (const c of [...serverParty.active, ...serverParty.reserves]) {
      if (c) assert.ok(c.level < 7, `fixture reached level ${c.level} — too close to learnset boundary`);
    }
    assert.ok(serverResult.levelUps.length > 0, 'fixture should produce at least one level-up');

    assert.deepEqual(sharedParty, serverParty);
    assert.deepEqual(sharedResult.xpGrants, serverResult.xpGrants);
    assert.deepEqual(normalizeLevelUps(sharedResult.levelUps), normalizeLevelUps(serverResult.levelUps));
  });

  it('applyKillXpToParty matches awardKillXp when no creature levels up', () => {
    function makeParty() {
      return {
        active: [makeCreature({ level: 6, xp: 0, hp: 80, maxHp: 90 })],
        reserves: [],
      };
    }
    const serverParty = makeParty();
    const sharedParty = makeParty();

    const serverResult = awardKillXp(serverParty, 1, 1.0, 0, null, null, [], createSeededRng('kk-xp-parity-2'));
    const sharedResult = applyKillXpToParty(sharedParty, 1, 1.0, 0, null, null, [], createSeededRng('kk-xp-parity-2'));

    assert.equal(serverResult.levelUps.length, 0);
    assert.deepEqual(sharedParty, serverParty);
    assert.deepEqual(sharedResult, serverResult);
  });
});
