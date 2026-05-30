import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDialogue, parseDialogueJson, validateDialogueShape } from '../../../src/narration-engine/generation.js';

describe('generation', () => {
  const validDialogue = {
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

  describe('parseDialogueJson', () => {
    it('parses valid JSON string', () => {
      const result = parseDialogueJson(JSON.stringify(validDialogue));
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });

    it('strips markdown fences', () => {
      const wrapped = '```json\n' + JSON.stringify(validDialogue) + '\n```';
      const result = parseDialogueJson(wrapped);
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });

    it('returns null for invalid JSON', () => {
      assert.strictEqual(parseDialogueJson('not json'), null);
    });

    it('returns null for null input', () => {
      assert.strictEqual(parseDialogueJson(null), null);
    });
  });

  describe('validateDialogueShape', () => {
    it('accepts valid dialogue', () => {
      const result = validateDialogueShape(validDialogue);
      assert.strictEqual(result.valid, true);
    });

    it('rejects missing greeting', () => {
      const { greeting, ...rest } = validDialogue;
      const result = validateDialogueShape(rest);
      assert.strictEqual(result.valid, false);
    });

    it('rejects wrong number of rounds', () => {
      const bad = { ...validDialogue, rounds: [validDialogue.rounds[0]] };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });

    it('rejects round missing options', () => {
      const bad = {
        ...validDialogue,
        rounds: validDialogue.rounds.map((r, i) =>
          i === 0 ? { npcLine: r.npcLine } : r
        )
      };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });

    it('rejects option missing tone', () => {
      const bad = {
        ...validDialogue,
        rounds: validDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, options: r.options.map((o, j) => j === 0 ? { text: o.text } : o) } : r
        )
      };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });

    it('rejects null input', () => {
      const result = validateDialogueShape(null);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('generateDialogue', () => {
    it('returns dialogue from mock AI', async () => {
      const mockChat = async () => JSON.stringify(validDialogue);
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' }
      });
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
      assert.strictEqual(result.rounds.length, 3);
    });

    it('returns null when AI returns invalid JSON after retries', async () => {
      const mockChat = async () => 'not json at all';
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        maxRetries: 1
      });
      assert.strictEqual(result, null);
    });

    it('returns null when AI returns wrong shape', async () => {
      const mockChat = async () => JSON.stringify({ foo: 'bar' });
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        maxRetries: 1
      });
      assert.strictEqual(result, null);
    });

    it('retries on first failure then succeeds', async () => {
      let callCount = 0;
      const mockChat = async () => {
        callCount++;
        if (callCount === 1) return 'bad json';
        return JSON.stringify(validDialogue);
      };
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' }
      });
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });
  });

  describe('generateDialogue with entityType', () => {
    const validBefriend = {
      rounds: [
        { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
        { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
        { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
      ]
    };

    it('validates creature shape when entityType is creature', async () => {
      const mockChat = async () => JSON.stringify(validBefriend);
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        entityType: 'creature'
      });
      assert.ok(result);
      assert.strictEqual(result.rounds.length, 3);
      assert.ok(result.rounds[0].speaker);
    });

    it('rejects NPC shape when entityType is creature', async () => {
      const npcDialogue = {
        greeting: 'やあ', defeatLine: 'うう', freedLine: 'ありがとう',
        rounds: [
          { npcLine: 'こんにちは', options: [{ text: 'はい', tone: 'positive' }, { text: 'まあ', tone: 'neutral' }, { text: 'いいえ', tone: 'negative' }] },
          { npcLine: '元気？', options: [{ text: 'うん', tone: 'positive' }, { text: 'まあまあ', tone: 'neutral' }, { text: '別に', tone: 'negative' }] },
          { npcLine: 'また', options: [{ text: 'もちろん', tone: 'positive' }, { text: 'いつか', tone: 'neutral' }, { text: 'いらない', tone: 'negative' }] }
        ]
      };
      const mockChat = async () => JSON.stringify(npcDialogue);
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        entityType: 'creature',
        maxRetries: 0
      });
      assert.strictEqual(result, null);
    });

    it('defaults to NPC validation when entityType is omitted', async () => {
      const mockChat = async () => JSON.stringify(validDialogue);
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' }
      });
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });

    it('forwards Claude and Gemini model fields to chatFn', async () => {
      const calls = [];
      const mockChat = async (args) => {
        calls.push(args);
        return JSON.stringify(validBefriend);
      };
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'system',
        userPrompt: 'user',
        aiConfig: {
          provider: 'anthropic',
          apiKey: 'key',
          claudeModel: 'claude-test',
          geminiModel: 'gemini-test'
        },
        entityType: 'creature'
      });

      assert.ok(result);
      assert.equal(calls[0].claudeModel, 'claude-test');
      assert.equal(calls[0].geminiModel, 'gemini-test');
    });
  });
});
