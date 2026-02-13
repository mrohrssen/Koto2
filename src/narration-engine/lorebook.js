import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOREBOOK_PATH = join(__dirname, '../../data/lorebook.json');

let _cache = null;

export function loadLorebook() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(LOREBOOK_PATH, 'utf8'));
  }
  return _cache;
}

/**
 * Activate lorebook entries by direct keys and recursive keyword scanning.
 * Returns activated entries sorted by priority (highest first), capped at config limit.
 */
export function activateEntries(worldKeys) {
  const lb = loadLorebook();
  const activated = new Map(); // id -> entry

  // Phase 1: Direct activation from character card world keys
  for (const key of worldKeys) {
    if (lb.entries[key]) {
      activated.set(key, { id: key, ...lb.entries[key] });
    }
  }

  // Phase 2: Recursive keyword scanning
  if (lb.config.recursiveScanning) {
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 3) {
      changed = false;
      iterations++;
      // Collect all text from activated entries
      const activatedText = Array.from(activated.values())
        .map(e => e.content)
        .join(' ');

      // Check each non-activated entry for keyword matches
      for (const [id, entry] of Object.entries(lb.entries)) {
        if (activated.has(id)) continue;
        const matches = entry.keywords.some(kw =>
          activatedText.toLowerCase().includes(kw.toLowerCase())
        );
        if (matches) {
          activated.set(id, { id, ...entry });
          changed = true;
        }
      }
    }
  }

  // Sort by priority descending, cap at limit
  const sorted = Array.from(activated.values())
    .sort((a, b) => b.priority - a.priority);

  return sorted.slice(0, lb.config.maxEntriesPerPrompt);
}
