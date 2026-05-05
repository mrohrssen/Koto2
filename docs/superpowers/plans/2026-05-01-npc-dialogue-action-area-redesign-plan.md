# NPC Dialogue Action Area Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move NPC, creature, enemy, and player-spoken Japanese dialogue out of the scene narration overlay into a visual-novel style action-area card, then render all response screens with headed `renderChoices()` cards.

**Architecture:** Add a token-first dialogue card module that owns action-area dialogue rendering, shared-row scaffolding, pagination, inert utility buttons, word lookup attachment, and optional audio. Add `renderChoicesAsync()` as a promise wrapper over the existing `renderChoices()` card UI so existing async dialogue flows can migrate away from `renderButtonsAsync()` without changing their control flow. Migrate post-combat NPC dialogue, friendly NPC item rooms, NPC battle intro, and creature befriend flows in focused batches.

**Tech Stack:** Browser ES modules, DOM APIs, existing `renderJpSentence()` token shape, `dialogue-word-lookup.js`, `ui-components.js`, Node test runner with module mocks, Vite dev server for visual verification.

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-05-01-npc-dialogue-action-area-redesign.md`
- Existing overlay: `public/js/ui/narration-box.js`
- Existing token renderer: `public/js/ui/bootstrap-client.js`
- Existing choice renderer: `public/js/ui/ui-components.js`
- Existing lookup attachment: `public/js/ui/dialogue-word-lookup.js`

## File Structure

- Create `public/js/ui/npc-dialogue-card.js`: token-first action-area dialogue card, shared-row renderer, pagination, speaker portrait fallback, inert utility buttons, audio/log/continue controls.
- Create `tests/unit/ui/npc-dialogue-card.test.js`: unit tests for shared-row rendering, promise resolution, inert buttons, fallback escaping, pagination, and lookup data.
- Modify `public/js/ui/ui-components.js`: add `renderChoicesAsync()` as the only async response-choice helper for card choices.
- Modify `tests/unit/ui/ui-components.test.js`: cover heading rendering and `renderChoicesAsync()` selection behavior.
- Modify `public/game.css`: add dialogue-card styles and keep normal dialogue-card state within the action-area safe area.
- Modify `public/js/ui/npc-dialogue-ui.js`: migrate post-combat NPC dialogue and response choices.
- Modify `public/js/ui/exploration.js`: migrate friendly NPC greetings, player `You` item requests, item choices, and relevant skill choices to headed cards.
- Modify `public/js/ui/room-transition.js`: migrate NPC battle intro and strength prompt.
- Modify `public/js/ui/befriend.js`: migrate creature dialogue and response/name/Fight-Talk choices.
- Modify focused tests under `tests/unit/ui/` for each migrated flow.

---

### Task 1: Add Async Card Choices

**Files:**
- Modify: `public/js/ui/ui-components.js`
- Modify: `tests/unit/ui/ui-components.test.js`
- Modify: `tests/unit/ui/ui-components-selection-clear.test.js`

- [ ] **Step 1: Add a failing test for `renderChoicesAsync()`**

Add this test to `tests/unit/ui/ui-components-selection-clear.test.js` after the existing `renderChoices` clearing test:

```js
it('resolves async card choices with the selected index and heading', async () => {
  const selected = renderChoicesAsync({
    heading: 'Choose a response',
    cards: [{ title: 'はい' }, { title: 'いいえ' }],
  });

  assert.equal(actionArea.children[0].className, 'ui-choice-heading');
  assert.equal(actionArea.children[0].textContent, 'Choose a response');

  const choices = actionArea.querySelectorAll('.ui-choice');
  choices[1].click();

  assert.equal(await selected, 1);
  assert.match(actionArea.innerHTML, /prologue-continue-hint/);
});
```

- [ ] **Step 2: Update the import in the same test**

Change the import in `tests/unit/ui/ui-components-selection-clear.test.js`:

```js
const { renderButtonsAsync, renderChoices, renderChoicesAsync } = await import('../../../public/js/ui/ui-components.js');
```

- [ ] **Step 3: Run the focused failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/ui-components-selection-clear.test.js
```

Expected: FAIL because `renderChoicesAsync` is not exported.

- [ ] **Step 4: Implement `renderChoicesAsync()`**

Add this export after `renderChoices()` in `public/js/ui/ui-components.js`:

```js
/**
 * Render choice cards and return a Promise that resolves with the selected index.
 * Use this for dialogue responses, name quizzes, item picks, skill picks, and targets.
 *
 * @param {object} options
 * @param {string} options.heading - Heading rendered above the choices
 * @param {Array<{sprite?: string, title: string, subtitle?: string, pills?: string, badge?: {text: string, color: string}, helpBtn?: Function}>} options.cards
 * @param {boolean} [options.disableAfterSelect=true]
 * @param {boolean} [options.clearAfterSelect]
 * @param {HTMLElement} [options.container]
 * @returns {Promise<number>}
 */
export function renderChoicesAsync(options = {}) {
  const {
    heading,
    cards,
    disableAfterSelect = true,
    clearAfterSelect = disableAfterSelect,
    container,
  } = options;

  return new Promise(resolve => {
    let answered = false;
    renderChoices({
      heading,
      cards,
      disableAfterSelect,
      clearAfterSelect,
      container,
      onSelect: index => {
        if (answered) return;
        answered = true;
        resolve(index);
      },
    });
  });
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/ui-components.test.js tests/unit/ui/ui-components-selection-clear.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/ui-components.js tests/unit/ui/ui-components.test.js tests/unit/ui/ui-components-selection-clear.test.js
git commit -m "Add async card choice helper"
```

---

### Task 2: Add Dialogue Card Renderer Tests

**Files:**
- Create: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Create the test file**

Create `tests/unit/ui/npc-dialogue-card.test.js`:

```js
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
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];
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

  querySelectorAll(selector) {
    if (!selector.startsWith('.')) return [];
    const cls = selector.slice(1);
    const matches = [];
    const visit = node => {
      if (node.className.split(/\s+/).includes(cls)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

let actionArea;
let attachedLookupContainer = null;
let playedAudio = null;

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

const { showNpcDialogueCard, renderDialogueTokenRows } = await import('../../../public/js/ui/npc-dialogue-card.js');

describe('npc dialogue card', () => {
  beforeEach(() => {
    actionArea = new FakeElement('section');
    attachedLookupContainer = null;
    playedAudio = null;
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

  it('renders Translate and Learn as disabled inert controls', () => {
    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '不安', baseForm: '不安', reading: 'ふあん', meaning: 'anxiety', pos: 'noun' }],
      knownWords: new Set(),
    });

    const utilityButtons = actionArea.querySelectorAll('.npc-dialogue-utility');
    assert.equal(utilityButtons.length, 2);
    assert.equal(utilityButtons[0].disabled, true);
    assert.equal(utilityButtons[1].disabled, true);
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
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL because `public/js/ui/npc-dialogue-card.js` does not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Test NPC dialogue card behavior"
```

---

### Task 3: Implement Dialogue Card Module

**Files:**
- Create: `public/js/ui/npc-dialogue-card.js`

- [ ] **Step 1: Create the module**

Create `public/js/ui/npc-dialogue-card.js`:

```js
import { toRomaji } from './romaji.js';
import { getKnownWords, esc } from './bootstrap-client.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';
import * as dialogueLookup from './dialogue-word-lookup.js';
import { playDialogueAudio } from '../tts.js';

const DEFAULT_PORTRAIT = '/assets/sprites/enemies/systemExecutive.webp';
const MAX_TOKENS_PER_PAGE = 9;
const MAX_TOKENS_PER_LINE = 4;

function tokenBase(token) {
  return getTokenBaseForm(token);
}

function displayReading(token, useKanji) {
  if (!isContentExposureToken(token)) return token.surface || '';
  if (useKanji) return token.surface || token.reading || token.baseForm || '';
  return token.reading || token.surface || token.baseForm || '';
}

function tokenMeaning(token, wordDict, overrides) {
  const meaning = resolveExposureMeaning(token, wordDict, overrides) || '';
  const firstSense = meaning.split('/')[0].trim();
  const parenIdx = firstSense.indexOf('(');
  return parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
}

function attrsForToken(token, { wordDict, overrides, useKanji }) {
  const base = tokenBase(token);
  const reading = token.reading || token.surface || base;
  const meaning = tokenMeaning(token, wordDict, overrides);
  const pos = token.pos || '';
  const meaningsJson = Array.isArray(token.meanings) ? JSON.stringify(token.meanings) : '';
  let attrs = ` data-base="${esc(base)}" data-reading="${esc(reading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;
  if (overrides?.[base]) attrs += ' data-override="1"';
  if (meaningsJson) attrs += ` data-meanings="${esc(meaningsJson)}"`;
  if (useKanji) attrs += ' data-kanji-mode="1"';
  return attrs;
}

function chunkByCount(items, count) {
  const chunks = [];
  for (let i = 0; i < items.length; i += count) {
    chunks.push(items.slice(i, i + count));
  }
  return chunks;
}

function paginateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length <= MAX_TOKENS_PER_PAGE) return [tokens || []];
  return chunkByCount(tokens, MAX_TOKENS_PER_PAGE);
}

export function renderDialogueTokenRows({
  tokens,
  knownWords = getKnownWords(),
  wordDict = null,
  overrides = {},
  useKanji = false,
} = {}) {
  const lines = chunkByCount(tokens || [], MAX_TOKENS_PER_LINE);
  return lines.map(lineTokens => {
    const romaji = [];
    const jp = [];
    const en = [];

    for (const token of lineTokens) {
      if (!isContentExposureToken(token)) {
        romaji.push('<span class="npc-dialogue-cell npc-dialogue-cell--punct"></span>');
        jp.push(`<span class="npc-dialogue-cell jp-punct">${esc(token.surface || '')}</span>`);
        en.push('<span class="npc-dialogue-cell"></span>');
        continue;
      }

      const base = tokenBase(token);
      const reading = token.reading || token.surface || base;
      const display = displayReading(token, useKanji);
      const isKnown = knownWords?.has?.(base);
      const meaning = isKnown ? '' : tokenMeaning(token, wordDict, overrides);
      const attrs = attrsForToken(token, { wordDict, overrides, useKanji });
      const typeClass = token.entity ? 'jp-entity' : isKnown ? 'jp-known' : 'jp-unknown';

      romaji.push(`<span class="npc-dialogue-cell">${esc(toRomaji(reading))}</span>`);
      jp.push(`<span class="npc-dialogue-cell jp-word ${typeClass}"${attrs}>${esc(display)}</span>`);
      en.push(`<span class="npc-dialogue-cell">${esc(meaning)}</span>`);
    }

    return `
      <div class="npc-dialogue-line-grid" style="--npc-dialogue-cols:${Math.max(1, lineTokens.length)}">
        <div class="npc-dialogue-romaji-row">${romaji.join('')}</div>
        <div class="npc-dialogue-jp-row">${jp.join('')}</div>
        <div class="npc-dialogue-en-row">${en.join('')}</div>
      </div>
    `;
  }).join('');
}

function renderFallbackText({ html, text }) {
  if (html) return String(html);
  return esc(text || '');
}

function resolvePortraitSrc({ speakerPortrait, speakerId }) {
  if (speakerPortrait) return speakerPortrait;
  if (speakerId) return `/assets/sprites/npcs/${speakerId}.webp`;
  return DEFAULT_PORTRAIT;
}

function renderPageContent(options, pageTokens) {
  if (pageTokens?.length) {
    return renderDialogueTokenRows({ ...options, tokens: pageTokens });
  }
  return renderFallbackText(options);
}

export function showNpcDialogueCard(options = {}) {
  const actionArea = options.container || document.getElementById('action-area');
  if (!actionArea) return Promise.resolve();

  const pages = options.tokens?.length ? paginateTokens(options.tokens) : [null];
  let pageIndex = 0;
  let resolved = false;

  return new Promise(resolve => {
    const finish = () => {
      if (resolved) return;
      resolved = true;
      dialogueLookup.hidePopup?.();
      actionArea.innerHTML = '';
      resolve();
    };

    const render = () => {
      const pageTokens = pages[pageIndex];
      const portraitSrc = resolvePortraitSrc(options);
      const hasAudio = !!options.audio?.userId && !!options.audio?.key;
      const content = renderPageContent(options, pageTokens);
      const continueLabel = pageIndex < pages.length - 1 ? 'Next' : 'Continue';

      actionArea.innerHTML = `
        <div class="npc-dialogue-shell">
          <article class="npc-dialogue-card">
            <div class="npc-dialogue-portrait">
              <img src="${esc(portraitSrc)}" alt="" onerror="this.style.display='none'">
            </div>
            <div class="npc-dialogue-copy">
              <header class="npc-dialogue-header">
                <div class="npc-dialogue-speaker">
                  ${options.speakerReading ? `<span class="npc-dialogue-speaker-reading">${esc(options.speakerReading)}</span>` : ''}
                  <span class="npc-dialogue-speaker-name">${esc(options.speaker || '')}</span>
                </div>
                <div class="npc-dialogue-tools">
                  <button class="npc-dialogue-tool npc-dialogue-audio" type="button" ${hasAudio ? '' : 'disabled'} aria-label="Play audio">♪</button>
                  <button class="npc-dialogue-tool npc-dialogue-log" type="button" disabled aria-label="Dialogue log">▣</button>
                </div>
              </header>
              <div class="npc-dialogue-text">${content}</div>
            </div>
          </article>
          <div class="npc-dialogue-utility-row">
            <button class="npc-dialogue-utility npc-dialogue-translate" type="button" disabled>Translate</button>
            <button class="npc-dialogue-utility npc-dialogue-learn" type="button" disabled>Learn</button>
          </div>
          <button class="npc-dialogue-continue" type="button">${continueLabel}</button>
        </div>
      `;

      const textEl = actionArea.querySelector('.npc-dialogue-text');
      if (pageTokens?.length && textEl) {
        dialogueLookup.attachWordClickHandlers(textEl);
      }

      actionArea.querySelector('.npc-dialogue-audio')?.addEventListener('click', () => {
        if (hasAudio) playDialogueAudio(options.audio.userId, options.audio.key);
      });

      actionArea.querySelector('.npc-dialogue-continue')?.addEventListener('click', () => {
        if (pageIndex < pages.length - 1) {
          pageIndex += 1;
          render();
          return;
        }
        finish();
      });
    };

    render();
  });
}
```

- [ ] **Step 2: Run the dialogue-card test**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax check**

Run:

```bash
node --check public/js/ui/npc-dialogue-card.js
```

Expected: no output and exit code 0.

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/npc-dialogue-card.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Add NPC dialogue card renderer"
```

---

### Task 4: Add Dialogue Card CSS

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Add CSS after the UI components section**

Add this CSS near the existing `/* ========== UI COMPONENTS */` rules in `public/game.css`:

```css
/* ========== NPC DIALOGUE CARD ========== */
.npc-dialogue-shell {
  width: 100%;
  max-width: 430px;
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 1cqh, 8px);
  padding: clamp(6px, 1.2cqh, 8px) 8px max(44px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.npc-dialogue-card {
  position: relative;
  width: 100%;
  min-height: clamp(188px, 49cqh, 214px);
  border-radius: 14px;
  border: 3px solid #4d3c28;
  background:
    radial-gradient(circle at 42% 20%, rgba(255, 255, 255, 0.58), transparent 18%),
    linear-gradient(180deg, #fff9eb, #f4dfbd);
  box-shadow:
    0 8px 17px rgba(0, 0, 0, 0.36),
    inset 0 0 0 2px rgba(255, 255, 255, 0.82),
    inset 0 -26px 48px rgba(134, 78, 35, 0.13);
  color: #17130f;
  overflow: hidden;
}

.npc-dialogue-card::before {
  content: "";
  position: absolute;
  inset: 7px;
  border-radius: 9px;
  border: 1px solid rgba(100, 78, 48, 0.28);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.62);
  pointer-events: none;
}

.npc-dialogue-portrait {
  position: absolute;
  left: 10px;
  bottom: 8px;
  width: clamp(92px, 29cqw, 112px);
  height: clamp(146px, 39cqh, 171px);
  overflow: hidden;
  border-radius: 10px;
}

.npc-dialogue-portrait img {
  width: 130%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 4px 3px rgba(64, 36, 24, 0.16));
}

.npc-dialogue-copy {
  position: absolute;
  left: clamp(118px, 34cqw, 133px);
  right: 14px;
  top: clamp(18px, 5cqh, 28px);
  bottom: 12px;
}

.npc-dialogue-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(101, 80, 52, 0.23);
  margin-bottom: 10px;
}

.npc-dialogue-speaker {
  color: #1f1712;
  font-size: clamp(18px, 5.2cqw, 22px);
  font-weight: 780;
  letter-spacing: 0.02em;
  line-height: 1;
}

.npc-dialogue-speaker-reading {
  display: block;
  margin-left: 3px;
  margin-bottom: 2px;
  color: #2d241d;
  font-size: 11px;
  letter-spacing: 0.24em;
  font-weight: 640;
}

.npc-dialogue-tools {
  display: flex;
  gap: 5px;
}

.npc-dialogue-tool {
  width: 34px;
  height: 33px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #fff8e9, #ead4aa);
  border: 2px solid #756049;
  box-shadow: 0 2px 0 #4e3b28, inset 0 0 0 1px rgba(255, 255, 255, 0.58);
  color: #1f1a16;
  font-size: 18px;
  font-weight: 900;
}

.npc-dialogue-tool:disabled {
  opacity: 0.45;
}

.npc-dialogue-text {
  font-family: "Hiragino Maru Gothic ProN", "Yu Gothic", ui-rounded, system-ui, sans-serif;
}

.npc-dialogue-line-grid {
  display: grid;
  grid-template-rows: 9px 17px 10px;
  row-gap: 4px;
  margin-bottom: 10px;
}

.npc-dialogue-romaji-row,
.npc-dialogue-jp-row,
.npc-dialogue-en-row {
  display: grid;
  grid-template-columns: repeat(var(--npc-dialogue-cols), minmax(0, 1fr));
  align-items: start;
  text-align: center;
}

.npc-dialogue-romaji-row {
  color: #53493e;
  font-family: Inter, system-ui, sans-serif;
  font-size: clamp(8px, 2.25cqw, 9.1px);
  font-weight: 600;
  line-height: 1;
}

.npc-dialogue-jp-row {
  color: #17130f;
  font-size: clamp(13px, 3.6cqw, 14.5px);
  font-weight: 520;
  line-height: 1.05;
}

.npc-dialogue-en-row {
  color: #1d64a6;
  font-family: Inter, system-ui, sans-serif;
  font-size: clamp(7.5px, 2.1cqw, 8.5px);
  font-weight: 700;
  line-height: 1.02;
}

.npc-dialogue-cell {
  min-width: 0;
  white-space: nowrap;
  overflow: visible;
}

.npc-dialogue-utility-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0 16px;
}

.npc-dialogue-utility,
.npc-dialogue-continue {
  min-height: clamp(54px, 14.6cqh, 64px);
  border-radius: 12px;
  border: 3px solid #f4d9a5;
  color: #fff;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.36);
  box-shadow: 0 4px 0 rgba(44, 29, 20, 0.82), inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  font-weight: 800;
}

.npc-dialogue-utility:disabled {
  opacity: 0.95;
}

.npc-dialogue-translate {
  background: linear-gradient(180deg, #2f80db, #1d56be);
}

.npc-dialogue-learn {
  background: linear-gradient(180deg, #559d3a, #2d772d);
}

.npc-dialogue-continue {
  width: min(280px, calc(100% - 124px));
  min-height: clamp(62px, 16.9cqh, 74px);
  margin: 0 auto;
  background: linear-gradient(180deg, #e99c40, #bf6724);
  font-size: clamp(18px, 5cqw, 22px);
}
```

- [ ] **Step 2: Run CSS-related unit test**

Run:

```bash
npm run test:unit -- tests/unit/ios-edge-to-edge-css.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "Style NPC dialogue card"
```

---

### Task 5: Migrate Post-Combat NPC Dialogue

**Files:**
- Modify: `public/js/ui/npc-dialogue-ui.js`
- Add/modify: `tests/unit/ui/npc-dialogue-ui.test.js`

- [ ] **Step 1: Add the post-combat dialogue test**

Create `tests/unit/ui/npc-dialogue-ui.test.js` if it is not present. If it is present, add the same test case to the existing file. The test must mock `showNpcDialogueCard()` to push options into `dialogueCards`, mock `renderChoicesAsync()` to push options into `choiceCalls` and resolve `0`, and initialize `npc-dialogue-ui.js` with a context whose `apiStartNpcDialogue()` returns one freed line and one response round.

Use these required assertions in the test:

```js
assert.deepEqual(dialogueCards[0], {
  speaker: 'Mira',
  html: '<freed>',
  audio: { userId: 'user-1', key: 'freed-tts' },
});
assert.equal(choiceCalls[0].heading, 'Choose a response');
assert.equal(choiceCalls[0].cards[0].title, '<option-a>');
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-ui.test.js
```

Expected: FAIL because `npc-dialogue-ui.js` still calls `ctx.narration.showNarration()` and `renderButtonsAsync()`.

- [ ] **Step 3: Update imports**

In `public/js/ui/npc-dialogue-ui.js`, replace the button import:

```js
import { renderChoicesAsync } from './ui-components.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';
```

Keep `renderJpSentence` only for call sites that still need it during the migration. Remove it if no longer used.

- [ ] **Step 4: Add local helpers**

Add these helpers below `isNpcDialogueActive()`:

```js
function taggedDialogueOptions({ speaker, html, audio }) {
  return {
    speaker,
    html,
    ...(audio ? { audio } : {}),
  };
}

function tokenDialogueOptions({ speaker, line, useKanji, audio }) {
  return {
    speaker,
    tokens: line?.tokens || [],
    overrides: line?.overrides || {},
    useKanji: !!useKanji,
    ...(audio ? { audio } : {}),
  };
}
```

- [ ] **Step 5: Replace dialogue and response rendering**

Change the freed and round flow in `runNpcDialogue()`:

```js
await showNpcDialogueCard(taggedDialogueOptions({
  speaker: npcName,
  html: renderEnFirst(freed),
  audio: freedTts && userId ? { userId, key: freedTts } : null,
}));

const selectedIndex = await renderChoicesAsync({
  heading: 'Choose a response',
  cards: round.options.map(o => ({
    title: renderEnFirst(typeof o === 'string' ? o : o.text),
  })),
});
```

Change the tokenized defeat line:

```js
await showNpcDialogueCard(tokenDialogueOptions({
  speaker: npcName,
  line,
  useKanji: dialogueData.useKanji,
}));
```

- [ ] **Step 6: Remove forced overlay cleanup that is no longer needed**

Remove this line after response selection because the narration overlay is no longer showing the round prompt:

```js
if (ctx.narration.forceHideNarration) ctx.narration.forceHideNarration();
```

- [ ] **Step 7: Run focused tests and syntax check**

Run:

```bash
node --check public/js/ui/npc-dialogue-ui.js
npm run test:unit -- tests/unit/ui/npc-dialogue-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/npc-dialogue-ui.js tests/unit/ui/npc-dialogue-ui.test.js
git commit -m "Move NPC dialogue to action card"
```

---

### Task 6: Migrate Friendly NPC Item Rooms and Player Speech

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `tests/unit/ui/exploration-friendly-npc.test.js`

- [ ] **Step 1: Update tests for the new flow**

In `tests/unit/ui/exploration-friendly-npc.test.js`, update mocks:

```js
let dialogueCards = [];

await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCards.push(options); },
  },
});
```

Update the existing friendly NPC test expectations:

```js
assert.equal(dialogueCards[0].speaker, 'Guide');
assert.deepEqual(dialogueCards[0].tokens, [{ text: 'こんにちは！' }]);
assert.equal(renderedChoices.heading, 'Choose an item');
```

Add a test for player item requests:

```js
it('shows player item request as a You dialogue card before applying the item', async () => {
  // Select the first rendered item card.
  await renderedChoices.onSelect(0);

  const youLine = dialogueCards.find(card => card.speaker === 'You');
  assert.ok(youLine);
  assert.match(youLine.html || youLine.text || '', /ください|りんご/);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/exploration-friendly-npc.test.js
```

Expected: FAIL because friendly NPC dialogue still uses `sceneModule.showNarration()`.

- [ ] **Step 3: Update imports**

In `public/js/ui/exploration.js`, add:

```js
import { showNpcDialogueCard } from './npc-dialogue-card.js';
```

- [ ] **Step 4: Replace the NPC greeting overlay**

Replace the greeting block:

```js
await sceneModule.showNarration(greetingContent, narrationOpts);
```

with:

```js
await showNpcDialogueCard({
  speaker: npc.nameEn || npc.name,
  ...(greetingTokens?.length
    ? {
        tokens: greetingTokens,
        overrides: friendlyNpcState.greeting?.overrides || {},
        useKanji: false,
      }
    : { text: 'こんにちは！' }),
});
```

- [ ] **Step 5: Remove the persistent item prompt narration**

Delete this call:

```js
await sceneModule.showNarration(FRIENDLY_NPC_ITEM_PROMPT, {
  speaker: npc.nameEn || npc.name,
  persistent: true,
});
```

Render the item choices with a heading:

```js
renderChoices({
  heading: 'Choose an item',
  cards: friendlyNpcState.renderedCards || offers.map(item => ({
    sprite: itemSpriteHtml(item.id, item.word),
    title: item.nameToken
      ? renderJpSentence([item.nameToken], getKnownWords(), null, {}, false)
      : `${item.word} (${item.reading})`,
    pills: buildItemEffectPills(item),
  })),
  onSelect: async (index) => {
    if (friendlyNpcState.choosing) return;
    friendlyNpcState.choosing = true;
    const item = offers[index];
    playSFX('creature-equip');
    await showPlayerItemRequest(item);
    // Keep the current apply-item logic that starts with const gameState = getGameState().
  },
});
```

- [ ] **Step 6: Replace player `You` item request narration**

Replace the item request narration branches with this helper inside the selection handler:

```js
const showPlayerItemRequest = async (item) => {
  if (item.tokens?.length) {
    await showNpcDialogueCard({
      speaker: 'You',
      tokens: item.tokens,
      overrides: item.overrides || {},
      useKanji: false,
    });
    return;
  }
  if (item.shopTokens?.length) {
    await showNpcDialogueCard({
      speaker: 'You',
      tokens: item.shopTokens,
      overrides: item.shopOverrides || {},
      useKanji: false,
    });
    return;
  }
  if (item.word) {
    await showNpcDialogueCard({
      speaker: 'You',
      text: `${item.word}、ください`,
    });
  }
};

await showPlayerItemRequest(item);
```

- [ ] **Step 7: Add headings to skill choices in `exploration.js`**

For skill master choice screens in `exploration.js`, add:

```js
heading: 'Choose a skill',
```

to each `renderChoices({ cards: offers... })` call that presents skill choices.

- [ ] **Step 8: Run focused tests and syntax check**

Run:

```bash
node --check public/js/ui/exploration.js
npm run test:unit -- tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-skill-master.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/exploration.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-skill-master.test.js
git commit -m "Move friendly NPC dialogue to action card"
```

---

### Task 7: Migrate NPC Battle Intro

**Files:**
- Modify: `public/js/ui/room-transition.js`
- Modify/add: `tests/unit/ui/npc-battle-intro.test.js`

- [ ] **Step 1: Update tests**

In `tests/unit/ui/npc-battle-intro.test.js`, mock `showNpcDialogueCard()` and assert:

```js
assert.equal(dialogueCards[0].speaker, 'Mira');
assert.deepEqual(dialogueCards[0].tokens, fightStart.tokens);
assert.equal(dialogueCards[1].speaker, 'Mira');
assert.equal(dialogueCards[1].text, NPC_BATTLE_STRENGTH_PROMPT);
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-battle-intro.test.js
```

Expected: FAIL because `room-transition.js` still uses `narrationBox.show()`.

- [ ] **Step 3: Update imports**

In `public/js/ui/room-transition.js`, add:

```js
import { showNpcDialogueCard } from './npc-dialogue-card.js';
```

- [ ] **Step 4: Replace fight-start narration**

Replace the tokenized fight-start overlay call:

```js
await narrationBox.show(html, { speaker: npcName, html: true });
```

with:

```js
await showNpcDialogueCard({
  speaker: npcName,
  speakerId: npcData.id,
  tokens: bootstrapLine.tokens,
  overrides: bootstrapLine.overrides || {},
  useKanji: npcDialogue.useKanji || false,
});
```

Replace the legacy greeting fallback:

```js
await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
```

with:

```js
await showNpcDialogueCard({
  speaker: npcName,
  speakerId: npcData.id,
  html: renderEnFirst(npcData.greeting),
});
```

- [ ] **Step 5: Replace the strength prompt**

Keep the strength prompt spoken by the NPC in this pass:

```js
await showNpcDialogueCard({
  speaker: npcName,
  speakerId: npcData.id,
  text: NPC_BATTLE_STRENGTH_PROMPT,
});
```

- [ ] **Step 6: Run focused tests and syntax check**

Run:

```bash
node --check public/js/ui/room-transition.js
npm run test:unit -- tests/unit/ui/npc-battle-intro.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/room-transition.js tests/unit/ui/npc-battle-intro.test.js
git commit -m "Move NPC battle intro to action card"
```

---

### Task 8: Migrate Creature Befriend Dialogue and Choices

**Files:**
- Modify: `public/js/ui/befriend.js`
- Modify: `tests/unit/ui/befriend.test.js`

- [ ] **Step 1: Update mocks in befriend tests**

In `tests/unit/ui/befriend.test.js`, replace the `renderButtonsAsync` mock with:

```js
const renderChoicesResults = [];
const renderChoicesCalls = [];

await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderChoicesAsync: options => {
      renderChoicesCalls.push(options);
      return Promise.resolve(renderChoicesResults.shift() ?? 0);
    },
  },
});
```

Add a dialogue-card mock:

```js
const dialogueCardCalls = [];

await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCardCalls.push(options); },
  },
});
```

- [ ] **Step 2: Add tests for the befriend quiz sequence**

Add a test that `renderBefriendQuiz()`:

```js
assert.equal(dialogueCardCalls[0].speaker.name || dialogueCardCalls[0].speaker, 'Creature');
assert.equal(renderChoicesCalls[0].heading, 'Choose an action');
assert.deepEqual(renderChoicesCalls[0].cards.map(card => card.title), ['たたかう (Fight)', 'はなす (Talk)']);
assert.equal(renderChoicesCalls[1].heading, 'Choose a name');
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm run test:unit -- tests/unit/ui/befriend.test.js
```

Expected: FAIL because `befriend.js` still imports `renderButtonsAsync()` and uses narration for creature lines.

- [ ] **Step 4: Update imports**

In `public/js/ui/befriend.js`, change:

```js
import { renderButtonsAsync } from './ui-components.js';
```

to:

```js
import { renderChoicesAsync } from './ui-components.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';
```

- [ ] **Step 5: Add helper functions**

Add near `showConversationRound()`:

```js
function simpleChoiceCards(labels) {
  return labels.map(label => ({ title: label }));
}

async function showCreatureDialogue({ speaker, prompt, fallbackText }) {
  if (prompt?.tokens?.length) {
    await showNpcDialogueCard({
      speaker,
      tokens: prompt.tokens,
      overrides: prompt.overrides || {},
      useKanji: false,
    });
    return;
  }
  await showNpcDialogueCard({ speaker, text: fallbackText });
}
```

- [ ] **Step 6: Replace conversation round rendering**

Change `showConversationRound()` to:

```js
async function showConversationRound(round, creatureSpeaker) {
  await showNpcDialogueCard({
    speaker: creatureSpeaker,
    text: round.speaker,
  });

  return renderChoicesAsync({
    heading: 'Choose a response',
    cards: round.options.map(o => ({
      title: renderEnFirst(typeof o === 'string' ? o : o.text),
    })),
  });
}
```

- [ ] **Step 7: Replace Fight/Talk buttons**

Replace:

```js
const choicePromise = renderButtonsAsync([
  { label: 'たたかう (Fight)' },
  { label: 'はなす (Talk)' },
]);
```

with:

```js
const choicePromise = renderChoicesAsync({
  heading: 'Choose an action',
  cards: simpleChoiceCards(['たたかう (Fight)', 'はなす (Talk)']),
});
```

Update tutorial button selectors from `.ui-btn` to `.ui-choice`:

```js
const btns = document.querySelectorAll('#action-area .ui-choice');
```

- [ ] **Step 8: Replace wait, name, success, wrong, and refusal narration**

Use the helper for creature prompts:

```js
await showCreatureDialogue({
  speaker: creatureSpeaker,
  prompt: quizData.waitPrompt,
  fallbackText: 'まって！！',
});
```

For the name prompt:

```js
await showCreatureDialogue({
  speaker: creatureSpeaker,
  prompt: quizData.namePrompt,
  fallbackText: 'なまえは？',
});
```

For name choices:

```js
const selectedIdx = await renderChoicesAsync({
  heading: 'Choose a name',
  cards: quizData.options.map(opt => ({ title: opt.name })),
});
```

For success:

```js
await showCreatureDialogue({
  speaker: creatureSpeaker,
  prompt: quizData.successPrompt,
  fallbackText: 'じゃあ、友達になろう！',
});
```

For wrong/refusal prompts, use the same helper with the existing prompt object or fallback string.

- [ ] **Step 9: Replace remaining befriend response stacks**

Search within `public/js/ui/befriend.js`:

```bash
rg "renderButtonsAsync|showNarration\\(" public/js/ui/befriend.js
```

Convert each remaining befriend choice stack to `renderChoicesAsync()` with this mapping:

```js
// Conversation options
heading: 'Choose a response'

// Fight/Talk and continue/retry decisions
heading: 'Choose an action'

// Creature name quiz options
heading: 'Choose a name'

// Release/swap creature selection
heading: 'Choose a creature'
```

Leave tutorial Cid system narration in the overlay only if it is not part of creature/player dialogue and the spec still treats it as system narration.

- [ ] **Step 10: Run focused tests and syntax check**

Run:

```bash
node --check public/js/ui/befriend.js
npm run test:unit -- tests/unit/ui/befriend.test.js tests/unit/ui/actions-prologue-hint.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add public/js/ui/befriend.js tests/unit/ui/befriend.test.js
git commit -m "Move befriend dialogue to action card"
```

---

### Task 9: Heading Sweep for Existing `renderChoices()` Calls

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/post-combat-shop.js`
- Modify: `public/js/ui/fusion-lab.js`
- Modify: tests that cover these screens

- [ ] **Step 1: Search for missing headings**

Run:

```bash
rg "renderChoices\\(\\{" public/js/ui
```

Inspect each result. Every user-facing choice screen should pass `heading`.

- [ ] **Step 2: Add concrete headings**

Use these headings:

```js
heading: 'Choose an area'
heading: 'Choose a creature'
heading: 'Choose an item'
heading: 'Choose a skill'
heading: 'Choose target'
heading: 'Choose a fusion'
```

Do not change non-choice decorative renderers.

- [ ] **Step 3: Add or update tests**

For each existing focused test, assert the heading:

```js
assert.equal(renderedChoices.heading, 'Choose an item');
```

For `post-combat-shop`, create `tests/unit/ui/post-combat-shop-choice-heading.test.js` if the existing test file cannot capture the `renderChoices()` options. The test should assert:

```js
assert.equal(renderedChoices.heading, 'Choose an item');
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/post-combat-shop.test.js tests/unit/ui/fusion-lab.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/exploration.js public/js/ui/post-combat-shop.js public/js/ui/fusion-lab.js tests/unit/ui
git commit -m "Standardize choice headings"
```

---

### Task 10: Integration Verification

**Files:**
- No planned source changes unless tests expose a defect.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check public/js/ui/npc-dialogue-card.js
node --check public/js/ui/ui-components.js
node --check public/js/ui/npc-dialogue-ui.js
node --check public/js/ui/exploration.js
node --check public/js/ui/befriend.js
node --check public/js/ui/room-transition.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Run focused UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-card.test.js tests/unit/ui/ui-components.test.js tests/unit/ui/ui-components-selection-clear.test.js tests/unit/ui/npc-battle-intro.test.js tests/unit/ui/befriend.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/post-combat-shop.test.js
```

Expected: PASS.

- [ ] **Step 3: Run broader unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 5: Visual verification**

Ask the user before opening Playwright. After approval:

```bash
npm run dev
```

Navigate to `http://localhost:5173` with an iPhone-class viewport. Capture and immediately delete screenshots for:

- NPC dialogue card.
- Post-continue response choices with `Choose a response`.
- Friendly NPC item choices with `Choose an item`.
- Player `You` item request dialogue card.
- Creature befriend dialogue card and name choices.

Expected:

- Dialogue card fits in the action area without scrolling or clipping on `402 x 874`.
- `Translate`, `Learn`, and final `Continue` are visible above the home indicator.
- English glosses do not change neighboring Japanese baselines.
- Response screens use card choices with headings.

- [ ] **Step 6: Commit verification fixes**

If visual verification or tests require CSS or control-flow fixes, stage the edited source and test files:

```bash
git add public/js/ui public/game.css tests/unit/ui
git commit -m "Polish NPC dialogue action card"
```

---

## Self-Review Checklist

- Spec coverage: Tasks cover the dialogue card, token-first shared-row renderer, pagination, inert Translate/Learn, audio/log controls, word lookup, NPC post-combat dialogue, friendly NPC item rooms, player `You` dialogue, NPC battle intro, creature befriend flows, and headed choice screens.
- Placeholder scan: This plan intentionally avoids `TBD` and implementation placeholders. Every task includes concrete paths, snippets, commands, and expected outcomes.
- Type consistency: The plan consistently uses `showNpcDialogueCard()`, `renderDialogueTokenRows()`, `renderChoicesAsync()`, `tokens`, `overrides`, `useKanji`, `speaker`, `speakerId`, and `audio: { userId, key }`.
