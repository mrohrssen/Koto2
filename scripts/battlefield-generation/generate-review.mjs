import fs from 'node:fs/promises';
import path from 'node:path';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function generateReview({ runDir } = {}) {
  if (!runDir) throw new Error('generateReview requires runDir.');
  const prompts = await readJson(path.join(runDir, 'prompts.json'));
  const scorecard = await readJson(path.join(runDir, 'scorecard.json'));

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(prompts.areaId)} ${escapeHtml(prompts.runId)} review</title>
  <style>
    body { margin: 0; padding: 24px; background: #101827; color: #e5edf8; font-family: system-ui, sans-serif; }
    img { width: 100%; border-radius: 12px; background: #0b1020; }
    .grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; }
    .panel { background: #182235; border: 1px solid #2c3a55; border-radius: 14px; padding: 14px; }
    pre { white-space: pre-wrap; background: #0b1020; padding: 12px; border-radius: 10px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(prompts.areaId)} ${escapeHtml(prompts.runId)}</h1>
  <div class="grid">
    <div class="panel"><h2>Assembled</h2><img src="assembled.png" alt="Assembled battlefield"></div>
    <div class="panel"><h2>Sky</h2><img src="sky.png" alt="Sky layer"></div>
    <div class="panel"><h2>Battleground</h2><img src="battleground.png" alt="Battleground layer"></div>
  </div>
  <div class="panel" style="margin-top:16px">
    <h2>Score</h2>
    <pre>${escapeHtml(JSON.stringify(scorecard.scores, null, 2))}</pre>
    <h2>Critique</h2>
    <pre>${escapeHtml(scorecard.critique)}</pre>
    <h2>Weakest Layer</h2>
    <pre>${escapeHtml(scorecard.weakestLayer)}</pre>
    <h2>Next Prompt Delta</h2>
    <pre>${escapeHtml(scorecard.nextPromptDelta)}</pre>
  </div>
</body>
</html>`;

  const reviewPath = path.join(runDir, 'review.html');
  await fs.writeFile(reviewPath, html);
  return reviewPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reviewPath = await generateReview({ runDir: process.argv[2] });
  console.log(JSON.stringify({ reviewPath }, null, 2));
}
