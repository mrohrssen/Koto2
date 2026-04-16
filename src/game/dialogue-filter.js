import { isEligible, filterEligible, countUnknowns } from './token-format.js';

export function isLineEligible(line, knownWords) {
  return isEligible(line.tokens || [], knownWords);
}

export function filterEligibleScripts(scripts, knownWords) {
  if (scripts.length === 0) return [];
  const eligible = scripts.filter(script =>
    script.lines.every(line => isEligible(line.tokens || [], knownWords))
  );
  if (eligible.length > 0) return eligible;
  // Fallback: script with fewest total unknowns
  return [scripts.reduce((a, b) => {
    const aCount = a.lines.reduce((s, l) => s + countUnknowns(l.tokens || [], knownWords), 0);
    const bCount = b.lines.reduce((s, l) => s + countUnknowns(l.tokens || [], knownWords), 0);
    return bCount < aCount ? b : a;
  })];
}

export function selectCidScript(eligible, knownWords, seenScriptIds = []) {
  if (eligible.length === 0) return null;
  const seenSet = new Set(seenScriptIds);
  const scored = eligible.map(script => {
    const totalTeaching = script.lines.reduce(
      (sum, line) => sum + countUnknowns(line.tokens || [], knownWords), 0
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
  const eligible = filterEligible(lines, knownWords);
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
  const eligible = filterEligible(pool, knownWords);
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
