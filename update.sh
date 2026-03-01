#!/bin/bash
# NR_assistant updater
# Puller seneste version fra GitHub og re-deployer skills + config.
# Kør: bash ~/.claude/nr-assistant/update.sh

set -e

NR_DIR="$HOME/.claude/nr-assistant"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       NR_assistant – updater         ║"
echo "╚══════════════════════════════════════╝"
echo ""

BEFORE=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")
info "Nuværende version: $BEFORE"

# Pull latest
if [ -d "$NR_DIR/.git" ]; then
  info "Puller seneste version fra GitHub..."
  cd "$NR_DIR"
  git pull --quiet origin main
  AFTER=$(cat "$NR_DIR/VERSION" 2>/dev/null || echo "unknown")

  if [ "$BEFORE" = "$AFTER" ]; then
    ok "Allerede up-to-date ($AFTER)"
  else
    ok "Opdateret: $BEFORE → $AFTER"
  fi
else
  warn "NR_assistant er ikke git-tracked – spring pull over"
  warn "Tilknyt et GitHub remote: git -C $NR_DIR remote add origin <URL>"
fi

# Re-deploy skills
echo ""
info "Deployer skills..."
bash "$NR_DIR/install.sh"
