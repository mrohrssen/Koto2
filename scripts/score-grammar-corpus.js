#!/usr/bin/env node
import { readFileSync } from 'fs';
import { tokenizeBatch } from '../src/tokenizer.js';
import { loadGrammarCatalog, loadGrammarMatchers } from '../src/game/grammar/grammar-loader.js';
import { findGrammarMatches } from '../src/game/grammar/grammar-matcher.js';

const REQUIRED_FIELDS = ['id', 'sentence', 'level', 'targetGrammarIds', 'expected', 'kind', 'source', 'rationale'];
const VALID_KINDS = new Set([
  'positive',
  'near-miss-negative',
  'mention-negative',
  'quote-negative',
  'punctuation-gap-negative',
  'overlap-negative',
  'lexical-negative',
  'mixed',
]);

export function validateRoundCorpus(corpus) {
  if (!Array.isArray(corpus)) throw new Error('round corpus must be an array');
  const ids = new Set();
  const sentences = new Set();
  for (const item of corpus) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('round corpus case must be an object');
    }
    for (const field of REQUIRED_FIELDS) {
      if (item[field] == null || item[field] === '') {
        throw new Error(`case ${item.id || '<missing id>'} missing ${field}`);
      }
    }
    for (const field of ['id', 'sentence', 'level', 'kind', 'source', 'rationale']) {
      if (typeof item[field] !== 'string') throw new Error(`case ${item.id || '<missing id>'} ${field} must be a string`);
    }
    if (ids.has(item.id)) throw new Error(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (sentences.has(item.sentence)) throw new Error(`duplicate sentence: ${item.sentence}`);
    sentences.add(item.sentence);
    if (!Array.isArray(item.targetGrammarIds)) throw new Error(`case ${item.id} targetGrammarIds must be an array`);
    if (!Array.isArray(item.expected)) throw new Error(`case ${item.id} expected must be an array`);
    if (!VALID_KINDS.has(item.kind)) throw new Error(`case ${item.id} invalid kind: ${item.kind}`);
  }
}

export function scoreRoundCorpus(corpus, observeIdsForSentence) {
  validateRoundCorpus(corpus);
  const failures = [];
  let correctCases = 0;
  let expectedCount = 0;
  let hitCount = 0;
  let falsePositiveCount = 0;
  let missCount = 0;

  for (const item of corpus) {
    const expected = new Set(item.expected);
    const observed = observeIdsForSentence(item.sentence);
    const observedSet = new Set(observed);
    const missed = [...expected].filter(id => !observedSet.has(id));
    const unexpected = observed.filter(id => !expected.has(id));

    expectedCount += expected.size;
    hitCount += [...expected].filter(id => observedSet.has(id)).length;
    falsePositiveCount += unexpected.length;
    missCount += missed.length;

    if (missed.length === 0 && unexpected.length === 0) {
      correctCases += 1;
    } else {
      failures.push({
        id: item.id,
        sentence: item.sentence,
        targetGrammarIds: item.targetGrammarIds,
        expected: item.expected,
        observed,
        missed,
        unexpected,
        kind: item.kind,
      });
    }
  }

  const precision = hitCount + falsePositiveCount === 0 ? 1 : hitCount / (hitCount + falsePositiveCount);
  const recall = expectedCount === 0 ? 1 : hitCount / expectedCount;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    totalCases: corpus.length,
    correctCases,
    accuracy: corpus.length === 0 ? 1 : correctCases / corpus.length,
    expectedCount,
    hitCount,
    missCount,
    falsePositiveCount,
    precision,
    recall,
    f1,
    failures,
  };
}

export function scoreCorpusWithCurrentMatcher(corpus, { level = 'N3' } = {}) {
  const catalog = loadGrammarCatalog();
  const matchers = loadGrammarMatchers();
  const enabledIds = new Set(catalog
    .filter(point => point.level === level && point.status === 'enabled')
    .map(point => point.id));
  const sentences = corpus.map(item => item.sentence);
  const tokenized = tokenizeBatch(sentences);

  return scoreRoundCorpus(corpus, sentence => {
    const index = sentences.indexOf(sentence);
    return findGrammarMatches(tokenized[index], { catalog, matchers })
      .map(match => match.grammarId)
      .filter(id => enabledIds.has(id));
  });
}

function parseArgs(argv) {
  const args = { level: 'N3', json: false, corpusPath: '' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--level') {
      args.level = argv[++index];
    } else if (arg === '--json') {
      args.json = true;
    } else if (!args.corpusPath) {
      args.corpusPath = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.corpusPath) throw new Error('usage: node scripts/score-grammar-corpus.js <corpus.json> [--level N3] [--json]');
  return args;
}

function printTextScore(score) {
  console.log(`Cases: ${score.correctCases}/${score.totalCases}`);
  console.log(`Accuracy: ${(score.accuracy * 100).toFixed(2)}%`);
  console.log(`Precision: ${(score.precision * 100).toFixed(2)}%`);
  console.log(`Recall: ${(score.recall * 100).toFixed(2)}%`);
  console.log(`F1: ${(score.f1 * 100).toFixed(2)}%`);
  console.log(`Misses: ${score.missCount}`);
  console.log(`False positives: ${score.falsePositiveCount}`);
  for (const failure of score.failures.slice(0, 25)) {
    console.log(`${failure.id}: missed [${failure.missed.join(', ')}], unexpected [${failure.unexpected.join(', ')}] ${failure.sentence}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const corpus = JSON.parse(readFileSync(args.corpusPath, 'utf-8'));
  const score = scoreCorpusWithCurrentMatcher(corpus, { level: args.level });
  if (args.json) {
    console.log(JSON.stringify(score, null, 2));
  } else {
    printTextScore(score);
  }
}
