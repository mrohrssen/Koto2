# Dialogue Card TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every dialogue-card Japanese line that has tokenized/static dialogue data expose playable cached TTS through the existing dialogue-card audio button.

**Architecture:** Add one server-side dialogue-card TTS resolver that converts frame/token data into exact Japanese source text, synthesizes it through the existing per-user `TtsDialogueCache`, and returns `{ userId, key }` metadata. Route handlers attach that metadata to static frame responses; frontend renderers pass it into `showNpcDialogueCard()`, which already owns the audio button and calls `playDialogueAudio()`. Generated NPC dialogue keeps using its existing TTS fields, but creature conversation cards also get replay audio instead of only fire-and-forget playback.

**Tech Stack:** Node.js 18+ ES modules, Express route dependency injection, existing VOICEVOX `synthesize()`, existing `TtsDialogueCache`, browser ES modules, Node `node:test`, Vite dev server for visual/audio verification.

---

## Reference Context

- Existing dialogue card renderer: `public/js/ui/npc-dialogue-card.js`
- Existing cached audio playback: `public/js/tts.js`
- Existing per-user dialogue WAV cache: `src/services/tts-dialogue-cache.js`
- Existing generated-dialogue TTS enrichment: `src/narration-engine/index.js`
- Static tokenized route sources: `src/routes/game/run.js`, `src/routes/game/combat.js`
- Existing action-area dialogue migration plan: `docs/superpowers/plans/2026-05-01-npc-dialogue-action-area-redesign-plan.md`

## File Structure

- Create `src/services/dialogue-card-tts.js`: small service for deriving source text from tokenized frame data and resolving cached audio metadata via injected TTS dependencies.
- Create `tests/unit/services/dialogue-card-tts.test.js`: unit tests for source-text derivation, disabled/no-deps behavior, speaker resolution, and synthesis failure fallback.
- Modify `server.js`: instantiate the dialogue-card TTS resolver with production VOICEVOX settings and speaker selection.
- Modify `src/app.js`: add a safe default `getDialogueCardAudio` route dependency for tests.
- Modify `src/routes/index.js`: pass `getDialogueCardAudio` into game routes.
- Modify `src/routes/game/index.js`: pass `getDialogueCardAudio` into run/combat subroutes.
- Modify `src/routes/game/run.js`: attach audio metadata to Skill Master, NPC battle skill, shrine, whack-a-mole, and friendly NPC static frame responses.
- Modify `src/routes/game/combat.js`: attach audio metadata to NPC fight-start and defeat-line static frame responses.
- Modify `public/js/ui/npc-dialogue-ui.js`: pass `line.audio` into defeat-line dialogue cards.
- Modify `public/js/ui/exploration.js`: pass audio metadata from route responses into shrine, whack-a-mole, Skill Master, NPC battle reward, friendly NPC, and player item request dialogue cards.
- Modify `public/js/ui/whack-a-mole.js`: pass finish-dialogue audio metadata into the Game Master finish card.
- Modify `public/js/ui/room-transition.js`: pass NPC fight-start audio metadata into the NPC battle intro dialogue card.
- Modify `public/js/ui/befriend.js`: pass generated creature `speakerTts` metadata into each creature dialogue card.
- Modify focused tests under `tests/unit/routes/` and `tests/unit/ui/` to prove audio metadata is attached and threaded.

---

### Task 1: Add Dialogue Card TTS Service

**Files:**
- Create: `src/services/dialogue-card-tts.js`
- Create: `tests/unit/services/dialogue-card-tts.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/services/dialogue-card-tts.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDialogueCardTtsResolver,
  getDialogueLineText
} from '../../../src/services/dialogue-card-tts.js';

describe('dialogue-card TTS service', () => {
  it('uses raw frame text before token surfaces', () => {
    const line = {
      raw: '待って！',
      tokens: [
        { surface: '待っ', reading: 'まっ' },
        { surface: 'て' },
        { surface: '！', pos: 'punctuation' }
      ]
    };

    assert.equal(getDialogueLineText(line), '待って！');
  });

  it('derives text from token surfaces when raw is absent', () => {
    const line = {
      tokens: [
        { surface: '花', baseForm: '花', reading: 'はな' },
        { surface: 'は' },
        { surface: '森', baseForm: '森', reading: 'もり' },
        { surface: 'で' },
        { surface: '光', baseForm: '光', reading: 'ひかり' },
        { surface: 'を' },
        { surface: '見た', baseForm: '見る', reading: 'みた' },
        { surface: '。', pos: 'punctuation' }
      ]
    };

    assert.equal(getDialogueLineText(line), '花は森で光を見た。');
  });

  it('returns null when required TTS dependencies are missing', async () => {
    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache: null,
      synthesizeFn: async () => Buffer.from('wav'),
      getSpeakerId: () => 13
    });

    assert.equal(
      await resolveAudio({ userId: 'u1', speakerKey: 'cid', line: { raw: '待って！' } }),
      null
    );
  });

  it('synthesizes line audio with resolved speaker id', async () => {
    const synthCalls = [];
    const cacheCalls = [];
    const ttsDialogueCache = {
      async synthesizeLine(userId, text, speakerId, synthesizeFn) {
        cacheCalls.push({ userId, text, speakerId });
        await synthesizeFn(text, speakerId);
        return 'abc123def456.wav';
      }
    };

    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache,
      synthesizeFn: async (text, speakerId) => {
        synthCalls.push({ text, speakerId });
        return Buffer.from(`WAV:${speakerId}:${text}`);
      },
      getSpeakerId: ({ speakerKey }) => speakerKey === 'shrine_fox' ? 46 : 13
    });

    const audio = await resolveAudio({
      userId: 'u1',
      speakerKey: 'shrine_fox',
      line: { raw: 'こんにちは！' }
    });

    assert.deepEqual(audio, { userId: 'u1', key: 'abc123def456.wav' });
    assert.deepEqual(cacheCalls, [{ userId: 'u1', text: 'こんにちは！', speakerId: 46 }]);
    assert.deepEqual(synthCalls, [{ text: 'こんにちは！', speakerId: 46 }]);
  });

  it('falls back to null when synthesis fails', async () => {
    const warnings = [];
    const resolveAudio = createDialogueCardTtsResolver({
      ttsDialogueCache: {
        async synthesizeLine() {
          throw new Error('VOICEVOX down');
        }
      },
      synthesizeFn: async () => Buffer.from('wav'),
      getSpeakerId: () => 13,
      logger: { warn: message => warnings.push(message) }
    });

    const audio = await resolveAudio({
      userId: 'u1',
      speakerKey: 'cid',
      line: { raw: 'どの能力？' }
    });

    assert.equal(audio, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Dialogue card TTS failed/);
  });
});
```

- [ ] **Step 2: Run the failing service tests**

Run:

```bash
npm run test:unit -- tests/unit/services/dialogue-card-tts.test.js
```

Expected: FAIL because `src/services/dialogue-card-tts.js` does not exist.

- [ ] **Step 3: Implement the service**

Create `src/services/dialogue-card-tts.js`:

```js
export function getDialogueLineText(line) {
  if (typeof line === 'string') return line.trim();
  if (!line || typeof line !== 'object') return '';

  const raw = typeof line.raw === 'string' ? line.raw.trim() : '';
  if (raw) return raw;

  if (Array.isArray(line.tokens)) {
    return line.tokens
      .map(token => String(token?.surface || token?.text || ''))
      .join('')
      .trim();
  }

  const text = typeof line.text === 'string' ? line.text.trim() : '';
  return text;
}

function defaultLogger() {
  return console;
}

export function createDialogueCardTtsResolver({
  ttsDialogueCache,
  synthesizeFn,
  getSpeakerId,
  logger = defaultLogger()
} = {}) {
  return async function resolveDialogueCardAudio({
    userId,
    line,
    speakerKey,
    speakerId
  } = {}) {
    if (!userId || !ttsDialogueCache || !synthesizeFn) return null;

    const text = getDialogueLineText(line);
    if (!text) return null;

    const resolvedSpeakerId = Number.isFinite(Number(speakerId))
      ? Number(speakerId)
      : Number(getSpeakerId?.({ speakerKey, line }) || 13);

    try {
      const key = await ttsDialogueCache.synthesizeLine(
        userId,
        text,
        resolvedSpeakerId,
        synthesizeFn
      );
      return key ? { userId, key } : null;
    } catch (error) {
      logger?.warn?.(`[DialogueCardTTS] Dialogue card TTS failed for ${speakerKey || 'unknown'}: ${error.message}`);
      return null;
    }
  };
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm run test:unit -- tests/unit/services/dialogue-card-tts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/dialogue-card-tts.js tests/unit/services/dialogue-card-tts.test.js
git commit -m "Add dialogue card TTS resolver"
```

---

### Task 2: Wire Production Resolver Through Route Dependencies

**Files:**
- Modify: `server.js`
- Modify: `src/app.js`
- Modify: `src/routes/index.js`
- Modify: `src/routes/game/index.js`

- [ ] **Step 1: Add failing route-dependency forwarding test**

Create `tests/unit/routes/dialogue-card-tts-deps.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

let capturedGameRouteDeps = null;

await mock.module('../../../src/routes/game/index.js', {
  defaultExport: deps => {
    capturedGameRouteDeps = deps;
    return (req, res, next) => next();
  }
});

const { default: createRoutes } = await import('../../../src/routes/index.js');

describe('route dependency wiring for dialogue-card TTS', () => {
  it('passes getDialogueCardAudio into game routes', () => {
    const getDialogueCardAudio = async () => ({ userId: 'u1', key: 'abc123def456.wav' });

    createRoutes({
      getSettings: () => ({}),
      saveSettings: () => {},
      ttsCache: null,
      ttsDialogueCache: null,
      getDialogueCardAudio,
      enrichGameState: () => ({}),
      cancelPendingPrefetches: () => {},
      clearPrefetchCache: () => {},
      updateGameStatsWithEvent: () => {},
      saveGameStats: () => {},
      getGameStats: () => ({}),
      setGameStats: () => {},
      getDebugMode: () => false,
      setDebugMode: () => {},
      vocabCacheFile: '',
      staticWordList: [],
      getUserVocabulary: () => ({ words: [] }),
      getCreatureDialogueFromCache: () => null,
      getAllCreatureDialogueCache: () => ({}),
      queueMissingCreatureDialoguesFn: async () => {},
      regenCreatureDialogueFn: async () => {},
      getNpcDialogueFromCache: () => null,
      getAllNpcDialogueCache: () => ({}),
      clearNpcDialogueCache: () => {},
      clearCreatureDialogueCache: () => {},
      queueMissingNpcDialoguesFn: async () => {},
      logNpcEncounterFn: () => {},
      regenNpcDialogueFn: async () => {},
      setNpcMemoryFlagFn: () => {},
      updateNpcMemoryBondFn: () => {},
      checkSentenceViolations: () => ({ unknownWords: [], count: 0 })
    });

    assert.equal(capturedGameRouteDeps.getDialogueCardAudio, getDialogueCardAudio);
  });
});
```

- [ ] **Step 2: Run the failing wiring test**

Run:

```bash
npm run test:unit -- tests/unit/routes/dialogue-card-tts-deps.test.js
```

Expected: FAIL because `src/routes/index.js` does not pass `getDialogueCardAudio` into `createGameRoutes()` yet.

- [ ] **Step 3: Import and instantiate the resolver in `server.js`**

Add this import near the existing service imports:

```js
import { createDialogueCardTtsResolver } from './src/services/dialogue-card-tts.js';
```

Add this helper after `buildTtsOptions()` so it can reuse the same speaker policy:

```js
function getDialogueCardSpeakerId({ speakerKey } = {}) {
  const PLAYER_BOY_SPEAKER_ID = 39;
  const PLAYER_GIRL_SPEAKER_ID = 2;
  const CREATURE_SPEAKER_ID = 21;
  const GAME_MASTER_SPEAKER_ID = settings.gameTtsSpeakerId || 13;

  if (speakerKey === 'you') {
    return settings.voiceGender === 'girl' ? PLAYER_GIRL_SPEAKER_ID : PLAYER_BOY_SPEAKER_ID;
  }
  if (speakerKey === 'game-master') return GAME_MASTER_SPEAKER_ID;
  if (speakerKey === 'creature') return CREATURE_SPEAKER_ID;

  try {
    const npcs = JSON.parse(readFileSync(join(__dirname, 'data', 'npcs.json'), 'utf-8'));
    return npcs[speakerKey]?.speakerId || GAME_MASTER_SPEAKER_ID;
  } catch {
    return GAME_MASTER_SPEAKER_ID;
  }
}

const getDialogueCardAudio = createDialogueCardTtsResolver({
  ttsDialogueCache,
  getSpeakerId: getDialogueCardSpeakerId,
  synthesizeFn: async (text, speakerId) => synthesize(text, speakerId, {
    speedScale: settings.gameTtsSpeed ?? 0.9,
    volumeScale: settings.gameTtsVolume ?? 1.0
  })
});
```

Add `getDialogueCardAudio` to the `createRoutes()` dependency object in `server.js`:

```js
getDialogueCardAudio,
```

- [ ] **Step 4: Add a safe default in `src/app.js`**

Add this property to `DEFAULT_ROUTE_DEPS`:

```js
getDialogueCardAudio: async () => null,
```

- [ ] **Step 5: Pass the dependency through `src/routes/index.js`**

In the `createGameRoutes()` dependency object, add:

```js
getDialogueCardAudio: deps.getDialogueCardAudio,
```

- [ ] **Step 6: Pass the dependency through `src/routes/game/index.js`**

Add this to the dependency object passed to the run route module and combat route module:

```js
getDialogueCardAudio: deps.getDialogueCardAudio,
```

- [ ] **Step 7: Run syntax and wiring tests**

Run:

```bash
node --check server.js && node --check src/app.js && node --check src/routes/index.js && node --check src/routes/game/index.js && npm run test:unit -- tests/unit/routes/dialogue-card-tts-deps.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server.js src/app.js src/routes/index.js src/routes/game/index.js tests/unit/routes/dialogue-card-tts-deps.test.js
git commit -m "Wire dialogue card TTS dependencies"
```

---

### Task 3: Attach Audio Metadata in Static Dialogue Routes

**Files:**
- Modify: `src/routes/game/run.js`
- Modify: `src/routes/game/combat.js`
- Modify/Add tests under `tests/unit/routes/`

- [ ] **Step 1: Write route tests for static frame audio**

Add focused tests to the existing route test files that already cover these endpoints:

1. In `tests/unit/routes/shrine-room-routes.test.js`, assert `/api/game/shrine-offers` returns `greeting.audio`.
2. In `tests/unit/routes/friendly-npc-equipment-only.test.js`, assert `/api/game/friendly-npc-offers` returns `greeting.audio` and each offered item with request tokens has `requestAudio`.
3. Add a new test file `tests/unit/routes/dialogue-card-tts-static-lines.test.js` for Skill Master, whack-a-mole, and NPC defeat-line endpoints if there is no existing focused route file for them.

Use this route override shape in each test app setup:

```js
routeOverrides: {
  getDialogueCardAudio: async ({ userId, speakerKey, line }) => ({
    userId,
    key: `${speakerKey}-${String(line?.raw || 'line').length}.wav`
  })
}
```

Expected assertions:

```js
assert.deepEqual(body.greeting.audio, {
  userId: testUserId,
  key: 'shrine_fox-6.wav'
});
assert.equal(body.offered[0].requestAudio.userId, testUserId);
assert.equal(body.skillSelectPrompt.audio.userId, testUserId);
assert.equal(body.dialogue.audio.userId, testUserId);
assert.equal(body.line.audio.userId, testUserId);
```

- [ ] **Step 2: Run the focused failing route tests**

Run the tests that were changed or added:

```bash
npm run test:unit -- tests/unit/routes/shrine-room-routes.test.js tests/unit/routes/friendly-npc-equipment-only.test.js tests/unit/routes/dialogue-card-tts-static-lines.test.js
```

Expected: FAIL because route responses do not attach `audio`, `requestAudio`, or `shopAudio` metadata yet.

- [ ] **Step 3: Accept `getDialogueCardAudio` in run routes**

In `src/routes/game/run.js`, add `getDialogueCardAudio` to the route factory destructuring. Then add these helpers near the other local helpers:

```js
async function attachAudio(line, req, speakerKey, speakerId) {
  if (!line) return line;
  const audio = await getDialogueCardAudio?.({
    userId: req.user.id,
    speakerKey,
    speakerId,
    line
  });
  return audio ? { ...line, audio } : line;
}

async function attachItemRequestAudio(item, req) {
  if (!item) return item;
  const next = { ...item };
  if (item.tokens?.length) {
    next.requestAudio = await getDialogueCardAudio?.({
      userId: req.user.id,
      speakerKey: 'you',
      line: { tokens: item.tokens, raw: item.raw || item.text || '' }
    });
  }
  if (item.shopTokens?.length) {
    next.shopAudio = await getDialogueCardAudio?.({
      userId: req.user.id,
      speakerKey: 'you',
      line: { tokens: item.shopTokens, raw: item.shopRaw || item.shopText || '' }
    });
  }
  return next;
}
```

- [ ] **Step 4: Attach audio in Skill Master route responses**

In `/skill-master-offers`, change the response construction so `skillSelectPrompt` is enriched for Cid:

```js
const skillSelectPrompt = await attachAudio(
  getEligibleFrameTokens(getSkillSelectFrame(), knownSet, { dict: getWordDict() }),
  req,
  'cid'
);
res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
```

In `/npc-battle-skill-offers`, enrich the prompt using the defeated NPC id when available:

```js
const npcKey = room.npcBattle?.npcId || room.npcBattle?.npc?.id || 'game-master';
const skillSelectPrompt = await attachAudio(
  getEligibleFrameTokens(getSkillSelectFrame(), knownSet, { dict: getWordDict() }),
  req,
  npcKey
);
res.json({ offered, skillSelectPrompt, state: req.getEnrichedGameState() });
```

- [ ] **Step 5: Attach audio in shrine and whack-a-mole route responses**

In `/shrine-offers`, return:

```js
const greeting = await attachAudio(room.shrine.greeting || null, req, 'shrine_fox');
res.json({
  rewards: SHRINE_REWARDS,
  greeting,
  completed: room.shrine.completed === true || room.shrine.used === true,
  state: req.getEnrichedGameState()
});
```

Make `/whack-a-mole-dialogue` async and return:

```js
const dialogueWithAudio = await attachAudio(dialogue, req, 'game-master');
res.json({ dialogue: dialogueWithAudio, yesTokens, noTokens });
```

In the whack-a-mole completion route, return:

```js
const finishDialogueWithAudio = await attachAudio(finishDialogue, req, 'game-master');
res.json({ ...result, finishDialogue: finishDialogueWithAudio, state: req.getEnrichedGameState() });
```

- [ ] **Step 6: Attach audio in friendly NPC route responses**

In `/friendly-npc-offers`, before `res.json`, build enriched values:

```js
const offeredWithAudio = await Promise.all(
  (room.friendlyNpc.offered || []).map(item => attachItemRequestAudio(item, req))
);
const greeting = await attachAudio(
  room.friendlyNpc.greeting || null,
  req,
  room.npc?.id || 'game-master',
  room.npc?.speakerId
);
res.json({
  offered: offeredWithAudio,
  greeting,
  state: req.getEnrichedGameState()
});
```

- [ ] **Step 7: Accept and use `getDialogueCardAudio` in combat routes**

In `src/routes/game/combat.js`, add `getDialogueCardAudio` to the route factory destructuring and add:

```js
async function attachCombatLineAudio(line, req, speakerKey, speakerId) {
  if (!line) return line;
  const audio = await getDialogueCardAudio?.({
    userId: req.user.id,
    speakerKey,
    speakerId,
    line
  });
  return audio ? { ...line, audio } : line;
}
```

In `/start-creature-encounter`, enrich bootstrap NPC lines:

```js
const fightStart = selectNpcLine(npcPool.fightStart || [], knownWords, { dict: getWordDict() });
const defeatLine = selectNpcLine(npcPool.defeatLine || [], knownWords, { dict: getWordDict() });
const npcKey = npcData.id;

npcDialogue = {
  fightStart: await attachCombatLineAudio(mapLine(fightStart), req, npcKey, npcData.speakerId),
  defeatLine: await attachCombatLineAudio(mapLine(defeatLine), req, npcKey, npcData.speakerId),
  useKanji: false
};
```

In `/npc-dialogue-start`, enrich the selected defeat line:

```js
const line = await attachCombatLineAudio(
  { tokens: selectedLine.tokens, raw: selectedLine.raw },
  req,
  npc.id,
  npc.speakerId
);

res.json({
  mode: 'defeat_line',
  npc: { id: npc.id, name: npc.name, nameEn: npc.nameEn, speakerId: npc.speakerId },
  line
});
```

- [ ] **Step 8: Run route tests**

Run:

```bash
node --check src/routes/game/run.js && node --check src/routes/game/combat.js && npm run test:unit -- tests/unit/routes/shrine-room-routes.test.js tests/unit/routes/friendly-npc-equipment-only.test.js tests/unit/routes/dialogue-card-tts-static-lines.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routes/game/run.js src/routes/game/combat.js tests/unit/routes/shrine-room-routes.test.js tests/unit/routes/friendly-npc-equipment-only.test.js tests/unit/routes/dialogue-card-tts-static-lines.test.js
git commit -m "Attach TTS metadata to static dialogue cards"
```

---

### Task 4: Thread Audio Metadata Into Dialogue Cards

**Files:**
- Modify: `public/js/ui/npc-dialogue-ui.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/whack-a-mole.js`
- Modify: `public/js/ui/room-transition.js`
- Modify: `public/js/ui/befriend.js`
- Modify: `tests/unit/ui/npc-dialogue-ui.test.js`
- Modify: `tests/unit/ui/exploration-shrine.test.js`
- Modify: `tests/unit/ui/exploration-friendly-npc.test.js`
- Modify: `tests/unit/ui/exploration-whack-a-mole.test.js`
- Modify: `tests/unit/ui/whack-a-mole-client.test.js`
- Modify: `tests/unit/ui/exploration-skill-master.test.js`
- Modify: `tests/unit/ui/npc-battle-intro.test.js`
- Modify: `tests/unit/ui/befriend.test.js`

- [ ] **Step 1: Write failing UI tests**

Update the existing UI tests that mock `showNpcDialogueCard()`:

1. In `tests/unit/ui/npc-dialogue-ui.test.js`, add a `defeat_line` case that expects `audio: { userId: 'user-1', key: 'defeat.wav' }`.
2. In `tests/unit/ui/exploration-shrine.test.js`, expect the shrine greeting card to receive `audio: response.greeting.audio`.
3. In `tests/unit/ui/exploration-friendly-npc.test.js`, expect friendly NPC greetings and player item request cards to receive `audio`.
4. In `tests/unit/ui/exploration-whack-a-mole.test.js`, expect the intro card to receive `audio`.
5. In `tests/unit/ui/whack-a-mole-client.test.js`, expect the finish card to receive `audio`.
6. In `tests/unit/ui/exploration-skill-master.test.js`, expect the Cid prompt card to receive `audio`.
7. In `tests/unit/ui/npc-battle-intro.test.js`, expect `npcDialogue.fightStart.audio` to be passed into the NPC battle intro card.
8. In `tests/unit/ui/befriend.test.js`, expect `round.speakerTts` to become card `audio`.

Example assertion shape:

```js
assert.deepEqual(dialogueCards[0].audio, {
  userId: 'user-1',
  key: 'line.wav'
});
```

- [ ] **Step 2: Run the focused failing UI tests**

Run:

```bash
npm run test:unit -- tests/unit/ui/npc-dialogue-ui.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/npc-battle-intro.test.js tests/unit/ui/befriend.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: FAIL for the new audio-threading assertions.

- [ ] **Step 3: Pass defeat-line audio in `npc-dialogue-ui.js`**

In the `dialogueData.mode === 'defeat_line'` branch, pass the server-provided line audio:

```js
await showNpcDialogueCard(tokenDialogueOptions({
  ...npcSpeaker,
  line,
  useKanji: dialogueData.useKanji,
  audio: line?.audio || null,
}));
```

No change is needed inside `tokenDialogueOptions()` because it already includes `audio` when provided.

- [ ] **Step 4: Pass audio in `exploration.js` static card calls**

For each `showNpcDialogueCard()` call that renders route-provided tokenized frame data, add the matching audio property:

```js
audio: shrineState.greeting?.audio || null,
```

```js
audio: whackAMoleState.dialogue?.audio || null,
```

```js
audio: skillMasterState.promptTokens?.audio || null,
```

```js
audio: npcBattleSkillState.promptTokens?.audio || null,
```

In `showPlayerItemRequest(item)`, pass the specific item request audio:

```js
audio: item.requestAudio || null,
```

For the `shopTokens` branch, pass:

```js
audio: item.shopAudio || null,
```

For friendly NPC greeting, pass:

```js
audio: friendlyNpcState.greeting?.audio || null,
```

For whack-a-mole finish in `public/js/ui/whack-a-mole.js`, pass:

```js
audio: finishDialogue.audio || null,
```

- [ ] **Step 5: Pass NPC battle intro audio in `room-transition.js`**

In the bootstrap line branch, add:

```js
audio: bootstrapLine.audio || null,
```

The legacy `npcData.greeting` branch can continue using generated `greetingTts` if it already has an audio payload available; do not synthesize client-side.

- [ ] **Step 6: Give creature befriend cards replay audio**

In `public/js/ui/befriend.js`, change `showConversationRound(round, creatureSpeaker)` so the speaker card receives generated audio:

```js
await showNpcDialogueCard({
  ...dialogueOptionsForCreatureSpeaker(creatureSpeaker),
  text: round.speaker,
  audio: round.speakerTts && round.userId ? { userId: round.userId, key: round.speakerTts } : null,
});
```

If `round.userId` is not currently present, pass `convoUserId` into `showConversationRound(round, creatureSpeaker, convoUserId)` and build:

```js
audio: round.speakerTts && convoUserId ? { userId: convoUserId, key: round.speakerTts } : null,
```

Keep the existing fire-and-forget `playDialogueAudio()` calls for now so behavior does not regress; this task only enables the replay button.

- [ ] **Step 7: Run syntax and UI tests**

Run:

```bash
node --check public/js/ui/npc-dialogue-ui.js && node --check public/js/ui/exploration.js && node --check public/js/ui/whack-a-mole.js && node --check public/js/ui/room-transition.js && node --check public/js/ui/befriend.js && npm run test:unit -- tests/unit/ui/npc-dialogue-ui.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/npc-battle-intro.test.js tests/unit/ui/befriend.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/npc-dialogue-ui.js public/js/ui/exploration.js public/js/ui/whack-a-mole.js public/js/ui/room-transition.js public/js/ui/befriend.js tests/unit/ui/npc-dialogue-ui.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/whack-a-mole-client.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/npc-battle-intro.test.js tests/unit/ui/befriend.test.js
git commit -m "Thread dialogue card audio metadata to UI"
```

---

### Task 5: Verify End-to-End Behavior

**Files:**
- No planned source edits unless verification exposes a bug.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- tests/unit/services/dialogue-card-tts.test.js tests/unit/services/tts-dialogue-cache.test.js tests/unit/ui/npc-dialogue-card.test.js tests/unit/ui/npc-dialogue-ui.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/exploration-skill-master.test.js
```

Expected: PASS.

- [ ] **Step 2: Run route tests touched by this plan**

Run:

```bash
npm run test:unit -- tests/unit/routes/shrine-room-routes.test.js tests/unit/routes/friendly-npc-equipment-only.test.js tests/unit/routes/dialogue-card-tts-static-lines.test.js
```

Expected: PASS.

- [ ] **Step 3: Run syntax checks for edited JS**

Run:

```bash
node --check src/services/dialogue-card-tts.js && node --check src/routes/game/run.js && node --check src/routes/game/combat.js && node --check public/js/ui/npc-dialogue-ui.js && node --check public/js/ui/exploration.js && node --check public/js/ui/room-transition.js && node --check public/js/ui/befriend.js && node --check public/js/ui/whack-a-mole.js
```

Expected: no output and exit code 0.

- [ ] **Step 4: Run the broader unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Manual browser/audio verification**

Ask before opening Playwright. After permission:

1. Start the dev server with `npm run dev`.
2. Verify `http://localhost:5173` returns HTTP 200.
3. Navigate to the game in the browser.
4. Enter a Skill Master, shrine, friendly NPC, whack-a-mole, and NPC battle defeat-line flow.
5. On each dialogue card, confirm the `♪` button is enabled for the Japanese card line.
6. Click `♪` and confirm the cached WAV plays without advancing the dialogue card.
7. Confirm Translate/Learn/Continue still work after audio playback.

Expected: audio plays from `/api/tts/dialogue/:userId/:filename`, the dialogue card stays visible, and no client-side TTS synthesis request is made for these cached lines.

- [ ] **Step 6: Commit verification-only fixes if needed**

If manual verification finds a small wiring bug, fix it with a focused test and commit:

```bash
git add src/services/dialogue-card-tts.js src/routes/game/run.js src/routes/game/combat.js public/js/ui/npc-dialogue-card.js public/js/ui/exploration.js public/js/ui/whack-a-mole.js public/js/ui/room-transition.js public/js/ui/befriend.js tests/unit/services/dialogue-card-tts.test.js tests/unit/routes/dialogue-card-tts-static-lines.test.js tests/unit/ui/npc-dialogue-card.test.js
git commit -m "Fix dialogue card TTS playback wiring"
```

If verification passes without changes, do not create an empty commit.

---

## Risks and Guardrails

- Do not generate or display new Japanese text. This plan only adds audio for text already selected by the i+1 frame pipeline or existing generated-dialogue cache.
- Do not modify `data/dictionary.json`.
- Do not hand-edit `data/dialogue/frames.json`.
- Do not synthesize audio on the client for static dialogue cards; use the existing server-side WAV cache so route responses can reuse files.
- TTS failure must not block gameplay. The resolver returns `null`, the card audio button stays disabled, and the dialogue still renders.
- Keep existing generated NPC dialogue TTS behavior intact. This plan adds replay-button wiring where it is missing; it does not replace the narration-engine TTS enrichment.

## Completion Criteria

- All static tokenized dialogue-card routes that choose frame text can return audio metadata when VOICEVOX and the cache are available.
- Frontend dialogue-card calls pass audio metadata consistently.
- `showNpcDialogueCard()` audio button works without changing the card's promise/continue behavior.
- Focused service, route, and UI tests pass.
- Syntax checks for all edited JS files pass.
- Manual verification confirms at least one static dialogue card can play cached audio from the card.
