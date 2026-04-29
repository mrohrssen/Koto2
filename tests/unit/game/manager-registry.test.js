import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getManager, saveManager, removeManager } from '../../../src/game/manager-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '../../..');
const testSaveFile = join(BASE_DIR, '.jrpg-save-u_test123.json');

describe('manager-registry', () => {
  afterEach(() => {
    removeManager('u_test123');
    if (existsSync(testSaveFile)) unlinkSync(testSaveFile);
  });

  it('creates a new GameManager for unknown user', () => {
    const manager = getManager('u_test123');
    assert.ok(manager);
    assert.equal(manager.player, null);
  });

  it('returns same manager on repeated calls', () => {
    const m1 = getManager('u_test123');
    const m2 = getManager('u_test123');
    assert.strictEqual(m1, m2);
  });

  it('loads existing save file', () => {
    const saveData = {
      version: 2,
      player: { name: 'TestPlayer', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, creatures: { active: [], reserves: [] } },
      meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');
    assert.equal(manager.player.name, 'TestPlayer');
  });

  it('trims legacy creature move lists above 3 moves on load', () => {
    const overfullMoves = [
      { id: 'move-1' },
      { id: 'move-2' },
      { id: 'move-3' },
      { id: 'move-4' }
    ];
    const saveData = {
      version: 2,
      player: { name: 'MoveCapTest', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, creatures: { active: [], reserves: [] } },
      meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} },
      run: {
        active: true,
        creatureParty: {
          active: [{ id: 'sakana', moves: [...overfullMoves] }],
          reserves: [{ id: 'neko', moves: [...overfullMoves] }],
          pendingCaptures: [{ id: 'inu', moves: [...overfullMoves] }]
        },
        rooms: [{ dealer: { offeredCreatures: [{ id: 'hi', moves: [...overfullMoves] }] } }]
      },
      combat: {
        active: true,
        enemies: [{ id: 'sakana', moves: [...overfullMoves] }]
      }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');

    assert.equal(manager.run.creatureParty.active[0].moves.length, 3);
    assert.equal(manager.run.creatureParty.reserves[0].moves.length, 3);
    assert.equal(manager.run.creatureParty.pendingCaptures[0].moves.length, 3);
    assert.equal(manager.run.rooms[0].dealer.offeredCreatures[0].moves.length, 3);
    assert.equal(manager.combat.enemies[0].moves.length, 3);
  });

  it('saves manager state to user-specific file', () => {
    const manager = getManager('u_test123');
    manager.createPlayer('SaveTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
    saveManager('u_test123');

    assert.ok(existsSync(testSaveFile));
    const saved = JSON.parse(readFileSync(testSaveFile, 'utf-8'));
    assert.equal(saved.player.name, 'SaveTest');
    assert.equal(saved.version, 2);
  });

  it('saves and restores run and combat state', () => {
    const manager = getManager('u_test123');
    manager.createPlayer('PersistTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
    manager.run = { active: true, currentArea: 'starter_meadow', currentRoom: 2 };
    manager.combat = { active: true, npcId: 'npc_01', enemies: [{ id: 'c1', hp: 50 }] };
    saveManager('u_test123');

    removeManager('u_test123');
    const reloaded = getManager('u_test123');

    assert.deepStrictEqual(reloaded.run, { active: true, currentArea: 'starter_meadow', currentRoom: 2 });
    // Enemies without a uid get one lazily backfilled on load — check non-uid fields.
    assert.equal(reloaded.combat.active, true);
    assert.equal(reloaded.combat.npcId, 'npc_01');
    assert.equal(reloaded.combat.enemies.length, 1);
    assert.equal(reloaded.combat.enemies[0].id, 'c1');
    assert.equal(reloaded.combat.enemies[0].hp, 50);
    assert.ok(reloaded.combat.enemies[0].uid, 'enemy uid should be backfilled on load');
  });

  it('combat.allies shares reference with run.creatureParty.active after reload', () => {
    const creature = { id: 'c1', hp: 100, maxHp: 100, attack: 20 };
    const manager = getManager('u_test123');
    manager.createPlayer('RefTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
    manager.run = {
      active: true,
      creatureParty: { active: [creature], reserves: [] }
    };
    manager.combat = {
      active: true,
      allies: manager.run.creatureParty.active,
      enemies: [{ id: 'e1', hp: 50 }]
    };

    // Before save: references should match
    assert.strictEqual(manager.combat.allies, manager.run.creatureParty.active,
      'before save: combat.allies should === run.creatureParty.active');

    saveManager('u_test123');
    removeManager('u_test123');
    const reloaded = getManager('u_test123');

    // After reload: references MUST still match (damage propagation depends on this)
    assert.strictEqual(reloaded.combat.allies, reloaded.run.creatureParty.active,
      'after reload: combat.allies must === run.creatureParty.active');
  });

  it('loads null run/combat from old save files without those fields', () => {
    const saveData = {
      version: 2,
      player: { name: 'OldSave', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, creatures: { active: [], reserves: [] } },
      meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');
    assert.equal(manager.run, null);
    assert.equal(manager.combat, null);
  });

  it('strips lingering +100 ATK debug buffs from creatures on load', () => {
    const buffedCreature = (id) => ({
      id,
      uid: `${id}-uid`,
      hp: 100,
      maxHp: 100,
      attack: 20,
      itemBuffs: { baseAttackBonus: 100 },
      _debugAtkApplied: true
    });
    const saveData = {
      version: 2,
      player: { name: 'BuffTest', stats: { str: 5 }, hp: 100, maxHp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, creatures: { active: [], reserves: [] } },
      meta: {
        essence: 50, upgrades: [], achievements: [], lifetimeStats: {},
        pvpTeams: [{ creatureParty: { active: [buffedCreature('pvpA')], reserves: [buffedCreature('pvpR')] } }]
      },
      run: {
        active: true,
        creatureParty: {
          active: [buffedCreature('a1')],
          reserves: [buffedCreature('r1')],
          pendingCaptures: [buffedCreature('p1')]
        }
      }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');
    const all = [
      manager.run.creatureParty.active[0],
      manager.run.creatureParty.reserves[0],
      manager.run.creatureParty.pendingCaptures[0],
      manager.meta.pvpTeams[0].creatureParty.active[0],
      manager.meta.pvpTeams[0].creatureParty.reserves[0]
    ];
    for (const c of all) {
      assert.equal(c._debugAtkApplied, undefined, `${c.id} flag should be cleared`);
      assert.equal(c.itemBuffs.baseAttackBonus, 0, `${c.id} debug buff should be reverted`);
    }

    const persisted = JSON.parse(readFileSync(testSaveFile, 'utf-8'));
    assert.equal(persisted.run.creatureParty.active[0]._debugAtkApplied, undefined,
      'cleanup must persist to disk');
    assert.equal(persisted.run.creatureParty.active[0].itemBuffs.baseAttackBonus, 0);
  });
});
