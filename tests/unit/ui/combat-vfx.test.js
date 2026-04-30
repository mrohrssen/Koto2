import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const popupDebuffMessages = [];
const sceneManagerState = { currentScene: null, transitioning: false };

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
    showDamageNumber: () => {}, popupBuff: () => {}, popupDebuff: (message) => { popupDebuffMessages.push(message); },
    popupSkillProc: () => {}, showHealPopup: () => {}, showPoisonTick: () => {}
  }
});
await mock.module('../../../public/js/pixi/banners.js', {
  namedExports: { showBanner: () => {} }
});
await mock.module('../../../public/js/pixi/status-vfx.js', {
  namedExports: { playStatusAppliedForScene: () => {}, clearStatusVfxForScene: () => {} }
});
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: {
    getCreatureSpriteForScene: () => null,
    animateKOForScene: () => {},
    syncPixiStatusLabelsForScene: () => {},
  }
});
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState }
});
await mock.module('../../../public/js/ui/combat-dom.js', {
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
  namedExports: {
    t: (key) => key === 'effectConfuse' ? '<span class="en-first">CONFUSE</span>!' : key,
    tPlain: (key) => key === 'effectConfuse' ? 'CONFUSE!' : key,
  }
});
await mock.module('../../../public/js/ui/combat-ui-utils.js', {
  namedExports: { getHpColor: () => 'green', SC_NAMES: {}, getCreatureStatusKeys: () => [] }
});
await mock.module('../../../public/js/ui/attack-card.js', {
  namedExports: { insertAttackCard: () => null, insertNpcAttackCard: () => null, waitForCardTap: () => Promise.resolve() }
});

const {
  init,
  buildAllyHpMap,
  buildEnemyHpMapForPlayerAttacks,
  buildMergedInitiativeAttacks,
  showEffectEvents,
  showKoSwapAnimations,
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
          { targetIndex: 0, targetId: 'a1', damage: 20 },
          { targetIndex: 0, targetId: 'a1', damage: 15 },
        ],
      };
      const map = buildAllyHpMap(result);
      assert.equal(map.a1.hp, 65);
    });

    it('does not attribute damage from a KO\'d ally to surviving allies after compaction', () => {
      // After server compaction: dead ally removed, surviving ally shifts to index 0.
      // Enemy attack targetIndex=0 was meant for the dead creature, not the survivor.
      const result = {
        allies: [{ id: 'a2', hp: 80, maxHp: 100 }],  // compacted: a1 removed
        enemyAttacks: [
          { targetIndex: 0, targetId: 'a1', damage: 40 },  // killed a1 (no longer in allies)
        ],
      };
      const map = buildAllyHpMap(result);
      // a2 should NOT have a1's damage attributed to it
      assert.equal(map.a2.hp, 80);
      assert.equal(map.a1, undefined);  // dead creature not in map
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

  describe('showEffectEvents', () => {
    it('uses plain status labels for Pixi text popups', async () => {
      popupDebuffMessages.length = 0;
      init({ delay: () => Promise.resolve() });

      await showEffectEvents({
        effectEvents: [{ type: 'confuse_tick', targetSide: 'enemy', targetIndex: 0, remainingTurns: 1 }],
        enemies: [{ uid: 'enemy-1' }],
        allies: [],
      });

      assert.equal(popupDebuffMessages[0], 'CONFUSE!');
    });
  });
});

describe('showKoSwapAnimations', () => {
  it('resyncs enemy sprites from the server result after ally KO removal', async () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
      querySelectorAll: () => [],
      getElementById: () => null,
    };

    const staleEnemies = [
      { uid: 'enemy-a', hp: 12, maxHp: 30 },
      { uid: 'enemy-b', hp: 18, maxHp: 30 },
    ];
    const resultEnemies = [
      { uid: 'enemy-a', hp: 0, maxHp: 30 },
      { uid: 'enemy-b', hp: 18, maxHp: 30 },
    ];
    let syncPayload = null;

    sceneManagerState.transitioning = false;
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      formation: {
        lastFormationInput: {
          enemy: { creatures: staleEnemies },
        },
      },
      async syncCreatures(payload) {
        syncPayload = payload;
      },
    };

    init({
      delay: async () => {},
      characterUI: {},
      getGameState: () => ({}),
    });

    try {
      await showKoSwapAnimations({
        koRemovals: [{ slot: 0, name: 'Neko' }],
        creatureParty: { active: [{ uid: 'ally-b', id: 'mizu', hp: 20, maxHp: 30 }] },
        enemies: resultEnemies,
      });
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }

    assert.equal(syncPayload.enemies, resultEnemies);
  });
});
