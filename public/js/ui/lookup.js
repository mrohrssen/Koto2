/**
 * lookup.js - Lookup mode for clicking Japanese words to see definitions
 *
 * USAGE:
 *   import * as lookup from './js/ui/lookup.js';
 *   lookup.init({ showToast, parseText, lookupWord });
 *   // Toggle via button click
 */

import { dom } from '../dom.js';

let isActive = false;
let isLoading = false;
let originalTextMap = new WeakMap(); // Store original text per element
let api = {
  parseText: null,
  lookupWord: null,
  showToast: null,
  hasJpdbKey: null
};

const TEXT_SELECTORS = [
  '#narration-text',
  '#enemy-name'
  // NOTE: Explicitly NOT including flashcards (.flash-card-front, .flash-card-word)
  // because looking up words during vocabulary practice is cheating!
];

/** Initialize lookup module with callbacks */
export function init(callbacks) {
  api.parseText = callbacks.parseText;
  api.lookupWord = callbacks.lookupWord;
  api.showToast = callbacks.showToast;
  api.hasJpdbKey = callbacks.hasJpdbKey;

  // Button click toggles mode (stopPropagation prevents dismissing narration)
  dom.lookupBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  // Popup close button
  dom.lookupPopupClose?.addEventListener('click', hidePopup);

  // Click outside popup closes it
  document.addEventListener('click', (e) => {
    if (!dom.lookupPopup?.contains(e.target) &&
        !e.target.classList.contains('lookup-word')) {
      hidePopup();
    }
  });
}

/** Check if lookup mode is active */
export function getActive() {
  return isActive;
}

/** Toggle lookup mode on/off */
export async function toggle() {
  if (isLoading) return;

  if (isActive) {
    deactivate();
  } else {
    await activate();
  }
}

/** Activate lookup mode */
async function activate() {
  // Check for JPDB API key
  if (api.hasJpdbKey && !api.hasJpdbKey()) {
    api.showToast?.('Set JPDB API key in settings to use lookup');
    return;
  }

  isLoading = true;
  dom.lookupBtn?.classList.add('lookup-loading');

  try {
    // Gather all text to parse
    const elements = getTextElements();
    const textToElements = new Map();

    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.length > 0) {
        if (!textToElements.has(text)) {
          textToElements.set(text, []);
        }
        textToElements.get(text).push(el);
        originalTextMap.set(el, el.innerHTML);
      }
    }

    // Parse all unique texts
    const allText = Array.from(textToElements.keys()).join('\n');
    if (!allText) {
      api.showToast?.('No text to parse');
      isLoading = false;
      dom.lookupBtn?.classList.remove('lookup-loading');
      return;
    }

    const result = await api.parseText(allText);

    if (result.error) {
      api.showToast?.('Couldn\'t parse text. Try again.');
      isLoading = false;
      dom.lookupBtn?.classList.remove('lookup-loading');
      return;
    }

    // Apply parsed tokens to elements
    applyTokensToElements(result.tokens, textToElements);

    isActive = true;
    dom.lookupBtn?.classList.remove('lookup-loading');
    dom.lookupBtn?.classList.add('lookup-active');

  } catch (err) {
    console.error('Lookup activation failed:', err);
    api.showToast?.('Couldn\'t parse text. Try again.');
    isLoading = false;
    dom.lookupBtn?.classList.remove('lookup-loading');
  }

  isLoading = false;
}

/** Deactivate lookup mode */
function deactivate() {
  isActive = false;
  dom.lookupBtn?.classList.remove('lookup-active');
  hidePopup();

  // Restore original text
  const elements = getTextElements();
  for (const el of elements) {
    const original = originalTextMap.get(el);
    if (original !== undefined) {
      el.innerHTML = original;
    }
  }
  originalTextMap = new WeakMap();
}

/** Get all text elements to parse */
function getTextElements() {
  const elements = [];
  for (const selector of TEXT_SELECTORS) {
    elements.push(...document.querySelectorAll(selector));
  }
  return elements;
}

/** Apply parsed tokens to text elements */
function applyTokensToElements(tokens, textToElements) {
  // Group tokens by their source text line
  // Tokens come in order, we need to match them back to elements
  for (const [text, elements] of textToElements) {
    const html = buildHtmlFromTokens(tokens, text);
    for (const el of elements) {
      el.innerHTML = html;
      // Add click handlers to lookup words
      el.querySelectorAll('.lookup-word').forEach(span => {
        span.addEventListener('click', handleWordClick);
      });
    }
  }
}

/** Build HTML string from tokens matching a specific text */
function buildHtmlFromTokens(tokens, targetText) {
  let html = '';
  let textIndex = 0;

  for (const token of tokens) {
    const spelling = token.spelling || token.text || '';

    // Skip if this token isn't part of our target text
    const idx = targetText.indexOf(spelling, textIndex);
    if (idx === -1) continue;

    // Add any skipped characters as plain text
    if (idx > textIndex) {
      html += escapeHtml(targetText.substring(textIndex, idx));
    }

    // Add the token
    if (token.vid && token.sid !== undefined) {
      // Lookupable word
      html += `<span class="lookup-word" data-vid="${token.vid}" data-sid="${token.sid}">${escapeHtml(spelling)}</span>`;
    } else {
      // Not lookupable (punctuation, particles without vid)
      html += escapeHtml(spelling);
    }

    textIndex = idx + spelling.length;
  }

  // Add any remaining text
  if (textIndex < targetText.length) {
    html += escapeHtml(targetText.substring(textIndex));
  }

  return html || escapeHtml(targetText);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Handle click on a lookup word */
async function handleWordClick(e) {
  e.stopPropagation();
  const span = e.target;
  const vid = parseInt(span.dataset.vid, 10);
  const sid = parseInt(span.dataset.sid, 10);

  if (isNaN(vid) || isNaN(sid)) return;

  // Position popup near clicked word
  const rect = span.getBoundingClientRect();
  positionPopup(rect);

  // Show loading state
  dom.lookupPopupWord.textContent = span.textContent;
  dom.lookupPopupReading.textContent = '';
  dom.lookupPopupPos.textContent = 'Loading...';
  dom.lookupPopupMeanings.innerHTML = '';
  dom.lookupPopupState.style.display = 'none';
  dom.lookupPopup?.classList.add('visible');

  // Fetch definition
  const result = await api.lookupWord(vid, sid);

  if (result.error) {
    dom.lookupPopupPos.textContent = 'Couldn\'t load definition';
    return;
  }

  // Populate popup
  dom.lookupPopupWord.textContent = result.spelling || span.textContent;
  dom.lookupPopupReading.textContent = result.reading || '';
  dom.lookupPopupPos.textContent = result.partOfSpeech?.join(', ') || '';

  // Meanings list
  dom.lookupPopupMeanings.innerHTML = '';
  const meanings = result.meanings || [];
  for (const meaning of meanings.slice(0, 5)) {
    const li = document.createElement('li');
    li.textContent = meaning;
    dom.lookupPopupMeanings.appendChild(li);
  }

  // Card state
  const state = result.cardState?.[0] || 'never-looked-up';
  const stateLabels = {
    'new': 'New',
    'learning': 'Learning',
    'known': 'Known',
    'due': 'Due for review',
    'never-looked-up': 'Never looked up'
  };
  dom.lookupStateDot.className = `lookup-state-dot ${state}`;
  dom.lookupStateText.textContent = stateLabels[state] || state;
  dom.lookupPopupState.style.display = 'flex';
}

/** Position popup near clicked word */
function positionPopup(wordRect) {
  const popup = dom.lookupPopup;
  if (!popup) return;

  // Reset position to measure
  popup.style.left = '0';
  popup.style.top = '0';
  popup.classList.add('visible');

  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal: center on word, but keep within viewport
  let left = wordRect.left + (wordRect.width / 2) - (popupRect.width / 2);
  left = Math.max(8, Math.min(left, viewportWidth - popupRect.width - 8));

  // Vertical: prefer above word, flip below if not enough space
  let top;
  const spaceAbove = wordRect.top;
  const spaceBelow = viewportHeight - wordRect.bottom;

  if (spaceAbove >= popupRect.height + 8) {
    top = wordRect.top - popupRect.height - 8;
  } else if (spaceBelow >= popupRect.height + 8) {
    top = wordRect.bottom + 8;
  } else {
    // Not enough space either way, position at top of viewport
    top = 8;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/** Hide the lookup popup */
function hidePopup() {
  dom.lookupPopup?.classList.remove('visible');
}

/** Re-parse text when content changes (for navigation) */
export async function refresh() {
  if (!isActive) return;
  // Deactivate and reactivate to re-parse
  deactivate();
  await activate();
}
