import { dom } from '../dom.js';
import { escapeHtml } from './html-utils.js';
import { resolveJapaneseDisplay } from './japanese-display-resolver.js';
import { buildHeadwordRuby } from './romaji.js';

let isActive = false;
let isLoading = false;
let originalTextMap = new WeakMap(); // Store original text per element
let definitionCache = new Map(); // Cache definitions by word string
let api = {
  parseText: null,
  lookupWord: null,
  showToast: null
};

// Selectors to EXCLUDE from parsing (cheating prevention + UI elements)
const BLOCKED_SELECTORS = [
  '.quiz-answer-option',  // Quiz answers - no cheating!
  '.flash-card',          // Flashcards - no cheating!
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
  if (!isActive) return;

  // Allow interactions with the menu — user's exit path from lookup mode
  if (dom.menuBtn?.contains(e.target)) return;
  if (dom.menuSheet?.contains(e.target)) return;
  if (dom.menuBackdrop?.contains(e.target)) return;
  // Allow clicks on: popup, popup close, lookup words
  if (dom.lookupPopup?.contains(e.target)) return;
  if (e.target.classList.contains('lookup-word')) return;

  // Block everything else so the underlying game doesn't receive the click
  e.stopImmediatePropagation();
  e.preventDefault();
}

/** Initialize lookup module with callbacks */
export function init(callbacks) {
  api.parseText = callbacks.parseText;
  api.lookupWord = callbacks.lookupWord;
  api.showToast = callbacks.showToast;

  // Block game clicks when lookup mode is active (capture phase runs first)
  document.addEventListener('click', blockGameClicks, true);

  // Menu-sheet item toggles lookup mode on/off
  dom.lookupMenuBtn?.addEventListener('click', (e) => {
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
  // Clear any residual transform on .game-app (e.g. from screen shake)
  // so that position:fixed popup is positioned relative to viewport, not the container
  const gameApp = document.querySelector('.game-app');
  if (gameApp) gameApp.style.transform = '';

  isLoading = true;
  definitionCache.clear();

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
      return;
    }

    // Parse each text element via Sudachi + local dictionary
    for (const { el, text } of elementsToProcess) {
      const result = await api.parseText(text);

      if (result.error || !result.tokens) {
        continue; // Skip this element but continue with others
      }

      // Cache definitions inline from parse response (tokens include meanings)
      for (const token of result.tokens) {
        if (token.lookupable && token.word) {
          definitionCache.set(token.word, token);
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

  } catch (err) {
    console.error('Lookup activation failed:', err);
    api.showToast?.('Couldn\'t parse text. Try again.');
    isLoading = false;
  }

  isLoading = false;
}

/** Deactivate lookup mode */
function deactivate() {
  isActive = false;
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

  // Also search in visible takeovers (creature modals, etc.)
  const takeovers = document.querySelectorAll('.takeover.visible');
  for (const takeover of takeovers) {
    findJapaneseTextElements(takeover, elements);
  }

  // Also search in creature popup when visible
  const creaturePopup = document.querySelector('.creature-popup.visible');
  if (creaturePopup) {
    findJapaneseTextElements(creaturePopup, elements);
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

function hasGrammarHints(token) {
  return Array.isArray(token?.grammarHints) && token.grammarHints.length > 0;
}

function grammarReading(token, fallbackText) {
  return token?.grammarHints?.find(hint => hint.readingOverride)?.readingOverride
    || token?.reading
    || fallbackText
    || '';
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function buildGrammarTokenHtml(token, originalSpelling) {
  const reading = grammarReading(token, originalSpelling);
  const display = resolveJapaneseDisplay({
    surface: originalSpelling,
    reading,
    hiraganaSurface: originalSpelling,
  }, { japaneseDisplayMode: 'hiragana' });
  const grammarHints = escapeAttr(JSON.stringify(token.grammarHints || []));
  return `<span class="lookup-grammar jp-grammar" data-reading="${escapeAttr(reading)}" data-grammar-hints="${grammarHints}">`
    + `<ruby>${escapeHtml(display.mainText)}<rt>${escapeHtml(display.guideText)}</rt></ruby>`
    + `</span>`;
}

/** Build HTML string from tokens matching a specific text */
export function buildHtmlFromTokens(tokens, targetText) {
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
    if (hasGrammarHints(token)) {
      html += buildGrammarTokenHtml(token, originalSpelling);
    } else if (token.lookupable && token.word) {
      // Lookupable word — keyed by dictionary form
      html += `<span class="lookup-word" data-word="${escapeHtml(token.word)}">${escapeHtml(originalSpelling)}</span>`;
    } else {
      // Not lookupable (punctuation, particles)
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


/** Handle click on a lookup word */
async function handleWordClick(e) {
  e.stopPropagation();
  const span = e.target;
  const word = span.dataset.word;

  if (!word) return;

  // Position popup near clicked word
  const rect = span.getBoundingClientRect();
  positionPopup(rect);

  // Check cache first
  const cached = definitionCache.get(word);

  if (cached) {
    populatePopup(cached, span.textContent);
    return;
  }

  // Show loading state while fetching
  dom.lookupPopupWord.textContent = span.textContent;
  dom.lookupPopupPos.textContent = 'Loading...';
  dom.lookupPopupMeanings.innerHTML = '';
  dom.lookupPopupState.style.display = 'none';
  dom.lookupPopup?.classList.add('visible');

  // Fetch definition from local dictionary
  const result = await api.lookupWord(word);

  if (result.error) {
    dom.lookupPopupPos.textContent = 'Couldn\'t load definition';
    return;
  }

  // Cache the result
  definitionCache.set(word, result);
  populatePopup(result, span.textContent);
}

/** Populate popup with definition data */
function populatePopup(result, fallbackText) {
  dom.lookupPopupWord.innerHTML = buildHeadwordRuby(
    result.spelling || fallbackText,
    result.reading || '',
    false
  );
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
