import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { adminAuth } from './admin.js';

/**
 * Mount dictionary edit endpoints under a router.
 *
 * Routes (mounted under whatever prefix the caller chooses):
 *   GET  /:word            — current live entry + jmdict baseline + overlayOwner
 *   PUT  /:word            — write a new entry; returns {ok, overlayOverridden, gitCommitStatus}
 *   GET  /-export          — download full live dictionary (break-glass)
 *
 * `-export` is used instead of `/export` because `:word` would otherwise
 * match the string `export` as a word.
 *
 * @param {object} opts
 * @param {string} opts.liveDictPath
 * @param {string} opts.jmdictPath
 * @param {Map<string,string>} opts.overlayOwners
 * @param {() => void} opts.onChange  called after a successful write
 * @param {(word: string) => void} opts.enqueueSync  called after a successful write
 */
export default function createDictEditRoutes({ liveDictPath, jmdictPath, overlayOwners, onChange, enqueueSync }) {
  const router = Router();
  router.use(adminAuth);

  function readLive() {
    if (!existsSync(liveDictPath)) return {};
    try { return JSON.parse(readFileSync(liveDictPath, 'utf-8')); }
    catch { return {}; }
  }

  function readJm() {
    if (!existsSync(jmdictPath)) return {};
    try { return JSON.parse(readFileSync(jmdictPath, 'utf-8')); }
    catch { return {}; }
  }

  function writeLiveAtomic(data) {
    const tmp = join(dirname(liveDictPath), 'live-dictionary.json.tmp');
    writeFileSync(tmp, JSON.stringify(data, null, 0));
    renameSync(tmp, liveDictPath);
  }

  function isReadOnly() {
    return process.env.DICTIONARY_READONLY === 'true' || process.env.DICTIONARY_READONLY === '1';
  }

  router.get('/-export', (req, res) => {
    const data = readLive();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="live-dictionary.json"');
    res.send(JSON.stringify(data, null, 2));
  });

  router.get('/:word', (req, res) => {
    const word = req.params.word;
    const live = readLive()[word] || null;
    const jmdict = readJm()[word] || null;
    const overlayOwner = overlayOwners.get(word) || null;
    res.json({ word, live, jmdict, overlayOwner });
  });

  router.put('/:word', (req, res) => {
    const word = req.params.word;
    const { reading, definitions } = req.body || {};

    if (typeof reading !== 'string' || reading.trim().length === 0) {
      return res.status(400).json({ error: 'reading must be a non-empty string' });
    }
    if (!Array.isArray(definitions) || definitions.length === 0) {
      return res.status(400).json({ error: 'definitions must be a non-empty array' });
    }
    const primaryCount = definitions.filter(d => d?.primary).length;
    if (primaryCount !== 1) {
      return res.status(400).json({ error: 'exactly one definition must have primary:true' });
    }
    for (const d of definitions) {
      if (!d || typeof d.en !== 'string' || d.en.trim().length === 0) {
        return res.status(400).json({ error: 'every definition must have a non-empty en string' });
      }
    }

    if (isReadOnly()) {
      return res.status(403).json({
        error: 'Dictionary editing is disabled in this environment',
        gitCommitStatus: 'skipped-readonly',
      });
    }

    const cleanDefs = definitions.map(d => ({
      en: d.en.trim(),
      ...(d.primary ? { primary: true } : {}),
    }));

    const current = readLive();
    current[word] = { reading: reading.trim(), definitions: cleanDefs };
    writeLiveAtomic(current);

    onChange?.();
    enqueueSync?.(word);

    res.json({
      ok: true,
      word,
      overlayOverridden: overlayOwners.has(word),
      gitCommitStatus: 'queued',
    });
  });

  return router;
}
