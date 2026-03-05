---
name: elle:help
description: |
  Vis tilgængelige Elle-kommandoer og eksempel-prompts.
  Brug til at komme i gang med Elle commands og N+R MCP tools.
  Trigger: "elle help", "hvad kan du", "kom i gang"
allowed-tools: Read, Bash
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

<objective>
Display the complete Elle command reference and check for updates.

Output ONLY the reference content below + version status. Do NOT add:
- Project-specific analysis
- Data lookups or tool calls
- Next-step suggestions
- Any commentary beyond the reference and version check
</objective>

<execution_context>
@~/.claude/nr-assistant/guides/elle-help.md
</execution_context>

<process>

## Trin 1: Version-check

Laes lokal version:
```
Read ~/.claude/nr-assistant/VERSION
```

Hent remote version (timeout 5 sek, fejl er OK):
```bash
git -C ~/.claude/nr-assistant fetch --quiet origin main 2>/dev/null && \
git -C ~/.claude/nr-assistant show origin/main:VERSION 2>/dev/null || echo ""
```

Sammenlign:
- Hvis remote er tom eller fejler: vis kun lokal version, ingen advarsel.
- Hvis remote == lokal: vis "Elle vX.Y.Z (up to date)"
- Hvis remote != lokal: vis "Elle vX.Y.Z — ny version vA.B.C tilgaengelig. Koer: bash ~/.claude/nr-assistant/update.sh"

## Trin 2: Vis help-guide

Output the complete elle help guide from @~/.claude/nr-assistant/guides/elle-help.md.
Display the reference content directly — no additions or modifications.

</process>

## Exit

Naar version-status og help-guide er vist: stop. Ingen yderligere handlinger.
