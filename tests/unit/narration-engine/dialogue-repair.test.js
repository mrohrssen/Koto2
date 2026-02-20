import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDialogueStrings, validateDialogueVocab, buildRepairInstruction, enforceDialogueVocab } from '../../../src/narration-engine/dialogue-repair.js';

const validDialogue = {
  greeting: 'やあ！',
  defeatLine: 'うう…負けた',
  freedLine: 'ありがとう！助かった',
  rounds: [
    { npcLine: 'こんにちは！元気？', options: [
      { text: 'うん、元気', tone: 'positive' },
      { text: 'まあまあ', tone: 'neutral' },
      { text: '別に', tone: 'negative' }
    ]},
    { npcLine: '一緒に行こう', options: [
      { text: 'いいよ', tone: 'positive' },
      { text: 'ちょっと待って', tone: 'neutral' },
      { text: 'いやだ', tone: 'negative' }
    ]},
    { npcLine: 'また会おうね', options: [
      { text: 'もちろん', tone: 'positive' },
      { text: 'いつかね', tone: 'neutral' },
      { text: 'いらない', tone: 'negative' }
    ]}
  ]
};

describe('dialogue-repair', () => {
  describe('extractDialogueStrings', () => {
    it('extracts all 15 strings from a standard dialogue', () => {
      const entries = extractDialogueStrings(validDialogue);
      assert.strictEqual(entries.length, 15);
    });

    it('includes greeting, defeatLine, freedLine paths', () => {
      const entries = extractDialogueStrings(validDialogue);
      const paths = entries.map(e => e.path);
      assert.ok(paths.includes('greeting'));
      assert.ok(paths.includes('defeatLine'));
      assert.ok(paths.includes('freedLine'));
    });

    it('includes all round and option paths', () => {
      const entries = extractDialogueStrings(validDialogue);
      const paths = entries.map(e => e.path);
      assert.ok(paths.includes('rounds[0].npcLine'));
      assert.ok(paths.includes('rounds[2].options[2].text'));
    });

    it('preserves text content', () => {
      const entries = extractDialogueStrings(validDialogue);
      const greetingEntry = entries.find(e => e.path === 'greeting');
      assert.strictEqual(greetingEntry.text, 'やあ！');
    });
  });

  describe('validateDialogueVocab', () => {
    it('returns empty array when all text is clean', async () => {
      const cleanCheck = async () => ({ unknownWords: [], count: 0 });
      const violations = await validateDialogueVocab(validDialogue, cleanCheck);
      assert.strictEqual(violations.length, 0);
    });

    it('allows 1 unknown per field (i+1 compliance)', async () => {
      const oneUnknown = async () => ({ unknownWords: ['新語'], count: 1 });
      const violations = await validateDialogueVocab(validDialogue, oneUnknown);
      assert.strictEqual(violations.length, 0);
    });

    it('flags fields with >1 unknown word', async () => {
      const checkFn = async (text) => {
        if (text === 'やあ！') {
          return { unknownWords: ['未知語1', '未知語2'], count: 2 };
        }
        return { unknownWords: [], count: 0 };
      };
      const violations = await validateDialogueVocab(validDialogue, checkFn);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].path, 'greeting');
      assert.deepStrictEqual(violations[0].unknowns, ['未知語1', '未知語2']);
    });

    it('flags multiple fields with violations', async () => {
      const checkFn = async (text) => {
        if (text.includes('BAD')) {
          return { unknownWords: ['a', 'b'], count: 2 };
        }
        return { unknownWords: [], count: 0 };
      };
      const dirty = {
        ...validDialogue,
        greeting: 'BAD greeting',
        defeatLine: 'BAD defeat',
      };
      const violations = await validateDialogueVocab(dirty, checkFn);
      assert.strictEqual(violations.length, 2);
    });

    it('returns empty array when checkFn is null (skip validation)', async () => {
      const violations = await validateDialogueVocab(validDialogue, null);
      assert.strictEqual(violations.length, 0);
    });
  });

  describe('buildRepairInstruction', () => {
    it('lists violation fields and unknown words', () => {
      const violations = [
        { path: 'greeting', text: 'X', unknowns: ['困難', '挑戦'] },
        { path: 'rounds[0].npcLine', text: 'Y', unknowns: ['冒険'] }
      ];
      const instruction = buildRepairInstruction(violations);
      assert.ok(instruction.includes('greeting'));
      assert.ok(instruction.includes('困難'));
      assert.ok(instruction.includes('rounds[0].npcLine'));
    });

    it('includes rewrite directive', () => {
      const violations = [{ path: 'greeting', text: 'X', unknowns: ['word'] }];
      const instruction = buildRepairInstruction(violations);
      assert.ok(instruction.includes('JSON'));
    });
  });

  describe('enforceDialogueVocab', () => {
    const cleanDialogue = {
      greeting: 'やあ！',
      defeatLine: 'うう…',
      freedLine: 'ありがとう！',
      rounds: [
        { npcLine: 'こんにちは', options: [
          { text: 'はい', tone: 'positive' },
          { text: 'まあ', tone: 'neutral' },
          { text: 'いいえ', tone: 'negative' }
        ]},
        { npcLine: '元気？', options: [
          { text: 'うん', tone: 'positive' },
          { text: 'まあまあ', tone: 'neutral' },
          { text: '別に', tone: 'negative' }
        ]},
        { npcLine: 'また会おう', options: [
          { text: 'もちろん', tone: 'positive' },
          { text: 'いつか', tone: 'neutral' },
          { text: 'いらない', tone: 'negative' }
        ]}
      ]
    };

    it('returns dialogue as-is when no violations', async () => {
      const cleanCheck = async () => ({ unknownWords: [], count: 0 });
      const result = await enforceDialogueVocab({
        dialogue: cleanDialogue,
        checkViolationsFn: cleanCheck,
        chatFn: async () => { throw new Error('should not be called'); },
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {}
      });
      assert.deepStrictEqual(result.dialogue, cleanDialogue);
      assert.strictEqual(result.repaired, false);
      assert.strictEqual(result.attempts, 0);
    });

    it('skips validation when checkViolationsFn is null', async () => {
      const result = await enforceDialogueVocab({
        dialogue: cleanDialogue,
        checkViolationsFn: null,
        chatFn: async () => { throw new Error('should not be called'); },
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {}
      });
      assert.deepStrictEqual(result.dialogue, cleanDialogue);
      assert.strictEqual(result.repaired, false);
    });

    it('repairs dialogue when violations found and AI succeeds', async () => {
      let validateCallCount = 0;
      const checkFn = async (text) => {
        validateCallCount++;
        // First 15 calls (first validate pass): flag greeting as bad
        if (validateCallCount <= 15 && text === 'BAD greeting') {
          return { unknownWords: ['未知1', '未知2'], count: 2 };
        }
        // All subsequent calls (after repair): everything clean
        return { unknownWords: [], count: 0 };
      };

      const repairedDialogue = { ...cleanDialogue, greeting: 'いい挨拶' };
      const mockChat = async () => JSON.stringify(repairedDialogue);

      const dirtyDialogue = { ...cleanDialogue, greeting: 'BAD greeting' };
      const result = await enforceDialogueVocab({
        dialogue: dirtyDialogue,
        checkViolationsFn: checkFn,
        chatFn: mockChat,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {}
      });
      assert.strictEqual(result.repaired, true);
      assert.strictEqual(result.attempts, 1);
      assert.strictEqual(result.dialogue.greeting, 'いい挨拶');
    });

    it('returns null dialogue after max failed repair attempts', async () => {
      const alwaysBad = async () => ({ unknownWords: ['a', 'b'], count: 2 });
      const mockChat = async () => JSON.stringify(cleanDialogue);

      const result = await enforceDialogueVocab({
        dialogue: cleanDialogue,
        checkViolationsFn: alwaysBad,
        chatFn: mockChat,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {},
        maxAttempts: 2
      });
      assert.strictEqual(result.dialogue, null);
      assert.strictEqual(result.attempts, 2);
      assert.ok(result.violations.length > 0);
    });

    it('returns null dialogue when AI returns invalid JSON during repair', async () => {
      let callCount = 0;
      const trackingCheck = async (text) => {
        callCount++;
        if (callCount <= 15) return { unknownWords: ['a', 'b'], count: 2 };
        return { unknownWords: [], count: 0 };
      };

      const mockChat = async () => 'not valid json at all';
      const result = await enforceDialogueVocab({
        dialogue: cleanDialogue,
        checkViolationsFn: trackingCheck,
        chatFn: mockChat,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {},
        maxAttempts: 1
      });
      assert.strictEqual(result.dialogue, null);
    });

    it('repairs creature dialogue when entityType is creature', async () => {
      let callCount = 0;
      const checkFn = async (text) => {
        callCount++;
        if (callCount <= 12 && text === 'BAD') {
          return { unknownWords: ['未知1', '未知2'], count: 2 };
        }
        return { unknownWords: [], count: 0 };
      };

      const validBefriend = {
        rounds: [
          { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
          { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
          { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
        ]
      };
      const repaired = {
        rounds: validBefriend.rounds.map(r => ({ ...r }))
      };
      repaired.rounds[0] = { ...repaired.rounds[0], speaker: 'いい台詞' };
      const mockChat = async () => JSON.stringify(repaired);

      const dirty = {
        rounds: validBefriend.rounds.map(r => ({ ...r }))
      };
      dirty.rounds[0] = { ...dirty.rounds[0], speaker: 'BAD' };

      const result = await enforceDialogueVocab({
        dialogue: dirty,
        checkViolationsFn: checkFn,
        chatFn: mockChat,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {},
        entityType: 'creature'
      });
      assert.strictEqual(result.repaired, true);
    });

    it('sends multi-turn repair conversation to AI', async () => {
      let capturedMessages = null;
      const checkFn = async (text) => {
        if (text === 'BAD') return { unknownWords: ['x', 'y'], count: 2 };
        return { unknownWords: [], count: 0 };
      };
      const mockChat = async (opts) => {
        capturedMessages = opts.messages;
        return JSON.stringify(cleanDialogue);
      };

      const dirty = { ...cleanDialogue, greeting: 'BAD' };
      await enforceDialogueVocab({
        dialogue: dirty,
        checkViolationsFn: checkFn,
        chatFn: mockChat,
        systemPrompt: 'test-system',
        userPrompt: 'test-user',
        aiConfig: { provider: 'openai', apiKey: 'k' }
      });

      // Should be 3 messages: original user, flawed assistant, repair user
      assert.strictEqual(capturedMessages.length, 3);
      assert.strictEqual(capturedMessages[0].role, 'user');
      assert.strictEqual(capturedMessages[0].content, 'test-user');
      assert.strictEqual(capturedMessages[1].role, 'assistant');
      assert.strictEqual(capturedMessages[2].role, 'user');
      assert.ok(capturedMessages[2].content.includes('greeting'));
    });
  });

  describe('creature entity type support', () => {
    const validBefriend = {
      rounds: [
        { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
        { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
        { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
      ]
    };

    it('extractDialogueStrings extracts 12 fields for creature type', () => {
      const entries = extractDialogueStrings(validBefriend, 'creature');
      assert.strictEqual(entries.length, 12);
    });

    it('validateDialogueVocab works with creature strings', async () => {
      const cleanCheck = async () => ({ unknownWords: [], count: 0 });
      const violations = await validateDialogueVocab(validBefriend, cleanCheck, 'creature');
      assert.strictEqual(violations.length, 0);
    });

    it('enforceDialogueVocab repairs creature dialogue', async () => {
      let callCount = 0;
      const checkFn = async (text) => {
        callCount++;
        if (callCount <= 12 && text === 'BAD') {
          return { unknownWords: ['未知1', '未知2'], count: 2 };
        }
        return { unknownWords: [], count: 0 };
      };
      const repaired = { ...validBefriend };
      repaired.rounds = repaired.rounds.map(r => ({ ...r }));
      repaired.rounds[0] = { ...repaired.rounds[0], speaker: 'いい台詞' };
      const mockChat = async () => JSON.stringify(repaired);

      const dirty = { ...validBefriend };
      dirty.rounds = dirty.rounds.map(r => ({ ...r }));
      dirty.rounds[0] = { ...dirty.rounds[0], speaker: 'BAD' };

      const result = await enforceDialogueVocab({
        dialogue: dirty,
        checkViolationsFn: checkFn,
        chatFn: mockChat,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        aiConfig: {},
        entityType: 'creature'
      });
      assert.strictEqual(result.repaired, true);
    });
  });
});
