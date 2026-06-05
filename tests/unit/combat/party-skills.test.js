import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTY_SKILLS_CATALOG,
  PARTY_SKILL_TREE_IDS,
  getPartySkillDisplay,
  rollSkillMasterOffers
} from '../../../src/game/party-skills.js';
import { applyPartySkillsAfterPlayerAttacks } from '../../../src/game/services/creature-combat-service.js';

test('catalog defines six five-level party skill trees', () => {
  assert.deepEqual(Object.keys(PARTY_SKILLS_CATALOG), PARTY_SKILL_TREE_IDS);
  assert.equal(Object.values(PARTY_SKILLS_CATALOG).length, 6);

  for (const id of PARTY_SKILL_TREE_IDS) {
    const tree = PARTY_SKILLS_CATALOG[id];
    assert.equal(tree.id, id);
    assert.ok(tree.name, `${id} missing name`);
    assert.equal(tree.levels.length, 5, `${id} should have 5 levels`);
    for (let level = 1; level <= 5; level++) {
      const display = getPartySkillDisplay(id, level);
      assert.equal(display.id, id);
      assert.equal(display.level, level);
      assert.match(display.title, /Lvl\./);
      assert.ok(display.desc.length > 10);
    }
  }
});

test('rollSkillMasterOffers returns next-level displays and excludes maxed trees', () => {
  const offers = rollSkillMasterOffers({
    ownedSkillIds: [
      { id: 'arcStrike', level: 2 },
      { id: 'hpMaster', level: 5 },
    ],
    count: 6,
    rng: () => 0.5,
  });

  assert.equal(new Set(offers.map(offer => offer.id)).size, offers.length);
  assert.equal(offers.find(offer => offer.id === 'arcStrike')?.level, 3);
  assert.equal(offers.some(offer => offer.id === 'hpMaster'), false);
  assert.ok(offers.length <= 5);
  for (const offer of offers) {
    assert.ok(PARTY_SKILLS_CATALOG[offer.id], `${offer.id} not in catalog`);
    assert.ok(offer.level >= 1 && offer.level <= 5);
    assert.match(offer.title, /Lvl\./);
    assert.ok(offer.desc.length > 10);
  }
});

function makeAlly({ id, hp = 50, maxHp = 100, attack = 20, element = 'fire', defense = 10 } = {}) {
  return { id: id || 'ally', hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeEnemy({ id, hp = 100, maxHp = 100, element = 'water', attack = 15, defense = 10 } = {}) {
  return { id: id || 'enemy', hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

test('engine gracefully ignores unknown/removed skill IDs (legacy v1 skills)', () => {
  const allies = [makeAlly({ id: 'a1', hp: 40, maxHp: 100 }), makeAlly({ id: 'a2', hp: 80, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const combat = { chainHitsThisTurn: 0 };
  const attacks = [{
    attackerIndex: 0,
    category: 'damage',
    damage: 10,
    elementMultiplier: 2,
    targetIndex: 0,
    targetDefeated: false,
    partySkillProcs: [],
    statChangesApplied: null,
    effectApplied: null
  }];

  // These are the old v1 skill IDs that were removed — the engine should not crash
  applyPartySkillsAfterPlayerAttacks({
    attacks,
    allies,
    enemies,
    runPartySkills: ['battleRhythm', 'superEffectiveMend', 'hasteSpark', 'guardPulse', 'finisherFeast'],
    combat
  });

  // No side effects: no healing, no haste, no team shield, no bonus damage
  assert.equal(allies[0].hp, 40, 'no healing from removed skills');
  assert.equal(allies[1].hp, 80, 'no healing from removed skills');
  assert.equal(allies[0].activeEffects.length, 0, 'no effects from removed skills');
  assert.equal(enemies[0].hp, 100, 'no bonus damage from removed skills');
  assert.deepEqual(attacks[0].partySkillProcs, [], 'no procs from removed skills');
});

test('non-qualifying records (NPC skill / heal / zero-damage) are ignored by the engine', () => {
  const allies = [makeAlly({ id: 'a1', hp: 40, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const combat = { chainHitsThisTurn: 0 };
  const attacks = [
    // NPC skill record (attackerIndex -1)
    { attackerIndex: -1, category: 'damage', damage: 50, elementMultiplier: 2, targetIndex: 0, targetDefeated: false, partySkillProcs: [], statChangesApplied: null, effectApplied: null },
    // Heal category
    { attackerIndex: 0, category: 'heal', damage: 0, elementMultiplier: 2, targetIndex: 0, targetDefeated: false, partySkillProcs: [], statChangesApplied: null, effectApplied: null },
    // Zero damage
    { attackerIndex: 0, category: 'damage', damage: 0, elementMultiplier: 2, targetIndex: 0, targetDefeated: false, partySkillProcs: [], statChangesApplied: null, effectApplied: null },
  ];

  applyPartySkillsAfterPlayerAttacks({
    attacks,
    allies,
    enemies,
    runPartySkills: [{ id: 'arcStrike', level: 5 }],
    combat
  });

  assert.equal(allies[0].hp, 40, 'no changes from non-qualifying records');
  assert.equal(enemies[0].hp, 100, 'no chain on non-qualifying records');
});
