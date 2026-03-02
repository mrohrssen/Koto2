/**
 * AI Provider Integration Module
 *
 * Provides a unified interface for multiple AI providers:
 * - OpenAI (GPT-4o, GPT-4o-mini, GPT-5 series)
 * - Anthropic Claude (Sonnet 4)
 * - Google Gemini (1.5 Flash)
 * - OpenRouter (any model via API gateway)
 *
 * @module @jchat/shared/ai/providers
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { recordCall, estimateTokens, estimateMessagesTokens } from './ai-metrics.js';

// JLPT Grammar Level Descriptions
export const JLPT_GRAMMAR = {
  N5: `Basic grammar only:
- です/ます polite forms
- Basic particles: は, が, を, に, で, へ, と, も, か
- て-form connections
- Basic い and な adjectives
- ある/いる existence
- Simple past tense (-ました, -ました)
- Basic questions with か
- Numbers and counters`,

  N4: `N5 grammar plus:
- Potential form (~ことができる, ~られる/~える)
- Volitional form (~ましょう, ~よう)
- て-form extensions (ている, てある, ておく)
- Conditionals: たら, ば, と
- Giving/receiving: あげる, もらう, くれる
- ~たい (want to)
- ~なければならない (must)
- Comparisons: より, ほど, 一番`,

  N3: `N4 grammar plus:
- Passive voice (~られる)
- Causative form (~させる)
- Causative-passive (~させられる)
- Formal expressions: ございます, ~でございます
- Complex conditionals: としたら, にしても
- ~ようにする, ~ようになる
- ~ことにする, ~ことになる
- Embedded clauses and nominalization`,

  N2: `N3 grammar plus:
- Written/formal style expressions
- Advanced conjunctions: にもかかわらず, にしたがって, につれて
- Honorific speech (尊敬語): お~になる, ~れる/られる
- Humble speech (謙譲語): お~する, ~いたす
- ~わけ expressions
- ~ものだ, ~ことだ
- ~に関して, ~において, ~に対して`,

  N1: `All grammar including:
- Literary and classical forms
- Formal written expressions: ~ざるを得ない, ~んばかり
- Nuanced expressions: ~てやまない, ~に足る
- Classical auxiliary verbs influence
- Complex embedded structures
- Stylistic variations and registers`
};

/**
 * OpenAI Provider
 */
async function chatWithOpenAI(apiKey, messages, systemPrompt, model) {
  const client = new OpenAI({ apiKey });

  const modelId = model || 'gpt-5-mini';
  const isReasoningModel = modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4') || modelId.startsWith('gpt-5');

  const params = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ]
  };

  // Reasoning models don't support temperature and use max_completion_tokens
  if (isReasoningModel) {
    params.max_completion_tokens = 10000;
  } else {
    params.temperature = 0.7;
    params.max_tokens = 500;
  }

  const response = await client.chat.completions.create(params);

  let content = response.choices[0]?.message?.content || '';

  // Clean up markdown formatting from reasoning models
  if (isReasoningModel) {
    content = content.replace(/\s*\n\s*/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  const usage = response.usage ? {
    inputTokens: response.usage.prompt_tokens || 0,
    outputTokens: response.usage.completion_tokens || 0
  } : null;

  return { text: content, usage };
}

/**
 * Claude (Anthropic) Provider
 */
async function chatWithClaude(apiKey, messages, systemPrompt, model, systemBlocks) {
  const client = new Anthropic({ apiKey });

  // Build system: structured blocks with cache_control for Claude, or flat string
  let system;
  if (systemBlocks && systemBlocks.length > 0) {
    const filtered = systemBlocks.filter(b => b.text);
    // Find the index of the last cacheable block
    let lastCacheIdx = -1;
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (filtered[i].cache) { lastCacheIdx = i; break; }
    }
    system = filtered.map((block, i) => {
      const entry = { type: 'text', text: block.text };
      if (i === lastCacheIdx) {
        entry.cache_control = { type: 'ephemeral' };
      }
      return entry;
    });
  } else {
    system = systemPrompt;
  }

  const response = await client.messages.create({
    model: model || 'claude-sonnet-4-6',
    max_tokens: 500,
    system,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  });

  const usage = response.usage ? {
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens || 0,
    cacheReadTokens: response.usage.cache_read_input_tokens || 0
  } : null;

  return { text: response.content[0]?.text || '', usage };
}

/**
 * Gemini (Google) Provider
 */
async function chatWithGemini(apiKey, messages, systemPrompt) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const chat = model.startChat({
    history: messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    systemInstruction: systemPrompt
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage?.content || 'Hello');

  const meta = result.response.usageMetadata;
  const usage = meta ? {
    inputTokens: meta.promptTokenCount || 0,
    outputTokens: meta.candidatesTokenCount || 0
  } : null;

  return { text: result.response.text(), usage };
}

/**
 * OpenRouter Provider
 */
async function chatWithOpenRouter(apiKey, messages, systemPrompt, model) {
  if (!model) {
    throw new Error('OpenRouter requires a model to be specified in settings (e.g. "tngtech/deepseek-r1t2-chimera")');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ],
    temperature: 0.7,
    max_tokens: 4096
  });

  const finishReason = response.choices[0]?.finish_reason;
  if (finishReason === 'length') {
    console.warn(`[OpenRouter] Response truncated (finish_reason=length, model=${model}, output_tokens=${response.usage?.completion_tokens || '?'})`);
  }

  const usage = response.usage ? {
    inputTokens: response.usage.prompt_tokens || 0,
    outputTokens: response.usage.completion_tokens || 0
  } : null;

  return { text: response.choices[0]?.message?.content || '', usage };
}

/**
 * Main chat function - routes to appropriate provider
 */
export async function chat({
  provider,
  apiKey,
  messages,
  openrouterModel,
  openaiModel,
  claudeModel,
  customSystemPrompt,
  systemBlocks,
  purpose = 'other',
  returnUsage = false
}) {
  if (!provider) {
    throw new Error('AI provider is required — configure it in Settings');
  }

  if (!apiKey) {
    throw new Error(`API key required for ${provider}`);
  }

  if (!messages || messages.length === 0) {
    throw new Error('Messages array is required');
  }

  if (!customSystemPrompt) {
    throw new Error('customSystemPrompt is required');
  }
  const systemPrompt = customSystemPrompt;

  // Determine model for metrics
  let model;
  switch (provider.toLowerCase()) {
    case 'openai': model = openaiModel || 'gpt-5-mini'; break;
    case 'claude':
    case 'anthropic': model = claudeModel || 'claude-sonnet-4-6'; break;
    case 'gemini':
    case 'google': model = 'gemini-1.5-flash'; break;
    case 'openrouter': model = openrouterModel || 'unknown-openrouter'; break;
    default: model = 'unknown';
  }

  const inputTokens = estimateMessagesTokens(messages, systemPrompt);
  const startTime = Date.now();

  try {
    let providerResult;
    switch (provider.toLowerCase()) {
      case 'openai':
        providerResult = await chatWithOpenAI(apiKey, messages, systemPrompt, openaiModel);
        break;

      case 'claude':
      case 'anthropic':
        providerResult = await chatWithClaude(apiKey, messages, systemPrompt, claudeModel, systemBlocks);
        break;

      case 'gemini':
      case 'google':
        providerResult = await chatWithGemini(apiKey, messages, systemPrompt);
        break;

      case 'openrouter':
        providerResult = await chatWithOpenRouter(apiKey, messages, systemPrompt, openrouterModel);
        break;

      default:
        throw new Error(`Unknown provider: ${provider}. Use 'openai', 'claude', 'gemini', or 'openrouter'`);
    }

    const { text: result, usage: actualUsage } = providerResult;

    // Record metrics (prefer actual usage from API, fall back to estimates)
    const durationMs = Date.now() - startTime;
    const outputTokens = actualUsage?.outputTokens ?? estimateTokens(result);
    const finalInputTokens = actualUsage?.inputTokens ?? inputTokens;
    recordCall({
      provider,
      model,
      purpose,
      inputTokens: finalInputTokens,
      outputTokens,
      durationMs,
      cacheCreationTokens: actualUsage?.cacheCreationTokens || 0,
      cacheReadTokens: actualUsage?.cacheReadTokens || 0
    });

    if (returnUsage) {
      return { text: result, usage: actualUsage || { inputTokens: finalInputTokens, outputTokens } };
    }
    return result;
  } catch (error) {
    console.error(`${provider} API error:`, error);
    throw error;
  }
}

/**
 * Get available providers
 */
export function getProviders() {
  return [
    { id: 'openai', name: 'OpenAI' },
    { id: 'claude', name: 'Claude (Sonnet)' },
    { id: 'gemini', name: 'Gemini (1.5 Flash)' },
    { id: 'openrouter', name: 'OpenRouter (Custom Model)' }
  ];
}

/**
 * Get JLPT levels
 */
export function getJLPTLevels() {
  return [
    { id: 'N5', name: 'N5 (Beginner)', description: 'Basic grammar, simple sentences' },
    { id: 'N4', name: 'N4 (Elementary)', description: 'Everyday grammar, potential form' },
    { id: 'N3', name: 'N3 (Intermediate)', description: 'Passive, causative, formal expressions' },
    { id: 'N2', name: 'N2 (Upper-Intermediate)', description: 'Advanced conjunctions, keigo' },
    { id: 'N1', name: 'N1 (Advanced)', description: 'Literary forms, nuanced expressions' }
  ];
}
