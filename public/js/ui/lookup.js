/**
 * @file lookup.js - Japanese Word Lookup Mode
 *
 * PURPOSE:
 * Provides tap-to-lookup functionality for Japanese text. When activated,
 * parses all visible Japanese text via JPDB API, wraps words in clickable
 * spans, and shows definition popups on tap. Integrates with JPDB vocabulary
 * states (new, learning, known, due).
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with API functions and toast display
 * - getActive(): Check if lookup mode is currently active
 * - toggle(): Activate or deactivate lookup mode
 * - refresh(): Re-parse text after content changes
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (lookupBtn, lookupPopup elements)
 * - API callbacks: parseText, lookupWord, lookupBatch, hasJpdbKey
 *
 * BEHAVIOR:
 * - Activation: Gathers Japanese text, sends to JPDB for parsing
 * - Prefetches definitions in background for instant display
 * - Popup shows: word, reading, part of speech, meanings, JPDB card state
 * - Blocks game clicks while active (prevents accidental progression)
 * - BLOCKED_SELECTORS prevent parsing quiz answers and flash cards (anti-cheat)
 */

import { dom } from '../dom.js';

let isActive = false;
let isLoading = false;
let originalTextMap = new WeakMap(); // Store original text per element
let definitionCache = new Map(); // Cache prefetched definitions: "vid:sid" -> definition
let api = {
  parseText: null,
  lookupWord: null,
  lookupBatch: null,
  showToast: null,
  hasJpdbKey: null
};

// Selectors to EXCLUDE from parsing (cheating prevention + UI elements)
const BLOCKED_SELECTORS = [
  '.quiz-answer-option',  // Quiz answers - no cheating!
  '.flash-card',          // Flashcards - no cheating!
  '.mini-toolbar',        // Toolbar buttons
  '.lookup-popup',        // The lookup popup itself
  'button',               // All buttons
  'script',               // Script tags
  'style',                // Style tags
];

/** Check if text contains Japanese characters */
function hasJapanese(text) {
  // Match hiragana, katakana, or kanji
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/** Block game clicks when lookup mode is active */
function blockGameClicks(e) {
  // Special case: clicking lookup button to ACTIVATE
  // We must handle this here (document capture) to block narration dismiss
  // before it fires, then trigger activation ourselves
  if (!isActive && !isLoading && dom.lookupBtn?.contains(e.target)) {
    e.stopImmediatePropagation(); // Block narration dismiss handler
    e.preventDefault();
    toggle(); // Activate lookup mode
    return;
  }

  if (!isActive) return;

  // Allow clicks on: lookup button (to deactivate), popup, popup close
  if (dom.lookupBtn?.contains(e.target)) return;
  if (dom.lookupPopup?.contains(e.target)) return;

  // Allow clicks on lookup words (they have their own handler)
  if (e.target.classList.contains('lookup-word')) return;

  // Block everything else - stopImmediatePropagation stops other document handlers too
  e.stopImmediatePropagation();
  e.preventDefault();
}

/** Initialize lookup module with callbacks */
export function init(callbacks) {
  api.parseText = callbacks.parseText;
  api.lookupWord = callbacks.lookupWord;
  api.lookupBatch = callbacks.lookupBatch;
  api.showToast = callbacks.showToast;
  api.hasJpdbKey = callbacks.hasJpdbKey;

  // Block game clicks when lookup mode is active (capture phase runs first)
  // Also handles activation clicks on the lookup button (see blockGameClicks)
  document.addEventListener('click', blockGameClicks, true);

  // Button click to DEACTIVATE (activation is handled in blockGameClicks)
  dom.lookupBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isActive) {
      toggle(); // Deactivate
    }
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

  // Clear any residual transform on .game-app (e.g. from screen shake)
  // so that position:fixed popup is positioned relative to viewport, not the container
  const gameApp = document.querySelector('.game-app');
  if (gameApp) gameApp.style.transform = '';

  isLoading = true;
  definitionCache.clear();
  dom.lookupBtn?.classList.add('lookup-loading');

  try {
    // Gather all text elements to parse
    const elements = getTextElements();
    const elementsToProcess = [];

    for (const el of elements) {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && hasJapanese(text)) {
        originalTextMap.set(el, el.innerHTML);
        elementsToProcess.push({ el, text });
      }
    }

    if (elementsToProcess.length === 0) {
      api.showToast?.('No Japanese text to parse');
      isLoading = false;
      dom.lookupBtn?.classList.remove('lookup-loading');
      return;
    }

    // Collect all vocab IDs for prefetching
    const vocabToFetch = new Map(); // "vid:sid" -> [vid, sid]

    // Parse each text element SEPARATELY to avoid JPDB confusion with mixed languages
    for (const { el, text } of elementsToProcess) {
      const result = await api.parseText(text);

      if (result.error || !result.tokens) {
        continue; // Skip this element but continue with others
      }

      // Collect vocab IDs from tokens
      for (const token of result.tokens) {
        if (token.vid && token.sid !== undefined) {
          const key = `${token.vid}:${token.sid}`;
          if (!vocabToFetch.has(key)) {
            vocabToFetch.set(key, [token.vid, token.sid]);
          }
        }
      }

      // Apply tokens to this element
      const html = buildHtmlFromTokens(result.tokens, text);
      el.innerHTML = html;
      el.querySelectorAll('.lookup-word').forEach(span => {
        span.addEventListener('click', handleWordClick);
      });
    }

    isActive = true;
    dom.lookupBtn?.classList.remove('lookup-loading');
    dom.lookupBtn?.classList.add('lookup-active');

    // Prefetch definitions in the background (don't await)
    if (api.lookupBatch && vocabToFetch.size > 0) {
      const vocabList = Array.from(vocabToFetch.values());
      api.lookupBatch(vocabList).then(definitions => {
        for (const [key, def] of Object.entries(definitions)) {
          definitionCache.set(key, def);
        }
      }).catch(err => {
        console.warn('Definition prefetch failed:', err);
      });
    }

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
  definitionCache.clear();

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

/** Get all elements containing Japanese text to parse */
function getTextElements() {
  const elements = new Set();

  // Search in .game-app
  const gameApp = document.querySelector('.game-app');
  if (gameApp) {
    findJapaneseTextElements(gameApp, elements);
  }

  // Also search in visible takeovers (chip modals, etc.)
  const takeovers = document.querySelectorAll('.takeover.visible');
  for (const takeover of takeovers) {
    findJapaneseTextElements(takeover, elements);
  }

  // Also search in chip popup when visible
  const chipPopup = document.querySelector('.chip-popup.visible');
  if (chipPopup) {
    findJapaneseTextElements(chipPopup, elements);
  }

  return Array.from(elements);
}

/** Find Japanese text elements within a root container */
function findJapaneseTextElements(root, elements) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const text = node.textContent?.trim();
        if (!text || !hasJapanese(text)) return NodeFilter.FILTER_REJECT;

        // Skip if inside blocked element
        for (const selector of BLOCKED_SELECTORS) {
          if (node.parentElement?.closest(selector)) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  // Collect the immediate parent elements of Japanese text nodes
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (parent && !elements.has(parent)) {
      // Only add leaf elements (elements whose only content is this text)
      // This prevents parsing container divs that would duplicate text
      const hasOnlyTextContent = Array.from(parent.childNodes).every(
        child => child.nodeType === Node.TEXT_NODE ||
                 (child.nodeType === Node.ELEMENT_NODE && child.classList?.contains('lookup-word'))
      );
      if (hasOnlyTextContent) {
        elements.add(parent);
      }
    }
  }
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

/** Try to find token in text, handling punctuation variations */
function findTokenInText(spelling, text, startIndex) {
  // Try exact match first
  let idx = text.indexOf(spelling, startIndex);
  if (idx !== -1) return { idx, length: spelling.length };

  // Try with punctuation variations
  const variations = [
    [/\.\.\./g, '…'],  // three dots → ellipsis
    [/…/g, '...'],     // ellipsis → three dots
    [/　/g, ' '],      // full-width space → space
    [/ /g, '　'],      // space → full-width space
  ];

  for (const [pattern, replacement] of variations) {
    const altSpelling = spelling.replace(pattern, replacement);
    if (altSpelling !== spelling) {
      idx = text.indexOf(altSpelling, startIndex);
      if (idx !== -1) return { idx, length: altSpelling.length };
    }
  }

  return null;
}

/** Build HTML string from tokens matching a specific text */
function buildHtmlFromTokens(tokens, targetText) {
  let html = '';
  let textIndex = 0;

  for (const token of tokens) {
    const spelling = token.spelling || token.text || '';

    // Find token in text (with fallback for punctuation variations)
    const match = findTokenInText(spelling, targetText, textIndex);
    if (!match) continue;

    const { idx, length } = match;

    // Add any skipped characters as plain text
    if (idx > textIndex) {
      html += escapeHtml(targetText.substring(textIndex, idx));
    }

    // Get the actual text from the original (preserves original punctuation)
    const originalSpelling = targetText.substring(idx, idx + length);

    // Add the token
    if (token.vid && token.sid !== undefined) {
      // Lookupable word
      html += `<span class="lookup-word" data-vid="${token.vid}" data-sid="${token.sid}">${escapeHtml(originalSpelling)}</span>`;
    } else {
      // Not lookupable (punctuation, particles without vid)
      html += escapeHtml(originalSpelling);
    }

    textIndex = idx + length;
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

  // Check cache first
  const cacheKey = `${vid}:${sid}`;
  const cached = definitionCache.get(cacheKey);

  if (cached) {
    // Instant display from cache
    populatePopup(cached, span.textContent);
    return;
  }

  // Show loading state while fetching
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

  // Cache the result
  definitionCache.set(cacheKey, result);
  populatePopup(result, span.textContent);
}

/** Populate popup with definition data */
function populatePopup(result, fallbackText) {
  dom.lookupPopupWord.textContent = result.spelling || fallbackText;
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
  dom.lookupPopup?.classList.add('visible');
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
