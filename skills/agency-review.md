---
name: agency:review
description: Månedlig status – fra performance-data til komplet klient-rapport
argument-hint: "[klient-navn] [måned]"
allowed-tools: [Read, Write, AskUserQuestion, Bash]
---

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/agency/benchmarks.md
@~/agency-context/agency/templates/monthly-report.md
@~/agency-context/workflows/monthly-review.md
</execution_context>

<process>
Udfør monthly-review workflow fra execution_context.

Hvis et klient-navn (og evt. måned) er angivet som argument:
1. Load ~/agency-context/clients/[klient-navn]/overview.md
2. Load ~/agency-context/clients/[klient-navn]/history.md
3. Brug klient-specifikt baseline fremfor generelle benchmarks

**Data-kilder (prioriteret):**
1. Hvis N+R Agency MCP er tilgængelig: brug `get_performance`, `get_top_ads` og `get_demographic_breakdown` automatisk
2. Hvis brugeren indsætter data direkte: brug det
3. Spørg brugeren om data-kilde hvis hverken MCP eller direkte data er tilgængeligt

Attribution-regel (altid):
- ROAS 7d_click+1d_view (til klientrapportering)
- ROAS 1d_click (internt benchmark)

Rapport-format (fra process.md):
- Executive summary (3-5 bullets, Slack-venlig)
- Oversigtstabel (spend, ROAS 7d, ROAS 1d, leads/conversions)
- Kanal-specifik gennemgang + top 3 kreative
- Konklusion og anbefaling til næste måned

Gem rapport som ~/agency-context/clients/[klient]/monthly-[YYYY-MM]-report.md
Opdater ~/agency-context/clients/[klient]/history.md med nøgle-læringsmomenter.
</process>
