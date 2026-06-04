import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractWaniKaniKanjiSubjects,
  fetchAllWaniKaniPages,
  runCli as runWaniKaniCli,
  normalizeWaniKaniSubjects,
} from '../../../scripts/fetch-wanikani-kanji-keywords.mjs';
import {
  extractJpdbKeywordFromHtml,
  fetchJpdbKeyword,
  runCli as runJpdbCli,
  normalizeJpdbResults,
} from '../../../scripts/fetch-jpdb-kanji-keywords.mjs';
import { getKotoKanjiEntries } from '../../../src/game/koto-kanji-dictionary.js';

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

  it('paginates same-origin pages successfully', async () => {
    const calls = [];
    globalThis.fetch = async url => {
      const nextUrl = String(url);
      calls.push(nextUrl);

      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            data: [{ id: 440 }],
            pages: {
              next_url: 'https://api.wanikani.com/v2/subjects?page=2',
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          data: [{ id: 441 }],
          pages: {
            next_url: null,
          },
        }),
      };
    };

    const pages = await fetchAllWaniKaniPages({
      token: 'secret-token',
      sleepFn: async () => {},
      baseUrl: 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false',
    });

    assert.equal(pages.length, 2);
    assert.deepEqual(calls, [
      'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false',
      'https://api.wanikani.com/v2/subjects?page=2',
    ]);
    assert.deepEqual(pages[0].data, [{ id: 440 }]);
    assert.deepEqual(pages[1].data, [{ id: 441 }]);
  });

  it('runs the cache-only CLI branch without WANIKANI_API_TOKEN', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wanikani-cache-only-'));
    const cachePath = join(tempDir, 'cache.json');
    const outPath = join(tempDir, 'out.json');
    const previousToken = process.env.WANIKANI_API_TOKEN;
    const entry = getKotoKanjiEntries()[0];
    const page = {
      data: [
        {
          id: 440,
          object: 'kanji',
          data_updated_at: '2026-06-01T00:00:00.000Z',
          data: {
            characters: entry.kanji,
            level: 1,
            document_url: `https://www.wanikani.com/kanji/${encodeURIComponent(entry.kanji)}`,
            meanings: [
              { meaning: 'One', primary: true, accepted_answer: true },
            ],
          },
        },
      ],
      pages: {
        next_url: null,
      },
    };

    await writeFile(cachePath, `${JSON.stringify([page], null, 2)}\n`);

    try {
      delete process.env.WANIKANI_API_TOKEN;
      await runWaniKaniCli(['--cache', cachePath, '--out', outPath]);

      const output = JSON.parse(await readFile(outPath, 'utf8'));
      assert.equal(output[entry.kanji].meaning, 'One');
      assert.equal(output[entry.kanji].status, 'matched');
      assert.equal(output[entry.kanji].subjectId, 440);
      assert.equal(output[entry.kanji].documentUrl, `https://www.wanikani.com/kanji/${encodeURIComponent(entry.kanji)}`);
      assert.equal(output[entry.kanji].level, 1);
    } finally {
      if (previousToken === undefined) {
        delete process.env.WANIKANI_API_TOKEN;
      } else {
        process.env.WANIKANI_API_TOKEN = previousToken;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('jpdb kanji keyword fetchers', () => {
  it('extracts the JPDB keyword block from the h6 section', () => {
    const html = '<html><body><h6>Keyword</h6><div>front side</div><h6>Info</h6></body></html>';

    assert.equal(extractJpdbKeywordFromHtml(html), 'front side');
  });

  it('returns an empty keyword when the keyword block is absent', () => {
    const html = '<html><body><h6>Info</h6><div>front side</div></body></html>';

    assert.equal(extractJpdbKeywordFromHtml(html), '');
  });

  it('does not stop at nested h6 tags inside the keyword block', () => {
    const html = '<html><body><h6>Keyword</h6><div><div class="note"><h6>Nested</h6></div><span>front side</span></div><h6>Info</h6></body></html>';

    assert.equal(extractJpdbKeywordFromHtml(html), 'front side');
  });

  it('extracts only the immediate JPDB keyword value before later metadata', () => {
    const html = `
      <html>
        <body>
          <div class="kanji-card">
            <h6>Keyword</h6>
            person
            <div class="kanji-metadata">
              <h6>Frequency</h6>
              Top 100
              <h6>Type</h6>
              Joyo
            </div>
            <div class="readings">
              <h6>Readings</h6>
              ひと / ジン
            </div>
          </div>
        </body>
      </html>
    `;

    assert.equal(extractJpdbKeywordFromHtml(html), 'person');
  });

  it('handles JPDB fetch statuses offline', async () => {
    const cases = [
      {
        kanji: '表',
        response: {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '<html><body><h6>Keyword</h6><div>front side</div><h6>Info</h6></body></html>',
        },
        expected: { keyword: 'front side', status: 'matched' },
      },
      {
        kanji: '裏',
        response: {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => '<html><body><h6>Info</h6></body></html>',
        },
        expected: { keyword: '', status: 'parse_failed' },
      },
      {
        kanji: '中',
        response: {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => '',
        },
        expected: { keyword: '', status: 'rate_limited' },
      },
      {
        kanji: '下',
        response: {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => '',
        },
        expected: { keyword: '', status: 'missing' },
      },
      {
        kanji: '外',
        response: {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => '',
        },
        expected: { keyword: '', status: 'fetch_failed', error: '500' },
      },
    ];

    for (const testCase of cases) {
      const actual = await fetchJpdbKeyword(testCase.kanji, async () => testCase.response);

      assert.equal(actual.kanji, testCase.kanji);
      assert.equal(actual.keyword, testCase.expected.keyword);
      assert.equal(actual.status, testCase.expected.status);
      assert.equal(actual.sourceUrl, `https://jpdb.io/kanji/${encodeURIComponent(testCase.kanji)}`);
      if ('error' in testCase.expected) {
        assert.equal(actual.error, testCase.expected.error);
      } else {
        assert.equal(Object.prototype.hasOwnProperty.call(actual, 'error'), false);
      }
    }
  });

  it('normalizes JPDB results against Koto entries and marks missing kanji', () => {
    const results = [
      { kanji: '一', keyword: 'one', status: 'matched', sourceUrl: 'https://jpdb.io/kanji/%E4%B8%80' },
    ];
    const entries = [
      { kanji: '一' },
      { kanji: '二' },
    ];

    const normalized = normalizeJpdbResults(results, entries);

    assert.equal(normalized instanceof Map, true);
    assert.deepEqual(normalized.get('一'), {
      kanji: '一',
      keyword: 'one',
      status: 'matched',
      sourceUrl: 'https://jpdb.io/kanji/%E4%B8%80',
    });
    assert.deepEqual(normalized.get('二'), {
      kanji: '二',
      keyword: '',
      status: 'missing',
    });
  });

  it('refetches transient cached JPDB results on a later non-refresh run', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jpdb-cache-retry-'));
    const cachePath = join(tempDir, 'cache.json');
    const entry = getKotoKanjiEntries()[0];
    const staleResult = {
      kanji: entry.kanji,
      keyword: 'stale',
      status: 'rate_limited',
      sourceUrl: `https://jpdb.io/kanji/${encodeURIComponent(entry.kanji)}`,
    };
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<html><body><h6>Keyword</h6><span>front side</span><h6>Info</h6></body></html>',
    };
    const fetchCalls = [];
    const sleepCalls = [];

    await writeFile(cachePath, `${JSON.stringify({ [entry.kanji]: staleResult }, null, 2)}\n`);

    try {
      await runJpdbCli(['--cache', cachePath, '--limit', '1'], {
        fetchFn: async url => {
          fetchCalls.push(String(url));
          return response;
        },
        sleepFn: async delay => {
          sleepCalls.push(delay);
        },
      });

      const output = JSON.parse(await readFile(cachePath, 'utf8'));
      assert.deepEqual(fetchCalls, [`https://jpdb.io/kanji/${encodeURIComponent(entry.kanji)}`]);
      assert.deepEqual(sleepCalls, [1_000]);
      assert.equal(output[entry.kanji].keyword, 'front side');
      assert.equal(output[entry.kanji].status, 'matched');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('does not let limited JPDB smoke runs cache unattempted kanji as reusable missing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jpdb-limit-cache-'));
    const cachePath = join(tempDir, 'cache.json');
    const entries = getKotoKanjiEntries();
    const firstEntry = entries[0];
    const secondEntry = entries[1];
    const fetchCalls = [];

    try {
      await runJpdbCli(['--cache', cachePath, '--limit', '1'], {
        fetchFn: async url => {
          fetchCalls.push(String(url));
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '<html><body><h6>Keyword</h6><span>first</span><h6>Info</h6></body></html>',
          };
        },
        sleepFn: async () => {},
      });

      await runJpdbCli(['--cache', cachePath], {
        fetchFn: async url => {
          fetchCalls.push(String(url));
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '<html><body><h6>Keyword</h6><span>later</span><h6>Info</h6></body></html>',
          };
        },
        sleepFn: async () => {},
      });

      const output = JSON.parse(await readFile(cachePath, 'utf8'));
      assert.deepEqual(fetchCalls.slice(0, 2), [
        `https://jpdb.io/kanji/${encodeURIComponent(firstEntry.kanji)}`,
        `https://jpdb.io/kanji/${encodeURIComponent(secondEntry.kanji)}`,
      ]);
      assert.equal(output[firstEntry.kanji].status, 'matched');
      assert.equal(output[secondEntry.kanji].status, 'matched');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('uses the 60s backoff after a rate-limited JPDB fetch', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jpdb-rate-limit-'));
    const cachePath = join(tempDir, 'cache.json');
    const entry = getKotoKanjiEntries()[0];
    const fetchCalls = [];
    const sleepCalls = [];

    try {
      await runJpdbCli(['--cache', cachePath, '--limit', '1'], {
        fetchFn: async url => {
          fetchCalls.push(String(url));
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: async () => '',
          };
        },
        sleepFn: async delay => {
          sleepCalls.push(delay);
        },
      });

      const output = JSON.parse(await readFile(cachePath, 'utf8'));
      assert.deepEqual(fetchCalls, [`https://jpdb.io/kanji/${encodeURIComponent(entry.kanji)}`]);
      assert.deepEqual(sleepCalls, [60_000]);
      assert.equal(output[entry.kanji].status, 'rate_limited');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
