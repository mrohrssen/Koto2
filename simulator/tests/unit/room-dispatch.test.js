import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRoomHandler, registerHandler } from '../../engine/rooms/index.js';
import { handleSkipRoom } from '../../engine/rooms/skip-room.js';
import { handleUnknownRoom } from '../../engine/rooms/unknown.js';

describe('room dispatch', () => {
  it('encounter returns a handler once registered', () => {
    const fakeHandler = async () => ({ outcome: 'cleared' });
    registerHandler('encounter', fakeHandler);
    const handler = getRoomHandler('encounter');
    assert.equal(handler, fakeHandler);
  });

  it('shrine returns handleSkipRoom', () => {
    const handler = getRoomHandler('shrine');
    assert.equal(handler, handleSkipRoom);
  });

  it('unknown type returns handleUnknownRoom', () => {
    const handler = getRoomHandler('totallyFakeRoomType');
    assert.equal(handler, handleUnknownRoom);
  });

  it('null handler falls back to handleSkipRoom', () => {
    registerHandler('testNull', null);
    const handler = getRoomHandler('testNull');
    assert.equal(handler, handleSkipRoom);
  });

  it('handleUnknownRoom logs and returns unknown_type', async () => {
    const events = [];
    const logEvent = (day, run, room, type, data) => events.push({ day, run, room, type, data });
    const room = { type: 'weirdRoom' };
    const context = { day: 1, run: 1, roomIndex: 3 };
    const result = await handleUnknownRoom(null, room, context, logEvent);
    assert.equal(result.outcome, 'unknown_type');
    assert.equal(events.length, 1);
    assert.equal(events[0].data.roomType, 'weirdRoom');
    assert.equal(events[0].data.outcome, 'unknown_type');
  });

  it('handleSkipRoom logs and returns skipped', async () => {
    const events = [];
    const logEvent = (day, run, room, type, data) => events.push({ day, run, room, type, data });
    const room = { type: 'shrine' };
    const context = { day: 2, run: 1, roomIndex: 5 };
    const result = await handleSkipRoom(null, room, context, logEvent);
    assert.equal(result.outcome, 'skipped');
    assert.equal(events.length, 1);
    assert.equal(events[0].data.outcome, 'skipped');
  });
});
