# Glue Word i+1 Dialogue Curriculum Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach 50 glue words through i+1 dialogue sentences across all exposure methods, with a category cleanup to fix misleading names and dead wiring.

**Architecture:** Three sequential workstreams — (1) rename categories and fix frontend wiring, (2) author new dialogue content in frame-sources.json, (3) build a validation script to verify all 50 glue words are reachable. All content flows through the existing tokenization pipeline (Sudachi → frames.json → isEligible filter).

**Tech Stack:** Node.js, existing Sudachi tokenizer (`scripts/tokenize-static.js`), existing i+1 filter (`src/game/token-format.js`), existing dialogue loader/filter system.

**Spec:** `docs/superpowers/specs/2026-04-10-glue-word-i1-dialogue-curriculum-design.md`

---

## Chunk 1: Category Cleanup (Code Changes)

### Task 1: Rename `shop` → `shopPurchase` and `greeting` → `shopGreeting` in frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`

- [ ] **Step 1: Rename shop category entries**

In `data/dialogue/frame-sources.json`, find the 3 entries with `"category": "shop"` (IDs: `buy_polite`, `buy_excuse_me`, `buy_thanks`). Change their category to `"shopPurchase"`.

- [ ] **Step 2: Rename greeting category entries**

In the same file, find the 5 entries with `"category": "greeting"` (IDs: `greet_hello`, `greet_hello_please`, `greet_welcome_please`, `greet_welcome_slow`, `greet_welcome_browse`). Change their category to `"shopGreeting"`.

- [ ] **Step 3: Save NPC shopGreeting lines for later reference, then remove**

Before deleting, copy these lines somewhere (or note the git diff) — the best ones will be folded into `fightStart` during Task 8 content authoring:

```
kodomo shopGreeting: こんにちは！遊ぶ？ / 一緒に遊ぶ？楽しいよ！ / おはよう！今日も遊ぶ？
otona shopGreeting: 今日も頑張りましょう。 / 何か欲しい物はありますか。
otokonoko shopGreeting: もっと強くなりたい！ / おはよう！一緒に頑張ろう！
onnanoko shopGreeting: あ…こんにちは。ここの花、綺麗ですね。 / 少し見ていきますか。
```

Then delete all 24 entries with IDs matching `npc_*_shopGreeting_*` (6 per NPC × 4 NPCs: kodomo, otona, otokonoko, onnanoko).

- [ ] **Step 4: Regenerate frames.json**

```bash
node scripts/tokenize-static.js
```

- [ ] **Step 5: Validate**

```bash
node scripts/validate-dialogue.js
```

- [ ] **Step 6: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "refactor: rename shop→shopPurchase, greeting→shopGreeting, remove NPC shopGreeting"
```

### Task 2: Update dialogue-loader.js for renamed categories

**Files:**
- Modify: `src/game/dialogue-loader.js:7-72`

- [ ] **Step 1: Write failing test — renamed getters**

In `tests/unit/dialogue-loader.test.js`, update the test that checks `getShopFrames`:

```js
it('getShopPurchaseFrames returns shopPurchase category frames', () => {
  const frames = getShopPurchaseFrames();
  assert.ok(Array.isArray(frames));
  assert.ok(frames.length >= 3);
  assert.ok(frames.every(f => f.category === 'shopPurchase'));
});
```

Update the test that checks `getGreetingFrames`:

```js
it('getShopGreetingFrames returns shopGreeting category frames', () => {
  const frames = getShopGreetingFrames();
  assert.ok(Array.isArray(frames));
  assert.ok(frames.length >= 5);
  assert.ok(frames.every(f => f.category === 'shopGreeting'));
});
```

Update the NPC lines test to assert `fightStart` exists but `shopGreeting` does not:

```js
it('getNpcLines returns lines grouped by NPC and slot', () => {
  const npcLines = getNpcLines();
  assert.ok(npcLines.kodomo, 'should have kodomo NPC');
  assert.ok(npcLines.kodomo.fightStart, 'kodomo should have fightStart');
  assert.ok(Array.isArray(npcLines.kodomo.fightStart));
  assert.ok(!npcLines.kodomo.shopGreeting, 'kodomo should NOT have shopGreeting');
  const line = npcLines.kodomo.fightStart[0];
  assert.ok(Array.isArray(line.tokens), 'line should have tokens');
  assert.ok(Array.isArray(line.words), 'line should have words');
});
```

Update imports to use new getter names:

```js
import {
  loadDialoguePools,
  getBarkPool,
  getCidScripts,
  getNpcLines,
  getShopPurchaseFrames,
  getShopGreetingFrames,
  getBefriendFrames,
  getDialogueWordSet,
} from '../../src/game/dialogue-loader.js';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --test-name-pattern="dialogue-loader"
```

Expected: FAIL — `getShopPurchaseFrames` and `getShopGreetingFrames` not exported.

- [ ] **Step 3: Update dialogue-loader.js**

In `src/game/dialogue-loader.js`:

1. Rename variable `_shopFrames` → `_shopPurchaseFrames` and `_greetingFrames` → `_shopGreetingFrames`
2. Update `loadDialoguePools`:
   - Line 23: `_shopPurchaseFrames = _frames.filter(f => f.category === 'shopPurchase');`
   - Line 24: `_shopGreetingFrames = _frames.filter(f => f.category === 'shopGreeting');`
3. Rename exported getters:
   - `getShopFrames` → `getShopPurchaseFrames` returning `_shopPurchaseFrames`
   - `getGreetingFrames` → `getShopGreetingFrames` returning `_shopGreetingFrames`

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- --test-name-pattern="dialogue-loader"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/dialogue-loader.js tests/unit/dialogue-loader.test.js
git commit -m "refactor: rename shop/greeting getters in dialogue-loader"
```

### Task 3: Update run.js for renamed getters

**Files:**
- Modify: `src/routes/game/run.js:21,636,655`

- [ ] **Step 1: Update import**

Line 21 of `src/routes/game/run.js`:

```js
// Before:
import { getShopFrames, getGreetingFrames } from '../../game/dialogue-loader.js';
// After:
import { getShopPurchaseFrames, getShopGreetingFrames } from '../../game/dialogue-loader.js';
```

- [ ] **Step 2: Update usage**

Line 636: `const shopFrames = getShopPurchaseFrames();`
Line 655: `const greetingFrames = getShopGreetingFrames();`

- [ ] **Step 3: Syntax check**

```bash
node --check src/routes/game/run.js && echo "OK"
```

- [ ] **Step 4: Run integration tests**

```bash
npm run test:integration
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/run.js
git commit -m "refactor: update run.js to use renamed dialogue getters"
```

### Task 4: Update tokenize-static test for renamed categories

**Files:**
- Modify: `tests/unit/tokenize-static.test.js:75-88`

- [ ] **Step 1: Update greeting test**

Replace the `greeting frames have no slot tokens` test (line 75-82):

```js
it('shopGreeting frames have no slot tokens', () => {
  const greetings = frames.filter(f => f.category === 'shopGreeting');
  assert.ok(greetings.length >= 5, `expected at least 5 shopGreeting frames, got ${greetings.length}`);
  for (const frame of greetings) {
    const slots = frame.tokens.filter(t => t.slot);
    assert.equal(slots.length, 0, `shopGreeting frame ${frame.id} should have no slots`);
  }
});
```

Replace the `greeting i+1 chain` test (line 84-88):

```js
it('shopGreeting i+1 chain: greet_hello has exactly 1 content word', () => {
  const frame = frames.find(f => f.id === 'greet_hello');
  assert.ok(frame, 'greet_hello frame should exist');
  assert.deepEqual(frame.words, ['こんにちは']);
});
```

- [ ] **Step 2: Run test**

```bash
npm run test:unit -- --test-name-pattern="tokenize-static"
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/tokenize-static.test.js
git commit -m "test: update tokenize-static tests for renamed categories"
```

### Task 5: Wire fightStart to frontend, remove greeting from npcDialogue

**Files:**
- Modify: `src/routes/game/combat.js:88-111`
- Modify: `public/js/ui/room-transition.js:62-82`

- [ ] **Step 1: Update combat.js backend**

In `src/routes/game/combat.js`, remove the greeting selection and update the npcDialogue object:

```js
// Line 88 — DELETE this line:
const greeting = selectNpcLine(npcPool.shopGreeting || [], knownWords);

// Line 94 — update the exposure loop to only iterate fightStart and defeatLine:
for (const line of [fightStart, defeatLine]) {

// Lines 106-111 — remove greeting from npcDialogue:
npcDialogue = {
  fightStart: mapLine(fightStart),
  defeatLine: mapLine(defeatLine),
  useKanji: false,
};
```

- [ ] **Step 2: Update room-transition.js frontend**

In `public/js/ui/room-transition.js`, update `playNpcBattleIntro` (lines 62-82):

```js
// Line 62-76: Replace npcDialogue?.greeting with npcDialogue?.fightStart
const bootstrapLine = npcDialogue?.fightStart;
if (bootstrapLine?.tokens?.length) {
  await new Promise(r => setTimeout(r, 100));
  narrationBox.forceHide();
  const knownWords = getKnownWords();
  const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
  const html = renderJpSentence(
    bootstrapLine.tokens,
    knownWords,
    wordDict,
    bootstrapLine.overrides || {},
    npcDialogue.useKanji || false
  );
  await narrationBox.show(html, { speaker: npcName, html: true });
} else if (npcData.greeting) {
  // Legacy fallback for AI-generated greetings
  await new Promise(r => setTimeout(r, 100));
  narrationBox.forceHide();
  speakText(npcData.greeting);
  await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
}
```

- [ ] **Step 3: Syntax check both files**

```bash
node --check src/routes/game/combat.js && node --check public/js/ui/room-transition.js && echo "OK"
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/game/combat.js public/js/ui/room-transition.js
git commit -m "feat: wire fightStart to frontend, remove greeting from npcDialogue"
```

### Task 6: Update simulator, exploration-service, and verify unaffected files

**Files:**
- Modify: `simulator/engine/rooms/npc-battle.js:28`
- Modify: `src/game/services/exploration-service.js:350`
- Verify (no changes needed): `src/narration-engine/entity-types/npc.js`, `src/services/tts-dialogue-cache.js`, `public/game.js`

**Note on narration engine files:** `src/narration-engine/entity-types/npc.js` and `src/services/tts-dialogue-cache.js` both reference `greeting` and `defeatLine`, but these refer to the **AI-generated dialogue system** (Tier A narration engine), NOT the bootstrap frame system being changed here. The `greeting` field in those files is a completely separate data path — the narration engine generates its own dialogue objects with `{greeting, defeatLine, freedLine, rounds}`. No changes needed.

**Note on game.js:** `public/game.js` passes `result.npcDialogue` as a whole object to `playNpcBattleIntro`. Since the backend now sends `{fightStart, defeatLine}` instead of `{greeting, fightStart, defeatLine}`, and the frontend (`room-transition.js`) now reads `.fightStart`, the pass-through works without changes.

- [ ] **Step 1: Update simulator dialogue keys**

In `simulator/engine/rooms/npc-battle.js` line 28:

```js
// Before:
const dialogueKeys = ['greeting', 'fightStart', 'defeatLine'];
// After:
const dialogueKeys = ['fightStart', 'defeatLine'];
```

- [ ] **Step 2: Remove shopGreetings from exploration-service**

In `src/game/services/exploration-service.js` line 350, the `shopGreetings` field on the NPC data object is a legacy fallback from before bootstrap frames existed. The friendly NPC shop now uses `getShopGreetingFrames()` in run.js. Remove the legacy field:

```js
// Before:
room.npc = { id: picked.id, name: picked.name, nameEn: picked.nameEn, shopGreetings: picked.shopGreetings || ['こんにちは！'] };
// After:
room.npc = { id: picked.id, name: picked.name, nameEn: picked.nameEn };
```

- [ ] **Step 3: Update exploration.js fallback**

In `public/js/ui/exploration.js` line 1211, the fallback `npc.shopGreetings?.[0]` is no longer needed since we removed the field. Update:

```js
// Before:
greetingContent = npc.shopGreetings?.[0] || 'こんにちは！';
// After:
greetingContent = 'こんにちは！';
```

- [ ] **Step 4: Syntax check**

```bash
node --check src/game/services/exploration-service.js && echo "OK"
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add simulator/engine/rooms/npc-battle.js src/game/services/exploration-service.js public/js/ui/exploration.js
git commit -m "refactor: clean up legacy shopGreetings and simulator dialogue keys"
```

---

## Chunk 2: Content Authoring

### Task 7: Audit barks and identify foundation words

**Files:**
- Read: `data/dialogue/frame-sources.json` (bark entries)
- Read: `docs/superpowers/specs/2026-04-10-glue-word-i1-dialogue-curriculum-design.md` (glue word list)

This is a research task — no code changes.

- [ ] **Step 1: List all content words currently taught by barks**

Run tokenize-static and extract the `words` arrays from all `bark_*` frames. Cross-reference against the 50 glue words to see which are already covered:

```bash
node -e "
const frames = require('./data/dialogue/frames.json');
const barkWords = new Set();
frames.filter(f => f.category.startsWith('bark_')).forEach(f => f.words?.forEach(w => barkWords.add(w)));
console.log('Bark words:', [...barkWords].sort().join(', '));

const glue = ['私','一緒','とても','今','知る','思う','これ','それ','まだ','言う','この','あの','来る','友達','嬉しい','今日','少し','出る','入る','上手','食べる','大きい','小さい','新しい','人','前','後','時','話','方','気','手','目','声','心','力','道','明日','分かる','教える','持つ','使う','作る','出来る','世界','場所','初めて','元気','名前','色'];
const overlap = glue.filter(w => barkWords.has(w));
const missing = glue.filter(w => !barkWords.has(w));
console.log('\nGlue words already in barks:', overlap.join(', '));
console.log('\nGlue words NOT in barks:', missing.join(', '));
"
```

- [ ] **Step 2: Note which bark words serve as building blocks**

Document the bark words that longer sentences will depend on as "known" prerequisites. These are the words the player learns first through combat and will use as the known foundation for longer i+1 sentences.

- [ ] **Step 3: Identify any bark rewrites needed**

If any critical building-block word is missing from barks, note it for a minor bark addition. Keep barks 1-2 words. Only add/change barks if it directly enables the glue word curriculum.

### Task 8: Write new frame-sources.json content

**Files:**
- Modify: `data/dialogue/frame-sources.json`

This is the core content authoring task. Write all new sentences following these rules:
- Every non-bark frame = exactly one sentence (one `isEligible` pass)
- Prioritize glue words — each of the 50 should appear in 3+ sentences across different contexts/lengths
- N5 grammar only (dictionary form verbs, basic adjectives, です/ます for formal NPCs)
- 1-6 content words per sentence (scaling with player vocabulary)
- Sentences must build on words taught by barks and gameplay (creature names, item words)
- **Particles are FREE** — は, が, を, に, で, の, と, も, etc. are not content words. Only tokens with a `base` field in the tokenizer output count. So "私は強い" has 2 content words (私, 強い), not 4.
- **Every content word must exist in `data/dictionary.json`**. The validator (`scripts/validate-dialogue.js`) will reject frames with missing dictionary entries. Check the dictionary before authoring to avoid mass failures.
- **shopPurchase frames with `{item}` slot get an entity token exception**: `isEligible` allows 2 unknowns when an entity token is present (1 entity + 1 content word). This means shopPurchase sentences can include 1 unknown glue word even when the item itself is unknown.
- **Frame ID naming**: Use descriptive suffixes matching existing convention (e.g. `befriend_success_happy`, `befriend_success_together`), not numeric suffixes.

- [ ] **Step 1: Write befriend frames**

Rewrite the existing befriend frames as proper single sentences at varying lengths. ~8 per sub-category (wait, name, success, wrong = ~32 total).

Guidelines per sub-category:
- `befriend_wait`: Creature asks player to wait. Short and emotional.
- `befriend_name`: Creature asks "what's my name?" variations.
- `befriend_success`: Celebration. Use glue words like 友達, 一緒, 嬉しい, 名前.
- `befriend_wrong`: Rejection. Use それ, 違う, まだ.

Example progression for `befriend_success`:
```json
{"id": "befriend_success_0", "category": "befriend_success", "raw": "友達だ！", "slots": []}
{"id": "befriend_success_1", "category": "befriend_success", "raw": "嬉しい友達だ！", "slots": []}
{"id": "befriend_success_2", "category": "befriend_success", "raw": "一緒に行く友達だ！", "slots": []}
```

- [ ] **Step 2: Write NPC fightStart frames**

~7-8 per NPC × 4 NPCs = ~30 total. Each NPC has a personality:
- **kodomo** (子供): Excited, playful, uses casual speech (だ, よ, ね)
- **otona** (大人): Calm, formal, uses です/ます
- **otokonoko** (男の子): Competitive, energetic, uses ぞ, ぜ
- **onnanoko** (女の子): Shy, hesitant, uses あ…, dots, ね

Fold the best existing `shopGreeting` lines into fightStart (they were the encounter greeting all along). Add new lines with glue words at varying lengths.

- [ ] **Step 3: Write NPC defeatLine frames**

~6 per NPC × 4 NPCs = ~25 total. Same personality rules. Use glue words like 強い (already known from barks), 思う, 今, 又, 次.

- [ ] **Step 4: Write shopGreeting frames**

~15 frames for the friendly NPC shopkeeper. Warm, welcoming tone. Use glue words like この, あの, 今日, 少し, 見る, 来る.

- [ ] **Step 5: Write shopPurchase frames**

Expand from 3 to ~10. These have an `{item}` slot. Use glue words like これ, この, 少し, 一緒.

- [ ] **Step 6: Regenerate frames.json**

```bash
node scripts/tokenize-static.js
```

- [ ] **Step 7: Validate**

```bash
node scripts/validate-dialogue.js
```

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Fix any test assertions that break due to changed frame counts.

- [ ] **Step 9: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "feat: author glue word i+1 dialogue for all exposure surfaces"
```

---

## Chunk 3: Validation Script

### Task 9: Build glue word progression validator

**Files:**
- Create: `scripts/validate-glue-progression.js`

- [ ] **Step 1: Write the validation script**

Create `scripts/validate-glue-progression.js`:

```js
#!/usr/bin/env node
/**
 * Validates that all 50 glue words are reachable through i+1 progression.
 *
 * Simulates a player starting from 0 known words, progressively learning
 * through gameplay (creatures, items, barks) and dialogue frames.
 *
 * Uses the real frames.json and isEligible filter — no manual tagging.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
const frames = JSON.parse(readFileSync(join(dataDir, 'dialogue', 'frames.json'), 'utf-8'));
const creatures = JSON.parse(readFileSync(join(dataDir, 'creatures.json'), 'utf-8'));
const items = JSON.parse(readFileSync(join(dataDir, 'items.json'), 'utf-8'));

// The 50 glue words
const GLUE_WORDS = new Set([
  '私','一緒','とても','今','知る','思う','これ','それ','まだ','言う',
  'この','あの','来る','友達','嬉しい','今日','少し','出る','入る','上手',
  '食べる','大きい','小さい','新しい','人','前','後','時','話','方',
  '気','手','目','声','心','力','道','明日','分かる','教える',
  '持つ','使う','作る','出来る','世界','場所','初めて','元気','名前','色'
]);

// isEligible from token-format.js (inlined to avoid ESM import issues in script)
const SENTENCE_ENDERS = new Set(['。', '！', '？', '!', '?']);
function isEligible(tokens, knownWords) {
  let unknowns = 0;
  let hasEntity = false;
  for (const token of tokens) {
    if (!token.base) {
      if (SENTENCE_ENDERS.has(token.surface)) {
        const max = hasEntity ? 2 : 1;
        if (unknowns > max) return false;
        unknowns = 0;
        hasEntity = false;
      }
      continue;
    }
    if (token.entity) hasEntity = true;
    if (!knownWords.has(token.base)) unknowns++;
  }
  const max = hasEntity ? 2 : 1;
  return unknowns <= max;
}

// Collect gameplay vocab (what the player learns from creatures/items, not dialogue)
const gameplayWords = new Set();
for (const c of Object.values(creatures)) {
  if (c.word) gameplayWords.add(c.word);
  if (c.name) gameplayWords.add(c.name);
}
for (const item of Object.values(items)) {
  if (item.word) gameplayWords.add(item.word);
}

// Separate bark frames from dialogue frames
const barkFrames = frames.filter(f => f.category.startsWith('bark_'));
const dialogueFrames = frames.filter(f => !f.category.startsWith('bark_'));

// Collect all content words from barks
const barkWords = new Set();
for (const f of barkFrames) {
  for (const w of (f.words || [])) barkWords.add(w);
}

// Simulation
const known = new Set();
const glueLearnedAt = new Map(); // glueWord → step#
const usedFrames = new Set();
let step = 0;

function learn(word) {
  if (known.has(word)) return;
  known.add(word);
  if (GLUE_WORDS.has(word)) {
    glueLearnedAt.set(word, step);
  }
}

// Phase 1: Learn gameplay vocab
step = 1;
for (const w of gameplayWords) learn(w);
console.log(`Step ${step}: Gameplay vocab → ${known.size} words known`);

// Phase 2: Learn bark words
step = 2;
for (const w of barkWords) learn(w);
console.log(`Step ${step}: Bark words → ${known.size} words known`);

// Phase 3+: Iteratively find eligible dialogue frames and learn from them
let changed = true;
while (changed) {
  changed = false;
  step++;
  for (const frame of dialogueFrames) {
    if (usedFrames.has(frame.id)) continue;
    if (!isEligible(frame.tokens || [], known)) continue;

    // This frame is eligible — learn its unknown word(s)
    usedFrames.add(frame.id);
    for (const w of (frame.words || [])) {
      if (!known.has(w)) {
        learn(w);
        changed = true;
      }
    }
  }
  if (changed) {
    const glueCount = [...GLUE_WORDS].filter(w => known.has(w)).length;
    console.log(`Step ${step}: Dialogue iteration → ${known.size} words known, ${glueCount}/50 glue words`);
  }
}

// Report
console.log('\n=== RESULTS ===');
const learned = [...GLUE_WORDS].filter(w => glueLearnedAt.has(w));
const unreachable = [...GLUE_WORDS].filter(w => !known.has(w));

console.log(`\nGlue words learned: ${learned.length}/50`);
if (learned.length > 0) {
  console.log('\nLearning order:');
  const sorted = [...glueLearnedAt.entries()].sort((a, b) => a[1] - b[1]);
  for (const [word, s] of sorted) {
    console.log(`  Step ${s}: ${word}`);
  }
}

if (unreachable.length > 0) {
  console.log(`\n❌ UNREACHABLE glue words (${unreachable.length}):`);
  for (const w of unreachable) {
    console.log(`  ${w}`);
    // Find frames that contain this word to diagnose why they're not eligible
    const containing = dialogueFrames.filter(f => (f.words || []).includes(w));
    for (const f of containing.slice(0, 3)) {
      const unknownsInFrame = (f.words || []).filter(fw => !known.has(fw));
      console.log(`    Frame ${f.id}: needs [${unknownsInFrame.join(', ')}] (${unknownsInFrame.length} unknowns)`);
    }
  }
  process.exit(1);
} else {
  console.log('\n✅ All 50 glue words are reachable!');
}
```

- [ ] **Step 2: Run it**

```bash
node scripts/validate-glue-progression.js
```

Expected: Report showing which glue words are reachable and which aren't. After Task 8, all 50 should be reachable.

- [ ] **Step 3: Fix gaps**

If any glue words are unreachable, go back to `frame-sources.json` and add sentences that use the unreachable word alongside words the player already knows. Regenerate and re-validate:

```bash
node scripts/tokenize-static.js && node scripts/validate-glue-progression.js
```

Repeat until all 50 pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-glue-progression.js
git commit -m "feat: add glue word progression validation script"
```

### Task 10: Final test pass and cleanup

**Files:**
- Modify: `tests/unit/dialogue-loader.test.js` (if frame counts changed)
- Modify: `tests/integration/dialogue-bootstrap.test.js` (if assertions need updating)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

- [ ] **Step 2: Fix any broken assertions**

Update frame count assertions in tests to match the new content. For example, `getBefriendFrames` tests may assert `frames.wait.length === 5` — update to match actual count.

- [ ] **Step 3: Run validation script one final time**

```bash
node scripts/validate-glue-progression.js
```

Expected: `✅ All 50 glue words are reachable!`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update assertions for glue word dialogue content"
```
