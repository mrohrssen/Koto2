#!/usr/bin/env bash
# Setup script for Koto forge skills (Claude Code commands)
# Run this once on any new machine to register the koto-forge skills.
#
# Usage: bash scripts/setup-claude-skills.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="$PROJECT_ROOT/.claude/plugins/koto-forge/1.1.0/skills"
COMMANDS_DIR="$PROJECT_ROOT/.claude/commands"

echo "Koto forge skills setup"
echo "======================="
echo "Project: $PROJECT_ROOT"
echo ""

# 1. Verify skills source exists
if [ ! -d "$SKILLS_SRC" ]; then
  echo "ERROR: Skills not found at $SKILLS_SRC"
  echo "Make sure you're running this from the Koto repo root."
  exit 1
fi

# 2. Symlink each skill's SKILL.md into .claude/commands/ (relative paths!)
mkdir -p "$COMMANDS_DIR"
count=0
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name=$(basename "$skill_dir")
  skill_file="$skill_dir/SKILL.md"
  if [ -f "$skill_file" ]; then
    # Use relative path so symlinks work regardless of where the repo is cloned
    ln -sf "../plugins/koto-forge/1.1.0/skills/${skill_name}/SKILL.md" "$COMMANDS_DIR/${skill_name}.md"
    echo "  Linked: /$(basename "$skill_name") -> skills/$skill_name/SKILL.md"
    count=$((count + 1))
  fi
done

echo ""
echo "Done! $count skills registered in .claude/commands/."
echo "Restart Claude Code to load them."
echo ""
echo "Available skills:"
echo "  /creature-forge    — Design creatures from English words"
echo "  /creature-animate  — Animate staging PNGs into idle sprites"
echo "  /move-forge        — Design combat moves from Japanese verbs"
echo "  /item-forge        — Generate items (consumables, equipment, crafting)"
echo "  /area-forge        — Design areas from Japanese location words"
echo "  /npc-forge         — Generate area-matched NPCs"
echo "  /jpdb-frequency-lookup — Enrich word lists with JPDB ranks"
echo "  /sprite-quality-pipeline — Three-gate sprite quality enforcement"
