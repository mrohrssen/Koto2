import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'suberu', name: '滑る', reading: 'すべる' },
  { id: 'mazeru', name: '混ぜる', reading: 'まぜる' },
  { id: 'egaku', name: '描く', reading: 'えがく' },
  { id: 'matsu', name: '待つ', reading: 'まつ' }
];

describe('frozen-lake npc skills', () => {
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
  { key: 'senshu', name: '選手', reading: 'せんしゅ', skill: 'suberu' },
  { key: 'ryourinin', name: '料理人', reading: 'りょうりにん', skill: 'mazeru' },
  { key: 'gaka', name: '画家', reading: 'がか', skill: 'egaku' },
  { key: 'ryoushi_frozen_lake', name: '漁師', reading: 'りょうし', skill: 'matsu' }
];

describe('frozen-lake npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'frozen-lake');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }

  it('reuse NPC has its own id matching its key', () => {
    assert.equal(npcs.ryoushi_frozen_lake.id, 'ryoushi_frozen_lake');
  });
});

const items = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/items.json'), 'utf8'));

const EXPECTED_ITEMS = [
  { id: 'suupu', word: 'スープ', category: 'food' },
  { id: 'shichuu', word: 'シチュー', category: 'food' },
  { id: 'tebukuro', word: '手袋', category: 'equipment' },
  { id: 'mafuraa', word: 'マフラー', category: 'equipment' },
  { id: 'kooto', word: 'コート', category: 'equipment' },
  { id: 'kutsushita', word: '靴下', category: 'equipment' },
  { id: 'buutsu', word: 'ブーツ', category: 'equipment' },
  { id: 'sao', word: '竿', category: 'equipment' },
  { id: 'hari', word: '針', category: 'equipment' },
  { id: 'e', word: '絵', category: 'equipment' },
  { id: 'fude', word: '筆', category: 'equipment' },
  { id: 'utsuwa', word: '器', category: 'equipment' }
];

describe('frozen-lake items', () => {
  const lakeItems = items.filter(i => i.area === 'frozen-lake');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      lakeItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = lakeItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
