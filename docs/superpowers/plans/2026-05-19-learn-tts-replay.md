# Learn TTS Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add neutral-voice audio replay buttons for the full sentence and each breakdown item in the dialogue Learn overlay.

**Architecture:** Keep the Learn lesson JSON schema unchanged and derive all replay text from `lesson.sourceText` and `lesson.breakdown[].text`. Add one neutral Learn audio helper in `public/js/tts.js` that delegates to the existing `/api/tts/dialogue-line` path, so both sentence and word replay reuse `TtsDialogueCache`'s `speakerId + text` cache key. Update `npc-dialogue-card.js` to render real dialogue audio buttons (`npc-dialogue-tool npc-dialogue-audio`) in fixed right-aligned action columns and wire them through a Learn-specific class.

**Tech Stack:** Browser ES modules, existing VOICEVOX TTS route/cache, Node `node:test` with module mocks, CSS in `public/game.css`, Vite dev server and Playwright MCP for final visual verification.

---

## Reference Context

- Approved spec: `docs/superpowers/specs/2026-05-19-learn-tts-replay-design.md`
- Approved preview: `/Users/michiarohrssen/.cursor/projects/Users-michiarohrssen-Documents-Claude-koto-dev/canvases/learn-tts-replay-preview.canvas.tsx`
- Learn UI renderer: `public/js/ui/npc-dialogue-card.js`
- Existing dialogue replay client: `public/js/tts.js`
- Existing TTS route: `src/routes/tts.js`
- Existing shared line cache: `src/services/tts-dialogue-cache.js`
- Existing Learn UI tests: `tests/unit/ui/npc-dialogue-card.test.js`
- Existing TTS client test pattern: `tests/unit/ui/dialogue-word-audio.test.js`

## File Structure

- Modify `public/js/tts.js`: export a neutral pronunciation speaker constant and `playNeutralLearnAudio(text)` helper that delegates to `playDialogueLineAudio({ text, speakerId: 11 })`.
- Modify `tests/unit/ui/dialogue-word-audio.test.js`: add direct coverage for the neutral Learn helper and its `/api/tts/dialogue-line` request body.
- Modify `public/js/ui/npc-dialogue-card.js`: render Learn replay buttons, add right-aligned action wrappers in markup, attach Learn-specific click handlers after the takeover is inserted.
- Modify `public/game.css`: add layout-only Learn classes for section headers and breakdown item grids; do not duplicate the audio button visual styling.
- Modify `tests/unit/ui/npc-dialogue-card.test.js`: add tests for rendered audio button classes, right-aligned wrapper classes, neutral helper calls, no Learn re-request on replay, and missing breakdown text behavior.

No server files should change unless implementation discovers that `/api/tts/dialogue-line` does not satisfy the contract. The preferred implementation reuses it unchanged.

---

### Task 1: Add Neutral Learn TTS Helper

**Files:**
- Modify: `tests/unit/ui/dialogue-word-audio.test.js`
- Modify: `public/js/tts.js`

- [ ] **Step 1: Write failing helper tests**

Update `tests/unit/ui/dialogue-word-audio.test.js` so test setup resets `localStorage` before each test, then add a Learn helper test.

Replace the top import and setup block with:

```js
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalLocalStorage = globalThis.localStorage;

function installAuthStorage() {
  globalThis.localStorage = {
    getItem: key => key === 'authToken' ? 'jwt-token' : 'false',
    setItem: () => {},
  };
}

describe('dialogue word audio', () => {
  beforeEach(() => {
    installAuthStorage();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.Audio = originalAudio;
    globalThis.localStorage = originalLocalStorage;
  });
```

Keep the existing `it('requests cached dialogue word audio...')` test inside the `describe`, then append:

```js
  it('requests neutral cached line audio for Learn replay', async () => {
    const fetchCalls = [];
    const audioUrls = [];
    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({
        url,
        headers: options.headers,
        body: JSON.parse(options.body)
      });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          audio: {
            userId: 'user-1',
            key: 'line12345678.wav',
            url: '/api/tts/dialogue/user-1/line12345678.wav',
            speakerId: 11
          }
        })
      };
    };
    globalThis.Audio = class {
      constructor(url) {
        this.url = url;
        audioUrls.push(url);
      }

      play() {
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }

      pause() {}
    };

    const {
      NEUTRAL_PRONUNCIATION_SPEAKER_ID,
      playNeutralLearnAudio
    } = await import(`../../../public/js/tts.js?test=${Date.now()}-${Math.random()}`);

    assert.equal(NEUTRAL_PRONUNCIATION_SPEAKER_ID, 11);
    const audio = await playNeutralLearnAudio('森で');

    assert.deepEqual(fetchCalls, [{
      url: '/api/tts/dialogue-line',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-token'
      },
      body: { text: '森で', speakerId: 11 }
    }]);
    assert.deepEqual(audioUrls, ['/api/tts/dialogue/user-1/line12345678.wav']);
    assert.deepEqual(audio, {
      userId: 'user-1',
      key: 'line12345678.wav',
      url: '/api/tts/dialogue/user-1/line12345678.wav',
      speakerId: 11
    });
  });
});
```

- [ ] **Step 2: Run helper test to verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/dialogue-word-audio.test.js
```

Expected: FAIL with a module export error because `NEUTRAL_PRONUNCIATION_SPEAKER_ID` and `playNeutralLearnAudio` do not exist yet.

- [ ] **Step 3: Implement the neutral helper**

In `public/js/tts.js`, replace the current neutral word speaker constant:

```js
const WORD_SPEAKER_ID = 11; // 玄野武宏 (ノーマル) - clear pronunciation for dictionary words
```

with:

```js
export const NEUTRAL_PRONUNCIATION_SPEAKER_ID = 11; // 玄野武宏 (ノーマル) - clear pronunciation
const WORD_SPEAKER_ID = NEUTRAL_PRONUNCIATION_SPEAKER_ID;
```

Add this export immediately after `playDialogueLineAudio()`:

```js
export async function playNeutralLearnAudio(text) {
  return playDialogueLineAudio({
    text,
    speakerId: NEUTRAL_PRONUNCIATION_SPEAKER_ID
  });
}
```

Do not change `playDialogueWordAudio()` for this feature. Learn replay intentionally uses the line cache, not `TtsWordCache`.

- [ ] **Step 4: Run helper test to verify pass**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/dialogue-word-audio.test.js
```

Expected: PASS. The new test should prove Learn replay posts to `/api/tts/dialogue-line` with `speakerId: 11`.

- [ ] **Step 5: Commit task 1**

```bash
git add public/js/tts.js tests/unit/ui/dialogue-word-audio.test.js
git commit -m "Add neutral Learn TTS helper"
```

---

### Task 2: Add Failing Learn Overlay Tests

**Files:**
- Modify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Extend the fake DOM for data attributes**

In `tests/unit/ui/npc-dialogue-card.test.js`, update `FakeElement` to preserve parsed attributes and `data-*` values from rendered HTML.

Add these properties in the constructor:

```js
this.attributes = {};
```

Add these methods to `FakeElement`:

```js
getAttribute(name) {
  return this.attributes[name] ?? null;
}

setAttribute(name, value) {
  this.attributes[name] = String(value);
  if (name === 'class') this.className = String(value);
  if (name === 'disabled') this.disabled = true;
  if (name.startsWith('data-')) {
    const key = name
      .slice(5)
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    this.dataset[key] = String(value);
  }
}
```

In `parseInnerHtmlElements()`, after `child.disabled = ...`, parse attributes:

```js
const attrRe = /\s([a-zA-Z0-9:-]+)(?:="([^"]*)")?/g;
let attrMatch;
while ((attrMatch = attrRe.exec(attrs))) {
  const [, name, value = ''] = attrMatch;
  child.setAttribute(name, value);
}
```

- [ ] **Step 2: Add Learn audio mock state**

Near the existing audio state variables, add:

```js
let playedLearnAudioRequests = [];
```

In the `../../../public/js/tts.js` module mock, add a named export:

```js
playNeutralLearnAudio: async (text) => {
  playedLearnAudioRequests.push(text);
  return { userId: 'user-1', key: 'learn-line.wav', speakerId: 11 };
},
```

In `beforeEach()`, reset it:

```js
playedLearnAudioRequests = [];
```

- [ ] **Step 3: Add failing markup test**

Append this test near the existing Learn tests:

```js
  it('renders Learn replay buttons with dialogue audio styling and right-aligned wrappers', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
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
    await new Promise(resolve => setTimeout(resolve, 0));

    const learnAudioButtons = actionArea.querySelectorAll('.npc-dialogue-learn-audio');
    assert.equal(learnAudioButtons.length, 1 + DEFAULT_LEARN_RESPONSE.lesson.breakdown.length);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-section-head/);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-section-action/);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-token-grid/);
    assert.match(actionArea.innerHTML, /npc-dialogue-learn-token-action/);
    assert.match(actionArea.innerHTML, /npc-dialogue-tool npc-dialogue-audio npc-dialogue-learn-audio/);
    assert.match(actionArea.innerHTML, /aria-label="Play sentence audio"/);
    assert.match(actionArea.innerHTML, /aria-label="Play audio for 花"/);
    assert.doesNotMatch(actionArea.innerHTML, /Play word/);
    assert.doesNotMatch(actionArea.innerHTML, /Listen/);
  });
```

- [ ] **Step 4: Add failing behavior test**

Append:

```js
  it('plays neutral Learn audio without re-requesting the lesson', async () => {
    showNpcDialogueCard({
      speaker: 'Flower',
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
    await new Promise(resolve => setTimeout(resolve, 0));

    const [sentenceButton, firstBreakdownButton] = actionArea.querySelectorAll('.npc-dialogue-learn-audio');
    sentenceButton.click();
    firstBreakdownButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(playedLearnAudioRequests, ['花は森で光を見た。', '花']);
    assert.equal(learnRequests.length, 1);
  });
```

- [ ] **Step 5: Add failing missing-text test**

Append:

```js
  it('omits replay buttons for missing Learn audio text', async () => {
    learnResponse = JSON.parse(JSON.stringify(DEFAULT_LEARN_RESPONSE));
    learnResponse.lesson.breakdown = [
      { kind: 'particle', text: '', reading: 'わ', meaning: 'topic marker', explanation: 'Missing text should not render replay.' },
      { kind: 'noun', text: '森', reading: 'もり', meaning: 'forest', explanation: 'Valid text should render replay.' }
    ];

    showNpcDialogueCard({
      speaker: 'Mira',
      tokens: [{ surface: '森', baseForm: '森', reading: 'もり', meaning: 'forest', pos: 'noun' }],
      knownWords: new Set(),
    });

    const [, learnButton] = actionArea.querySelectorAll('.npc-dialogue-utility');
    learnButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const learnAudioButtons = actionArea.querySelectorAll('.npc-dialogue-learn-audio');
    assert.equal(learnAudioButtons.length, 2); // sentence + valid 森 breakdown item
    assert.doesNotMatch(actionArea.innerHTML, /Play audio for "/);
    assert.doesNotMatch(actionArea.innerHTML, /data-learn-audio-text=""/);
    assert.match(actionArea.innerHTML, /aria-label="Play audio for 森"/);
  });
```

- [ ] **Step 6: Run Learn overlay tests to verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL because `playNeutralLearnAudio` is not imported by `npc-dialogue-card.js`, Learn audio buttons are not rendered, and Learn-specific click handlers do not exist.

- [ ] **Step 7: Commit failing tests**

```bash
git add tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Test Learn TTS replay controls"
```

---

### Task 3: Render And Wire Learn Replay Buttons

**Files:**
- Modify: `public/js/ui/npc-dialogue-card.js`

- [ ] **Step 1: Import the neutral helper**

Change the TTS import at the top of `public/js/ui/npc-dialogue-card.js` from:

```js
import { playDialogueAudio, playDialogueLineAudio } from '../tts.js';
```

to:

```js
import { playDialogueAudio, playDialogueLineAudio, playNeutralLearnAudio } from '../tts.js';
```

- [ ] **Step 2: Add Learn audio button renderer**

Add these helpers near `renderLessonBreakdownItem()`:

```js
function cleanLearnAudioText(value) {
  return String(value || '').trim();
}

function renderLearnAudioButton(text, ariaLabel, extraClass = '') {
  const audioText = cleanLearnAudioText(text);
  if (!audioText) return '';
  const classes = [
    'npc-dialogue-tool',
    'npc-dialogue-audio',
    'npc-dialogue-learn-audio',
    extraClass
  ].filter(Boolean).join(' ');
  return `
    <button class="${classes}" type="button" data-learn-audio-text="${esc(audioText)}" aria-label="${esc(ariaLabel)}">♪</button>
  `;
}
```

- [ ] **Step 3: Update breakdown item markup**

Replace `renderLessonBreakdownItem(item)` with:

```js
function renderLessonBreakdownItem(item) {
  const audioText = cleanLearnAudioText(item?.text);
  const audioButton = renderLearnAudioButton(
    audioText,
    `Play audio for ${audioText}`,
    'npc-dialogue-learn-token-audio'
  );
  return `
    <div class="npc-dialogue-learn-token">
      <div class="npc-dialogue-learn-token-grid">
        <div class="npc-dialogue-learn-token-copy">
          <div class="npc-dialogue-learn-token-head">
            <span class="npc-dialogue-learn-token-jp">${esc(item.text || '')}</span>
            <span class="npc-dialogue-learn-token-reading">${esc(item.reading || '')}</span>
          </div>
          <div class="npc-dialogue-learn-token-body">
            <span class="npc-dialogue-learn-token-role">${esc(item.kind || '')}</span>
            <span class="npc-dialogue-learn-token-meaning">${esc(item.meaning || '')}</span>
            ${item.explanation ? `<span class="npc-dialogue-learn-token-detail">${esc(item.explanation)}</span>` : ''}
          </div>
        </div>
        ${audioButton ? `<div class="npc-dialogue-learn-token-action">${audioButton}</div>` : ''}
      </div>
    </div>
  `;
}
```

- [ ] **Step 4: Update sentence section markup**

Inside the success branch of `renderLearnTakeover()`, replace the sentence section:

```js
        <section class="npc-dialogue-learn-section">
          <h3>Sentence</h3>
          <p class="npc-dialogue-learn-source">${esc(lesson.sourceText || sourceText)}</p>
        </section>
```

with:

```js
        <section class="npc-dialogue-learn-section">
          <div class="npc-dialogue-learn-section-head">
            <h3>Sentence</h3>
            <div class="npc-dialogue-learn-section-action">
              ${renderLearnAudioButton(lesson.sourceText || sourceText, 'Play sentence audio', 'npc-dialogue-learn-sentence-audio')}
            </div>
          </div>
          <p class="npc-dialogue-learn-source">${esc(lesson.sourceText || sourceText)}</p>
        </section>
```

Do not add replay buttons to `Pronunciation`, `Translation`, `Grammar hints`, or `Other tips`.

- [ ] **Step 5: Attach Learn-specific click handlers**

Inside `showNpcDialogueCard()`'s `render()` function, add this helper near `setLearnTakeover`:

```js
      const attachLearnAudioHandlers = () => {
        for (const button of actionArea.querySelectorAll('.npc-dialogue-learn-audio')) {
          button.addEventListener('click', async (event) => {
            event.stopPropagation?.();
            const text = cleanLearnAudioText(event.currentTarget?.dataset?.learnAudioText);
            if (!text) return;
            event.currentTarget.disabled = true;
            await playNeutralLearnAudio(text);
            if (!resolved && actionArea.querySelector('.npc-dialogue-learn-takeover')) {
              event.currentTarget.disabled = false;
            }
          });
        }
      };
```

Then update `setLearnTakeover()` so it calls the helper after wiring close/retry:

```js
      const setLearnTakeover = (state, lesson = null, diagnostic = null) => {
        closeTranslationSheet();
        closeLearnTakeover();
        actionArea.insertAdjacentHTML('beforeend', renderLearnTakeover({ state, sourceText, lesson, diagnostic }));
        actionArea.querySelector('.npc-dialogue-learn-close')?.addEventListener('click', closeLearnTakeover);
        actionArea.querySelector('.npc-dialogue-learn-retry')?.addEventListener('click', requestLearn);
        attachLearnAudioHandlers();
      };
```

This intentionally targets `.npc-dialogue-learn-audio`, not `.npc-dialogue-audio`, so the main dialogue replay button keeps its existing behavior.

- [ ] **Step 6: Run Learn overlay tests to verify pass or identify CSS-only failures**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS for JS behavior and markup assertions. If any assertion fails because the exact class order differs, keep the required classes and update the test to assert the actual rendered class string without weakening the requirement that `npc-dialogue-tool`, `npc-dialogue-audio`, and `npc-dialogue-learn-audio` all appear on Learn replay buttons.

- [ ] **Step 7: Commit task 3**

```bash
git add public/js/ui/npc-dialogue-card.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Render Learn replay controls"
```

---

### Task 4: Add Right-Aligned Learn Layout CSS

**Files:**
- Modify: `public/game.css`
- Test: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Add layout-only CSS near existing Learn styles**

In `public/game.css`, near the existing `.npc-dialogue-learn-section` and `.npc-dialogue-learn-token` rules, add:

```css
.npc-dialogue-learn-section-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.npc-dialogue-learn-section-head h3 {
  margin: 0;
}

.npc-dialogue-learn-section-action,
.npc-dialogue-learn-token-action {
  display: flex;
  justify-content: flex-end;
}

.npc-dialogue-learn-token-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: start;
  gap: 12px;
}

.npc-dialogue-learn-token-copy {
  min-width: 0;
}
```

Do not add `background`, `border`, `box-shadow`, dimensions, color, or typography to `.npc-dialogue-learn-audio`; those visuals should continue to come from `.npc-dialogue-tool`.

- [ ] **Step 2: Adjust existing heading margin if needed**

If the existing rule:

```css
.npc-dialogue-learn-section h3 {
  margin: 0 0 8px;
  color: #1f1712;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

causes extra vertical offset in the new header row, keep the base style and rely on the more specific override:

```css
.npc-dialogue-learn-section-head h3 {
  margin: 0;
}
```

Do not remove the existing `h3` color, size, uppercase, or letter spacing.

- [ ] **Step 3: Run syntax and focused tests**

Run:

```bash
node --check public/js/tts.js && node --check public/js/ui/npc-dialogue-card.js && node --experimental-test-module-mocks --test tests/unit/ui/dialogue-word-audio.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: all syntax checks pass and both focused test files pass.

- [ ] **Step 4: Commit task 4**

```bash
git add public/game.css public/js/tts.js public/js/ui/npc-dialogue-card.js tests/unit/ui/dialogue-word-audio.test.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Align Learn replay buttons"
```

---

### Task 5: Full Verification And Visual Check

**Files:**
- Verify: `public/js/tts.js`
- Verify: `public/js/ui/npc-dialogue-card.js`
- Verify: `public/game.css`
- Verify: `tests/unit/ui/dialogue-word-audio.test.js`
- Verify: `tests/unit/ui/npc-dialogue-card.test.js`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node --check public/js/tts.js && node --check public/js/ui/npc-dialogue-card.js && node --experimental-test-module-mocks --test tests/unit/ui/dialogue-word-audio.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 2: Run unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS. If unrelated pre-existing failures appear, record the failing test names and confirm the focused Learn/TTS tests still pass.

- [ ] **Step 3: Ask before browser visual verification**

Because this changes CSS/visual layout, ask the user before launching Playwright MCP:

```text
This change needs visual verification. May I open the Playwright browser to inspect the Learn overlay and take a screenshot?
```

Do not open Playwright until the user agrees.

- [ ] **Step 4: Run local dev server for visual verification after approval**

Before starting a dev server, check existing terminals for an active `npm run dev`. If none is running, run:

```bash
npm run dev
```

Use `block_until_ms: 0` so it stays managed in the background. Then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 5: Inspect the Learn overlay in browser**

Using Playwright MCP after approval:

1. Navigate to `http://localhost:5173`.
2. Reach a tokenized NPC dialogue card with a functional `Learn` button.
3. Open Learn.
4. Confirm the sentence section has one right-aligned `♪` square button matching the main dialogue replay button.
5. Confirm each breakdown item with text has one right-aligned `♪` square button.
6. Confirm there are no labeled `Listen` or `Play word` controls.
7. Take a screenshot for evidence.
8. Delete the screenshot file immediately after it has been shown.

Expected: visual layout matches the approved preview and exact dialogue audio button styling.

- [ ] **Step 6: Final status**

Report:

- Focused test command and result.
- Unit suite command and result.
- Visual verification screenshot result, or explain if browser permission was not granted.
- Any unrelated dirty files ignored.

Do not claim the visual fix is complete unless Step 5 was performed successfully.

---

## Self-Review Checklist

- Spec coverage: Tasks cover neutral voice, `speakerId + text` cache reuse, no Learn schema change, exact dialogue audio button classes, right alignment, missing text omission, and tests.
- Placeholder scan: This plan contains no placeholder markers or unspecified implementation steps.
- Type consistency: The plan consistently uses `NEUTRAL_PRONUNCIATION_SPEAKER_ID`, `playNeutralLearnAudio(text)`, `data-learn-audio-text`, `.npc-dialogue-learn-audio`, and the existing `npc-dialogue-tool npc-dialogue-audio` classes.
