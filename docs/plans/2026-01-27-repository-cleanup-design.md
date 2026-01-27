# Repository Cleanup Design

**Date:** 2026-01-27
**Goal:** Reduce repo size (~129MB) and improve clarity

## Deletions

### Large Test Assets
| Path | Size | Reason |
|------|------|--------|
| `test-sprites-OLD DELETE/` | 17MB | Marked for deletion |
| `test-sprites/` | 105MB | Asset generation complete |
| `test-results/` | 1.7MB | Regenerated on test runs |
| `tmp/` | 4.6MB | Temporary workspace |

### Root-Level Clutter
| Files | Reason |
|-------|--------|
| `fix_chip_icons.py`, `fix_chip_icons_v3.py`, `fix_chip_icons_v4.py`, `fix_chip_icons_v5.py` | Superseded by v6 |
| `chip-review.csv`, `vocab-reference.csv` | Development artifacts |
| `simulate.js`, `test-phases-7-12.js`, `test-gameplay.js` | One-off test scripts |
| `.jrpg-save*.json`, `.jrpg-users.json`, `.jrpg-settings.json`, `.jrpg-vocab-cache.json` | Development data |
| `.jchat-game-stats.json`, `.jchat-vocab-suggestions.json` | Development data |
| `generate_assets.log` | Log file |

## Moves

| From | To |
|------|----|
| `fix_chip_icons_v6.py` | `scripts/fix_chip_icons.py` |
| `Neo Tokyo Item Description.pdf` | `docs/` |
| `NEO TOKYO_ System Liberation (1).pdf` | `docs/` |

## Consolidation

### Archived Plans → Design History

Consolidate 45+ files in `docs/plans/archive/` into `docs/DESIGN-HISTORY.md`:

1. Read archived plans
2. Extract key decisions and rationale
3. Group by time period or feature area
4. Delete `docs/plans/archive/` after consolidation

### Bug Review

Review each file in `docs/bugs/` (15 files dated 2026-01-24):
- **Resolved** → Delete
- **Open** → Keep
- **Unclear** → Flag for decision

## Implementation Steps

1. Delete large test asset directories
2. Delete root-level clutter files
3. Move `fix_chip_icons_v6.py` to `scripts/fix_chip_icons.py`
4. Move PDFs to `docs/`
5. Read archived plans, create `docs/DESIGN-HISTORY.md`
6. Delete `docs/plans/archive/`
7. Review bugs, delete resolved issues
8. Commit changes

## Expected Outcome

- **Size reduction:** ~129MB
- **Cleaner root:** Only essential project files
- **Organized docs:** PDFs in docs, history consolidated
- **Accurate bugs:** Only open issues remain
