/**
 * @fileoverview Observable Store for reactive state management
 * @module public/js/store
 *
 * PURPOSE:
 * Provides a centralized, observable state container for the game frontend.
 * Replaces direct gameState mutations with a pub/sub pattern that automatically
 * triggers UI updates when state changes.
 *
 * KEY EXPORTS:
 * - Store (class) - Observable state container
 * - store (singleton) - Shared instance for the application
 *
 * USAGE:
 *   import { store } from './js/store.js';
 *
 *   // Subscribe to state changes
 *   store.subscribe((state, key) => {
 *     console.log(`${key} changed:`, state[key]);
 *     updateUI();
 *   });
 *
 *   // Update state (triggers subscribers)
 *   store.set('gameState', newState);
 *
 *   // Read state
 *   const current = store.get('gameState');
 */

class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.subscribers = [];
  }

  /**
   * Get current state or a specific key
   * @param {string} [key] - Optional key to retrieve
   * @returns {*} Full state or specific value
   */
  get(key) {
    return key ? this.state[key] : this.state;
  }

  /**
   * Set state and notify subscribers
   * @param {string} key - State key to update
   * @param {*} value - New value
   */
  set(key, value) {
    this.state[key] = value;
    this.notify(key);
  }

  /**
   * Subscribe to state changes
   * @param {function} callback - Called with (state, changedKey)
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx > -1) this.subscribers.splice(idx, 1);
    };
  }

  /**
   * Notify all subscribers of a change
   * @param {string} key - The key that changed
   */
  notify(key) {
    this.subscribers.forEach(cb => cb(this.state, key));
  }
}

// Singleton instance with initial gameState
export const store = new Store({ gameState: null });

// Export class for testing
export { Store };
