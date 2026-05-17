import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

function frame(raw) {
  return { raw, tokens: [{ surface: raw, reading: raw }], words: [] };
}

await mock.module('../../../src/game/dialogue-loader.js', {
  namedExports: {
    getSkillSelectFrame: () => frame('どの能力？'),
    getGameMasterAskFrames: () => [frame('遊ぶ？')],
    getGameMasterFinishFrames: () => [frame('上手！')],
    getGameMasterYesFrame: () => frame('はい'),
    getGameMasterNoFrame: () => frame('いいえ'),
    getShopPurchaseFrames: () => [],
    getShopGreetingFrames: () => [],
    getShrineGreetingFrames: () => [],
    getNpcLines: () => ({}),
    getNpcDefeatFrames: () => [frame('すごい！')]
  }
});

await mock.module('../../../src/game/token-format.js', {
  namedExports: {
    assembleFrame: sourceFrame => sourceFrame,
    countUnknowns: () => 0,
    entityToToken: entity => entity,
    filterEligible: lines => lines,
    getEligibleFrameTokens: sourceFrame => sourceFrame,
    isEligible: () => true,
    selectBestFrame: candidates => candidates[0] || null
  }
});

const { default: createRunRoutes } = await import('../../../src/routes/game/run.js');
const { default: createCombatRoutes } = await import('../../../src/routes/game/combat.js');

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

function makeAudioResolver() {
  return async ({ userId, speakerKey }) => ({ userId, key: `${speakerKey}.wav` });
}

function makeSpeakerAudioResolver() {
  return async ({ userId, speakerKey, speakerId }) => {
    return { userId, key: `${speakerKey}.wav`, speakerId };
  };
}

function createRunRouter() {
  return createRunRoutes({
    cancelPendingPrefetches: () => {},
    clearPrefetchCache: () => {},
    queueMissingCreatureDialoguesFn: () => {},
    getUserVocabulary: async () => [],
    queueMissingNpcDialoguesFn: () => {},
    checkSentenceViolations: () => ({ violations: [] }),
    getDialogueCardAudio: makeAudioResolver()
  });
}

describe('static dialogue route TTS metadata', () => {
  it('attaches audio to Skill Master prompt lines', async () => {
    const router = createRunRouter();
    const handler = getHandler(router, 'post', '/skill-master-offers');
    const req = {
      user: { id: 'skill-user' },
      gameManager: {
        explorationService: {
          getSkillMasterOffers: () => ({ offered: [{ id: 'quick_study', name: 'Quick Study' }] })
        }
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'skillMaster' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.skillSelectPrompt.audio, { userId: 'skill-user', key: 'cid.wav' });
  });

  it('attaches audio to Game Master whack-a-mole lines', async () => {
    const router = createRunRouter();
    const intro = getHandler(router, 'get', '/whack-a-mole-dialogue');
    const finish = getHandler(router, 'post', '/whack-a-mole-complete');
    const req = {
      body: { score: 3 },
      user: { id: 'gm-user' },
      gameManager: {
        run: { areaPath: [], currentArea: { id: 'hajimari-no-hiroba' } },
        completeWhackAMole: score => ({ score })
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room' })
    };

    const introRes = makeRes();
    await intro(req, introRes);

    const finishRes = makeRes();
    await finish(req, finishRes);

    assert.equal(introRes.statusCode, 200);
    assert.deepEqual(introRes.body.dialogue.audio, { userId: 'gm-user', key: 'game-master.wav' });
    assert.equal(finishRes.statusCode, 200);
    assert.deepEqual(finishRes.body.finishDialogue.audio, { userId: 'gm-user', key: 'game-master.wav' });
  });

  it('attaches audio to NPC defeat lines', async () => {
    const router = createCombatRoutes({
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: makeAudioResolver()
    });
    const handler = getHandler(router, 'post', '/npc-dialogue-start');
    const req = {
      user: { id: 'npc-user' },
      gameManager: {
        combat: { npcId: 'kodomo' },
        run: { creatureParty: { active: [] } },
        getCurrentRoom: () => ({ type: 'npcBattle', npcBattle: {} })
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'npc_skill_selection' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.line.audio, { userId: 'npc-user', key: 'kodomo.wav' });
  });

  it('attaches creature audio to befriend quiz prompt lines', async () => {
    const audioCalls = [];
    const router = createCombatRoutes({
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: async ({ userId, speakerKey, line }) => {
        audioCalls.push({ userId, speakerKey, raw: line.raw });
        return { userId, key: `${speakerKey}-${line.raw}.wav`, speakerId: 113 };
      }
    });
    const handler = getHandler(router, 'post', '/creature-combat-cycle');
    const req = {
      body: { actionType: 'attack', moveChoices: [] },
      user: { id: 'creature-user' },
      gameManager: {
        combat: {},
        combatCycleService: {
          creatureCombatCycle: () => ({
            befriendQuizTriggered: true,
            befriendQuiz: {
              waitPrompt: { text: '待って！', tokens: [{ surface: '待って' }], words: [] },
              namePrompt: { text: '名前は？', tokens: [{ surface: '名前' }], words: [] },
              successPrompt: { text: '友達！', tokens: [{ surface: '友達' }], words: [] },
              wrongPrompt: { text: '違う！', tokens: [{ surface: '違う' }], words: [] },
            }
          })
        }
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'combat' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(audioCalls.map(call => call.speakerKey), ['creature', 'creature', 'creature', 'creature']);
    assert.deepEqual(res.body.befriendQuiz.waitPrompt.audio, {
      userId: 'creature-user',
      key: 'creature-待って！.wav',
      speakerId: 113
    });
    assert.deepEqual(res.body.befriendQuiz.namePrompt.audio, {
      userId: 'creature-user',
      key: 'creature-名前は？.wav',
      speakerId: 113
    });
    assert.deepEqual(res.body.befriendQuiz.successPrompt.audio, {
      userId: 'creature-user',
      key: 'creature-友達！.wav',
      speakerId: 113
    });
    assert.deepEqual(res.body.befriendQuiz.wrongPrompt.audio, {
      userId: 'creature-user',
      key: 'creature-違う！.wav',
      speakerId: 113
    });
  });

  it('does not wait for uncached befriend quiz prompt synthesis before responding', async () => {
    const audioCalls = [];
    let resolveSynthesis;
    const pendingSynthesis = new Promise(resolve => { resolveSynthesis = resolve; });
    const router = createCombatRoutes({
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: ({ userId, speakerKey, line, waitForSynthesis }) => {
        audioCalls.push({ userId, speakerKey, raw: line.raw, waitForSynthesis });
        if (waitForSynthesis === false) {
          return { userId, speakerId: 113, text: line.raw, pending: true };
        }
        return pendingSynthesis;
      }
    });
    const handler = getHandler(router, 'post', '/creature-combat-cycle');
    const req = {
      body: { actionType: 'attack', moveChoices: [] },
      user: { id: 'creature-user' },
      gameManager: {
        combat: {},
        combatCycleService: {
          creatureCombatCycle: () => ({
            befriendQuizTriggered: true,
            befriendQuiz: {
              waitPrompt: { text: '待って！', tokens: [{ surface: '待って' }], words: [] },
              namePrompt: { text: '名前は？', tokens: [{ surface: '名前' }], words: [] },
              successPrompt: { text: '友達！', tokens: [{ surface: '友達' }], words: [] },
              wrongPrompt: { text: '違う！', tokens: [{ surface: '違う' }], words: [] },
            }
          })
        }
      },
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'combat' })
    };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(audioCalls.map(call => call.waitForSynthesis), [false, false, false, false]);
    assert.deepEqual(res.body.befriendQuiz.waitPrompt.audio, {
      userId: 'creature-user',
      speakerId: 113,
      text: '待って！',
      pending: true
    });
    assert.deepEqual(res.body.befriendQuiz.namePrompt.audio, {
      userId: 'creature-user',
      speakerId: 113,
      text: '名前は？',
      pending: true
    });
    assert.deepEqual(res.body.befriendQuiz.successPrompt.audio, {
      userId: 'creature-user',
      speakerId: 113,
      text: '友達！',
      pending: true
    });
    assert.deepEqual(res.body.befriendQuiz.wrongPrompt.audio, {
      userId: 'creature-user',
      speakerId: 113,
      text: '違う！',
      pending: true
    });

    resolveSynthesis();
  });

  it('uses the defeated NPC voice for NPC battle skill prompt audio', async () => {
    const sharedRoom = { type: 'npcBattle', npcBattle: {} };
    const gameManager = {
      combat: { npcId: 'kodomo' },
      run: { creatureParty: { active: [] }, partySkills: [] },
      getCurrentRoom: () => sharedRoom
    };
    const combatRouter = createCombatRoutes({
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: makeSpeakerAudioResolver()
    });
    const runRouter = createRunRoutes({
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      queueMissingCreatureDialoguesFn: () => {},
      getUserVocabulary: async () => [],
      queueMissingNpcDialoguesFn: () => {},
      checkSentenceViolations: () => ({ violations: [] }),
      getDialogueCardAudio: makeSpeakerAudioResolver()
    });

    const req = {
      user: { id: 'npc-skill-user' },
      gameManager,
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'npc_skill_selection' })
    };

    const defeatRes = makeRes();
    await getHandler(combatRouter, 'post', '/npc-dialogue-start')(req, defeatRes);

    const offersRes = makeRes();
    await getHandler(runRouter, 'post', '/npc-battle-skill-offers')(req, offersRes);

    assert.equal(defeatRes.statusCode, 200);
    assert.equal(offersRes.statusCode, 200);
    assert.equal(offersRes.body.skillSelectPrompt.audio.key, 'kodomo.wav');
    assert.equal(
      offersRes.body.skillSelectPrompt.audio.speakerId,
      defeatRes.body.npc.speakerId
    );
  });
});
