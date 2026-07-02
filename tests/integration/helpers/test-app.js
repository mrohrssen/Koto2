import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp } from '../../../src/app.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';
import { resetDbForTest } from '../../../src/db.js';
import { clearManagersForTest } from '../../../src/game/manager-registry.js';
import { createTestTmpDir } from '../../helpers/tmp.js';
import {
  createMockTTS,
  createMockTTSDialogue,
  createNoOpNarration
} from '../../helpers/mocks.js';

/**
 * Boot a real Express app for integration testing.
 * Mocks only AI providers and TTS at the boundary.
 * Every call returns a fresh app with isolated temp data.
 *
 * @returns {Promise<{ app, server, port, tmpDir, cleanup }>}
 */
export async function createTestApp() {
  const tmp = await createTestTmpDir('koto-integration-');

  const settings = {
    gameTtsEnabled: false,
    voiceGender: 'boy',
    dailyWordLimit: 10,
    debugSuperAttack: false,
    reviewType: 'typing'
  };

  const narration = createNoOpNarration();

  // Mutable state closures for debug/stats endpoints
  let debugMode = false;
  let gameStats = {};

  const app = createApp({
    dataDir: tmp.path,
    usersFile: join(tmp.path, '.jrpg-users.json'),
    authBypass: false,
    routeOverrides: {
      getSettings: () => settings,
      saveSettings: (nextSettings) => { Object.assign(settings, nextSettings); },
      ttsCache: createMockTTS(),
      ttsDialogueCache: createMockTTSDialogue(),
      getUserVocabulary: () => ({ words: [] }),
      getDebugMode: () => debugMode,
      setDebugMode: (val) => { debugMode = val; },
      updateGameStatsWithEvent: () => {},
      saveGameStats: () => {},
      getGameStats: () => gameStats,
      setGameStats: (s) => { gameStats = s; },
      ...narration
    }
  });

  // Start server on random port
  const server = createServer(app);
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  async function cleanup() {
    await new Promise(resolve => server.close(resolve));
    clearManagersForTest();
    resetDbForTest();
    resetDataDirForTest();
    await tmp.cleanup();
  }

  return { app, server, port, tmpDir: tmp.path, cleanup };
}
