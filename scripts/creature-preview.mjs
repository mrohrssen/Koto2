#!/usr/bin/env node

/**
 * Creature Preview HTML Generator + HTTP Server
 *
 * Generates a cyberpunk-styled HTML preview of creature concept art
 * and serves it via a local HTTP server.
 *
 * Normal mode:
 *   node scripts/creature-preview.mjs --id <id> --metadata <path.json>
 *
 * Cleanup mode:
 *   node scripts/creature-preview.mjs --cleanup --pid <number>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { parseArgs } from 'node:util';
import { resolve, extname, basename } from 'node:path';

const USAGE = 'Usage: node scripts/creature-preview.mjs --id <id> --metadata <path.json>';
const CLEANUP_USAGE = 'Usage: node scripts/creature-preview.mjs --cleanup --pid <number>';

const VARIANTS = ['a', 'b', 'c'];

const RARITY_COLORS = {
  common:    { bg: '#2a3a2a', text: '#8bc34a' },
  uncommon:  { bg: '#1a3a3a', text: '#4dd0e1' },
  rare:      { bg: '#1a2a4a', text: '#5c6bc0' },
  epic:      { bg: '#3a1a4a', text: '#ab47bc' },
  legendary: { bg: '#3a2a0a', text: '#ffd54f' },
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCli() {
  let args;
  try {
    args = parseArgs({
      options: {
        id:       { type: 'string' },
        metadata: { type: 'string' },
        cleanup:  { type: 'boolean', default: false },
        pid:      { type: 'string' },
      },
      strict: true,
    });
  } catch {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  const { cleanup, pid, id, metadata } = args.values;

  if (cleanup) {
    if (!pid) {
      process.stderr.write(CLEANUP_USAGE + '\n');
      process.exit(1);
    }
    return { mode: 'cleanup', pid: Number(pid) };
  }

  if (!id || !metadata) {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  return { mode: 'preview', id, metadataPath: metadata };
}

// ---------------------------------------------------------------------------
// Cleanup mode
// ---------------------------------------------------------------------------

function runCleanup(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    process.stdout.write(JSON.stringify({ status: 'killed', pid }) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ status: 'not_found', pid, error: err.message }) + '\n');
  }
}

// ---------------------------------------------------------------------------
// Find free port
// ---------------------------------------------------------------------------

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildHtml(id, meta) {
  const { name, modifier, baseMeaning, element, archetype, visualTier, attack, ultimate, descriptions } = meta;
  const rarity = RARITY_COLORS[visualTier] || RARITY_COLORS.common;

  const cards = VARIANTS.map(v => {
    const label = v.toUpperCase();
    const desc = meta.richDescriptions?.[v] || descriptions?.[v] || '';
    const imgFile = `creature-forge-${id}-${v}.png`;
    return `
      <div class="card">
        <div class="card-header">
          <span class="label">${label}</span>
          <span class="provider">Gemini Flash</span>
        </div>
        <div class="card-img-wrap">
          <img src="${imgFile}" alt="${esc(name)} variant ${label}" />
        </div>
        <div class="card-body">
          <p class="desc">${esc(desc)}</p>
          <p class="moves">\u2694 ${esc(attack)} \u00b7 \u2726 ${esc(ultimate)}</p>
        </div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(name)} - Creature Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a12;
    color: #e0e0e0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    padding: 2rem 1rem;
    min-height: 100vh;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 {
    text-align: center;
    font-size: 1.8rem;
    color: #00e5ff;
    margin-bottom: 0.5rem;
    text-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
  }
  .badges {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  .badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-rarity {
    background: ${rarity.bg};
    color: ${rarity.text};
    border: 1px solid ${rarity.text}44;
  }
  .badge-element {
    background: #0d1b2a;
    color: #4fc3f7;
    border: 1px solid #4fc3f744;
  }
  .badge-archetype {
    background: #1a0a2e;
    color: #ce93d8;
    border: 1px solid #ce93d844;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 900px) {
    .grid { grid-template-columns: 1fr; }
  }
  .card {
    background: #12121e;
    border: 1px solid #1e1e3a;
    border-radius: 8px;
    overflow: hidden;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #1e1e3a;
  }
  .card-header .label {
    color: #42a5f5;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .card-header .provider {
    color: #666;
    font-size: 0.7rem;
    background: #1a1a2e;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
  }
  .card-img-wrap {
    aspect-ratio: 1;
    background: #0a0a14;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .card-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .card-body {
    padding: 0.75rem;
  }
  .card-body .desc {
    font-size: 0.8rem;
    color: #999;
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }
  .card-body .moves {
    font-size: 0.8rem;
    color: #b0b0b0;
  }
  .info-note {
    text-align: center;
    color: #555;
    font-size: 0.75rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #1a1a2a;
  }
</style>
</head>
<body>
<div class="container">
  <h1>${esc(name)} the ${esc(modifier)} ${esc(baseMeaning)}</h1>
  <div class="badges">
    <span class="badge badge-rarity">${esc(visualTier)}</span>
    <span class="badge badge-element">${esc(element)}</span>
    <span class="badge badge-archetype">${esc(archetype)}</span>
  </div>
  <div class="grid">
    ${cards}
  </div>
  <div class="info-note">Gemini Flash | Magenta BG for chroma-key</div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTTP static file server
// ---------------------------------------------------------------------------

function startServer(port) {
  const server = createHttpServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
      const filename = basename(urlPath);
      const filePath = resolve('/tmp', filename);

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const ext = extname(filename).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';

      const data = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });

  server.listen(port);
  return server;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cli = parseCli();

  if (cli.mode === 'cleanup') {
    runCleanup(cli.pid);
    return;
  }

  // Normal mode: generate HTML + serve
  const { id, metadataPath } = cli;

  if (!existsSync(metadataPath)) {
    process.stderr.write(`Error: metadata file not found: ${metadataPath}\n`);
    process.exit(1);
  }

  const meta = JSON.parse(await readFile(metadataPath, 'utf-8'));
  const html = buildHtml(id, meta);
  const htmlFile = `creature-forge-${id}-preview.html`;
  const htmlPath = resolve('/tmp', htmlFile);

  await writeFile(htmlPath, html, 'utf-8');

  const port = await findFreePort();
  startServer(port);

  const url = `http://localhost:${port}/${htmlFile}`;
  process.stdout.write(JSON.stringify({ url, pid: process.pid }) + '\n');

  // Keep server running until killed
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
