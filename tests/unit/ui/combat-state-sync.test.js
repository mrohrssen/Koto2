import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAuthoritativeCombatState } from '../../../public/js/ui/combat-state-sync.js';
import { formatDiagnosticArg } from '../../../public/js/diagnostics.js';

describe('mergeAuthoritativeCombatState', () => {
  it('uses server state cursor immediately while preserving existing client-only fields', () => {
    const current = {
      phase: 'combat',
      _npcDialogue: { defeatLine: 'later' },
      run: { creatureParty: { active: [{ id: 'old' }] } },
      combat: {
        enemies: [{ id: 'enemy', hp: 10 }],
        allies: [{ id: 'a' }, { id: 'b' }],
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 0
      }
    };
    const result = {
      enemies: [{ id: 'enemy', hp: 8 }],
      state: {
        phase: 'combat',
        run: { creatureParty: { active: [{ id: 'a' }, { id: 'b' }] } },
        combat: {
          enemies: [{ id: 'enemy', hp: 8 }],
          allies: [{ id: 'a' }, { id: 'b' }],
          actionCursor: { side: 'ally', index: 1, opening: false },
          actionCount: 2
        }
      }
    };

    const merged = mergeAuthoritativeCombatState(current, result);

    assert.deepEqual(merged.combat.actionCursor, { side: 'ally', index: 1, opening: false });
    assert.equal(merged.combat.actionCount, 2);
    assert.deepEqual(merged._npcDialogue, { defeatLine: 'later' });
    assert.deepEqual(merged.run.creatureParty.active.map(c => c.id), ['a', 'b']);
  });

  it('falls back to response combat fields when no full server state is present', () => {
    const current = {
      phase: 'combat',
      run: { creatureParty: { active: [{ id: 'a' }] } },
      combat: {
        enemies: [{ id: 'enemy', hp: 10 }],
        allies: [{ id: 'a' }],
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 0
      }
    };
    const result = {
      enemies: [{ id: 'enemy', hp: 4 }],
      allies: [{ id: 'a', hp: 30 }]
    };

    const merged = mergeAuthoritativeCombatState(current, result);

    assert.equal(merged.combat.enemies[0].hp, 4);
    assert.equal(merged.combat.allies[0].hp, 30);
    assert.deepEqual(merged.combat.actionCursor, { side: 'ally', index: 0, opening: false });
  });

  it('syncs authoritative allies from reward responses even when enemy state is unchanged', () => {
    const current = {
      phase: 'combat',
      run: { creatureParty: { active: [{ id: 'hi', hp: 10, maxHp: 20 }], reserves: [] } },
      combat: {
        enemies: [{ id: 'mizu', hp: 10 }],
        allies: [{ id: 'hi', hp: 10, maxHp: 20 }],
        actionCursor: { side: 'ally', index: 0, opening: false },
        actionCount: 2
      }
    };
    const healedAlly = { id: 'hi', hp: 14, maxHp: 20 };
    const result = {
      kanjiStreakReward: { type: 'teamHeal', streak: 3, healPercent: 0.20 },
      allies: [healedAlly],
      creatureParty: { active: [healedAlly], reserves: [] }
    };

    const merged = mergeAuthoritativeCombatState(current, result);

    assert.equal(merged.run.creatureParty.active[0].hp, 14);
    assert.equal(merged.combat.allies[0].hp, 14);
    assert.deepEqual(merged.combat.enemies, [{ id: 'mizu', hp: 10 }]);
    assert.deepEqual(merged.combat.actionCursor, { side: 'ally', index: 0, opening: false });
  });
});

describe('formatDiagnosticArg', () => {
  it('records Error messages instead of JSON stringifying them as empty objects', () => {
    const err = new Error('animation failed before state sync');

    assert.equal(formatDiagnosticArg(err), 'Error: animation failed before state sync');
  });
});
