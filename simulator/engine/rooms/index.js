/**
 * Room type registry.
 * Maps room type strings to handler functions.
 * Unknown types fall through to handleUnknownRoom.
 * Null handlers (not yet registered) fall back to handleSkipRoom.
 */
import { handleUnknownRoom } from './unknown.js';
import { handleSkipRoom } from './skip-room.js';
import { handleEncounter } from './encounter.js';
import { handleBoss } from './boss.js';
import { handleFriendlyNpc } from './friendly-npc.js';
import { handleNpcBattle } from './npc-battle.js';
import { handleWordDiscovery } from './word-discovery.js';
import { handleSpeedReview } from './speed-review.js';
import { handleWhackAMole } from './whack-a-mole.js';

const handlers = new Map();

// Combat / interactive rooms
handlers.set('encounter', handleEncounter);
handlers.set('boss', handleBoss);
handlers.set('friendlyNpc', handleFriendlyNpc);
handlers.set('npcBattle', handleNpcBattle);
handlers.set('wordDiscovery', handleWordDiscovery);
handlers.set('speedReviewRoom', handleSpeedReview);
handlers.set('whackAMole', handleWhackAMole);

// Rooms we intentionally skip
handlers.set('shrine', handleSkipRoom);
handlers.set('quiz', handleSkipRoom);
handlers.set('dealer', handleSkipRoom);
handlers.set('skillMaster', handleSkipRoom);

/**
 * Register a handler for a room type.
 * @param {string} roomType
 * @param {Function} handler - async (simCall, room, context, logEvent) => result
 */
export function registerHandler(roomType, handler) {
  handlers.set(roomType, handler);
}

/**
 * Get the handler for a room type.
 * Returns handleSkipRoom for known-but-null entries, handleUnknownRoom for unknown types.
 * @param {string} roomType
 * @returns {Function}
 */
export function getRoomHandler(roomType) {
  if (!handlers.has(roomType)) {
    return handleUnknownRoom;
  }
  const handler = handlers.get(roomType);
  return handler ?? handleSkipRoom;
}
