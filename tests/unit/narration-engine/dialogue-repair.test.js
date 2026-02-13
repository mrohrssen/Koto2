import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDialogueStrings, validateDialogueVocab } from '../../../src/narration-engine/dialogue-repair.js';

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
});
