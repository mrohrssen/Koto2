# Prologue Display Mode Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-player prologue choice that sets the Translator to Hiragana mode or player-facing Kanji mode, plus a Settings toggle that updates the same player preference.

**Architecture:** Store the preference on existing save meta via `meta.japaneseDisplayMode`, using `hiragana` for Hiragana mode and `natural` for player-facing Kanji mode. Add a dedicated authenticated game endpoint for this per-player setting, then wire both the prologue choice and Settings toggle to that endpoint. Keep rendering behavior changes scoped to surfaces that already consume the setting.

**Tech Stack:** Express game routes, Koto `GameManager` meta state, browser ES modules, existing `api.js` game API wrapper, Node built-in test runner, integration test app harness.

---

## Spec

Implement `docs/superpowers/specs/2026-06-03-prologue-display-mode-onboarding-design.md`.

## File Structure

- Modify `src/routes/game/misc.js`: add `POST /api/game/japanese-display-mode`.
- Modify `public/js/api.js`: add `setJapaneseDisplayMode(mode)` helper and export it.
- Modify `data/prologue.json`: insert the Hiragana knowledge question, two conditional Cid responses, and the settings reminder after `prologue-06-intro`.
- Modify `public/game.js`: call the API helper when a prologue choice has a `displayMode` side effect and update local `gameState` from the returned state.
- Modify `public/js/ui/modals.js`: add **Enable Kanji mode** near learning settings and save it through the per-player game endpoint.
- Modify `tests/unit/routes/prologue.test.js`: update prologue ordering tests and add static client wiring checks.
- Modify `tests/unit/ui/settings-modal.test.js`: cover the Settings toggle render/save path.
- Create `tests/integration/flows/japanese-display-mode.test.js`: exercise the authenticated endpoint with real per-user state.

Do not edit `data/dictionary.json`. Do not broaden rendering conversions beyond the setting write path.

## Task 1: Add Per-Player Display Mode Endpoint

**Files:**
- Create: `tests/integration/flows/japanese-display-mode.test.js`
- Modify: `src/routes/game/misc.js`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/flows/japanese-display-mode.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

describe('Japanese display mode flow', () => {
  let client;
  let cleanup;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
  });

  afterEach(() => cleanup());

  it('saves natural and hiragana display modes on the current player meta', async () => {
    await client.loginAsNewUser('display-mode-user', 'display-pass-123');
    await client.createPlayer('DisplayMode');

    const naturalRes = await client.post('/api/game/japanese-display-mode', { mode: 'natural' });
    assert.equal(naturalRes.status, 200);
    assert.equal(naturalRes.body.ok, true);
    assert.equal(naturalRes.body.japaneseDisplayMode, 'natural');
    assert.equal(naturalRes.body.kanaMode, false);
    assert.equal(naturalRes.body.state.meta.japaneseDisplayMode, 'natural');
    assert.equal(naturalRes.body.state.meta.kanaMode, false);

    const persistedNatural = await client.getState();
    assert.equal(persistedNatural.status, 200);
    assert.equal(persistedNatural.body.meta.japaneseDisplayMode, 'natural');
    assert.equal(persistedNatural.body.meta.kanaMode, false);

    const hiraganaRes = await client.post('/api/game/japanese-display-mode', { mode: 'hiragana' });
    assert.equal(hiraganaRes.status, 200);
    assert.equal(hiraganaRes.body.ok, true);
    assert.equal(hiraganaRes.body.japaneseDisplayMode, 'hiragana');
    assert.equal(hiraganaRes.body.kanaMode, true);
    assert.equal(hiraganaRes.body.state.meta.japaneseDisplayMode, 'hiragana');
    assert.equal(hiraganaRes.body.state.meta.kanaMode, true);
  });

  it('rejects invalid display modes without changing the saved mode', async () => {
    await client.loginAsNewUser('display-mode-invalid-user', 'display-pass-123');
    await client.createPlayer('DisplayModeInvalid');

    const initial = await client.post('/api/game/japanese-display-mode', { mode: 'natural' });
    assert.equal(initial.status, 200);

    const invalid = await client.post('/api/game/japanese-display-mode', { mode: 'katakana' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, 'Invalid Japanese display mode');

    const state = await client.getState();
    assert.equal(state.status, 200);
    assert.equal(state.body.meta.japaneseDisplayMode, 'natural');
    assert.equal(state.body.meta.kanaMode, false);
  });
});
```

- [ ] **Step 2: Run the failing endpoint test**

Run:

```bash
node --test tests/integration/flows/japanese-display-mode.test.js
```

Expected: FAIL with HTTP 404 for `/api/game/japanese-display-mode`.

- [ ] **Step 3: Add constants to `src/routes/game/misc.js`**

In `src/routes/game/misc.js`, after the `__dirname` constant, add:

```js
const JAPANESE_DISPLAY_MODES = new Set(['hiragana', 'natural']);
```

- [ ] **Step 4: Add the route to `src/routes/game/misc.js`**

In `src/routes/game/misc.js`, insert this route after the existing `/kana-mode` route and before `/select-starter`:

```js
  // Set Japanese display mode for the current player.
  router.post('/japanese-display-mode', (req, res) => {
    const { mode } = req.body || {};
    if (!JAPANESE_DISPLAY_MODES.has(mode)) {
      return res.status(400).json({ error: 'Invalid Japanese display mode' });
    }

    const gameManager = req.gameManager;
    const meta = gameManager.getMeta();
    meta.japaneseDisplayMode = mode;
    meta.kanaMode = mode === 'hiragana';

    req.saveGame();
    res.json({
      ok: true,
      japaneseDisplayMode: meta.japaneseDisplayMode,
      kanaMode: meta.kanaMode,
      state: req.getEnrichedGameState(),
    });
  });
```

- [ ] **Step 5: Verify the endpoint test passes**

Run:

```bash
node --test tests/integration/flows/japanese-display-mode.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
/usr/bin/git add src/routes/game/misc.js tests/integration/flows/japanese-display-mode.test.js
/usr/bin/git commit -m "feat: add japanese display mode endpoint"
```

## Task 2: Wire the Prologue Choice

**Files:**
- Modify: `tests/unit/routes/prologue.test.js`
- Modify: `data/prologue.json`
- Modify: `public/js/api.js`
- Modify: `public/game.js`

- [ ] **Step 1: Update prologue tests for the new scenes**

In `tests/unit/routes/prologue.test.js`, replace the test named `includes the five new translator-demo pages in order between 06 and 10` with:

```js
  it('includes display-mode onboarding before the translator demo', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const ids = prologue.map(s => s.id);
    const expectedIds = [
      'prologue-display-mode-question',
      'prologue-display-mode-kanji',
      'prologue-display-mode-hiragana',
      'prologue-display-mode-done',
      'prologue-translator-try',
      'prologue-translator-how',
      'prologue-translator-demo',
      'prologue-translator-reaction',
      'prologue-translator-click',
    ];
    const idx06 = ids.indexOf('prologue-06-intro');
    const idx10 = ids.indexOf('prologue-10-disruption');
    assert.ok(idx06 >= 0, 'prologue-06-intro must exist');
    assert.ok(idx10 > idx06, 'prologue-10-disruption must follow 06');
    for (let i = 0; i < expectedIds.length; i++) {
      const idx = ids.indexOf(expectedIds[i]);
      assert.ok(idx > idx06, `${expectedIds[i]} must appear after prologue-06-intro`);
      assert.ok(idx < idx10, `${expectedIds[i]} must appear before prologue-10-disruption`);
      if (i > 0) {
        const prev = ids.indexOf(expectedIds[i - 1]);
        assert.ok(idx === prev + 1, `${expectedIds[i]} must immediately follow ${expectedIds[i - 1]}`);
      }
    }
  });
```

Then add this test in the `prologue.json content` describe block:

```js
  it('wires the display-mode choices to hiragana and natural modes', () => {
    const prologue = JSON.parse(readFileSync(PROLOGUE_PATH, 'utf-8'));
    const question = prologue.find(s => s.id === 'prologue-display-mode-question');
    assert.ok(question, 'display mode question should exist');
    assert.equal(question.speaker, 'Cid');
    assert.match(question.narration, /Do you know the Japanese alphabet Hiragana/);
    assert.deepEqual(question.choices, [
      { text: 'Yes, set Kanji mode', id: 'kanji-mode', displayMode: 'natural' },
      { text: 'No, set Hiragana mode until I learn it', id: 'hiragana-mode', displayMode: 'hiragana' },
    ]);

    const kanji = prologue.find(s => s.id === 'prologue-display-mode-kanji');
    assert.equal(kanji.conditional, 'kanji-mode');
    assert.equal(kanji.narration, "Great, I'll set the Translator to Kanji mode.");

    const hiragana = prologue.find(s => s.id === 'prologue-display-mode-hiragana');
    assert.equal(hiragana.conditional, 'hiragana-mode');
    assert.equal(hiragana.narration, "Great, I'll set the Translator to Hiragana mode.");

    const done = prologue.find(s => s.id === 'prologue-display-mode-done');
    assert.equal(done.narration, "You're all set! You can always adjust these settings yourself if you need to.");
  });
```

Then add this static client wiring test after the content tests:

```js
describe('prologue client display-mode wiring', () => {
  it('calls the Japanese display mode API for choices with displayMode', () => {
    const gameJs = readFileSync(join(process.cwd(), 'public/game.js'), 'utf-8');
    assert.match(gameJs, /setJapaneseDisplayMode as apiSetJapaneseDisplayMode/);
    assert.match(gameJs, /chosen\.displayMode/);
    assert.match(gameJs, /apiSetJapaneseDisplayMode\(chosen\.displayMode\)/);
    assert.match(gameJs, /displayResult\?\.state/);
  });
});
```

- [ ] **Step 2: Run the failing prologue tests**

Run:

```bash
node --test tests/unit/routes/prologue.test.js
```

Expected: FAIL because the new prologue scenes and client API wiring do not exist.

- [ ] **Step 3: Add the API helper**

In `public/js/api.js`, after `claimDailyCrystals()` add:

```js
async function setJapaneseDisplayMode(mode) {
  return apiCall('/japanese-display-mode', 'POST', { mode });
}
```

In the export block near `claimDailyCrystals`, add:

```js
  setJapaneseDisplayMode,
```

- [ ] **Step 4: Import the helper in `public/game.js`**

In the API import list in `public/game.js`, add this alias near the other game-state API helpers:

```js
  setJapaneseDisplayMode as apiSetJapaneseDisplayMode,
```

- [ ] **Step 5: Save display mode when the prologue choice is selected**

In `public/game.js`, inside `playPrologue()`, after:

```js
      result = chosen.id ?? chosen.text;
      lastChoiceId = result;
```

add:

```js
      if (chosen.displayMode) {
        const displayResult = await apiSetJapaneseDisplayMode(chosen.displayMode);
        if (displayResult?.state) {
          updateGameState(displayResult.state);
        }
      }
```

- [ ] **Step 6: Insert the new prologue scenes**

In `data/prologue.json`, insert these four objects immediately after the `prologue-06-intro` object and before `prologue-translator-try`:

```json
  {
    "id": "prologue-display-mode-question",
    "speaker": "Cid",
    "narration": "Do you know the Japanese alphabet Hiragana?",
    "choices": [
      { "text": "Yes, set Kanji mode", "id": "kanji-mode", "displayMode": "natural" },
      { "text": "No, set Hiragana mode until I learn it", "id": "hiragana-mode", "displayMode": "hiragana" }
    ]
  },
  {
    "id": "prologue-display-mode-kanji",
    "speaker": "Cid",
    "conditional": "kanji-mode",
    "narration": "Great, I'll set the Translator to Kanji mode."
  },
  {
    "id": "prologue-display-mode-hiragana",
    "speaker": "Cid",
    "conditional": "hiragana-mode",
    "narration": "Great, I'll set the Translator to Hiragana mode."
  },
  {
    "id": "prologue-display-mode-done",
    "speaker": "Cid",
    "narration": "You're all set! You can always adjust these settings yourself if you need to."
  },
```

- [ ] **Step 7: Verify prologue tests pass**

Run:

```bash
node --test tests/unit/routes/prologue.test.js
```

Expected: PASS.

- [ ] **Step 8: Syntax-check changed frontend files**

Run:

```bash
node --check public/game.js && node --check public/js/api.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 9: Commit Task 2**

```bash
/usr/bin/git add data/prologue.json public/game.js public/js/api.js tests/unit/routes/prologue.test.js
/usr/bin/git commit -m "feat: ask display mode during prologue"
```

## Task 3: Add Settings Toggle

**Files:**
- Modify: `tests/unit/ui/settings-modal.test.js`
- Modify: `public/js/ui/modals.js`

- [ ] **Step 1: Expand the Settings modal test harness**

In `tests/unit/ui/settings-modal.test.js`, replace the existing `public/js/api.js` mock with this version:

```js
let displayModeCalls = [];

await mock.module('../../../public/js/api.js', {
  namedExports: {
    getAuthHeaders: () => ({}),
    apiUrl: path => path,
    setJapaneseDisplayMode: async (mode) => {
      displayModeCalls.push(mode);
      return {
        ok: true,
        state: {
          meta: {
            japaneseDisplayMode: mode,
            kanaMode: mode === 'hiragana',
          },
        },
      };
    },
  },
});
```

Add this fake element helper above the `describe('settings modal', ...)` block:

```js
function installSettingsDocument() {
  const elements = new Map();
  globalThis.document = {
    getElementById: id => {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          checked: false,
          value: '',
          disabled: false,
          textContent: '',
          addEventListener(type, handler) {
            this[`on${type}`] = handler;
          },
          async click() {
            if (this.onclick) await this.onclick({ target: this });
          },
        });
      }
      return elements.get(id);
    },
  };
  return elements;
}
```

- [ ] **Step 2: Add Settings toggle tests**

In `tests/unit/ui/settings-modal.test.js`, add these tests inside the `describe('settings modal', ...)` block:

```js
  it('renders Enable Kanji mode from player meta', async () => {
    const content = { innerHTML: '' };
    installSettingsDocument();

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5' }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'natural' } }),
      updateGameState: () => {},
      updateUI: () => {},
    });

    await openSettings();

    assert.match(content.innerHTML, /settings-kanji-mode/);
    assert.match(content.innerHTML, /Enable Kanji mode/);
    assert.match(content.innerHTML, /settings-kanji-mode"[\s\S]*checked/);
  });

  it('saves Enable Kanji mode through the per-player game endpoint', async () => {
    const content = { innerHTML: '' };
    const elements = installSettingsDocument();
    let updatedState = null;
    displayModeCalls = [];

    init({
      takeover: {
        open: () => {},
        getContent: () => content,
        close: () => {},
      },
      scene: { showToast: () => {} },
      settings: {
        loadApiKeysFromServer: async () => ({ jlptLevel: 'N5', aiConversationsEnabled: true, aiDataSharingConsent: true }),
        saveApiKeysToServer: async () => true,
        setAiNarrationEnabled: () => {},
        setTtsEnabled: () => {},
        setJapanifyUIEnabled: () => {},
      },
      getGameState: () => ({ meta: { japaneseDisplayMode: 'hiragana' } }),
      updateGameState: state => { updatedState = state; },
      updateUI: () => {},
    });

    await openSettings();

    elements.get('settings-kanji-mode').checked = true;
    await elements.get('settings-save-btn').click();

    assert.deepEqual(displayModeCalls, ['natural']);
    assert.equal(updatedState.meta.japaneseDisplayMode, 'natural');
  });
```

- [ ] **Step 3: Run the failing Settings tests**

Run:

```bash
node --test tests/unit/ui/settings-modal.test.js
```

Expected: FAIL because `settings-kanji-mode` is not rendered and the modal does not call `setJapaneseDisplayMode`.

- [ ] **Step 4: Import the API helper in `public/js/ui/modals.js`**

Change the API import at the top of `public/js/ui/modals.js` from:

```js
import { getAuthHeaders, apiUrl } from '../api.js';
```

to:

```js
import { getAuthHeaders, apiUrl, setJapaneseDisplayMode } from '../api.js';
```

- [ ] **Step 5: Derive current display mode before rendering Settings**

In `openSettings()`, after:

```js
  const dailyWordLimitSetting = serverSettings.dailyWordLimit ?? 10;
```

add:

```js
  const currentGameState = getGameState?.() || {};
  const currentDisplayMode = currentGameState.meta?.japaneseDisplayMode === 'natural' ? 'natural' : 'hiragana';
  const kanjiModeEnabled = currentDisplayMode === 'natural';
```

- [ ] **Step 6: Render the toggle near learning settings**

In `public/js/ui/modals.js`, after the Daily Word Limit label block and before the AI Conversations label block, add:

```html
      <label class="settings-label" style="margin-top:12px">
        <input type="checkbox" id="settings-kanji-mode"
          ${kanjiModeEnabled ? 'checked' : ''}>
        Enable Kanji mode
        <small style="color:#888;font-size:0.85em;display:block;margin-top:2px">
          Shows natural Japanese when available. Turn this off for Hiragana mode.
        </small>
      </label>
```

- [ ] **Step 7: Save the toggle through the per-player endpoint**

In the save button handler in `public/js/ui/modals.js`, after:

```js
    const aiConversationsEnabled = document.getElementById('settings-ai-conversations')?.checked;
```

add:

```js
    const desiredDisplayMode = document.getElementById('settings-kanji-mode')?.checked ? 'natural' : 'hiragana';
```

Then after the local-only settings block ending with:

```js
    if (audioMuted) { audio.mute(); } else { audio.unmute(); }
```

add:

```js
    if (desiredDisplayMode !== currentDisplayMode) {
      const displayResult = await setJapaneseDisplayMode(desiredDisplayMode);
      if (!displayResult?.ok || !displayResult?.state) {
        sceneModule.showToast('Failed to save Japanese display mode', 2000);
        return;
      }
      updateGameState?.(displayResult.state);
      updateUI?.();
    }
```

- [ ] **Step 8: Verify Settings tests pass**

Run:

```bash
node --test tests/unit/ui/settings-modal.test.js
```

Expected: PASS.

- [ ] **Step 9: Syntax-check changed frontend files**

Run:

```bash
node --check public/js/ui/modals.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 10: Commit Task 3**

```bash
/usr/bin/git add public/js/ui/modals.js tests/unit/ui/settings-modal.test.js
/usr/bin/git commit -m "feat: add kanji mode settings toggle"
```

## Task 4: Final Verification

**Files:**
- Inspect: `docs/superpowers/specs/2026-06-03-prologue-display-mode-onboarding-design.md`
- Inspect: all files changed by Tasks 1-3.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/integration/flows/japanese-display-mode.test.js tests/unit/routes/prologue.test.js tests/unit/ui/settings-modal.test.js tests/unit/game/japanese-display-mode-state.test.js tests/unit/ui/japanese-display-resolver.test.js
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check src/routes/game/misc.js && node --check public/js/api.js && node --check public/game.js && node --check public/js/ui/modals.js && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Run the standard test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Manual browser verification**

Ask the user before launching Playwright, per repo instructions. If approved, run `npm run dev`, navigate to `http://localhost:5173`, and verify:

1. A fresh or prologue-reset account sees Cid ask `Do you know the Japanese alphabet Hiragana?`.
2. Choosing `Yes, set Kanji mode` sends `natural` and Settings shows **Enable Kanji mode** checked.
3. Choosing `No, set Hiragana mode until I learn it` sends `hiragana` and Settings shows **Enable Kanji mode** unchecked.
4. Toggling **Enable Kanji mode** in Settings persists across reload for the same account.

After screenshots are shown, delete any screenshot files in the same tool-call block.

- [ ] **Step 5: Commit verification-only doc updates if any were needed**

If implementation revealed a new playtesting instruction that belongs in `docs/playtest-guide.md`, commit only that doc update:

```bash
/usr/bin/git add docs/playtest-guide.md
/usr/bin/git commit -m "docs: update display mode playtest notes"
```

If no doc update was needed, skip this commit.

- [ ] **Step 6: Final status**

Report:

- Whether focused tests passed.
- Whether `npm test` passed.
- Whether browser verification was run or skipped.
- Any known rendering surfaces that still force hiragana, without treating them as bugs for this scoped change.

