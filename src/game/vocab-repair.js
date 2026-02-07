/**
 * Vocabulary Repair System
 *
 * This module enforces vocabulary constraints on AI-generated Japanese narration.
 * It ensures each sentence contains at most 1 unknown word, implementing the
 * "comprehensible input" (i+1) approach to language learning.
 *
 * The system works in three phases:
 * 1. PARSE: Split narration into sentences and parse each with JPDB
 * 2. CHECK: Count unknown words (excluding particles and game terms)
 * 3. REPAIR: If violations found, rewrite sentence using known vocabulary
 *
 * @module vocab-repair
 * @see docs/VOCAB-SYSTEM.md for detailed documentation
 */

import { parseText } from '../jpdb.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * System configuration constants
 * @constant {Object}
 */
const CONFIG = {
  /** Maximum unknown words allowed per sentence (the "i+1" target) */
  maxUnknownsPerSentence: 1,

  /** Number of repair attempts before giving up and keeping original */
  maxRepairAttempts: 2,

  /** Enable console logging of repair operations for debugging */
  logRepairs: true,

  /** Legacy: max alternative words to suggest (not used in current repair) */
  maxAlternatives: 10
};

// ============================================================================
// ALLOWED WORDS (PARTICLES & GRAMMAR)
// ============================================================================

/**
 * Words that are always allowed regardless of user's vocabulary.
 * These are fundamental grammar particles and expressions that:
 * - Are not useful to "learn" as vocabulary items
 * - Appear in virtually every Japanese sentence
 * - Would make repair impossible if counted as unknown
 *
 * This list should match ALLOWED_WORDS in server.js for consistency.
 *
 * @constant {Set<string>}
 */
const ALLOWED_WORDS = new Set([
  // ========== Basic Particles ==========
  // Subject/object markers and connectors
  'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'か', 'よ', 'ね', 'や',

  // Compound particles (multi-character)
  'から',    // from
  'まで',    // until
  'より',    // than
  'など',    // etc.
  'って',    // quotation (casual)
  'けど',    // but
  'でも',    // but/even
  'しか',    // only
  'ばかり',  // only/just
  'だけ',    // only
  'ほど',    // extent
  'くらい',  // about
  'ぐらい',  // about (alternate)
  'のに',    // despite
  'ので',    // because
  'のは',    // nominalizer + topic
  'のが',    // nominalizer + subject
  'のを',    // nominalizer + object

  // ========== Common Grammar/Auxiliary ==========
  // Copula and basic verbs that function as grammar
  'です',    // polite copula
  'ます',    // polite verb ending
  'ました',  // polite past
  'ません',  // polite negative
  'だ',      // plain copula
  'な',      // na-adjective connector
  'ない',    // negative
  'ある',    // existence (inanimate)
  'いる',    // existence (animate)
  'する',    // do (light verb)
  'なる',    // become
  'れる',    // passive
  'られる',  // passive/potential
  'せる',    // causative
  'させる',  // causative
  'たい',    // want to
  'てる',    // continuous (casual)

  // Grammatical nouns
  'こと',    // abstract thing
  'もの',    // concrete thing
  'ところ',  // place/situation
  'よう',    // appearance
  'そう',    // hearsay/appearance
  'らしい',  // seems like
  'みたい',  // like/similar to

  // ========== Combined Forms ==========
  // Common sentence-ending patterns
  'ですか',    // polite question
  'ますか',    // polite verb question
  'でした',    // polite past copula
  'ましたか',  // polite past question
  'ませんか',  // polite negative question (invitation)
  'ですね',    // isn't it (agreement)
  'ですよ',    // you know (emphasis)
  'ますね',    // verb + agreement
  'ますよ',    // verb + emphasis
  'だった',    // plain past copula
  'じゃない',  // isn't it (casual)
  'ではない',  // is not (formal)
  'かな',      // I wonder
  'のか',      // question (embedded)
  'んです',    // explanatory (casual)
  'のです',    // explanatory (formal)
  'んですか',  // explanatory question
  'のですか',  // explanatory question (formal)
  'でしょう',  // probably
  'でしょうか', // probably? (question)

  // ========== Question Words ==========
  // These are vocabulary but so fundamental they're allowed
  'なに', '何',  // what
  'どう',       // how
  'どこ',       // where
  'いつ',       // when
  'だれ', '誰', // who
  'なぜ',       // why
  'どれ',       // which one
  'どの',       // which

  // ========== Common Expressions ==========
  // Set phrases that appear frequently
  'こんにちは',  // hello
  'こんばんは',  // good evening
  'おはよう',    // good morning
  'ありがとう',  // thank you
  'すみません',  // excuse me
  'ください',    // please
  'お願い',      // request
  'はい',        // yes
  'いいえ',      // no
  'うん',        // yeah (casual)
  'ええ'         // yes (soft)
]);

// ============================================================================
// SENTENCE PARSING
// ============================================================================

/**
 * Splits Japanese text into individual sentences.
 *
 * Japanese sentence boundaries are marked by:
 * - 。 (period)
 * - ！ (exclamation mark)
 * - ？ (question mark)
 *
 * Special handling:
 * - Quoted speech 「」 is kept together even if it contains punctuation
 * - Closing quotes 」 are kept with the preceding sentence
 * - Empty strings and null input return empty array
 *
 * @param {string|null} text - The Japanese text to split
 * @returns {string[]} Array of sentences, each including its ending punctuation
 *
 * @example
 * splitIntoSentences('これは文です。二番目の文！')
 * // Returns: ['これは文です。', '二番目の文！']
 *
 * @example
 * splitIntoSentences('「こんにちは。元気？」と言った。')
 * // Returns: ['「こんにちは。元気？」', 'と言った。']
 */
function splitIntoSentences(text) {
  // Handle null/undefined/empty input
  if (!text) return [];

  const sentences = [];
  let current = '';      // Current sentence being built
  let inQuote = false;   // Track if we're inside 「」 quotes

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;

    // Track quote state to avoid splitting inside quoted speech
    if (char === '「') inQuote = true;
    if (char === '」') inQuote = false;

    // Check for sentence-ending punctuation
    if ((char === '。' || char === '！' || char === '？')) {
      // Look ahead: if next char is closing quote, include it in this sentence
      if (i + 1 < text.length && text[i + 1] === '」') {
        current += text[i + 1];
        i++;
        inQuote = false;
      }

      // Only finalize sentence if we're not inside a quote
      // (allows 「本当？信じられない！」 to stay as one unit)
      if (!inQuote && current.trim()) {
        sentences.push(current);
        current = '';
      }
    }
  }

  // Don't forget any remaining text (sentence without ending punctuation)
  if (current.trim()) {
    sentences.push(current);
  }

  return sentences;
}

// ============================================================================
// VIOLATION CHECKING
// ============================================================================

/**
 * Checks a single sentence for vocabulary violations.
 *
 * A "violation" is a word that:
 * 1. Is not in the user's known vocabulary set
 * 2. Is not in ALLOWED_WORDS (particles/grammar)
 * 3. Is not a game-specific term (enemy names, etc.)
 * 4. Is not a single hiragana character (usually particles)
 *
 * Uses JPDB's parseText API for accurate Japanese word segmentation.
 *
 * @param {string} sentence - The sentence to check
 * @param {Set<string>} vocabSet - Set of user's known vocabulary words
 * @param {string} jpdbApiKey - JPDB API key for parsing
 * @param {Set<string>|null} gameTerms - Optional set of game-specific terms to allow
 * @returns {Promise<Object>} Result object with:
 *   - sentence: The original sentence
 *   - unknownWords: Array of words not in vocabulary
 *   - count: Number of unknown words
 *
 * @example
 * const result = await checkSentenceViolations(
 *   'スライムが洞窟に現れた。',
 *   userVocabSet,
 *   'jpdb-api-key',
 *   new Set(['スライム'])
 * );
 * // If user doesn't know 洞窟 or 現れた:
 * // { sentence: '...', unknownWords: ['洞窟', '現れた'], count: 2 }
 */
async function checkSentenceViolations(sentence, vocabSet, jpdbApiKey, gameTerms = null, vidSet = null) {
  // Can't check without API key or if sentence is empty
  if (!jpdbApiKey || !sentence.trim()) {
    return { sentence, unknownWords: [], count: 0 };
  }

  // Parse sentence into words using JPDB's morphological analyzer
  const parsedWords = await parseText(jpdbApiKey, sentence);
  const unknownWords = [];
  const seen = new Set(); // Avoid counting same word twice

  // Build expanded game terms set that includes compound name components
  // e.g., "影の君主" should also allow "影" and "君主" individually
  const gameTermWords = new Set();
  if (gameTerms) {
    for (const term of gameTerms) {
      gameTermWords.add(term);
      // Split compound names on の and が particles
      // This handles cases like 影の君主 → [影, 君主]
      const components = term.split(/[のが]/);
      components.forEach(c => c && gameTermWords.add(c));
    }
  }

  // Check each word in the parsed sentence
  for (const word of parsedWords) {
    // Step 1: Skip non-words (punctuation, spaces, etc.)
    if (word.isWord === false) continue;

    const spelling = word.spelling;

    // Step 2: Vid-based matching (primary strategy)
    if (vidSet && word.vid != null && vidSet.has(word.vid)) continue;

    // Deduplication: use vid when available, fall back to spelling
    const dedupeKey = word.vid != null ? `vid:${word.vid}` : spelling;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Step 3: Allowed grammar words / particles
    if (ALLOWED_WORDS.has(spelling)) continue;

    // Step 4: Game-specific terms
    if (gameTermWords.has(spelling)) continue;

    // Step 5: Single hiragana character
    if (spelling.length === 1 && /[\u3040-\u309F]/.test(spelling)) continue;

    // Step 6: Fallback string match (handles vidSet=null / legacy path)
    if (vocabSet.has(spelling)) continue;

    // Unknown word
    unknownWords.push(spelling);
  }

  return {
    sentence,
    unknownWords,
    count: unknownWords.length
  };
}

// ============================================================================
// ALTERNATIVE WORD FINDER (LEGACY)
// ============================================================================

/**
 * Finds alternative words from vocabulary that might substitute for unknown words.
 *
 * NOTE: This is a legacy function from the old repair system. The current
 * repair system uses getRelevantVocabulary() instead, which provides better
 * context-aware alternatives.
 *
 * Strategy:
 * 1. Find words sharing kanji with unknown words (semantic similarity)
 * 2. Fall back to words of similar length
 *
 * @param {string[]} unknownWords - Words that need alternatives
 * @param {string[]} vocabulary - Full vocabulary list
 * @returns {string[]} Suggested alternative words (max 10)
 *
 * @deprecated Use getRelevantVocabulary() for repair prompts instead
 */
function findAlternatives(unknownWords, vocabulary) {
  const alternatives = new Set();

  for (const unknown of unknownWords) {
    // Extract kanji characters from the unknown word
    // Kanji range: \u4e00-\u9faf (CJK Unified Ideographs)
    const kanjiChars = unknown.match(/[\u4e00-\u9faf]/g) || [];

    // Find vocab words that share at least one kanji
    for (const vocabWord of vocabulary) {
      if (alternatives.size >= CONFIG.maxAlternatives) break;

      for (const kanji of kanjiChars) {
        if (vocabWord.includes(kanji)) {
          alternatives.add(vocabWord);
          break;
        }
      }
    }

    // If no kanji matches found, try words of similar length
    if (alternatives.size < 3) {
      const targetLen = unknown.length;
      for (const vocabWord of vocabulary) {
        if (alternatives.size >= CONFIG.maxAlternatives) break;
        if (Math.abs(vocabWord.length - targetLen) <= 1) {
          alternatives.add(vocabWord);
        }
      }
    }
  }

  return Array.from(alternatives).slice(0, CONFIG.maxAlternatives);
}

// ============================================================================
// RELEVANT VOCABULARY SELECTION
// ============================================================================

/**
 * Selects a curated subset of vocabulary for the repair prompt.
 *
 * Providing ALL vocabulary to the AI would be too large and unfocused.
 * This function selects words most likely to be useful for rewriting
 * the problematic sentence.
 *
 * Selection strategy (in order of priority):
 * 1. Words sharing kanji with unknown words (semantic similarity)
 * 2. Common narrative action/description words
 * 3. Fill remaining slots with general vocabulary
 *
 * @param {string} sentence - The sentence being repaired
 * @param {string[]} unknownWords - Words that need to be replaced
 * @param {string[]} vocabulary - Full vocabulary list
 * @param {number} maxWords - Maximum words to return (default 400)
 * @returns {string[]} Curated vocabulary list for repair prompt
 *
 * @example
 * const relevant = getRelevantVocabulary(
 *   '洞窟の奥に進む。',
 *   ['洞窟'],
 *   fullVocabList,
 *   400
 * );
 * // Returns ~400 words prioritizing: words with 洞 or 窟 kanji,
 * // narrative words like 見る/行く/入る, then general vocab
 */
function getRelevantVocabulary(sentence, unknownWords, vocabulary, maxWords = 400) {
  const relevant = new Set();

  // ===== Phase 1: Kanji-sharing words (semantic similarity) =====
  // If unknown word is 洞窟 (cave), find words with 洞 or 窟
  // This helps maintain semantic coherence in repairs
  for (const unknown of unknownWords) {
    const kanjiChars = unknown.match(/[\u4e00-\u9faf]/g) || [];
    for (const vocabWord of vocabulary) {
      // Stop at half the max to leave room for other categories
      if (relevant.size >= maxWords / 2) break;
      for (const kanji of kanjiChars) {
        if (vocabWord.includes(kanji)) {
          relevant.add(vocabWord);
          break;
        }
      }
    }
  }

  // ===== Phase 2: Common narrative patterns =====
  // These kanji appear frequently in game narration (combat, exploration)
  // Adding words containing these ensures the AI has action vocabulary
  const narrativePatterns = [
    '見', '聞', '言', '思', '感',  // Perception/cognition
    '動', '来', '行', '出', '入',  // Movement
    '立', '走', '飛', '落',        // Actions
    '打', '切', '攻', '守',        // Combat
    '強', '弱', '大', '小',        // Size/strength
    '高', '低', '光', '暗',        // Height/light
    '声', '音', '目', '手',        // Body/senses
    '体', '心', '敵', '剣'         // Game concepts
  ];

  for (const vocabWord of vocabulary) {
    if (relevant.size >= maxWords) break;
    for (const pattern of narrativePatterns) {
      if (vocabWord.includes(pattern)) {
        relevant.add(vocabWord);
        break;
      }
    }
  }

  // ===== Phase 3: Fill remaining with general vocabulary =====
  // Just add more words to reach maxWords target
  for (const vocabWord of vocabulary) {
    if (relevant.size >= maxWords) break;
    relevant.add(vocabWord);
  }

  return Array.from(relevant);
}

// ============================================================================
// SENTENCE REPAIR
// ============================================================================

/**
 * Repairs a sentence that has too many unknown words.
 *
 * Uses an AI model to rewrite the sentence while:
 * 1. Preserving the original meaning (most important)
 * 2. Using only words from the user's vocabulary
 * 3. Maintaining natural Japanese grammar
 *
 * The repair prompt is written in Japanese to get better Japanese output.
 *
 * @param {string} sentence - The problematic sentence to repair
 * @param {string[]} unknownWords - List of unknown words in the sentence
 * @param {string[]} vocabulary - Full vocabulary list for alternatives
 * @param {Function} chatFn - AI chat function for rewriting
 * @returns {Promise<string>} Repaired sentence (or original if repair fails)
 *
 * @example
 * const repaired = await repairSentence(
 *   '洞窟の奥でゼリーが揺れる。',
 *   ['洞窟', 'ゼリー', '揺れる'],
 *   userVocabulary,
 *   aiChatFunction
 * );
 * // Might return: '暗い場所で何かが動く。'
 */
async function repairSentence(sentence, unknownWords, vocabulary, chatFn, debugMeta = {}) {
  const sentenceIndex = debugMeta.sentenceIndex || '?';
  const attempt = debugMeta.attempt || 1;

  // Get contextually relevant vocabulary (not random words)
  const relevantVocab = getRelevantVocabulary(sentence, unknownWords, vocabulary, 400);

  // Build repair prompt in Japanese for better output quality
  // The prompt emphasizes meaning preservation over literal word substitution
  const repairPrompt = `あなたは日本語の文を書き直す専門家です。

【元の文】
${sentence}

【問題】
この文には学習者が知らない言葉があります：${unknownWords.join('、')}

【タスク】
同じ意味を保ちながら、より簡単な言葉で文を書き直してください。

【使える言葉リスト】
${relevantVocab.join('、')}

【ルール】
1. 意味を必ず保つこと（一番大切）
2. 自然な日本語であること
3. 上のリストにある言葉だけ使う
4. 助詞（は、が、を、に、で、と、も、の）は自由に使える
5. 句読点（。！？「」）はそのまま
6. 擬音語（グルル、バシッ等）は変えてOK

書き直した文だけを出力してください：`;

  try {
    if (CONFIG.logRepairs) {
      console.log(`[VocabRepair] [S${sentenceIndex} A${attempt}] INPUT: ${sentence}`);
    }

    const startedAt = Date.now();
    // Call AI to generate repair
    let repaired = await chatFn(repairPrompt);
    const elapsedMs = Date.now() - startedAt;
    repaired = repaired.trim();

    // Remove any quotes the AI might have added around the output
    repaired = repaired.replace(/^["「『]|["」』]$/g, '');

    if (CONFIG.logRepairs) {
      console.log(`[VocabRepair] [S${sentenceIndex} A${attempt}] OUTPUT (${elapsedMs}ms): ${repaired}`);
    }

    // ===== Sanity checks to reject bad repairs =====

    // Length check: repair shouldn't be drastically different in length
    // Too short = probably lost meaning, too long = added unnecessary content
    if (repaired.length < sentence.length * 0.3 || repaired.length > sentence.length * 3) {
      console.log(`[VocabRepair] [S${sentenceIndex} A${attempt}] Repair rejected: length mismatch`);
      return sentence;
    }

    // Preserve original punctuation if repair lost it
    const origEnding = sentence.match(/[。！？」]$/);
    const repairEnding = repaired.match(/[。！？」]$/);
    if (origEnding && !repairEnding) {
      repaired += origEnding[0];
    }

    return repaired;
  } catch (error) {
    console.error(`[VocabRepair] [S${sentenceIndex} A${attempt}] Repair failed:`, error.message);
    return sentence; // Return original on any failure
  }
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Main entry point: Enforces vocabulary limit across all sentences in narration.
 *
 * This is the primary function called by the game to ensure narration
 * meets vocabulary constraints. It processes each sentence and repairs
 * those with too many unknown words.
 *
 * Pipeline for each sentence:
 * 1. Parse sentence and count unknown words
 * 2. If count <= maxUnknowns, keep sentence as-is
 * 3. If count > maxUnknowns, attempt repair
 * 4. Verify repair succeeded (re-check)
 * 5. If repair failed, retry once
 * 6. If still failed, keep original (graceful degradation)
 *
 * @param {string} narration - Full narration text to process
 * @param {string[]} vocabulary - User's known vocabulary words
 * @param {string} jpdbApiKey - JPDB API key for parsing
 * @param {Function} chatFn - AI chat function for repairs
 * @param {number} maxUnknownsPerSentence - Max unknown words allowed (default 1)
 * @param {string[]} gameTerms - Game-specific terms to allow (enemy names, etc.)
 * @returns {Promise<Object>} Result object:
 *   - narration: Final processed narration
 *   - repairs: Array of successfully repaired sentences
 *   - failures: Array of sentences that couldn't be repaired
 *
 * @example
 * const result = await enforceVocabLimit(
 *   '洞窟の奥、青いゼリーがぷるぷると揺れる。',
 *   userVocabulary,
 *   jpdbApiKey,
 *   aiChatFunction,
 *   1,
 *   ['スライム']
 * );
 * // result.narration = repaired text with ≤1 unknown per sentence
 * // result.repairs = [{ original, final, ... }]
 * // result.failures = []
 */
export async function enforceVocabLimit(
  narration,
  vocabulary,
  jpdbApiKey,
  chatFn,
  maxUnknownsPerSentence = CONFIG.maxUnknownsPerSentence,
  gameTerms = [],
  vidSet = null
) {
  // Early return if we can't process
  if (!narration || !jpdbApiKey) {
    return { narration, repairs: [], failures: [] };
  }

  // Convert arrays to Sets for O(1) lookup
  const vocabSet = new Set(vocabulary);
  const gameTermsSet = new Set(gameTerms);

  // Split into sentences for per-sentence processing
  const sentences = splitIntoSentences(narration);
  const results = [];

  // Process each sentence
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const sentenceIndex = index + 1;

    // Check current violation count
    const check = await checkSentenceViolations(sentence, vocabSet, jpdbApiKey, gameTermsSet, vidSet);

    if (check.count <= maxUnknownsPerSentence) {
      // ===== Sentence is OK - no repair needed =====
      results.push({
        original: sentence,
        final: sentence,
        repaired: false,
        unknownCount: check.count
      });
      if (CONFIG.logRepairs) {
        console.log(`[VocabRepair] [S${sentenceIndex}] FINAL (no change): ${sentence}`);
      }
    } else {
      // ===== Sentence needs repair =====
      if (CONFIG.logRepairs) {
        console.log(`[VocabRepair] Sentence has ${check.count} unknowns: "${sentence.substring(0, 40)}..."`);
        console.log(`[VocabRepair] Unknown words: ${check.unknownWords.join(', ')}`);
      }

      // First repair attempt
      let repaired = await repairSentence(
        sentence,
        check.unknownWords,
        vocabulary,
        chatFn,
        { sentenceIndex, attempt: 1 }
      );

      // Verify the repair actually fixed the violations
      const recheck = await checkSentenceViolations(repaired, vocabSet, jpdbApiKey, gameTermsSet, vidSet);

      if (recheck.count <= maxUnknownsPerSentence) {
        // ===== First repair succeeded =====
        if (CONFIG.logRepairs) {
          console.log(`[VocabRepair] Repaired: "${repaired.substring(0, 40)}..." (${recheck.count} unknowns)`);
        }
        results.push({
          original: sentence,
          final: repaired,
          repaired: true,
          unknownCount: recheck.count
        });
      } else if (CONFIG.maxRepairAttempts > 1) {
        // ===== First repair failed - try again =====
        if (CONFIG.logRepairs) {
          console.log(`[VocabRepair] First repair still has ${recheck.count} unknowns, retrying...`);
        }

        // Second attempt with the partially-repaired sentence
        repaired = await repairSentence(
          repaired,
          recheck.unknownWords,
          vocabulary,
          chatFn,
          { sentenceIndex, attempt: 2 }
        );
        const finalCheck = await checkSentenceViolations(repaired, vocabSet, jpdbApiKey, gameTermsSet, vidSet);

        if (finalCheck.count <= maxUnknownsPerSentence) {
          // Second repair succeeded
          results.push({
            original: sentence,
            final: repaired,
            repaired: true,
            unknownCount: finalCheck.count
          });
          if (CONFIG.logRepairs) {
            console.log(`[VocabRepair] [S${sentenceIndex}] FINAL (after retry): ${repaired}`);
          }
        } else {
          // ===== All repairs failed - keep original =====
          if (CONFIG.logRepairs) {
            console.log(`[VocabRepair] Repair failed after ${CONFIG.maxRepairAttempts} attempts, keeping original`);
          }
          results.push({
            original: sentence,
            final: sentence,
            repaired: false,
            failed: true,
            unknownCount: check.count
          });
          if (CONFIG.logRepairs) {
            console.log(`[VocabRepair] [S${sentenceIndex}] FINAL (fallback original): ${sentence}`);
          }
        }
      } else {
        // No retry configured - keep original
        results.push({
          original: sentence,
          final: sentence,
          repaired: false,
          failed: true,
          unknownCount: check.count
        });
        if (CONFIG.logRepairs) {
          console.log(`[VocabRepair] [S${sentenceIndex}] FINAL (fallback original): ${sentence}`);
        }
      }
    }
  }

  // Combine all processed sentences back into narration
  const finalNarration = results.map(r => r.final).join('');
  if (CONFIG.logRepairs) {
    console.log(`[VocabRepair] FINAL NARRATION: ${finalNarration}`);
  }
  return {
    narration: finalNarration,
    repairs: results.filter(r => r.repaired),
    failures: results.filter(r => r.failed)
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Named exports for individual functions
export {
  splitIntoSentences,
  checkSentenceViolations,
  findAlternatives,
  repairSentence,
  CONFIG as VOCAB_REPAIR_CONFIG,
  ALLOWED_WORDS
};

// Default export with all functions for convenience
export default {
  enforceVocabLimit,
  splitIntoSentences,
  checkSentenceViolations,
  findAlternatives,
  repairSentence,
  CONFIG: CONFIG,
  ALLOWED_WORDS
};
