/**
 * @file dialogue-word-lookup.js - Always-on word lookup for dialogue
 *
 * PURPOSE:
 * Makes every Japanese word in dialogue clickable. Tapping a word shows the
 * definition popup populated from pre-tokenized data (no API calls). Includes
 * SRS review buttons ("I forgot" / "I knew it").
 *
 * DEPENDENCIES:
 * - bootstrap-client.js: getKnownWords(), addKnownWord()
 * - api.js: reviewVocabWord()
 *
 * USAGE:
 *   import { init, attachWordClickHandlers } from './dialogue-word-lookup.js';
 *   init({ wordDictionary, showToast });
 *   // After rendering dialogue HTML into a container:
 *   attachWordClickHandlers(container);
 */

import { getKnownWords, addKnownWord } from './bootstrap-client.js';
import { reviewVocabWord } from '../api.js';

// DOM references (cached on init)
const dom = {
  popup: null,
  word: null,
  reading: null,
  pos: null,
  meanings: null,
  stateDot: null,
  stateText: null,
  stateContainer: null,
  forgotBtn: null,
  knewBtn: null,
  closeBtn: null,
};

let _wordDict = null;
let _showToast = null;
let _pauseAutoDismiss = null;
let _currentWord = null; // base form of currently displayed word

/**
 * Initialize the module. Call once after DOM is ready.
 * @param {{ wordDictionary: Map, showToast: Function, pauseAutoDismiss: Function }} options
 */
export function init({ wordDictionary, showToast, pauseAutoDismiss }) {
  _wordDict = wordDictionary;
  _showToast = showToast;
  _pauseAutoDismiss = pauseAutoDismiss;

  dom.popup = document.getElementById('lookup-popup');
  dom.word = document.getElementById('lookup-popup-word');
  dom.reading = document.getElementById('lookup-popup-reading');
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
    handleReview('again');
  });
  dom.knewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleReview('good');
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
 */
export function attachWordClickHandlers(container) {
  if (!container) return;
  const words = container.querySelectorAll('.jp-word');
  for (const span of words) {
    if (!span.dataset.base) continue;
    span.style.cursor = 'pointer';
    span.addEventListener('click', handleWordClick);
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

function handleWordClick(e) {
  e.stopPropagation();
  const span = e.currentTarget;
  const base = span.dataset.base;
  if (!base) return;

  _currentWord = base;

  // Pause auto-dismiss if active (player is exploring words)
  _pauseAutoDismiss?.();

  // Position popup near clicked word
  const rect = span.getBoundingClientRect();
  positionPopup(rect);

  // Populate from data attributes + dictionary
  const reading = span.dataset.reading || '';
  const meaning = span.dataset.meaning || '';
  const pos = span.dataset.pos || '';

  dom.word.textContent = span.textContent;
  dom.reading.textContent = reading !== span.textContent ? reading : '';
  dom.pos.textContent = pos;

  // Meanings: primary from token, additional from dictionary
  dom.meanings.innerHTML = '';
  const meanings = [];
  if (meaning) meanings.push(meaning);

  // Pull additional definitions from dictionary
  const dictEntry = _wordDict?.get(base);
  if (dictEntry?.definitions) {
    for (const def of dictEntry.definitions) {
      if (def.en && !meanings.includes(def.en)) {
        meanings.push(def.en);
      }
    }
  }

  for (const m of meanings) {
    const li = document.createElement('li');
    li.textContent = m;
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

  // Update client-side state based on grade
  if (grade === 'good') {
    addKnownWord(word);
    dom.stateDot.style.background = 'var(--status-success, #2ecc71)';
    dom.stateText.textContent = 'Known';
    _showToast?.('Marked as known');
  } else {
    dom.stateDot.style.background = 'var(--accent-orange, #e67e22)';
    dom.stateText.textContent = 'Learning';
    _showToast?.('Marked for review');
  }
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
