export function selectBotForRating({ targetRating, bots, activeBotIds = new Set() }) {
  const available = (bots || []).filter(bot => bot && !activeBotIds.has(bot.id));
  if (available.length === 0) return null;
  const scored = available
    .map(bot => ({ bot, gap: Math.abs((bot.displayRating || 1200) - targetRating) }))
    .sort((a, b) => a.gap - b.gap || a.bot.username.localeCompare(b.bot.username));
  const inRange = scored.filter(row => row.gap <= 200);
  return (inRange[0] || scored[0]).bot;
}

export class ActiveBotTracker {
  constructor() {
    this.botToMatch = new Map();
  }

  get activeBotIds() {
    return new Set(this.botToMatch.keys());
  }

  isActive(botId) {
    return this.botToMatch.has(botId);
  }

  markActive(botId, matchCode) {
    if (!botId || !matchCode) return;
    this.botToMatch.set(botId, matchCode);
  }

  release(botId) {
    this.botToMatch.delete(botId);
  }

  releaseByMatch(matchCode) {
    for (const [botId, code] of this.botToMatch) {
      if (code === matchCode) this.botToMatch.delete(botId);
    }
  }
}
