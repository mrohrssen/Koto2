import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickMove, pickTarget, pickSwap } from '../../engine/decisions.js';

describe('decisions', () => {
  describe('pickMove', () => {
    const waterMove = { id: 'water-blast', element: 'water', power: 50 };
    const fireMove = { id: 'fire-blast', element: 'fire', power: 50 };
    const natureMove = { id: 'vine-whip', element: 'nature', power: 50 };

    const fireEnemy = { element: 'fire', hp: 100 };

    it('with combatSkill 1.0, picks the type-advantaged move (water vs fire)', () => {
      const allies = [{ moves: [fireMove, waterMove, natureMove] }];

      // Run multiple times to be sure (combatSkill=1.0 means always pick best)
      for (let i = 0; i < 20; i++) {
        const result = pickMove(allies, 0, [fireEnemy], 0, 1.0);
        assert.equal(result.moveId, 'water-blast',
          'should always pick water-blast against fire enemy at skill=1.0');
        assert.equal(result.creatureIndex, 0);
        assert.equal(result.targetIndex, 0);
      }
    });

    it('with combatSkill 0.0, sometimes picks suboptimal moves', () => {
      const allies = [{ moves: [fireMove, waterMove, natureMove] }];
      const picks = new Set();

      // Run 50 iterations — with 3 equally-powered moves picked randomly,
      // we expect to see at least 2 different moves
      for (let i = 0; i < 50; i++) {
        const result = pickMove(allies, 0, [fireEnemy], 0, 0.0);
        picks.add(result.moveId);
      }

      // fire-blast should appear at least once (it's suboptimal vs fire)
      assert.ok(picks.has('fire-blast'),
        'should pick fire-blast at least once over 50 random iterations');
    });

    it('returns moveId: null when creature has no moves', () => {
      const allies = [{ moves: [] }];
      const result = pickMove(allies, 0, [fireEnemy], 0, 1.0);
      assert.equal(result.moveId, null);
    });

    it('returns moveId: null when creature is null', () => {
      const result = pickMove([null], 0, [fireEnemy], 0, 1.0);
      assert.equal(result.moveId, null);
    });

    it('returns moveId: null when target is missing', () => {
      const allies = [{ moves: [waterMove] }];
      const result = pickMove(allies, 0, [], 0, 1.0);
      assert.equal(result.moveId, null);
    });

    it('handles moves with basePower instead of power', () => {
      const moveWithBasePower = { id: 'splash', element: 'water', basePower: 40 };
      const allies = [{ moves: [moveWithBasePower] }];
      const result = pickMove(allies, 0, [fireEnemy], 0, 1.0);
      assert.equal(result.moveId, 'splash');
    });
  });

  describe('pickTarget', () => {
    it('returns index of first alive enemy', () => {
      const enemies = [
        { hp: 0 },
        { hp: 50 },
        { hp: 100 }
      ];
      assert.equal(pickTarget(enemies), 1);
    });

    it('returns 0 when all enemies are dead', () => {
      const enemies = [{ hp: 0 }, { hp: 0 }];
      assert.equal(pickTarget(enemies), 0);
    });

    it('returns 0 for first alive enemy', () => {
      const enemies = [{ hp: 100 }];
      assert.equal(pickTarget(enemies), 0);
    });
  });

  describe('pickSwap', () => {
    it('returns index of first alive ally', () => {
      const allies = [
        { hp: 0 },
        { hp: 0 },
        { hp: 30 }
      ];
      assert.equal(pickSwap(allies), 2);
    });

    it('returns null when all allies are dead', () => {
      const allies = [{ hp: 0 }, { hp: 0 }];
      assert.equal(pickSwap(allies), null);
    });

    it('returns 0 for first alive ally', () => {
      const allies = [{ hp: 100 }];
      assert.equal(pickSwap(allies), 0);
    });
  });
});
