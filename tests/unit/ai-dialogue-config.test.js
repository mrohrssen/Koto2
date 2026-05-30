import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiDialogueConfig,
  isAiConversationsEnabled,
  canUseAiDialogue
} from '../../src/ai-dialogue/config.js';

describe('AI dialogue config', () => {
  it('returns null unless provider, api key, and model are all present', () => {
    assert.equal(buildAiDialogueConfig({}), null);
    assert.equal(buildAiDialogueConfig({
      AI_DIALOGUE_PROVIDER: 'openai',
      AI_DIALOGUE_API_KEY: 'sk-test'
    }), null);
  });

  it('maps OpenAI model to openaiModel', () => {
    assert.deepEqual(buildAiDialogueConfig({
      AI_DIALOGUE_PROVIDER: 'openai',
      AI_DIALOGUE_API_KEY: 'sk-test',
      AI_DIALOGUE_MODEL: 'gpt-5-mini'
    }), {
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      openaiModel: 'gpt-5-mini'
    });
  });

  it('maps Anthropic and Google model fields for narration callers', () => {
    assert.equal(buildAiDialogueConfig({
      AI_DIALOGUE_PROVIDER: 'anthropic',
      AI_DIALOGUE_API_KEY: 'claude-key',
      AI_DIALOGUE_MODEL: 'claude-sonnet-4-6'
    }).claudeModel, 'claude-sonnet-4-6');

    assert.equal(buildAiDialogueConfig({
      AI_DIALOGUE_PROVIDER: 'google',
      AI_DIALOGUE_API_KEY: 'gemini-key',
      AI_DIALOGUE_MODEL: 'gemini-1.5-flash'
    }).geminiModel, 'gemini-1.5-flash');
  });

  it('defaults AI conversations enabled unless explicitly false', () => {
    assert.equal(isAiConversationsEnabled({}), true);
    assert.equal(isAiConversationsEnabled({ aiConversationsEnabled: true }), true);
    assert.equal(isAiConversationsEnabled({ aiConversationsEnabled: false }), false);
  });

  it('requires consent, toggle, and configured env to use AI dialogue', () => {
    const config = buildAiDialogueConfig({
      AI_DIALOGUE_PROVIDER: 'openai',
      AI_DIALOGUE_API_KEY: 'sk-test',
      AI_DIALOGUE_MODEL: 'gpt-5-mini'
    });

    assert.equal(canUseAiDialogue({ aiDataSharingConsent: true }, config), true);
    assert.equal(canUseAiDialogue({ aiDataSharingConsent: false }, config), false);
    assert.equal(canUseAiDialogue({
      aiDataSharingConsent: true,
      aiConversationsEnabled: false
    }, config), false);
    assert.equal(canUseAiDialogue({ aiDataSharingConsent: true }, null), false);
  });
});
