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
