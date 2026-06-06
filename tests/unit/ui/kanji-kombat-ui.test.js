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
    });
  });

  async function flushPromises(times = 1) {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
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

  it('continues after the completion prompt without ending combat', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (keepGoing, options = {}) => {
        calls.push(['submitCompletionChoice', keepGoing]);
        return { state: { phase: 'combat' }, actionId: options.actionId };
      },
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat'],
      ['submitCompletionChoice', true],
      ['updateGameState', 'combat'],
      ['refreshAction'],
    ]);
  });

  it('finishes combat after the completion prompt is declined', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (keepGoing, options = {}) => {
        calls.push(['submitCompletionChoice', keepGoing]);
        return { state: { phase: 'combat' }, combatEnded: true, victory: true, actionId: options.actionId };
      },
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat'],
      ['submitCompletionChoice', false],
      ['updateGameState', 'combat'],
      ['finishCombatResult', true],
    ]);
  });

  it('refreshes the combat action after intro choice state updates', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (cardId, choice, options = {}) => {
        calls.push(['submitIntro', cardId, choice]);
        return { state: { phase: 'combat' }, actionId: options.actionId };
      },
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat'],
      ['submitIntro', 'hiragana:か', 'unknown'],
      ['updateGameState', 'combat'],
      ['refreshAction'],
    ]);
  });

  it('submits intro choices with an action id and clears the choice locally', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (cardId, choice, options = {}) => {
        calls.push(['submitIntro', cardId, choice, /^run_[a-z0-9]+_[a-z0-9]+$/i.test(options.actionId)]);
        return { status: 'accepted', actionId: options.actionId, state: { phase: 'combat', accepted: true } };
      },
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false, null],
      ['submitIntro', 'hiragana:ka', 'known', true],
      ['updateGameState', 'combat', true, null],
      ['refreshAction'],
    ]);
    assert.equal(actionArea.innerHTML, '');
  });

  it('rolls back corrected intro choices and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (_cardId, _choice, options = {}) => ({
        status: 'corrected',
        actionId: options.actionId,
        authoritativeState: { phase: 'combat', run: { kanjiKombat: { pendingIntro: { card: { id: 'hiragana:ka' } } } },
        },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, !!state.run?.kanjiKombat?.pendingIntro]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
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
    await actionArea.querySelectorAll('.kanji-kombat-intro-action')[0].click();

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('rolls back stale accepted intro responses and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async (_cardId, _choice, _options = {}) => ({
        status: 'accepted',
        actionId: 'run_other_stale',
        state: { phase: 'combat', accepted: true },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, !!state.run?.kanjiKombat?.pendingIntro]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('rolls back thrown intro choice errors and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitIntro: async () => {
        throw new Error('network');
      },
      updateGameState: state => calls.push(['updateGameState', state.phase, !!state.run?.kanjiKombat?.pendingIntro]),
      updateUI: () => calls.push(['updateUI']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('submits completion choices with an action id and waits for server finish handling', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (keepGoing, options = {}) => {
        calls.push(['submitCompletionChoice', keepGoing, /^run_[a-z0-9]+_[a-z0-9]+$/i.test(options.actionId)]);
        return { status: 'accepted', actionId: options.actionId, state: { phase: 'combat', accepted: true }, combatEnded: true, victory: true };
      },
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false, false],
      ['submitCompletionChoice', false, true],
      ['updateGameState', 'combat', true, null],
      ['finishCombatResult', true],
    ]);
    assert.equal(actionArea.innerHTML, '');
  });

  it('rolls back corrected completion choices and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async (_keepGoing, options = {}) => ({
        status: 'corrected',
        actionId: options.actionId,
        authoritativeState: { phase: 'combat', run: { kanjiKombat: { completionChoicePending: true } } },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, state.run?.kanjiKombat?.completionChoicePending === true]),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
      showNarration: async text => calls.push(['showNarration', text]),
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('rolls back stale accepted completion responses and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async () => ({
        status: 'accepted',
        actionId: 'run_other_stale',
        state: { phase: 'combat', accepted: true },
      }),
      updateGameState: state => calls.push(['updateGameState', state.phase, state.run?.kanjiKombat?.completionChoicePending === true]),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
  });

  it('rolls back thrown completion choice errors and shows retry copy', async () => {
    const calls = [];
    initKanjiKombatUI({
      submitCompletionChoice: async () => {
        throw new Error('network');
      },
      updateGameState: state => calls.push(['updateGameState', state.phase, state.run?.kanjiKombat?.completionChoicePending === true]),
      updateUI: () => calls.push(['updateUI']),
      finishCombatResult: () => calls.push(['unexpected-finish']),
      refreshAction: () => calls.push(['unexpected-refresh']),
      showNarration: async text => calls.push(['showNarration', text]),
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

    assert.deepEqual(calls, [
      ['updateGameState', 'combat', false],
      ['updateGameState', 'combat', true],
      ['showNarration', 'Kanji Kombat choice did not save. Please try again.'],
      ['updateUI'],
    ]);
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
      submitIntro: async () => ({}),
      updateGameState: () => {},
      updateUI: () => { updateUICalls += 1; },
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
});
