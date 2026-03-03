#!/usr/bin/env bash
# Setup script for Koto forge skills (Claude Code plugin)
# Run this once on any new machine to register the koto-forge skills plugin.
#
# Usage: bash scripts/setup-claude-skills.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_SRC="$PROJECT_ROOT/.claude/plugins/koto-forge"
CACHE_DIR="$HOME/.claude/plugins/cache/claude-plugins-official/koto-forge"
SETTINGS="$HOME/.claude/settings.json"

echo "Koto forge skills setup"
echo "======================="
echo "Project: $PROJECT_ROOT"
echo "Plugin:  $PLUGIN_SRC"
echo ""

# 1. Verify plugin source exists
if [ ! -f "$PLUGIN_SRC/1.1.0/.claude-plugin/plugin.json" ]; then
  echo "ERROR: Plugin not found at $PLUGIN_SRC/1.1.0/"
  echo "Make sure you're running this from the Koto repo root."
  exit 1
fi

# 2. Create cache directory and symlink
mkdir -p "$(dirname "$CACHE_DIR")"
if [ -L "$CACHE_DIR/1.1.0" ]; then
  echo "Symlink already exists, updating..."
  rm "$CACHE_DIR/1.1.0"
elif [ -d "$CACHE_DIR/1.1.0" ]; then
  echo "Removing old cache copy..."
  rm -rf "$CACHE_DIR/1.1.0"
fi
mkdir -p "$CACHE_DIR"
ln -s "$PLUGIN_SRC/1.1.0" "$CACHE_DIR/1.1.0"
echo "Symlinked: $CACHE_DIR/1.1.0 -> $PLUGIN_SRC/1.1.0"

# 3. Register plugin in settings.json
if [ ! -f "$SETTINGS" ]; then
  echo "Creating $SETTINGS..."
  mkdir -p "$(dirname "$SETTINGS")"
  echo '{"enabledPlugins":{"koto-forge@claude-plugins-official":true}}' | python3 -m json.tool > "$SETTINGS"
elif grep -q "koto-forge@claude-plugins-official" "$SETTINGS" 2>/dev/null; then
  echo "Plugin already registered in settings.json"
else
  echo "Adding koto-forge to settings.json..."
  python3 -c "
import json
with open('$SETTINGS') as f:
    s = json.load(f)
s.setdefault('enabledPlugins', {})['koto-forge@claude-plugins-official'] = True
with open('$SETTINGS', 'w') as f:
    json.dump(s, f, indent=2)
    f.write('\n')
"
  echo "Registered koto-forge in settings.json"
fi

echo ""
echo "Done! Restart Claude Code to load the skills."
echo ""
echo "Available skills:"
echo "  /creature-forge    — Design creatures from English words"
echo "  /creature-animate  — Animate staging PNGs into idle sprites"
echo "  /item-forge        — Generate food-themed items in batches"
echo "  /area-forge        — Design areas from Japanese location words"
echo "  /npc-forge         — Generate area-matched NPCs"
echo "  /jpdb-frequency-lookup — Enrich word lists with JPDB ranks"
echo "  /sprite-quality-pipeline — Three-gate sprite quality enforcement"
