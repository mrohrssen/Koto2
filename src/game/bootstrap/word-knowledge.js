// src/game/bootstrap/word-knowledge.js
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export function createWordKnowledge(userId) {
  return {
    userId,
    seen: {},    // { wordId: { exposures: number, firstSeen: ISO } }
    known: {}    // { wordId: { knownSince: ISO } }
  };
}

export function registerExposure(wk, wordId) {
  if (!wk.seen[wordId]) {
    wk.seen[wordId] = { exposures: 0, firstSeen: new Date().toISOString() };
  }
  wk.seen[wordId].exposures++;
}

export function markKnown(wk, wordId) {
  if (!wk.known[wordId]) {
    wk.known[wordId] = { knownSince: new Date().toISOString() };
  }
}

export function unmarkKnown(wk, wordId) {
  delete wk.known[wordId];
}

export function isWordKnown(wk, wordId) {
  return !!wk.known[wordId];
}

export function getKnownWords(wk) {
  return new Set(Object.keys(wk.known));
}

export function getSeenWords(wk) {
  return new Set(Object.keys(wk.seen));
}

export function seedKnownWords(wk, words) {
  const now = new Date().toISOString();
  for (const word of words) {
    if (!wk.known[word]) {
      wk.known[word] = { knownSince: now };
    }
  }
}

export function loadWordKnowledge(userId) {
  const filePath = path.join(DATA_DIR, `word-knowledge-${userId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveWordKnowledge(wk) {
  const filePath = path.join(DATA_DIR, `word-knowledge-${wk.userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wk, null, 2));
}
