import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWaniKaniKanjiSubjects,
  normalizeWaniKaniSubjects,
} from '../../../scripts/fetch-wanikani-kanji-keywords.mjs';

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
});
