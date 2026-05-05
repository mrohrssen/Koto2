import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor(el) { this.el = el; }
  add(...classes) {
    const values = new Set(this.el.className.split(/\s+/).filter(Boolean));
    for (const cls of classes) values.add(cls);
    this.el.className = Array.from(values).join(' ');
  }
  contains(cls) {
    return this.el.className.split(/\s+/).includes(cls);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.disabled = false;
    this.textContent = '';
    this.classList = new FakeClassList(this);
    this._innerHTML = '';
    this._parsedElements = null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];
    this._parsedElements = null;
  }

  get innerHTML() {
    return this._innerHTML + this.children.map(child => child.outerHTML).join('');
  }

  get outerHTML() {
    const classAttr = this.className ? ` class="${this.className}"` : '';
    const disabledAttr = this.disabled ? ' disabled' : '';
    return `<${this.tagName}${classAttr}${disabledAttr}>${this.innerHTML || this.textContent}</${this.tagName}>`;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  click() {
    for (const handler of this.listeners.click || []) {
      handler({ target: this, currentTarget: this, stopPropagation: () => {} });
    }
  }

  insertAdjacentHTML(position, html) {
    if (position !== 'beforeend') throw new Error(`Unsupported insertAdjacentHTML position: ${position}`);
    const target = this.parentNode || this;
    target._innerHTML += String(html || '');
    target._parsedElements = null;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  parseInnerHtmlElements() {
    if (this._parsedElements) return this._parsedElements;
    this._parsedElements = [];
    const elementRe = /<([a-zA-Z0-9-]+)([^>]*\sclass="([^"]+)"[^>]*)>/g;
    let match;
    while ((match = elementRe.exec(this._innerHTML))) {
      const [, tagName, attrs, className] = match;
      const child = new FakeElement(tagName);
      child.parentNode = this;
      child.className = className;
      child.disabled = /\sdisabled(?:\s|>|$)/.test(attrs);
      this._parsedElements.push(child);
    }
    return this._parsedElements;
  }

  querySelectorAll(selector) {
    if (!selector.startsWith('.')) return [];
    const cls = selector.slice(1);
    const matches = [];
    const visit = node => {
      if (node.className.split(/\s+/).includes(cls)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this);
    for (const child of this.parseInnerHtmlElements()) {
      if (child.className.split(/\s+/).includes(cls)) matches.push(child);
    }
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

let actionArea;
let attachedLookupContainer = null;
let playedAudio = null;
let translationResponse = { ok: true, translation: 'Wait!', cached: false };
let translatedTexts = [];

globalThis.document = {
  createElement: tagName => new FakeElement(tagName),
  getElementById: id => (id === 'action-area' ? actionArea : null),
};

await mock.module('../../../public/js/ui/dialogue-word-lookup.js', {
  namedExports: {
    attachWordClickHandlers: container => { attachedLookupContainer = container; },
    hidePopup: () => {},
  },
});

await mock.module('../../../public/js/tts.js', {
  namedExports: {
    playDialogueAudio: (userId, audioKey) => { playedAudio = { userId, audioKey }; },
  },
});

await mock.module('../../../public/js/api.js', {
  namedExports: {
    postKnownWordExposures: async () => ({ ok: true }),
    translateDialogue: async (text) => {
      translatedTexts.push(text);
      return translationResponse;
    }
  }
});

const { showNpcDialogueCard, renderDialogueTokenRows, getDialogueSourceText } = await import('../../../public/js/ui/npc-dialogue-card.js');

describe('npc dialogue card', () => {
  beforeEach(() => {
    actionArea = new FakeElement('section');
    attachedLookupContainer = null;
    playedAudio = null;
    translationResponse = { ok: true, translation: 'Wait!', cached: false };
    translatedTexts = [];
  });

  it('renders tokenized dialogue in shared romaji/kana/english rows', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' },
        { surface: 'だけど', baseForm: 'だけど', reading: 'だけど', pos: 'particle' },
        { surface: 'わくわくする', baseForm: 'わくわくする', reading: 'わくわくする', meaning: 'get excited', pos: 'verb' },
        { surface: 'ね！', baseForm: 'ね', reading: 'ね', pos: 'particle' },
      ],
      knownWords: new Set(['だけど', 'ね']),
      overrides: {},
      useKanji: false,
    });

    assert.match(html, /npc-dialogue-line-grid/);
    assert.match(html, /npc-dialogue-romaji-row/);
    assert.match(html, /npc-dialogue-jp-row/);
    assert.match(html, /npc-dialogue-en-row/);
    assert.match(html, /data-base="不安"/);
    assert.match(html, />anxiety</);
  });

  it('keeps sentence-ending punctuation attached to the preceding word cell', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: 'いま', baseForm: '今', reading: 'いま', meaning: 'now', pos: 'noun' },
        { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
        { surface: '怖い', baseForm: '怖い', reading: 'こわい', meaning: 'scary', pos: 'adjective' },
        { surface: '行こう', baseForm: '行く', reading: 'いこう', meaning: 'go', pos: 'verb' },
        { surface: '。', pos: 'punctuation' },
      ],
      knownWords: new Set(['は']),
      overrides: {},
      useKanji: false,
    });

    assert.equal((html.match(/npc-dialogue-line-grid/g) || []).length, 1);
    assert.match(html, /いこう。<\/span>/);
    assert.doesNotMatch(html, /npc-dialogue-cell jp-punct/);
  });

  it('resolves only when Continue is clicked', async () => {
    const promise = showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    const [continueButton] = actionArea.querySelectorAll('.npc-dialogue-continue');
    continueButton.click();

    await promise;
    assert.equal(actionArea.innerHTML, '');
  });

  it('enables Translate for tokenized dialogue and keeps Learn disabled', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    const utilityButtons = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(utilityButtons.length, 2);
    assert.equal(utilityButtons[0].disabled, false);
    assert.equal(utilityButtons[1].disabled, true);
  });

  it('hardcodes the temporary default headshot for every speaker', () => {
    showNpcDialogueCard({
      speaker: 'Cat',
      speakerPortrait: '/assets/sprites/creatures/neko.webp',
      portraitKind: 'creature',
      text: 'まって！',
    });

    assert.match(actionArea.innerHTML, /\/assets\/dialogue\/default-headshot\.png/);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-portrait--creature/);
    assert.doesNotMatch(actionArea.innerHTML, /\/assets\/sprites\/creatures\/neko\.webp/);
  });

  it('attaches lookup handlers for tokenized dialogue', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    assert.equal(attachedLookupContainer?.className.includes('npc-dialogue-text'), true);
  });

  it('escapes plain fallback text and skips lookup attachment', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      text: '<img src=x onerror=alert(1)>',
    });

    assert.match(actionArea.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.equal(attachedLookupContainer, null);
  });

  it('plays existing dialogue audio when the audio button is clicked', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      audio: { userId: 'user-1', key: 'line-1' },
      knownWords: new Set(),
    });

    const [audioButton] = actionArea.querySelectorAll('.npc-dialogue-tool');
    audioButton.click();

    assert.deepEqual(playedAudio, { userId: 'user-1', audioKey: 'line-1' });
  });

  it('derives exact Japanese source text from token surfaces', () => {
    const source = getDialogueSourceText([
      { surface: 'いま', baseForm: '今', reading: 'いま', pos: 'noun' },
      { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
      { surface: '怖い', baseForm: '怖い', reading: 'こわい', pos: 'adjective' },
      { surface: '。', pos: 'punctuation' },
    ]);

    assert.equal(source, 'いまは怖い。');
  });

  it('opens translation bottom sheet without resolving dialogue', async () => {
    let resolved = false;
    const promise = showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    }).then(() => { resolved = true; });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    const [continueButton] = actionArea.querySelectorAll('.npc-dialogue-continue');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(resolved, false);
    assert.deepEqual(translatedTexts, ['待って！']);
    assert.match(actionArea.innerHTML, /npc-dialogue-translation-sheet/);
    assert.match(actionArea.innerHTML, /Wait!/);

    continueButton.click();
    await promise;
  });

  it('shows romaji pronunciation for translated tokenized dialogue when kanji mode is disabled', async () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      useKanji: false,
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /npc-dialogue-translation-source/);
    assert.match(actionArea.innerHTML, /npc-dialogue-romaji-row/);
    assert.match(actionArea.innerHTML, />matsu</);
  });

  it('shows hiragana pronunciation for translated tokenized dialogue when kanji mode is enabled', async () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      useKanji: true,
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    const translationSourceHtml = actionArea.innerHTML.slice(actionArea.innerHTML.indexOf('npc-dialogue-translation-source'));
    assert.match(actionArea.innerHTML, /npc-dialogue-translation-source/);
    assert.match(translationSourceHtml, /npc-dialogue-romaji-row/);
    assert.match(translationSourceHtml, />まつ</);
    assert.doesNotMatch(translationSourceHtml, />matsu</);
  });

  it('renders unavailable translation state with retry control', async () => {
    translationResponse = { ok: false, error: 'translation_unavailable' };

    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /Translation is unavailable right now/);
    assert.match(actionArea.innerHTML, /Try again/);
  });

  it('disables Translate for fallback HTML without source text', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      html: '<span>Hello</span>',
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(translateButton.disabled, true);
  });
});
