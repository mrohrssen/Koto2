import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTmpDir } from '../../helpers/tmp.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';
import { configureSrs, createCard, getDeckCards } from '../../../src/game/internal-srs.js';
import { createWordKnowledge, registerExposure, saveWordKnowledge } from '../../../src/game/bootstrap/word-knowledge.js';
import { logEncounter } from '../../../src/narration-engine/index.js';
import { resetUserProgress } from '../../../src/game/user-data-reset.js';

describe('resetUserProgress', () => {
  let tmp;
  const userId = 'u_reset_target';
  const otherUserId = 'u_reset_other';

  beforeEach(async () => {
    tmp = await createTestTmpDir('reset-user-progress-');
    setDataDirForTest(tmp.path);
    configureSrs({ dataDir: tmp.path });
  });

  afterEach(async () => {
    resetDataDirForTest();
    await tmp.cleanup();
  });

  it('removes only the selected user progress artifacts while preserving account data', () => {
    writeFileSync(join(tmp.path, '.jrpg-users.json'), JSON.stringify({
      users: [{ id: userId, username: 'target', encryptedApiKeys: { keep: true } }],
      inviteCodes: []
    }));
    writeFileSync(join(tmp.path, `.jrpg-save-${userId}.json`), JSON.stringify({ player: { name: 'Target' } }));
    writeFileSync(join(tmp.path, `.jrpg-save-${otherUserId}.json`), JSON.stringify({ player: { name: 'Other' } }));

    for (const prefix of [
      'npc-memory',
      'creature-memory',
      'npc-dialogue-cache',
      'creature-dialogue-cache'
    ]) {
      writeFileSync(join(tmp.path, `${prefix}-${userId}.json`), JSON.stringify({ target: true }));
      writeFileSync(join(tmp.path, `${prefix}-${otherUserId}.json`), JSON.stringify({ other: true }));
    }

    const wordKnowledge = createWordKnowledge(userId);
    registerExposure(wordKnowledge, '森');
    saveWordKnowledge(wordKnowledge);
    const otherWordKnowledge = createWordKnowledge(otherUserId);
    registerExposure(otherWordKnowledge, '木');
    saveWordKnowledge(otherWordKnowledge);

    createCard(userId, 'vocab', '森', { word: '森' });
    createCard(otherUserId, 'vocab', '木', { word: '木' });

    writeFileSync(join(tmp.path, '.jrpg-word-tracking.json'), JSON.stringify({
      [userId]: { today: { date: '2026-04-29', count: 3 }, weekly: 3, lifetime: 3 },
      [otherUserId]: { today: { date: '2026-04-29', count: 1 }, weekly: 1, lifetime: 1 }
    }));

    const result = resetUserProgress(userId);

    assert.equal(result.success, true);
    assert.equal(existsSync(join(tmp.path, '.jrpg-users.json')), true);
    assert.equal(existsSync(join(tmp.path, `.jrpg-save-${userId}.json`)), false);
    assert.equal(existsSync(join(tmp.path, `.jrpg-save-${otherUserId}.json`)), true);
    assert.equal(existsSync(join(tmp.path, `word-knowledge-${userId}.json`)), false);
    assert.equal(existsSync(join(tmp.path, `word-knowledge-${otherUserId}.json`)), true);
    assert.equal(existsSync(join(tmp.path, `srs-${userId}.json`)), false);
    assert.equal(getDeckCards(userId, 'vocab').length, 0);
    assert.equal(getDeckCards(otherUserId, 'vocab').length, 1);

    for (const prefix of [
      'npc-memory',
      'creature-memory',
      'npc-dialogue-cache',
      'creature-dialogue-cache'
    ]) {
      assert.equal(existsSync(join(tmp.path, `${prefix}-${userId}.json`)), false);
      assert.equal(existsSync(join(tmp.path, `${prefix}-${otherUserId}.json`)), true);
    }

    const tracking = JSON.parse(readFileSync(join(tmp.path, '.jrpg-word-tracking.json'), 'utf-8'));
    assert.equal(tracking[userId], undefined);
    assert.equal(tracking[otherUserId].lifetime, 1);
  });

  it('drops preloaded narration memory so old data cannot be saved again', () => {
    const memoryUserId = 'u_reset_memory_cache';
    logEncounter(memoryUserId, 'entity_01', 'positive', 'Old encounter');

    resetUserProgress(memoryUserId);
    logEncounter(memoryUserId, 'entity_01', 'positive', 'New encounter');

    const memory = JSON.parse(readFileSync(join(tmp.path, `npc-memory-${memoryUserId}.json`), 'utf-8'));
    assert.equal(memory.entity_01.counters.encounters, 1);
    assert.equal(memory.entity_01.encounterLog.length, 1);
    assert.equal(memory.entity_01.encounterLog[0].summary, 'New encounter');
  });
});
