import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCharacterCards, getCharacterCard, validateCard } from '../../../src/narration-engine/character-cards.js';

describe('character-cards', () => {
  describe('loadCharacterCards', () => {
    it('loads all 5 NPC cards', () => {
      const cards = loadCharacterCards();
      assert.strictEqual(Object.keys(cards).length, 5);
    });

    it('returns cached reference on second call', () => {
      const a = loadCharacterCards();
      const b = loadCharacterCards();
      assert.strictEqual(a, b);
    });
  });

  describe('loadCharacterCards with type', () => {
    it('loads NPC cards with type=npc', () => {
      const cards = loadCharacterCards('npc');
      assert.strictEqual(Object.keys(cards).length, 5);
    });

    it('defaults to npc when no type', () => {
      const cards = loadCharacterCards();
      assert.strictEqual(Object.keys(cards).length, 5);
    });

    it('returns same cache for same type', () => {
      const a = loadCharacterCards('npc');
      const b = loadCharacterCards('npc');
      assert.strictEqual(a, b);
    });
  });

  describe('getCharacterCard', () => {
    it('returns card for valid id', () => {
      const card = getCharacterCard('nagi');
      assert.ok(card);
      assert.strictEqual(card.id, 'nagi');
      assert.ok(card.name);
      assert.ok(card.personality);
      assert.ok(card.exampleDialogue);
    });

    it('returns card with type param', () => {
      const card = getCharacterCard('nagi', 'npc');
      assert.ok(card);
      assert.strictEqual(card.id, 'nagi');
    });

    it('returns null for unknown id', () => {
      assert.strictEqual(getCharacterCard('npc_99'), null);
    });
  });

  describe('validateCard', () => {
    it('accepts a valid card', () => {
      const card = getCharacterCard('nagi');
      const result = validateCard(card);
      assert.strictEqual(result.valid, true);
    });

    it('rejects card missing personality', () => {
      const result = validateCard({ id: 'x', name: 'X', nameEn: 'X' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('rejects null card', () => {
      const result = validateCard(null);
      assert.strictEqual(result.valid, false);
    });

    it('all loaded cards pass validation', () => {
      const cards = loadCharacterCards();
      for (const [id, card] of Object.entries(cards)) {
        const result = validateCard(card);
        assert.strictEqual(result.valid, true, `${id} failed: ${result.errors?.join(', ')}`);
      }
    });

    it('validates NPC card with type=npc', () => {
      const card = getCharacterCard('nagi', 'npc');
      const result = validateCard(card, 'npc');
      assert.strictEqual(result.valid, true);
    });

    it('defaults type to npc for validateCard', () => {
      const card = getCharacterCard('nagi');
      const result = validateCard(card);
      assert.strictEqual(result.valid, true);
    });

    it('uses entity type requiredCardFields for validation', () => {
      // creature type only requires id, name, nameEn, personality
      const minimalCreatureCard = { id: 'c1', name: 'test', nameEn: 'test', personality: 'shy' };
      const result = validateCard(minimalCreatureCard, 'creature');
      assert.strictEqual(result.valid, true);
    });

    it('NPC validation rejects card missing NPC-specific fields', () => {
      // This card has only creature-required fields, missing exampleDialogue and goals
      const minimalCard = { id: 'c1', name: 'test', nameEn: 'test', personality: 'shy' };
      const result = validateCard(minimalCard, 'npc');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('exampleDialogue')));
      assert.ok(result.errors.some(e => e.includes('goals')));
    });
  });

  describe('creature cards', () => {
    it('loads creature cards with type=creature', () => {
      const cards = loadCharacterCards('creature');
      assert.ok(Object.keys(cards).length >= 37);
    });

    it('all creature cards have required fields', () => {
      const cards = loadCharacterCards('creature');
      for (const [id, card] of Object.entries(cards)) {
        assert.ok(card.id, `${id} missing id`);
        assert.ok(card.name, `${id} missing name`);
        assert.ok(card.nameEn, `${id} missing nameEn`);
        assert.ok(card.personality, `${id} missing personality`);
      }
    });

    it('all creature cards pass validateCard with type=creature', () => {
      const cards = loadCharacterCards('creature');
      for (const [id, card] of Object.entries(cards)) {
        const result = validateCard(card, 'creature');
        assert.strictEqual(result.valid, true, `${id} failed: ${result.errors?.join(', ')}`);
      }
    });

    it('retrieves individual creature card by id', () => {
      const card = getCharacterCard('hi', 'creature');
      assert.ok(card);
      assert.strictEqual(card.id, 'hi');
      assert.strictEqual(card.element, 'fire');
      assert.strictEqual(card.archetype, 'Fighter');
    });

    it('returns null for unknown creature id', () => {
      assert.strictEqual(getCharacterCard('nonexistent', 'creature'), null);
    });
  });
});
