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
 * Build the system prompt with vocabulary and grammar constraints
 */
export function buildSystemPrompt(vocabulary, jlptLevel, personaName, personaDescription) {
  const grammarGuide = JLPT_GRAMMAR[jlptLevel] || JLPT_GRAMMAR.N5;

  // Limit vocabulary to prevent exceeding context window
  const MAX_VOCAB = 10000;
  const limitedVocab = vocabulary.length > MAX_VOCAB
    ? vocabulary.slice(0, MAX_VOCAB)
    : vocabulary;

  const vocabList = limitedVocab.join(', ');

  return `You are ${personaName || 'a friendly Japanese conversation partner'}.
${personaDescription ? `Personality: ${personaDescription}` : 'You are warm, patient, and encouraging.'}

You are chatting with a Japanese language learner.

=== ABSOLUTE VOCABULARY RESTRICTION ===

You may ONLY use Japanese words from this exact list:
${vocabList || '(No vocabulary loaded)'}

RULES:
1. ONLY use words from the list above. NO EXCEPTIONS.
2. If a word is not in the list, DO NOT use it.
3. Basic particles are allowed: は, が, を, に, で, へ, と, も, の, か, よ, ね, や, から, まで, より
4. Numbers and punctuation are allowed.
5. If you cannot express something with allowed words, simplify or skip that idea.
6. Keep responses short (2-4 sentences).

GRAMMAR LEVEL: JLPT ${jlptLevel}
${grammarGuide}

CRITICAL: Before sending your response, verify EVERY Japanese word is in the allowed list. If unsure, use a simpler word or don't include that part.`;
}

/**
 * OpenAI Provider
 */
async function chatWithOpenAI(apiKey, messages, systemPrompt, model) {
  const client = new OpenAI({ apiKey });

  const modelId = model || 'gpt-4o-mini';
  const isReasoningModel = modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('gpt-5');

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

  return content;
}

/**
 * Claude (Anthropic) Provider
 */
async function chatWithClaude(apiKey, messages, systemPrompt) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  });

  return response.content[0]?.text || '';
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

  return result.response.text();
}

/**
 * OpenRouter Provider
 */
async function chatWithOpenRouter(apiKey, messages, systemPrompt, model) {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  const response = await client.chat.completions.create({
    model: model || 'anthropic/claude-3.5-sonnet',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Main chat function - routes to appropriate provider
 */
export async function chat({
  provider,
  apiKey,
  messages,
  vocabulary,
  jlptLevel = 'N5',
  personaName,
  personaDescription,
  openrouterModel,
  openaiModel,
  customSystemPrompt,
  purpose = 'other'
}) {
  if (!apiKey) {
    throw new Error(`API key required for ${provider}`);
  }

  if (!messages || messages.length === 0) {
    throw new Error('Messages array is required');
  }

  const systemPrompt = customSystemPrompt || buildSystemPrompt(vocabulary, jlptLevel, personaName, personaDescription);

  // Determine model for metrics
  let model;
  switch (provider.toLowerCase()) {
    case 'openai': model = openaiModel || 'gpt-4o-mini'; break;
    case 'claude':
    case 'anthropic': model = 'claude-sonnet-4-20250514'; break;
    case 'gemini':
    case 'google': model = 'gemini-1.5-flash'; break;
    case 'openrouter': model = openrouterModel || 'anthropic/claude-3.5-sonnet'; break;
    default: model = 'unknown';
  }

  const inputTokens = estimateMessagesTokens(messages, systemPrompt);
  const startTime = Date.now();

  try {
    let result;
    switch (provider.toLowerCase()) {
      case 'openai':
        result = await chatWithOpenAI(apiKey, messages, systemPrompt, openaiModel);
        break;

      case 'claude':
      case 'anthropic':
        result = await chatWithClaude(apiKey, messages, systemPrompt);
        break;

      case 'gemini':
      case 'google':
        result = await chatWithGemini(apiKey, messages, systemPrompt);
        break;

      case 'openrouter':
        result = await chatWithOpenRouter(apiKey, messages, systemPrompt, openrouterModel);
        break;

      default:
        throw new Error(`Unknown provider: ${provider}. Use 'openai', 'claude', 'gemini', or 'openrouter'`);
    }

    // Record metrics
    const durationMs = Date.now() - startTime;
    const outputTokens = estimateTokens(result);
    recordCall({
      provider,
      model,
      purpose,
      inputTokens,
      outputTokens,
      durationMs
    });

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
 * Get available OpenAI models
 */
export function getOpenAIModels() {
  return [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast, Cheap)', description: '$0.15/$0.60 per 1M tokens' },
    { id: 'gpt-4o', name: 'GPT-4o (Balanced)', description: '$2.50/$10 per 1M tokens' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: '$0.40/$1.60 per 1M tokens' },
    { id: 'gpt-4.1', name: 'GPT-4.1', description: '$2/$8 per 1M tokens' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano (Reasoning)', description: '$0.05/$0.40 per 1M tokens' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Reasoning)', description: '$0.25/$2 per 1M tokens' },
    { id: 'gpt-5', name: 'GPT-5 (Reasoning)', description: '$1.25/$10 per 1M tokens' }
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
