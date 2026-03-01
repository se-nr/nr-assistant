---
name: agency:analyze
description: Performance-analyse – fra rå data til indsigt og anbefaling
argument-hint: "[klient-navn]"
allowed-tools: [Read, Write, AskUserQuestion, Bash]
---

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/agency/benchmarks.md
@~/agency-context/workflows/analysis.md
</execution_context>

<process>
Udfør analysis workflow fra execution_context.

Hvis et klient-navn er angivet som argument:
1. Load ~/agency-context/clients/[klient-navn]/overview.md
2. Load ~/agency-context/clients/[klient-navn]/history.md (for historiske benchmarks)

**Data-kilder (prioriteret):**
1. Hvis N+R Agency MCP er tilgængelig (Claude Desktop): brug `get_performance` og `get_top_ads` tools automatisk
2. Hvis brugeren indsætter data direkte (CSV, screenshot, tal): brug det
3. Spørg brugeren om data-kilde hvis hverken MCP eller direkte data er tilgængeligt

Attribution-regel (må ALDRIG glemmes):
- Angiv altid ROAS 7d_click+1d_view OG ROAS 1d_click
- Sammenlign med agency-benchmarks for klientens segment

Rapport-format (fra process.md):
- Executive summary: bullets, Slack-venlig, ingen tabeller
- Oversigtstabel med begge attribution-vinduer
- Narrativ analyse (hvad skete, hvorfor, hvad nu)
- Anbefaling (konkret, handlingsrettet)

Gem rapport som ~/agency-context/clients/[klient]/analysis-[dato]-[emne].md
</process>
