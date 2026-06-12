import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initKanjiKombatUI,
  renderKanjiKombatAction,
  renderKanjiKombatCompletionChoice,
  renderKanjiKombatIntro,
  renderKanjiKombatQuiz,
  startKanjiKombatOnboardingIfNeeded,
} from '../../../public/js/ui/kanji-kombat.js';
import { getKanjiKombatSession } from '../../../public/js/ui/kanji-kombat-session.js';

class FakeClassList {
  constructor(button) {
    this.button = button;
  }

  add(...tokens) {
    const classNames = new Set(this.button.className.split(/\s+/).filter(Boolean));
    tokens.forEach(token => classNames.add(token));
    this.button.className = [...classNames].join(' ');
  }

  remove(...tokens) {
    const removals = new Set(tokens);
    this.button.className = this.button.className
      .split(/\s+/)
      .filter(token => token && !removals.has(token))
      .join(' ');
  }

  contains(token) {
    return this.button.className.split(/\s+/).includes(token);
  }
}

class FakeButton {
  constructor(dataset = {}, textContent = '') {
    this.dataset = dataset;
    this._text = textContent;
    this.disabled = false;
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
  }

  set textContent(value) {
    this._text = String(value ?? '');
  }

  get textContent() {
    return this._text;
  }

  set innerHTML(value) {
    this._text = String(value ?? '').replace(/<[^>]+>/g, '');
  }

  get innerHTML() {
    return this._text;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    return this.listeners.get('click')?.({ currentTarget: this });
  }
}

class FakeActionArea {
  constructor() {
    this._innerHTML = '';
    this.buttons = [];
    this.children = [];
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.buttons = [
      ...value.matchAll(/<button class="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g)
    ].map(match => {
      const dataset = {};
      for (const [, attribute, attributeValue] of match[2].matchAll(/\s(data-[a-z-]+)="([^"]*)"/g)) {
        const key = attribute
          .slice('data-'.length)
          .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        dataset[key] = attributeValue;
      }
      const button = new FakeButton(dataset, match[3].replace(/<[^>]+>/g, '').trim());
      button.className = match[1];
      return button;
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(node) {
    this.children = this.children || [];
    this.children.push(node);
    if (node?.buttons) this.buttons.push(...node.buttons);
  }

  replaceChildren() {
    this.children = [];
    this.buttons = [];
    this._innerHTML = '';
  }

  querySelector(selector) {
    if (selector === '.kanji-kombat-prompt') {
      const match = this.innerHTML.match(/<div class="kanji-kombat-prompt">([^<]*)<\/div>/);
      return match ? { textContent: match[1] } : null;
    }
    if (selector === '.kanji-kombat-intro-card') {
      const match = this.innerHTML.match(/<div class="kanji-kombat-intro-card">([\s\S]*?)<\/div>\s*<div class="[^"]*kanji-kombat-intro-actions[^"]*">/);
      return match ? { textContent: match[1].replace(/<[^>]+>/g, '') } : null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '.kanji-kombat-choice') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-choice'));
    }
    if (selector === '.kanji-kombat-intro-action') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-intro-action'));
    }
    if (selector === '.kanji-kombat-completion-action') {
      return this.buttons.filter(button => button.className.split(/\s+/).includes('kanji-kombat-completion-action'));
    }
    return [];
  }
}

// Helper: a schedule that runs timers synchronously (zero-delay),
// enabling tests to observe sync results via flushPromises.
function syncSchedule(fn, _delay) {
  fn();
  return 0;
}

describe('kanji-kombat ui', () => {
  let actionArea;

  const onboardingCopy = {
    welcome: 'Hey, welcome to Kanji Kombat. Here, you can practice your hiragana, katakana, and kanji all the way up to full fluency.',
    hiraganaQuestion: 'First things first. Do you already know all hiragana?',
    hiraganaKnown: "Great, we won't spend time teaching you hiragana.",
    hiraganaUnknown: "Great, we'll teach you hiragana.",
    katakanaQuestion: 'Do you already know all katakana?',
    katakanaKnown: "Great, we won't spend time teaching you katakana.",
    katakanaUnknown: "Great, we'll teach you katakana.",
    finalHiragana: "Great, we'll start by teaching you hiragana and go from there.",
    finalKatakana: "Great, we'll start by teaching you katakana and go from there.",
    finalKanji: "Okay, great, we'll start by teaching you kanji. Let's jump right into it.",
  };

  beforeEach(() => {
    actionArea = new FakeActionArea();
    global.document = {
      getElementById: id => id === 'action-area' ? actionArea : null,
      createElement: tagName => {
        if (tagName === 'button') return new FakeButton();
        const element = {
          tagName,
          className: '',
          children: [],
          buttons: [],
          _text: '',
          listeners: new Map(),
          appendChild(node) {
            this.children.push(node);
            if (node instanceof FakeButton) {
              this.buttons.push(node);
              return;
            }
            if (node?.buttons) this.buttons.push(...node.buttons);
          },
          setAttribute(name, value) {
            this[name] = value;
          },
          addEventListener(type, handler) {
            this.listeners.set(type, handler);
          },
        };
        Object.defineProperty(element, 'textContent', {
          set(value) { element._text = String(value ?? ''); },
          get() { return element._text; },
        });
        Object.defineProperty(element, 'innerHTML', {
          set(value) { element._text = String(value ?? ''); },
          get() {
            return element._text
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;')
              .replaceAll('"', '&quot;');
          },
        });
        return element;
      },
    };
    initKanjiKombatUI({
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });
  });

  async function flushPromises(times = 1) {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  function createFakeEventTarget(base = {}) {
    const listeners = new Map();
    return {
      ...base,
      listeners,
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatch(type) {
        for (const handler of listeners.get(type) || []) handler();
      },
      listenerCount(type) {
        return listeners.get(type)?.length || 0;
      },
    };
  }

  function pendingOnboardingState(overrides = {}) {
    const {
      phase = 'combat',
      run: runOverrides = {},
      kanjiKombat: kanjiKombatOverrides = {},
      combat: combatOverrides = {},
    } = overrides;
    return {
      phase,
      run: {
        mode: 'kanjiKombat',
        ...runOverrides,
        kanjiKombat: {
          onboardingPending: true,
          currentQuiz: {
            prompt: '火',
            choices: [{ id: 'fire', answer: 'Fire' }],
          },
          ...runOverrides.kanjiKombat,
          ...kanjiKombatOverrides,
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 }, ...combatOverrides },
    };
  }

  async function completeOnboardingWithChoices(choiceIndices) {
    const calls = [];
    initKanjiKombatUI({
      showCidSprite: async () => calls.push(['showCidSprite']),
      hideCidSprite: async () => calls.push(['hideCidSprite']),
      showNarration: async (text, opts) => calls.push(['showNarration', text, opts]),
      forceHideNarration: () => calls.push(['forceHideNarration']),
      submitOnboarding: async (knowsHiragana, knowsKatakana) => {
        calls.push(['submitOnboarding', knowsHiragana, knowsKatakana]);
        return { state: { phase: 'combat' } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => calls.push(['unexpected-tts']),
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    assert.equal(startKanjiKombatOnboardingIfNeeded(pendingOnboardingState()), true);
    await flushPromises(4);
    await actionArea.buttons[choiceIndices[0]].click();
    await flushPromises(4);
    await actionArea.buttons[choiceIndices[1]].click();
    await flushPromises(8);
    return calls;
  }

  it('renders prompt and four quiz choices', () => {
    const quiz = {
      prompt: 'あ',
      type: 'hiragana',
      choices: [
        { id: 'a', answer: 'a' },
        { id: 'i', answer: 'i' },
        { id: 'u', answer: 'u' },
        { id: 'e', answer: 'e' },
      ],
    };
    renderKanjiKombatQuiz(quiz, { onAnswer: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-prompt').textContent, 'あ');
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').length, 4);
  });

  it('renders quiz answers in the combat move grid layout', () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'fire' },
        { id: 'water', answer: 'water' },
        { id: 'tree', answer: 'tree' },
        { id: 'metal', answer: 'metal' },
      ],
    }, { onAnswer: () => {} });

    assert.match(actionArea.innerHTML, /class="move-grid/);
    assert.doesNotMatch(actionArea.innerHTML, /Kanji Kombat/);
    assert.doesNotMatch(actionArea.innerHTML, /move-badge|答/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').every(button =>
      button.className.split(/\s+/).includes('move-cell')
    ), true);
  });

  it('delegates quiz answer clicks without forcing a UI rerender', async () => {
    const calls = [];
    const { initKanjiKombatUI, renderKanjiKombatAction } = await import('../../../public/js/ui/kanji-kombat.js');
    initKanjiKombatUI({
      submitAnswer: async answerId => {
        calls.push(answerId);
      },
      updateGameState: () => calls.push('unexpected-state'),
      updateUI: () => calls.push('unexpected-render'),
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [
              { id: 'fire', answer: 'fire' },
              { id: 'water', answer: 'water' },
              { id: 'tree', answer: 'tree' },
              { id: 'metal', answer: 'metal' },
            ],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    await Promise.resolve();

    assert.deepEqual(calls, ['fire']);
  });

  it('plays Japanese TTS text for the correct card when any quiz choice is selected', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitAnswer: async answerId => {
        calls.push(['submitAnswer', answerId]);
      },
      playCorrectAnswerAudio: answer => calls.push(['tts', answer]),
      updateGameState: () => calls.push(['unexpected-state']),
      updateUI: () => calls.push(['unexpected-render']),
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            reading: 'ひ',
            choices: [
              { id: 'fire', answer: 'Fire', correct: true },
              { id: 'water', answer: 'Water', correct: false },
            ],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    await actionArea.querySelectorAll('.kanji-kombat-choice')[1].click();

    assert.deepEqual(calls, [
      ['tts', 'ひ'],
      ['submitAnswer', 'water'],
    ]);
  });

  it('marks the selected quiz choice green when it is correct', async () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire', correct: true },
        { id: 'water', answer: 'Water', correct: false },
      ],
    }, { onAnswer: async () => {} });

    const [correctButton, wrongButton] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await correctButton.click();

    assert.equal(correctButton.classList.contains('kanji-kombat-choice--correct-selected'), true);
    assert.equal(correctButton.classList.contains('kanji-kombat-choice--wrong-selected'), false);
    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--correct-answer'), false);
  });

  it('marks a wrong quiz choice red and the correct answer green', async () => {
    renderKanjiKombatQuiz({
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire', correct: true },
        { id: 'water', answer: 'Water', correct: false },
      ],
    }, { onAnswer: async () => {} });

    const [correctButton, wrongButton] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await wrongButton.click();

    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--wrong-selected'), true);
    assert.equal(wrongButton.classList.contains('kanji-kombat-choice--correct-selected'), false);
    assert.equal(correctButton.classList.contains('kanji-kombat-choice--correct-answer'), true);
  });

  it('renders intro modal actions', () => {
    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });
    assert.equal(actionArea.querySelector('.kanji-kombat-intro-card').textContent.includes('上'), true);
    assert.match(actionArea.innerHTML, /New discovery!/);
    assert.match(actionArea.innerHTML, /I didn't know it yet/);
    assert.match(actionArea.innerHTML, /I already know it/);
    assert.match(actionArea.innerHTML, /lookup-action-forgot/);
    assert.match(actionArea.innerHTML, /lookup-action-knew/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 2);
  });

  it('plays Japanese TTS text when a discovery intro appears', () => {
    const calls = [];
    initKanjiKombatUI({
      playCorrectAnswerAudio: answer => calls.push(['tts', answer]),
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatIntro({ id: 'kanji:上', prompt: '上', reading: 'じょう', answer: 'Above' }, { onChoice: () => {} });

    assert.deepEqual(calls, [
      ['tts', 'じょう'],
    ]);
  });

  it('renders completion choice actions', () => {
    renderKanjiKombatCompletionChoice({ onChoice: () => {} });
    assert.match(actionArea.innerHTML, /Your reviews are done for the day!/);
    assert.match(actionArea.innerHTML, /Would you like to keep going\?/);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action').length, 2);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].textContent, 'No');
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].textContent, 'Yes');
  });

  it('continues after the legacy completion prompt without ending combat', async () => {
    const calls = [];
    const syncCalls = [];
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        syncCalls.push(entries.map(e => ({ kind: e.kind, keepGoing: e.keepGoing })));
        return { status: 'ok', confirmedThroughSeq: entries.at(-1).seq, state: { phase: 'combat' } };
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].click();
    await flushPromises(4);

    // Optimistic local update happens before sync
    assert.equal(calls.filter(c => c[0] === 'updateGameState').length >= 1, true);
    assert.equal(calls[0][0], 'updateGameState');
    assert.equal(calls[0][1], 'combat');
    // Action was recorded to session log as completionChoice keepGoing=true
    assert.equal(syncCalls.length, 1);
    assert.deepEqual(syncCalls[0], [{ kind: 'completionChoice', keepGoing: true }]);
    assert.equal(calls.some(c => c[0] === 'unexpected-finish'), false);
  });

  it('finishes combat after the completion prompt is declined', async () => {
    const calls = [];
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        // Return combatEnded in results for the "no" completion choice
        return {
          status: 'ok',
          confirmedThroughSeq: entries.at(-1).seq,
          state: { phase: 'combat' },
          results: [{ combatEnded: true, victory: true }],
        };
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      finishCombatResult: result => calls.push(['finishCombatResult', result.victory]),
      refreshAction: () => calls.push(['unexpected-refresh']),
      updateUI: () => calls.push(['unexpected-update']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].click();
    await flushPromises(4);

    // Optimistic local update and pending-completion UI render first
    assert.equal(calls[0][0], 'updateGameState');
    assert.equal(calls[0][1], 'combat');
    // Checkpoint fires finishCombatResult
    assert.deepEqual(calls.find(c => c[0] === 'finishCombatResult'), ['finishCombatResult', true]);
    assert.equal(calls.some(c => c[0] === 'unexpected-refresh'), false);
    assert.equal(calls.some(c => c[0] === 'unexpected-update'), false);
  });

  it('applies accepted intro choice state after clearing the choice locally', async () => {
    const calls = [];
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        return { status: 'ok', confirmedThroughSeq: entries.at(-1).seq, state: { phase: 'combat' } };
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['refreshAction']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          pendingIntro: {
            card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' },
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(4);

    // Optimistic update fires first
    assert.equal(calls[0][0], 'updateGameState');
    assert.equal(calls[0][1], 'combat');
    // Intro action was recorded in the session log
    const snap = getKanjiKombatSession().snapshot();
    assert.equal(snap.length === 0 || snap.some(e => e.kind === 'intro'), true); // may be confirmed
    // Checkpoint applies server state (logEmpty=true)
    assert.equal(calls.filter(c => c[0] === 'updateGameState').length >= 1, true);
  });

  it('submits intro choices with an action id and clears the choice locally', async () => {
    const calls = [];
    const syncCalls = [];
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        syncCalls.push(entries);
        return { status: 'ok', confirmedThroughSeq: entries.at(-1).seq, state: { phase: 'combat', accepted: true } };
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.phase, state.accepted === true, state.run?.kanjiKombat?.pendingIntro ?? null]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async () => calls.push(['unexpected-narration']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          pendingIntro: { card: { id: 'hiragana:ka', prompt: 'か', reading: 'か', answer: 'ka' } },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(4);

    // First updateGameState: optimistic draft clears pendingIntro
    assert.deepEqual(calls[0], ['updateGameState', 'combat', false, null]);
    // Session received an entry with a valid actionId pattern
    assert.equal(syncCalls.length, 1);
    const entry = syncCalls[0][0];
    assert.match(entry.actionId, /^kk_[a-z0-9]+_[a-z0-9]+$/i);
    assert.equal(entry.kind, 'intro');
    assert.equal(entry.cardId, 'hiragana:ka');
    assert.equal(entry.choice, 'known');
    // Checkpoint applies accepted state (logEmpty=true → updateGameState called again)
    assert.equal(calls.some(c => c[0] === 'updateGameState' && c[1] === 'combat' && c[2] === true), true);
    assert.equal(actionArea.innerHTML, '');
  });

  it('queues intro sync and keeps the next prompt visible when submit is delayed', async () => {
    const calls = [];
    let resolveSyncFn;
    const syncPromise = new Promise(resolve => { resolveSyncFn = resolve; });
    let currentState = null;

    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        calls.push(['syncSession', entries[0].kind, entries[0].promptId, entries[0].sequence]);
        return syncPromise;
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => {
        currentState = state;
        calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]);
        renderKanjiKombatAction(state);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_queue',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next_queue',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    const clickPromise = actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(4);

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');
    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', 'kkp_next_queue'],
      ['syncSession', 'intro', 'kkp_intro_queue', 1],
    ]);
    assert.equal(calls.some(call => call[0] === 'showNarration'), false);

    resolveSyncFn({
      status: 'ok',
      confirmedThroughSeq: 1,
      state: {
        phase: 'combat',
        run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      },
    });
    await clickPromise;
    await flushPromises(4);
  });

  it('does not replay a consumed intro when the server response is null', async () => {
    const calls = [];
    let currentState = null;

    initKanjiKombatUI({
      syncSession: async () => null,
      __sessionSchedule: syncSchedule,
      updateGameState: state => {
        currentState = state;
        calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]);
        renderKanjiKombatAction(state);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_null',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next_null',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(8);

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');
    assert.equal(calls.some(call => call[0] === 'showNarration' && /did not save/.test(call[1])), false);
  });

  it('pauses before consuming a prompt when the session is at the hard limit', async () => {
    const calls = [];
    // Never-resolving syncSession keeps the log full
    initKanjiKombatUI({
      syncSession: async () => new Promise(() => {}),
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    // Seed the session log to the hard cap (50) by recording 50 actions directly.
    // onPause fires when the 50th item is added, so clear calls after seeding.
    const session = getKanjiKombatSession();
    for (let i = 0; i < 50; i++) {
      session.recordAction({
        actionId: `run_seed_${i}`,
        kind: 'intro',
        promptId: `kkp_seed_${i}`,
        sequence: i + 1,
        cardId: `hiragana:${i}`,
        choice: 'unknown',
      });
    }
    await flushPromises(2);
    calls.length = 0; // clear any onPause narration from seeding

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_blocked_intro',
            sequence: 51,
            kind: 'intro',
            cardId: 'hiragana:か',
            intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const handled = await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(2);

    assert.equal(handled, false);
    assert.deepEqual(calls, [
      ['showNarration', 'Connection is spotty. Your reviews will sync when you reconnect.'],
    ]);
  });

  it('shows spotty connection copy when no prompt is available but session is pending', async () => {
    const calls = [];
    // Never-resolving syncSession keeps pending log non-empty
    initKanjiKombatUI({
      syncSession: async () => new Promise(() => {}),
      __sessionSchedule: syncSchedule,
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    // Seed one pending action so session.pendingCount() > 0
    getKanjiKombatSession().recordAction({
      actionId: 'run_pending_empty',
      kind: 'intro',
      promptId: 'kkp_pending_empty',
      sequence: 1,
      cardId: 'hiragana:0',
      choice: 'unknown',
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_stale_intro',
            sequence: 1,
            kind: 'intro',
            cardId: 'hiragana:か',
            intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 2);

    const handled = renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [],
          currentQuiz: null,
          pendingIntro: null,
          completionChoicePending: false,
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await flushPromises(2);

    assert.equal(handled, true);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 0);
    assert.deepEqual(calls, [
      ['showNarration', 'Connection is spotty. Your reviews will sync when you reconnect.'],
    ]);
  });

  it('shows the sync pause after consuming the last intro while sync is pending', async () => {
    const calls = [];
    let resolveSyncFn;
    const syncPromise = new Promise(resolve => { resolveSyncFn = resolve; });

    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        calls.push(['syncSession', entries[0].kind, entries[0].promptId, entries[0].sequence]);
        return syncPromise;
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer.length]),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_last_intro',
            sequence: 3,
            kind: 'intro',
            cardId: 'hiragana:か',
            intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const handled = await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(4);

    assert.equal(handled, true);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 0);
    assert.deepEqual(calls.slice(0, 3), [
      ['updateGameState', 0],
      ['syncSession', 'intro', 'kkp_last_intro', 3],
      ['showNarration', 'Connection is spotty. Your reviews will sync when you reconnect.'],
    ]);

    resolveSyncFn({
      status: 'ok',
      confirmedThroughSeq: 1,
      state: {
        phase: 'combat',
        run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      },
    });
    await flushPromises(4);
  });

  it('drains the current session on reconnect and visible tab return without duplicate listeners', async () => {
    const originalWindow = global.window;
    const originalDocument = global.document;
    const fakeWindow = createFakeEventTarget();
    const fakeDocument = createFakeEventTarget({ ...global.document, visibilityState: 'visible' });
    let staleAttempts = 0;
    let attempts = 0;

    try {
      global.window = fakeWindow;
      global.document = fakeDocument;

      initKanjiKombatUI({
        syncSession: async () => {
          staleAttempts += 1;
          throw new Error('stale session should not drain');
        },
        __sessionSchedule: syncSchedule,
        showNarration: async () => {},
        playCorrectAnswerAudio: () => {},
      });
      initKanjiKombatUI({
        syncSession: async () => {
          attempts += 1;
          if (attempts % 2 === 1) throw new Error('offline');
          return { status: 'ok', confirmedThroughSeq: 999 };
        },
        __sessionSchedule: syncSchedule,
        showNarration: async () => {},
        playCorrectAnswerAudio: () => {},
      });
      initKanjiKombatUI({
        syncSession: async () => {
          attempts += 1;
          if (attempts % 2 === 1) throw new Error('offline');
          return { status: 'ok', confirmedThroughSeq: 999 };
        },
        __sessionSchedule: syncSchedule,
        showNarration: async () => {},
        playCorrectAnswerAudio: () => {},
      });

      assert.equal(fakeWindow.listenerCount('online'), 1);
      assert.equal(fakeDocument.listenerCount('visibilitychange'), 1);

      renderKanjiKombatAction({
        phase: 'combat',
        run: {
          mode: 'kanjiKombat',
          kanjiKombat: {
            pendingIntro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
          },
        },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      });
      await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
      await flushPromises(4);
      assert.equal(attempts, 1);

      fakeWindow.dispatch('online');
      await flushPromises(4);
      assert.equal(attempts, 2);
      assert.equal(staleAttempts, 0);

      renderKanjiKombatAction({
        phase: 'combat',
        run: {
          mode: 'kanjiKombat',
          kanjiKombat: {
            pendingIntro: { card: { id: 'hiragana:き', prompt: 'き', reading: 'き', answer: 'ki' } },
          },
        },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      });
      await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
      await flushPromises(4);
      assert.equal(attempts, 3);

      fakeDocument.visibilityState = 'hidden';
      fakeDocument.dispatch('visibilitychange');
      await flushPromises(4);
      assert.equal(attempts, 3);

      fakeDocument.visibilityState = 'visible';
      fakeDocument.dispatch('visibilitychange');
      await flushPromises(4);
      assert.equal(attempts, 4);
    } finally {
      if (originalWindow === undefined) {
        delete global.window;
      } else {
        global.window = originalWindow;
      }
      global.document = originalDocument;
    }
  });

  it('queues keep-going completion choices and advances locally before sync resolves', async () => {
    const calls = [];
    let resolveSyncFn;
    const syncPromise = new Promise(resolve => { resolveSyncFn = resolve; });
    let currentState = null;

    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        calls.push(['syncSession', entries[0].kind, entries[0].keepGoing, entries[0].promptId, entries[0].sequence]);
        return syncPromise;
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => {
        currentState = state;
        calls.push([
          'updateGameState',
          state.run.kanjiKombat.completionChoicePending === true,
          state.run.kanjiKombat.endlessMode === true,
        ]);
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      showNarration: async text => calls.push(['showNarration', text]),
      playCorrectAnswerAudio: () => {},
    });

    currentState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          completionChoicePending: true,
          promptBuffer: [{
            promptId: 'kkp_complete_queue',
            sequence: 4,
            kind: 'completePrompt',
            cardId: null,
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };

    renderKanjiKombatAction(currentState);
    const clickPromise = actionArea.querySelectorAll('.kanji-kombat-completion-action')[1].click();
    await flushPromises(4);

    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', false, true],
      ['syncSession', 'completionChoice', true, 'kkp_complete_queue', 4],
    ]);

    resolveSyncFn({
      status: 'ok',
      confirmedThroughSeq: 1,
      state: {
        phase: 'combat',
        run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
        combat: { actionCursor: { side: 'ally', index: 0 } },
      },
    });
    await clickPromise;
    await flushPromises(4);
  });

  it('submits completion choices with an action id and handles server finish later', async () => {
    const calls = [];
    const syncCalls = [];
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        syncCalls.push(entries);
        return {
          status: 'ok',
          confirmedThroughSeq: entries.at(-1).seq,
          state: { phase: 'combat', accepted: true },
          results: [{ combatEnded: true, victory: true }],
        };
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.phase, state.accepted === true, state.run?.kanjiKombat?.completionChoicePending ?? null]),
      finishCombatResult: result => calls.push(['finishCombatResult', result.victory]),
      refreshAction: () => calls.push(['unexpected-refresh']),
      updateUI: () => calls.push(['unexpected-update']),
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { completionChoicePending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });
    await actionArea.querySelectorAll('.kanji-kombat-completion-action')[0].click();
    await flushPromises(4);

    // Optimistic update: completionChoicePending cleared
    assert.deepEqual(calls[0], ['updateGameState', 'combat', false, false]);
    // Action had valid actionId
    assert.equal(syncCalls.length, 1);
    assert.match(syncCalls[0][0].actionId, /^kk_[a-z0-9]+_[a-z0-9]+$/i);
    assert.equal(syncCalls[0][0].kind, 'completionChoice');
    assert.equal(syncCalls[0][0].keepGoing, false);
    // Checkpoint fires finishCombatResult
    assert.deepEqual(calls.find(c => c[0] === 'finishCombatResult'), ['finishCombatResult', true]);
    assert.equal(calls.some(c => c[0] === 'unexpected-refresh'), false);
    assert.equal(calls.some(c => c[0] === 'unexpected-update'), false);
  });

  it('omits duplicate intro readings when the reading matches the prompt', () => {
    renderKanjiKombatIntro({ id: 'hiragana:お', prompt: 'お', reading: 'お', answer: 'o' }, { onChoice: () => {} });
    assert.doesNotMatch(actionArea.innerHTML, /kanji-kombat-reading/);
    assert.match(actionArea.innerHTML, /kanji-kombat-answer/);
  });

  it('ignores duplicate quiz answer taps while the first answer is in flight', async () => {
    const quiz = {
      prompt: 'あ',
      choices: [
        { id: 'a', answer: 'a' },
        { id: 'i', answer: 'i' },
      ],
    };
    let calls = 0;
    let resolveAnswer;
    const pending = new Promise(resolve => { resolveAnswer = resolve; });

    renderKanjiKombatQuiz(quiz, {
      onAnswer: async () => {
        calls++;
        await pending;
      },
    });

    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    const firstClick = first.click();
    first.click();

    assert.equal(calls, 1);
    assert.equal(first.disabled, true);

    resolveAnswer();
    await firstClick;
  });

  it('delegates quiz answers to the injected combat playback handler', async () => {
    const quiz = {
      prompt: '火',
      choices: [
        { id: 'fire', answer: 'Fire' },
        { id: 'water', answer: 'Water' },
      ],
    };
    const calls = [];

    renderKanjiKombatQuiz(quiz, {
      onAnswer: async answerId => {
        calls.push(answerId);
        return { handledByCombatLoop: true };
      },
    });

    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await first.click();

    assert.deepEqual(calls, ['fire']);
  });

  it('reenables quiz answer buttons when submission resolves without advancing UI', async () => {
    const submitted = [];

    initKanjiKombatUI({
      submitAnswer: async answerId => {
        submitted.push(answerId);
        return null;
      },
      updateGameState: () => submitted.push('unexpected-state'),
      updateUI: () => submitted.push('unexpected-update'),
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatAction({
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [
              { id: 'fire', answer: 'Fire' },
              { id: 'water', answer: 'Water' },
            ],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const buttons = actionArea.querySelectorAll('.kanji-kombat-choice');
    await buttons[0].click();

    assert.deepEqual(submitted, ['fire']);
    assert.equal(buttons.every(button => button.disabled === false), true);
  });

  it('uses submitAnswer as the owner of quiz result playback', async () => {
    const state = {
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          currentQuiz: {
            prompt: '火',
            choices: [{ id: 'fire', answer: 'Fire' }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    let updateUICalls = 0;
    const submitted = [];

    initKanjiKombatUI({
      submitAnswer: async answerId => {
        submitted.push(answerId);
        return { handledByCombatLoop: true };
      },
      updateGameState: () => {},
      updateUI: () => { updateUICalls += 1; },
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    assert.equal(renderKanjiKombatAction(state), true);
    const [first] = actionArea.querySelectorAll('.kanji-kombat-choice');
    await first.click();

    assert.deepEqual(submitted, ['fire']);
    assert.equal(updateUICalls, 0);
  });

  it('starts onboarding when pending and blocks quiz rendering', async () => {
    const calls = [];
    initKanjiKombatUI({
      showCidSprite: async () => calls.push(['showCidSprite']),
      hideCidSprite: async () => calls.push(['hideCidSprite']),
      showNarration: async (text, opts) => calls.push(['showNarration', text, opts]),
      forceHideNarration: () => calls.push(['forceHideNarration']),
      submitOnboarding: async (knowsHiragana, knowsKatakana) => {
        calls.push(['submitOnboarding', knowsHiragana, knowsKatakana]);
        return { state: { phase: 'combat' } };
      },
      updateGameState: state => calls.push(['updateGameState', state.phase]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => calls.push(['unexpected-tts']),
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    const started = startKanjiKombatOnboardingIfNeeded({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          onboardingPending: true,
          currentQuiz: {
            prompt: '火',
            choices: [{ id: 'fire', answer: 'Fire' }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(started, true);
    await flushPromises(4);
    assert.equal(calls[0][0], 'showCidSprite');
    assert.equal(actionArea.buttons[0].textContent, 'Yes, I know all of them');
    await actionArea.buttons[0].click();
    await flushPromises(4);
    assert.equal(actionArea.buttons[0].textContent, 'Yes, I know all of them');
    await actionArea.buttons[0].click();
    await flushPromises(8);

    assert.deepEqual(
      calls.find(call => call[0] === 'submitOnboarding'),
      ['submitOnboarding', true, true]
    );
    assert.deepEqual(
      calls.find(call => call[0] === 'updateGameState'),
      ['updateGameState', 'combat']
    );
    const narrationCalls = calls.filter(call => call[0] === 'showNarration');
    assert.deepEqual(narrationCalls.map(call => call[1]), [
      onboardingCopy.welcome,
      onboardingCopy.hiraganaQuestion,
      onboardingCopy.hiraganaKnown,
      onboardingCopy.katakanaQuestion,
      onboardingCopy.katakanaKnown,
      onboardingCopy.finalKanji,
    ]);
    assert.notEqual(narrationCalls[0][2]?.persistent, true);
    assert.equal(narrationCalls[1][2]?.persistent, true);
    assert.notEqual(narrationCalls[2][2]?.persistent, true);
    assert.equal(narrationCalls[3][2]?.persistent, true);
    assert.notEqual(narrationCalls[4][2]?.persistent, true);
    assert.notEqual(narrationCalls[5][2]?.persistent, true);
    assert.equal(calls.some(call => call[0] === 'hideCidSprite'), true);
    assert.equal(calls.some(call => call[0] === 'refreshAction'), true);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').length, 0);
  });

  it('submits false false and starts with hiragana when hiragana is unknown', async () => {
    const calls = await completeOnboardingWithChoices([1, 1]);

    assert.deepEqual(
      calls.find(call => call[0] === 'submitOnboarding'),
      ['submitOnboarding', false, false]
    );
    const narrationLines = calls
      .filter(call => call[0] === 'showNarration')
      .map(call => call[1]);
    assert.equal(narrationLines.includes(onboardingCopy.hiraganaUnknown), true);
    assert.equal(narrationLines.includes(onboardingCopy.katakanaUnknown), true);
    assert.equal(narrationLines.at(-1), onboardingCopy.finalHiragana);
  });

  it('submits true false and starts with katakana when only katakana is unknown', async () => {
    const calls = await completeOnboardingWithChoices([0, 1]);

    assert.deepEqual(
      calls.find(call => call[0] === 'submitOnboarding'),
      ['submitOnboarding', true, false]
    );
    const narrationLines = calls
      .filter(call => call[0] === 'showNarration')
      .map(call => call[1]);
    assert.equal(narrationLines.includes(onboardingCopy.hiraganaKnown), true);
    assert.equal(narrationLines.includes(onboardingCopy.katakanaUnknown), true);
    assert.equal(narrationLines.at(-1), onboardingCopy.finalKatakana);
  });

  it('does not start onboarding when the gate is absent', () => {
    const calls = [];
    initKanjiKombatUI({
      showCidSprite: () => calls.push(['showCidSprite']),
      hideCidSprite: () => calls.push(['hideCidSprite']),
      showNarration: () => calls.push(['showNarration']),
      submitOnboarding: () => calls.push(['submitOnboarding']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    const started = startKanjiKombatOnboardingIfNeeded({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { onboardingPending: false },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(started, false);
    assert.deepEqual(calls, []);
  });

  it('does not start onboarding outside combat phase', () => {
    const calls = [];
    initKanjiKombatUI({
      showCidSprite: () => calls.push(['showCidSprite']),
      hideCidSprite: () => calls.push(['hideCidSprite']),
      showNarration: () => calls.push(['showNarration']),
      submitOnboarding: () => calls.push(['submitOnboarding']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    const started = startKanjiKombatOnboardingIfNeeded(pendingOnboardingState({
      phase: 'exploration',
    }));

    assert.equal(started, false);
    assert.deepEqual(calls, []);
  });

  it('clears onboarding progress before updateUI retry after submit failure', async () => {
    const calls = [];
    const pendingState = {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { onboardingPending: true },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      initKanjiKombatUI({
        showCidSprite: async () => calls.push(['showCidSprite']),
        hideCidSprite: async () => calls.push(['hideCidSprite']),
        showNarration: async (text, opts) => calls.push(['showNarration', text, opts]),
        forceHideNarration: () => calls.push(['forceHideNarration']),
        submitOnboarding: async () => {
          calls.push(['submitOnboarding']);
          throw new Error('boom');
        },
        updateGameState: () => calls.push(['unexpected-state']),
        updateUI: () => {
          calls.push(['updateUI']);
          calls.push(['restartResult', startKanjiKombatOnboardingIfNeeded(pendingState)]);
        },
        refreshAction: () => calls.push(['unexpected-refresh']),
        playCorrectAnswerAudio: () => {},
        syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
        __sessionSchedule: syncSchedule,
      });

      assert.equal(startKanjiKombatOnboardingIfNeeded(pendingState), true);
      await flushPromises(4);
      await actionArea.buttons[0].click();
      await flushPromises(4);
      await actionArea.buttons[0].click();
      await flushPromises(12);

      assert.equal(calls.filter(call => call[0] === 'submitOnboarding').length, 1);
      assert.equal(calls.filter(call => call[0] === 'updateUI').length, 1);
      assert.deepEqual(
        calls.find(call => call[0] === 'restartResult'),
        ['restartResult', true]
      );
      assert.equal(calls.filter(call => call[0] === 'showCidSprite').length, 2);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('renders a buffered quiz before legacy quiz fields', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitAnswer: async (answerId, promptRef) => {
        calls.push(['submitAnswer', answerId, promptRef.promptId]);
      },
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId: 'kkp_quiz',
            sequence: 1,
            kind: 'quiz',
            cardId: 'hiragana:か',
            quiz: {
              cardId: 'hiragana:か',
              prompt: 'か',
              reading: 'か',
              choices: [
                { id: 'ka', answer: 'ka', correct: true },
                { id: 'ki', answer: 'ki', correct: false },
              ],
            },
          }],
          currentQuiz: {
            cardId: 'hiragana:あ',
            prompt: 'あ',
            choices: [{ id: 'a', answer: 'a', correct: true }],
          },
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt').textContent, 'か');
    await actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    assert.deepEqual(calls, [['submitAnswer', 'ka', 'kkp_quiz']]);
  });

  it('renders a buffered quiz before legacy completion and intro fields', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitAnswer: async (answerId, promptRef) => {
        calls.push(['submitAnswer', answerId, promptRef.promptId]);
      },
      playCorrectAnswerAudio: () => {},
      syncSession: async () => ({ status: 'ok', confirmedThroughSeq: 999 }),
      __sessionSchedule: syncSchedule,
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          completionChoicePending: true,
          pendingIntro: {
            card: { id: 'hiragana:あ', prompt: 'あ', reading: 'あ', answer: 'a' },
          },
          promptBuffer: [{
            promptId: 'kkp_quiz_priority',
            sequence: 3,
            kind: 'quiz',
            cardId: 'hiragana:く',
            quiz: {
              cardId: 'hiragana:く',
              prompt: 'く',
              reading: 'く',
              choices: [{ id: 'ku', answer: 'ku', correct: true }],
            },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt').textContent, 'く');
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-choice').length, 1);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-intro-action').length, 0);
    assert.equal(actionArea.querySelectorAll('.kanji-kombat-completion-action').length, 0);

    await actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    assert.deepEqual(calls, [['submitAnswer', 'ku', 'kkp_quiz_priority']]);
  });

  it('locally consumes buffered intro prompts and renders the next prompt before sync resolves', async () => {
    const calls = [];
    let resolveSyncFn;
    const syncPromise = new Promise(resolve => { resolveSyncFn = resolve; });
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        calls.push(['syncSession', entries[0].kind, entries[0].cardId, entries[0].promptId, entries[0].sequence]);
        return syncPromise;
      },
      __sessionSchedule: syncSchedule,
      updateGameState: state => calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              source: 'noDueBatch',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const clickPromise = actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    assert.deepEqual(calls.slice(0, 2), [
      ['updateGameState', 'kkp_next'],
      ['syncSession', 'intro', 'hiragana:か', 'kkp_intro', 1],
    ]);

    resolveSyncFn({ status: 'ok', confirmedThroughSeq: 1, state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } } });
    await clickPromise;
    await flushPromises(2);
  });

  it('does not restore a consumed prompt when refill resolves before sync', async () => {
    const calls = [];
    let resolveSyncFn;
    let resolveStaleRefill;
    let syncResolved = false;
    let actionId = null;
    const syncPromise = new Promise(resolve => { resolveSyncFn = resolve; });
    const staleRefillPromise = new Promise(resolve => { resolveStaleRefill = resolve; });
    const acceptedState = {
      phase: 'combat',
      run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [] } },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    initKanjiKombatUI({
      syncSession: async ({ entries }) => {
        actionId = entries[0].actionId;
        calls.push(['syncSession', entries[0].promptId]);
        return syncPromise;
      },
      __sessionSchedule: syncSchedule,
      refillPromptBuffer: async () => {
        calls.push(['refill', syncResolved]);
        if (!syncResolved) return staleRefillPromise;
        return { state: acceptedState };
      },
      updateGameState: state => {
        calls.push(['updateGameState', state.run.kanjiKombat.promptBuffer[0]?.promptId || null]);
        renderKanjiKombatAction(state);
      },
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_race',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            {
              promptId: 'kkp_next_race',
              sequence: 2,
              kind: 'quiz',
              cardId: 'hiragana:き',
              quiz: {
                cardId: 'hiragana:き',
                prompt: 'き',
                reading: 'き',
                choices: [{ id: 'ki', answer: 'ki', correct: true }],
              },
            },
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    const clickPromise = actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    try {
      await flushPromises(2);
      resolveStaleRefill({
        state: {
          phase: 'combat',
          run: {
            mode: 'kanjiKombat',
            kanjiKombat: {
              promptBuffer: [{
                promptId: 'kkp_intro_race',
                sequence: 1,
                kind: 'intro',
                cardId: 'hiragana:か',
                intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
              }],
            },
          },
          combat: { actionCursor: { side: 'ally', index: 0 } },
        },
      });
      await flushPromises(4);

      assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');
      assert.equal(
        calls.some(call => call[0] === 'updateGameState' && call[1] === 'kkp_intro_race'),
        false
      );
    } finally {
      syncResolved = true;
      resolveSyncFn({ status: 'ok', confirmedThroughSeq: 1, state: acceptedState });
      await clickPromise;
      await flushPromises(2);
    }
  });

  it('does not restore a quiz after an older refill resolves after the quiz answer commits', async () => {
    const calls = [];
    let resolveRefill;
    let answerCommitted = false;
    let currentState = null;
    const refillPromise = new Promise(resolve => { resolveRefill = resolve; });
    const quizPrompt = {
      promptId: 'kkp_quiz_slow_refill',
      sequence: 2,
      kind: 'quiz',
      cardId: 'hiragana:き',
      quiz: {
        cardId: 'hiragana:き',
        prompt: 'き',
        reading: 'き',
        choices: [{ id: 'ki', answer: 'ki', correct: true }],
      },
    };
    const quizState = {
      phase: 'combat',
      run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [quizPrompt] } },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    const answeredState = {
      phase: 'combat',
      run: { mode: 'kanjiKombat', kanjiKombat: { promptBuffer: [], currentQuiz: null } },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
    initKanjiKombatUI({
      syncSession: async ({ entries }) => ({
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
        state: quizState,
      }),
      __sessionSchedule: syncSchedule,
      refillPromptBuffer: async () => {
        calls.push(['refill']);
        return refillPromise;
      },
      submitAnswer: async (_answerId, promptRef = {}) => {
        answerCommitted = true;
        calls.push(['submitAnswer', promptRef.promptId]);
        currentState = answeredState;
        actionArea.replaceChildren();
        return { handledByCombatLoop: true };
      },
      updateGameState: state => {
        currentState = state;
        const head = state.run?.kanjiKombat?.promptBuffer?.[0]?.promptId || null;
        calls.push(['updateGameState', head, answerCommitted]);
        if (!renderKanjiKombatAction(state)) actionArea.replaceChildren();
      },
      getGameState: () => currentState,
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [
            {
              promptId: 'kkp_intro_slow_refill',
              sequence: 1,
              kind: 'intro',
              cardId: 'hiragana:か',
              intro: { card: { id: 'hiragana:か', prompt: 'か', reading: 'か', answer: 'ka' } },
            },
            quizPrompt,
          ],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();
    await flushPromises(4);
    assert.equal(actionArea.querySelector('.kanji-kombat-prompt')?.textContent, 'き');

    await actionArea.querySelectorAll('.kanji-kombat-choice')[0].click();
    await flushPromises(2);
    assert.equal(actionArea.querySelector('.kanji-kombat-prompt'), null);

    resolveRefill({ state: quizState });
    await flushPromises(4);

    assert.equal(actionArea.querySelector('.kanji-kombat-prompt'), null);
    assert.equal(
      calls.some(call =>
        call[0] === 'updateGameState'
        && call[1] === 'kkp_quiz_slow_refill'
        && call[2] === true),
      false
    );
  });

  function introPrompt(index) {
    return {
      promptId: `kkp_intro_${index}`,
      sequence: index + 1,
      kind: 'intro',
      cardId: `hiragana:${index}`,
      intro: { card: { id: `hiragana:${index}`, prompt: 'か', reading: 'か', answer: 'ka' } },
    };
  }

  function combatStateWithPromptBuffer(promptBuffer) {
    return {
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: { promptBuffer },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    };
  }

  it('requests a single-flight refill when the local prompt buffer drops below ten', async () => {
    const calls = [];
    const promptBuffer = Array.from({ length: 10 }, (_, index) => introPrompt(index));
    const remainingBuffer = promptBuffer.slice(1);
    initKanjiKombatUI({
      syncSession: async ({ entries }) => ({
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
      }),
      __sessionSchedule: syncSchedule,
      refillPromptBuffer: async () => {
        calls.push(['refill']);
        return { state: combatStateWithPromptBuffer(remainingBuffer) };
      },
      updateGameState: () => calls.push(['updateGameState']),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction(combatStateWithPromptBuffer(promptBuffer));
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(4);

    assert.equal(calls.filter(call => call[0] === 'refill').length, 1);
  });

  it('does not request a refill when consuming the local prompt buffer leaves ten prompts', async () => {
    const calls = [];
    const promptBuffer = Array.from({ length: 11 }, (_, index) => introPrompt(index));
    const remainingBuffer = promptBuffer.slice(1);
    initKanjiKombatUI({
      syncSession: async ({ entries }) => ({
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
      }),
      __sessionSchedule: syncSchedule,
      refillPromptBuffer: async () => {
        calls.push(['refill']);
        return { state: combatStateWithPromptBuffer(remainingBuffer) };
      },
      updateGameState: () => calls.push(['updateGameState']),
      refreshAction: () => calls.push(['refreshAction']),
      updateUI: () => calls.push(['updateUI']),
      playCorrectAnswerAudio: () => {},
    });

    renderKanjiKombatAction(combatStateWithPromptBuffer(promptBuffer));
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();
    await flushPromises(4);

    assert.equal(calls.filter(call => call[0] === 'refill').length, 0);
  });

  it('keeps prompt buffer refill single-flight across multiple below-threshold opportunities', async () => {
    const calls = [];
    let resolveRefill;
    const refillPromise = new Promise(resolve => { resolveRefill = resolve; });
    initKanjiKombatUI({
      syncSession: async ({ entries }) => ({
        status: 'ok',
        confirmedThroughSeq: entries.at(-1).seq,
        state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } },
      }),
      __sessionSchedule: syncSchedule,
      refillPromptBuffer: async () => {
        calls.push(['refill']);
        return refillPromise;
      },
      updateGameState: () => calls.push(['updateGameState']),
      refreshAction: () => calls.push(['refreshAction']),
      playCorrectAnswerAudio: () => {},
    });

    const gameState = promptId => ({
      phase: 'combat',
      run: {
        mode: 'kanjiKombat',
        kanjiKombat: {
          promptBuffer: [{
            promptId,
            sequence: 1,
            kind: 'intro',
            cardId: `hiragana:${promptId}`,
            intro: { card: { id: `hiragana:${promptId}`, prompt: 'か', reading: 'か', answer: 'ka' } },
          }],
        },
      },
      combat: { actionCursor: { side: 'ally', index: 0 } },
    });

    renderKanjiKombatAction(gameState('kkp_intro_first'));
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    renderKanjiKombatAction(gameState('kkp_intro_second'));
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[1].click();

    assert.equal(calls.filter(call => call[0] === 'refill').length, 1);

    resolveRefill({ state: { phase: 'combat', run: { kanjiKombat: { promptBuffer: [] } } } });
    await flushPromises(4);
  });
});
