/**
 * AI Metrics Tracking
 * Tracks all AI API calls for cost/performance analysis
 *
 * @module @jchat/shared/ai/metrics
 */

// Approximate costs per 1M tokens (input/output)
const MODEL_COSTS = {
  // OpenAI
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-5': { input: 1.25, output: 10.00 },
  // Claude
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  // Gemini
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  // OpenRouter - varies by model, use approximations
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'default': { input: 1.00, output: 4.00 }
};

// Session metrics storage
let sessionMetrics = {
  startTime: Date.now(),
  calls: [],
  totals: {
    narration: 0,
    vocabRepair: 0,
    chat: 0,
    other: 0
  }
};

/**
 * Estimate token count from text
 * Rough estimate: ~4 chars per token for English, ~2 for Japanese
 */
export function estimateTokens(text) {
  if (!text) return 0;
  // Check if primarily Japanese (has hiragana/katakana/kanji)
  const japaneseChars = (text.match(/[\u3040-\u30ff\u4e00-\u9faf]/g) || []).length;
  const ratio = japaneseChars / text.length;

  // Japanese-heavy text: ~1.5 chars/token, English: ~4 chars/token
  const charsPerToken = ratio > 0.3 ? 1.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Calculate estimated cost for a call
 */
function calculateCost(model, inputTokens, outputTokens) {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['default'];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Record an AI API call
 * @param {object} options
 * @param {string} options.provider - AI provider (openai, claude, etc.)
 * @param {string} options.model - Model ID
 * @param {string} options.purpose - What the call is for (narration, vocabRepair, chat)
 * @param {number} options.inputTokens - Estimated input tokens
 * @param {number} options.outputTokens - Estimated output tokens
 * @param {number} options.durationMs - Call duration in milliseconds
 */
export function recordCall({ provider, model, purpose, inputTokens, outputTokens, durationMs }) {
  const call = {
    timestamp: Date.now(),
    provider,
    model: model || 'unknown',
    purpose: purpose || 'other',
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    durationMs: durationMs || 0,
    estimatedCost: calculateCost(model, inputTokens, outputTokens)
  };

  sessionMetrics.calls.push(call);

  // Update totals
  const purposeKey = purpose in sessionMetrics.totals ? purpose : 'other';
  sessionMetrics.totals[purposeKey]++;

  // Log for debugging
  console.log(`[AI Metrics] ${purpose} call: ${provider}/${model} - ${inputTokens}+${outputTokens} tokens, $${call.estimatedCost.toFixed(6)}, ${durationMs}ms`);

  return call;
}

/**
 * Get session metrics summary
 */
export function getMetricsSummary() {
  const duration = Date.now() - sessionMetrics.startTime;
  const totalCalls = sessionMetrics.calls.length;
  const totalCost = sessionMetrics.calls.reduce((sum, c) => sum + c.estimatedCost, 0);
  const totalInputTokens = sessionMetrics.calls.reduce((sum, c) => sum + c.inputTokens, 0);
  const totalOutputTokens = sessionMetrics.calls.reduce((sum, c) => sum + c.outputTokens, 0);
  const avgLatency = totalCalls > 0
    ? sessionMetrics.calls.reduce((sum, c) => sum + c.durationMs, 0) / totalCalls
    : 0;

  // Group by purpose
  const byPurpose = {};
  for (const call of sessionMetrics.calls) {
    if (!byPurpose[call.purpose]) {
      byPurpose[call.purpose] = { count: 0, cost: 0, tokens: 0 };
    }
    byPurpose[call.purpose].count++;
    byPurpose[call.purpose].cost += call.estimatedCost;
    byPurpose[call.purpose].tokens += call.inputTokens + call.outputTokens;
  }

  // Group by model
  const byModel = {};
  for (const call of sessionMetrics.calls) {
    if (!byModel[call.model]) {
      byModel[call.model] = { count: 0, cost: 0 };
    }
    byModel[call.model].count++;
    byModel[call.model].cost += call.estimatedCost;
  }

  return {
    sessionDurationMs: duration,
    sessionDurationMin: (duration / 60000).toFixed(1),
    totalCalls,
    totalCost: totalCost.toFixed(6),
    totalInputTokens,
    totalOutputTokens,
    avgLatencyMs: avgLatency.toFixed(0),
    byPurpose,
    byModel,
    callsPerMinute: totalCalls > 0 ? (totalCalls / (duration / 60000)).toFixed(2) : 0,
    recentCalls: sessionMetrics.calls.slice(-10).reverse()
  };
}

/**
 * Reset metrics (e.g., for a new game run)
 */
export function resetMetrics() {
  sessionMetrics = {
    startTime: Date.now(),
    calls: [],
    totals: {
      narration: 0,
      vocabRepair: 0,
      chat: 0,
      other: 0
    }
  };
  console.log('[AI Metrics] Metrics reset');
}

/**
 * Helper to estimate tokens from messages array
 */
export function estimateMessagesTokens(messages, systemPrompt) {
  let total = estimateTokens(systemPrompt);
  for (const msg of messages) {
    total += estimateTokens(msg.content);
  }
  return total;
}
