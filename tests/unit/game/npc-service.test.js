/**
 * Tests for npc-service.js
 * Covers: loadNpcs, selectNpcForEncounter, shuffleOptions, getNpcBond, updateBond, recordEncounter
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadNpcs,
  selectNpcForEncounter,
  shuffleOptions,
  getNpcBond,
  updateBond,
  recordEncounter,
  loadNpcSkills,
  getNpcSkillsForNpc,
  rollNpcSkill
} from '../../../src/game/services/npc-service.js';

describe('NPC Service - loadNpcs', () => {
  it('loads all NPCs (5 entries)', () => {
    const npcs = loadNpcs();
    const ids = Object.keys(npcs);
    assert.strictEqual(ids.length, 5, `Expected 5 NPCs, got ${ids.length}`);
  });

  it('nagi exists', () => {
    const npcs = loadNpcs();
    assert.ok(npcs.nagi, 'nagi should exist');
  });

  it('NPCs have required fields', () => {
    const npcs = loadNpcs();
    for (const [id, npc] of Object.entries(npcs)) {
      assert.ok(npc.id, `${id} missing id`);
      assert.ok(npc.name, `${id} missing name`);
      assert.ok(npc.nameEn, `${id} missing nameEn`);
      assert.ok(npc.area, `${id} missing area`);
      assert.ok(npc.personality, `${id} missing personality`);
      assert.ok(npc.greeting, `${id} missing greeting`);
      assert.ok(npc.postCombat, `${id} missing postCombat`);
      assert.ok(npc.postCombat.rounds, `${id} missing postCombat.rounds`);
      assert.ok(Array.isArray(npc.postCombat.rounds), `${id} postCombat.rounds should be an array`);
    }
  });

  it('returns the same cached object on subsequent calls', () => {
    const first = loadNpcs();
    const second = loadNpcs();
    assert.strictEqual(first, second, 'should return cached reference');
  });
});

describe('NPC Service - selectNpcForEncounter', () => {
  it('returns NPC matching the area', () => {
    const npc = selectNpcForEncounter('okunomori', []);
    assert.ok(npc, 'should return an NPC');
    assert.strictEqual(npc.id, 'nagi');
    assert.strictEqual(npc.area, 'okunomori');
  });

  it('returns null for unknown area', () => {
    const npc = selectNpcForEncounter('nonexistent-area', []);
    assert.strictEqual(npc, null, 'should return null for area with no NPC');
  });

  it('returns null when area NPC is already used', () => {
    const npc = selectNpcForEncounter('okunomori', ['nagi']);
    assert.strictEqual(npc, null, 'should return null when area NPC already used');
  });

  it('returns NPC when used list has unrelated IDs', () => {
    const npc = selectNpcForEncounter('okunomori', ['makoto', 'sora']);
    assert.ok(npc, 'should return nagi despite other NPCs being used');
    assert.strictEqual(npc.id, 'nagi');
  });
});

describe('NPC Service - shuffleOptions', () => {
  const options = [
    { text: 'Answer A', tone: 'positive' },
    { text: 'Answer B', tone: 'neutral' },
    { text: 'Answer C', tone: 'negative' }
  ];

  it('returns 3 shuffled items with toneMap', () => {
    const result = shuffleOptions(options);
    assert.strictEqual(result.shuffled.length, 3);
    assert.strictEqual(result.toneMap.length, 3);
  });

  it('strips tone from shuffled items', () => {
    const result = shuffleOptions(options);
    for (const item of result.shuffled) {
      assert.strictEqual(item.tone, undefined, 'tone should be stripped from shuffled items');
      assert.ok(item.text, 'text should be present');
    }
  });

  it('toneMap contains all original tones', () => {
    const result = shuffleOptions(options);
    const sortedTones = [...result.toneMap].sort();
    assert.deepStrictEqual(sortedTones, ['negative', 'neutral', 'positive']);
  });

  it('toneMap corresponds to shuffled order', () => {
    // Run many times to verify correspondence
    for (let i = 0; i < 20; i++) {
      const result = shuffleOptions(options);
      // Each toneMap entry should correspond to the original tone of that text
      for (let j = 0; j < 3; j++) {
        const text = result.shuffled[j].text;
        const expectedTone = options.find(o => o.text === text).tone;
        assert.strictEqual(result.toneMap[j], expectedTone,
          `toneMap[${j}] should match the tone of shuffled[${j}]`);
      }
    }
  });

  it('preserves all text values', () => {
    const result = shuffleOptions(options);
    const texts = result.shuffled.map(s => s.text).sort();
    assert.deepStrictEqual(texts, ['Answer A', 'Answer B', 'Answer C']);
  });
});

describe('NPC Service - getNpcBond', () => {
  it('returns null for unknown NPC', () => {
    const meta = { npcBonds: {} };
    const result = getNpcBond(meta, 'npc_99');
    assert.strictEqual(result, null);
  });

  it('returns null when npcBonds is missing', () => {
    const meta = {};
    const result = getNpcBond(meta, 'npc_01');
    assert.strictEqual(result, null);
  });

  it('returns bond entry when it exists', () => {
    const meta = {
      npcBonds: {
        npc_01: { bond: 5, encounters: 3, lastInteraction: '2026-01-01' }
      }
    };
    const result = getNpcBond(meta, 'npc_01');
    assert.deepStrictEqual(result, { bond: 5, encounters: 3, lastInteraction: '2026-01-01' });
  });
});

describe('NPC Service - updateBond', () => {
  it('creates entry if missing and applies delta', () => {
    const meta = { npcBonds: {} };
    const result = updateBond(meta, 'npc_01', 3);
    assert.strictEqual(result.bond, 3);
    assert.strictEqual(meta.npcBonds.npc_01.bond, 3);
  });

  it('creates npcBonds if missing on meta', () => {
    const meta = {};
    const result = updateBond(meta, 'npc_01', 2);
    assert.strictEqual(result.bond, 2);
    assert.ok(meta.npcBonds, 'npcBonds should be created');
    assert.strictEqual(meta.npcBonds.npc_01.bond, 2);
  });

  it('adds to existing bond', () => {
    const meta = {
      npcBonds: {
        npc_01: { bond: 5, encounters: 2, lastInteraction: '2026-01-01' }
      }
    };
    const result = updateBond(meta, 'npc_01', -2);
    assert.strictEqual(result.bond, 3);
    assert.strictEqual(meta.npcBonds.npc_01.bond, 3);
  });

  it('returns the updated entry', () => {
    const meta = { npcBonds: {} };
    const result = updateBond(meta, 'npc_05', 10);
    assert.strictEqual(result.bond, 10);
    assert.strictEqual(result.encounters, 0);
    assert.strictEqual(result.lastInteraction, null);
  });
});

describe('NPC Service - recordEncounter', () => {
  it('increments encounter counter', () => {
    const meta = {
      npcBonds: {
        npc_01: { bond: 0, encounters: 2, lastInteraction: '2026-01-01' }
      }
    };
    recordEncounter(meta, 'npc_01');
    assert.strictEqual(meta.npcBonds.npc_01.encounters, 3);
  });

  it('sets lastInteraction to today (YYYY-MM-DD)', () => {
    const meta = {
      npcBonds: {
        npc_01: { bond: 0, encounters: 0, lastInteraction: null }
      }
    };
    recordEncounter(meta, 'npc_01');
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(meta.npcBonds.npc_01.lastInteraction, today);
  });

  it('creates entry if missing', () => {
    const meta = { npcBonds: {} };
    recordEncounter(meta, 'npc_03');
    assert.strictEqual(meta.npcBonds.npc_03.encounters, 1);
    assert.strictEqual(meta.npcBonds.npc_03.bond, 0);
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(meta.npcBonds.npc_03.lastInteraction, today);
  });

  it('creates npcBonds if missing on meta', () => {
    const meta = {};
    recordEncounter(meta, 'npc_01');
    assert.ok(meta.npcBonds, 'npcBonds should be created');
    assert.strictEqual(meta.npcBonds.npc_01.encounters, 1);
  });
});

describe('NPC Service - loadNpcSkills', () => {
  it('loads NPC skills array', () => {
    const skills = loadNpcSkills();
    assert.ok(Array.isArray(skills), 'should return array');
    assert.ok(skills.length >= 4, 'should have at least 4 skills');
  });

  it('each skill has required move fields', () => {
    const skills = loadNpcSkills();
    for (const skill of skills) {
      assert.ok(skill.id, `skill missing id`);
      assert.ok(skill.category, `${skill.id} missing category`);
      assert.ok(skill.target, `${skill.id} missing target`);
      assert.ok(typeof skill.power === 'number', `${skill.id} missing power`);
    }
  });
});

describe('NPC Service - getNpcSkillsForNpc', () => {
  it('returns skill objects for an NPC with skills', () => {
    const npcs = loadNpcs();
    const npc = Object.values(npcs).find(n => n.skills?.length > 0);
    if (!npc) return;
    const skills = getNpcSkillsForNpc(npc);
    assert.ok(Array.isArray(skills), 'should return array');
    assert.ok(skills.length > 0, 'should have skills');
    assert.ok(skills[0].id, 'skill objects should have id');
  });

  it('returns empty array for NPC without skills', () => {
    const skills = getNpcSkillsForNpc({ id: 'fake', skills: [] });
    assert.deepStrictEqual(skills, []);
  });

  it('returns empty array for NPC with no skills field', () => {
    const skills = getNpcSkillsForNpc({ id: 'fake' });
    assert.deepStrictEqual(skills, []);
  });
});

describe('NPC Service - rollNpcSkill', () => {
  it('returns null when NPC has no skills', () => {
    const result = rollNpcSkill({ id: 'fake', skills: [] });
    assert.strictEqual(result, null);
  });

  it('returns a skill object or null (probabilistic)', () => {
    const npcs = loadNpcs();
    const npc = Object.values(npcs).find(n => n.skills?.length > 0);
    if (!npc) return;
    let gotSkill = false;
    let gotNull = false;
    for (let i = 0; i < 100; i++) {
      const result = rollNpcSkill(npc);
      if (result) { gotSkill = true; assert.ok(result.id, 'returned skill should have id'); }
      else gotNull = true;
    }
    assert.ok(gotSkill, 'should return a skill at least once in 100 rolls');
    assert.ok(gotNull, 'should return null at least once in 100 rolls');
  });
});
