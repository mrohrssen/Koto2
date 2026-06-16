import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const explorationSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/exploration.js'), 'utf8');
const campfireSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/campfire.js'), 'utf8');
const economySource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/economy.js'), 'utf8');
const apiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/api.js'), 'utf8');
const gameSource = readFileSync(resolve(import.meta.dirname, '../../../public/game.js'), 'utf8');
const combatLoopSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/combat-loop.js'), 'utf8');
const kanjiInitSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe('optimistic run action integration', () => {
  it('records deterministic support-room exploration choices on the explore session', () => {
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('friendlyNpc\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('shrine\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('skillMaster\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('npcBattleSkill\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('whackAMole\.complete'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('whackAMole\.skip'/);
    assert.match(explorationSource, /async function chooseInitialSkillMasterSkill\(skillId\)/);
    assert.match(explorationSource, /if \(isInitialSkillPickState\(\)\)[\s\S]*return chooseInitialSkillMasterSkill\(skillId\)/);
    assert.doesNotMatch(explorationSource, /apiChooseShrineReward\?\.\(rewardType, creatureKey, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /apiChooseFriendlyNpcItem\?\.\(item\.id, creatureIndex, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /onSkillChosen\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /apiProceed\(\{ actionId: pending\.actionId, fromRoom, actionSeq \}\)/);
  });

  it('derives the optimistic proceed phase from the shared phase machine', () => {
    assert.match(explorationSource, /import \{[\s\S]*advanceStateToBufferedNextRoom[\s\S]*getNextRoom[\s\S]*\} from ['"]\.\/room-reveal-buffer\.js['"]/);
    assert.match(explorationSource, /advanceStateToBufferedNextRoom\(draft\)/);
    assert.doesNotMatch(explorationSource, /draft\.phase = nextRoom\.phase \|\| 'room'/);
  });

  it('starts optimistic proceed verification before the room transition', () => {
    const proceedSource = sourceBetween(
      explorationSource,
      'export async function proceedWithRevealBuffer',
      'async function proceedToNextRoom()'
    );
    const apiIndex = proceedSource.indexOf('apiProceed({ actionId: pending.actionId, fromRoom, actionSeq })');
    const transitionIndex = proceedSource.indexOf('await playRoomTransition(pending.state');

    assert.ok(apiIndex >= 0, 'optimistic proceed should call apiProceed with the pending action id and sequence envelope');
    assert.ok(transitionIndex >= 0, 'optimistic proceed should still run the room transition');
    assert.ok(apiIndex < transitionIndex, 'server verification should start before awaiting the transition');
    assert.match(proceedSource, /clearActionArea\(\)/);
    assert.match(proceedSource, /showIngredientDropPopups\(ingredientDrops\)/);
    assert.match(proceedSource, /const nextRoom = getNextRoom\(state\)/);
  });

  it('uses the reveal-buffer proceed helper for completed room flows', () => {
    assert.match(explorationSource, /export async function proceedWithRevealBuffer/);
    assert.match(explorationSource, /renderQuiz[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /discovery\.completed[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /room\?\.interacted[\s\S]*proceedWithRevealBuffer\(\)/);
  });

  it('ignores stale optimistic run responses after a pending action has been cleared or replaced', () => {
    assert.match(explorationSource, /function isCurrentPendingRunAction\(pending\)/);

    const reconcileSource = sourceBetween(
      explorationSource,
      'function reconcilePendingRunAction',
      'function applyPendingRunCorrection'
    );
    const correctionSource = sourceBetween(
      explorationSource,
      'function applyPendingRunCorrection',
      'function isInitialSkillPickChoiceResult'
    );
    const initialSkillSource = sourceBetween(
      explorationSource,
      'async function reconcileInitialSkillPickRoomEntry',
      'function rollbackPendingRunAction'
    );
    const rollbackSource = sourceBetween(
      explorationSource,
      'function rollbackPendingRunAction',
      'const WORD_DISCOVERY_SAVE_FAILURE_COPY'
    );
    const wordDiscoveryCorrectionSource = sourceBetween(
      explorationSource,
      'function applyWordDiscoveryCorrection',
      'async function completeWordDiscoveryOptimistically'
    );

    assert.match(reconcileSource, /!isCurrentPendingRunAction\(pending\)/);
    assert.match(correctionSource, /!isCurrentPendingRunAction\(pending\)/);
    assert.match(initialSkillSource, /!isCurrentPendingRunAction\(pending\)/);
    assert.match(rollbackSource, /!isCurrentPendingRunAction\(pending\)/);
    assert.match(wordDiscoveryCorrectionSource, /!isCurrentPendingRunAction\(pending\)/);
  });

  it('records dealer choices on the explore session', () => {
    assert.match(economySource, /recordRoomAction\('dealer\.sell'/);
    assert.match(economySource, /recordRoomAction\('dealer\.buy'/);
    assert.match(economySource, /recordRoomAction\('dealer\.leave'/);
    assert.doesNotMatch(economySource, /pendingDealerActionId/);
    assert.doesNotMatch(economySource, /apiDealerBuy\(creatureId, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(economySource, /apiDealerSell\(creatureId, \{ actionId: pending\.actionId \}\)/);
  });

  it('exports generic verified run action API and option-aware wrappers', () => {
    assert.match(apiSource, /async function verifiedRunAction\(endpoint, body = \{\}\)/);
    assert.match(apiSource, /returnErrorBody: true/);
    assert.match(apiSource, /bypassLoadingGate: true/);
    assert.match(apiSource, /fromRoom: options\.fromRoom/);
    assert.match(apiSource, /actionSeq: options\.actionSeq/);
    assert.match(apiSource, /verifiedRunAction\('\/campfire\/cook', \{ ingredients, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/campfire\/feed', \{ targetCreatureIndex, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/campfire\/skip', \{ actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/npc-battle-skill-choose', \{ skillId, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/creature-shop-select', \{ itemIndex, targetIndex, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction,\n\s+confirmCreatures/);
  });

  it('records campfire cook, feed, and skip choices on the explore session', () => {
    assert.match(campfireSource, /recordRoomAction\('campfire\.cook'/);
    assert.match(campfireSource, /recordRoomAction\('campfire\.feed'/);
    assert.match(campfireSource, /recordRoomAction\('campfire\.skip'/);
    assert.doesNotMatch(campfireSource, /pendingCampfireActionId/);
    assert.doesNotMatch(campfireSource, /apiCookAtCampfire\(ingredients, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(campfireSource, /apiFeedCampfireDish\(targetIndex, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(campfireSource, /apiSkipCampfire\(\{ actionId: pending\.actionId \}\)/);
  });

  it('uses rejected campfire session actions as retryable failures', () => {
    assert.match(campfireSource, /if \(!result\?\.accepted\) \{/);
    assert.match(campfireSource, /Campfire choice did not save\. Please try again\./);
    assert.doesNotMatch(campfireSource, /Failed to (cook|feed|skip)|Could not (cook|feed|skip)/);
  });

  it('sends action ids for word discovery review and completion choices', () => {
    assert.match(apiSource, /reviewVocabWord\(word, grade, isDiscovery = false, options = \{\}\)/);
    assert.match(apiSource, /if \(options\?\.actionId\) body\.actionId = options\.actionId/);
    assert.match(apiSource, /verifiedRunAction\('\/complete-discovery', \{ actionId: options\.actionId \}\)/);
    assert.match(gameSource, /apiSwipeWord: \(word, grade, isDiscovery, options = \{\}\) => reviewVocabWord\(word, grade, isDiscovery, options\)/);
    assert.match(explorationSource, /apiSwipeWord\(currentWord\.word, 'again', true, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /apiCompleteDiscovery\(\{ actionId: pending\.actionId \}\)/);
  });

  it('uses corrected word discovery responses as authoritative retryable failures', () => {
    assert.match(explorationSource, /actionType: 'wordDiscovery\.review'/);
    assert.match(explorationSource, /actionType: 'wordDiscovery\.complete'/);
    assert.match(explorationSource, /result\?\.status === 'corrected'/);
    assert.match(explorationSource, /correctPendingRunAction\(pending, result\)/);
    assert.match(explorationSource, /Word discovery did not save\. Please try again\./);
  });

  it('sends action ids for speed review room completion after commit settling', () => {
    assert.match(apiSource, /completeSpeedReviewRoom\(roomId, options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/speed-review-room\/complete', \{ roomId, actionId: options\.actionId \}\)/);
    assert.match(explorationSource, /const SPEED_REVIEW_SAVE_FAILURE_COPY = 'Speed review did not save\. Please try again\.'/);

    const speedReviewRoomSource = sourceBetween(
      explorationSource,
      'async function completeSpeedReviewRoomOptimistically',
      '// ============ WHACK-A-MOLE MINI GAME ============'
    );

    assert.match(speedReviewRoomSource, /actionType: 'speedReview\.complete'/);
    assert.match(speedReviewRoomSource, /apiCompleteSpeedReviewRoom\(room\.id, \{ actionId: pending\.actionId \}\)/);
    assert.match(speedReviewRoomSource, /correctPendingRunAction\(pending, completeResult\)/);
    assert.match(speedReviewRoomSource, /if \(snapshotWords\.length === 0\) \{\s*await completeSpeedReviewRoomOptimistically\(room\);/);
    assert.match(speedReviewRoomSource, /throw new Error\(SPEED_REVIEW_SAVE_FAILURE_COPY\)/);
  });

  it('sends action ids for Kanji Kombat intro and completion choices without changing answer prediction', () => {
    // kanji-kombat.js now routes intro/completion through the session log
    assert.match(kanjiInitSource, /kind: 'intro'/);
    assert.match(kanjiInitSource, /kind: 'completionChoice'/);
    assert.match(kanjiInitSource, /actionId: createActionId\('kk'\)/);
    assert.match(kanjiInitSource, /session\.recordAction\(\{/);
    assert.match(kanjiInitSource, /configureKanjiKombatSession/);
    assert.doesNotMatch(kanjiInitSource, /correctAnswerId[\s\S]{0,400}submitIntro/);
  });

  it('Kanji Kombat prompt choices use session sync copy instead of save-failure rollback copy', () => {
    assert.match(kanjiInitSource, /configureKanjiKombatSession/);
    assert.match(kanjiInitSource, /Connection is spotty\. Your reviews will sync when you reconnect\./);
    assert.doesNotMatch(kanjiInitSource, /Kanji Kombat choice did not save\. Please try again\./);
  });


  it('registers Kanji Kombat session sync drain triggers on reconnect and visibility return', () => {
    // The 'online' event handler calls syncNow() to flush pending log entries when
    // connectivity is restored.  The exact callback shape may be a block or arrow.
    assert.match(kanjiInitSource, /addEventListener\('online'/);
    assert.match(kanjiInitSource, /getKanjiKombatSession\(\)\?\.syncNow\(\)/);
    assert.match(kanjiInitSource, /addEventListener\('visibilitychange', \(\) => \{\s*if \(document\.visibilityState !== 'hidden'\) getKanjiKombatSession\(\)\?\.syncNow\(\);\s*\}\)/);
  });

  it('wires Kanji Kombat prompt buffer API calls', () => {
    const apiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/api.js'), 'utf8');
    const kanjiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/kanji-kombat.js'), 'utf8');
    const promptOptionsSource = sourceBetween(
      apiSource,
      'function applyKanjiKombatPromptOptions',
      'async function submitKanjiKombatIntro'
    );
    const introSource = sourceBetween(
      apiSource,
      'async function submitKanjiKombatIntro',
      'async function submitKanjiKombatAnswer'
    );
    const completionSource = sourceBetween(
      apiSource,
      'async function submitKanjiKombatCompletionChoice',
      'async function refillKanjiKombatPromptBuffer'
    );

    assert.match(apiSource, /refillKanjiKombatPromptBuffer/);
    assert.match(apiSource, /\/kanji-kombat\/prompt-buffer\/refill/);
    assert.match(promptOptionsSource, /promptId/);
    assert.match(promptOptionsSource, /promptSequence/);
    assert.match(introSource, /applyKanjiKombatPromptOptions\(body, options\)/);
    assert.match(completionSource, /applyKanjiKombatPromptOptions\(body, options\)/);
    assert.match(kanjiSource, /refillPromptBuffer/);
  });

  it('passes Kanji Kombat quiz prompt refs through the production answer adapter', () => {
    const kanjiInitSource = sourceBetween(
      gameSource,
      'kanjiKombatUI.initKanjiKombatUI({',
      'explorationUI.init({'
    );

    assert.match(kanjiInitSource, /submitAnswer: \(answerId, promptRef\) => combatLoopUI\.submitKanjiKombatAnswer\(answerId, promptRef\)/);
    assert.match(combatLoopSource, /export async function submitKanjiKombatAnswer\(answerId, promptRef = \{\}\)/);
    assert.match(combatLoopSource, /function buildOptimisticKanjiKombatRequest\(answerId, promptRef = \{\}\)/);
    assert.match(combatLoopSource, /stateWithBufferedKanjiKombatQuiz\(getGameState\(\), promptRef\)/);
    assert.match(combatLoopSource, /currentQuiz: bufferedPrompt\.quiz/);
    assert.match(combatLoopSource, /kanjiPromptRef: promptRef/);
    assert.match(combatLoopSource, /promptId: promptRef\?\.promptId/);
    assert.match(combatLoopSource, /request: \(\) => apiSubmitKanjiKombatAnswer\(withKanjiKombatPromptRef\(answerId, promptRef\)\)/);
  });

  it('keeps legacy Whack-a-Mole API wrappers available as fallback surfaces', () => {
    assert.match(apiSource, /async function completeWhackAMole\(score, options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/whack-a-mole-complete', \{ score, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /async function skipWhackAMole\(options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/whack-a-mole-skip', \{ actionId: options\.actionId \}\)/);
  });

  it('records Whack-a-Mole choices through the explore session', () => {
    assert.match(explorationSource, /const WHACK_A_MOLE_SAVE_FAILURE_COPY = 'Game Master choice did not save\. Please try again\.'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('whackAMole\.complete'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('whackAMole\.skip'/);
    assert.doesNotMatch(explorationSource, /apiCompleteWhackAMole\(score, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /apiSkipWhackAMole\(\{ actionId: pending\.actionId \}\)/);
    assert.match(
      explorationSource,
      /async function completeWhackAMoleOptimistically\(score\) \{[\s\S]*?if \(!queued\?\.accepted\) \{\s*showWhackAMoleSaveFailure\(\);\s*return null;\s*\}/
    );
    assert.match(
      explorationSource,
      /async function skipWhackAMoleOptimistically\(\) \{[\s\S]*?if \(!queued\?\.accepted\) \{\s*showWhackAMoleSaveFailure\(\);\s*return null;\s*\}/
    );
  });

  it('sends action ids for post-combat shop choices', () => {
    const shopFlowSource = sourceBetween(
      gameSource,
      'async function showPostCombatShopFlow()',
      '// ============ CREATURE EQUIP UI ============'
    );

    assert.match(shopFlowSource, /apiSelectShopItem\(itemIdx, targetIdx, \{ actionId: pending\.actionId \}\)/);
    assert.match(shopFlowSource, /createPendingRunAction\(\{\s*state: gameState,\s*actionType: 'postCombatShop\.select'/);
    assert.match(shopFlowSource, /draft\.run\.pendingPostCombatShopSelection = \{ itemIndex: itemIdx, targetIndex: targetIdx \}/);
    assert.match(shopFlowSource, /postCombatShop\.hide\(\)[\s\S]*await verification/);
  });

  it('uses corrected post-combat shop responses as authoritative corrections', () => {
    const shopFlowSource = sourceBetween(
      gameSource,
      'async function showPostCombatShopFlow()',
      '// ============ CREATURE EQUIP UI ============'
    );

    assert.match(shopFlowSource, /result\.status === 'corrected'/);
    assert.match(shopFlowSource, /const correctedState = correctPendingRunAction\(pending, result\);\s*updateGameState\(correctedState\)/);
    assert.doesNotMatch(shopFlowSource, /result\.status !== 'corrected'[\s\S]{0,120}confirmPendingRunAction/);
    assert.match(shopFlowSource, /updateGameState\(confirmPendingRunAction\(pending, result\)\)/);
  });

  it('guards post-combat shop retry UI against stale offers', () => {
    const shopFlowSource = sourceBetween(
      gameSource,
      'function canRetryPostCombatShop(state)',
      '// ============ CREATURE EQUIP UI ============'
    );

    assert.match(shopFlowSource, /function canRetryPostCombatShop\(state\)/);
    assert.match(shopFlowSource, /state\?\.phase === 'post_combat_shop'/);
    assert.match(shopFlowSource, /state\?\.run\?\.postCombatShop\?\.active === true/);
    assert.match(shopFlowSource, /if \(canRetryPostCombatShop\(pending\.originalState\)\) \{\s*postCombatShop\.show\(shopResult\.items\);\s*return;\s*\}\s*resolve\(\);/);
  });

  it('stores corrected post-combat shop state before deciding retryability', () => {
    const shopFlowSource = sourceBetween(
      gameSource,
      'async function showPostCombatShopFlow()',
      '// ============ CREATURE EQUIP UI ============'
    );

    assert.match(shopFlowSource, /const correctedState = correctPendingRunAction\(pending, result\);\s*updateGameState\(correctedState\);\s*scene\.showToast\('Item choice did not save\. Please choose again\.', 2500\);\s*if \(canRetryPostCombatShop\(correctedState\)\) \{\s*postCombatShop\.show\(shopResult\.items\);\s*return;\s*\}\s*resolve\(\);/);
  });

  it('lets corrected NPC battle skill responses reach the optimistic reconciler', () => {
    const npcSkillCallbackSource = sourceBetween(
      gameSource,
      "case 'npc_skill_selection':",
      "case 'combat':"
    );

    assert.match(npcSkillCallbackSource, /result\?\.status === 'corrected'/);
    assert.match(npcSkillCallbackSource, /updateGameState\(result\.authoritativeState\)/);
    assert.match(npcSkillCallbackSource, /return result/);
  });

  it('handles rejected NPC battle skill session actions as save failures', () => {
    const npcBattleStart = explorationSource.indexOf('export async function renderNpcBattleSkillSelection');
    assert.notEqual(npcBattleStart, -1, 'Missing NPC battle skill selection renderer');
    const npcBattleSkillSource = explorationSource.slice(npcBattleStart);

    assert.match(npcBattleSkillSource, /getExploreSession\(\)\?\.recordRoomAction\('npcBattleSkill\.choose'/);
    assert.match(npcBattleSkillSource, /if \(!queued\?\.accepted\)/);
    assert.match(npcBattleSkillSource, /Skill choice did not save\. Please choose again\./);
    assert.doesNotMatch(npcBattleSkillSource, /onSkillChosen\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
  });

  it('handles rejected deterministic session choices with retry copy', () => {
    const shrineSource = sourceBetween(
      explorationSource,
      'async function chooseShrineReward(rewardType, creatureKey)',
      '/** Quiz phase'
    );
    assert.match(shrineSource, /if \(!queued\?\.accepted\)[\s\S]*Reward choice did not save\. Please choose again\.[\s\S]*renderShrine\(\)/);

    const skillMasterSource = sourceBetween(
      explorationSource,
      'export async function renderSkillMaster()',
      '/** Tutorial step 0'
    );
    assert.match(skillMasterSource, /if \(!queued\?\.accepted\)[\s\S]*Skill choice did not save\. Please choose again\.[\s\S]*renderSkillMaster\(\)/);

    const friendlyNpcSource = sourceBetween(
      explorationSource,
      'export async function renderFriendlyNpc()',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );
    assert.match(friendlyNpcSource, /if \(!queued\?\.accepted\)[\s\S]*Item choice did not save\. Please choose again\.[\s\S]*renderFriendlyNpc\(\)/);
  });

  it('keeps PvP team save feedback confirmed by the server', () => {
    const pvpTeamSaveSource = sourceBetween(
      explorationSource,
      'async function showPvpTeamSaveSlots()',
      '/** Run ended'
    );
    const saveIndex = pvpTeamSaveSource.indexOf('await savePvpTeam(i)');
    const savedIndex = pvpTeamSaveSource.indexOf('Team saved!');

    assert.match(pvpTeamSaveSource, /Saving team\.\.\./);
    assert.match(pvpTeamSaveSource, /Team saved!/);
    assert.match(pvpTeamSaveSource, /Team was not saved\. Your draft is still here\./);
    assert.match(pvpTeamSaveSource, /saveResult === null \|\| saveResult\?\.ok === false/);
    assert.match(pvpTeamSaveSource, /renderButtons\(\[\s*\{ label: 'Try Again'[\s\S]*\], \{ append: true \}\)/);
    assert.ok(saveIndex >= 0, 'PvP team save should await savePvpTeam');
    assert.ok(savedIndex > saveIndex, 'success copy should appear only after awaiting savePvpTeam');
    assert.doesNotMatch(pvpTeamSaveSource, /beginPendingRunAction|createPendingRunAction|confirmPendingRunAction/);
  });

  it('uses non-blaming retry copy for deterministic choice failures', () => {
    const shrineSource = sourceBetween(
      explorationSource,
      'async function chooseShrineReward(rewardType, creatureKey)',
      '/** Quiz phase'
    );
    assert.match(shrineSource, /Reward choice did not save\. Please choose again\./);
    assert.doesNotMatch(shrineSource, /Could not apply shrine blessing|Failed to choose shrine blessing/);

    const skillMasterSource = sourceBetween(
      explorationSource,
      'export async function renderSkillMaster()',
      '/** Tutorial step 0'
    );
    assert.match(skillMasterSource, /Skill choice did not save\. Please choose again\./);
    assert.doesNotMatch(skillMasterSource, /Could not apply skill choice|Failed to choose skill/);

    const tutorialSkillMasterSource = sourceBetween(
      explorationSource,
      'function renderTutorialSkillMaster(offers)',
      '// ============ FRIENDLY NPC ROOM ============'
    );
    assert.match(tutorialSkillMasterSource, /chooseSkillMasterSkill\(s\.id\)/);
    assert.doesNotMatch(tutorialSkillMasterSource, /Could not apply skill choice|Failed to choose skill/);

    const friendlyNpcSource = sourceBetween(
      explorationSource,
      'export async function renderFriendlyNpc()',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );
    assert.match(friendlyNpcSource, /Item choice did not save\. Please choose again\./);
    assert.doesNotMatch(friendlyNpcSource, /Could not apply item|Failed to choose item/);

    const npcBattleStart = explorationSource.indexOf('export async function renderNpcBattleSkillSelection');
    assert.notEqual(npcBattleStart, -1, 'Missing NPC battle skill selection renderer');
    const npcBattleSkillSource = explorationSource.slice(npcBattleStart);
    assert.match(npcBattleSkillSource, /Skill choice did not save\. Please choose again\./);
    assert.doesNotMatch(npcBattleSkillSource, /Choosing skill|Failed to choose skill/);
  });
});
