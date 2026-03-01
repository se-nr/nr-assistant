---
name: agency-analyze
description: |
  Performance-analyse – fra rå data til indsigt og anbefaling.
  Brug til kampagne-analyse, attribution-sammenligning og performance-reviews.
  Trigger: "analysér performance", "kampagne analyse", "hvordan performer"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, AskUserQuestion, Bash
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Agency Analyze

Performance-analyse workflow. Følger workflow fra agency-context.

## Kontekst-filer

Læs disse filer ved start:
- `~/agency-context/agency/process.md` – grundregler
- `~/agency-context/agency/benchmarks.md` – platform-benchmarks
- `~/agency-context/workflows/analysis.md` – fuld workflow

## Process

Udfør analysis workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument:
1. Load `~/agency-context/clients/[klient-navn]/overview.md`
2. Load `~/agency-context/clients/[klient-navn]/history.md` (for historiske benchmarks)

**Data-kilder (prioriteret):**
1. Hvis N+R Agency MCP er tilgængelig: brug `get_performance` og `get_top_ads` tools automatisk
2. Hvis brugeren indsætter data direkte (CSV, screenshot, tal): brug det
3. Spørg brugeren om data-kilde hvis hverken MCP eller direkte data er tilgængeligt

## Attribution-regel (må ALDRIG glemmes)

- Angiv altid ROAS 7d_click+1d_view OG ROAS 1d_click
- Sammenlign med agency-benchmarks for klientens segment

## Rapport-format

- Executive summary: bullets, Slack-venlig, ingen tabeller
- Oversigtstabel med begge attribution-vinduer
- Narrativ analyse (hvad skete, hvorfor, hvad nu)
- Anbefaling (konkret, handlingsrettet)

## Output

Gem rapport som `~/agency-context/clients/[klient]/analysis-[dato]-[emne].md`
