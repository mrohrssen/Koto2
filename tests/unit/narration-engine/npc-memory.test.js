import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NpcMemory } from '../../../src/narration-engine/npc-memory.js';

describe('NpcMemory', () => {
  let memory;

  beforeEach(() => {
    memory = new NpcMemory({ inMemory: true });
  });

  describe('getMemory', () => {
    it('returns empty state for unknown NPC', () => {
      const m = memory.getMemory('npc_01');
      assert.deepStrictEqual(m.counters, { encounters: 0, defeats: 0, liberations: 0 });
      assert.deepStrictEqual(m.flags, { liberated: false, befriended: false, betrayed: false });
      assert.deepStrictEqual(m.encounterLog, []);
      assert.strictEqual(m.narrative, '');
      assert.strictEqual(m.bond, 0);
    });
  });

  describe('logEncounter', () => {
    it('appends to encounter log', () => {
      memory.logEncounter('npc_01', 'positive', 'Player tried befriend first');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.encounterLog.length, 1);
      assert.strictEqual(m.encounterLog[0].outcome, 'positive');
      assert.strictEqual(m.encounterLog[0].summary, 'Player tried befriend first');
    });

    it('increments encounter counter', () => {
      memory.logEncounter('npc_01', 'positive', 'First meeting');
      memory.logEncounter('npc_01', 'negative', 'Second meeting');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.encounters, 2);
    });

    it('caps encounter log at 5 entries', () => {
      for (let i = 0; i < 7; i++) {
        memory.logEncounter('npc_01', 'positive', `Meeting ${i + 1}`);
      }
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.encounterLog.length, 5);
      assert.strictEqual(m.encounterLog[0].summary, 'Meeting 3');
      assert.strictEqual(m.encounterLog[4].summary, 'Meeting 7');
    });
  });

  describe('setFlag', () => {
    it('sets liberated flag', () => {
      memory.setFlag('npc_01', 'liberated', true);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.flags.liberated, true);
    });

    it('increments liberations counter when liberated', () => {
      memory.setFlag('npc_01', 'liberated', true);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.liberations, 1);
    });
  });

  describe('updateBond', () => {
    it('adds delta to bond', () => {
      memory.updateBond('npc_01', 1);
      memory.updateBond('npc_01', 1);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.bond, 2);
    });

    it('allows negative bond', () => {
      memory.updateBond('npc_01', -3);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.bond, -3);
    });
  });

  describe('setNarrative', () => {
    it('sets rolling narrative summary', () => {
      memory.setNarrative('npc_01', 'A timid drone freed after a rocky start.');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.narrative, 'A timid drone freed after a rocky start.');
    });
  });

  describe('incrementDefeat', () => {
    it('increments defeats counter', () => {
      memory.incrementDefeat('npc_01');
      memory.incrementDefeat('npc_01');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.defeats, 2);
    });
  });
});
