import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as bootstrapClient from '../../../public/js/ui/bootstrap-client.js';

describe('known-word review membership', () => {
  beforeEach(() => {
    bootstrapClient.setKnownWords([]);
  });

  it('keeps an Again/Learning word known when the server says it is known', () => {
    assert.equal(typeof bootstrapClient.applyKnownWordReviewMembership, 'function');

    bootstrapClient.applyKnownWordReviewMembership('忘れる', {
      mastered: false,
      isKnown: true,
      card: { state: 1 },
    });

    assert.equal(bootstrapClient.getKnownWords().has('忘れる'), true);
  });

  it('uses authoritative isKnown for both add and remove transitions', () => {
    assert.equal(typeof bootstrapClient.applyKnownWordReviewMembership, 'function');

    bootstrapClient.applyKnownWordReviewMembership('知る', {
      mastered: false,
      isKnown: true,
    });
    assert.equal(bootstrapClient.getKnownWords().has('知る'), true);

    bootstrapClient.applyKnownWordReviewMembership('知る', {
      mastered: true,
      isKnown: false,
    });
    assert.equal(bootstrapClient.getKnownWords().has('知る'), false);
  });

  it('falls back to mastered for responses from older servers', () => {
    assert.equal(typeof bootstrapClient.applyKnownWordReviewMembership, 'function');

    bootstrapClient.applyKnownWordReviewMembership('古い', { mastered: true });
    assert.equal(bootstrapClient.getKnownWords().has('古い'), true);

    bootstrapClient.applyKnownWordReviewMembership('古い', { mastered: false });
    assert.equal(bootstrapClient.getKnownWords().has('古い'), false);
  });

  it('does not change membership when a response has no membership signal', () => {
    assert.equal(typeof bootstrapClient.applyKnownWordReviewMembership, 'function');
    bootstrapClient.setKnownWords(['亀']);

    bootstrapClient.applyKnownWordReviewMembership('亀', null);
    bootstrapClient.applyKnownWordReviewMembership('亀', {});

    assert.equal(bootstrapClient.getKnownWords().has('亀'), true);
  });

  it('wires the legacy hub review callback through the shared membership applier', () => {
    const gameSource = readFileSync(resolve(import.meta.dirname, '../../../public/game.js'), 'utf8');

    assert.match(gameSource,
      /applyKnownWordReviewMembership\(wordText, result\)/,
      'the legacy speed-review callback must consume authoritative membership');
  });
});
