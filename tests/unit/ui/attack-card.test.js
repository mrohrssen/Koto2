import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

// Mock browser-only modules that attack-card.js imports at the module level.
// All mocks must be set up before dynamically importing attack-card.js so that
// static imports inside it (e.g. tts.js with top-level localStorage) are intercepted.
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: (tokens) => tokens.map(t => [t.reading, t.nameEn].filter(Boolean).join(' ')).join(' '),
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
  buildSplitAttackCard,
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

  it('shield category with effectApplied=team_shield renders Shielded!', () => {
    assert.strictEqual(
      formatResultValue({ category: 'shield', effectApplied: 'team_shield' }),
      'Shielded!'
    );
  });

  it('buff category with effectApplied=haste renders Hasted!', () => {
    assert.strictEqual(
      formatResultValue({ category: 'buff', effectApplied: 'haste' }),
      'Hasted!'
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

const SAMPLE_ATTACK = {
  category: 'damage',
  damage: 18,
  elementMultiplier: 2,
  attackerId: 'hi',
  attackerName: 'Fire',
  attackerNameJp: '火',
  attackerElement: 'fire',
  attackerBaseWord: '火',
  attackerBaseReading: 'ひ',
  attackerBaseMeaning: 'fire',
  attackerSkillName: '炎',
  attackerSkillReading: 'ほのお',
  attackerSkillEn: 'flame',
  moveElement: 'fire',
  targetId: 'ki',
  targetName: 'Tree',
  targetNameJp: '木',
  targetBaseWord: '木',
  targetBaseReading: 'き',
  targetBaseMeaning: 'tree',
  targetElement: 'wood',
};

describe('buildSplitAttackCard — new 3-block layout', () => {
  it('renders an Attack result heading', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('class="sac-heading"'));
    assert.ok(html.includes('Attack result'));
  });

  it('renders three .sac-row elements in attacker → move → target order', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    const rows = html.match(/class="sac-row"/g);
    assert.strictEqual(rows?.length, 3, 'should have exactly 3 sac-row elements');
  });

  it('includes the attacker hiragana reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ひ'), 'attacker reading missing');
    assert.ok(html.includes('fire'), 'attacker English missing');
  });

  it('includes the move reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ほのお'), 'move reading missing');
    assert.ok(html.includes('flame'), 'move English missing');
  });

  it('includes the target reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('き'), 'target reading missing');
    assert.ok(html.includes('tree'), 'target English missing');
  });

  it('renders the result value and effectiveness line for super-effective damage', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('-18 HP'), 'damage number missing');
    assert.ok(html.includes('(Super effective!)'), 'effectiveness line missing');
  });

  it('omits effectiveness line for neutral damage', () => {
    const html = buildSplitAttackCard({ ...SAMPLE_ATTACK, elementMultiplier: 1 }, false);
    assert.ok(!html.includes('Super effective'), 'should not show super effective at mult=1');
    assert.ok(!html.includes('Not very effective'), 'should not show not-very-effective at mult=1');
  });

  it('renders heal category with +N HP and no effectiveness', () => {
    const html = buildSplitAttackCard(
      { ...SAMPLE_ATTACK, category: 'heal', healAmount: 12, elementMultiplier: 2 },
      false
    );
    assert.ok(html.includes('+12 HP'));
    assert.ok(!html.includes('Super effective'));
  });

  it('renders down-arrow chevrons between rows 1-2 and 2-3 only', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    const arrows = html.match(/class="sac-down-arrow"/g);
    assert.strictEqual(arrows?.length, 2, 'expected exactly 2 down arrows');
  });

  it('renders a tap-to-continue strip at the bottom', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('sac-continue-strip'));
    assert.ok(html.includes('tap to continue'));
  });

  it('applies the element theme via CSS variables', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('--sac-accent:'));
    assert.ok(html.includes('--sac-bg:'));
    assert.ok(html.includes('--sac-border:'));
  });

  it('honors options.attackerHtml as an override for the attacker row', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false, {
      attackerHtml: '<div class="mock-npc-attacker">CUSTOM</div>'
    });
    assert.ok(html.includes('mock-npc-attacker'));
    assert.ok(html.includes('CUSTOM'));
  });
});

describe('insertNpcAttackCard (via buildSplitAttackCard attackerHtml shape)', () => {
  it('NPC attacker row uses sprite tile + sac-body with renderJpSentence', () => {
    const atk = {
      ...SAMPLE_ATTACK,
      category: 'damage',
      attackerId: 'mentor',
      attackerName: 'Mentor',
      attackerNameJp: '先生',
      attackerBaseWord: '先生',
      attackerBaseReading: 'せんせい',
      attackerBaseMeaning: 'teacher',
    };
    // Simulate what insertNpcAttackCard builds for attackerHtml — a sprite tile
    // with the NPC image + a sac-body with the renderJpSentence output.
    const npcAttackerHtml =
      `<div class="sac-sprite-tile"><img class="sac-sprite" src="/assets/sprites/npcs/mentor.webp" alt=""></div>` +
      `<div class="sac-body">MOCK_NPC_WORD</div>`;
    const html = buildSplitAttackCard(atk, true, { attackerHtml: npcAttackerHtml });
    assert.ok(html.includes('MOCK_NPC_WORD'));
    assert.ok(html.includes('mentor.webp'));
    // No legacy .sac-attacker-name element should appear
    assert.ok(!html.includes('sac-attacker-name'));
  });
});
