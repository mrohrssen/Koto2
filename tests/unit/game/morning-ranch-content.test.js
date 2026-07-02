import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'sodateru', name: '育てる', reading: 'そだてる' },
  { id: 'okosu', name: '起こす', reading: 'おこす' },
  { id: 'hakobu', name: '運ぶ', reading: 'はこぶ' },
  { id: 'tetsudau', name: '手伝う', reading: 'てつだう' }
];

describe('morning-ranch npc skills', () => {
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
  { key: 'nouka', name: '農家', reading: 'のうか', skill: 'sodateru' },
  { key: 'okaasan', name: 'お母さん', reading: 'おかあさん', skill: 'okosu' },
  { key: 'musume', name: '娘', reading: 'むすめ', skill: 'hakobu' },
  { key: 'ojiisan', name: 'おじいさん', reading: 'おじいさん', skill: 'tetsudau' }
];

describe('morning-ranch npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'morning-ranch');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }
});

const items = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/items.json'), 'utf8'));

const EXPECTED_ITEMS = [
  { id: 'gyuunyuu', word: '牛乳', category: 'food' },
  { id: 'yasai', word: '野菜', category: 'food' },
  { id: 'kome', word: '米', category: 'food' },
  { id: 'chiizu', word: 'チーズ', category: 'food' },
  { id: 'bataa', word: 'バター', category: 'food' },
  { id: 'kuriimu', word: 'クリーム', category: 'food' },
  { id: 'baketsu', word: 'バケツ', category: 'equipment' },
  { id: 'suzu', word: '鈴', category: 'equipment' },
  { id: 'kago', word: '籠', category: 'equipment' },
  { id: 'epuron', word: 'エプロン', category: 'equipment' },
  { id: 'tane', word: '種', category: 'equipment' },
  { id: 'kama', word: '鎌', category: 'equipment' }
];

describe('morning-ranch items', () => {
  const ranchItems = items.filter(i => i.area === 'morning-ranch');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      ranchItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = ranchItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
