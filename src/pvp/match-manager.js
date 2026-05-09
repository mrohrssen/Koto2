import { writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveOpeningActions, resolvePvpCursorAction, resolveRound } from './pvp-combat.js';
import { applyDebugSuperAttack } from '../game/loop.js';
import { backfillCreatureListUids } from '../game/creatures.js';

// Characters excluding easily confused ones (no I, O, 0, 1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class MatchManager {
  /**
   * @param {object} [options]
   * @param {Function} [options.resolveRoundFn] - Override for testing; defaults to the real resolveRound
   * @param {string} [options.dataDir] - Directory for persisting match state to disk
   */
  constructor(options = {}) {
    /** @type {Map<string, object>} matchCode -> MatchState */
    this.matches = new Map();
    /** @type {Map<string, string>} socketId -> matchCode */
    this.socketToMatch = new Map();
    /** @type {Function} */
    this._resolveRound = options.resolveRoundFn || resolveRound;
    /** @type {Function} */
    this._resolveOpeningActions = options.resolveOpeningActionsFn || resolveOpeningActions;
    /** @type {Function} */
    this._resolveCursorAction = options.resolveCursorActionFn || resolvePvpCursorAction;
    /** @type {Map<string, NodeJS.Timeout>} matchCode -> round timer */
    this._roundTimers = new Map();
    /** @type {string|null} */
    this._dataDir = options.dataDir || null;
    /** @type {Function|null} */
    this._getSettings = options.getSettings || null;
  }

  /**
   * Generate a unique 4-character alphanumeric code.
   * Excludes I/O/0/1 for readability.
   * @returns {string}
   */
  _generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
    } while (this.matches.has(code));
    return code;
  }

  /**
   * Create a new match.
   * @param {string} userId
   * @param {string} socketId
   * @returns {string} The match code
   */
  createMatch(userId, socketId) {
    const code = this._generateCode();
    const match = {
      code,
      player1: {
        userId,
        socketId,
        team: null,
        ready: false,
        movesSubmitted: null,
        wantsRematch: false
      },
      player2: null,
      phase: 'waiting',
      combat: null,
      winnerId: null,
      winnerName: null,
      createdAt: Date.now()
    };
    this.matches.set(code, match);
    this.socketToMatch.set(socketId, code);
    return code;
  }

  /**
   * Join an existing match.
   * @param {string} code
   * @param {string} userId
   * @param {string} socketId
   * @returns {boolean} true if joined successfully
   */
  joinMatch(code, userId, socketId) {
    const match = this.matches.get(code);
    if (!match) return false;
    if (match.player2 !== null) return false;

    match.player2 = {
      userId,
      socketId,
      team: null,
      ready: false,
      movesSubmitted: null,
      wantsRematch: false
    };
    match.phase = 'team_select';
    this.socketToMatch.set(socketId, code);
    return true;
  }

  /**
   * Get match state by code.
   * @param {string} code
   * @returns {object|null}
   */
  getMatch(code) {
    return this.matches.get(code) || null;
  }

  /**
   * Find match by socket ID.
   * @param {string} socketId
   * @returns {{ code: string, match: object, playerKey: string }|null}
   */
  findMatchBySocket(socketId) {
    const code = this.socketToMatch.get(socketId);
    if (!code) return null;
    const match = this.matches.get(code);
    if (!match) return null;

    let playerKey = null;
    if (match.player1 && match.player1.socketId === socketId) {
      playerKey = 'player1';
    } else if (match.player2 && match.player2.socketId === socketId) {
      playerKey = 'player2';
    }

    if (!playerKey) return null;
    return { code, match, playerKey };
  }

  /**
   * Set team data for a player.
   * @param {string} code
   * @param {string} userId
   * @param {object} teamData
   * @returns {boolean} true if team was set
   */
  selectTeam(code, userId, teamData) {
    const match = this.matches.get(code);
    if (!match) return false;

    const player = this._findPlayer(match, userId);
    if (!player) return false;

    player.team = teamData;
    return true;
  }

  /**
   * Mark a player as ready. If both are ready, starts battle.
   * @param {string} code
   * @param {string} userId
   * @returns {boolean} true if both players are now ready (battle started)
   */
  setReady(code, userId) {
    const match = this.matches.get(code);
    if (!match) return false;

    const player = this._findPlayer(match, userId);
    if (!player) return false;

    player.ready = true;

    if (match.player1 && match.player1.ready && match.player2 && match.player2.ready) {
      this._startBattle(match);
      return true;
    }
    return false;
  }

  /**
   * Submit moves for a player. When both have submitted, resolves the round.
   * @param {string} code
   * @param {string} userId
   * @param {object[]} moveChoices
   * @returns {object|null} Round result when both submitted, null otherwise
   */
  submitMoves(code, userId, moveChoices) {
    const match = this.matches.get(code);
    if (!match || !match.combat) return null;

    const player = this._findPlayer(match, userId);
    if (!player) return null;

    player.movesSubmitted = moveChoices;

    // Check if both players have submitted
    if (!match.player1.movesSubmitted || !match.player2.movesSubmitted) {
      return null;
    }

    // Both submitted — resolve
    const { combat } = match;
    const result = this._resolveRound(
      combat.sideA,
      combat.sideB,
      match.player1.movesSubmitted,
      match.player2.movesSubmitted,
      {
        partyA: combat.partyA,
        partyB: combat.partyB,
        partySkillsA: combat.partySkillsA,
        partySkillsB: combat.partySkillsB,
        combatA: combat.combatA,
        combatB: combat.combatB
      }
    );

    // Clear submissions and increment round
    match.player1.movesSubmitted = null;
    match.player2.movesSubmitted = null;
    combat.round++;

    this._applyPvpResult(match, result);

    return result;
  }

  submitAction(code, userId, action) {
    const match = this.matches.get(code);
    if (!match || !match.combat || match.phase !== 'battle') return null;

    const side = this._sideForPlayer(match, userId);
    if (!side) return null;

    const { combat } = match;

    if (!combat.openingResolved) {
      combat.openingActions ||= { sideA: null, sideB: null };
      combat.openingActions[side] = action;
      if (!combat.openingActions.sideA || !combat.openingActions.sideB) return null;

      const result = this._resolveOpeningActions({
        sideA: combat.sideA,
        sideB: combat.sideB,
        actionA: combat.openingActions.sideA,
        actionB: combat.openingActions.sideB,
        options: {
          partyA: combat.partyA,
          partyB: combat.partyB,
          partySkillsA: combat.partySkillsA,
          partySkillsB: combat.partySkillsB,
          combatA: combat.combatA,
          combatB: combat.combatB
        }
      });

      combat.openingResolved = true;
      combat.openingActions = { sideA: null, sideB: null };
      combat.actionCursor = result.nextCursor;
      combat.actionCount = (combat.actionCount || 0) + (result.actionSegments?.length || 0);
      this._applyPvpResult(match, result);
      return result;
    }

    if (!this._playerOwnsCursor(match, userId, combat.actionCursor)) {
      throw new Error('User is not the active player');
    }

    const result = this._resolveCursorAction({
      sideA: combat.sideA,
      sideB: combat.sideB,
      cursor: combat.actionCursor,
      action,
      partyA: combat.partyA,
      partyB: combat.partyB,
      partySkillsA: combat.partySkillsA,
      partySkillsB: combat.partySkillsB,
      combatA: combat.combatA,
      combatB: combat.combatB
    });

    combat.actionCursor = result.nextCursor;
    combat.actionCount = (combat.actionCount || 0) + 1;
    this._applyPvpResult(match, result);
    return result;
  }

  /**
   * Request a rematch.
   * @param {string} code
   * @param {string} userId
   * @returns {'waiting'|'rematch'|null} 'rematch' if both want it, 'waiting' if only one, null if invalid
   */
  requestRematch(code, userId) {
    const match = this.matches.get(code);
    if (!match) return null;

    const player = this._findPlayer(match, userId);
    if (!player) return null;

    player.wantsRematch = true;

    // Check if both want rematch
    if (match.player1.wantsRematch && match.player2 && match.player2.wantsRematch) {
      // Reset for new game
      match.phase = 'team_select';
      match.combat = null;
      match.winnerId = null;
      match.winnerName = null;
      match.player1.team = null;
      match.player1.ready = false;
      match.player1.movesSubmitted = null;
      match.player1.wantsRematch = false;
      match.player2.team = null;
      match.player2.ready = false;
      match.player2.movesSubmitted = null;
      match.player2.wantsRematch = false;
      return 'rematch';
    }

    return 'waiting';
  }

  /**
   * Forfeit a match — award victory to the other player.
   * @param {string} code - Match code
   * @param {string} forfeitUserId - The user who forfeits
   * @returns {{ winnerId: string, loserId: string, reason: string }|null}
   */
  forfeitMatch(code, forfeitUserId) {
    const match = this.matches.get(code);
    if (!match) return null;

    const winnerKey = match.player1?.userId === forfeitUserId ? 'player2' : 'player1';
    const winnerId = match[winnerKey]?.userId;
    if (!winnerId) return null;

    // Clean up socket mappings and round timer
    if (match.player1) this.socketToMatch.delete(match.player1.socketId);
    if (match.player2) this.socketToMatch.delete(match.player2.socketId);
    this.clearRoundTimer(code);
    this.deleteMatchFile(code);
    this.matches.delete(code);

    return { winnerId, loserId: forfeitUserId, reason: 'forfeit' };
  }

  /**
   * Remove a match and clean up socket mappings.
   * @param {string} code
   * @param {string} userId
   * @returns {object|null} The other player object, or null
   */
  leaveMatch(code, userId) {
    const match = this.matches.get(code);
    if (!match) return null;

    let otherPlayer = null;

    // Clean up socket mappings for both players
    if (match.player1) {
      if (match.player1.userId === userId) {
        otherPlayer = match.player2;
      }
      this.socketToMatch.delete(match.player1.socketId);
    }
    if (match.player2) {
      if (match.player2.userId === userId) {
        otherPlayer = match.player1;
      }
      this.socketToMatch.delete(match.player2.socketId);
    }

    this.clearRoundTimer(code);
    this.deleteMatchFile(code);
    this.matches.delete(code);
    return otherPlayer;
  }

  /**
   * Update socket mapping for a reconnecting player.
   * @param {string} code
   * @param {string} userId
   * @param {string} newSocketId
   * @returns {boolean} true if reconnected
   */
  reconnect(code, userId, newSocketId) {
    const match = this.matches.get(code);
    if (!match) return false;

    const player = this._findPlayer(match, userId);
    if (!player) return false;

    // Remove old socket mapping
    this.socketToMatch.delete(player.socketId);
    // Update to new socket
    player.socketId = newSocketId;
    this.socketToMatch.set(newSocketId, code);
    return true;
  }

  /**
   * Start a round timer that fires onTimeout if not cleared in time.
   * @param {string} code - Match code
   * @param {number} durationMs - Timeout duration in milliseconds
   * @param {Function} onTimeout - Callback receiving the match code
   */
  startRoundTimer(code, durationMs, onTimeout) {
    this.clearRoundTimer(code);
    const timer = setTimeout(() => {
      this._roundTimers.delete(code);
      onTimeout(code);
    }, durationMs);
    this._roundTimers.set(code, timer);
  }

  /**
   * Cancel a pending round timer.
   * @param {string} code - Match code
   */
  clearRoundTimer(code) {
    const timer = this._roundTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      this._roundTimers.delete(code);
    }
  }

  /**
   * Persist a match to disk as JSON.
   * No-op if dataDir was not configured.
   * @param {string} code - Match code
   */
  saveMatch(code) {
    if (!this._dataDir) return;
    const match = this.matches.get(code);
    if (!match) return;
    const filePath = join(this._dataDir, `.pvp-match-${code}.json`);
    writeFileSync(filePath, JSON.stringify(match, null, 2));
  }

  /**
   * Delete a persisted match file from disk.
   * No-op if dataDir was not configured.
   * @param {string} code - Match code
   */
  deleteMatchFile(code) {
    if (!this._dataDir) return;
    const filePath = join(this._dataDir, `.pvp-match-${code}.json`);
    try { unlinkSync(filePath); } catch (e) { /* file may not exist */ }
  }

  /**
   * Restore all persisted matches from disk into memory.
   * @returns {number} Number of matches restored
   */
  restoreMatches() {
    if (!this._dataDir || !existsSync(this._dataDir)) return 0;
    let count = 0;
    const files = readdirSync(this._dataDir).filter(f => f.startsWith('.pvp-match-') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(this._dataDir, file), 'utf-8'));
        if (data.code) {
          // Backfill uids on persisted match data so matches written before
          // the uid migration still work after a server restart.
          backfillCreatureListUids(data.combat?.sideA);
          backfillCreatureListUids(data.combat?.sideB);
          backfillCreatureListUids(data.combat?.partyA?.active);
          backfillCreatureListUids(data.combat?.partyA?.reserves);
          backfillCreatureListUids(data.combat?.partyB?.active);
          backfillCreatureListUids(data.combat?.partyB?.reserves);
          backfillCreatureListUids(data.player1?.team?.creatureParty?.active);
          backfillCreatureListUids(data.player1?.team?.creatureParty?.reserves);
          backfillCreatureListUids(data.player2?.team?.creatureParty?.active);
          backfillCreatureListUids(data.player2?.team?.creatureParty?.reserves);
          this.matches.set(data.code, data);
          count++;
        }
      } catch (e) { /* skip corrupt files */ }
    }
    return count;
  }

  /**
   * Initialize combat state from both players' teams.
   * Deep-clones teams, restores full HP/MP, clears activeEffects.
   * @param {object} match
   */
  _startBattle(match) {
    const teamA = match.player1.team;
    const teamB = match.player2.team;

    const sideA = deepCloneCreatures(teamA.creatureParty.active);
    const sideB = deepCloneCreatures(teamB.creatureParty.active);

    // Restore full HP/MP and clear effects
    for (const creatures of [sideA, sideB]) {
      for (const c of creatures) {
        c.hp = c.maxHp;
        c.mp = c.maxMp;
        c.activeEffects = [];
      }
    }

    if (this._getSettings?.()?.debugSuperAttack) {
      applyDebugSuperAttack(sideA);
      applyDebugSuperAttack(sideB);
    }

    match.phase = 'battle';
    match.combat = {
      sideA,
      sideB,
      partyA: {
        active: sideA,
        reserves: deepCloneCreatures(teamA.creatureParty.reserves || [])
      },
      partyB: {
        active: sideB,
        reserves: deepCloneCreatures(teamB.creatureParty.reserves || [])
      },
      partySkillsA: teamA.partySkills || [],
      partySkillsB: teamB.partySkills || [],
      combatA: { partySkillCounters: {} },
      combatB: { partySkillCounters: {} },
      round: 1,
      openingResolved: false,
      openingActions: { sideA: null, sideB: null },
      actionCursor: null,
      actionCount: 0
    };
  }

  _applyPvpResult(match, result) {
    if (!result?.winner) return;
    match.phase = 'finished';
    if (result.winner === 'sideA') {
      match.winnerId = match.player1.userId;
    } else if (result.winner === 'sideB') {
      match.winnerId = match.player2.userId;
    } else {
      match.winnerId = 'draw';
    }
  }

  _sideForPlayer(match, userId) {
    if (match.player1?.userId === userId) return 'sideA';
    if (match.player2?.userId === userId) return 'sideB';
    return null;
  }

  _playerOwnsCursor(match, userId, cursor) {
    return this._sideForPlayer(match, userId) === cursor?.side;
  }

  /**
   * Find the player object within a match by userId.
   * @param {object} match
   * @param {string} userId
   * @returns {object|null}
   */
  _findPlayer(match, userId) {
    if (match.player1 && match.player1.userId === userId) return match.player1;
    if (match.player2 && match.player2.userId === userId) return match.player2;
    return null;
  }
}

/**
 * Deep-clone an array of creature objects and regenerate every uid.
 * Cloning creates conceptually independent instances — they must not share
 * uids with the source roster. Regenerating uids on clone also defeats a
 * client-supplied uid collision attack (any uid the client sent up in a
 * PvP team is replaced at battle start).
 * @param {object[]} creatures
 * @returns {object[]}
 */
function deepCloneCreatures(creatures) {
  const clones = JSON.parse(JSON.stringify(creatures));
  if (Array.isArray(clones)) {
    for (const c of clones) {
      if (c && typeof c === 'object') c.uid = crypto.randomUUID();
    }
  }
  return clones;
}
