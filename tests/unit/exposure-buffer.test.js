import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { init, record, flushNow } from '../../public/js/ui/exposure-buffer.js';

// Shared word dict — meanings now come from the live dict, not token.meaning.
const wordDict = new Map([
  ['遊ぶ', { definitions: [{ en: 'to play', primary: true }] }],
  ['犬', { definitions: [{ en: 'dog', primary: true }] }],
  ['一緒', { definitions: [{ en: 'together', primary: true }] }],
]);

function createEventTarget() {
  const listeners = new Map();

  return {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    }
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('exposure-buffer', () => {
  it('batches records into one debounced post', async () => {
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const cleanup = init({
      debounceMs: 5,
      postFn: async (words, options) => posts.push({ words, options }),
      document: doc,
      window: win,
      onlineTarget: win
    });

    record([{ surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞' }], wordDict, {});
    record([{ surface: '犬', base: '犬', pos: '名詞' }], wordDict, {});

    await wait(25);

    assert.deepEqual(posts, [{
      words: [
        { word: '遊ぶ', meaning: 'to play' },
        { word: '犬', meaning: 'dog' }
      ],
      options: { keepalive: false }
    }]);

    cleanup();
  });

  it('flushes pending entries once and leaves empty buffer as no-op', async () => {
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const cleanup = init({
      debounceMs: 1000,
      postFn: async (words, options) => posts.push({ words, options }),
      document: doc,
      window: win,
      onlineTarget: win
    });

    record([{ surface: '一緒', base: '一緒', pos: '名詞' }], wordDict, {});

    await flushNow();
    await flushNow();

    assert.deepEqual(posts, [{
      words: [{ word: '一緒', meaning: 'together' }],
      options: { keepalive: false }
    }]);

    cleanup();
  });

  it('flushes with keepalive on visibilitychange and pagehide', async () => {
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const cleanup = init({
      debounceMs: 1000,
      postFn: async (words, options) => posts.push({ words, options }),
      document: doc,
      window: win,
      onlineTarget: win
    });

    record([{ surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞' }], wordDict, {});
    doc.visibilityState = 'hidden';
    doc.dispatchEvent('visibilitychange');

    record([{ surface: '犬', base: '犬', pos: '名詞' }], wordDict, {});
    win.dispatchEvent('pagehide');

    assert.deepEqual(posts, [
      {
        words: [{ word: '遊ぶ', meaning: 'to play' }],
        options: { keepalive: true }
      },
      {
        words: [{ word: '犬', meaning: 'dog' }],
        options: { keepalive: true }
      }
    ]);

    cleanup();
  });

  it('retries a failed batch when the client comes back online', async () => {
    let attempts = 0;
    const posts = [];
    const doc = createEventTarget();
    const win = createEventTarget();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const cleanup = init({
        debounceMs: 1000,
        postFn: async (words) => {
          attempts++;
          if (attempts === 1) throw new TypeError('network down');
          posts.push(words);
        },
        document: doc,
        window: win,
        onlineTarget: win
      });

      record([{ surface: '遊ぶ', baseForm: '遊ぶ', pos: '動詞' }], wordDict, {});

      await flushNow();
      assert.equal(posts.length, 0);

      win.dispatchEvent('online');
      await wait(0);

      assert.deepEqual(posts, [[{ word: '遊ぶ', meaning: 'to play' }]]);

      cleanup();
    } finally {
      console.warn = originalWarn;
    }
  });
});
