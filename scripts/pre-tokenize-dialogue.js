import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tokenize } from '../src/tokenizer.js';

const DIALOGUE_DIR = join(process.cwd(), 'data', 'dialogue');
const PUNCT_POS = new Set(['記号', '補助記号', '空白']);

function pretokenizeLine(text) {
  const tokens = tokenize(text);
  const contentWords = tokens
    .filter(t => !PUNCT_POS.has(t.pos) && !/^[\p{P}\p{S}\s]+$/u.test(t.surface))
    .map(t => t.baseForm);
  return { _tokens: tokens, _contentWords: contentWords };
}

function processFile(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  let lineCount = 0;

  if (Array.isArray(raw)) {
    // CID scripts: [{ id, lines: [string] }]
    for (const script of raw) {
      if (!script.lines) continue;
      const newLines = [];
      for (const line of script.lines) {
        const text = typeof line === 'string' ? line : line.text;
        const { _tokens, _contentWords } = pretokenizeLine(text);
        newLines.push({
          text,
          ...(typeof line === 'object' && line.overrides ? { overrides: line.overrides } : {}),
          _tokens,
          _contentWords,
        });
        lineCount++;
      }
      script.lines = newLines;
    }
  } else if (typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        // Barks: { trigger: [string] }
        const newLines = [];
        for (const line of value) {
          const text = typeof line === 'string' ? line : line.text;
          const { _tokens, _contentWords } = pretokenizeLine(text);
          newLines.push({ text, _tokens, _contentWords });
          lineCount++;
        }
        raw[key] = newLines;
      } else if (typeof value === 'object') {
        // NPC: { npcId: { slot: [string] } }
        for (const [slot, lines] of Object.entries(value)) {
          if (!Array.isArray(lines)) continue;
          const newLines = [];
          for (const line of lines) {
            const text = typeof line === 'string' ? line : line.text;
            const { _tokens, _contentWords } = pretokenizeLine(text);
            newLines.push({ text, _tokens, _contentWords });
            lineCount++;
          }
          value[slot] = newLines;
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(raw, null, 2));
  return lineCount;
}

const files = readdirSync(DIALOGUE_DIR).filter(f => f.endsWith('.json'));
let totalLines = 0;
for (const file of files) {
  const filePath = join(DIALOGUE_DIR, file);
  console.log(`Processing ${file}...`);
  const count = processFile(filePath);
  totalLines += count;
  console.log(`  → ${count} lines tokenized`);
}
console.log(`\nDone. ${totalLines} lines pre-tokenized across ${files.length} files.`);
