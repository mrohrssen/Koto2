import { logger } from './logger.js';

const BUNPRO_API_BASE = 'https://api.bunpro.jp';

// Rate limiting
let lastBunproCall = 0;
const MIN_CALL_INTERVAL_MS = 500;

// Circuit breaker
let circuitBreaker = {
  isOpen: false,
  cooldownUntil: 0,
  consecutiveFailures: 0
};

const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get circuit breaker state for monitoring
 */
export function getCircuitBreakerState() {
  return { ...circuitBreaker };
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuitBreaker() {
  circuitBreaker = {
    isOpen: false,
    cooldownUntil: 0,
    consecutiveFailures: 0
  };
}

function isCircuitBreakerClosed() {
  if (!circuitBreaker.isOpen) return true;
  if (Date.now() >= circuitBreaker.cooldownUntil) {
    logger.info('[Bunpro] Circuit breaker cooldown expired, testing...');
    return true;
  }
  return false;
}

function tripCircuitBreaker(statusCode) {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.isOpen = true;

  // Extended cooldown after multiple failures
  const cooldownMs = circuitBreaker.consecutiveFailures > 1
    ? CIRCUIT_BREAKER_EXTENDED_COOLDOWN_MS
    : CIRCUIT_BREAKER_COOLDOWN_MS;

  circuitBreaker.cooldownUntil = Date.now() + cooldownMs;
  logger.info(`[Bunpro] Circuit breaker tripped: status=${statusCode}, cooldown=${cooldownMs / 1000}s, failures=${circuitBreaker.consecutiveFailures}`);
}

function onSuccessfulRequest() {
  if (circuitBreaker.isOpen) {
    logger.info('[Bunpro] Circuit breaker reset on success');
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    circuitBreaker.cooldownUntil = 0;
  }
}

/**
 * Rate-limited fetch for Bunpro API
 */
async function bunproFetch(url, options) {
  if (!isCircuitBreakerClosed()) {
    const waitMs = circuitBreaker.cooldownUntil - Date.now();
    throw new Error(`Bunpro circuit breaker open, ${Math.ceil(waitMs / 1000)}s remaining`);
  }

  const now = Date.now();
  const timeSinceLastCall = now - lastBunproCall;
  if (timeSinceLastCall < MIN_CALL_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL_MS - timeSinceLastCall));
  }
  lastBunproCall = Date.now();

  const response = await fetch(url, options);

  if (response.status === 429 || response.status >= 500) {
    tripCircuitBreaker(response.status);
  } else if (response.ok) {
    onSuccessfulRequest();
  }

  return response;
}

/**
 * Strip HTML tags from Bunpro content
 */
function stripHtml(html) {
  return html
    .replace(/<span class=['"]study-area-input['"]>____<\/span>/g, '____')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Fetch quiz question from Bunpro
 * @param {string} apiToken - Bunpro frontend API token
 * @returns {Promise<object|null>} Quiz question or null if unavailable
 */
export async function getQuizQuestion(apiToken) {
  if (!apiToken) {
    logger.debug('[Bunpro] No API token provided');
    return null;
  }

  logger.info('[Bunpro] Fetching quiz question...');

  try {
    const response = await bunproFetch(`${BUNPRO_API_BASE}/api/frontend/reviews/quiz_index`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Token token=${apiToken}`
      }
    });

    if (!response.ok) {
      logger.info(`[Bunpro] quiz_index failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    logger.debug('[Bunpro] Got quiz_index response:', {
      sessionId: data.review_session_id,
      pendingAttemptCount: data.pending_attempt?.length || 0,
      pendingWrapupCount: data.pending_wrapup?.length || 0
    });

    // Find a question with wrong_answers (suitable for multiple choice)
    // Check pending_attempt first, then pending_wrapup
    const allPending = [...(data.pending_attempt || []), ...(data.pending_wrapup || [])];

    let selectedPending = null;
    let studyQuestion = null;

    for (const pending of allPending) {
      const studyQuestionId = pending.data?.relationships?.study_question?.data?.id;
      // Note: included is INSIDE each pending item, not at top level
      const sq = pending.included?.find(
        item => item.type === 'study_question' && item.id === studyQuestionId
      );

      if (sq && Object.keys(sq.attributes?.wrong_answers || {}).length > 0) {
        selectedPending = pending;
        studyQuestion = sq;
        break;
      }
    }

    if (!selectedPending || !studyQuestion) {
      logger.info('[Bunpro] No question with wrong_answers found');
      return null;
    }

    const reviewId = selectedPending.data?.id;
    const sessionId = data.review_session_id;
    const attrs = studyQuestion.attributes;
    const correctAnswer = attrs.answer;
    // Take up to 3 wrong answers for 4-choice quiz
    const wrongAnswers = Object.keys(attrs.wrong_answers || {}).slice(0, 3);

    logger.debug('[Bunpro] Found suitable question:', {
      reviewId,
      answer: correctAnswer,
      wrongAnswersCount: wrongAnswers.length
    });

    // Build options: correct + wrong answers, then shuffle
    const options = [correctAnswer, ...wrongAnswers];
    shuffleArray(options);
    const correctIndex = options.indexOf(correctAnswer);

    const question = {
      id: `bunpro-${reviewId}`,
      type: 'bunpro-grammar',
      question: stripHtml(attrs.content || ''),
      translation: stripHtml(attrs.translation || ''),
      options,
      correctIndex,
      reviewId,
      sessionId,
      audioUrl: attrs.female_audio_url || attrs.male_audio_url || null
    };

    logger.debug('[Bunpro] Transformed question:', {
      question: question.question.substring(0, 50) + '...',
      options: question.options,
      correctIndex: question.correctIndex
    });

    return question;

  } catch (error) {
    logger.info('[Bunpro] Error fetching question:', error.message);
    return null;
  }
}

/**
 * Submit answer result to Bunpro
 * @param {string} apiToken - Bunpro frontend API token
 * @param {string} reviewId - Review ID from question
 * @param {number} sessionId - Session ID from question
 * @param {boolean} correct - Whether the answer was correct
 */
export async function submitAnswer(apiToken, reviewId, sessionId, correct) {
  if (!apiToken || !reviewId || !sessionId) {
    logger.debug('[Bunpro] Missing params for submitAnswer:', { apiToken: !!apiToken, reviewId, sessionId });
    return false;
  }

  logger.info('[Bunpro] Submitting answer:', { reviewId, sessionId, correct });

  try {
    const response = await bunproFetch(
      `${BUNPRO_API_BASE}/api/frontend/reviews/${reviewId}/update`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Token token=${apiToken}`
        },
        body: JSON.stringify({
          review_session_id: sessionId,
          correct,
          fsrs_input: null,
          deck_id: null,
          loaded_review_ids: null,
          loaded_ghost_review_ids: null,
          loaded_self_study_review_ids: null,
          only_review: null
        })
      }
    );

    if (!response.ok) {
      logger.info(`[Bunpro] Submit failed: ${response.status}`);
      return false;
    }

    logger.info('[Bunpro] Answer submitted successfully');
    return true;

  } catch (error) {
    logger.info('[Bunpro] Error submitting answer:', error.message);
    return false;
  }
}
