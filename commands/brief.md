---
description: Skriv et kreativt brief for en klient-kampagne
shortcut: brief
---

# Kreativt Brief

Kør `/agency-brief` skill med det angivne klient-navn.

## Workflow
1. Indlæs klient-kontekst fra agency-context
2. Check research-sources.md (foreslå `/agency-research` hvis mangler)
3. Stil spørgsmål om kampagnemål, kanal, budget
4. Generér brief med hooks, copy angles, targeting
5. Gem i `~/agency-context/clients/[klient]/briefs/`

Brug argument som klient-navn. Eksempel: `/brief zizzi`
