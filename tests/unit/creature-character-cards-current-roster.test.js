import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const creatures = JSON.parse(readFileSync(join(root, 'data/creatures.json'), 'utf8'));
const cards = JSON.parse(readFileSync(join(root, 'data/character-cards/creatures.json'), 'utf8'));

describe('creature character cards', () => {
  it('matches the current creature roster exactly', () => {
    const creatureIds = creatures.map(c => c.id).sort();
    const cardIds = Object.keys(cards).sort();
    assert.deepEqual(cardIds, creatureIds);
  });

  it('has dialogue-ready RPG personality fields for every creature', () => {
    for (const creature of creatures) {
      const card = cards[creature.id];
      assert.equal(card.id, creature.id);
      assert.equal(card.name, creature.name);
      assert.equal(card.nameEn, creature.nameEn);
      assert.equal(card.element, creature.element);
      assert.equal(card.archetype, creature.archetype);
      assert.equal(typeof card.personality, 'string', creature.id);
      assert.ok(card.personality.length >= 40, `${creature.id} personality too short`);
      assert.equal(typeof card.quirk, 'string', creature.id);
      assert.ok(card.quirk.length >= 25, `${creature.id} quirk too short`);
      assert.equal(Array.isArray(card.exampleDialogue), true, creature.id);
      assert.ok(card.exampleDialogue.length >= 2, `${creature.id} needs at least two example lines`);
      for (const line of card.exampleDialogue) {
        assert.equal(typeof line, 'string', `${creature.id} example line must be string`);
        assert.ok(line.length > 0, `${creature.id} example line must not be empty`);
      }
    }
  });

  it('does not contain stale old-roster ids', () => {
    for (const staleId of ['kamedor', 'umarak', 'chouri', 'hebiveil']) {
      assert.equal(cards[staleId], undefined);
    }
  });
});
