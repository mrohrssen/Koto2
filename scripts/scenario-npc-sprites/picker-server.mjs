#!/usr/bin/env node

/**
 * Local review picker for Scenario NPC sprite manifests.
 *
 * Usage:
 *   node scripts/scenario-npc-sprites/picker-server.mjs
 *   node scripts/scenario-npc-sprites/picker-server.mjs --root tmp/npc-sprites-scenario --port 8766
 *
 * The page groups all manifest results by NPC, lets the reviewer choose one
 * favorite per NPC, and saves selections to selected-npc-sprites.json.
 */

import { createServer } from 'node:http';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');
const TEAM_ID = 'team_g8yJ6jYJtWj44Um1NrmzYiLC';
const PROJECT_ID = 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    port: { type: 'string' },
  },
  strict: true,
});

const ROOT_DIR = values.root ? resolve(values.root) : resolve(PROJECT_ROOT, 'tmp/npc-sprites-scenario');
const PORT = Number(values.port || process.env.PORT || 8766);
const SELECTIONS_PATH = join(ROOT_DIR, 'selected-npc-sprites.json');

function scenarioUrl(assetId) {
  return `https://app.scenario.com/?openAssetId=${assetId}&teamId=${TEAM_ID}&projectId=${PROJECT_ID}&tab=image`;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function discoverManifestPaths() {
  const entries = await readdir(ROOT_DIR, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(ROOT_DIR, entry.name, 'manifest.json');
    if (await pathExists(manifestPath)) paths.push(manifestPath);
  }
  return paths.sort();
}

async function loadCandidates() {
  const groups = new Map();
  for (const manifestPath of await discoverManifestPaths()) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const job of manifest.jobs || []) {
      const assets = job.results?.assets || [];
      if (!assets.length) continue;
      if (!groups.has(job.npcId)) groups.set(job.npcId, { npcId: job.npcId, variants: [] });
      for (const asset of assets) {
        const outputPath = asset.outputPath || null;
        groups.get(job.npcId).variants.push({
          variant: asset.variant,
          assetId: asset.assetId,
          runId: manifest.runId,
          scenarioUrl: scenarioUrl(asset.assetId),
          relativeOutputPath: outputPath ? relative(ROOT_DIR, outputPath) : null,
          localExists: outputPath ? await pathExists(outputPath) : false,
        });
      }
    }
  }
  return [...groups.values()].sort((a, b) => a.npcId.localeCompare(b.npcId));
}

async function loadSelections() {
  try {
    return JSON.parse(await readFile(SELECTIONS_PATH, 'utf8'));
  } catch {
    return { selectedCount: 0, selections: [] };
  }
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPage(groups, saved) {
  const savedMap = new Map((saved.selections || []).map(item => [item.npcId, item.assetId]));
  const totalVariants = groups.reduce((sum, group) => sum + group.variants.length, 0);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NPC Sprite Picker</title>
  <style>
    :root { color-scheme: dark; --bg:#101217; --panel:#171b22; --ink:#f4efe6; --muted:#a9b0bd; --accent:#ffc857; --accent2:#77e6c6; font-family:Avenir Next,Verdana,sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 15% 0%, rgba(255,200,87,.18), transparent 32rem), var(--bg); color:var(--ink); }
    header { position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; gap:1rem; align-items:center; padding:1rem 1.25rem; background:rgba(16,18,23,.9); border-bottom:1px solid rgba(255,255,255,.08); backdrop-filter:blur(12px); }
    h1 { margin:0; font-size:clamp(1.35rem,2.2vw,2.2rem); letter-spacing:-.04em; }
    .meta { color:var(--muted); font-size:.88rem; }
    button { border:0; border-radius:999px; padding:.75rem 1rem; color:#16120a; background:var(--accent); font-weight:800; cursor:pointer; }
    main { padding:1.25rem; max-width:1500px; margin:0 auto; }
    .group { margin:0 0 1.25rem; padding:1rem; border:1px solid rgba(255,255,255,.1); border-radius:24px; background:rgba(23,27,34,.82); }
    .group-head { display:flex; justify-content:space-between; gap:1rem; align-items:baseline; margin-bottom:.9rem; }
    h2 { margin:0; font-size:1.1rem; letter-spacing:.08em; text-transform:uppercase; color:var(--accent2); }
    .variants { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:.85rem; }
    .card { position:relative; display:grid; gap:.7rem; padding:.8rem; border-radius:18px; border:2px solid transparent; background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)); cursor:pointer; }
    .card:has(input:checked) { border-color:var(--accent); background:linear-gradient(180deg, rgba(255,200,87,.18), rgba(119,230,198,.08)); }
    .card input { position:absolute; inset:.75rem .75rem auto auto; width:1.2rem; height:1.2rem; accent-color:var(--accent); }
    .thumb { display:grid; place-items:center; min-height:180px; border-radius:14px; background:#fff; color:#101217; overflow:hidden; text-align:center; padding:.5rem; font-weight:800; }
    .thumb img { max-width:100%; max-height:210px; object-fit:contain; }
    .details { display:flex; justify-content:space-between; gap:.75rem; align-items:center; font-size:.88rem; color:var(--muted); }
    .details b { color:var(--ink); }
    a { color:var(--accent); text-decoration:none; font-weight:700; }
    #status { color:var(--muted); min-width:12rem; text-align:right; }
  </style>
</head>
<body>
  <header>
    <div><h1>NPC Sprite Picker</h1><div class="meta">${groups.length} NPCs · ${totalVariants} variants · saves to <code>${esc(SELECTIONS_PATH)}</code></div></div>
    <div><span id="status">${saved.selectedCount ? `${saved.selectedCount} saved selections loaded` : 'No saved selections yet'}</span> <button type="button" id="saveBtn">Submit Favorites</button></div>
  </header>
  <main>
    ${groups.map(group => `
      <section class="group" data-npc="${esc(group.npcId)}">
        <div class="group-head"><h2>${esc(group.npcId)}</h2><div class="meta">${group.variants.length} variants</div></div>
        <div class="variants">
          ${group.variants.map(variant => {
            const checked = savedMap.get(group.npcId) === variant.assetId ? 'checked' : '';
            const image = variant.localExists && variant.relativeOutputPath
              ? `<img src="/files/${esc(variant.relativeOutputPath)}" alt="${esc(group.npcId)} ${esc(variant.variant)}">`
              : '<span>Download asset first<br>or open Scenario</span>';
            return `
              <label class="card">
                <input type="radio" name="${esc(group.npcId)}" value="${esc(variant.assetId)}" data-run="${esc(variant.runId)}" data-variant="${esc(variant.variant)}" data-url="${esc(variant.scenarioUrl)}" ${checked}>
                <div class="thumb">${image}</div>
                <div class="details"><b>${esc(String(variant.variant).toUpperCase())}</b><a href="${esc(variant.scenarioUrl)}" target="_blank" rel="noreferrer">Open Scenario</a></div>
                <div class="meta">${esc(variant.assetId)}</div>
              </label>`;
          }).join('')}
        </div>
      </section>
    `).join('')}
  </main>
  <script>
    const statusEl = document.querySelector('#status');
    const groups = [...document.querySelectorAll('.group')];
    document.querySelector('#saveBtn').addEventListener('click', async () => {
      const selections = groups.map(group => {
        const picked = group.querySelector('input[type="radio"]:checked');
        if (!picked) return null;
        return { npcId: group.dataset.npc, assetId: picked.value, variant: picked.dataset.variant, runId: picked.dataset.run, scenarioUrl: picked.dataset.url };
      }).filter(Boolean);
      const response = await fetch('/save', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ selections }) });
      const result = await response.json();
      statusEl.textContent = response.ok ? 'Saved ' + result.selectedCount + ' selections' : 'Save failed';
    });
  </script>
</body>
</html>`;
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, renderPage(await loadCandidates(), await loadSelections()));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const filePath = join(ROOT_DIR, decodeURIComponent(url.pathname.replace('/files/', '')));
      return send(res, 200, await readFile(filePath), 'image/png');
    }
    if (req.method === 'POST' && url.pathname === '/save') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || '{}');
      const selections = Array.isArray(payload.selections) ? payload.selections : [];
      const saved = { savedAt: new Date().toISOString(), selectedCount: selections.length, selections };
      await writeFile(SELECTIONS_PATH, `${JSON.stringify(saved, null, 2)}\n`);
      return send(res, 200, JSON.stringify(saved), 'application/json; charset=utf-8');
    }
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (err) {
    return send(res, 500, JSON.stringify({ error: err.message }), 'application/json; charset=utf-8');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`NPC picker: http://127.0.0.1:${PORT}`);
  console.log(`Selections: ${SELECTIONS_PATH}`);
});
