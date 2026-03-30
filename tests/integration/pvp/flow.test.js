import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MatchManager } from '../../../src/pvp/match-manager.js';

function makeTeam() {
  return {
    creatureParty: {
      active: [{
        id: 'c1', name: 'テスト', nameEn: 'TestA', element: 'fire', level: 5,
        hp: 100, maxHp: 100, mp: 20, maxMp: 20, attack: 15, defense: 5,
        baseWord: '火', baseReading: 'ひ', baseMeaning: 'fire',
        activeEffects: [],
        moves: [{ id: 'slash', name: '斬る', nameEn: 'Slash', reading: 'きる',
          element: 'fire', category: 'damage', power: 40,
          target: 'single_enemy', mpCost: 3, accuracy: 100,
          statusEffect: null, statusChance: 0, statusDuration: 0 }]
      }],
      reserves: []
    },
    partySkills: [],
    itemBuffs: {}
  };
}

describe('PvP full flow', () => {
  let mm;
  beforeEach(() => { mm = new MatchManager(); });

  it('runs a complete match from create to winner', () => {
    // 1. Create + join
    const code = mm.createMatch('user1', 's1');
    mm.joinMatch(code, 'user2', 's2');

    // 2. Team select + ready
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    const match = mm.getMatch(code);
    assert.equal(match.phase, 'battle');

    // 3. Play rounds until someone wins
    let result = null;
    let rounds = 0;
    const maxRounds = 50;
    while (rounds < maxRounds) {
      const moves = [{ creatureIndex: 0, moveId: 'slash', targetIndex: 0 }];
      mm.submitMoves(code, 'user1', moves);
      result = mm.submitMoves(code, 'user2', moves);
      rounds++;
      if (result?.winner) break;
    }

    assert.ok(result?.winner, `Should have a winner within ${maxRounds} rounds`);
    assert.equal(match.phase, 'finished');
  });

  it('runs rematch flow after match', () => {
    const code = mm.createMatch('user1', 's1');
    mm.joinMatch(code, 'user2', 's2');
    mm.selectTeam(code, 'user1', makeTeam());
    mm.selectTeam(code, 'user2', makeTeam());
    mm.setReady(code, 'user1');
    mm.setReady(code, 'user2');

    // Force finish
    const match = mm.getMatch(code);
    match.phase = 'finished';

    // Rematch
    mm.requestRematch(code, 'user1');
    const r = mm.requestRematch(code, 'user2');
    assert.equal(r, 'rematch');
    assert.equal(match.phase, 'team_select');
    assert.equal(match.player1.ready, false);
    assert.equal(match.player2.ready, false);
  });
});
