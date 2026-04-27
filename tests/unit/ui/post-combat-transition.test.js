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
});
