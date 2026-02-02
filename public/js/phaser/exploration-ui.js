/**
 * @file exploration-ui.js - Context button and UI overlays for exploration
 *
 * Handles the context-sensitive action button (ENTER/GRAB/TALK)
 * that appears when player is near interactive objects.
 */

import { gameEvents } from './phaser-bridge.js';

let contextButton = null;
let currentContext = null;

/**
 * Initialize the context button DOM element.
 */
export function init() {
  // Create button if it doesn't exist
  if (!contextButton) {
    contextButton = document.createElement('button');
    contextButton.className = 'exploration-context-btn';
    contextButton.textContent = 'INTERACT';
    document.getElementById('phaser-container')?.appendChild(contextButton);

    contextButton.addEventListener('click', onContextButtonClick);
  }
}

/**
 * Show the context button with specified action.
 * @param {string} action - 'ENTER', 'GRAB', or 'TALK'
 * @param {object} target - The object being interacted with
 */
export function showContextButton(action, target) {
  if (!contextButton) return;
  currentContext = { action, target };
  contextButton.textContent = action;
  contextButton.classList.add('visible');
}

/**
 * Hide the context button.
 */
export function hideContextButton() {
  if (!contextButton) return;
  currentContext = null;
  contextButton.classList.remove('visible');
}

/**
 * Handle context button click.
 */
function onContextButtonClick() {
  if (!currentContext) return;

  const { action, target } = currentContext;

  switch (action) {
    case 'ENTER':
      gameEvents.emit('doorEnter', { door: target });
      break;
    case 'GRAB':
      gameEvents.emit('creditGrab', { credit: target });
      break;
    case 'TALK':
      gameEvents.emit('npcTalk', { npc: target });
      break;
  }

  hideContextButton();
}

/**
 * Clean up the context button.
 */
export function destroy() {
  if (contextButton) {
    contextButton.removeEventListener('click', onContextButtonClick);
    contextButton.remove();
    contextButton = null;
  }
  currentContext = null;
}
