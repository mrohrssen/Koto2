# Translator Upgrade (Frames → AI Dialogue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single per-user "Translator Upgrade" switch that flips all conversation surfaces (creature befriend, NPC one-liners, revived 3-round bond conversation, and the shop/shrine line pools) from static frames to AI-generated i+1 dialogue — triggered by vocab readiness (≥130 known words incl. ≥40 of a 60-word glue pool) plus a verified pre-generated dialogue inventory, announced by a one-time Cid scene.

**Architecture:** A new central `dialogue-director` module computes switch state from FSRS known words + a glue-word config, persists high-water state in player meta, and gates every AI-serving call site via `shouldUseAiDialogue`. Frames remain the permanent per-request fallback. Preflight generation reuses the existing narration-engine queue + i+1 repair pipeline; the Cid moment is a client scene triggered by a new evaluate/complete route pair.

**Tech Stack:** Node ESM, Express, node:test + assert/strict, existing narration-engine (`src/narration-engine/`), frames pipeline (Sudachi), FSRS decks (`getKnownWordsFromFsrs`).

**Spec:** `docs/superpowers/specs/2026-07-07-frames-to-ai-dialogue-transition-design.md`

## Global Constraints

- Work in a feature worktree off `dev`; use `/usr/bin/git` (never Homebrew git).
- Gate on **failing-set equality** for `npm test`: ~48 sudachipy/numpy failures are permanent in the local env. Before starting, record the baseline failing set (`npm test 2>&1 | tee /tmp/baseline.txt`); after each task, compare failing test NAMES against baseline — exit code alone is NOT the gate.
- After editing any `public/js`/`public/game.js` file: `node --check <file> && echo OK`.
- Never hand-edit `data/dialogue/frames.json` — author in `frame-sources.json`, run `node scripts/tokenize-static.js`, then `node scripts/validate-dialogue.js`.
- **NEVER modify `data/dictionary.json` or the validator's allowed-words policy without explicit user confirmation** (Task 13 is STOP-gated for this reason).
- All new Japanese shown to players must be i+1-validated (frames pipeline or narration-engine repair loop). The Cid upgrade scene is English-only by design.
- Commit after every task (small, frequent commits).
- Server AI env for manual testing: `AI_DIALOGUE_PROVIDER`, `AI_DIALOGUE_API_KEY`, `AI_DIALOGUE_MODEL` must be set or AI paths no-op to frames (that degradation is by design).

## Key Existing Interfaces (read-only reference)

- `getKnownWordsFromFsrs(userId) -> string[]` — `src/game/bootstrap/word-knowledge.js:195`. Known = FSRS Learning/Review/Relearning.
- `buildAiDialogueConfig(env?) -> {provider,apiKey,model,...}|null`, `canUseAiDialogue(keys, config) -> bool` — `src/ai-dialogue/config.js`.
- `getDialogueFromCache(userId, entityId, entityType)`, `queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, entityType, ttsOptions, options)`, `isDialogueCacheStale(userId, entityId, vocabContext, entityType)` — `src/narration-engine/index.js`. In routes these arrive as DI'd deps (`getNpcDialogueFromCache`, `queueMissingNpcDialoguesFn`, etc. — see `src/routes/index.js:79` and `server.js:44-53`).
- NPC dialogue cache shape (entityType `npc`): `{ greeting, defeatLine, freedLine, rounds: [{ npcLine, npcLineTts?, options: [{text, tone, tts?}] }], greetingTts?, defeatLineTts?, freedLineTts? }`.
- Creature cache shape: `{ rounds: [{ speaker, options: [string×3], correctIndex, speakerTts?, optionsTts? }] }`.
- `meta.levels.highestUnlocked` (1-based) — `src/game/state.js:69`; `AREAS` array — `src/game/rooms.js:41` (each area: `{id, creatures: string[], bossCreatureId, ...}`).
- `loadNpcs()` — `src/game/services/npc-service.js` (48 NPCs, `.area` field); `shuffleOptions(options)` same file.
- `loadCharacterCards(type)` -> `{[id]: card}` — `src/narration-engine/character-cards.js`.
- Client conversation UI is INTACT: `runNpcDialogue()` in `public/js/ui/npc-dialogue-ui.js` handles `mode:'defeat_line'` AND the conversation shape `{ npc, freed, freedTts, userId, rounds: [{npcLine, npcLineTts?, options:[{text, tts?}]}] }` with `apiRespondNpcDialogue(i, selectedIndex)`.
- `updateUserKeys(userId, keys, encryptionKey)` **replaces** the whole encrypted blob (`src/auth/users.js:142`) — merging requires decrypt+spread (Task 5 adds `mergeUserKeys`).
- Test conventions: `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';` — run one file via `node --experimental-test-module-mocks --test tests/unit/<file>.test.js`.
- Shop/shrine frame serving sites (all follow `frames → assembleFrame → selectBestFrame`, `src/game/token-format.js:19,142`): `run.js hydrateFriendlyNpcOfferDisplayPayload:199-224` (shopPurchase per offered item + shopGreeting), `run.js /shrine-offers:545-575` (shrineGreeting, speaker `shrine_fox`), and `explore-runway-service.js` pool helpers `shrineGreetingFrames()/shopGreetingFrames()/shopPurchaseFrames()` (lines ~175-190) feeding `buildShrinePayload` + the friendly-NPC prepared payload.
- Slot token shape in frames: a bare `{ "slot": "item" }` object spliced among normal tokens (see `shopPurchase_please` in `data/dialogue/frames.json`); `assembleFrame(frame, { item }, { dict })` fills it. `tokenizeDialogueTexts(texts, { dict })` (`src/game/dialogue-tokenizer.js`) is the runtime tokenizer (already used at serve time by the befriend display service) returning `[{ tokens, words }]`.
- Entity-type dispatch is registry-driven (`src/narration-engine/entity-types/index.js` REGISTRY; generation.js, dialogue-repair.js, text-cache.js all call `getEntityType(entityType)`), EXCEPT: two hardcoded card-type ternaries in `src/narration-engine/index.js` (`loadCharacterCards(entityType === 'creature' ? 'creature' : 'npc')` at ~line 92 and `const cardType = ...` at ~line 184) and the `['npc', 'creature']` loop in `invalidateNarrationUser` (~line 57). `loadCharacterCards(type)` reads `data/character-cards/${type}s.json`.

---

### Task 1: Create the feature worktree

**Files:** none (git only)

- [ ] **Step 1: Sync dev and create worktree**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-translator-upgrade -b feature/translator-upgrade
cd ../koto-wt-translator-upgrade
npm install
```

Expected: new worktree at `../koto-wt-translator-upgrade` on branch `feature/translator-upgrade`.

- [ ] **Step 2: Record the npm test baseline failing set**

```bash
npm test 2>&1 | tee /tmp/translator-upgrade-baseline.txt | tail -20
grep -E "^(✖|not ok|✗|failing)" /tmp/translator-upgrade-baseline.txt | sort > /tmp/translator-upgrade-baseline-failures.txt
wc -l /tmp/translator-upgrade-baseline-failures.txt
```

Expected: a stable list (~48 environmental failures). All later "run full tests" steps compare against this file.

---

### Task 2: Switch config + Dialogue Director core

**Files:**
- Create: `data/dialogue-switch-config.json`
- Create: `src/game/dialogue-director.js`
- Test: `tests/unit/dialogue-director.test.js`

**Interfaces:**
- Produces: `loadSwitchConfig() -> {minKnownWords, minGlueWords, glueWords: string[]}`;
  `ensureTranslatorUpgrade(meta) -> {active, readyAt, seenAt}` (creates the meta node if missing);
  `getSwitchState(userId, meta, {getKnownWords?}) -> {knownCount, glueCount, thresholdMet, ready, active, seen}`;
  `shouldUseAiDialogue({userKeys, meta, aiConfig, debugOverride}) -> boolean`;
  `markTranslatorUpgradeReady(meta) -> void`; `activateTranslatorUpgrade(meta) -> void`;
  `clearSwitchConfigCache() -> void` (tests only).

- [ ] **Step 1: Write the config file**

Create `data/dialogue-switch-config.json`. The 60-word glue pool was re-derived from scratch on 2026-07-07 (supersedes the April findings-doc curriculum — see spec §1 Condition A). It excludes bark-guaranteed words (これ/嬉しい/新しい) and grammar-pattern words (方/時/後); みんな and どっち have user-approved dictionary entries (added 2026-07-07):

```json
{
  "minKnownWords": 130,
  "minGlueWords": 40,
  "glueWords": [
    "私", "人", "友達", "みんな", "名前", "一緒",
    "この", "それ", "あの", "そこ", "どっち",
    "今", "今日", "明日", "昨日", "今度", "また", "もう", "まだ", "いつも", "前",
    "とても", "少し", "ちょっと", "もっと", "たくさん", "全部", "一番",
    "思う", "知る", "分かる", "言う", "聞く", "話す", "教える", "言葉",
    "来る", "会う", "帰る", "出る", "入る",
    "食べる", "買う", "作る", "使う", "持つ", "休む", "出来る",
    "大きい", "小さい", "可愛い", "欲しい", "古い", "高い", "安い", "難しい", "簡単", "上手", "大切",
    "場所"
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/dialogue-director.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSwitchConfig,
  clearSwitchConfigCache,
  ensureTranslatorUpgrade,
  getSwitchState,
  shouldUseAiDialogue,
  markTranslatorUpgradeReady,
  activateTranslatorUpgrade
} from '../../src/game/dialogue-director.js';

const GLUE = loadSwitchConfig().glueWords;

// Build a known-words list: `nGlue` glue words + filler nouns up to `total`.
function knownWords(total, nGlue) {
  const words = GLUE.slice(0, nGlue);
  for (let i = words.length; i < total; i++) words.push(`filler${i}`);
  return words;
}

function freshMeta() { return {}; }

describe('dialogue-director switch state', () => {
  beforeEach(() => clearSwitchConfigCache());

  it('loads config with 60 glue words and thresholds', () => {
    const cfg = loadSwitchConfig();
    assert.equal(cfg.minKnownWords, 130);
    assert.equal(cfg.minGlueWords, 40);
    assert.equal(cfg.glueWords.length, 60);
  });

  it('threshold NOT met at 129 words / 40 glue', () => {
    const state = getSwitchState('u1', freshMeta(), { getKnownWords: () => knownWords(129, 40) });
    assert.equal(state.knownCount, 129);
    assert.equal(state.glueCount, 40);
    assert.equal(state.thresholdMet, false);
  });

  it('threshold NOT met at 130 words / 39 glue', () => {
    const state = getSwitchState('u1', freshMeta(), { getKnownWords: () => knownWords(130, 39) });
    assert.equal(state.thresholdMet, false);
  });

  it('threshold met at exactly 130 words / 40 glue', () => {
    const state = getSwitchState('u1', freshMeta(), { getKnownWords: () => knownWords(130, 40) });
    assert.equal(state.thresholdMet, true);
    assert.equal(state.ready, false);
    assert.equal(state.active, false);
  });

  it('ensureTranslatorUpgrade creates the meta node once', () => {
    const meta = freshMeta();
    const node = ensureTranslatorUpgrade(meta);
    assert.deepEqual(node, { active: false, readyAt: null, seenAt: null });
    node.active = true;
    assert.equal(ensureTranslatorUpgrade(meta).active, true); // same node, not recreated
  });

  it('high-water: active survives a vocab lapse below threshold', () => {
    const meta = freshMeta();
    ensureTranslatorUpgrade(meta);
    markTranslatorUpgradeReady(meta);
    activateTranslatorUpgrade(meta);
    const state = getSwitchState('u1', meta, { getKnownWords: () => knownWords(50, 5) });
    assert.equal(state.thresholdMet, false);
    assert.equal(state.active, true);
    assert.equal(state.ready, true);
    assert.equal(state.seen, true);
  });
});

describe('shouldUseAiDialogue', () => {
  const aiConfig = { provider: 'openai', apiKey: 'k', model: 'm' };
  const activeMeta = { translatorUpgrade: { active: true, readyAt: 'x', seenAt: 'x' } };
  const okKeys = { aiDataSharingConsent: true, aiConversationsEnabled: true };

  it('true when env + consent + enabled + active', () => {
    assert.equal(shouldUseAiDialogue({ userKeys: okKeys, meta: activeMeta, aiConfig }), true);
  });

  it('false without server AI config', () => {
    assert.equal(shouldUseAiDialogue({ userKeys: okKeys, meta: activeMeta, aiConfig: null }), false);
  });

  it('false without consent even with debugOverride', () => {
    assert.equal(shouldUseAiDialogue({
      userKeys: { aiDataSharingConsent: false }, meta: activeMeta, aiConfig, debugOverride: true
    }), false);
  });

  it('false when switch not active', () => {
    assert.equal(shouldUseAiDialogue({ userKeys: okKeys, meta: {}, aiConfig }), false);
  });

  it('false when user opted out (enabled=false) even if active', () => {
    assert.equal(shouldUseAiDialogue({
      userKeys: { aiDataSharingConsent: true, aiConversationsEnabled: false }, meta: activeMeta, aiConfig
    }), false);
  });

  it('debugOverride bypasses enabled + active but not consent/env', () => {
    assert.equal(shouldUseAiDialogue({
      userKeys: { aiDataSharingConsent: true, aiConversationsEnabled: false }, meta: {}, aiConfig, debugOverride: true
    }), true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director.test.js
```

Expected: FAIL — `Cannot find module '../../src/game/dialogue-director.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/game/dialogue-director.js`:

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getKnownWordsFromFsrs } from './bootstrap/word-knowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _config = null;

export function loadSwitchConfig() {
  if (!_config) {
    _config = JSON.parse(
      readFileSync(join(__dirname, '../../data/dialogue-switch-config.json'), 'utf8')
    );
  }
  return _config;
}

export function clearSwitchConfigCache() {
  _config = null;
}

/**
 * Ensure meta.translatorUpgrade exists. High-water state: `active` is only
 * ever set true (never auto-reverted), so an FSRS lapse below the threshold
 * cannot take AI dialogue away.
 */
export function ensureTranslatorUpgrade(meta) {
  if (!meta.translatorUpgrade) {
    meta.translatorUpgrade = { active: false, readyAt: null, seenAt: null };
  }
  return meta.translatorUpgrade;
}

export function markTranslatorUpgradeReady(meta) {
  const node = ensureTranslatorUpgrade(meta);
  if (!node.readyAt) node.readyAt = new Date().toISOString();
}

export function activateTranslatorUpgrade(meta) {
  const node = ensureTranslatorUpgrade(meta);
  node.active = true;
  if (!node.seenAt) node.seenAt = new Date().toISOString();
}

/**
 * Compute the player's switch state.
 * thresholdMet = vocab readiness only; ready/active/seen come from meta.
 */
export function getSwitchState(userId, meta, { getKnownWords = getKnownWordsFromFsrs } = {}) {
  const config = loadSwitchConfig();
  const known = getKnownWords(userId) || [];
  const knownSet = new Set(known);
  const glueCount = config.glueWords.reduce((n, w) => n + (knownSet.has(w) ? 1 : 0), 0);
  const upgrade = meta?.translatorUpgrade || { active: false, readyAt: null, seenAt: null };
  return {
    knownCount: known.length,
    glueCount,
    thresholdMet: known.length >= config.minKnownWords && glueCount >= config.minGlueWords,
    ready: !!upgrade.readyAt,
    active: upgrade.active === true,
    seen: !!upgrade.seenAt
  };
}

/**
 * The single serving gate for every AI dialogue surface.
 * Env + consent are hard requirements; debugOverride bypasses only the
 * user toggle and the earned switch (for dev accounts testing pre-threshold).
 */
export function shouldUseAiDialogue({ userKeys = {}, meta = {}, aiConfig = null, debugOverride = false } = {}) {
  if (!aiConfig?.provider || !aiConfig?.apiKey || !aiConfig?.model) return false;
  if (userKeys.aiDataSharingConsent !== true) return false;
  if (debugOverride) return true;
  return userKeys.aiConversationsEnabled === true
    && meta?.translatorUpgrade?.active === true;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director.test.js
```

Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add data/dialogue-switch-config.json src/game/dialogue-director.js tests/unit/dialogue-director.test.js
/usr/bin/git commit -m "feat: dialogue director core — translator-upgrade switch state + gating"
```

---

### Task 3: Meta default + backfill

**Files:**
- Modify: `src/game/state.js:69` (inside `createNewMeta`, next to `levels`)
- Modify: `src/game/loop.js:77` (constructor backfill, next to the `meta.levels` backfill)
- Test: `tests/unit/dialogue-director-meta.test.js`

**Interfaces:**
- Consumes: `ensureTranslatorUpgrade(meta)` from Task 2.
- Produces: every `GameManager` instance now has `meta.translatorUpgrade` — later tasks may read it unconditionally.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dialogue-director-meta.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewMeta } from '../../src/game/state.js';

describe('translatorUpgrade meta defaults', () => {
  it('createNewMeta includes translatorUpgrade defaults', () => {
    const meta = createNewMeta();
    assert.deepEqual(meta.translatorUpgrade, { active: false, readyAt: null, seenAt: null });
  });
});
```

Note: if `state.js` exports a different factory name (check `grep -n "export function createNew" src/game/state.js`), adapt the import — the assertion stays the same.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director-meta.test.js
```

Expected: FAIL — `translatorUpgrade` is `undefined`.

- [ ] **Step 3: Add the default in state.js**

In `src/game/state.js`, directly below the `levels` line (`state.js:69`):

```js
    // Area progression (highestUnlocked is 1-based: 1 = first area only)
    levels: { highestUnlocked: 1, completed: [], current: null },
    // Frames→AI dialogue switch (high-water; see src/game/dialogue-director.js)
    translatorUpgrade: { active: false, readyAt: null, seenAt: null },
```

- [ ] **Step 4: Add the backfill in loop.js**

In `src/game/loop.js`, directly after the `meta.levels` backfill (`loop.js:77`):

```js
    if (!this.meta.levels) {
      this.meta.levels = { highestUnlocked: 1, completed: [], current: null };
    }
    if (!this.meta.translatorUpgrade) {
      this.meta.translatorUpgrade = { active: false, readyAt: null, seenAt: null };
    }
```

(Keep the existing `levels` backfill unchanged; add only the `translatorUpgrade` block.)

- [ ] **Step 5: Run tests**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director-meta.test.js
```

Expected: PASS. The meta object is serialized into the enriched game state's `meta` section already (the client reads `gameState.meta.prologueComplete` the same way), so no state-route change is needed.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add src/game/state.js src/game/loop.js tests/unit/dialogue-director-meta.test.js
/usr/bin/git commit -m "feat: translatorUpgrade meta default + save backfill"
```

---

### Task 4: Debug override flag (dev accounts)

**Files:**
- Modify: `src/game/debug-super-attack-access.js` (append two functions)
- Modify: `src/routes/settings.js` (expose GET/POST like `debugForceBefriend`)
- Test: `tests/unit/debug-translator-upgrade-access.test.js`

**Interfaces:**
- Produces: `getDebugForceTranslatorUpgradeForUser(settings, user) -> boolean`,
  `setDebugForceTranslatorUpgradeForUser(settings, user, enabled) -> boolean`.
  Later tasks read this as the `debugOverride` argument to `shouldUseAiDialogue`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debug-translator-upgrade-access.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDebugForceTranslatorUpgradeForUser,
  setDebugForceTranslatorUpgradeForUser
} from '../../src/game/debug-super-attack-access.js';

describe('debug force translator upgrade', () => {
  it('false for non-debug users, even when the flag is set', () => {
    const settings = { debugForceTranslatorUpgrade: true };
    assert.equal(getDebugForceTranslatorUpgradeForUser(settings, { username: 'someone' }), false);
  });

  it('per-username value wins for debug users', () => {
    const settings = {};
    assert.equal(setDebugForceTranslatorUpgradeForUser(settings, { username: 'michia' }, true), true);
    assert.equal(getDebugForceTranslatorUpgradeForUser(settings, { username: 'michia' }), true);
    assert.equal(setDebugForceTranslatorUpgradeForUser(settings, { username: 'michia' }, false), true);
    assert.equal(getDebugForceTranslatorUpgradeForUser(settings, { username: 'michia' }), false);
  });

  it('set returns false for non-debug users', () => {
    assert.equal(setDebugForceTranslatorUpgradeForUser({}, { username: 'someone' }, true), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/debug-translator-upgrade-access.test.js
```

Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement (mirror the befriend pattern exactly)**

Append to `src/game/debug-super-attack-access.js`:

```js
export function getDebugForceTranslatorUpgradeForUser(settings = {}, user = null) {
  if (!canUseDebugSuperAttack(user)) return false;

  const byUsername = settings.debugForceTranslatorUpgradeByUsername;
  if (byUsername && Object.hasOwn(byUsername, user.username)) {
    return !!byUsername[user.username];
  }

  return !!settings.debugForceTranslatorUpgrade;
}

export function setDebugForceTranslatorUpgradeForUser(settings, user, enabled) {
  if (!canUseDebugSuperAttack(user)) return false;

  if (!settings.debugForceTranslatorUpgradeByUsername || Array.isArray(settings.debugForceTranslatorUpgradeByUsername)) {
    settings.debugForceTranslatorUpgradeByUsername = {};
  }

  settings.debugForceTranslatorUpgradeByUsername[user.username] = !!enabled;
  return true;
}
```

- [ ] **Step 4: Expose in settings routes**

In `src/routes/settings.js`: add both functions to the existing import from `../game/debug-super-attack-access.js`. In the GET `/settings` handler, inside the existing `if (canUseDebugSuperAttack(req.user))` block, add:

```js
      response.debugForceTranslatorUpgrade = getDebugForceTranslatorUpgradeForUser(settings, req.user);
```

In the POST `/settings` handler, find where `debugForceBefriend` is persisted (grep `setDebugForceBefriendForUser` in the file) and add the same pattern beside it:

```js
    if (typeof req.body.debugForceTranslatorUpgrade === 'boolean') {
      setDebugForceTranslatorUpgradeForUser(settings, req.user, req.body.debugForceTranslatorUpgrade);
    }
```

- [ ] **Step 5: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/debug-translator-upgrade-access.test.js
/usr/bin/git add src/game/debug-super-attack-access.js src/routes/settings.js tests/unit/debug-translator-upgrade-access.test.js
/usr/bin/git commit -m "feat: debugForceTranslatorUpgrade dev override flag"
```

---

### Task 5: Lift the michia-only clamp on aiConversationsEnabled

**Files:**
- Modify: `src/auth/users.js` (`getUserKeys:360-377`, `migrateAiConsentForExistingUsers:204-210`; add `mergeUserKeys`)
- Modify: `src/auth/routes.js` (`me:189-210`, `updateKeys:222-250`)
- Modify: `public/js/ui/modals.js:77` (label copy)
- Test: `tests/unit/auth-ai-conversations-unclamped.test.js`

**Interfaces:**
- Produces: `mergeUserKeys(userId, partialKeys, encryptionKey) -> void` (decrypt-merge-encrypt; Task 11's complete route uses it). `getUserKeys(userId).aiConversationsEnabled` now reflects the stored value for every user.

**Background:** today `aiConversationsEnabled` is hard-clamped to `false` unless `username === 'michia'` (`isPersonalizedDialogueDebugUser`). Post-switch, regular users must be able to hold `true`. Serving safety moves to `shouldUseAiDialogue` (needs `meta.translatorUpgrade.active`), so unclamping the key is safe.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth-ai-conversations-unclamped.test.js`. Look at existing auth unit tests (`ls tests/unit/auth/`) and reuse their user-creation helper pattern. The test must cover, for a NON-michia user:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Reuse the setup pattern from tests/unit/auth/*.test.js for creating a user
// against a temp DB (resetDbForTest + createUser). Then:

// 1. mergeUserKeys stores aiConversationsEnabled=true for a regular user
//    and getUserKeys returns it as true (not clamped to false).
// 2. mergeUserKeys preserves other existing keys (set jlptLevel first,
//    then merge aiConversationsEnabled, then assert both survive).
```

Concrete assertions (adapt setup to the existing helper):

```js
    mergeUserKeys(user.id, { jlptLevel: 'N3' }, encryptionKey);
    mergeUserKeys(user.id, { aiConversationsEnabled: true, aiDataSharingConsent: true }, encryptionKey);
    const keys = getUserKeys(user.id);
    assert.equal(keys.aiConversationsEnabled, true);
    assert.equal(keys.jlptLevel, 'N3');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/auth-ai-conversations-unclamped.test.js
```

Expected: FAIL — `mergeUserKeys` not exported; after adding it, the clamp still forces `false`.

- [ ] **Step 3: Implement in users.js**

(a) Add `mergeUserKeys` below `updateUserKeys` (`src/auth/users.js:146`):

```js
/**
 * Merge partial keys into a user's encrypted key blob (decrypt → spread → encrypt).
 * Unlike updateUserKeys, existing keys are preserved.
 */
export function mergeUserKeys(userId, partialKeys, encryptionKey = process.env.ENCRYPTION_KEY || 'a'.repeat(64)) {
  const user = findUserById(userId);
  if (!user) throw new Error('User not found');
  let existing = {};
  if (user.encryptedApiKeys) {
    try { existing = decryptKeys(user.encryptedApiKeys, encryptionKey); } catch { /* start fresh */ }
  }
  setUserEncryptedApiKeys(userId, encryptKeys({ ...existing, ...partialKeys }, encryptionKey));
}
```

(b) In `getUserKeys` (line 369), remove the clamp:

```js
        aiConversationsEnabled: keys.aiConversationsEnabled === true,
```

(c) In `migrateAiConsentForExistingUsers` (lines 204-210), stop force-resetting the flag for regular users — replace the block with:

```js
    if (typeof keys.aiConversationsEnabled !== 'boolean') {
      keys.aiConversationsEnabled = false;
      changed = true;
    }
```

Keep `isPersonalizedDialogueDebugUser` exported (other call sites in `auth/routes.js` are updated next; the debug-super-attack allowlist is separate and untouched).

- [ ] **Step 4: Implement in auth/routes.js**

(a) In `me` (lines 189-210): delete the `showPersonalizedDialogueSetting` gating so `aiConversationsEnabled` is ALWAYS included:

```js
    let apiKeysInfo = {
      jlptLevel: 'N4',
      aiDataSharingConsent: false,
      aiConversationsEnabled: false
    };
    if (user.encryptedApiKeys) {
      try {
        const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
        apiKeysInfo = {
          jlptLevel: keys.jlptLevel || 'N4',
          aiDataSharingConsent: keys.aiDataSharingConsent === true,
          aiConversationsEnabled: keys.aiConversationsEnabled === true
        };
      } catch {
        // Keep defaults on decryption failure
      }
    }
```

(b) In `updateKeys` (lines 222-250): remove the clamp lines — accept the flag for everyone:

```js
    if (aiConversationsEnabled !== undefined) {
      keys.aiConversationsEnabled = aiConversationsEnabled === true;
    }
```

and delete the `if (!showPersonalizedDialogueSetting) { merged.aiConversationsEnabled = false; }` block (and the now-unused `showPersonalizedDialogueSetting` locals in both handlers; remove the `isPersonalizedDialogueDebugUser` import if no usage remains in the file).

- [ ] **Step 5: Update the settings label (client)**

In `public/js/ui/modals.js:77`, change the checkbox label text `Personalized Dialogue` → `Dynamic conversations`. Then:

```bash
node --check public/js/ui/modals.js && echo OK
```

- [ ] **Step 6: Run tests (targeted + full)**

```bash
node --experimental-test-module-mocks --test tests/unit/auth-ai-conversations-unclamped.test.js
npm test 2>&1 | tee /tmp/task5.txt | tail -5
grep -E "^(✖|not ok|✗|failing)" /tmp/task5.txt | sort > /tmp/task5-failures.txt
diff /tmp/translator-upgrade-baseline-failures.txt /tmp/task5-failures.txt && echo "FAILING SET UNCHANGED"
```

Expected: new test PASS; failing-set diff empty. If auth tests assert the old clamping behavior, update those assertions to the new semantics (they are testing the removed restriction, not a regression).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/auth/users.js src/auth/routes.js public/js/ui/modals.js tests/unit/auth-ai-conversations-unclamped.test.js
/usr/bin/git commit -m "feat: unclamp aiConversationsEnabled for all users + mergeUserKeys helper"
```

---

### Task 6: Gate befriend + background queues through the director

**Files:**
- Modify: `src/routes/game/combat.js` (befriend-conversation route, line ~544)
- Modify: `src/routes/game/route-helpers.js` (`buildBefriendDialogueVocabConfig:74-91`)
- Modify: `src/routes/game/run.js` (`queueBackgroundDialogues:227-264`)
- Test: `tests/integration/translator-switch-befriend.test.js`

**Interfaces:**
- Consumes: `shouldUseAiDialogue`, `getDebugForceTranslatorUpgradeForUser`.
- Produces: befriend + background generation now keyed off the earned switch. No shape changes to any response.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/translator-switch-befriend.test.js` using `createTestApp` + the api-client helper (see `tests/integration/helpers/`). Scenario:

```js
// 1. Boot test app, register/login a user (game-flow helpers).
// 2. POST /api/game/befriend-conversation with no active combat →
//    still 400 (combat guard runs first) — sanity that route exists.
// 3. The real assertion is unit-level on the gate composition, so ALSO add
//    to tests/unit/dialogue-director.test.js:
//    - a test that shouldUseAiDialogue({userKeys: consent+enabled, meta: inactive})
//      is false — already covered in Task 2.
// This integration test's job: with AI_DIALOGUE_* env UNSET, a befriend
// conversation request from a real combat state returns the name-quiz
// fallback (befriendQuiz key present), NOT a 5xx.
```

Use the game-flow helper to reach a creature combat with an eligible enemy if one exists (`grep -rn "befriend" tests/integration/flows/` for a prior example to copy). If no prior befriend flow test exists, assert the simpler contract: route returns 400/403/fallback — never throws — when the switch is inactive.

- [ ] **Step 2: Run to verify current behavior**

```bash
node --experimental-test-module-mocks --test tests/integration/translator-switch-befriend.test.js
```

Expected: may PASS pre-change (fallback already exists for missing env). That is fine — this test is the regression net for the gating swap.

- [ ] **Step 3: Swap the gate in combat.js**

In `src/routes/game/combat.js`:

(a) Add imports:

```js
import { shouldUseAiDialogue } from '../../game/dialogue-director.js';
import { getDebugForceTranslatorUpgradeForUser } from '../../game/debug-super-attack-access.js';
```

(b) In the `/befriend-conversation` route (line ~544), replace:

```js
      const aiConfig = buildAiDialogueConfig();
      if (!canUseAiDialogue(req.userKeys || {}, aiConfig)) {
```

with:

```js
      const aiConfig = buildAiDialogueConfig();
      const debugOverride = getDebugForceTranslatorUpgradeForUser(req.getSettings?.() || {}, req.user);
      if (!shouldUseAiDialogue({
        userKeys: req.userKeys || {},
        meta: gameManager.getMeta(),
        aiConfig,
        debugOverride
      })) {
```

(The fallback body below the check stays untouched.)

- [ ] **Step 4: Swap the gate in route-helpers.js**

In `buildBefriendDialogueVocabConfig` (`src/routes/game/route-helpers.js:74`), the function signature gains the manager meta. Replace the function with:

```js
export function buildBefriendDialogueVocabConfig(req, getUserVocabulary, checkSentenceViolations) {
  const userKeys = req.userKeys || {};
  const aiConfig = buildAiDialogueConfig();
  const debugOverride = getDebugForceTranslatorUpgradeForUser(req.getSettings?.() || {}, req.user);
  const meta = req.gameManager?.getMeta?.() || {};
  if (!shouldUseAiDialogue({ userKeys, meta, aiConfig, debugOverride }) || !getUserVocabulary) return null;

  const { words: vocabulary } = getUserVocabulary(req.user.id);
  const vocabSet = new Set(vocabulary);
  const checkViolationsFn = checkSentenceViolations
    ? async (text) => checkSentenceViolations(text, vocabSet, new Set())
    : null;

  return {
    aiConfig,
    vocabulary,
    vocabSet,
    checkViolationsFn
  };
}
```

Add the two imports at the top of the file:

```js
import { shouldUseAiDialogue } from '../../game/dialogue-director.js';
import { getDebugForceTranslatorUpgradeForUser } from '../../game/debug-super-attack-access.js';
```

- [ ] **Step 5: Gate background queues in run.js**

In `queueBackgroundDialogues` (`src/routes/game/run.js:227`), replace the two gates:

(a) creature queue gate `canUseAiDialogue(userKeys, aiDialogueConfig)` →

```js
    const debugOverride = getDebugForceTranslatorUpgradeForUser(req.getSettings?.() || {}, req.user);
    const meta = req.gameManager?.getMeta?.() || {};
    if (queueMissingCreatureDialoguesFn && getUserVocabulary
        && shouldUseAiDialogue({ userKeys, meta, aiConfig: aiDialogueConfig, debugOverride })) {
```

(b) NPC queue gate — replace the `if (userKeys.aiDataSharingConsent !== true) return;` + `buildGlobalAiConfig` block's entry condition so NPC background regen ALSO requires the switch:

```js
    if (!shouldUseAiDialogue({ userKeys, meta, aiConfig: aiDialogueConfig, debugOverride })) return;
    const aiConfig = buildGlobalAiConfig(userKeys.jlptLevel || 'N4');
    if (!aiConfig) return;
```

Add the same two imports to `run.js`. (Pre-switch warm-up generation is Task 11's preflight job — steady-state background regen only runs for switched users.)

- [ ] **Step 6: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/integration/translator-switch-befriend.test.js
npm test 2>&1 | tail -5   # verify failing-set equality vs baseline as in Task 5
/usr/bin/git add src/routes/game/combat.js src/routes/game/route-helpers.js src/routes/game/run.js tests/integration/translator-switch-befriend.test.js
/usr/bin/git commit -m "feat: gate befriend + background dialogue generation through translator-upgrade switch"
```

---

### Task 7: Prompt pass (compound warnings, reinforcement, wrong-option rules)

**Files:**
- Modify: `src/narration-engine/vocab-constraints.js` (add `buildReinforceSection`, extend `buildVocabSection`)
- Modify: `src/narration-engine/entity-types/creature.js` (`assemblePrompt`)
- Modify: `src/narration-engine/entity-types/npc.js` (`assemblePrompt` — same warning + reinforce layers)
- Modify: `src/narration-engine/index.js` (`generateAndCache` passes `reinforceWords`)
- Modify: `src/routes/game/route-helpers.js` (supply `reinforceWords` in vocab config)
- Test: `tests/unit/narration-prompt-pass.test.js`

**Interfaces:**
- Consumes: `getSuggestionsForNarration(userId) -> [{word, state, priority}]` (`src/game/vocab-manager.js:233`).
- Produces: `buildReinforceSection(words) -> string`; `assemblePrompt({..., reinforceWords})` for both entity types; `vocabContext.reinforceWords` accepted end-to-end.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/narration-prompt-pass.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabSection, buildReinforceSection } from '../../src/narration-engine/vocab-constraints.js';
import { assemblePrompt as assembleCreaturePrompt } from '../../src/narration-engine/entity-types/creature.js';
import { assemblePrompt as assembleNpcPrompt } from '../../src/narration-engine/entity-types/npc.js';

const creatureCard = { id: 'hi', name: '火', nameEn: 'Fire', personality: 'bold' };
const npcCard = {
  id: 'kodomo', name: '子供', nameEn: 'Child', personality: 'playful',
  exampleDialogue: ['遊ぶ？'], goals: 'play'
};

function flatten(blocks) { return blocks.map(b => b.text).join('\n\n'); }

describe('prompt pass', () => {
  it('vocab section warns about compound-word traps', () => {
    const text = buildVocabSection(['今', '見る'], 'N4');
    assert.match(text, /今日≠今/);
    assert.match(text, /見つける≠見る/);
    assert.match(text, /出す≠出る/);
    assert.match(text, /歌.*歌う/);
  });

  it('reinforce section lists the words when present, empty string when none', () => {
    assert.equal(buildReinforceSection([]), '');
    const text = buildReinforceSection(['元気', '友達']);
    assert.match(text, /元気/);
    assert.match(text, /友達/);
  });

  it('creature prompt includes wrong-option quality rules', () => {
    const { systemBlocks, userPrompt } = assembleCreaturePrompt({
      characterCard: creatureCard, vocabWords: ['水'], jlptLevel: 'N4',
      memory: null, previousLines: [], reinforceWords: []
    });
    const sys = flatten(systemBlocks);
    assert.match(sys, /similar length/i);
    assert.match(sys, /near-synonym/i);
    assert.ok(userPrompt.includes('correctIndex'));
  });

  it('creature prompt includes reinforce block when reinforceWords given', () => {
    const { systemBlocks } = assembleCreaturePrompt({
      characterCard: creatureCard, vocabWords: ['水'], jlptLevel: 'N4',
      memory: null, previousLines: [], reinforceWords: ['一緒']
    });
    assert.ok(systemBlocks.some(b => b.label === 'reinforce' && b.text.includes('一緒')));
  });

  it('npc prompt includes reinforce block when reinforceWords given', () => {
    const { systemBlocks } = assembleNpcPrompt({
      characterCard: npcCard, vocabWords: ['水'], jlptLevel: 'N4',
      memory: { flags: {}, counters: { encounters: 0 } }, previousLines: [],
      npcState: 'possessed', reinforceWords: ['友達']
    });
    assert.ok(systemBlocks.some(b => b.label === 'reinforce' && b.text.includes('友達')));
  });
});
```

Note: check `npc.js`'s actual `assemblePrompt` signature first (`grep -n "assemblePrompt" src/narration-engine/entity-types/npc.js`) and match the memory/npcState argument shape it expects; the test above follows `index.js:203-217`'s promptArgs.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/narration-prompt-pass.test.js
```

Expected: FAIL — no `buildReinforceSection` export; no compound warnings.

- [ ] **Step 3: Implement vocab-constraints.js**

Append to the template in `buildVocabSection` (inside the 【ルール】 section, after rule 5):

```js
  return `=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない。例外なし。
2. 助詞はOK：${PARTICLES}
3. 数字OK。句読点OK。擬音OK。
4. 1文に知らない言葉は最大1つまで。
5. 表現できない場合はもっと簡単な言い方にする。
6. 注意：複合語は別の言葉。今日≠今、見つける≠見る、出す≠出る、歌（名詞）≠歌う（動詞）。リストにある言葉の活用はOK、複合語はNG。

文法レベル：JLPT ${jlptLevel}`;
```

Add the new export:

```js
/**
 * Build the reinforcement section: nearly-known words the AI should prefer
 * when natural. Returns '' when there is nothing to reinforce.
 */
export function buildReinforceSection(words = []) {
  const list = (words || []).filter(w => typeof w === 'string' && w.length > 0).slice(0, 12);
  if (list.length === 0) return '';
  return `=== 覚えかけの言葉 ===
プレイヤーがもうすぐ覚える言葉。自然に使えるなら優先して使う（無理には使わない）：
${list.join(', ')}`;
}
```

- [ ] **Step 4: Implement creature.js prompt changes**

In `assemblePrompt` (`src/narration-engine/entity-types/creature.js`):

(a) Accept `reinforceWords` in the destructured args:

```js
export function assemblePrompt({ characterCard, vocabWords, jlptLevel, memory, previousLines, reinforceWords = [] }) {
```

(b) Extend the Layer 1 instructions block — replace the last bullet:

```
- The 2 incorrect options should be valid Japanese and plausible-looking, but contextually wrong replies to that specific prompt.
```

with:

```
- The 2 incorrect options must be grammatical, plausible Japanese that is clearly NON-RESPONSIVE to that specific prompt.
- Wrong options must be of similar length to the correct option (no length tells).
- Wrong options must never be near-synonyms or paraphrases of the correct option — a learner who understood the prompt must be able to rule them out.
- Do not make wrong options absurd or comical unless the creature's personality calls for it.
```

(c) After the Layer 2 vocab block, add the reinforce layer:

```js
  // Layer 2b: Reinforcement (optional)
  const reinforceText = buildReinforceSection(reinforceWords);
  if (reinforceText) {
    systemBlocks.push({ label: 'reinforce', text: reinforceText });
  }
```

(`buildReinforceSection` is already imported alongside `buildVocabSection` — extend the import.)

- [ ] **Step 5: Implement npc.js prompt changes**

Mirror (a) and (c) in `src/narration-engine/entity-types/npc.js`'s `assemblePrompt` (add `reinforceWords = []` arg + reinforce block after the vocab layer, same `label: 'reinforce'`). The compound-word warning arrives via the shared `buildVocabSection` — no npc-specific instruction edit needed.

- [ ] **Step 6: Plumb reinforceWords through index.js and route-helpers.js**

(a) `src/narration-engine/index.js` in `generateAndCache` (line ~203), add to promptArgs:

```js
  const promptArgs = {
    characterCard: card,
    vocabWords: vocab,
    jlptLevel: aiConfig.jlptLevel || 'N4',
    memory: mem,
    previousLines: cache.getPreviousLines(entityId),
    reinforceWords: vocabContext?.reinforceWords || []
  };
```

(b) `src/routes/game/route-helpers.js` — in `buildBefriendDialogueVocabConfig` and `buildVocabConfig`, add to the returned object:

```js
import { getSuggestionsForNarration } from '../../game/vocab-manager.js';
// ... inside both builders, in the return:
    reinforceWords: getSuggestionsForNarration(req.user.id).map(s => s.word),
```

(c) The two `queueBackgroundDialogues` call sites in `run.js` pass `{ words, checkViolationsFn }` — add `reinforceWords` there identically:

```js
        const reinforceWords = getSuggestionsForNarration(req.user.id).map(s => s.word);
        // ...pass { words: vocabulary, checkViolationsFn, reinforceWords }
```

with the import added to `run.js`.

- [ ] **Step 7: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/narration-prompt-pass.test.js
npm test 2>&1 | tail -5   # failing-set equality vs baseline
/usr/bin/git add src/narration-engine/ src/routes/game/route-helpers.js src/routes/game/run.js tests/unit/narration-prompt-pass.test.js
/usr/bin/git commit -m "feat: prompt pass — compound-word warnings, reinforcement layer, wrong-option rules"
```

---

### Task 8: Serve NPC one-liners from the AI cache post-switch

**Files:**
- Modify: `src/routes/game/combat.js` (`/start-creature-encounter`, lines 192-218)
- Test: `tests/unit/npc-ai-line-payload.test.js` + extend `tests/integration/translator-switch-befriend.test.js`

**Interfaces:**
- Consumes: `getNpcDialogueFromCache(userId, npcId)` (DI'd), `tokenizeDialogueTexts(texts, {dict})` (`src/game/dialogue-tokenizer.js`), `enrichTokens(tokens, overrides, dict)` (`src/game/enrich-tokens.js`), `shouldUseAiDialogue`.
- Produces: helper `buildAiNpcLine(raw, dict) -> { raw, text, tokens, overrides }` exported from a new tiny module `src/game/services/ai-npc-line-service.js` so it is unit-testable.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/npc-ai-line-payload.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiNpcLines } from '../../src/game/services/ai-npc-line-service.js';

describe('buildAiNpcLines', () => {
  it('tokenizes greeting + defeatLine into frame-line-shaped payloads', () => {
    const dict = new Map([
      ['水', { reading: 'みず', definitions: ['water'] }],
      ['好き', { reading: 'すき', definitions: ['like'] }]
    ]);
    const { fightStart, defeatLine } = buildAiNpcLines(
      { greeting: '水が好き？', defeatLine: '水！' },
      { dict }
    );
    assert.equal(fightStart.raw, '水が好き？');
    assert.equal(fightStart.text, '水が好き？');
    assert.ok(Array.isArray(fightStart.tokens) && fightStart.tokens.length > 0);
    assert.deepEqual(fightStart.overrides, {});
    assert.equal(defeatLine.raw, '水！');
  });

  it('returns null lines when cache fields are missing', () => {
    const { fightStart, defeatLine } = buildAiNpcLines({}, { dict: new Map() });
    assert.equal(fightStart, null);
    assert.equal(defeatLine, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/npc-ai-line-payload.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/game/services/ai-npc-line-service.js`:

```js
import { tokenizeDialogueTexts } from '../dialogue-tokenizer.js';
import { enrichTokens } from '../enrich-tokens.js';

/**
 * Convert cached AI NPC dialogue text into the same line shape the frames
 * path produces ({ raw, text, tokens, overrides }), so the client renders
 * both identically.
 */
export function buildAiNpcLines(cached, { dict }) {
  const greeting = cached?.greeting || null;
  const defeat = cached?.defeatLine || null;
  const texts = [greeting, defeat].filter(t => typeof t === 'string' && t.length > 0);
  if (texts.length === 0) return { fightStart: null, defeatLine: null };

  const tokenized = tokenizeDialogueTexts(texts, { dict });
  let cursor = 0;
  const toLine = (raw) => {
    if (!raw) return null;
    const tok = tokenized[cursor++];
    return {
      raw,
      text: raw,
      tokens: enrichTokens(tok?.tokens || [], {}, dict),
      overrides: {}
    };
  };
  return { fightStart: toLine(greeting), defeatLine: toLine(defeat) };
}
```

- [ ] **Step 4: Wire into the encounter route**

In `src/routes/game/combat.js` `/start-creature-encounter` (line ~192), wrap the existing frames block:

```js
      // Word-gated bootstrap dialogue for NPC encounters
      let npcDialogue = null;
      const npcData = encounter.npc;
      const aiConfigForLines = buildAiDialogueConfig();
      const lineDebugOverride = getDebugForceTranslatorUpgradeForUser(req.getSettings?.() || {}, req.user);
      const useAiLines = npcData && shouldUseAiDialogue({
        userKeys: req.userKeys || {},
        meta: gameManager.getMeta(),
        aiConfig: aiConfigForLines,
        debugOverride: lineDebugOverride
      });

      if (useAiLines && getNpcDialogueFromCache) {
        const cached = getNpcDialogueFromCache(req.user.id, npcData.id);
        const { fightStart, defeatLine } = buildAiNpcLines(cached, { dict: getWordDict() });
        if (fightStart && defeatLine) {
          npcDialogue = {
            fightStart: await attachCombatLineAudio(fightStart, req, npcData.id, npcData.speakerId),
            defeatLine: await attachCombatLineAudio(defeatLine, req, npcData.id, npcData.speakerId),
            useKanji: false,
            source: 'ai'
          };
        }
      }

      if (!npcDialogue && npcData && getNpcLines()[npcData.id]) {
        // ... existing frames block, verbatim, as the fallback ...
      }
```

Add the import: `import { buildAiNpcLines } from '../../game/services/ai-npc-line-service.js';` (the director/debug imports exist from Task 6).

- [ ] **Step 5: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/npc-ai-line-payload.test.js
npm test 2>&1 | tail -5   # failing-set equality
/usr/bin/git add src/game/services/ai-npc-line-service.js src/routes/game/combat.js tests/unit/npc-ai-line-payload.test.js
/usr/bin/git commit -m "feat: serve NPC encounter one-liners from AI cache post-switch (frames fallback)"
```

---

### Task 9: Revive the 3-round post-battle bond conversation

**Files:**
- Modify: `src/routes/game/combat.js` (`/npc-dialogue-start:677-746`, `/npc-dialogue-respond:749-792`)
- Modify: `docs/superpowers/specs/2026-07-07-frames-to-ai-dialogue-transition-design.md` (ordering amendment)
- Test: `tests/unit/npc-conversation-payload.test.js`

**Interfaces:**
- Consumes: NPC cache shape (`freedLine`, `freedLineTts`, `rounds[].npcLine/npcLineTts/options[].text/tone/tts`), `shuffleOptions` (`src/game/services/npc-service.js:81`), `handleNpcDialogueResponse` (same file, unchanged), phase machine (`run.npcDialogue.active → NPC_DIALOGUE`, completion → `skillSelectionPending → NPC_SKILL_SELECTION` — both transitions already exist in `src/game/phase-machine.js:93-99,176,204`).
- Produces: conversation response shape consumed by the INTACT client branch in `public/js/ui/npc-dialogue-ui.js` (`runNpcDialogue`): `{ mode:'conversation', npc, freed, freedTts, userId, rounds: [{ npcLine, npcLineTts?, options: [{text, tts?}] }] }`. Zero client changes.

**Spec deviation (approved rationale):** the spec ordered defeatLine → rounds → freedLine, but the intact client plays `freed` FIRST (the liberation beat) then rounds — and the AI defeatLine already plays as the combat-victory one-liner (Task 8). Amend the spec rather than rewriting a working client flow.

- [ ] **Step 1: Amend the spec**

In `docs/superpowers/specs/2026-07-07-frames-to-ai-dialogue-transition-design.md` §3, replace:

```
- **Post-switch:** AI `defeatLine` → 3 bond rounds (existing
```

with:

```
- **Post-switch:** AI `freedLine` opens the post-battle conversation (the
  liberation beat — the AI `defeatLine` already plays as the combat-victory
  one-liner), then 3 bond rounds (existing
```

- [ ] **Step 2: Write the failing unit test**

The round-building logic must be pure and testable. Create `tests/unit/npc-conversation-payload.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcConversationState } from '../../src/game/services/npc-service.js';

const cached = {
  freedLine: 'ありがとう！',
  freedLineTts: 'freed.wav',
  rounds: [
    { npcLine: '遊ぶ？', npcLineTts: 'r0.wav', options: [
      { text: 'うん！', tone: 'positive', tts: 'o0.wav' },
      { text: 'また今度', tone: 'neutral' },
      { text: '嫌だ', tone: 'negative' }
    ]},
    { npcLine: '強いね', options: [
      { text: 'ありがとう', tone: 'positive' },
      { text: 'そう？', tone: 'neutral' },
      { text: 'やめて', tone: 'negative' }
    ]},
    { npcLine: 'また来る？', options: [
      { text: 'うん', tone: 'positive' },
      { text: '分からない', tone: 'neutral' },
      { text: '来ない', tone: 'negative' }
    ]}
  ]
};

describe('buildNpcConversationState', () => {
  it('builds server rounds with _toneMap and client rounds without tones', () => {
    const { serverRounds, clientRounds } = buildNpcConversationState(cached);
    assert.equal(serverRounds.length, 3);
    assert.equal(clientRounds.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(serverRounds[i]._toneMap.length, 3);
      assert.deepEqual([...serverRounds[i]._toneMap].sort(),
        ['negative', 'neutral', 'positive']);
      assert.equal(clientRounds[i].options.length, 3);
      // Client options carry text (+tts when present) but never tone
      for (const opt of clientRounds[i].options) {
        assert.equal(typeof opt.text, 'string');
        assert.equal('tone' in opt, false);
      }
      assert.equal(clientRounds[i].npcLine, cached.rounds[i].npcLine);
    }
    // Shuffled order matches between server toneMap and client option order:
    // find where the positive option landed and confirm the toneMap agrees.
    const posIdx = clientRounds[0].options.findIndex(o => o.text === 'うん！');
    assert.equal(serverRounds[0]._toneMap[posIdx], 'positive');
  });

  it('returns null when cache has no 3 rounds', () => {
    assert.equal(buildNpcConversationState({ rounds: [] }), null);
    assert.equal(buildNpcConversationState(null), null);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/npc-conversation-payload.test.js
```

Expected: FAIL — `buildNpcConversationState` not exported.

- [ ] **Step 4: Implement in npc-service.js**

Append to `src/game/services/npc-service.js` (uses the existing `shuffleOptions`):

```js
/**
 * Build the server + client round payloads for an AI post-battle bond
 * conversation from a cached NPC dialogue. Server rounds keep _toneMap for
 * /npc-dialogue-respond scoring; client rounds carry text/tts only.
 * Returns null when the cache has no usable 3-round dialogue.
 */
export function buildNpcConversationState(cached) {
  const rounds = cached?.rounds;
  if (!Array.isArray(rounds) || rounds.length !== 3) return null;

  const serverRounds = [];
  const clientRounds = [];
  for (const round of rounds) {
    if (!round?.npcLine || !Array.isArray(round.options) || round.options.length !== 3) return null;
    const { shuffled, toneMap } = shuffleOptions(round.options);
    serverRounds.push({ npcLine: round.npcLine, options: shuffled, _toneMap: toneMap });
    clientRounds.push({
      npcLine: round.npcLine,
      ...(round.npcLineTts ? { npcLineTts: round.npcLineTts } : {}),
      options: shuffled
    });
  }
  return { serverRounds, clientRounds };
}
```

Run the unit test again — expected: PASS.

- [ ] **Step 5: Add the AI branch to /npc-dialogue-start**

In `src/routes/game/combat.js` (line ~690, after the `npc` lookup, before the v1 defeat-line code), insert:

```js
    // --- AI conversation branch (post translator-upgrade switch) ---
    const convoAiConfig = buildAiDialogueConfig();
    const convoDebug = getDebugForceTranslatorUpgradeForUser(req.getSettings?.() || {}, req.user);
    if (shouldUseAiDialogue({
      userKeys: req.userKeys || {},
      meta: gameManager.getMeta(),
      aiConfig: convoAiConfig,
      debugOverride: convoDebug
    }) && getNpcDialogueFromCache) {
      const cached = getNpcDialogueFromCache(req.user.id, npc.id);
      const convo = buildNpcConversationState(cached);
      if (convo) {
        gameManager.run.npcDialogue = {
          active: true,
          npcId: npc.id,
          npcData: { id: npc.id, name: npc.name, nameEn: npc.nameEn, speakerId: npc.speakerId },
          rounds: convo.serverRounds,
          currentRound: 0,
          totalDelta: 0
        };
        req.saveGame();

        return res.json({
          mode: 'conversation',
          npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn, speakerId: npc.speakerId },
          freed: cached.freedLine || '',
          ...(cached.freedLineTts ? { freedTts: cached.freedLineTts } : {}),
          userId: req.user.id,
          rounds: convo.clientRounds
        });
      }
      // Cache missing/malformed → fall through to the v1 defeat-line path.
    }
```

Add the import: `import { buildNpcConversationState } from '../../game/services/npc-service.js';` (extend the existing npc-service import if present — check the top of the file; `loadNpcs` is imported there already).

**Do NOT remove or alter the v1 defeat-line path** — it is the permanent fallback and the pre-switch behavior.

- [ ] **Step 6: Sync the room snapshot on conversation completion**

`handleNpcDialogueResponse` (npc-service.js:132-163) already clears `run.npcDialogue` and sets `skillSelectionPending` — but the prepared-room snapshot resync only happens in the v1 route path. In `/npc-dialogue-respond` (`combat.js:759`, inside `if (result.dialogueComplete) {`), add as the first line:

```js
      req.gameManager.explorationService?.syncPreparedRoomSnapshot?.();
```

(Same call the v1 path makes at `combat.js:729` — without it the client's runway snapshot still reads `skillSelectionPending=false` and auto-proceeds past the skill reward.)

- [ ] **Step 7: Run tests + syntax checks + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/npc-conversation-payload.test.js
npm test 2>&1 | tail -5   # failing-set equality
/usr/bin/git add src/game/services/npc-service.js src/routes/game/combat.js docs/superpowers/specs/2026-07-07-frames-to-ai-dialogue-transition-design.md tests/unit/npc-conversation-payload.test.js
/usr/bin/git commit -m "feat: revive 3-round post-battle NPC bond conversation from AI cache"
```

---

### Task 10: Shop & shrine AI line pools

**Files:**
- Create: `data/character-cards/line-pools.json`
- Create: `src/narration-engine/entity-types/line-pool.js`
- Modify: `src/narration-engine/entity-types/index.js` (register `linePool`)
- Modify: `src/narration-engine/entity-types/npc.js`, `creature.js` (add `cardType` export)
- Modify: `src/narration-engine/index.js` (card-type dispatch + invalidation loop)
- Create: `src/game/services/dialogue-pool-service.js`
- Modify: `src/routes/game/run.js` (`hydrateFriendlyNpcOfferDisplayPayload:199-224`, `/shrine-offers:545-575`)
- Modify: `src/game/services/explore-runway-service.js` (pool helpers, lines ~175-190 + their callers)
- Modify: `server.js` (add `queueMissingLinePoolsFn` wrapper), `src/app.js` (no-op default)
- Test: `tests/unit/line-pool-entity.test.js`, `tests/unit/dialogue-pool-service.test.js`

**Interfaces:**
- Consumes: `shouldUseAiDialogue` (Task 2), `getUserKeys(userId)` (`src/auth/users.js:360`), `getDialogueFromCache(userId, id, 'linePool')` (narration engine — same function the DI'd `getNpcDialogueFromCache` wraps; it accepts the entityType arg, see `server.js:291` for the creature-type call pattern), `tokenizeDialogueTexts`, `assembleFrame`/`selectBestFrame` (untouched consumers).
- Produces: `POOL_IDS = ['shopGreeting', 'shopPurchase', 'shrineGreeting']` (exported from `dialogue-pool-service.js`); `resolveFramePool(category, { userId, meta, getCached, getKeys? }) -> frames[]|null`; `tokenizePoolLines(lines, { dict }) -> frames[]`; narration engine accepts `entityType: 'linePool'` end-to-end. Task 11's preflight consumes `POOL_IDS` + the linePool cache.

- [ ] **Step 1: Write the failing entity-type test**

Create `tests/unit/line-pool-entity.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShape,
  extractStrings,
  assemblePrompt,
  getMemorySnapshot,
  getPreviousLines,
  cardType
} from '../../src/narration-engine/entity-types/line-pool.js';
import { getEntityType } from '../../src/narration-engine/entity-types/index.js';

const shopPurchaseCard = {
  id: 'shopPurchase', name: '店の人', nameEn: 'Shopkeeper',
  personality: 'Warm, friendly merchant who loves their wares',
  lineCount: 8, slot: '{item}'
};

describe('line-pool entity type', () => {
  it('is registered in the entity-type registry', () => {
    assert.equal(getEntityType('linePool').cardType, 'line-pool');
    assert.equal(cardType, 'line-pool');
  });

  it('validateShape accepts 6-10 non-empty lines, rejects otherwise', () => {
    assert.equal(validateShape({ lines: Array(8).fill('こんにちは') }).valid, true);
    assert.equal(validateShape({ lines: Array(3).fill('こんにちは') }).valid, false);
    assert.equal(validateShape({ lines: Array(11).fill('こんにちは') }).valid, false);
    assert.equal(validateShape({ lines: ['', 'こんにちは', 'x', 'x', 'x', 'x'] }).valid, false);
    assert.equal(validateShape({}).valid, false);
    assert.equal(validateShape(null).valid, false);
  });

  it('extractStrings strips the {item} slot so vocab validation covers only the template', () => {
    const entries = extractStrings({ lines: ['{item}をください', 'こんにちは'] });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].path, 'lines[0]');
    assert.equal(entries[0].text, 'をください');
    assert.equal(entries[1].text, 'こんにちは');
  });

  it('assemblePrompt includes persona, line count, and the slot rule when card.slot is set', () => {
    const { systemBlocks, userPrompt } = assemblePrompt({
      characterCard: shopPurchaseCard, vocabWords: ['本'], jlptLevel: 'N4',
      memory: null, previousLines: [], reinforceWords: []
    });
    const sys = systemBlocks.map(b => b.text).join('\n');
    assert.match(sys, /Shopkeeper|店の人/);
    assert.match(userPrompt, /8/);
    assert.match(userPrompt, /\{item\}/);
    assert.match(userPrompt, /"lines"/);
  });

  it('memory snapshot is empty and previous lines come from the cached pool', () => {
    assert.deepEqual(getMemorySnapshot({ anything: true }), {});
    assert.deepEqual(getPreviousLines({ lines: ['a', 'b'] }), ['a', 'b']);
    assert.deepEqual(getPreviousLines(null), []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/line-pool-entity.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the pool cards**

Create `data/character-cards/line-pools.json`:

```json
{
  "shopGreeting": {
    "id": "shopGreeting",
    "name": "店の人",
    "nameEn": "Shopkeeper",
    "personality": "Warm, welcoming merchant. Proud of their little shop, happy to see a familiar face. Speaks in short, friendly sentences.",
    "lineCount": 8,
    "slot": null,
    "description": "Greeting lines shown when the player enters a friendly NPC shop room."
  },
  "shopPurchase": {
    "id": "shopPurchase",
    "name": "店の人",
    "nameEn": "Shopkeeper",
    "personality": "The same merchant offering a specific item for sale. Direct, cheerful sales patter.",
    "lineCount": 8,
    "slot": "{item}",
    "description": "Lines offering a specific item; {item} is replaced with the item's name at serve time. The item word is the i+1 unknown — everything else must be known."
  },
  "shrineGreeting": {
    "id": "shrineGreeting",
    "name": "狐の神様",
    "nameEn": "Shrine Fox",
    "personality": "Serene, slightly mysterious fox spirit of the shrine. Kind but formal; blesses travelers. Speaks calmly.",
    "lineCount": 8,
    "slot": null,
    "description": "Greeting lines when the player approaches a shrine room."
  }
}
```

- [ ] **Step 4: Write the entity type**

Create `src/narration-engine/entity-types/line-pool.js`:

```js
import { buildVocabSection, buildReinforceSection } from '../vocab-constraints.js';

export const cachePrefix = 'pool-dialogue-cache';
export const memoryPrefix = 'pool-memory';
export const cardType = 'line-pool';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality', 'lineCount'];

const MIN_LINES = 6;
const MAX_LINES = 10;

/**
 * Validate a generated line pool: { lines: string[] } with 6-10 non-empty lines.
 */
export function validateShape(obj) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['pool must be a non-null object'] };
  }
  if (!Array.isArray(obj.lines)) {
    return { valid: false, errors: ['missing lines array'] };
  }
  const errors = [];
  if (obj.lines.length < MIN_LINES || obj.lines.length > MAX_LINES) {
    errors.push(`expected ${MIN_LINES}-${MAX_LINES} lines, got ${obj.lines.length}`);
  }
  obj.lines.forEach((line, i) => {
    if (typeof line !== 'string' || line.length === 0) {
      errors.push(`lines[${i}] must be a non-empty string`);
    }
  });
  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

/**
 * Extract strings for vocab validation. The {item} slot is stripped so the
 * i+1 check covers only the template — the filled item word is the intended
 * unknown, exactly like static shopPurchase frames.
 */
export function extractStrings(pool) {
  if (!pool?.lines) return [];
  return pool.lines.map((text, i) => ({
    path: `lines[${i}]`,
    text: String(text).replaceAll('{item}', '')
  }));
}

export function buildRepairInstruction(violations) {
  const violationLines = violations.map(v =>
    `- ${v.path}: "${v.text}" contains unknown word(s): ${v.unknowns.join(', ')}`
  ).join('\n');
  return `The following lines violate the vocab constraint (i+1 rule):
${violationLines}

Replace only the violating lines with alternatives that use words from the allowed vocab list.
Keep the same JSON structure: { "lines": [ ... ] } with the same number of lines.
Lines that had the literal {item} placeholder must keep it.
Return the complete corrected JSON.`;
}

export function assemblePrompt({ characterCard, vocabWords, jlptLevel, memory, previousLines, reinforceWords = [] }) {
  const systemBlocks = [];

  const slotRules = characterCard.slot
    ? `\n- EVERY line MUST contain the literal placeholder ${characterCard.slot} exactly once — it is replaced with an item name at runtime.
- Outside the placeholder, use ONLY known words from the vocab list (zero unknowns): the filled item is the line's one unknown word.`
    : '';

  systemBlocks.push({
    label: 'instructions',
    text: `You are generating a pool of short utility lines for a Japanese language learning RPG.

The pool is reused often, so lines must be short (2-8 words), natural, and varied.

CRITICAL RULES (i+1 comprehensible input):
- Use words from the player's vocabulary list below; at most 1 unknown word per line.
- If you cannot express something with the allowed vocabulary, simplify.${slotRules}`
  });

  systemBlocks.push({ label: 'vocab', text: buildVocabSection(vocabWords, jlptLevel) });

  const reinforceText = buildReinforceSection(reinforceWords);
  if (reinforceText) {
    systemBlocks.push({ label: 'reinforce', text: reinforceText });
  }

  const charParts = [
    `Speaker: ${characterCard.name} (${characterCard.nameEn})`,
    `Personality: ${characterCard.personality}`
  ];
  if (characterCard.description) charParts.push(`Usage: ${characterCard.description}`);
  systemBlocks.push({ label: 'character', text: charParts.join('\n') });

  if (previousLines?.length > 0) {
    systemBlocks.push({
      label: 'anti-repetition',
      text: `Avoid repeating these lines from the previous pool:\n${previousLines.map(l => `  - ${l}`).join('\n')}`
    });
  }

  const slotExample = characterCard.slot ? `"${characterCard.slot}をください"` : '"こんにちは！"';
  const userPrompt = `Generate exactly ${characterCard.lineCount} Japanese lines for ${characterCard.nameEn}.

Return ONLY valid JSON matching this schema:
{
  "lines": [${slotExample}, "..."]
}

Rules:
- Exactly ${characterCard.lineCount} lines, each a short natural utterance in character.
- Vary sentence patterns and endings across lines.${characterCard.slot ? `\n- Every line contains ${characterCard.slot} exactly once.` : ''}
- All Japanese text must follow the vocab constraints.`;

  return { systemBlocks, userPrompt };
}

export function getPreviousLines(cached) {
  return cached?.lines ? [...cached.lines] : [];
}

/**
 * Pools have no encounter memory — snapshot is constant so cache staleness
 * keys off vocab growth only.
 */
export function getMemorySnapshot() {
  return {};
}
```

- [ ] **Step 5: Register the type + fix the hardcoded dispatch**

(a) `src/narration-engine/entity-types/index.js`:

```js
import * as npcType from './npc.js';
import * as creatureType from './creature.js';
import * as linePoolType from './line-pool.js';

const REGISTRY = {
  npc: npcType,
  creature: creatureType,
  linePool: linePoolType
};
```

(b) Add `export const cardType = 'npc';` to `src/narration-engine/entity-types/npc.js` and `export const cardType = 'creature';` to `creature.js` (beside their existing `cachePrefix` exports).

(c) In `src/narration-engine/index.js`, replace BOTH hardcoded ternaries (`loadCharacterCards(entityType === 'creature' ? 'creature' : 'npc')` at ~line 92 in `queueMissingDialogues`, and `const cardType = entityType === 'creature' ? 'creature' : 'npc';` at ~line 184 in `generateAndCache`) with:

```js
  const cards = loadCharacterCards(getEntityType(entityType).cardType);
```
```js
  const card = getCharacterCard(entityId, getEntityType(entityType).cardType);
```

and extend `invalidateNarrationUser` (~line 57) to loop `['npc', 'creature', 'linePool']`.

- [ ] **Step 6: Run the entity test**

```bash
node --experimental-test-module-mocks --test tests/unit/line-pool-entity.test.js
```

Expected: PASS.

- [ ] **Step 7: Write the failing pool-service test**

Create `tests/unit/dialogue-pool-service.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFramePool, tokenizePoolLines, POOL_IDS } from '../../src/game/services/dialogue-pool-service.js';

const dict = new Map([
  ['ください', { reading: 'ください', definitions: ['please give me'] }],
  ['こんにちは', { reading: 'こんにちは', definitions: ['hello'] }]
]);

const activeMeta = { translatorUpgrade: { active: true, readyAt: 'x', seenAt: 'x' } };
const okKeys = { aiDataSharingConsent: true, aiConversationsEnabled: true };
const aiEnv = {
  AI_DIALOGUE_PROVIDER: 'openai', AI_DIALOGUE_API_KEY: 'k', AI_DIALOGUE_MODEL: 'm'
};

describe('POOL_IDS', () => {
  it('covers the three categories', () => {
    assert.deepEqual(POOL_IDS, ['shopGreeting', 'shopPurchase', 'shrineGreeting']);
  });
});

describe('tokenizePoolLines', () => {
  it('splices a slot token for {item} templates', () => {
    const [frame] = tokenizePoolLines(['{item}をください'], { dict });
    assert.equal(frame.raw, '{item}をください');
    assert.deepEqual(frame.tokens[0], { slot: 'item' });
    assert.ok(frame.tokens.length > 1, 'segment tokens follow the slot');
    assert.deepEqual(frame.slots, ['item']);
  });

  it('tokenizes slotless lines directly', () => {
    const [frame] = tokenizePoolLines(['こんにちは'], { dict });
    assert.equal(frame.raw, 'こんにちは');
    assert.ok(frame.tokens.every(t => !t.slot));
    assert.deepEqual(frame.slots, []);
  });
});

describe('resolveFramePool', () => {
  it('returns null when the gate is closed (no switch)', () => {
    const result = resolveFramePool('shopGreeting', {
      userId: 'u1', meta: {},
      getCached: () => ({ lines: ['こんにちは'] }),
      getKeys: () => okKeys, env: aiEnv
    });
    assert.equal(result, null);
  });

  it('returns null when no pool is cached', () => {
    const result = resolveFramePool('shopGreeting', {
      userId: 'u1', meta: activeMeta,
      getCached: () => null,
      getKeys: () => okKeys, env: aiEnv
    });
    assert.equal(result, null);
  });

  it('returns frame-shaped entries when gated open + cached', () => {
    const result = resolveFramePool('shopGreeting', {
      userId: 'u1', meta: activeMeta,
      getCached: () => ({ lines: ['こんにちは'], generatedAt: 't1' }),
      getKeys: () => okKeys, env: aiEnv, dict
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].category, 'shopGreeting');
    assert.equal(result[0].raw, 'こんにちは');
    assert.ok(Array.isArray(result[0].tokens));
    assert.ok(Array.isArray(result[0].words));
  });

  it('drops shopPurchase lines missing the {item} slot; null when none survive', () => {
    const good = resolveFramePool('shopPurchase', {
      userId: 'u1', meta: activeMeta,
      getCached: () => ({ lines: ['{item}をください', 'こんにちは'], generatedAt: 't2' }),
      getKeys: () => okKeys, env: aiEnv, dict
    });
    assert.equal(good.length, 1);
    assert.equal(good[0].raw, '{item}をください');

    const none = resolveFramePool('shopPurchase', {
      userId: 'u1', meta: activeMeta,
      getCached: () => ({ lines: ['こんにちは'], generatedAt: 't3' }),
      getKeys: () => okKeys, env: aiEnv, dict
    });
    assert.equal(none, null);
  });
});
```

- [ ] **Step 8: Run to verify it fails, then implement the service**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-pool-service.test.js
```

Create `src/game/services/dialogue-pool-service.js`:

```js
import { tokenizeDialogueTexts } from '../dialogue-tokenizer.js';
import { shouldUseAiDialogue } from '../dialogue-director.js';
import { buildAiDialogueConfig } from '../../ai-dialogue/config.js';
import { getUserKeys } from '../../auth/users.js';

export const POOL_IDS = ['shopGreeting', 'shopPurchase', 'shrineGreeting'];

// Tokenized pools memoized per user+category+generation (serve-time tokenization,
// same tokenizer the befriend display path uses).
const _tokenizedPools = new Map();

/**
 * Tokenize AI pool lines into the static-frame shape so assembleFrame /
 * selectBestFrame / renderers work unchanged. {item} templates get a bare
 * { slot: 'item' } token spliced at the placeholder position, matching
 * frames.json slot tokens.
 */
export function tokenizePoolLines(lines, { dict }) {
  const frames = [];
  for (const raw of lines) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (raw.includes('{item}')) {
      const segments = raw.split('{item}');
      const nonEmpty = segments.filter(s => s.length > 0);
      const tokenized = nonEmpty.length > 0 ? tokenizeDialogueTexts(nonEmpty, { dict }) : [];
      let cursor = 0;
      const tokens = [];
      const words = [];
      segments.forEach((segment, i) => {
        if (i > 0) tokens.push({ slot: 'item' });
        if (segment.length > 0) {
          const seg = tokenized[cursor++];
          tokens.push(...(seg?.tokens || []));
          words.push(...(seg?.words || []));
        }
      });
      frames.push({ raw, tokens, words, slots: ['item'] });
    } else {
      const [tok] = tokenizeDialogueTexts([raw], { dict });
      frames.push({ raw, tokens: tok?.tokens || [], words: tok?.words || [], slots: [] });
    }
  }
  return frames;
}

/**
 * Resolve the AI line pool for a category, or null → caller uses static frames.
 * Gate: server env + consent + toggle + earned switch (no debug override here;
 * pre-threshold pool testing goes through the seed script + activation).
 */
export function resolveFramePool(category, {
  userId,
  meta,
  getCached,
  getKeys = getUserKeys,
  env = process.env,
  dict = null
} = {}) {
  if (!POOL_IDS.includes(category)) return null;
  const aiConfig = buildAiDialogueConfig(env);
  const userKeys = getKeys(userId) || {};
  if (!shouldUseAiDialogue({ userKeys, meta, aiConfig })) return null;

  const cached = getCached(userId, category, 'linePool');
  if (!Array.isArray(cached?.lines) || cached.lines.length === 0) return null;

  let lines = cached.lines;
  if (category === 'shopPurchase') {
    lines = lines.filter(l => typeof l === 'string' && l.includes('{item}'));
    if (lines.length === 0) return null;
  }

  const memoKey = `${userId}:${category}:${cached.generatedAt || ''}`;
  if (!_tokenizedPools.has(memoKey)) {
    const frames = tokenizePoolLines(lines, { dict }).map((frame, i) => ({
      id: `ai_${category}_${i}`,
      category,
      ...frame
    }));
    if (frames.length === 0) return null;
    _tokenizedPools.set(memoKey, frames);
  }
  return _tokenizedPools.get(memoKey);
}
```

Run the test — expected: PASS.

- [ ] **Step 9: Swap the serving sites (static frames stay as fallback)**

Thread the pool cache getter into the run routes and runway first: in `src/routes/game/index.js`, add `getNpcDialogueFromCache: deps.getNpcDialogueFromCache` to the `createRunRoutes({...})` deps object, and accept it in `createRunRoutes`'s destructured params in `run.js`. (`server.js` already passes the underlying `getDialogueFromCache` re-export into the routes object — verify with `grep -n "getNpcDialogueFromCache" src/routes/index.js server.js`. In `src/app.js` the default `getNpcDialogueFromCache: () => null` already exists.)

(a) `run.js hydrateFriendlyNpcOfferDisplayPayload` — resolve pools first, keep static as fallback:

```js
  function hydrateFriendlyNpcOfferDisplayPayload(room, userId, meta) {
    const knownWords = getKnownWordsFromFsrs(userId);
    const knownSet = new Set(knownWords);
    const poolOpts = { userId, meta, getCached: getNpcDialogueFromCache || (() => null), dict: getWordDict() };
    const shopFrames = resolveFramePool('shopPurchase', poolOpts) || getShopPurchaseFrames();

    for (const item of room.friendlyNpc.offered || []) {
      if (!item?.word) continue;
      if (!item.tokens?.length || !item.words?.length) {
        const candidates = shopFrames.map(frame => assembleFrame(frame, { item }, { dict: getWordDict() }));
        const best = selectBestFrame(candidates, knownSet, { dict: getWordDict() });
        if (best) {
          item.tokens = best.tokens || [];
          item.words = best.words || [];
        }
      }
      if (!item.nameToken) {
        item.nameToken = entityToToken(item);
      }
    }

    if (!room.friendlyNpc.greeting) {
      const greetingFrames = resolveFramePool('shopGreeting', poolOpts) || getShopGreetingFrames();
      const greetingCandidates = greetingFrames.map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
      room.friendlyNpc.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
    }
  }
```

Update the function's call sites in `run.js` (grep `hydrateFriendlyNpcOfferDisplayPayload(`) to pass `req.gameManager.getMeta()` as the third arg. Add imports for `resolveFramePool`.

(b) `run.js /shrine-offers` — same swap:

```js
        const greetingFrames = resolveFramePool('shrineGreeting', {
          userId: req.user.id,
          meta: gm.getMeta(),
          getCached: getNpcDialogueFromCache || (() => null),
          dict: getWordDict()
        }) || getShrineGreetingFrames();
```

(c) `explore-runway-service.js` — extend the three pool helpers to try the AI pool. The runway builders receive `opts` containing `userId` (see `knownSetForOpts`); the service has `this.gm` for meta. Change the helpers to accept a `poolOpts` argument and pass it from the builders:

```js
function shrineGreetingFrames(poolOpts = null) {
  if (poolOpts) {
    const pool = resolveFramePool('shrineGreeting', poolOpts);
    if (pool) return pool;
  }
  const loaded = getShrineGreetingFrames();
  if (loaded.length > 0) return loaded;
  return getFallbackDialogueFrames().filter(frame => frame.category === 'shrineGreeting');
}
```

(mirror for `shopGreetingFrames`/`shopPurchaseFrames`), and at each caller inside the runway builders construct:

```js
    const poolOpts = {
      userId: opts.userId,
      meta: gm.getMeta(),
      getCached: opts.getDialogueFromCacheFn || (() => null),
      dict: getWordDict()
    };
```

Thread `getDialogueFromCacheFn` into the runway `opts` at both `buildExploreRunway` call sites (`src/routes/game/state.js:44` and the exploration-service caller — grep `buildExploreRunway(`), sourcing it from the DI'd `getNpcDialogueFromCache`. Where the builder lacks `gm` in scope, pass `meta` through `opts` the same way `userId` travels. Match each builder's existing local structure — the pattern is always: try pool, fall back to static.

(d) `server.js`: add the pool queue wrapper beside the existing NPC one (grep `queueMissingNpcDialoguesFn` there and mirror its shape — chatFn injection, `'linePool'` entityType, `null` ttsOptions, forwarding the `options` arg). Name it `queueMissingLinePoolsFn` and thread it through `src/routes/index.js` → `src/routes/game/index.js` deps. Add `queueMissingLinePoolsFn: async () => {}` to the `src/app.js` defaults block.

- [ ] **Step 10: Run tests + syntax checks + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/line-pool-entity.test.js
node --experimental-test-module-mocks --test tests/unit/dialogue-pool-service.test.js
npm test 2>&1 | tail -5   # failing-set equality vs baseline
/usr/bin/git add data/character-cards/line-pools.json src/narration-engine/ src/game/services/dialogue-pool-service.js src/routes/game/run.js src/routes/game/index.js src/game/services/explore-runway-service.js src/routes/game/state.js server.js src/app.js tests/unit/line-pool-entity.test.js tests/unit/dialogue-pool-service.test.js
/usr/bin/git commit -m "feat: shop & shrine AI line pools behind translator-upgrade switch (frames fallback)"
```

---

### Task 11: Preflight + evaluate/complete routes + Cid scene

**Files:**
- Modify: `src/game/dialogue-director.js` (add `getPreflightEntities`, `getPreflightStatus`)
- Create: `src/routes/game/translator-upgrade.js`
- Modify: `src/routes/game/index.js` (mount the new router; pass narration deps)
- Modify: `src/routes/index.js` (forward deps if not already in the object passed to `createGameRoutes` — check `grep -n "queueMissingNpcDialoguesFn" src/routes/index.js`)
- Modify: `public/game.js` (Cid scene + hub trigger)
- Test: `tests/unit/dialogue-director-preflight.test.js`, `tests/integration/translator-upgrade-routes.test.js`

**Interfaces:**
- Consumes: `AREAS` (`src/game/rooms.js`), `loadNpcs` (`npc-service.js`), `loadCharacterCards` (`narration-engine/character-cards.js`), `POOL_IDS` (Task 10), DI'd narration fns: `getNpcDialogueFromCache(userId, id[, entityType])`, `getCreatureDialogueFromCache(userId, id)`, `isNpcDialogueStaleFn(userId, id, vocabContext[, entityType])` / `isCreatureDialogueStaleFn(userId, id, vocabContext, 'creature')`, `queueMissingNpcDialoguesFn`, `queueMissingCreatureDialoguesFn`, `queueMissingLinePoolsFn` (Task 10), `mergeUserKeys` (Task 5), `markTranslatorUpgradeReady`/`activateTranslatorUpgrade` (Task 2), `getSwitchState` (Task 2).
- Produces: `POST /api/game/translator-upgrade/evaluate -> { knownCount, glueCount, thresholdMet, ready, active, seen, preflight: {total, fresh} }`; `POST /api/game/translator-upgrade/complete -> { ok, state }`. Client `maybePlayTranslatorUpgrade()`.

- [ ] **Step 1: Write the failing preflight unit test**

Create `tests/unit/dialogue-director-preflight.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPreflightEntities, getPreflightStatus } from '../../src/game/dialogue-director.js';

describe('preflight entity scoping', () => {
  it('scopes to unlocked areas only (highestUnlocked=1 → first area)', () => {
    const meta = { levels: { highestUnlocked: 1 } };
    const { npcIds, creatureIds } = getPreflightEntities(meta);
    assert.ok(npcIds.length > 0, 'first area has card-backed NPCs');
    assert.ok(creatureIds.length > 0, 'first area has card-backed creatures');
    // Second-area NPCs must NOT appear at highestUnlocked=1
    const twoAreas = getPreflightEntities({ levels: { highestUnlocked: 2 } });
    assert.ok(twoAreas.npcIds.length >= npcIds.length);
    assert.ok(twoAreas.creatureIds.length > creatureIds.length);
  });
});

describe('preflight completeness', () => {
  const meta = { levels: { highestUnlocked: 1 } };
  const freshDeps = {
    getNpcCached: () => ({ rounds: [] }),
    getCreatureCached: () => ({ rounds: [] }),
    getPoolCached: () => ({ lines: ['x'] }),
    isNpcStale: () => false,
    isCreatureStale: () => false,
    isPoolStale: () => false
  };

  it('complete only when every entity AND line pool has a fresh cache entry', () => {
    const { npcIds, creatureIds } = getPreflightEntities(meta);
    const total = npcIds.length + creatureIds.length + 3; // + POOL_IDS

    const allFresh = getPreflightStatus('u1', meta, freshDeps);
    assert.deepEqual(allFresh, { total, fresh: total, complete: true });

    const oneNpcMissing = getPreflightStatus('u1', meta, {
      ...freshDeps,
      getNpcCached: (uid, id) => id === npcIds[0] ? null : ({ rounds: [] })
    });
    assert.equal(oneNpcMissing.complete, false);
    assert.equal(oneNpcMissing.fresh, total - 1);

    const onePoolMissing = getPreflightStatus('u1', meta, {
      ...freshDeps,
      getPoolCached: (uid, id) => id === 'shopPurchase' ? null : ({ lines: ['x'] })
    });
    assert.equal(onePoolMissing.complete, false);
    assert.equal(onePoolMissing.fresh, total - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director-preflight.test.js
```

Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement preflight in dialogue-director.js**

Append to `src/game/dialogue-director.js`:

```js
import { AREAS } from './rooms.js';
import { loadNpcs } from './services/npc-service.js';
import { loadCharacterCards } from '../narration-engine/character-cards.js';
```

(place imports at the top of the file) and:

```js
/**
 * Entities the preflight must have generated: every card-backed NPC and
 * befriendable creature in the player's unlocked areas.
 */
// POOL_IDS lives in dialogue-pool-service (Task 10); import it here:
// import { POOL_IDS } from './services/dialogue-pool-service.js';

export function getPreflightEntities(meta) {
  const highest = meta?.levels?.highestUnlocked || 1;
  const unlockedAreas = AREAS.slice(0, highest);
  const unlockedIds = new Set(unlockedAreas.map(a => a.id));

  const npcCards = loadCharacterCards('npc');
  const creatureCards = loadCharacterCards('creature');

  const npcIds = Object.values(loadNpcs())
    .filter(n => unlockedIds.has(n.area) && npcCards[n.id])
    .map(n => n.id);

  const creatureIds = [];
  for (const area of unlockedAreas) {
    const ids = [...(area.creatures || []), ...(area.bossCreatureId ? [area.bossCreatureId] : [])];
    for (const id of ids) {
      if (creatureCards[id] && !creatureIds.includes(id)) creatureIds.push(id);
    }
  }
  return { npcIds, creatureIds };
}

/**
 * Completeness check over the preflight scope: NPCs + creatures in unlocked
 * areas, plus the three shop/shrine line pools. Deps are injected so routes
 * can pass the DI'd narration-engine functions and tests can stub them.
 */
export function getPreflightStatus(userId, meta, {
  getNpcCached, getCreatureCached, getPoolCached,
  isNpcStale, isCreatureStale, isPoolStale
}) {
  const { npcIds, creatureIds } = getPreflightEntities(meta);
  let fresh = 0;
  for (const id of npcIds) {
    const cached = getNpcCached(userId, id);
    if (cached && !isNpcStale(userId, id)) fresh++;
  }
  for (const id of creatureIds) {
    const cached = getCreatureCached(userId, id);
    if (cached && !isCreatureStale(userId, id)) fresh++;
  }
  for (const id of POOL_IDS) {
    const cached = getPoolCached(userId, id);
    if (cached && !isPoolStale(userId, id)) fresh++;
  }
  const total = npcIds.length + creatureIds.length + POOL_IDS.length;
  return { total, fresh, complete: total > 0 && fresh === total };
}
```

Run the unit test — expected: PASS.

- [ ] **Step 4: Create the routes**

Create `src/routes/game/translator-upgrade.js`:

```js
import { Router } from 'express';
import {
  getSwitchState,
  getPreflightStatus,
  getPreflightEntities,
  ensureTranslatorUpgrade,
  markTranslatorUpgradeReady,
  activateTranslatorUpgrade
} from '../../game/dialogue-director.js';
import { POOL_IDS } from '../../game/services/dialogue-pool-service.js';
import { buildAiDialogueConfig } from '../../ai-dialogue/config.js';
import { mergeUserKeys } from '../../auth/users.js';
import { getSuggestionsForNarration } from '../../game/vocab-manager.js';

/**
 * Translator Upgrade evaluation + completion.
 * evaluate: threshold check → queue missing generations → completeness → mark ready.
 * complete: player finished the Cid scene → activate switch + set user keys.
 */
export default function createTranslatorUpgradeRoutes(deps) {
  const {
    getUserVocabulary,
    checkSentenceViolations,
    getNpcDialogueFromCache,
    getCreatureDialogueFromCache,
    isNpcDialogueStaleFn,
    isCreatureDialogueStaleFn,
    queueMissingNpcDialoguesFn,
    queueMissingCreatureDialoguesFn,
    queueMissingLinePoolsFn
  } = deps;

  const router = Router();

  router.post('/translator-upgrade/evaluate', async (req, res) => {
    try {
      const meta = req.gameManager.getMeta();
      ensureTranslatorUpgrade(meta);
      const state = getSwitchState(req.user.id, meta);
      const aiConfig = buildAiDialogueConfig();

      let preflight = { total: 0, fresh: 0, complete: false };

      if (aiConfig && state.thresholdMet && !state.ready
          && req.userKeys?.aiDataSharingConsent === true
          && getUserVocabulary) {
        const { words: vocabulary } = getUserVocabulary(req.user.id);
        const vocabSet = new Set(vocabulary);
        const checkViolationsFn = checkSentenceViolations
          ? (text) => checkSentenceViolations(text, vocabSet, new Set())
          : null;
        const reinforceWords = getSuggestionsForNarration(req.user.id).map(s => s.word);
        const vocabContext = { words: vocabulary, checkViolationsFn, reinforceWords };

        preflight = getPreflightStatus(req.user.id, meta, {
          getNpcCached: (uid, id) => getNpcDialogueFromCache?.(uid, id) || null,
          getCreatureCached: (uid, id) => getCreatureDialogueFromCache?.(uid, id) || null,
          getPoolCached: (uid, id) => getNpcDialogueFromCache?.(uid, id, 'linePool') || null,
          isNpcStale: (uid, id) => isNpcDialogueStaleFn ? isNpcDialogueStaleFn(uid, id, { words: vocabulary }) : false,
          isCreatureStale: (uid, id) => isCreatureDialogueStaleFn ? isCreatureDialogueStaleFn(uid, id, { words: vocabulary }, 'creature') : false,
          isPoolStale: (uid, id) => isNpcDialogueStaleFn ? isNpcDialogueStaleFn(uid, id, { words: vocabulary }, 'linePool') : false
        });

        if (preflight.complete) {
          markTranslatorUpgradeReady(meta);
          req.saveGame();
        } else {
          // Fire-and-forget: fill the gaps for the next evaluation pass.
          const scope = getPreflightEntities(meta);
          queueMissingNpcDialoguesFn?.(req.user.id, aiConfig, vocabContext, { entityIds: scope.npcIds })
            .catch(e => console.error('[TranslatorUpgrade] NPC preflight generation failed:', e.message));
          queueMissingCreatureDialoguesFn?.(req.user.id, aiConfig, vocabContext, { entityIds: scope.creatureIds })
            .catch(e => console.error('[TranslatorUpgrade] Creature preflight generation failed:', e.message));
          queueMissingLinePoolsFn?.(req.user.id, aiConfig, vocabContext, { entityIds: POOL_IDS })
            .catch(e => console.error('[TranslatorUpgrade] Line-pool preflight generation failed:', e.message));
        }
      }

      const after = getSwitchState(req.user.id, meta);
      res.json({ ...after, preflight });
    } catch (error) {
      console.error('[TranslatorUpgrade] evaluate failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/translator-upgrade/complete', (req, res) => {
    try {
      const meta = req.gameManager.getMeta();
      const state = getSwitchState(req.user.id, meta);
      if (!state.ready) {
        return res.status(400).json({ error: 'Translator upgrade is not ready' });
      }
      activateTranslatorUpgrade(meta);
      mergeUserKeys(req.user.id, { aiConversationsEnabled: true, aiDataSharingConsent: true });
      req.saveGame();
      res.json({ ok: true, state: req.getEnrichedGameState() });
    } catch (error) {
      console.error('[TranslatorUpgrade] complete failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
```

**Signature check:** the DI'd queue fns in `run.js` are called as `queueMissingCreatureDialoguesFn(userId, aiConfig, vocabContext, { entityIds })` — mirror whatever arity `run.js:239-244` and `run.js:260` use (the NPC variant takes no options object there; verify `queueMissingNpcDialoguesFn`'s wrapper in `server.js` forwards `options` — if it does not, extend the wrapper to forward a 4th `options` arg through to `queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, 'npc', ttsOptions, options)`).

- [ ] **Step 5: Mount the router**

In `src/routes/game/index.js`, import and mount next to the other routers:

```js
import createTranslatorUpgradeRoutes from './translator-upgrade.js';
// ... after createCombatRoutes mounting:
  router.use(createTranslatorUpgradeRoutes({
    getUserVocabulary: deps.getUserVocabulary,
    checkSentenceViolations: deps.checkSentenceViolations,
    getNpcDialogueFromCache: deps.getNpcDialogueFromCache,
    getCreatureDialogueFromCache: deps.getCreatureDialogueFromCache,
    isNpcDialogueStaleFn: deps.isNpcDialogueStaleFn,
    isCreatureDialogueStaleFn: deps.isCreatureDialogueStaleFn,
    queueMissingNpcDialoguesFn: deps.queueMissingNpcDialoguesFn,
    queueMissingCreatureDialoguesFn: deps.queueMissingCreatureDialoguesFn,
    queueMissingLinePoolsFn: deps.queueMissingLinePoolsFn
  }));
```

Check `src/routes/index.js` forwards all nine deps into `createGameRoutes` (grep each name; `isNpcDialogueStaleFn` may need adding to the deps chain from `server.js` — the narration engine exports `isDialogueCacheStale`, wire it as `isNpcDialogueStaleFn: (uid, id, ctx, entityType = 'npc') => isDialogueCacheStale(uid, id, ctx, entityType)` in `server.js` beside the existing creature variant so the same dep also answers linePool staleness, and thread it through `src/app.js` defaults as `isNpcDialogueStaleFn: () => false`).

- [ ] **Step 6: Integration test the two routes**

Create `tests/integration/translator-upgrade-routes.test.js` with `createTestApp`:

```js
// 1. evaluate for a fresh user → { thresholdMet: false, ready: false, active: false }.
// 2. complete before ready → 400.
// (Threshold-met + preflight-complete path is covered by unit tests; the
//  integration test pins the route contract + auth wiring.)
```

Follow the register/login/api-call pattern from an existing integration test in `tests/integration/` (e.g. the flows folder) verbatim.

- [ ] **Step 7: Client — Cid scene + hub trigger**

In `public/game.js`:

(a) Add beside `playPrologue` (after line ~1100):

```js
// ============ TRANSLATOR UPGRADE (Cid moment) ============
let _upgradeCheckDone = false;

const TRANSLATOR_UPGRADE_LINES = [
  "Hey! You've learned some real Japanese!",
  "Hold on, I'm going to change your translator setting.",
  "There — now the translator will allow for dynamic conversations. The people and creatures of this world will speak to you for real now!"
];

async function maybePlayTranslatorUpgrade() {
  if (_upgradeCheckDone) return;
  if (gameState.run?.active) return;                       // hub only
  if (!gameState.meta?.prologueComplete) return;           // never during onboarding
  if (gameState.meta?.translatorUpgrade?.seenAt) return;   // already fired
  _upgradeCheckDone = true;

  try {
    const resp = await fetch(apiUrl('/api/game/translator-upgrade/evaluate'), {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!resp.ok) return;
    const status = await resp.json();
    if (!status.ready || status.seen) return;

    scene.showCid();
    for (const line of TRANSLATOR_UPGRADE_LINES) {
      actions.showPrologueContinueHint();
      await narrationBox.show(renderEnFirst(line), { html: true, speaker: 'Cid' });
    }
    actions.clear();
    scene.hideCid();

    const done = await fetch(apiUrl('/api/game/translator-upgrade/complete'), {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (done.ok) {
      const result = await done.json();
      if (result.state) updateGameState(result.state);
    }
  } catch (e) {
    console.warn('[TranslatorUpgrade] scene skipped:', e.message);
  }
}
```

(b) Trigger it: in `initGame()` right after the prologue block (`game.js:2626-2628`):

```js
  if (gameState.player && !gameState.meta?.prologueComplete) {
    await playPrologue();
  }

  await maybePlayTranslatorUpgrade();
```

and in `updateUI()` — find the function (`grep -n "^function updateUI\|^async function updateUI" public/game.js`) and add a non-blocking check at its end so run-end → hub transitions catch it in the same session:

```js
  if (gameState.phase === 'hub') {
    maybePlayTranslatorUpgrade();
  }
```

(`_upgradeCheckDone` makes this at most one POST per page session; the server's `ready/seen` flags make replays no-ops.)

(c) Syntax check:

```bash
node --check public/game.js && echo OK
```

- [ ] **Step 8: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/dialogue-director-preflight.test.js
node --experimental-test-module-mocks --test tests/integration/translator-upgrade-routes.test.js
npm test 2>&1 | tail -5   # failing-set equality
/usr/bin/git add src/game/dialogue-director.js src/routes/game/translator-upgrade.js src/routes/game/index.js src/routes/index.js src/app.js server.js public/game.js tests/unit/dialogue-director-preflight.test.js tests/integration/translator-upgrade-routes.test.js
/usr/bin/git commit -m "feat: translator-upgrade preflight, evaluate/complete routes, Cid unlock scene"
```

---

### Task 12: Glue runway — audit + curriculum wiring

**Files:**
- Modify: `scripts/validate-glue-progression.js` (extend to check switch-config coverage)
- Modify: `src/routes/game/combat.js` (pass `curriculumWords` to `selectNpcLine`, lines 207-208)
- Test: `tests/unit/glue-runway.test.js`

**Interfaces:**
- Consumes: `loadSwitchConfig()` (Task 2), `selectNpcLine(lines, knownWords, { curriculumWords, dict, lastSeenText })` (`src/game/dialogue-filter.js:50` — the option exists but no caller passes it).
- Produces: `getMissingGlueWords(userId, meta?) -> string[]` exported from `dialogue-director.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/glue-runway.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMissingGlueWords, loadSwitchConfig } from '../../src/game/dialogue-director.js';

describe('getMissingGlueWords', () => {
  it('returns glue words the player does not know yet', () => {
    const cfg = loadSwitchConfig();
    const knowsFirstFive = () => cfg.glueWords.slice(0, 5);
    const missing = getMissingGlueWords('u1', { getKnownWords: knowsFirstFive });
    assert.equal(missing.length, cfg.glueWords.length - 5);
    assert.ok(!missing.includes(cfg.glueWords[0]));
    assert.ok(missing.includes(cfg.glueWords[10]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

```bash
node --experimental-test-module-mocks --test tests/unit/glue-runway.test.js
```

Append to `src/game/dialogue-director.js`:

```js
/**
 * Glue words from the switch config the player has not yet learned —
 * used as curriculumWords so pre-switch frame selection teaches toward
 * the upgrade.
 */
export function getMissingGlueWords(userId, { getKnownWords = getKnownWordsFromFsrs } = {}) {
  const config = loadSwitchConfig();
  const knownSet = new Set(getKnownWords(userId) || []);
  return config.glueWords.filter(w => !knownSet.has(w));
}
```

Re-run — expected: PASS.

- [ ] **Step 3: Wire curriculumWords into frame selection**

In `src/routes/game/combat.js` `/start-creature-encounter`, the frames fallback block (lines ~207-208):

```js
          const curriculumWords = getMissingGlueWords(req.user.id);
          const fightStart = selectNpcLine(npcPool.fightStart || [], knownWords, { dict: getWordDict(), curriculumWords });
          const defeatLine = selectNpcLine(npcPool.defeatLine || [], knownWords, { dict: getWordDict(), curriculumWords });
```

Add `getMissingGlueWords` to the dialogue-director import in `combat.js`.

- [ ] **Step 4: Extend the audit script**

Open `scripts/validate-glue-progression.js`, read its existing structure, and add a check (following its current reporting style) that:

1. Loads `data/dialogue-switch-config.json`.
2. Verifies every one of the 60 `glueWords` exists in the word dictionary (`data/live-dictionary.json` via the same loader the script already uses) — catches headword-form mismatches between the config and FSRS card ids. Expected to pass: みんな and どっち entries were user-approved and added 2026-07-07; confirm 出来る (not できる) matches the tokenizer's base form, and fix the config if not.
3. Verifies every glue word appears in at least one frame's `words[]` in `data/dialogue/frames.json` AND is reachable under i+1 iteration (i.e., actually teachable through current content — reuse the sim loop already in the script).
4. Prints `MISSING FROM DICT: [...]` / `UNTEACHABLE: [...]` lists and exits non-zero if either list is non-empty.

**Known state at plan time (2026-07-07 audit):** 27/60 reachable. 32 pool words have NO frames at all (みんな, 一緒, そこ, どっち, 昨日, 今度, もう, まだ, いつも, もっと, たくさん, 全部, 一番, 知る, 言う, 聞く, 話す, 言葉, 帰る, 出る, 食べる, 出来る, 大きい, 小さい, 可愛い, 欲しい, 古い, 高い, 安い, 難しい, 簡単, 大切) and 前 has frames blocked by double-unknown pairings (`npc_otona_fightStart_before`, `shopGreeting_before` both need 前+にも). Expect the gap-filler authoring to be ~40-60 short lines, not a handful.

Run it:

```bash
node scripts/validate-glue-progression.js
```

Expected: passes, OR prints gap lists. **If any glue word is unteachable:** author gap-filler lines in `data/dialogue/frame-sources.json` (category `bark_onExplore` or `npc` fightStart variants — short i+1 lines using the missing word), then:

```bash
node scripts/tokenize-static.js && node scripts/validate-dialogue.js && node scripts/validate-glue-progression.js
```

Repeat until clean. **If any glue word is missing from the dictionary:** STOP and report to the user — do not edit `data/dictionary.json` without their explicit confirmation (repo rule).

- [ ] **Step 5: Run tests + commit**

```bash
node --experimental-test-module-mocks --test tests/unit/glue-runway.test.js
npm test 2>&1 | tail -5   # failing-set equality
/usr/bin/git add src/game/dialogue-director.js src/routes/game/combat.js scripts/validate-glue-progression.js tests/unit/glue-runway.test.js
# plus data/dialogue/frame-sources.json + frames.json IF gap-fillers were authored
/usr/bin/git commit -m "feat: glue runway — teach-toward-switch frame selection + coverage audit"
```

---

### Task 13: Admin visibility + dev threshold seed

**Files:**
- Modify: `src/routes/admin.js` (add switch state to the existing per-user word view, near line 239)
- Create: `scripts/seed-translator-threshold.js`
- Test: extend `tests/unit/dialogue-director.test.js` (no new behavior — script is dev tooling; verify by running it)

- [ ] **Step 1: Admin dashboard field**

In `src/routes/admin.js`, find the per-user endpoint that already builds `knownSet` from `getKnownWordsFromFsrs` (line ~239). Add to its response payload:

```js
import { getSwitchState } from '../game/dialogue-director.js';
import { getManager } from '../game/manager-registry.js';
// inside the handler:
      const translatorUpgrade = getSwitchState(userId, getManager(userId).getMeta());
// include `translatorUpgrade` in the res.json object
```

(Match the surrounding response style; the payload adds `{ knownCount, glueCount, thresholdMet, ready, active, seen }`.)

- [ ] **Step 2: Dev seed script**

Create `scripts/seed-translator-threshold.js` — pushes a local account across the threshold by reviewing words into FSRS. Model it on `scripts/seed-dev-user.js` (read that file first and reuse its bootstrapping/imports for the deck API):

```js
// Usage: node scripts/seed-translator-threshold.js [username=devtester]
// Seeds FSRS vocab cards (Learning state) so the account crosses
// minKnownWords + minGlueWords from data/dialogue-switch-config.json.
// Strategy: take the 40 config glue words + enough words from
// data/dictionary.json to reach minKnownWords, create/review each card once
// via the same deck functions seed-dev-user.js uses.
```

The script must print before/after counts:

```
before: known=12 glue=3  →  after: known=140 glue=60  thresholdMet=true
```

(compute via `getSwitchState` with the target user's id and meta).

- [ ] **Step 3: Verify the script end-to-end**

```bash
npm run seed:dev-user           # reset baseline devtester
node scripts/seed-translator-threshold.js devtester
```

Expected: `thresholdMet=true` in the output. Then confirm evaluate flips ready once generation completes (requires `AI_DIALOGUE_*` env; without it, evaluate returns `thresholdMet:true, ready:false` — also a valid check of the env guard).

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add src/routes/admin.js scripts/seed-translator-threshold.js
/usr/bin/git commit -m "feat: admin switch-state visibility + dev threshold seed script"
```

---

### Task 14: ~~どっち FREE-list addition~~ — RESOLVED, SKIP

**Resolution (2026-07-07):** superseded before implementation. どっち joined the
60-word glue pool as *taught* vocabulary (Task 2 config) with a user-approved
`data/live-dictionary.json` entry (added 2026-07-07, alongside みんな). Do NOT
add どっち to the validator's FREE list — that would exempt it from the i+1
budget and undercut its role as a teachable pool word.

Broader free-list reform (surface-vs-base bug: ください freed but frames count
くださる; interjections ああ/うわ counted as content words; freed question words;
two validators not sharing one list) is documented in spec §5 as separate
follow-up scope — not part of this plan.

- [ ] **Step 1: Verify nothing to do**

Confirm どっち is in `data/dialogue-switch-config.json` glueWords and has a
dictionary entry (`node -e "const d=require('./data/live-dictionary.json'); console.log(d['どっち'])"`),
then mark this task complete.

---

### Task 15: Full verification + merge

**Files:** none new

- [ ] **Step 1: Full test suite + failing-set equality**

```bash
npm test 2>&1 | tee /tmp/final.txt | tail -10
grep -E "^(✖|not ok|✗|failing)" /tmp/final.txt | sort > /tmp/final-failures.txt
diff /tmp/translator-upgrade-baseline-failures.txt /tmp/final-failures.txt && echo "FAILING SET UNCHANGED"
```

Expected: `FAILING SET UNCHANGED`.

- [ ] **Step 2: Syntax checks on all touched client files**

```bash
node --check public/game.js && node --check public/js/ui/modals.js && echo OK
```

- [ ] **Step 3: Manual playtest (ASK USER FIRST before launching Playwright — repo rule)**

Pre-req: `AI_DIALOGUE_*` env set locally; `npm run dev`; navigate to `http://localhost:5173`.

1. **Pre-switch (fresh devtester):** NPC battle shows frame one-liners; befriend shows name-quiz; Settings shows "Dynamic conversations" off.
2. **Cross the threshold:** `node scripts/seed-translator-threshold.js devtester`, reload at hub → evaluate fires → background generation runs (watch server logs for `[NpcDialogue]/[CreatureDialogue]`) → after generation completes, reload hub again → **Cid scene plays once** → screenshot.
3. **Post-switch:** NPC encounter uses AI greeting line (differs from frame pool); NPC victory → freed line → 3 bond rounds → bond summary → skill pick; befriend talk → AI conversation; friendly-NPC shop room shows AI greeting + AI purchase lines with the item name filled into the `{item}` slot; shrine room shows AI shrine-fox greeting. Screenshot each; delete screenshots after showing (repo rule).
4. **Opt-out roundtrip:** Settings → toggle off → befriend returns name-quiz; toggle back on → AI resumes.
5. **Fire-once:** reload hub → no second Cid scene.

- [ ] **Step 4: Rollout checks**

- `AI_DIALOGUE_PROVIDER/API_KEY/MODEL` present in Railway dev + prod service variables (check dashboard; do not print secrets).
- Note for deploy: michia's account will cross the threshold immediately — the Cid moment fires on her first hub visit after deploy (intended dogfood).

- [ ] **Step 5: Merge via the finishing skill**

Use superpowers:finishing-a-development-branch. Per repo workflow:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/translator-upgrade
git push origin dev
git push origin dev:master
/usr/bin/git worktree remove ../koto-wt-translator-upgrade
/usr/bin/git branch -d feature/translator-upgrade
```

(Push direct — solo repo, no PR needed per user preference, unless the user asks otherwise.)
