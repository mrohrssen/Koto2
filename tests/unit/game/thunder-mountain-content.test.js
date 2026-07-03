import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'inoru', name: '祈る', reading: 'いのる' },
  { id: 'kitaeru', name: '鍛える', reading: 'きたえる' },
  { id: 'michibiku', name: '導く', reading: 'みちびく' },
  { id: 'naosu', name: '治す', reading: 'なおす' }
];

describe('thunder-mountain npc skills', () => {
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
  { key: 'souryo', name: '僧侶', reading: 'そうりょ', skill: 'inoru' },
  { key: 'kajiya', name: '鍛冶屋', reading: 'かじや', skill: 'kitaeru' },
  { key: 'tengu', name: '天狗', reading: 'てんぐ', skill: 'michibiku' },
  { key: 'isha', name: '医者', reading: 'いしゃ', skill: 'naosu' }
];

describe('thunder-mountain npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'thunder-mountain');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.equal(npc.attack, 26);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }
});
