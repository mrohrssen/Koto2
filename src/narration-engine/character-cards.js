import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getEntityType } from './entity-types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const _caches = {};

export function loadCharacterCards(type = 'npc') {
  if (!_caches[type]) {
    const cardsPath = join(__dirname, `../../data/character-cards/${type}s.json`);
    _caches[type] = JSON.parse(readFileSync(cardsPath, 'utf8'));
  }
  return _caches[type];
}

export function getCharacterCard(id, type = 'npc') {
  const cards = loadCharacterCards(type);
  return cards[id] || null;
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
