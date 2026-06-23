#!/usr/bin/env bash
# Sumkar — one-command installer (macOS / Linux)
# (engine: Herald, from ESMC)
# Usage:  ./install.sh /path/to/your-project
# Copies Herald's engine + Claude Code hook into a project and wires the
# PreToolUse:Read hook into that project's .claude/settings.json.

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: ./install.sh /path/to/your-project" >&2
  exit 1
fi

HERALD_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "Sumkar installer"
echo "  source : $HERALD_ROOT"
echo "  target : $TARGET"
echo ""

mkdir -p "$TARGET"

# 1. Copy engine + adapters into the target under .herald/
DEST="$TARGET/.herald"
mkdir -p "$DEST"
cp -R "$HERALD_ROOT/packages" "$DEST/packages"
cp -R "$HERALD_ROOT/adapters" "$DEST/adapters"
echo "  copied engine + adapters -> .herald/"

# 2. Ensure .claude exists
CLAUDE_DIR="$TARGET/.claude"
mkdir -p "$CLAUDE_DIR"
SETTINGS="$CLAUDE_DIR/settings.json"

# 3. Build the hook command (points at the copied hook)
HOOK_CMD='node "$CLAUDE_PROJECT_DIR/.herald/adapters/claude-code/herald-gate.js"'

# 4. Merge into settings.json (create if missing) using node for safe JSON editing
node - "$SETTINGS" "$HOOK_CMD" <<'NODE'
const fs = require('fs');
const [settingsPath, hookCmd] = process.argv.slice(2);
let s = {};
try { s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
s.hooks = s.hooks || {};
s.hooks.PreToolUse = [
  { matcher: 'Read', hooks: [ { type: 'command', command: hookCmd, timeout: 300 } ] }
];
fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
NODE
echo "  wired Read hook -> .claude/settings.json"

echo ""
echo "Compression backend (for compress-on-miss):"
echo "  default  : Anthropic Claude Sonnet 4.6 (needs @anthropic-ai/sdk + \$ANTHROPIC_API_KEY)"
echo "  free     : copy .herald-vendor.json.example -> .herald-vendor.json, set vendor=ollama"
echo "  (without a backend Sumkar still runs - it reads large files raw on a cold miss)"
echo ""
echo "Done. Next:"
echo "  cd \"$TARGET\""
echo "  claude            # then read a large file and watch Sumkar serve its index"
echo ""
