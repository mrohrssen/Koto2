import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const css = readFileSync(resolve(repoRoot, 'public/game.css'), 'utf8');

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

test('disabled move cells remain clickable for insufficient MP feedback', () => {
  const body = ruleBody(css, '.move-cell.disabled {');
  assert.ok(body, '.move-cell.disabled rule not found');
  assert.doesNotMatch(
    body,
    /pointer-events:\s*none\s*;/,
    'disabled move cells must receive clicks so Not enough MP feedback can appear'
  );
});

test('move select MP droplet stays blue across move states and elements', () => {
  const mpColorRules = [...css.matchAll(/([^{}]+)\{\s*([^{}]*\.move-pill-ico--mp[^{}]*|[^{}]*color\s*:[^{}]*)\}/g)]
    .filter(([, selector, body]) => selector.includes('.move-pill-ico--mp') && /color\s*:/.test(body))
    .map(([, selector]) => selector.trim());

  assert.deepEqual(mpColorRules, ['.move-pill-ico--mp']);
});

test('move select sword icon keeps the shared pill icon size', () => {
  const body = ruleBody(css, '.move-pill-ico--sword {');
  assert.ok(body, '.move-pill-ico--sword rule not found');
  assert.doesNotMatch(body, /\bwidth\s*:/, 'sword icon should inherit shared .move-pill-ico width');
  assert.doesNotMatch(body, /\bheight\s*:/, 'sword icon should inherit shared .move-pill-ico height');
});
