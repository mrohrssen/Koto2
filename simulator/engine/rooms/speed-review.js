/**
 * Handler for speed review rooms.
 * Starts the review session, grades words, completes the room.
 */
const MAX_REVIEW_ITERATIONS = 20;

export async function handleSpeedReview(simCall, room, context, logEvent) {
  const roomId = room.id ?? room.roomId;

  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'speedReviewRoom',
    outcome: 'started'
  });

  // Start the speed review session
  const startResult = await simCall('POST', '/api/game/speed-review-room/start', { roomId }, 'speed review start');

  if (!startResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
      roomType: 'speedReviewRoom',
      outcome: 'error',
      error: startResult.error
    });
    return { outcome: 'error' };
  }

  let reviewed = 0;

  for (let i = 0; i < MAX_REVIEW_ITERATIONS; i++) {
    // Get next word
    const progressResult = await simCall('POST', '/api/game/speed-review-room/progress', null, `speed review progress ${i}`);

    if (!progressResult.ok) break;

    const wordData = progressResult.data;

    // Check if completed or no more words
    if (wordData?.completed || wordData?.done || !wordData?.word) break;

    const word = wordData.word;
    const grade = Math.random() < context.speedReviewAccuracy ? 'good' : 'again';

    // Submit review — server handles exposure/mastery tracking
    await simCall('POST', '/api/game/known-words/review', { word, grade }, `speed review grade ${i}`);

    reviewed++;
  }

  // Complete the room
  await simCall('POST', '/api/game/speed-review-room/complete', null, 'speed review complete');

  return { outcome: 'cleared', reviewed };
}
