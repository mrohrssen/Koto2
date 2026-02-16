// JPDB API helper functions for creature forge and other vocabulary workflows.
// Provides rate-limited, batch-aware API wrappers and pure utility functions.

const JPDB_API = 'https://jpdb.io/api/v1';

const TIERS = [
  { name: 'common', min: 1, max: 3000 },
  { name: 'uncommon', min: 3001, max: 6000 },
  { name: 'rare', min: 6001, max: 12000 },
  { name: 'epic', min: 12001, max: 20000 },
  { name: 'legendary', min: 20001, max: 30000 },
];

export function tierFromRank(rank) {
  if (rank == null) return 'rejected';
  const tier = TIERS.find(t => rank >= t.min && rank <= t.max);
  return tier ? tier.name : 'rejected';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Internal fetch helper with 429 retry ────────────────────────────

async function jpdbCall(endpoint, body, apiKey, options = {}) {
  const { rateLimitWaitMs = 60000 } = options;
  const url = `${JPDB_API}/${endpoint}`;
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  };

  const res = await fetch(url, fetchOpts);

  if (res.status === 429) {
    console.warn(`JPDB 429 rate-limited on ${endpoint}, waiting ${rateLimitWaitMs}ms before retry...`);
    await sleep(rateLimitWaitMs);
    const retry = await fetch(url, fetchOpts);
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`JPDB ${endpoint} retry failed (${retry.status}): ${text}`);
    }
    return retry.json();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JPDB ${endpoint} failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── parseBatch ──────────────────────────────────────────────────────

export async function parseBatch(texts, apiKey, options = {}) {
  const {
    tokenFields = ['vocabulary_index'],
    vocabularyFields = ['spelling', 'reading', 'vid', 'sid', 'meanings'],
    batchSize = 30,
    interBatchDelayMs = 1000,
    rateLimitWaitMs = 60000
  } = options;

  const mergedVocabulary = [];
  const mergedTokens = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    if (i > 0 && interBatchDelayMs > 0) {
      await sleep(interBatchDelayMs);
    }

    const batchTexts = texts.slice(i, i + batchSize);
    const text = batchTexts.join(' ');

    const data = await jpdbCall('parse', {
      text,
      token_fields: tokenFields,
      vocabulary_fields: vocabularyFields
    }, apiKey, { rateLimitWaitMs });

    // Offset token vocabulary_index values by the current vocabulary length
    const vocabOffset = mergedVocabulary.length;
    if (vocabOffset > 0 && data.tokens) {
      for (const sentenceTokens of data.tokens) {
        for (const token of sentenceTokens) {
          // Each token is an array where the first element is vocabulary_index
          token[0] += vocabOffset;
        }
      }
    }

    mergedVocabulary.push(...data.vocabulary);
    mergedTokens.push(...data.tokens);
  }

  return { vocabulary: mergedVocabulary, tokens: mergedTokens };
}

// ── lookupVocab ─────────────────────────────────────────────────────

export async function lookupVocab(vidSidPairs, apiKey, fields, options = {}) {
  const {
    batchSize = 500,
    interBatchDelayMs = 1000,
    rateLimitWaitMs = 60000
  } = options;

  const mergedVocabInfo = [];

  for (let i = 0; i < vidSidPairs.length; i += batchSize) {
    if (i > 0 && interBatchDelayMs > 0) {
      await sleep(interBatchDelayMs);
    }

    const batchPairs = vidSidPairs.slice(i, i + batchSize);

    const data = await jpdbCall('lookup-vocabulary', {
      list: batchPairs,
      fields
    }, apiKey, { rateLimitWaitMs });

    mergedVocabInfo.push(...data.vocabulary_info);
  }

  return { vocabulary_info: mergedVocabInfo };
}

// ── vidVerify ──────────────────────────────────────────────────────

export async function vidVerify(spelling, expectedVid, apiKey, options = {}) {
  const result = await parseBatch([spelling], apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
    batchSize: 1,
    ...options
  });

  for (const entry of result.vocabulary) {
    // vid is at index 2 in the vocabularyFields order: [spelling, reading, vid, sid]
    if (entry[2] === expectedVid) return true;
  }

  return false;
}

// ── resolveCommonForms ─────────────────────────────────────────────

export async function resolveCommonForms(words, apiKey, options = {}) {
  const {
    interBatchDelayMs = 1000,
    rateLimitWaitMs = 60000,
    ...restOpts
  } = options;
  const opts = { interBatchDelayMs, rateLimitWaitMs, ...restOpts };

  // ── Step 1: Parse input words ──────────────────────────────────
  const parseResult = await parseBatch(words, apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid', 'meanings'],
    ...opts
  });

  // Build map from each input word to its parsed entry
  const wordMap = new Map();
  for (const word of words) {
    // Try to find by spelling match first, then reading match
    let entry = parseResult.vocabulary.find(v => v[0] === word);
    if (!entry) {
      entry = parseResult.vocabulary.find(v => v[1] === word);
    }

    if (entry) {
      wordMap.set(word, {
        spelling: entry[0],
        reading: entry[1],
        vid: entry[2],
        sid: entry[3],
        meanings: entry[4] || [],
        rank: null,
        altSpellings: [],
        allForms: []
      });
    } else {
      // Words that don't parse
      wordMap.set(word, {
        spelling: word,
        reading: '',
        vid: null,
        sid: null,
        meanings: [],
        rank: null,
        altSpellings: [],
        allForms: []
      });
    }
  }

  // Collect valid parsed vid/sid pairs for Step 2
  const validWords = words.filter(w => wordMap.get(w).vid != null);
  const vidSidPairs = validWords.map(w => {
    const info = wordMap.get(w);
    return [info.vid, info.sid];
  });

  if (vidSidPairs.length === 0) {
    // Nothing parsed — return defaults
    return words.map(w => ({
      word: w,
      bestForm: w,
      reading: '',
      rank: null,
      allForms: [],
      meanings: []
    }));
  }

  // ── Step 2: Lookup alt_spellings + frequency for parsed words ──
  if (interBatchDelayMs > 0) await sleep(interBatchDelayMs);

  const lookupResult = await lookupVocab(vidSidPairs, apiKey,
    ['spelling', 'reading', 'frequency_rank', 'meanings', 'alt_spellings'], opts);

  // Store results back into wordMap
  for (let i = 0; i < validWords.length; i++) {
    const word = validWords[i];
    const info = wordMap.get(word);
    const vocabInfo = lookupResult.vocabulary_info[i];
    // Fields: [spelling, reading, frequency_rank, meanings, alt_spellings]
    info.spelling = vocabInfo[0];
    info.reading = vocabInfo[1];
    info.rank = vocabInfo[2];
    info.meanings = vocabInfo[3] || [];
    info.altSpellings = vocabInfo[4] || [];
    info.allForms = [{ spelling: vocabInfo[0], rank: vocabInfo[2] }];
  }

  // ── Step 3: Parse alt spellings, vid-verify, lookup frequencies ─
  // Collect all alt spellings and track which word they belong to
  const altEntries = []; // { word, altSpelling }
  for (const word of validWords) {
    const info = wordMap.get(word);
    for (const alt of info.altSpellings) {
      altEntries.push({ word, altSpelling: alt });
    }
  }

  if (altEntries.length === 0) {
    // No alt spellings — return with what we have
    return words.map(w => {
      const info = wordMap.get(w);
      return {
        word: w,
        bestForm: info.allForms.length > 0 ? info.allForms[0].spelling : w,
        reading: info.reading,
        rank: info.rank,
        allForms: info.allForms,
        meanings: info.meanings
      };
    });
  }

  // Parse all alt spellings
  const allAltSpellings = altEntries.map(e => e.altSpelling);
  if (interBatchDelayMs > 0) await sleep(interBatchDelayMs);

  const altParseResult = await parseBatch(allAltSpellings, apiKey, {
    vocabularyFields: ['spelling', 'reading', 'vid', 'sid'],
    ...opts
  });

  // Vid-verify: match each alt spelling to its parsed entry, check vid
  const verifiedAlts = []; // { word, altSpelling, vid, sid }
  for (const altEntry of altEntries) {
    const info = wordMap.get(altEntry.word);
    // Find parsed entry matching this alt spelling
    const parsedEntry = altParseResult.vocabulary.find(v => v[0] === altEntry.altSpelling);
    if (parsedEntry && parsedEntry[2] === info.vid) {
      verifiedAlts.push({
        word: altEntry.word,
        altSpelling: altEntry.altSpelling,
        vid: parsedEntry[2],
        sid: parsedEntry[3]
      });
    }
  }

  if (verifiedAlts.length === 0) {
    // No alts verified — return with what we have
    return words.map(w => {
      const info = wordMap.get(w);
      const best = info.allForms.length > 0
        ? info.allForms.reduce((a, b) => {
          if (a.rank == null) return b;
          if (b.rank == null) return a;
          return a.rank <= b.rank ? a : b;
        })
        : { spelling: w, rank: null };
      return {
        word: w,
        bestForm: best.spelling,
        reading: info.reading,
        rank: best.rank,
        allForms: info.allForms,
        meanings: info.meanings
      };
    });
  }

  // Lookup frequencies for verified alts
  const altVidSidPairs = verifiedAlts.map(a => [a.vid, a.sid]);
  if (interBatchDelayMs > 0) await sleep(interBatchDelayMs);

  const altLookupResult = await lookupVocab(altVidSidPairs, apiKey,
    ['spelling', 'reading', 'frequency_rank'], opts);

  // Add alt forms to word entries
  for (let i = 0; i < verifiedAlts.length; i++) {
    const alt = verifiedAlts[i];
    const info = wordMap.get(alt.word);
    const vocabInfo = altLookupResult.vocabulary_info[i];
    // Fields: [spelling, reading, frequency_rank]
    info.allForms.push({
      spelling: vocabInfo[0],
      rank: vocabInfo[2]
    });
  }

  // Build final results: pick best form (lowest rank) for each word
  return words.map(w => {
    const info = wordMap.get(w);

    if (info.allForms.length === 0) {
      return {
        word: w,
        bestForm: w,
        reading: info.reading,
        rank: null,
        allForms: [],
        meanings: info.meanings
      };
    }

    const best = info.allForms.reduce((a, b) => {
      if (a.rank == null) return b;
      if (b.rank == null) return a;
      return a.rank <= b.rank ? a : b;
    });

    return {
      word: w,
      bestForm: best.spelling,
      reading: info.reading,
      rank: best.rank,
      allForms: info.allForms,
      meanings: info.meanings
    };
  });
}
