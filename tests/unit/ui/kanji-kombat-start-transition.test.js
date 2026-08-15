import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');
const combatLoopSrc = readFileSync(resolve(repoRoot, 'public/js/ui/combat-loop.js'), 'utf8');
const explorationSrc = readFileSync(resolve(repoRoot, 'public/js/ui/exploration.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('Kanji Kombat keeps creature select covering hub until the battle scene starts', () => {
  const helperSource = sourceBetween(
    gameSrc,
    'async function enterKanjiKombatCombat(state)',
    'async function recoverKanjiKombatStartState()'
  );
  const setupSource = sourceBetween(
    gameSrc,
    'async function startKanjiKombatSetup()',
    'function showCollectionSelect'
  );

  const startApiIndex = setupSource.indexOf('apiStartKanjiKombat(creatureId)');
  const enterCombatIndex = setupSource.indexOf('await enterKanjiKombatCombat(result.state)');
  const removeOverlayIndex = setupSource.lastIndexOf('removeCollectionOverlay()');
  const updateUiIndex = setupSource.lastIndexOf('updateUI()');
  const updateStateIndex = helperSource.indexOf('updateGameState(state)');
  const clearActionsIndex = helperSource.indexOf('actions.clear()');
  const startLoopIndex = helperSource.indexOf('await combatLoopUI.startCombatLoop({ kanjiKombatOpening: true })');

  assert.ok(startApiIndex >= 0, 'Kanji Kombat setup should call the start API');
  assert.ok(enterCombatIndex > startApiIndex, 'battle scene startup should wait for the start API state');
  assert.ok(clearActionsIndex > updateStateIndex, 'stale hub controls should clear after entering combat state');
  assert.ok(clearActionsIndex < startLoopIndex, 'stale hub controls should clear before the opening battle scene starts');
  assert.ok(
    removeOverlayIndex > enterCombatIndex,
    'creature select overlay should remain visible until the battle scene start has been awaited'
  );
  assert.ok(updateUiIndex > removeOverlayIndex, 'the final UI refresh should happen after removing the overlay');
});

test('Kanji Kombat start recovers committed combat after a missing start response', () => {
  const helperSource = sourceBetween(
    gameSrc,
    'async function recoverKanjiKombatStartState()',
    'async function startKanjiKombatSetup()'
  );
  const setupSource = sourceBetween(
    gameSrc,
    'async function startKanjiKombatSetup()',
    'function showCollectionSelect'
  );

  assert.match(helperSource, /apiGetGameStateAfterExploreDrain\(\)/);
  assert.doesNotMatch(
    helperSource,
    /apiGetGameStateAfterExploreDrain\(\s*['\"]/,
    'Task 10 removed ignored reason metadata from Explore drain-backed state fetches',
  );
  assert.match(helperSource, /isKanjiKombatCombatState\(recoveredState\)/);
  assert.match(helperSource, /await enterKanjiKombatCombat\(recoveredState\)/);
  assert.match(setupSource, /else if \(!result\?\.state\) \{\s*await recoverKanjiKombatStartState\(\);/);

  const startApiIndex = setupSource.indexOf('apiStartKanjiKombat(creatureId)');
  const recoverIndex = setupSource.indexOf('await recoverKanjiKombatStartState()');
  const removeOverlayIndex = setupSource.lastIndexOf('removeCollectionOverlay()');
  assert.ok(recoverIndex > startApiIndex, 'recovery should run only after the start API response is missing');
  assert.ok(removeOverlayIndex > recoverIndex, 'creature select overlay should stay up while recovery checks committed state');
});

test('async hub render does not redraw hub buttons after phase changes', () => {
  const renderHubSource = sourceBetween(
    explorationSrc,
    'export async function renderHub()',
    '/** Area selection'
  );

  const availabilityIndex = renderHubSource.indexOf('apiGetKanjiKombatAvailability');
  const phaseGuardIndex = renderHubSource.indexOf("getGameState().phase !== 'hub'");
  const renderButtonsIndex = renderHubSource.indexOf('renderButtons([');

  assert.ok(availabilityIndex >= 0, 'hub render should load Kanji Kombat availability before rendering buttons');
  assert.ok(phaseGuardIndex > availabilityIndex, 'hub render should re-check phase after async availability loading');
  assert.ok(phaseGuardIndex < renderButtonsIndex, 'stale hub renders should exit before drawing buttons');
});

test('Kanji Kombat opening travel delays first-wave enemies until after walking stops', () => {
  const startLoopSource = sourceBetween(
    combatLoopSrc,
    'export async function startCombatLoop',
    '/**\n * Execute a single player attack'
  );
  const revealSource = sourceBetween(
    combatLoopSrc,
    'async function playKanjiKombatEnemyTravelReveal',
    'async function playKanjiKombatOpeningTransition'
  );
  const openingSource = sourceBetween(
    combatLoopSrc,
    'async function playKanjiKombatOpeningTransition',
    'async function playKanjiKombatNextWaveTransition'
  );

  assert.match(startLoopSource, /opts\.kanjiKombatOpening === true/);
  assert.match(startLoopSource, /gs\.run\?\.mode === 'kanjiKombat'/);
  assert.match(startLoopSource, /enemies:\s*isKanjiKombatOpening\s*\?\s*\[\]\s*:\s*\(gs\.combat\?\.enemies \?\? \[\]\)/);
  assert.match(startLoopSource, /void playKanjiKombatOpeningTransition\(/);
  assert.match(openingSource, /await playKanjiKombatEnemyTravelReveal\(/);

  const walkStartIndex = revealSource.indexOf('battleScene.formation.walkingEnabled = true');
  const waitIndex = revealSource.indexOf('await wait(ROOM_TRAVEL_DURATION_MS)');
  const walkStopIndex = revealSource.indexOf('battleScene.formation.walkingEnabled = false');
  const showFormationIndex = revealSource.indexOf("await showFormation('enemy'");
  const revealIndex = revealSource.indexOf('await revealScene.syncCreatures');

  assert.ok(walkStartIndex >= 0, 'opening transition should start ally walking before reveal');
  assert.ok(waitIndex > walkStartIndex, 'opening transition should wait through travel while walking');
  assert.ok(walkStopIndex > waitIndex, 'opening transition should stop walking before enemy reveal');
  assert.ok(showFormationIndex > walkStopIndex, 'enemy DOM formation should stay hidden until walking stops');
  assert.ok(revealIndex > showFormationIndex, 'enemy Pixi sprites should enter only after hidden DOM anchors exist');
});

test('Kanji Kombat opening suppresses updateScene enemy rendering until reveal completes', () => {
  const updateSceneSource = sourceBetween(
    gameSrc,
    'function updateScene()',
    'function updateCreatureRow()'
  );
  const startLoopSource = sourceBetween(
    combatLoopSrc,
    'export async function startCombatLoop',
    '/**\n * Execute a single player attack'
  );

  const suppressIndex = updateSceneSource.indexOf('combatLoopUI.isKanjiKombatOpeningRevealActive?.()');
  const hideIndex = updateSceneSource.indexOf("scene.hideFormation('enemy')");
  const showIndex = updateSceneSource.indexOf('scene.showEnemies(enemies');

  assert.ok(suppressIndex >= 0, 'updateScene should ask combat-loop whether the opening reveal is pending');
  assert.ok(hideIndex > suppressIndex, 'updateScene should clear hidden enemy DOM during opening travel');
  assert.ok(showIndex > hideIndex, 'normal enemy rendering should happen only after the opening guard');
  assert.match(startLoopSource, /kanjiKombatOpeningRevealActive = true/);
  assert.match(startLoopSource, /kanjiKombatOpeningRevealActive = false/);
});

test('Kanji Kombat opening lowers the reveal guard before staging enemy DOM anchors', () => {
  const revealSource = sourceBetween(
    combatLoopSrc,
    'async function playKanjiKombatEnemyTravelReveal',
    'async function playKanjiKombatOpeningTransition'
  );

  const lowerGuardIndex = revealSource.indexOf('kanjiKombatOpeningRevealActive = false');
  const showFormationIndex = revealSource.indexOf("await showFormation('enemy'");

  assert.ok(lowerGuardIndex >= 0, 'opening reveal should lower the updateScene hide guard itself');
  assert.ok(
    lowerGuardIndex < showFormationIndex,
    'guard must be lowered before enemy DOM anchors are created so updateScene cannot erase them'
  );
});

test('Kanji Kombat opening keeps centralized parallax sync from cancelling travel', () => {
  const parallaxSource = sourceBetween(
    gameSrc,
    'function syncParallaxScrollWithPhase()',
    'async function syncBattleStageParallax()'
  );

  const guardIndex = parallaxSource.indexOf('combatLoopUI.isKanjiKombatOpeningRevealActive?.()');
  const combatCaseIndex = parallaxSource.indexOf("case 'combat'");

  assert.ok(guardIndex >= 0, 'parallax sync should recognize the opening reveal window');
  assert.ok(combatCaseIndex > guardIndex, 'opening guard should run before combat forces encounter scroll');
});

test('creature select disables its confirm path after resolving', () => {
  const selectSource = sourceBetween(
    gameSrc,
    'function showCollectionSelect',
    'function showCollectionToast'
  );

  assert.match(selectSource, /let confirming = false/);
  assert.match(selectSource, /if \(confirming\) return/);
  assert.match(selectSource, /confirming = true/);
  assert.match(selectSource, /overlay\.classList\.add\('collection-select--pending'\)/);
  assert.match(selectSource, /confirmBtn\.disabled = confirming \|\| selected\.size === 0/);
});
