import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const explorationSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/exploration.js'), 'utf8');
const economySource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/economy.js'), 'utf8');
const apiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/api.js'), 'utf8');
const gameSource = readFileSync(resolve(import.meta.dirname, '../../../public/game.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe('optimistic run action integration', () => {
  it('sends action ids for deterministic exploration choices', () => {
    assert.match(explorationSource, /apiSkillMasterChoose\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /apiChooseShrineReward\?\.\(rewardType, creatureKey, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /apiChooseFriendlyNpcItem\?\.\(item\.id, creatureIndex, \{ actionId: pending\.actionId \}\)/);
    assert.match(explorationSource, /onSkillChosen\?\.\(skillId, \{ actionId: pending\.actionId \}\)/);
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

  it('keeps dealer local changes to pending markers until the server responds', () => {
    assert.match(economySource, /pendingDealerPurchase = creatureId/);
    assert.match(economySource, /pendingDealerSale = creatureId/);
    assert.match(economySource, /apiDealerBuy\(creatureId, \{ actionId: pending\.actionId \}\)/);
    assert.match(economySource, /apiDealerSell\(creatureId, \{ actionId: pending\.actionId \}\)/);
    assert.match(economySource, /if \(pendingDealerActionId\) return/);
    assert.match(economySource, /setDealerControlsDisabled\(true\)/);
  });

  it('exports generic verified run action API and option-aware wrappers', () => {
    assert.match(apiSource, /async function verifiedRunAction\(endpoint, body = \{\}\)/);
    assert.match(apiSource, /returnErrorBody: true/);
    assert.match(apiSource, /bypassLoadingGate: true/);
    assert.match(apiSource, /fromRoom: options\.fromRoom/);
    assert.match(apiSource, /actionSeq: options\.actionSeq/);
    assert.match(apiSource, /verifiedRunAction\('\/npc-battle-skill-choose', \{ skillId, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction\('\/creature-shop-select', \{ itemIndex, targetIndex, actionId: options\.actionId \}\)/);
    assert.match(apiSource, /verifiedRunAction,\n\s+confirmCreatures/);
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

  it('handles corrected NPC battle skill responses as save failures before accepted reconcile', () => {
    const npcBattleStart = explorationSource.indexOf('export async function renderNpcBattleSkillSelection');
    assert.notEqual(npcBattleStart, -1, 'Missing NPC battle skill selection renderer');
    const npcBattleSkillSource = explorationSource.slice(npcBattleStart);

    const correctionIndex = npcBattleSkillSource.indexOf('applyPendingRunCorrection(pending, result)');
    const reconcileIndex = npcBattleSkillSource.indexOf('reconcilePendingRunAction(pending, result)');
    assert.ok(correctionIndex >= 0, 'corrected NPC battle skill responses should be handled explicitly');
    assert.ok(reconcileIndex > correctionIndex, 'accepted reconcile should happen after corrected-response handling');
    assert.match(npcBattleSkillSource, /Skill choice did not save\. Please choose again\./);
    assert.match(npcBattleSkillSource, /if \(reconcilePendingRunAction\(pending, result\)\)/);
  });

  it('handles corrected deterministic choice responses with retry copy', () => {
    const shrineSource = sourceBetween(
      explorationSource,
      'async function chooseShrineReward(rewardType, creatureKey)',
      '/** Quiz phase'
    );
    assert.match(shrineSource, /if \(applyPendingRunCorrection\(pending, result\)\)[\s\S]*Reward choice did not save\. Please choose again\.[\s\S]*renderShrine\(\)/);

    const skillMasterSource = sourceBetween(
      explorationSource,
      'export async function renderSkillMaster()',
      '/** Tutorial step 0'
    );
    assert.match(skillMasterSource, /if \(applyPendingRunCorrection\(pending, result\)\)[\s\S]*Skill choice did not save\. Please choose again\.[\s\S]*renderSkillMaster\(\)/);

    const friendlyNpcSource = sourceBetween(
      explorationSource,
      'export async function renderFriendlyNpc()',
      '// ============ NPC BATTLE SKILL REWARD ============'
    );
    assert.match(friendlyNpcSource, /if \(applyPendingRunCorrection\(pending, result\)\)[\s\S]*Item choice did not save\. Please choose again\.[\s\S]*renderFriendlyNpc\(\)/);
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
    assert.match(tutorialSkillMasterSource, /Skill choice did not save\. Please choose again\./);
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
