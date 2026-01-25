# Quiz Master N5 Grammar Questions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 10 rotating N5 grammar questions to Quiz Master encounters with VN-style narration responses.

**Architecture:** JSON file stores questions on backend. Two new API endpoints serve random questions and validate answers. Frontend fetches question on room entry, submits answer, displays Quiz Master's response via narration box with click-to-continue.

**Tech Stack:** Express.js backend, vanilla JS frontend, JSON data file.

---

## Task 1: Create the Quiz Questions JSON File

**Files:**
- Create: `src/data/quiz-questions.json`

**Step 1: Create the data directory and JSON file**

```json
{
  "questions": [
    {
      "id": "q001",
      "type": "fill-blank",
      "question": "わたし＿＿学生です。",
      "options": ["は", "が", "を"],
      "correctIndex": 0,
      "correctResponse": "そうだ、「は」が正解だ。よくできたな。",
      "wrongResponse": "残念だな。正解は「は」だ。次は頑張れよ。"
    },
    {
      "id": "q002",
      "type": "fill-blank",
      "question": "りんご＿＿食べます。",
      "options": ["が", "を", "に"],
      "correctIndex": 1,
      "correctResponse": "その通りだ。「を」は目的語につけるんだ。",
      "wrongResponse": "違うぞ。「を」が正解だ。食べる物には「を」を使うんだ。"
    },
    {
      "id": "q003",
      "type": "fill-blank",
      "question": "七時＿＿起きます。",
      "options": ["で", "に", "を"],
      "correctIndex": 1,
      "correctResponse": "正解だ。時間には「に」を使う。覚えておけ。",
      "wrongResponse": "惜しいな。正解は「に」だ。時間を言うときは「に」だぞ。"
    },
    {
      "id": "q004",
      "type": "fill-blank",
      "question": "図書館＿＿本を読みます。",
      "options": ["に", "で", "へ"],
      "correctIndex": 1,
      "correctResponse": "よし、正解だ。動作の場所には「で」を使う。",
      "wrongResponse": "違うな。正解は「で」だ。何かをする場所には「で」を使うんだ。"
    },
    {
      "id": "q005",
      "type": "which-correct",
      "question": "「昨日、映画を見る」を過去形にすると？",
      "options": ["見ました", "見ます", "見ません"],
      "correctIndex": 0,
      "correctResponse": "そうだ。過去のことは「〜ました」だ。よく分かってるな。",
      "wrongResponse": "違うぞ。「見ました」が正解だ。昨日のことだから過去形だ。"
    },
    {
      "id": "q006",
      "type": "fill-blank",
      "question": "肉を食べ＿＿。",
      "options": ["ます", "ました", "ません"],
      "correctIndex": 2,
      "correctResponse": "正解だ。「〜ません」は否定の形だ。",
      "wrongResponse": "残念だ。「ません」が正解だ。食べないという意味だぞ。"
    },
    {
      "id": "q007",
      "type": "which-correct",
      "question": "「おいしい」の否定形は？",
      "options": ["おいしいない", "おいしくない", "おいしじゃない"],
      "correctIndex": 1,
      "correctResponse": "その通り。い形容詞は「い」を「くない」に変えるんだ。",
      "wrongResponse": "違うな。「おいしくない」が正解だ。「い」を取って「くない」をつけるんだ。"
    },
    {
      "id": "q008",
      "type": "fill-blank",
      "question": "きれい＿＿花ですね。",
      "options": ["い", "な", "の"],
      "correctIndex": 1,
      "correctResponse": "正解だ。な形容詞は名詞の前で「な」をつける。",
      "wrongResponse": "惜しいな。「な」が正解だ。「きれい」はな形容詞だからな。"
    },
    {
      "id": "q009",
      "type": "translation",
      "question": "「Where is the station?」は日本語で？",
      "options": ["駅はどこですか", "駅は何ですか", "駅はいつですか"],
      "correctIndex": 0,
      "correctResponse": "そうだ。場所を聞くときは「どこ」を使う。完璧だ。",
      "wrongResponse": "違うぞ。「駅はどこですか」が正解だ。「どこ」は場所を聞く言葉だ。"
    },
    {
      "id": "q010",
      "type": "which-correct",
      "question": "「これは本です」の否定形は？",
      "options": ["これは本じゃないです", "これは本くないです", "これは本ませんです"],
      "correctIndex": 0,
      "correctResponse": "よくできた。「じゃないです」が否定の形だ。",
      "wrongResponse": "残念だな。「これは本じゃないです」が正解だ。名詞の否定は「じゃないです」だぞ。"
    }
  ]
}
```

**Step 2: Verify the file was created**

Run: `node --eval "console.log(JSON.parse(require('fs').readFileSync('src/data/quiz-questions.json')).questions.length)"`
Expected: `10`

**Step 3: Commit**

```bash
git add src/data/quiz-questions.json
git commit -m "feat: add 10 N5 grammar questions for quiz master"
```

---

## Task 2: Add Backend Quiz Endpoints

**Files:**
- Modify: `src/routes/game/run.js:226-239` (after existing quiz-reward route)

**Step 1: Add the quiz-questions.json import at the top of run.js**

After line 2 (after the Router import), add:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const quizQuestionsPath = join(__dirname, '../../data/quiz-questions.json');

function loadQuizQuestions() {
  const data = JSON.parse(readFileSync(quizQuestionsPath, 'utf-8'));
  return data.questions;
}
```

**Step 2: Add GET /quiz-question endpoint**

After the existing `/quiz-reward` route (around line 239), add:

```javascript
  // Get a random quiz question
  router.get('/quiz-question', (req, res) => {
    try {
      const questions = loadQuizQuestions();
      const randomIndex = Math.floor(Math.random() * questions.length);
      const question = questions[randomIndex];

      // Don't send correctIndex to frontend (prevent cheating)
      res.json({
        id: question.id,
        type: question.type,
        question: question.question,
        options: question.options
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load quiz questions' });
    }
  });
```

**Step 3: Add POST /quiz-answer endpoint**

Immediately after the GET route, add:

```javascript
  // Validate quiz answer
  router.post('/quiz-answer', (req, res) => {
    try {
      const { questionId, selectedIndex } = req.body;
      if (!questionId || selectedIndex === undefined) {
        return res.status(400).json({ error: 'questionId and selectedIndex required' });
      }

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
      res.status(500).json({ error: 'Failed to validate answer' });
    }
  });
```

**Step 4: Verify server starts without errors**

Run: `node --check server.js && echo "Syntax OK"`
Expected: `Syntax OK`

**Step 5: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: add quiz-question and quiz-answer API endpoints"
```

---

## Task 3: Add Frontend API Functions

**Files:**
- Modify: `public/js/api.js:264-266` (after quizReward function)

**Step 1: Add getQuizQuestion function**

After the `quizReward` function (around line 266), add:

```javascript
/** Get a random quiz question */
async function getQuizQuestion() {
  try {
    const response = await fetch('/api/game/quiz-question', {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to get quiz question:', error);
    return { error: 'Network error' };
  }
}

/** Submit quiz answer for validation */
async function submitQuizAnswer(questionId, selectedIndex) {
  try {
    const response = await fetch('/api/game/quiz-answer', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ questionId, selectedIndex })
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to submit quiz answer:', error);
    return { error: 'Network error' };
  }
}
```

**Step 2: Add the functions to the exports**

Find the export block (around line 450) and add to the `// Room exploration endpoints` section:

```javascript
  getQuizQuestion,
  submitQuizAnswer,
```

**Step 3: Verify syntax**

Run: `node --check public/js/api.js && echo "Syntax OK"`
Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add getQuizQuestion and submitQuizAnswer API functions"
```

---

## Task 4: Update Exploration UI Module Initialization

**Files:**
- Modify: `public/js/ui/exploration.js:22-31` (module-level API variables)
- Modify: `public/js/ui/exploration.js:33-54` (init function)

**Step 1: Add new API function variables at module level**

After line 29 (`let apiQuizReward = null;`), add:

```javascript
let apiGetQuizQuestion = null;
let apiSubmitQuizAnswer = null;
```

**Step 2: Add the new callbacks to the init function**

In the `init` function, after line 51 (`apiQuizReward = callbacks.apiQuizReward;`), add:

```javascript
  apiGetQuizQuestion = callbacks.apiGetQuizQuestion;
  apiSubmitQuizAnswer = callbacks.apiSubmitQuizAnswer;
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/exploration.js && echo "Syntax OK"`
Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add quiz API callbacks to exploration module init"
```

---

## Task 5: Wire Up API Functions in game.js

**Files:**
- Modify: `public/game.js` (explorationUI.init call, around line 526)

**Step 1: Find the explorationUI.init call and add the new API functions**

In the `explorationUI.init` call, add after the `apiQuizReward` line:

```javascript
    apiGetQuizQuestion: api.getQuizQuestion,
    apiSubmitQuizAnswer: api.submitQuizAnswer,
```

**Step 2: Verify syntax**

Run: `node --check public/game.js && echo "Syntax OK"`
Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat: wire quiz API functions to exploration UI"
```

---

## Task 6: Implement the New Quiz Flow

**Files:**
- Modify: `public/js/ui/exploration.js:261-328` (replace renderQuiz function)

**Step 1: Replace the renderQuiz function**

Replace the entire `renderQuiz` function (lines 262-328) with:

```javascript
/** Quiz phase - question then reward selection */
export async function renderQuiz() {
  const gameState = getGameState();

  // Stage tracking: undefined = question, 'reward' = pick reward, 'failed' = wrong answer
  if (gameState._quizStage === 'reward') {
    renderQuizRewards();
    return;
  }

  if (gameState._quizStage === 'failed') {
    // Wrong answer - proceed to next room with no reward
    delete gameState._quizStage;
    delete gameState._quizQuestion;
    const proceedResult = await apiProceed();
    if (proceedResult?.state) {
      updateGameState(proceedResult.state);
      updateUI();
    }
    return;
  }

  // Fetch question if not already fetched
  if (!gameState._quizQuestion) {
    const question = await apiGetQuizQuestion();
    if (question.error) {
      sceneModule.showNarration('クイズの問題を読み込めませんでした...', { autoDismiss: 2000 });
      return;
    }
    gameState._quizQuestion = question;
  }

  const question = gameState._quizQuestion;

  // Show question in narration box (no click to continue - must select answer)
  // Build answer buttons
  const answerButtons = question.options.map((opt, idx) => `
    <div class="shrine-chip-option quiz-answer-option" data-answer-index="${idx}">
      <div class="shrine-chip-info" style="padding:0.75rem">
        <div class="shrine-chip-name" style="color:var(--accent-primary)">${opt}</div>
      </div>
    </div>
  `).join('');

  actions.setContent(`
    <h3 class="shrine-title">「${question.question}」</h3>
    <div class="shrine-chip-list quiz-answer-list">${answerButtons}</div>
  `);

  const list = document.querySelector('.quiz-answer-list');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.quiz-answer-option');
      if (!option || list.dataset.answered) return;
      list.dataset.answered = '1';

      const selectedIndex = parseInt(option.dataset.answerIndex, 10);

      // Submit answer to server
      const result = await apiSubmitQuizAnswer(question.id, selectedIndex);

      if (result.error) {
        sceneModule.showNarration('エラーが発生しました...', { autoDismiss: 2000 });
        list.dataset.answered = '';
        return;
      }

      // Show visual feedback on buttons
      document.querySelectorAll('.quiz-answer-option').forEach((o, idx) => {
        o.style.pointerEvents = 'none';
        if (idx === result.correctIndex) {
          o.style.borderColor = 'var(--success-color, #4ade80)';
          o.style.boxShadow = '0 0 10px var(--success-color, #4ade80)';
        } else if (idx === selectedIndex && !result.correct) {
          o.style.borderColor = 'var(--danger-color, #ef4444)';
          o.style.boxShadow = '0 0 10px var(--danger-color, #ef4444)';
        } else {
          o.style.opacity = '0.5';
        }
      });

      // Show Quiz Master's response with click-to-continue
      await sceneModule.showNarration(result.response, { speaker: 'Quiz Master' });

      // Proceed based on result
      if (result.correct) {
        gameState._quizStage = 'reward';
        delete gameState._quizQuestion;
        updateUI();
      } else {
        gameState._quizStage = 'failed';
        updateUI();
      }
    });
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/exploration.js && echo "Syntax OK"`
Expected: `Syntax OK`

**Step 3: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: implement new quiz flow with API-driven questions"
```

---

## Task 7: Manual Testing

**Step 1: Start the server**

Run: `npm start`

**Step 2: Test in browser**

1. Start a new run
2. Explore until you find a Quiz Master room (20% chance per room)
3. Verify: Quiz Master appears with a Japanese grammar question
4. Verify: Three answer buttons appear
5. Select wrong answer:
   - Verify: Wrong answer highlighted red, correct answer highlighted green
   - Verify: Quiz Master response appears in narration box
   - Verify: Click to continue dismisses narration
   - Verify: Proceeds to next room with no reward
6. Find another Quiz Master room and select correct answer:
   - Verify: Correct answer highlighted green
   - Verify: Quiz Master congratulates you
   - Verify: Reward selection appears

**Step 3: Run e2e tests**

Run: `./scripts/e2e-test.sh`
Expected: 80+/87 tests pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete quiz master N5 grammar questions implementation"
```

---

## Summary of Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/data/quiz-questions.json` | CREATE | 10 N5 grammar questions with responses |
| `src/routes/game/run.js` | MODIFY | Add quiz-question and quiz-answer endpoints |
| `public/js/api.js` | MODIFY | Add getQuizQuestion and submitQuizAnswer functions |
| `public/js/ui/exploration.js` | MODIFY | Update init + rewrite renderQuiz function |
| `public/game.js` | MODIFY | Wire new API functions to exploration UI |
