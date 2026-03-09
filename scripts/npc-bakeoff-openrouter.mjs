/**
 * NPC Dialogue Model Bakeoff — Round 2: OpenRouter Top Models
 *
 * Tests 8 top OpenRouter models on the same NPC dialogue task.
 * Validates vocab compliance via JPDB and outputs a scorecard.
 *
 * Usage: node scripts/npc-bakeoff-openrouter.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { chat } from '../src/ai-providers.js';
import OpenAI from 'openai';
import { getCharacterCard } from '../src/narration-engine/character-cards.js';
import { assemblePrompt } from '../src/narration-engine/prompt-assembler.js';
import { parseDialogueJson, validateDialogueShape } from '../src/narration-engine/generation.js';
import { extractDialogueStrings } from '../src/narration-engine/dialogue-repair.js';
import { checkSentenceViolations } from '../src/game/vocab-repair.js';

// ── Keys ──────────────────────────────────────────────────────────────────────
const OR_KEY   = process.env.OPENROUTER_API_KEY || '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';
const JPDB_KEY = process.env.JPDB_API_KEY       || '20f5c1eaca42aa0db43096084d1ff057';

// ── Models to test ────────────────────────────────────────────────────────────
const ALL_MODELS = [
  { label: 'deepseek-r1t2-chimera',  openrouterModel: 'tngtech/deepseek-r1t2-chimera',       inputPrice: 0.25,  outputPrice: 0.85  },
  { label: 'mimo-v2-flash',          openrouterModel: 'xiaomi/mimo-v2-flash',                 inputPrice: 0.09,  outputPrice: 0.29  },
  { label: 'deepseek-v3.2',          openrouterModel: 'deepseek/deepseek-v3.2',               inputPrice: 0.25,  outputPrice: 0.38  },
  { label: 'deepseek-v3-0324',       openrouterModel: 'deepseek/deepseek-chat-v3-0324',       inputPrice: 0.19,  outputPrice: 0.87  },
  { label: 'deepseek-r1t-chimera',   openrouterModel: 'tngtech/deepseek-r1t-chimera',         inputPrice: 0.30,  outputPrice: 1.20  },
  { label: 'deepseek-r1-0528',       openrouterModel: 'deepseek/deepseek-r1-0528',            inputPrice: 0.40,  outputPrice: 1.75  },
  { label: 'trinity-large-preview',  openrouterModel: 'arcee-ai/trinity-large-preview:free',   inputPrice: 0,     outputPrice: 0     },
  { label: 'glm-4.5-air',            openrouterModel: 'z-ai/glm-4.5-air',                     inputPrice: 0.13,  outputPrice: 0.85  },
];

// Filter to specific models via CLI arg: node script.mjs --only=model1,model2
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const MODELS = onlyArg
  ? ALL_MODELS.filter(m => onlyArg.slice(7).split(',').includes(m.label))
  : ALL_MODELS;

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
    const isViolation = result.count > 1;
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
  console.log('=== NPC Dialogue Bakeoff — Round 2: OpenRouter ===\n');

  const { words, vocabSet, vidSet } = loadVocab();
  console.log(`Vocab: ${words.length} words, ${vidSet.size} vids\n`);

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

  const outDir = 'data/bakeoff-r2';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const scorecard = [];

  for (const model of MODELS) {
    console.log(`── ${model.label} ──`);
    const startMs = Date.now();

    try {
      // Call OpenRouter directly with generous max_tokens (prompt alone is ~10k tokens)
      const client = new OpenAI({ apiKey: OR_KEY, baseURL: 'https://openrouter.ai/api/v1' });
      const orResponse = await client.chat.completions.create({
        model: model.openrouterModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 16384
      });

      const latencyMs = Date.now() - startMs;
      const text = orResponse.choices[0]?.message?.content || '';
      const usage = orResponse.usage ? {
        inputTokens: orResponse.usage.prompt_tokens || 0,
        outputTokens: orResponse.usage.completion_tokens || 0
      } : null;

      console.log(`  Generated in ${(latencyMs / 1000).toFixed(1)}s | tokens: ${usage?.inputTokens || '?'}in / ${usage?.outputTokens || '?'}out`);
      console.log(`  Raw text length: ${(text || '').length} chars`);

      // Strip <think>...</think> reasoning tokens from R1 models, and stray markdown fences
      let cleanedText = text || '';
      cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

      // Parse JSON
      const parsed = parseDialogueJson(cleanedText);
      if (!parsed) {
        console.log(`  ❌ Failed to parse JSON`);
        // Save raw text for debugging
        writeFileSync(`${outDir}/${model.label}-raw.txt`, text || '(empty)');
        scorecard.push({ model: model.label, error: 'JSON parse failed', latencyMs, usage, cost: calcCost(usage, model) });
        continue;
      }

      const shape = validateDialogueShape(parsed);
      if (!shape.valid) {
        console.log(`  ❌ Invalid shape: ${shape.errors.join(', ')}`);
        writeFileSync(`${outDir}/${model.label}-raw.txt`, text || '(empty)');
        scorecard.push({ model: model.label, error: `Shape: ${shape.errors.join(', ')}`, latencyMs, usage, cost: calcCost(usage, model) });
        continue;
      }

      // JPDB validation
      console.log('  Validating vocab via JPDB...');
      const validation = await checkDialogue(parsed, vocabSet, vidSet);
      const cost = calcCost(usage, model);

      console.log(`  ${validation.totalViolations === 0 ? '✅' : '⚠️ '} ${validation.totalViolations} violations in ${validation.totalFields} fields`);
      if (cost) console.log(`  Cost: $${cost.total.toFixed(6)}`);

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
      scorecard.push({ model: model.label, error: err.message, latencyMs, cost: null });
    }
  }

  // Write scorecard
  writeScorecard(scorecard, outDir);

  // Also write combined scorecard with round 1 results if available
  writeCombinedScorecard(scorecard, outDir);

  console.log(`\nResults saved to ${outDir}/`);
}

function writeScorecard(results, outDir) {
  const lines = [
    '# NPC Dialogue Bakeoff Round 2 — OpenRouter Models',
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
      const costStr = r.cost ? `$${r.cost.total.toFixed(4)}` : '—';
      lines.push(`| ${r.model} | ${((r.latencyMs || 0) / 1000).toFixed(1)}s | ${r.usage?.inputTokens?.toLocaleString() || '—'} | ${r.usage?.outputTokens?.toLocaleString() || '—'} | ${costStr} | — | ❌ ${r.error} |`);
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

function writeCombinedScorecard(r2Results, outDir) {
  // Try to load round 1 results
  const r1Dir = 'data/bakeoff';
  const r1Models = ['gpt-5-mini', 'gpt-5.2', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-6'];
  const allResults = [];

  for (const name of r1Models) {
    try {
      const data = JSON.parse(readFileSync(`${r1Dir}/${name}.json`, 'utf8'));
      allResults.push(data);
    } catch { /* skip missing */ }
  }

  allResults.push(...r2Results);

  // Sort by cost
  const scored = allResults.filter(r => !r.error && r.cost);
  scored.sort((a, b) => (a.cost?.total || 999) - (b.cost?.total || 999));

  const lines = [
    '# Combined Bakeoff — All Models Ranked by Cost',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Rank | Model | Latency | Cost | Violations | Monthly (2 NPCs/day) |',
    '|------|-------|---------|------|------------|---------------------|',
  ];

  for (let i = 0; i < scored.length; i++) {
    const r = scored[i];
    const lat = (r.latencyMs / 1000).toFixed(1);
    const cost = `$${r.cost.total.toFixed(4)}`;
    const viol = `${r.validation.totalViolations}/${r.validation.totalFields}`;
    const monthly = `$${(r.cost.total * 2 * 30).toFixed(2)}`;
    lines.push(`| ${i + 1} | ${r.model} | ${lat}s | ${cost} | ${viol} | ${monthly} |`);
  }

  // Add failed models at bottom
  const failed = allResults.filter(r => r.error);
  if (failed.length > 0) {
    lines.push('');
    lines.push('**Failed:**');
    for (const r of failed) {
      const costStr = r.cost ? ` ($${r.cost.total.toFixed(4)} spent)` : '';
      lines.push(`- ${r.model}: ${r.error}${costStr}`);
    }
  }

  writeFileSync(`${outDir}/combined-scorecard.md`, lines.join('\n'));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
