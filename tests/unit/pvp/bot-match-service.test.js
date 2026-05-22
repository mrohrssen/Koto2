import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectBotForRating, ActiveBotTracker } from '../../../src/pvp/bot-match-service.js';

const bot = (id, rating) => ({ id, username: id, displayRating: rating });

describe('bot-match-service', () => {
  it('prefers bots within 200 rating', () => {
    const picked = selectBotForRating({
      targetRating: 1200,
      bots: [bot('far', 1600), bot('near', 1380), bot('closest', 1240)],
      activeBotIds: new Set()
    });
    assert.equal(picked.id, 'closest');
  });

  it('selects nearest bot when none are within 200 rating', () => {
    const picked = selectBotForRating({
      targetRating: 1200,
      bots: [bot('high', 1510), bot('low', 880)],
      activeBotIds: new Set()
    });
    assert.equal(picked.id, 'high');
  });

  it('does not select active bots', () => {
    const picked = selectBotForRating({
      targetRating: 1200,
      bots: [bot('active', 1205), bot('free', 1300)],
      activeBotIds: new Set(['active'])
    });
    assert.equal(picked.id, 'free');
  });

  it('tracks active bot assignments', () => {
    const tracker = new ActiveBotTracker();
    assert.equal(tracker.isActive('bot-a'), false);
    tracker.markActive('bot-a', 'ABCD');
    assert.equal(tracker.isActive('bot-a'), true);
    tracker.releaseByMatch('ABCD');
    assert.equal(tracker.isActive('bot-a'), false);
  });
});
