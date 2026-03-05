---
description: Performance-analyse fra rå data til indsigt og anbefaling
shortcut: analyze
---

# Performance Analyse

Kør `/elle:analyze` skill med det angivne klient-navn.

## Workflow
1. Indlæs klient-kontekst + historik
2. Hent data (MCP automatisk → manuel fallback)
3. Beregn ROAS 7d_click+1d_view OG 1d_click
4. Sammenlign med benchmarks
5. Generér rapport: executive summary, tabel, narrativ, anbefaling
6. Gem i `~/agency-context/clients/[klient]/`

Brug argument som klient-navn. Eksempel: `/analyze zizzi`
