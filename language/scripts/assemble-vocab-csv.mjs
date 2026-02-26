import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = '/private/tmp/claude-501/-Users-michia-Documents-jrpg/tasks';
const AGENT_IDS = [
  'a6169a0', 'aa57614', 'acb2aba', 'a673e40', 'ae0c71b',
  'a5c9bae', 'a384c07', 'ab4ad89', 'a2845fa', 'ae71e06',
  'a74fe28', 'a80f045'
];

// Extract JSON arrays from agent output files
function extractTranslations(agentId) {
  const filePath = join(OUTPUT_DIR, `${agentId}.output`);
  const content = readFileSync(filePath, 'utf-8');
  const results = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.message?.role === 'assistant' && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === 'text' && block.text) {
            // Try to extract JSON array from the text
            let text = block.text.trim();
            // Remove markdown code fences if present
            text = text.replace(/^```json\s*\n?/m, '').replace(/\n?```\s*$/m, '');
            text = text.trim();
            if (text.startsWith('[')) {
              try {
                const arr = JSON.parse(text);
                if (Array.isArray(arr) && arr.length > 0 && arr[0].row) {
                  results.push(...arr);
                }
              } catch (e) {
                // Not valid JSON, skip
              }
            }
          }
        }
      }
    } catch (e) {
      // Not valid JSONL, skip
    }
  }
  return results;
}

// Manual translations for the 10 boundary rows missed by subagents
const MANUAL_TRANSLATIONS = [
  { row: 92, itemJa: 'インターネット', itemReading: 'いんたーねっと', actionJa: '検索する', actionReading: 'けんさくする' },
  { row: 144, itemJa: '冬', itemReading: 'ふゆ', actionJa: '寒い', actionReading: 'さむい' },
  { row: 189, itemJa: '壁', itemReading: 'かべ', actionJa: '構造', actionReading: 'こうぞう' },
  { row: 259, itemJa: 'バー', itemReading: 'ばー', actionJa: '出す', actionReading: 'だす' },
  { row: 402, itemJa: '血', itemReading: 'ち', actionJa: '体', actionReading: 'からだ' },
  { row: 481, itemJa: '石', itemReading: 'いし', actionJa: '硬い', actionReading: 'かたい' },
  { row: 542, itemJa: '券売機', itemReading: 'けんばいき', actionJa: '買う', actionReading: 'かう' },
  { row: 583, itemJa: '時計', itemReading: 'とけい', actionJa: '時間', actionReading: 'じかん' },
  { row: 638, itemJa: 'ラクダ', itemReading: 'らくだ', actionJa: 'こぶ', actionReading: 'こぶ' },
  { row: 709, itemJa: 'お金', itemReading: 'おかね', actionJa: '払う', actionReading: 'はらう' },
];

// Collect all translations
const allTranslations = {};
let totalFound = 0;

// Add manual translations first
for (const t of MANUAL_TRANSLATIONS) {
  allTranslations[t.row] = t;
}

for (const agentId of AGENT_IDS) {
  try {
    const translations = extractTranslations(agentId);
    console.log(`Agent ${agentId}: ${translations.length} translations`);
    totalFound += translations.length;
    for (const t of translations) {
      // Use first occurrence (don't overwrite with duplicates from overlapping batches)
      if (!allTranslations[t.row]) {
        allTranslations[t.row] = t;
      }
    }
  } catch (e) {
    console.error(`Error reading agent ${agentId}: ${e.message}`);
  }
}

console.log(`\nTotal translations found: ${totalFound}`);
console.log(`Unique rows: ${Object.keys(allTranslations).length}`);

// Check for missing rows (2-709)
const missing = [];
for (let i = 2; i <= 709; i++) {
  if (!allTranslations[i]) missing.push(i);
}
if (missing.length > 0) {
  console.log(`\nMissing rows (${missing.length}): ${missing.join(', ')}`);
}

// Read original CSV
const csvPath = '/Users/michia/Documents/jrpg/JAPANESE NAMES/Master Vocabulary List-Table 1.csv';
const csvContent = readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Build new CSV
// Original columns: Location, Item, Japanese Word, ITEM JPDB FREQUENCY, Type, Frequency, Action Hint, Japanese Word, ACTION JPDB FREQUENCY, Source
// New columns: Location, Item, Japanese Word, Item Reading, ITEM JPDB FREQUENCY, Type, Frequency, Action Hint, Japanese Word, Action Reading, ACTION JPDB FREQUENCY, Source
const newLines = [];

// Header
newLines.push('Location,Item,Japanese Word,Item Reading,ITEM JPDB FREQUENCY,Type,Frequency,Action Hint,Japanese Word,Action Reading,ACTION JPDB FREQUENCY,Source');

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  // Parse CSV carefully (handle commas in values)
  const parts = line.split(',');
  // Original: Location(0), Item(1), Japanese Word(2), ITEM JPDB FREQUENCY(3), Type(4), Frequency(5), Action Hint(6), Japanese Word(7), ACTION JPDB FREQUENCY(8), Source(9)

  const rowNum = i + 1; // Line numbers are 1-indexed, header is line 1, data starts at line 2
  const t = allTranslations[rowNum];

  const location = parts[0] || '';
  const item = parts[1] || '';
  const itemJa = t ? t.itemJa : '';
  const itemReading = t ? t.itemReading : '';
  const itemFreq = parts[3] || '';
  const type = parts[4] || '';
  const frequency = parts[5] || '';
  const actionHint = parts[6] || '';
  const actionJa = t ? t.actionJa : '';
  const actionReading = t ? t.actionReading : '';
  const actionFreq = parts[8] || '';
  const source = parts[9] || '';

  // Escape any values containing commas
  const escape = (v) => v.includes(',') ? `"${v}"` : v;

  newLines.push([
    escape(location), escape(item), escape(itemJa), escape(itemReading), escape(itemFreq),
    escape(type), escape(frequency), escape(actionHint), escape(actionJa), escape(actionReading),
    escape(actionFreq), escape(source)
  ].join(','));
}

const outputPath = '/Users/michia/Documents/jrpg/JAPANESE NAMES/Master Vocabulary List-Table 1.csv';
writeFileSync(outputPath, newLines.join('\n') + '\n');
console.log(`\nWrote ${newLines.length} lines (including header) to:\n${outputPath}`);
