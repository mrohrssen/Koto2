import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const SCAN_DIRS = [
  'public/js/ui',
];

const ALLOWLIST = new Map([
  ['public/js/ui/japanese-display-resolver.js', ['toRomaji', 'useKanji']],
  ['public/js/ui/romaji.js', ['toRomaji', 'useKanji']],
  ['public/js/ui/japanese-token-cells.js', ['useKanji', 'kanjiMode']],
  ['public/js/ui/bootstrap-client.js', ['useKanji']],
  ['public/js/ui/dialogue-display.js', ['useKanji']],
  ['public/js/ui/exploration.js', ['useKanji', 'kanaMode', 'kanjiMode']],
  ['public/js/ui/npc-dialogue-card.js', ['useKanji']],
  ['public/js/ui/npc-dialogue-ui.js', ['useKanji']],
  ['public/js/ui/room-transition.js', ['useKanji']],
  ['public/js/ui/befriend.js', ['useKanji']],
  ['public/js/ui/whack-a-mole.js', ['useKanji']],
]);

const POLICIES = [
  { name: 'toRomaji', pattern: /\btoRomaji\b/g },
  { name: 'useKanji', pattern: /\buseKanji\b/g },
  { name: 'kanaMode', pattern: /\bkanaMode\b/g },
  { name: 'kanjiMode', pattern: /\bkanjiMode\b/g },
];

async function listJsFiles(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsFiles(relative));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relative);
    }
  }
  return files;
}

function lineNumberForOffset(source, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function allowedTermsFor(file) {
  return new Set(ALLOWLIST.get(file) || []);
}

const files = (await Promise.all(SCAN_DIRS.map(listJsFiles))).flat();
const violations = [];

for (const file of files) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const allowed = allowedTermsFor(file);

  for (const policy of POLICIES) {
    const matches = source.matchAll(policy.pattern);
    for (const match of matches) {
      if (allowed.has(policy.name)) continue;
      violations.push(`${file}:${lineNumberForOffset(source, match.index)} uses ${policy.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Japanese display policy audit failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Japanese display policy audit passed (${files.length} UI files scanned).`);
