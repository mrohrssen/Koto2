import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShape, extractStrings, buildRepairInstruction,
  assemblePrompt, getPreviousLines, getMemorySnapshot,
  requiredCardFields
} from '../../../../src/narration-engine/entity-types/creature.js';

const validBefriendDialogue = {
  rounds: [
    { speaker: '友達になろう！', options: ['うん！', '魚が好き。', '靴を買った。'], correctIndex: 0 },
    { speaker: '一緒に遊ぼう！', options: ['テレビを見た。', 'いいね！', '車が速い。'], correctIndex: 1 },
    { speaker: '仲間だね！', options: ['昨日は暑い。', 'お金がない。', 'ずっと仲間！'], correctIndex: 2 }
  ]
};

describe('entity-types/creature', () => {
  it('has minimal required card fields', () => {
    assert.ok(requiredCardFields.includes('id'));
    assert.ok(requiredCardFields.includes('name'));
    assert.ok(requiredCardFields.includes('personality'));
    assert.ok(!requiredCardFields.includes('goals'));
  });

  describe('validateShape', () => {
    it('accepts valid befriend dialogue', () => {
      assert.strictEqual(validateShape(validBefriendDialogue).valid, true);
    });
    it('rejects missing rounds', () => {
      assert.strictEqual(validateShape({}).valid, false);
    });
    it('rejects wrong round count', () => {
      assert.strictEqual(
        validateShape({ rounds: [validBefriendDialogue.rounds[0]] }).valid, false
      );
    });
    it('rejects round missing speaker', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { options: r.options, correctIndex: r.correctIndex } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });
    it('rejects round with wrong option count', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, options: ['a', 'b'] } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });
    it('rejects correctIndex out of range', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, correctIndex: 5 } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });
    it('rejects null', () => {
      assert.strictEqual(validateShape(null).valid, false);
    });
  });

  describe('extractStrings', () => {
    it('extracts 12 strings (3 speakers + 9 options)', () => {
      assert.strictEqual(extractStrings(validBefriendDialogue).length, 12);
    });
    it('includes speaker paths', () => {
      const paths = extractStrings(validBefriendDialogue).map(e => e.path);
      assert.ok(paths.includes('rounds[0].speaker'));
      assert.ok(paths.includes('rounds[2].speaker'));
    });
    it('includes option paths', () => {
      const paths = extractStrings(validBefriendDialogue).map(e => e.path);
      assert.ok(paths.includes('rounds[0].options[0]'));
      assert.ok(paths.includes('rounds[2].options[2]'));
    });
  });

  describe('buildRepairInstruction', () => {
    it('includes violation paths and references befriend schema', () => {
      const instruction = buildRepairInstruction([
        { path: 'rounds[0].speaker', text: 'X', unknowns: ['未知'] }
      ]);
      assert.ok(instruction.includes('rounds[0].speaker'));
      assert.ok(instruction.includes('未知'));
      assert.ok(instruction.includes('speaker'));
      assert.ok(instruction.includes('correctIndex'));
    });
  });

  describe('assemblePrompt', () => {
    it('returns systemBlocks and userPrompt with befriend schema', () => {
      const result = assemblePrompt({
        characterCard: {
          id: 'kamedor', name: 'カメドル', nameEn: 'Kamedor',
          element: 'water', personality: 'Patient', quirk: 'Mentions water',
          archetype: 'Tank/Healer', exampleDialogue: ['ゆっくり行こう。']
        },
        vocabWords: ['猫', '犬'],
        jlptLevel: 'N4',
        memory: null,
        previousLines: []
      });
      assert.ok(result.systemBlocks.length > 0);
      assert.ok(result.userPrompt.includes('speaker'));
      assert.ok(result.userPrompt.includes('correctIndex'));
    });
    it('does not include lorebook layer', () => {
      const result = assemblePrompt({
        characterCard: {
          id: 'kamedor', name: 'カメドル', nameEn: 'Kamedor',
          element: 'water', personality: 'Patient',
          exampleDialogue: []
        },
        vocabWords: [],
        jlptLevel: 'N4',
        memory: null,
        previousLines: []
      });
      const labels = result.systemBlocks.map(b => b.label);
      assert.ok(!labels.includes('lorebook'));
    });
    it('instructs AI creature speaker lines to be questions or clear prompts', () => {
      const { userPrompt, systemBlocks } = assemblePrompt({
        characterCard: {
          id: 'hi',
          name: '火',
          nameEn: 'Fire',
          personality: 'Brave and direct',
          exampleDialogue: ['行こう！']
        },
        vocabWords: ['行く', '水', '好き'],
        jlptLevel: 'N4',
        memory: null,
        previousLines: []
      });

      const allPromptText = [userPrompt, ...systemBlocks.map(b => b.text)].join('\n');
      assert.match(allPromptText, /question or clear conversational prompt/i);
      assert.match(allPromptText, /contextually wrong/i);
    });
  });

  describe('getPreviousLines', () => {
    it('extracts speaker lines from cached dialogue', () => {
      const lines = getPreviousLines(validBefriendDialogue);
      assert.ok(lines.includes('友達になろう！'));
      assert.ok(lines.includes('仲間だね！'));
      assert.strictEqual(lines.length, 3);
    });
    it('returns empty for null', () => {
      assert.deepStrictEqual(getPreviousLines(null), []);
    });
  });

  describe('getMemorySnapshot', () => {
    it('extracts befriendAttempts', () => {
      const snap = getMemorySnapshot({
        counters: { befriendAttempts: 3 },
        flags: { befriended: true }
      });
      assert.deepStrictEqual(snap, { befriendAttempts: 3, befriended: true });
    });
    it('handles missing counters', () => {
      const snap = getMemorySnapshot({});
      assert.strictEqual(snap.befriendAttempts, 0);
      assert.strictEqual(snap.befriended, false);
    });
  });
});
