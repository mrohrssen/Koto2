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
