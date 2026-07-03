import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSession } from '../../../public/js/ui/explore-session.js';

test('hard cap pause fires onPause and resume fires onResume', async () => {
  const events = [];
  const session = createExploreSession({
    syncRequest: async () => { throw new Error('offline'); },
    onPause: info => events.push(['pause', info.reason]),
    onResume: info => events.push(['resume', info.reason]),
    schedule: () => null, cancel: () => {},
  });
  session.adoptRunway({
    sessionEpoch: 'ese_0000000000000000', currentRoom: 0, preparedRooms: [{
      index: 0, roomId: 'r0', actionSeq: 0, room: { id: 'r0', type: 'shrine' },
      acceptedActions: ['shrine.choose'], actionEffects: {}, dependencies: [], offlineReady: true,
    }],
  });
  for (let i = 0; i < 50; i++) session.recordRoomAction('shrine.choose', { i });
  assert.deepEqual(events.at(-1), ['pause', 'hardCap']);
});
