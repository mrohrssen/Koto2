import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemblePrompt, flattenSystemBlocks } from '../../../src/narration-engine/prompt-assembler.js';

describe('prompt-assembler', () => {
  const minimalInput = {
    characterCard: {
      id: 'npc_01',
      name: 'ユウキ',
      nameEn: 'Yuuki',
      personality: 'friendly, energetic',
      quirk: 'Loves high-fives',
      goals: { possessed: 'Fight everyone', glitching: 'Ask for help', liberated: 'Help others' },
      description: 'A high school student',
      knowledge: { personal: 'Baseball team captain', world: ['the_system'] },
      exampleDialogue: ['やあ！勝負しよう！', 'ありがとう！']
    },
    vocabWords: ['食べる', '飲む', '走る'],
    jlptLevel: 'N4',
    memory: {
      counters: { encounters: 2, defeats: 0, liberations: 1 },
      flags: { liberated: true, befriended: false, betrayed: false },
      encounterLog: [
        { outcome: 'positive', summary: 'Player liberated NPC' }
      ],
      narrative: 'Freed after two battles. Grateful.',
      bond: 1
    },
    npcState: 'liberated',
    previousLines: ['前のセリフ１', '前のセリフ２']
  };

  it('flattenSystemBlocks returns a string with all content', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(typeof flat === 'string');
    assert.ok(flat.length > 100);
  });

  it('includes character personality', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('friendly'));
    assert.ok(flat.includes('energetic'));
  });

  it('includes vocab constraints', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('食べる'));
  });

  it('includes example dialogue', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('やあ！勝負しよう！'));
  });

  it('includes memory/encounter info', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    const combined = flat + result.userPrompt;
    assert.ok(combined.includes('Encounters'));
  });

  it('includes anti-repetition lines', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('前のセリフ１'));
  });

  it('includes output schema in user prompt', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.userPrompt.includes('greeting'));
    assert.ok(result.userPrompt.includes('defeatLine'));
    assert.ok(result.userPrompt.includes('rounds'));
  });

  it('uses correct NPC state goal', () => {
    const result = assemblePrompt(minimalInput);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('Help others'));
  });

  it('defaults to possessed state when npcState is missing', () => {
    const input = { ...minimalInput, npcState: undefined };
    const result = assemblePrompt(input);
    const flat = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flat.includes('Fight everyone'));
  });

  it('returns systemBlocks array instead of flat systemPrompt', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(Array.isArray(result.systemBlocks), 'systemBlocks should be an array');
    assert.ok(result.systemBlocks.length >= 3, 'should have at least instructions, vocab, character');
    assert.ok(typeof result.userPrompt === 'string');
  });

  it('each block has label, text, and cache fields', () => {
    const result = assemblePrompt(minimalInput);
    for (const block of result.systemBlocks) {
      assert.ok(typeof block.label === 'string', `block missing label`);
      assert.ok(typeof block.text === 'string', `block ${block.label} missing text`);
      assert.ok(typeof block.cache === 'boolean', `block ${block.label} missing cache flag`);
    }
  });

  it('marks instructions and vocab as cacheable, others as not', () => {
    const result = assemblePrompt(minimalInput);
    const byLabel = Object.fromEntries(result.systemBlocks.map(b => [b.label, b]));
    assert.strictEqual(byLabel.instructions.cache, true);
    assert.strictEqual(byLabel.vocab.cache, true);
    assert.strictEqual(byLabel.character.cache, false);
  });

  it('omits empty blocks (no lorebook, no memory, no antiRepeat)', () => {
    const input = {
      ...minimalInput,
      memory: null,
      previousLines: null,
      characterCard: { ...minimalInput.characterCard, knowledge: {} }
    };
    const result = assemblePrompt(input);
    const labels = result.systemBlocks.map(b => b.label);
    assert.ok(!labels.includes('lorebook'), 'should omit empty lorebook block');
    assert.ok(!labels.includes('memory'), 'should omit empty memory block');
    assert.ok(!labels.includes('antiRepeat'), 'should omit empty antiRepeat block');
  });

  it('flattenSystemBlocks produces the same text as old concatenation', () => {
    const result = assemblePrompt(minimalInput);
    const flattened = flattenSystemBlocks(result.systemBlocks);
    assert.ok(flattened.includes('食べる'), 'vocab present');
    assert.ok(flattened.includes('friendly'), 'character present');
    assert.ok(flattened.includes('Encounters'), 'memory present');
    assert.ok(flattened.includes('前のセリフ１'), 'anti-repeat present');
  });
});
