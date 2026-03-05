---
name: elle:weekly
description: |
  Ugentlig performance-rapport. Hurtig, Slack-venlig, med begge attribution-vinduer.
  Output: rapport i ~/.claude/nr-assistant/clients/[klient]/ + auto-arkivering.
  Trigger: "ugentlig rapport", "weekly report", "uge status", "ugens performance"
argument-hint: "[klient-navn] (eller 'all' for alle klienter)"
allowed-tools: Read, Write, Bash, Task, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Weekly — Ugentlig Performance-rapport

Hurtig ugentlig rapport: data ind, indsigter ud, arkiveret automatisk.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/knowledge/klaviyo.md
</execution_context>

<process>

## Trin 1: Identificer klient

Hvis argument er angivet: brug det.
Hvis argument er "all": list alle mapper i `~/.claude/nr-assistant/clients/` (ekskluder _template*) og koer for hver.
Ellers: spoerg brugeren.

Laes `~/.claude/nr-assistant/clients/[klient]/overview.md` for kontekst.

## Trin 2: Hent performance-data

Brug NR Agency MCP tools (ALDRIG beregn metrics manuelt):

```
1. get_performance([klient], "last_7d") → denne uges noegletal
2. compare_periods([klient], "last_7d", "previous_7d") → uge-over-uge aendring
3. get_top_ads([klient], "last_7d", "roas", 5) → top 5 ads
```

Hvis MCP ikke er tilgaengelig: spoerg brugeren om data.

## Trin 3: Spawn performance-analyst agent

Brug Task tool til at spawne `performance-analyst-meta` agent:

```
Prompt til agent:
"Analysér ugentlig Meta Ads performance for [klient].
Kontekst: [indsaet overview.md + data fra trin 2]
Levér: Executive summary (5 bullets), noegletalstabel, top 3 ads, 2-3 anbefalinger.
Foelg format fra ~/.claude/nr-assistant/knowledge/agents/performance-analyst-meta.md"
```

## Trin 4: Check Klaviyo (hvis relevant)

Hvis klienten har Klaviyo (tjek overview.md):
- Hent `get_campaign_report` for seneste uge via Klaviyo MCP
- Tilfoej email-metrics til rapporten

## Trin 5: Komponer rapport

Saml agent-output til faerdig rapport:

```markdown
# [Klient] — Ugentlig Rapport — Uge [X], [YYYY]

## Quick Summary
- [5-7 bullets — Slack-venlig, copy-paste klar]

## Noegletal
| Metric | Denne uge | Sidste uge | Aendring |
|--------|----------|-----------|---------|
| Spend  | X        | X         | +/-X%   |
| ROAS 7d| X        | X         | +/-X%   |
| ROAS 1d| X        | X         | +/-X%   |
| Purchases | X     | X         | +/-X%   |
| CTR    | X        | X         | +/-X%   |

## Top 3 Ads
1. [ad-navn] — ROAS [X], spend [X]
2. ...

## Anbefalinger
1. [handling 1]
2. [handling 2]
```

Gem som: `~/.claude/nr-assistant/clients/[klient]/weekly-[YYYY-WXX]-report.md`

## Trin 6: Trigger archiver

Spawn archiver agent via Task tool:
```
"Arkivér ugentlig rapport for [klient].
Output-fil: [sti fra trin 5]
Key metrics: { spend: X, roas_7d: X, roas_1d: X, purchases: X }
Skill type: weekly
Foelg ~/.claude/nr-assistant/knowledge/agents/archiver.md"
```

## Trin 7: Vis rapport

Vis Quick Summary-sektionen direkte til brugeren (Slack-klar).
Informer om at fuld rapport er gemt i [sti].

</process>

<output>
- `~/.claude/nr-assistant/clients/[klient]/weekly-[YYYY-WXX]-report.md` — fuld rapport
- `~/.claude/nr-assistant/clients/[klient]/history.md` — opdateret via archiver
- Slack-venlig summary vist direkte i chat
</output>
