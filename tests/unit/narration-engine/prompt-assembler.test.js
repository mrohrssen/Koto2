import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemblePrompt } from '../../../src/narration-engine/prompt-assembler.js';

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

  it('returns system and user prompt strings', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(typeof result.systemPrompt === 'string');
    assert.ok(typeof result.userPrompt === 'string');
    assert.ok(result.systemPrompt.length > 100);
  });

  it('includes character personality', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('friendly'));
    assert.ok(result.systemPrompt.includes('energetic'));
  });

  it('includes vocab constraints', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('食べる'));
  });

  it('includes example dialogue', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('やあ！勝負しよう！'));
  });

  it('includes memory/encounter info', () => {
    const result = assemblePrompt(minimalInput);
    const combined = result.systemPrompt + result.userPrompt;
    assert.ok(combined.includes('Encounters'));
  });

  it('includes anti-repetition lines', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('前のセリフ１'));
  });

  it('includes output schema in user prompt', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.userPrompt.includes('greeting'));
    assert.ok(result.userPrompt.includes('defeatLine'));
    assert.ok(result.userPrompt.includes('rounds'));
  });

  it('uses correct NPC state goal', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('Help others'));
  });

  it('defaults to possessed state when npcState is missing', () => {
    const input = { ...minimalInput, npcState: undefined };
    const result = assemblePrompt(input);
    assert.ok(result.systemPrompt.includes('Fight everyone'));
  });
});
