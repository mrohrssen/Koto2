import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBefriendDisplayRounds } from '../../src/game/services/befriend-dialogue-display-service.js';

describe('befriend dialogue display service', () => {
  it('tokenizes speaker and options without exposing correctIndex', () => {
    const rounds = [{
      speaker: '水が好き？',
      speakerTts: 'speaker.wav',
      options: ['うん', 'いいえ', 'またね'],
      optionsTts: ['a.wav', 'b.wav', 'c.wav'],
      correctIndex: 0
    }];
    const dict = new Map([
      ['水', { reading: 'みず', definitions: ['water'] }],
      ['好き', { reading: 'すき', definitions: ['like'] }],
      ['うん', { reading: 'うん', definitions: ['yeah'] }],
      ['いいえ', { reading: 'いいえ', definitions: ['no'] }],
      ['またね', { reading: 'またね', definitions: ['see you'] }]
    ]);

    const result = buildBefriendDisplayRounds(rounds, {
      userId: 'u1',
      dict
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].speaker.raw, '水が好き？');
    assert.deepEqual(result[0].speaker.audio, { userId: 'u1', key: 'speaker.wav' });
    assert.equal(result[0].speaker.tokens.some(t => t.base === '水'), true);
    assert.equal(result[0].options.length, 3);
    assert.equal(result[0].options[0].raw, 'うん');
    assert.deepEqual(result[0].options[0].audio, { userId: 'u1', key: 'a.wav' });
    assert.equal(Object.hasOwn(result[0], 'correctIndex'), false);
  });
});
