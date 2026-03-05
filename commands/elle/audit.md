---
name: elle:audit
description: |
  Comprehensive multi-channel audit af en klient. Meta + Klaviyo + Google.
  Output: audit-rapport med account-sundhed, prioriteret handlingsplan.
  Trigger: "audit klient", "comprehensive audit", "fuld gennemgang", "account audit"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Task, Bash, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Audit — Comprehensive Klient-audit

Multi-channel audit: Meta Ads + Klaviyo + Google Ads → samlet vurdering og prioriteret handlingsplan.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/knowledge/klaviyo.md
@~/.claude/nr-assistant/knowledge/knowledge/google-ads.md
</execution_context>

<process>

## Trin 1: Identificer klient og kanaler

Laes `~/.claude/nr-assistant/clients/[klient]/overview.md`:
- Hvilke kanaler er aktive? (Meta, Google, Klaviyo, etc.)
- Hvad er klientens maal og targets?
- Er der historik fra tidligere analyser? (tjek history.md)

Spoerg brugeren hvis overview.md mangler: "Hvilke kanaler skal auditeres?"

## Trin 2: Spawn kanal-analysts parallelt

Spawn op til 3 agents parallelt via Task tool (kun for aktive kanaler):

**Agent 1 — Meta Ads:**
```
"Lav Meta Ads audit for [klient].
Hent data via NR Agency MCP: get_performance(last_30d), get_top_ads(last_30d, roas, 10), get_demographic_breakdown(last_30d, age), get_demographic_breakdown(last_30d, country).
Klient-kontekst: [indsaet overview.md]
Foelg ~/.claude/nr-assistant/knowledge/agents/performance-analyst-meta.md
Fokus paa: kampagnestruktur, creative performance, audience efficiency, budget-allokering."
```

**Agent 2 — Klaviyo:**
```
"Lav Klaviyo audit for [klient].
Hent data via Klaviyo MCP: get_flows, get_flow_report, get_campaign_report, get_segments.
Foelg ~/.claude/nr-assistant/knowledge/agents/performance-analyst-klaviyo.md
Fokus paa: flow-sundhed, campaign-cadence, segmentering, deliverability."
```

**Agent 3 — Google Ads (hvis aktiv):**
```
"Lav Google Ads audit for [klient].
Foelg ~/.claude/nr-assistant/knowledge/agents/performance-analyst-google.md
Fokus paa: kampagnestruktur, Quality Score, bidding, feed-kvalitet."
```

## Trin 3: Saml resultater

Vent paa alle agents. Saml output.

## Trin 4: Spawn analysis-orchestrator

Spawn `analysis-orchestrator` agent:
```
"Syntetisér kanal-audits til samlet vurdering for [klient].
Meta-audit: [indsaet output fra agent 1]
Klaviyo-audit: [indsaet output fra agent 2]
Google-audit: [indsaet output fra agent 3, hvis relevant]
Foelg ~/.claude/nr-assistant/knowledge/agents/analysis-orchestrator.md
Levér: Cross-channel indsigter, budget-anbefaling, prioriteret handlingsplan (top 10)."
```

## Trin 5: Komponer audit-rapport

```markdown
# [Klient] — Comprehensive Audit
**Dato:** [YYYY-MM-DD]
**Periode analyseret:** [X]
**Kanaler:** Meta Ads, Klaviyo[, Google Ads]

---

## Executive Summary
- [7-10 bullets med de vigtigste findings paa tvaers af kanaler]

## Account Sundhed
| Kanal | Status | Score |
|-------|--------|-------|
| Meta Ads | [Godt/OK/Kritisk] | [1-5]/5 |
| Klaviyo | [Godt/OK/Kritisk] | [1-5]/5 |
| Google Ads | [Godt/OK/Kritisk] | [1-5]/5 |
| **Samlet** | [X] | [X]/5 |

## Meta Ads
### Noegletal
[tabel med spend, ROAS 7d, ROAS 1d, CTR, CPC, purchases]

### Kampagnestruktur
[vurdering af funnelstruktur, naming, antal ad sets]

### Creative Performance
[top 5 ads, creative themes der virker/ikke virker]

### Audience Efficiency
[demografi, lande, audience overlap]

### Budget-allokering
[prospecting vs. retargeting split, anbefaling]

## Klaviyo
### Flow Performance
[tabel med flows, open rate, click rate, revenue]

### Campaign Performance
[seneste kampagner, engagement-metrics]

### Deliverability & Sundhed
[bounce rate, spam, sunset-status]

### Segmentering
[aktive vs. inaktive, VIP-segment]

## Google Ads (hvis aktiv)
[tilsvarende struktur]

## Cross-Channel Indsigter
[overlap, synergier, gaps mellem kanaler]

## Prioriteret Handlingsplan
| # | Handling | Kanal | Impact | Effort | Prioritet |
|---|---------|-------|--------|--------|----------|
| 1 | [X] | [X] | Hoej | Lav | NU |
| 2 | [X] | [X] | Hoej | Medium | Denne uge |
...

## Naeste Skridt
[2-3 saetninger om anbefalet fremgangsmade]
```

Gem som: `~/.claude/nr-assistant/clients/[klient]/audit-[YYYY-MM-DD].md`

## Trin 6: Trigger archiver

Spawn archiver agent:
```
"Arkivér audit for [klient].
Output-fil: [sti]
Key metrics: { meta_roas_7d, meta_roas_1d, meta_spend, klaviyo_revenue, account_health_score }
Skill type: audit
Foelg ~/.claude/nr-assistant/knowledge/agents/archiver.md"
```

## Trin 7: Vis rapport

Vis Executive Summary + Prioriteret Handlingsplan direkte i chat.
Informer om at fuld rapport er gemt i [sti].
Naevn at brugeren kan koere `/elle:brief` for kampagne-briefs baseret paa handlingsplanen.

## Exit

Naar rapport er vist og archiver er spawnet: stop.
Kald IKKE andre elle-commands automatisk. Spawn IKKE yderligere agents ud over archiver.
Forslag om `/elle:brief` er kun information — brugeren starter det selv.

</process>

<output>
- `~/.claude/nr-assistant/clients/[klient]/audit-[YYYY-MM-DD].md` — fuld audit-rapport
- `~/.claude/nr-assistant/clients/[klient]/history.md` — opdateret via archiver
- Executive Summary + Handlingsplan vist direkte i chat
</output>
