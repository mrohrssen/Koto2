/**
 * Word-gated dialogue filtering and selection.
 * Implements i+1 rule: each sentence may contain at most 1 unknown word.
 */

const PUNCT_POS = new Set(['記号', '補助記号', '空白']);
const SENTENCE_ENDERS = new Set(['。', '！', '？', '!', '?']);

function isPunctuation(token) {
  return PUNCT_POS.has(token.pos) || /^[\p{P}\p{S}\s]+$/u.test(token.surface);
}

function splitIntoSentences(tokens) {
  const sentences = [];
  let current = [];
  for (const token of tokens) {
    current.push(token);
    if (SENTENCE_ENDERS.has(token.surface)) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) sentences.push(current);
  return sentences.length > 0 ? sentences : [tokens];
}

export function isLineEligible(line, knownWords) {
  const tokens = line._tokens || [];
  const sentences = splitIntoSentences(tokens);
  return sentences.every(sentenceTokens => {
    const unknowns = sentenceTokens
      .filter(t => !isPunctuation(t))
      .filter(t => !knownWords.has(t.baseForm));
    return unknowns.length <= 1;
  });
}

function teachingWordCount(line, knownWords) {
  const tokens = line._tokens || [];
  return tokens
    .filter(t => !isPunctuation(t))
    .filter(t => !knownWords.has(t.baseForm))
    .length;
}

export function filterEligibleScripts(scripts, knownWords) {
  return scripts.filter(script =>
    script.lines.every(line => isLineEligible(line, knownWords))
  );
}

export function selectCidScript(eligible, knownWords, seenScriptIds = []) {
  if (eligible.length === 0) return null;
  const seenSet = new Set(seenScriptIds);
  const scored = eligible.map(script => {
    const totalTeaching = script.lines.reduce(
      (sum, line) => sum + teachingWordCount(line, knownWords), 0
    );
    const wasSeen = seenSet.has(script.id);
    const seenIndex = seenScriptIds.indexOf(script.id);
    return { script, totalTeaching, wasSeen, seenIndex };
  });
  scored.sort((a, b) => {
    if (a.wasSeen !== b.wasSeen) return a.wasSeen ? 1 : -1;
    if (a.totalTeaching !== b.totalTeaching) return b.totalTeaching - a.totalTeaching;
    if (a.wasSeen && b.wasSeen) return a.seenIndex - b.seenIndex;
    return 0;
  });
  return scored[0].script;
}

export function selectNpcLine(lines, knownWords, options = {}) {
  const { lastSeenText, curriculumWords = [] } = options;
  const eligible = lines.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;
  const curriculumSet = new Set(curriculumWords);
  const teaching = eligible.filter(line =>
    (line._tokens || []).filter(t => !isPunctuation(t)).some(t => !knownWords.has(t.baseForm) && curriculumSet.has(t.baseForm))
  );
  const pool = teaching.length > 0 ? teaching : eligible;
  const nonRepeat = pool.filter(l => l.text !== lastSeenText);
  const finalPool = nonRepeat.length > 0 ? nonRepeat : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function selectBark(barkPool, trigger, knownWords, options = {}) {
  const { usedThisCombat = new Set() } = options;
  const pool = barkPool[trigger];
  if (!pool || pool.length === 0) return null;
  const eligible = pool.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;
  const getContentTokens = (line) => (line._tokens || []).filter(t => !isPunctuation(t));
  const reinforcement = eligible.filter(line =>
    getContentTokens(line).every(t => knownWords.has(t.baseForm))
  );
  const teachable = eligible.filter(line =>
    getContentTokens(line).some(t => !knownWords.has(t.baseForm))
  );
  const useTeaching = teachable.length > 0 && Math.random() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);
  const nonRepeat = selectedPool.filter(l => !usedThisCombat.has(l.text));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
