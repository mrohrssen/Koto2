import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'uru', name: '売る', reading: 'うる' },
  { id: 'tsutsumu', name: '包む', reading: 'つつむ' },
  { id: 'sagasu', name: '探す', reading: 'さがす' },
  { id: 'kau', name: '買う', reading: 'かう' }
];

describe('evening-town npc skills', () => {
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
  { key: 'tenin', name: '店員', reading: 'てんいん', skill: 'uru' },
  { key: 'panya', name: 'パン屋', reading: 'パンや', skill: 'tsutsumu' },
  { key: 'keisatsukan', name: '警察官', reading: 'けいさつかん', skill: 'sagasu' },
  { key: 'obaasan', name: 'おばあさん', reading: 'おばあさん', skill: 'kau' }
];

describe('evening-town npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'evening-town');
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
  { id: 'keeki', word: 'ケーキ', category: 'food' },
  { id: 'kukkii', word: 'クッキー', category: 'food' },
  { id: 'koohii', word: 'コーヒー', category: 'food' },
  { id: 'purin', word: 'プリン', category: 'food' },
  { id: 'kagi', word: '鍵', category: 'equipment' },
  { id: 'chizu', word: '地図', category: 'equipment' },
  { id: 'saifu', word: '財布', category: 'equipment' },
  { id: 'kasa', word: '傘', category: 'equipment' },
  { id: 'shinbun', word: '新聞', category: 'equipment' },
  { id: 'tegami', word: '手紙', category: 'equipment' },
  { id: 'omiyage', word: 'お土産', category: 'equipment' },
  { id: 'hanataba', word: '花束', category: 'equipment' },
  { id: 'jitensha', word: '自転車', category: 'equipment' }
];

describe('evening-town items', () => {
  const townItems = items.filter(i => i.area === 'evening-town');

  it('has exactly the 13 approved items', () => {
    assert.deepEqual(
      townItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = townItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
