/**
 * Handler for word discovery rooms.
 * Fetches discovery words, simulates learning attempt.
 */
export async function handleWordDiscovery(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'wordDiscovery',
    outcome: 'started'
  });

  const wordsResult = await simCall('GET', '/api/game/discovery-words?limit=2', null, 'word discovery fetch');

  if (!wordsResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
      roomType: 'wordDiscovery',
      outcome: 'error',
      error: wordsResult.error
    });
    return { outcome: 'error' };
  }

  const words = wordsResult.data?.words ?? wordsResult.data ?? [];
  const wordList = Array.isArray(words) ? words : [];

  // Simulate player accuracy — server handles exposure tracking
  if (Math.random() < context.wordDiscoveryAccuracy) {
    await simCall('POST', '/api/game/complete-discovery', null, 'word discovery complete');
  }

  return { outcome: 'cleared', wordsOffered: wordList.length };
}
