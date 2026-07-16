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
  it('removes legacy explore pending layers and save-failure copy', () => {
    assert.doesNotMatch(explorationSource, /pendingRunActionId/);
    assert.doesNotMatch(campfireSource, /pendingCampfireActionId/);
    assert.doesNotMatch(economySource, /pendingDealerActionId/);
    assert.doesNotMatch(explorationSource, /did not save\. Please/);
    assert.doesNotMatch(campfireSource, /did not save\. Please/);
  });

  it('does not ship unvalidated literal Japanese support-room fallbacks', () => {
    assert.doesNotMatch(explorationSource, /text:\s*'こんにちは！'/);
    assert.doesNotMatch(explorationSource, /\$\{item\.word\}、ください/);
    assert.doesNotMatch(explorationSource, /アイテムをもらった！/);
    assert.doesNotMatch(campfireSource, /renderFrameTokens\(campfireState\?\.yesTokens,\s*'はい'\)/);
    assert.doesNotMatch(campfireSource, /renderFrameTokens\(campfireState\?\.noTokens,\s*'いいえ'\)/);
  });

  it('records deterministic support-room exploration choices on the explore session', () => {
    const whackChoiceSource = sourceBetween(
      explorationSource,
      'async function completeWhackAMoleOptimistically(score, session = getExploreSession())',
      '/** Whack-a-Mole mini game'
    );

    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('friendlyNpc\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('shrine\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('skillMaster\.choose'/);
    assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('npcBattleSkill\.choose'/);
    assert.match(whackChoiceSource, /session\?\.recordRoomAction\('whackAMole\.complete'/);
    assert.match(whackChoiceSource, /session\?\.recordRoomAction\('whackAMole\.skip'/);
    assert.match(explorationSource, /async function chooseInitialSkillMasterSkill\(skillId, renderOwner = null\)/);
    assert.match(explorationSource, /if \(isInitialSkillPickState\(\)\)[\s\S]*return chooseInitialSkillMasterSkill\(skillId, renderOwner\)/);
    assert.doesNotMatch(explorationSource, /apiChooseShrineReward\?\.\(rewardType, creatureKey, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /apiChooseFriendlyNpcItem\?\.\(item\.id, creatureIndex, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /onSkillChosen\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /apiProceed\(\{ actionId: pending\.actionId, fromRoom, actionSeq \}\)/);
  });

  it('derives the optimistic proceed phase from the shared phase machine', () => {
    assert.match(explorationSource, /import \{[\s\S]*advanceStateToBufferedNextRoom[\s\S]*getNextRoom[\s\S]*\} from ['"]\.\/room-reveal-buffer\.js['"]/);
    assert.match(explorationSource, /advanceStateToBufferedNextRoom\(draft\)/);
    assert.doesNotMatch(explorationSource, /draft\.phase = nextRoom\.phase \|\| 'room'/);
  });

  it('queues runway proceed through the explore session before falling back to the legacy endpoint', () => {
    const proceedSource = sourceBetween(
      explorationSource,
      'export async function proceedWithRevealBuffer',
      'async function proceedToNextRoom()'
    );
    const sessionIndex = proceedSource.indexOf("recordRoomAction('proceed'");
    const apiIndex = proceedSource.indexOf('const result = await apiProceed();');
    const transitionIndex = proceedSource.indexOf('await playRoomTransition(result.state');

    assert.ok(sessionIndex >= 0, 'runway proceed should queue through the explore session');
    assert.ok(apiIndex >= 0, 'legacy proceed should remain as a compatibility fallback');
    assert.ok(transitionIndex >= 0, 'legacy proceed should still run the room transition');
    assert.ok(sessionIndex < apiIndex, 'session proceed should be attempted before the compatibility endpoint');
    assert.match(proceedSource, /clearActionArea\(\)/);
    assert.match(proceedSource, /showIngredientDropPopups\(ingredientDrops\)/);
    assert.match(proceedSource, /const nextRoom = getNextRoom\(state\)/);
    assert.doesNotMatch(proceedSource, /beginPendingRunAction|rollbackPendingRunAction|reconcilePendingRunAction/);
  });

  it('uses the reveal-buffer proceed helper for completed room flows', () => {
    assert.match(explorationSource, /export async function proceedWithRevealBuffer/);
    assert.match(explorationSource, /renderQuiz[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /discovery\.completed[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /room\?\.interacted[\s\S]*proceedWithRevealBuffer\(\)/);
  });

  it('uses shared spotty-sync copy for rejected explore session actions', () => {
    assert.match(explorationSource, /const EXPLORE_SPOTTY_COPY = 'Connection is spotty\. Your progress will sync when you reconnect\.'/);
    assert.match(explorationSource, /function showExploreSoftPause/);
    assert.match(explorationSource, /onPause: showExploreSoftPause/);
    assert.doesNotMatch(explorationSource, /function isCurrentPendingRunAction|function reconcilePendingRunAction|function rollbackPendingRunAction/);
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
    assert.match(campfireSource, /Connection is spotty\. Your progress will sync when you reconnect\./);
    assert.doesNotMatch(campfireSource, /Failed to (cook|feed|skip)|Could not (cook|feed|skip)/);
  });

  it('records word discovery review and completion choices on the explore session', () => {
    assert.match(apiSource, /reviewVocabWord\(word, grade, isDiscovery = false, options = \{\}\)/);
    assert.match(apiSource, /if \(options\?\.actionId\) body\.actionId = options\.actionId/);
    assert.match(apiSource, /verifiedRunAction\('\/complete-discovery', \{ actionId: options\.actionId \}\)/);
    assert.match(gameSource, /apiSwipeWord: \(word, grade, isDiscovery, options = \{\}\) => reviewVocabWord\(word, grade, isDiscovery, options\)/);
    assert.match(explorationSource, /session\.recordRoomAction\('wordDiscovery\.review'/);
    assert.match(explorationSource, /const grade = detail\.knew \? 'good' : 'again'/);
    assert.match(explorationSource, /roomId: room\.id,\s*word: currentWord\.word,\s*grade,\s*reviewIndex: currentIndex,/);
    assert.match(explorationSource, /apiSwipeWord\?\.\(currentWord\.word, grade, true\)/);
    assert.match(explorationSource, /recordRoomAction\('wordDiscovery\.complete', \{ learnedWords \}\)/);
    assert.doesNotMatch(explorationSource, /apiCompleteDiscovery\(\{ actionId: pending\.actionId \}\)/);
  });

  it('uses soft pause for rejected word discovery completion entries', () => {
    assert.match(explorationSource, /recordRoomAction\('wordDiscovery\.review'/);
    assert.match(explorationSource, /recordRoomAction\('wordDiscovery\.complete', \{ learnedWords \}\)[\s\S]*showExploreSoftPause/);
    assert.doesNotMatch(explorationSource, /Word discovery did not save\. Please try again\./);
  });

  it('records speed review room completion on the explore session', () => {
    assert.match(apiSource, /completeSpeedReviewRoom\(roomId, options = \{\}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/speed-review-room\/complete', \{ roomId, actionId: options\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /SPEED_REVIEW_SAVE_FAILURE_COPY/);

    const speedReviewRoomSource = sourceBetween(
      explorationSource,
      'async function completeSpeedReviewRoomOptimistically',
      '// ============ WHACK-A-MOLE MINI GAME ============'
    );

    assert.match(speedReviewRoomSource, /recordRoomAction\('speedReview\.complete', \{ roomId: room\?\.id \}\)/);
    assert.match(speedReviewRoomSource, /recordRoomAction\('speedReview\.commit', \{\s*roomId: room\.id,\s*word: word\?\.word,\s*grade: grade >= 3 \? 'good' : 'again',\s*commitIndex: absoluteCommitIndex,/);
    assert.match(speedReviewRoomSource, /if \(sessionOwned\)[\s\S]*apiCompleteSpeedReviewRoom\?\.\(room\?\.id\)/);
    assert.match(speedReviewRoomSource, /const startResult = session\s*\? sessionPayload\.payload\s*:\s*await apiStartSpeedReviewRoom\?\.\(room\.id\)/);
    assert.doesNotMatch(speedReviewRoomSource, /speedReviewRoomCommitChain/);
    assert.doesNotMatch(speedReviewRoomSource, /correctPendingRunAction\(pending, completeResult\)/);
    assert.match(speedReviewRoomSource, /const remainingWords = snapshotWords\.slice\(reviewedCards\);\s*if \(remainingWords\.length === 0\)/);
    assert.match(speedReviewRoomSource, /throw new Error\(EXPLORE_SPOTTY_COPY\)/);
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
    const completeSource = sourceBetween(
      explorationSource,
      'async function completeWhackAMoleOptimistically(score, session = getExploreSession())',
      'async function skipWhackAMoleOptimistically(session = getExploreSession())'
    );
    const skipSource = sourceBetween(
      explorationSource,
      'async function skipWhackAMoleOptimistically(session = getExploreSession())',
      '/** Whack-a-Mole mini game'
    );
    const renderSource = sourceBetween(
      explorationSource,
      'export async function renderWhackAMole()',
      '/**\n * Slide the defeated NPC'
    );
    const gameWiringSource = sourceBetween(
      explorationSource,
      'function startWhackAMoleGame(pool, ownerSession = null, renderOwner = null)',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );

    assert.match(completeSource, /session\?\.recordRoomAction\('whackAMole\.complete'/);
    assert.match(skipSource, /session\?\.recordRoomAction\('whackAMole\.skip'/);
    assert.doesNotMatch(explorationSource, /WHACK_A_MOLE_SAVE_FAILURE_COPY/);
    assert.doesNotMatch(explorationSource, /apiCompleteWhackAMole\(score, \{ actionId: pending\.actionId \}\)/);
    assert.doesNotMatch(explorationSource, /apiSkipWhackAMole\(\{ actionId: pending\.actionId \}\)/);
    assert.match(
      completeSource,
      /if \(!queued\?\.accepted\) \{\s*if \(session\?\.isPaused\?\.\(\) !== true\) \{\s*showExploreSoftPause/
    );
    assert.match(
      skipSource,
      /if \(!queued\?\.accepted\) \{\s*if \(session\?\.isPaused\?\.\(\) !== true\) \{\s*showExploreSoftPause/
    );
    assert.doesNotMatch(completeSource, /recordRoomAction\('proceed'/);
    assert.doesNotMatch(skipSource, /recordRoomAction\('proceed'/);
    assert.match(gameWiringSource, /const ownsActiveGame =[\s\S]*requireSupportRoomRenderOwner\(renderOwner\)/);
    assert.match(gameWiringSource, /const ownsCompletion =[\s\S]*requireSupportRoomRenderOwner\(renderOwner, completionOwnerOptions\)/);
    assert.match(gameWiringSource, /apiCompleteWhackAMole: async score => \{[\s\S]*if \(!ownsActiveGame\(\)\) return null;[\s\S]*completeWhackAMoleOptimistically\(score, ownerSession\)[\s\S]*return ownsCompletion\(\) \? result : null/);
    assert.match(gameWiringSource, /apiProceed: \(\.\.\.args\) => \{[\s\S]*if \(!ownsCompletion\(\)\) return null;[\s\S]*proceedWithRevealBuffer\(\.\.\.args\)[\s\S]*proceedWhackAMoleLegacy\(renderOwner\)/);
    assert.match(gameWiringSource, /isCompletionOwner: ownsCompletion/);
    assert.match(renderSource, /const result = await skipWhackAMoleOptimistically\(activeStandardSession\);[\s\S]*?if \(result && requireSupportRoomRenderOwner\(renderOwner,[\s\S]*?await proceedWithRevealBuffer\(\)/);
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

  it('preserves sparse active slots through post-combat item targeting', () => {
    const shopFlowSource = sourceBetween(
      gameSource,
      'async function showPostCombatShopFlow()',
      '// ============ CREATURE EQUIP UI ============'
    );

    assert.match(shopFlowSource, /const active = gameState\.run\?\.creatureParty\?\.active \|\| \[\]/);
    assert.doesNotMatch(shopFlowSource, /active\?\.filter\(Boolean\)/);
    assert.match(shopFlowSource, /const targets = getItemTargetEntries\(active\)/);
    assert.match(shopFlowSource, /await finalize\(targets\[0\]\?\.targetIndex \?\? 0\)/);
    assert.match(shopFlowSource, /postCombatShop\.showTargetPicker\(active, finalize\)/);
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

  it('lets an owner-checked playback recovery bypass an already-consumed reload gate', () => {
    const updateGameContentSource = sourceBetween(
      gameSource,
      'function updateGameContent()',
      '// ============ AUTO-PROCEED ============'
    );
    const combatCaseSource = sourceBetween(
      updateGameContentSource,
      "case 'combat':",
      "case 'npc_dialogue':"
    );

    assert.match(
      combatCaseSource,
      /getExploreCombatPlaybackRecoveryState\?\.\(\) \|\| 'none'/,
      'combat resume must distinguish a held permit from no recovery request',
    );
    assert.match(
      combatCaseSource,
      /consumeExploreCombatPlaybackRecovery\?\.\(\) === true/,
      'combat resume must consume the owner-checked one-shot permit',
    );
    assert.match(
      combatCaseSource,
      /combatRecoveryGate\.shouldRecover\(gameState, \{[\s\S]*?combatActive: combatIsActive,[\s\S]*?playbackRecovery,[\s\S]*?playbackRecoveryHeld/,
      'pending playback recovery must block ordinary restart while ready recovery bypasses the reload gate',
    );
    assert.match(
      combatCaseSource,
      /combatRecoveryGate\.markDone\(gameState\)/,
      'the recovered combat owner must consume only its own one-shot gate',
    );
  });

  it('handles rejected NPC battle skill session actions with soft pause copy', () => {
    const npcBattleStart = explorationSource.indexOf('export async function renderNpcBattleSkillSelection');
    assert.notEqual(npcBattleStart, -1, 'Missing NPC battle skill selection renderer');
    const npcBattleSkillSource = explorationSource.slice(npcBattleStart);

    assert.match(npcBattleSkillSource, /getExploreSession\(\)\?\.recordRoomAction\('npcBattleSkill\.choose'/);
    assert.match(npcBattleSkillSource, /if \(!queued\?\.accepted\)/);
    assert.match(npcBattleSkillSource, /showExploreSoftPause\(\{ reason: queued\?\.reason \|\| 'missingPayload' \}\)/);
    assert.doesNotMatch(npcBattleSkillSource, /onSkillChosen\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
  });

  it('handles rejected deterministic session choices with soft pause copy', () => {
    const shrineSource = sourceBetween(
      explorationSource,
      'async function chooseShrineReward(rewardType, creatureKey, renderOwner)',
      '/** Quiz phase'
    );
    assert.match(shrineSource, /if \(!queued\?\.accepted\)[\s\S]*showExploreSoftPause\(\{ reason: queued\?\.reason \|\| 'missingPayload' \}\)[\s\S]*renderShrine\(\)/);

    const skillMasterSource = sourceBetween(
      explorationSource,
      'export async function renderSkillMaster()',
      '/** Tutorial step 0'
    );
    assert.match(skillMasterSource, /if \(!queued\?\.accepted\)[\s\S]*showExploreSoftPause\(\{ reason: queued\?\.reason \|\| 'missingPayload' \}\)[\s\S]*renderSkillMaster\(\)/);

    const friendlyNpcSource = sourceBetween(
      explorationSource,
      'export async function renderFriendlyNpc()',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );
    assert.match(friendlyNpcSource, /if \(!queued\?\.accepted\)[\s\S]*showExploreSoftPause\(\{ reason: queued\?\.reason \|\| 'missingPayload' \}\)[\s\S]*renderFriendlyNpc\(\)/);
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

  it('uses the shared spotty-sync copy for deterministic choice failures', () => {
    const shrineSource = sourceBetween(
      explorationSource,
      'async function chooseShrineReward(rewardType, creatureKey, renderOwner)',
      '/** Quiz phase'
    );
    assert.match(shrineSource, /showExploreSoftPause/);
    assert.doesNotMatch(shrineSource, /Could not apply shrine blessing|Failed to choose shrine blessing/);

    const skillMasterSource = sourceBetween(
      explorationSource,
      'export async function renderSkillMaster()',
      '/** Tutorial step 0'
    );
    assert.match(skillMasterSource, /showExploreSoftPause/);
    assert.doesNotMatch(skillMasterSource, /Could not apply skill choice|Failed to choose skill/);

    const tutorialSkillMasterSource = sourceBetween(
      explorationSource,
      'function renderTutorialSkillMaster(offers, renderOwner)',
      '// ============ FRIENDLY NPC ROOM ============'
    );
    assert.match(tutorialSkillMasterSource, /chooseSkillMasterSkill\(s\.id, renderOwner\)/);
    assert.doesNotMatch(tutorialSkillMasterSource, /Could not apply skill choice|Failed to choose skill/);

    const friendlyNpcSource = sourceBetween(
      explorationSource,
      'export async function renderFriendlyNpc()',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );
    assert.match(friendlyNpcSource, /showExploreSoftPause/);
    assert.doesNotMatch(friendlyNpcSource, /Could not apply item|Failed to choose item/);

    const npcBattleStart = explorationSource.indexOf('export async function renderNpcBattleSkillSelection');
    assert.notEqual(npcBattleStart, -1, 'Missing NPC battle skill selection renderer');
    const npcBattleSkillSource = explorationSource.slice(npcBattleStart);
    assert.match(npcBattleSkillSource, /showExploreSoftPause/);
    assert.doesNotMatch(npcBattleSkillSource, /Choosing skill|Failed to choose skill/);
  });
});
