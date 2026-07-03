import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'tsuru-npc', name: '釣る', reading: 'つる' },
  { id: 'tasukeru', name: '助ける', reading: 'たすける' },
  { id: 'moguru-npc', name: '潜る', reading: 'もぐる' },
  { id: 'oyogu', name: '泳ぐ', reading: 'およぐ' }
];

describe('blue-sea npc skills', () => {
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
  { key: 'ryoushi', name: '漁師', reading: 'りょうし', skill: 'tsuru-npc' },
  { key: 'senchou', name: '船長', reading: 'せんちょう', skill: 'tasukeru' },
  { key: 'ningyo', name: '人魚', reading: 'にんぎょ', skill: 'moguru-npc' },
  { key: 'kaizoku', name: '海賊', reading: 'かいぞく', skill: 'oyogu' }
];

describe('blue-sea npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'blue-sea');
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
  { id: 'shio', word: '塩', category: 'food' },
  { id: 'suika', word: 'スイカ', category: 'food' },
  { id: 'sashimi', word: '刺身', category: 'food' },
  { id: 'juusu', word: 'ジュース', category: 'food' },
  { id: 'aisu', word: 'アイス', category: 'food' },
  { id: 'mizugi', word: '水着', category: 'equipment' },
  { id: 'sangurasu', word: 'サングラス', category: 'equipment' },
  { id: 'kai', word: '貝', category: 'equipment' },
  { id: 'takara', word: '宝', category: 'equipment' },
  { id: 'ami', word: '網', category: 'equipment' },
  { id: 'fune', word: '船', category: 'equipment' },
  { id: 'shinju', word: '真珠', category: 'equipment' }
];

describe('blue-sea items', () => {
  const seaItems = items.filter(i => i.area === 'blue-sea');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      seaItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = seaItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
