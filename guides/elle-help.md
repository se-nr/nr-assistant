# Elle — Kom i gang

Claude har direkte adgang til klientdata via MCP. Stil spørgsmål i naturligt sprog — Claude vælger automatisk de rigtige tools.

---

## Hurtig-start: Prøv disse prompts

### Overblik
```
Vis alle klienter
Giv mig et overblik over Gastrotools DK
Hvilke datakilder har Gastrotools?
```

### Meta Ads
```
Hvordan performer Gastrotools på Meta de seneste 30 dage?
Vis kampagner for Gastrotools
Hvad er de bedste ads for Gastrotools sorteret efter ROAS?
Hvilke aldersgrupper performer bedst for Gastrotools?
Hvilke lande giver bedst ROAS for Gastrotools?
Sammenlign denne uge med sidste uge for Gastrotools
```

### Google Ads
```
Hvordan performer Gastrotools på Google?
Hvilke Google kampagner kører for Gastrotools?
Vis keywords for Gastrotools sorteret efter Quality Score
Hvad søger folk efter for Gastrotools?
```

### Cross-channel
```
Sammenlign Meta og Google for Gastrotools
Giv mig et cross-channel overblik for Gastrotools
Hvad er Shopify revenue for Gastrotools per land?
```

### Klaviyo (leads)
```
Vis lead kohorter for SAYSKY
Vis de seneste leads for Won Hundred
Vis ordrer fra leads for SAYSKY
```

---

## Skills (workflows)

Skills er foruddefinerede workflows der kombinerer tools, agents og knowledge.

| Kommando | Hvad den gør |
|----------|-------------|
| `/elle:onboard [klient]` | Onboard ny klient med guided spørgsmål |
| `/elle:research [klient]` | Kør research-fase (NotebookLM + web) |
| `/elle:brief [klient]` | Lav kampagne-brief med guided spørgsmål |
| `/elle:creative [klient]` | Lav creative brief til produktion |
| `/elle:analyze [klient]` | Performance-analyse med anbefaling |
| `/elle:review [klient]` | Månedlig klientrapport |
| `/elle:strategy [klient]` | Brand- og marketingstrategi |
| `/elle:weekly [klient]` | Ugentlig performance-rapport |
| `/elle:discover [brand]` | Quick discovery af nyt brand |
| `/elle:audit [klient]` | Komplet multi-channel audit |

### Eksempel-brug
```
/elle:analyze Gastrotools DK
/elle:weekly all
/elle:discover Vinny's
/elle:onboard NyKlient
```

---

## Klienter med data

| Klient | Meta | Google | Klaviyo |
|--------|------|--------|---------|
| Gastrotools DK | ja | ja | ja |
| Gastrotools International | ja | — | — |
| Kystfisken ApS | ja | — | ja |
| SAYSKY INT | ja | — | ja |
| Won Hundred (DKK) | ja | — | ja |
| Zizzi Global | ja | — | — |

---

## Tidsperioder

Alle data-spørgsmål accepterer tidsperioder:

| Skriv | Resultat |
|-------|----------|
| `seneste 7 dage` / `last_7d` | Seneste 7 dage |
| `seneste 30 dage` / `last_30d` | Seneste 30 dage |
| `denne måned` / `this_month` | Nuværende måned |
| `sidste måned` / `last_month` | Forrige måned |
| `januar` / `2026-01` | Hele januar 2026 |
| `1. jan til 31. jan` | Eksakt interval |

### Eksempler med tidsperiode
```
Hvordan performede Gastrotools på Meta i januar?
Sammenlign februar med januar for Gastrotools
Vis Google kampagner for Gastrotools de seneste 90 dage
```

---

## Tips

- **Brug klientnavnet** i prompten — Claude slår automatisk op i databasen
- **Kombiner spørgsmål** — "Giv mig et overblik over Gastrotools med top ads og demographics"
- **Spørg om sammenligning** — "Sammenlign Meta og Google for Gastrotools denne måned"
- **Spørg frit** — Claude vælger selv de rigtige tools baseret på dit spørgsmål
