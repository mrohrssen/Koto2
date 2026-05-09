import { MatchManager } from './match-manager.js';
import { verifyToken } from '../auth/middleware.js';
import { getDataDir } from '../data-dir.js';

const ROUND_TIMEOUT_MS = 60000;

/**
 * Set up all PvP Socket.IO event handlers.
 * @param {import('socket.io').Server} io
 * @returns {{ mm: MatchManager, io: import('socket.io').Server }}
 */
export function setupPvpSockets(io, { getSettings } = {}) {
  const mm = new MatchManager({ dataDir: getDataDir(), getSettings });

  const restored = mm.restoreMatches();
  if (restored > 0) console.log(`[PvP] Restored ${restored} active match(es) from disk`);

  // Map<userId, { timeout: NodeJS.Timeout, matchCode: string }>
  const disconnectTimers = new Map();

  // JWT auth middleware — runs before every connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    socket.userId = payload.id;
    socket.username = payload.username;
    next();
  });

  io.on('connection', socket => {
    // If this user has a pending disconnect timer, cancel it (reconnect path)
    if (disconnectTimers.has(socket.userId)) {
      const pending = disconnectTimers.get(socket.userId);
      clearTimeout(pending.timeout);
      disconnectTimers.delete(socket.userId);
    }

    // ------------------------------------------------------------------ //
    // pvp:create-match
    // ------------------------------------------------------------------ //
    socket.on('pvp:create-match', () => {
      const code = mm.createMatch(socket.userId, socket.id);
      const match = mm.getMatch(code);
      match.player1.username = socket.username;
      socket.join(code);
      socket.emit('pvp:match-created', { code });
    });

    // ------------------------------------------------------------------ //
    // pvp:join-match
    // ------------------------------------------------------------------ //
    socket.on('pvp:join-match', ({ code } = {}) => {
      const joined = mm.joinMatch(code, socket.userId, socket.id);
      if (!joined) {
        socket.emit('pvp:error', { message: 'Match not found or already full' });
        return;
      }
      const match = mm.getMatch(code);
      match.player2.username = socket.username;
      socket.join(code);
      socket.emit('pvp:match-joined', { code });
      io.to(code).emit('pvp:opponent-joined', {
        opponentName: socket.username
      });
    });

    // ------------------------------------------------------------------ //
    // pvp:select-team
    // ------------------------------------------------------------------ //
    socket.on('pvp:select-team', ({ slotIndex, teamData } = {}) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;
      mm.selectTeam(found.code, socket.userId, teamData);
    });

    // ------------------------------------------------------------------ //
    // pvp:ready
    // ------------------------------------------------------------------ //
    socket.on('pvp:ready', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const bothReady = mm.setReady(found.code, socket.userId);
      const match = mm.getMatch(found.code);

      if (bothReady && match.phase === 'battle') {
        // Emit match-start to each player with their perspective
        const p1Socket = io.sockets.sockets.get(match.player1.socketId);
        const p2Socket = io.sockets.sockets.get(match.player2.socketId);

        if (p1Socket) {
          p1Socket.emit('pvp:match-start', {
            yourTeam: match.combat.sideA,
            opponentTeam: match.combat.sideB,
            opponentName: match.player2.username,
            mySide: 'sideA',
            actionCursor: match.combat.actionCursor,
            openingResolved: match.combat.openingResolved
          });
        }
        if (p2Socket) {
          p2Socket.emit('pvp:match-start', {
            yourTeam: match.combat.sideB,
            opponentTeam: match.combat.sideA,
            opponentName: match.player1.username,
            mySide: 'sideB',
            actionCursor: match.combat.actionCursor,
            openingResolved: match.combat.openingResolved
          });
        }
      } else {
        // Notify the other player that this player is ready
        const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherPlayer = match[otherPlayerKey];
        if (otherPlayer) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('pvp:opponent-ready');
          }
        }
      }
    });

    // ------------------------------------------------------------------ //
    // pvp:submit-moves
    // ------------------------------------------------------------------ //
    socket.on('pvp:submit-moves', ({ moveChoices } = {}) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      // Clear round timer before resolving (safe no-op if no timer)
      mm.clearRoundTimer(found.code);

      const result = mm.submitMoves(found.code, socket.userId, moveChoices);

      if (result === null) {
        // Still waiting for the other player — notify them
        const match = mm.getMatch(found.code);
        if (match) {
          const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
          const otherPlayer = match[otherPlayerKey];
          if (otherPlayer) {
            const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
            if (otherSocket) {
              otherSocket.emit('pvp:opponent-submitted');
            }
          }
        }
        return;
      }

      // Both submitted — result is resolved
      const match = mm.getMatch(found.code);
      if (!match) return;

      const p1Socket = io.sockets.sockets.get(match.player1.socketId);
      const p2Socket = io.sockets.sockets.get(match.player2.socketId);

      // Send round result with perspective flip
      if (p1Socket) {
        p1Socket.emit('pvp:round-result', {
          allies: result.sideA,
          enemies: result.sideB,
          attacks: result.attacks,
          winner: result.winner
        });
      }
      if (p2Socket) {
        p2Socket.emit('pvp:round-result', {
          allies: result.sideB,
          enemies: result.sideA,
          attacks: result.attacks,
          winner: result.winner
        });
      }

      // Persist updated match state after round resolution
      mm.saveMatch(found.code);

      // If there's a winner, emit match-end to the room
      if (result.winner) {
        const winnerId = match.winnerId;
        let winnerName = null;
        if (match.player1.userId === winnerId) {
          winnerName = match.player1.username;
        } else if (match.player2 && match.player2.userId === winnerId) {
          winnerName = match.player2.username;
        }
        io.to(found.code).emit('pvp:match-end', { winnerId, winnerName });
      } else if (match.phase === 'battle') {
        // Start timer for next round's move submission
        mm.startRoundTimer(found.code, ROUND_TIMEOUT_MS, (timedOutCode) => {
          const m = mm.getMatch(timedOutCode);
          if (!m || m.phase !== 'battle') return;

          // Find who hasn't submitted
          const p1Submitted = !!m.player1?.movesSubmitted;
          const p2Submitted = !!m.player2?.movesSubmitted;
          let forfeitUserId;
          if (!p1Submitted && !p2Submitted) {
            // Both timed out — forfeit the one who joined second
            forfeitUserId = m.player2?.userId;
          } else if (!p1Submitted) {
            forfeitUserId = m.player1?.userId;
          } else {
            forfeitUserId = m.player2?.userId;
          }
          if (!forfeitUserId) return;

          // Read player refs before forfeit deletes the match
          const player1 = m.player1;
          const player2 = m.player2;

          const forfeitResult = mm.forfeitMatch(timedOutCode, forfeitUserId);
          if (!forfeitResult) return;

          // Notify both players
          [player1, player2].forEach(p => {
            if (!p) return;
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.emit('pvp:match-forfeit', { winnerId: forfeitResult.winnerId, reason: 'timeout' });
          });
        });
      }
    });

    // ------------------------------------------------------------------ //
    // pvp:submit-action
    // ------------------------------------------------------------------ //
    socket.on('pvp:submit-action', ({ action } = {}) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      try {
        const result = mm.submitAction(found.code, socket.userId, action);
        const match = mm.getMatch(found.code);
        if (!match) return;

        if (result === null) {
          const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
          const otherPlayer = match[otherPlayerKey];
          const otherSocket = otherPlayer ? io.sockets.sockets.get(otherPlayer.socketId) : null;
          if (otherSocket) otherSocket.emit('pvp:opening-action-submitted');
          return;
        }

        const p1Socket = io.sockets.sockets.get(match.player1.socketId);
        const p2Socket = io.sockets.sockets.get(match.player2.socketId);
        const base = {
          actionSegments: result.actionSegments,
          attacks: result.attacks,
          winner: result.winner,
          actionCursor: match.combat.actionCursor,
          openingResolved: match.combat.openingResolved
        };

        if (p1Socket) {
          p1Socket.emit('pvp:action-result', {
            ...base,
            allies: result.sideA,
            enemies: result.sideB
          });
        }
        if (p2Socket) {
          p2Socket.emit('pvp:action-result', {
            ...base,
            allies: result.sideB,
            enemies: result.sideA
          });
        }

        mm.saveMatch(found.code);

        if (result.winner) {
          const winnerId = match.winnerId;
          const winnerName = winnerId === match.player1.userId
            ? match.player1.username
            : winnerId === match.player2?.userId
              ? match.player2.username
              : null;
          io.to(found.code).emit('pvp:match-end', { winnerId, winnerName });
        }
      } catch (error) {
        socket.emit('pvp:error', { message: error.message });
      }
    });

    // ------------------------------------------------------------------ //
    // pvp:request-rematch
    // ------------------------------------------------------------------ //
    socket.on('pvp:request-rematch', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const rematchResult = mm.requestRematch(found.code, socket.userId);

      if (rematchResult === 'rematch') {
        io.to(found.code).emit('pvp:rematch-start');
      } else if (rematchResult === 'waiting') {
        const match = mm.getMatch(found.code);
        if (match) {
          const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
          const otherPlayer = match[otherPlayerKey];
          if (otherPlayer) {
            const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
            if (otherSocket) {
              otherSocket.emit('pvp:opponent-wants-rematch');
            }
          }
        }
      }
    });

    // ------------------------------------------------------------------ //
    // pvp:leave-match
    // ------------------------------------------------------------------ //
    socket.on('pvp:leave-match', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const otherPlayer = mm.leaveMatch(found.code, socket.userId);
      if (otherPlayer) {
        const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
        if (otherSocket) {
          otherSocket.emit('pvp:rematch-cancelled');
        }
      }
      socket.leave(found.code);
    });

    // ------------------------------------------------------------------ //
    // pvp:reconnect
    // ------------------------------------------------------------------ //
    socket.on('pvp:reconnect', ({ matchCode } = {}) => {
      const reconnected = mm.reconnect(matchCode, socket.userId, socket.id);
      if (!reconnected) {
        socket.emit('pvp:error', { message: 'Match not found or cannot reconnect' });
        return;
      }

      socket.join(matchCode);

      const match = mm.getMatch(matchCode);
      socket.emit('pvp:reconnected', { currentState: match });

      // Notify the other player
      const found = mm.findMatchBySocket(socket.id);
      if (found) {
        const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherPlayer = match[otherPlayerKey];
        if (otherPlayer) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('pvp:opponent-reconnected');
          }
        }
      }
    });

    // ------------------------------------------------------------------ //
    // disconnect
    // ------------------------------------------------------------------ //
    socket.on('disconnect', () => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const { code } = found;

      // Start a 30-second grace period before forfeiting
      const timeout = setTimeout(() => {
        disconnectTimers.delete(socket.userId);

        // Read match BEFORE forfeit deletes it (need otherPlayer reference)
        const match = mm.getMatch(code);
        if (!match) return;

        // Award victory to the remaining player
        const forfeitResult = mm.forfeitMatch(code, socket.userId);

        // Notify the remaining player they won by forfeit
        const otherPlayerKey = found.playerKey === 'player1' ? 'player2' : 'player1';
        const otherPlayer = match[otherPlayerKey];
        if (otherPlayer && forfeitResult) {
          const otherSocket = io.sockets.sockets.get(otherPlayer.socketId);
          if (otherSocket) {
            otherSocket.emit('pvp:match-forfeit', {
              winnerId: forfeitResult.winnerId,
              reason: 'opponent_disconnected'
            });
          }
        }
      }, 30000);

      disconnectTimers.set(socket.userId, { timeout, matchCode: code });
    });
  });

  return { mm, io };
}
