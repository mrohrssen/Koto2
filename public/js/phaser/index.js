/**
 * @file index.js - Phaser game initialization and management
 *
 * Creates the Phaser game instance and provides functions to
 * start/stop exploration mode.
 */

import { ExplorationScene } from './exploration-scene.js';
import * as bridge from './phaser-bridge.js';

let game = null;

/**
 * Initialize the Phaser game instance.
 */
export function initPhaser() {
  if (game) return game;

  bridge.init();

  const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: 400,
    height: 760,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    scene: [ExplorationScene]
  };

  game = new Phaser.Game(config);
  bridge.setPhaserGame(game);

  return game;
}

/**
 * Start exploration mode with room data.
 * @param {object} roomData - Room type, floor, door destinations
 */
export function startExploration(roomData) {
  if (!game) {
    initPhaser();
  }

  bridge.showPhaser();

  // Start or restart the exploration scene with new room data
  const scene = game.scene.getScene('ExplorationScene');
  if (scene) {
    scene.scene.restart({ roomData });
  } else {
    game.scene.start('ExplorationScene', { roomData });
  }
}

/**
 * Stop exploration mode and return to HTML UI.
 */
export function stopExploration() {
  bridge.hidePhaser();

  if (game) {
    const scene = game.scene.getScene('ExplorationScene');
    if (scene) {
      scene.scene.pause();
    }
  }
}

/**
 * Get the bridge module for event handling.
 */
export { gameEvents } from './phaser-bridge.js';

/**
 * Check if exploration is currently active.
 */
export function isExplorationActive() {
  return bridge.isPhaserVisible();
}
