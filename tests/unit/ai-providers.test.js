import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const modelCalls = [];
const openAiCalls = [];
const anthropicCalls = [];

await mock.module('@google/generative-ai', {
  namedExports: {
    GoogleGenerativeAI: class {
      constructor(apiKey) { this.apiKey = apiKey; }
      getGenerativeModel(args) {
        modelCalls.push(args);
        return {
          startChat() {
            return {
              async sendMessage() {
                return {
                  response: {
                    text: () => 'Hello.',
                    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 }
                  }
                };
              }
            };
          }
        };
      }
    }
  }
});

await mock.module('openai', {
  defaultExport: class {
    constructor(args) { this.args = args; }
    chat = {
      completions: {
        create: async (params) => {
          openAiCalls.push(params);
          return {
            choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 2, completion_tokens: 1 }
          };
        }
      }
    };
  }
});

await mock.module('@anthropic-ai/sdk', {
  defaultExport: class {
    messages = {
      create: async (params) => {
        anthropicCalls.push(params);
        return {
          content: [{ text: 'Hello.' }],
          usage: { input_tokens: 2, output_tokens: 1 }
        };
      }
    };
  }
});

const { chat } = await import('../../src/ai-providers.js');

describe('ai provider model routing', () => {
  beforeEach(() => {
    modelCalls.length = 0;
    openAiCalls.length = 0;
    anthropicCalls.length = 0;
  });

  it('passes configured Gemini model into GoogleGenerativeAI', async () => {
    const result = await chat({
      provider: 'gemini',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'こんにちは。' }],
      customSystemPrompt: 'Translate.',
      geminiModel: 'gemini-2.0-flash',
      purpose: 'dialogue-translation'
    });

    assert.equal(result, 'Hello.');
    assert.equal(modelCalls.at(-1).model, 'gemini-2.0-flash');
  });

  it('uses low temperature for non-reasoning OpenAI dialogue translation calls', async () => {
    await chat({
      provider: 'openai',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'こんにちは。' }],
      customSystemPrompt: 'Translate.',
      openaiModel: 'gpt-4o-mini',
      purpose: 'dialogue-translation'
    });

    assert.equal(openAiCalls.at(-1).temperature, 0.1);
    assert.equal(openAiCalls.at(-1).max_tokens, 500);
  });

  it('uses a larger OpenAI output budget for dialogue learn lessons', async () => {
    await chat({
      provider: 'openai',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'Build a lesson.' }],
      customSystemPrompt: 'Return JSON.',
      openaiModel: 'gpt-4o-mini',
      purpose: 'dialogue-learn'
    });

    assert.equal(openAiCalls.at(-1).max_tokens, 2500);
  });

  it('uses a larger Anthropic output budget for dialogue learn lessons', async () => {
    await chat({
      provider: 'anthropic',
      apiKey: 'key',
      messages: [{ role: 'user', content: 'Build a lesson.' }],
      customSystemPrompt: 'Return JSON.',
      claudeModel: 'claude-3-5-haiku-latest',
      purpose: 'dialogue-learn'
    });

    assert.equal(anthropicCalls.at(-1).max_tokens, 2500);
  });
});
