import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'koukan', name: '交換', reading: 'こうかん' },
  { id: 'mitsukeru', name: '見つける', reading: 'みつける' },
  { id: 'yasumu', name: '休む', reading: 'やすむ' },
  { id: 'annai', name: '案内', reading: 'あんない' }
];

describe('desert npc skills', () => {
  for (const expected of EXPECTED_SKILLS) {
    it(`defines ${expected.id}`, () => {
      const skill = skills.find(s => s.id === expected.id);
      assert.ok(skill, `${expected.id} missing`);
      assert.equal(skill.name, expected.name);
      assert.equal(skill.reading, expected.reading);
      assert.ok(['damage', 'heal', 'buff'].includes(skill.category));
      assert.ok(Number.isFinite(skill.power));
    });
  }
});

const npcs = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npcs.json'), 'utf8'));

const EXPECTED_NPCS = [
  { key: 'shounin', name: '商人', reading: 'しょうにん', skill: 'koukan' },
  { key: 'gakusha', name: '学者', reading: 'がくしゃ', skill: 'mitsukeru' },
  { key: 'tabibito', name: '旅人', reading: 'たびびと', skill: 'yasumu' },
  { key: 'hime', name: '姫', reading: 'ひめ', skill: 'annai' }
];

describe('desert npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'desert');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.equal(npc.attack, 22);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }
});

const items = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/items.json'), 'utf8'));

const EXPECTED_ITEMS = [
  { id: 'karee', word: 'カレー', category: 'food' },
  { id: 'kudamono', word: '果物', category: 'food' },
  { id: 'satou', word: '砂糖', category: 'food' },
  { id: 'suitou', word: '水筒', category: 'equipment' },
  { id: 'houseki', word: '宝石', category: 'equipment' },
  { id: 'ranpu', word: 'ランプ', category: 'equipment' },
  { id: 'juutan', word: '絨毯', category: 'equipment' },
  { id: 'tsubo', word: '壺', category: 'equipment' },
  { id: 'kousui', word: '香水', category: 'equipment' },
  { id: 'manto', word: 'マント', category: 'equipment' }
];

describe('desert items', () => {
  const desertItems = items.filter(i => i.area === 'desert');

  it('has exactly the 10 approved items', () => {
    assert.deepEqual(
      desertItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = desertItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
