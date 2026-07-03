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
