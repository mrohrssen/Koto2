import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'miageru', name: '見上げる', reading: 'みあげる' },
  { id: 'uranau', name: '占う', reading: 'うらなう' },
  { id: 'kataru', name: '語る', reading: 'かたる' },
  { id: 'bouken', name: '冒険', reading: 'ぼうけん' }
];

describe('night-forest npc skills', () => {
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
  { key: 'hakase', name: '博士', reading: 'はかせ', skill: 'miageru' },
  { key: 'majo', name: '魔女', reading: 'まじょ', skill: 'uranau' },
  { key: 'shijin', name: '詩人', reading: 'しじん', skill: 'kataru' },
  { key: 'boukensha', name: '冒険者', reading: 'ぼうけんしゃ', skill: 'bouken' }
];

describe('night-forest npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'night-forest');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.equal(npc.attack, 24);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }
});

const items = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/items.json'), 'utf8'));

const EXPECTED_ITEMS = [
  { id: 'kinoko', word: 'キノコ', category: 'food' },
  { id: 'chokoreeto', word: 'チョコレート', category: 'food' },
  { id: 'kuri', word: '栗', category: 'food' },
  { id: 'tento', word: 'テント', category: 'equipment' },
  { id: 'moufu', word: '毛布', category: 'equipment' },
  { id: 'yakusou', word: '薬草', category: 'equipment' },
  { id: 'takigi', word: '薪', category: 'equipment' },
  { id: 'bouenkyou', word: '望遠鏡', category: 'equipment' },
  { id: 'yumi', word: '弓', category: 'equipment' },
  { id: 'ya', word: '矢', category: 'equipment' },
  { id: 'houki', word: '箒', category: 'equipment' },
  { id: 'koto', word: '琴', category: 'equipment' }
];

describe('night-forest items', () => {
  const nightForestItems = items.filter(i => i.area === 'night-forest');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      nightForestItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = nightForestItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
