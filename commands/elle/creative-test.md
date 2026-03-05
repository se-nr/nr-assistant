---
name: elle:creative-test
description: |
  Identificer hook patterns fra top-performende ads og generer test-koncepter + kalender.
  Output: hook-analyse + 10-15 nye koncepter + 30-dages test-kalender.
  Trigger: "creative test", "hook analyse", "hvad virker kreativt", "test kalender"
argument-hint: "[klient-navn]"
allowed-tools: Read, Write, Task, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Creative Test — Hook Pattern Analyse + Test-koncepter

Analyserer top ads → identificerer hook patterns → genererer nye koncepter → leverer test-kalender.

<execution_context>
@~/.claude/nr-assistant/knowledge/process.md
@~/.claude/nr-assistant/knowledge/benchmarks.md
@~/.claude/nr-assistant/knowledge/knowledge/meta-ads.md
@~/.claude/nr-assistant/knowledge/knowledge/copywriting.md
</execution_context>

<process>

## Trin 1: Identificer klient

Hvis argument er angivet: brug det.
Ellers: spoerg brugeren.

Laes `~/.claude/nr-assistant/clients/[klient]/overview.md` for brand-kontekst og TOV.
Laes `~/.claude/nr-assistant/clients/[klient]/context/research-sources.md` hvis den eksisterer (VoC til koncepter).

## Trin 2: Hent top ads data

Brug NR Agency MCP tools:

```
1. get_top_ads([klient], "last_30d", "roas", 20) → top 20 ads efter ROAS
2. get_top_ads([klient], "last_30d", "spend", 20) → top 20 ads efter spend
```

Kombiner til unik liste (typisk 25-40 ads).

For hver ad: hent creative details via MCP:
```
3. get_ad_details([ad_id]) → headline, body, format, thumbnail_url, cta_type, link_url
```

Hvis MCP ikke er tilgaengelig: spoerg brugeren om at indsaette data.

## Trin 3: Analysér hook patterns

Kategorisér hver ad's hook-type:
- **Problem-agitation**: starter med et problem kunden genkender
- **Social proof**: starter med kundecitat, anmeldelse, eller "X kunder har..."
- **Benefit-first**: leder med resultatet/fordelen
- **Curiosity**: stiller spoergsmaal eller skaber intrigue
- **Offer/promo**: leder med rabat, tilbud, eller tidsbegrensning
- **Storytelling**: narrativ aabning
- **UGC/testimonial**: foerstepersons-perspektiv

Tael:
- Hook-type fordeling (hvor mange ads bruger hvilken type)
- Performance per hook-type (gns. ROAS, CTR)
- Format-fordeling (image vs. video vs. carousel)
- CTA-fordeling
- Sprog-moenstre (genanvendte ord, saetningsstrukturer)

## Trin 4: Komponer pattern-rapport

```markdown
# [Klient] — Creative Hook Analyse
**Periode:** Seneste 30 dage
**Ads analyseret:** [X]

## Hook Pattern Fordeling
| Hook-type | Antal | Gns. ROAS 7d | Gns. CTR | Bedste ad |
|-----------|-------|-------------|----------|-----------|
| Benefit-first | X | X | X% | [navn] |
| Social proof | X | X | X% | [navn] |
| ... | | | | |

## Top 5 Hooks (hoejeste ROAS)
1. "[foerste linje af ad]" — ROAS [X], hook-type: [X]
2. ...

## Format Performance
| Format | Antal | Gns. ROAS 7d | Gns. CTR |
|--------|-------|-------------|----------|
| Image  | X     | X           | X%       |
| Video  | X     | X           | X%       |
| Carousel | X   | X           | X%       |

## Sprog-moenstre
- Genanvendte ord: [liste]
- Typisk saetningslaegende: [X]
- CTA-moenstre: [X]

## Key Takeaways
1. [X]
2. [X]
3. [X]
```

## Trin 5: Generer test-koncepter

Baseret paa pattern-analyse + VoC (hvis tilgaengelig), generer 10-15 nye koncepter.

Spawn `meta-ads-copywriter` agent via Task tool:
```
"Generer 10-15 nye ad-koncepter for [klient] baseret paa hook-analyse.
Top hook-typer: [indsaet fra trin 4]
Brand-kontekst: [indsaet overview.md]
VoC: [indsaet research-sources hvis tilgaengelig]
Foelg ~/.claude/nr-assistant/knowledge/agents/meta-ads-copywriter.md

Krav:
- Minimum 3 variationer af den bedst-performende hook-type
- Minimum 2 koncepter med hook-typer der IKKE er testet endnu
- Hvert koncept: primary text + headline + hook-type + format-anbefaling
- Angiv funnel-stadie (FP/IM/IP/EC) for hvert koncept"
```

## Trin 6: Lav 30-dages test-kalender

Baseret paa koncepter fra trin 5, lav en test-kalender:

```markdown
## 30-Dages Test-kalender

**Princip:** 2-3 nye koncepter per uge, altid med kontrol-ad.

| Uge | Test | Koncepter | Format | Hook-type | Maal |
|-----|------|-----------|--------|-----------|------|
| 1 | Hook-test A | Koncept 1 vs 2 vs kontrol | Image | Benefit vs Social proof | CTR + ROAS |
| 2 | Hook-test B | Koncept 3 vs 4 vs kontrol | Image | Curiosity vs Problem | CTR + ROAS |
| 3 | Format-test | Vinder uge 1 i video + carousel | Mixed | [vinder] | ROAS |
| 4 | Scale + iterate | Top 2 vindere + 2 nye variationer | Mixed | [vindere] | ROAS + spend |

**Budget-anbefaling:** [X] kr/dag per test-ad set (minimum 3x CPA for statistisk signifikans)
**Succeskriterium:** ROAS 7d over [benchmark] OG CTR over [benchmark]
```

## Trin 7: Gem og vis

Gem komplet rapport som: `~/.claude/nr-assistant/clients/[klient]/creative-test-[YYYY-MM-DD].md`

Vis til brugeren:
1. Key Takeaways fra hook-analyse (3-5 bullets)
2. Top 5 koncepter med hook og primary text
3. Test-kalender oversigt
4. Informer om at fuld rapport er gemt i [sti]

## Exit

Naar rapport er gemt og vist: stop.
Kald IKKE andre elle-commands automatisk. Spawn IKKE yderligere agents ud over meta-ads-copywriter.

</process>

<output>
- `~/.claude/nr-assistant/clients/[klient]/creative-test-[YYYY-MM-DD].md` — fuld rapport
- Key takeaways + top koncepter + test-kalender vist direkte i chat
</output>
