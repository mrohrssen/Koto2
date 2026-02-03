/**
 * @file phaser-bridge.js - Communication between Phaser and HTML UI
 *
 * Handles:
 * - Showing/hiding Phaser canvas vs HTML game UI
 * - Event passing between Phaser scene and game.js
 * - Room data fetching for Phaser scenes
 */

// Event emitter for Phaser <-> HTML communication
class GameEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      // No callback provided - remove all listeners for this event
      this.listeners[event] = [];
    }
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }
}

// Global event emitter
export const gameEvents = new GameEventEmitter();

// Make available globally for Phaser scene access
window.gameEvents = gameEvents;

// DOM references
let phaserContainer = null;
let htmlGameApp = null;
let phaserGame = null;

/**
 * Initialize the bridge with DOM references.
 */
export function init() {
  phaserContainer = document.getElementById('phaser-container');
  htmlGameApp = document.querySelector('.game-app');
}

/**
 * Show Phaser exploration view, hide HTML UI.
 */
export function showPhaser() {
  if (phaserContainer) {
    phaserContainer.style.display = 'block';
  }
  if (htmlGameApp) {
    // Hide scene area and action area, keep status bar and utility row
    const sceneArea = document.getElementById('scene-area');
    const actionArea = document.getElementById('action-area');
    const chipRow = document.getElementById('chip-row');
    const playerHp = document.getElementById('player-hp-container');
    if (sceneArea) sceneArea.style.display = 'none';
    if (actionArea) actionArea.style.display = 'none';
    if (chipRow) chipRow.style.display = 'none';
    if (playerHp) playerHp.style.display = 'none';
  }
}

/**
 * Hide Phaser, show HTML UI.
 */
export function hidePhaser() {
  if (phaserContainer) {
    phaserContainer.style.display = 'none';
  }
  if (htmlGameApp) {
    const sceneArea = document.getElementById('scene-area');
    const actionArea = document.getElementById('action-area');
    const chipRow = document.getElementById('chip-row');
    const playerHp = document.getElementById('player-hp-container');
    if (sceneArea) sceneArea.style.display = '';
    if (actionArea) actionArea.style.display = '';
    if (chipRow) chipRow.style.display = '';
    if (playerHp) playerHp.style.display = '';
  }
}

/**
 * Check if Phaser view is currently visible.
 */
export function isPhaserVisible() {
  return phaserContainer && phaserContainer.style.display !== 'none';
}

/**
 * Set the Phaser game instance reference.
 */
export function setPhaserGame(game) {
  phaserGame = game;
  window.phaserGame = game;
}

/**
 * Get the Phaser game instance.
 */
export function getPhaserGame() {
  return phaserGame;
}

/**
 * Notify Phaser that an interaction is complete.
 * @param {object} data - Interaction result data
 */
export function notifyInteractionComplete(data) {
  gameEvents.emit('interactionComplete', data);
}
