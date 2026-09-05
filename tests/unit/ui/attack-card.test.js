import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

let prefetchWordCalls = [];
let playWordPairCalls = [];
let knownWords = new Set();

// Mock browser-only modules that attack-card.js imports at the module level.
// All mocks must be set up before dynamically importing attack-card.js so that
// static imports inside it (e.g. tts.js with top-level localStorage) are intercepted.
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderJpSentence: (tokens) => tokens.map(t => [t.reading, t.meaning || t.nameEn].filter(Boolean).join(' ')).join(' '),
    getKnownWords: () => knownWords,
    entityToToken: (x) => ({ ...x, meaning: x.nameEn || x.meaning }),
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
    prefetchWord: word => { prefetchWordCalls.push(word); },
    playWordPair: (...words) => { playWordPairCalls.push(words); },
  }
});

// Dynamic import after mocks are registered so transitive imports are intercepted.
const {
  formatResultValue,
  resultTone,
  effectivenessText,
  buildSplitAttackCard,
  insertAttackCard,
  insertNpcAttackCard,
  createAttackCardContinueControl,
  cancelAttackCardContinueControls,
  ATTACK_CARD_TIMING,
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
  attackerWord: '火',
  attackerReading: 'ひ',
  attackerMeaning: 'fire',
  attackerSkillName: '炎',
  attackerSkillReading: 'ほのお',
  attackerSkillEn: 'flame',
  moveElement: 'fire',
  targetId: 'ki',
  targetName: 'Tree',
  targetNameJp: '木',
  targetWord: '木',
  targetReading: 'き',
  targetMeaning: 'tree',
  targetElement: 'wood',
};

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toArray: () => [...values],
  };
}

function createFakeAttackCard() {
  const listeners = new Map();
  const actionAreaListeners = new Map();
  const continueEl = { textContent: 'tap to continue' };
  const card = {
    classList: createClassList(),
    querySelectorAll: () => [],
    parentElement: null,
    isConnected: true,
    contains(target) {
      return target === card || target === continueEl;
    },
    closest(selector) {
      return selector === '#action-area' ? actionArea : null;
    },
    querySelector(selector) {
      return selector === '.sac-continue' ? continueEl : null;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchClick(target = card) {
      const event = { target, currentTarget: card };
      for (const listener of listeners.get('click') || []) listener(event);
    },
  };
  const actionArea = {
    firstElementChild: card,
    contains(target) {
      return target === actionArea || target === card || target === continueEl;
    },
    addEventListener(type, listener) {
      if (!actionAreaListeners.has(type)) actionAreaListeners.set(type, new Set());
      actionAreaListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      actionAreaListeners.get(type)?.delete(listener);
    },
    dispatchClick(target = card) {
      const event = { target, currentTarget: actionArea };
      for (const listener of actionAreaListeners.get('click') || []) listener(event);
    },
    listenerCount(type) {
      return actionAreaListeners.get(type)?.size || 0;
    },
  };
  card.parentElement = actionArea;
  return { card, actionArea, continueEl };
}

function waitForTimeoutTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function createFakeDocumentForInsertedCard() {
  const rows = [
    { classList: { add: () => {} } },
    { classList: { add: () => {} } },
    { classList: { add: () => {} } },
  ];
  const card = {
    querySelectorAll(selector) {
      return selector === '.sac-row' ? rows : [];
    },
  };
  const actionArea = {
    innerHTML: '',
    querySelector(selector) {
      return selector === '.split-attack-card' ? card : null;
    },
  };
  return {
    getElementById(id) {
      return id === 'action-area' ? actionArea : null;
    },
  };
}

describe('createAttackCardContinueControl', () => {
  it('cancels every blocked continue wait during combat cleanup', async () => {
    const first = createFakeAttackCard();
    const second = createFakeAttackCard();
    const firstWait = createAttackCardContinueControl(first.card).wait();
    const secondWait = createAttackCardContinueControl(second.card).wait();
    let settled = false;
    Promise.all([firstWait, secondWait]).then(() => { settled = true; });

    await waitForTimeoutTick();
    assert.equal(settled, false);

    cancelAttackCardContinueControls();
    await Promise.all([firstWait, secondWait]);

    assert.equal(first.actionArea.listenerCount('click'), 0);
    assert.equal(second.actionArea.listenerCount('click'), 0);
  });

  it('records an early tap before wait and resolves wait without a second tap', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };
    try {
      const { card, actionArea, continueEl } = createFakeAttackCard();
      const control = createAttackCardContinueControl(card);

      actionArea.dispatchClick(card);

      assert.equal(control.wasRequested(), true);
      assert.equal(card.classList.contains('sac-continue-queued'), true);
      assert.equal(continueEl.textContent, 'continuing...');

      let resolved = false;
      await control.wait().then(() => { resolved = true; });

      assert.equal(resolved, true);
      assert.equal(card.classList.contains('sac-fading-out'), true);
      assert.equal(actionArea.listenerCount('click'), 0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('waits for a tap when no early request was recorded', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };
    try {
      const { card, actionArea, continueEl } = createFakeAttackCard();
      const control = createAttackCardContinueControl(card);
      let resolved = false;

      const waitPromise = control.wait().then(() => { resolved = true; });
      await waitForTimeoutTick();

      assert.equal(resolved, false);
      assert.equal(card.classList.contains('sac-continue-ready'), true);
      assert.equal(continueEl.textContent, 'tap to continue');

      actionArea.dispatchClick(card);
      await waitPromise;

      assert.equal(resolved, true);
      assert.equal(card.classList.contains('sac-fading-out'), true);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('ignores clicks outside the active attack card', () => {
    const { card, actionArea } = createFakeAttackCard();
    const control = createAttackCardContinueControl(card);

    actionArea.dispatchClick({ className: 'outside-node' });

    assert.equal(control.wasRequested(), false);
    assert.equal(card.classList.contains('sac-continue-queued'), false);
  });

  it('ignores repeated taps after the first request', () => {
    const { card, actionArea, continueEl } = createFakeAttackCard();
    const control = createAttackCardContinueControl(card);

    actionArea.dispatchClick(card);
    continueEl.textContent = 'manually changed after first tap';
    actionArea.dispatchClick(card);

    assert.equal(control.wasRequested(), true);
    assert.equal(continueEl.textContent, 'manually changed after first tap');
  });

  it('resolves safely if the card was removed before wait', async () => {
    const { card, actionArea } = createFakeAttackCard();
    const control = createAttackCardContinueControl(card);
    card.isConnected = false;

    await control.wait();

    assert.equal(actionArea.listenerCount('click'), 0);
  });
});

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

  it('includes the attacker hiragana reading and entity display name', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ひ'), 'attacker reading missing');
    assert.ok(html.includes('Fire'), 'attacker display name missing');
    assert.ok(!html.includes('ひ fire'), 'attacker definition should not replace display name');
  });

  it('includes the move reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ほのお'), 'move reading missing');
    assert.ok(html.includes('flame'), 'move English missing');
  });

  it('includes the target reading and entity display name', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('き'), 'target reading missing');
    assert.ok(html.includes('Tree'), 'target display name missing');
    assert.ok(!html.includes('き tree'), 'target definition should not replace display name');
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

describe('insertAttackCard audio behavior', () => {
  it('does not prefetch or play word audio when a split attack card appears', () => {
    const originalDocument = globalThis.document;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.document = createFakeDocumentForInsertedCard();
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };
    prefetchWordCalls = [];
    playWordPairCalls = [];

    try {
      insertAttackCard(SAMPLE_ATTACK, false);

      assert.deepEqual(prefetchWordCalls, []);
      assert.deepEqual(playWordPairCalls, []);
    } finally {
      globalThis.document = originalDocument;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('does not prefetch or play word audio when an NPC split attack card appears', () => {
    const originalDocument = globalThis.document;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.document = createFakeDocumentForInsertedCard();
    globalThis.setTimeout = (fn) => {
      fn();
      return 0;
    };
    prefetchWordCalls = [];
    playWordPairCalls = [];

    try {
      insertNpcAttackCard({
        ...SAMPLE_ATTACK,
        attackerId: 'mentor',
        attackerName: 'Mentor',
        attackerNameJp: '先生',
        attackerWord: '先生',
        attackerReading: 'せんせい',
        attackerMeaning: 'teacher',
      });

      assert.deepEqual(prefetchWordCalls, []);
      assert.deepEqual(playWordPairCalls, []);
    } finally {
      globalThis.document = originalDocument;
      globalThis.setTimeout = originalSetTimeout;
    }
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
      attackerWord: '先生',
      attackerReading: 'せんせい',
      attackerMeaning: 'teacher',
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


// An inserted card is essential here: only its actual rendered vocabulary may
// authorize an automatic skip; arbitrary or incomplete cards remain manual.
async function setupAutoCard(t, { atk = SAMPLE_ATTACK, enabled = true, words = ['火', '炎', '木'], isEnemy = false, npc = false } = {}) {
  const auto = await import('../../../public/js/ui/combat-auto-mode.js');
  cancelAttackCardContinueControls();
  knownWords = new Set(words);
  auto.updateExploreCombatAutoContext({ phase: 'combat', run: { active: true }, combat: {} });
  auto.setCombatAutoEnabled(enabled);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = createFakeAttackCard();
  const originalDocument = globalThis.document;
  const area = { innerHTML: '', querySelector: () => fixture.card };
  globalThis.document = { getElementById: id => id === 'action-area' ? area : null };
  if (npc) insertNpcAttackCard(atk);
  else insertAttackCard(atk, isEnemy);
  globalThis.document = originalDocument;
  t.after(() => {
    cancelAttackCardContinueControls();
    auto.setCombatAutoEnabled(false);
    auto.updateExploreCombatAutoContext(null);
    knownWords = new Set();
  });
  const control = createAttackCardContinueControl(fixture.card);
  return { ...fixture, control, auto };
}

describe('attack result Auto', () => {
  it('advances all-known results only after effects finish and the reading delay elapses', async t => {
    const { control, card } = await setupAutoCard(t);
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false, 'animation alone must never request a skip');
    const done = control.wait();
    t.mock.timers.tick(1199);
    assert.equal(control.wasRequested(), false);
    t.mock.timers.tick(1);
    assert.equal(control.wasRequested(), true);
    assert.equal(card.classList.contains('sac-fading-out'), true);
    t.mock.timers.tick(ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    await done;
  });

  for (const npc of [false, true]) {
    it(`advances all-known ${npc ? 'NPC' : 'enemy/opponent'} results through the same control`, async t => {
      const { control } = await setupAutoCard(t, { isEnemy: true, npc });
      const done = control.wait();
      t.mock.timers.tick(1200);
      assert.equal(control.wasRequested(), true);
      t.mock.timers.tick(ATTACK_CARD_TIMING.FADE_OUT_DURATION);
      await done;
    });
  }

  it('cancels a pending skip on entering Kanji Kombat', async t => {
    const { control, auto } = await setupAutoCard(t);
    control.wait();
    t.mock.timers.tick(600);
    auto.updateExploreCombatAutoContext({ phase: 'combat', run: { active: true, mode: 'kanjiKombat' }, combat: {} });
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  it('does not substitute creature IDs for FSRS vocabulary keys', async t => {
    const { control } = await setupAutoCard(t, { words: ['hi', 'ki', '炎'] });
    control.wait();
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  it('keeps all-known results manual when Auto is off', async t => {
    const { control } = await setupAutoCard(t, { enabled: false });
    control.wait();
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  for (const unknown of ['火', '炎', '木']) {
    it(`holds the result when the ${unknown} word is unknown`, async t => {
      const { control } = await setupAutoCard(t, { words: ['火', '炎', '木'].filter(w => w !== unknown) });
      control.wait();
      t.mock.timers.tick(10000);
      assert.equal(control.wasRequested(), false);
    });
  }

  it('holds incomplete vocabulary even when every supplied word is known', async t => {
    const { control } = await setupAutoCard(t, { atk: { ...SAMPLE_ATTACK, attackerSkillName: '', moveName: '' } });
    control.wait();
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  it('checks the rendered move precedence instead of a different known move field', async t => {
    const { control } = await setupAutoCard(t, { atk: { ...SAMPLE_ATTACK, attackerSkillName: 'unknown', moveName: '炎' } });
    control.wait();
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  it('allows repeated known words in self-target results', async t => {
    const { control } = await setupAutoCard(t, { atk: { ...SAMPLE_ATTACK, targetWord: '火' }, words: ['火', '炎'] });
    const done = control.wait();
    t.mock.timers.tick(1200);
    assert.equal(control.wasRequested(), true);
    t.mock.timers.tick(ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    await done;
  });

  it('cancels a pending skip when Auto is switched off and allows enabling it on an existing result', async t => {
    const { control, auto } = await setupAutoCard(t);
    const done = control.wait();
    t.mock.timers.tick(600);
    auto.setCombatAutoEnabled(false);
    t.mock.timers.tick(2000);
    assert.equal(control.wasRequested(), false);
    auto.setCombatAutoEnabled(true);
    t.mock.timers.tick(1200);
    assert.equal(control.wasRequested(), true);
    t.mock.timers.tick(ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    await done;
  });

  it('rechecks knownness when the delay expires', async t => {
    const { control } = await setupAutoCard(t);
    control.wait();
    knownWords.delete('炎');
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
  });

  it('clears the timer when a manual tap advances the result', async t => {
    const { control, actionArea } = await setupAutoCard(t);
    const done = control.wait();
    actionArea.dispatchClick();
    t.mock.timers.tick(ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    await done;
    t.mock.timers.tick(10000);
    assert.equal(actionArea.listenerCount('click'), 0);
  });

  it('cancels a scheduled skip during combat teardown', async t => {
    const { control, card, actionArea } = await setupAutoCard(t);
    const done = control.wait();
    cancelAttackCardContinueControls();
    await done;
    t.mock.timers.tick(10000);
    assert.equal(control.wasRequested(), false);
    assert.equal(card.classList.contains('sac-fading-out'), false);
    assert.equal(actionArea.listenerCount('click'), 0);
  });
});
