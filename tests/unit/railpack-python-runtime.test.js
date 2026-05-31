import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

test('railpack config makes Python dependencies available at runtime', () => {
  const config = JSON.parse(readFileSync(resolve(repoRoot, 'railpack.json'), 'utf8'));
  const buildCommands = config.steps?.build?.commands || [];
  const buildVariables = config.steps?.build?.variables || {};
  const deployVariables = config.deploy?.variables || {};

  assert.ok(
    buildCommands.some(command =>
      typeof command === 'string' &&
      command.includes('pip install') &&
      command.includes('--target .python-packages') &&
      command.includes('-r requirements.txt')
    ),
    'expected Railpack build to install requirements into /app-local Python packages'
  );
  assert.equal(
    buildVariables.PYTHONPATH,
    '/app/.python-packages',
    'expected build step to add app-local Python packages to PYTHONPATH for tokenizer generation'
  );
  assert.equal(
    deployVariables.PYTHONPATH,
    '/app/.python-packages',
    'expected deployed runtime to add app-local Python packages to PYTHONPATH'
  );
});
