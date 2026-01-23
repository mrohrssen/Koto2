/**
 * Word Practice module - JPDB vocabulary review during combat
 *
 * Handles:
 * - Fetching due words from JPDB
 * - Word card display and selection
 * - Answer checking (typing mode and self-grade mode)
 * - JPDB review submission
 * - Word cache management
 */

import * as tts from './tts.js';
import * as settings from './settings.js';

// Module state
let apiSendJpdbReview = null;
let combatWords = [];           // Array of {word, meanings} objects (meanings is array)
let availableWords = [];        // Pool of words not yet shown
let selectedWordIndex = 0;      // Currently selected word (0-4)
let jpdbWordsCache = null;      // Cached JPDB due words
let jpdbWordsFetching = false;  // Prevent duplicate fetches
let recentlyReviewedVids = [];  // Track recently reviewed vids to prevent re-fetching
let selfGradeSelectedIndex = 3; // Default to "Okay"
let reviewType = 'typing';      // 'typing' or 'self-grade'

// Callbacks (set via init)
let getGameState = null;
let showToast = null;
let escapeHtml = null;
let updatePlayerHPBar = null;
let showDamageNumber = null;
let resumeCombatAfterVocab = null;
let isCombatActive = null;
let isEnemyDialogueActive = null;
let shuffleArray = null;

// API base (set via init)
let apiBase = '';

// Fallback test data for word practice (used when JPDB unavailable)
const FALLBACK_WORD_DATA = [
  { word: '食べる', meanings: ['eat'] },
  { word: '飲む', meanings: ['drink'] },
  { word: '見る', meanings: ['see', 'watch', 'look'] },
  { word: '聞く', meanings: ['hear', 'listen', 'ask'] },
  { word: '行く', meanings: ['go'] },
  { word: '来る', meanings: ['come'] },
  { word: '言う', meanings: ['say', 'tell'] },
  { word: '思う', meanings: ['think', 'feel'] },
  { word: '知る', meanings: ['know'] },
  { word: '分かる', meanings: ['understand'] },
  { word: '読む', meanings: ['read'] },
  { word: '書く', meanings: ['write'] },
  { word: '話す', meanings: ['speak', 'talk'] },
  { word: '買う', meanings: ['buy'] },
  { word: '使う', meanings: ['use'] },
  { word: '作る', meanings: ['make', 'create'] },
  { word: '待つ', meanings: ['wait'] },
  { word: '持つ', meanings: ['hold', 'have'] },
  { word: '歩く', meanings: ['walk'] },
  { word: '走る', meanings: ['run'] }
];

/**
 * Initialize the word practice module
 * @param {Object} config Configuration object
 */
export function init(config) {
  apiBase = config.apiBase || '';
  getGameState = config.getGameState;
  showToast = config.showToast;
  escapeHtml = config.escapeHtml;
  updatePlayerHPBar = config.updatePlayerHPBar;
  showDamageNumber = config.showDamageNumber;
  resumeCombatAfterVocab = config.resumeCombatAfterVocab;
  isCombatActive = config.isCombatActive;
  isEnemyDialogueActive = config.isEnemyDialogueActive;
  shuffleArray = config.shuffleArray;
  apiSendJpdbReview = config.sendJpdbReview;
}

/**
 * Set the review type
 */
export function setReviewType(type) {
  reviewType = type;
}

/**
 * Get the review type
 */
export function getReviewType() {
  return reviewType;
}

/**
 * Fetch due words from JPDB API
 */
export async function fetchJpdbDueWords() {
  if (jpdbWordsFetching) return jpdbWordsCache;
  if (jpdbWordsCache && jpdbWordsCache.length > 0) return jpdbWordsCache;

  jpdbWordsFetching = true;
  try {
    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${apiBase}/api/game/due-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // bypassCache: true fetches fresh due words directly from JPDB
      // to avoid stale local cache that may mark "due" words as "known"
      body: JSON.stringify({ limit: 50, jpdbApiKey, bypassCache: true })
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      jpdbWordsCache = data.words;
      console.log(`[WordPractice] Loaded ${data.words.length} words from JPDB (source: ${data.source})`);
      return jpdbWordsCache;
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch JPDB words:', e);
  } finally {
    jpdbWordsFetching = false;
  }
  return null;
}

/**
 * Fetch a replacement word after successful review
 */
export async function fetchReplacementWord(justReviewedVid = null) {
  try {
    const currentVids = [...combatWords, ...availableWords]
      .filter(w => w.vid)
      .map(w => w.vid);

    if (justReviewedVid) {
      recentlyReviewedVids.push(justReviewedVid);
    }
    const allExcludeVids = [...new Set([...currentVids, ...recentlyReviewedVids])];

    if (allExcludeVids.length === 0) return null;

    const { jpdbApiKey } = settings.getApiKeys();
    const response = await fetch(`${apiBase}/api/game/due-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, exclude: allExcludeVids, jpdbApiKey, bypassCache: true })
    });
    const data = await response.json();

    if (data.words && data.words.length > 0) {
      console.log(`[WordPractice] Fetched replacement word: ${data.words[0].word}`);
      return data.words[0];
    }
  } catch (e) {
    console.warn('[WordPractice] Failed to fetch replacement word:', e);
  }
  return null;
}

/**
 * Initialize word cards for combat
 */
export async function initCombatWords() {
  // Clear stale cache so we fetch fresh words each combat
  // This prevents reviewed words from reappearing
  clearWordCache();

  let wordData = await fetchJpdbDueWords();

  if (!wordData || wordData.length === 0) {
    console.log('[WordPractice] Using fallback word data');
    wordData = FALLBACK_WORD_DATA;
  }

  const shuffled = shuffleArray ? shuffleArray([...wordData]) : [...wordData];
  combatWords = shuffled.slice(0, 5);
  availableWords = shuffled.slice(5);
  selectedWordIndex = 0;
  renderWordCards();
  showWordCards();
}

/**
 * Get the next word from combat queue for flash card display
 * @returns {Object|null} Word object { word, meanings, reading, vid, sid }
 */
export function getNextCombatWord() {
  if (combatWords.length === 0) return null;
  return combatWords[selectedWordIndex] || combatWords[0];
}

/**
 * Render word cards to DOM
 */
export function renderWordCards() {
  const container = document.getElementById('word-cards');
  if (!container) return;

  if (combatWords.length === 0) {
    container.innerHTML = '<div class="word-card" style="opacity: 0.5;">All words cleared!</div>';
    return;
  }

  container.innerHTML = combatWords.map((w, i) => `
    <div class="word-card ${i === selectedWordIndex ? 'selected' : ''}" data-index="${i}">
      ${w.word}
    </div>
  `).join('');

  container.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index);
      if (!isNaN(idx)) {
        selectedWordIndex = idx;
        renderWordCards();
        openWordInputModal();
      }
    });
  });

  prefetchCombatWordAudio();
}

/**
 * Show word cards
 */
export function showWordCards() {
  document.getElementById('word-cards')?.classList.remove('hidden');
}

/**
 * Hide word cards
 */
export function hideWordCards() {
  document.getElementById('word-cards')?.classList.add('hidden');
}

/**
 * Prefetch audio for all visible combat words
 */
export function prefetchCombatWordAudio() {
  if (!tts.isWordAudioEnabled()) return;

  for (const wordData of combatWords) {
    tts.prefetchWord(wordData.word);
  }

  for (let i = 0; i < 3 && i < availableWords.length; i++) {
    tts.prefetchWord(availableWords[i].word);
  }
}

/**
 * Keyboard handler for word practice
 */
export function handleWordPracticeKeydown(e) {
  if (!isCombatActive || !isCombatActive()) return;
  if (isEnemyDialogueActive && isEnemyDialogueActive()) return;

  const typingModal = document.getElementById('word-input-modal');
  const selfGradeModal = document.getElementById('self-grade-modal');
  const typingOpen = typingModal && !typingModal.classList.contains('hidden');
  const selfGradeOpen = selfGradeModal && !selfGradeModal.classList.contains('hidden');

  if (selfGradeOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSelfGradeModal();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selfGradeSelectedIndex = Math.max(0, selfGradeSelectedIndex - 1);
      updateSelfGradeSelection();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selfGradeSelectedIndex = Math.min(4, selfGradeSelectedIndex + 1);
      updateSelfGradeSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitSelfGradeReview(selfGradeSelectedIndex + 1);
    } else {
      const gradeKey = parseInt(e.key);
      if (gradeKey >= 1 && gradeKey <= 5) {
        e.preventDefault();
        submitSelfGradeReview(gradeKey);
      }
    }
  } else if (typingOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeWordInputModal();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      checkWordAnswer();
    }
  } else {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectedWordIndex = Math.max(0, selectedWordIndex - 1);
      renderWordCards();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectedWordIndex = Math.min(combatWords.length - 1, selectedWordIndex + 1);
      renderWordCards();
    } else if (e.key === 'Enter' && combatWords.length > 0) {
      e.preventDefault();
      openWordInputModal();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      refreshWordCards();
      damagePlayerForRefresh(2);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      quickFailWord();
    }
  }
}

/**
 * Quick fail the currently selected word
 */
export function quickFailWord() {
  if (combatWords.length === 0) return;

  const word = combatWords[selectedWordIndex];
  if (!word) return;

  const meanings = word.meanings || (word.definition ? [word.definition] : []);

  tts.playWord(word.word);

  if (word.vid && word.sid) {
    sendJpdbReviewHandler(word.vid, word.sid, 1);
  }

  combatWords.splice(selectedWordIndex, 1);
  selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));

  if (availableWords.length > 0) {
    combatWords.push(availableWords.shift());
  }

  showDefinitionsReveal(word.word, meanings, word.reading);
  renderWordCards();

  console.log(`[WordPractice] Quick failed: ${word.word}`);
}

/**
 * Refresh word cards with new words from the pool
 */
export function refreshWordCards() {
  if (availableWords.length === 0) {
    console.log('[WordPractice] No more words in pool to refresh');
    return;
  }

  const newWords = [];
  for (let i = 0; i < 5 && availableWords.length > 0; i++) {
    newWords.push(availableWords.shift());
  }

  availableWords.push(...combatWords);
  combatWords = newWords;
  selectedWordIndex = 0;

  renderWordCards();
  console.log(`[WordPractice] Refreshed cards. ${availableWords.length} words remaining in pool`);
}

/**
 * Open typing modal for selected word
 */
export function openWordInputModal() {
  const word = combatWords[selectedWordIndex];
  if (!word) return;

  if (reviewType === 'self-grade') {
    openSelfGradeModal(word);
  } else {
    document.getElementById('word-to-define').textContent = word.word;
    document.getElementById('word-feedback').classList.add('hidden');
    document.getElementById('word-input-modal').classList.remove('hidden');
    document.getElementById('word-definition-input').value = '';
    document.getElementById('word-definition-input').focus();
  }
}

/**
 * Open self-grade modal
 */
export function openSelfGradeModal(word) {
  const modal = document.getElementById('self-grade-modal');
  const wordEl = document.getElementById('self-grade-word');
  const meaningsList = document.getElementById('self-grade-meanings');

  const escape = escapeHtml || (s => s);

  if (word.reading && word.reading !== word.word) {
    wordEl.innerHTML = `<ruby>${escape(word.word)}<rt>${escape(word.reading)}</rt></ruby>`;
  } else {
    wordEl.textContent = word.word;
  }

  const meanings = word.meanings || [word.definition];
  meaningsList.innerHTML = meanings.slice(0, 5).map(m => `<li>${escape(m)}</li>`).join('');

  selfGradeSelectedIndex = 3;
  updateSelfGradeSelection();

  modal.classList.remove('hidden', 'fading');
}

/**
 * Close self-grade modal
 */
export function closeSelfGradeModal() {
  document.getElementById('self-grade-modal').classList.add('hidden');
}

/**
 * Update self-grade selection
 */
export function updateSelfGradeSelection() {
  const buttons = document.querySelectorAll('#self-grade-modal .review-btn');
  buttons.forEach((btn, i) => {
    btn.classList.toggle('selected', i === selfGradeSelectedIndex);
  });
}

/**
 * Close word input modal
 */
export function closeWordInputModal() {
  document.getElementById('word-input-modal').classList.add('hidden');
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Normalize meaning for comparison
 */
function normalizeMeaning(meaning) {
  return meaning
    .toLowerCase()
    .replace(/^to\s+/, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}

/**
 * Send JPDB review and remove word from cache
 */
async function sendJpdbReviewHandler(vid, sid, grade) {
  const result = await apiSendJpdbReview(vid, sid, grade);
  if (!result.error) {
    console.log(`[JPDB] Review sent: vid=${vid}, grade=${grade}`);
    removeWordFromCache(vid);
  } else {
    console.warn('[JPDB] Review failed:', result.error);
  }
}

/**
 * Remove a word from all caches by vid
 */
export function removeWordFromCache(vid) {
  if (jpdbWordsCache) {
    const cacheIndex = jpdbWordsCache.findIndex(w => w.vid === vid);
    if (cacheIndex !== -1) {
      jpdbWordsCache.splice(cacheIndex, 1);
      console.log(`[WordPractice] Removed vid=${vid} from cache. ${jpdbWordsCache.length} words remaining in cache.`);
    }
  }
  const availIndex = availableWords.findIndex(w => w.vid === vid);
  if (availIndex !== -1) {
    availableWords.splice(availIndex, 1);
  }
}

/**
 * Clear word cache to force fresh fetch
 */
export function clearWordCache() {
  jpdbWordsCache = null;
  jpdbWordsFetching = false;
  recentlyReviewedVids = [];
  console.log('[WordPractice] Cache cleared - will fetch fresh words on next combat');
}

/**
 * Multi-tier answer checking
 */
function checkAnswerMatch(input, meanings) {
  const normalized = normalizeMeaning(input.trim().toLowerCase());
  if (!normalized) return { correct: false };

  const MIN_LENGTH_FOR_PARTIAL = 3;
  const normalizedMeanings = meanings.map(normalizeMeaning);

  // Tier 1: Exact match
  if (normalizedMeanings.some(m => m === normalized)) {
    return { correct: true, confidence: 'exact' };
  }

  // Tier 2: Contains match
  if (normalized.length >= MIN_LENGTH_FOR_PARTIAL &&
      normalizedMeanings.some(m => m.includes(normalized))) {
    return { correct: true, confidence: 'partial' };
  }

  // Tier 3: Word match
  const meaningWords = normalizedMeanings.flatMap(m =>
    m.split(/[\s,;]+/).filter(w => w.length > 0)
  );
  if (meaningWords.includes(normalized)) {
    return { correct: true, confidence: 'word' };
  }

  // Tier 4: Fuzzy match
  if (normalized.length >= MIN_LENGTH_FOR_PARTIAL) {
    for (const meaning of normalizedMeanings) {
      const maxDistance = meaning.length < 6 ? 1 : 2;
      if (levenshteinDistance(normalized, meaning) <= maxDistance) {
        return { correct: true, confidence: 'fuzzy' };
      }
      for (const word of meaning.split(/[\s,;]+/)) {
        if (word.length >= 4 && levenshteinDistance(normalized, word) <= 1) {
          return { correct: true, confidence: 'fuzzy' };
        }
      }
    }
  }

  return { correct: false };
}

/**
 * Check answer
 */
export function checkWordAnswer() {
  const input = document.getElementById('word-definition-input').value.trim().toLowerCase();
  const word = combatWords[selectedWordIndex];

  if (!word || input.length === 0) {
    showWordFeedback('Please enter an answer!', 'error');
    return;
  }

  const meanings = word.meanings || (word.definition ? [word.definition] : []);
  const result = checkAnswerMatch(input, meanings);

  tts.playWord(word.word);

  if (result.correct) {
    showWordFeedback(`Correct!`, 'success');

    if (word.vid && word.sid) {
      sendJpdbReviewHandler(word.vid, word.sid, 4);
      availableWords = availableWords.filter(w => w.vid !== word.vid);
      fetchReplacementWord(word.vid).then(newWord => {
        if (newWord) availableWords.push(newWord);
      });
    }

    if (availableWords.length > 0) {
      const newWord = availableWords.shift();
      combatWords[selectedWordIndex] = newWord;
    } else {
      combatWords.splice(selectedWordIndex, 1);
      selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));
    }

    setTimeout(() => {
      closeWordInputModal();
      showDefinitionsReveal(word.word, meanings, word.reading);
      renderWordCards();
      if (resumeCombatAfterVocab) resumeCombatAfterVocab();
    }, 800);
  } else {
    showWordFeedback('Incorrect!', 'error');

    if (word.vid && word.sid) {
      sendJpdbReviewHandler(word.vid, word.sid, 1);
      availableWords = availableWords.filter(w => w.vid !== word.vid);
      recentlyReviewedVids.push(word.vid);
      fetchReplacementWord(word.vid).then(newWord => {
        if (newWord) availableWords.push(newWord);
      });
    }

    combatWords.splice(selectedWordIndex, 1);
    selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));

    if (availableWords.length > 0) {
      combatWords.push(availableWords.shift());
    }

    setTimeout(() => {
      closeWordInputModal();
      showDefinitionsReveal(word.word, meanings, word.reading);
      renderWordCards();
      if (resumeCombatAfterVocab) resumeCombatAfterVocab();
    }, 300);
  }
}

/**
 * Submit self-grade review
 */
export function submitSelfGradeReview(grade) {
  const word = combatWords[selectedWordIndex];
  if (!word) return;

  const gradeNames = ['', 'Nothing', 'Something', 'Hard', 'Okay', 'Easy'];
  const isPass = grade >= 3;

  closeSelfGradeModal();
  tts.playWord(word.word);

  if (word.vid && word.sid) {
    sendJpdbReviewHandler(word.vid, word.sid, grade);
    availableWords = availableWords.filter(w => w.vid !== word.vid);
    recentlyReviewedVids.push(word.vid);
    fetchReplacementWord(word.vid).then(newWord => {
      if (newWord) availableWords.push(newWord);
    });
  }

  if (isPass) {
    if (showToast) showToast(`${gradeNames[grade]}!`, 'success');
    if (availableWords.length > 0) {
      combatWords[selectedWordIndex] = availableWords.shift();
    } else {
      combatWords.splice(selectedWordIndex, 1);
      selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));
    }
  } else {
    if (showToast) showToast(`${gradeNames[grade]}`, 'error');
    combatWords.splice(selectedWordIndex, 1);
    selectedWordIndex = Math.min(selectedWordIndex, Math.max(0, combatWords.length - 1));
    if (availableWords.length > 0) {
      combatWords.push(availableWords.shift());
    }
  }

  renderWordCards();
  if (resumeCombatAfterVocab) resumeCombatAfterVocab();
}

/**
 * Show feedback in modal
 */
export function showWordFeedback(message, type) {
  const feedback = document.getElementById('word-feedback');
  feedback.textContent = message;
  feedback.className = `word-feedback ${type}`;
  feedback.classList.remove('hidden');
}

/**
 * Show definitions reveal modal
 */
export function showDefinitionsReveal(word, meanings, reading = null) {
  const modal = document.getElementById('definitions-reveal');
  const wordEl = document.getElementById('definitions-word');
  const listEl = document.getElementById('definitions-list');

  if (!modal || !wordEl || !listEl) return;

  const escape = escapeHtml || (s => s);

  if (reading && reading !== word) {
    wordEl.innerHTML = `<ruby>${escape(word)}<rt>${escape(reading)}</rt></ruby>`;
  } else {
    wordEl.textContent = word;
  }

  const top5 = meanings.slice(0, 5);
  listEl.innerHTML = top5.map(m => `<li>${escape(m)}</li>`).join('');

  modal.classList.remove('fading', 'hidden');

  setTimeout(() => {
    modal.classList.add('fading');
    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('fading');
    }, 500);
  }, 3000);
}

/**
 * Heal player from correct word answer
 */
export function healPlayerFromWord(amount) {
  const gameState = getGameState ? getGameState() : {};
  if (!gameState.player && !gameState.run?.player) return;

  const player = gameState.run?.player || gameState.player;
  const maxHp = player.maxHp || 100;
  const currentHp = player.hp || 0;
  const newHp = Math.min(currentHp + amount, maxHp);

  player.hp = newHp;
  if (gameState.player) gameState.player.hp = newHp;

  if (updatePlayerHPBar) updatePlayerHPBar({ current: newHp, max: maxHp });
  if (showDamageNumber) showDamageNumber(amount, true, false, true);

  fetch(`${apiBase}/api/game/heal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  }).catch(err => console.warn('Heal sync failed:', err));
}

/**
 * Damage player for refreshing word cards
 */
export function damagePlayerForRefresh(amount) {
  const gameState = getGameState ? getGameState() : {};
  if (!gameState.player && !gameState.run?.player) return;

  const player = gameState.run?.player || gameState.player;
  const maxHp = player.maxHp || 100;
  const currentHp = player.hp || 0;
  const newHp = Math.max(1, currentHp - amount);

  player.hp = newHp;
  if (gameState.player) gameState.player.hp = newHp;

  if (updatePlayerHPBar) updatePlayerHPBar({ current: newHp, max: maxHp });
  if (showDamageNumber) showDamageNumber(amount, true, false, false);

  fetch(`${apiBase}/api/game/damage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  }).catch(err => console.warn('Damage sync failed:', err));
}

/**
 * Get combat words count
 */
export function getCombatWordsCount() {
  return combatWords.length;
}

/**
 * Get selected word index
 */
export function getSelectedWordIndex() {
  return selectedWordIndex;
}
