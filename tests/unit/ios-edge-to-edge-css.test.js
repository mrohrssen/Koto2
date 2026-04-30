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

test('.area-header-pill paints at top of screen and honors horizontal safe-area insets', () => {
  const body = ruleBody(css, '.area-header-pill {');
  assert.ok(body, '.area-header-pill rule not found');
  // Native status bar is hidden + WKWebView is edge-to-edge, so chips
  // paint from y=0. The Dynamic Island is centered and the chips are
  // left/right-aligned, so they don't collide with it.
  assert.match(
    body,
    /(?:^|\s|;)top:\s*0\s*;/,
    '.area-header-pill should paint at top:0 (native status bar is hidden)'
  );
  assert.doesNotMatch(
    body,
    /top:\s*env\(\s*safe-area-inset-top/,
    '.area-header-pill should NOT offset by safe-area-inset-top — status bar is hidden'
  );
  assert.match(
    body,
    /padding-left:\s*max\(\s*22px\s*,\s*env\(\s*safe-area-inset-left/,
    '.area-header-pill should pad its left by at least 22px (clear of phone bezel), honoring safe-area-inset-left'
  );
  assert.match(
    body,
    /padding-right:\s*max\(\s*22px\s*,\s*env\(\s*safe-area-inset-right/,
    '.area-header-pill should pad its right by at least 22px (clear of phone bezel), honoring safe-area-inset-right'
  );
});

test('.ui-btn keeps extra bottom padding for tokenized Japanese labels', () => {
  const body = ruleBody(css, '.ui-btn {');
  assert.ok(body, '.ui-btn rule not found');
  assert.match(
    body,
    /padding:\s*14px\s+20px\s+28px\s*;/,
    '.ui-btn should reserve bottom space for renderJpSentence glosses'
  );
});

test('.ui-btn centers plain labels vertically', () => {
  const body = ruleBody(css, '.ui-btn:not(:has(.jp-word)) {');
  assert.ok(body, '.ui-btn:not(:has(.jp-word)) rule not found');
  assert.match(body, /(?:^|\s|;)display:\s*(?:inline-)?flex\s*;/);
  assert.match(body, /(?:^|\s|;)align-items:\s*center\s*;/);
  assert.match(body, /(?:^|\s|;)justify-content:\s*center\s*;/);
  assert.doesNotMatch(
    body,
    /padding:\s*[^;]+?\s+[^;]+?\s+[^;]+?;/,
    '.ui-btn should not use asymmetric top/bottom padding'
  );
});
