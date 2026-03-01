#!/bin/bash
# NotebookLM MCP Server – startup script
# Manages its own venv (.mcp_venv) separate from the skill's patchright venv (.venv)

set -e

SKILL_DIR="$HOME/.claude/skills/notebooklm"
MCP_VENV="$SKILL_DIR/.mcp_venv"

# Create MCP venv and install mcp package if not already done
if [ ! -f "$MCP_VENV/bin/python" ]; then
    python3 -m venv "$MCP_VENV" 2>/dev/null
    "$MCP_VENV/bin/pip" install --quiet --upgrade pip
    "$MCP_VENV/bin/pip" install --quiet "mcp[cli]"
fi

# Start MCP server
exec "$MCP_VENV/bin/python" "$SKILL_DIR/mcp_server.py"
