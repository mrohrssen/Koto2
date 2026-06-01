import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNoopActorAction,
  resolveSyntheticActorAction,
} from '../../../src/game/services/creature-combat-service.js';

function creature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 30,
    maxHp: 30,
    mp: 0,
    maxMp: 0,
    attack: 10,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

describe('Kanji Kombat synthetic combat actions', () => {
  it('resolves a synthetic move even when the creature has no matching move', () => {
    const ally = creature('ally', { element: 'water' });
    const enemy = creature('enemy', { hp: 20, maxHp: 20, element: 'fire' });
    const result = resolveSyntheticActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
      syntheticMove: {
        id: 'kanji-kombat-strike',
        name: 'Kanji Kombat Strike',
        power: 15,
        element: 'water',
        target: 'single_enemy',
        mpCost: 0,
      },
      targetIndex: 0,
    });
    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].attacks.length > 0, true);
    assert.equal(enemy.hp < 20, true);
  });

  it('resolves a no-op segment with no attacks', () => {
    const ally = creature('ally');
    const enemy = creature('enemy');
    const result = resolveNoopActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
    });
    assert.equal(result.actionSegments.length, 1);
    assert.equal(result.actionSegments[0].attacks.length, 0);
    assert.equal(result.actionSegments[0].noop, true);
    assert.equal(enemy.hp, 30);
  });

  it('applies ally mini-round MP regen after a synthetic action', () => {
    const ally = creature('ally', { mp: 0, maxMp: 100 });
    const enemy = creature('enemy', { hp: 20, maxHp: 20 });
    const result = resolveSyntheticActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
      syntheticMove: {
        id: 'kanji-kombat-strike',
        name: 'Kanji Kombat Strike',
        power: 15,
        element: 'fire',
        target: 'single_enemy',
        mpCost: 0,
      },
      targetIndex: 0,
    });

    assert.equal(ally.mp, 5);
    assert.equal(result.actionSegments[0].mpRegens[0].regen, 5);
  });

  it('applies ally mini-round MP regen after a no-op action', () => {
    const ally = creature('ally', { mp: 0, maxMp: 100 });
    const enemy = creature('enemy');
    const result = resolveNoopActorAction({
      actorSide: 'ally',
      actorIndex: 0,
      allies: [ally],
      enemies: [enemy],
    });

    assert.equal(ally.mp, 5);
    assert.equal(result.actionSegments[0].mpRegens[0].regen, 5);
  });
});
