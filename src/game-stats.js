// Game Statistics Module
// Tracks Japanese language stats from game narrations
// Separate from chat stats but uses the same structure

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPath } from './data-dir.js';

const GAME_STATS_FILE = dataPath('.jrpg-game-stats.json');

// Regex to match Japanese characters (hiragana, katakana, kanji)
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/g;

// Regex to match kanji only
const KANJI_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get date N days ago
 */
function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Load game stats from file
 */
export function loadGameStats() {
  const defaults = {
    daily: {},
    createdAt: new Date().toISOString()
  };

  if (existsSync(GAME_STATS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(GAME_STATS_FILE, 'utf-8'));
      return { ...defaults, ...saved };
    } catch (e) {
      console.warn('Failed to load game stats file:', e.message);
    }
  }
  return defaults;
}

/**
 * Save game stats to file
 */
export function saveGameStats(stats) {
  try {
    writeFileSync(GAME_STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.warn('Failed to save game stats:', e.message);
  }
}

/**
 * Get or create daily stats entry
 */
function getDailyStats(stats, date = null) {
  const day = date || getToday();
  if (!stats.daily[day]) {
    stats.daily[day] = {
      narrations: 0,        // Number of narrations seen
      characters: 0,
      japaneseCharacters: 0,
      kanji: [],
      wordFrequency: {},
      // Game-specific stats
      encountersCompleted: 0,
      floorsCleared: 0,
      runsStarted: 0,
      runsCompleted: 0
    };
  }
  return stats.daily[day];
}

/**
 * Extract Japanese characters from text
 */
export function extractJapaneseChars(text) {
  const matches = text.match(JAPANESE_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Extract unique kanji from text
 */
export function extractKanji(text) {
  const matches = text.match(KANJI_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Update stats with a narration
 */
export function updateGameStatsWithNarration(stats, narration) {
  if (!narration || typeof narration !== 'string') return stats;

  const japaneseCount = extractJapaneseChars(narration);
  const newKanji = extractKanji(narration);

  const daily = getDailyStats(stats);

  daily.narrations++;
  daily.characters += narration.length;
  daily.japaneseCharacters += japaneseCount;

  // Add unique kanji for this day
  const kanjiSet = new Set(daily.kanji);
  for (const kanji of newKanji) {
    kanjiSet.add(kanji);
  }
  daily.kanji = [...kanjiSet];

  return stats;
}

/**
 * Add words to daily word frequency
 */
export function updateGameStatsWithWords(stats, words) {
  if (!words || !Array.isArray(words)) return stats;

  const daily = getDailyStats(stats);
  for (const word of words) {
    if (word && typeof word === 'string') {
      daily.wordFrequency[word] = (daily.wordFrequency[word] || 0) + 1;
    }
  }
  return stats;
}

/**
 * Update game-specific stats
 */
export function updateGameStatsWithEvent(stats, event) {
  const daily = getDailyStats(stats);

  switch (event) {
    case 'encounter_complete':
      daily.encountersCompleted++;
      break;
    case 'floor_cleared':
      daily.floorsCleared++;
      break;
    case 'run_started':
      daily.runsStarted++;
      break;
    case 'run_completed':
      daily.runsCompleted++;
      break;
  }

  return stats;
}

/**
 * Aggregate stats for a date range
 */
export function aggregateGameStats(stats, startDate = null, endDate = null) {
  const result = {
    totalNarrations: 0,
    totalCharacters: 0,
    totalJapaneseCharacters: 0,
    uniqueKanji: new Set(),
    wordFrequency: {},
    daysActive: 0,
    // Game-specific totals
    totalEncounters: 0,
    totalFloorsCleared: 0,
    totalRunsStarted: 0,
    totalRunsCompleted: 0
  };

  const start = startDate || '1970-01-01';
  const end = endDate || '9999-12-31';

  for (const [date, daily] of Object.entries(stats.daily)) {
    if (date >= start && date <= end) {
      result.totalNarrations += daily.narrations || 0;
      result.totalCharacters += daily.characters || 0;
      result.totalJapaneseCharacters += daily.japaneseCharacters || 0;
      result.totalEncounters += daily.encountersCompleted || 0;
      result.totalFloorsCleared += daily.floorsCleared || 0;
      result.totalRunsStarted += daily.runsStarted || 0;
      result.totalRunsCompleted += daily.runsCompleted || 0;

      for (const k of (daily.kanji || [])) {
        result.uniqueKanji.add(k);
      }

      // Aggregate word frequency
      const freq = daily.wordFrequency || {};
      for (const [word, count] of Object.entries(freq)) {
        result.wordFrequency[word] = (result.wordFrequency[word] || 0) + count;
      }

      result.daysActive++;
    }
  }

  // Sort words by frequency (descending)
  const sortedWords = Object.entries(result.wordFrequency)
    .sort((a, b) => b[1] - a[1]);

  return {
    totalNarrations: result.totalNarrations,
    totalCharacters: result.totalCharacters,
    totalJapaneseCharacters: result.totalJapaneseCharacters,
    uniqueKanjiCount: result.uniqueKanji.size,
    uniqueWordsCount: sortedWords.length,
    uniqueKanji: [...result.uniqueKanji],
    wordFrequency: sortedWords,
    daysActive: result.daysActive,
    totalEncounters: result.totalEncounters,
    totalFloorsCleared: result.totalFloorsCleared,
    totalRunsStarted: result.totalRunsStarted,
    totalRunsCompleted: result.totalRunsCompleted,
    startDate: start,
    endDate: end
  };
}

/**
 * Get stats for a specific time period
 */
export function getGameStatsForPeriod(stats, period) {
  const today = getToday();

  switch (period) {
    case 'today':
      return aggregateGameStats(stats, today, today);
    case '7days':
      return aggregateGameStats(stats, getDaysAgo(6), today);
    case '14days':
      return aggregateGameStats(stats, getDaysAgo(13), today);
    case '30days':
      return aggregateGameStats(stats, getDaysAgo(29), today);
    case '3months':
      return aggregateGameStats(stats, getDaysAgo(89), today);
    case '12months':
      return aggregateGameStats(stats, getDaysAgo(364), today);
    case 'all':
    default:
      return aggregateGameStats(stats);
  }
}

/**
 * Get available dates with stats
 */
export function getGameStatsAvailableDates(stats) {
  return Object.keys(stats.daily).sort().reverse();
}

/**
 * Reset game stats
 */
export function resetGameStats() {
  const fresh = {
    daily: {},
    createdAt: new Date().toISOString()
  };
  saveGameStats(fresh);
  return fresh;
}
