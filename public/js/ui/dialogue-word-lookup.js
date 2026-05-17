import { getKnownWords, addKnownWord } from './bootstrap-client.js';
import { reviewVocabWord } from '../api.js';
import { showWordLevelUp } from './word-level-up.js';
import { buildHeadwordRuby } from './romaji.js';
import { playDialogueWordAudio } from '../tts.js';

// DOM references (cached on init)
const dom = {
  popup: null,
  word: null,
  pos: null,
  meanings: null,
  stateDot: null,
  stateText: null,
  stateContainer: null,
  forgotBtn: null,
  knewBtn: null,
  closeBtn: null,
};

let _showToast = null;
let _pauseAutoDismiss = null;
let _currentWord = null; // base form of currently displayed word
let _currentReading = null; // hiragana reading of current word
let _getKanaMode = null; // () => boolean, injected via init
let _onStateUpdate = null; // optional callback for review reward state

/**
 * Build the ordered meaning list for the popup.
 *  - Override (when data-override="1") goes first, flagged contextual.
 *  - Dict definitions follow, in order.
 *  - Duplicates suppressed by exact string match.
 *
 * Exported for unit testing without a DOM.
 */
export function buildPopupMeanings({ dataMeaning, dataOverride, dictEntry }) {
  const result = [];
  const seen = new Set();

  if (dataOverride === '1' && dataMeaning) {
    result.push({ text: dataMeaning, contextual: true });
    seen.add(dataMeaning);
  }

  if (dictEntry?.definitions) {
    for (const def of dictEntry.definitions) {
      if (def.en && !seen.has(def.en)) {
        result.push({ text: def.en, contextual: false });
        seen.add(def.en);
      }
    }
  }

  return result;
}

/**
 * Initialize the module. Call once after DOM is ready.
 * @param {{ showToast: Function, pauseAutoDismiss: Function, getKanaMode: Function, onStateUpdate?: Function }} options
 */
export function init({ showToast, pauseAutoDismiss, getKanaMode, onStateUpdate }) {
  _showToast = showToast;
  _pauseAutoDismiss = pauseAutoDismiss;
  _getKanaMode = getKanaMode || null;
  _onStateUpdate = typeof onStateUpdate === 'function' ? onStateUpdate : null;

  dom.popup = document.getElementById('lookup-popup');
  dom.word = document.getElementById('lookup-popup-word');
  dom.pos = document.getElementById('lookup-popup-pos');
  dom.meanings = document.getElementById('lookup-popup-meanings');
  dom.stateDot = document.getElementById('lookup-state-dot');
  dom.stateText = document.getElementById('lookup-state-text');
  dom.stateContainer = document.getElementById('lookup-popup-state');
  dom.forgotBtn = document.getElementById('lookup-action-forgot');
  dom.knewBtn = document.getElementById('lookup-action-knew');
  dom.closeBtn = document.getElementById('lookup-popup-close');

  // Button handlers
  dom.forgotBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    return handleReview('again');
  });
  dom.knewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    return handleReview('good');
  });
  dom.closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePopup();
  });

  // Click outside popup (but inside narration box) closes popup
  document.addEventListener('click', (e) => {
    if (!dom.popup?.classList.contains('visible')) return;
    if (dom.popup.contains(e.target)) return;
    hidePopup();
  }, true);
}

/**
 * Attach click handlers to all .jp-word spans inside a container.
 * Call after rendering dialogue HTML into the narration text element.
 * @param {HTMLElement} container
 * @param {{ wordAudio?: { speakerId: number } }} options
 */
export function attachWordClickHandlers(container, options = {}) {
  if (!container) return;
  const words = container.querySelectorAll('.jp-word');
  for (const span of words) {
    if (!span.dataset.base) continue;
    span.style.cursor = 'pointer';
    span.addEventListener('click', (event) => handleWordClick(event, options.wordAudio));
  }
}

/** Hide the popup */
export function hidePopup() {
  dom.popup?.classList.remove('visible');
  _currentWord = null;
}

/** Check if popup is visible */
export function isPopupVisible() {
  return dom.popup?.classList.contains('visible') ?? false;
}

function handleWordClick(e, wordAudio = null) {
  e.stopPropagation();
  const span = e.currentTarget;
  const base = span.dataset.base;
  if (!base) return;

  _currentWord = base;
  _currentReading = span.dataset.reading || null;

  if (Number.isFinite(Number(wordAudio?.speakerId))) {
    playDialogueWordAudio({
      word: span.dataset.audioText || base,
      speakerId: Number(wordAudio.speakerId)
    });
  }

  // Pause auto-dismiss if active (player is exploring words)
  _pauseAutoDismiss?.();

  // Position popup near clicked word
  const rect = span.getBoundingClientRect();
  positionPopup(rect);

  // Populate from data attributes + dictionary
  const reading = span.dataset.reading || '';
  const meaning = span.dataset.meaning || '';
  const pos = span.dataset.pos || '';

  const useKanji = span.dataset.kanjiMode === '1';
  dom.word.innerHTML = buildHeadwordRuby(base, reading, useKanji);
  dom.pos.textContent = pos;

  // Meanings: override (labeled "In this context") + dict definitions
  dom.meanings.innerHTML = '';
  let dictEntry = null;
  if (span.dataset.meanings) {
    try {
      dictEntry = { definitions: JSON.parse(span.dataset.meanings) };
    } catch {
      dictEntry = null;
    }
  }
  const meanings = buildPopupMeanings({
    dataMeaning: meaning,
    dataOverride: span.dataset.override || null,
    dictEntry,
  });

  for (const m of meanings) {
    const li = document.createElement('li');
    if (m.contextual) {
      li.className = 'contextual-meaning';
      const em = document.createElement('em');
      em.textContent = 'In this context: ';
      li.appendChild(em);
      li.appendChild(document.createTextNode(m.text));
    } else {
      li.textContent = m.text;
    }
    dom.meanings.appendChild(li);
  }

  // SRS state
  const isKnown = getKnownWords().has(base);
  const stateLabel = isKnown ? 'Known' : 'New';
  const stateColor = isKnown ? 'var(--status-success, #2ecc71)' : 'var(--text-secondary, #999)';
  dom.stateDot.style.background = stateColor;
  dom.stateText.textContent = stateLabel;
  dom.stateContainer.style.display = 'flex';

  dom.popup.classList.add('visible');
}

async function handleReview(grade) {
  if (!_currentWord) return;

  const word = _currentWord;
  const result = await reviewVocabWord(word, grade);
  if (!result?.ok) {
    _showToast?.('Review failed');
    return;
  }

  // Update client-side state based on grade.
  if (grade === 'good') {
    addKnownWord(word);
    dom.stateDot.style.background = 'var(--status-success, #2ecc71)';
    dom.stateText.textContent = 'Known';
    _showToast?.('Marked as known');

    const kana = _getKanaMode?.() ?? false;
    const displayWord = kana && _currentReading ? _currentReading : word;
    showWordLevelUp(dom.popup, displayWord);
  } else {
    dom.stateDot.style.background = 'var(--accent-orange, #e67e22)';
    dom.stateText.textContent = 'Learning';
    _showToast?.('Marked for review');
  }

  if (result.state) {
    _onStateUpdate?.(result.state);
  }

  if (result.fusionCoreDrop?.awarded) {
    showWordLevelUp(dom.popup || document.body, '', {
      message: result.fusionCoreDrop.message || 'Obtained 1x Fusion Core!'
    });
  }

  hidePopup();
}

/**
 * Position popup near a word rect.
 * Extracted from lookup.js:466 positioning logic.
 */
function positionPopup(wordRect) {
  const popup = dom.popup;
  if (!popup) return;

  // Reset to measure
  popup.style.left = '0';
  popup.style.top = '0';
  popup.classList.add('visible');

  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal: center on word, keep within viewport
  let left = wordRect.left + (wordRect.width / 2) - (popupRect.width / 2);
  left = Math.max(8, Math.min(left, viewportWidth - popupRect.width - 8));

  // Vertical: prefer above, flip below if not enough space
  let top;
  const spaceAbove = wordRect.top;
  const spaceBelow = viewportHeight - wordRect.bottom;

  if (spaceAbove >= popupRect.height + 8) {
    top = wordRect.top - popupRect.height - 8;
  } else if (spaceBelow >= popupRect.height + 8) {
    top = wordRect.bottom + 8;
  } else {
    top = 8;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
