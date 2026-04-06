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

  // Log exposure for each word
  for (const word of wordList) {
    logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
      word: word.word ?? word.spelling ?? word,
      source: 'discovery'
    });
  }

  // Simulate player accuracy
  if (Math.random() < context.wordDiscoveryAccuracy) {
    const completeResult = await simCall('POST', '/api/game/complete-discovery', null, 'word discovery complete');

    if (completeResult.ok) {
      for (const word of wordList) {
        logEvent(context.day, context.run, context.roomIndex, 'word_learned', {
          word: word.word ?? word.spelling ?? word,
          source: 'discovery'
        });
      }
    }
  }

  return { outcome: 'cleared', wordsOffered: wordList.length };
}
