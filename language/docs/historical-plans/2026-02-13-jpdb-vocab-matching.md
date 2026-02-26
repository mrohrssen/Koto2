# JPDB Vocabulary Matching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Match ~815 unique English words from the Master Vocabulary List to Japanese words in the JPDB top-30k wordlist, filling in Japanese translations and frequency ranks.

**Architecture:** A Python pre-filter script narrows ~27k JPDB entries to 5-10 candidates per English word using meaning-text matching, then haiku subagents pick the best match in batches of ~25. Results are merged back into the master CSV.

**Tech Stack:** Python 3 (csv, re, json), Claude Code Task tool with haiku subagents

---

## Context

**Input files:**
- `JAPANESE NAMES/Master Vocabulary List-Table 1.csv` — 707 rows, 10 columns
  - Col 1 "Item": English noun (e.g. "teacher", "desk") — needs Col 2 "Japanese Word" + Col 3 "ITEM JPDB FREQUENCY"
  - Col 6 "Action Hint": English verb/adj (e.g. "teach", "sit") — needs Col 7 "Japanese Word" + Col 8 "ACTION JPDB FREQUENCY"
  - ~560 unique items, ~292 unique action hints, ~37 overlap = ~815 unique English words to match
- `data/jpdb-wordlist.csv` — ~27k rows: rank, word, reading, vid, sid, part_of_speech, meanings (semicolon-delimited English glosses)

**Key challenge:** English→Japanese is not 1:1. "water" could be 水 (rank 286), 水分 (rank 6863), お湯 (hot water), etc. Short English words like "run" match 100+ JPDB entries because they appear in many definitions. A heuristic pre-filter + AI review handles this cleanly.

**Heuristic tested during research:** Exact meaning match on semicolon-delimited segments (with parenthetical stripping) + frequency rank tiebreaker correctly auto-matches ~90% of words. The remaining ~10% (ambiguous matches + 60 words with no JPDB candidates) need AI review.

---

### Task 1: Write the pre-filter script

**Files:**
- Create: `scripts/jpdb-match-prefilter.py`

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Pre-filter JPDB wordlist candidates for English word matching.

Reads the master vocab CSV and JPDB wordlist, finds candidate Japanese
words for each unique English word, scores them by meaning match quality
and frequency, and outputs a JSON file for AI review.
"""
import csv
import re
import json
import sys

MASTER_CSV = 'JAPANESE NAMES/Master Vocabulary List-Table 1.csv'
JPDB_CSV = 'data/jpdb-wordlist.csv'
OUTPUT_JSON = 'data/jpdb-match-candidates.json'


def load_jpdb():
    """Load JPDB wordlist into memory."""
    entries = []
    with open(JPDB_CSV, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) >= 7:
                entries.append({
                    'rank': int(row[0]),
                    'word': row[1],
                    'reading': row[2],
                    'vid': row[3],
                    'sid': row[4],
                    'pos': row[5],
                    'meanings': row[6]
                })
    return entries


def extract_unique_words(master_csv):
    """Extract unique English words from master CSV, categorized as item or action."""
    items = set()
    actions = set()
    with open(master_csv, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) > 6:
                item = row[1].strip().lower()
                action = row[6].strip().lower()
                if item:
                    items.add(item)
                if action:
                    actions.add(action)
    return items, actions


def score_candidate(eng, entry):
    """
    Score how well a JPDB entry matches an English word.
    Returns (score, entry) where higher score = better match.

    Scoring:
    - 1000: exact match on a semicolon-delimited meaning segment
    - 500: match after stripping parenthetical qualifiers like "(esp. domestic)"
    - 0: no match on any segment

    Position penalty: -1 per segment position (earlier meanings = better)
    Rank tiebreaker: among equal scores, prefer lower rank (more common word)
    """
    eng_l = eng.lower()
    parts = [p.strip().lower() for p in entry['meanings'].split(';')]
    best_score = 0

    for i, part in enumerate(parts):
        clean = re.sub(r'\s*\(.*?\)\s*$', '', part).strip()
        for text in [part, clean]:
            if text == eng_l or text == f'to {eng_l}':
                best_score = max(best_score, 1000 - i)
            elif text.startswith(eng_l + ' ') or text.startswith(f'to {eng_l} '):
                best_score = max(best_score, 500 - i)

    return best_score


def find_candidates(eng, jpdb_entries, max_candidates=10):
    """Find and rank JPDB candidates for an English word."""
    pattern = re.compile(r'\b' + re.escape(eng.lower()) + r'\b', re.IGNORECASE)
    matches = [e for e in jpdb_entries if pattern.search(e['meanings'])]

    if not matches:
        return []

    scored = []
    for e in matches:
        s = score_candidate(eng, e)
        if s > 0:
            scored.append((s, e))

    # Sort by score desc, then rank asc (more common first)
    scored.sort(key=lambda x: (-x[0], x[1]['rank']))

    # Return top N candidates
    result = []
    for score, entry in scored[:max_candidates]:
        result.append({
            'word': entry['word'],
            'reading': entry['reading'],
            'rank': entry['rank'],
            'vid': entry['vid'],
            'sid': entry['sid'],
            'pos': entry['pos'],
            'score': score,
            'meanings_short': '; '.join(entry['meanings'].split(';')[:3]).strip()
        })
    return result


def main():
    print('Loading JPDB wordlist...')
    jpdb = load_jpdb()
    print(f'  Loaded {len(jpdb)} entries')

    print('Extracting English words from master CSV...')
    items, actions = extract_unique_words(MASTER_CSV)
    all_words = sorted(items | actions)
    print(f'  {len(items)} unique items, {len(actions)} unique actions, {len(all_words)} total unique')

    print('Finding candidates...')
    results = {}
    no_match = []
    for eng in all_words:
        candidates = find_candidates(eng, jpdb)
        if candidates:
            results[eng] = {
                'candidates': candidates,
                'best_heuristic': candidates[0],
                'is_item': eng in items,
                'is_action': eng in actions
            }
        else:
            no_match.append(eng)
            results[eng] = {
                'candidates': [],
                'best_heuristic': None,
                'is_item': eng in items,
                'is_action': eng in actions
            }

    # Stats
    has_candidates = sum(1 for r in results.values() if r['candidates'])
    high_conf = sum(1 for r in results.values() if r['best_heuristic'] and r['best_heuristic']['score'] >= 500)
    print(f'\nResults:')
    print(f'  With candidates: {has_candidates}')
    print(f'  High confidence (score >= 500): {high_conf}')
    print(f'  No candidates: {len(no_match)}')

    if no_match:
        print(f'\n  No-match words: {", ".join(no_match[:20])}{"..." if len(no_match) > 20 else ""}')

    # Write output
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {OUTPUT_JSON}')


if __name__ == '__main__':
    main()
```

**Step 2: Run the script**

Run: `cd /path/to/jrpg && python3 scripts/jpdb-match-prefilter.py`
Expected: Creates `data/jpdb-match-candidates.json` with ~815 entries, ~755 with candidates, ~60 without.

**Step 3: Commit**

```bash
git add scripts/jpdb-match-prefilter.py data/jpdb-match-candidates.json
git commit -m "feat: add JPDB vocab matching pre-filter script"
```

---

### Task 2: AI-review candidates in batches with haiku subagents

**Files:**
- Read: `data/jpdb-match-candidates.json` (from Task 1)
- Create: `data/jpdb-matches-final.json`

This task dispatches haiku subagents to validate/override the heuristic picks. Each subagent gets ~25 words with their top candidates and returns the best pick for each.

**Step 1: Prepare batches and dispatch subagents**

Read `data/jpdb-match-candidates.json`. Split into groups of ~25 words. For each batch, dispatch a haiku subagent with a prompt like:

```
You are matching English words to Japanese translations from a frequency-ranked dictionary.
For each English word below, I've listed candidate Japanese words with their frequency rank and short definition.
Pick the SINGLE best everyday Japanese word for each English word.

Rules:
- Prefer the most common/natural translation (lowest rank = most common)
- For nouns: pick the standard noun form
- For verbs: pick the dictionary form (e.g. 食べる not 食べ)
- For adjectives: pick い-adjective or な-adjective form
- If no candidate fits well, respond with "NONE"
- For compound English words like "fire station" or "bus stop sign", try to find the closest single Japanese concept

Respond as JSON: {"word1": {"pick": "日本語", "rank": 123}, "word2": {"pick": "NONE", "rank": null}, ...}

Words:
1. teacher — candidates: 先生 (#418, "teacher; instructor; master"), 教師 (#1962, "teacher (classroom)")
2. water — candidates: 水 (#286, "Wednesday; shaved ice; water"), 水分 (#6863, "water; liquid; fluid")
...
```

**Step 2: Collect results from all subagents**

Merge all subagent responses into `data/jpdb-matches-final.json`:
```json
{
  "teacher": {"word": "先生", "reading": "せんせい", "rank": 418, "vid": "...", "sid": "..."},
  "water": {"word": "水", "reading": "みず", "rank": 286, "vid": "...", "sid": "..."},
  ...
}
```

**Step 3: Commit**

```bash
git add data/jpdb-matches-final.json
git commit -m "feat: add AI-validated JPDB word matches"
```

---

### Task 3: Write results back to master CSV

**Files:**
- Read: `data/jpdb-matches-final.json`
- Modify: `JAPANESE NAMES/Master Vocabulary List-Table 1.csv`
- Create: `scripts/jpdb-match-writeback.py`

**Step 1: Write the writeback script**

```python
#!/usr/bin/env python3
"""
Write matched Japanese words back into the Master Vocabulary List CSV.

Reads jpdb-matches-final.json and updates:
- Col 2 (Japanese Word for Item) + Col 3 (ITEM JPDB FREQUENCY)
- Col 7 (Japanese Word for Action) + Col 8 (ACTION JPDB FREQUENCY)
"""
import csv
import json

MATCHES_JSON = 'data/jpdb-matches-final.json'
MASTER_CSV = 'JAPANESE NAMES/Master Vocabulary List-Table 1.csv'
OUTPUT_CSV = 'JAPANESE NAMES/Master Vocabulary List-Table 1.csv'  # overwrite in place

def main():
    with open(MATCHES_JSON, encoding='utf-8') as f:
        matches = json.load(f)

    rows = []
    with open(MASTER_CSV, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows.append(header)

        filled_items = 0
        filled_actions = 0
        missing_items = []
        missing_actions = []

        for row in reader:
            # Ensure row has 10 columns
            while len(row) < 10:
                row.append('')

            item = row[1].strip().lower()
            action = row[6].strip().lower()

            # Fill Item Japanese Word (col 2) + frequency (col 3)
            if item and item in matches and matches[item].get('word'):
                row[2] = matches[item]['word']
                row[3] = str(matches[item].get('rank', ''))
                filled_items += 1
            elif item:
                missing_items.append(item)

            # Fill Action Japanese Word (col 7) + frequency (col 8)
            if action and action in matches and matches[action].get('word'):
                row[7] = matches[action]['word']
                row[8] = str(matches[action].get('rank', ''))
                filled_actions += 1
            elif action:
                missing_actions.append(action)

            rows.append(row)

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f'Filled {filled_items} item translations, {filled_actions} action translations')
    if missing_items:
        unique_missing = sorted(set(missing_items))
        print(f'Missing items ({len(unique_missing)} unique): {", ".join(unique_missing[:15])}...')
    if missing_actions:
        unique_missing = sorted(set(missing_actions))
        print(f'Missing actions ({len(unique_missing)} unique): {", ".join(unique_missing[:15])}...')


if __name__ == '__main__':
    main()
```

**Step 2: Run it**

Run: `python3 scripts/jpdb-match-writeback.py`
Expected: Updates the master CSV in place. Should fill ~650+ items and ~250+ actions.

**Step 3: Verify output**

Run: `head -10 "JAPANESE NAMES/Master Vocabulary List-Table 1.csv"` and spot-check a few rows to confirm Japanese words and frequencies are filled in correctly.

**Step 4: Commit**

```bash
git add scripts/jpdb-match-writeback.py "JAPANESE NAMES/Master Vocabulary List-Table 1.csv"
git commit -m "feat: populate master vocab list with JPDB Japanese translations and frequency"
```

---

## Execution Notes

- **Task 2 is the bottleneck** — it requires ~33 haiku subagent dispatches (815 words / 25 per batch). Each takes a few seconds. The executing session should use `superpowers:dispatching-parallel-agents` to run multiple batches concurrently.
- **No-match words** (60 words like "giraffe", "skateboard", "fire station"): The AI subagents should attempt these too. Many compound English words have standard Japanese equivalents (消防署 for "fire station", キリン for "giraffe") that just don't appear when grepping the meanings column. For these, the subagent prompt should include "If no candidate listed, suggest the standard Japanese word from your knowledge."
- **Cleanup:** After the CSV is populated, `scripts/jpdb-match-prefilter.py`, `scripts/jpdb-match-writeback.py`, `data/jpdb-match-candidates.json`, and `data/jpdb-matches-final.json` can all be deleted — they're one-shot tools.
