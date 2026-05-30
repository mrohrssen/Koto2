import { describe, it, beforeEach, afterEach } from 'node:test';
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

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AI_DIALOGUE_PROVIDER = 'openai';
  process.env.AI_DIALOGUE_API_KEY = 'sk-test';
  process.env.AI_DIALOGUE_MODEL = 'gpt-5-mini';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function createRouterWithCachedBefriendDialogue(rounds, deps = {}) {
  let cached = rounds ? { rounds } : null;
  return createCombatRoutes({
    getUserVocabulary: () => ({ words: ['水', '好き', 'うん', 'いいえ', 'またね'] }),
    getCreatureDialogueFromCache: () => cached,
    regenCreatureDialogueFn: async (...args) => {
      await deps.regenCreatureDialogueFn?.(...args);
      cached = {
        rounds: [{
          speaker: '水が好き？',
          options: ['うん', 'いいえ', 'またね'],
          correctIndex: 0
        }]
      };
    },
    getNpcDialogueFromCache: () => null,
    logNpcEncounterFn: () => {},
    regenNpcDialogueFn: async () => {},
    setNpcMemoryFlagFn: () => {},
    updateNpcMemoryBondFn: () => {},
    checkSentenceViolations: () => ({ unknownWords: [], count: 0 }),
    getDialogueCardAudio: async () => null,
    isCreatureDialogueStaleFn: deps.isCreatureDialogueStaleFn || (() => false)
  });
}

function makeReq({ target, userKeys = { aiDataSharingConsent: true, aiConversationsEnabled: true } }) {
  return {
    body: { enemyIndex: 0 },
    user: { id: 'user-1' },
    userKeys,
    gameManager: {
      combat: {
        active: true,
        isCreatureCombat: true,
        enemies: [target]
      }
    },
    saveGame: () => {}
  };
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
    const req = makeReq({ target });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.targetEnemy.name, '鉄');
    assert.equal(res.body.targetEnemy.reading, 'てつ');
    assert.equal(res.body.rounds[0].speaker.raw, 'こんにちは');
    assert.equal(Array.isArray(res.body.rounds[0].speaker.tokens), true);
    assert.equal(res.body.rounds[0].options[0].raw, 'うん');
    assert.equal(Object.hasOwn(res.body.rounds[0], 'correctIndex'), false);
  });

  it('rejects when AI conversations are disabled', async () => {
    const router = createRouterWithCachedBefriendDialogue(null);
    const handler = getHandler(router, 'post', '/befriend-conversation');
    const target = {
      id: 'tetsu',
      name: '鉄',
      nameEn: 'Iron',
      reading: 'てつ',
      hp: 5,
      maxHp: 10,
      befriended: false
    };
    const res = makeRes();

    await handler(makeReq({
      target,
      userKeys: { aiDataSharingConsent: true, aiConversationsEnabled: false }
    }), res);

    assert.equal(res.statusCode, 403);
  });

  it('rejects when AI data sharing consent is missing', async () => {
    const router = createRouterWithCachedBefriendDialogue(null);
    const handler = getHandler(router, 'post', '/befriend-conversation');
    const target = {
      id: 'tetsu',
      name: '鉄',
      nameEn: 'Iron',
      reading: 'てつ',
      hp: 5,
      maxHp: 10,
      befriended: false
    };
    const res = makeRes();

    await handler(makeReq({
      target,
      userKeys: { aiDataSharingConsent: false, aiConversationsEnabled: true }
    }), res);

    assert.equal(res.statusCode, 403);
  });

  it('generates on demand when cache is missing', async () => {
    let regenCalls = 0;
    const router = createRouterWithCachedBefriendDialogue(null, {
      regenCreatureDialogueFn: async () => { regenCalls += 1; }
    });
    const handler = getHandler(router, 'post', '/befriend-conversation');
    const target = {
      id: 'tetsu',
      name: '鉄',
      nameEn: 'Iron',
      reading: 'てつ',
      hp: 5,
      maxHp: 10,
      befriended: false
    };
    const res = makeRes();

    await handler(makeReq({ target }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(regenCalls, 1);
    assert.equal(res.body.rounds[0].speaker.raw, '水が好き？');
  });

  it('regenerates on demand when cache is stale', async () => {
    let regenCalls = 0;
    const router = createRouterWithCachedBefriendDialogue([{
      speaker: '古い',
      options: ['うん', 'いいえ', 'またね'],
      correctIndex: 0
    }], {
      regenCreatureDialogueFn: async () => { regenCalls += 1; },
      isCreatureDialogueStaleFn: () => true
    });
    const handler = getHandler(router, 'post', '/befriend-conversation');
    const target = {
      id: 'tetsu',
      name: '鉄',
      nameEn: 'Iron',
      reading: 'てつ',
      hp: 5,
      maxHp: 10,
      befriended: false
    };
    const res = makeRes();

    await handler(makeReq({ target }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(regenCalls, 1);
    assert.equal(res.body.rounds[0].speaker.raw, '水が好き？');
  });
});
