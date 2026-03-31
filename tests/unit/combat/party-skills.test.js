import test from 'node:test';
import assert from 'node:assert/strict';

import { PARTY_SKILLS_CATALOG, rollSkillMasterOffers, getPartySkillDisplay } from '../../../src/game/party-skills.js';
import { applyPartySkillsAfterPlayerAttacks } from '../../../src/game/services/creature-combat-service.js';

test('catalog has 20 skills across 4 loops', () => {
  const skills = Object.values(PARTY_SKILLS_CATALOG);
  assert.equal(skills.length, 20);

  const loops = new Set(skills.map(s => s.loop));
  assert.deepEqual([...loops].sort(), ['buff', 'chain', 'counter', 'debuff']);

  for (const loop of ['chain', 'counter', 'debuff', 'buff']) {
    const loopSkills = skills.filter(s => s.loop === loop);
    assert.equal(loopSkills.length, 5, `${loop} loop should have 5 skills`);
  }

  for (const skill of skills) {
    assert.ok(skill.id, `skill missing id`);
    assert.ok(skill.name, `${skill.id} missing name`);
    assert.ok(skill.loop, `${skill.id} missing loop`);
    assert.ok(skill.desc, `${skill.id} missing desc`);
  }
});

test('rollSkillMasterOffers excludes owned and returns up to count', () => {
  const offers = rollSkillMasterOffers({ ownedSkillIds: [], count: 3 });
  assert.equal(offers.length, 3);
  assert.equal(new Set(offers).size, 3);
  for (const id of offers) {
    assert.ok(PARTY_SKILLS_CATALOG[id], `${id} not in catalog`);
  }

  const offers2 = rollSkillMasterOffers({ ownedSkillIds: offers, count: 3 });
  for (const id of offers2) {
    assert.ok(!offers.includes(id), `${id} should be excluded`);
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
    runPartySkills: ['arcStrike', 'chainSurge'],
    combat
  });

  assert.equal(allies[0].hp, 40, 'no changes from non-qualifying records');
  assert.equal(enemies[0].hp, 100, 'no chain on non-qualifying records');
});

