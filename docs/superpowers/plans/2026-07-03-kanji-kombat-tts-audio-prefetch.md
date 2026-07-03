# Kanji Kombat TTS Audio Prefetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per user preference, dispatch implementation subagents with `model: "opus"`.

**Goal:** Word audio in Kanji Kombat starts instantly on tap by prefetching the next 5 prompts' audio in the background.

**Architecture:** A dialogue-line blob cache in `public/js/tts.js` (prefetch queue, concurrency 1, insertion-order eviction at 20 entries) that `playDialogueLineAudio()` consults transparently; a small feeder in `public/js/ui/kanji-kombat.js` that reads the head of `promptBuffer` on every KK state pass and warms the cache. Client-only — no server changes.

**Tech Stack:** Vanilla ES modules (`public/js/`), `node:test` + `assert/strict` unit tests under `tests/unit/`, c8 coverage.

**Spec:** `docs/superpowers/specs/2026-07-03-kanji-kombat-tts-audio-prefetch-design.md`

## Global Constraints

- Use `/usr/bin/git`, never Homebrew git.
- Work in a dedicated worktree: `../koto-wt-kk-tts-prefetch`, branch `feature/kk-tts-audio-prefetch` off `dev` (created in Task 1).
- Client-only: do NOT touch `server.js`, `src/routes/tts.js`, or any server code. Never modify `data/dictionary.json`.
- Exact values from spec: prefetch depth **5**, cache cap **20**, prefetch concurrency **1**, cache key `` `${speakerId}|${text}` ``.
- `playDialogueLineAudio()` contract is frozen: same signature, returns the server's `audio` object (`{userId, key, url, speakerId}`) or `null`, and its promise resolves only after playback ends. `npc-dialogue-card.js:612-618` depends on this.
- After editing any JS file run `node --check <file>` before committing.
- No files in repo root; no screenshots committed; never `git add` generated caches (`vocab-cache-*.json`, `npc-memory-*.json`).
- `npm test` (Tier 1 + 2) must pass before merge.

---

### Task 1: tts.js — dialogue-line cache + background prefetch queue

**Files:**
- Modify: `public/js/tts.js` (add cache state near the existing `wordAudioCache` block at line ~28; add functions after `playNeutralLearnAudio`, line ~394; one-line fix in `playAudioUrl`, line ~401)
- Test: `tests/unit/tts-dialogue-line-cache.test.js` (create)

**Interfaces:**
- Consumes: existing `tts.js` internals — `API_BASE`, `getAuthHeaders()` (from `./api.js`), `ttsEnabled`, `isAudioMuted()` (from `./audio-settings.js`).
- Produces: `export function prefetchDialogueLine({ text, speakerId })` (fire-and-forget, returns undefined); module-private `dialogueLineCache` Map with entries `{ status: 'pending'|'ready'|'error', blobUrl, audioMeta, promise }`; module-private `async function fetchDialogueLine(text, speakerId)` returning `{ blobUrl, audioMeta } | null`; module-private `function dialogueLineKey(text, speakerId)`; module-private `function evictDialogueLineOverflow()`. Task 2 uses all four; Task 3 imports `prefetchDialogueLine`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-kk-tts-prefetch -b feature/kk-tts-audio-prefetch
cd ../koto-wt-kk-tts-prefetch
npm install
```

Expected: worktree created, deps installed. All subsequent steps run in `../koto-wt-kk-tts-prefetch`.

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/tts-dialogue-line-cache.test.js` with exactly this content. Notes on the harness: ESM imports hoist, but `tts.js` is import-safe under Node (proven by `tests/unit/ui/kanji-kombat-ui.test.js`, which imports it transitively) — the stubs below are only needed at call time. Every test uses a unique text prefix so tests never share cache keys (the module-level cache persists across tests in this file; there is deliberately no test-only reset export).

```js
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchDialogueLine, playDialogueLineAudio } from '../../public/js/tts.js';
import { setMuted } from '../../public/js/audio-settings.js';

// ---- browser-global stubs (needed at call time, not import time) ----
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
}

const createdUrls = [];
const revokedUrls = [];
URL.createObjectURL = () => {
  const url = `blob:fake-${createdUrls.length}`;
  createdUrls.push(url);
  return url;
};
URL.revokeObjectURL = url => revokedUrls.push(url);

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
  }
  play() {
    FakeAudio.played.push(this.src);
    // Resolve playback on the next microtask, like a zero-length clip ending.
    return Promise.resolve().then(() => this.onended?.());
  }
  pause() {}
}
FakeAudio.played = [];
globalThis.Audio = FakeAudio;

let fetchCalls = [];
let fetchHandler = defaultFetchHandler;
globalThis.fetch = (url, options = {}) => {
  fetchCalls.push({ url: String(url), options });
  return fetchHandler(String(url), options);
};

async function defaultFetchHandler(url, options) {
  if (url.includes('/api/tts/dialogue-line')) {
    const { text, speakerId } = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        audio: {
          userId: 'u1',
          key: `${text}.wav`,
          url: `/api/tts/dialogue/u1/${text}.wav`,
          speakerId,
        },
      }),
    };
  }
  // WAV download for any other URL.
  return { ok: true, blob: async () => ({ fakeWav: url }) };
}

function linePosts(prefix) {
  return fetchCalls
    .filter(call => call.url.includes('/api/tts/dialogue-line'))
    .map(call => JSON.parse(call.options.body))
    .filter(body => body.text.startsWith(prefix));
}

async function tick(times = 10) {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

async function waitFor(cond, label) {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${label}`);
}

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = defaultFetchHandler;
  FakeAudio.played = [];
});

describe('prefetchDialogueLine', () => {
  it('fetches and caches a line once per text+speaker', async () => {
    prefetchDialogueLine({ text: 'dedupe-犬', speakerId: 13 });
    prefetchDialogueLine({ text: 'dedupe-犬', speakerId: 13 });
    await waitFor(() => linePosts('dedupe-').length >= 1, 'first post');
    await tick();
    prefetchDialogueLine({ text: 'dedupe-犬', speakerId: 13 });
    await tick();
    assert.equal(linePosts('dedupe-').length, 1);
  });

  it('treats a different speaker as a different cache entry', async () => {
    prefetchDialogueLine({ text: 'speaker-猫', speakerId: 13 });
    prefetchDialogueLine({ text: 'speaker-猫', speakerId: 2 });
    await waitFor(() => linePosts('speaker-').length === 2, 'both posts');
    const speakers = linePosts('speaker-').map(body => body.speakerId).sort((a, b) => a - b);
    assert.deepEqual(speakers, [2, 13]);
  });

  it('runs prefetches one at a time', async () => {
    let releaseFirst;
    const gate = new Promise(resolve => { releaseFirst = resolve; });
    fetchHandler = async (url, options) => {
      if (url.includes('/api/tts/dialogue-line')) {
        const { text } = JSON.parse(options.body);
        if (text === 'queue-A') await gate;
      }
      return defaultFetchHandler(url, options);
    };
    prefetchDialogueLine({ text: 'queue-A', speakerId: 13 });
    prefetchDialogueLine({ text: 'queue-B', speakerId: 13 });
    await tick();
    assert.deepEqual(linePosts('queue-').map(body => body.text), ['queue-A']);
    releaseFirst();
    await waitFor(() => linePosts('queue-').length === 2, 'second post');
    assert.deepEqual(linePosts('queue-').map(body => body.text), ['queue-A', 'queue-B']);
  });

  it('marks failures and does not retry them', async () => {
    fetchHandler = async (url, options) => {
      if (url.includes('/api/tts/dialogue-line')) return { ok: false, json: async () => ({}) };
      return defaultFetchHandler(url, options);
    };
    prefetchDialogueLine({ text: 'fail-鳥', speakerId: 13 });
    await waitFor(() => linePosts('fail-').length === 1, 'failed post');
    prefetchDialogueLine({ text: 'fail-鳥', speakerId: 13 });
    await tick();
    assert.equal(linePosts('fail-').length, 1);
  });

  it('skips prefetch while muted', async () => {
    setMuted(true);
    try {
      prefetchDialogueLine({ text: 'muted-魚', speakerId: 13 });
      await tick();
      assert.equal(linePosts('muted-').length, 0);
    } finally {
      setMuted(false);
    }
  });

  it('evicts the oldest ready entries past the cap and revokes their blob URLs', async () => {
    const blobsBefore = createdUrls.length;
    for (let i = 0; i < 21; i++) {
      prefetchDialogueLine({ text: `lru-${i}`, speakerId: 13 });
    }
    await waitFor(() => linePosts('lru-').length === 21, 'all 21 synthesized');
    await tick();
    const firstLruBlob = createdUrls[blobsBefore]; // lru-0's blob (queue preserves order)
    prefetchDialogueLine({ text: 'lru-overflow', speakerId: 13 });
    await waitFor(() => revokedUrls.includes(firstLruBlob), 'oldest blob revoked');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
node --test tests/unit/tts-dialogue-line-cache.test.js
```

Expected: FAIL — `prefetchDialogueLine` is not exported from `tts.js` (SyntaxError on import).

- [ ] **Step 4: Implement the cache and prefetch queue in tts.js**

In `public/js/tts.js`, add after the `// Word audio cache` block (after line 32, `const WORD_SPEAKER_ID = ...`):

```js
// Dialogue-line audio cache (background prefetch + instant replay).
// Entries: { status: 'pending'|'ready'|'error', blobUrl, audioMeta, promise }
const dialogueLineCache = new Map();
const MAX_DIALOGUE_LINE_CACHE = 20;
let dialogueLinePrefetchChain = Promise.resolve();
```

Add after `playNeutralLearnAudio()` (line ~394):

```js
function dialogueLineKey(text, speakerId) {
  return `${speakerId}|${text}`;
}

function evictDialogueLineOverflow() {
  while (dialogueLineCache.size > MAX_DIALOGUE_LINE_CACHE) {
    let evicted = false;
    for (const [key, entry] of dialogueLineCache) {
      if (entry.status === 'pending') continue;
      if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      dialogueLineCache.delete(key);
      evicted = true;
      break;
    }
    if (!evicted) break;
  }
}

/**
 * POST /api/tts/dialogue-line, then download the WAV as a blob URL.
 * @returns {Promise<{blobUrl: string, audioMeta: object}|null>}
 */
async function fetchDialogueLine(text, speakerId) {
  const response = await fetch(`${API_BASE}/api/tts/dialogue-line`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ text, speakerId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data.audio?.url) return null;

  const wavUrl = data.audio.url.startsWith('http')
    ? data.audio.url
    : `${API_BASE}${data.audio.url}`;
  const wavResponse = await fetch(wavUrl);
  if (!wavResponse.ok) return null;
  const blob = await wavResponse.blob();
  return { blobUrl: URL.createObjectURL(blob), audioMeta: data.audio };
}

/**
 * Prefetch a dialogue line's audio in the background so a later
 * playDialogueLineAudio() with the same text+speaker starts instantly.
 * Jobs run one at a time — VOICEVOX synthesis is the prod CPU bottleneck.
 * Failed lines are not retried for the session.
 */
export function prefetchDialogueLine({ text, speakerId } = {}) {
  if (!ttsEnabled || isAudioMuted() || !text) return;
  const resolvedSpeakerId = Number(speakerId);
  if (!Number.isFinite(resolvedSpeakerId)) return;

  const key = dialogueLineKey(text, resolvedSpeakerId);
  if (dialogueLineCache.has(key)) return;

  const entry = { status: 'pending', blobUrl: null, audioMeta: null, promise: null };
  entry.promise = dialogueLinePrefetchChain = dialogueLinePrefetchChain
    .then(() => fetchDialogueLine(text, resolvedSpeakerId))
    .then(result => {
      if (result) {
        entry.status = 'ready';
        entry.blobUrl = result.blobUrl;
        entry.audioMeta = result.audioMeta;
      } else {
        entry.status = 'error';
      }
      return entry;
    })
    .catch(() => {
      entry.status = 'error';
      return entry;
    });
  dialogueLineCache.set(key, entry);
  evictDialogueLineOverflow();
}
```

Note the eviction nuance: eviction only runs on insert and skips `pending` entries, so the cache can transiently exceed 20 by the number of queued jobs — bounded by the feeder depth (5), a few hundred KB of WAV at worst.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
node --check public/js/tts.js && node --test tests/unit/tts-dialogue-line-cache.test.js
```

Expected: syntax OK; all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/tts.js tests/unit/tts-dialogue-line-cache.test.js
/usr/bin/git commit -m "feat: dialogue-line audio prefetch cache in tts.js"
```

---

### Task 2: tts.js — playDialogueLineAudio serves from the cache

**Files:**
- Modify: `public/js/tts.js` (`playDialogueLineAudio`, line ~366; `playAudioUrl`, line ~401)
- Test: `tests/unit/tts-dialogue-line-cache.test.js` (append a describe block)

**Interfaces:**
- Consumes: Task 1's `dialogueLineCache`, `dialogueLineKey`, `fetchDialogueLine`, `evictDialogueLineOverflow`.
- Produces: `playDialogueLineAudio({ text, speakerId })` with unchanged external contract — returns `audioMeta` (`{userId, key, url, speakerId}`) or `null`, resolves after playback ends. Callers (`kanji-kombat.js:628`, `npc-dialogue-card.js:612`, `playNeutralLearnAudio`) need no changes.

- [ ] **Step 1: Append the failing tests**

Append to `tests/unit/tts-dialogue-line-cache.test.js`:

```js
describe('playDialogueLineAudio cache behavior', () => {
  it('plays a prefetched line from the blob cache without a new request', async () => {
    await tick(20); // drain straggling prefetch jobs from earlier tests before snapshotting
    const blobsBefore = createdUrls.length;
    prefetchDialogueLine({ text: 'hit-川', speakerId: 13 });
    await waitFor(() => createdUrls.length === blobsBefore + 1, 'prefetch ready');
    await tick();
    const postsBefore = linePosts('hit-').length;
    const meta = await playDialogueLineAudio({ text: 'hit-川', speakerId: 13 });
    assert.equal(meta?.key, 'hit-川.wav');
    assert.equal(linePosts('hit-').length, postsBefore);
    assert.equal(FakeAudio.played.at(-1), createdUrls[blobsBefore]);
  });

  it('waits for an in-flight prefetch instead of refetching', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    fetchHandler = async (url, options) => {
      if (url.includes('/api/tts/dialogue-line')) {
        const { text } = JSON.parse(options.body);
        if (text === 'pending-本') await gate;
      }
      return defaultFetchHandler(url, options);
    };
    prefetchDialogueLine({ text: 'pending-本', speakerId: 13 });
    const playPromise = playDialogueLineAudio({ text: 'pending-本', speakerId: 13 });
    await tick();
    assert.equal(linePosts('pending-').length, 1);
    release();
    const meta = await playPromise;
    assert.equal(meta?.key, 'pending-本.wav');
    assert.equal(linePosts('pending-').length, 1);
  });

  it('falls back to the network on a cache miss and caches for instant replay', async () => {
    const meta = await playDialogueLineAudio({ text: 'miss-山', speakerId: 13 });
    assert.equal(meta?.key, 'miss-山.wav');
    assert.equal(linePosts('miss-').length, 1);
    const again = await playDialogueLineAudio({ text: 'miss-山', speakerId: 13 });
    assert.equal(again?.key, 'miss-山.wav');
    assert.equal(linePosts('miss-').length, 1);
  });

  it('returns null when the synthesis request fails', async () => {
    fetchHandler = async (url, options) => {
      if (url.includes('/api/tts/dialogue-line')) return { ok: false, json: async () => ({}) };
      return defaultFetchHandler(url, options);
    };
    const meta = await playDialogueLineAudio({ text: 'err-空', speakerId: 13 });
    assert.equal(meta, null);
  });

  it('returns null while muted without fetching', async () => {
    setMuted(true);
    try {
      const meta = await playDialogueLineAudio({ text: 'mutedplay-土', speakerId: 13 });
      assert.equal(meta, null);
      assert.equal(linePosts('mutedplay-').length, 0);
    } finally {
      setMuted(false);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
node --test tests/unit/tts-dialogue-line-cache.test.js
```

Expected: Task 1's 6 tests PASS; 'plays a prefetched line…', 'waits for an in-flight prefetch…', and 'falls back … instant replay' all FAIL (the current implementation POSTs on every call, so `linePosts` counts grow). 'returns null when the synthesis request fails' and 'returns null while muted' already pass — they pin existing behavior.

- [ ] **Step 3: Rewrite playDialogueLineAudio and fix playAudioUrl**

In `public/js/tts.js`, replace the whole `playDialogueLineAudio` function (currently lines 366–387) with:

```js
export async function playDialogueLineAudio({ text, speakerId } = {}) {
  if (!ttsEnabled || isAudioMuted() || !text) return null;

  const resolvedSpeakerId = Number(speakerId);
  if (!Number.isFinite(resolvedSpeakerId)) return null;

  const key = dialogueLineKey(text, resolvedSpeakerId);
  let entry = dialogueLineCache.get(key);
  if (entry?.status === 'pending') entry = await entry.promise;
  if (entry?.status === 'ready' && entry.blobUrl) {
    await playAudioUrl(entry.blobUrl);
    return entry.audioMeta;
  }

  // Cache miss or failed prefetch: fetch now, keep the blob for instant replay.
  try {
    const result = await fetchDialogueLine(text, resolvedSpeakerId);
    if (!result) return null;
    dialogueLineCache.set(key, {
      status: 'ready',
      blobUrl: result.blobUrl,
      audioMeta: result.audioMeta,
      promise: null
    });
    evictDialogueLineOverflow();
    await playAudioUrl(result.blobUrl);
    return result.audioMeta;
  } catch (error) {
    console.warn('[TTS] Dialogue line audio failed:', error.message);
    return null;
  }
}
```

In `playAudioUrl` (line ~401), replace:

```js
  const audioUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
```

with:

```js
  const audioUrl = url.startsWith('http') || url.startsWith('blob:')
    ? url
    : `${API_BASE}${url}`;
```

(Without this, blob URLs would be mangled to `${API_BASE}blob:…` and never play.)

Blob URLs are reused across plays: `playAudioUrl`'s cleanup does not revoke them — only cache eviction does. Do not add a revoke to the playback path.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --check public/js/tts.js && node --test tests/unit/tts-dialogue-line-cache.test.js
```

Expected: syntax OK; all 11 tests PASS.

- [ ] **Step 5: Run the adjacent UI suites to catch contract regressions**

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js tests/unit/ui/npc-dialogue-card.test.js
```

Expected: PASS (these exercise `playDialogueLineAudio` callers).

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/tts.js tests/unit/tts-dialogue-line-cache.test.js
/usr/bin/git commit -m "feat: playDialogueLineAudio serves prefetched blobs instantly"
```

---

### Task 3: kanji-kombat.js — feed the prefetcher from promptBuffer

**Files:**
- Modify: `public/js/ui/kanji-kombat.js` (import at line 3; new exported function next to `kanjiKombatAudioText` at line ~637; one-line hook at the end of `rememberKanjiKombatState`, line ~254)
- Test: `tests/unit/ui/kanji-kombat-audio-prefetch.test.js` (create)

**Interfaces:**
- Consumes: `prefetchDialogueLine` from Task 1; existing `getSpeakerId` and `kanjiKombatAudioText`.
- Produces: `export function prefetchUpcomingKanjiKombatAudio(state)` and `export const KANJI_KOMBAT_AUDIO_PREFETCH_DEPTH = 5`. No other module consumes them — the export exists for direct testing.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ui/kanji-kombat-audio-prefetch.test.js`:

```js
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  prefetchUpcomingKanjiKombatAudio,
  renderKanjiKombatAction,
} from '../../../public/js/ui/kanji-kombat.js';

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
}
URL.createObjectURL = () => 'blob:fake';
URL.revokeObjectURL = () => {};

let fetchCalls = [];
globalThis.fetch = (url, options = {}) => {
  fetchCalls.push({ url: String(url), options });
  const target = String(url);
  if (target.includes('/api/tts/dialogue-line')) {
    const { text, speakerId } = JSON.parse(options.body);
    return Promise.resolve({
      ok: true,
      json: async () => ({
        ok: true,
        audio: { userId: 'u1', key: `${text}.wav`, url: `/api/tts/dialogue/u1/${text}.wav`, speakerId },
      }),
    });
  }
  return Promise.resolve({ ok: true, blob: async () => ({}) });
};

function linePosts(prefix) {
  return fetchCalls
    .filter(call => call.url.includes('/api/tts/dialogue-line'))
    .map(call => JSON.parse(call.options.body))
    .filter(body => body.text.startsWith(prefix));
}

async function waitFor(cond, label) {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function tick(times = 10) {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

function kkState(promptBuffer) {
  return {
    run: { kanjiKombat: { promptBuffer } },
    // Non-ally cursor: renderKanjiKombatAction bails before touching the DOM,
    // but rememberKanjiKombatState (and the prefetch hook) still run.
    combat: { actionCursor: { side: 'enemy' } },
  };
}

const sixPromptBuffer = [
  { kind: 'quiz', quiz: { audioText: 'feeder-犬', prompt: '犬', choices: [] } },
  { kind: 'intro', intro: { card: { reading: 'feeder-ねこ', prompt: '猫' } } },
  { kind: 'quiz', quiz: { reading: 'feeder-とり', prompt: '鳥', choices: [] } },
  { kind: 'dailyComplete' },
  { kind: 'quiz', quiz: { audioText: 'feeder-魚', prompt: '魚', choices: [] } },
  { kind: 'quiz', quiz: { audioText: 'feeder-本', prompt: '本', choices: [] } },
];

beforeEach(() => {
  fetchCalls = [];
});

describe('prefetchUpcomingKanjiKombatAudio', () => {
  it('prefetches audio for the first five prompts, skipping non-audio kinds', async () => {
    prefetchUpcomingKanjiKombatAudio(kkState(sixPromptBuffer));
    await waitFor(() => linePosts('feeder-').length === 4, 'four prefetch posts');
    await tick();
    assert.deepEqual(
      linePosts('feeder-').map(body => body.text),
      ['feeder-犬', 'feeder-ねこ', 'feeder-とり', 'feeder-魚']
    );
    assert.ok(linePosts('feeder-').every(body => body.speakerId === 13));
  });

  it('does not re-request already cached prompts on repeat calls', async () => {
    prefetchUpcomingKanjiKombatAudio(kkState(sixPromptBuffer));
    await tick();
    assert.equal(linePosts('feeder-').length, 0);
  });

  it('handles states with no prompt buffer', () => {
    prefetchUpcomingKanjiKombatAudio(null);
    prefetchUpcomingKanjiKombatAudio({ run: {} });
    assert.equal(fetchCalls.length, 0);
  });

  it('warms the cache whenever KK state passes through a render', async () => {
    renderKanjiKombatAction(kkState([
      { kind: 'quiz', quiz: { audioText: 'hook-花', prompt: '花', choices: [] } },
    ]));
    await waitFor(() => linePosts('hook-').length === 1, 'hook-triggered prefetch');
  });
});
```

Note the second test: the first test already cached all four `feeder-*` texts (module cache persists within the file), so a repeat call must produce **zero** new posts. Test order within the describe is guaranteed by `node:test`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/unit/ui/kanji-kombat-audio-prefetch.test.js
```

Expected: FAIL — `prefetchUpcomingKanjiKombatAudio` is not exported (SyntaxError on import).

- [ ] **Step 3: Implement the feeder and hook**

In `public/js/ui/kanji-kombat.js`, change line 3 from:

```js
import { getSpeakerId, playDialogueLineAudio } from '../tts.js';
```

to:

```js
import { getSpeakerId, playDialogueLineAudio, prefetchDialogueLine } from '../tts.js';
```

Add directly above `function kanjiKombatAudioText(card)` (line ~637):

```js
export const KANJI_KOMBAT_AUDIO_PREFETCH_DEPTH = 5;

/**
 * Warm the TTS cache for the next few buffered prompts so answer/intro audio
 * starts instantly. Safe to call on every state pass — prefetchDialogueLine
 * dedupes by text+speaker.
 */
export function prefetchUpcomingKanjiKombatAudio(state) {
  const buffer = state?.run?.kanjiKombat?.promptBuffer;
  if (!Array.isArray(buffer)) return;
  const speakerId = getSpeakerId();
  for (const prompt of buffer.slice(0, KANJI_KOMBAT_AUDIO_PREFETCH_DEPTH)) {
    const card = prompt?.kind === 'quiz'
      ? prompt.quiz
      : prompt?.kind === 'intro'
        ? prompt.intro?.card
        : null;
    const text = kanjiKombatAudioText(card);
    if (text) prefetchDialogueLine({ text, speakerId });
  }
}
```

(`kanjiKombatAudioText(null)` returns `''`, so completion prompts fall out naturally.)

At the end of `rememberKanjiKombatState(state)` (after the `pendingStreakRewards` loop, before the closing brace at line ~254), add:

```js
  prefetchUpcomingKanjiKombatAudio(state);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --check public/js/ui/kanji-kombat.js && node --test tests/unit/ui/kanji-kombat-audio-prefetch.test.js
```

Expected: syntax OK; all 4 tests PASS.

- [ ] **Step 5: Run the existing KK UI suite**

```bash
node --test tests/unit/ui/kanji-kombat-ui.test.js
```

Expected: PASS. (Its renders now fire prefetch attempts; without a fetch stub those reject against relative URLs, which the prefetch chain catches silently — no unhandled rejections, no assertion changes.)

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/kanji-kombat.js tests/unit/ui/kanji-kombat-audio-prefetch.test.js
/usr/bin/git commit -m "feat: prefetch next 5 kanji kombat prompts' audio from promptBuffer"
```

---

### Task 4: Full verification, playtest, merge

**Files:**
- No new code. Runs suites, manual verification, branch integration.

**Interfaces:**
- Consumes: everything above.
- Produces: feature merged to `dev`, `master` advanced, worktree removed.

- [ ] **Step 1: Full test suite**

```bash
npm test
```

Expected: Tier 1 + Tier 2 all PASS, coverage ratchet satisfied.

- [ ] **Step 2: Manual playtest (ask the user first)**

Ask the user before launching Playwright (repo rule — Chrome session conflicts). If approved: `npm run dev`, log in as `devtester`/`test1234`, enter Kanji Kombat, and verify:
- Tapping an answer plays the word with no perceptible delay.
- Network tab shows `/api/tts/dialogue-line` POSTs arriving **ahead of** taps, one at a time (5 near session start).
- Intro cards speak immediately on reveal.
- Muting in settings stops the prefetch POSTs.

If the user declines the Playwright session, ask them to playtest on the dev deployment after merge and report; the unit suites remain the merge gate.

- [ ] **Step 3: Merge via finishing-a-development-branch**

Use the superpowers:finishing-a-development-branch skill. For this repo that means:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/kk-tts-audio-prefetch
/usr/bin/git push origin dev
/usr/bin/git push origin dev:master
/usr/bin/git worktree remove ../koto-wt-kk-tts-prefetch
/usr/bin/git branch -d feature/kk-tts-audio-prefetch
```

Expected: `dev` and `master` point at the same SHA; worktree gone. (User preference: push directly, no PR, for low-risk changes like this.)
