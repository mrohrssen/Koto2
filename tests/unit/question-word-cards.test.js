import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureQuestionWordCards, QUESTION_WORDS } from '../../src/game/question-word-cards.js';
import { getDeckCards, clearSrsData, configureSrs } from '../../src/game/internal-srs.js';
import { createTestTmpDir } from '../helpers/tmp.js';

describe('question word cards', () => {
  it('QUESTION_WORDS is the un-freed five', () => {
    assert.deepEqual(QUESTION_WORDS, ['何', 'どこ', 'どう', '誰', 'いつ']);
  });

  it('creates missing cards once, idempotently', async () => {
    const tmp = await createTestTmpDir('qword-cards-');
    configureSrs({ dataDir: tmp.path });
    const userId = 'qword-test-user';
    clearSrsData(userId);

    const created = ensureQuestionWordCards(userId);
    assert.deepEqual(created.sort(), ['いつ', 'どう', 'どこ', '何', '誰'].sort());

    const again = ensureQuestionWordCards(userId);
    assert.deepEqual(again, []);

    const ids = getDeckCards(userId, 'vocab').map(c => c.id);
    for (const w of QUESTION_WORDS) assert.ok(ids.includes(w));

    clearSrsData(userId);
    await tmp.cleanup?.();
  });
});
