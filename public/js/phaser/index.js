/**
 * @file index.js - Phaser game initialization and management
 *
 * Creates the Phaser game instance and provides functions to
 * start/stop exploration mode.
 */

import { ExplorationScene } from './exploration-scene.js';
import * as bridge from './phaser-bridge.js';

let game = null;
let gameReady = false;
let pendingRoomData = null;

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
    scene: [ExplorationScene],
    callbacks: {
      postBoot: () => {
        gameReady = true;
        // If we had pending room data, start the scene now
        if (pendingRoomData) {
          doStartExploration(pendingRoomData);
          pendingRoomData = null;
        }
      }
    }
  };

  game = new Phaser.Game(config);
  bridge.setPhaserGame(game);

  return game;
}

/**
 * Actually start the exploration scene (called when game is ready).
 */
function doStartExploration(roomData) {
  const scene = game.scene.getScene('ExplorationScene');
  if (scene && scene.scene.isActive()) {
    scene.scene.restart({ roomData });
  } else {
    // Start scene (whether it exists but inactive, or doesn't exist yet)
    game.scene.start('ExplorationScene', { roomData });
  }
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

  // If game isn't ready yet, queue the room data for when it is
  if (!gameReady) {
    pendingRoomData = roomData;
    return;
  }

  doStartExploration(roomData);
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

/**
 * Get current player position (for saving before combat).
 */
export function getPlayerPosition() {
  if (!game) return null;
  const scene = game.scene.getScene('ExplorationScene');
  if (scene && scene.player) {
    return { x: scene.player.x, y: scene.player.y };
  }
  return null;
}
