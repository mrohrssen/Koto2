import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');
const explorationSrc = readFileSync(resolve(repoRoot, 'public/js/ui/exploration.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const autoProceedSrc = sourceBetween(
  gameSrc,
  'async function autoProceed()',
  '// ============ ENEMY DIALOGUE ============'
);

const proceedWithRevealBufferSrc = sourceBetween(
  explorationSrc,
  'export async function proceedWithRevealBuffer',
  'async function proceedToNextRoom()'
);

const startEncounterSrc = sourceBetween(
  gameSrc,
  'async function startEncounter()',
  'async function returnToHub()'
);

test('autoProceed delegates room travel to session-aware exploration proceed', () => {
  const guardIndex = autoProceedSrc.indexOf('if (autoProceedInFlight) return');
  const setIndex = autoProceedSrc.indexOf('autoProceedInFlight = true');
  const delegateIndex = autoProceedSrc.indexOf('await explorationUI.proceedWithRevealBuffer()');
  const catchIndex = autoProceedSrc.indexOf('catch (error)');
  const finallyIndex = autoProceedSrc.indexOf('finally {', catchIndex);
  const clearIndex = autoProceedSrc.indexOf('autoProceedInFlight = false', finallyIndex);

  assert.ok(guardIndex >= 0, 'autoProceed should keep the in-flight guard');
  assert.ok(setIndex > guardIndex, 'autoProceed should set the in-flight guard before proceeding');
  assert.ok(delegateIndex > setIndex, 'autoProceed should delegate to the session-aware proceed helper');
  assert.ok(finallyIndex > delegateIndex, 'autoProceed should clear the guard in finally');
  assert.ok(clearIndex > finallyIndex, 'autoProceed should reset the in-flight guard in finally');
  assert.match(autoProceedSrc, /console\.warn\('\[autoProceed\] Failed to proceed:', error\)/);
  assert.doesNotMatch(
    autoProceedSrc,
    /explorationUI\.showProceedIngredientDrops/,
    'autoProceed must not call the removed ingredient popup helper'
  );
  assert.doesNotMatch(autoProceedSrc, /apiProceed\(\{\s*actionId/, 'autoProceed should not call legacy verified proceed');
  assert.doesNotMatch(autoProceedSrc, /createPendingRunAction/, 'autoProceed should not duplicate optimistic proceed logic');
  assert.doesNotMatch(autoProceedSrc, /playRoomTransition\(/, 'autoProceed should let exploration handle room transition');
});

test('proceedWithRevealBuffer queues buffered proceed through explore session before legacy fallback', () => {
  const sessionIndex = proceedWithRevealBufferSrc.indexOf("recordRoomAction('proceed'");
  const applyIndex = proceedWithRevealBufferSrc.indexOf('applyExploreSessionProceedResult');
  const legacyIndex = proceedWithRevealBufferSrc.indexOf('const result = await apiProceed();');

  assert.ok(sessionIndex >= 0, 'proceedWithRevealBuffer should queue proceed in the explore session');
  assert.ok(applyIndex > sessionIndex, 'proceedWithRevealBuffer should apply the accepted session result locally');
  assert.ok(legacyIndex > applyIndex, 'legacy apiProceed fallback should remain after the session path');

  assert.match(proceedWithRevealBufferSrc, /recordRoomAction\('proceed'/);
  assert.match(proceedWithRevealBufferSrc, /applyExploreSessionProceedResult/);
  assert.match(explorationSrc, /function applyExploreSessionProceedResult[\s\S]*advanceStateToBufferedNextRoom\(draft\)/);
});

test('exploration wires explore session recovery drains', () => {
  assert.match(
    explorationSrc,
    /addEventListener\('online'[\s\S]*syncNow\(\)/,
    'online recovery should drain the explore session'
  );
  assert.match(
    explorationSrc,
    /visibilitychange[\s\S]*syncNow\(\)/,
    'visibility restore should drain the explore session'
  );
});

test('startEncounter resets in-flight flags when explore drain or encounter API fails', () => {
  const tryIndex = startEncounterSrc.indexOf('try {');
  const drainIndex = startEncounterSrc.indexOf("await exploreSession.syncNow({ reason: 'combatStart' })");
  const creatureApiIndex = startEncounterSrc.indexOf('result = await apiStartCreatureEncounter()');
  const catchIndex = startEncounterSrc.indexOf('catch (error)');
  const finallyIndex = startEncounterSrc.indexOf('finally {', catchIndex);
  const resetIndex = startEncounterSrc.indexOf('encounterStarting = false', finallyIndex);
  const sceneResetIndex = startEncounterSrc.indexOf('sceneTransitionActive = false', finallyIndex);

  assert.ok(tryIndex >= 0, 'startEncounter should wrap setup in try/finally');
  assert.ok(drainIndex > tryIndex, 'explore drain should be inside the try block');
  assert.ok(creatureApiIndex > tryIndex, 'encounter API selection should be inside the try block');
  assert.ok(catchIndex > creatureApiIndex, 'startEncounter should catch drain/API failures');
  assert.ok(finallyIndex > catchIndex, 'startEncounter should reset flags in finally');
  assert.ok(resetIndex > finallyIndex, 'encounterStarting should reset in finally');
  assert.ok(sceneResetIndex > finallyIndex, 'sceneTransitionActive should reset in finally');
});
