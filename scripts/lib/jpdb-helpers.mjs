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
