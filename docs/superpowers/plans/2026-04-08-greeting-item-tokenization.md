# Greeting + Item Name Tokenization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire NPC greetings and item card names through the universal tokenization pipeline so they get i+1 selection, furigana rendering, and exposure tracking — same as shop purchase text.

**Architecture:** Add 5 greeting frames to `frame-sources.json` (tokenized at build time by existing `tokenize-static.js`). Server selects the best greeting via `isEligible`/`scoreCandidate` and attaches it + item name tokens to the `/friendly-npc-offers` response. Client renders both through existing `renderJpSentence()`.

**Tech Stack:** Node.js, Sudachi (build-time only), existing token-format.js pipeline

---

## Chunk 1: Greeting Frames + Build Verification

### Task 1: Add greeting frames to frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`

- [ ] **Step 1: Add 5 greeting frames**

Add these entries after the existing shop frames:

```json
  {
    "id": "greet_hello",
    "category": "greeting",
    "raw": "こんにちは！",
    "slots": []
  },
  {
    "id": "greet_hello_please",
    "category": "greeting",
    "raw": "こんにちは、どうぞ！",
    "slots": []
  },
  {
    "id": "greet_welcome_please",
    "category": "greeting",
    "raw": "いらっしゃいませ、どうぞ！",
    "slots": []
  },
  {
    "id": "greet_welcome_slow",
    "category": "greeting",
    "raw": "いらっしゃいませ、ゆっくりどうぞ！",
    "slots": []
  },
  {
    "id": "greet_welcome_browse",
    "category": "greeting",
    "raw": "いらっしゃいませ、ゆっくり見てください！",
    "slots": []
  }
```

- [ ] **Step 2: Run the build script to tokenize**

```bash
node scripts/tokenize-static.js
```

Expected: `Wrote 8 frames to data/dialogue/frames.json` (3 shop + 5 greeting)

- [ ] **Step 3: Verify frames.json output**

Inspect `data/dialogue/frames.json` and confirm:
- All 5 greeting frames have `category: "greeting"`
- `greet_hello` has a content token with `base: "こんにちは"`
- `greet_hello_please` has content tokens for both `こんにちは` and `どうぞ`
- `greet_welcome_please` has `いらっしゃいませ` as a single merged token (not split by Sudachi)
- `greet_welcome_browse` has `見る` as a content token base and `くださる` as a content token base
- No greeting frames have `slot` tokens
- Particles (、) and punctuation (！) are surface-only

- [ ] **Step 4: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "feat: add 5 greeting frames to tokenization pipeline"
```

### Task 2: Add greeting frame tests to tokenize-static.test.js

**Files:**
- Modify: `tests/unit/tokenize-static.test.js`

- [ ] **Step 1: Write tests for greeting frame output**

Add these tests inside the existing `describe('tokenize-static output (frames.json)')` block, after the existing tests:

```js
  it('greeting frames have no slot tokens', () => {
    const greetings = frames.filter(f => f.category === 'greeting');
    assert.ok(greetings.length >= 5, `expected at least 5 greeting frames, got ${greetings.length}`);
    for (const frame of greetings) {
      const slots = frame.tokens.filter(t => t.slot);
      assert.equal(slots.length, 0, `greeting frame ${frame.id} should have no slots`);
    }
  });

  it('greeting i+1 chain: greet_hello has exactly 1 content word', () => {
    const frame = frames.find(f => f.id === 'greet_hello');
    assert.ok(frame, 'greet_hello frame should exist');
    assert.deepEqual(frame.words, ['こんにちは']);
  });

  it('greeting i+1 chain: greet_hello_please has 2 content words', () => {
    const frame = frames.find(f => f.id === 'greet_hello_please');
    assert.ok(frame, 'greet_hello_please frame should exist');
    assert.ok(frame.words.includes('こんにちは'), 'should have こんにちは');
    assert.ok(frame.words.includes('どうぞ'), 'should have どうぞ');
    assert.equal(frame.words.length, 2);
  });

  it('greeting i+1 chain: greet_welcome_browse has 見る and くださる', () => {
    const frame = frames.find(f => f.id === 'greet_welcome_browse');
    assert.ok(frame, 'greet_welcome_browse frame should exist');
    assert.ok(frame.words.includes('見る'), 'should have 見る');
    assert.ok(frame.words.includes('くださる'), 'should have くださる');
  });

  it('いらっしゃいませ is merged into a single token', () => {
    const frame = frames.find(f => f.id === 'greet_welcome_please');
    assert.ok(frame, 'greet_welcome_please frame should exist');
    const irasshaimase = frame.tokens.find(t => t.base === 'いらっしゃいませ');
    assert.ok(irasshaimase, 'いらっしゃいませ should be a single merged content token');
    assert.ok(irasshaimase.reading, 'should have reading');
    assert.ok(irasshaimase.meaning, 'should have meaning');
  });
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern "tokenize-static"
```

Expected: All tests pass (existing 7 + new 4 = 11)

**Important:** If `いらっしゃいませ` is NOT merged (i.e., the dictionary doesn't have it), this test will fail. Check `data/dictionary.json` for the entry. If missing, add it before proceeding. The same applies to `どうぞ`, `ゆっくり`, and `こんにちは` — verify they exist as dictionary entries.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tokenize-static.test.js
git commit -m "test: add greeting frame tokenization tests"
```

## Chunk 2: Server — Greeting Selection + Item Name Tokens

### Task 3: Add getGreetingFrames() loader and greeting selection to /friendly-npc-offers

**Files:**
- Modify: `src/routes/game/run.js:18,33-41,627-673`
- Modify: `src/game/token-format.js:1` (add to import)

- [ ] **Step 1: Write failing test for greeting in /friendly-npc-offers response**

Create a test that verifies the endpoint returns a `greeting` field with tokens. Add to the integration test file that covers this endpoint, or if none exists, add a unit test for the greeting selection logic.

First, add a unit test in `tests/unit/token-format.test.js` for the greeting selection pattern (no server needed):

```js
describe('greeting selection (no slots)', () => {
  it('selects eligible greeting frame via isEligible + scoreCandidate', () => {
    // Simulate 2 greeting frames: one with 1 content word, one with 2
    const greet1 = {
      tokens: [
        { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' },
        { surface: '！' },
      ],
      words: ['こんにちは'],
    };
    const greet2 = {
      tokens: [
        { surface: 'こんにちは', base: 'こんにちは', reading: 'こんにちは', meaning: 'hello' },
        { surface: '、' },
        { surface: 'どうぞ', base: 'どうぞ', reading: 'どうぞ', meaning: 'please' },
        { surface: '！' },
      ],
      words: ['こんにちは', 'どうぞ'],
    };

    const knownSet = new Set(['こんにちは']);
    const frames = [greet1, greet2];

    // Both are eligible (greet1: 0 unknowns, greet2: 1 unknown)
    const eligible = frames.filter(f => isEligible(f.tokens, knownSet));
    assert.equal(eligible.length, 2);

    // greet2 scores higher (1 unknown > 0 unknowns)
    eligible.sort((a, b) => scoreCandidate(b.tokens, knownSet) - scoreCandidate(a.tokens, knownSet));
    assert.deepEqual(eligible[0].words, ['こんにちは', 'どうぞ']);
  });

  // Note: assembleFrame with no slots is already tested in the assembleFrame describe block
  // ('handles frames with no slots (complete lines)' at line 101). No need to duplicate.
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern "greeting selection|assembleFrame passes through"
```

Expected: Both pass (these test existing functions with greeting data — no code changes needed yet).

- [ ] **Step 3: Add getGreetingFrames() in run.js**

In `src/routes/game/run.js`, add the greeting frame loader right after the existing `getShopFrames()` function (after line 41):

```js
let _greetingFrames = null;
function getGreetingFrames() {
  if (!_greetingFrames) {
    const framesPath = join(__dirname, '../../../data/dialogue/frames.json');
    const allFrames = JSON.parse(readFileSync(framesPath, 'utf-8'));
    _greetingFrames = allFrames.filter(f => f.category === 'greeting');
  }
  return _greetingFrames;
}
```

- [ ] **Step 4: Add entityToToken to the import from token-format.js**

In `src/routes/game/run.js` line 18, add `entityToToken` to the existing import:

```js
import { assembleFrame, entityToToken, isEligible, scoreCandidate } from '../../game/token-format.js';
```

- [ ] **Step 5: Add greeting selection + nameToken to /friendly-npc-offers**

In the `/friendly-npc-offers` handler, inside the `if (!room.friendlyNpc.offered)` block, add the following **before** the existing `req.saveGame()` call (line 660). The greeting and nameToken must be attached before saving so they persist across page reloads:

```js
        // Select best greeting frame via i+1
        const greetingFrames = getGreetingFrames();
        const greetingCandidates = greetingFrames.map(frame => assembleFrame(frame, {}));
        const eligibleGreetings = greetingCandidates.filter(c => isEligible(c.tokens, knownSet));
        if (eligibleGreetings.length > 0) {
          eligibleGreetings.sort((a, b) => scoreCandidate(b.tokens, knownSet) - scoreCandidate(a.tokens, knownSet));
          room.friendlyNpc.greeting = eligibleGreetings[0];
        } else {
          room.friendlyNpc.greeting = greetingCandidates[0] || null;
        }

        // Attach entity token for each item's card display
        for (const item of room.friendlyNpc.offered) {
          if (!item.word) continue;
          item.nameToken = entityToToken(item);
        }
```

Then update the exposure tracking section (lines 662-667) to include greeting words:

```js
        // Expose item words + greeting words to SRS
        const itemWords = room.friendlyNpc.offered
          .filter(item => item.word)
          .map(item => ({ word: item.word, meaning: item.nameEn || '' }));
        const greetingWords = (room.friendlyNpc.greeting?.words || [])
          .map(word => {
            const token = (room.friendlyNpc.greeting?.tokens || []).find(t => t.base === word);
            return { word, meaning: token?.meaning || '' };
          });
        const allExposures = [...itemWords, ...greetingWords];
        if (allExposures.length > 0) {
          req.gameManager.exposeWords(allExposures);
        }
```

Finally, update the response to include the greeting (line 669):

```js
      res.json({
        offered: room.friendlyNpc.offered,
        greeting: room.friendlyNpc.greeting || null,
        state: req.getEnrichedGameState(),
      });
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 7: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: greeting selection + item nameToken in /friendly-npc-offers"
```

## Chunk 3: Client — Render Greeting + Item Names via Universal Tokens

### Task 4: Update exploration.js to render greeting and item cards with universal tokens

**Files:**
- Modify: `public/js/ui/exploration.js:1194-1217`

- [ ] **Step 1: Syntax-check exploration.js before changes**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

Expected: OK

- [ ] **Step 2: Store greeting from server response in friendlyNpcState**

In `public/js/ui/exploration.js`, find where the server response is processed (around line 1188). After `friendlyNpcState.offered = offered;`, add:

```js
    friendlyNpcState.greeting = resp?.greeting || null;
```

The `friendlyNpcState` object initialization (line 1113) and reset (line 1131) also need the new field. Add `greeting: null` to both:

At line 1113-1117, the object should become:
```js
let friendlyNpcState = {
  roomId: null,
  fetched: false,
  offered: null,
  greeting: null,
  choosing: false,
};
```

At line 1131-1135, the reset should become:
```js
    friendlyNpcState = {
      roomId,
      fetched: false,
      offered: null,
      greeting: null,
      choosing: false,
    };
```

- [ ] **Step 3: Replace raw NPC greeting with tokenized rendering**

Replace lines 1198-1208 (the NPC greeting block):

```js
  // NPC greeting first (blocking during tutorial so player sees it before items)
  if (npc && sceneModule?.showNarration) {
    const greetings = npc.shopGreetings || ['こんにちは！'];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    if (tutorialStep === 2) {
      await sceneModule.showNarration(greeting, { speaker: npc.nameEn || npc.name });
    } else {
      // Non-tutorial: non-blocking overlay as before
      sceneModule.showNarration(greeting, { speaker: npc.nameEn || npc.name });
    }
  }
```

With:

```js
  // NPC greeting first (blocking during tutorial so player sees it before items)
  if (npc && sceneModule?.showNarration) {
    const greetingTokens = friendlyNpcState.greeting?.tokens;
    let greetingContent;
    if (greetingTokens?.length) {
      const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
      greetingContent = renderJpSentence(greetingTokens, getKnownWords(), wordDict, {}, false);
    } else {
      greetingContent = npc.shopGreetings?.[0] || 'こんにちは！';
    }
    const narrationOpts = greetingTokens?.length
      ? { html: true, speaker: npc.nameEn || npc.name }
      : { speaker: npc.nameEn || npc.name };
    if (tutorialStep === 2) {
      await sceneModule.showNarration(greetingContent, narrationOpts);
    } else {
      sceneModule.showNarration(greetingContent, narrationOpts);
    }
  }
```

- [ ] **Step 4: Replace plain-text item card titles with tokenized rendering**

Replace lines 1211-1217 (the renderChoices cards block):

```js
  renderChoices({
    cards: offers.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: `${item.word} (${item.reading})`,
      subtitle: item.nameEn,
      pills: buildItemEffectPills(item),
    })),
```

With:

```js
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  renderChoices({
    cards: offers.map(item => ({
      sprite: itemSpriteHtml(item.id, item.word),
      title: item.nameToken
        ? renderJpSentence([item.nameToken], getKnownWords(), wordDict, {}, false)
        : `${item.word} (${item.reading})`,
      subtitle: item.nameEn,
      pills: buildItemEffectPills(item),
    })),
```

- [ ] **Step 5: Syntax-check after changes**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: render NPC greeting + item names via universal tokens"
```

## Chunk 4: Integration Verification

### Task 5: Run full test suite and verify no regressions

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

```bash
npm run test:unit
```

Expected: All pass, including the new greeting tests from Task 2.

- [ ] **Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: All pass.

- [ ] **Step 3: Run build to verify tokenize-static + vite build**

```bash
npm run build
```

Expected: Build succeeds. `frames.json` has 8 frames. No errors.

- [ ] **Step 4: Start dev server and verify endpoint manually**

```bash
npm run dev &
sleep 3
# Server should be running on port 3000
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: 200

- [ ] **Step 5: Final commit (if any fixups needed)**

Only if previous tasks required adjustments. Otherwise skip.
