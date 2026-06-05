import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAfterPlayerAttacks, applyRoundStartSkills, applyAfterEnemyAttacks, countDebuffTypes, countBuffTypes } from '../../../src/game/combat/party-skill-engine.js';

function makeAlly({ id = 'ally', hp = 50, maxHp = 100, attack = 20, element = 'fire', defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeEnemy({ id = 'enemy', hp = 100, maxHp = 100, element = 'water', attack = 15, defense = 10 } = {}) {
  return { id, hp, maxHp, attack, defense, element, activeEffects: [], statStages: { atk: 0, def: 0 } };
}

function makeDmgRecord({ attackerIndex = 0, targetIndex = 0, damage = 20, elementMultiplier = 1.0 } = {}) {
  return {
    attackerIndex, category: 'damage', damage, elementMultiplier,
    targetIndex, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: null, effectApplied: null
  };
}

function makeCombat() {
  return { chainHitsThisTurn: 0, counterCounts: {}, afflictionBurstCooldown: {} };
}

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

// ── Smoke tests ──

test('engine exports exist and are callable', () => {
  assert.equal(typeof applyRoundStartSkills, 'function');
  assert.equal(typeof applyAfterPlayerAttacks, 'function');
  assert.equal(typeof applyAfterEnemyAttacks, 'function');
  assert.equal(typeof countDebuffTypes, 'function');
  assert.equal(typeof countBuffTypes, 'function');
});

test('applyRoundStartSkills returns empty array when no skills active', () => {
  const result = applyRoundStartSkills({
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  assert.deepEqual(result, []);
});

test('applyAfterPlayerAttacks handles empty skills gracefully', () => {
  const attacks = [makeDmgRecord()];
  applyAfterPlayerAttacks({
    attacks,
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  // Should not crash; no procs added
  assert.deepEqual(attacks[0].partySkillProcs, []);
});

test('applyAfterEnemyAttacks returns empty array when no retaliation skill', () => {
  const result = applyAfterEnemyAttacks({
    enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
    allies: [makeAlly()],
    enemies: [makeEnemy()],
    runPartySkills: [],
    combat: makeCombat()
  });
  assert.deepEqual(result, []);
});

test('Buff Master Lvl 4 gives every living ally one random buff at round start', () => {
  const allies = [makeAlly(), makeAlly()];
  const events = applyRoundStartSkills({
    allies,
    enemies: [makeEnemy()],
    runPartySkills: [{ id: 'buffMaster', level: 4 }],
    combat: makeCombat(),
    rng: () => 0.01
  });

  assert.equal(events.filter(e => e.type === 'buffMaster').length, 2);
  assert.equal(allies[0].statStages.atk, 1);
  assert.equal(allies[1].statStages.atk, 1);
});

test('Debuff Master Lvl 4 applies random debuffs to enemies hit by attacks', () => {
  const attacks = [makeDmgRecord({ damage: 50, targetIndex: 0 })];
  const enemies = [makeEnemy({ hp: 100 })];
  applyAfterPlayerAttacks({
    attacks,
    allies: [makeAlly()],
    enemies,
    runPartySkills: [{ id: 'debuffMaster', level: 4 }],
    combat: makeCombat(),
    rng: () => 0.01
  });

  assert.equal(enemies[0].statStages.atk, -1);
  assert.ok(attacks[0].partySkillProcs.some(p => p.skillId === 'debuffMaster' && p.type === 'stageChange'));
});

test('Debuff Master Lvl 5 can make an acting enemy debuff its own ally', async () => {
  const { applyEnemySelfSabotage } = await import('../../../src/game/combat/party-skill-engine.js');
  const enemies = [makeEnemy({ id: 'e0' }), makeEnemy({ id: 'e1' })];
  const event = applyEnemySelfSabotage({
    actingIndex: 0,
    enemies,
    runPartySkills: [{ id: 'debuffMaster', level: 5 }],
    rng: () => 0.01
  });

  assert.equal(event.type, 'debuffMasterSelfSabotage');
  assert.equal(enemies[event.targetIndex].statStages.atk, -1);
});

test('Buff Master Lvl 5 can buff an ally after a non-damage action', () => {
  const attacks = [{
    attackerIndex: 0,
    category: 'heal',
    healAmount: 20,
    targetIndex: 0,
    partySkillProcs: []
  }];
  const allies = [makeAlly(), makeAlly()];

  applyAfterPlayerAttacks({
    attacks,
    allies,
    enemies: [makeEnemy()],
    runPartySkills: [{ id: 'buffMaster', level: 5 }],
    combat: makeCombat(),
    rng: () => 0.01
  });

  assert.equal(allies[0].statStages.atk, 1);
  assert.ok(attacks[0].partySkillProcs.some(proc => proc.skillId === 'buffMaster'));
});

// ── countDebuffTypes ──

test('countDebuffTypes counts negative stages and negative status effects', () => {
  const creature = {
    statStages: { atk: -1, def: -2, dex: 0 },
    activeEffects: [
      { type: 'poison', remainingTurns: 2 },
      { type: 'confuse', remainingTurns: 1 },
      { type: 'taunt', remainingTurns: 3 }  // not a debuff
    ]
  };
  assert.equal(countDebuffTypes(creature), 4); // atk(-1) + def(-2) + poison + confuse
});

test('countDebuffTypes returns 0 for clean creature', () => {
  const creature = {
    statStages: { atk: 0, def: 0 },
    activeEffects: []
  };
  assert.equal(countDebuffTypes(creature), 0);
});

// ── countBuffTypes ──

test('countBuffTypes counts positive atk, def, and dex stages', () => {
  const creature = {
    statStages: { atk: 2, def: 1, dex: 1 },
    activeEffects: [{ type: 'poison', remainingTurns: 3 }]
  };
  assert.equal(countBuffTypes(creature), 3);
});

test('countBuffTypes returns 0 for debuffed creature', () => {
  const creature = {
    statStages: { atk: -1, def: 0 },
    activeEffects: [{ type: 'poison', remainingTurns: 2 }]
  };
  assert.equal(countBuffTypes(creature), 0);
});

// ══════════════════════════════════════════════════════════════════════
// Chain Loop Tests (Tasks 3-5)
// ══════════════════════════════════════════════════════════════════════

// ── Arc Strike ──

test('Arc Strike chains to another enemy for 30% of original damage', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemy1 = makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' });
  const enemy2 = makeEnemy({ id: 'e2', hp: 100, maxHp: 100, element: 'fire' });
  const enemies = [enemy1, enemy2];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 40 })];
  const combat = makeCombat();

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies, runPartySkills: ['arcStrike'], combat
    });
  });

  // Chain should hit enemy2 for floor(40 * 0.30) = 12
  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(chainProc, 'arc strike proc should exist');
  assert.equal(chainProc.type, 'chainHit');
  assert.equal(chainProc.targetIndex, 1);
  assert.equal(chainProc.damage, 12);
  assert.equal(enemy2.hp, 88);
  assert.equal(combat.chainHitsThisTurn, 1);
});

test('Arc Strike does not chain when only one enemy is alive', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' })];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 40 })];
  const combat = makeCombat();

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies, runPartySkills: ['arcStrike'], combat
    });
  });

  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.equal(chainProc, undefined, 'no chain when only one enemy');
  assert.equal(combat.chainHitsThisTurn, 0);
});

test('Arc Strike chain uses attacker element', () => {
  const allies = [makeAlly({ element: 'wood' })];
  const enemy1 = makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' });
  const enemy2 = makeEnemy({ id: 'e2', hp: 100, maxHp: 100, element: 'fire' });
  const enemies = [enemy1, enemy2];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 40 })];
  const combat = makeCombat();

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies, runPartySkills: ['arcStrike'], combat
    });
  });

  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(chainProc);
  assert.equal(chainProc.element, 'wood');
});

test('Arc Strike chainHit proc includes sourceIndex of original target', () => {
  const combat = makeCombat();
  const record = makeDmgRecord({ targetIndex: 0, damage: 100 });
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100, element: 'fire' })
  ];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks: [record],
      allies,
      enemies,
      runPartySkills: ['arcStrike'],
      combat
    });
  });

  const chainProc = record.partySkillProcs.find(p => p.type === 'chainHit');
  assert.ok(chainProc, 'arc strike chain proc should exist');
  assert.strictEqual(chainProc.sourceIndex, 0, 'sourceIndex should match original targetIndex');
});

test('Arc Strike Lvl 2 can add one extra bounce', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 100, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 100, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 2 }],
      combat: makeCombat()
    });
  });

  assert.equal(attacks[0].partySkillProcs.filter(p => p.type === 'chainHit').length, 2);
});

test('Arc Strike Lvl 3 uses additive 50% bounce damage scaling', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 500, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 4 }],
      combat: makeCombat()
    });
  });

  const chainHits = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  assert.equal(chainHits[0].damage, 30);
  assert.equal(chainHits[1].damage, 45);
});

test('Arc Strike Lvl 5 can keep bouncing after the second bounce', () => {
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 500, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 500, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ damage: 100, targetIndex: 0 })];
  const rolls = [0.01, 0.01, 0.01, 0.99];
  const original = Math.random;
  Math.random = () => rolls.length ? rolls.shift() : 0.99;
  try {
    applyAfterPlayerAttacks({
      attacks,
      allies,
      enemies,
      runPartySkills: [{ id: 'arcStrike', level: 5 }],
      combat: makeCombat()
    });
  } finally {
    Math.random = original;
  }

  assert.equal(attacks[0].partySkillProcs.filter(p => p.type === 'chainHit').length, 3);
});

// ── countBuffTypes / countDebuffTypes additional coverage ──

test('countBuffTypes correctly counts positive atk, def, and dex stages', () => {
  const creature = {
    statStages: { atk: 3, def: 1, dex: 2 },
    activeEffects: []
  };
  assert.equal(countBuffTypes(creature), 3);
});

test('countBuffTypes ignores positive status effects', () => {
  const creature = {
    statStages: { atk: 0, def: 0 },
    activeEffects: [{ type: 'taunt', remainingTurns: 2 }]
  };
  assert.equal(countBuffTypes(creature), 0);
});

test('countDebuffTypes correctly counts negative stages + poison + confuse + stun + sleep', () => {
  const creature = {
    statStages: { atk: -1, def: 0 },
    activeEffects: [
      { type: 'poison', remainingTurns: 2 },
      { type: 'confuse', remainingTurns: 1 },
      { type: 'stun', remainingTurns: 1 },
      { type: 'sleep', remainingTurns: 1 }
    ]
  };
  // atk(-1) + poison + confuse + stun + sleep = 5
  assert.equal(countDebuffTypes(creature), 5);
});

test('countDebuffTypes does not count positive effects as debuffs', () => {
  const creature = {
    statStages: { atk: 2, def: 1 },
    activeEffects: [{ type: 'taunt', remainingTurns: 1 }]
  };
  assert.equal(countDebuffTypes(creature), 0);
});

// ── Regression: Arc Strike chain kill should be detectable for attack pruning ──

test('arc strike chain kill sets enemy HP to 0 (verifiable for attack pruning)', () => {
  // Simulate: player attacks enemy1 (40 dmg), arc strike chains to enemy2 (12 dmg).
  // enemy2 has only 10 HP — chain should kill it.
  const allies = [makeAlly({ attack: 20 })];
  const enemies = [
    makeEnemy({ id: 'target', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'chain-victim', hp: 10, maxHp: 100 })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 40 })];
  const combat = makeCombat();

  const hpBefore = enemies.map(e => e.hp);

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies, runPartySkills: ['arcStrike'], combat
    });
  });

  // Chain killed enemy2
  assert.equal(enemies[1].hp, 0, 'chain victim should be dead (hp=0)');
  assert.ok(hpBefore[1] > 0, 'chain victim was alive before party skills');

  // The chain proc exists on the attack record
  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(chainProc, 'arc strike proc should exist');
  assert.equal(chainProc.targetIndex, 1, 'chain should target enemy index 1');

  // Server-side pruning logic: enemyAttacks from enemies killed by party skills
  // should be filtered out (enemy was alive during initiative but dead after party skills)
  const fakeEnemyAttacks = [
    { attackerIndex: 1, damage: 5, attackerName: 'chain-victim' }
  ];
  const pruned = fakeEnemyAttacks.filter(atk => {
    const idx = atk.attackerIndex;
    const enemy = enemies[idx];
    return !enemy || enemy.hp > 0 || hpBefore[idx] <= 0;
  });
  assert.equal(pruned.length, 0, 'attack from chain-killed enemy should be pruned');
});
