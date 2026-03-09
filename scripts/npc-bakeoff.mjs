/**
 * NPC Dialogue Model Bakeoff
 *
 * Generates the same NPC dialogue (Yuuki) with 6 models across OpenAI and Anthropic,
 * validates vocab compliance via JPDB, and outputs a scorecard.
 *
 * Usage: node scripts/npc-bakeoff.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { chat } from '../src/ai-providers.js';
import { getCharacterCard } from '../src/narration-engine/character-cards.js';
import { assemblePrompt } from '../src/narration-engine/prompt-assembler.js';
import { parseDialogueJson, validateDialogueShape } from '../src/narration-engine/generation.js';
import { extractDialogueStrings, validateDialogueVocab } from '../src/narration-engine/dialogue-repair.js';
import { checkSentenceViolations } from '../src/game/vocab-repair.js';

// ── Keys ──────────────────────────────────────────────────────────────────────
const OPENAI_KEY  = process.env.OPENAI_API_KEY  || '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';
const CLAUDE_KEY  = process.env.ANTHROPIC_API_KEY || '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';
const JPDB_KEY    = process.env.JPDB_API_KEY     || '20f5c1eaca42aa0db43096084d1ff057';

// ── Models to test ────────────────────────────────────────────────────────────
const MODELS = [
  { label: 'gpt-5-mini',         provider: 'openai',  openaiModel: 'gpt-5-mini',    apiKey: OPENAI_KEY, inputPrice: 0.25,  outputPrice: 2    },
  { label: 'gpt-5.2',            provider: 'openai',  openaiModel: 'gpt-5.2',       apiKey: OPENAI_KEY, inputPrice: 1.75,  outputPrice: 14   },
  { label: 'gpt-5.2-pro',        provider: 'openai',  openaiModel: 'gpt-5.2-pro',   apiKey: OPENAI_KEY, inputPrice: 21,    outputPrice: 168  },
  { label: 'claude-haiku-4-5',   provider: 'claude',  claudeModel: 'claude-haiku-4-5-20251001',  apiKey: CLAUDE_KEY, inputPrice: 1,  outputPrice: 5   },
  { label: 'claude-sonnet-4-5',  provider: 'claude',  claudeModel: 'claude-sonnet-4-5-20250929', apiKey: CLAUDE_KEY, inputPrice: 3,  outputPrice: 15  },
  { label: 'claude-opus-4-6',    provider: 'claude',  claudeModel: 'claude-opus-4-6',            apiKey: CLAUDE_KEY, inputPrice: 5,  outputPrice: 25  },
];

// ── Pricing helper ────────────────────────────────────────────────────────────
function calcCost(usage, model) {
  if (!usage) return null;
  const inCost  = (usage.inputTokens / 1_000_000) * model.inputPrice;
  const outCost = (usage.outputTokens / 1_000_000) * model.outputPrice;
  return { input: inCost, output: outCost, total: inCost + outCost };
}

// ── Vocab setup ───────────────────────────────────────────────────────────────
function loadVocab() {
  const raw = JSON.parse(readFileSync('data/vocab-cache-u_95d9752cf34bd5cc.json', 'utf8'));
  const ALLOWED_STATES = new Set(['due', 'failed', 'learning', 'known', 'never-forget']);
  const vocabSet = new Set();
  const vidSet = new Set();
  const words = [];

  for (const [word, info] of Object.entries(raw.wordStateCache || {})) {
    if (!word || typeof word !== 'string') continue;
    const states = Array.isArray(info?.states) ? info.states : [];
    if (!states.some(s => ALLOWED_STATES.has(s))) continue;
    vocabSet.add(word);
    words.push(word);
    if (Number.isFinite(info?.vid)) vidSet.add(info.vid);
  }
  return { words, vocabSet, vidSet };
}

// ── JPDB validation ───────────────────────────────────────────────────────────
async function checkDialogue(dialogue, vocabSet, vidSet) {
  const entries = extractDialogueStrings(dialogue);
  const results = [];
  let totalViolations = 0;

  for (const entry of entries) {
    const result = await checkSentenceViolations(entry.text, vocabSet, JPDB_KEY, new Set(), vidSet);
    const isViolation = result.count > 1; // i+1 allows 1 unknown
    if (isViolation) totalViolations++;
    results.push({
      path: entry.path,
      text: entry.text,
      unknowns: result.unknownWords,
      count: result.count,
      violation: isViolation
    });
  }

  return { fields: results, totalViolations, totalFields: entries.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== NPC Dialogue Model Bakeoff ===\n');

  // Load vocab
  const { words, vocabSet, vidSet } = loadVocab();
  console.log(`Vocab: ${words.length} words, ${vidSet.size} vids\n`);

  // Build prompt (identical for all models)
  const card = getCharacterCard('npc_01');
  if (!card) { console.error('No character card for npc_01'); process.exit(1); }

  const { systemPrompt, userPrompt } = assemblePrompt({
    characterCard: card,
    vocabWords: words,
    jlptLevel: 'N4',
    memory: { counters: { encounters: 0 }, bond: 0, flags: { liberated: false }, encounterLog: [] },
    npcState: 'possessed',
    previousLines: []
  });

  // Output dir
  const outDir = 'data/bakeoff';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const scorecard = [];

  for (const model of MODELS) {
    console.log(`── ${model.label} ──`);
    const startMs = Date.now();

    try {
      // Generate
      const response = await chat({
        provider: model.provider,
        apiKey: model.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        customSystemPrompt: systemPrompt,
        openaiModel: model.openaiModel,
        claudeModel: model.claudeModel,
        purpose: 'npc-dialogue-bakeoff',
        returnUsage: true
      });

      const latencyMs = Date.now() - startMs;
      const { text, usage } = response;

      console.log(`  Generated in ${(latencyMs / 1000).toFixed(1)}s | tokens: ${usage?.inputTokens || '?'}in / ${usage?.outputTokens || '?'}out`);

      // Parse
      const parsed = parseDialogueJson(text);
      if (!parsed) {
        console.log('  ❌ Failed to parse JSON');
        scorecard.push({ model: model.label, error: 'JSON parse failed', latencyMs, usage });
        continue;
      }

      const shape = validateDialogueShape(parsed);
      if (!shape.valid) {
        console.log(`  ❌ Invalid shape: ${shape.errors.join(', ')}`);
        scorecard.push({ model: model.label, error: `Shape: ${shape.errors.join(', ')}`, latencyMs, usage });
        continue;
      }

      // JPDB validation
      console.log('  Validating vocab via JPDB...');
      const validation = await checkDialogue(parsed, vocabSet, vidSet);
      const cost = calcCost(usage, model);

      console.log(`  ${validation.totalViolations === 0 ? '✅' : '❌'} ${validation.totalViolations} violations in ${validation.totalFields} fields`);
      if (cost) console.log(`  Cost: $${cost.total.toFixed(6)}`);

      // Save individual result
      const result = {
        model: model.label,
        dialogue: parsed,
        rawText: text,
        latencyMs,
        usage,
        cost,
        validation: {
          totalViolations: validation.totalViolations,
          totalFields: validation.totalFields,
          fields: validation.fields
        }
      };

      writeFileSync(`${outDir}/${model.label}.json`, JSON.stringify(result, null, 2));
      scorecard.push(result);
      console.log('');

    } catch (err) {
      const latencyMs = Date.now() - startMs;
      console.log(`  ❌ Error: ${err.message}\n`);
      scorecard.push({ model: model.label, error: err.message, latencyMs });
    }
  }

  // Write scorecard
  writeScorecard(scorecard, outDir);
  console.log(`\nResults saved to ${outDir}/`);
}

function writeScorecard(results, outDir) {
  const lines = [
    '# NPC Dialogue Bakeoff — Scorecard',
    '',
    `Generated: ${new Date().toISOString()}`,
    `NPC: Yuuki (npc_01) | State: possessed | Vocab: ~2300 words`,
    '',
    '## Results',
    '',
    '| Model | Latency | In Tokens | Out Tokens | Cost | Violations | Status |',
    '|-------|---------|-----------|------------|------|------------|--------|',
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.model} | ${((r.latencyMs || 0) / 1000).toFixed(1)}s | — | — | — | — | ❌ ${r.error} |`);
      continue;
    }
    const lat = (r.latencyMs / 1000).toFixed(1);
    const inTok = r.usage?.inputTokens?.toLocaleString() || '?';
    const outTok = r.usage?.outputTokens?.toLocaleString() || '?';
    const cost = r.cost ? `$${r.cost.total.toFixed(4)}` : '?';
    const viol = `${r.validation.totalViolations}/${r.validation.totalFields}`;
    const status = r.validation.totalViolations === 0 ? '✅ clean' : `⚠️ ${r.validation.totalViolations} violations`;
    lines.push(`| ${r.model} | ${lat}s | ${inTok} | ${outTok} | ${cost} | ${viol} | ${status} |`);
  }

  lines.push('');
  lines.push('## Dialogue Comparison');
  lines.push('');

  for (const r of results) {
    if (r.error || !r.dialogue) continue;
    lines.push(`### ${r.model}`);
    lines.push('');
    lines.push(`**greeting:** ${r.dialogue.greeting}`);
    lines.push(`**defeatLine:** ${r.dialogue.defeatLine}`);
    lines.push(`**freedLine:** ${r.dialogue.freedLine}`);
    lines.push('');
    for (let i = 0; i < (r.dialogue.rounds || []).length; i++) {
      const round = r.dialogue.rounds[i];
      lines.push(`**Round ${i + 1}:** ${round.npcLine}`);
      for (const opt of round.options || []) {
        lines.push(`  - [${opt.tone}] ${opt.text}`);
      }
    }
    lines.push('');

    // Show violations if any
    const viols = (r.validation?.fields || []).filter(f => f.violation);
    if (viols.length > 0) {
      lines.push('**Violations:**');
      for (const v of viols) {
        lines.push(`  - ${v.path}: unknowns [${v.unknowns.join(', ')}]`);
      }
      lines.push('');
    }
  }

  writeFileSync(`${outDir}/scorecard.md`, lines.join('\n'));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
