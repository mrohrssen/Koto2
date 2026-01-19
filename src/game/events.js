/**
 * @fileoverview Event Bus for decoupled communication between game services
 * @module src/game/events
 *
 * PURPOSE:
 * Provides a pub/sub event system for game services to communicate without
 * direct dependencies. Services mutate state directly, then emit events to
 * notify OTHER services of changes. Event bus is for notifications, not
 * state transfer.
 *
 * KEY EXPORTS:
 * - EventBus (class) - Pub/sub event emitter
 * - eventBus (singleton) - Shared instance for all services
 * - GameEvents (object) - Event type constants for type safety
 *
 * USAGE:
 *   import { eventBus, GameEvents } from './events.js';
 *
 *   // Subscribe to events
 *   const unsubscribe = eventBus.on(GameEvents.COMBAT_ENDED, (data) => {
 *     console.log('Combat ended:', data);
 *   });
 *
 *   // Emit events
 *   eventBus.emit(GameEvents.COMBAT_ENDED, { victory: true, rewards: {...} });
 *
 *   // Unsubscribe when done
 *   unsubscribe();
 *
 * ARCHITECTURE NOTES:
 * - Services receive state references via constructor, not via event bus
 * - Event bus is for notifications between services, not state sync
 * - Multiple listeners can subscribe to same event (unlike old callback pattern)
 */

/**
 * Simple pub/sub event bus for decoupled service communication
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event type from GameEvents
   * @param {function} callback - Handler function receiving event data
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback); // Return unsubscribe fn
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event type
   * @param {function} callback - Handler to remove
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx > -1) callbacks.splice(idx, 1);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event type from GameEvents
   * @param {*} data - Event payload
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }

  /**
   * Remove all listeners (useful for testing)
   */
  clear() {
    this.listeners.clear();
  }

  /**
   * Get listener count for an event (useful for debugging)
   * @param {string} event - Event type
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.listeners.get(event)?.length || 0;
  }
}

// Singleton instance for all services
export const eventBus = new EventBus();

// Export class for testing or creating isolated instances
export { EventBus };

/**
 * Event type constants for type safety and documentation
 * Namespaced by domain: combat:, exploration:, economy:, progression:, run:, ui:
 */
export const GameEvents = {
  // State events
  STATE_CHANGED: 'state:changed',

  // Combat events
  COMBAT_STARTED: 'combat:started',
  COMBAT_ENDED: 'combat:ended',
  DAMAGE_DEALT: 'combat:damage',
  PLAYER_ATTACKED: 'combat:player_attacked',
  ENEMY_ATTACKED: 'combat:enemy_attacked',

  // Exploration events
  ROOM_ENTERED: 'exploration:room',
  ROOM_CLEARED: 'exploration:room_cleared',
  FLOOR_ENTERED: 'exploration:floor_entered',

  // Economy events
  GOLD_CHANGED: 'economy:gold',
  ITEM_ACQUIRED: 'inventory:item',
  SHOP_ENTERED: 'economy:shop_entered',
  ITEM_PURCHASED: 'economy:item_purchased',

  // Run events
  RUN_STARTED: 'run:started',
  RUN_ENDED: 'run:ended',
  WARD_SELECTED: 'run:ward_selected',

  // Meta-progression events
  META_UPDATED: 'progression:meta_updated',
  ACHIEVEMENT_UNLOCKED: 'progression:achievement',
  ESSENCE_GAINED: 'progression:essence',
  UPGRADE_PURCHASED: 'progression:upgrade',

  // UI events
  NARRATION: 'ui:narration'
};
