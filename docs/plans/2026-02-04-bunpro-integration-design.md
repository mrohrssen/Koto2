# Bunpro Grammar Quiz Integration

## Overview

Replace static quiz room questions with live Bunpro grammar reviews. When the player enters a quiz room, fetch due grammar points from Bunpro and present them as multiple choice questions.

## API Discovery

Bunpro's official API was deprecated but frontend endpoints remain accessible:

**Base URL:** `https://api.bunpro.jp`

**Authentication:** `Authorization: Token token={frontend_api_token}`

### Endpoints Used

1. **Get Quiz Questions**
   ```
   GET /api/frontend/reviews/quiz_index
   ```
   Returns review session with pending grammar questions.

2. **Submit Answer**
   ```
   POST /api/frontend/reviews/{review_id}/update
   Body: {
     review_session_id: number,
     correct: boolean,
     fsrs_input: null,
     deck_id: null,
     loaded_review_ids: null,
     loaded_ghost_review_ids: null,
     loaded_self_study_review_ids: null,
     only_review: null
   }
   ```

### Response Structure (quiz_index)

```javascript
{
  review_session_id: 21415284,
  pending_attempt: [{
    data: {
      id: "38918997",        // review_id for submission
      type: "review",
      attributes: { streak: 9, next_review: "...", complete: true }
    },
    relationships: {
      study_question: { data: { id: "30", type: "study_question" }}
    }
  }],
  included: [{
    id: "30",
    type: "study_question",
    attributes: {
      answer: "この",                    // Correct answer
      content: "<span class='study-area-input'>____</span>犬は私の犬です。",
      translation: "This dog is my dog.",
      nuance: "...",                     // Grammar explanation (Japanese)
      nuance_translation: "...",         // Grammar explanation (English)
      wrong_answers: {                   // Common mistakes with explanations
        "ここ": { en: "ここ means 'here'.", ... },
        "あの": { ... },
        "その": { ... }
      },
      female_audio_url: "https://...",
      male_audio_url: "https://..."
    }
  }]
}
```

## Architecture

### Data Flow

```
User enters Quiz Room
       ↓
Backend: GET /api/frontend/reviews/quiz_index
       ↓
Transform to quiz format:
  - Strip HTML from content → question text
  - Extract correct answer
  - Extract 3 wrong answers from wrong_answers
  - Shuffle options, track correctIndex
       ↓
Frontend displays multiple choice (4 options)
       ↓
User selects answer → validate locally
       ↓
Backend: POST /api/frontend/reviews/{review_id}/update
  { review_session_id, correct: true/false }
       ↓
Show result, proceed to reward selection (if correct)
```

### New Files

- `src/bunpro.js` - Bunpro API client

### Modified Files

- `src/routes/game/run.js` - Update `/quiz-question` and `/quiz-answer` endpoints
- `server.js` - Add Bunpro token to user settings
- `public/js/ui/exploration.js` - Display translation hint (optional)

## Bunpro API Client (`src/bunpro.js`)

```javascript
// Configuration
const BUNPRO_API_BASE = 'https://api.bunpro.jp';

// Rate limiting (same pattern as jpdb.js)
let lastBunproCall = 0;
const MIN_CALL_INTERVAL_MS = 500;

// Circuit breaker for API failures
let circuitBreaker = { isOpen: false, cooldownUntil: 0 };

/**
 * Get next due grammar question for quiz
 * @param {string} apiToken - Bunpro frontend API token
 * @returns {Promise<{question, options, correctIndex, reviewId, sessionId, translation, audioUrl} | null>}
 */
export async function getQuizQuestion(apiToken)

/**
 * Submit answer result to Bunpro
 * @param {string} apiToken
 * @param {string} reviewId - From pending_attempt[].data.id
 * @param {number} sessionId - From review_session_id
 * @param {boolean} correct
 */
export async function submitAnswer(apiToken, reviewId, sessionId, correct)
```

## Question Transformation

**Input (Bunpro):**
```javascript
{
  answer: "この",
  content: "<span class='study-area-input'>____</span>犬は私の犬です。",
  translation: "This dog is my dog.",
  wrong_answers: { "ここ": {...}, "あの": {...}, "その": {...} }
}
```

**Output (Game Quiz Format):**
```javascript
{
  id: "bunpro-38918997",
  type: "bunpro-grammar",
  question: "____犬は私の犬です。",
  translation: "This dog is my dog.",
  options: ["その", "この", "ここ", "あの"],  // Shuffled
  correctIndex: 1,  // Position of "この" after shuffle
  reviewId: "38918997",
  sessionId: 21415284,
  audioUrl: "https://..."
}
```

## Fallback Behavior

1. **No Bunpro token configured** → Use static `quiz-questions.json`
2. **Bunpro API fails** → Use static `quiz-questions.json`
3. **No due reviews** → Use static `quiz-questions.json`
4. **Answer submission fails** → Still give player reward (don't punish for API issues), log error

## Configuration

### User Settings

New field in user settings:
```javascript
{
  bunproToken: "f7ba067eb752e2018f85ea2374ca32f6"
}
```

Token is obtained from browser DevTools when logged into Bunpro:
1. Open bunpro.jp, log in
2. DevTools → Network → filter XHR
3. Find request with `Authorization: Token token=...` header
4. Copy the token value

## Logging

Verbose console logging for debugging:
```javascript
console.log('[Bunpro] Fetching quiz question...');
console.log('[Bunpro] Got question:', { grammarPoint, sentence, wrongAnswers });
console.log('[Bunpro] Transformed to:', { question, options, correctIndex });
console.log('[Bunpro] User selected:', selectedAnswer, 'Correct:', isCorrect);
console.log('[Bunpro] Submitting to Bunpro:', { reviewId, sessionId, correct });
console.log('[Bunpro] Submission result:', response);
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bunpro API changes without notice | Fallback to static questions, verbose logging |
| Token expires | User re-fetches from browser, clear error message |
| Rate limiting | Circuit breaker pattern, 500ms minimum between calls |
| No due reviews | Fallback to static questions |

## Implementation Tasks

1. Create `src/bunpro.js` with API client
2. Add Bunpro token to settings schema and UI
3. Modify `/quiz-question` endpoint to try Bunpro first
4. Modify `/quiz-answer` endpoint to submit to Bunpro
5. Update frontend to show translation hint
6. Add E2E test for Bunpro quiz flow (mocked)
7. Manual testing with real Bunpro account
