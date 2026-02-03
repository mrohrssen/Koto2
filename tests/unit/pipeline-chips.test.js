/**
 * Unit tests for the dual-pool pipeline chip system
 * Run with: node --test tests/unit/pipeline-chips.test.js
 *
 * DAMAGE FORMULA: POWER × (1 + BANDWIDTH)
 *
 * Stats are summed in FIRST PASS only (recursion doesn't re-add base stats).
 * Effects can add/multiply the pools.
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

// Helper to run pipeline with default context (dual-pool mode)
function runPipeline(chips, overrides = {}) {
  return executeChipPipeline(chips, {
    baseDamage: 0, // Use dual-pool system (POWER × (1 + BANDWIDTH))
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
  it('should have all 15 pipeline chips defined', () => {
    const newChips = [
      'clock', 'charcoal', 'book', 'eraser',
      'onigiri', 'wallet', 'straw', 'key',
      'egg', 'fireworks', 'mirror', 'feather', 'drum',
      'magnifyingGlass', 'toolbox'
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
      'egg', 'fireworks', 'mirror', 'feather', 'drum',
      'magnifyingGlass', 'toolbox'
    ];

    for (const chipId of newChips) {
      assert.ok(CHIPS[chipId].name, `${chipId} should have Japanese name`);
      assert.ok(CHIPS[chipId].nameEn, `${chipId} should have English name`);
    }
  });
});

describe('Battery Bot (baseline)', () => {
  it('should provide base power as stat stick', () => {
    const result = runPipeline([getChip('battery')]);
    // PWR 10, BW 0 → Damage = 10 × (1 + 0) = 10
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 10);
  });
});

describe('Clock Bot', () => {
  it('should have 7% trigger chance', () => {
    const chip = getChip('clock');
    assert.strictEqual(chip.effects.pipeline.triggerChance, 0.07);
  });

  it('should restart pipeline when triggered', () => {
    // Mock Math.random for trigger chance checks
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      // Battery type=none returns early without calling Math.random
      // Call 1: clock (triggerChance 0.07, need < 0.07 to trigger)
      // After restart: battery skips random, clock gets call 2
      // Call 2: clock again (need >= 0.07 to NOT trigger)
      if (callCount === 1) return 0.05; // Trigger clock first time
      return 0.99; // Don't trigger clock second time
    };

    try {
      const result = runPipeline([getChip('battery'), getChip('clock')]);
      // Battery PWR 10, BW 0 + Clock PWR 18, BW 2 = PWR 28, BW 2
      // Stats are summed only in first pass, so recursion doesn't add more stats
      // Damage = 28 × (1 + 2) = 84
      assert.strictEqual(result.recursionCount, 1);
      assert.strictEqual(result.powerPool, 28);
      assert.strictEqual(result.bandwidthPool, 2);
      assert.strictEqual(result.finalDamage, 84);
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
      // Battery PWR 10, BW 0 + Clock PWR 18, BW 2 = PWR 28, BW 2
      // Stats only summed once, recursion restarts effects only
      // Damage = 28 × (1 + 2) = 84
      assert.strictEqual(result.powerPool, 28);
      assert.strictEqual(result.finalDamage, 84);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Charcoal Bot', () => {
  it('should multiply both pools (×3 PWR, ×2 BW)', () => {
    const result = runPipeline([getChip('charcoal')]);
    // PWR 20, BW 3 (base stats)
    // Effect: ×3 PWR, ×2 BW
    // PWR = 20 × 3 = 60, BW = 3 × 2 = 6
    // Damage = 60 × (1 + 6) = 420
    assert.strictEqual(result.powerPool, 60);
    assert.strictEqual(result.bandwidthPool, 6);
    assert.strictEqual(result.finalDamage, 420);
  });

  it('should mark chip as sacrificed', () => {
    const result = runPipeline([getChip('charcoal')]);
    assert.deepStrictEqual(result.sacrificedChips, ['charcoal']);
  });

  it('should work with other chips in pipeline', () => {
    const result = runPipeline([getChip('battery'), getChip('charcoal')]);
    // Battery: PWR 10, BW 0
    // Charcoal: PWR 20, BW 3
    // Total base: PWR 30, BW 3
    // Charcoal effect: ×3 PWR, ×2 BW
    // PWR = 30 × 3 = 90, BW = 3 × 2 = 6
    // Damage = 90 × (1 + 6) = 630
    assert.strictEqual(result.powerPool, 90);
    assert.strictEqual(result.bandwidthPool, 6);
    assert.strictEqual(result.finalDamage, 630);
    assert.deepStrictEqual(result.sacrificedChips, ['charcoal']);
  });

  it('should not fire again after being sacrificed in same attack', () => {
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      // Call 1: charcoal (triggerChance 1.0)
      // Call 2: clock (triggerChance 0.07, need < 0.07 to trigger)
      // Call 3: charcoal after restart - skipped because sacrificed
      // Call 4: clock again (need >= 0.07 to stop)
      if (callCount === 2) return 0.05; // Trigger clock
      return 0.99; // Default
    };

    try {
      const result = runPipeline([getChip('charcoal'), getChip('clock')]);
      // Charcoal: PWR 20, BW 3
      // Clock: PWR 18, BW 2
      // Total: PWR 38, BW 5
      // Charcoal fires: ×3 PWR, ×2 BW → PWR 114, BW 10
      // Clock triggers recursion
      // Charcoal skipped (already sacrificed), clock doesn't trigger again
      // Damage = 114 × (1 + 10) = 1254
      assert.strictEqual(result.finalDamage, 1254);
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

  it('should stack bandwidth across attacks in same combat', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Always trigger (< 0.25)

    try {
      const combatStacks = {};

      // First attack - Book: PWR 9, BW 2 base, +1 BW from effect (stack 1)
      const result1 = runPipeline([getChip('book')], { combatStacks });
      // PWR 9, BW 2 (base) + 1 (effect) = BW 3
      // Damage = 9 × (1 + 3) = 36
      assert.strictEqual(result1.powerPool, 9);
      assert.strictEqual(result1.bandwidthPool, 3);
      assert.strictEqual(result1.finalDamage, 36);

      // Second attack (use updated stacks)
      const result2 = runPipeline([getChip('book')], {
        combatStacks: result1.combatStacks
      });
      // PWR 9, BW 2 (base) + 2 (effect, stack=2) = BW 4
      // Damage = 9 × (1 + 4) = 45
      assert.strictEqual(result2.powerPool, 9);
      assert.strictEqual(result2.bandwidthPool, 4);
      assert.strictEqual(result2.finalDamage, 45);

      // Third attack
      const result3 = runPipeline([getChip('book')], {
        combatStacks: result2.combatStacks
      });
      // PWR 9, BW 2 (base) + 3 (effect, stack=3) = BW 5
      // Damage = 9 × (1 + 5) = 54
      assert.strictEqual(result3.powerPool, 9);
      assert.strictEqual(result3.bandwidthPool, 5);
      assert.strictEqual(result3.finalDamage, 54);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should not add bandwidth when trigger fails', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Doesn't trigger (>= 0.25)

    try {
      const result = runPipeline([getChip('book')]);
      // PWR 9, BW 2 (base only, effect didn't trigger)
      // Damage = 9 × (1 + 2) = 27
      assert.strictEqual(result.powerPool, 9);
      assert.strictEqual(result.bandwidthPool, 2);
      assert.strictEqual(result.finalDamage, 27);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Eraser Bot', () => {
  it('should add +12 PWR +2 BW with 2+ empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty slots
    });
    // PWR 12, BW 2 (base) + 12 PWR, +2 BW (effect)
    // Damage = 24 × (1 + 4) = 120
    assert.strictEqual(result.powerPool, 24);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 120);
  });

  it('should add +12 PWR +2 BW with exactly 2 empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 3 // 2 empty slots
    });
    // PWR 12, BW 2 (base) + 12 PWR, +2 BW (effect)
    // Damage = 24 × (1 + 4) = 120
    assert.strictEqual(result.powerPool, 24);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 120);
  });

  it('should NOT trigger with only 1 empty slot', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 4 // 1 empty slot
    });
    // PWR 12, BW 2 (base only, effect didn't trigger)
    // Damage = 12 × (1 + 2) = 36
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36);
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].conditionFailed, true);
  });

  it('should NOT trigger with no empty slots', () => {
    const result = runPipeline([getChip('eraser')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 5 // 0 empty slots
    });
    // PWR 12, BW 2 (base only)
    // Damage = 12 × (1 + 2) = 36
    assert.strictEqual(result.powerPool, 12);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 36);
  });
});

describe('Onigiri Bot', () => {
  it('should provide power and heal 5 HP', () => {
    const result = runPipeline([getChip('onigiri')]);
    // PWR 9, BW 0 (stats) + heal 5 (effect)
    // Damage = 9 × 1 = 9
    assert.strictEqual(result.powerPool, 9);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 9);
    assert.strictEqual(result.healPlayer, 5);
  });

  it('should stack healing with multiple chips', () => {
    const result = runPipeline([getChip('onigiri'), getChip('onigiri')]);
    // PWR 9 + 9 = 18, BW 0 + heal 5 + 5 = 10
    // Damage = 18 × 1 = 18
    assert.strictEqual(result.powerPool, 18);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 18);
    assert.strictEqual(result.healPlayer, 10);
  });
});

describe('Wallet Bot', () => {
  it('should add +0.5 PWR per kill', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 10 });
    // PWR 11 (base) + 0.5 × 10 = 16, BW 1
    // Damage = 16 × (1 + 1) = 32
    assert.strictEqual(result.powerPool, 16);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 32);
  });

  it('should add base power with no kills', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 0 });
    // PWR 11 (base) + 0.5 × 0 = 11, BW 1
    // Damage = 11 × (1 + 1) = 22
    assert.strictEqual(result.powerPool, 11);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 22);
  });

  it('should scale infinitely with kills', () => {
    const result = runPipeline([getChip('wallet')], { runKills: 100 });
    // PWR 11 (base) + 0.5 × 100 = 61, BW 1
    // Damage = 61 × (1 + 1) = 122
    assert.strictEqual(result.powerPool, 61);
    assert.strictEqual(result.bandwidthPool, 1);
    assert.strictEqual(result.finalDamage, 122);
  });
});

describe('Straw Bot', () => {
  it('should add bandwidth and heal', () => {
    const result = runPipeline([getChip('straw')]);
    // PWR 6 (base), BW 2 (base) + 0.2 (effect) = BW 2.2
    // Damage = 6 × (1 + 2.2) = 19.2 → floor = 19
    assert.strictEqual(result.powerPool, 6);
    assert.strictEqual(result.bandwidthPool, 2.2);
    assert.strictEqual(result.finalDamage, 19);
    assert.strictEqual(result.healPlayer, 12);
  });
});

describe('Key Bot', () => {
  it('should multiply bandwidth by 1.5 against bosses', () => {
    const result = runPipeline([getChip('key')], {
      target: { isBoss: true, hp: 1000, maxHp: 1000 }
    });
    // PWR 13, BW 2 (base)
    // Effect: ×1.5 BW vs boss → BW 2 × 1.5 = 3
    // Damage = 13 × (1 + 3) = 52
    assert.strictEqual(result.powerPool, 13);
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 52);
  });

  it('should NOT affect bandwidth against non-bosses', () => {
    const result = runPipeline([getChip('key')], {
      target: { isBoss: false, hp: 500, maxHp: 500 }
    });
    // PWR 13, BW 2 (base only, effect didn't trigger)
    // Damage = 13 × (1 + 2) = 39
    assert.strictEqual(result.powerPool, 13);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 39);
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].conditionFailed, true);
  });
});

describe('Egg Bot', () => {
  it('should provide base bandwidth with no destroyed chips', () => {
    const result = runPipeline([getChip('egg')], { runChipsDestroyed: 0 });
    // PWR 15, BW 2 (base) + 0 (0 destroyed) = BW 2
    // Damage = 15 × (1 + 2) = 45
    assert.strictEqual(result.powerPool, 15);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 45);
  });

  it('should gain +1 BW per destroyed chip', () => {
    const result = runPipeline([getChip('egg')], { runChipsDestroyed: 3 });
    // PWR 15, BW 2 (base) + 0 + 1×3 = BW 5
    // Damage = 15 × (1 + 5) = 90
    assert.strictEqual(result.powerPool, 15);
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.finalDamage, 90);
  });

  it('should synergize with Sacrifice chip', () => {
    // Charcoal + Egg combo
    const result = runPipeline([getChip('charcoal'), getChip('egg')], {
      runChipsDestroyed: 1 // Already have 1 destroyed from earlier
    });
    // Charcoal: PWR 20, BW 3
    // Egg: PWR 15, BW 2
    // Total base: PWR 35, BW 5
    // Charcoal effect: ×3 PWR, ×2 BW → PWR 105, BW 10
    // Egg effect: +0 + 1×1 = +1 BW → BW 11
    // Damage = 105 × (1 + 11) = 1260
    assert.strictEqual(result.powerPool, 105);
    assert.strictEqual(result.bandwidthPool, 11);
    assert.strictEqual(result.finalDamage, 1260);
  });
});

describe('Fireworks Bot', () => {
  it('should provide power and bandwidth', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Don't trigger destruction

    try {
      const result = runPipeline([getChip('fireworks')]);
      // PWR 17, BW 2 (stats only, effect is meta)
      // Damage = 17 × (1 + 2) = 51
      assert.strictEqual(result.powerPool, 17);
      assert.strictEqual(result.bandwidthPool, 2);
      assert.strictEqual(result.finalDamage, 51);
      assert.strictEqual(result.randomDestroyTriggered, false);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should trigger random destruction 10% of the time', () => {
    const originalRandom = Math.random;
    let callCount = 0;
    Math.random = () => {
      callCount++;
      // First call is trigger check (1.0 chance, always passes)
      // Second call is destroy chance check (need < 0.1)
      if (callCount === 2) return 0.05;
      return 0.99;
    };

    try {
      const result = runPipeline([getChip('fireworks')]);
      // PWR 17, BW 2
      // Damage = 17 × 3 = 51
      assert.strictEqual(result.finalDamage, 51);
      assert.strictEqual(result.randomDestroyTriggered, true);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Mirror Bot', () => {
  it('should copy previous chip pool modifiers', () => {
    const result = runPipeline([getChip('battery'), getChip('mirror')]);
    // Battery: PWR 10, BW 0 (stat stick, no pool mods)
    // Mirror: PWR 18, BW 3
    // Total base: PWR 28, BW 3
    // Battery effect: type=none (doesn't set lastChipEffect)
    // Mirror effect: copy - but battery has no lastChipEffect to copy
    // So mirror fails (noPreviousChip)
    // Damage = 28 × (1 + 3) = 112
    assert.strictEqual(result.powerPool, 28);
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 112);
  });

  it('should copy previous multiplier chip', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.1; // Trigger speaker (80% chance)

    try {
      const result = runPipeline([getChip('speaker'), getChip('mirror')]);
      // Speaker: PWR 10, BW 3
      // Mirror: PWR 18, BW 3
      // Total base: PWR 28, BW 6
      // Speaker effect: ×1.2 BW → BW 6 × 1.2 = 7.2
      // Mirror copies ×1.2 BW → BW 7.2 × 1.2 = 8.64
      // Damage = 28 × (1 + 8.64) = 269.92 → floor = 269
      assert.strictEqual(result.powerPool, 28);
      assert.ok(Math.abs(result.bandwidthPool - 8.64) < 0.01);
      assert.strictEqual(result.finalDamage, 269);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should fail if first in pipeline', () => {
    const result = runPipeline([getChip('mirror')]);
    // PWR 18, BW 3 (base only, no effect fires)
    // Damage = 18 × (1 + 3) = 72
    assert.strictEqual(result.powerPool, 18);
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 72);
    assert.strictEqual(result.firedChips[0].triggered, false);
    assert.strictEqual(result.firedChips[0].noPreviousChip, true);
  });

  it('should copy onigiri heal effect', () => {
    const result = runPipeline([getChip('onigiri'), getChip('mirror')]);
    // Onigiri: PWR 9, BW 0, heal 5
    // Mirror: PWR 18, BW 3
    // Total base: PWR 27, BW 3
    // Onigiri effect: heal 5 (sets lastChipEffect with healPlayer)
    // Mirror copies heal 5 → total heal 10
    // Damage = 27 × (1 + 3) = 108
    assert.strictEqual(result.powerPool, 27);
    assert.strictEqual(result.bandwidthPool, 3);
    assert.strictEqual(result.finalDamage, 108);
    assert.strictEqual(result.healPlayer, 10); // 5 + 5
  });
});

describe('Feather Bot', () => {
  it('should add +3 PWR +0.5 BW per empty slot', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 1 // 4 empty slots
    });
    // PWR 11, BW 2 (base) + 3×4=12 PWR, 0.5×4=2 BW
    // Damage = 23 × (1 + 4) = 115
    assert.strictEqual(result.powerPool, 23);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 115);
  });

  it('should add 0 effect damage with no empty slots', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 5 // 0 empty slots
    });
    // PWR 11, BW 2 (base) + 3×0=0 PWR, 0.5×0=0 BW
    // Damage = 11 × (1 + 2) = 33
    assert.strictEqual(result.powerPool, 11);
    assert.strictEqual(result.bandwidthPool, 2);
    assert.strictEqual(result.finalDamage, 33);
  });

  it('should scale with more empty slots', () => {
    const result = runPipeline([getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 2 // 3 empty slots
    });
    // PWR 11, BW 2 (base) + 3×3=9 PWR, 0.5×3=1.5 BW
    // Damage = 20 × (1 + 3.5) = 90
    assert.strictEqual(result.powerPool, 20);
    assert.strictEqual(result.bandwidthPool, 3.5);
    assert.strictEqual(result.finalDamage, 90);
  });
});

describe('Drum Bot', () => {
  it('should charge for 4 attacks, then burst on 5th', () => {
    const combatStacks = {};

    // Attacks 1-4: charging
    for (let i = 1; i <= 4; i++) {
      const result = runPipeline([getChip('drum')], { combatStacks });
      // PWR 15, BW 3 (base)
      // Effect: charging (no mult until 5th)
      // Damage = 15 × (1 + 3) = 60
      assert.strictEqual(result.powerPool, 15);
      assert.strictEqual(result.bandwidthPool, 3);
      assert.strictEqual(result.finalDamage, 60, `Attack ${i} should not burst`);
      assert.strictEqual(result.firedChips[0].charging, true);
      assert.strictEqual(result.firedChips[0].untilBurst, 5 - i);
      Object.assign(combatStacks, result.combatStacks);
    }

    // Attack 5: BURST!
    const result5 = runPipeline([getChip('drum')], { combatStacks });
    // PWR 15, BW 3 (base)
    // Effect: ×2 BW → BW 3 × 2 = 6
    // Damage = 15 × (1 + 6) = 105
    assert.strictEqual(result5.powerPool, 15);
    assert.strictEqual(result5.bandwidthPool, 6);
    assert.strictEqual(result5.finalDamage, 105);
    assert.strictEqual(result5.firedChips[0].burstAttack, true);
  });

  it('should burst again on 10th attack', () => {
    const combatStacks = {};
    let lastResult;

    for (let i = 1; i <= 10; i++) {
      lastResult = runPipeline([getChip('drum')], { combatStacks });
      Object.assign(combatStacks, lastResult.combatStacks);
    }

    // PWR 15, BW 3 (base), ×2 BW = 6
    // Damage = 15 × (1 + 6) = 105
    assert.strictEqual(lastResult.powerPool, 15);
    assert.strictEqual(lastResult.bandwidthPool, 6);
    assert.strictEqual(lastResult.finalDamage, 105);
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
      // Battery: PWR 10, BW 0
      // Speaker: PWR 10, BW 3
      // Charcoal: PWR 20, BW 3
      // Total base: PWR 40, BW 6
      // Speaker effect: ×1.2 BW → BW 6 × 1.2 = 7.2
      // Charcoal effect: ×3 PWR, ×2 BW → PWR 40 × 3 = 120, BW 7.2 × 2 = 14.4
      // Damage = 120 × (1 + 14.4) = 1848 (floor may give 1847)
      assert.strictEqual(result.powerPool, 120);
      assert.ok(Math.abs(result.bandwidthPool - 14.4) < 0.01);
      assert.ok(result.finalDamage >= 1847 && result.finalDamage <= 1848);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should handle onigiri -> straw healing stack', () => {
    const result = runPipeline([getChip('onigiri'), getChip('straw')]);
    // Onigiri: PWR 9, BW 0, heal 5
    // Straw: PWR 6, BW 2
    // Total base: PWR 15, BW 2
    // Straw effect: +0.2 BW, heal 12
    // BW = 2 + 0.2 = 2.2
    // Damage = 15 × (1 + 2.2) = 48
    assert.strictEqual(result.powerPool, 15);
    assert.strictEqual(result.bandwidthPool, 2.2);
    assert.strictEqual(result.finalDamage, 48);
    assert.strictEqual(result.healPlayer, 17); // 5 + 12
  });

  it('should handle eraser + feather empty slot synergy', () => {
    const result = runPipeline([getChip('eraser'), getChip('feather')], {
      weaponMaxSlots: 5,
      weaponUsedSlots: 2 // 3 empty slots (eraser needs 2+)
    });
    // Eraser: PWR 12, BW 2
    // Feather: PWR 11, BW 2
    // Total base: PWR 23, BW 4
    // Eraser effect: +12 PWR, +2 BW → PWR 35, BW 6
    // Feather effect: +3×3=9 PWR, +0.5×3=1.5 BW → PWR 44, BW 7.5
    // Damage = 44 × (1 + 7.5) = 374
    assert.strictEqual(result.powerPool, 44);
    assert.strictEqual(result.bandwidthPool, 7.5);
    assert.strictEqual(result.finalDamage, 374);
  });

  it('should handle wallet + egg scaling', () => {
    const result = runPipeline([getChip('wallet'), getChip('egg')], {
      runKills: 50,
      runChipsDestroyed: 2
    });
    // Wallet: PWR 11, BW 1
    // Egg: PWR 15, BW 2
    // Total base: PWR 26, BW 3
    // Wallet effect: +0.5×50=25 PWR → PWR 51
    // Egg effect: +0+1×2=2 BW → BW 5
    // Damage = 51 × (1 + 5) = 306
    assert.strictEqual(result.powerPool, 51);
    assert.strictEqual(result.bandwidthPool, 5);
    assert.strictEqual(result.finalDamage, 306);
  });

  it('should handle mirror after clock restart', () => {
    const originalRandom = Math.random;
    let calls = 0;
    Math.random = () => {
      calls++;
      // Battery type=none skips Math.random
      // Call 1: clock (need < 0.07 to trigger)
      // Call 2: mirror (triggerChance 1.0, always triggers)
      // After restart:
      // Battery skips, Call 3: clock (need >= 0.07 to not trigger)
      // Call 4: mirror again
      if (calls === 1) return 0.01; // Trigger clock first time
      return 0.99; // Don't trigger clock second time, mirror always triggers
    };

    try {
      const result = runPipeline([
        getChip('battery'),    // stat stick
        getChip('clock'),      // restart once
        getChip('mirror')      // copies nothing (battery is stat stick)
      ]);
      // Battery: PWR 10, BW 0
      // Clock: PWR 18, BW 2
      // Mirror: PWR 18, BW 3
      // Total base: PWR 46, BW 5
      // Pass 1: battery (no lastChipEffect) -> clock triggers -> restart
      // Pass 2: battery (no lastChipEffect) -> clock fails -> mirror has nothing to copy
      // Damage = 46 × (1 + 5) = 276
      assert.strictEqual(result.recursionCount, 1);
      assert.strictEqual(result.powerPool, 46);
      assert.strictEqual(result.bandwidthPool, 5);
      assert.strictEqual(result.finalDamage, 276);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('Needle Bot (hpCost)', () => {
  it('should deal damage to player when triggered', () => {
    const player = { hp: 100, maxHp: 100 };
    const result = runPipeline([getChip('needle')], { player });
    // PWR 22, BW 4 -> Damage = 22 * (1 + 4) = 110
    assert.strictEqual(result.powerPool, 22);
    assert.strictEqual(result.bandwidthPool, 4);
    assert.strictEqual(result.finalDamage, 110);
    assert.strictEqual(result.hpCost, 5);
  });
});

describe('Edge Cases', () => {
  it('should handle empty pipeline', () => {
    const result = runPipeline([]);
    // No chips, no stats
    // Damage = 0 × 1 = 0
    assert.strictEqual(result.powerPool, 0);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 0);
    assert.deepStrictEqual(result.firedChips, []);
  });

  it('should skip non-pipeline chips', () => {
    // Create a fake non-pipeline chip
    const fakeChip = { id: 'fake', category: 'stat', effects: {} };
    const result = runPipeline([fakeChip, getChip('battery')]);
    // Only battery stats counted (fake chip is not pipeline)
    // PWR 10, BW 0
    // Damage = 10 × 1 = 10
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.bandwidthPool, 0);
    assert.strictEqual(result.finalDamage, 10);
    assert.strictEqual(result.firedChips[0].skipped, true);
    assert.strictEqual(result.firedChips[0].notPipeline, true);
  });

  it('should handle baseDamage: 0 correctly (dual-pool mode)', () => {
    const result = runPipeline([getChip('battery')], { baseDamage: 0 });
    // PWR 10, BW 0
    // Damage = 10 × 1 = 10
    assert.strictEqual(result.powerPool, 10);
    assert.strictEqual(result.finalDamage, 10);
  });

  it('should handle very high damage scaling', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.01; // Always trigger

    try {
      const result = runPipeline([
        getChip('battery'),    // PWR 10, BW 0
        getChip('speaker'),    // PWR 10, BW 3
        getChip('lightbulb'),  // PWR 10, BW 2
        getChip('charcoal')    // PWR 20, BW 3
      ]);
      // Total base: PWR 10+10+10+20=50, BW 0+3+2+3=8
      // Speaker: ×1.2 BW → BW 8 × 1.2 = 9.6
      // Lightbulb: ×1.5 BW → BW 9.6 × 1.5 = 14.4
      // Charcoal: ×3 PWR, ×2 BW → PWR 50 × 3 = 150, BW 14.4 × 2 = 28.8
      // Damage = 150 × (1 + 28.8) = 4470
      assert.strictEqual(result.powerPool, 150);
      assert.strictEqual(result.bandwidthPool, 28.8);
      assert.strictEqual(result.finalDamage, 4470);
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

describe('Pipeline Sequence Tracking', () => {
  it('should return sequence array with activate and base events', () => {
    const result = runPipeline([getChip('battery')]);

    assert.ok(Array.isArray(result.sequence), 'sequence should be an array');
    assert.ok(result.sequence.length >= 2, 'sequence should have at least 2 events');

    // First event: activate
    const activate = result.sequence.find(e => e.type === 'activate' && e.chipId === 'battery');
    assert.ok(activate, 'should have activate event for battery');
    assert.strictEqual(activate.chipName, 'Battery Bot');

    // Second event: base stats
    const base = result.sequence.find(e => e.type === 'base' && e.chipId === 'battery');
    assert.ok(base, 'should have base event for battery');
    assert.strictEqual(base.power, 10);
  });

  it('should include effect events for chips with passives', () => {
    const result = runPipeline([getChip('battery'), getChip('charcoal')]);

    // Charcoal has ×3 power, ×2 bandwidth effect
    const effect = result.sequence.find(e => e.type === 'effect' && e.chipId === 'charcoal');
    assert.ok(effect, 'should have effect event for charcoal');
    assert.strictEqual(effect.powerMult, 3);
  });

  it('should include heal events', () => {
    const result = runPipeline([getChip('onigiri')]);

    const heal = result.sequence.find(e => e.type === 'heal');
    assert.ok(heal, 'should have heal event');
    assert.strictEqual(heal.hp, 5);
  });

  it('should include noTrigger events for failed conditionals', () => {
    // Key chip only triggers vs bosses, running against non-boss
    const result = runPipeline([getChip('key')], { target: { isBoss: false, hp: 100, maxHp: 100 } });

    const noTrigger = result.sequence.find(e => e.type === 'noTrigger' && e.chipId === 'key');
    assert.ok(noTrigger, 'should have noTrigger event for key vs non-boss');
  });

  it('should include sacrifice events', () => {
    const result = runPipeline([getChip('charcoal')]);

    const sacrifice = result.sequence.find(e => e.type === 'sacrifice');
    assert.ok(sacrifice, 'should have sacrifice event');
    assert.strictEqual(sacrifice.chipId, 'charcoal');
  });
});

// Run the tests
console.log('Running pipeline chips tests...\n');
