/**
 * @file combat-events.js - Lightweight combat event bus
 *
 * Decouples combat event producers (combat-loop, game.js, room-transition)
 * from consumers (speech-bubble, future: sound cues, screen effects).
 *
 * Event types:
 *   creatureHit  — { slotEl, side: 'player'|'enemy' }
 *   victory      — (no detail)
 *   explore      — (no detail)
 */

const _bus = new EventTarget();

export const combatEvents = {
  emit(type, detail) {
    _bus.dispatchEvent(new CustomEvent(type, { detail }));
  },
  on(type, handler) {
    _bus.addEventListener(type, (e) => handler(e.detail));
  },
  off(type, handler) {
    _bus.removeEventListener(type, handler);
  }
};
