import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getEntityType } from './entity-types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const _caches = {};
let _creatureById = null;

function loadCreatureByIdMap() {
  if (!_creatureById) {
    const arr = JSON.parse(readFileSync(join(__dirname, '../../data/creatures.json'), 'utf8'));
    _creatureById = Object.fromEntries(arr.map(c => [c.id, c]));
  }
  return _creatureById;
}

export function loadCharacterCards(type = 'npc') {
  if (!_caches[type]) {
    const cardsPath = join(__dirname, `../../data/character-cards/${type}s.json`);
    _caches[type] = JSON.parse(readFileSync(cardsPath, 'utf8'));
  }
  return _caches[type];
}

/**
 * Character card for dialogue. Falls back to creatures.json when no authored card
 * (e.g. new forge creatures) so befriend dialogue can still generate.
 */
export function getCharacterCard(id, type = 'npc') {
  const cards = loadCharacterCards(type);
  if (cards[id]) return cards[id];
  if (type === 'creature') {
    const c = loadCreatureByIdMap()[id];
    if (c) {
      const desc = (c.description || '').slice(0, 400);
      return {
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        personality: `${c.archetype || 'Wild'} creature. ${desc || 'Mysterious and wary of strangers.'}`,
        element: c.element || 'neutral',
        quirk: c.modifier?.meaning
          ? `Often echoes themes of ${c.modifier.meaning}`
          : 'Watches carefully before trusting',
        exampleDialogue: ['…', 'だれ？', 'こわい…']
      };
    }
  }
  return null;
}

export function validateCard(card, type = 'npc') {
  const errors = [];
  if (!card) {
    return { valid: false, errors: ['card is null'] };
  }
  const { requiredCardFields } = getEntityType(type);
  for (const field of requiredCardFields) {
    if (!card[field]) errors.push(`missing ${field}`);
  }
  if (card.exampleDialogue && !Array.isArray(card.exampleDialogue)) {
    errors.push('exampleDialogue must be an array');
  }
  if (card.goals && typeof card.goals !== 'object') {
    errors.push('goals must be an object');
  }
  return { valid: errors.length === 0, errors };
}
