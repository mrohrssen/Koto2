import { createEmptyCard, State } from 'ts-fsrs';
import {
  gradeCard,
  loadSrsData,
  saveSrsData,
} from './internal-srs.js';
import { getStaticScriptCards, SCRIPT_CARD_TYPES } from './script-decks.js';

export const SCRIPT_DECK = 'script';
export const DAILY_NEW_LIMIT = 20;

const SCRIPT_TYPE_ORDER = new Map(SCRIPT_CARD_TYPES.map((type, index) => [type, index]));

function dueTime(card) {
  const due = card.due instanceof Date ? card.due : new Date(card.due);
  return due.getTime();
}

function scriptTypeOrder(type) {
  return SCRIPT_TYPE_ORDER.get(type) ?? SCRIPT_TYPE_ORDER.size;
}

function compareScriptCardsByDue(a, b) {
  return dueTime(a) - dueTime(b)
    || scriptTypeOrder(a.type) - scriptTypeOrder(b.type)
    || (a.sortIndex || 0) - (b.sortIndex || 0)
    || String(a.id).localeCompare(String(b.id));
}

function compareScriptCardsByCurriculum(a, b) {
  return scriptTypeOrder(a.type) - scriptTypeOrder(b.type)
    || (a.sortIndex || 0) - (b.sortIndex || 0)
    || String(a.id).localeCompare(String(b.id));
}

export function getEligibleScriptTypes(onboarding = {}) {
  return SCRIPT_CARD_TYPES.filter(type => {
    if (type === 'hiragana' && onboarding?.knowsHiragana === true) return false;
    if (type === 'katakana' && onboarding?.knowsKatakana === true) return false;
    return true;
  });
}

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

// --- Sparse storage + merged-view memo -------------------------------------
// Persisted form (data[SCRIPT_DECK].cards): ONLY cards with reps > 0.
// Read form: full static deck with per-user FSRS progress overlaid, memoized
// per user and invalidated on grade/insert or via clearScriptDeckMemo.

const mergedDeckMemo = new Map(); // userId -> { dataRef, cards }

export function clearScriptDeckMemo(userId) {
  mergedDeckMemo.delete(userId);
}

function mergeStaticCard(existing, staticCard) {
  const card = {
    ...staticCard,
    ...createEmptyCard(),
    ...fsrsFieldsFrom(existing),
  };
  if (card.radicals) card.radicals = { ...card.radicals };
  return card;
}

function buildMergedDeck(data) {
  const byId = new Map((data[SCRIPT_DECK]?.cards || []).map(card => [card.id, card]));
  const merged = [];
  for (const type of SCRIPT_CARD_TYPES) {
    for (const staticCard of getStaticScriptCards(type)) {
      merged.push(mergeStaticCard(byId.get(staticCard.id), staticCard));
    }
  }
  return merged;
}

function getMergedDeck(userId) {
  const data = loadSrsData(userId);
  const memo = mergedDeckMemo.get(userId);
  if (memo && memo.dataRef === data) return memo.cards;
  const cards = buildMergedDeck(data);
  mergedDeckMemo.set(userId, { dataRef: data, cards });
  return cards;
}

const STATIC_IDS = new Set(
  SCRIPT_CARD_TYPES.flatMap(type => getStaticScriptCards(type).map(card => card.id))
);

/**
 * Ensure sparse structures exist, run one-time migrations, and compact
 * legacy fat files (drop reps===0 cards and unknown ids). Writes to disk
 * ONLY when something actually changed. Returns the merged deck.
 */
export function ensureScriptDeckSeeded(userId) {
  const data = loadSrsData(userId);
  let dirty = false;

  if (!data[SCRIPT_DECK]) {
    data[SCRIPT_DECK] = { cards: [] };
    dirty = true;
  }

  dirty = migrateLegacyKanaData(data) || dirty;

  const compacted = data[SCRIPT_DECK].cards.filter(
    card => (card.reps || 0) > 0 && STATIC_IDS.has(card.id)
  );
  if (compacted.length !== data[SCRIPT_DECK].cards.length) {
    data[SCRIPT_DECK].cards = compacted;
    dirty = true;
  }

  if (dirty) {
    saveSrsData(userId, data);
    clearScriptDeckMemo(userId);
  }
  return getMergedDeck(userId);
}

function migrateLegacyKanaData(data) {
  if (data.scriptMigration?.kanaToScript) return false;
  const legacyCards = data.kana?.cards || [];
  if (legacyCards.length) {
    const legacyByChar = new Map(legacyCards.map(card => [card.char, card]));
    const migrated = [];
    for (const staticCard of getStaticScriptCards('hiragana')) {
      const legacy = legacyByChar.get(staticCard.prompt);
      if (legacy && (legacy.reps || 0) > 0) {
        migrated.push({ id: staticCard.id, type: 'hiragana', ...fsrsFieldsFrom(legacy) });
      }
    }
    const existingIds = new Set(data[SCRIPT_DECK].cards.map(card => card.id));
    for (const card of migrated) {
      if (!existingIds.has(card.id)) data[SCRIPT_DECK].cards.push(card);
    }
  }
  data.scriptMigration = { ...(data.scriptMigration || {}), kanaToScript: true };
  return true;
}

export function getScriptCards(userId, type = null) {
  ensureScriptDeckSeeded(userId); // no-op (no write) after first call
  const cards = getMergedDeck(userId);
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
  return getScriptCards(userId, type)
    .filter(card => {
      if ((card.reps || 0) === 0) return false;
      return dueTime(card) <= now.getTime();
    })
    .sort(compareScriptCardsByDue);
}

export function getDueScriptCardsForTypes(userId, types = SCRIPT_CARD_TYPES, now = new Date()) {
  const allowedTypes = new Set(types);
  return getScriptCards(userId)
    .filter(card => allowedTypes.has(card.type))
    .filter(card => {
      if ((card.reps || 0) === 0) return false;
      return dueTime(card) <= now.getTime();
    })
    .sort(compareScriptCardsByDue);
}

export function getNewScriptCards(userId, type = getActiveScriptType(userId)) {
  return getScriptCards(userId, type)
    .filter(card => (card.reps || 0) === 0)
    .sort(compareScriptCardsByCurriculum);
}

export function getNextNewScriptCards(userId, onboarding = {}) {
  for (const type of getEligibleScriptTypes(onboarding)) {
    const cards = getNewScriptCards(userId, type);
    if (cards.length > 0) return cards;
  }
  return [];
}

export function gradeScriptCard(userId, cardId, grade) {
  const data = loadSrsData(userId);
  if (!data[SCRIPT_DECK]) ensureScriptDeckSeeded(userId);
  const stored = data[SCRIPT_DECK].cards.find(card => card.id === cardId);
  if (!stored) {
    const merged = getMergedDeck(userId).find(card => card.id === cardId);
    if (!merged) throw new Error(`Card ${cardId} not found in deck '${SCRIPT_DECK}'`);
    data[SCRIPT_DECK].cards.push({ ...merged });
  }
  const result = gradeCard(userId, SCRIPT_DECK, cardId, grade);
  clearScriptDeckMemo(userId);
  return result;
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
