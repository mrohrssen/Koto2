# CID Script Curriculum Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author 15 CID welcome scripts that teach grammar particles, informed by simulator data showing which words players learn earliest.

**Architecture:** Run the learning simulator to discover the word learning curve, analyze the output to build a confidence list, author CID scripts using reliably-known words as foundation + 1 grammar word as i+1. No system changes — this is pure content authoring + data analysis.

**Tech Stack:** Koto learning simulator (SQLite + Express), SudachiPy tokenizer, existing i+1 filter

**Spec:** `docs/superpowers/specs/2026-04-06-cid-script-curriculum-design.md`

---

## Prerequisites

- Game server running at `http://localhost:3000` with valid `ADMIN_SECRET` in `.env`
- SudachiPy installed (`pip install sudachipy sudachidict_core`)
- Simulator dependencies installed: `cd simulator && npm install`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `data/dialogue/cid-scripts.json` | Rewrite | Replace existing 15 scripts with new curriculum scripts |
| `simulator/data/simulator.db` | Generated | SQLite DB with simulation results |
| `tmp/word-confidence-list.json` | Create (temp) | Ranked word list from simulator analysis |

---

## Chunk 1: Run Simulator and Analyze Data

### Task 1: Start servers and run 10 simulations

**Files:** None modified — this is running existing infrastructure.

- [ ] **Step 1: Start the game server**

```bash
cd /root/Koto2
npm run dev &
```

Wait for server to be ready:
```bash
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200`

- [ ] **Step 2: Start the simulator server**

```bash
cd /root/Koto2/simulator
ADMIN_SECRET=$(grep ADMIN_SECRET /root/Koto2/.env | cut -d= -f2) \
  GAME_SERVER_URL=http://localhost:3000 \
  node server.js &
```

Wait for simulator to be ready:
```bash
sleep 3 && curl -s http://localhost:3100/api/health
```
Expected: `{"status":"ok","gameServer":"http://localhost:3000"}`

- [ ] **Step 3: Create a simulation profile**

```bash
curl -s -X POST http://localhost:3100/api/profiles \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "cid-curriculum-baseline",
    "config": {
      "durationDays": 30,
      "runsPerDay": 2,
      "combatSkill": 0.5,
      "speedReviewAccuracy": 0.7,
      "wordDiscoveryAccuracy": 0.9,
      "aiDialogueMode": "skip"
    }
  }'
```

Expected: `{"id": <profileId>}`. Note the profileId.

- [ ] **Step 4: Launch 10 simulations sequentially**

Each simulation runs in the background on the server. Start one, poll until it finishes, then start the next. This avoids overwhelming the game server with concurrent users.

```bash
PROFILE_ID=<profileId from step 3>
for i in $(seq 1 10); do
  echo "Starting simulation $i of 10..."
  SIM_ID=$(curl -s -X POST http://localhost:3100/api/simulations/start \
    -H 'Content-Type: application/json' \
    -d "{\"profileId\": $PROFILE_ID}" | python3 -c "import sys,json; print(json.load(sys.stdin)['simId'])")
  echo "  Sim ID: $SIM_ID"

  # Poll until complete or errored
  while true; do
    STATUS=$(curl -s "http://localhost:3100/api/simulations/$SIM_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    if [ "$STATUS" = "complete" ] || [ "$STATUS" = "errored" ]; then
      echo "  Status: $STATUS"
      break
    fi
    sleep 10
  done
done
```

Note: Each simulation takes several minutes (30 simulated days × 2 runs/day). Total for 10 sims may take 30-60 minutes.

- [ ] **Step 5: Verify simulations completed**

```bash
curl -s "http://localhost:3100/api/profiles/$PROFILE_ID" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Profile: {data[\"name\"]}')
" 2>/dev/null

# List all simulations for the profile
# (Use the SQLite DB directly for efficiency)
cd /root/Koto2/simulator
python3 -c "
import sqlite3, json
db = sqlite3.connect('data/simulator.db')
rows = db.execute('SELECT id, status, current_day FROM simulations ORDER BY id DESC LIMIT 10').fetchall()
for r in rows:
    print(f'Sim {r[0]}: status={r[1]}, day={r[2]}')
db.close()
"
```

Expected: 10 simulations with `status=complete`, `day=30`.

### Task 2: Analyze word learning data

Extract which words players learn earliest and most reliably across all 10 simulations.

**Files:**
- Create: `tmp/word-confidence-list.json` (temporary analysis output)

- [ ] **Step 1: Query word_learned events and build confidence list**

```bash
cd /root/Koto2/simulator
python3 -c "
import sqlite3, json
from collections import defaultdict

db = sqlite3.connect('data/simulator.db')

# Get all completed simulation IDs
sims = db.execute(
    \"SELECT id FROM simulations WHERE status = 'complete' ORDER BY id DESC LIMIT 10\"
).fetchall()
sim_ids = [s[0] for s in sims]
print(f'Analyzing {len(sim_ids)} simulations: {sim_ids}')

# For each sim, get word_learned events with day
word_data = defaultdict(list)  # word -> [day_learned_in_sim1, day_learned_in_sim2, ...]
for sim_id in sim_ids:
    events = db.execute(
        \"SELECT day, data FROM events WHERE simulation_id = ? AND event_type = 'word_learned' ORDER BY day ASC\",
        (sim_id,)
    ).fetchall()
    for day, data_json in events:
        data = json.loads(data_json)
        word = data.get('word') or data.get('baseForm') or data.get('spelling', '')
        if word:
            word_data[word].append(day)

# Build confidence list
confidence = []
for word, days in word_data.items():
    n_users = len(days)
    median_day = sorted(days)[len(days) // 2]
    earliest_day = min(days)
    confidence.append({
        'word': word,
        'users_learned': n_users,
        'median_day': median_day,
        'earliest_day': earliest_day,
        'all_days': sorted(days),
    })

# Sort by: most users first, then earliest median day
confidence.sort(key=lambda x: (-x['users_learned'], x['median_day']))

# Print top 40
print(f'\nTop 40 most reliably learned words:')
print(f'{\"Word\":<12} {\"Users\":<8} {\"Median Day\":<12} {\"Earliest\":<10}')
print('-' * 42)
for entry in confidence[:40]:
    print(f'{entry[\"word\"]:<12} {entry[\"users_learned\"]:<8} {entry[\"median_day\"]:<12} {entry[\"earliest_day\"]:<10}')

# Save full list
with open('/root/Koto2/tmp/word-confidence-list.json', 'w') as f:
    json.dump(confidence, f, ensure_ascii=False, indent=2)
print(f'\nFull list saved to tmp/word-confidence-list.json ({len(confidence)} words)')

db.close()
"
```

Expected: A ranked table of words. Words near the top (learned by most users, earliest day) are safe to use in early CID scripts. Words learned by only 1-2 users or late are risky.

- [ ] **Step 2: Review the confidence list**

Read `tmp/word-confidence-list.json` and identify:
- **Tier 1 (days 1-3, 8+ users):** Words almost every player knows very early. Safe for run 2-3 CID scripts.
- **Tier 2 (days 3-10, 6+ users):** Words most players know within the first week. Safe for run 5+ scripts.
- **Tier 3 (days 10+, 4+ users):** Words learned later. For run 10+ scripts.

Note which content words (creature names, moves, barks) are in each tier. These inform which grammar particles can be taught in which scripts.

---

## Chunk 2: Author CID Scripts

### Task 3: Write 15 CID scripts in kanji

Using the confidence list from Task 2, write new CID scripts.

**Files:**
- Rewrite: `data/dialogue/cid-scripts.json`

**Constraints:**
- Each script: 2-3 lines, each line 1-2 sentences
- All text in kanji (rendered as hiragana by the bootstrap renderer)
- Each script's i+1 word should be a grammar particle or function word
- All other words must come from the teachable pool (creatures, moves, items, barks, grammar-words, glue-words)
- Script IDs: `cid-welcome-0` through `cid-welcome-14`

**Grammar particles to teach across the 15 scripts:** は, よ, も, に, が, と, か, で, を, の, ね, だ (pick ~12-15 of these, one per script; some scripts may reinforce a particle taught by an earlier script)

- [ ] **Step 1: Write the scripts**

Write the JSON array of 15 scripts. Each script has:
```json
{
  "id": "cid-welcome-N",
  "lines": [
    "Line 1 in kanji — 1-2 sentences",
    "Line 2 in kanji — 1-2 sentences",
    "Line 3 in kanji (optional)"
  ]
}
```

**Critical:** Use ONLY words from the teachable pool. Before using any word in a script, verify it appears in one of:
- `data/creatures.json` (baseWord)
- `data/moves.json` (name)
- `data/items.json` (word)
- `data/dialogue/barks.json` (_contentWords)
- `data/grammar-words.json` (word)
- `data/glue-words.json` (word)

**Script difficulty ladder:** Scripts using Tier 1 words (from the confidence list) will naturally become eligible first. Scripts using Tier 2/3 words will become eligible later. The i+1 filter handles this automatically — no manual ordering needed.

**Example script (illustrative — use actual confidence list data):**

If Tier 1 words include 火, 強い, すごい, and we want to teach は:
```json
{
  "id": "cid-welcome-2",
  "lines": [
    "こんにちは！",
    "火は 強い！すごい！"
  ]
}
```

Line 1: こんにちは (1 unknown per sentence — teaches こんにちは if not known, or 0 unknowns if known).
Line 2: 火(known), は(i+1 teaching word), 強い(known), すごい(known).

- [ ] **Step 2: Save to cid-scripts.json**

Replace the entire contents of `data/dialogue/cid-scripts.json` with the new 15-script JSON array. The lines should be plain strings (the pre-tokenizer will add `_tokens` and `_contentWords`).

- [ ] **Step 3: Commit the raw scripts**

```bash
git add data/dialogue/cid-scripts.json
git commit -m "feat: rewrite CID scripts as grammar-teaching curriculum

15 scripts authored against simulator confidence data.
Each teaches 1 grammar particle as i+1 word.
2-3 lines per script, kanji-first authoring."
```

### Task 4: Tokenize, validate, and commit

- [ ] **Step 1: Pre-tokenize the new scripts**

```bash
cd /root/Koto2
node scripts/pre-tokenize-dialogue.js
```

Expected: `cid-scripts.json` shows tokenized lines. Check the output count matches (should be 30-45 lines across 15 scripts).

- [ ] **Step 2: Validate against dictionary**

```bash
node scripts/validate-dialogue.js
```

Expected: 0 errors. If any words are missing from the dictionary, add them to `data/glue-words.json` (for common words) or `data/grammar-words.json` (for particles).

- [ ] **Step 3: Fix any validation errors**

If errors, add missing words to the appropriate data file:
```bash
# Edit data/glue-words.json or data/grammar-words.json
# Then re-validate:
node scripts/validate-dialogue.js
```

- [ ] **Step 4: Commit tokenized scripts**

```bash
git add data/dialogue/cid-scripts.json data/glue-words.json data/grammar-words.json
git commit -m "chore: tokenize new CID scripts with SudachiPy"
```

---

## Chunk 3: Verify with Simulator

### Task 5: Run verification simulation

Run the simulator again with the new CID scripts to verify they get selected and teach particles.

- [ ] **Step 1: Ensure game server is running with new scripts**

Restart the game server to pick up the new cid-scripts.json:
```bash
# Kill existing dev server and restart
npm run dev &
sleep 5
```

- [ ] **Step 2: Run 3 verification simulations**

```bash
# Create a new profile (or reuse the existing one)
curl -s -X POST http://localhost:3100/api/simulations/start \
  -H 'Content-Type: application/json' \
  -d "{\"profileId\": $PROFILE_ID}"
```

Run 3 sims. Wait for completion.

- [ ] **Step 3: Check CID script selection in events**

```bash
cd /root/Koto2/simulator
python3 -c "
import sqlite3, json

db = sqlite3.connect('data/simulator.db')
sims = db.execute(
    \"SELECT id FROM simulations WHERE status = 'complete' ORDER BY id DESC LIMIT 3\"
).fetchall()

for sim_id, in sims:
    print(f'=== Simulation {sim_id} ===')
    events = db.execute(
        \"SELECT day, run, data FROM events WHERE simulation_id = ? AND event_type = 'dialogue_seen' ORDER BY day, run\",
        (sim_id,)
    ).fetchall()
    cid_events = []
    for day, run, data_json in events:
        data = json.loads(data_json)
        source = data.get('source', '')
        if 'cid' in source.lower() or 'welcome' in source.lower():
            # Identify scripts by line text (scriptId not logged in events)
            text = data.get('text', data.get('line', ''))[:60]
            cid_events.append((day, run, text))
    
    if cid_events:
        unique_texts = set()
        for day, run, text in cid_events:
            unique_texts.add(text)
            print(f'  Day {day} Run {run}: {text}')
        print(f'  → {len(unique_texts)} unique scripts across {len(cid_events)} CID events')
    else:
        print('  No CID events found (check event_type naming)')
    print()

db.close()
"
```

Expected: CID scripts are being selected across runs, with variety (not the same script every time). Different scripts become available as the player's vocabulary grows.

- [ ] **Step 4: Summarize findings for review**

Write a brief summary of:
- Which CID scripts were selected and when
- Were there runs where no CID script was eligible? (indicates vocabulary gap)
- Which grammar particles were taught
- Any scripts that never got selected (too many rare prerequisites)

This summary is the artifact for the user to review manually before authoring the next batch of scripts.

- [ ] **Step 5: Commit any final adjustments**

If the verification revealed issues (scripts never eligible, too many repeats), adjust the scripts and re-tokenize.

```bash
git add data/dialogue/
git commit -m "fix: adjust CID scripts based on verification simulation"
```
