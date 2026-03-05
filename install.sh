#!/bin/bash
# NR_assistant installer — Elle
# Installerer alle skills, kontekst-links og MCP-konfiguration på én gang.
# Kør: bash ~/.claude/nr-assistant/install.sh

set -e

NR_DIR="$HOME/.claude/nr-assistant"
SKILLS_DIR="$HOME/.claude/skills"
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CONTEXT_DIR="$HOME/agency-context"
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

# ─── 1. Skills (plugin format: skills/[name]/SKILL.md) ───────────────────────
step "1/4  Elle skills"

mkdir -p "$SKILLS_DIR"
SKILLS=(
  "elle-onboard"
  "elle-brief"
  "elle-creative"
  "elle-analyze"
  "elle-review"
  "elle-research"
  "elle-strategy"
  "elle-weekly"
  "elle-discover"
  "elle-audit"
  "elle-help"
)

for skill in "${SKILLS[@]}"; do
  src_dir="$NR_DIR/skills/$skill"
  dst_dir="$SKILLS_DIR/$skill"
  if [ -f "$src_dir/SKILL.md" ]; then
    mkdir -p "$dst_dir"
    cp "$src_dir/SKILL.md" "$dst_dir/SKILL.md"
    ok "$skill/SKILL.md"
  else
    warn "$skill/SKILL.md – ikke fundet i package (spring over)"
  fi
done

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

# ─── 4. agency-context ────────────────────────────────────────────────────────
step "4/4  Klient kontekst-database"

if [ -d "$CONTEXT_DIR/.git" ]; then
  ok "Klient-database fundet (~/agency-context)"
elif [ -d "$CONTEXT_DIR" ]; then
  ok "Klient-database fundet (~/agency-context)"
else
  info "Klient-database (~/agency-context) sættes op separat — spørg admin"
fi

# ─── Opsummering ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo -e "${GREEN}  Elle installeret!${NC}"
echo "══════════════════════════════════════════"
echo ""
echo "Næste skridt:"
echo ""
echo "  1. Genstart Claude Desktop for at aktivere MCP-konfiguration"
echo ""
echo "  2. NotebookLM auth (første gang, kræver Chrome + Google-login):"
echo "     cd ~/.claude/skills/notebooklm"
echo "     python scripts/run.py auth_manager.py setup"
echo ""
echo "  3. N+R Agency MCP (deployes én gang af admin til Vercel):"
echo "     Se ~/.claude/nr-assistant/mcp/nr-agency-mcp/README.md"
echo ""
echo "  4. Tilgængelige skills i Claude Code:"
for skill in "${SKILLS[@]}"; do
  cmd="/${skill}"
  echo "     $cmd"
done
echo "     /notebooklm (query, list, search)"
echo ""
echo "  5. Slash commands (shortcuts):"
echo "     /onboard, /brief, /creative, /analyze, /review, /research, /strategy"
echo ""
