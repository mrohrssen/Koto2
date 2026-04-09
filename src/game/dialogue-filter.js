/**
 * Word-gated dialogue filtering and selection.
 * Uses isEligible from token-format.js for i+1 rule.
 */
import { isEligible } from './token-format.js';

export function isLineEligible(line, knownWords) {
  return isEligible(line.tokens || [], knownWords);
}

function teachingWordCount(line, knownWords) {
  return (line.tokens || [])
    .filter(t => t.base)
    .filter(t => !knownWords.has(t.base))
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
    (line.tokens || []).filter(t => t.base).some(t => !knownWords.has(t.base) && curriculumSet.has(t.base))
  );
  const pool = teaching.length > 0 ? teaching : eligible;
  const nonRepeat = pool.filter(l => l.raw !== lastSeenText);
  const finalPool = nonRepeat.length > 0 ? nonRepeat : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function selectBark(barkPool, trigger, knownWords, options = {}) {
  const { usedThisCombat = new Set() } = options;
  const pool = barkPool[trigger];
  if (!pool || pool.length === 0) return null;
  const eligible = pool.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;
  const getContentTokens = (line) => (line.tokens || []).filter(t => t.base);
  const reinforcement = eligible.filter(line =>
    getContentTokens(line).every(t => knownWords.has(t.base))
  );
  const teachable = eligible.filter(line =>
    getContentTokens(line).some(t => !knownWords.has(t.base))
  );
  const useTeaching = teachable.length > 0 && Math.random() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);
  const nonRepeat = selectedPool.filter(l => !usedThisCombat.has(l.raw));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
