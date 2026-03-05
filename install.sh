#!/bin/bash
# NR_assistant installer — Elle
# Installerer alle commands, kontekst-links og MCP-konfiguration på én gang.
# Kør: bash ~/.claude/nr-assistant/install.sh

set -e

NR_DIR="$HOME/.claude/nr-assistant"
COMMANDS_DIR="$HOME/.claude/commands/elle"
SKILLS_DIR="$HOME/.claude/skills"
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
NOTEBOOKLM_DIR="$SKILLS_DIR/notebooklm"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }
step() { echo -e "\n${BLUE}$1${NC}"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     NR_assistant — Elle installer    ║"
echo "╚══════════════════════════════════════╝"
echo ""

VERSION=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
info "Version: $VERSION"

# ─── 1. Elle commands (commands/elle/[name].md → /elle:[name]) ────────────────
step "1/4  Elle commands"

mkdir -p "$COMMANDS_DIR"
COMMANDS=(
  "onboard"
  "brief"
  "creative"
  "creative-test"
  "analyze"
  "review"
  "research"
  "strategy"
  "weekly"
  "discover"
  "audit"
  "help"
)

for cmd in "${COMMANDS[@]}"; do
  src="$NR_DIR/commands/elle/${cmd}.md"
  dst="$COMMANDS_DIR/${cmd}.md"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    ok "/elle:${cmd}"
  else
    warn "/elle:${cmd} – ikke fundet i package (spring over)"
  fi
done

# Ryd op i gamle skills-format (elle-* i skills/)
OLD_SKILLS_CLEANED=0
for old_skill in "$SKILLS_DIR"/elle-*/SKILL.md; do
  if [ -f "$old_skill" ]; then
    old_dir=$(dirname "$old_skill")
    rm -rf "$old_dir"
    OLD_SKILLS_CLEANED=$((OLD_SKILLS_CLEANED + 1))
  fi
done
if [ $OLD_SKILLS_CLEANED -gt 0 ]; then
  info "Ryddet op: $OLD_SKILLS_CLEANED gamle elle-* skills fjernet fra skills/"
fi

# ─── 2. NotebookLM skill ──────────────────────────────────────────────────────
step "2/4  NotebookLM skill"

if [ -d "$NOTEBOOKLM_DIR" ]; then
  ok "NotebookLM skill allerede installeret"
else
  info "Kloner NotebookLM skill..."
  if git clone --quiet https://github.com/PleasePrompto/notebooklm-skill "$NOTEBOOKLM_DIR" 2>/dev/null; then
    ok "NotebookLM klonet til $NOTEBOOKLM_DIR"
  else
    warn "Git clone fejlede – check din internetforbindelse og prøv manuelt:"
    warn "git clone https://github.com/PleasePrompto/notebooklm-skill $NOTEBOOKLM_DIR"
  fi
fi

# Kopier MCP server filer hvis de ikke allerede er der
if [ -f "$NR_DIR/mcp/notebooklm/mcp_server.py" ] && [ ! -f "$NOTEBOOKLM_DIR/mcp_server.py" ]; then
  cp "$NR_DIR/mcp/notebooklm/mcp_server.py" "$NOTEBOOKLM_DIR/mcp_server.py"
  cp "$NR_DIR/mcp/notebooklm/start_mcp.sh" "$NOTEBOOKLM_DIR/start_mcp.sh"
  chmod +x "$NOTEBOOKLM_DIR/start_mcp.sh"
  ok "NotebookLM MCP server kopieret"
fi

# ─── 3. Claude Desktop MCP config ─────────────────────────────────────────────
step "3/4  Claude Desktop MCP-konfiguration"

# Generér HOME-specifik mcp-entries.json fra template
MCP_ENTRIES_TEMPLATE="$NR_DIR/config/mcp-entries.template.json"
MCP_ENTRIES_RESOLVED="$NR_DIR/config/mcp-entries.json"
if [ -f "$MCP_ENTRIES_TEMPLATE" ]; then
  sed "s|__HOME__|$HOME|g" "$MCP_ENTRIES_TEMPLATE" > "$MCP_ENTRIES_RESOLVED"
fi

if [ ! -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  # Hvis Claude Desktop config ikke eksisterer, opret den med MCP entries
  mkdir -p "$(dirname "$CLAUDE_DESKTOP_CONFIG")"
  echo '{"mcpServers":{}}' > "$CLAUDE_DESKTOP_CONFIG"
  info "Oprettet ny Claude Desktop config"
fi

python3 "$NR_DIR/scripts/update_mcp_config.py" "$CLAUDE_DESKTOP_CONFIG" "$MCP_ENTRIES_RESOLVED"

# ─── 4. Klient-mappe + shortcuts ──────────────────────────────────────────────
step "4/4  Klient-database + shortcuts"

# Opret clients/ mappe (gitignored, lokalt per maskine)
CLIENTS_DIR="$NR_DIR/clients"
mkdir -p "$CLIENTS_DIR"
ok "Klient-mappe klar ($CLIENTS_DIR)"

# Migrér fra ~/agency-context/clients/ hvis den eksisterer
OLD_CONTEXT="$HOME/agency-context/clients"
if [ -d "$OLD_CONTEXT" ] && [ ! -f "$CLIENTS_DIR/.migrated" ]; then
  MIGRATED=0
  for client_dir in "$OLD_CONTEXT"/*/; do
    client_name=$(basename "$client_dir")
    if [ "$client_name" != "_template" ] && [[ "$client_name" != _* ]]; then
      if [ ! -d "$CLIENTS_DIR/$client_name" ]; then
        cp -r "$client_dir" "$CLIENTS_DIR/$client_name"
        MIGRATED=$((MIGRATED + 1))
      fi
    fi
  done
  if [ $MIGRATED -gt 0 ]; then
    ok "Migreret $MIGRATED klienter fra ~/agency-context/clients/"
    touch "$CLIENTS_DIR/.migrated"
  fi
fi

# Shortcut commands

SHORTCUT_DIR="$HOME/.claude/commands"
SHORTCUT_SRC="$NR_DIR/commands"
SHORTCUTS_INSTALLED=0
for shortcut in "$SHORTCUT_SRC"/*.md; do
  if [ -f "$shortcut" ]; then
    cp "$shortcut" "$SHORTCUT_DIR/$(basename "$shortcut")"
    SHORTCUTS_INSTALLED=$((SHORTCUTS_INSTALLED + 1))
  fi
done
if [ $SHORTCUTS_INSTALLED -gt 0 ]; then
  ok "$SHORTCUTS_INSTALLED shortcut commands installeret (/analyze, /brief, ...)"
fi

# ─── Opsummering ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo -e "${GREEN}  Elle installeret!${NC}"
echo "══════════════════════════════════════════"
echo ""
echo "Kom i gang:"
echo ""
echo "  Skriv /elle:help i Claude Code for at se alle commands og eksempler."
echo ""
echo "Opsaetning:"
echo ""
echo "  1. Genstart Claude Desktop for at aktivere MCP-konfiguration"
echo ""
echo "  2. NotebookLM auth (foerste gang, kraever Chrome + Google-login):"
echo "     cd ~/.claude/skills/notebooklm"
echo "     python scripts/run.py auth_manager.py setup"
echo ""
