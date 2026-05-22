import { MatchManager } from './match-manager.js';
import { verifyToken } from '../auth/middleware.js';
import { getDataDir } from '../data-dir.js';
import { getManager as defaultGetManager, saveManager as defaultSaveManager } from '../game/manager-registry.js';
import { RankedMatchQueue } from './ranked-match-queue.js';
import { normalizeRankedState, getDisplayRating } from './ranked-rating.js';
import { applyRankedMatchResult, rankedResultForUser } from './ranked-result-service.js';
import { createBotUsernameBatch, listBotUsers } from './bot-account-service.js';
import { generateRankedBotBatch } from './bot-generation.js';
import { selectBotForRating, ActiveBotTracker } from './bot-match-service.js';
import { chooseBotPvpAction } from './bot-action-ai.js';
import { getPvpSummary } from '../routes/game/pvp.js';

const ROUND_TIMEOUT_MS = 60000;
const BUILT_IN_BOT_COUNT = 100;
const BUILT_IN_BOT_SEED = 'ranked-bots-v1';

function createBuiltInRankedBotCandidates() {
  const usernames = createBotUsernameBatch({
    count: BUILT_IN_BOT_COUNT,
    seed: BUILT_IN_BOT_SEED,
    existingUsernames: new Set()
  });
  return generateRankedBotBatch({
    count: BUILT_IN_BOT_COUNT,
    seed: BUILT_IN_BOT_SEED,
    usernames
  }).map(bot => ({
    id: `built-in-ranked-bot-${bot.index}`,
    userId: `built-in-ranked-bot-${bot.index}`,
    username: bot.username,
    displayRating: bot.displayRating,
    rating: bot.ranked.rating,
    team: bot.team
  }));
}

/**
 * Set up all PvP Socket.IO event handlers.
 * @param {import('socket.io').Server} io
 * @returns {{ mm: MatchManager, io: import('socket.io').Server, rankedQueue: RankedMatchQueue }}
 */
export function setupPvpSockets(io, {
  getSettings,
  getManager = defaultGetManager,
  saveManager = defaultSaveManager,
  listRankedBots = listBotUsers,
  getBotTeam = null
} = {}) {
  const mm = new MatchManager({ dataDir: getDataDir(), getSettings });
  const rankedQueue = new RankedMatchQueue();
  const botTracker = new ActiveBotTracker();
  const builtInRankedBots = createBuiltInRankedBotCandidates();

  const restored = mm.restoreMatches();
  if (restored > 0) console.log(`[PvP] Restored ${restored} active match(es) from disk`);

  // Map<userId, { timeout: NodeJS.Timeout, matchCode: string }>
  const disconnectTimers = new Map();

  function createRankedMatchForPair(player1, player2) {
    const code = mm.createPairedMatch(player1, player2, {
      ranked: true,
      rankedRatingBefore: {
        [player1.userId]: { rating: player1.rating, displayRating: player1.displayRating },
        [player2.userId]: { rating: player2.rating, displayRating: player2.displayRating }
      }
    });
    const p1Socket = io.sockets.sockets.get(player1.socketId);
    const p2Socket = io.sockets.sockets.get(player2.socketId);
    p1Socket?.join(code);
    p2Socket?.join(code);
    p1Socket?.emit('pvp:ranked-match-found', {
      code,
      opponentName: player2.username,
      opponentRating: player2.displayRating
    });
    p2Socket?.emit('pvp:ranked-match-found', {
      code,
      opponentName: player1.username,
      opponentRating: player1.displayRating
    });
  }

  function tryCreateRankedPair(now = Date.now()) {
    const pair = rankedQueue.findMatch(now);
    if (!pair) return false;
    createRankedMatchForPair(pair[0], pair[1]);
    return true;
  }

  function loadRankedBotCandidates() {
    const users = listRankedBots();
    const persisted = users.map(user => {
      const gm = getManager(user.id);
      const summary = getPvpSummary(gm);
      const team = getBotTeam?.(user.id, gm) || summary.pvpTeams?.find(Boolean);
      if (!team) return null;
      return {
        id: user.id,
        userId: user.id,
        username: user.username,
        displayRating: summary.ranked.rating,
        rating: gm.meta.pvpRanked.rating,
        team
      };
    }).filter(Boolean);
    return persisted.length > 0 ? persisted : builtInRankedBots;
  }

  function createRankedBotMatch(human, bot) {
    rankedQueue.dequeue(human.userId);
    const code = mm.createPairedMatch(human, {
      userId: bot.userId,
      username: bot.username,
      socketId: null,
      isBot: true
    }, {
      ranked: true,
      rankedRatingBefore: {
        [human.userId]: { rating: human.rating, displayRating: human.displayRating },
        [bot.userId]: { rating: bot.rating, displayRating: bot.displayRating }
      }
    });
    botTracker.markActive(bot.userId, code);
    const humanSocket = io.sockets.sockets.get(human.socketId);
    humanSocket?.join(code);
    humanSocket?.emit('pvp:ranked-match-found', {
      code,
      opponentName: bot.username,
      opponentRating: bot.displayRating
    });
    mm.selectBotTeamAndReady(code, bot.userId, bot.team);
    return code;
  }

  function tryCreateRankedBotMatches(now = Date.now()) {
    let created = false;
    for (const entry of rankedQueue.getBotFallbackEntries(now)) {
      const bot = selectBotForRating({
        targetRating: entry.displayRating,
        bots: loadRankedBotCandidates(),
        activeBotIds: botTracker.activeBotIds
      });
      if (bot) {
        createRankedBotMatch(entry, bot);
        created = true;
      }
    }
    return created;
  }

  const queueTick = setInterval(() => {
    const now = Date.now();
    for (const entry of rankedQueue.getEntries()) {
      const queuedSocket = io.sockets.sockets.get(entry.socketId);
      queuedSocket?.emit('pvp:ranked-queue-update', {
        elapsedMs: Math.max(0, now - entry.enqueuedAt),
        searchRange: rankedQueue.getSearchRange(entry, now)
      });
    }
    tryCreateRankedPair(now);
    tryCreateRankedBotMatches(now);
  }, 1000);
  queueTick.unref?.();

  function persistRankedResult(match, winnerId) {
    try {
      return applyRankedMatchResult({ match, winnerId, getManager, saveManager });
    } catch (error) {
      console.warn('[PvP] Failed to persist ranked result:', error.message);
      return null;
    }
  }

  function emitMatchEndToPlayers(match, winnerId, winnerName) {
    const rankedUpdate = persistRankedResult(match, winnerId);
    const p1Socket = io.sockets.sockets.get(match.player1.socketId);
    const p2Socket = match.player2 ? io.sockets.sockets.get(match.player2.socketId) : null;
    if (p1Socket) {
      p1Socket.emit('pvp:match-end', {
        winnerId,
        winnerName,
        rankedResult: rankedResultForUser(rankedUpdate, match.player1.userId)
      });
    }
    if (p2Socket) {
      p2Socket.emit('pvp:match-end', {
        winnerId,
        winnerName,
        rankedResult: rankedResultForUser(rankedUpdate, match.player2.userId)
      });
    }
    botTracker.releaseByMatch(match.code);
  }

  function emitForfeitToPlayers(match, forfeitResult, reason) {
    const rankedUpdate = persistRankedResult(match, forfeitResult.winnerId);
    for (const player of [match.player1, match.player2]) {
      if (!player) continue;
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.emit('pvp:match-forfeit', {
        winnerId: forfeitResult.winnerId,
        reason,
        rankedResult: rankedResultForUser(rankedUpdate, player.userId)
      });
    }
    botTracker.releaseByMatch(match.code);
  }

  function emitMatchStartToPlayers(match) {
    const p1Socket = io.sockets.sockets.get(match.player1.socketId);
    const p2Socket = match.player2 ? io.sockets.sockets.get(match.player2.socketId) : null;

    if (p1Socket) {
      p1Socket.emit('pvp:match-start', {
        yourTeam: match.combat.sideA,
        opponentTeam: match.combat.sideB,
        opponentName: match.player2.username,
        mySide: 'sideA',
        actionCursor: match.combat.actionCursor,
        openingResolved: match.combat.openingResolved,
        ranked: match.ranked === true
      });
    }
    if (p2Socket) {
      p2Socket.emit('pvp:match-start', {
        yourTeam: match.combat.sideB,
        opponentTeam: match.combat.sideA,
        opponentName: match.player1.username,
        mySide: 'sideB',
        actionCursor: match.combat.actionCursor,
        openingResolved: match.combat.openingResolved,
        ranked: match.ranked === true
      });
    }
  }

  function emitActionResultToPlayers(match, result) {
    const p1Socket = io.sockets.sockets.get(match.player1.socketId);
    const p2Socket = match.player2 ? io.sockets.sockets.get(match.player2.socketId) : null;
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
  }

  function emitOpeningSubmittedToHuman(match) {
    for (const player of [match.player1, match.player2]) {
      if (!player || player.isBot) continue;
      const playerSocket = io.sockets.sockets.get(player.socketId);
      playerSocket?.emit('pvp:opening-action-submitted');
    }
  }

  function findHighestDexLivingIndex(creatures) {
    let bestIndex = null;
    let bestDex = -Infinity;
    let bestLevel = -Infinity;
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (!c || c.hp <= 0) continue;
      const dex = c.dex || 1;
      const level = c.level || 1;
      if (dex > bestDex || (dex === bestDex && level > bestLevel)) {
        bestIndex = i;
        bestDex = dex;
        bestLevel = level;
      }
    }
    return bestIndex;
  }

  function maybeRunBotAction(match) {
    if (!match?.combat || match.phase !== 'battle') return;
    const botKey = match.player1?.isBot ? 'player1' : match.player2?.isBot ? 'player2' : null;
    if (!botKey) return;
    const botSide = botKey === 'player1' ? 'sideA' : 'sideB';
    const botIndex = botSide === 'sideA'
      ? findHighestDexLivingIndex(match.combat.sideA)
      : findHighestDexLivingIndex(match.combat.sideB);
    const cursor = match.combat.openingResolved
      ? match.combat.actionCursor
      : { side: botSide, index: botIndex };
    const action = chooseBotPvpAction({
      botSide,
      cursor,
      sideA: match.combat.sideA,
      sideB: match.combat.sideB
    });
    if (!action) return;

    const result = mm.submitAction(match.code, match[botKey].userId, action);
    const updated = mm.getMatch(match.code);
    if (!updated) return;
    if (result === null) {
      emitOpeningSubmittedToHuman(updated);
      return;
    }

    emitActionResultToPlayers(updated, result);
    mm.saveMatch(updated.code);

    if (result.winner) {
      const winnerId = updated.winnerId;
      const winnerName = winnerId === updated.player1.userId
        ? updated.player1.username
        : winnerId === updated.player2?.userId
          ? updated.player2.username
          : null;
      emitMatchEndToPlayers(updated, winnerId, winnerName);
    } else {
      maybeRunBotAction(updated);
    }
  }

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
    // pvp:ranked-enqueue
    // ------------------------------------------------------------------ //
    socket.on('pvp:ranked-enqueue', () => {
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Already in ranked queue' });
        return;
      }
      if (mm.isUserInMatch(socket.userId)) {
        socket.emit('pvp:error', { message: 'Already in a PvP match' });
        return;
      }

      const gm = getManager(socket.userId);
      const meta = gm.getMeta ? gm.getMeta() : gm.meta;
      const hasTeam = (meta.pvpTeams || []).some(Boolean);
      if (!hasTeam) {
        socket.emit('pvp:error', { message: 'Save a PvP team before entering ranked queue' });
        return;
      }

      meta.pvpRanked = normalizeRankedState(meta.pvpRanked);
      const now = Date.now();
      const botDelayMs = 15000 + Math.floor(Math.random() * 7001);
      const entry = {
        userId: socket.userId,
        username: socket.username,
        socketId: socket.id,
        rating: meta.pvpRanked.rating,
        displayRating: getDisplayRating(meta.pvpRanked.rating),
        enqueuedAt: now,
        botFallbackAt: now + botDelayMs
      };
      rankedQueue.enqueue(entry);
      socket.emit('pvp:ranked-queued', {
        rating: entry.displayRating,
        searchRange: rankedQueue.getSearchRange(entry)
      });
      tryCreateRankedPair();
    });

    // ------------------------------------------------------------------ //
    // pvp:ranked-dequeue
    // ------------------------------------------------------------------ //
    socket.on('pvp:ranked-dequeue', () => {
      rankedQueue.dequeue(socket.userId);
      socket.emit('pvp:ranked-dequeued');
    });

    // ------------------------------------------------------------------ //
    // pvp:create-match
    // ------------------------------------------------------------------ //
    socket.on('pvp:create-match', () => {
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Leave ranked queue before creating a casual match' });
        return;
      }
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
      if (rankedQueue.hasUser(socket.userId)) {
        socket.emit('pvp:error', { message: 'Leave ranked queue before joining a casual match' });
        return;
      }
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
        emitMatchStartToPlayers(match);
        maybeRunBotAction(match);
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
        emitMatchEndToPlayers(match, winnerId, winnerName);
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

          emitForfeitToPlayers({ ...m, player1, player2 }, forfeitResult, 'timeout');
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
          if (otherPlayer?.isBot) maybeRunBotAction(match);
          return;
        }

        emitActionResultToPlayers(match, result);

        mm.saveMatch(found.code);

        if (result.winner) {
          const winnerId = match.winnerId;
          const winnerName = winnerId === match.player1.userId
            ? match.player1.username
            : winnerId === match.player2?.userId
              ? match.player2.username
              : null;
          emitMatchEndToPlayers(match, winnerId, winnerName);
        } else {
          maybeRunBotAction(match);
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

      const match = mm.getMatch(found.code);
      if (match?.ranked) {
        socket.emit('pvp:error', { message: 'Ranked rematch is not available' });
        return;
      }

      const rematchResult = mm.requestRematch(found.code, socket.userId);

      if (rematchResult === 'rematch') {
        io.to(found.code).emit('pvp:rematch-start');
      } else if (rematchResult === 'waiting') {
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
      botTracker.releaseByMatch(found.code);
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
    socket.on('pvp:reconnect', ({ matchCode, code } = {}) => {
      matchCode ||= code;
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
      rankedQueue.removeBySocket(socket.id);
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

        if (forfeitResult) emitForfeitToPlayers(match, forfeitResult, 'opponent_disconnected');
      }, 30000);

      disconnectTimers.set(socket.userId, { timeout, matchCode: code });
    });
  });

  return { mm, io, rankedQueue, botTracker };
}
