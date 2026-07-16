import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  getGameMasterAskFrames,
  getGameMasterNoFrame,
  getGameMasterYesFrame,
} from '../dialogue-loader.js';
import { getWordDict } from '../bootstrap/word-knowledge.js';
import {
  assembleFrame,
  getEligibleFrameTokens,
  selectBestFrame,
} from '../token-format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIALOGUE_FRAMES_PATH = join(__dirname, '../../../data/dialogue/frames.json');
let fallbackFrames = null;

function allFallbackFrames() {
  if (fallbackFrames) return fallbackFrames;
  try {
    fallbackFrames = JSON.parse(readFileSync(DIALOGUE_FRAMES_PATH, 'utf8'));
  } catch {
    fallbackFrames = [];
  }
  return fallbackFrames;
}

function askFrames() {
  const loaded = getGameMasterAskFrames();
  return loaded.length > 0
    ? loaded
    : allFallbackFrames().filter(frame => frame.category === 'gameMaster_ask');
}

function yesFrame() {
  return getGameMasterYesFrame()
    || allFallbackFrames().find(frame => frame.category === 'gameMaster_yes')
    || null;
}

function noFrame() {
  return getGameMasterNoFrame()
    || allFallbackFrames().find(frame => frame.category === 'gameMaster_no')
    || null;
}

function normalizeKnownSet(knownWords) {
  if (knownWords instanceof Set) return knownWords;
  if (Array.isArray(knownWords)) return new Set(knownWords);
  return new Set();
}

/** Build the frame-safe, non-audio Whack prompt used by runway and legacy GET. */
export function buildWhackAMoleDialogueContent(knownWords = new Set()) {
  const knownSet = normalizeKnownSet(knownWords);
  const dict = getWordDict();
  const candidates = askFrames().map(frame => assembleFrame(frame, {}, { dict }));
  return {
    dialogue: selectBestFrame(candidates, knownSet, { dict }) || { tokens: [], words: [] },
    yesTokens: getEligibleFrameTokens(yesFrame(), knownSet, { dict }),
    noTokens: getEligibleFrameTokens(noFrame(), knownSet, { dict }),
  };
}
