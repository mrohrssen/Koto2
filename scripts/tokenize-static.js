#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tokenizeBatch } from '../src/tokenizer.js';
import { loadWordDictionary } from '../src/game/word-dictionary.js';
import { resolveLiveDictPath } from '../src/game/live-dict-path.js';

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
  if (sudachiToken._isMerged) return false; // dictionary-merged tokens are always content
  if (DEMOTED_POS.has(sudachiToken.pos)) return true;
  if (DEMOTED_BASE_FORMS.has(sudachiToken.baseForm)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(sudachiToken.surface)) return true;
  return false;
}

const SUDACHI_POS_EN = {
  '名詞': 'Noun',
  '動詞': 'Verb',
  '形容詞': 'Adjective',
  '副詞': 'Adverb',
  '連体詞': 'Pre-noun',
  '接続詞': 'Conjunction',
  '感動詞': 'Interjection',
  '形状詞': 'Na-adjective',
  '代名詞': 'Pronoun',
  '助詞': 'Particle',
  '助動詞': 'Auxiliary',
  '接尾辞': 'Suffix',
  '接頭辞': 'Prefix',
};

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
    token: { surface: st.surface, base: st.baseForm, reading: st.reading, meaning, pos: SUDACHI_POS_EN[st.pos] || st.pos },
    isContent: true,
  };
}

function main() {
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf-8'));
  const wordDict = loadWordDictionary({
    overlayDir: join(ROOT, 'data'),
    liveDictPath: resolveLiveDictPath(),
  });

  // Split each frame's raw text at slot markers, tokenize each segment separately,
  // then interleave slot tokens between the segments.
  // This avoids marker-merging issues where Sudachi combines markers with adjacent text.

  // Collect all non-empty segments for batch tokenization
  const segmentMap = []; // [{frameIdx, slotsBefore: string[], segmentText}]
  for (let i = 0; i < sources.length; i++) {
    const raw = sources[i].raw;
    const slots = sources[i].slots || [];
    // Split raw text at each {slotName} to get segments between slots.
    // Each segment is the text BEFORE the slot, with slotAfter indicating
    // what slot follows this segment's text.
    let remaining = raw;
    const segments = [];
    for (const slot of slots) {
      const marker = `{${slot}}`;
      const pos = remaining.indexOf(marker);
      if (pos >= 0) {
        segments.push({ text: remaining.slice(0, pos), slotAfter: slot });
        remaining = remaining.slice(pos + marker.length);
      }
    }
    segments.push({ text: remaining, slotAfter: null });

    for (const seg of segments) {
      segmentMap.push({ frameIdx: i, slotAfter: seg.slotAfter, segmentText: seg.text });
    }
  }

  // Batch tokenize all non-empty segments
  const textsToTokenize = segmentMap.map(s => s.segmentText);
  const allSegmentTokens = tokenizeBatch(textsToTokenize);

  // Merge adjacent Sudachi tokens that form dictionary entries.
  // Sudachi splits morphologically (すみません → すむ+ます+ぬ) but learners
  // treat these as single vocabulary units. The dictionary has them as entries.
  // Greedy longest-match: try 4, 3, 2 adjacent tokens, take first dictionary hit.
  const MAX_MERGE = 5;

  function mergeSudachiTokens(sudachiTokens) {
    const merged = [];
    let i = 0;
    while (i < sudachiTokens.length) {
      let matched = false;
      for (let len = Math.min(MAX_MERGE, sudachiTokens.length - i); len >= 2; len--) {
        const combined = sudachiTokens.slice(i, i + len).map(t => t.surface).join('');
        const dictEntry = wordDict.get(combined);
        if (dictEntry) {
          // Inherit POS from first component with a mappable (content) POS
          const contentPos = sudachiTokens.slice(i, i + len)
            .map(t => t.pos)
            .find(p => SUDACHI_POS_EN[p]) || sudachiTokens[i].pos;
          merged.push({
            surface: combined,
            baseForm: combined,
            pos: contentPos,
            _isMerged: true,             // signals this was merged from dictionary — skip demotion
            reading: dictEntry.reading || combined,
          });
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        merged.push(sudachiTokens[i]);
        i++;
      }
    }
    return merged;
  }

  // Reassemble frames from tokenized segments
  const frameTokens = sources.map(() => ({ tokens: [], words: [] }));

  for (let i = 0; i < segmentMap.length; i++) {
    const { frameIdx, slotAfter } = segmentMap[i];
    const frame = frameTokens[frameIdx];

    // Process this segment's text tokens first
    const mergedTokens = mergeSudachiTokens(allSegmentTokens[i]);
    for (const st of mergedTokens) {
      const { token, isContent } = toUniversalToken(st, wordDict);
      frame.tokens.push(token);
      if (isContent) frame.words.push(token.base);
    }

    // Insert slot token after this segment's tokens
    if (slotAfter) {
      frame.tokens.push({ slot: slotAfter });
    }
  }

  // Build final output
  const frames = sources.map((source, idx) => {
    const frame = {
      id: source.id,
      category: source.category,
      raw: source.raw,
      tokens: frameTokens[idx].tokens,
      words: frameTokens[idx].words,
    };
    if (source.group) frame.group = source.group;
    return frame;
  });

  writeFileSync(OUTPUT_PATH, JSON.stringify(frames, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${frames.length} frames to ${OUTPUT_PATH}`);
}

main();
