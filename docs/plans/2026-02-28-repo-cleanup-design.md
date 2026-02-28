# Repo Cleanup Design

**Date:** 2026-02-28
**Goal:** Clean up ~2 GB of accumulated cruft from the repo — old staging images, abandoned worktrees, untracked files, and outdated docs.

## Approach

Single cleanup script executed as one atomic commit (Approach A).

## Section 1: Local Cleanup (no git impact, ~1.9 GB)

Delete untracked/gitignored directories and files:

| Target | ~Size | Method |
|---|---|---|
| `.worktrees/codex-bottom-bar-fix` | 375 MB | `git worktree remove` |
| `.worktrees/codex-bottom-safe-area-fix` | 375 MB | `git worktree remove` |
| `.worktrees/codex-vocab-ready-narration` | 296 MB | `git worktree remove` |
| `output/` | 304 MB | `rm -rf` |
| `bakeoff-output/` | 228 MB | `rm -rf` |
| `tmp/` | 173 MB | `rm -rf` |
| `bug-screenshots/` | 99 MB | `rm -rf` |
| `UI Files/` | 12 MB | `rm -rf` |
| `.playwright-mcp/` | 4.5 MB | `rm -rf` |
| `test-results/` | 320 KB | `rm -rf` |
| Root PNGs (bakeoff-*, playtest-*, *-concepts.png, etc.) | ~42 MB | `rm` |
| Root HTML files (creature-review.html, icon-audit.html) | 25 KB | `rm` |
| `console-log.txt`, `progress.md` | 6 KB | `rm` |

## Section 2: Git-Tracked Removals (~142 MB)

Remove from git tracking via `git rm`:

| Target | ~Size | Reason |
|---|---|---|
| `data/creature-staging-images/` | 53 MB | Pipeline artifacts; final sprites in `public/assets/` |
| `data/action-icon-staging/` | 55 MB | Pipeline artifacts; final icons in `public/assets/` |
| `data/item-staging-images/` | 22 MB | Pipeline artifacts; final icons in `public/assets/` |
| `data/vocab-cache-u_*.json` | 3.8 MB | Runtime-generated; should be gitignored per CLAUDE.md |
| `data/.creature-forge-*-key` | tiny | API keys — security concern |
| `specs/` | 204 KB | Outdated chip system specs |
| `public/assets/sprites/robots-backup-pretrim/` | 6.8 MB | Pre-trim backup; trimmed versions confirmed in use |
| `docs/NEO TOKYO*.pdf` | 882 KB | Pre-rename design docs |

Update `.gitignore` to add:
- `data/vocab-cache-*.json`
- `data/.creature-forge-*-key`
- `data/*-staging-images/`
- `data/action-icon-staging/`

## Section 3: Archive `docs/plans/`

1. Concatenate all 140 files into `docs/plans-archive.md` with headers preserving filenames
2. `git rm` the 140 individual files and the `docs/plans/` directory
3. Keep `docs/plans-archive.md` tracked as a single reference file

## Section 4: New CLAUDE.md Rules

Add these rules to prevent future accumulation:

1. **Delete screenshots immediately** — "You MUST `rm` any screenshot file within the same tool-call block where you take it, after it's been shown."
2. **No files in repo root** — "Never create files (PNGs, HTML, CSVs, logs) in the repo root. Use `tmp/` for throwaway files, `output/` for generated artifacts. Both are gitignored."
3. **Clean up worktrees** — "Before ending a session, remove your worktree with `git worktree remove` if your branch has been merged."
4. **Never commit generated caches** — "Runtime-generated files (`vocab-cache-*.json`, `npc-memory-*.json`, dialogue caches) must never be `git add`-ed. Check `.gitignore` covers them."

## Decisions

- **Keep:** Pipeline scripts in `scripts/` (for future sprite regeneration)
- **Keep:** `data/creature-forge-style-refs/` (still used by forge tool)
- **Skip:** `tests/e2e/` (user wants to double-check first)
- **Skip:** This design doc (will be part of the archive after execution)

## Estimated Recovery

- Local disk: ~1.9 GB
- Git tracking: ~142 MB
- Total: ~2 GB
