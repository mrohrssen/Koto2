import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

test('capacitor.config.ts sets ios.contentInset to never', () => {
  const src = readFileSync(resolve(repoRoot, 'capacitor.config.ts'), 'utf8');
  assert.match(
    src,
    /contentInset:\s*['"]never['"]/,
    'expected ios.contentInset to be "never" — see docs/superpowers/specs/2026-04-22-ios-edge-to-edge-design.md'
  );
});
