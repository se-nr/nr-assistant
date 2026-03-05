---
description: Månedlig klient-rapport fra performance data
shortcut: review
---

# Månedlig Review

Kør `/elle:review` skill med klient-navn og måned.

## Workflow
1. Indlæs klient-kontekst, historik og benchmarks
2. Hent data (MCP automatisk → manuel fallback)
3. Beregn nøgletal med begge attribution-vinduer
4. Generér rapport: executive summary, oversigtstabel, top 3 kreative, anbefaling
5. Gem rapport + opdater history.md
6. Gem i `~/agency-context/clients/[klient]/monthly-[YYYY-MM]-report.md`

Brug argument som klient + måned. Eksempel: `/review zizzi februar`
