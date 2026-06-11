import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataPath, getDataDir } from '../data-dir.js';
import { createUserRecord, findUserByUsername, loadUsers, saveUsers } from '../auth/users.js';
import { encryptKeys, hashPassword, verifyPassword } from '../auth/crypto.js';
import { createMetaProgression, createNewPlayer } from '../game/state.js';
import { CREATURES_BY_ID } from '../game/creatures.js';

export const DEV_TEST_USERNAME = 'devtester';
export const DEV_TEST_PASSWORD = 'test1234';
export const DEV_TEST_PLAYER_NAME = 'DevTester';
export const DEV_TEST_CREATURE_IDS = [
  'hi',
  'mizu',
  'ki',
  'kaze',
  'mushi',
  'hana',
  'tori',
  'sakana',
  'neko',
  'inu'
];
const DEV_TEST_SAVE_DATE = new Date('2026-06-01T00:00:00.000Z');

function assertFixtureCreaturesExist() {
  const missing = DEV_TEST_CREATURE_IDS.filter(id => !CREATURES_BY_ID[id]);
  if (missing.length > 0) {
    throw new Error(`Dev test user fixture has unknown creature IDs: ${missing.join(', ')}`);
  }
}

function createDevTestSave(now = new Date()) {
  assertFixtureCreaturesExist();

  const meta = createMetaProgression();
  const savedAt = now.toISOString();
  const creatureCounts = Object.fromEntries(DEV_TEST_CREATURE_IDS.map(id => [id, 1]));

  meta.lifetimeStats = {
    ...meta.lifetimeStats,
    totalRuns: 1,
    runsCompleted: 1,
    runsFailed: 0,
    highestAreasCleared: 1,
    firstPlayDate: savedAt,
    lastPlayDate: savedAt
  };
  meta.creatureCollection = [...DEV_TEST_CREATURE_IDS];
  meta.creatureCounts = creatureCounts;
  meta.bossesDefeated = ['hinoneko'];
  meta.levels = { highestUnlocked: 2, completed: [], current: null };
  meta.prologueComplete = true;
  meta.tutorialStep = 6;
  meta.tutorialFireDropsGifted = false;
  meta.tutorialFusionDataUnlocked = ['hinoneko'];
  meta.tutorialFusionCoreAwarded = false;
  meta.tutorialFusionComplete = true;

  return {
    version: 2,
    player: createNewPlayer(DEV_TEST_PLAYER_NAME),
    meta,
    run: null,
    combat: null,
    savedAt
  };
}

async function ensureDevTestUser(usersFile) {
  let user = findUserByUsername(DEV_TEST_USERNAME, usersFile);
  let created = false;

  if (!user) {
    user = await createUserRecord({
      username: DEV_TEST_USERNAME,
      password: DEV_TEST_PASSWORD,
      encryptedApiKeys: encryptKeys({
        aiDataSharingConsent: true,
        aiConversationsEnabled: true
      }, process.env.ENCRYPTION_KEY || 'a'.repeat(64))
    }, usersFile);
    created = true;
  } else if (!await verifyPassword(DEV_TEST_PASSWORD, user.passwordHash)) {
    const data = loadUsers(usersFile);
    const existing = data.users.find(candidate => candidate.id === user.id);
    existing.passwordHash = await hashPassword(DEV_TEST_PASSWORD);
    saveUsers(data, usersFile);
    user = existing;
  }

  return { user, created };
}

export async function seedDevTestUser({
  dataDir = getDataDir(),
  usersFile = dataPath('.jrpg-users.json'),
  now = DEV_TEST_SAVE_DATE
} = {}) {
  const { user, created } = await ensureDevTestUser(usersFile);
  mkdirSync(dataDir, { recursive: true });
  const savePath = join(dataDir, `.jrpg-save-${user.id}.json`);
  const previousSave = existsSync(savePath) ? readFileSync(savePath, 'utf8') : null;
  const save = createDevTestSave(now);
  const nextSave = `${JSON.stringify(save, null, 2)}\n`;

  if (previousSave !== nextSave) {
    writeFileSync(savePath, nextSave);
  }

  // Reset Kanji Kombat daily SRS state so re-running the harness on the same
  // calendar day starts fresh. Note: if the Express server is already running
  // its in-memory SRS cache will retain the old data until it is restarted;
  // for CI this is fine because the server starts fresh per test run.
  const srsPath = join(dataDir, `srs-${user.id}.json`);
  if (existsSync(srsPath)) {
    try {
      const srsData = JSON.parse(readFileSync(srsPath, 'utf8'));
      if (srsData.kanjiKombatDaily) {
        delete srsData.kanjiKombatDaily;
        writeFileSync(srsPath, `${JSON.stringify(srsData, null, 2)}\n`);
      }
    } catch {
      // If the file is malformed, delete it so the server will recreate it.
      rmSync(srsPath, { force: true });
    }
  }

  return {
    username: DEV_TEST_USERNAME,
    password: DEV_TEST_PASSWORD,
    userId: user.id,
    usersFile,
    savePath,
    created,
    saveWritten: previousSave !== nextSave
  };
}

export function shouldAutoSeedDevTestUser({
  nodeEnv = process.env.NODE_ENV,
  railwayEnvironment = process.env.RAILWAY_ENVIRONMENT,
  railwayServiceName = process.env.RAILWAY_SERVICE_NAME,
  skipSeed = process.env.KOTO_SKIP_DEV_TEST_USER
} = {}) {
  if (skipSeed === 'true') return false;
  if (nodeEnv === 'production' || nodeEnv === 'test') return false;
  if (railwayEnvironment || railwayServiceName) return false;
  return true;
}

export async function seedDevTestUserForLocalDev() {
  if (!shouldAutoSeedDevTestUser()) {
    return { skipped: true };
  }
  return seedDevTestUser();
}

async function runCli() {
  const result = await seedDevTestUser();
  console.log(`Seeded local dev user: ${result.username} / ${DEV_TEST_PASSWORD}`);
  console.log(`User file: ${result.usersFile}`);
  console.log(`Save file: ${result.savePath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
