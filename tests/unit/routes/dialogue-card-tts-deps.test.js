import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

let capturedGameRouteDeps = null;

await mock.module('../../../src/routes/game/index.js', {
  defaultExport: deps => {
    capturedGameRouteDeps = deps;
    return (req, res, next) => next();
  }
});

const { default: createRoutes } = await import('../../../src/routes/index.js');

describe('route dependency wiring for dialogue-card TTS', () => {
  it('passes getDialogueCardAudio into game routes', () => {
    const getDialogueCardAudio = async () => ({ userId: 'u1', key: 'abc123def456.wav' });

    createRoutes({
      getSettings: () => ({}),
      saveSettings: () => {},
      ttsCache: null,
      ttsDialogueCache: null,
      getDialogueCardAudio,
      enrichGameState: () => ({}),
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      updateGameStatsWithEvent: () => {},
      saveGameStats: () => {},
      getGameStats: () => ({}),
      setGameStats: () => {},
      getDebugMode: () => false,
      setDebugMode: () => {},
      vocabCacheFile: '',
      staticWordList: [],
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      getAllCreatureDialogueCache: () => ({}),
      queueMissingCreatureDialoguesFn: async () => {},
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      getAllNpcDialogueCache: () => ({}),
      clearNpcDialogueCache: () => {},
      clearCreatureDialogueCache: () => {},
      queueMissingNpcDialoguesFn: async () => {},
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ unknownWords: [], count: 0 })
    });

    assert.equal(capturedGameRouteDeps.getDialogueCardAudio, getDialogueCardAudio);
  });
});
