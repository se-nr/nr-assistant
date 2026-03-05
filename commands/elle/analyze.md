---
name: elle:analyze
description: |
  Performance-analyse – fra rå data til indsigt og anbefaling.
  Brug til kampagne-analyse, attribution-sammenligning og performance-reviews.
  Trigger: "analysér performance", "kampagne analyse", "hvordan performer"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, AskUserQuestion, Bash, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Analyze

Performance-analyse workflow med agent-spawning og auto-arkivering.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/workflows/analysis.md
</execution_context>

## Process

Udfør analysis workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn er angivet som argument:
1. Load `~/.claude/nr-assistant/clients/[klient-navn]/overview.md`
2. Load `~/.claude/nr-assistant/clients/[klient-navn]/history.md` (for historiske benchmarks)

**Data-kilder (prioriteret):**
1. Hvis N+R Agency MCP er tilgængelig: brug `get_performance` og `get_top_ads` tools automatisk
2. Hvis brugeren indsætter data direkte (CSV, screenshot, tal): brug det
3. Spørg brugeren om data-kilde hvis hverken MCP eller direkte data er tilgængeligt

## Agent-spawning

Spawn `performance-analyst-meta` agent via Task tool:
```
"Analysér Meta Ads performance for [klient].
Kontekst: [indsæt overview.md + hentet data]
Følg ~/.claude/nr-assistant/knowledge/agents/performance-analyst-meta.md
Levér: Executive summary, nøgletalstabel, top ads, narrativ analyse, anbefaling."
```

## Bleed Detection

Efter agent-analyse: scan data for budget-bleed (hoejt spend, lav ROAS).

Laes benchmarks fra `~/.claude/nr-assistant/knowledge/benchmarks.md`.
Laes klient-historik fra `~/.claude/nr-assistant/clients/[klient]/history.md` (hvis den eksisterer).

Flag automatisk:
- **Kampagner** med spend > 500 kr og ROAS 7d < "Svagt" benchmark (typisk < 1,5x)
- **Ad sets** med spend > 200 kr og ROAS 7d < "Svagt" benchmark
- **Individuelle ads** med spend > 100 kr og ROAS 7d < 1,0x

Brug klient-specifikke benchmarks fra history.md hvis de eksisterer, ellers generelle benchmarks.

Output som separat sektion i rapporten:
```markdown
## Bleed Detection
[X] kampagner / ad sets / ads flaget.

| Niveau | Navn | Spend | ROAS 7d | Benchmark | Status |
|--------|------|-------|---------|-----------|--------|
| Campaign | [navn] | X kr | 0,8x | 1,5x | BLEED |
| Ad Set  | [navn] | X kr | 1,1x | 1,5x | BLEED |

Anbefaling: [konkret handling — pause, budget ned, creative swap]
```

Hvis ingen bleed: skriv "Ingen budget-bleed detekteret."

## Attribution-regel (maa ALDRIG glemmes)

- Angiv altid ROAS 7d_click+1d_view OG ROAS 1d_click
- Sammenlign med benchmarks for klientens segment

## Rapport-format

- Executive summary: bullets, Slack-venlig, ingen tabeller
- Oversigtstabel med begge attribution-vinduer
- Narrativ analyse (hvad skete, hvorfor, hvad nu)
- Anbefaling (konkret, handlingsrettet)

## Output

Gem rapport som `~/.claude/nr-assistant/clients/[klient]/analysis-[dato]-[emne].md`

## Archiver

Naar rapporten er gemt, spawn archiver agent:
```
"Arkiver analyse for [klient]. Output: [sti]. Skill: analyze.
Foelg ~/.claude/nr-assistant/knowledge/agents/archiver.md"
```

## Exit

Naar rapport er gemt og archiver er spawnet: vis summary til brugeren og stop.
Kald IKKE andre elle-commands. Spawn IKKE yderligere agents ud over archiver.
