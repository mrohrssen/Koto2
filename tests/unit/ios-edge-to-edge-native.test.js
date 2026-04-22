import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const nativeSrc = readFileSync(
  resolve(repoRoot, 'public/js/native/index.js'),
  'utf8'
);

test('initNative calls StatusBar.hide()', () => {
  assert.match(
    nativeSrc,
    /StatusBar\.hide\s*\(\s*\)/,
    'expected StatusBar.hide() in initNative — see spec section "Layer 1 — Native"'
  );
});

test('initNative calls StatusBar.setOverlaysWebView({ overlay: true })', () => {
  assert.match(
    nativeSrc,
    /setOverlaysWebView\s*\(\s*\{\s*overlay:\s*true\s*\}\s*\)/,
    'expected StatusBar.setOverlaysWebView({ overlay: true }) as a safety net'
  );
});

test('initNative no longer calls StatusBar.setBackgroundColor', () => {
  assert.doesNotMatch(
    nativeSrc,
    /StatusBar\.setBackgroundColor/,
    'setBackgroundColor is moot once the status bar is hidden; remove it'
  );
});
