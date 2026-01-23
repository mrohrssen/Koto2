/**
 * Unit tests for the new crazy pipeline chips
 * Run with: node --test tests/unit/pipeline-chips.test.js
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { CHIPS, executeChipPipeline } from '../../src/game/items/chips.js';

// Helper to create a chip instance from CHIPS constant
function getChip(id) {
  const chip = CHIPS[id];
  if (!chip) throw new Error(`Chip not found: ${id}`);
  return { ...chip };
}

// Helper to run pipeline with default context
function runPipeline(chips, overrides = {}) {
  return executeChipPipeline(chips, {
    baseDamage: 100,
    isCrit: false,
    critChance: 0.05,
    target: { isBoss: false, hp: 500, maxHp: 500 },
    combatStacks: {},
    weaponMaxSlots: 5,
    weaponUsedSlots: chips.length,
    runKills: 0,
    runChipsDestroyed: 0,
    ...overrides
  });
}

describe('Pipeline Chip Definitions', () => {
  it('should have all 13 new chips defined', () => {
    const newChips = [
      'clock', 'charcoal', 'book', 'eraser',
      'onigiri', 'wallet', 'straw', 'key',
      'egg', 'fireworks', 'mirror', 'feather', 'drum'
    ];

    for (const chipId of newChips) {
      assert.ok(CHIPS[chipId], `Chip ${chipId} should be defined`);
      assert.strictEqual(CHIPS[chipId].category, 'pipeline', `${chipId} should be pipeline category`);
      assert.ok(CHIPS[chipId].effects?.pipeline, `${chipId} should have pipeline effects`);
    }
  });

  it('should have Japanese names for all new chips', () => {
    const newChips = [
      'clock', 'charcoal', 'book', 'eraser',
      'onigiri', 'wallet', 'straw', 'key',
      'egg', 'fireworks', 'mirror', 'feather', 'drum'
    ];

    for (const chipId of newChips) {
      assert.ok(CHIPS[chipId].name, `${chipId} should have Japanese name`);
      assert.ok(CHIPS[chipId].nameEn, `${chipId} should have English name`);
    }
  });
});

describe('Battery Bot (baseline)', () => {
  it('should add flat damage', () => {
    const result = runPipeline([getChip('battery')]);
    assert.strictEqual(result.finalDamage, 105); // 100 + 5
  });
});

describe('Clock Bot', () => {
  it('should have 10% trigger chance', () => {
    const chip = getChip('clock');
    assert.strictEqual(chip.effects.pipeline.triggerChance, 0.10);
  });

  it('should restart pipeline when triggered', () => {
    // Mock Math.random for trigger chance checks
    // Each chip calls Math.random() once for trigger check
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      // Call 1: battery (triggerChance 1.0, any value works)
      // Call 2: clock (triggerChance 0.10, need < 0.10 to trigger)
      // Call 3: battery again after restart
      // Call 4: clock again (need >= 0.10 to NOT trigger)
      if (callCount === 2) return 0.05; // Trigger clock
      if (callCount === 4) return 0.99; // Don't trigger clock
      return 0.5; // Default for other chips
    };

    try {
      const result = runPipeline([getChip('battery'), getChip('clock')]);
      // With clock: battery(105) -> clock triggers -> battery(110) -> clock fails
      assert.strictEqual(result.recursionCount, 1);
      assert.strictEqual(result.finalDamage, 110); // 100 + 5 + 5
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should cap recursions at 10', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01; // Always trigger

    try {
      const result = runPipeline([getChip('battery'), getChip('clock')]);
      assert.strictEqual(result.recursionCount, 10);
      // 11 passes through battery: 100 + (5 * 11) = 155
      assert.strictEqual(result.finalDamage, 155);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Charcoal Bot', () => {
  it('should multiply damage by 10', () => {
    const result = runPipeline([getChip('charcoal')]);
    assert.strictEqual(result.finalDamage, 1000); // 100 * 10
  });

  it('should mark chip as sacrificed', () => {
    const result = runPipeline([getChip('charcoal')]);
    assert.deepStrictEqual(result.sacrificedChips, ['charcoal']);
  });

  it('should work with other chips in pipeline', () => {
    const result = runPipeline([getChip('battery'), getChip('charcoal')]);
    // 100 + 5 = 105, then 105 * 10 = 1050
    assert.strictEqual(result.finalDamage, 1050);
    assert.deepStrictEqual(result.sacrificedChips, ['charcoal']);
  });

  it('should not fire again after being sacrificed in same attack', () => {
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      // Call 1: charcoal (triggerChance 1.0)
      // Call 2: clock (triggerChance 0.10, need < 0.10 to trigger)
      // Call 3: clock again after restart (need >= 0.10 to stop)
      if (callCount === 2) return 0.05; // Trigger clock
      return 0.99; // Default
    };

    try {
      const result = runPipeline([getChip('charcoal'), getChip('clock')]);
      // First pass: charcoal(1000) -> clock triggers
      // Second pass: charcoal skipped (already destroyed) -> clock fails
      // Sacrifice should only apply once
      assert.strictEqual(result.finalDamage, 1000);
      assert.strictEqual(result.recursionCount, 1);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Book Bot', () => {
  it('should have 25% trigger chance', () => {
    const chip = getChip('book');
    assert.strictEqual(chip.effects.pipeline.triggerChance, 0.25);
  });

  it('should stack damage across attacks in same combat', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Always trigger (< 0.25)

    try {
      const combatStacks = {};

      // First attack
      const result1 = runPipeline([getChip('book')], { combatStacks });
      assert.strictEqual(result1.finalDamage, 103); // 100 + 3*1

      // Second attack (use updated stacks)
      const result2 = runPipeline([getChip('book')], {
        combatStacks: result1.combatStacks
      });
      assert.strictEqual(result2.finalDamage, 106); // 100 + 3*2

      // Third attack
      const result3 = runPipeline([getChip('book')], {
        combatStacks: result2.combatStacks
      });
      assert.strictEqual(result3.finalDamage, 109); // 100 + 3*3
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should not add damage when trigger fails', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Doesn't trigger (>= 0.25)

    try {
      const result = runPipeline([getChip('book')]);
      assert.strictEqual(result.finalDamage, 100); // No change
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Eraser Bot', () => {
  it('should add +40 damage with 2+ empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty slots
    });
    assert.strictEqual(result.finalDamage, 140); // 100 + 40
  });

  it('should add +40 damage with exactly 2 empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 3 // 2 empty slots
    });
    assert.strictEqual(result.finalDamage, 140);
  });

  it('should NOT trigger with only 1 empty slot', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 4 // 1 empty slot
    });
    assert.strictEqual(result.finalDamage, 100); // No bonus
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].conditionFailed, true);
  });

  it('should NOT trigger with no empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 5 // 0 empty slots
    });
    assert.strictEqual(result.finalDamage, 100);
  });
});

describe('Onigiri Bot', () => {
  it('should add +5 damage and heal 5 HP', () => {
    const result = runPipeline([getChip('onigiri')]);
    assert.strictEqual(result.finalDamage, 105);
    assert.strictEqual(result.healPlayer, 5);
  });

  it('should stack healing with multiple chips', () => {
    const result = runPipeline([getChip('onigiri'), getChip('onigiri')]);
    assert.strictEqual(result.finalDamage, 110); // 100 + 5 + 5
    assert.strictEqual(result.healPlayer, 10); // 5 + 5
  });
});

describe('Wallet Bot', () => {
  it('should add +1 damage per kill', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 10 });
    assert.strictEqual(result.finalDamage, 110); // 100 + 10
  });

  it('should add 0 damage with no kills', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 0 });
    assert.strictEqual(result.finalDamage, 100);
  });

  it('should scale infinitely with kills', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 100 });
    assert.strictEqual(result.finalDamage, 200); // 100 + 100
  });
});

describe('Straw Bot', () => {
  it('should reduce damage by 2 and heal 10 HP', () => {
    const result = runPipeline([getChip('straw')]);
    assert.strictEqual(result.finalDamage, 98); // 100 - 2
    assert.strictEqual(result.healPlayer, 10);
  });
});

describe('Key Bot', () => {
  it('should multiply damage by 1.10 against bosses', () => {
    const result = runPipeline([getChip('key')], {
      target: { isBoss: true, hp: 1000, maxHp: 1000 }
    });
    assert.strictEqual(result.finalDamage, 110); // 100 * 1.10
  });

  it('should NOT affect damage against non-bosses', () => {
    const result = runPipeline([getChip('key')], {
      target: { isBoss: false, hp: 500, maxHp: 500 }
    });
    assert.strictEqual(result.finalDamage, 100); // No change
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].conditionFailed, true);
  });
});

describe('Egg Bot', () => {
  it('should be x1 multiplier with no destroyed chips', () => {
    const result = runPipeline([getChip('egg')], { runChipsDestroyed: 0 });
    assert.strictEqual(result.finalDamage, 100); // 100 * 1
  });

  it('should gain +1x per destroyed chip', () => {
    const result = runPipeline([getChip('egg')], { runChipsDestroyed: 3 });
    assert.strictEqual(result.finalDamage, 400); // 100 * (1 + 3)
  });

  it('should synergize with Sacrifice chip', () => {
    // Simulate: charcoal destroyed first, then egg fires
    const result = runPipeline([getChip('charcoal'), getChip('egg')], {
      runChipsDestroyed: 1 // Already have 1 destroyed from earlier
    });
    // charcoal: 100 * 10 = 1000
    // egg: 1000 * (1 + 1) = 2000
    assert.strictEqual(result.finalDamage, 2000);
  });
});

describe('Fireworks Bot', () => {
  it('should add +50 damage', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Don't trigger destruction

    try {
      const result = runPipeline([getChip('fireworks')]);
      assert.strictEqual(result.finalDamage, 150); // 100 + 50
      assert.strictEqual(result.randomDestroyTriggered, false);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should trigger random destruction 10% of the time', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.05; // Trigger destruction (< 0.10)

    try {
      const result = runPipeline([getChip('fireworks')]);
      assert.strictEqual(result.finalDamage, 150);
      assert.strictEqual(result.randomDestroyTriggered, true);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Mirror Bot', () => {
  it('should copy previous flat damage chip', () => {
    const result = runPipeline([getChip('battery'), getChip('mirror')]);
    // battery: 100 + 5 = 105
    // mirror copies +5: 105 + 5 = 110
    assert.strictEqual(result.finalDamage, 110);
    assert.strictEqual(result.firedChips[1].copied, true);
  });

  it('should copy previous multiplier chip', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger speaker (80% chance)

    try {
      const result = runPipeline([getChip('speaker'), getChip('mirror')]);
      // speaker: 100 * 1.5 = 150
      // mirror copies x1.5: 150 * 1.5 = 225
      assert.strictEqual(result.finalDamage, 225);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should fail if first in pipeline', () => {
    const result = runPipeline([getChip('mirror')]);
    assert.strictEqual(result.finalDamage, 100); // No change
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].noPreviousChip, true);
  });

  it('should copy onigiri heal effect', () => {
    const result = runPipeline([getChip('onigiri'), getChip('mirror')]);
    // onigiri: 100 + 5 = 105, heal 5
    // mirror copies +5 and heal 5: 105 + 5 = 110, heal 5
    assert.strictEqual(result.finalDamage, 110);
    assert.strictEqual(result.healPlayer, 10); // 5 + 5
  });
});

describe('Feather Bot', () => {
  it('should add +20 damage per empty slot', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty slots
    });
    assert.strictEqual(result.finalDamage, 180); // 100 + (20 * 4)
  });

  it('should add 0 damage with no empty slots', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 5 // 0 empty slots
    });
    assert.strictEqual(result.finalDamage, 100);
  });

  it('should scale with more empty slots', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 2 // 3 empty slots
    });
    assert.strictEqual(result.finalDamage, 160); // 100 + (20 * 3)
  });
});

describe('Drum Bot', () => {
  it('should charge for 4 attacks, then burst on 5th', () => {
    const combatStacks = {};

    // Attacks 1-4: charging
    for (let i = 1; i <= 4; i++) {
      const result = runPipeline([getChip('drum')], { combatStacks });
      assert.strictEqual(result.finalDamage, 100, `Attack ${i} should not burst`);
      assert.strictEqual(result.firedChips[0].charging, true);
      assert.strictEqual(result.firedChips[0].untilBurst, 5 - i);
      Object.assign(combatStacks, result.combatStacks);
    }

    // Attack 5: BURST!
    const result5 = runPipeline([getChip('drum')], { combatStacks });
    assert.strictEqual(result5.finalDamage, 300); // 100 * 3
    assert.strictEqual(result5.firedChips[0].burstAttack, true);
  });

  it('should burst again on 10th attack', () => {
    const combatStacks = {};
    let lastResult;

    for (let i = 1; i <= 10; i++) {
      lastResult = runPipeline([getChip('drum')], { combatStacks });
      Object.assign(combatStacks, lastResult.combatStacks);
    }

    assert.strictEqual(lastResult.finalDamage, 300); // 100 * 3
    assert.strictEqual(lastResult.firedChips[0].burstAttack, true);
  });
});

describe('Complex Pipeline Combinations', () => {
  it('should handle battery -> speaker -> charcoal', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger speaker

    try {
      const result = runPipeline([
        getChip('battery'),
        getChip('speaker'),
        getChip('charcoal')
      ]);
      // battery: 100 + 5 = 105 (floor = 105)
      // speaker: 105 * 1.5 = 157.5 (floor = 157)
      // charcoal: 157 * 10 = 1570 (floor = 1570)
      // Note: intermediate flooring happens in processPipelineChip
      assert.strictEqual(result.finalDamage, 1570);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should handle onigiri -> straw healing stack', () => {
    const result = runPipeline([getChip('onigiri'), getChip('straw')]);
    // onigiri: 100 + 5 = 105, heal 5
    // straw: 105 - 2 = 103, heal 10
    assert.strictEqual(result.finalDamage, 103);
    assert.strictEqual(result.healPlayer, 15); // 5 + 10
  });

  it('should handle eraser + feather empty slot synergy', () => {
    const result = runPipeline([getChip('eraser'), getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 2 // 3 empty slots (eraser needs 2+)
    });
    // eraser: 100 + 40 = 140
    // feather: 140 + (20 * 3) = 200
    assert.strictEqual(result.finalDamage, 200);
  });

  it('should handle wallet + egg scaling', () => {
    const result = runPipeline([getChip('wallet'), getChip('egg')], {
      runKills: 50,
      runChipsDestroyed: 2
    });
    // wallet: 100 + 50 = 150
    // egg: 150 * (1 + 2) = 450
    assert.strictEqual(result.finalDamage, 450);
  });

  it('should handle mirror after clock restart', () => {
    const originalRandom = Math.random;
    let calls = 0;
    Math.random = () => {
      calls++;
      // First clock check triggers, second doesn't
      return calls === 2 ? 0.01 : 0.99;
    };

    try {
      const result = runPipeline([
        getChip('battery'),    // +5
        getChip('clock'),    // restart once
        getChip('mirror')       // copies battery
      ]);
      // Pass 1: battery(105) -> clock triggers -> restart
      // Pass 2: battery(110) -> clock fails -> mirror copies battery(115)
      assert.strictEqual(result.recursionCount, 1);
      assert.strictEqual(result.finalDamage, 115);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Edge Cases', () => {
  it('should handle empty pipeline', () => {
    const result = runPipeline([]);
    assert.strictEqual(result.finalDamage, 100);
    assert.deepStrictEqual(result.firedChips, []);
  });

  it('should skip non-pipeline chips', () => {
    // Create a fake non-pipeline chip
    const fakeChip = { id: 'fake', category: 'stat', effects: {} };
    const result = runPipeline([fakeChip, getChip('battery')]);
    assert.strictEqual(result.finalDamage, 105);
    assert.strictEqual(result.firedChips[0].skipped, true);
    assert.strictEqual(result.firedChips[0].notPipeline, true);
  });

  it('should handle 0 base damage', () => {
    const result = runPipeline([getChip('battery')], { baseDamage: 0 });
    assert.strictEqual(result.finalDamage, 5);
  });

  it('should handle very high damage scaling', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01; // Always trigger

    try {
      const result = runPipeline([
        getChip('battery'),
        getChip('speaker'),
        getChip('lightbulb'),
        getChip('charcoal')
      ], { baseDamage: 1000 });
      // battery: 1000 + 5 = 1005 (floor = 1005)
      // speaker: 1005 * 1.5 = 1507.5 (floor = 1507)
      // lightbulb: 1507 * 2 = 3014 (floor = 3014)
      // charcoal: 3014 * 10 = 30140 (floor = 30140)
      // Note: intermediate flooring happens in processPipelineChip
      assert.strictEqual(result.finalDamage, 30140);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should track combat stacks correctly across multiple chips', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger book

    try {
      const combatStacks = {};
      const result = runPipeline([
        getChip('book'),
        getChip('drum')
      ], { combatStacks });

      // book should have stack 1
      assert.strictEqual(result.combatStacks.book, 1);
      // drum should have attack count 1
      assert.strictEqual(result.combatStacks.drum_attacks, 1);
    } finally {
      Math.random = originalRandom;
    }
  });
});

// Run the tests
console.log('Running pipeline chips tests...\n');
