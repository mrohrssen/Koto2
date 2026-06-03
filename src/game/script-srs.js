import { createEmptyCard, State } from 'ts-fsrs';
import {
  getDeckCards,
  gradeCard,
  loadSrsData,
  saveSrsData,
} from './internal-srs.js';
import { getStaticScriptCards, SCRIPT_CARD_TYPES } from './script-decks.js';

export const SCRIPT_DECK = 'script';
export const DAILY_NEW_LIMIT = 20;

const FSRS_FIELDS = [
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'reps',
  'lapses',
  'learning_steps',
  'state',
  'last_review',
];

function fsrsFieldsFrom(card) {
  const fields = {};
  for (const key of FSRS_FIELDS) {
    if (card?.[key] !== undefined) fields[key] = card[key];
  }
  return fields;
}

function mergeStaticCard(existing, staticCard) {
  return {
    ...staticCard,
    ...createEmptyCard(),
    ...fsrsFieldsFrom(existing),
  };
}

export function ensureScriptDeckSeeded(userId) {
  const data = loadSrsData(userId);
  if (!data[SCRIPT_DECK]) data[SCRIPT_DECK] = { cards: [] };

  const byId = new Map(data[SCRIPT_DECK].cards.map(card => [card.id, card]));
  const seeded = [];
  for (const type of SCRIPT_CARD_TYPES) {
    for (const staticCard of getStaticScriptCards(type)) {
      seeded.push(mergeStaticCard(byId.get(staticCard.id), staticCard));
    }
  }

  data[SCRIPT_DECK].cards = seeded;
  migrateLegacyKanaData(data);
  saveSrsData(userId, data);
  return data[SCRIPT_DECK].cards;
}

function migrateLegacyKanaData(data) {
  if (data.scriptMigration?.kanaToScript) return;
  const legacyCards = data.kana?.cards || [];
  if (!legacyCards.length) {
    data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
    return;
  }

  const legacyByChar = new Map(legacyCards.map(card => [card.char, card]));
  data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map(card => {
    if (card.type !== 'hiragana') return card;
    const legacy = legacyByChar.get(card.prompt);
    return legacy ? { ...card, ...fsrsFieldsFrom(legacy) } : card;
  });
  data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
}

export function getScriptCards(userId, type = null) {
  ensureScriptDeckSeeded(userId);
  const cards = getDeckCards(userId, SCRIPT_DECK);
  return type ? cards.filter(card => card.type === type) : cards;
}

export function isScriptTypeGraduated(userId, type) {
  const cards = getScriptCards(userId, type);
  return cards.length > 0 && cards.every(card => card.state === State.Review);
}

export function getActiveScriptType(userId, onboarding = {}) {
  for (const type of SCRIPT_CARD_TYPES) {
    if (type === 'hiragana' && onboarding?.knowsHiragana === true) continue;
    if (type === 'katakana' && onboarding?.knowsKatakana === true) continue;
    if (!isScriptTypeGraduated(userId, type)) return type;
  }
  return 'kanji';
}

export function getDueScriptCards(userId, type = getActiveScriptType(userId), now = new Date()) {
  return getScriptCards(userId, type).filter(card => {
    if ((card.reps || 0) === 0) return false;
    const due = card.due instanceof Date ? card.due : new Date(card.due);
    return due <= now;
  });
}

export function getNewScriptCards(userId, type = getActiveScriptType(userId)) {
  return getScriptCards(userId, type).filter(card => (card.reps || 0) === 0);
}

export function gradeScriptCard(userId, cardId, grade) {
  ensureScriptDeckSeeded(userId);
  return gradeCard(userId, SCRIPT_DECK, cardId, grade);
}

export function getScriptDailyState(userId, localDate) {
  const data = loadSrsData(userId);
  const daily = data.kanjiKombatDaily;
  if (daily?.date === localDate) return daily;
  return { date: localDate, introducedCount: 0, completed: false };
}

export function saveScriptDailyState(userId, state) {
  const data = loadSrsData(userId);
  data.kanjiKombatDaily = {
    date: state.date,
    introducedCount: state.introducedCount || 0,
    completed: state.completed === true,
  };
  saveSrsData(userId, data);
  return data.kanjiKombatDaily;
}

export function recordScriptIntro(userId, localDate) {
  const daily = getScriptDailyState(userId, localDate);
  return saveScriptDailyState(userId, {
    ...daily,
    introducedCount: Math.min(DAILY_NEW_LIMIT, (daily.introducedCount || 0) + 1),
  });
}

export function markScriptDailyComplete(userId, localDate) {
  const daily = getScriptDailyState(userId, localDate);
  return saveScriptDailyState(userId, { ...daily, completed: true });
}
