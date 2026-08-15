import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createExploreSession,
  EXPLORE_SESSION_HARD_CAP,
  EXPLORE_SESSION_RESUME_AT,
} from '../../../public/js/ui/explore-session.js';

function completeTransport(body, overrides = {}) {
  return {
    transport: true,
    httpStatus: 200,
    body,
    parseError: null,
    networkError: null,
    aborted: false,
    clientAuthMismatch: false,
    authRevision: 0,
    ...overrides,
  };
}

test('hard cap pause fires onPause and resume fires onResume', async () => {
  const events = [];
  // Fail every sync at first so the log builds to the hard cap while paused.
  // The manual `schedule: () => null` suppresses the debounce timer, so no
  // drain runs until we explicitly call syncNow() below.
  let syncing = false;
  const session = createExploreSession({
    syncRequest: async ({ entries }) => {
      if (!syncing) throw new Error('offline');
      // First drain confirms just enough to land the log exactly on the
      // resume mark (40); the forced follow-up drain confirms the rest so
      // the loop terminates instead of spinning on a fixed cursor.
      const dropToResumeMark = EXPLORE_SESSION_HARD_CAP - EXPLORE_SESSION_RESUME_AT;
      const confirmedThroughSeq = entries.length > EXPLORE_SESSION_RESUME_AT
        ? dropToResumeMark
        : entries.reduce((max, entry) => Math.max(max, entry.seq), 0);
      return completeTransport({
        protocolVersion: 1,
        status: 'ok',
        confirmedThroughSeq,
        results: [],
      });
    },
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
  for (let i = 0; i < EXPLORE_SESSION_HARD_CAP; i++) session.recordRoomAction('shrine.choose', { i });
  assert.deepEqual(events.at(-1), ['pause', 'hardCap']);
  assert.equal(session.isPaused(), true);
  assert.equal(session.pendingCount(), EXPLORE_SESSION_HARD_CAP);

  // Now let syncs succeed and drain explicitly; draining below the resume
  // threshold must fire onResume with the hard-cap reason.
  syncing = true;
  await session.syncNow();

  assert.equal(session.isPaused(), false);
  assert.deepEqual(events.at(-1), ['resume', 'hardCap']);
});
