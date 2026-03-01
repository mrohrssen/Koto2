import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  handleGetBootstrapState,
  handleGetBootstrapNarration,
  handleRecordExposures
} from '../../../src/game/bootstrap-api.js';
import { createMockReq, createMockRes } from '../../helpers/mocks.js';

describe('Bootstrap API - handleGetBootstrapState', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('returns tracker state for user', async () => {
    const req = createMockReq({ user: { id: 'test-user' } });
    const res = createMockRes();
    await handleGetBootstrapState(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.phase, 'bootstrap');
    assert.strictEqual(res.body.totalWordsIntroduced, 0);
  });
});

describe('Bootstrap API - handleGetBootstrapNarration', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api-2');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('returns rendered prologue scene', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      query: { type: 'prologue', index: '0' }
    });
    const res = createMockRes();
    await handleGetBootstrapNarration(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.html);
    assert.ok(Array.isArray(res.body.exposedWords));
  });

  it('returns 404 for invalid scene index', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      query: { type: 'prologue', index: '999' }
    });
    const res = createMockRes();
    await handleGetBootstrapNarration(req, res, testDir);
    assert.strictEqual(res.statusCode, 404);
  });
});

describe('Bootstrap API - handleRecordExposures', () => {
  const testDir = join(import.meta.dirname, '../../../tmp/test-bootstrap-api-3');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('records word exposures and saves', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      body: { words: ['水', '火'], multiplier: 1 }
    });
    const res = createMockRes();
    await handleRecordExposures(req, res, testDir);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.totalWordsIntroduced, 2);
  });

  it('rejects empty words array', async () => {
    const req = createMockReq({
      user: { id: 'test-user' },
      body: { words: [] }
    });
    const res = createMockRes();
    await handleRecordExposures(req, res, testDir);
    assert.strictEqual(res.statusCode, 400);
  });
});
