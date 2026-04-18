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

// ── countDebuffTypes ──

test('countDebuffTypes counts negative stages and negative status effects', () => {
  const creature = {
    statStages: { atk: -1, def: -2, spd: 0 },
    activeEffects: [
      { type: 'poison', remainingTurns: 2 },
      { type: 'confuse', remainingTurns: 1 },
      { type: 'shield', remainingTurns: 3 }  // not a debuff
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

test('countBuffTypes counts positive stages and positive status effects', () => {
  const creature = {
    statStages: { atk: 2, def: 1, spd: -1 },
    activeEffects: [
      { type: 'haste', remainingTurns: 1 },
      { type: 'shield', percent: 10, remainingTurns: 2 },
      { type: 'poison', remainingTurns: 3 }  // not a buff
    ]
  };
  assert.equal(countBuffTypes(creature), 4); // atk(+2) + def(+1) + haste + shield
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

test('Forked Arc bounce procs include sourceIndex tracking bounce chain', () => {
  const combat = makeCombat();
  const record = makeDmgRecord({ targetIndex: 0, damage: 100 });
  const allies = [makeAlly({ element: 'fire' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 100, maxHp: 100, element: 'fire' })
  ];

  withStubbedRandom(0.01, () => {
    applyAfterPlayerAttacks({
      attacks: [record],
      allies,
      enemies,
      runPartySkills: ['arcStrike', 'forkedArc'],
      combat
    });
  });

  const chainProcs = record.partySkillProcs.filter(p => p.type === 'chainHit');
  assert.ok(chainProcs.length >= 2, `expected at least 2 chain hits, got ${chainProcs.length}`);
  // Every chain hit proc should have a sourceIndex
  for (const proc of chainProcs) {
    assert.notStrictEqual(proc.sourceIndex, undefined, `proc ${proc.skillId} bounce ${proc.bounceNum || 'initial'} should have sourceIndex`);
  }
  // First arc strike should originate from the original target
  assert.strictEqual(chainProcs[0].sourceIndex, 0, 'arc strike sourceIndex should be original targetIndex');
});

// ── Forked Arc + Resonant Arc ──

test('Forked Arc bounces continue with 50% chance (all succeed)', () => {
  const allies = [makeAlly({ element: 'fire' })];
  // All fire so no SE interactions; 3 enemies so bounces have targets
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 100, maxHp: 100, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 < 0.50 so all bounce rolls succeed (up to 4 total including initial arc)
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies, runPartySkills: ['arcStrike', 'forkedArc'], combat
    });
  });

  // Initial arc + up to 3 bounces = 4 chain hits total
  const chainProcs = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  assert.ok(chainProcs.length >= 2, `expected at least 2 chain hits, got ${chainProcs.length}`);
  // First is arcStrike, rest are forkedArc
  assert.equal(chainProcs[0].skillId, 'arcStrike');
  for (let i = 1; i < chainProcs.length; i++) {
    assert.equal(chainProcs[i].skillId, 'forkedArc');
  }
  assert.equal(combat.chainHitsThisTurn, chainProcs.length);
});

test('Resonant Arc: later bounces deal more damage (30% -> 45% -> 60%)', () => {
  const allies = [makeAlly({ element: 'fire' })];
  // All fire elements to avoid SE
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 200, maxHp: 200, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 < 0.50 so all bounce rolls succeed
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'forkedArc', 'resonantArc'],
      combat
    });
  });

  const chainProcs = attacks[0].partySkillProcs.filter(p => p.type === 'chainHit');
  // Initial arc: 30% of 100 = 30
  assert.equal(chainProcs[0].damage, 30, 'initial arc should be 30% damage');
  // Bounce 2 (bounceCount=1): floor(100 * (0.30 + 0.15*1)) = floor(44.999...) = 44 (JS float)
  assert.equal(chainProcs[1].damage, 44, 'bounce 2 should be ~45% damage (44 due to float)');
  // Bounce 3 (bounceCount=2): floor(100 * (0.30 + 0.15*2)) = 60
  assert.equal(chainProcs[2].damage, 60, 'bounce 3 should be 60% damage');
  // Damage increases with each bounce
  assert.ok(chainProcs[1].damage > chainProcs[0].damage, 'bounce 2 should deal more than initial');
  assert.ok(chainProcs[2].damage > chainProcs[1].damage, 'bounce 3 should deal more than bounce 2');
});

// ── Chain Surge + Elemental Cascade ──

test('Chain Surge: 3+ chain hits grants all allies atk +1 stage', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' })
  ];
  // 4 enemies so we can get enough chain bounces
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e3', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e4', hp: 200, maxHp: 200, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 succeeds all bounces (< 0.50)
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'forkedArc', 'chainSurge'],
      combat
    });
  });

  assert.ok(combat.chainHitsThisTurn >= 3, `need 3+ chain hits, got ${combat.chainHitsThisTurn}`);
  // Both allies should have atk +1
  assert.equal(allies[0].statStages.atk, 1);
  assert.equal(allies[1].statStages.atk, 1);
  // Check surge proc on last attack
  const surgeProc = attacks[attacks.length - 1].partySkillProcs.find(p => p.skillId === 'chainSurge');
  assert.ok(surgeProc, 'chainSurge proc should exist');
  assert.equal(surgeProc.type, 'teamBuff');
});

test('Chain Surge does not trigger with fewer than 3 chain hits', () => {
  const allies = [makeAlly({ id: 'a1' })];
  // Only 2 enemies: can get at most 1 chain hit (no forkedArc)
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'fire' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'chainSurge'],
      combat
    });
  });

  assert.equal(combat.chainHitsThisTurn, 1); // only 1 arc strike
  assert.equal(allies[0].statStages.atk, 0, 'should not buff with < 3 chain hits');
});

test('Elemental Cascade: SE chain hits deal 2x damage', () => {
  // wood beats earth (wood -> earth in element cycle)
  const allies = [makeAlly({ element: 'wood' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'earth' })  // wood SE vs earth
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.99 to prevent elemental cascade debuff roll (> 0.30) and prevent contagion
  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'elementalCascade'],
      combat
    });
  });

  const chainProc = attacks[0].partySkillProcs.find(p => p.skillId === 'arcStrike');
  assert.ok(chainProc);
  assert.equal(chainProc.isSE, true);
  // SE chain: floor(floor(100 * 0.30) * 2) = floor(30 * 2) = 60
  assert.equal(chainProc.damage, 60);
});

test('Elemental Cascade: 30% chance to apply atk -1 stage', () => {
  // wood beats earth
  const allies = [makeAlly({ element: 'wood' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'earth' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 < 0.30 so cascade debuff procs
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'elementalCascade'],
      combat
    });
  });

  const cascadeProc = attacks[0].partySkillProcs.find(p => p.skillId === 'elementalCascade');
  assert.ok(cascadeProc, 'elementalCascade debuff proc should exist');
  assert.equal(cascadeProc.type, 'stageChange');
  assert.equal(cascadeProc.stat, 'atk');
  assert.equal(cascadeProc.delta, -1);
  assert.equal(enemies[1].statStages.atk, -1);
});

test('Elemental Cascade: no debuff when chain kills the chain target', () => {
  // wood vs earth is SE (2x). Chain target has just enough HP that the SE
  // chain hit kills it. The cascade debuff must NOT fire on a dead target.
  const allies = [makeAlly({ element: 'wood' })];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    // 30% of 100 damage = 30, doubled by SE = 60. HP is 50 → chain kills.
    makeEnemy({ id: 'e2', hp: 50, maxHp: 200, element: 'earth' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 would otherwise proc the cascade debuff, but target is dead after chain.
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'elementalCascade'],
      combat
    });
  });

  assert.equal(enemies[1].hp, 0, 'chain hit should have killed enemy 2');
  const cascadeProc = attacks[0].partySkillProcs.find(p => p.skillId === 'elementalCascade');
  assert.equal(cascadeProc, undefined, 'no cascade debuff should be applied on dead target');
  assert.equal(enemies[1].statStages.atk, 0, 'dead target should not get atk -1 stage');
});

test('Elemental Cascade: no debuff when Forked Arc bounce kills the bounce target', () => {
  const allies = [makeAlly({ element: 'wood' })];
  // Three enemies so forked arc can bounce; one has low HP to be killed by bounce.
  const enemies = [
    makeEnemy({ id: 'e1', hp: 200, maxHp: 200, element: 'fire' }),
    makeEnemy({ id: 'e2', hp: 200, maxHp: 200, element: 'earth' }),
    // Low HP earth enemy — SE bounce will kill it
    makeEnemy({ id: 'e3', hp: 20, maxHp: 200, element: 'earth' })
  ];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  // 0.1 succeeds all proc rolls (< 0.30 cascade, < 0.50 forked arc bounce).
  // We simulate: initial arc hits e2 or e3, then forked arc bounces. If any
  // bounce kills a target and tries to apply cascade debuff, the gate should
  // prevent it. We assert every cascade proc in the result has a live target.
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['arcStrike', 'forkedArc', 'elementalCascade'],
      combat
    });
  });

  const cascadeProcs = attacks[0].partySkillProcs.filter(p => p.skillId === 'elementalCascade');
  for (const proc of cascadeProcs) {
    const target = enemies[proc.targetIndex];
    assert.ok(target.hp > 0, `cascade debuff proc targeted a dead enemy (idx=${proc.targetIndex}, hp=${target.hp})`);
  }
});

// ══════════════════════════════════════════════════════════════════════
// Debuff Spread Tests (Tasks 6-8)
// ══════════════════════════════════════════════════════════════════════

// ── Contagion ──

test('Contagion: 35% chance to spread stat stage debuff to another enemy', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100 })
  ];
  const attacks = [makeDmgRecord({
    attackerIndex: 0, targetIndex: 0, damage: 20
  })];
  // Simulate that the move applied atk -1 to enemy 0
  attacks[0].statChangesApplied = { atk: -1 };
  enemies[0].statStages.atk = -1;
  const combat = makeCombat();

  // 0.1 < 0.35 so contagion procs
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['contagion'],
      combat
    });
  });

  const spreadProc = attacks[0].partySkillProcs.find(p => p.skillId === 'contagion');
  assert.ok(spreadProc, 'contagion spread proc should exist');
  assert.equal(spreadProc.type, 'spread');
  assert.equal(spreadProc.spreadType, 'stage');
  assert.equal(spreadProc.stat, 'atk');
  assert.equal(enemies[1].statStages.atk, -1, 'debuff should spread to enemy 2');
});

test('Contagion: no spread on failed roll', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100 })
  ];
  const attacks = [makeDmgRecord({
    attackerIndex: 0, targetIndex: 0, damage: 20
  })];
  attacks[0].statChangesApplied = { atk: -1 };
  enemies[0].statStages.atk = -1;
  const combat = makeCombat();

  // 0.99 > 0.35 so contagion fails
  withStubbedRandom(0.99, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['contagion'],
      combat
    });
  });

  const spreadProc = attacks[0].partySkillProcs.find(p => p.skillId === 'contagion');
  assert.equal(spreadProc, undefined, 'contagion should not proc on failed roll');
  assert.equal(enemies[1].statStages.atk, 0, 'enemy 2 should not be debuffed');
});

// ── Virulent Chain ──

test('Virulent Chain: contagion chains up to 3 times', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e3', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e4', hp: 100, maxHp: 100 })
  ];
  const attacks = [makeDmgRecord({
    attackerIndex: 0, targetIndex: 0, damage: 20
  })];
  attacks[0].statChangesApplied = { atk: -1 };
  enemies[0].statStages.atk = -1;
  const combat = makeCombat();

  // 0.1 < 0.35 so all contagion rolls succeed
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['contagion', 'virulentChain'],
      combat
    });
  });

  const spreadProcs = attacks[0].partySkillProcs.filter(p => p.skillId === 'contagion');
  assert.equal(spreadProcs.length, 3, 'contagion should chain exactly 3 times with virulentChain');
});

test('Contagion without Virulent Chain chains only once', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e3', hp: 100, maxHp: 100 })
  ];
  const attacks = [makeDmgRecord({
    attackerIndex: 0, targetIndex: 0, damage: 20
  })];
  attacks[0].statChangesApplied = { atk: -1 };
  enemies[0].statStages.atk = -1;
  const combat = makeCombat();

  // 0.1 < 0.35 so all contagion rolls succeed
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['contagion'],
      combat
    });
  });

  const spreadProcs = attacks[0].partySkillProcs.filter(p => p.skillId === 'contagion');
  assert.equal(spreadProcs.length, 1, 'contagion without virulentChain chains only once');
});

// ── Erosion ──

test('Erosion deepens negative stages on enemies each round (-2 -> -3)', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages.atk = -2;
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['erosion'], combat
  });

  assert.equal(enemies[0].statStages.atk, -3);
  const erosionEvent = events.find(e => e.type === 'erosion');
  assert.ok(erosionEvent);
  assert.equal(erosionEvent.stat, 'atk');
  assert.equal(erosionEvent.delta, -1);
  assert.equal(erosionEvent.newVal, -3);
});

test('Erosion caps at -6', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages.atk = -6;
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['erosion'], combat
  });

  assert.equal(enemies[0].statStages.atk, -6);
  // Delta should be 0 since already at cap, so no event
  const erosionEvent = events.find(e => e.type === 'erosion' && e.stat === 'atk');
  assert.equal(erosionEvent, undefined, 'no erosion event when already at -6 cap');
});

test('Erosion does not affect dead enemies', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 0, maxHp: 100 })];
  enemies[0].statStages.atk = -2;
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['erosion'], combat
  });

  assert.equal(enemies[0].statStages.atk, -2, 'dead enemy stages should not change');
  assert.equal(events.length, 0);
});

test('Erosion does not affect enemies with 0 stages', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages.atk = 0;
  enemies[0].statStages.def = 0;
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['erosion'], combat
  });

  assert.equal(enemies[0].statStages.atk, 0);
  assert.equal(enemies[0].statStages.def, 0);
  assert.equal(events.length, 0);
});

// ── Affliction Burst ──

test('Affliction Burst: 3+ debuff types triggers 20% max HP burst damage', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  // Give enemy 3 debuff types: atk -1, def -1, poison
  enemies[0].statStages.atk = -1;
  enemies[0].statStages.def = -1;
  enemies[0].activeEffects = [{ type: 'poison', remainingTurns: 2, damagePerTurn: 5 }];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 })];
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['afflictionBurst'],
    combat
  });

  const burstProc = attacks[0].partySkillProcs.find(p => p.skillId === 'afflictionBurst');
  assert.ok(burstProc, 'affliction burst should trigger');
  assert.equal(burstProc.type, 'burst');
  // 20% of 100 = 20
  assert.equal(burstProc.damage, 20);
  assert.equal(enemies[0].hp, 80); // 100 - 20 = 80
});

test('Affliction Burst respects 2-turn cooldown', () => {
  const allies = [makeAlly()];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages.atk = -1;
  enemies[0].statStages.def = -1;
  enemies[0].activeEffects = [{ type: 'poison', remainingTurns: 2, damagePerTurn: 5 }];
  const combat = makeCombat();

  // First trigger sets cooldown
  const attacks1 = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 })];
  applyAfterPlayerAttacks({
    attacks: attacks1, allies, enemies,
    runPartySkills: ['afflictionBurst'], combat
  });
  assert.equal(combat.afflictionBurstCooldown['0'], 2, 'cooldown should be 2 after trigger');

  // Second call: cooldown decrements to 1, no burst
  enemies[0].hp = 80; // reset for clarity
  const attacks2 = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 })];
  applyAfterPlayerAttacks({
    attacks: attacks2, allies, enemies,
    runPartySkills: ['afflictionBurst'], combat
  });
  const burstProc2 = attacks2[0].partySkillProcs.find(p => p.skillId === 'afflictionBurst');
  assert.equal(burstProc2, undefined, 'no burst during cooldown');
  assert.equal(combat.afflictionBurstCooldown['0'], 1, 'cooldown should decrement to 1');
  assert.equal(enemies[0].hp, 80, 'no damage during cooldown');

  // Third call: cooldown decrements to 0, still no burst this turn
  const attacks3 = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 })];
  applyAfterPlayerAttacks({
    attacks: attacks3, allies, enemies,
    runPartySkills: ['afflictionBurst'], combat
  });
  const burstProc3 = attacks3[0].partySkillProcs.find(p => p.skillId === 'afflictionBurst');
  assert.equal(burstProc3, undefined, 'no burst while cooldown is expiring');
  assert.equal(combat.afflictionBurstCooldown['0'], 0, 'cooldown should be 0');

  // Fourth call: cooldown expired, burst should fire again
  const attacks4 = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 10 })];
  applyAfterPlayerAttacks({
    attacks: attacks4, allies, enemies,
    runPartySkills: ['afflictionBurst'], combat
  });
  const burstProc4 = attacks4[0].partySkillProcs.find(p => p.skillId === 'afflictionBurst');
  assert.ok(burstProc4, 'burst should fire after cooldown expires');
});

// ── Pandemic ──

test('Pandemic: on target defeated, spreads negative stat stages to all surviving enemies', () => {
  const allies = [makeAlly()];
  const enemies = [
    makeEnemy({ id: 'e1', hp: 0, maxHp: 100 }),   // defeated with debuffs
    makeEnemy({ id: 'e2', hp: 100, maxHp: 100 }),
    makeEnemy({ id: 'e3', hp: 100, maxHp: 100 })
  ];
  enemies[0].statStages.atk = -3;
  enemies[0].statStages.def = -2;
  enemies[0].activeEffects = [{ type: 'poison', remainingTurns: 2, damagePerTurn: 5 }];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  attacks[0].targetDefeated = true;
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['pandemic'],
    combat
  });

  const pandemicProc = attacks[0].partySkillProcs.find(p => p.skillId === 'pandemic');
  assert.ok(pandemicProc, 'pandemic proc should exist');
  assert.equal(pandemicProc.survivorCount, 2);
  // Stat stages spread
  assert.equal(enemies[1].statStages.atk, -3);
  assert.equal(enemies[1].statStages.def, -2);
  assert.equal(enemies[2].statStages.atk, -3);
  assert.equal(enemies[2].statStages.def, -2);
  // Status effects spread
  assert.ok(enemies[1].activeEffects.find(e => e.type === 'poison'));
  assert.ok(enemies[2].activeEffects.find(e => e.type === 'poison'));
});

// ══════════════════════════════════════════════════════════════════════
// Counter Loop Tests (Task 9)
// ══════════════════════════════════════════════════════════════════════

// ── Retaliation Strike ──

test('Retaliation Strike: 50% chance to counter for 25% of defender ATK', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  // 0.1 < 0.50 so counter procs
  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike'],
      combat
    });
  });

  assert.equal(result.length, 1);
  // floor(40 * 0.25) = 10
  assert.equal(result[0].damage, 10);
  assert.equal(result[0].type, 'counter');
  assert.equal(enemies[0].hp, 90);
});

test('Retaliation Strike: no counter on failed roll', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  // 0.99 > 0.50 so counter fails
  const result = withStubbedRandom(0.99, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike'],
      combat
    });
  });

  assert.equal(result.length, 0);
  assert.equal(enemies[0].hp, 100);
});

test('Retaliation Strike: no counter on dead defender', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 0, maxHp: 100 })]; // dead
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike'],
      combat
    });
  });

  assert.equal(result.length, 0);
});

// ── Hardened Riposte ──

test('Hardened Riposte: +50% counter damage when defender has positive def stage', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })];
  allies[0].statStages.def = 2;  // positive def stage
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike', 'hardenedRiposte'],
      combat
    });
  });

  assert.equal(result.length, 1);
  // Base: floor(40 * 0.25) = 10, with riposte: floor(10 * 1.5) = 15
  assert.equal(result[0].damage, 15);
});

test('Hardened Riposte: +50% when defender has shield', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })];
  allies[0].activeEffects = [{ type: 'shield', percent: 20, remainingTurns: 3 }];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike', 'hardenedRiposte'],
      combat
    });
  });

  assert.equal(result.length, 1);
  // Base: floor(40 * 0.25) = 10, with riposte: floor(10 * 1.5) = 15
  assert.equal(result[0].damage, 15);
});

// ── Fury Counter ──

test('Fury Counter: each counter increments stack count (max 10) and damage increases', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 80, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 1000, maxHp: 1000 })];
  const combat = makeCombat();

  // First counter: stack 1
  const result1 = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
      allies, enemies,
      runPartySkills: ['retaliationStrike', 'furyCounter'],
      combat
    });
  });
  assert.equal(result1.length, 1);
  assert.equal(combat.counterCounts['0'], 1);
  // Base: floor(40 * 0.25) = 10, fury: floor(10 * (1 + 1 * 0.10)) = floor(10 * 1.1) = 11
  assert.equal(result1[0].damage, 11);
  assert.equal(result1[0].furyStacks, 1);

  // Second counter: stack 2
  const result2 = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
      allies, enemies,
      runPartySkills: ['retaliationStrike', 'furyCounter'],
      combat
    });
  });
  assert.equal(combat.counterCounts['0'], 2);
  // floor(10 * (1 + 2 * 0.10)) = floor(10 * 1.2) = 12
  assert.equal(result2[0].damage, 12);
  assert.equal(result2[0].furyStacks, 2);
});

test('Fury Counter: stacks cap at 10', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 80, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 10000, maxHp: 10000 })];
  const combat = makeCombat();
  combat.counterCounts['0'] = 9; // already at 9

  // 10th counter takes it to 10
  const result1 = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
      allies, enemies,
      runPartySkills: ['retaliationStrike', 'furyCounter'],
      combat
    });
  });
  assert.equal(combat.counterCounts['0'], 10);

  // 11th counter stays at 10
  const result2 = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks: [{ targetIndex: 0, attackerIndex: 0, damage: 10 }],
      allies, enemies,
      runPartySkills: ['retaliationStrike', 'furyCounter'],
      combat
    });
  });
  assert.equal(combat.counterCounts['0'], 10, 'stacks should not exceed 10');
  // floor(10 * (1 + 10 * 0.10)) = floor(10 * 2.0) = 20
  assert.equal(result2[0].damage, 20);
});

// ── Vengeful Mark ──

test('Vengeful Mark: counter applies atk -1 stage to enemy', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike', 'vengefulMark'],
      combat
    });
  });

  assert.equal(result.length, 1);
  const markProc = result[0].procs.find(p => p.skillId === 'vengefulMark');
  assert.ok(markProc, 'vengeful mark proc should exist');
  assert.equal(markProc.stat, 'atk');
  assert.equal(markProc.delta, -1);
  assert.equal(enemies[0].statStages.atk, -1);
});

// ── Last Stand ──

test('Last Stand: double counter damage when defender below 30% HP', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 20, maxHp: 100 })]; // 20% HP
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike', 'lastStand'],
      combat
    });
  });

  assert.equal(result.length, 1);
  // Base: floor(40 * 0.25) = 10, last stand: floor(10 * 2) = 20
  assert.equal(result[0].damage, 20);
  assert.equal(result[0].isLastStand, true);
});

test('Last Stand: no double damage when above 30% HP', () => {
  const allies = [makeAlly({ id: 'a1', attack: 40, hp: 50, maxHp: 100 })]; // 50% HP
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  const enemyAttacks = [{ targetIndex: 0, attackerIndex: 0, damage: 10 }];
  const combat = makeCombat();

  const result = withStubbedRandom(0.1, () => {
    return applyAfterEnemyAttacks({
      enemyAttacks, allies, enemies,
      runPartySkills: ['retaliationStrike', 'lastStand'],
      combat
    });
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].damage, 10); // no doubling
  assert.equal(result[0].isLastStand, false);
});

// ══════════════════════════════════════════════════════════════════════
// Buff Spread Tests (Tasks 10-11)
// ══════════════════════════════════════════════════════════════════════

// ── Momentum ──

test('Momentum grows positive stages on allies each round (+2 -> +3)', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 2;
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['momentum'], combat
  });

  assert.equal(allies[0].statStages.atk, 3);
  const momentumEvent = events.find(e => e.type === 'momentum');
  assert.ok(momentumEvent);
  assert.equal(momentumEvent.stat, 'atk');
  assert.equal(momentumEvent.delta, 1);
  assert.equal(momentumEvent.newVal, 3);
});

test('Momentum caps at +6', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 6;
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['momentum'], combat
  });

  assert.equal(allies[0].statStages.atk, 6);
  // No event because delta is 0
  const momentumEvent = events.find(e => e.type === 'momentum' && e.stat === 'atk');
  assert.equal(momentumEvent, undefined, 'no momentum event at +6 cap');
});

test('Momentum does not affect dead allies', () => {
  const allies = [makeAlly({ id: 'a1', hp: 0 })];
  allies[0].statStages.atk = 2;
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['momentum'], combat
  });

  assert.equal(allies[0].statStages.atk, 2, 'dead ally stages should not change');
  assert.equal(events.length, 0);
});

test('Momentum does not affect 0 stages', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 0;
  allies[0].statStages.def = 0;
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['momentum'], combat
  });

  assert.equal(allies[0].statStages.atk, 0);
  assert.equal(allies[0].statStages.def, 0);
  assert.equal(events.length, 0);
});

// ── Overflow Vitality ──

test('Overflow Vitality: 3+ buff types triggers 8% max HP regen', () => {
  const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 })];
  // 3 buff types: atk +1, def +1, shield
  allies[0].statStages.atk = 1;
  allies[0].statStages.def = 1;
  allies[0].activeEffects = [{ type: 'shield', percent: 10, remainingTurns: 3 }];
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['overflowVitality'], combat
  });

  const vitalityEvent = events.find(e => e.type === 'overflowVitality');
  assert.ok(vitalityEvent, 'overflow vitality should trigger');
  assert.equal(vitalityEvent.healAmount, 8); // floor(100 * 0.08) = 8
  assert.equal(allies[0].hp, 58); // 50 + 8
});

test('Overflow Vitality: does not trigger with < 3 buff types', () => {
  const allies = [makeAlly({ id: 'a1', hp: 50, maxHp: 100 })];
  // Only 2 buff types: atk +1, def +1
  allies[0].statStages.atk = 1;
  allies[0].statStages.def = 1;
  const enemies = [makeEnemy()];
  const combat = makeCombat();

  const events = applyRoundStartSkills({
    allies, enemies, runPartySkills: ['overflowVitality'], combat
  });

  const vitalityEvent = events.find(e => e.type === 'overflowVitality');
  assert.equal(vitalityEvent, undefined, 'should not trigger with < 3 buff types');
  assert.equal(allies[0].hp, 50);
});

// ── Diverse Empowerment ──

test('Diverse Empowerment: +8% damage per buff type on attacker (2 types = 16%)', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 1;
  allies[0].statStages.def = 1;
  const enemies = [makeEnemy({ id: 'e1', hp: 200, maxHp: 200 })];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['diverseEmpowerment'],
    combat
  });

  const empowerProc = attacks[0].partySkillProcs.find(p => p.skillId === 'diverseEmpowerment');
  assert.ok(empowerProc, 'diverse empowerment proc should exist');
  // 2 buff types * 8% = 16%, floor(100 * 0.16) = 16
  assert.equal(empowerProc.bonusDamage, 16);
  assert.equal(attacks[0].damage, 116); // 100 + 16
});

test('Diverse Empowerment: requires 2+ types to activate', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 1; // only 1 buff type
  const enemies = [makeEnemy({ id: 'e1', hp: 200, maxHp: 200 })];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['diverseEmpowerment'],
    combat
  });

  const empowerProc = attacks[0].partySkillProcs.find(p => p.skillId === 'diverseEmpowerment');
  assert.equal(empowerProc, undefined, 'should not activate with < 2 buff types');
  assert.equal(attacks[0].damage, 100);
});

// ── Radiant Aura ──

test('Radiant Aura: +15% team damage when 1 creature at 3+ buff types', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' })
  ];
  // Give a1 exactly 3 buff types: atk +1, def +1, haste
  allies[0].statStages.atk = 1;
  allies[0].statStages.def = 1;
  allies[0].activeEffects = [{ type: 'haste', remainingTurns: 1 }];
  // a2 has no buffs
  const enemies = [makeEnemy({ id: 'e1', hp: 200, maxHp: 200 })];
  const attacks = [makeDmgRecord({ attackerIndex: 1, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['radiantAura'],
    combat
  });

  const auraProc = attacks[0].partySkillProcs.find(p => p.skillId === 'radiantAura');
  assert.ok(auraProc, 'radiant aura should trigger');
  // 1 creature at 3+ buffs = 15%, floor(100 * 0.15) = 15
  assert.equal(auraProc.bonusDamage, 15);
  assert.equal(attacks[0].damage, 115);
});

test('Radiant Aura: +30% when 2+ creatures at 3+ buff types', () => {
  const allies = [
    makeAlly({ id: 'a1' }),
    makeAlly({ id: 'a2' })
  ];
  // Both allies have 3+ buff types
  for (const ally of allies) {
    ally.statStages.atk = 1;
    ally.statStages.def = 1;
    ally.activeEffects = [{ type: 'haste', remainingTurns: 1 }];
  }
  const enemies = [makeEnemy({ id: 'e1', hp: 200, maxHp: 200 })];
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 100 })];
  const combat = makeCombat();

  applyAfterPlayerAttacks({
    attacks, allies, enemies,
    runPartySkills: ['radiantAura'],
    combat
  });

  const auraProc = attacks[0].partySkillProcs.find(p => p.skillId === 'radiantAura');
  assert.ok(auraProc, 'radiant aura should trigger at 30%');
  // 2+ creatures at 3+ buffs = 30%, floor(100 * 0.30) = 30
  assert.equal(auraProc.bonusDamage, 30);
  assert.equal(attacks[0].damage, 130);
});

// ── countBuffTypes / countDebuffTypes additional coverage ──

test('countBuffTypes correctly counts positive stages + haste + shield', () => {
  const creature = {
    statStages: { atk: 3, def: 0 },
    activeEffects: [
      { type: 'shield', percent: 10, remainingTurns: 2 },
      { type: 'haste', remainingTurns: 1 }
    ]
  };
  // atk(+3) + shield + haste = 3
  assert.equal(countBuffTypes(creature), 3);
});

test('countBuffTypes counts team_shield as a buff', () => {
  const creature = {
    statStages: { atk: 0, def: 0 },
    activeEffects: [
      { type: 'team_shield', percent: 15, remainingTurns: 2 }
    ]
  };
  assert.equal(countBuffTypes(creature), 1);
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
    activeEffects: [
      { type: 'shield', percent: 10, remainingTurns: 2 },
      { type: 'haste', remainingTurns: 1 }
    ]
  };
  assert.equal(countDebuffTypes(creature), 0);
});

// ══════════════════════════════════════════════════════════════════════
// Shared Vigor on Buff Moves (Task 16)
// ══════════════════════════════════════════════════════════════════════

test('Shared Vigor triggers on buff move stat changes', () => {
  const allies = [
    makeAlly({ id: 'a1', hp: 80, maxHp: 100 }),
    makeAlly({ id: 'a2', hp: 80, maxHp: 100 })
  ];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  // A buff-category record that applied atk +1 to ally at index 0
  const attacks = [{
    attackerIndex: 0, category: 'buff', damage: 0, elementMultiplier: 1.0,
    targetIndex: 0, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: { atk: 1 }, effectApplied: null
  }];
  const combat = makeCombat();

  // 0.1 < 0.50 so Shared Vigor triggers
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['sharedVigor'],
      combat
    });
  });

  // Ally 0 got the direct buff (atk +1 from the move, already applied before engine)
  // Shared Vigor should spread to ally 1 (atk +1)
  assert.equal(allies[1].statStages.atk, 1, 'Shared Vigor should spread buff to another ally');
});

test('Shared Vigor triggers on shield move stat changes', () => {
  const allies = [
    makeAlly({ id: 'a1', hp: 80, maxHp: 100 }),
    makeAlly({ id: 'a2', hp: 80, maxHp: 100 })
  ];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  // A shield-category record with def +1
  const attacks = [{
    attackerIndex: 0, category: 'shield', damage: 0, elementMultiplier: 1.0,
    targetIndex: 0, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: { def: 1 }, effectApplied: null
  }];
  const combat = makeCombat();

  // 0.1 < 0.50 so Shared Vigor triggers
  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['sharedVigor'],
      combat
    });
  });

  assert.equal(allies[1].statStages.def, 1, 'Shared Vigor should spread shield buff to another ally');
});

test('Shared Vigor does NOT trigger on buff moves without positive stat changes', () => {
  const allies = [
    makeAlly({ id: 'a1', hp: 80, maxHp: 100 }),
    makeAlly({ id: 'a2', hp: 80, maxHp: 100 })
  ];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  // A buff-category record with no stat changes (e.g., status-only buff like haste)
  const attacks = [{
    attackerIndex: 0, category: 'buff', damage: 0, elementMultiplier: 1.0,
    targetIndex: 0, targetDefeated: false, partySkillProcs: [],
    statChangesApplied: null, effectApplied: 'haste'
  }];
  const combat = makeCombat();

  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['sharedVigor'],
      combat
    });
  });

  // No stat stages should change on ally 1
  assert.equal(allies[1].statStages.atk, 0, 'no Shared Vigor without stat changes');
  assert.equal(allies[1].statStages.def, 0, 'no Shared Vigor without stat changes');
});

test('Shared Vigor does NOT trigger on damage-category moves', () => {
  const allies = [
    makeAlly({ id: 'a1', hp: 80, maxHp: 100 }),
    makeAlly({ id: 'a2', hp: 80, maxHp: 100 })
  ];
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  // A damage-category record with stat changes (debuff on enemy, not a buff move)
  const attacks = [makeDmgRecord({ attackerIndex: 0, targetIndex: 0, damage: 20 })];
  attacks[0].statChangesApplied = { atk: 1 }; // unlikely but tests the guard
  const combat = makeCombat();

  withStubbedRandom(0.1, () => {
    applyAfterPlayerAttacks({
      attacks, allies, enemies,
      runPartySkills: ['sharedVigor'],
      combat
    });
  });

  // Shared Vigor's buff-move path should not fire for damage moves
  assert.equal(allies[1].statStages.atk, 0, 'no Shared Vigor spread from damage-category moves');
});

// ══════════════════════════════════════════════════════════════════════
// Integration Test (Task 12)
// ══════════════════════════════════════════════════════════════════════

test('Widening Gyre: 3 rounds of Erosion + Momentum grow stages cumulatively', () => {
  const allies = [makeAlly({ id: 'a1' })];
  allies[0].statStages.atk = 1;  // start with +1
  const enemies = [makeEnemy({ id: 'e1', hp: 100, maxHp: 100 })];
  enemies[0].statStages.atk = -1; // start with -1
  const combat = makeCombat();
  const skills = ['erosion', 'momentum'];

  // Round 1: ally atk +1 -> +2, enemy atk -1 -> -2
  applyRoundStartSkills({ allies, enemies, runPartySkills: skills, combat });
  assert.equal(allies[0].statStages.atk, 2);
  assert.equal(enemies[0].statStages.atk, -2);

  // Round 2: ally atk +2 -> +3, enemy atk -2 -> -3
  applyRoundStartSkills({ allies, enemies, runPartySkills: skills, combat });
  assert.equal(allies[0].statStages.atk, 3);
  assert.equal(enemies[0].statStages.atk, -3);

  // Round 3: ally atk +3 -> +4, enemy atk -3 -> -4
  applyRoundStartSkills({ allies, enemies, runPartySkills: skills, combat });
  assert.equal(allies[0].statStages.atk, 4);
  assert.equal(enemies[0].statStages.atk, -4);
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
