import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BUFF_TYPES,
  addBuff,
  consumeBuffsByType,
  clearAllBuffs,
  hasDefensiveBuff,
  executeInstantSkill,
  activateBuffSkill,
  useChipSkill
} from '../../src/game/combat/chip-skills.js';
import { CHIPS } from '../../src/game/items/chips.js';

describe('Buff Management', () => {
  function makePlayer() {
    return { _activeBuffs: [] };
  }

  it('BUFF_TYPES has all four types', () => {
    assert.strictEqual(BUFF_TYPES.PRE_PIPELINE, 'PRE_PIPELINE');
    assert.strictEqual(BUFF_TYPES.POST_PIPELINE, 'POST_PIPELINE');
    assert.strictEqual(BUFF_TYPES.PIPELINE_MODIFIER, 'PIPELINE_MODIFIER');
    assert.strictEqual(BUFF_TYPES.DEFENSIVE, 'DEFENSIVE');
  });

  it('addBuff pushes buff to player._activeBuffs', () => {
    const player = makePlayer();
    addBuff(player, { id: 'test', buffType: 'PRE_PIPELINE', effect: {} });
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('addBuff initializes _activeBuffs if missing', () => {
    const player = {};
    addBuff(player, { id: 'test', buffType: 'PRE_PIPELINE', effect: {} });
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('consumeBuffsByType returns and removes matching buffs', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    addBuff(player, { id: 'b', buffType: 'POST_PIPELINE', effect: {} });
    addBuff(player, { id: 'c', buffType: 'PRE_PIPELINE', effect: {} });
    const consumed = consumeBuffsByType(player, 'PRE_PIPELINE');
    assert.strictEqual(consumed.length, 2);
    assert.strictEqual(player._activeBuffs.length, 1);
    assert.strictEqual(player._activeBuffs[0].id, 'b');
  });

  it('consumeBuffsByType returns empty array when no match', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    const consumed = consumeBuffsByType(player, 'DEFENSIVE');
    assert.strictEqual(consumed.length, 0);
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('consumeBuffsByType handles missing _activeBuffs', () => {
    const player = {};
    const consumed = consumeBuffsByType(player, 'PRE_PIPELINE');
    assert.strictEqual(consumed.length, 0);
  });

  it('clearAllBuffs empties the array', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    addBuff(player, { id: 'b', buffType: 'DEFENSIVE', effect: {} });
    clearAllBuffs(player);
    assert.strictEqual(player._activeBuffs.length, 0);
  });

  it('hasDefensiveBuff returns true when DEFENSIVE buff exists', () => {
    const player = makePlayer();
    addBuff(player, { id: 'egg', buffType: 'DEFENSIVE', effect: { surviveLethal: true } });
    assert.strictEqual(hasDefensiveBuff(player), true);
  });

  it('hasDefensiveBuff returns false when no DEFENSIVE buff', () => {
    const player = makePlayer();
    addBuff(player, { id: 'a', buffType: 'PRE_PIPELINE', effect: {} });
    assert.strictEqual(hasDefensiveBuff(player), false);
  });

  it('hasDefensiveBuff returns false when _activeBuffs missing', () => {
    const player = {};
    assert.strictEqual(hasDefensiveBuff(player), false);
  });
});

describe('executeInstantSkill', () => {
  it('lightbulb deals 20 damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.lightbulb);
    assert.strictEqual(result.damage, 20);
    assert.strictEqual(enemy.hp, 180);
  });

  it('charcoal heals 30 HP', () => {
    const player = { hp: 50, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.charcoal);
    assert.strictEqual(result.heal, 30);
    assert.strictEqual(player.hp, 80);
  });

  it('charcoal heal caps at maxHp', () => {
    const player = { hp: 90, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    executeInstantSkill(player, enemy, CHIPS.charcoal);
    assert.strictEqual(player.hp, 100);
  });

  it('straw heals 15 and deals 8 damage', () => {
    const player = { hp: 50, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.straw);
    assert.strictEqual(result.heal, 15);
    assert.strictEqual(result.damage, 8);
    assert.strictEqual(player.hp, 65);
    assert.strictEqual(enemy.hp, 192);
  });

  it('book deals 3x stacks damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: { book: 8 }, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.book);
    assert.strictEqual(result.damage, 24);
    assert.strictEqual(enemy.hp, 176);
  });

  it('book deals 0 damage with no stacks', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.book);
    assert.strictEqual(result.damage, 0);
  });

  it('wallet deals kills*1.5 damage', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 10 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.wallet);
    assert.strictEqual(result.damage, 15);
  });

  it('drum deals 2x player.attack', () => {
    const player = { hp: 100, maxHp: 100, attack: 25, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 200, maxHp: 200 };
    const result = executeInstantSkill(player, enemy, CHIPS.drum);
    assert.strictEqual(result.damage, 50);
  });

  it('enemy hp does not go below 0', () => {
    const player = { hp: 100, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const enemy = { hp: 10, maxHp: 200 };
    executeInstantSkill(player, enemy, CHIPS.lightbulb);
    assert.strictEqual(enemy.hp, 0);
  });

  it('handles null enemy gracefully for heal-only skills', () => {
    const player = { hp: 50, maxHp: 100, attack: 15, _combatStacks: {}, _runKills: 0 };
    const result = executeInstantSkill(player, null, CHIPS.charcoal);
    assert.strictEqual(result.heal, 30);
    assert.strictEqual(player.hp, 80);
  });
});

describe('activateBuffSkill', () => {
  it('battery creates PRE_PIPELINE buff with flatBonus 8', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.battery);
    assert.strictEqual(buff.buffType, 'PRE_PIPELINE');
    assert.strictEqual(buff.effect.flatBonus, 8);
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('speaker creates POST_PIPELINE buff with multiplier 1.4', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.speaker);
    assert.strictEqual(buff.buffType, 'POST_PIPELINE');
    assert.strictEqual(buff.effect.multiplier, 1.4);
  });

  it('clock creates PIPELINE_MODIFIER with runTwice', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.clock);
    assert.strictEqual(buff.buffType, 'PIPELINE_MODIFIER');
    assert.strictEqual(buff.effect.runTwice, true);
  });

  it('egg creates DEFENSIVE buff with surviveLethal', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.egg);
    assert.strictEqual(buff.buffType, 'DEFENSIVE');
    assert.strictEqual(buff.effect.surviveLethal, true);
  });

  it('scissors buff has enemyBelow30 condition', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.scissors);
    assert.strictEqual(buff.condition, 'enemyBelow30');
  });

  it('buff effect is a copy (not shared reference)', () => {
    const player = { _activeBuffs: [] };
    const buff = activateBuffSkill(player, CHIPS.battery);
    buff.effect.flatBonus = 999;
    // Original chip data should be unaffected
    assert.strictEqual(CHIPS.battery.skill.effect.flatBonus, 8);
  });
});

describe('useChipSkill', () => {
  function makePlayer(chipId, charge = 5) {
    return {
      hp: 100, maxHp: 100, attack: 15,
      _chipCharges: { [chipId]: charge },
      _activeBuffs: [],
      _combatStacks: {},
      _runKills: 5,
      equipment: { weapon: { equippedChips: [chipId] } }
    };
  }

  it('fails if chip not equipped', () => {
    const player = makePlayer('battery');
    player.equipment.weapon.equippedChips = [];
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('fails if not enough charges', () => {
    const player = makePlayer('battery', 3);
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('fails if chip has no skill', () => {
    const player = makePlayer('nonexistent', 5);
    const result = useChipSkill(player, {}, 'nonexistent');
    assert.strictEqual(result.success, false);
  });

  it('succeeds and resets charge for instant skill', () => {
    const player = makePlayer('lightbulb');
    const enemy = { hp: 200, maxHp: 200 };
    const result = useChipSkill(player, enemy, 'lightbulb');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skillType, 'instant');
    assert.strictEqual(result.damage, 20);
    assert.strictEqual(player._chipCharges.lightbulb, 0);
  });

  it('succeeds and resets charge for buff skill', () => {
    const player = makePlayer('battery');
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skillType, 'buff');
    assert.strictEqual(player._chipCharges.battery, 0);
    assert.strictEqual(player._activeBuffs.length, 1);
  });

  it('returns skill name info on success', () => {
    const player = makePlayer('battery');
    const result = useChipSkill(player, {}, 'battery');
    assert.strictEqual(result.skillName, '満充電');
    assert.strictEqual(result.skillNameEn, 'Full Charge');
    assert.strictEqual(result.chipId, 'battery');
  });

  it('buff skill includes buffApplied in result', () => {
    const player = makePlayer('speaker');
    const result = useChipSkill(player, {}, 'speaker');
    assert.strictEqual(result.success, true);
    assert.ok(result.buffApplied);
    assert.strictEqual(result.buffApplied.buffType, 'POST_PIPELINE');
  });

  it('instant skill applies damage to enemy', () => {
    const player = makePlayer('lightbulb');
    const enemy = { hp: 200, maxHp: 200 };
    useChipSkill(player, enemy, 'lightbulb');
    assert.strictEqual(enemy.hp, 180);
  });
});
