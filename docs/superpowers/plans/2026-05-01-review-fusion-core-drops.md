# Review Fusion Core Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5% Fusion Core drop chance to eligible vocab reviews and close the dictionary popup after successful "I knew it" / "I forgot" actions.

**Architecture:** Put reward eligibility and rolling in a small server-side service so client callers cannot spoof eligibility. The known-words review route captures the pre-review FSRS card before auto-create, applies the service, and returns an optional `fusionCoreDrop` payload plus updated game state. Client code only displays the returned reward and updates local state.

**Tech Stack:** ES modules, Express routes, `node:test`, `ts-fsrs` state constants, existing browser UI modules.

---

## File Structure

- Create `src/game/services/review-fusion-core-service.js`
  - Owns the 5% drop rate, pre-review eligibility rules, and meta increment.
  - Keeps route logic small and makes randomness easy to test without touching Express.
- Create `tests/unit/game/review-fusion-core-service.test.js`
  - Pure unit coverage for eligibility and drop rolling.
- Modify `src/routes/game/known-words.js`
  - Captures pre-review card state.
  - Calls the reward service after grading.
  - Saves game state only when a Fusion Core is awarded.
- Modify `tests/unit/known-words-review.test.js`
  - Adds route-level coverage proving the endpoint returns reward state and blocks first-time `again` farming.
- Modify `public/game.js`
  - Handles `fusionCoreDrop` from speed review `sendReview`.
  - Applies returned game state when present.
- Modify `public/js/ui/dialogue-word-lookup.js`
  - Handles `fusionCoreDrop` from lookup popup reviews.
  - Closes popup after successful review and keeps it open on failure.
  - Accepts an optional `onStateUpdate` callback from `init`.
- Create `tests/unit/dialogue-word-lookup-actions.test.js`
  - Focused DOM-stub tests for popup close/failure/reward behavior.
- No changes to `data/dictionary.json`, dialogue frames, Fusion Lab costs, or tutorial guaranteed Fusion Core reward.

## Task 1: Add Server Reward Service

**Files:**
- Create: `src/game/services/review-fusion-core-service.js`
- Create: `tests/unit/game/review-fusion-core-service.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/game/review-fusion-core-service.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { State } from 'ts-fsrs';
import {
  REVIEW_FUSION_CORE_DROP_RATE,
  isReviewFusionCoreEligible,
  rollReviewFusionCoreDrop
} from '../../../src/game/services/review-fusion-core-service.js';

describe('review Fusion Core reward eligibility', () => {
  it('makes good reviews eligible even when the card is new or missing', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'good',
      isDiscovery: false,
      preReviewCard: null
    }), true);
  });

  it('blocks discovery reviews even when the grade is good', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'good',
      isDiscovery: true,
      preReviewCard: { state: State.Review }
    }), false);
  });

  it('blocks first-time again reviews with no pre-review card', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'again',
      isDiscovery: false,
      preReviewCard: null
    }), false);
  });

  it('blocks again reviews for existing New cards', () => {
    assert.equal(isReviewFusionCoreEligible({
      grade: 'again',
      isDiscovery: false,
      preReviewCard: { state: State.New }
    }), false);
  });

  it('allows again reviews for cards that were already reviewed or known', () => {
    for (const state of [State.Learning, State.Review, State.Relearning]) {
      assert.equal(isReviewFusionCoreEligible({
        grade: 'again',
        isDiscovery: false,
        preReviewCard: { state }
      }), true);
    }
  });
});

describe('rollReviewFusionCoreDrop', () => {
  it('awards one Fusion Core when eligible and the roll is under 5%', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => REVIEW_FUSION_CORE_DROP_RATE - 0.001
    });

    assert.deepEqual(drop, {
      awarded: true,
      fusionCores: 3,
      message: 'Obtained 1x Fusion Core!'
    });
    assert.equal(meta.fusionCores, 3);
  });

  it('does not award when eligible but the roll is at the threshold', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => REVIEW_FUSION_CORE_DROP_RATE
    });

    assert.equal(drop, null);
    assert.equal(meta.fusionCores, 2);
  });

  it('does not award when the review is not eligible', () => {
    const meta = { fusionCores: 2 };

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: false,
      random: () => 0
    });

    assert.equal(drop, null);
    assert.equal(meta.fusionCores, 2);
  });

  it('treats missing fusionCore count as zero before awarding', () => {
    const meta = {};

    const drop = rollReviewFusionCoreDrop(meta, {
      eligible: true,
      random: () => 0
    });

    assert.equal(drop.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
  });
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
node --test tests/unit/game/review-fusion-core-service.test.js
```

Expected: FAIL with an import/module-not-found error for `review-fusion-core-service.js`.

- [ ] **Step 3: Implement the service**

Create `src/game/services/review-fusion-core-service.js`:

```js
import { State } from 'ts-fsrs';

export const REVIEW_FUSION_CORE_DROP_RATE = 0.05;

const REVIEW_REWARD_KNOWN_STATES = new Set([
  State.Learning,
  State.Review,
  State.Relearning
]);

export function isReviewFusionCoreEligible({ grade, isDiscovery = false, preReviewCard = null } = {}) {
  if (isDiscovery) return false;
  if (grade === 'good') return true;
  if (grade !== 'again') return false;
  if (!preReviewCard) return false;
  return REVIEW_REWARD_KNOWN_STATES.has(preReviewCard.state);
}

export function rollReviewFusionCoreDrop(meta, {
  eligible,
  random = Math.random
} = {}) {
  if (!eligible) return null;
  if (random() >= REVIEW_FUSION_CORE_DROP_RATE) return null;

  const current = Number.isFinite(meta?.fusionCores) ? meta.fusionCores : 0;
  meta.fusionCores = current + 1;

  return {
    awarded: true,
    fusionCores: meta.fusionCores,
    message: 'Obtained 1x Fusion Core!'
  };
}
```

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
node --test tests/unit/game/review-fusion-core-service.test.js
```

Expected: PASS.

## Task 2: Integrate Reward Service Into Known-Words Review Route

**Files:**
- Modify: `src/routes/game/known-words.js`
- Modify: `tests/unit/known-words-review.test.js`

- [ ] **Step 1: Add failing route-level tests**

Append these imports to the top of `tests/unit/known-words-review.test.js`:

```js
import express from 'express';
import request from 'supertest';
import { State } from 'ts-fsrs';
import { createKnownWordsRoutes } from '../../src/routes/game/known-words.js';
```

Append this helper and test block after the existing `describe('known-words review — auto-create card', ...)` block:

```js
function buildKnownWordsApp({
  userId,
  meta = { fusionCores: 0 },
  random = () => 0
} = {}) {
  let saveCalls = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: userId };
    req.gameManager = {
      getMeta: () => meta
    };
    req.saveGame = () => {
      saveCalls += 1;
    };
    req.getEnrichedGameState = () => ({ meta: { ...meta } });
    req.getSettings = () => ({ dailyWordLimit: 10 });
    next();
  });
  app.use('/known-words', createKnownWordsRoutes({
    reviewFusionCoreRandom: random
  }));
  return { app, meta, getSaveCalls: () => saveCalls };
}

describe('known-words review — Fusion Core drops', () => {
  let tempDir;
  const userId = 'test-user-review-drops';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'srs-drop-test-'));
    configureSrs({ dataDir: tempDir });
  });

  it('awards a Fusion Core for an eligible good review when the roll succeeds', async () => {
    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '知る', grade: 'good' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.fusionCoreDrop, {
      awarded: true,
      fusionCores: 1,
      message: 'Obtained 1x Fusion Core!'
    });
    assert.equal(res.body.state.meta.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
    assert.equal(getSaveCalls(), 1);
  });

  it('does not award for a first-time again review even when the roll succeeds', async () => {
    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '忘れる', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(res.body.state, undefined);
    assert.equal(meta.fusionCores, 0);
    assert.equal(getSaveCalls(), 0);
  });

  it('awards for an again review when the card was already reviewed before the request', async () => {
    createCard(userId, 'vocab', '古い', { word: '古い' });
    const reviewedCard = gradeCard(userId, 'vocab', '古い', 'good');
    assert.equal(reviewedCard.state === State.Learning || reviewedCard.state === State.Review, true);

    const { app, meta, getSaveCalls } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '古い', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop.awarded, true);
    assert.equal(res.body.fusionCoreDrop.fusionCores, 1);
    assert.equal(meta.fusionCores, 1);
    assert.equal(getSaveCalls(), 1);
  });

  it('does not award for an again review when the existing card is still New', async () => {
    createCard(userId, 'vocab', '新しい', { word: '新しい' });

    const { app, meta } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '新しい', grade: 'again' });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(meta.fusionCores, 0);
  });

  it('does not award discovery reviews', async () => {
    const { app, meta } = buildKnownWordsApp({ userId });

    const res = await request(app)
      .post('/known-words/review')
      .send({ word: '発見', grade: 'good', isDiscovery: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.fusionCoreDrop, undefined);
    assert.equal(meta.fusionCores, 0);
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
node --test tests/unit/known-words-review.test.js
```

Expected: FAIL because `createKnownWordsRoutes()` does not accept `reviewFusionCoreRandom` and the route does not return `fusionCoreDrop`.

- [ ] **Step 3: Import the reward service in the route**

In `src/routes/game/known-words.js`, add:

```js
import {
  isReviewFusionCoreEligible,
  rollReviewFusionCoreDrop
} from '../../game/services/review-fusion-core-service.js';
```

- [ ] **Step 4: Allow deterministic random injection**

Change the route factory signature in `src/routes/game/known-words.js` from:

```js
export function createKnownWordsRoutes() {
```

to:

```js
export function createKnownWordsRoutes({ reviewFusionCoreRandom = Math.random } = {}) {
```

No change is needed in `src/routes/game/index.js`; the existing `createKnownWordsRoutes()` call uses the default random function.

- [ ] **Step 5: Add a small route response helper**

Inside `createKnownWordsRoutes()`, before the `/review` route, add:

```js
  function attachFusionCoreDrop(req, response, eligible) {
    const meta = req.gameManager?.getMeta?.();
    if (!meta) return response;

    const fusionCoreDrop = rollReviewFusionCoreDrop(meta, {
      eligible,
      random: reviewFusionCoreRandom
    });
    if (!fusionCoreDrop) return response;

    req.saveGame?.();
    return {
      ...response,
      fusionCoreDrop,
      state: req.getEnrichedGameState?.()
    };
  }
```

- [ ] **Step 6: Capture pre-review card and apply reward response**

In the `/review` route, replace the current card auto-create and response block:

```js
      // Auto-create card if it doesn't exist (allows fast-tracking words)
      const existingCards = getDeckCards(req.user.id, 'vocab');
      if (!existingCards.find(c => c.id === word)) {
        createCard(req.user.id, 'vocab', word, { word });
      }
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
```

with:

```js
      // Capture pre-review state before auto-create so first-time "again"
      // reviews cannot farm Fusion Core drops.
      const existingCards = getDeckCards(req.user.id, 'vocab');
      const preReviewCard = existingCards.find(c => c.id === word) || null;
      const fusionCoreEligible = isReviewFusionCoreEligible({
        grade,
        isDiscovery,
        preReviewCard
      });

      // Auto-create card if it doesn't exist (allows fast-tracking words).
      if (!preReviewCard) {
        createCard(req.user.id, 'vocab', word, { word });
      }
      const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
```

Then replace the discovery response:

```js
        return res.json({
          ok: true,
          mastered: grade === 'good',
          card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses },
          todayCount: counts.todayCount,
          atLimit: counts.atLimit
        });
```

with:

```js
        const response = {
          ok: true,
          mastered: grade === 'good',
          card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses },
          todayCount: counts.todayCount,
          atLimit: counts.atLimit
        };
        return res.json(attachFusionCoreDrop(req, response, fusionCoreEligible));
```

Finally replace the normal response:

```js
      res.json({
        ok: true,
        mastered: grade === 'good',
        card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses }
      });
```

with:

```js
      const response = {
        ok: true,
        mastered: grade === 'good',
        card: { state: updatedCard.state, due: updatedCard.due, lapses: updatedCard.lapses }
      };
      res.json(attachFusionCoreDrop(req, response, fusionCoreEligible));
```

- [ ] **Step 7: Run route tests and verify they pass**

Run:

```bash
node --test tests/unit/known-words-review.test.js
```

Expected: PASS.

## Task 3: Show Drops From Speed Review Cards

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Update speed review callback to apply reward state**

In `public/game.js`, replace this callback body:

```js
    sendReview: async (vid, sid, grade, wordText) => {
      const internalGrade = grade >= 3 ? 'good' : 'again';
      const result = await reviewVocabWord(wordText, internalGrade);
      if (result?.mastered) addKnownWord(wordText);
      else if (result && !result.mastered) removeKnownWord(wordText);
      return result;
    },
```

with:

```js
    sendReview: async (vid, sid, grade, wordText) => {
      const internalGrade = grade >= 3 ? 'good' : 'again';
      const result = await reviewVocabWord(wordText, internalGrade);
      if (result?.state) updateGameState(result.state);
      if (result?.mastered) addKnownWord(wordText);
      else if (result && !result.mastered) removeKnownWord(wordText);
      if (result?.fusionCoreDrop?.awarded) {
        const anchor = document.getElementById('speed-review-content')
          || document.getElementById('speed-review-modal')
          || document.body;
        showWordLevelUp(anchor, '', {
          message: result.fusionCoreDrop.message || 'Obtained 1x Fusion Core!'
        });
      }
      return result;
    },
```

- [ ] **Step 2: Syntax-check the modified frontend coordinator**

Run:

```bash
node --check public/game.js
```

Expected: prints no syntax errors.

## Task 4: Close Dictionary Popup After Successful Lookup Review

**Files:**
- Modify: `public/js/ui/dialogue-word-lookup.js`
- Modify: `public/game.js`
- Create: `tests/unit/dialogue-word-lookup-actions.test.js`

- [ ] **Step 1: Write failing lookup action tests**

Create `tests/unit/dialogue-word-lookup-actions.test.js`:

```js
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let reviewResponse = { ok: true, mastered: true };
let levelUpCalls = [];

await mock.module('../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    getKnownWords: () => new Set(),
    addKnownWord: () => {}
  }
});

await mock.module('../../public/js/api.js', {
  namedExports: {
    reviewVocabWord: async () => reviewResponse
  }
});

await mock.module('../../public/js/ui/word-level-up.js', {
  namedExports: {
    showWordLevelUp: (...args) => {
      levelUpCalls.push(args);
    }
  }
});

await mock.module('../../public/js/ui/romaji.js', {
  namedExports: {
    buildHeadwordRuby: word => word
  }
});

function createClassList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value)
  };
}

function createElement(id = '') {
  return {
    id,
    style: {},
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    children: [],
    classList: createClassList(),
    listeners: new Map(),
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    contains(target) {
      return target === this;
    },
    getBoundingClientRect() {
      return { left: 20, top: 20, width: 40, height: 20 };
    },
    click() {
      return this.listeners.get('click')?.({
        stopPropagation() {},
        target: this,
        currentTarget: this
      });
    }
  };
}

function setupDom() {
  const elements = new Map();
  for (const id of [
    'lookup-popup',
    'lookup-popup-word',
    'lookup-popup-pos',
    'lookup-popup-meanings',
    'lookup-popup-state',
    'lookup-state-dot',
    'lookup-state-text',
    'lookup-action-forgot',
    'lookup-action-knew',
    'lookup-popup-close'
  ]) {
    elements.set(id, createElement(id));
  }

  const container = createElement('container');
  const wordSpan = createElement('word-span');
  wordSpan.dataset.base = '知る';
  wordSpan.dataset.reading = 'しる';
  wordSpan.dataset.meaning = 'know';
  wordSpan.dataset.meanings = JSON.stringify([{ en: 'know' }]);
  container.querySelectorAll = selector => selector === '.jp-word' ? [wordSpan] : [];

  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844
  };
  globalThis.document = {
    body: createElement('body'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => createElement(tag),
    createTextNode: text => ({ textContent: text }),
    addEventListener() {}
  };

  return {
    elements,
    container,
    wordSpan,
    popup: elements.get('lookup-popup'),
    knewBtn: elements.get('lookup-action-knew'),
    forgotBtn: elements.get('lookup-action-forgot')
  };
}

describe('dialogue-word-lookup review actions', () => {
  let lookup;

  beforeEach(async () => {
    reviewResponse = { ok: true, mastered: true };
    levelUpCalls = [];
    lookup = await import(`../../public/js/ui/dialogue-word-lookup.js?test=${Date.now()}-${Math.random()}`);
  });

  it('closes the popup after a successful I knew it review', async () => {
    const dom = setupDom();
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    assert.equal(dom.popup.classList.contains('visible'), true);

    await dom.knewBtn.click();
    assert.equal(dom.popup.classList.contains('visible'), false);
  });

  it('closes the popup after a successful I forgot review', async () => {
    const dom = setupDom();
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.forgotBtn.click();

    assert.equal(dom.popup.classList.contains('visible'), false);
  });

  it('keeps the popup open when review fails', async () => {
    const dom = setupDom();
    reviewResponse = { ok: false };
    lookup.init({ showToast: () => {}, pauseAutoDismiss: () => {} });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.knewBtn.click();

    assert.equal(dom.popup.classList.contains('visible'), true);
  });

  it('shows the Fusion Core popup and applies returned game state', async () => {
    const dom = setupDom();
    let stateUpdate = null;
    reviewResponse = {
      ok: true,
      mastered: true,
      fusionCoreDrop: {
        awarded: true,
        message: 'Obtained 1x Fusion Core!'
      },
      state: { meta: { fusionCores: 1 } }
    };
    lookup.init({
      showToast: () => {},
      pauseAutoDismiss: () => {},
      onStateUpdate: state => {
        stateUpdate = state;
      }
    });
    lookup.attachWordClickHandlers(dom.container);

    dom.wordSpan.click();
    await dom.knewBtn.click();

    assert.equal(levelUpCalls.length, 2);
    assert.deepEqual(levelUpCalls[1][2], { message: 'Obtained 1x Fusion Core!' });
    assert.deepEqual(stateUpdate, { meta: { fusionCores: 1 } });
  });
});
```

- [ ] **Step 2: Run lookup action tests and verify they fail**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-word-lookup-actions.test.js
```

Expected: FAIL because successful review does not close the popup and `onStateUpdate` is not handled.

- [ ] **Step 3: Add state update callback storage**

In `public/js/ui/dialogue-word-lookup.js`, change:

```js
let _getKanaMode = null; // () => boolean, injected via init
```

to:

```js
let _getKanaMode = null; // () => boolean, injected via init
let _onStateUpdate = null; // optional callback for review reward state
```

Then change:

```js
export function init({ showToast, pauseAutoDismiss, getKanaMode }) {
  _showToast = showToast;
  _pauseAutoDismiss = pauseAutoDismiss;
  _getKanaMode = getKanaMode || null;
```

to:

```js
export function init({ showToast, pauseAutoDismiss, getKanaMode, onStateUpdate }) {
  _showToast = showToast;
  _pauseAutoDismiss = pauseAutoDismiss;
  _getKanaMode = getKanaMode || null;
  _onStateUpdate = typeof onStateUpdate === 'function' ? onStateUpdate : null;
```

- [ ] **Step 4: Return async review promises from popup button handlers**

In `public/js/ui/dialogue-word-lookup.js`, replace:

```js
  dom.forgotBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleReview('again');
  });
  dom.knewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleReview('good');
  });
```

with:

```js
  dom.forgotBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    return handleReview('again');
  });
  dom.knewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    return handleReview('good');
  });
```

This keeps browser behavior the same and lets the unit tests await the async click path.

- [ ] **Step 5: Handle reward payload and close on success**

In `public/js/ui/dialogue-word-lookup.js`, replace `handleReview()` with:

```js
async function handleReview(grade) {
  if (!_currentWord) return;

  const word = _currentWord;
  const result = await reviewVocabWord(word, grade);
  if (!result?.ok) {
    _showToast?.('Review failed');
    return;
  }

  // Update client-side state based on grade.
  if (grade === 'good') {
    addKnownWord(word);
    dom.stateDot.style.background = 'var(--status-success, #2ecc71)';
    dom.stateText.textContent = 'Known';
    _showToast?.('Marked as known');

    const kana = _getKanaMode?.() ?? false;
    const displayWord = kana && _currentReading ? _currentReading : word;
    showWordLevelUp(dom.popup, displayWord);
  } else {
    dom.stateDot.style.background = 'var(--accent-orange, #e67e22)';
    dom.stateText.textContent = 'Learning';
    _showToast?.('Marked for review');
  }

  if (result.state) {
    _onStateUpdate?.(result.state);
  }

  if (result.fusionCoreDrop?.awarded) {
    showWordLevelUp(dom.popup || document.body, '', {
      message: result.fusionCoreDrop.message || 'Obtained 1x Fusion Core!'
    });
  }

  hidePopup();
}
```

- [ ] **Step 6: Pass state update callback from the frontend coordinator**

In `public/game.js`, replace:

```js
  dialogueLookup.init({
    showToast: (msg) => scene.showToast(msg, 3000),
    pauseAutoDismiss: narrationBox.pauseAutoDismiss,
    getKanaMode: () => gameState.meta?.kanaMode ?? false,
  });
```

with:

```js
  dialogueLookup.init({
    showToast: (msg) => scene.showToast(msg, 3000),
    pauseAutoDismiss: narrationBox.pauseAutoDismiss,
    getKanaMode: () => gameState.meta?.kanaMode ?? false,
    onStateUpdate: updateGameState,
  });
```

- [ ] **Step 7: Run lookup action tests and verify they pass**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-word-lookup-actions.test.js
```

Expected: PASS.

- [ ] **Step 8: Syntax-check modified frontend files**

Run:

```bash
node --check public/js/ui/dialogue-word-lookup.js && node --check public/game.js
```

Expected: both checks print no syntax errors.

## Task 5: Full Verification

**Files:**
- Verify all files changed by Tasks 1-4.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
node --test tests/unit/game/review-fusion-core-service.test.js && node --test tests/unit/known-words-review.test.js && node --experimental-test-module-mocks --test tests/unit/dialogue-word-lookup-actions.test.js tests/unit/dialogue-word-lookup.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full unit test suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 3: Check lints/diagnostics for edited files**

Use Cursor diagnostics on:

- `src/game/services/review-fusion-core-service.js`
- `src/routes/game/known-words.js`
- `public/game.js`
- `public/js/ui/dialogue-word-lookup.js`
- `tests/unit/game/review-fusion-core-service.test.js`
- `tests/unit/known-words-review.test.js`
- `tests/unit/dialogue-word-lookup-actions.test.js`

Expected: no new diagnostics.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff -- src/game/services/review-fusion-core-service.js src/routes/game/known-words.js public/game.js public/js/ui/dialogue-word-lookup.js tests/unit/game/review-fusion-core-service.test.js tests/unit/known-words-review.test.js tests/unit/dialogue-word-lookup-actions.test.js docs/superpowers/specs/2026-05-01-review-fusion-core-drops-design.md docs/superpowers/plans/2026-05-01-review-fusion-core-drops.md
```

Expected: diff only contains the reward eligibility, route response, UI popup close/reward display, and associated docs/tests. Do not commit unless the user explicitly asks.
