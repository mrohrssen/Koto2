import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWaniKaniKanjiSubjects,
  fetchAllWaniKaniPages,
  normalizeWaniKaniSubjects,
} from '../../../scripts/fetch-wanikani-kanji-keywords.mjs';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('wani kani kanji keyword fetchers', () => {
  it('extracts WaniKani primary kanji meanings', () => {
    const page = {
      data: [
        {
          id: 440,
          object: 'kanji',
          data_updated_at: '2026-06-01T00:00:00.000Z',
          data: {
            characters: '一',
            level: 1,
            document_url: 'https://www.wanikani.com/kanji/%E4%B8%80',
            meanings: [
              { meaning: 'One', primary: true, accepted_answer: true },
              { meaning: 'Single', primary: false, accepted_answer: false },
            ],
          },
        },
      ],
    };

    assert.deepEqual(extractWaniKaniKanjiSubjects(page), [
      {
        kanji: '一',
        meaning: 'One',
        status: 'matched',
        level: 1,
        subjectId: 440,
        dataUpdatedAt: '2026-06-01T00:00:00.000Z',
        documentUrl: 'https://www.wanikani.com/kanji/%E4%B8%80',
      },
    ]);
  });

  it('returns no primary meaning when no meaning is marked primary', () => {
    const page = {
      data: [
        {
          id: 441,
          object: 'kanji',
          data_updated_at: '2026-06-01T00:00:00.000Z',
          data: {
            characters: '二',
            level: 1,
            document_url: 'https://www.wanikani.com/kanji/%E4%BA%8C',
            meanings: [
              { meaning: 'Two', primary: false, accepted_answer: true },
              { meaning: 'Second', primary: false, accepted_answer: false },
            ],
          },
        },
      ],
    };

    assert.deepEqual(extractWaniKaniKanjiSubjects(page), [
      {
        kanji: '二',
        meaning: '',
        status: 'no_primary_meaning',
        level: 1,
        subjectId: 441,
        dataUpdatedAt: '2026-06-01T00:00:00.000Z',
        documentUrl: 'https://www.wanikani.com/kanji/%E4%BA%8C',
      },
    ]);
  });

  it('normalizes subjects against Koto entries and adds missing kanji', () => {
    const subjects = [
      {
        kanji: '一',
        meaning: 'One',
        status: 'matched',
        level: 1,
        subjectId: 440,
        dataUpdatedAt: '2026-06-01T00:00:00.000Z',
        documentUrl: 'https://www.wanikani.com/kanji/%E4%B8%80',
      },
    ];
    const entries = [
      { kanji: '一' },
      { kanji: '二' },
    ];

    const normalized = normalizeWaniKaniSubjects(subjects, entries);

    assert.equal(normalized instanceof Map, true);
    assert.deepEqual(normalized.get('一'), {
      kanji: '一',
      meaning: 'One',
      status: 'matched',
      level: 1,
      subjectId: 440,
      dataUpdatedAt: '2026-06-01T00:00:00.000Z',
      documentUrl: 'https://www.wanikani.com/kanji/%E4%B8%80',
    });
    assert.deepEqual(normalized.get('二'), {
      kanji: '二',
      meaning: '',
      status: 'missing_from_wanikani',
    });
  });

  it('rejects cross-origin pagination without leaking the token', async () => {
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          data: [],
          pages: {
            next_url: 'https://evil.example/v2/subjects?page=2',
          },
        }),
      };
    };

    await assert.rejects(
      () => fetchAllWaniKaniPages({
        token: 'secret-token',
        sleepFn: async () => {},
        baseUrl: 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false',
      }),
      error => {
        assert.match(String(error.message), /unexpected origin/i);
        assert.doesNotMatch(String(error.message), /secret-token/);
        assert.doesNotMatch(String(error.message), /Bearer secret-token/i);
        return true;
      }
    );

    assert.deepEqual(calls, ['https://api.wanikani.com/v2/subjects?types=kanji&hidden=false']);
  });

  it('scrubs tokens from response error details', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'oops secret-token Bearer secret-token and more',
      headers: {
        get: () => null,
      },
    });

    await assert.rejects(
      () => fetchAllWaniKaniPages({
        token: 'secret-token',
        sleepFn: async () => {},
        baseUrl: 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false',
      }),
      error => {
        assert.doesNotMatch(String(error.message), /secret-token/);
        assert.doesNotMatch(String(error.message), /Bearer secret-token/i);
        assert.match(String(error.message), /WaniKani API request failed/);
        return true;
      }
    );
  });

  it('eventually stops retrying after repeated 429 responses and clamps retry delay', async () => {
    let calls = 0;
    const delays = [];
    globalThis.fetch = async () => {
      calls++;
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => '',
        headers: {
          get: name => (String(name).toLowerCase() === 'retry-after' ? '0' : null),
        },
      };
    };

    await assert.rejects(
      () => fetchAllWaniKaniPages({
        token: 'secret-token',
        sleepFn: async delay => {
          delays.push(delay);
        },
        max429Retries: 2,
        minRetryDelayMs: 50,
        maxRetryDelayMs: 100,
        baseUrl: 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false',
      }),
      error => {
        assert.match(String(error.message), /rate limit/i);
        assert.doesNotMatch(String(error.message), /secret-token/);
        return true;
      }
    );

    assert.equal(calls, 3);
    assert.deepEqual(delays, [50, 50]);
  });
});
