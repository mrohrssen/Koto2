import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_SKILL_TREES,
  PARTY_SKILL_TREE_IDS,
  applyPartySkillChoice,
  getHealingMultiplier,
  getHpMasterMaxHpMultiplier,
  getPartySkillDisplay,
  getPartySkillOfferDisplay,
  getPartySkillLevel,
  getPostCombatRecoveryMultiplier,
  getXpMultiplier,
  normalizePartySkills,
  rollSkillMasterOffers
} from '../../../src/game/party-skills.js';

describe('party skill trees', () => {
  it('defines six five-level trees with player-facing descriptions', () => {
    assert.deepEqual(PARTY_SKILL_TREE_IDS, [
      'arcStrike',
      'hpMaster',
      'counterMaster',
      'buffMaster',
      'expMaster',
      'debuffMaster'
    ]);
    for (const id of PARTY_SKILL_TREE_IDS) {
      assert.equal(PARTY_SKILL_TREES[id].levels.length, 5);
      for (let level = 1; level <= 5; level++) {
        const display = getPartySkillDisplay(id, level);
        assert.equal(display.id, id);
        assert.equal(display.level, level);
        assert.match(display.title, new RegExp(`${PARTY_SKILL_TREES[id].name} - Lvl\\. ${level}`));
        assert.equal(typeof display.desc, 'string');
        assert.ok(display.desc.length > 10);
      }
    }
  });

  it('rollSkillMasterOffers returns next-level tree offers and excludes maxed trees', () => {
    const offers = rollSkillMasterOffers({
      ownedSkillIds: [
        { id: 'arcStrike', level: 2 },
        { id: 'hpMaster', level: 5 }
      ],
      count: 6,
      rng: () => 0.99
    });

    assert.equal(offers.find(o => o.id === 'arcStrike').level, 3);
    assert.equal(offers.some(o => o.id === 'hpMaster'), false);
    assert.equal(new Set(offers.map(o => o.id)).size, offers.length);
    assert.ok(offers.length <= 5);
  });

  it('rollSkillMasterOffers returns three level-one options for empty runs', () => {
    const offers = rollSkillMasterOffers({ ownedSkillIds: [], count: 3, rng: () => 0.01 });
    assert.equal(offers.length, 3);
    assert.deepEqual(offers.map(o => o.level), [1, 1, 1]);
  });

  it('getPartySkillOfferDisplay derives raw offer levels from owned tree levels', () => {
    const explicit = getPartySkillOfferDisplay(
      { id: 'buffMaster', level: 4 },
      [{ id: 'buffMaster', level: 1 }]
    );
    assert.equal(explicit.id, 'buffMaster');
    assert.equal(explicit.level, 4);

    const derived = getPartySkillOfferDisplay('momentum', [{ id: 'buffMaster', level: 1 }]);
    assert.equal(derived.id, 'buffMaster');
    assert.equal(derived.level, 2);
    assert.equal(derived.title, 'Buff Master - Lvl. 2');

    const objectWithoutLevel = getPartySkillOfferDisplay({ id: 'momentum' }, [{ id: 'buffMaster', level: 2 }]);
    assert.equal(objectWithoutLevel.id, 'buffMaster');
    assert.equal(objectWithoutLevel.level, 3);

    assert.equal(getPartySkillOfferDisplay('momentum', [{ id: 'buffMaster', level: 5 }]), null);
  });

  it('applyPartySkillChoice creates and increments compact entries', () => {
    const skills = [];
    assert.deepEqual(applyPartySkillChoice(skills, 'arcStrike'), [{ id: 'arcStrike', level: 1 }]);
    assert.deepEqual(applyPartySkillChoice(skills, 'arcStrike'), [{ id: 'arcStrike', level: 2 }]);
    assert.deepEqual(applyPartySkillChoice(skills, 'counterMaster'), [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 }
    ]);
  });

  it('applyPartySkillChoice rejects maxed trees and unknown IDs', () => {
    assert.throws(() => applyPartySkillChoice([{ id: 'arcStrike', level: 5 }], 'arcStrike'), /max level/);
    assert.throws(() => applyPartySkillChoice([], 'nope'), /Unknown Party Skill tree/);
  });

  it('normalizePartySkills migrates old IDs into compact tree entries', () => {
    const normalized = normalizePartySkills([
      { id: 'arcStrike' },
      { id: 'forkedArc' },
      { id: 'retaliationStrike' },
      { id: 'momentum' },
      { id: 'superEffectiveMend' },
      'finisherFeast'
    ]);

    assert.deepEqual(normalized, [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 },
      { id: 'buffMaster', level: 1 },
      { id: 'hpMaster', level: 1 },
      { id: 'expMaster', level: 1 }
    ]);
  });

  it('normalization clamps levels and getPartySkillLevel reads compact entries', () => {
    const normalized = normalizePartySkills([
      { id: 'arcStrike', level: 9 },
      { id: 'arcStrike', level: 2 },
      { id: 'debuffMaster', level: 0 }
    ]);

    assert.deepEqual(normalized, [
      { id: 'arcStrike', level: 5 },
      { id: 'debuffMaster', level: 1 }
    ]);
    assert.equal(getPartySkillLevel(normalized, 'arcStrike'), 5);
    assert.equal(getPartySkillLevel(normalized, 'hpMaster'), 0);
  });

  it('returns HP, recovery, healing, and XP multipliers by tree level', () => {
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 0 }]), 1);
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 1 }]), 1.25);
    assert.equal(getHpMasterMaxHpMultiplier([{ id: 'hpMaster', level: 5 }]), 2.25);
    assert.equal(getPostCombatRecoveryMultiplier([{ id: 'hpMaster', level: 1 }]), 1);
    assert.equal(getPostCombatRecoveryMultiplier([{ id: 'hpMaster', level: 2 }]), 2);
    assert.equal(getHealingMultiplier([{ id: 'hpMaster', level: 2 }]), 1);
    assert.equal(getHealingMultiplier([{ id: 'hpMaster', level: 3 }]), 1.5);
    assert.equal(getXpMultiplier([{ id: 'expMaster', level: 4 }]), 2);
  });
});

describe('HP Master stat sync', () => {
  it('syncPartySkillHpBonuses applies max HP bonuses idempotently', async () => {
    const { syncPartySkillHpBonuses } = await import('../../../src/game/party-skills.js');
    const party = {
      active: [{ id: 'a', hp: 50, maxHp: 100 }],
      reserves: [{ id: 'r', hp: 20, maxHp: 80 }]
    };

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);

    assert.equal(party.active[0].maxHp, 125);
    assert.equal(party.active[0].hp, 63);
    assert.equal(party.reserves[0].maxHp, 100);
    assert.equal(party.reserves[0].hp, 25);

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 5 }]);
    assert.equal(party.active[0].maxHp, 225);
    assert.equal(party.reserves[0].maxHp, 180);
  });

  it('syncPartySkillHpBonuses respects later base maxHp changes', async () => {
    const { syncPartySkillHpBonuses } = await import('../../../src/game/party-skills.js');
    const party = { active: [{ id: 'a', hp: 50, maxHp: 100 }], reserves: [] };

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    party.active[0].maxHp = 140;
    party.active[0].hp = 70;

    syncPartySkillHpBonuses(party, [{ id: 'hpMaster', level: 1 }]);
    assert.equal(party.active[0].maxHp, 175);
    assert.equal(party.active[0].hp, 88);
  });
});
