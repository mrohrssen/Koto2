# CSV Tsukumogami Categorization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `Category` column (NPC / Item / Creature / Place / Concept) to `JAPANESE NAMES/Translation Only Words.csv` using Opus 4.6 to apply Tsukumogami lore for every row.

**Architecture:** Single Node.js script reads the CSV, batches rows into groups of ~50, sends each batch to Claude Opus 4.6 with the Tsukumogami system prompt, parses JSON responses, and writes the CSV back with the new column.

**Tech Stack:** Node.js (ESM), `@anthropic-ai/sdk` (already installed), `csv-parse` / `csv-stringify` (install), `fs`

---

### Task 1: Create the categorization script skeleton

**Files:**
- Create: `scripts/categorize-csv.mjs`

**Step 1: Write the script with CSV reading/writing and batch loop**

```js
/**
 * Categorize CSV entries using Opus 4.6 and Tsukumogami lore.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... node scripts/categorize-csv.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

// ── Config ──────────────────────────────────────────────────────────────────
const CSV_PATH = 'JAPANESE NAMES/Translation Only Words.csv';
const BATCH_SIZE = 50;
const MODEL = 'claude-opus-4-6';
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) throw new Error('Set ANTHROPIC_API_KEY env var');

const VALID_CATEGORIES = new Set(['NPC', 'Item', 'Creature', 'Place', 'Concept']);

// ── Tsukumogami system prompt ───────────────────────────────────────────────
const SYSTEM = `You are a game designer categorizing Japanese vocabulary words into entity types for a cyberpunk RPG.

The game's lore uses Tsukumogami (付喪神) — the belief that objects used and cherished long enough develop a spirit. A well-loved pair of scissors wakes up. An old school desk comes alive. But a rice ball? A bandage? A stamp? Those exist to be consumed — they never stick around long enough to develop a soul.

Rule: "Things that endure gain a spirit (Creature). Things that are spent fuel those spirits (Item)."

Categorize each item into EXACTLY ONE of these five categories:

- **NPC**: Humans, human roles, human relationships — anyone a player could talk to (teacher, chef, doctor, mother, cashier, runner, walker)
- **Creature**: Animals AND enduring objects that could "wake up" — things cherished long enough to develop a spirit (dog, elephant, desk, clock, umbrella, train, bicycle, book, piano, mirror, statue, trophy, bell)
- **Item**: Consumable/expendable objects — things that are spent, used up, or exist to fuel others (rice, bread, soap, medicine, stamp, bandage, paper, food, drinks, fruits, vegetables, ingredients)
- **Place**: Locations, buildings, rooms, named areas (classroom, library, gym, restaurant, airport, kitchen, park)
- **Concept**: Abstract ideas, colors, shapes, seasons, academic subjects, intangible things (spring, history, red, circle, health, question, answer, internet, lesson)

Respond with ONLY a JSON array. Each element: { "item": "<english name>", "category": "<NPC|Item|Creature|Place|Concept>" }
No explanation, no markdown fences, just the JSON array.`;

// ── CSV helpers (no external deps) ──────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || '');
    return row;
  });
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function toCSV(headers, rows) {
  const escape = v => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h] || '')).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── AI call ─────────────────────────────────────────────────────────────────
const client = new Anthropic({ apiKey: API_KEY });

async function categorizeBatch(items) {
  const payload = items.map(r => ({
    item: r.Item,
    type: r.Type,
    location: r.Location
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(payload) }]
  });

  const text = response.content[0].text.trim();
  // Strip markdown fences if present
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const raw = readFileSync(CSV_PATH, 'utf8');
  const { headers, rows } = parseCSV(raw);

  // Add Category column
  const outHeaders = [...headers, 'Category'];

  // Process in batches
  let categorized = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (rows ${i + 1}-${i + batch.length})...`);

    try {
      const results = await categorizeBatch(batch);

      // Map results back by item name
      const catMap = new Map(results.map(r => [r.item, r.category]));

      for (const row of batch) {
        const cat = catMap.get(row.Item);
        if (cat && VALID_CATEGORIES.has(cat)) {
          row.Category = cat;
          categorized++;
        } else {
          console.warn(`  WARN: No valid category for "${row.Item}" (got: ${cat})`);
          row.Category = '';
          failed++;
        }
      }
    } catch (err) {
      console.error(`  ERROR batch ${batchNum}: ${err.message}`);
      // Retry once
      console.log(`  Retrying batch ${batchNum}...`);
      try {
        const results = await categorizeBatch(batch);
        const catMap = new Map(results.map(r => [r.item, r.category]));
        for (const row of batch) {
          const cat = catMap.get(row.Item);
          if (cat && VALID_CATEGORIES.has(cat)) {
            row.Category = cat;
            categorized++;
          } else {
            row.Category = '';
            failed++;
          }
        }
      } catch (retryErr) {
        console.error(`  FAILED batch ${batchNum} after retry: ${retryErr.message}`);
        for (const row of batch) { row.Category = ''; failed++; }
      }
    }

    // Rate limit: pause 1s between batches
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Write output
  const output = toCSV(outHeaders, rows);
  writeFileSync(CSV_PATH, output, 'utf8');

  console.log(`\nDone! ${categorized} categorized, ${failed} failed.`);

  // Summary by category
  const counts = {};
  for (const row of rows) {
    const cat = row.Category || '(empty)';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  console.log('Category counts:', counts);
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 2: Verify the CSV can be read**

Run: `node -e "import { readFileSync } from 'fs'; const t = readFileSync('JAPANESE NAMES/Translation Only Words.csv','utf8'); console.log(t.split('\\n').length + ' lines')"`

Expected: `708 lines` (707 data + 1 header)

**Step 3: Run the script**

Run: `ANTHROPIC_API_KEY=sk-ant-api03-... node scripts/categorize-csv.mjs`

Expected: 15 batches processed, ~707 categorized, 0 failed. Output shows category counts roughly:
- NPC: ~87
- Item: ~200-300
- Creature: ~150-250
- Place: ~37
- Concept: ~32

**Step 4: Spot-check the output**

Run: `head -20 "JAPANESE NAMES/Translation Only Words.csv"` — verify the Category column is present and values look correct:
- teacher → NPC
- desk → Creature (enduring, could wake up)
- pencil → Item or Creature (arguable — AI decides)

**Step 5: Commit**

```bash
git add "JAPANESE NAMES/Translation Only Words.csv" scripts/categorize-csv.mjs
git commit -m "feat: categorize translation CSV with Tsukumogami lore via Opus 4.6"
```
