import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import createCombatRoutes from '../../../src/routes/game/combat.js';

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeLayer = layer.route.stack.find(s => s.method === method);
      if (routeLayer) return routeLayer.handle;
    }
  }
  return null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
}

function createRouterWithCachedBefriendDialogue(rounds) {
  return createCombatRoutes({
    getUserVocabulary: () => ({ words: [] }),
    getCreatureDialogueFromCache: () => ({ rounds }),
    regenCreatureDialogueFn: async () => {},
    getNpcDialogueFromCache: () => null,
    logNpcEncounterFn: () => {},
    regenNpcDialogueFn: async () => {},
    setNpcMemoryFlagFn: () => {},
    updateNpcMemoryBondFn: () => {},
    checkSentenceViolations: () => ({ violations: [] }),
    getDialogueCardAudio: async () => null
  });
}

describe('befriend conversation route', () => {
  it('preserves the target creature reading for dialogue speaker labels', async () => {
    const rounds = [{
      speaker: 'こんにちは',
      speakerTts: 'creature-line.wav',
      options: ['うん', 'いいえ', 'またね'],
      correctIndex: 0
    }];
    const router = createRouterWithCachedBefriendDialogue(rounds);
    const handler = getHandler(router, 'post', '/befriend-conversation');
    const target = {
      id: 'tetsu',
      name: '鉄',
      nameEn: 'Iron',
      reading: 'てつ',
      element: 'earth',
      hp: 5,
      maxHp: 10,
      befriended: false
    };
    const req = {
      body: { enemyIndex: 0 },
      user: { id: 'user-1' },
      gameManager: {
        combat: {
          active: true,
          isCreatureCombat: true,
          enemies: [target]
        }
      },
      saveGame: () => {}
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.targetEnemy.name, '鉄');
    assert.equal(res.body.targetEnemy.reading, 'てつ');
  });
});
