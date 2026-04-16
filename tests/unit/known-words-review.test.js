import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCard, gradeCard, getDeckCards, configureSrs } from '../../src/game/internal-srs.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('known-words review — auto-create card', () => {
  let tempDir;
  const userId = 'test-user-review';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'srs-test-'));
    configureSrs({ dataDir: tempDir });
  });

  it('gradeCard throws when card does not exist', () => {
    assert.throws(() => {
      gradeCard(userId, 'vocab', '新しい', 'good');
    }, /not found/);
  });

  it('createCard + gradeCard works for a new word', () => {
    createCard(userId, 'vocab', '新しい', {
      word: '新しい', meaning: 'new', reading: 'あたらしい'
    });
    const result = gradeCard(userId, 'vocab', '新しい', 'good');
    assert.ok(result.state !== undefined, 'should return card with state');
  });

  it('createCard is idempotent — does not overwrite existing card', () => {
    createCard(userId, 'vocab', '古い', {
      word: '古い', meaning: 'old', reading: 'ふるい'
    });
    gradeCard(userId, 'vocab', '古い', 'good');
    // Create again — should not reset the card
    createCard(userId, 'vocab', '古い', {
      word: '古い', meaning: 'old', reading: 'ふるい'
    });
    const cards = getDeckCards(userId, 'vocab');
    const card = cards.find(c => c.id === '古い');
    assert.ok(card.reps > 0, 'card should retain review history');
  });
});
