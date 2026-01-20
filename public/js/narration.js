/**
 * Narration module - VN-style narration display and queue management
 *
 * Handles:
 * - Narration queue for "press to continue" style display
 * - Narration logging for the log modal
 * - Continue indicator management
 * - AI narration fetching
 */

import * as tts from './tts.js';

// Module state
let narrationQueue = [];
let isNarrationWaiting = false;
let narrationLog = [];
let useAINarration = true;

// DOM elements (set via init)
let narrationText = null;
let narrationContinue = null;
let narrationPanel = null;

// Callbacks (set via init)
let getGameState = null;
let parseAndWrapText = null;
let triggerJpdbParse = null;
let updateActionButtonsState = null;

// API base (set via init)
let apiBase = '';

/**
 * Initialize the narration module
 * @param {Object} config Configuration object
 * @param {HTMLElement} config.textElement - narration-text element
 * @param {HTMLElement} config.continueElement - narration-continue element
 * @param {HTMLElement} config.panelElement - narration-panel element
 * @param {Function} config.getGameState - function to get current game state
 * @param {Function} config.parseAndWrapText - function to parse Japanese text
 * @param {Function} config.triggerJpdbParse - function to trigger JPDB extension
 * @param {Function} config.updateActionButtonsState - function to update button states
 * @param {string} config.apiBase - API base URL
 */
export function init(config) {
  narrationText = config.textElement;
  narrationContinue = config.continueElement;
  narrationPanel = config.panelElement;
  getGameState = config.getGameState;
  parseAndWrapText = config.parseAndWrapText;
  triggerJpdbParse = config.triggerJpdbParse;
  updateActionButtonsState = config.updateActionButtonsState;
  apiBase = config.apiBase || '';
}

/**
 * Fetch AI-generated narration using player's JPDB vocabulary
 */
export async function fetchAINarration(event, context = {}) {
  if (!useAINarration) return null;

  try {
    const response = await fetch(`${apiBase}/api/game/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, context })
    });
    const data = await response.json();
    console.log('AI Narration:', data.source, data.narration?.substring(0, 50) + '...');
    return data.narration || null;
  } catch (error) {
    console.error('AI Narration fetch error:', error);
    return null;
  }
}

/**
 * Set whether to use AI narration
 */
export function setUseAINarration(enabled) {
  useAINarration = enabled;
}

/**
 * Get whether AI narration is enabled
 */
export function getUseAINarration() {
  return useAINarration;
}

/**
 * Queue a narration message
 */
export function queueNarration(text) {
  narrationQueue.push(text);

  // Add to log
  const gameState = getGameState ? getGameState() : {};
  narrationLog.push({
    text,
    timestamp: Date.now(),
    floor: gameState.run?.floor || 0,
    phase: gameState.phase
  });

  // Immediately disable buttons when message is queued
  if (updateActionButtonsState) updateActionButtonsState();

  // Only display immediately if nothing is currently shown
  if (!isNarrationWaiting) {
    displayNextNarration();
  } else {
    // Just update the indicator to show more messages are queued
    updateContinueIndicator();
  }
}

/**
 * Display the next narration in queue (replaces current message - VN style)
 */
export async function displayNextNarration() {
  if (narrationQueue.length === 0) {
    // No more messages - allow new messages to display immediately
    isNarrationWaiting = false;
    updateContinueIndicator();
    if (updateActionButtonsState) updateActionButtonsState();
    return;
  }

  const text = narrationQueue.shift();

  // Parse and wrap Japanese text for popup dictionary
  const wrappedText = parseAndWrapText ? await parseAndWrapText(text) : text;

  // Replace the text (visual novel style - one message at a time)
  if (narrationText) {
    narrationText.innerHTML = `<p class="vn-message">${wrappedText}</p>`;
  }

  // Always mark as waiting - user must acknowledge message was displayed
  isNarrationWaiting = true;
  updateContinueIndicator();
  if (updateActionButtonsState) updateActionButtonsState();

  // Speak the narration if TTS is enabled
  tts.speakNarration(text);

  // Trigger JPDB extension to parse Japanese text
  if (triggerJpdbParse) triggerJpdbParse();
}

/**
 * Update the continue indicator
 */
export function updateContinueIndicator() {
  // Show indicator only when there are MORE messages waiting in queue
  // Don't show on the last message - user can take action immediately
  if (isNarrationWaiting && narrationQueue.length > 0) {
    narrationContinue?.classList.remove('hidden');
    narrationPanel?.classList.add('waiting-continue');
  } else {
    narrationContinue?.classList.add('hidden');
    narrationPanel?.classList.remove('waiting-continue');
  }
}

/**
 * Advance to next narration (Space key or click)
 */
export function advanceNarration() {
  // Stop any currently playing TTS before advancing
  tts.stop();

  if (narrationQueue.length > 0) {
    // Show next message
    displayNextNarration();
  } else {
    // No more messages - unlock for new messages
    isNarrationWaiting = false;
    updateContinueIndicator();
  }

  // Update action buttons when narration state changes
  if (updateActionButtonsState) updateActionButtonsState();
}

/**
 * Show narration - clears queue and displays immediately
 */
export function showNarration(text) {
  // Clear any pending messages
  narrationQueue = [];
  isNarrationWaiting = false;

  // Queue and display immediately
  queueNarration(text);

  // Update button states after narration change
  if (updateActionButtonsState) updateActionButtonsState();
}

/**
 * Append narration - adds to queue
 */
export function appendNarration(text) {
  queueNarration(text);
  if (updateActionButtonsState) updateActionButtonsState();
}

/**
 * Clear narration log (call when starting new run)
 */
export function clearNarrationLog() {
  narrationLog = [];
  narrationQueue = [];
  isNarrationWaiting = false;
  if (narrationText) {
    narrationText.innerHTML = '<p class="vn-message">...</p>';
  }
  updateContinueIndicator();
  if (updateActionButtonsState) updateActionButtonsState();
}

/**
 * Get the narration log
 */
export function getNarrationLog() {
  return narrationLog;
}

/**
 * Check if narration is waiting for user to advance
 */
export function isWaiting() {
  return isNarrationWaiting;
}

/**
 * Get the number of messages in the queue
 */
export function getQueueLength() {
  return narrationQueue.length;
}

/**
 * Check if we should block actions (waiting for narration with more in queue)
 */
export function shouldBlockActions() {
  return isNarrationWaiting && narrationQueue.length > 0;
}
