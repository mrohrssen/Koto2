# Japanese Vocabulary CSV Translation Pipeline

**Date:** 2026-02-14
**Status:** Approved

## Goal

Fill in Japanese translations for all 708 rows in `JAPANESE NAMES/Master Vocabulary List-Table 1.csv`. Each row has an English **Item** and an **Action Hint** that both need Japanese equivalents with readings.

## Input/Output

**Input:** `JAPANESE NAMES/Master Vocabulary List-Table 1.csv` — 708 rows, 10 columns (Japanese Word columns empty).

**Output:** Same file with 4 columns populated/added:

| Column | Position | Content | Example |
|--------|----------|---------|---------|
| Japanese Word (Item) | 3 | Kanji | 先生 |
| Item Reading | 4 (NEW) | Hiragana | せんせい |
| Japanese Word (Action) | 9 | Dict-form kanji | 教える |
| Action Reading | 11 (NEW) | Hiragana | おしえる |

JPDB FREQUENCY columns are left empty.

## Approach: Parallel Sonnet Subagent Chunks

### Chunking

Split 708 rows into ~10 batches of ~70 rows, grouped by location so subagents have full context. Each batch is a JSON array:

```json
[
  {"row": 2, "location": "School / Classroom", "item": "teacher", "type": "person", "actionHint": "teach"},
  {"row": 3, "location": "School / Classroom", "item": "student", "type": "person", "actionHint": "learn"}
]
```

### Subagent Instructions

Each Sonnet subagent receives its batch plus these rules:

1. **Most common word first.** Choose the Japanese word a language learner would encounter most often. When in doubt, pick the word that appears most frequently in everyday Japanese.
2. **Dictionary form for verbs.** 食べる not 食べます.
3. **Context-aware translations.** Use the Location column to disambiguate:
   - "mouse" in Office → マウス; "mouse" in Farm → ネズミ (鼠)
   - "bat" in Sports → バット; "bat" as animal → コウモリ
4. **Loanwords.** If the loanword is commonly used in Japanese, use katakana (コンピューター, バス, テレビ).
5. **Return format:** JSON array with `row, itemJa, itemReading, actionJa, actionReading`.

### Assembly

1. Collect JSON results from all subagents.
2. Map translations back to original row numbers.
3. Insert new "Item Reading" column after col 3 and "Action Reading" column after col 9.
4. Write the updated CSV.

### Error Handling

- If a subagent fails, retry that batch once.
- Spot-check a sample of results for obvious errors before final write.

## Implementation Steps

1. Read the CSV and parse into row objects.
2. Split into ~10 location-grouped batches.
3. Launch 10 Sonnet subagents in parallel (Task tool, model=sonnet).
4. Collect results from all subagents.
5. Merge translations back into the CSV structure.
6. Write the final CSV with new columns.
