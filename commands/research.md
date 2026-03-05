---
description: Kør research-fase via NotebookLM eller web
shortcut: research
---

# Research

Kør `/elle:research` skill med det angivne klient-navn.

## Workflow
1. Indlæs klient-kontekst
2. Check NotebookLM auth + notebook library
3. Kør 5 automatiske queries (value props, VoC+, VoC-, målgruppe, konkurrenter)
4. Fallback til web research hvis ingen notebook
5. Gem i `~/.claude/nr-assistant/clients/[klient]/context/research-sources.md`

Brug argument som klient-navn. Eksempel: `/research zizzi`
