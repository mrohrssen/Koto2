/**
 * Background worker for committing live-dictionary edits to the `dictionary`
 * branch. Implementation added in the git auto-commit phase; this stub lets
 * the admin-word-exposures wiring compile.
 */
export function enqueueDictionarySync(word) {
  console.log(`[dict-sync] enqueue ${word} — worker not yet implemented`);
}

export function getSyncStatus() {
  return { lastCommit: null, lastError: null, queueDepth: 0 };
}
