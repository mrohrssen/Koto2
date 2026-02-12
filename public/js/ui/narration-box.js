/**
 * @file narration-box.js - Visual Novel Style Dialogue Box
 *
 * PURPOSE:
 * Renders a semi-transparent text box at the bottom of the scene area for
 * AI-generated dialogue, combat narration, and system messages. Supports
 * click-to-dismiss, auto-dismiss, and persistent modes.
 *
 * KEY EXPORTS:
 * - show(text, options): Display narration, returns Promise that resolves on dismiss
 *   Options: { speaker, autoDismiss (ms), persistent (bool) }
 * - forceHide(): Immediately hide box without waiting for user interaction
 *
 * DEPENDENCIES:
 * - ./lookup.js: Checks if lookup mode is active (blocks click-to-dismiss)
 *
 * USAGE:
 *   await narrationBox.show('The enemy speaks...', { speaker: 'Salaryman' });
 *   await narrationBox.show('Chip acquired!', { autoDismiss: 2000 });
 *   narrationBox.show('Choose wisely...', { persistent: true }); // stays until forceHide()
 *
 * BEHAVIOR:
 * - Click-to-dismiss shows blinking arrow indicator
 * - Auto-dismiss hides indicator and resolves after timeout
 * - Persistent mode resolves immediately but stays visible
 */

import * as lookup from './lookup.js';
import { rewriteNarration } from '../api.js';
import { isAiNarrationEnabled } from '../settings.js';

const box = document.getElementById('narration-box');
const textEl = document.getElementById('narration-text');
const speakerEl = document.getElementById('narration-speaker');
const indicatorEl = box?.querySelector('.narration-indicator');

let dismissResolve = null;
let dismissTimer = null;
let pagedText = [];
let currentPage = 0;
let showRequestCounter = 0;

const MAX_VISIBLE_LINES = 3;
const BREAK_CHARS = /[。！？!?、，,.\s\n]/u;

function clearPagination() {
  pagedText = [];
  currentPage = 0;
}

function getLineHeightPx() {
  if (!textEl) return 0;
  const computed = window.getComputedStyle(textEl);
  let lineHeight = Number.parseFloat(computed.lineHeight);
  if (!Number.isFinite(lineHeight)) {
    const fontSize = Number.parseFloat(computed.fontSize) || 16;
    lineHeight = fontSize * 1.45;
  }
  return lineHeight;
}

function fitsWithinTwoLines(candidate) {
  if (!textEl) return true;
  const previous = textEl.textContent;
  textEl.textContent = candidate;

  const lineHeight = getLineHeightPx();
  const maxHeight = (lineHeight * MAX_VISIBLE_LINES) + 1;
  const fits = textEl.scrollHeight <= maxHeight;

  textEl.textContent = previous;
  return fits;
}

function chooseNaturalBreak(chars, start, end) {
  for (let i = end; i > start; i -= 1) {
    if (BREAK_CHARS.test(chars[i - 1])) return i;
  }
  return end;
}

function paginateForTwoLines(text) {
  const source = String(text ?? '');
  if (!source) return [''];
  if (!textEl || fitsWithinTwoLines(source)) return [source];

  const chars = Array.from(source);
  const pages = [];
  let start = 0;

  while (start < chars.length) {
    while (start < chars.length && /\s/u.test(chars[start])) start += 1;
    if (start >= chars.length) break;

    let low = 1;
    let high = chars.length - start;
    let best = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const end = start + mid;
      const hasMore = end < chars.length;
      const raw = chars.slice(start, end).join('');
      const candidate = hasMore ? `${raw.trimEnd()}…` : raw;

      if (fitsWithinTwoLines(candidate)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    let end = start + best;
    const natural = chooseNaturalBreak(chars, start, end);
    if (natural > start && natural < end) {
      end = natural;
    }
    if (end <= start) end = start + 1;

    let chunk = chars.slice(start, end).join('');
    if (pages.length > 0) chunk = chunk.replace(/^\s+/u, '');
    chunk = chunk.replace(/\s+$/u, '');

    const hasMore = end < chars.length;
    let pageText = hasMore ? `${chunk}…` : chunk;

    // Safety fallback if natural breakpoint unexpectedly overflows.
    if (!fitsWithinTwoLines(pageText)) {
      end = start + best;
      chunk = chars.slice(start, end).join('').replace(/^\s+/u, '').replace(/\s+$/u, '');
      pageText = end < chars.length ? `${chunk}…` : chunk;
    }

    pages.push(pageText);
    start = end;
  }

  return pages.length > 0 ? pages : [source];
}

function hide() {
  if (box) box.classList.remove('visible');
  clearPagination();
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (dismissResolve) {
    const resolve = dismissResolve;
    dismissResolve = null;
    resolve();
  }
}

function handleClick(e) {
  // Don't dismiss if lookup mode is active (let user look up words)
  if (lookup.getActive()) return;

  if (pagedText.length > 0 && currentPage < pagedText.length - 1) {
    currentPage += 1;
    if (textEl) textEl.textContent = pagedText[currentPage];
    return;
  }

  document.removeEventListener('click', handleClick, true);
  hide();
}

/**
 * Show text in the narration box.
 * @param {string} text - The text to display
 * @param {Object} [options]
 * @param {string} [options.speaker] - Name label shown above text
 * @param {number} [options.autoDismiss] - Ms to auto-dismiss (no click needed)
 * @param {boolean} [options.persistent] - If true, stays visible until forceHide() is called
 * @param {boolean} [options.skipRewrite] - If true, bypass vocab rewrite for this text
 * @returns {Promise<void>} Resolves when dismissed
 */
export async function show(text, options = {}) {
  const requestId = ++showRequestCounter;
  const sourceText = typeof text === 'string' ? text : String(text ?? '');
  const {
    speaker,
    autoDismiss,
    persistent,
    skipRewrite = false
  } = options;

  let displayText = sourceText;
  if (!skipRewrite && isAiNarrationEnabled() && sourceText.trim()) {
    console.log(`[NarrationBox] Original before rewrite: ${sourceText}`);
    try {
      const rewritten = await rewriteNarration(sourceText);
      if (requestId !== showRequestCounter) return;
      if (typeof rewritten?.narration === 'string' && rewritten.narration.length > 0) {
        displayText = rewritten.narration;
      }
      console.log(`[NarrationBox] Rewrite result: ${displayText}`);
    } catch {}
  }

  if (requestId !== showRequestCounter) return;

  // Dismiss any currently visible narration
  if (dismissResolve) {
    document.removeEventListener('click', handleClick, true);
    hide();
  }

  if (speakerEl) {
    speakerEl.textContent = speaker || '';
    speakerEl.style.display = speaker ? '' : 'none';
  }
  clearPagination();
  if (autoDismiss) {
    if (textEl) textEl.textContent = displayText;
  } else if (persistent) {
    // Persistent: truncate to 2 lines (no click-to-advance available)
    const pages = paginateForTwoLines(displayText);
    if (textEl) textEl.textContent = pages[0] || '';
  } else {
    pagedText = paginateForTwoLines(displayText);
    currentPage = 0;
    if (textEl) textEl.textContent = pagedText[0] || '';
  }
  if (indicatorEl) indicatorEl.style.display = (autoDismiss || persistent) ? 'none' : '';
  if (box) box.classList.add('visible');
  console.log(`[NarrationBox] Final displayed text: ${displayText}`);

  // Persistent mode: show but don't register click handler, resolve immediately
  if (persistent) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    dismissResolve = resolve;

    if (autoDismiss) {
      dismissTimer = setTimeout(() => {
        document.removeEventListener('click', handleClick, true);
        hide();
      }, autoDismiss);
    }

    // Use setTimeout(0) to avoid the current click event from immediately dismissing
    setTimeout(() => {
      document.addEventListener('click', handleClick, true);
    }, 0);
  });
}

/**
 * Immediately hide the narration box without resolving promise.
 * Useful for scene transitions.
 */
export function forceHide() {
  document.removeEventListener('click', handleClick, true);
  if (box) box.classList.remove('visible');
  clearPagination();
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (dismissResolve) {
    const resolve = dismissResolve;
    dismissResolve = null;
    resolve();
  }
}
