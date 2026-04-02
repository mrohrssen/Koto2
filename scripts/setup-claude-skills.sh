#!/usr/bin/env bash
# Setup script for ALL Claude Code skills & plugins
# Registers koto-forge skills + official plugins (superpowers, code-simplifier,
# frontend-design) and ensures MCP servers (context7, sequential-thinking) are
# configured. Safe to re-run — idempotent.
#
# Usage: bash scripts/setup-claude-skills.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMANDS_DIR="$PROJECT_ROOT/.claude/commands"
PLUGIN_CACHE="$HOME/.claude/plugins/cache/claude-plugins-official"
MCP_FILE="$PROJECT_ROOT/.mcp.json"

mkdir -p "$COMMANDS_DIR"

echo "Koto — Claude skills setup"
echo "=========================="
echo "Project: $PROJECT_ROOT"
echo ""

total=0

# ─── 1. Koto Forge skills (relative symlinks, portable) ─────────────────────
FORGE_SRC="$PROJECT_ROOT/.claude/plugins/koto-forge/1.1.0/skills"
if [ -d "$FORGE_SRC" ]; then
  echo "─ Koto Forge skills ─"
  for skill_dir in "$FORGE_SRC"/*/; do
    name=$(basename "$skill_dir")
    if [ -f "$skill_dir/SKILL.md" ]; then
      ln -sf "../plugins/koto-forge/1.1.0/skills/${name}/SKILL.md" "$COMMANDS_DIR/${name}.md"
      echo "  /$name"
      total=$((total + 1))
    fi
  done
  echo ""
else
  echo "WARN: Koto forge skills not found at $FORGE_SRC (skipping)"
  echo ""
fi

# ─── 2. Official plugins from ~/.claude/plugins/cache ────────────────────────
# These use absolute symlinks to the cache (the cache is machine-local anyway).
# The script auto-detects the latest version of each plugin.

resolve_latest() {
  local plugin_dir="$1"
  # Prefer semver directories, fall back to whatever is there
  ls -v "$plugin_dir" 2>/dev/null | tail -1
}

link_skills() {
  local plugin_name="$1"
  local prefix="$2"  # e.g. "sp-" for superpowers
  local plugin_dir="$PLUGIN_CACHE/$plugin_name"
  if [ ! -d "$plugin_dir" ]; then
    echo "WARN: $plugin_name not in plugin cache (skipping)"
    return
  fi
  local ver
  ver=$(resolve_latest "$plugin_dir")
  local base="$plugin_dir/$ver/skills"
  if [ ! -d "$base" ]; then
    return
  fi
  for skill_dir in "$base"/*/; do
    local name
    name=$(basename "$skill_dir")
    if [ -f "$skill_dir/SKILL.md" ]; then
      ln -sf "$skill_dir/SKILL.md" "$COMMANDS_DIR/${prefix}${name}.md"
      echo "  /${prefix}${name}"
      total=$((total + 1))
    fi
  done
}

link_agents() {
  local plugin_name="$1"
  local prefix="$2"
  local plugin_dir="$PLUGIN_CACHE/$plugin_name"
  if [ ! -d "$plugin_dir" ]; then
    return
  fi
  local ver
  ver=$(resolve_latest "$plugin_dir")
  local base="$plugin_dir/$ver/agents"
  if [ ! -d "$base" ]; then
    return
  fi
  for agent_file in "$base"/*.md; do
    local name
    name=$(basename "$agent_file" .md)
    ln -sf "$agent_file" "$COMMANDS_DIR/${prefix}${name}.md"
    echo "  /${prefix}${name}"
    total=$((total + 1))
  done
}

# Superpowers — skills + agents
if [ -d "$PLUGIN_CACHE/superpowers" ]; then
  echo "─ Superpowers skills ─"
  link_skills "superpowers" "sp-"
  link_agents "superpowers" "sp-"
  echo ""
fi

# Code Simplifier — agent definition exposed as command
if [ -d "$PLUGIN_CACHE/code-simplifier" ]; then
  echo "─ Code Simplifier ─"
  link_agents "code-simplifier" ""
  echo ""
fi

# Frontend Design — skill
if [ -d "$PLUGIN_CACHE/frontend-design" ]; then
  echo "─ Frontend Design ─"
  link_skills "frontend-design" ""
  echo ""
fi

# ─── 3. Ensure MCP servers are configured ────────────────────────────────────
echo "─ MCP servers ─"

# Build the desired MCP config, preserving any existing servers
if [ -f "$MCP_FILE" ]; then
  current=$(cat "$MCP_FILE")
else
  current='{"mcpServers":{}}'
fi

# Add context7 if missing
if ! echo "$current" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'context7' in d.get('mcpServers',{})" 2>/dev/null; then
  current=$(echo "$current" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d.setdefault('mcpServers', {})
d['mcpServers']['context7'] = {
    'type': 'stdio',
    'command': 'npx',
    'args': ['-y', '@upstash/context7-mcp']
}
json.dump(d, sys.stdout, indent=4)
")
  echo "$current" > "$MCP_FILE"
  echo "  Added: context7 MCP server"
else
  echo "  OK: context7 already configured"
fi

# Add sequential-thinking if missing
if ! echo "$current" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'sequential-thinking' in d.get('mcpServers',{})" 2>/dev/null; then
  current=$(cat "$MCP_FILE")
  current=$(echo "$current" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d.setdefault('mcpServers', {})
d['mcpServers']['sequential-thinking'] = {
    'type': 'stdio',
    'command': 'npx',
    'args': ['-y', '@modelcontextprotocol/server-sequential-thinking']
}
json.dump(d, sys.stdout, indent=4)
")
  echo "$current" > "$MCP_FILE"
  echo "  Added: sequential-thinking MCP server"
else
  echo "  OK: sequential-thinking already configured"
fi

echo ""

# ─── 4. Summary ──────────────────────────────────────────────────────────────
echo "=========================="
echo "Done! $total commands registered."
echo ""
echo "MCP servers in .mcp.json:"
python3 -c "import json; d=json.load(open('$MCP_FILE')); [print(f'  - {k}') for k in d.get('mcpServers',{})]"
echo ""
echo "Restart Claude Code to load new skills."
