import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'public/game.css'), 'utf8');

// Extract a CSS rule body by selector. Returns the text between the matching
// `{` and its `}` or null if the selector is not present.
function ruleBody(source, selector) {
  const idx = source.indexOf(selector);
  if (idx === -1) return null;
  const open = source.indexOf('{', idx);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return source.slice(open + 1, i - 1);
}

test('.game-app does not apply safe-area-inset-top padding', () => {
  const body = ruleBody(css, '.game-app {');
  assert.ok(body, '.game-app rule not found');
  assert.doesNotMatch(
    body,
    /padding-top:\s*env\(\s*safe-area-inset-top/,
    '.game-app should not pad for the top safe area — content must reach y=0'
  );
});

test('.area-header-pill uses safe-area insets', () => {
  const body = ruleBody(css, '.area-header-pill {');
  assert.ok(body, '.area-header-pill rule not found');
  assert.match(
    body,
    /top:\s*env\(\s*safe-area-inset-top/,
    '.area-header-pill should offset top by the safe area inset'
  );
  assert.match(
    body,
    /padding-left:\s*max\(\s*12px\s*,\s*env\(\s*safe-area-inset-left/,
    '.area-header-pill should pad its left by at least 12px, honoring safe-area-inset-left'
  );
  assert.match(
    body,
    /padding-right:\s*max\(\s*12px\s*,\s*env\(\s*safe-area-inset-right/,
    '.area-header-pill should pad its right by at least 12px, honoring safe-area-inset-right'
  );
});
