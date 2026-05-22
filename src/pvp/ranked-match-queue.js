export const SEARCH_WINDOWS = [
  { afterMs: 0, range: 75 },
  { afterMs: 3000, range: 150 },
  { afterMs: 6000, range: 250 },
  { afterMs: 9000, range: Infinity }
];

export class RankedMatchQueue {
  constructor() {
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  enqueue(entry) {
    if (!entry?.userId || !entry?.socketId) return false;
    if (this.entries.has(entry.userId)) return false;
    this.entries.set(entry.userId, { ...entry });
    return true;
  }

  dequeue(userId) {
    return this.entries.delete(userId);
  }

  removeBySocket(socketId) {
    for (const [userId, entry] of this.entries) {
      if (entry.socketId === socketId) {
        this.entries.delete(userId);
        return true;
      }
    }
    return false;
  }

  hasUser(userId) {
    return this.entries.has(userId);
  }

  getSearchRange(entry, now = Date.now()) {
    const elapsedMs = Math.max(0, now - entry.enqueuedAt);
    let range = SEARCH_WINDOWS[0].range;
    for (const window of SEARCH_WINDOWS) {
      if (elapsedMs >= window.afterMs) range = window.range;
    }
    return {
      elapsedMs,
      range,
      min: range === Infinity ? null : entry.displayRating - range,
      max: range === Infinity ? null : entry.displayRating + range
    };
  }

  findMatch(now = Date.now()) {
    const ordered = [...this.entries.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    for (const seeker of ordered) {
      const search = this.getSearchRange(seeker, now);
      let best = null;
      let bestGap = Infinity;
      for (const candidate of ordered) {
        if (candidate.userId === seeker.userId) continue;
        const gap = Math.abs(candidate.displayRating - seeker.displayRating);
        if (gap > search.range) continue;
        if (gap < bestGap) {
          best = candidate;
          bestGap = gap;
        }
      }
      if (best) {
        this.dequeue(seeker.userId);
        this.dequeue(best.userId);
        return [seeker, best];
      }
    }
    return null;
  }

  getEntries() {
    return [...this.entries.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  getBotFallbackEntries(now = Date.now()) {
    return this.getEntries().filter(entry =>
      Number.isFinite(entry.botFallbackAt) && now >= entry.botFallbackAt
    );
  }
}
