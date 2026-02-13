import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCharacterCards, getCharacterCard, validateCard } from '../../../src/narration-engine/character-cards.js';

describe('character-cards', () => {
  describe('loadCharacterCards', () => {
    it('loads all 10 NPC cards', () => {
      const cards = loadCharacterCards();
      assert.strictEqual(Object.keys(cards).length, 10);
    });

    it('returns cached reference on second call', () => {
      const a = loadCharacterCards();
      const b = loadCharacterCards();
      assert.strictEqual(a, b);
    });
  });

  describe('getCharacterCard', () => {
    it('returns card for valid id', () => {
      const card = getCharacterCard('npc_01');
      assert.ok(card);
      assert.strictEqual(card.id, 'npc_01');
      assert.ok(card.name);
      assert.ok(card.personality);
      assert.ok(card.exampleDialogue);
    });

    it('returns null for unknown id', () => {
      assert.strictEqual(getCharacterCard('npc_99'), null);
    });
  });

  describe('validateCard', () => {
    it('accepts a valid card', () => {
      const card = getCharacterCard('npc_01');
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
  });
});
