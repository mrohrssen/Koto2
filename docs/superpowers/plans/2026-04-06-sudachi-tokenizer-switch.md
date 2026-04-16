# Sudachi Tokenizer Switch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lindera/UniDic tokenizer with SudachiPy using `dictionary_form` to fix incorrect baseForm values (こんにちは→今日は, すき→隙, はな→端).

**Architecture:** SudachiPy (Python) is called from the pre-tokenize build script via `child_process.execFileSync`. A small Python helper script accepts JSON input and returns tokenized JSON output. The Node.js `tokenize()` wrapper and tests are updated to match Sudachi's output. All dialogue files are re-tokenized.

**Tech Stack:** SudachiPy 0.6.10, sudachidict_core, Python 3, Node.js child_process

**Spec:** `docs/superpowers/specs/2026-04-06-tokenizer-and-cid-curriculum-design.md`

**Note:** This plan covers spec deliverable 1 (tokenizer switch) only. Spec deliverable 2 (CID script particle curriculum) requires a follow-up plan after the tokenizer is stable.

---

## Prerequisites

```bash
pip install sudachipy sudachidict_core
```

SudachiPy (Python 3) must be available on any machine that runs the pre-tokenize build script. This is a build-time dependency only — the game server does not call Python at runtime.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `scripts/sudachi-tokenize.py` | Create | Python helper: reads JSON lines from stdin, returns tokenized JSON |
| `src/tokenizer.js` | Rewrite | Calls Python helper via child_process instead of Lindera |
| `scripts/pre-tokenize-dialogue.js` | Minor edit | No changes needed (imports `tokenize()` which we're rewriting) |
| `tests/unit/tokenizer.test.js` | Rewrite | Update expected values for Sudachi output |
| `data/dialogue/cid-scripts.json` | Re-tokenize | Re-run pre-tokenize script |
| `data/dialogue/barks.json` | Re-tokenize | Re-run pre-tokenize script |
| `data/dialogue/npc-lines.json` | Re-tokenize | Re-run pre-tokenize script |
| `package.json` | Edit | Remove `lindera-wasm-unidic-nodejs` dependency |
| `tests/integration/bootstrap-integration.test.js` | Verify | Uses word-knowledge functions that depend on token data — must still pass |

---

## Chunk 1: Sudachi Python Helper + Node Wrapper

### Task 1: Create the Python tokenizer helper

This script reads a JSON array of strings from stdin and writes a JSON array of token arrays to stdout. Each token is `{surface, baseForm, pos, reading}` — same shape as the current Lindera output.

**Files:**
- Create: `scripts/sudachi-tokenize.py`

- [ ] **Step 1: Write the Python helper**

```python
#!/usr/bin/env python3
"""
Tokenize Japanese text using SudachiPy.
Reads: JSON array of strings from stdin
Writes: JSON array of token arrays to stdout
Each token: {surface, baseForm, pos, reading}

Uses dictionary_form for baseForm (not normalized_form).
Uses Mode A (finest granularity).
Reading is converted from katakana to hiragana.
"""
import sys
import json

def katakana_to_hiragana(text):
    return ''.join(
        chr(ord(ch) - 0x60) if '\u30A1' <= ch <= '\u30F6' else ch
        for ch in text
    )

def main():
    from sudachipy import dictionary, tokenizer
    tok = dictionary.Dictionary().create()
    mode = tokenizer.Tokenizer.SplitMode.A

    lines = json.loads(sys.stdin.read())
    results = []
    for text in lines:
        if not text or not text.strip():
            results.append([])
            continue
        tokens = tok.tokenize(text, mode)
        result = []
        for t in tokens:
            result.append({
                'surface': t.surface(),
                'baseForm': t.dictionary_form(),
                'pos': t.part_of_speech()[0],
                'reading': katakana_to_hiragana(t.reading_form()),
            })
        results.append(result)
    json.dump(results, sys.stdout, ensure_ascii=False)

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Verify the helper works standalone**

Run:
```bash
echo '["こんにちは", "私はここが好き", "行こう"]' | python3 scripts/sudachi-tokenize.py | python3 -m json.tool
```

Expected: JSON with `こんにちは` baseForm as `こんにちは` (not `今日は`), `好き` baseForm as `好き` (not `隙`), `行こう` baseForm as `行く`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sudachi-tokenize.py
git commit -m "feat: add SudachiPy tokenizer helper script"
```

### Task 2: Rewrite the Node.js tokenizer wrapper

Replace the Lindera import with a call to the Python helper via `child_process.execFileSync`. The `tokenize()` function keeps the same signature and return type.

**Files:**
- Modify: `src/tokenizer.js`

- [ ] **Step 1: Write the failing test — correct baseForm for こんにちは**

Add to `tests/unit/tokenizer.test.js`:

```javascript
it('produces correct baseForm for こんにちは (not 今日は)', () => {
    const tokens = tokenize('こんにちは');
    const greeting = tokens.find(t => t.surface === 'こんにちは');
    assert.equal(greeting.baseForm, 'こんにちは', 'baseForm should be こんにちは, not 今日は');
});

it('produces correct baseForm for 好き (not 隙)', () => {
    const tokens = tokenize('私はここが好き');
    const suki = tokens.find(t => t.surface === '好き');
    assert.equal(suki.baseForm, '好き', 'baseForm should be 好き, not 隙');
});

it('produces correct baseForm for おはよう (not 御早う)', () => {
    const tokens = tokenize('おはよう');
    const greeting = tokens.find(t => t.surface === 'おはよう');
    assert.equal(greeting.baseForm, 'おはよう', 'baseForm should be おはよう, not 御早う');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/tokenizer.test.js`
Expected: The 3 new tests FAIL (Lindera still produces 今日は, etc.)

- [ ] **Step 3: Rewrite src/tokenizer.js**

```javascript
// src/tokenizer.js
/**
 * Wraps SudachiPy for Japanese tokenization.
 * Returns: [{ surface, baseForm, pos, reading }]
 *
 * Uses dictionary_form (not normalized_form) for baseForm.
 * Calls Python helper via child_process.
 */
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = join(__dirname, '..', 'scripts', 'sudachi-tokenize.py');

/**
 * Tokenize Japanese text into normalized token objects.
 * @param {string} text - Japanese text to tokenize
 * @returns {Array<{surface: string, baseForm: string, pos: string, reading: string}>}
 */
export function tokenize(text) {
  if (!text || text.trim().length === 0) return [];

  const result = execFileSync('python3', [HELPER_PATH], {
    input: JSON.stringify([text]),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result)[0];
}
```

- [ ] **Step 4: Run full tokenizer test suite**

Run: `node --test tests/unit/tokenizer.test.js`
Expected: ALL tests pass, including the 3 new ones.

Note: Some existing tests may need updating. The existing test `'resolves conjugated forms to dictionary form'` checks `遊んで → 遊ぶ` — verify Sudachi produces this. The POS test checks for `名詞`, `助詞`, `動詞` — Sudachi uses the same major POS categories.

- [ ] **Step 5: Update any existing tests that fail due to Sudachi differences**

If any existing tests fail, update them to match Sudachi's output. The token format `{surface, baseForm, pos, reading}` is the same — only the values may differ slightly (e.g., POS subcategories).

Run: `node --test tests/unit/tokenizer.test.js`
Expected: ALL pass.

- [ ] **Step 6: Commit**

```bash
git add src/tokenizer.js tests/unit/tokenizer.test.js
git commit -m "feat: switch tokenizer from Lindera/UniDic to SudachiPy

Uses dictionary_form for correct baseForm values.
Fixes: こんにちは→今日は, すき→隙, はな→端"
```

### Task 3: Remove Lindera dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the dependency**

```bash
npm uninstall lindera-wasm-unidic-nodejs
```

- [ ] **Step 2: Run tests to verify nothing else imports it**

Run: `npm test`
Expected: All unit + integration tests pass.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove lindera-wasm-unidic-nodejs dependency"
```

---

## Chunk 2: Re-tokenize Dialogue + Validate

### Task 4: Re-tokenize all dialogue files

Run the existing pre-tokenize script, which now calls our new Sudachi-backed `tokenize()`.

**Files:**
- Modify (re-generated): `data/dialogue/cid-scripts.json`
- Modify (re-generated): `data/dialogue/barks.json`
- Modify (re-generated): `data/dialogue/npc-lines.json`

- [ ] **Step 1: Run pre-tokenize**

```bash
node scripts/pre-tokenize-dialogue.js
```

Expected output: line counts for each file, no errors.

- [ ] **Step 2: Spot-check the CID scripts for fixed baseForm values**

```bash
python3 -c "
import json
data = json.load(open('data/dialogue/cid-scripts.json'))
for script in data[:3]:
    print(f'--- {script[\"id\"]} ---')
    for line in script['lines']:
        for tok in line['_tokens']:
            if tok['surface'] in ('こんにちは', 'おはよう', 'とても', 'すき'):
                print(f'  {tok[\"surface\"]} → baseForm: {tok[\"baseForm\"]}')
"
```

Expected: `こんにちは→こんにちは`, `おはよう→おはよう`, `とても→とても` (no archaic kanji).

- [ ] **Step 3: Run dialogue validation**

```bash
node scripts/validate-dialogue.js
```

Expected: May report new errors if Sudachi's `dictionary_form` produces words not in the game dictionary. This is expected and informational — some dictionary entries may need updating to match Sudachi's forms. Note any errors for Task 5.

- [ ] **Step 4: Commit the re-tokenized dialogue**

```bash
git add data/dialogue/
git commit -m "chore: re-tokenize all dialogue with SudachiPy

Replaces Lindera/UniDic tokens with Sudachi dictionary_form.
Fixes archaic/wrong baseForm values across all dialogue files."
```

### Task 5: Fix dictionary mismatches (if any)

If `validate-dialogue.js` reported errors in Task 4 Step 3, some content words produced by Sudachi's `dictionary_form` aren't in the game's word dictionary (`data/dictionary.json`, `data/grammar-words.json`, `data/glue-words.json`).

**Files:**
- Possibly modify: `data/grammar-words.json` — update `word` field to match Sudachi output
- Possibly modify: `data/glue-words.json` — update `word` field to match Sudachi output

- [ ] **Step 1: Check validation errors**

If Task 4 Step 3 passed with 0 errors, skip this task entirely.

If there are errors, list them and update the relevant data file's `word` field to match what Sudachi produces. For example, if grammar-words has `こんにちは` but Sudachi produces `こんにちは` — that should already match. But if there's a mismatch, update the data file.

- [ ] **Step 2: Re-run validation**

```bash
node scripts/validate-dialogue.js
```

Expected: 0 errors.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add data/
git commit -m "fix: update dictionary entries to match Sudachi tokenization"
```

### Task 6: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All unit + integration tests pass.

- [ ] **Step 2: If any dialogue-filter tests fail, investigate**

The dialogue-filter tests use hand-crafted token objects, not the tokenizer. They should pass unchanged. If they don't, the token format has changed — check that `{surface, baseForm, pos, reading}` shape is preserved.

---

## Follow-up: CID Script Curriculum (separate plan required)

The CID script rewrite (spec deliverable 2: authoring new kanji-first scripts with particle teaching) depends on the tokenizer switch being complete. A follow-up plan is required and should cover:

1. Analyzing the full teachable word pool against Sudachi's `dictionary_form` values
2. Designing the script progression (which particle each script teaches)
3. Writing and tokenizing the new scripts
4. Verifying i+1 filter eligibility at various vocabulary levels
