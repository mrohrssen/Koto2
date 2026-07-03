import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUSION_RECIPES } from '../../../src/game/services/fusion-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));
const moves = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/moves.json'), 'utf8'));

const creaturesById = new Map(creatures.map(creature => [creature.id, creature]));
const movesById = new Map(moves.map(move => [move.id, move]));
const ALLOWED_FUSION_AREA_PLACEMENTS = new Set([
  'school:boss:hanano-yousei',
  'morning-ranch:boss:hikarino-uma',
  'blue-sea:boss:kumono-sakana',
  'evening-town:boss:kageno-inu',
  'desert:boss:sunano-hebi',
  'night-forest:boss:tsukino-ookami',
  'thunder-mountain:boss:kaminarino-tori',
  'frozen-lake:boss:koorino-kuma',
  'snow-village:boss:yukino-kitsune'
]);

const EXPECTED_FUSIONS = [
  { recipeKey: 'shadowDog', recipeId: 'shadow-dog', resultId: 'kageno-inu', name: '影の犬', reading: 'かげのいぬ', nameEn: 'Shadow Dog', rarity: 'uncommon', element: 'water', ingredientIds: ['kage', 'inu'] },
  { recipeKey: 'lightHorse', recipeId: 'light-horse', resultId: 'hikarino-uma', name: '光の馬', reading: 'ひかりのうま', nameEn: 'Light Horse', rarity: 'uncommon', element: 'metal', ingredientIds: ['hikari', 'uma'] },
  { recipeKey: 'cloudFish', recipeId: 'cloud-fish', resultId: 'kumono-sakana', name: '雲の魚', reading: 'くものさかな', nameEn: 'Cloud Fish', rarity: 'uncommon', element: 'water', ingredientIds: ['kumo', 'sakana'] },
  { recipeKey: 'moonWolf', recipeId: 'moon-wolf', resultId: 'tsukino-ookami', name: '月の狼', reading: 'つきのおおかみ', nameEn: 'Moon Wolf', rarity: 'rare', element: 'metal', ingredientIds: ['tsuki', 'ookami'] },
  { recipeKey: 'iceBear', recipeId: 'ice-bear', resultId: 'koorino-kuma', name: '氷の熊', reading: 'こおりのくま', nameEn: 'Ice Bear', rarity: 'rare', element: 'water', ingredientIds: ['koori', 'kuma'] },
  { recipeKey: 'sandSnake', recipeId: 'sand-snake', resultId: 'sunano-hebi', name: '砂の蛇', reading: 'すなのへび', nameEn: 'Sand Snake', rarity: 'uncommon', element: 'earth', ingredientIds: ['suna', 'hebi'] },
  { recipeKey: 'thunderBird', recipeId: 'thunder-bird', resultId: 'kaminarino-tori', name: '雷の鳥', reading: 'かみなりのとり', nameEn: 'Thunder Bird', rarity: 'rare', element: 'metal', ingredientIds: ['kaminari', 'tori'] },
  { recipeKey: 'snowFox', recipeId: 'snow-fox', resultId: 'yukino-kitsune', name: '雪の狐', reading: 'ゆきのきつね', nameEn: 'Snow Fox', rarity: 'rare', element: 'water', ingredientIds: ['yuki', 'kitsune'] },
  { recipeKey: 'flowerFairy', recipeId: 'flower-fairy', resultId: 'hanano-yousei', name: '花の妖精', reading: 'はなのようせい', nameEn: 'Flower Fairy', rarity: 'rare', element: 'wood', ingredientIds: ['hana', 'yousei'] },
  { recipeKey: 'boneOni', recipeId: 'bone-oni', resultId: 'honeno-oni', name: '骨の鬼', reading: 'ほねのおに', nameEn: 'Bone Oni', rarity: 'rare', element: 'earth', ingredientIds: ['hone', 'oni'] }
];

function placedFusionIds() {
  const expectedIds = new Set(EXPECTED_FUSIONS.map(fusion => fusion.resultId));
  const placed = [];
  for (const area of areas) {
    for (const creatureId of area.creatures || []) {
      if (expectedIds.has(creatureId)) placed.push(`${area.id}:${creatureId}`);
    }
    if (area.bossCreatureId && expectedIds.has(area.bossCreatureId)) {
      placed.push(`${area.id}:boss:${area.bossCreatureId}`);
    }
  }
  return placed;
}

describe('boss-locked fusion roster', () => {
  it('adds the approved fusion creature templates', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const creature = creaturesById.get(expected.resultId);
      assert.ok(creature, `${expected.resultId} missing`);
      assert.equal(creature.name, expected.name);
      assert.equal(creature.reading, expected.reading);
      assert.equal(creature.nameEn, expected.nameEn);
      assert.equal(creature.rarity, expected.rarity);
      assert.equal(creature.element, expected.element);
      assert.equal(creature.rank, null);
      assert.equal(creature.isStarter, false);
      assert.equal(creature.stage, 1);
      assert.equal(creature.createdAt, '2026-05-06');
    }
  });

  it('adds boss-defeat-locked two-creature recipes', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const recipe = FUSION_RECIPES[expected.recipeKey];
      assert.ok(recipe, `${expected.recipeKey} missing`);
      assert.equal(recipe.id, expected.recipeId);
      assert.equal(recipe.name, expected.name);
      assert.equal(recipe.nameEn, expected.nameEn);
      assert.deepEqual(recipe.ingredientIds, expected.ingredientIds);
      assert.equal(recipe.resultId, expected.resultId);
      assert.equal(recipe.requiresBossDefeatId, expected.resultId);
      assert.deepEqual(recipe.cost, { fusionCores: 1 });
      for (const ingredientId of expected.ingredientIds) {
        assert.ok(creaturesById.has(ingredientId), `${recipe.id} ingredient ${ingredientId} missing`);
      }
    }
  });

  it('keeps fusion learnsets legal and manually capped', () => {
    for (const expected of EXPECTED_FUSIONS) {
      const creature = creaturesById.get(expected.resultId);
      assert.ok(creature.learnset.length >= 5, `${expected.resultId} has too few moves`);
      assert.ok(creature.learnset.length <= 6, `${expected.resultId} has too many moves`);
      const levelOne = creature.learnset.filter(entry => entry.level === 1);
      assert.equal(levelOne.length, 1, `${expected.resultId} must have exactly one level 1 move`);
      const move = movesById.get(levelOne[0].moveId);
      assert.ok(move, `${expected.resultId} level 1 move missing`);
      assert.equal(move.category, 'damage');
      assert.equal(move.target, 'single_enemy');
      assert.ok((move.tier || 1) <= 2);
      assert.notEqual(move.category, 'drain');
      assert.notEqual(move.statusEffect, 'cleanse');
    }
  });

  it('only places approved fusion bosses in areas', () => {
    assert.deepEqual(placedFusionIds().filter(entry => !ALLOWED_FUSION_AREA_PLACEMENTS.has(entry)), []);
  });
});
