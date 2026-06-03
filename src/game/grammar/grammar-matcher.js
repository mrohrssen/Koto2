export function findGrammarMatches(tokens, { catalog = [], matchers = [] } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const catalogMap = new Map(catalog.map(point => [point.id, point]));
  const quoteScopes = findQuoteScopes(tokens);
  const matches = [];

  for (const matcher of matchers) {
    for (let start = 0; start < tokens.length; start++) {
      const sequenceMatch = matchSequence(tokens, start, matcher.tokens);
      if (!sequenceMatch) continue;
      if (isRejected(tokens, start, matcher.reject, sequenceMatch, quoteScopes)) continue;
      const display = matcher.display || {};
      const tokenStart = resolveDisplayToken(sequenceMatch, display.startTokenOffset ?? 0, 'start');
      const tokenEnd = resolveDisplayToken(sequenceMatch, display.endTokenOffset ?? matcher.tokens.length - 1, 'end');
      const point = catalogMap.get(matcher.grammarId) || {};
      if (point.status && point.status !== 'enabled') continue;
      const match = {
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
        allowOverlap: Boolean(matcher.allowOverlap),
      };
      if (isSuppressedByMentionScope(match, tokens, quoteScopes)) continue;
      matches.push(match);
    }
  }

  return resolveOverlaps(matches);
}

const QUOTE_PAIRS = new Map([
  ['「', '」'],
  ['『', '』'],
]);
const QUOTE_OPENS = new Set(QUOTE_PAIRS.keys());
const QUOTE_CLOSES = new Set(QUOTE_PAIRS.values());
const QUOTE_REFERENCE_PARTICLES = new Set(['と', 'って']);
const QUOTE_LIMITERS = new Set(['だけ', 'のみ']);
const TEXT_MENTION_VERBS = new Set([
  '書く',
  '記す',
  '写す',
  '残す',
  '載せる',
  '読む',
  '習う',
  '調べる',
  '直す',
  '記録',
  '引用',
  '入力',
  '表示',
  'ある',
]);
const TEXT_MENTION_SURU_NOUNS = new Set(['メモ', '記録', '引用', '入力', '表示', '練習']);

function findQuoteScopes(tokens) {
  const stack = [];
  const scopes = [];
  for (let index = 0; index < tokens.length; index++) {
    const surface = tokens[index]?.surface;
    if (QUOTE_OPENS.has(surface)) {
      stack.push({ open: index, closeSurface: QUOTE_PAIRS.get(surface) });
      continue;
    }
    if (!QUOTE_CLOSES.has(surface)) continue;

    for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex--) {
      if (stack[stackIndex].closeSurface !== surface) continue;
      const [openQuote] = stack.splice(stackIndex, 1);
      const scope = { open: openQuote.open, close: index };
      scope.mentionReportVerbIndex = findMentionReportVerbIndex(tokens, scope);
      scope.isMention = scope.mentionReportVerbIndex != null
        || hasMentionNounAfterQuote(tokens, scope)
        || isTermLikeQuotedText(tokens, scope);
      scopes.push(scope);
      break;
    }
  }
  return scopes.sort((a, b) => a.open - b.open || a.close - b.close);
}

function findMentionReportVerbIndex(tokens, scope) {
  let index = firstQuoteContextTokenIndex(tokens, scope);
  const maxIndex = Math.min(tokens.length - 1, scope.close + 7);

  for (; index <= maxIndex; index++) {
    const token = tokens[index];
    if (!token) break;
    if (isSentenceBoundary(token)) break;
    if (TEXT_MENTION_VERBS.has(token.baseForm)) return index;
    if (
      TEXT_MENTION_SURU_NOUNS.has(token.baseForm || token.surface)
      && tokens[index + 1]?.baseForm === 'する'
    ) {
      return index;
    }
  }
  return null;
}

function firstQuoteContextTokenIndex(tokens, scope) {
  let index = scope.close + 1;
  if (QUOTE_REFERENCE_PARTICLES.has(tokens[index]?.surface) || tokens[index]?.surface === 'を') index += 1;
  index = skipQuoteContextSeparators(tokens, index);
  if (tokens[index]?.baseForm === 'いう' || tokens[index]?.baseForm === '言う') index += 1;
  index = skipQuoteContextSeparators(tokens, index);
  if (QUOTE_LIMITERS.has(tokens[index]?.baseForm) || QUOTE_LIMITERS.has(tokens[index]?.surface)) index += 1;
  index = skipQuoteContextSeparators(tokens, index);
  return index;
}

function skipQuoteContextSeparators(tokens, index) {
  while (tokens[index]?.pos1 === '読点') index += 1;
  return index;
}

function hasMentionNounAfterQuote(tokens, scope) {
  let index = firstQuoteContextTokenIndex(tokens, scope);
  const maxIndex = Math.min(tokens.length - 1, scope.close + 5);
  for (; index <= maxIndex; index++) {
    const token = tokens[index];
    if (!token || isSentenceBoundary(token)) break;
    if (['表現', '言葉', '形', '例文', '文法', '語', '単語'].includes(token.baseForm || token.surface)) {
      return true;
    }
  }
  return false;
}

function isTermLikeQuotedText(tokens, scope) {
  const content = tokens.slice(scope.open + 1, scope.close).filter(token => token?.pos1 !== '括弧開' && token?.pos1 !== '括弧閉');
  if (content.length === 0 || content.length > 4) return false;
  const first = content[0];
  return first.pos0 === '助詞'
    || first.pos0 === '助動詞'
    || first.pos0 === '接続詞'
    || ['と', 'で', 'に', 'から', 'まで', 'を', 'は', 'が'].includes(first.surface);
}

function isSentenceBoundary(token) {
  return token?.pos1 === '句点' || token?.pos1 === '読点';
}

function isSuppressedByMentionScope(match, tokens, quoteScopes) {
  const containingScope = findContainingQuoteScope(quoteScopes, match.tokenStart, match.tokenEnd);
  if (containingScope?.isMention) return true;
  return isMentionReportWrapperMatch(match, tokens, quoteScopes);
}

function findContainingQuoteScope(quoteScopes, tokenStart, tokenEnd) {
  let containing = null;
  for (const scope of quoteScopes) {
    if (scope.open < tokenStart && tokenEnd < scope.close) {
      if (!containing || (scope.close - scope.open) < (containing.close - containing.open)) {
        containing = scope;
      }
    }
  }
  return containing;
}

function isMentionReportWrapperMatch(match, tokens, quoteScopes) {
  for (const scope of quoteScopes) {
    if (!scope.isMention) continue;
    const reportStart = scope.mentionReportVerbIndex;
    const reportEnd = findInflectedVerbPhraseEnd(tokens, reportStart);
    if (reportStart <= match.tokenStart && match.tokenEnd <= reportEnd) return true;
  }
  return false;
}

function findInflectedVerbPhraseEnd(tokens, start) {
  let end = start;
  for (let index = start + 1; index < tokens.length && index <= start + 5; index++) {
    const token = tokens[index];
    if (token?.pos0 !== '助動詞') break;
    end = index;
  }
  return end;
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
      if (gapContainsDisallowedToken(tokens, tokenIndex, width, spec.gap.disallow)) continue;
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
    if (tokenMatches(tokens[tokenIndex], spec, tokens, start, tokenIndex)) {
      const nextStarts = [...specStarts];
      const nextEnds = [...specEnds];
      nextStarts[specIndex] = tokenIndex;
      nextEnds[specIndex] = tokenIndex;
      const consumed = matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex + 1, nextStarts, nextEnds);
      if (consumed) return consumed;
    }
    return matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex, [...specStarts], [...specEnds]);
  }

  if (!tokenMatches(tokens[tokenIndex], spec, tokens, start, tokenIndex)) return null;
  const nextStarts = [...specStarts];
  const nextEnds = [...specEnds];
  nextStarts[specIndex] = tokenIndex;
  nextEnds[specIndex] = tokenIndex;
  return matchSequenceFrom(tokens, start, specs, specIndex + 1, tokenIndex + 1, nextStarts, nextEnds);
}

function gapContainsDisallowedToken(tokens, tokenIndex, width, disallow) {
  if (!disallow) return false;
  const disallowedSpecs = Array.isArray(disallow) ? disallow : [disallow];
  for (let offset = 0; offset < width; offset++) {
    const token = tokens[tokenIndex + offset];
    if (disallowedSpecs.some(spec => tokenMatches(token, spec, tokens, tokenIndex, tokenIndex + offset))) return true;
  }
  return false;
}

function resolveDisplayToken(sequenceMatch, specOffset, edge) {
  const positions = edge === 'start' ? sequenceMatch.specStarts : sequenceMatch.specEnds;
  if (positions[specOffset] != null) return positions[specOffset];
  return edge === 'start' ? sequenceMatch.tokenStart : sequenceMatch.tokenEnd;
}

function tokenMatches(token, spec, tokens = [], start = 0, tokenIndex = start) {
  if (!token) return false;
  for (const [key, expected] of Object.entries(spec)) {
    if (key === 'offset') continue;
    if (key === 'optional') continue;
    if (key === 'gap') continue;
    if (key === 'max') continue;
    if (key === 'disallow') continue;
    if (key === 'notNext') {
      if (tokenMatches(tokens[tokenIndex + 1], expected, tokens, start, tokenIndex + 1)) return false;
      continue;
    }
    if (key === 'atStart') {
      if (Boolean(expected) && tokenIndex !== 0) return false;
      continue;
    }
    if (key === 'sameBaseFormAsOffset') {
      if (token.baseForm !== tokens[start + expected]?.baseForm) return false;
      continue;
    }
    if (key === 'surfaceOneOf') {
      if (!expected.includes(token.surface)) return false;
      continue;
    }
    if (key === 'surfacePrefix') {
      if (!String(token.surface || '').startsWith(expected)) return false;
      continue;
    }
    if (key === 'surfaceSuffix') {
      if (!String(token.surface || '').endsWith(expected)) return false;
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

function isRejected(tokens, start, rejectGroups = [], sequenceMatch = null, quoteScopes = []) {
  return rejectGroups.some(group => {
    const groupMatches = (group.tokens || []).every(spec => {
      const offset = spec.offset ?? 0;
      return tokenMatches(tokens[start + offset], spec, tokens, start, start + offset);
    })
      && (!group.previousWithin || hasPreviousTokenMatch(tokens, start, group.previousWithin));
    if (!groupMatches) return false;
    if (!isQuoteScopeRejectGroup(group)) return true;

    const quoteScope = findContainingQuoteScope(quoteScopes, start, sequenceMatch?.tokenEnd ?? start);
    return Boolean(quoteScope?.isMention);
  });
}

function hasPreviousTokenMatch(tokens, start, spec) {
  const max = spec.max ?? 1;
  for (let offset = 1; offset <= max; offset++) {
    if (tokenMatches(tokens[start - offset], spec, tokens, start, start - offset)) return true;
  }
  return false;
}

function isQuoteScopeRejectGroup(group) {
  return isQuoteOpenSpec(group.previousWithin)
    || (group.tokens || []).some(spec => isQuoteBoundarySpec(spec));
}

function isQuoteOpenSpec(spec) {
  if (!spec) return false;
  return spec.pos1 === '括弧開'
    || QUOTE_OPENS.has(spec.surface)
    || spec.surfaceOneOf?.some(surface => QUOTE_OPENS.has(surface));
}

function isQuoteBoundarySpec(spec) {
  if (!spec) return false;
  return spec.pos1 === '括弧開'
    || spec.pos1 === '括弧閉'
    || QUOTE_OPENS.has(spec.surface)
    || QUOTE_CLOSES.has(spec.surface)
    || spec.surfaceOneOf?.some(surface => QUOTE_OPENS.has(surface) || QUOTE_CLOSES.has(surface));
}

function resolveOverlaps(matches) {
  const sorted = [...matches].sort(compareMatches);
  const accepted = [];
  for (const candidate of sorted) {
    if (accepted.some(existing => isSameGrammarSpan(existing, candidate))) continue;
    const conflict = accepted.some(existing =>
      overlaps(existing, candidate)
      && !isSharedExactSpan(existing, candidate)
      && !isCrossLevelMatch(existing, candidate)
      && !existing.allowOverlap
      && !candidate.allowOverlap
    );
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
    && (a.priority === b.priority || isCrossLevelMatch(a, b));
}

function isSameGrammarSpan(a, b) {
  return a.grammarId === b.grammarId
    && a.tokenStart === b.tokenStart
    && a.tokenEnd === b.tokenEnd;
}

function isCrossLevelMatch(a, b) {
  const aLevel = grammarLevel(a.grammarId);
  const bLevel = grammarLevel(b.grammarId);
  return aLevel && bLevel && aLevel !== bLevel;
}

function grammarLevel(grammarId = '') {
  return String(grammarId).match(/^n[1-5]-/)?.[0] || '';
}
