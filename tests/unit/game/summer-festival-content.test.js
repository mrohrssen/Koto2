import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'iwau', name: '祝う', reading: 'いわう' },
  { id: 'negau', name: '願う', reading: 'ねがう' },
  { id: 'odoru', name: '踊る', reading: 'おどる' }
];

describe('summer-festival npc skills', () => {
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

  it('reuses the existing utau skill for the idol (no duplicate)', () => {
    const utau = skills.filter(s => s.id === 'utau');
    assert.equal(utau.length, 1);
  });
});

const npcs = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npcs.json'), 'utf8'));

const EXPECTED_NPCS = [
  { key: 'ojisan', name: 'おじさん', reading: 'おじさん', skill: 'iwau' },
  { key: 'miko', name: '巫女', reading: 'みこ', skill: 'negau' },
  { key: 'oneesan', name: 'お姉さん', reading: 'おねえさん', skill: 'odoru' },
  { key: 'aidoru', name: 'アイドル', reading: 'アイドル', skill: 'utau' }
];

describe('summer-festival npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'summer-festival');
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
  { id: 'takoyaki', word: 'たこ焼き', category: 'food' },
  { id: 'yakisoba', word: '焼きそば', category: 'food' },
  { id: 'kakigoori', word: 'かき氷', category: 'food' },
  { id: 'hanabi', word: '花火', category: 'equipment' },
  { id: 'taiko', word: '太鼓', category: 'equipment' },
  { id: 'men', word: '面', category: 'equipment' },
  { id: 'kingyo', word: '金魚', category: 'equipment' },
  { id: 'kuji', word: 'くじ', category: 'equipment' },
  { id: 'sensu', word: '扇子', category: 'equipment' },
  { id: 'chouchin', word: '提灯', category: 'equipment' },
  { id: 'fuusen', word: '風船', category: 'equipment' },
  { id: 'fue', word: '笛', category: 'equipment' }
];

describe('summer-festival items', () => {
  const festivalItems = items.filter(i => i.area === 'summer-festival');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      festivalItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = festivalItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
