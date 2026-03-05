---
name: elle:review
description: |
  Månedlig status – fra performance-data til komplet klient-rapport.
  Brug til månedlige klient-reviews med rapport og næste måneds prioriteter.
  Trigger: "månedsstatus", "monthly review", "klient rapport"
argument-hint: "[klient-navn] [måned]"
allowed-tools: Read, Write, AskUserQuestion, Bash, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Monthly Review

Månedlig status-review med cross-channel orchestrator og auto-arkivering.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/knowledge/klaviyo.md
@~/.claude/nr-assistant/knowledge/templates/monthly-report.md
@~/.claude/nr-assistant/knowledge/workflows/monthly-review.md
</execution_context>

## Process

Udfør monthly-review workflow fra kontekst-filerne ovenfor.

Hvis et klient-navn (og evt. måned) er angivet som argument:
1. Load `~/.claude/nr-assistant/clients/[klient-navn]/overview.md`
2. Load `~/.claude/nr-assistant/clients/[klient-navn]/history.md`
3. Brug klient-specifikt baseline fremfor generelle benchmarks

**Data-kilder (prioriteret):**
1. Hvis N+R Agency MCP er tilgængelig: brug `get_performance`, `get_top_ads` og `get_demographic_breakdown` automatisk
2. Hvis brugeren indsætter data direkte: brug det
3. Spørg brugeren om data-kilde hvis hverken MCP eller direkte data er tilgængeligt

## Agent-spawning

Spawn `analysis-orchestrator` agent via Task tool:
```
"Lav månedlig review for [klient], [måned].
Kontekst: [indsæt overview.md + data + historik]
Følg ~/.claude/nr-assistant/knowledge/agents/analysis-orchestrator.md
Levér: Cross-channel summary, kanal-gennemgang, top kreative, anbefaling til næste måned."
```

Hvis klienten har Klaviyo: spawn `performance-analyst-klaviyo` parallelt for email-metrics.

## Attribution-regel (altid)

- ROAS 7d_click+1d_view (til klientrapportering)
- ROAS 1d_click (internt benchmark)

## Rapport-format

- Executive summary (3-5 bullets, Slack-venlig)
- Oversigtstabel (spend, ROAS 7d, ROAS 1d, leads/conversions)
- Kanal-specifik gennemgang + top 3 kreative
- Konklusion og anbefaling til næste måned

## Output

Gem rapport som `~/.claude/nr-assistant/clients/[klient]/monthly-[YYYY-MM]-report.md`

## Archiver

Naar rapporten er gemt, spawn archiver agent:
```
"Arkiver maanedlig review for [klient]. Output: [sti]. Skill: review.
Foelg ~/.claude/nr-assistant/knowledge/agents/archiver.md"
```

## Exit

Naar rapport er gemt og archiver er spawnet: vis summary og stop.
Kald IKKE andre elle-commands automatisk. Spawn IKKE yderligere agents ud over archiver + klaviyo-analyst.
