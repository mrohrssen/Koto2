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

// Initialize bridge early so isPhaserVisible() never returns null
bridge.init();

/**
 * Initialize the Phaser game instance.
 */
export function initPhaser() {
  if (game) return game;

  // Re-init bridge in case DOM wasn't ready on module load
  bridge.init();

  const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: 400,
    height: 760,
    backgroundColor: '#000000',
    pixelArt: true, // Nearest-neighbor scaling for crisp pixel art
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
    scene: [],  // No scenes - we add manually to avoid auto-start
    callbacks: {
      postBoot: (bootedGame) => {
        console.log('[DEBUG] Phaser postBoot fired');
        // Add scene manually (not in config array to avoid auto-start)
        bootedGame.scene.add('ExplorationScene', ExplorationScene, false);
        gameReady = true;
        console.log('[DEBUG] gameReady set to true, pendingRoomData:', pendingRoomData);
        // If we had pending room data, start the scene now
        if (pendingRoomData) {
          console.log('[DEBUG] Calling doStartExploration from postBoot');
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
  console.log('[DEBUG] doStartExploration called with:', roomData);
  const scene = game.scene.getScene('ExplorationScene');
  console.log('[DEBUG] scene:', scene, 'isActive:', scene?.scene?.isActive());
  if (scene && scene.scene.isActive()) {
    console.log('[DEBUG] Restarting scene');
    scene.scene.restart({ roomData });
  } else {
    // Start scene (whether it exists but inactive, or doesn't exist yet)
    console.log('[DEBUG] Starting scene fresh');
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
 * Returns true only if the Phaser container is visible AND the game is ready.
 * This prevents a race condition where the container is shown but the scene
 * hasn't started yet (which would cause updateUI to skip starting Phaser).
 */
export function isExplorationActive() {
  // Must check both: container visible AND game ready (scene can run)
  // If game isn't ready, we're still initializing and need startExploration() called again
  return bridge.isPhaserVisible() && gameReady;
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
