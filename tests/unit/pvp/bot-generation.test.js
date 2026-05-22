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
    assert.equal(bot.team.partySkills.length, 5);
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
});
