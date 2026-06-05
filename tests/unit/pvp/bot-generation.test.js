import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeededRandom,
  displayRatingToOpenSkillRating,
  generateRankedBotBatch,
  generateRankedBotProfile,
  validateGeneratedBotProfile
} from '../../../src/pvp/bot-generation.js';

describe('bot-generation', () => {
  it('creates deterministic bot profiles from the same seed', () => {
    const a = generateRankedBotProfile({ index: 7, strength: 4, seed: 'ranked-bots-v1' });
    const b = generateRankedBotProfile({ index: 7, strength: 4, seed: 'ranked-bots-v1' });
    assert.deepStrictEqual(a, b);
  });

  it('creates completed-run teams with no duplicate creatures', () => {
    const bot = generateRankedBotProfile({ index: 3, strength: 8, seed: 'ranked-bots-v1' });
    const creatures = [
      ...bot.team.creatureParty.active,
      ...bot.team.creatureParty.reserves
    ];
    assert.ok(creatures.length >= 4);
    assert.ok(creatures.length <= 6);
    assert.equal(new Set(creatures.map(c => c.id)).size, creatures.length);
    const totalSkillLevels = bot.team.partySkills.reduce((sum, skill) => sum + skill.level, 0);
    assert.equal(totalSkillLevels, 5);
    assert.ok(bot.team.partySkills.every(skill => typeof skill.id === 'string' && skill.level >= 1 && skill.level <= 5));
    assert.deepStrictEqual(validateGeneratedBotProfile(bot).errors, []);
  });

  it('stores equipment on individual creatures only', () => {
    const bot = generateRankedBotProfile({ index: 12, strength: 5, seed: 'ranked-bots-v1' });
    const creatures = [...bot.team.creatureParty.active, ...bot.team.creatureParty.reserves];
    assert.ok(creatures.some(c => (c.equippedItems || []).length > 0));
    for (const creature of creatures) {
      assert.ok(creature.itemBuffs);
      assert.ok(Array.isArray(creature.equippedItems));
    }
    assert.deepStrictEqual(bot.team.itemBuffs, {});
  });

  it('materializes HP Master max HP on generated bot snapshots', () => {
    const bot = generateRankedBotProfile({ index: 0, strength: 1, seed: 'hp-master-check' });
    const hpMaster = bot.team.partySkills.find(skill => skill.id === 'hpMaster');
    assert.ok(hpMaster);

    const expectedMultiplier = 1 + (hpMaster.level >= 1 ? 0.25 : 0) + (hpMaster.level >= 5 ? 1 : 0);
    const creatures = [...bot.team.creatureParty.active, ...bot.team.creatureParty.reserves];
    assert.ok(creatures.length > 0);
    for (const creature of creatures) {
      assert.equal(creature.partySkillHpMultiplier, expectedMultiplier);
      assert.ok(creature.partySkillBaseMaxHp > 0);
      assert.equal(creature.maxHp, Math.floor(creature.partySkillBaseMaxHp * expectedMultiplier));
    }
  });

  it('rejects malformed compact party skill entries', () => {
    const bot = generateRankedBotProfile({ index: 3, strength: 8, seed: 'ranked-bots-v1' });

    bot.team.partySkills = [{ id: 'notARealSkill', level: 5 }];
    assert.ok(validateGeneratedBotProfile(bot).errors.includes('party_skill_invalid'));

    bot.team.partySkills = [
      { id: 'arcStrike', level: 0 },
      { id: 'hpMaster', level: 5 },
    ];
    assert.ok(validateGeneratedBotProfile(bot).errors.includes('party_skill_invalid'));
  });

  it('makes strength 10 materially stronger than strength 1', () => {
    const weak = Array.from({ length: 20 }, (_, i) =>
      generateRankedBotProfile({ index: i, strength: 1, seed: `weak-${i}` })
    );
    const strong = Array.from({ length: 20 }, (_, i) =>
      generateRankedBotProfile({ index: i, strength: 10, seed: `strong-${i}` })
    );
    const averageLevel = bots => bots.flatMap(b => [
      ...b.team.creatureParty.active,
      ...b.team.creatureParty.reserves
    ]).reduce((sum, c, _, arr) => sum + c.level / arr.length, 0);
    const rareScore = bots => bots.flatMap(b => [
      ...b.team.creatureParty.active,
      ...b.team.creatureParty.reserves
    ]).filter(c => ['rare', 'epic', 'legendary'].includes(c.rarity)).length;

    assert.ok(averageLevel(strong) > averageLevel(weak) + 2);
    assert.ok(rareScore(strong) > rareScore(weak));
  });

  it('converts display rating into OpenSkill mu', () => {
    assert.deepStrictEqual(displayRatingToOpenSkillRating(1200), { mu: 25, sigma: 25 / 3 });
    assert.equal(Math.round(1200 + (displayRatingToOpenSkillRating(1600).mu - 25) * 40), 1600);
  });

  it('produces stable random values', () => {
    const random = createSeededRandom('abc');
    assert.deepStrictEqual(
      [random(), random(), random()].map(n => Number(n.toFixed(6))),
      [0.417443, 0.713626, 0.543942]
    );
  });
});

describe('generateRankedBotBatch', () => {
  it('creates an even strength spread for 100 bots', () => {
    const bots = generateRankedBotBatch({ count: 100, seed: 'ranked-bots-v1' });
    const counts = new Map();
    for (const bot of bots) counts.set(bot.strength, (counts.get(bot.strength) || 0) + 1);
    assert.deepStrictEqual([...counts.entries()].sort((a, b) => a[0] - b[0]), [
      [1, 10], [2, 10], [3, 10], [4, 10], [5, 10],
      [6, 10], [7, 10], [8, 10], [9, 10], [10, 10]
    ]);
  });

  it('allows bots to draft Exp Master to simulate player builds', () => {
    const bots = generateRankedBotBatch({ count: 100, seed: 'exp-master-check' });
    assert.ok(bots.some(bot => bot.team.partySkills.some(skill => skill.id === 'expMaster')));
  });
});
