export function annotateRenderTokens(renderTokens, rawTokens, matches) {
  if (!Array.isArray(renderTokens) || !Array.isArray(matches) || matches.length === 0) {
    return renderTokens;
  }

  return renderTokens.map((token, renderIndex) => {
    const rawStart = token.rawTokenStart ?? renderIndex;
    const rawEnd = token.rawTokenEnd ?? rawStart;
    const grammarHints = matches
      .filter(match => rangesOverlap(rawStart, rawEnd, match.tokenStart, match.tokenEnd))
      .map(toHint);

    if (grammarHints.length === 0) return token;
    return { ...token, grammarHints };
  });
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function toHint(match) {
  return {
    grammarId: match.grammarId,
    title: match.title || match.grammarId,
    meaning: match.meaning || '',
    shortExplanation: match.shortExplanation || '',
    displayPattern: match.displayPattern || '',
    readingOverride: match.readingOverride || '',
    matchedText: match.matchedText || '',
    tokenStart: match.tokenStart,
    tokenEnd: match.tokenEnd,
  };
}
