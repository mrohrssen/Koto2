# Bunpro Grammar Quiz Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static quiz room questions with live Bunpro grammar reviews using multiple choice format.

**Architecture:** Create a Bunpro API client module that fetches due grammar questions, transforms them to quiz format (correct answer + 3 wrong answers), and submits results back to Bunpro. Falls back to static questions if Bunpro unavailable.

**Tech Stack:** Node.js ES modules, Express.js, fetch API

---

## Task 1: Create Bunpro API Client

**Files:**
- Create: `src/bunpro.js`

**Step 1: Create the module with rate limiting and circuit breaker**

```javascript
/**
 * Bunpro API Integration Module
 *
 * Fetches grammar review questions from Bunpro and submits results.
 * Uses same rate limiting pattern as jpdb.js.
 */

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
    console.log('[Bunpro] Circuit breaker cooldown expired, testing...');
    return true;
  }
  return false;
}

function tripCircuitBreaker(statusCode) {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.isOpen = true;
  circuitBreaker.cooldownUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  console.log(`[Bunpro] Circuit breaker tripped: status=${statusCode}, failures=${circuitBreaker.consecutiveFailures}`);
}

function onSuccessfulRequest() {
  if (circuitBreaker.isOpen) {
    console.log('[Bunpro] Circuit breaker reset on success');
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
    console.log('[Bunpro] No API token provided');
    return null;
  }

  console.log('[Bunpro] Fetching quiz question...');

  try {
    const response = await bunproFetch(`${BUNPRO_API_BASE}/api/frontend/reviews/quiz_index`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Token token=${apiToken}`
      }
    });

    if (!response.ok) {
      console.log(`[Bunpro] quiz_index failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log('[Bunpro] Got quiz_index response:', {
      sessionId: data.review_session_id,
      pendingCount: data.pending_attempt?.length || 0
    });

    // Extract first pending review
    const pending = data.pending_attempt?.[0];
    if (!pending) {
      console.log('[Bunpro] No pending reviews');
      return null;
    }

    const reviewId = pending.data?.id;
    const sessionId = data.review_session_id;
    const studyQuestionId = pending.data?.relationships?.study_question?.data?.id;

    // Find the study question in included
    const studyQuestion = data.included?.find(
      item => item.type === 'study_question' && item.id === studyQuestionId
    );

    if (!studyQuestion) {
      console.log('[Bunpro] Study question not found in included');
      return null;
    }

    const attrs = studyQuestion.attributes;
    const correctAnswer = attrs.answer;
    const wrongAnswers = Object.keys(attrs.wrong_answers || {}).slice(0, 3);

    // Need at least 1 wrong answer for multiple choice
    if (wrongAnswers.length === 0) {
      console.log('[Bunpro] No wrong answers available');
      return null;
    }

    // Build options: correct + wrong answers, then shuffle
    const options = [correctAnswer, ...wrongAnswers];
    shuffleArray(options);
    const correctIndex = options.indexOf(correctAnswer);

    const question = {
      id: `bunpro-${reviewId}`,
      type: 'bunpro-grammar',
      question: stripHtml(attrs.content || ''),
      translation: attrs.translation || '',
      options,
      correctIndex,
      reviewId,
      sessionId,
      audioUrl: attrs.female_audio_url || attrs.male_audio_url || null
    };

    console.log('[Bunpro] Transformed question:', {
      question: question.question.substring(0, 50) + '...',
      options: question.options,
      correctIndex: question.correctIndex
    });

    return question;

  } catch (error) {
    console.log('[Bunpro] Error fetching question:', error.message);
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
    console.log('[Bunpro] Missing params for submitAnswer:', { apiToken: !!apiToken, reviewId, sessionId });
    return false;
  }

  console.log('[Bunpro] Submitting answer:', { reviewId, sessionId, correct });

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
      console.log(`[Bunpro] Submit failed: ${response.status}`);
      return false;
    }

    console.log('[Bunpro] Answer submitted successfully');
    return true;

  } catch (error) {
    console.log('[Bunpro] Error submitting answer:', error.message);
    return false;
  }
}
```

**Step 2: Verify syntax**

Run: `node --check src/bunpro.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add src/bunpro.js
git commit -m "feat: add Bunpro API client module"
```

---

## Task 2: Add Bunpro Token to Request Context

**Files:**
- Modify: `server.js:234-236` (body parser middleware)

**Step 1: Verify current middleware extracts API keys**

Read `server.js` around line 234 to confirm how `req.jpdbApiKey` is set.

**Step 2: Add bunproToken extraction**

In the body parser middleware (around line 234), add extraction for `bunproToken`:

```javascript
// In the JSON body parser callback, add:
if (req.body && req.body.bunproToken) {
  req.bunproToken = req.body.bunproToken;
}
```

Find the existing pattern for `jpdbApiKey` and add the same for `bunproToken`.

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: extract bunproToken from request body"
```

---

## Task 3: Update Quiz Question Endpoint

**Files:**
- Modify: `src/routes/game/run.js:297-314`

**Step 1: Import Bunpro module**

At the top of `src/routes/game/run.js`, add:

```javascript
import { getQuizQuestion as getBunproQuestion } from '../../bunpro.js';
```

**Step 2: Modify the endpoint to try Bunpro first**

Replace the `/quiz-question` handler (lines 297-314):

```javascript
  // Get a quiz question (Bunpro first, fallback to static)
  router.get('/quiz-question', async (req, res) => {
    try {
      // Try Bunpro first if token available
      const bunproToken = req.bunproToken;
      if (bunproToken) {
        console.log('[Quiz] Attempting Bunpro question...');
        const bunproQuestion = await getBunproQuestion(bunproToken);
        if (bunproQuestion) {
          console.log('[Quiz] Serving Bunpro question');
          // Don't send correctIndex to frontend
          return res.json({
            id: bunproQuestion.id,
            type: bunproQuestion.type,
            question: bunproQuestion.question,
            translation: bunproQuestion.translation,
            options: bunproQuestion.options,
            // Store these server-side for answer validation
            _bunpro: {
              reviewId: bunproQuestion.reviewId,
              sessionId: bunproQuestion.sessionId,
              correctIndex: bunproQuestion.correctIndex
            }
          });
        }
        console.log('[Quiz] Bunpro unavailable, falling back to static');
      }

      // Fallback to static questions
      const questions = loadQuizQuestions();
      const randomIndex = Math.floor(Math.random() * questions.length);
      const question = questions[randomIndex];

      res.json({
        id: question.id,
        type: question.type,
        question: question.question,
        options: question.options
      });
    } catch (error) {
      console.error('[Quiz] Error:', error.message);
      res.status(500).json({ error: 'Failed to load quiz question' });
    }
  });
```

**Step 3: Verify syntax**

Run: `node --check src/routes/game/run.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: quiz endpoint tries Bunpro first with fallback"
```

---

## Task 4: Update Quiz Answer Endpoint

**Files:**
- Modify: `src/routes/game/run.js:316-340`

**Step 1: Import submitAnswer**

Update the import at top of file:

```javascript
import { getQuizQuestion as getBunproQuestion, submitAnswer as submitBunproAnswer } from '../../bunpro.js';
```

**Step 2: Modify the answer endpoint to handle Bunpro questions**

Replace the `/quiz-answer` handler (lines 316-340):

```javascript
  // Validate quiz answer
  router.post('/quiz-answer', async (req, res) => {
    try {
      const { questionId, selectedIndex, _bunpro } = req.body;
      if (questionId === undefined || selectedIndex === undefined) {
        return res.status(400).json({ error: 'questionId and selectedIndex required' });
      }

      // Handle Bunpro question
      if (questionId.startsWith('bunpro-') && _bunpro) {
        const correct = selectedIndex === _bunpro.correctIndex;
        console.log('[Quiz] Bunpro answer:', { questionId, selectedIndex, correctIndex: _bunpro.correctIndex, correct });

        // Submit to Bunpro (fire and forget - don't block response)
        const bunproToken = req.bunproToken;
        if (bunproToken) {
          submitBunproAnswer(bunproToken, _bunpro.reviewId, _bunpro.sessionId, correct)
            .then(success => console.log('[Quiz] Bunpro submission:', success ? 'success' : 'failed'))
            .catch(err => console.log('[Quiz] Bunpro submission error:', err.message));
        }

        return res.json({
          correct,
          correctIndex: _bunpro.correctIndex,
          response: correct
            ? 'その通りだ。文法をよく理解しているな。'
            : '残念だ。もう一度復習しよう。'
        });
      }

      // Handle static question
      const questions = loadQuizQuestions();
      const question = questions.find(q => q.id === questionId);

      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const correct = selectedIndex === question.correctIndex;
      res.json({
        correct,
        correctIndex: question.correctIndex,
        response: correct ? question.correctResponse : question.wrongResponse
      });
    } catch (error) {
      console.error('[Quiz] Answer error:', error.message);
      res.status(500).json({ error: 'Failed to validate answer' });
    }
  });
```

**Step 3: Verify syntax**

Run: `node --check src/routes/game/run.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: quiz answer endpoint handles Bunpro and submits results"
```

---

## Task 5: Update Frontend API to Pass Bunpro Data

**Files:**
- Modify: `public/js/api.js:279-303`

**Step 1: Update getQuizQuestion to store Bunpro metadata**

```javascript
/** Get a quiz question (may be from Bunpro or static) */
async function getQuizQuestion() {
  try {
    const bunproToken = localStorage.getItem('bunproToken');
    const response = await fetch('/api/game/quiz-question', {
      method: 'GET',
      headers: {
        ...getAuthHeaders(),
        ...(bunproToken ? { 'X-Bunpro-Token': bunproToken } : {})
      }
    });
    const data = await response.json();

    // Store Bunpro metadata for answer submission
    if (data._bunpro) {
      data._bunproMeta = data._bunpro;
      delete data._bunpro; // Don't expose to UI
    }

    console.log('[API] Quiz question:', { id: data.id, type: data.type, hasBunpro: !!data._bunproMeta });
    return data;
  } catch (error) {
    logger.error('[API] Failed to get quiz question:', error.message);
    return { error: 'Network error' };
  }
}
```

**Step 2: Update submitQuizAnswer to include Bunpro metadata**

```javascript
/** Submit quiz answer for validation */
async function submitQuizAnswer(questionId, selectedIndex, bunproMeta = null) {
  try {
    const bunproToken = localStorage.getItem('bunproToken');
    const response = await fetch('/api/game/quiz-answer', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        ...(bunproToken ? { 'X-Bunpro-Token': bunproToken } : {})
      },
      body: JSON.stringify({
        questionId,
        selectedIndex,
        ...(bunproMeta ? { _bunpro: bunproMeta } : {})
      })
    });
    const data = await response.json();
    console.log('[API] Quiz answer result:', { correct: data.correct });
    return data;
  } catch (error) {
    logger.error('[API] Failed to submit quiz answer:', error.message);
    return { error: 'Network error' };
  }
}
```

**Step 3: Verify syntax**

Run in browser console or: `node --check public/js/api.js` (may need adjustment for ES modules)

**Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat: frontend API passes Bunpro token and metadata"
```

---

## Task 6: Update Server to Extract Bunpro Token from Header

**Files:**
- Modify: `server.js` (middleware section)

**Step 1: Add header extraction for Bunpro token**

Find the middleware section and add extraction for `X-Bunpro-Token` header:

```javascript
// Add this middleware before routes (around line 220)
app.use((req, res, next) => {
  // Extract Bunpro token from header
  const bunproToken = req.headers['x-bunpro-token'];
  if (bunproToken) {
    req.bunproToken = bunproToken;
  }
  next();
});
```

**Step 2: Commit**

```bash
git add server.js
git commit -m "feat: extract Bunpro token from X-Bunpro-Token header"
```

---

## Task 7: Update Frontend Quiz UI to Pass Metadata

**Files:**
- Modify: `public/js/ui/exploration.js:468` (submitQuizAnswer call)

**Step 1: Pass _bunproMeta when submitting answer**

Find the quiz answer click handler (around line 468) and update:

```javascript
// Change from:
const result = await apiSubmitQuizAnswer(question.id, selectedIndex);

// To:
const result = await apiSubmitQuizAnswer(question.id, selectedIndex, question._bunproMeta);
```

**Step 2: Optionally show translation hint for Bunpro questions**

After showing the question in narration (around line 441), add translation hint:

```javascript
// Show question in narration box
let questionText = question.question;
if (question.translation) {
  questionText += `\n\n(${question.translation})`;
}
sceneModule.showNarration(questionText, { speaker: 'Quiz Master', persistent: true });
```

**Step 3: Verify syntax**

Load the game in browser, check console for errors.

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: quiz UI passes Bunpro metadata and shows translation"
```

---

## Task 8: Manual Integration Test

**Files:** None (testing only)

**Step 1: Set Bunpro token in localStorage**

In browser console:
```javascript
localStorage.setItem('bunproToken', 'YOUR_TOKEN_HERE');
```

**Step 2: Start a run and navigate to a quiz room**

Use debug mode to queue a quiz room:
```javascript
// In browser console after enabling debug mode
window.gameState // check current state
```

**Step 3: Verify console logs**

Check browser console for:
- `[Bunpro] Fetching quiz question...`
- `[Bunpro] Got quiz_index response:`
- `[Bunpro] Transformed question:`
- `[API] Quiz question:`

Check server console for:
- `[Quiz] Attempting Bunpro question...`
- `[Quiz] Serving Bunpro question`

**Step 4: Answer the question and verify submission**

Check server console for:
- `[Quiz] Bunpro answer:`
- `[Quiz] Bunpro submission: success`

**Step 5: Verify in Bunpro**

Check bunpro.jp to confirm the review was recorded.

---

## Task 9: Run E2E Tests

**Files:** None (testing only)

**Step 1: Run quiz E2E tests**

```bash
./scripts/e2e-test.sh specs/rooms/quiz
```

Expected: All tests pass (they use static questions since no Bunpro token)

**Step 2: Run full E2E suite**

```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 tests pass

**Step 3: Commit if any test fixes needed**

---

## Task 10: Final Commit and Cleanup

**Step 1: Verify all changes**

```bash
git status
git diff --staged
```

**Step 2: Run syntax checks on all modified files**

```bash
node --check src/bunpro.js
node --check src/routes/game/run.js
node --check server.js
```

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "feat: complete Bunpro grammar quiz integration"
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/bunpro.js` | NEW - Bunpro API client |
| `src/routes/game/run.js` | Modified - quiz endpoints use Bunpro |
| `server.js` | Modified - extract Bunpro token from header |
| `public/js/api.js` | Modified - pass Bunpro token and metadata |
| `public/js/ui/exploration.js` | Modified - pass metadata, show translation |

## Fallback Behavior

- No Bunpro token → static questions
- Bunpro API error → static questions
- No due reviews → static questions
- Answer submission fails → still give reward (logged)
