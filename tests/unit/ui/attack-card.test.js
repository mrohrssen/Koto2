import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

// Mock browser-only modules that attack-card.js imports at the module level.
// All mocks must be set up before dynamically importing attack-card.js so that
// static imports inside it (e.g. tts.js with top-level localStorage) are intercepted.
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: () => '',
    getKnownWords: () => new Set(),
    entityToToken: (x) => x,
  }
});
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureSpriteHtml: () => '',
    SPRITE_VERSION: '0',
  }
});
await mock.module('../../../public/js/ui/combat-ui-utils.js', {
  namedExports: {
    SC_NAMES: { atk: 'ATK', def: 'DEF', spd: 'Spd' },
  }
});
await mock.module('../../../public/js/tts.js', {
  namedExports: {
    prefetchWord: () => {},
    playWordPair: () => {},
  }
});

// Dynamic import after mocks are registered so transitive imports are intercepted.
const {
  formatResultValue,
  resultTone,
  effectivenessText,
} = await import('../../../public/js/ui/attack-card.js');

describe('attack-card helpers — formatResultValue', () => {
  it('damage category shows -N HP', () => {
    assert.strictEqual(formatResultValue({ category: 'damage', damage: 18 }), '-18 HP');
  });

  it('heal category shows +N HP', () => {
    assert.strictEqual(formatResultValue({ category: 'heal', healAmount: 12 }), '+12 HP');
  });

  it('buff category shows STAT ±N for first stat change', () => {
    assert.strictEqual(
      formatResultValue({ category: 'buff', statChangesApplied: { def: 1 } }),
      'DEF +1'
    );
  });

  it('debuff category shows STAT ±N for stat changes', () => {
    assert.strictEqual(
      formatResultValue({ category: 'debuff', statChangesApplied: { atk: -1 } }),
      'ATK -1'
    );
  });

  it('debuff category falls back to effect label when no stat change', () => {
    assert.strictEqual(
      formatResultValue({ category: 'debuff', effectApplied: 'confuse' }),
      'Confused!'
    );
  });

  it('shield category with no stat change falls back to label', () => {
    assert.strictEqual(
      formatResultValue({ category: 'shield' }),
      'Shielded!'
    );
  });

  it('drain category shows -N HP like damage', () => {
    assert.strictEqual(
      formatResultValue({ category: 'drain', damage: 14, healAmount: 7 }),
      '-14 HP'
    );
  });
});

describe('attack-card helpers — resultTone', () => {
  it('damage → damage tone', () => {
    assert.strictEqual(resultTone({ category: 'damage' }), 'damage');
  });
  it('heal → heal tone', () => {
    assert.strictEqual(resultTone({ category: 'heal' }), 'heal');
  });
  it('buff → buff tone', () => {
    assert.strictEqual(resultTone({ category: 'buff' }), 'buff');
  });
  it('shield → buff tone (shields are a positive buff-like effect)', () => {
    assert.strictEqual(resultTone({ category: 'shield' }), 'buff');
  });
  it('debuff → debuff tone', () => {
    assert.strictEqual(resultTone({ category: 'debuff' }), 'debuff');
  });
  it('drain → damage tone', () => {
    assert.strictEqual(resultTone({ category: 'drain' }), 'damage');
  });
});

describe('attack-card helpers — effectivenessText', () => {
  it('returns empty string for neutral matchup on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 1 }), '');
  });
  it('returns super effective for >1 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 2 }), '(Super effective!)');
  });
  it('returns not very effective for <1 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 0.5 }), '(Not very effective…)');
  });
  it('returns no effect for 0 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 0 }), '(No effect!)');
  });
  it('returns empty string for non-damage categories regardless of multiplier', () => {
    assert.strictEqual(effectivenessText({ category: 'heal', elementMultiplier: 2 }), '');
    assert.strictEqual(effectivenessText({ category: 'buff', elementMultiplier: 0.5 }), '');
    assert.strictEqual(effectivenessText({ category: 'debuff', elementMultiplier: 2 }), '');
  });
  it('returns super effective for drain on >1 multiplier', () => {
    assert.strictEqual(effectivenessText({ category: 'drain', elementMultiplier: 2 }), '(Super effective!)');
  });
});
