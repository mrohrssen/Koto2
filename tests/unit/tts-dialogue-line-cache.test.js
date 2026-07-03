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
