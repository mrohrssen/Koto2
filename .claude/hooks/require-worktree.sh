#!/bin/bash
# Block file edits unless in a git worktree (not main repo)
# This hook is triggered by PreToolUse for Edit/Write operations

MAIN_REPO="/Users/michia/Documents/jrpg"
CURRENT_DIR=$(pwd)

# If we're in the main repo, block edits
if [[ "$CURRENT_DIR" == "$MAIN_REPO" ]]; then
  echo "BLOCKED: You are in the main repo, not a worktree." >&2
  echo "Create a worktree first:" >&2
  echo "  cd $MAIN_REPO" >&2
  echo "  /usr/bin/git worktree add ../jrpg-wt-FEATURE -b feature/FEATURE" >&2
  echo "  cd ../jrpg-wt-FEATURE" >&2
  exit 2  # Exit code 2 = block and show error to Claude
fi

exit 0  # Allow - we're in a worktree
