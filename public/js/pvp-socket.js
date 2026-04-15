import { io } from 'socket.io-client';

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

  socket = io({
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });

  const events = [
    'pvp:match-created', 'pvp:match-joined', 'pvp:opponent-joined',
    'pvp:opponent-ready', 'pvp:match-start',
    'pvp:opponent-submitted', 'pvp:round-result', 'pvp:match-end',
    'pvp:opponent-wants-rematch', 'pvp:rematch-start', 'pvp:rematch-cancelled',
    'pvp:opponent-disconnected', 'pvp:opponent-reconnected', 'pvp:reconnected',
    'pvp:match-forfeit',
    'pvp:error'
  ];
  for (const event of events) {
    socket.on(event, (data) => handlers[event]?.(data));
  }
  socket.on('connect_error', (err) => console.error('[PvP] Connection error:', err.message));

  // Auto-reconnect to active match when socket recovers
  socket.io.on('reconnect', () => {
    const code = currentMatchCode || sessionStorage.getItem('pvpMatchCode');
    if (code) {
      console.log('[PvP] Auto-reconnecting to match:', code);
      socket.emit('pvp:reconnect', { code });
    }
    handlers['pvp:socket-reconnected']?.();
  });

  // Expose socket lifecycle to UI for connection banner
  socket.on('disconnect', () => {
    handlers['pvp:socket-disconnected']?.();
  });
}

/**
 * Disconnect from the Socket.IO server and reset state.
 */
export function disconnect() {
  socket?.disconnect();
  socket = null;
  currentMatchCode = null;
  sessionStorage.removeItem('pvpMatchCode');
}

/** Ask server to create a new match room. */
export function createMatch() { socket?.emit('pvp:create-match'); }

/** Join an existing match by code. */
export function joinMatch(code) {
  currentMatchCode = code;
  sessionStorage.setItem('pvpMatchCode', code);
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
  sessionStorage.removeItem('pvpMatchCode');
}

/**
 * Enter the PvP lobby: connect and notify handlers.
 */
export function enterLobby() {
  connect();
  handlers['pvp:enter-lobby']?.();
}

// Store match code when we create a match
on('pvp:match-created', ({ code }) => {
  currentMatchCode = code;
  sessionStorage.setItem('pvpMatchCode', code);
});
