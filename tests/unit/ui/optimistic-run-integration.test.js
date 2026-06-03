import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const explorationSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/exploration.js'), 'utf8');
const economySource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/economy.js'), 'utf8');
const apiSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/api.js'), 'utf8');

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
    assert.match(explorationSource, /apiProceed\(\{ actionId: pending\.actionId \}\)/);
  });

  it('derives the optimistic proceed phase from the shared phase machine', () => {
    assert.match(explorationSource, /import \{ derivePhase \} from ['"]\.\.\/\.\.\/\.\.\/src\/game\/phase-machine\.js['"]/);
    assert.match(explorationSource, /draft\.phase = derivePhase\(draft\)/);
    assert.doesNotMatch(explorationSource, /draft\.phase = nextRoom\.phase \|\| 'room'/);
  });

  it('starts optimistic proceed verification before the room transition', () => {
    const proceedSource = sourceBetween(
      explorationSource,
      'async function proceedToNextRoom()',
      'export function renderExploring()'
    );
    const apiIndex = proceedSource.indexOf('apiProceed({ actionId: pending.actionId })');
    const transitionIndex = proceedSource.indexOf('await playRoomTransition(pending.state');

    assert.ok(apiIndex >= 0, 'optimistic proceed should call apiProceed with the pending action id');
    assert.ok(transitionIndex >= 0, 'optimistic proceed should still run the room transition');
    assert.ok(apiIndex < transitionIndex, 'server verification should start before awaiting the transition');
    assert.match(proceedSource, /clearActionArea\(\)/);
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
    assert.match(apiSource, /verifiedRunAction,\n\s+confirmCreatures/);
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
  });
});
