# Claude Prompt Caching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Anthropic prompt caching to NPC dialogue generation so the shared vocab prefix is cached across multiple NPC calls for the same user, reducing input token costs by ~84%.

**Architecture:** `assemblePrompt()` returns structured blocks with cache flags. `chatWithClaude()` converts cacheable blocks into Anthropic's `cache_control` format. Other providers flatten blocks to a string. Cache metrics are logged for observability.

**Tech Stack:** Anthropic SDK (`@anthropic-ai/sdk`), Node.js ES modules, `node:test` for unit tests.

**Design doc:** `docs/plans/2026-02-14-claude-prompt-caching-design.md`

---

### Task 1: Update `assemblePrompt()` to Return Structured Blocks

**Files:**
- Modify: `src/narration-engine/prompt-assembler.js`
- Test: `tests/unit/narration-engine/prompt-assembler.test.js`

**Step 1: Write the failing tests**

Add these tests to the existing `tests/unit/narration-engine/prompt-assembler.test.js`:

```js
import { assemblePrompt, flattenSystemBlocks } from '../../../src/narration-engine/prompt-assembler.js';

// Add to the existing describe block:

it('returns systemBlocks array instead of flat systemPrompt', () => {
  const result = assemblePrompt(minimalInput);
  assert.ok(Array.isArray(result.systemBlocks), 'systemBlocks should be an array');
  assert.ok(result.systemBlocks.length >= 3, 'should have at least instructions, vocab, character');
  assert.ok(typeof result.userPrompt === 'string');
});

it('each block has label, text, and cache fields', () => {
  const result = assemblePrompt(minimalInput);
  for (const block of result.systemBlocks) {
    assert.ok(typeof block.label === 'string', `block missing label`);
    assert.ok(typeof block.text === 'string', `block ${block.label} missing text`);
    assert.ok(typeof block.cache === 'boolean', `block ${block.label} missing cache flag`);
  }
});

it('marks instructions and vocab as cacheable, others as not', () => {
  const result = assemblePrompt(minimalInput);
  const byLabel = Object.fromEntries(result.systemBlocks.map(b => [b.label, b]));
  assert.strictEqual(byLabel.instructions.cache, true);
  assert.strictEqual(byLabel.vocab.cache, true);
  assert.strictEqual(byLabel.character.cache, false);
});

it('omits empty blocks (no lorebook, no memory, no antiRepeat)', () => {
  const input = {
    ...minimalInput,
    memory: null,
    previousLines: null,
    characterCard: { ...minimalInput.characterCard, knowledge: {} }
  };
  const result = assemblePrompt(input);
  const labels = result.systemBlocks.map(b => b.label);
  assert.ok(!labels.includes('memory'), 'should omit empty memory block');
  assert.ok(!labels.includes('antiRepeat'), 'should omit empty antiRepeat block');
});

it('flattenSystemBlocks produces the same text as old concatenation', () => {
  const result = assemblePrompt(minimalInput);
  const flattened = flattenSystemBlocks(result.systemBlocks);
  // Should contain all expected content
  assert.ok(flattened.includes('食べる'), 'vocab present');
  assert.ok(flattened.includes('friendly'), 'character present');
  assert.ok(flattened.includes('Encounters'), 'memory present');
  assert.ok(flattened.includes('前のセリフ１'), 'anti-repeat present');
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/narration-engine/prompt-assembler.test.js`
Expected: Failures — `systemBlocks` is undefined, `flattenSystemBlocks` is not exported.

**Step 3: Implement the changes**

In `src/narration-engine/prompt-assembler.js`:

1. Add `flattenSystemBlocks` export:

```js
/**
 * Flatten structured blocks into a single string for non-Claude providers.
 */
export function flattenSystemBlocks(blocks) {
  return blocks.map(b => b.text).join('\n\n');
}
```

2. Change `assemblePrompt` return value. Replace the final section (lines 75-106) that builds `systemPrompt` and returns:

```js
  // Build structured blocks (empty ones filtered out)
  const systemBlocks = [
    { label: 'instructions', text: systemInstructions, cache: true },
    { label: 'vocab', text: vocabSection, cache: true },
    { label: 'character', text: characterSection, cache: false },
    lorebookSection ? { label: 'lorebook', text: lorebookSection, cache: false } : null,
    memorySection ? { label: 'memory', text: memorySection, cache: false } : null,
    antiRepSection ? { label: 'antiRepeat', text: antiRepSection, cache: false } : null
  ].filter(Boolean);

  // Layer 7: Task (user prompt)
  const userPrompt = `Generate dialogue ...`; // (unchanged)

  return { systemBlocks, userPrompt };
```

**Step 4: Update existing tests that reference `result.systemPrompt`**

The existing tests check `result.systemPrompt`. Update them to use `flattenSystemBlocks(result.systemBlocks)` instead:

```js
// OLD:
const result = assemblePrompt(minimalInput);
assert.ok(result.systemPrompt.includes('friendly'));

// NEW:
const result = assemblePrompt(minimalInput);
const flat = flattenSystemBlocks(result.systemBlocks);
assert.ok(flat.includes('friendly'));
```

Update all 7 existing tests (`returns system and user prompt strings`, `includes character personality`, `includes vocab constraints`, `includes example dialogue`, `includes memory/encounter info`, `includes anti-repetition lines`, `uses correct NPC state goal`, `defaults to possessed state`) to use `flattenSystemBlocks`.

**Step 5: Run tests to verify they pass**

Run: `node --test tests/unit/narration-engine/prompt-assembler.test.js`
Expected: All tests PASS.

**Step 6: Syntax check**

Run: `node --check src/narration-engine/prompt-assembler.js && echo "OK"`
Expected: `OK`

**Step 7: Commit**

```bash
git add src/narration-engine/prompt-assembler.js tests/unit/narration-engine/prompt-assembler.test.js
git commit -m "feat(prompt-caching): return structured blocks from assemblePrompt"
```

---

### Task 2: Thread `systemBlocks` Through the Narration Engine

**Files:**
- Modify: `src/narration-engine/index.js:131-204` (generateAndCache function)
- Modify: `src/narration-engine/generation.js:53-92` (generateDialogue function)
- Modify: `src/narration-engine/dialogue-repair.js:97-168` (enforceDialogueVocab function)
- Test: `tests/unit/narration-engine/dialogue-repair.test.js`

**Step 1: Update `generateAndCache()` in `index.js`**

At line 151, change the destructure and pass both forms:

```js
// OLD (line 151):
const { systemPrompt, userPrompt } = assemblePrompt({ ... });

// NEW:
const { systemBlocks, userPrompt } = assemblePrompt({ ... });
```

Import `flattenSystemBlocks` at top:
```js
import { assemblePrompt, flattenSystemBlocks } from './prompt-assembler.js';
```

Then at line 160 (generateDialogue call), pass both:
```js
const dialogue = await generateDialogue({
  chatFn,
  systemPrompt: flattenSystemBlocks(systemBlocks),
  systemBlocks,
  userPrompt,
  aiConfig
});
```

And at line 174 (enforceDialogueVocab call), same:
```js
const { dialogue: repairedDialogue, repaired, attempts, violations } =
  await enforceDialogueVocab({
    dialogue,
    checkViolationsFn,
    chatFn,
    systemPrompt: flattenSystemBlocks(systemBlocks),
    systemBlocks,
    userPrompt,
    aiConfig
  });
```

**Step 2: Update `generateDialogue()` in `generation.js`**

At line 53, add `systemBlocks` to the destructured params:

```js
export async function generateDialogue({
  chatFn,
  systemPrompt,
  systemBlocks,  // NEW
  userPrompt,
  aiConfig,
  maxRetries = 2
}) {
```

At line 62, pass it through to chatFn:

```js
const response = await chatFn({
  provider: aiConfig.provider,
  apiKey: aiConfig.apiKey,
  messages: [{ role: 'user', content: userPrompt }],
  customSystemPrompt: systemPrompt,
  systemBlocks,  // NEW
  openaiModel: aiConfig.openaiModel,
  openrouterModel: aiConfig.openrouterModel,
  purpose: 'npc-dialogue'
});
```

**Step 3: Update `enforceDialogueVocab()` in `dialogue-repair.js`**

At line 97, add `systemBlocks` to params:

```js
export async function enforceDialogueVocab({
  dialogue,
  checkViolationsFn,
  chatFn,
  systemPrompt,
  systemBlocks,  // NEW
  userPrompt,
  aiConfig,
  maxAttempts = 3
}) {
```

At line 125, pass it through to chatFn in the repair call:

```js
const response = await chatFn({
  provider: aiConfig.provider,
  apiKey: aiConfig.apiKey,
  messages: [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: JSON.stringify(currentDialogue, null, 2) },
    { role: 'user', content: repairInstruction }
  ],
  customSystemPrompt: systemPrompt,
  systemBlocks,  // NEW
  openaiModel: aiConfig.openaiModel,
  openrouterModel: aiConfig.openrouterModel,
  purpose: 'npc-dialogue-repair'
});
```

**Step 4: Run existing tests to confirm no breakage**

Run: `node --test tests/unit/narration-engine/dialogue-repair.test.js`
Expected: All existing tests PASS. The `systemBlocks` param is optional and existing test mocks don't pass it, which is fine — it flows through as `undefined` and non-Claude providers ignore it.

**Step 5: Syntax check all modified files**

Run: `node --check src/narration-engine/index.js && node --check src/narration-engine/generation.js && node --check src/narration-engine/dialogue-repair.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add src/narration-engine/index.js src/narration-engine/generation.js src/narration-engine/dialogue-repair.js
git commit -m "feat(prompt-caching): thread systemBlocks through narration engine"
```

---

### Task 3: Add Cache-Aware Claude Provider in `ai-providers.js`

**Files:**
- Modify: `src/ai-providers.js:154-173` (chatWithClaude function)
- Modify: `src/ai-providers.js:235-323` (chat orchestrator)

**Step 1: Update `chatWithClaude()` to accept and use `systemBlocks`**

Replace the function signature and system prompt handling (lines 154-165):

```js
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
    model: model || 'claude-sonnet-4-5-20250929',
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
```

**Step 2: Update `chat()` orchestrator to accept and pass `systemBlocks`**

At the `chat()` function signature (line 235), add `systemBlocks`:

```js
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
  claudeModel,
  customSystemPrompt,
  systemBlocks,  // NEW
  purpose = 'other',
  returnUsage = false
}) {
```

At the Claude case (line 283), pass it through:

```js
case 'claude':
case 'anthropic':
  providerResult = await chatWithClaude(apiKey, messages, systemPrompt, claudeModel, systemBlocks);
  break;
```

**Step 3: Update metrics logging to include cache info**

At lines 303-313, enhance the recordCall to include cache metrics:

```js
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
```

**Step 4: Syntax check**

Run: `node --check src/ai-providers.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add src/ai-providers.js
git commit -m "feat(prompt-caching): add cache_control support to chatWithClaude"
```

---

### Task 4: Extend `ai-metrics.js` to Track Cache Metrics

**Files:**
- Modify: `src/ai-metrics.js:75-97` (recordCall function)

**Step 1: Update `recordCall()` to accept cache fields**

At line 75, add the new params and include them in the call record:

```js
export function recordCall({ provider, model, purpose, inputTokens, outputTokens, durationMs, cacheCreationTokens, cacheReadTokens }) {
  const call = {
    timestamp: Date.now(),
    provider,
    model: model || 'unknown',
    purpose: purpose || 'other',
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    durationMs: durationMs || 0,
    cacheCreationTokens: cacheCreationTokens || 0,
    cacheReadTokens: cacheReadTokens || 0,
    estimatedCost: calculateCost(model, inputTokens, outputTokens)
  };
```

**Step 2: Update the log line (line 94) to show cache info**

```js
const cacheInfo = (call.cacheReadTokens || call.cacheCreationTokens)
  ? ` | cache: ${call.cacheReadTokens} read, ${call.cacheCreationTokens} created`
  : '';
console.log(`[AI Metrics] ${purpose} call: ${provider}/${model} - ${inputTokens}+${outputTokens} tokens${cacheInfo}, $${call.estimatedCost.toFixed(6)}, ${durationMs}ms`);
```

**Step 3: Add claude-sonnet-4-5 to MODEL_COSTS**

At line 19, add the correct model ID:

```js
'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
```

**Step 4: Syntax check**

Run: `node --check src/ai-metrics.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add src/ai-metrics.js
git commit -m "feat(prompt-caching): track cache metrics in ai-metrics"
```

---

### Task 5: Run Full Test Suite and Verify

**Step 1: Run all unit tests**

Run: `npm run test:unit`
Expected: All narration-engine tests pass. Pre-existing failures in dual-pool-pipeline and chip stats are acceptable (known issue per CLAUDE.md).

**Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: All integration tests pass.

**Step 3: Syntax check all modified files**

Run:
```bash
node --check src/narration-engine/prompt-assembler.js && \
node --check src/narration-engine/generation.js && \
node --check src/narration-engine/dialogue-repair.js && \
node --check src/narration-engine/index.js && \
node --check src/ai-providers.js && \
node --check src/ai-metrics.js && \
echo "All OK"
```
Expected: `All OK`

**Step 4: Final commit (if any fixups needed)**

Only if steps 1-3 revealed issues that needed fixing. Otherwise skip.
