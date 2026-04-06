/**
 * Room type registry.
 * Maps room type strings to handler functions.
 * Unknown types fall through to handleUnknownRoom.
 * Null handlers (not yet registered) fall back to handleSkipRoom.
 */
import { handleUnknownRoom } from './unknown.js';
import { handleSkipRoom } from './skip-room.js';

const handlers = new Map();

// Combat rooms — null until registered by their modules
handlers.set('encounter', null);
handlers.set('boss', null);
handlers.set('friendlyNpc', null);
handlers.set('npcBattle', null);
handlers.set('wordDiscovery', null);
handlers.set('speedReviewRoom', null);
handlers.set('whackAMole', null);

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
