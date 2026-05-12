import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as combatUiUtils from '../../../public/js/ui/combat-ui-utils.js';

describe('post-combat scene transition guards', () => {
  it('keeps the battle scene mounted while an NPC battle reward skill is pending', () => {
    assert.equal(
      combatUiUtils.shouldKeepNpcBattleSceneForReward?.({ phase: 'npc_skill_selection' }),
      true
    );
  });

  it('allows normal post-combat cleanup for non-reward phases', () => {
    assert.equal(
      combatUiUtils.shouldKeepNpcBattleSceneForReward?.({ phase: 'room' }),
      false
    );
  });

  it('freezes post-combat travel while an NPC battle reward is about to open', () => {
    assert.equal(
      combatUiUtils.shouldFreezePostCombatTravelForNpcReward?.(
        { combat: { isCreatureCombat: true, npcId: 'kodomo' } },
        { victory: true }
      ),
      true
    );
  });

  it('allows post-combat travel for normal creature victories', () => {
    assert.equal(
      combatUiUtils.shouldFreezePostCombatTravelForNpcReward?.(
        { combat: { isCreatureCombat: true, npcId: null } },
        { victory: true }
      ),
      false
    );
  });
});
