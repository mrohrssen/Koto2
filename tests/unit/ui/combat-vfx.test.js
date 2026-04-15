import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock pixi and audio modules that combat-vfx imports
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} }
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: {
    screenShake: () => {}, screenFlash: () => {}, hitStop: () => Promise.resolve(),
    recoil: () => {}, lunge: () => Promise.resolve(), burstParticles: () => {},
    flowParticles: () => {}, ELEMENT_COLORS: { neutral: 0x888888 }
  }
});
await mock.module('../../../public/js/pixi/element-blasts.js', {
  namedExports: { fireElementBlast: () => Promise.resolve() }
});
await mock.module('../../../public/js/pixi/text.js', {
  namedExports: {
    showDamageNumber: () => {}, popupBuff: () => {}, popupDebuff: () => {},
    popupSkillProc: () => {}, showHealPopup: () => {}, showPoisonTick: () => {}
  }
});
await mock.module('../../../public/js/pixi/banners.js', {
  namedExports: { showBanner: () => {} }
});
await mock.module('../../../public/js/pixi/status-vfx.js', {
  namedExports: { playStatusApplied: () => {}, clearStatusVfx: () => {} }
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: { getCreatureSprite: () => null, animateKO: () => {}, syncPixiStatusLabels: () => {} }
});
await mock.module('../../../public/js/ui/scene.js', {
  namedExports: { showFormation: () => {} }
});
await mock.module('../../../public/js/pixi/combat-effects-util.js', {
  namedExports: { getDamageTier: () => 1, TIER_EFFECTS: { 1: { hitStop: 0, shake: 'none', flash: false } }, TIER_RECOIL: { 1: 5 } }
});
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: { wait: () => Promise.resolve() }
});
await mock.module('../../../public/js/native/index.js', {
  namedExports: { hapticDamageTier: () => {} }
});
await mock.module('../../../public/js/ui/combat-audio.js', {
  namedExports: { playAttackSound: () => {} }
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: { creatureStaticPath: (id) => `/assets/${id}.webp`, SPRITE_VERSION: '0' }
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' ') }
});
await mock.module('../../../public/js/ui/combat-ui-utils.js', {
  namedExports: { getHpColor: () => 'green', SC_NAMES: {}, getCreatureStatusKeys: () => [] }
});
await mock.module('../../../public/js/ui/attack-card.js', {
  namedExports: { insertAttackCard: () => null, insertNpcAttackCard: () => null, waitForCardTap: () => Promise.resolve() }
});

const {
  buildAllyHpMap,
  buildEnemyHpMapForPlayerAttacks,
  buildMergedInitiativeAttacks,
} = await import('../../../public/js/ui/combat-vfx.js');

describe('combat-vfx data builders', () => {
  describe('buildAllyHpMap', () => {
    it('reconstructs pre-enemy-attack HP from final HP + damage', () => {
      const result = {
        allies: [
          { id: 'a1', hp: 70, maxHp: 100 },
          { id: 'a2', hp: 50, maxHp: 80 },
        ],
        enemyAttacks: [
          { targetIndex: 0, targetId: 'a1', damage: 20 },
          { targetIndex: 1, targetId: 'a2', damage: 10 },
        ],
      };
      const map = buildAllyHpMap(result);
      assert.deepEqual(map, {
        a1: { hp: 90, maxHp: 100 },
        a2: { hp: 60, maxHp: 80 },
      });
    });

    it('sums multiple attacks to the same ally', () => {
      const result = {
        allies: [{ id: 'a1', hp: 30, maxHp: 100 }],
        enemyAttacks: [
          { targetIndex: 0, damage: 20 },
          { targetIndex: 0, damage: 15 },
        ],
      };
      const map = buildAllyHpMap(result);
      assert.equal(map.a1.hp, 65);
    });

    it('handles missing enemy attacks', () => {
      const result = {
        allies: [{ id: 'a1', hp: 100, maxHp: 100 }],
      };
      const map = buildAllyHpMap(result);
      assert.equal(map.a1.hp, 100);
    });

    it('skips null ally slots', () => {
      const result = {
        allies: [null, { id: 'a2', hp: 50, maxHp: 80 }],
        enemyAttacks: [],
      };
      const map = buildAllyHpMap(result);
      assert.equal(map.a2.hp, 50);
      assert.equal(map.a1, undefined);
    });
  });

  describe('buildEnemyHpMapForPlayerAttacks', () => {
    it('reconstructs pre-player-attack enemy HP', () => {
      const result = {
        enemies: [
          { id: 'e1', hp: 40, maxHp: 100 },
        ],
        playerAttacks: [
          { targetIndex: 0, damage: 30 },
        ],
      };
      const map = buildEnemyHpMapForPlayerAttacks(result);
      assert.equal(map[0].hp, 70);
      assert.equal(map[0].maxHp, 100);
      assert.equal(map[0].index, 0);
    });

    it('caps reconstructed HP at maxHp', () => {
      const result = {
        enemies: [{ id: 'e1', hp: 90, maxHp: 100 }],
        playerAttacks: [{ targetIndex: 0, damage: 25 }],
      };
      const map = buildEnemyHpMapForPlayerAttacks(result);
      assert.equal(map[0].hp, 100); // 90 + 25 = 115, capped at 100
    });

    it('handles multi-enemy formation', () => {
      const result = {
        enemies: [
          { id: 'e1', hp: 50, maxHp: 100 },
          { id: 'e2', hp: 80, maxHp: 80 },
        ],
        playerAttacks: [
          { targetIndex: 0, damage: 20 },
          { targetIndex: 1, damage: 0 },
        ],
      };
      const map = buildEnemyHpMapForPlayerAttacks(result);
      assert.equal(map[0].hp, 70);
      assert.equal(map[1].hp, 80);
    });
  });

  describe('buildMergedInitiativeAttacks', () => {
    it('sorts by playbackIndex when present', () => {
      const result = {
        playerAttacks: [{ damage: 10, playbackIndex: 2 }],
        enemyAttacks: [{ damage: 5, playbackIndex: 1 }],
      };
      const merged = buildMergedInitiativeAttacks(result);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].side, 'enemy');
      assert.equal(merged[1].side, 'player');
    });

    it('falls back to player-first when no playbackIndex', () => {
      const result = {
        playerAttacks: [{ damage: 10 }],
        enemyAttacks: [{ damage: 5 }],
      };
      const merged = buildMergedInitiativeAttacks(result);
      assert.equal(merged[0].side, 'player');
      assert.equal(merged[1].side, 'enemy');
    });

    it('returns empty array when no attacks', () => {
      const merged = buildMergedInitiativeAttacks({});
      assert.deepEqual(merged, []);
    });
  });
});
