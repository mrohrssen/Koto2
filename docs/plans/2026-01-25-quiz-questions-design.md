# Quiz Master N5 Grammar Questions Design

## Overview

Add a rotating set of 10 N5 grammar questions to the Quiz Master encounters. Each encounter randomly selects one question. The Quiz Master speaks naturally in Japanese using the VN-style narration system.

## User Experience Flow

1. **Enter quiz room** → Quiz Master sprite appears
2. **Question displayed** → Narration box shows question, 3 answer buttons appear
3. **Player selects answer** → API validates, returns Quiz Master's response
4. **Response displayed** → Answer buttons stay visible (disabled), correct answer highlighted green, wrong selection highlighted red. Narration shows Quiz Master's conversational response. Click-to-continue.
5. **Proceed**:
   - Correct → Show reward selection (existing flow)
   - Wrong → Proceed to next room (no reward)

## Data Structure

**File**: `src/data/quiz-questions.json`

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
    }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (q001, q002, etc.) |
| `type` | string | Question format: `fill-blank`, `which-correct`, `translation` |
| `question` | string | The question text shown in narration |
| `options` | array[3] | Three answer choices |
| `correctIndex` | number | 0, 1, or 2 |
| `correctResponse` | string | Quiz Master's natural response when correct |
| `wrongResponse` | string | Quiz Master's natural response when wrong (includes correct answer) |

## API Design

### GET /api/game/quiz-question

Returns a random question (without revealing correct answer).

**Response**:
```json
{
  "id": "q001",
  "type": "fill-blank",
  "question": "わたし＿＿学生です。",
  "options": ["は", "が", "を"]
}
```

### POST /api/game/quiz-answer

Validates the player's answer.

**Request**:
```json
{
  "questionId": "q001",
  "selectedIndex": 0
}
```

**Response**:
```json
{
  "correct": true,
  "response": "そうだ、「は」が正解だ。よくできたな。"
}
```

## The 10 Questions

### Q001: Particle は (topic marker)
- **Type**: fill-blank
- **Question**: わたし＿＿学生です。
- **Options**: は / が / を
- **Correct**: 0 (は)
- **Correct Response**: そうだ、「は」が正解だ。よくできたな。
- **Wrong Response**: 残念だな。正解は「は」だ。次は頑張れよ。

### Q002: Particle を (object marker)
- **Type**: fill-blank
- **Question**: りんご＿＿食べます。
- **Options**: が / を / に
- **Correct**: 1 (を)
- **Correct Response**: その通りだ。「を」は目的語につけるんだ。
- **Wrong Response**: 違うぞ。「を」が正解だ。食べる物には「を」を使うんだ。

### Q003: Particle に (time marker)
- **Type**: fill-blank
- **Question**: 七時＿＿起きます。
- **Options**: で / に / を
- **Correct**: 1 (に)
- **Correct Response**: 正解だ。時間には「に」を使う。覚えておけ。
- **Wrong Response**: 惜しいな。正解は「に」だ。時間を言うときは「に」だぞ。

### Q004: Particle で (location of action)
- **Type**: fill-blank
- **Question**: 図書館＿＿本を読みます。
- **Options**: に / で / へ
- **Correct**: 1 (で)
- **Correct Response**: よし、正解だ。動作の場所には「で」を使う。
- **Wrong Response**: 違うな。正解は「で」だ。何かをする場所には「で」を使うんだ。

### Q005: Verb past tense
- **Type**: which-correct
- **Question**: 「昨日、映画を見る」を過去形にすると？
- **Options**: 見ました / 見ます / 見ません
- **Correct**: 0 (見ました)
- **Correct Response**: そうだ。過去のことは「〜ました」だ。よく分かってるな。
- **Wrong Response**: 違うぞ。「見ました」が正解だ。昨日のことだから過去形だ。

### Q006: Verb negative
- **Type**: fill-blank
- **Question**: 肉を食べ＿＿。
- **Options**: ます / ました / ません
- **Correct**: 2 (ません)
- **Correct Response**: 正解だ。「〜ません」は否定の形だ。
- **Wrong Response**: 残念だ。「ません」が正解だ。食べないという意味だぞ。

### Q007: い-adjective negative
- **Type**: which-correct
- **Question**: 「おいしい」の否定形は？
- **Options**: おいしいない / おいしくない / おいしじゃない
- **Correct**: 1 (おいしくない)
- **Correct Response**: その通り。い形容詞は「い」を「くない」に変えるんだ。
- **Wrong Response**: 違うな。「おいしくない」が正解だ。「い」を取って「くない」をつけるんだ。

### Q008: な-adjective with noun
- **Type**: fill-blank
- **Question**: きれい＿＿花ですね。
- **Options**: い / な / の
- **Correct**: 1 (な)
- **Correct Response**: 正解だ。な形容詞は名詞の前で「な」をつける。
- **Wrong Response**: 惜しいな。「な」が正解だ。「きれい」はな形容詞だからな。

### Q009: Question word どこ
- **Type**: translation
- **Question**: 「Where is the station?」は日本語で？
- **Options**: 駅はどこですか / 駅は何ですか / 駅はいつですか
- **Correct**: 0 (駅はどこですか)
- **Correct Response**: そうだ。場所を聞くときは「どこ」を使う。完璧だ。
- **Wrong Response**: 違うぞ。「駅はどこですか」が正解だ。「どこ」は場所を聞く言葉だ。

### Q010: Negative です form
- **Type**: which-correct
- **Question**: 「これは本です」の否定形は？
- **Options**: これは本じゃないです / これは本くないです / これは本ませんです
- **Correct**: 0 (これは本じゃないです)
- **Correct Response**: よくできた。「じゃないです」が否定の形だ。
- **Wrong Response**: 残念だな。「これは本じゃないです」が正解だ。名詞の否定は「じゃないです」だぞ。

## Files to Modify

| File | Changes |
|------|---------|
| `src/data/quiz-questions.json` | **NEW** - Create with 10 questions |
| `src/routes/game/run.js` | Add `GET /quiz-question` and `POST /quiz-answer` endpoints |
| `public/js/ui/exploration.js` | Update `renderQuiz` to fetch question, show answers, handle response |
| `public/js/api.js` | Add `getQuizQuestion()` and `submitQuizAnswer()` functions |

## Visual States for Answer Buttons

After answer submission, buttons become disabled with visual feedback:

| State | Style |
|-------|-------|
| Unselected + not correct | Dimmed/grey |
| Selected + wrong | Red border/highlight |
| Correct answer | Green border/highlight (always shown) |

## Future Considerations (Not in scope)

- Track which questions player has seen to avoid repeats
- Difficulty tags for progression
- Category filtering (particles, verbs, adjectives)
- More question types
- Thousands of questions from external sources
