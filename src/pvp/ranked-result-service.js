import { normalizeRankedState, updateRankedAfterMatch, toPublicRankedSummary } from './ranked-rating.js';

function findPlayerKey(match, userId) {
  if (match.player1?.userId === userId) return 'player1';
  if (match.player2?.userId === userId) return 'player2';
  return null;
}

export function applyRankedMatchResult({
  match,
  winnerId,
  getManager,
  saveManager,
  finishedAt = new Date().toISOString()
}) {
  if (!match?.ranked || !winnerId || winnerId === 'draw') return null;
  const winnerKey = findPlayerKey(match, winnerId);
  const loserKey = winnerKey === 'player1' ? 'player2' : winnerKey === 'player2' ? 'player1' : null;
  if (!winnerKey || !loserKey || !match[loserKey]) return null;

  const winnerPlayer = match[winnerKey];
  const loserPlayer = match[loserKey];
  const winnerManager = getManager(winnerPlayer.userId);
  const loserManager = getManager(loserPlayer.userId);
  const winnerMeta = winnerManager.getMeta ? winnerManager.getMeta() : winnerManager.meta;
  const loserMeta = loserManager.getMeta ? loserManager.getMeta() : loserManager.meta;

  const beforeWinner = normalizeRankedState(
    match.rankedRatingBefore?.[winnerPlayer.userId] || winnerMeta.pvpRanked
  );
  const beforeLoser = normalizeRankedState(
    match.rankedRatingBefore?.[loserPlayer.userId] || loserMeta.pvpRanked
  );

  const update = updateRankedAfterMatch({
    winnerRanked: beforeWinner,
    loserRanked: beforeLoser,
    winnerName: winnerPlayer.username || winnerManager.player?.name || 'Winner',
    loserName: loserPlayer.username || loserManager.player?.name || 'Opponent',
    finishedAt
  });

  winnerMeta.pvpRanked = update.winner.ranked;
  loserMeta.pvpRanked = update.loser.ranked;
  saveManager(winnerPlayer.userId);
  saveManager(loserPlayer.userId);

  return {
    winner: {
      userId: winnerPlayer.userId,
      ranked: toPublicRankedSummary(winnerMeta.pvpRanked)
    },
    loser: {
      userId: loserPlayer.userId,
      ranked: toPublicRankedSummary(loserMeta.pvpRanked)
    }
  };
}

export function rankedResultForUser(result, userId) {
  if (!result) return null;
  if (result.winner.userId === userId) return result.winner.ranked;
  if (result.loser.userId === userId) return result.loser.ranked;
  return null;
}
