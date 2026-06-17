import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichDictionaryWithClassicalRadicals,
  parseKanjidic2ClassicalRadicals,
  summarizeRadicalChanges,
} from '../../../scripts/enrich-kanji-radicals.mjs';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <character>
    <literal>海</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>泳</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>人</literal>
    <radical>
      <rad_value rad_type="classical">9</rad_value>
      <rad_value rad_type="nelson_c">11</rad_value>
    </radical>
  </character>
  <character>
    <literal>高</literal>
    <radical><rad_value rad_type="classical">189</rad_value></radical>
  </character>
</kanjidic2>`;

function stripRadicals(entry) {
  const { radicals, ...rest } = entry;
  return rest;
}

describe('kanji radical enrichment', () => {
  it('parses exactly one KANJIDIC2 classical radical per kanji', () => {
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);
    assert.equal(radicals.get('海'), 85);
    assert.equal(radicals.get('泳'), 85);
    assert.equal(radicals.get('人'), 9);
    assert.equal(radicals.get('高'), 189);
  });

  it('ignores nonconforming KANJIDIC2 entries unless Koto requests them', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
  <character>
    <literal>海</literal>
    <radical><rad_value rad_type="classical">85</rad_value></radical>
  </character>
  <character>
    <literal>欠</literal>
    <radical><rad_value rad_type="nelson_c">76</rad_value></radical>
  </character>
  <character>
    <literal>水</literal>
    <radical>
      <rad_value rad_type="classical">85</rad_value>
      <rad_value rad_type="classical">86</rad_value>
    </radical>
  </character>
</kanjidic2>`;
    const radicals = parseKanjidic2ClassicalRadicals(xml);
    assert.equal(radicals.get('海'), 85);
    assert.equal(radicals.has('欠'), false);
    assert.equal(radicals.has('水'), false);
  });

  it('adds radicals while preserving curated dictionary fields', () => {
    const dictionary = {
      schemaVersion: 2,
      curationVersion: '2026-06-05',
      maintainer: 'Koto',
      status: 'hand-curated',
      entries: [
        {
          kanji: '海',
          frequencyRank: 1,
          kind: 'Kyōiku (2nd grade)',
          primaryMeaning: 'sea',
          secondaryMeanings: ['ocean'],
          primaryReading: 'うみ',
          secondaryReadings: ['カイ'],
          examples: [{ word: '海', reading: 'うみ', meaning: 'sea', source: 'jmdict' }],
          mnemonic: 'blue horizon',
          notes: 'curated note',
        },
        {
          kanji: '人',
          frequencyRank: 2,
          kind: 'Kyōiku (1st grade)',
          primaryMeaning: 'person',
          secondaryMeanings: ['human being'],
          primaryReading: 'ひと',
          secondaryReadings: ['ジン', 'ニン'],
          examples: [],
          mnemonic: null,
          notes: null,
        },
      ],
    };
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [
      { kanji: '海', from: null, to: 85 },
      { kanji: '人', from: null, to: 9 },
    ]);
    assert.equal(result.dictionary.schemaVersion, 2);
    assert.equal(result.dictionary.curationVersion, '2026-06-05');
    assert.deepEqual(
      result.dictionary.entries.map(stripRadicals),
      dictionary.entries.map(stripRadicals)
    );
    assert.deepEqual(result.dictionary.entries.map(entry => entry.radicals), [
      { classical: 85 },
      { classical: 9 },
    ]);
  });

  it('refreshes only the classical radical when metadata already exists', () => {
    const dictionary = {
      entries: [
        {
          kanji: '海',
          primaryMeaning: 'sea',
          radicals: { classical: 1, custom: 999 },
        },
      ],
    };
    const radicals = new Map([['海', 85]]);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [{ kanji: '海', from: 1, to: 85 }]);
    assert.deepEqual(result.dictionary.entries[0], {
      kanji: '海',
      primaryMeaning: 'sea',
      radicals: { custom: 999, classical: 85 },
    });
  });

  it('resolves a Koto kanji through a known KANJIDIC2 source variant alias', () => {
    const dictionary = {
      entries: [
        {
          kanji: '髙',
          frequencyRank: 3421,
          kind: 'Hyōgai',
          primaryMeaning: 'tall / high',
          secondaryMeanings: [],
          primaryReading: 'たか',
          secondaryReadings: ['コウ'],
          examples: [{ word: '髙い', reading: 'たかい', meaning: 'tall / high', source: 'manual' }],
          mnemonic: null,
          notes: 'Variant of 高.',
        },
      ],
    };
    const radicals = parseKanjidic2ClassicalRadicals(SAMPLE_XML);

    const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

    assert.deepEqual(result.changed, [{ kanji: '髙', from: null, to: 189 }]);
    assert.equal(result.dictionary.entries[0].primaryMeaning, 'tall / high');
    assert.equal(result.dictionary.entries[0].notes, 'Variant of 高.');
    assert.deepEqual(result.dictionary.entries[0].radicals, { classical: 189 });
  });

  it('fails when a Koto dictionary kanji is missing from KANJIDIC2 radicals', () => {
    const dictionary = { entries: [{ kanji: '謎', primaryMeaning: 'mystery' }] };
    const radicals = new Map([['海', 85]]);

    assert.throws(
      () => enrichDictionaryWithClassicalRadicals(dictionary, radicals),
      /Missing KANJIDIC2 classical radical for 謎/
    );
  });

  it('summarizes radical changes without printing the dictionary', () => {
    assert.equal(summarizeRadicalChanges([]), '0 kanji radical changes');
    assert.equal(
      summarizeRadicalChanges([
        { kanji: '海', from: null, to: 85 },
        { kanji: '人', from: 1, to: 9 },
      ]),
      '2 kanji radical changes: 海: none -> 85; 人: 1 -> 9'
    );
  });
});
