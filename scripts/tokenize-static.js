#!/usr/bin/env node
// scripts/tokenize-static.js
//
// Reads data/dialogue/frame-sources.json, tokenizes frame text via Sudachi,
// enriches with meanings, and writes data/dialogue/frames.json.
//
// Usage: node scripts/tokenize-static.js

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../src/tokenizer.js';
import { loadWordDictionary } from '../src/game/word-dictionary.js';

const ROOT = join(import.meta.dirname, '..');
const SOURCES_PATH = join(ROOT, 'data', 'dialogue', 'frame-sources.json');
const OUTPUT_PATH = join(ROOT, 'data', 'dialogue', 'frames.json');

// POS values that Sudachi assigns to grammar we want to demote to surface-only
const DEMOTED_POS = new Set([
  '助詞',    // particles (が, を, に, て, は, etc.)
  '助動詞',  // auxiliaries (です, ます, た, ない, etc.)
  '補助記号', // supplementary punctuation (「」、etc.)
  '記号',    // symbols
  '空白',    // whitespace
  '接尾辞',  // counter suffixes (つ, 匹, etc.)
  '接頭辞',  // honorific prefixes (お, ご, etc.)
]);

// Additional base forms to demote even if POS is verb/adj
// (auxiliary いる in ている, ある in てある, etc.)
const DEMOTED_BASE_FORMS = new Set([
  'いる', 'ある', 'しまう', 'おく', 'みる', 'くる', 'いく',
  'だ', 'です', 'ます', 'する',
]);

function isDemoted(sudachiToken) {
  if (DEMOTED_POS.has(sudachiToken.pos)) return true;
  if (DEMOTED_BASE_FORMS.has(sudachiToken.baseForm)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(sudachiToken.surface)) return true;
  return false;
}

function lookupMeaning(baseForm, wordDict) {
  const entry = wordDict.get(baseForm);
  if (!entry) return '';
  const primary = entry.definitions?.find(d => d.primary);
  return primary?.en || entry.definitions?.[0]?.en || '';
}

/**
 * Convert a Sudachi token to universal format.
 */
function toUniversalToken(st, wordDict) {
  if (isDemoted(st)) {
    return { token: { surface: st.surface }, isContent: false };
  }
  const meaning = lookupMeaning(st.baseForm, wordDict);
  return {
    token: { surface: st.surface, base: st.baseForm, reading: st.reading, meaning },
    isContent: true,
  };
}

function main() {
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf-8'));
  const wordDict = loadWordDictionary(join(ROOT, 'data'));

  // Split each frame's raw text at slot markers, tokenize each segment separately,
  // then interleave slot tokens between the segments.
  // This avoids marker-merging issues where Sudachi combines markers with adjacent text.

  // Collect all non-empty segments for batch tokenization
  const segmentMap = []; // [{frameIdx, slotsBefore: string[], segmentText}]
  for (let i = 0; i < sources.length; i++) {
    const raw = sources[i].raw;
    const slots = sources[i].slots || [];
    // Split raw text at each {slotName} to get segments between slots
    let remaining = raw;
    const segments = [];
    for (const slot of slots) {
      const marker = `{${slot}}`;
      const pos = remaining.indexOf(marker);
      if (pos >= 0) {
        segments.push({ text: remaining.slice(0, pos), slotBefore: slot });
        remaining = remaining.slice(pos + marker.length);
      }
    }
    segments.push({ text: remaining, slotBefore: null });

    for (const seg of segments) {
      segmentMap.push({ frameIdx: i, slotBefore: seg.slotBefore, segmentText: seg.text });
    }
  }

  // Batch tokenize all non-empty segments
  const textsToTokenize = segmentMap.map(s => s.segmentText);
  const allSegmentTokens = tokenizeBatch(textsToTokenize);

  // Reassemble frames from tokenized segments
  const frameTokens = sources.map(() => ({ tokens: [], words: [] }));

  for (let i = 0; i < segmentMap.length; i++) {
    const { frameIdx, slotBefore } = segmentMap[i];
    const frame = frameTokens[frameIdx];

    // Insert slot token before this segment's tokens
    if (slotBefore) {
      frame.tokens.push({ slot: slotBefore });
    }

    // Process Sudachi tokens for this segment
    for (const st of allSegmentTokens[i]) {
      const { token, isContent } = toUniversalToken(st, wordDict);
      frame.tokens.push(token);
      if (isContent) frame.words.push(token.base);
    }
  }

  // Build final output
  const frames = sources.map((source, idx) => ({
    id: source.id,
    category: source.category,
    raw: source.raw,
    tokens: frameTokens[idx].tokens,
    words: frameTokens[idx].words,
  }));

  writeFileSync(OUTPUT_PATH, JSON.stringify(frames, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${frames.length} frames to ${OUTPUT_PATH}`);
}

main();
