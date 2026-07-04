import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Combat-tier cutover invariant (explore subway): the session-first combat start
 * must be ATTEMPTED before the pending-session drain guard that shows the
 * "Combat will start when your progress syncs" soft pause.
 *
 * Root cause this locks: `startEncounter` used to run the `pendingCount > 0`
 * drain guard FIRST and `return` with a soft pause when the drain could not
 * clear (i.e. offline). That path is unreachable-for-combat while offline, so a
 * fight that SHOULD start offline through `startCreatureEncounterFromSession`
 * (append a `<kind>.start` entry, build local combat from the prepared payload)
 * was blocked and the subway harness saw the soft pause fire. The fix reorders
 * the two blocks so the offline session start runs first; the drain guard only
 * gates the legacy/online start path (rooms with no offline combatStart payload).
 *
 * Source-ordering assertion (same technique as kanji-kombat-start-transition.test.js)
 * so it needs no browser and no game.js import graph.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('startEncounter attempts the session-first combat start before the drain/soft-pause guard', () => {
  const startEncounterSource = sourceBetween(
    gameSrc,
    'async function startEncounter()',
    'async function returnToHub()'
  );

  const sessionStartIndex = startEncounterSource.indexOf('startCreatureEncounterFromSession(exploreSession)');
  const drainGuardIndex = startEncounterSource.indexOf("syncNow({ reason: 'combatStart' })");
  const softPauseIndex = startEncounterSource.indexOf('Combat will start when your progress syncs');

  assert.ok(sessionStartIndex >= 0, 'startEncounter should call startCreatureEncounterFromSession');
  assert.ok(drainGuardIndex >= 0, 'startEncounter should still have the combatStart drain guard for the legacy path');
  assert.ok(softPauseIndex >= 0, 'startEncounter should still surface the soft pause on the legacy/online path');

  assert.ok(
    sessionStartIndex < drainGuardIndex,
    'the offline session-first combat start must be attempted BEFORE the pending-session drain guard '
    + 'so an offline fight starts through the session instead of soft-pausing',
  );
  assert.ok(
    sessionStartIndex < softPauseIndex,
    'the offline session-first combat start must be attempted BEFORE the combat-start soft pause '
    + 'is shown, otherwise offline combat is blocked at the door',
  );
});
