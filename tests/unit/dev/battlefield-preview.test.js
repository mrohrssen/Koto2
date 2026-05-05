import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  createBattlefieldPreviewState,
  isLocalPreviewHost,
  registerBattlefieldPreview,
} = await import('../../../public/js/dev/battlefield-preview.js');

describe('battlefield preview dev hook', () => {
  it('only registers on local development hosts', () => {
    assert.equal(isLocalPreviewHost('localhost'), true);
    assert.equal(isLocalPreviewHost('127.0.0.1'), true);
    assert.equal(isLocalPreviewHost('jrpg-production.up.railway.app'), false);
  });

  it('builds a deterministic starter meadow 3v3 combat state', () => {
    const state = createBattlefieldPreviewState({ areaId: 'starter_meadow' });

    assert.equal(state.phase, 'combat');
    assert.equal(state.run.active, true);
    assert.equal(state.run.currentArea.id, 'starter_meadow');
    assert.equal(state.run.currentArea.parallaxId, 'starter_meadow');
    assert.equal(state.run.creatureParty.active.length, 3);
    assert.equal(state.combat.allies.length, 3);
    assert.equal(state.combat.enemies.length, 3);
    assert.equal(state.combat.isBoss, false);
    assert.deepEqual(
      state.run.creatureParty.active.map(creature => creature.uid),
      ['preview-ally-hi', 'preview-ally-mizu', 'preview-ally-ki']
    );
    assert.deepEqual(
      state.combat.enemies.map(creature => creature.uid),
      ['preview-enemy-hi', 'preview-enemy-mizu', 'preview-enemy-ki']
    );
  });

  it('registers a callable hook that updates state and renders through callbacks', async () => {
    const calls = [];
    const windowObj = {
      location: {
        hostname: 'localhost',
        search: '',
      },
    };

    registerBattlefieldPreview({
      windowObj,
      updateGameState: (state) => calls.push(['updateGameState', state.phase]),
      renderBattlefieldPreview: async (state) => calls.push(['renderBattlefieldPreview', state.combat.enemies.length]),
    });

    assert.equal(typeof windowObj.__kotoPreview.start3v3Battlefield, 'function');
    const state = await windowObj.__kotoPreview.start3v3Battlefield({ areaId: 'starter_meadow' });

    assert.equal(state.combat.allies.length, 3);
    assert.deepEqual(calls, [
      ['updateGameState', 'combat'],
      ['renderBattlefieldPreview', 3],
    ]);
  });
});
