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
