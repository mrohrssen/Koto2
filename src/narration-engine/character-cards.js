import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_PATH = join(__dirname, '../../data/character-cards/npcs.json');

const REQUIRED_FIELDS = ['id', 'name', 'nameEn', 'personality', 'exampleDialogue', 'goals'];

let _cache = null;

export function loadCharacterCards() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(CARDS_PATH, 'utf8'));
  }
  return _cache;
}

export function getCharacterCard(id) {
  const cards = loadCharacterCards();
  return cards[id] || null;
}

export function validateCard(card) {
  const errors = [];
  if (!card) {
    return { valid: false, errors: ['card is null'] };
  }
  for (const field of REQUIRED_FIELDS) {
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
