/**
 * @file pvp-socket.js - Socket.IO Client for PvP
 *
 * PURPOSE:
 * Manages the Socket.IO connection for PvP multiplayer battles.
 * Handles match lifecycle events (create, join, ready, moves, rematch).
 * Authenticates via JWT token from localStorage.
 *
 * KEY EXPORTS:
 * - connect(): Establish Socket.IO connection with auth
 * - disconnect(): Tear down connection
 * - on(event, fn) / off(event): Register/unregister event handlers
 * - createMatch(), joinMatch(code), selectTeam(), ready(), submitMoves(), etc.
 * - getMatchCode(): Get current match code
 * - enterLobby(): Connect and signal lobby entry
 *
 * DEPENDENCIES:
 * - Socket.IO client served by the server at /socket.io/socket.io.esm.min.js
 */

import { io } from '/socket.io/socket.io.esm.min.js';

let socket = null;
let currentMatchCode = null;

const handlers = {};

/**
 * Register an event handler.
 * @param {string} event - Socket.IO event name
 * @param {Function} fn - Handler function
 */
export function on(event, fn) { handlers[event] = fn; }

/**
 * Remove an event handler.
 * @param {string} event - Socket.IO event name
 */
export function off(event) { delete handlers[event]; }

/**
 * Get the current match code.
 * @returns {string|null}
 */
export function getMatchCode() { return currentMatchCode; }

/**
 * Establish Socket.IO connection with JWT auth.
 * No-op if already connected.
 */
export function connect() {
  if (socket?.connected) return;
  const token = localStorage.getItem('authToken');
  if (!token) return;

  socket = io({ auth: { token }, transports: ['websocket'] });

  const events = [
    'pvp:match-created', 'pvp:match-joined', 'pvp:opponent-joined',
    'pvp:opponent-ready', 'pvp:match-start',
    'pvp:opponent-submitted', 'pvp:round-result', 'pvp:match-end',
    'pvp:opponent-wants-rematch', 'pvp:rematch-start', 'pvp:rematch-cancelled',
    'pvp:opponent-disconnected', 'pvp:opponent-reconnected', 'pvp:reconnected',
    'pvp:error'
  ];
  for (const event of events) {
    socket.on(event, (data) => handlers[event]?.(data));
  }
  socket.on('connect_error', (err) => console.error('[PvP] Connection error:', err.message));
}

/**
 * Disconnect from the Socket.IO server and reset state.
 */
export function disconnect() {
  socket?.disconnect();
  socket = null;
  currentMatchCode = null;
}

/** Ask server to create a new match room. */
export function createMatch() { socket?.emit('pvp:create-match'); }

/** Join an existing match by code. */
export function joinMatch(code) {
  currentMatchCode = code;
  socket?.emit('pvp:join-match', { code });
}

/** Send selected team data to server. */
export function selectTeam(slotIndex, teamData) {
  socket?.emit('pvp:select-team', { slotIndex, teamData });
}

/** Signal this player is ready to battle. */
export function ready() { socket?.emit('pvp:ready'); }

/** Submit move choices for the current round. */
export function submitMoves(moveChoices) {
  socket?.emit('pvp:submit-moves', { moveChoices });
}

/** Request a rematch after a match ends. */
export function requestRematch() { socket?.emit('pvp:request-rematch'); }

/** Leave the current match and clean up. */
export function leaveMatch() {
  socket?.emit('pvp:leave-match');
  currentMatchCode = null;
}

/**
 * Enter the PvP lobby: connect and notify handlers.
 */
export function enterLobby() {
  connect();
  handlers['pvp:enter-lobby']?.();
}

// Store match code when we create a match
on('pvp:match-created', ({ code }) => { currentMatchCode = code; });
