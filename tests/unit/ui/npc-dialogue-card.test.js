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
let attachedLookupOptions = null;
let playedAudio = null;
let translationResponse = { ok: true, translation: 'Wait!', cached: false };
let translatedRequests = [];
const DEFAULT_LEARN_RESPONSE = {
  ok: true,
  lesson: {
    schemaVersion: 2,
    sourceText: '花は森で光を見た。',
    pronunciation: { kana: 'はな は もり で ひかり を みた', romaji: 'hana wa mori de hikari o mita' },
    translation: 'Flower saw a light in the forest.',
    breakdown: [
      { kind: 'entity', text: '花', reading: 'はな', meaning: 'Flower, the creature', explanation: 'In this Koto line, 花 refers to the creature named Flower. In ordinary Japanese, 花 means flower / blossom.' },
      { kind: 'particle', text: 'は', reading: 'わ', meaning: 'topic marker', explanation: 'After Flower, は marks who the sentence is about.' },
      { kind: 'phrase', text: '森で', reading: 'もりで', meaning: 'in the forest', explanation: '森 means forest. で marks the place where the action happens.' },
      { kind: 'phrase', text: '光を', reading: 'ひかりを', meaning: 'a light', explanation: '光 is what was seen. を marks the direct object.' },
      { kind: 'verb', text: '見た', reading: 'みた', meaning: 'saw', explanation: '見た is the past form of 見る, to see.' }
    ],
    grammarHints: [{ title: 'Verb goes last.', body: 'Japanese sentences put the verb at the end. Read to the end first to find 見た, saw.' }],
    otherTips: [{ title: 'Entity vs ordinary noun.', body: 'In this Koto sentence, 花 is the creature Flower. In ordinary Japanese, 花 means flower / blossom.' }]
  },
  crystals: { balance: 85, cost: 15 },
  cached: false
};
let learnResponse = JSON.parse(JSON.stringify(DEFAULT_LEARN_RESPONSE));
let learnRequests = [];

globalThis.document = {
  createElement: tagName => new FakeElement(tagName),
  getElementById: id => (id === 'action-area' ? actionArea : null),
};

await mock.module('../../../public/js/ui/dialogue-word-lookup.js', {
  namedExports: {
    attachWordClickHandlers: (container, options) => {
      attachedLookupContainer = container;
      attachedLookupOptions = options;
    },
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
    translateDialogue: async (text, entities = [], idempotencyKey = '') => {
      translatedRequests.push({ text, entities, idempotencyKey });
      return translationResponse;
    },
    learnDialogue: async (text, tokens = [], entities = [], idempotencyKey = '') => {
      learnRequests.push({ text, tokens, entities, idempotencyKey });
      return learnResponse;
    }
  }
});

const {
  showNpcDialogueCard,
  renderDialogueTokenRows,
  getDialogueSourceText,
  resolvePortraitSrc,
} = await import('../../../public/js/ui/npc-dialogue-card.js');

describe('npc dialogue card', () => {
  beforeEach(() => {
    actionArea = new FakeElement('section');
    attachedLookupContainer = null;
    attachedLookupOptions = null;
    playedAudio = null;
    translationResponse = { ok: true, translation: 'Wait!', cached: false };
    translatedRequests = [];
    learnResponse = JSON.parse(JSON.stringify(DEFAULT_LEARN_RESPONSE));
    learnRequests = [];
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

  it('keeps clicked-word audio text on the token surface, not the dictionary base', () => {
    const html = renderDialogueTokenRows({
      tokens: [{ surface: '見た', baseForm: '見る', reading: 'みた', meaning: 'see', pos: 'verb' }],
      knownWords: new Set(),
      overrides: {},
      useKanji: false,
    });

    assert.match(html, /data-base="見る"/);
    assert.match(html, /data-audio-text="見た"/);
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

  it('attaches sentence punctuation to a preceding surface-only particle cell', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: '私', base: '私', reading: 'わたし', meaning: 'my', pos: 'Pronoun' },
        { surface: 'の' },
        { surface: '名前', base: '名前', reading: 'なまえ', meaning: 'name', pos: 'Noun' },
        { surface: 'は' },
        { surface: '？' },
      ],
      knownWords: new Set(),
      overrides: { '私': 'my' },
      useKanji: false,
    });

    assert.equal((html.match(/npc-dialogue-line-grid/g) || []).length, 1);
    assert.match(html, /<span class="npc-dialogue-cell jp-punct">は？<\/span>/);
    assert.doesNotMatch(html, /<span class="npc-dialogue-cell jp-punct">？<\/span>/);
  });

  it('attaches exclamation punctuation after the surface-only te particle', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: '待っ', base: '待つ', reading: 'まっ', meaning: 'wait', pos: 'Verb' },
        { surface: 'て' },
        { surface: '！' },
      ],
      knownWords: new Set(),
      overrides: {},
      useKanji: false,
    });

    assert.equal((html.match(/npc-dialogue-line-grid/g) || []).length, 1);
    assert.match(html, /<span class="npc-dialogue-cell jp-punct">て！<\/span>/);
    assert.doesNotMatch(html, /<span class="npc-dialogue-cell jp-punct">！<\/span>/);
  });

  it('keeps punctuation with the preceding word across dialogue pages', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [
        { surface: '一', baseForm: '一', reading: 'いち', meaning: 'one', pos: 'noun' },
        { surface: '二', baseForm: '二', reading: 'に', meaning: 'two', pos: 'noun' },
        { surface: '三', baseForm: '三', reading: 'さん', meaning: 'three', pos: 'noun' },
        { surface: '四', baseForm: '四', reading: 'よん', meaning: 'four', pos: 'noun' },
        { surface: '五', baseForm: '五', reading: 'ご', meaning: 'five', pos: 'noun' },
        { surface: '六', baseForm: '六', reading: 'ろく', meaning: 'six', pos: 'noun' },
        { surface: '七', baseForm: '七', reading: 'なな', meaning: 'seven', pos: 'noun' },
        { surface: '八', baseForm: '八', reading: 'はち', meaning: 'eight', pos: 'noun' },
        { surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' },
        { surface: '。', pos: 'punctuation' },
      ],
      knownWords: new Set(),
    });

    assert.match(actionArea.innerHTML, /data-base="待つ"[^>]*>まつ。<\/span>/);
    assert.doesNotMatch(actionArea.innerHTML, /<span class="npc-dialogue-cell jp-punct">。<\/span>/);
  });

  it('splits visually wide dialogue before it overflows the card text column', () => {
    const html = renderDialogueTokenRows({
      tokens: [
        { surface: 'こんにちは', baseForm: 'こんにちは', reading: 'こんにちは', meaning: 'hello', pos: 'interjection' },
        { surface: 'ありがとう', baseForm: 'ありがとう', reading: 'ありがとう', meaning: 'thank you', pos: 'interjection' },
        { surface: '大丈夫', baseForm: '大丈夫', reading: 'だいじょうぶ', meaning: 'okay', pos: 'adjective' },
        { surface: '一緒に', baseForm: '一緒に', reading: 'いっしょに', meaning: 'together', pos: 'adverb' },
      ],
      knownWords: new Set(),
      overrides: {},
      useKanji: false,
    });

    assert.equal((html.match(/npc-dialogue-line-grid/g) || []).length, 2);
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

  it('enables Translate and Learn for tokenized dialogue', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    const utilityButtons = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(utilityButtons.length, 2);
    assert.equal(utilityButtons[0].disabled, false);
    assert.equal(utilityButtons[1].disabled, false);
  });

  it('uses the creature sprite as the portrait for creature speakers', () => {
    showNpcDialogueCard({
      speaker: 'Cat',
      speakerPortrait: '/assets/sprites/creatures/neko.webp',
      portraitKind: 'creature',
      text: 'まって！',
    });

    assert.match(actionArea.innerHTML, /npc-dialogue-portrait--creature/);
    assert.match(actionArea.innerHTML, /\/assets\/sprites\/creatures\/neko\.webp/);
    assert.doesNotMatch(actionArea.innerHTML, /\/assets\/dialogue\/default-headshot\.png/);
  });

  it('resolves NPC dialogue headshots from ids and known names', () => {
    assert.equal(resolvePortraitSrc({ speakerId: 'kodomo' }), '/assets/dialogue/headshots/kodomo.webp?v=20260508-npc-headshots');
    assert.equal(resolvePortraitSrc({ speaker: 'Shrine Fox' }), '/assets/dialogue/headshots/shrine_fox.webp?v=20260508-npc-headshots');
    assert.equal(resolvePortraitSrc({ speaker: 'Cid' }), '/assets/dialogue/headshots/cid.webp?v=20260508-npc-headshots');
    assert.equal(resolvePortraitSrc({ speaker: 'You' }), '/assets/dialogue/headshots/you-male.webp?v=20260508-npc-headshots');
  });

  it('falls back to the default portrait for unknown NPC speakers', () => {
    assert.equal(resolvePortraitSrc({ speaker: 'Unknown Traveler' }), '/assets/dialogue/default-headshot.png?v=20260501-headshot');
  });

  it('attaches lookup handlers for tokenized dialogue', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    assert.equal(attachedLookupContainer?.className.includes('npc-dialogue-text'), true);
  });

  it('passes cached dialogue word-audio context to lookup handlers', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '森', baseForm: '森', reading: 'もり', meaning: 'forest', pos: 'noun' }],
      audio: { userId: 'u1', key: 'line123.wav', speakerId: 46 },
      knownWords: new Set(),
    });

    assert.deepEqual(attachedLookupOptions, {
      wordAudio: { userId: 'u1', speakerId: 46 }
    });
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
    assert.equal(translatedRequests.length, 1);
    assert.deepEqual(translatedRequests[0].text, '待って！');
    assert.deepEqual(translatedRequests[0].entities, []);
    assert.match(translatedRequests[0].idempotencyKey, /^translate:/);
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

  it('hides utility buttons for fallback HTML without source text', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      html: '<span>Hello</span>',
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(translateButton, undefined);
  });

  it('sends protected speaker entity context with translation requests', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower', pos: 'noun', entity: true },
        { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
        { surface: '強い', baseForm: '強い', reading: 'つよい', meaning: 'strong', pos: 'adjective' },
        { surface: '！', pos: 'punctuation' }
      ],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(translatedRequests.length, 1);
    assert.deepEqual(translatedRequests[0], {
      text: '花は強い！',
      entities: [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }],
      idempotencyKey: translatedRequests[0].idempotencyKey
    });
    assert.match(translatedRequests[0].idempotencyKey, /^translate:/);
  });

  it('renders crystal costs inside Translate and Learn buttons', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      useKanji: true
    });

    assert.match(actionArea.innerHTML, /class="crystal-cost"/);
    assert.match(actionArea.innerHTML, /crystal-cost-number">5</);
    assert.match(actionArea.innerHTML, /crystal-cost-number">15</);
    assert.match(actionArea.innerHTML, /npc-dialogue-jp-line[\s\S]*crystal-cost[\s\S]*訳す/);
    assert.match(actionArea.innerHTML, /npc-dialogue-jp-line[\s\S]*crystal-cost[\s\S]*学ぶ/);
    assert.match(actionArea.innerHTML, /npc-dialogue-btn-jp">進む</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">翻訳する</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">次へ進む</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-book-icon/);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-learn-icon/);
  });

  it('uses hiragana utility labels when kanji mode is disabled', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待つ', baseForm: '待つ', reading: 'まつ', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
      useKanji: false
    });

    assert.match(actionArea.innerHTML, /npc-dialogue-btn-roman">yakusu</);
    assert.match(actionArea.innerHTML, /npc-dialogue-btn-jp">やくす</);
    assert.match(actionArea.innerHTML, /npc-dialogue-btn-jp">まなぶ</);
    assert.match(actionArea.innerHTML, /npc-dialogue-btn-jp">すすむ</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">ほんやくする</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">翻訳する</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">学ぶ</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">次へ進む</);
    assert.doesNotMatch(actionArea.innerHTML, /npc-dialogue-btn-jp">つぎへすすむ</);
  });

  it('sends a stable translation idempotency key and blocks duplicate in-flight clicks', async () => {
    let resolveTranslation;
    translationResponse = new Promise(resolve => { resolveTranslation = resolve; });

    showNpcDialogueCard({
      speaker: 'Mira',
      encounterId: 'enc-1',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    translateButton.click();

    assert.equal(translatedRequests.length, 1);
    assert.match(translatedRequests[0].idempotencyKey, /^translate:/);

    resolveTranslation({ ok: true, translation: 'Wait!', crystals: { balance: 95 } });
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('sends Learn API request once with source tokens, entities, and idempotency key', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      encounterId: 'enc-1',
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower / blossom', pos: 'noun', entity: true },
        { surface: 'は', baseForm: 'は', reading: 'は', pos: 'particle' },
        { surface: '森', baseForm: '森', reading: 'もり', meaning: 'forest', pos: 'noun' },
        { surface: 'で', baseForm: 'で', reading: 'で', pos: 'particle' },
        { surface: '光', baseForm: '光', reading: 'ひかり', meaning: 'light', pos: 'noun' },
        { surface: 'を', baseForm: 'を', reading: 'を', pos: 'particle' },
        { surface: '見た', baseForm: '見る', reading: 'みた', meaning: 'saw', pos: 'verb' },
        { surface: '。', pos: 'punctuation' }
      ],
      knownWords: new Set()
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    learnButton.click();
    learnButton.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(learnRequests.length, 1);
    assert.equal(learnRequests[0].text, '花は森で光を見た。');
    assert.equal(learnRequests[0].tokens.length, 8);
    assert.deepEqual(learnRequests[0].entities, [{ id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' }]);
    assert.match(learnRequests[0].idempotencyKey, /^learn:/);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-takeover/);
    assert.match(actionArea.innerHTML, /Sentence/);
    assert.match(actionArea.innerHTML, /Pronunciation/);
    assert.match(actionArea.innerHTML, /Translation/);
    assert.match(actionArea.innerHTML, /Breakdown/);
    assert.match(actionArea.innerHTML, /Grammar hints/);
    assert.match(actionArea.innerHTML, /Other tips/);
    assert.match(actionArea.innerHTML, /Flower saw a light in the forest/);
    assert.match(actionArea.innerHTML, /森で/);
    assert.match(actionArea.innerHTML, /in the forest/);
    assert.doesNotMatch(actionArea.innerHTML, /<script/);
  });

  it('renders unavailable Learn state with retry control and diagnostic code', async () => {
    learnResponse = { ok: false, error: 'learn_lesson_validation_failed', reason: 'tokens_length' };
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '待って！', baseForm: '待つ', reading: 'まって', meaning: 'wait', pos: 'verb' }],
      knownWords: new Set(),
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    learnButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /Learn lesson is unavailable right now/);
    assert.match(actionArea.innerHTML, /learn_lesson_validation_failed/);
    assert.match(actionArea.innerHTML, /tokens_length/);
    assert.match(actionArea.innerHTML, /Try again/);
  });

  it('renders validated translation entity spans without raw marker syntax', async () => {
    translationResponse = {
      ok: true,
      translation: 'Flower is strong!',
      entities: [{ id: 'hana', type: 'creature', text: 'Flower', start: 0, end: 6 }]
    };

    showNpcDialogueCard({
      speaker: 'Flower',
      speakerEntity: { id: 'hana', type: 'creature', surface: '花', displayName: 'Flower' },
      tokens: [{ surface: '花', baseForm: '花', reading: 'はな', meaning: 'flower', pos: 'noun', entity: true }],
      knownWords: new Set(),
    });

    const [translateButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    translateButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.match(actionArea.innerHTML, /npc-dialogue-translation-entity/);
    assert.match(actionArea.innerHTML, />Flower<\/span> is strong!/);
    assert.doesNotMatch(actionArea.innerHTML, /\[\[entity:/);
  });
});
