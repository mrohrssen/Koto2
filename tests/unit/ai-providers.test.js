import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const modelCalls = [];
const openAiCalls = [];

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
      create: async () => ({
        content: [{ text: 'Hello.' }],
        usage: { input_tokens: 2, output_tokens: 1 }
      })
    };
  }
});

const { chat } = await import('../../src/ai-providers.js');

describe('ai provider model routing', () => {
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
  });
});
