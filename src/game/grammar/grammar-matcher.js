export function findGrammarMatches(tokens, { catalog = [], matchers = [] } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const catalogMap = new Map(catalog.map(point => [point.id, point]));
  const matches = [];

  for (const matcher of matchers) {
    for (let start = 0; start < tokens.length; start++) {
      const sequenceMatch = matchSequence(tokens, start, matcher.tokens);
      if (!sequenceMatch) continue;
      if (isRejected(tokens, start, matcher.reject)) continue;
      const display = matcher.display || {};
      const tokenStart = resolveDisplayToken(sequenceMatch, display.startTokenOffset ?? 0, 'start');
      const tokenEnd = resolveDisplayToken(sequenceMatch, display.endTokenOffset ?? matcher.tokens.length - 1, 'end');
      const point = catalogMap.get(matcher.grammarId) || {};
      matches.push({
        grammarId: matcher.grammarId,
        title: point.title || matcher.grammarId,
        meaning: point.meaning || '',
        shortExplanation: point.shortExplanation || '',
        displayPattern: point.displayPattern || '',
        readingOverride: point.readingOverride || '',
        matchedText: tokens.slice(tokenStart, tokenEnd + 1).map(t => t.surface || '').join(''),
        tokenStart,
        tokenEnd,
        priority: matcher.priority || 0,
        matcherType: matcher.type || 'token-sequence',
      });
    }
  }

  return resolveOverlaps(matches);
}

function matchSequence(tokens, start, specs) {
  return matchSequenceFrom(tokens, start, specs, 0, start, [], []);
}

function matchSequenceFrom(tokens, start, specs, specIndex, tokenIndex, specStarts, specEnds) {
  if (specIndex >= specs.length) {
    return { specStarts, specEnds, tokenStart: start, tokenEnd: tokenIndex - 1 };
  }

  const spec = specs[specIndex];
  if (spec.gap) {
    const min = spec.gap.min ?? 0;
    const max = spec.gap.max ?? min;
    for (let width = min; width <= max && tokenIndex + width <= tokens.length; width++) {
      const nextStarts = [...specStarts];
      const nextEnds = [...specEnds];
      nextStarts[specIndex] = tokenIndex;
      nextEnds[specIndex] = tokenIndex + width - 1;
      const result = matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex + width, nextStarts, nextEnds);
      if (result) return result;
    }
    return null;
  }

  if (spec.optional) {
    if (tokenMatches(tokens[tokenIndex], spec, tokens, start)) {
      const nextStarts = [...specStarts];
      const nextEnds = [...specEnds];
      nextStarts[specIndex] = tokenIndex;
      nextEnds[specIndex] = tokenIndex;
      const consumed = matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex + 1, nextStarts, nextEnds);
      if (consumed) return consumed;
    }
    return matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex, [...specStarts], [...specEnds]);
  }

  if (!tokenMatches(tokens[tokenIndex], spec, tokens, start)) return null;
  const nextStarts = [...specStarts];
  const nextEnds = [...specEnds];
  nextStarts[specIndex] = tokenIndex;
  nextEnds[specIndex] = tokenIndex;
  return matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex + 1, nextStarts, nextEnds);
}

function resolveDisplayToken(sequenceMatch, specOffset, edge) {
  const positions = edge === 'start' ? sequenceMatch.specStarts : sequenceMatch.specEnds;
  if (positions[specOffset] != null) return positions[specOffset];
  return edge === 'start' ? sequenceMatch.tokenStart : sequenceMatch.tokenEnd;
}

function tokenMatches(token, spec, tokens = [], start = 0) {
  if (!token) return false;
  for (const [key, expected] of Object.entries(spec)) {
    if (key === 'offset') continue;
    if (key === 'optional') continue;
    if (key === 'gap') continue;
    if (key === 'sameBaseFormAsOffset') {
      if (token.baseForm !== tokens[start + expected]?.baseForm) return false;
      continue;
    }
    if (key === 'surfaceOneOf') {
      if (!expected.includes(token.surface)) return false;
      continue;
    }
    if (key === 'baseFormOneOf') {
      if (!expected.includes(token.baseForm)) return false;
      continue;
    }
    if (key === 'conjugationFormPrefix') {
      if (!String(token.conjugationForm || '').startsWith(expected)) return false;
      continue;
    }
    if (key.endsWith('OneOf')) {
      const field = key.slice(0, -5);
      if (!expected.includes(token[field])) return false;
      continue;
    }
    if (token[key] !== expected) return false;
  }
  return true;
}

function isRejected(tokens, start, rejectGroups = []) {
  return rejectGroups.some(group =>
    (group.tokens || []).every(spec => {
      const offset = spec.offset ?? 0;
      return tokenMatches(tokens[start + offset], spec, tokens, start);
    })
  );
}

function resolveOverlaps(matches) {
  const sorted = [...matches].sort(compareMatches);
  const accepted = [];
  for (const candidate of sorted) {
    const conflict = accepted.some(existing => overlaps(existing, candidate) && !isSharedExactSpan(existing, candidate));
    if (!conflict) accepted.push(candidate);
  }
  return accepted.sort((a, b) =>
    a.tokenStart - b.tokenStart || a.tokenEnd - b.tokenEnd || a.grammarId.localeCompare(b.grammarId)
  );
}

function compareMatches(a, b) {
  return (b.priority - a.priority)
    || (spanLength(b) - spanLength(a))
    || a.grammarId.localeCompare(b.grammarId);
}

function spanLength(match) {
  return match.tokenEnd - match.tokenStart + 1;
}

function overlaps(a, b) {
  return a.tokenStart <= b.tokenEnd && b.tokenStart <= a.tokenEnd;
}

function isSharedExactSpan(a, b) {
  return a.tokenStart === b.tokenStart
    && a.tokenEnd === b.tokenEnd
    && a.priority === b.priority;
}
