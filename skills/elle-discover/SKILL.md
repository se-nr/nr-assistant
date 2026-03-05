---
name: elle-discover
description: |
  Quick discovery af potentiel klient/lead. Hurtig web research, fit-vurdering, konkurrent-scan.
  Output: discovery-rapport i ~/agency-context/clients/[brand]/.
  Trigger: "discover brand", "research lead", "tjek klient", "ny prospect", "kend mig"
argument-hint: "[brand-navn eller website URL]"
allowed-tools: Read, Write, Task, WebSearch, WebFetch, AskUserQuestion
version: 1.0.0
author: Neble+Rohde <isidor@neble-rohde.dk>
---

# Elle Discover — Quick Lead/Prospect Discovery

Hurtig discovery af potentiel klient. 15-20 min research → 1-sides rapport med fit-vurdering.

<execution_context>
@~/agency-context/agency/knowledge/research-methodology.md
@~/agency-context/agency/process.md
</execution_context>

<philosophy>
Discovery handler om hastighed og relevans — ikke dybde.
Maalet er at vide nok til at tage en kvalificeret beslutning om klienten er et godt fit.
Dybere research koeres bagefter med /elle:research.
</philosophy>

<process>

## Trin 1: Identificer brand

Hvis argument er et brand-navn: brug det.
Hvis argument er en URL: udtraek brand-navn fra URL.
Ellers: spoerg brugeren.

Tjek om `~/agency-context/clients/[brand]/` allerede eksisterer.
Hvis ja: laes overview.md og tilbyd at koere dybere research i stedet.

## Trin 2: Website-analyse

```
1. WebSearch: "[brand-navn]"
2. WebFetch: brandets hjemmeside (forside)
3. WebFetch: brandets "om os" / "about" side (hvis den findes)
```

Udtraek:
- Hvad saelger de? (produkter/services)
- Prisklasse (lav/medium/premium)
- Primaer maalgruppe (hvem taler de til)
- Tone of voice (formelt/uformelt, aspirational/praktisk)
- Markeder (hvilke lande/sprog)
- E-commerce platform (Shopify, WooCommerce, custom, etc.)

## Trin 3: Trustpilot quick-check

```
1. WebSearch: "[brand-navn] site:trustpilot.com"
2. WebFetch Trustpilot-siden (hvis den findes)
```

Udtraek:
- Rating (stjerner)
- Antal anmeldelser
- Top 3 positive temaer
- Top 3 negative temaer
- 2-3 repraesentative citater

Hvis ingen Trustpilot: noter det og gaa videre.

## Trin 4: Konkurrent quick-scan

```
1. WebSearch: "[kategori] brands [land]" eller "best [produkttype] [land]"
2. Identificer top 3 konkurrenter
```

For hver: én saetning om positionering og prisklasse.

## Trin 5: Spawn research agent (valgfrit — kun hvis dybere indsigt er noedvendig)

Hvis brugeren har bedt om dybere research, spawn `brand-market-research` agent:
```
"Lav discovery-research for [brand].
Brug findings fra trin 2-4 som udgangspunkt.
Foelg ~/agency-context/agency/agents/brand-market-research.md"
```

## Trin 6: Komponer discovery-rapport

```markdown
# Discovery — [Brand]
**Dato:** [YYYY-MM-DD]

## Overblik
- **Kategori:** [produktkategori]
- **Marked:** [lande]
- **Prisklasse:** [lav/medium/premium]
- **Platform:** [Shopify/WooCommerce/etc.]
- **Trustpilot:** [X.X stjerner, X anmeldelser]

## Hvad de saelger
[2-3 saetninger om produkter/services og value proposition]

## Maalgruppe (estimat)
[2-3 saetninger om hvem de taler til baseret paa website og tone]

## Konkurrenter
| Konkurrent | Positionering | Prisklasse |
|-----------|--------------|-----------|
| [A] | [en saetning] | [X] |
| [B] | [en saetning] | [X] |
| [C] | [en saetning] | [X] |

## Kundeoplevelse (Trustpilot)
- Positive: [top 3 temaer]
- Negative: [top 3 temaer]

## Opportunity for N+R
[2-3 saetninger: hvad kan vi tilfoeje? Hvad mangler de?]

## Fit-vurdering
**Score: [1-5] / 5**
- [Begrundelse i 2-3 bullets]
- [Potentielle udfordringer]
- [Anbefalet naeste skridt hvis fit > 3]
```

Gem som: `~/agency-context/clients/[brand]/discovery-[YYYY-MM-DD].md`
Opret mappen hvis den ikke findes.

## Trin 7: Vis rapport

Vis hele discovery-rapporten direkte til brugeren.
Tilbyd: "Skal jeg koere dybere research? (/elle:research [brand])"

</process>

<output>
- `~/agency-context/clients/[brand]/discovery-[YYYY-MM-DD].md` — discovery-rapport
- Rapport vist direkte i chat
</output>
