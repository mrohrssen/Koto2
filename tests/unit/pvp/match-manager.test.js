import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MatchManager } from '../../../src/pvp/match-manager.js';

function makeTeam() {
  return {
    creatureParty: {
      active: [{
        id: 'c1', name: 'テスト', nameEn: 'Test', element: 'neutral', level: 5,
        hp: 100, maxHp: 100, mp: 20, maxMp: 20, attack: 15, defense: 5,
        baseWord: '試す', baseReading: 'ためす', baseMeaning: 'test',
        activeEffects: [],
        moves: [{ id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
          element: 'neutral', category: 'damage', power: 40,
          target: 'single_enemy', mpCost: 3, accuracy: 100,
          statusEffect: null, statusChance: 0, statusDuration: 0 }]
      }],
      reserves: []
    },
    partySkills: [],
    itemBuffs: {},
    savedAt: Date.now()
  };
}

/** Default mock that returns no winner */
function makeMockResolveRound(overrides = {}) {
  return mock.fn(() => ({
    attacks: [],
    effectEvents: [],
    koSwaps: [],
    mpRegens: [],
    winner: null,
    sideA: [],
    sideB: [],
    ...overrides
  }));
}

describe('MatchManager', () => {
  let mgr;
  let mockResolve;

  beforeEach(() => {
    mockResolve = makeMockResolveRound();
    mgr = new MatchManager({ resolveRoundFn: mockResolve });
  });

  describe('createMatch', () => {
    it('creates a match with a 4-char code', () => {
      const code = mgr.createMatch('user1', 'sock1');

      assert.strictEqual(code.length, 4);
      assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/, 'code should only contain readable chars');

      const match = mgr.getMatch(code);
      assert.ok(match);
      assert.strictEqual(match.phase, 'waiting');
      assert.strictEqual(match.player1.userId, 'user1');
      assert.strictEqual(match.player1.socketId, 'sock1');
      assert.strictEqual(match.player2, null);
    });

    it('generates unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 50; i++) {
        codes.add(mgr.createMatch(`u${i}`, `s${i}`));
      }
      assert.strictEqual(codes.size, 50, 'all 50 codes should be unique');
    });
  });

  describe('joinMatch', () => {
    it('second player can join a waiting match', () => {
      const code = mgr.createMatch('user1', 'sock1');
      const joined = mgr.joinMatch(code, 'user2', 'sock2');

      assert.strictEqual(joined, true);

      const match = mgr.getMatch(code);
      assert.strictEqual(match.phase, 'team_select');
      assert.strictEqual(match.player2.userId, 'user2');
      assert.strictEqual(match.player2.socketId, 'sock2');
    });

    it('rejects joining a full match', () => {
      const code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');

      const result = mgr.joinMatch(code, 'user3', 'sock3');
      assert.strictEqual(result, false);
    });

    it('rejects an invalid match code', () => {
      const result = mgr.joinMatch('ZZZZ', 'user2', 'sock2');
      assert.strictEqual(result, false);
    });
  });

  describe('getMatch', () => {
    it('returns null for nonexistent code', () => {
      assert.strictEqual(mgr.getMatch('NOPE'), null);
    });
  });

  describe('selectTeam and setReady', () => {
    let code;

    beforeEach(() => {
      code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');
    });

    it('sets teams for both players', () => {
      const team = makeTeam();
      const ok1 = mgr.selectTeam(code, 'user1', team);
      const ok2 = mgr.selectTeam(code, 'user2', team);

      assert.strictEqual(ok1, true);
      assert.strictEqual(ok2, true);

      const match = mgr.getMatch(code);
      assert.ok(match.player1.team);
      assert.ok(match.player2.team);
    });

    it('both ready transitions to battle phase', () => {
      const team = makeTeam();
      mgr.selectTeam(code, 'user1', team);
      mgr.selectTeam(code, 'user2', team);

      const ready1 = mgr.setReady(code, 'user1');
      assert.strictEqual(ready1, false, 'only one player ready');

      const ready2 = mgr.setReady(code, 'user2');
      assert.strictEqual(ready2, true, 'both players ready');

      const match = mgr.getMatch(code);
      assert.strictEqual(match.phase, 'battle');
      assert.ok(match.combat, 'combat state should be initialized');
      assert.strictEqual(match.combat.round, 1);
      assert.ok(match.combat.sideA.length > 0);
      assert.ok(match.combat.sideB.length > 0);
    });

    it('_startBattle deep-clones teams and restores HP/MP', () => {
      const team = makeTeam();
      // Damage the creature before battle starts
      team.creatureParty.active[0].hp = 50;
      team.creatureParty.active[0].mp = 5;
      team.creatureParty.active[0].activeEffects = [{ type: 'poison' }];

      mgr.selectTeam(code, 'user1', team);
      mgr.selectTeam(code, 'user2', makeTeam());
      mgr.setReady(code, 'user1');
      mgr.setReady(code, 'user2');

      const match = mgr.getMatch(code);
      const combatCreature = match.combat.sideA[0];

      // Should be restored to full
      assert.strictEqual(combatCreature.hp, combatCreature.maxHp);
      assert.strictEqual(combatCreature.mp, combatCreature.maxMp);
      assert.deepStrictEqual(combatCreature.activeEffects, []);

      // Should be a deep clone (not the same reference)
      assert.notStrictEqual(combatCreature, team.creatureParty.active[0]);
    });
  });

  describe('submitMoves', () => {
    let code;

    beforeEach(() => {
      code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');
      mgr.selectTeam(code, 'user1', makeTeam());
      mgr.selectTeam(code, 'user2', makeTeam());
      mgr.setReady(code, 'user1');
      mgr.setReady(code, 'user2');
    });

    it('returns null when only one player has submitted', () => {
      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      const result = mgr.submitMoves(code, 'user1', moves);
      assert.strictEqual(result, null);
    });

    it('resolves round when both players submit', () => {
      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];

      mgr.submitMoves(code, 'user1', moves);
      const result = mgr.submitMoves(code, 'user2', moves);

      assert.ok(result, 'should return round result');
      assert.strictEqual(mockResolve.mock.callCount(), 1, 'resolveRound should be called once');

      // Check round was incremented
      const match = mgr.getMatch(code);
      assert.strictEqual(match.combat.round, 2);

      // Moves should be cleared
      assert.strictEqual(match.player1.movesSubmitted, null);
      assert.strictEqual(match.player2.movesSubmitted, null);
    });

    it('sets phase to finished when resolveRound returns a winner', () => {
      mockResolve.mock.mockImplementation(() => ({
        attacks: [],
        effectEvents: [],
        koSwaps: [],
        mpRegens: [],
        winner: 'sideA',
        sideA: [],
        sideB: []
      }));

      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      mgr.submitMoves(code, 'user1', moves);
      const result = mgr.submitMoves(code, 'user2', moves);

      assert.ok(result);
      const match = mgr.getMatch(code);
      assert.strictEqual(match.phase, 'finished');
      assert.strictEqual(match.winnerId, 'user1');
    });

    it('sets winnerId for sideB winner', () => {
      mockResolve.mock.mockImplementation(() => ({
        attacks: [],
        effectEvents: [],
        koSwaps: [],
        mpRegens: [],
        winner: 'sideB',
        sideA: [],
        sideB: []
      }));

      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      mgr.submitMoves(code, 'user1', moves);
      mgr.submitMoves(code, 'user2', moves);

      const match = mgr.getMatch(code);
      assert.strictEqual(match.winnerId, 'user2');
    });

    it('sets winnerId to draw when result is draw', () => {
      mockResolve.mock.mockImplementation(() => ({
        attacks: [],
        effectEvents: [],
        koSwaps: [],
        mpRegens: [],
        winner: 'draw',
        sideA: [],
        sideB: []
      }));

      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      mgr.submitMoves(code, 'user1', moves);
      mgr.submitMoves(code, 'user2', moves);

      const match = mgr.getMatch(code);
      assert.strictEqual(match.winnerId, 'draw');
    });
  });

  describe('requestRematch', () => {
    let code;

    beforeEach(() => {
      code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');
    });

    it('returns waiting when only one player requests', () => {
      const result = mgr.requestRematch(code, 'user1');
      assert.strictEqual(result, 'waiting');
    });

    it('returns rematch and resets state when both request', () => {
      mgr.requestRematch(code, 'user1');
      const result = mgr.requestRematch(code, 'user2');

      assert.strictEqual(result, 'rematch');

      const match = mgr.getMatch(code);
      assert.strictEqual(match.phase, 'team_select');
      assert.strictEqual(match.combat, null);
      assert.strictEqual(match.winnerId, null);
      assert.strictEqual(match.winnerName, null);
      assert.strictEqual(match.player1.team, null);
      assert.strictEqual(match.player1.ready, false);
      assert.strictEqual(match.player1.movesSubmitted, null);
      assert.strictEqual(match.player1.wantsRematch, false);
      assert.strictEqual(match.player2.team, null);
      assert.strictEqual(match.player2.ready, false);
      assert.strictEqual(match.player2.movesSubmitted, null);
      assert.strictEqual(match.player2.wantsRematch, false);
    });

    it('returns null for invalid match code', () => {
      const result = mgr.requestRematch('NOPE', 'user1');
      assert.strictEqual(result, null);
    });
  });

  describe('leaveMatch', () => {
    it('cleans up match and socket mappings', () => {
      const code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');

      const other = mgr.leaveMatch(code, 'user1');

      assert.strictEqual(other.userId, 'user2', 'returns the other player');
      assert.strictEqual(mgr.getMatch(code), null, 'match should be removed');
      assert.strictEqual(mgr.findMatchBySocket('sock1'), null, 'socket1 mapping removed');
      assert.strictEqual(mgr.findMatchBySocket('sock2'), null, 'socket2 mapping removed');
    });

    it('returns null when leaving with only one player', () => {
      const code = mgr.createMatch('user1', 'sock1');
      const other = mgr.leaveMatch(code, 'user1');

      assert.strictEqual(other, null);
      assert.strictEqual(mgr.getMatch(code), null);
    });

    it('returns null for invalid code', () => {
      const other = mgr.leaveMatch('NOPE', 'user1');
      assert.strictEqual(other, null);
    });
  });

  describe('forfeitMatch', () => {
    it('forfeitMatch awards victory to remaining player and cleans up', () => {
      const code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');

      const result = mgr.forfeitMatch(code, 'user1');

      assert.equal(result.winnerId, 'user2');
      assert.equal(result.loserId, 'user1');
      assert.equal(result.reason, 'forfeit');
      // Match should be cleaned up
      assert.equal(mgr.getMatch(code), null);
    });

    it('forfeitMatch returns null for unknown match', () => {
      const result = mgr.forfeitMatch('XXXX', 'user1');
      assert.equal(result, null);
    });
  });

  describe('findMatchBySocket', () => {
    it('finds match by player1 socket', () => {
      const code = mgr.createMatch('user1', 'sock1');
      const found = mgr.findMatchBySocket('sock1');

      assert.ok(found);
      assert.strictEqual(found.code, code);
      assert.strictEqual(found.playerKey, 'player1');
    });

    it('finds match by player2 socket', () => {
      const code = mgr.createMatch('user1', 'sock1');
      mgr.joinMatch(code, 'user2', 'sock2');

      const found = mgr.findMatchBySocket('sock2');
      assert.ok(found);
      assert.strictEqual(found.code, code);
      assert.strictEqual(found.playerKey, 'player2');
    });

    it('returns null for unknown socket', () => {
      assert.strictEqual(mgr.findMatchBySocket('unknown'), null);
    });
  });

  describe('reconnect', () => {
    it('updates socket mapping for reconnecting player', () => {
      const code = mgr.createMatch('user1', 'sock1');

      const ok = mgr.reconnect(code, 'user1', 'sock1-new');
      assert.strictEqual(ok, true);

      // Old socket should not find anything
      assert.strictEqual(mgr.findMatchBySocket('sock1'), null);

      // New socket should find the match
      const found = mgr.findMatchBySocket('sock1-new');
      assert.ok(found);
      assert.strictEqual(found.code, code);
      assert.strictEqual(found.playerKey, 'player1');
    });

    it('returns false for invalid code', () => {
      assert.strictEqual(mgr.reconnect('NOPE', 'user1', 'sock-new'), false);
    });

    it('returns false for unknown user', () => {
      const code = mgr.createMatch('user1', 'sock1');
      assert.strictEqual(mgr.reconnect(code, 'unknown', 'sock-new'), false);
    });
  });
});
