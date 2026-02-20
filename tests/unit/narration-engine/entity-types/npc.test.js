import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShape, extractStrings, buildRepairInstruction,
  assemblePrompt, getPreviousLines, getMemorySnapshot
} from '../../../../src/narration-engine/entity-types/npc.js';

const validNpcDialogue = {
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

describe('entity-types/npc', () => {
  describe('validateShape', () => {
    it('accepts valid NPC dialogue', () => {
      assert.strictEqual(validateShape(validNpcDialogue).valid, true);
    });
    it('rejects missing greeting', () => {
      const { greeting, ...rest } = validNpcDialogue;
      assert.strictEqual(validateShape(rest).valid, false);
    });
    it('rejects missing defeatLine', () => {
      const { defeatLine, ...rest } = validNpcDialogue;
      assert.strictEqual(validateShape(rest).valid, false);
    });
    it('rejects wrong round count', () => {
      assert.strictEqual(
        validateShape({ ...validNpcDialogue, rounds: [validNpcDialogue.rounds[0]] }).valid,
        false
      );
    });
  });

  describe('extractStrings', () => {
    it('extracts 15 strings from standard dialogue', () => {
      assert.strictEqual(extractStrings(validNpcDialogue).length, 15);
    });
    it('includes greeting path', () => {
      const paths = extractStrings(validNpcDialogue).map(e => e.path);
      assert.ok(paths.includes('greeting'));
    });
  });

  describe('buildRepairInstruction', () => {
    it('includes violation paths', () => {
      const instruction = buildRepairInstruction([
        { path: 'greeting', text: 'X', unknowns: ['困難'] }
      ]);
      assert.ok(instruction.includes('greeting'));
      assert.ok(instruction.includes('困難'));
    });
    it('references NPC JSON structure', () => {
      const instruction = buildRepairInstruction([
        { path: 'greeting', text: 'X', unknowns: ['word'] }
      ]);
      assert.ok(instruction.includes('greeting'));
      assert.ok(instruction.includes('defeatLine'));
      assert.ok(instruction.includes('freedLine'));
    });
  });

  describe('assemblePrompt', () => {
    it('returns systemBlocks and userPrompt', () => {
      const result = assemblePrompt({
        characterCard: {
          name: 'ナギ', nameEn: 'Nagi', personality: 'test',
          quirk: 'test', goals: { possessed: 'goal' },
          exampleDialogue: ['テスト']
        },
        vocabWords: ['猫', '犬'],
        jlptLevel: 'N4',
        memory: null,
        npcState: 'possessed',
        previousLines: []
      });
      assert.ok(result.systemBlocks.length > 0);
      assert.ok(result.userPrompt.includes('greeting'));
    });
  });

  describe('getPreviousLines', () => {
    it('extracts greeting and npcLines', () => {
      const lines = getPreviousLines(validNpcDialogue);
      assert.ok(lines.includes('やあ！'));
      assert.ok(lines.includes('こんにちは'));
    });
    it('returns empty array for null', () => {
      assert.deepStrictEqual(getPreviousLines(null), []);
    });
  });

  describe('getMemorySnapshot', () => {
    it('extracts encounters, bond, liberated', () => {
      const snap = getMemorySnapshot({
        counters: { encounters: 3 },
        bond: 2,
        flags: { liberated: true }
      });
      assert.deepStrictEqual(snap, { encounters: 3, bond: 2, liberated: true });
    });
  });
});
