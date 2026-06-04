import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_COLUMNS,
  applyReviewedKeywords,
  buildReviewRows,
  csvEscape,
  parseCsv,
  rowsToCsv,
  validateReviewedRows,
} from '../../../scripts/lib/kanji-keyword-review.mjs';
import { buildSliceManifests } from '../../../scripts/build-kanji-keyword-review-csv.mjs';

describe('kanji keyword review helpers', () => {
  it('escapes plain, comma, quoted, and newline fields', () => {
    assert.equal(csvEscape('plain'), 'plain');
    assert.equal(csvEscape('comma,value'), '"comma,value"');
    assert.equal(csvEscape('say "word"'), '"say ""word"""');
    assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  });

  it('round-trips review rows through CSV in REVIEW_COLUMNS order', () => {
    const rows = [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person, "human"',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: 'keep\nexisting',
        jpdbStatus: 'matched',
        wanikaniStatus: 'matched',
      },
      {
        rank: '2',
        kanji: '言',
        kind: 'Kyōiku (2nd grade)',
        currentPrimaryKeyword: 'say',
        jpdbPrimaryKeyword: 'word',
        wanikaniPrimaryDefinition: 'Word',
        proposedFinalKeyword: 'word',
        proposalSource: 'review',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'needs_review',
      },
    ];

    const csv = rowsToCsv(rows);
    assert.equal(csv.endsWith('\n'), true);
    assert.equal(csv.split('\n')[0], REVIEW_COLUMNS.join(','));

    const parsed = parseCsv(csv);
    assert.deepEqual(parsed, rows);
  });

  it('rejects CSV with a mismatched header', () => {
    assert.throws(
      () => parseCsv('rank,kanji,kind\n1,人,Kyōiku (1st grade)\n'),
      /REVIEW_COLUMNS/
    );
  });

  it('rejects malformed CSV quoting and ragged rows', () => {
    assert.throws(
      () => parseCsv(
        'rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus\n' +
        '1,人,Kyōiku (1st grade),"person, human'
      ),
      /unclosed quoted field/i
    );

    assert.throws(
      () => parseCsv(
        'rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus\n' +
        '1,人,Kyōiku (1st grade),wo"rd,person,Person,NO CHANGE,no_change,,matched,matched\n'
      ),
      /illegal quote placement/i
    );

    assert.throws(
      () => parseCsv(
        'rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus\n' +
        '1,人,Kyōiku (1st grade),person,person,Person,NO CHANGE,no_change,,matched,matched,extra\n'
      ),
      /extra trailing columns/i
    );

    assert.throws(
      () => parseCsv(
        'rank,kanji,kind,currentPrimaryKeyword,jpdbPrimaryKeyword,wanikaniPrimaryDefinition,proposedFinalKeyword,proposalSource,proposalNotes,jpdbStatus,wanikaniStatus\n' +
        '1,人,Kyōiku (1st grade),person,person,Person,NO CHANGE,no_change,,matched\n'
      ),
      /missing columns/i
    );
  });

  it('ignores trailing blank lines after a valid CSV', () => {
    const rows = [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'matched',
      },
    ];

    assert.deepEqual(parseCsv(`${rowsToCsv(rows)}\n\n`), rows);
    assert.deepEqual(parseCsv(`${rowsToCsv(rows).replace(/\n/g, '\r\n')}\r\n\r\n`), rows);
  });

  it('parses quoted commas, quotes, embedded CRLF, and trailing blank lines in one fixture', () => {
    const csv = [
      REVIEW_COLUMNS.join(','),
      '1,人,Kyōiku (1st grade),"person, ""human""","person","Person","NO CHANGE",review,"line 1\r\nline 2",matched,matched',
      '',
      ''
    ].join('\r\n');

    assert.deepEqual(parseCsv(csv), [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person, "human"',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'review',
        proposalNotes: 'line 1\r\nline 2',
        jpdbStatus: 'matched',
        wanikaniStatus: 'matched',
      },
    ]);
  });

  it('rejects a blank line in the middle of the CSV', () => {
    const csv = [
      REVIEW_COLUMNS.join(','),
      '1,人,Kyōiku (1st grade),person,person,Person,NO CHANGE,no_change,,matched,matched',
      '',
      '2,言,Kyōiku (2nd grade),say,word,Word,NO CHANGE,no_change,,matched,matched',
    ].join('\n');

    assert.throws(() => parseCsv(csv), /missing columns/i);
  });

  it('builds one review row per dictionary entry with lookup defaults', () => {
    const entries = [
      { frequencyRank: 1, kanji: '人', kind: 'Kyōiku (1st grade)', primaryMeaning: 'person' },
      { frequencyRank: 2, kanji: '言', kind: 'Kyōiku (2nd grade)', primaryMeaning: 'say' },
    ];
    const jpdbByKanji = new Map([
      ['人', { keyword: 'person', status: 'matched' }],
    ]);
    const wanikaniByKanji = new Map([
      ['言', { meaning: 'Person', status: 'matched' }],
    ]);

    assert.deepEqual(buildReviewRows({ entries, jpdbByKanji, wanikaniByKanji }), [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: '',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'not_checked',
      },
      {
        rank: '2',
        kanji: '言',
        kind: 'Kyōiku (2nd grade)',
        currentPrimaryKeyword: 'say',
        jpdbPrimaryKeyword: '',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: '',
        jpdbStatus: 'not_checked',
        wanikaniStatus: 'matched',
      },
    ]);
  });

  it('builds stable curation slice manifests', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      rank: index + 1,
      kanji: String(index + 1),
    }));
    const slices = buildSliceManifests(rows, 2);
    assert.deepEqual(slices.map(slice => [slice.index, slice.startRank, slice.endRank, slice.rows.length]), [
      [1, 1, 2, 2],
      [2, 3, 4, 2],
      [3, 5, 5, 1],
    ]);
  });

  it('rejects invalid slice sizes', () => {
    assert.throws(() => buildSliceManifests([{ rank: 1, kanji: '人' }], 0), /Invalid value for --slice-size/i);
    assert.throws(() => buildSliceManifests([{ rank: 1, kanji: '人' }], '2.5'), /Invalid value for --slice-size/i);
  });

  it('applies reviewed keywords only where the proposal changes', () => {
    const dictionary = {
      schemaVersion: 2,
      curationVersion: '2026-06-01',
      maintainer: 'Koto',
      entries: [
        { kanji: '人', frequencyRank: 1, kind: 'Kyōiku (1st grade)', primaryMeaning: 'person', notes: null },
        { kanji: '言', frequencyRank: 2, kind: 'Kyōiku (2nd grade)', primaryMeaning: 'say', notes: 'keep' },
      ],
    };
    const rows = [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'matched',
      },
      {
        rank: '2',
        kanji: '言',
        kind: 'Kyōiku (2nd grade)',
        currentPrimaryKeyword: 'say',
        jpdbPrimaryKeyword: 'word',
        wanikaniPrimaryDefinition: 'Word',
        proposedFinalKeyword: 'word',
        proposalSource: 'review',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'needs_review',
      },
    ];

    const originalPersonEntry = dictionary.entries[0];
    const originalSayEntry = dictionary.entries[1];
    const result = applyReviewedKeywords(dictionary, rows, { curationVersion: '2026-06-04' });

    assert.equal(result.changed.length, 1);
    assert.deepEqual(result.changed, [{ kanji: '言', from: 'say', to: 'word' }]);
    assert.equal(result.dictionary.curationVersion, '2026-06-04');
    assert.equal(result.dictionary.schemaVersion, 2);
    assert.equal(result.dictionary.maintainer, 'Koto');
    assert.equal(result.dictionary.entries[0], originalPersonEntry);
    assert.notEqual(result.dictionary.entries[1], originalSayEntry);
    assert.equal(result.dictionary.entries[1].primaryMeaning, 'word');
    assert.equal(result.dictionary.entries[1].notes, 'keep');
    assert.equal(result.dictionary.entries[0].primaryMeaning, 'person');
  });

  it('preserves the existing curation version when undefined is supplied', () => {
    const dictionary = {
      curationVersion: '2026-06-01',
      entries: [
        { kanji: '人', frequencyRank: 1, kind: 'Kyōiku (1st grade)', primaryMeaning: 'person' },
      ],
    };
    const rows = [
      {
        rank: '1',
        kanji: '人',
        kind: 'Kyōiku (1st grade)',
        currentPrimaryKeyword: 'person',
        jpdbPrimaryKeyword: 'person',
        wanikaniPrimaryDefinition: 'Person',
        proposedFinalKeyword: 'NO CHANGE',
        proposalSource: 'no_change',
        proposalNotes: '',
        jpdbStatus: 'matched',
        wanikaniStatus: 'matched',
      },
    ];

    const result = applyReviewedKeywords(dictionary, rows, { curationVersion: undefined });
    assert.equal(result.dictionary.curationVersion, '2026-06-01');
  });

  it('rejects malformed reviewed rows', () => {
    const entries = [
      { frequencyRank: 1, kanji: '人', kind: 'Kyōiku (1st grade)', primaryMeaning: 'person' },
      { frequencyRank: 2, kanji: '言', kind: 'Kyōiku (2nd grade)', primaryMeaning: 'say' },
    ];

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '2',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'word',
          proposalSource: 'review',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /Rank mismatch for 人/
    );

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '1',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'ひと',
          proposalSource: 'review',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /Japanese text/
    );

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '1',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'unknown',
          proposalSource: 'review',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /placeholder/
    );

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '1',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'person / unknown',
          proposalSource: 'review',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
        {
          rank: '2',
          kanji: '言',
          kind: 'Kyōiku (2nd grade)',
          currentPrimaryKeyword: 'say',
          jpdbPrimaryKeyword: 'word',
          wanikaniPrimaryDefinition: 'Word',
          proposedFinalKeyword: 'NO CHANGE',
          proposalSource: 'no_change',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /placeholder/
    );

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '1',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'word /',
          proposalSource: 'review',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /empty slash-separated segments/
    );

    assert.throws(
      () => validateReviewedRows(entries, [
        {
          rank: '1',
          kanji: '人',
          kind: 'Kyōiku (1st grade)',
          currentPrimaryKeyword: 'person',
          jpdbPrimaryKeyword: 'person',
          wanikaniPrimaryDefinition: 'Person',
          proposedFinalKeyword: 'NO CHANGE',
          proposalSource: 'no_change',
          proposalNotes: '',
          jpdbStatus: 'matched',
          wanikaniStatus: 'matched',
        },
      ]),
      /Missing reviewed rows/
    );
  });
});
