---
name: elle-strategy
description: |
  Brand- og marketingstrategi med fase-logik (context → research → planning → execution → review).
  Output: komplet strategidokument i ~/agency-context/clients/[klient]/strategies/
triggers:
  - brand strategi
  - marketingstrategi
  - lav en strategi
  - strategy for
  - strategiplan
allowed-tools: Read, Write, Bash, WebSearch, WebFetch, AskUserQuestion, Task
version: 1.1.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Strategy — Brand & Marketingstrategi

Bygger en komplet brand- og marketingstrategi i 5 faser med checkpoints, agent-spawning og auto-arkivering.

<execution_context>
@~/agency-context/agency/process.md
@~/agency-context/agency/knowledge/copywriting.md
@~/agency-context/agency/knowledge/meta-ads.md
@~/agency-context/agency/knowledge/research-methodology.md
@~/agency-context/agency/benchmarks.md
</execution_context>

**Output:** `~/agency-context/clients/[klient]/strategies/[dato]-[emne].md`

---

## Fase-oversigt

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│ 1.CONTEXT│───▶│2.RESEARCH│───▶│3.PLANNING│───▶│4.EXECUTE │───▶│ 5.REVIEW │───▶│6.ARCHIVE│
│          │    │          │    │          │    │          │    │          │    │         │
│ Spoergsmaal│  │ NotebookLM│   │ Strategi-│    │ Skriv det│    │ Godkend  │    │ Auto-   │
│ + brief  │    │ + Web     │    │ beslut-  │    │ faerdige │    │ + iterer │    │ arkivér │
│          │    │           │    │ ninger   │    │ dokument │    │          │    │         │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └─────────┘
     checkpoint      checkpoint      checkpoint      checkpoint      DONE         archiver
```

## Agent-spawning

I Fase 2 (Research): spawn `brand-market-research` agent:
```
"Lav research for [klient] strategi.
Følg ~/agency-context/agency/agents/brand-market-research.md"
```

I Fase 3 (Planning): spawn `brand-marketing-strategist` agent:
```
"Udvikl strategiske beslutninger for [klient].
Kontekst: [context-brief + research-output]
Følg ~/agency-context/agency/agents/brand-marketing-strategist.md"
```

## Archiver (Fase 6 — automatisk efter godkendelse)

Spawn archiver agent:
```
"Arkivér strategi for [klient]. Output: [sti]. Skill: strategy.
Følg ~/agency-context/agency/agents/archiver.md"
```

---

## Fase 1: CONTEXT (spoergsmaal + eksisterende data)

### 1a. Tjek eksisterende klientdata
Kig efter `~/agency-context/clients/[klient]/overview.md`.
- Hvis den findes: laes den og brug som udgangspunkt
- Hvis ikke: koer de basale onboarding-spoergsmaal foerst (brand, TOV, platforme)

### 1b. Strategi-specifikke spoergsmaal
Stil disse spoergsmaal 2-3 AD GANGEN (ikke alle paa en gang):

**Scope:**
1. "Hvad er formaalet med strategien? (nyt brand launch / rebrand / ny kanal / kvartalsplan / aarlig strategi)"
2. "Hvilken tidshorisont daekker den? (Q1, H1, 2026, etc.)"
3. "Er der et samlet budget eller budget-range?"

**Maal:**
4. "Hvad er de primaere KPI'er? (revenue, ROAS, CAC, leads, awareness)"
5. "Er der specifikke targets? (fx 'ROAS over 3.0' eller '100 leads/dag')"

**Marked:**
6. "Hvilke markeder? (DK, NO, DE, NL, osv.)"
7. "Er der markeder der er vigtigere end andre?"

**Kanaler:**
8. "Hvilke kanaler er i spil? (Meta, Google, Klaviyo, TikTok, etc.)"
9. "Er der kanaler I vil teste for foerste gang?"

**Kontekst:**
10. "Hvad har virket godt indtil nu? Hvad har IKKE virket?"
11. "Er der saesonalitet eller events vi skal planlaegge omkring? (Black Friday, sommer, etc.)"

### 1c. Opsummer context-brief
Skriv et kort context-brief (10-15 linjer) der opsummerer svarene.
Vis det til brugeren:

> **CHECKPOINT 1:** "Her er hvad jeg har forstaaet. Er det korrekt, eller skal noget justeres?"

Vent paa godkendelse foer Fase 2.

---

## Fase 2: RESEARCH (data + indsigter)

### 2a. Performance-data (hvis klienten har historik)
Hent via MCP eller bed brugeren indsaette:
- `get_performance([klient], "last_90d")` — overordnet performance
- `get_top_ads([klient], "last_90d", "roas", 10)` — top 10 ads
- `get_demographic_breakdown([klient], "last_90d", "age")` — alder
- `get_demographic_breakdown([klient], "last_90d", "country")` — lande

Opsummer: hvad virker, hvad virker ikke, hvor er mulighederne.

### 2b. NotebookLM research (hvis notebook findes)
Koer 5 queries mod klientens notebook:
1. "Hvad er brandets primaere value propositions og differentiatorer?"
2. "Hvad siger tilfredse kunder — hvilke ord og temaer gaar igen?"
3. "Hvad er de hyppigste klager eller barrierer for koeb?"
4. "Hvem er den typiske kunde — demografi, livsstil, behov?"
5. "Hvem er de 3-5 vigtigste konkurrenter og hvordan positionerer de sig?"

### 2c. Web research (altid — supplerer NotebookLM)

**2c.1 — Trustpilot VoC:**
1. WebSearch: `[brand] site:trustpilot.com/review`
2. WebFetch Trustpilot-siden → udtraek de seneste 10-20 anmeldelser
3. Kategoriser: positive temaer, negative temaer, gennemgaaende sprog

**2c.2 — Reddit/forum VoC:**
1. WebSearch: `[brand] OR [kategori] site:reddit.com`
2. WebFetch 2-3 traade med hoejest relevans
3. Udtraek ufiltreret kundesprog, frustrationer, oensker

**2c.3 — Konkurrentanalyse:**
1. WebSearch: `[konkurrent 1] [kategori] anmeldelse` (gentag for top 3 konkurrenter)
2. WebFetch konkurrenternes hjemmesider
3. Sammenlign positionering, priser, USP'er, TOV

**2c.4 — Brandets egen kommunikation:**
1. WebFetch brandets hjemmeside (forside + about/om-side)
2. Analyser tone, budskaber, visuel stil, prisniveau
3. Noter gab mellem brand-kommunikation og kundeoplevelse (fra VoC)

**2c.5 — Kategori-trends:**
1. WebSearch: `[kategori] trends 2026`
2. WebFetch 2-3 relevante artikler
3. Identificer markedsbevaegelser, nye forbrugermonstre, teknologi-skift

### 2d. Research-opsummering
Skriv en research-opsummering med sektioner:
- **Performance-indsigter** (fra data)
- **Voice of Customer** (fra NotebookLM + Trustpilot + Reddit)
- **Konkurrentlandskab** (fra web research)
- **Muligheder & trusler** (syntese)

> **CHECKPOINT 2:** "Her er research-opsummeringen. Er der noget der mangler, eller skal jeg grave dybere i noget specifikt?"

Vent paa godkendelse foer Fase 3.

---

## Fase 3: PLANNING (strategiske beslutninger)

### 3a. Positionering
Baseret paa research, foreslaa:
- **Brand-positionering:** En saetning der definerer brandets plads i markedet
- **Differentiator:** Hvad goer brandet unikt vs. konkurrenterne
- **Kategori-frame:** Hvilken kategori brandet spiller i (og om den skal reframes)

### 3b. Maalgruppe (5H Framework)
Definer primaer og sekundaer maalgruppe:
1. **WHO** — Demografi, livsstil, adfaerd
2. **WHAT** — Hvad soeger de? Hvad er deres problem?
3. **WHY (emotionel)** — Hvilket foelelsesmaessigt behov opfylder brandet?
4. **WHY (funktionel)** — Hvilken praktisk fordel faar de?
5. **WHY NOT** — Hvad holder dem tilbage? Barrierer for koeb

### 3c. Funnel-strategi
Definer tilgang for hvert funnel-stadie:

| Stadie | Maal | Kanaler | Budskab-type | Budget-andel |
|--------|------|---------|-------------|-------------|
| **FP** (Future Prospects) | Awareness, reach | Meta (Broad), YouTube, TikTok | Brand story, category education | X% |
| **IM** (Immediate Market) | Engagement, interest | Meta (Interest), Google Search | Value props, social proof | X% |
| **IP** (Immediate Prospects) | Konvertering | Meta (Retargeting), Google Shopping | Trust, urgency, tilbud | X% |
| **EC** (Existing Customers) | Retention, LTV | Klaviyo, Meta (Custom Audiences) | Cross-sell, loyalty, VIP | X% |

### 3d. Kanal-plan
For hver kanal, definer:
- Rolle i funnelen
- Budget-allokering
- Vigtigste kampagne-typer
- KPI-targets per kanal

### 3e. Content-strategi
- Kreative koncepter (3-5 angles baseret paa VoC + positionering)
- Format-mix (video vs. static vs. carousel)
- Saesonkalender / kampagne-roadmap

> **CHECKPOINT 3:** "Her er strategi-planen. Vil du justere positionering, maalgruppe, budget-fordeling eller noget andet?"

Vent paa godkendelse foer Fase 4.

---

## Fase 4: EXECUTION (skriv det faerdige dokument)

### 4a. Strategi-dokument
Skriv det komplette strategidokument med denne struktur:

```markdown
# [Brand] — Marketing Strategi [Periode]

## Executive Summary
- 5-7 bullets der opsummerer hele strategien
- Skrevet saa en CEO kan laese det og forstaa retningen

## 1. Udgangspunkt
- Nuvaerende situation (performance, marked, udfordringer)
- Formaal med denne strategi

## 2. Positionering & Differentiering
- Brand-positionering
- Kategori-frame
- Konkurrentlandskab

## 3. Maalgruppe
- Primaer persona (5H)
- Sekundaer persona (5H)
- Barrierer og drivers

## 4. Funnel-strategi
- FP → IM → IP → EC med budskaber, kanaler, budget

## 5. Kanal-plan
- Meta Ads: kampagnestruktur, targeting, budget
- Google Ads: kampagnetyper, keyword-strategi
- Klaviyo: flows, kampagner, segmentering
- [Ovrige kanaler]

## 6. Content & Kreativt
- Kreative koncepter
- Format-strategi
- Produktionsplan

## 7. Budget & KPI'er
- Budget-fordeling per kanal og funnel-stadie
- KPI-targets per maaned/kvartal
- Break-even og ROAS-krav

## 8. Kampagne-roadmap
- Maanedlig oversigt med kampagner, launches, saeson-events

## 9. Maaling & Optimering
- Attribution-setup
- Rapporteringskadence
- Optimeringsprincipper
```

### 4b. Gem filen
Gem i: `~/agency-context/clients/[klient]/strategies/[dato]-[emne].md`
Opret mappen `strategies/` hvis den ikke findes.

> **CHECKPOINT 4:** "Strategidokumentet er klar. Gennemgaa det og giv feedback."

Vent paa feedback. Hvis brugeren har aendringer, lav dem og vis de aendrede sektioner.

---

## Fase 5: REVIEW & GODKENDELSE

### 5a. Feedback-loop
Hvis brugeren har aendringer:
- Lav aendringerne
- Vis kun de aendrede sektioner
- Gentag til godkendt

### 5b. Afledte outputs
Naar strategien er godkendt, tilbyd:
- "Skal jeg lave kampagne-briefs baseret paa strategien?" → `/elle:brief`
- "Skal jeg opdatere klientens overview.md med den nye positionering?" → opdater overview
- "Skal jeg lave en praesentation af strategien?" → document/presentation agent

### 5c. Opdater klient-historik
Tilfoej til `~/agency-context/clients/[klient]/history.md`:
```markdown
## [dato] — Strategi: [emne]
- Scope: [periode]
- Positionering: [en saetning]
- Primaer KPI: [target]
- Fil: strategies/[dato]-[emne].md
```

> **DONE:** Strategien er godkendt og gemt. Klient-historik opdateret.

---

## Regler

1. **En fase ad gangen** — vis altid checkpoint og vent paa godkendelse
2. **Vis aldrig alle spoergsmaal paa en gang** — stil 2-3 ad gangen, maks
3. **Brug eksisterende data** — tjek altid overview.md, research-sources.md, og MCP foerst
4. **Begge attribution-vinduer** — al ROAS-data vises som 7d_click+1d_view OG 1d_click
5. **Dansk sprog** — hele dokumentet skrives paa dansk medmindre andet aftales
6. **Iterer hellere end at gaette** — hvis noget er uklart, spoerg i stedet for at antage
