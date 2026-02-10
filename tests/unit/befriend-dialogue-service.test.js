/**
 * Tests for befriend-dialogue-service.js
 * Covers Tasks 1-3: file I/O, AI generation, retry, bulk, and regeneration.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'fs';
import {
  _setDataDir,
  _resetLocks,
  loadUserDialogues,
  saveUserDialogues,
  getDialogueForRobot,
  generateOneRobotDialogue,
  generateWithRetry,
  generateMissingDialogues,
  regenerateRobotDialogue
} from '../../src/game/services/befriend-dialogue-service.js';

const TEST_DATA_DIR = '/tmp/test-befriend-dialogue';

const MOCK_ROBOT = {
  id: 'fire-common',
  name: 'カエンボット',
  nameEn: 'Kaen Bot',
  element: 'fire'
};

const MOCK_ROBOT_2 = {
  id: 'water-common',
  name: 'アクアボット',
  nameEn: 'Aqua Bot',
  element: 'water'
};

const VALID_ROUNDS = [
  { speaker: 'やあ、君は誰？', options: ['僕は冒険者だ', 'ズボンが好き', '魚を釣る'], correctIndex: 0 },
  { speaker: 'そうか、何をしに来た？', options: ['天気がいい', '友達になりたい', '靴を買う'], correctIndex: 1 },
  { speaker: 'いいね！一緒に行こう', options: ['猫が走る', '電車に乗る', 'よろしく！'], correctIndex: 2 }
];

function makeValidResponse() {
  return JSON.stringify(VALID_ROUNDS);
}

function makeMockAiConfig(chatFn) {
  return {
    chat: chatFn,
    provider: 'openai',
    apiKey: 'test-key',
    jlptLevel: 'N4'
  };
}

describe('Befriend Dialogue Service - File I/O (Task 1)', () => {
  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    _setDataDir(TEST_DATA_DIR);
    _resetLocks();
  });

  afterEach(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('loadUserDialogues returns empty robots when file missing', () => {
    const data = loadUserDialogues('nonexistent-user');
    assert.deepStrictEqual(data, { robots: {} });
  });

  it('save and load roundtrip preserves data', () => {
    const original = {
      robots: {
        'fire-common': { status: 'ready', rounds: VALID_ROUNDS }
      }
    };
    saveUserDialogues('user1', original);
    const loaded = loadUserDialogues('user1');
    assert.deepStrictEqual(loaded, original);
  });

  it('getDialogueForRobot returns rounds when status is ready', () => {
    const data = {
      robots: {
        'fire-common': { status: 'ready', rounds: VALID_ROUNDS }
      }
    };
    saveUserDialogues('user1', data);
    const rounds = getDialogueForRobot('user1', 'fire-common');
    assert.deepStrictEqual(rounds, VALID_ROUNDS);
  });

  it('getDialogueForRobot returns null when status is pending', () => {
    const data = {
      robots: {
        'fire-common': { status: 'pending', rounds: null }
      }
    };
    saveUserDialogues('user1', data);
    const rounds = getDialogueForRobot('user1', 'fire-common');
    assert.strictEqual(rounds, null);
  });

  it('getDialogueForRobot returns null when robot is missing', () => {
    saveUserDialogues('user1', { robots: {} });
    const rounds = getDialogueForRobot('user1', 'nonexistent');
    assert.strictEqual(rounds, null);
  });

  it('saveUserDialogues writes atomically (tmp file does not persist)', () => {
    saveUserDialogues('user1', { robots: {} });
    const tmpPath = `${TEST_DATA_DIR}/befriend-user1.json.tmp`;
    assert.ok(!existsSync(tmpPath), 'tmp file should not persist after rename');
    assert.ok(existsSync(`${TEST_DATA_DIR}/befriend-user1.json`), 'final file should exist');
  });
});

describe('Befriend Dialogue Service - AI Generation (Task 2)', () => {
  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    _setDataDir(TEST_DATA_DIR);
    _resetLocks();
  });

  afterEach(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('valid AI response returns 3 validated rounds', async () => {
    const mockChat = async () => makeValidResponse();
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる', '飲む'], aiConfig);
    assert.ok(result);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].speaker, 'やあ、君は誰？');
    assert.strictEqual(result[0].options.length, 3);
  });

  it('valid AI response with markdown fences returns parsed rounds', async () => {
    const mockChat = async () => '```json\n' + makeValidResponse() + '\n```';
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.ok(result);
    assert.strictEqual(result.length, 3);
  });

  it('invalid JSON response returns null', async () => {
    const mockChat = async () => 'this is not json at all';
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.strictEqual(result, null);
  });

  it('wrong structure (2 rounds instead of 3) returns null', async () => {
    const twoRounds = VALID_ROUNDS.slice(0, 2);
    const mockChat = async () => JSON.stringify(twoRounds);
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.strictEqual(result, null);
  });

  it('missing speaker field returns null', async () => {
    const badRounds = VALID_ROUNDS.map((r, i) =>
      i === 0 ? { ...r, speaker: '' } : r
    );
    const mockChat = async () => JSON.stringify(badRounds);
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.strictEqual(result, null);
  });

  it('correctIndex out of range returns null', async () => {
    const badRounds = VALID_ROUNDS.map((r, i) =>
      i === 0 ? { ...r, correctIndex: 5 } : r
    );
    const mockChat = async () => JSON.stringify(badRounds);
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.strictEqual(result, null);
  });

  it('chat function throwing returns null', async () => {
    const mockChat = async () => { throw new Error('API timeout'); };
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateOneRobotDialogue(MOCK_ROBOT, ['食べる'], aiConfig);
    assert.strictEqual(result, null);
  });
});

describe('Befriend Dialogue Service - Retry (Task 3)', () => {
  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    _setDataDir(TEST_DATA_DIR);
    _resetLocks();
  });

  afterEach(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('fails 3 times and returns null, with correct attempt count', async () => {
    let attempts = 0;
    const mockChat = async () => {
      attempts++;
      return 'invalid json';
    };
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateWithRetry(MOCK_ROBOT, ['食べる'], aiConfig, {
      maxRetries: 3,
      baseDelayMs: 10
    });
    assert.strictEqual(result, null);
    assert.strictEqual(attempts, 3);
  });

  it('succeeds on 2nd attempt', async () => {
    let attempts = 0;
    const mockChat = async () => {
      attempts++;
      if (attempts === 1) return 'invalid';
      return makeValidResponse();
    };
    const aiConfig = makeMockAiConfig(mockChat);
    const result = await generateWithRetry(MOCK_ROBOT, ['食べる'], aiConfig, {
      maxRetries: 3,
      baseDelayMs: 10
    });
    assert.ok(result);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(attempts, 2);
  });
});

describe('Befriend Dialogue Service - Bulk Generation (Task 3)', () => {
  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    _setDataDir(TEST_DATA_DIR);
    _resetLocks();
  });

  afterEach(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('skips already-ready robots, only generates missing ones', async () => {
    // Pre-save one robot as ready
    saveUserDialogues('user1', {
      robots: {
        'fire-common': { status: 'ready', rounds: VALID_ROUNDS }
      }
    });

    const mockChat = async () => makeValidResponse();
    const aiConfig = makeMockAiConfig(mockChat);

    const result = await generateMissingDialogues(
      'user1', aiConfig, ['食べる'],
      [MOCK_ROBOT, MOCK_ROBOT_2],
      { cooldownMs: 0, retryOpts: { maxRetries: 1, baseDelayMs: 10 } }
    );

    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(result.generated, 1);
    assert.strictEqual(result.aborted, false);

    // Verify water-common was saved
    const rounds = getDialogueForRobot('user1', 'water-common');
    assert.ok(rounds);
    assert.strictEqual(rounds.length, 3);
  });

  it('per-user lock prevents duplicate concurrent runs', async () => {
    const mockChat = async () => {
      // Slow response to keep generation running
      await new Promise(r => setTimeout(r, 50));
      return makeValidResponse();
    };
    const aiConfig = makeMockAiConfig(mockChat);
    const robots = [MOCK_ROBOT];

    // Start first run
    const run1Promise = generateMissingDialogues(
      'user1', aiConfig, ['食べる'], robots,
      { cooldownMs: 0, retryOpts: { maxRetries: 1, baseDelayMs: 10 } }
    );

    // Start second run immediately (should be locked out)
    const run2 = await generateMissingDialogues(
      'user1', aiConfig, ['食べる'], robots,
      { cooldownMs: 0, retryOpts: { maxRetries: 1, baseDelayMs: 10 } }
    );

    assert.ok(run2.locked, 'second run should be locked');
    assert.strictEqual(run2.generated, 0);

    // Wait for first run to complete
    const run1 = await run1Promise;
    assert.strictEqual(run1.generated, 1);
  });

  it('aborts batch when a robot fails all retries', async () => {
    let callCount = 0;
    const mockChat = async () => {
      callCount++;
      return 'invalid json';
    };
    const aiConfig = makeMockAiConfig(mockChat);

    const result = await generateMissingDialogues(
      'user1', aiConfig, ['食べる'],
      [MOCK_ROBOT, MOCK_ROBOT_2],
      { cooldownMs: 0, retryOpts: { maxRetries: 2, baseDelayMs: 10 } }
    );

    assert.ok(result.aborted, 'should abort on failure');
    assert.strictEqual(result.generated, 0);
    // Should have only tried the first robot (2 retries), then aborted
    assert.strictEqual(callCount, 2);
  });
});

describe('Befriend Dialogue Service - Regeneration (Task 3)', () => {
  beforeEach(() => {
    mkdirSync(TEST_DATA_DIR, { recursive: true });
    _setDataDir(TEST_DATA_DIR);
    _resetLocks();
  });

  afterEach(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('overwrites old dialogue with new on success', async () => {
    const oldRounds = VALID_ROUNDS.map(r => ({ ...r, speaker: 'OLD: ' + r.speaker }));
    saveUserDialogues('user1', {
      robots: { 'fire-common': { status: 'ready', rounds: oldRounds } }
    });

    const mockChat = async () => makeValidResponse();
    const aiConfig = makeMockAiConfig(mockChat);

    const result = await regenerateRobotDialogue(
      'user1', MOCK_ROBOT, aiConfig, ['食べる'],
      { maxRetries: 1, baseDelayMs: 10 }
    );

    assert.ok(result.success);
    assert.strictEqual(result.rounds[0].speaker, 'やあ、君は誰？');

    // Verify on disk
    const saved = getDialogueForRobot('user1', 'fire-common');
    assert.strictEqual(saved[0].speaker, 'やあ、君は誰？');
  });

  it('reverts to old data on failure', async () => {
    const oldRounds = VALID_ROUNDS.map(r => ({ ...r, speaker: 'OLD: ' + r.speaker }));
    saveUserDialogues('user1', {
      robots: { 'fire-common': { status: 'ready', rounds: oldRounds } }
    });

    const mockChat = async () => 'invalid json';
    const aiConfig = makeMockAiConfig(mockChat);

    const result = await regenerateRobotDialogue(
      'user1', MOCK_ROBOT, aiConfig, ['食べる'],
      { maxRetries: 2, baseDelayMs: 10 }
    );

    assert.ok(!result.success);
    // Should have reverted to old rounds
    assert.strictEqual(result.rounds[0].speaker, 'OLD: やあ、君は誰？');

    // Verify on disk - should be reverted and status=ready
    const saved = loadUserDialogues('user1');
    assert.strictEqual(saved.robots['fire-common'].status, 'ready');
    assert.strictEqual(saved.robots['fire-common'].rounds[0].speaker, 'OLD: やあ、君は誰？');
  });

  it('per-robot lock prevents concurrent regeneration', async () => {
    saveUserDialogues('user1', {
      robots: { 'fire-common': { status: 'ready', rounds: VALID_ROUNDS } }
    });

    const mockChat = async () => {
      await new Promise(r => setTimeout(r, 50));
      return makeValidResponse();
    };
    const aiConfig = makeMockAiConfig(mockChat);

    // Start first regen
    const regen1Promise = regenerateRobotDialogue(
      'user1', MOCK_ROBOT, aiConfig, ['食べる'],
      { maxRetries: 1, baseDelayMs: 10 }
    );

    // Start second regen immediately (should be locked)
    const regen2 = await regenerateRobotDialogue(
      'user1', MOCK_ROBOT, aiConfig, ['食べる'],
      { maxRetries: 1, baseDelayMs: 10 }
    );

    assert.ok(regen2.locked, 'second regen should be locked');
    assert.ok(!regen2.success);

    // Wait for first to complete
    const regen1 = await regen1Promise;
    assert.ok(regen1.success);
  });
});
